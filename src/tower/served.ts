/**
 * What the tower serves for renderers to build on, part of the renderer API's contract: `/tower.js`, `/design.css`
 * and the shared modules. An export removed or renamed is an API major; one added, a minor. The names each one
 * exports are listed in test/served-exports.json, which test/served.test.ts holds them to.
 */
import { buildSync } from 'esbuild'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { API_VERSION } from '../shared/api.ts'
import { type } from '../shared/design.ts'
import { GENERIC_FACES, PREFS_DEFAULT, PREF_CHOICES, TERM_SIZES } from '../shared/prefs.ts'

const SHARED = path.join(import.meta.dirname, '..', 'shared')

/** Shared modules renderers import, TypeScript served as JavaScript, each bundled with what it imports. */
export const MODULES: Record<string, string> = {
  '/design.js': path.join(SHARED, 'design.ts'),
  '/drafts.js': path.join(SHARED, 'drafts.ts'),
  '/items.js': path.join(SHARED, 'items.ts'),
  '/cards.js': path.join(SHARED, 'cards.ts'),
  '/icons.js': path.join(SHARED, 'icons.ts'),
  '/reviews.js': path.join(SHARED, 'reviews.ts'),
  '/panels.js': path.join(SHARED, 'panels.ts'),
  '/brief.js': path.join(SHARED, 'brief.ts'),
  '/termkeys.js': path.join(SHARED, 'termkeys.ts'),
  '/keymap.js': path.join(SHARED, 'keymap.ts'),
  '/terminal.js': path.join(SHARED, 'terminal.ts'),
  '/prefs.js': path.join(SHARED, 'prefs.ts'),
  '/settings.js': path.join(SHARED, 'settings.ts'),
  '/tips.js': path.join(SHARED, 'tips.ts'),
  '/markdown.js': path.join(SHARED, 'markdown.ts'),
}

/** A shared module as the tower serves it: one ES module, with the names it exports. */
export function bundled(url: string) {
  const { outputFiles, metafile } = buildSync({ entryPoints: [MODULES[url]], bundle: true, format: 'esm', write: false, metafile: true })
  return { text: outputFiles[0].text, exports: Object.values(metafile.outputs)[0].exports }
}

/**
 * `/tower.js` speaks the API version this tower serves, starts a viewer from the default appearance and knows the shipped
 * faces: the script names each constant and it is filled in here, from api.ts, prefs.ts and design.ts.
 */
export function towerClient() {
  const filled: Record<string, unknown> = { API_VERSION, PREFS_DEFAULT, PREF_CHOICES, TERM_SIZES, GENERIC_FACES, FACES: type }
  return Object.entries(filled).reduce((script, [name, value]) => {
    const declaration = new RegExp(`^(\\s*const \\w+ = )${name}$`, 'm')
    if (!declaration.test(script)) throw new Error(`tower.js no longer declares a constant as "${name}"`)
    return script.replace(declaration, (_, head) => head + JSON.stringify(value))
  }, readFileSync(path.join(import.meta.dirname, 'tower.js'), 'utf8'))
}
