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
import { frozen } from '../bridge/frozen.ts'
import { createItem, deleteItem, itemsIn, readItem, writeItem } from '../collections.ts'
import { hostRequest } from '../machine.ts'
import { streamFolder, type FoldCtx, type Item, type ParsedItem, type StartCtx, type Started, type StreamAt, type StreamFact } from '../shared/extensions.ts'
import type { OwnAt } from '../bridge/folds.ts'
import { projectStreamPath, systemStreamPath } from '../shared/paths.ts'
import { KIND_SCHEMAS, type FactKind } from '../shared/rate-limits.ts'
import { tagOf } from '../shared/tags.ts'
import { appendFact } from '../streams.ts'
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
    const stream = streamFolder(`${provides}.${name}`)
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

  /** An item's parse, frozen; one that throws costs that item only, its `parsed` undefined until its file changes. */
  const parsedOf = (parseOne: NonNullable<Started['parse']>[string], text: string, item: Item, key: string): unknown => {
    try {
      return frozen(parseOne(text, item))
    } catch (err) {
      console.error(`${a.id}: ${key} threw in its collection's parse, and is held unparsed until it changes:`, err)
      return undefined
    }
  }

  const ctx: StoresCtx = {
    streams: {
      append: async (name, at, code, fact) => {
        const { stream, dir } = streamOf(name, at)
        const schema = a.schemas.streams.get(name)!.get(code)
        if (!schema) throw new Error(`${name} declares no fact code ${code}`)
        const kind = manifest.streams![name].facts[code].kind as FactKind | undefined
        const value = checked(schema, fact, `${name} ${code}`)
        if (kind) checked(KIND_SCHEMAS[kind], value, `${name} ${code}, of kind ${kind}`)
        appendFact(dir, stream, Date.now(), code, value)
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
            const parsed = parsedOf(parseOne, text, item, key)
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
        folds.set(name, live.foldStream({ stream: streamFolder(`${provides}.${name}`), scope: manifest.streams![name].scope, init: reduce.init, step: (state, fact) => reduce.step(state, fact), label: a.id }))
    },
    /**
     * What a fold gets as `own` at a subject, from what `own` reads: a stream's state on the floor (system streams alone
     * without one), the floor's collections, and the lineage's facts on a card. Each is read only when the fold reads it.
     */
    foldOwn: ({ project, lineage }: OwnAt): FoldCtx['own'] =>
      lazily({
        streams: () =>
          Object.fromEntries(
            [...folds]
              .filter(([name]) => project !== undefined || manifest.streams![name].scope === 'system')
              .map(([name, fold]) => [name, fold.state(manifest.streams![name].scope === 'project' ? project : undefined)]),
          ),
        collections: () => (project === undefined ? {} : Object.fromEntries(Object.keys(manifest.collections ?? {}).map((name) => [name, ctx.own.collections(project, name)]))),
        ...(lineage && { facts: () => sessionFacts(provides, lineage.flatMap((id) => live.session(id) ?? [])) }),
      }),
    /** Each stream fold stopped before a fact its step threw on, and why. */
    threw: () => [...folds].flatMap(([name, fold]) => fold.threw().map((t) => ({ stream: name, ...t }))),
    stop: () => {
      for (const fold of folds.values()) fold.stop()
      folds.clear()
    },
  }
}

/** An object whose every member is read once, when first read. */
const lazily = <T extends Record<string, unknown>>(getters: { [K in keyof T]: () => T[K] }): T => {
  const out = {} as T
  for (const [key, get] of Object.entries(getters) as [keyof T, () => T[keyof T]][]) {
    let value: T[keyof T]
    let read = false
    Object.defineProperty(out, key, { enumerable: true, get: () => (read ? value : ((read = true), (value = get()))) })
  }
  return out
}
