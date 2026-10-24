/**
 * `tower extensions check`'s throwaway process: an extension's server module imported and its `start` called with a ctx
 * that reaches nothing, to say whether what it returns matches its manifest. Run as `extension-start.ts <dir> <settings>`;
 * its one line on stdout is the verdict, `{mismatch?}` or `{threw}`. What the extension logs goes to stderr.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { mismatchOf } from './bridge/extensions.ts'
import type { StartVerdict } from './extension-check.ts'
import { MANIFEST_FILE } from './extensions.ts'
import { API_VERSION, apiError } from './shared/api.ts'
import { capabilityOf, Manifest, type StartCtx } from './shared/extensions.ts'

const START_MS = 10_000
const NO_TOWER = 'tower extensions check starts it with no tower: its ctx reaches nothing'

console.log = console.error
const [dir, settingsJson] = process.argv.slice(2)
const manifest = Manifest.parse(JSON.parse(readFileSync(path.join(dir, MANIFEST_FILE), 'utf8')))
const settings: unknown = JSON.parse(settingsJson)
const controller = new AbortController()
const refuse = async (): Promise<never> => {
  throw new Error(NO_TOWER)
}

const ctx: StartCtx = {
  id: manifest.id,
  provides: capabilityOf(manifest),
  version: manifest.version,
  dir,
  tower: { version: API_VERSION },
  settings,
  settingsOf: () => settings,
  on: () => true,
  every: () => {},
  log: (message) => console.error(message),
  signal: controller.signal,
  board: () => {
    throw new Error(NO_TOWER)
  },
  call: async () => apiError('unavailable', NO_TOWER),
  read: async () => apiError('unavailable', NO_TOWER),
  raise: async () => [],
  deps: Object.fromEntries([...Object.keys(manifest.requires), ...Object.keys(manifest.wants ?? {})].filter((cap) => cap !== 'tower').map((cap) => [cap, undefined])),
  streams: {
    append: refuse,
    read: () => ({
      [Symbol.asyncIterator]: () => ({ next: refuse }),
    }),
  },
  facts: { append: refuse },
  collections: { list: () => [], read: refuse, create: refuse, write: refuse, delete: refuse },
  own: { streams: () => undefined, collections: () => [], facts: () => [] },
  run: refuse,
}

/** What `start` returned, held to the manifest; the verdict once its halt ran. */
const verdict = async (): Promise<StartVerdict> => {
  if (!manifest.server) return {}
  const module = await import(pathToFileURL(path.join(dir, manifest.server)).href)
  if (typeof module.default !== 'function') return { mismatch: `${manifest.server} has no default export: its start` }
  let timer: NodeJS.Timeout | undefined
  const late = new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error(`start didn't settle within ${START_MS / 1000} s`)), START_MS)))
  let started: unknown
  try {
    started = await Promise.race([Promise.resolve().then(() => module.default(ctx)), late])
  } catch (err) {
    return { threw: (err as Error).message ?? String(err) }
  } finally {
    clearTimeout(timer)
  }
  const mismatch = mismatchOf(started, manifest)
  try {
    const halt = (started as { halt?: unknown } | undefined)?.halt
    if (typeof halt === 'function') await halt()
  } finally {
    controller.abort()
  }
  return mismatch ? { mismatch } : {}
}

const said = await verdict()
process.stdout.write(`${JSON.stringify(said)}\n`, () => process.exit(0))
