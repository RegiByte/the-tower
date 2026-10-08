/**
 * Sessions folded from their logs, each resumed from the checkpoint its last fold left in the cache: the facts at a line
 * boundary of the log, kept under the hash of the code that folds them. A checkpoint made by other code, past the
 * log's end or for another header is not used, and the log is folded from its start.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { deserialize, serialize } from 'node:v8'
import { factsAfter, initialFacts, type Facts, type Session } from './bridge/facts.ts'
import type { SessionHeader } from './shared/model.ts'
import { afterBreak, factEvents, logSize, readEvents, readHeader } from './tail.ts'

export type Checkpoint = { fold: string; header: SessionHeader; offset: number; facts: Facts }

/** An import or export statement's relative module, at the start of a line, its braces spanning lines; or a dynamic import's. */
const RELATIVE_IMPORT = /^\s*(?:import|export)\b(?:[^;'"]*?\bfrom)?\s*['"](\.\.?\/[^'"]+)['"]|\bimport\(\s*['"](\.\.?\/[^'"]+)['"]\s*\)/gm

/** The paths of `file` and of every module it imports by a relative path, transitively, each with its source. */
export const sourcesOf = (file: string): Map<string, string> => {
  const sources = new Map<string, string>()
  const visit = (f: string) => {
    if (sources.has(f)) return
    const text = readFileSync(f, 'utf8')
    sources.set(f, text)
    for (const [, statement, dynamic] of text.matchAll(RELATIVE_IMPORT)) visit(path.resolve(path.dirname(f), statement ?? dynamic))
  }
  visit(file)
  return sources
}

/** One hash of the sources of `file` and the modules it imports, each named by its path relative to `file`'s. */
export const sourceHash = (file: string): string => {
  const sources = sourcesOf(file)
  const hash = createHash('sha256')
  for (const f of [...sources.keys()].sort()) hash.update(`${path.relative(path.dirname(file), f)}\0${sources.get(f)}\0`)
  return hash.digest('hex')
}

/** The code that folds a log: this module and everything it imports, the fold steps and the event filter among them. */
export const FOLD = sourceHash(import.meta.filename)

const checkpointPath = (cache: string, id: string) => path.join(cache, 'facts', `${id}.v8`)

/** Errors of a file system that refuses a write: the fold goes on without its checkpoint. */
const WRITE_REFUSED = new Set(['ENOSPC', 'EDQUOT', 'EACCES', 'EPERM', 'EROFS'])

let refusalSaid = false

/** Each checkpoint is written whole beside its place and renamed into it, so a reader never sees half of one. */
export const writeCheckpoint = (cache: string, checkpoint: Checkpoint) => {
  const file = checkpointPath(cache, checkpoint.header.id)
  const staging = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}`)
  try {
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(staging, serialize(checkpoint))
    renameSync(staging, file)
  } catch (err) {
    if (!WRITE_REFUSED.has((err as NodeJS.ErrnoException).code ?? '')) throw err
    if (!refusalSaid) console.error(`Checkpoints can't be written to ${cache}, logs are folded from their start:`, (err as Error).message)
    refusalSaid = true
  }
}

/** The checkpoint kept for a log of `header` and `size` bytes, if one holds for it now. */
const checkpointFor = (cache: string, header: SessionHeader, size: number): Checkpoint | undefined => {
  const file = checkpointPath(cache, header.id)
  let bytes: Buffer
  try {
    bytes = readFileSync(file)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw err
  }
  let checkpoint: Checkpoint
  try {
    checkpoint = deserialize(bytes)
  } catch (err) {
    console.error(`Checkpoint ${file} is unreadable, its log is folded from its start:`, (err as Error).message)
    return undefined
  }
  const holds = checkpoint?.fold === FOLD && checkpoint.offset <= size && isDeepStrictEqual(checkpoint.header, header)
  return holds ? checkpoint : undefined
}

/**
 * The session's facts, folded from its log in `cache`'s checkpoint on, and the byte offset where the log's next line
 * starts; the checkpoint moves there. `undefined` while the host hasn't written the log's header. A broken session
 * (`Facts.broken`) folds nothing more but being let go, its checkpoint included: one resumed before the break meets it again.
 */
export const foldLog = (cache: string, logPath: string): { session: Session; offset: number } | undefined => {
  const head = readHeader(logPath)
  if (!head) return undefined
  const { header } = head
  const from = checkpointFor(cache, header, logSize(logPath)) ?? { offset: head.offset, facts: initialFacts(header) }
  const { events, offset } = readEvents(logPath, from.offset, from.facts.broken ? afterBreak : factEvents(from.facts.state))
  const facts = events.reduce(factsAfter(header.startedAt), from.facts)
  if (offset > from.offset) writeCheckpoint(cache, { fold: FOLD, header, offset, facts })
  return { session: { header, facts }, offset }
}
