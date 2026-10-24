/**
 * An extension's stores as its ctx reaches them (decision `extensions`): its streams, appended and read the way every
 * stream is and folded by `system.ts` as facts arrive; its session facts, logged through the host's `fact`; its
 * collections, which only it writes; and `own`, what the tower folds of them, read-only.
 */
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import type { z } from 'zod'
import type { Accepted } from '../bridge/extensions.ts'
import { continuations, lineage } from '../bridge/chains.ts'
import { extensionFactName, sessionFacts } from '../bridge/stores.ts'
import { streamFacts } from '../bridge/streams.ts'
import { createItem, deleteItem, itemsIn, readItem, writeItem } from '../collections.ts'
import { hostRequest } from '../machine.ts'
import type { Item, ParsedItem, StartCtx, Started, StreamAt, StreamFact } from '../shared/extensions.ts'
import { projectStreamPath, systemStreamPath } from '../shared/paths.ts'
import { tagOf } from '../shared/tags.ts'
import { appendFact } from '../streams.ts'
import { frozen } from '../system.ts'
import { logBytes, logFilesIn } from '../tail.ts'
import type { ConfigResource, SystemResource } from './spine.ts'

type StoresCtx = Pick<StartCtx, 'streams' | 'facts' | 'collections' | 'own'>

const MONTH_FILE = /^\d{4}-\d{2}\.jsonl(\.gz)?$/

/** A value checked by its declared schema, or a throw naming what it is and why. */
const checked = (schema: z.ZodType, value: unknown, what: string): unknown => {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new Error(`${what}: ${parsed.error.issues.map((i) => `${i.path.join('.') || 'value'}: ${i.message}`).join('; ')}`)
  return parsed.data
}

/** A parse result, kept while its item's version holds. */
type HeldParse = { modifiedAt: number; parsed: unknown }

/**
 * The store members of an extension's ctx, and `attach`, which folds the streams `start` returned a `reduce` for; `stop`
 * ends those folds.
 */
