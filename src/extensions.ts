/**
 * The extension folders the tower finds: the bundled ones in the checkout's `extensions/<id>/`, then the ones the
 * config names by `path`. Each is read as it is now, its manifest and its contract, to be resolved (`src/bridge/extensions.ts`).
 */
import { buildSync } from 'esbuild'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import type { ClientRead, Found } from './bridge/extensions.ts'
import { fileBelow } from './renderers.ts'
import { BUNDLED } from './shared/extensions.ts'
import type { Config } from './shared/model.ts'

/** Where the bundled extensions live: one folder each, named by its id. */
export const BUNDLED_DIR = path.join(import.meta.dirname, '..', 'extensions')

export const MANIFEST_FILE = 'extension.json'

export const CONTRACT_FILE = 'contract.json'

const fileIn = (dir: string, name: string): string | undefined => {
  const file = path.join(dir, name)
  return existsSync(file) ? readFileSync(file, 'utf8') : undefined
}

/** A module of a client folder, served as JavaScript: a `.ts` source is served bundled, at its name with `.js`. */
const MODULE_FILE = /^(?!.*\.d\.ts$).*\.(js|ts)$/

/** The path a client source is served at below `/x/<cap>/`. */
export const servedAs = (file: string) => file.replace(/\.ts$/, '.js')

/** The names a module exports, read without running it. */
const exportsOf = (file: string): string[] =>
  Object.values(buildSync({ entryPoints: [file], format: 'esm', write: false, metafile: true, logLevel: 'silent' }).metafile.outputs)[0].exports

/** Every module of the client folder `dir`, by the path it is served at; a `.js` beside a `.ts` of the same name is the one served. */
export const clientModules = (dir: string): Map<string, string> =>
  new Map(
    readdirSync(dir, { recursive: true, encoding: 'utf8' })
      .filter((file) => MODULE_FILE.test(file))
      .sort((a, b) => (a.endsWith('.js') ? 1 : 0) - (b.endsWith('.js') ? 1 : 0))
      .map((file) => [servedAs(file.split(path.sep).join('/')), path.join(dir, file)]),
  )

/** What a client folder exports, module by module, and why a module that doesn't parse can't be read. */
const clientRead = (dir: string): ClientRead => {
  const read: ClientRead = { exports: {}, unreadable: {} }
  for (const [module, file] of clientModules(dir)) {
    try {
      read.exports[module] = exportsOf(file)
    } catch (err) {
      read.unreadable[module] = (err as Error).message.split('\n')[0]
    }
  }
  return read
}

/**
 * The client folder a manifest names, inside `dir`, when it names one there. The manifest is only peeked at here:
 * one that isn't JSON, or names no folder, has none, and the read of the manifest says why it is refused.
 */
const clientDir = (dir: string, text: string | undefined): string | undefined => {
  let client: unknown
  try {
    client = text === undefined ? undefined : (JSON.parse(text) as { client?: unknown }).client
  } catch {
    return undefined
  }
  if (typeof client !== 'string') return undefined
  const full = path.resolve(dir, client)
  return full.startsWith(path.resolve(dir) + path.sep) && statSync(full, { throwIfNoEntry: false })?.isDirectory() ? full : undefined
}

/** A folder as found: its manifest, its contract and its client modules' exports, as they are now. */
export const foundIn = (id: string, bundled: boolean, dir: string): Found => {
  const contract = fileIn(dir, CONTRACT_FILE)
  const text = fileIn(dir, MANIFEST_FILE)
  const client = clientDir(dir, text)
  return { id, bundled, dir, text, ...(contract !== undefined && { contract }), ...(client && { client: clientRead(client) }) }
}

/** The client folder of the bundled extension that provides `cap`, when one does and has a client folder. */
export const bundledClient = (cap: string): string | undefined => {
  if (!(BUNDLED as readonly string[]).includes(cap)) return undefined
  const dir = path.join(BUNDLED_DIR, cap)
  return clientDir(dir, fileIn(dir, MANIFEST_FILE))
}

/** The source a client folder serves at `file`: that file, or for a `.js` it lacks, the `.ts` of the same name, served bundled. */
export const clientSource = (dir: string, file: string): string | undefined =>
  [file, ...(file.endsWith('.js') ? [file.replace(/\.js$/, '.ts')] : [])]
    .map((name) => fileBelow(dir, name))
    .find((full) => full !== undefined && statSync(full, { throwIfNoEntry: false })?.isFile())

/** The bundled extensions, by folder; none while the checkout has no `extensions/`. */
const bundled = (root: string): Found[] =>
  existsSync(root)
    ? readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => foundIn(entry.name, true, path.join(root, entry.name)))
    : []

/** Every extension folder: the bundled ones in `root`, then each the config adds; a config entry with a bundled id overrides that one. */
export const discover = (config: Config, root = BUNDLED_DIR): Found[] => {
  const found = bundled(root)
  const added = Object.entries(config.extensions ?? {})
    .filter(([id]) => !found.some((f) => f.id === id))
    .map(([id, entry]): Found => {
      const dir = entry?.path
      return typeof dir === 'string' && path.isAbsolute(dir) ? foundIn(id, false, dir) : { id, bundled: false }
    })
  return [...found, ...added]
}

/** The newest modification time of any file below `dir` (epoch ms), dot files and `node_modules` aside: a code edit moves it. */
export const newestIn = (dir: string): number =>
  readdirSync(dir, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith('.') && entry.name !== 'node_modules')
    .reduce((newest, entry) => {
      const full = path.join(dir, entry.name)
      return Math.max(newest, entry.isDirectory() ? newestIn(full) : statSync(full).mtimeMs)
    }, 0)
