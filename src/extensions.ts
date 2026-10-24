/**
 * The extension folders the tower finds: the bundled ones in the checkout's `extensions/<id>/`, then the ones the
 * config names by `path`. Each is read as it is now, to be resolved (`src/bridge/extensions.ts`).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import type { Found } from './bridge/extensions.ts'
import type { Config } from './shared/model.ts'

/** Where the bundled extensions live: one folder each, named by its id. */
export const BUNDLED_DIR = path.join(import.meta.dirname, '..', 'extensions')

export const MANIFEST_FILE = 'extension.json'

const manifestIn = (dir: string): string | undefined => {
  const file = path.join(dir, MANIFEST_FILE)
  return existsSync(file) ? readFileSync(file, 'utf8') : undefined
}

/** The bundled extensions, by folder; none while the checkout has no `extensions/`. */
const bundled = (root: string): Found[] =>
  existsSync(root)
    ? readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => {
          const dir = path.join(root, entry.name)
          return { id: entry.name, bundled: true, dir, text: manifestIn(dir) }
        })
    : []

/** Every extension folder: the bundled ones in `root`, then each the config adds; a config entry with a bundled id overrides that one. */
export const discover = (config: Config, root = BUNDLED_DIR): Found[] => {
  const found = bundled(root)
  const added = Object.entries(config.extensions ?? {})
    .filter(([id]) => !found.some((f) => f.id === id))
    .map(([id, entry]): Found => {
      const dir = entry?.path
      return typeof dir === 'string' && path.isAbsolute(dir) ? { id, bundled: false, dir, text: manifestIn(dir) } : { id, bundled: false }
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