export const storesOf = (a: Accepted, config: ConfigResource, live: SystemResource, on: (project: string) => boolean) => {
  const { paths } = config
  const { manifest, provides } = a
  const folds = new Map<string, ReturnType<SystemResource['foldStream']>>()
  let parse: Started['parse'] = {}
  const parsedBy = new Map<string, HeldParse>()

  const streamOf = (name: string, at: StreamAt) => {
    const declared = manifest.streams?.[name]
    if (!declared) throw new Error(`${provides} declares no stream ${name}`)
    const stream = `${provides}.${name}`
    if (declared.scope === 'system') {
      if (at.project !== undefined) throw new Error(`${name} is a system stream: it is appended to with no project`)
      return { declared, stream, dir: systemStreamPath(paths, stream) }
    }
    if (at.project === undefined) throw new Error(`${name} is a project stream: name the project`)
    if (!Object.hasOwn(config.read().projects, at.project)) throw new Error(`no project ${at.project}`)
    return { declared, stream, dir: projectStreamPath(paths, at.project, stream) }
  }

  /** One of its own collections on a floor it is on. */
  const collectionOf = (project: string, name: string) => {
    if (!manifest.collections?.[name]) throw new Error(`${provides} declares no collection ${name}`)
    if (!Object.hasOwn(config.read().projects, project)) throw new Error(`no project ${project}`)
    if (!on(project)) throw new Error(`${provides} is off on ${project}`)
  }

  const itemOf = (project: string, name: string, id: string): Item => {
    const found = itemsIn(paths, project, name).find((i) => i.id === id)
    if (!found) throw new Error(`${project}/${name} holds no item "${id}"`)
    return { id, tag: tagOf(id), size: found.size, modifiedAt: found.modifiedAt }
  }

  const ctx: StoresCtx = {
    streams: {
      append: async (name, at, code, fact) => {
        const { stream, dir } = streamOf(name, at)
        const schema = a.schemas.streams.get(name)!.get(code)
        if (!schema) throw new Error(`${name} declares no fact code ${code}`)
        appendFact(dir, stream, Date.now(), code, checked(schema, fact, `${name} ${code}`))
      },
      read: (name, at, window = {}) => {
        const { dir } = streamOf(name, at)
        const { from = -Infinity, to = Infinity } = window
        return (async function* (): AsyncGenerator<StreamFact> {
          if (!existsSync(dir)) return
          for (const file of logFilesIn(readdirSync(dir).filter((f) => MONTH_FILE.test(f))).sort()) {
            const [year, month] = file.slice(0, 7).split('-').map(Number)
            if (Date.UTC(year, month - 1, 1) >= to || Date.UTC(year, month, 1) <= from) continue
            for (const fact of streamFacts(logBytes(path.join(dir, file)).toString('utf8')).facts) if (fact[0] >= from && fact[0] < to) yield fact
          }
        })()
      },
    },
    facts: {
      append: async (session, name, value) => {
        const schema = a.schemas.facts.get(name)
        if (!schema) throw new Error(`${provides} declares no fact ${name}`)
        if (!live.session(session)) throw new Error(`no session ${session}`)
        const reply = await hostRequest(paths, { t: 'fact', id: session, fact: { hook_event_name: extensionFactName(provides, name), value: checked(schema, value, name) } })
        if (reply.t === 'error') throw new Error(reply.message)
      },
    },
    collections: {
      list: (project, name) => {
        collectionOf(project, name)
        return itemsIn(paths, project, name).map(({ id, size, modifiedAt }) => ({ id, tag: tagOf(id), size, modifiedAt }))
      },
      read: async (project, name, id) => {
        collectionOf(project, name)
        const text = readItem(paths, project, name, id)
        if (text === undefined) throw new Error(`${project}/${name} holds no item "${id}"`)
        return text
      },
      create: async (project, name, item) => {
        collectionOf(project, name)
        return itemOf(project, name, createItem(paths, project, name, item.name, item.ext, item.content).id)
      },
      write: async (project, name, id, content, modifiedAt) => {
        collectionOf(project, name)
        if (itemOf(project, name, id).modifiedAt !== modifiedAt) throw new Error(`${project}/${name}/${id} changed since version ${modifiedAt}`)
        writeItem(paths, project, name, id, content)
        return itemOf(project, name, id)
      },
      delete: async (project, name, id) => {
        collectionOf(project, name)
        itemOf(project, name, id)
        deleteItem(paths, project, name, id)
      },
    },
    own: {
      streams: (name, project) => {
        const fold = folds.get(name)
        if (!fold) throw new Error(`${provides} folds no stream ${name}: its start returns no reduce for it`)
        if ((manifest.streams![name].scope === 'project') !== (project !== undefined)) throw new Error(`${name} is a ${manifest.streams![name].scope} stream`)
        return fold.state(project)
      },
      collections: (project, name): ParsedItem[] => {
        collectionOf(project, name)
        const parseOne = parse?.[name]
        return live
          .items()
          .filter((i) => i.project === project && i.collection === name)
          .flatMap(({ id, size, modifiedAt }) => {
            const item = { id, tag: tagOf(id), size, modifiedAt }
            if (!parseOne) return [{ ...item, parsed: undefined }]
            const key = `${project}/${name}/${id}`
            const held = parsedBy.get(key)
            if (held?.modifiedAt === modifiedAt) return [{ ...item, parsed: held.parsed }]
            const text = readItem(paths, project, name, id)
            if (text === undefined) return []
            const parsed = frozen(parseOne(text, item))
            parsedBy.set(key, { modifiedAt, parsed })
            return [{ ...item, parsed }]
          })
      },
      facts: (session) => {
        const found = live.session(session)
        if (!found) throw new Error(`no session ${session}`)
        const before = continuations(live.sessions())
        return sessionFacts(provides, lineage(found, (s) => before.get(s)))
      },
    },
  }

  return {
    ctx,
    /** Folds each stream `started` returns a `reduce` for, and keeps its `parse`. */
    attach: (started: Started) => {
      parse = started.parse
      for (const [name, reduce] of Object.entries(started.reduce ?? {}))
        folds.set(name, live.foldStream({ stream: `${provides}.${name}`, scope: manifest.streams![name].scope, init: reduce.init, step: (state, fact) => reduce.step(state, fact), label: a.id }))
    },
    stop: () => {
      for (const fold of folds.values()) fold.stop()
      folds.clear()
    },
  }
}
