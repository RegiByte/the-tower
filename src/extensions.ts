/**
 * The extension folders the tower finds: the bundled ones in the checkout's `extensions/<id>/`, then the ones the
 * config names by `path`. Each is read as it is now, its manifest and its contract, to be resolved (`src/bridge/extensions.ts`).
 */
import { buildSync } from 'esbuild'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { contributedRenderers, resolve, type ClientRead, type Found } from './bridge/extensions.ts'
import type { ContributedItems } from './bridge/stores.ts'
import { fileBelow, type Contributed } from './renderers.ts'
import { API_VERSION } from './shared/api.ts'
import { BUNDLED } from './shared/extensions.ts'
import type { Config } from './shared/model.ts'

/** Where the bundled extensions live: one folder each, named by its id. */
export const BUNDLED_DIR = path.join(import.meta.dirname, '..', 'extensions')

export const MANIFEST_FILE = 'extension.json'

export const CONTRACT_FILE = 'contract.json'

/** What makes a folder a Claude plugin. */
const CLAUDE_PLUGIN_FILE = path.join('.claude-plugin', 'plugin.json')

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

/** The SVG files of the client folder `dir`, by their paths below it. */
const clientSvgs = (dir: string): string[] =>
  readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.svg'))
    .map((file) => file.split(path.sep).join('/'))

/** What a client folder exports, module by module, why a module that doesn't parse can't be read, and its SVGs. */
const clientRead = (dir: string): ClientRead => {
  const read: ClientRead = { exports: {}, unreadable: {}, svgs: clientSvgs(dir) }
  for (const [module, file] of clientModules(dir)) {
    try {
      read.exports[module] = exportsOf(file)
    } catch (err) {
      read.unreadable[module] = (err as Error).message.split('\n')[0]
    }
  }
  return read
}

/** A manifest's keys, only peeked at here: one that isn't JSON has none, and the read of the manifest says why it is refused. */
const peeked = (text: string | undefined): { client?: unknown; items?: unknown; runtimes?: { claude?: { plugins?: unknown } } } => {
  try {
    return text === undefined ? {} : (JSON.parse(text) ?? {})
  } catch {
    return {}
  }
}

/** The client folder a manifest names, inside `dir`, when it names one there. */
const clientDir = (dir: string, text: string | undefined): string | undefined => folderIn(dir, peeked(text).client)

/** A folder inside `dir` the manifest names, when it is one there. */
const folderIn = (dir: string, rel: unknown): string | undefined => {
  if (typeof rel !== 'string') return undefined
  const full = path.resolve(dir, rel)
  return full.startsWith(path.resolve(dir) + path.sep) && statSync(full, { throwIfNoEntry: false })?.isDirectory() ? full : undefined
}

/** The files of each items folder the manifest names that exists, dot files aside, in id order: read in place, never written. */
const itemsRead = (dir: string, text: string | undefined): ContributedItems | undefined => {
  const { items } = peeked(text)
  if (typeof items !== 'object' || items === null) return undefined
  return Object.fromEntries(
    Object.entries(items).flatMap(([collection, rel]) => {
      const folder = folderIn(dir, rel)
      if (!folder) return []
      const files = readdirSync(folder, { withFileTypes: true })
        .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
        .map((entry) => entry.name)
        .sort()
        .map((id) => {
          const stat = statSync(path.join(folder, id))
          return { id, size: stat.size, modifiedAt: Math.floor(stat.mtimeMs) }
        })
      return [[collection, { dir: folder, items: files }]]
    }),
  )
}

/** What the Claude plugin a manifest names lacks, when it lacks anything: the folder, or the file that makes it a plugin. */
const claudePluginLack = (dir: string, text: string | undefined): Found['claudePluginLack'] => {
  const plugin = peeked(text).runtimes?.claude?.plugins
  if (typeof plugin !== 'string') return undefined
  if (!statSync(path.join(dir, plugin), { throwIfNoEntry: false })?.isDirectory()) return 'folder'
  return existsSync(path.join(dir, plugin, CLAUDE_PLUGIN_FILE)) ? undefined : 'plugin.json'
}

/** A folder as found: its manifest, its contract, its client modules' exports and its Claude plugin, as they are now. */
export const foundIn = (id: string, bundled: boolean, dir: string): Found => {
  const contract = fileIn(dir, CONTRACT_FILE)
  const text = fileIn(dir, MANIFEST_FILE)
  const client = clientDir(dir, text)
  const lack = claudePluginLack(dir, text)
  const items = itemsRead(dir, text)
  return { id, bundled, dir, text, ...(contract !== undefined && { contract }), ...(client && { client: clientRead(client) }), ...(lack && { claudePluginLack: lack }), ...(items && { items }) }
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

/** The renderers the extensions the config would accept contribute, as a process with no running tower reads them. */
export const contributedIn = (config: Config): Contributed => contributedRenderers(resolve(discover(config), config, API_VERSION).accepted.values())

/** The newest modification time of any file below `dir` (epoch ms), dot files and `node_modules` aside: a code edit moves it. */
export const newestIn = (dir: string): number =>
  readdirSync(dir, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith('.') && entry.name !== 'node_modules')
    .reduce((newest, entry) => {
      const full = path.join(dir, entry.name)
      return Math.max(newest, entry.isDirectory() ? newestIn(full) : statSync(full).mtimeMs)
    }, 0)
