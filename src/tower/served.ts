/**
 * What the tower serves for renderers to build on, part of the renderer API's contract: `/tower.js`, `/design.css`
 * and the shared modules. An export removed or renamed is an API major; one added, a minor. The names each one
 * exports are listed in test/served-exports.json, which test/served.test.ts holds them to.
 */
import { buildSync } from 'esbuild'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { API_VERSION } from '../shared/api.ts'

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
  '/settings.js': path.join(SHARED, 'settings.ts'),
  '/tips.js': path.join(SHARED, 'tips.ts'),
  '/markdown.js': path.join(SHARED, 'markdown.ts'),
}

/** A shared module as the tower serves it: one ES module, with the names it exports. */
export function bundled(url: string) {
  const { outputFiles, metafile } = buildSync({ entryPoints: [MODULES[url]], bundle: true, format: 'esm', write: false, metafile: true })
  return { text: outputFiles[0].text, exports: Object.values(metafile.outputs)[0].exports }
}

/** `/tower.js` speaks the API version this tower serves: the script names `API_VERSION` and is filled in from api.ts. */
export function towerClient() {
  const script = readFileSync(path.join(import.meta.dirname, 'tower.js'), 'utf8')
  const declaration = 'const VERSION = API_VERSION'
  if (!script.includes(declaration)) throw new Error(`tower.js no longer declares "${declaration}"`)
  return script.replace(declaration, `const VERSION = ${JSON.stringify(API_VERSION)}`)
}
