/**
 * What the tower serves for renderers to build on, part of the renderer API's contract: `/tower.js`, `/design.css`
 * and the shared modules. An export removed or renamed is an API major; one added, a minor. The names each one
 * exports are listed in test/served-exports.json, which test/served.test.ts holds them to.
 *
 * Every source file under `src/` that a page reaches is served once, at a URL of its own, so a module has one
 * instance on a page however many modules import it: a shared module is a re-export of its file's URL, and a core
 * view or a bundled client imports what it reaches under `src/` by URL. Those URLs (`/shared/…`, `/src/…`, and each npm
 * package at `/vendor/…`) are internal, not contract: renderers import the shared modules' names.
 */
import { build, buildSync, type BuildOptions, type Metafile, type Plugin } from 'esbuild'
import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { API_VERSION } from '../shared/api.ts'
import { type } from '../shared/design.ts'
import { GENERIC_FACES, PREFS_DEFAULT, PREF_CHOICES, TERM_SIZES } from '../shared/prefs.ts'

const SRC = path.join(import.meta.dirname, '..')
const SHARED = path.join(SRC, 'shared')
const REPO = path.join(SRC, '..')

/** Shared modules renderers import, each served as a re-export of its source file's URL. */
export const MODULES: Record<string, string> = {
  '/design.js': path.join(SHARED, 'design.ts'),
  '/items.js': path.join(SHARED, 'items.ts'),
  '/cards.js': path.join(SHARED, 'cards.ts'),
  '/icons.js': path.join(SHARED, 'icons.ts'),
  '/panels.js': path.join(SHARED, 'panels.ts'),
  '/brief.js': path.join(SHARED, 'brief.ts'),
  '/termkeys.js': path.join(SHARED, 'termkeys.ts'),
  '/keymap.js': path.join(SHARED, 'keymap.ts'),
  '/terminal.js': path.join(SHARED, 'terminal.ts'),
  '/prefs.js': path.join(SHARED, 'prefs.ts'),
  '/settings.js': path.join(SHARED, 'settings.ts'),
  '/tips.js': path.join(SHARED, 'tips.ts'),
  '/capabilities.js': path.join(SHARED, 'capabilities.ts'),
  '/verb-words.js': path.join(SHARED, 'verb-words.ts'),
  '/palette.js': path.join(SHARED, 'palette.ts'),
  '/markdown.js': path.join(SHARED, 'markdown.ts'),
  '/press.js': path.join(SHARED, 'press.ts'),
  '/toasts.js': path.join(SHARED, 'toasts.ts'),
  '/slots.js': path.join(SHARED, 'slots.ts'),
  '/loop.js': path.join(SHARED, 'loop.ts'),
  '/reads.js': path.join(SHARED, 'reads.ts'),
  '/viewer.js': path.join(SHARED, 'viewer.ts'),
  '/spawn.js': path.join(SHARED, 'spawn.ts'),
  '/attend.js': path.join(SHARED, 'attend.ts'),
  '/term-view.js': path.join(SHARED, 'term-view.ts'),
  '/views.js': path.join(SHARED, 'views.ts'),
  '/media.js': path.join(SHARED, 'media.ts'),
  '/repos.js': path.join(SHARED, 'repos.ts'),
}

/** The core's view modules (`CORE_VIEWS`), served at `/x/tower/<name>.js`, the core being the capability `tower`. */
export const CORE_VIEWS_DIR = path.join(import.meta.dirname, '..', 'views')

/** A TypeScript or JavaScript source bundled with all it imports into one ES module, with the names it exports. */
export function bundledFile(file: string) {
  const { outputFiles, metafile } = buildSync({ entryPoints: [file], bundle: true, format: 'esm', write: false, metafile: true })
  return { text: outputFiles[0].text, exports: Object.values(metafile.outputs)[0].exports }
}

/** A shared module's text as the tower serves it: a re-export of its source file. */
export const servedModule = (url: string) => `export * from '${sourceUrl(MODULES[url])}'\n`

/** A shared module as the tower serves it, with the names it exports. */
export const bundled = (url: string) => ({ text: servedModule(url), exports: bundledFile(MODULES[url]).exports })

/** Where the files below `src/` are served, by folder; the core's views at their `/x/tower/` URLs, the rest by their path. */
const SOURCE_DIRS: [dir: string, url: string][] = [
  [CORE_VIEWS_DIR, '/x/tower/'],
  [SHARED, '/shared/'],
  [SRC, '/src/'],
]

/** The URL a TypeScript file below `src/` is served at. */
export function sourceUrl(file: string): string {
  const [dir, url] = SOURCE_DIRS.find(([dir]) => file.startsWith(dir + path.sep)) ?? []
  if (!dir || path.extname(file) !== '.ts') throw new Error(`${path.relative(REPO, file)} is reached by a served module, but only TypeScript files below src/ are served`)
  return url + path.relative(dir, file).split(path.sep).join('/').replace(/\.ts$/, '.js')
}

/** The file below `src/` a URL serves, if it is that file's own URL (`sourceUrl`). */
export const urlSource = (url: string): string | undefined =>
  SOURCE_DIRS.filter(([, prefix]) => url.startsWith(prefix) && url.endsWith('.js'))
    .map(([dir, prefix]) => path.join(dir, `${url.slice(prefix.length, -'.js'.length)}.ts`))
    .find((file) => file.startsWith(SRC + path.sep) && sourceUrl(file) === url && statSync(file, { throwIfNoEntry: false })?.isFile())

/** The URL an npm package's module (`marked`, `highlight.js/lib/core`) is served at, bundled as one ES module. */
export const vendorUrl = (specifier: string) => `/vendor/${specifier}.js`

/** The package specifier a `/vendor/` URL names, if it names one. */
export const urlVendor = (url: string): string | undefined => /^\/vendor\/((?:@[\w.-]+\/)?[\w.-]+(?:\/[\w.-]+)*)\.js$/.exec(url)?.[1]

/** What an import resolves to as served: esbuild's own resolution, then `served` deciding where the file it names comes from. */
const servedImports = (name: string, served: (file: string) => { path: string; external?: boolean }, bare: (specifier: string) => { path: string; external: true } | undefined): Plugin => ({
  name,
  setup(b) {
    b.onResolve({ filter: /.*/ }, async (args) => {
      if (args.kind === 'entry-point' || args.pluginData === name) return undefined
      if (!/^[./]/.test(args.path)) return bare(args.path)
      const found = await b.resolve(args.path, { kind: args.kind, resolveDir: args.resolveDir, importer: args.importer, pluginData: name })
      return found.errors.length ? { errors: found.errors } : served(found.path)
    })
  },
})

/** Every import of a file transpiled alone stays an import: of a file below `src/` at its URL, of a package at its `/vendor/` URL. */
const sourceImports = servedImports('source-imports', (file) => ({ path: sourceUrl(file), external: true }), (specifier) => ({ path: vendorUrl(specifier), external: true }))

/** A client imports what it reaches below `src/` by URL, and bundles its own modules and packages. */
const clientImports = servedImports('client-imports', (file) => (file.startsWith(SRC + path.sep) ? { path: sourceUrl(file), external: true } : { path: file }), () => undefined)

/** A served module's text, and the files it was built from: valid while none of them changed. */
type Built = { text: string; inputs: { file: string; mtimeMs: number }[] }
const builtCache = new Map<string, Built>()

const stamp = (file: string) => statSync(file, { throwIfNoEntry: false })?.mtimeMs

async function cached(key: string, make: () => Promise<{ text: string; metafile: Metafile }>): Promise<string> {
  const hit = builtCache.get(key)
  if (hit && hit.inputs.every((i) => stamp(i.file) === i.mtimeMs)) return hit.text
  const { text, metafile } = await make()
  const inputs = Object.keys(metafile.inputs).map((input) => path.resolve(REPO, input)).map((file) => ({ file, mtimeMs: stamp(file)! }))
  builtCache.set(key, { text, inputs })
  return text
}

const esm = async (options: BuildOptions) => {
  const { outputFiles, metafile } = await build({ ...options, absWorkingDir: REPO, bundle: true, format: 'esm', write: false, metafile: true })
  return { text: outputFiles![0].text, metafile: metafile! }
}

/** A file below `src/` transpiled alone, each of its imports the URL of what it names. */
export const sourceModule = (file: string) => cached(`source:${file}`, () => esm({ entryPoints: [file], plugins: [sourceImports] }))

/** An npm package's module bundled as one ES module. */
export const vendorModule = (specifier: string) => cached(`vendor:${specifier}`, () => esm({ entryPoints: [specifier], platform: 'browser' }))

/** A core view or a client's `.ts` module bundled with its own modules and packages, what it reaches below `src/` imported by URL. */
export const clientModule = (file: string) => cached(`client:${file}`, () => esm({ entryPoints: [file], plugins: [clientImports] }))

/** `/frame-keys.js`: a framed page's keys sent to the tower framing it, run by every sandboxed html page and by `/tower.js`. */
export const FRAME_KEYS = path.join(import.meta.dirname, 'frame-keys.js')

/**
 * `/tower.js` speaks the API version this tower serves, starts a viewer from the default appearance and knows the shipped
 * faces: the script names each constant and it is filled in here, from api.ts, prefs.ts and design.ts. It sends a
 * framed page's keys as `/frame-keys.js` does, which runs first.
 */
export function towerClient() {
  const filled: Record<string, unknown> = { API_VERSION, PREFS_DEFAULT, PREF_CHOICES, TERM_SIZES, GENERIC_FACES, FACES: type }
  return Object.entries(filled).reduce((script, [name, value]) => {
    const declaration = new RegExp(`^(\\s*const \\w+ = )${name}$`, 'm')
    if (!declaration.test(script)) throw new Error(`tower.js no longer declares a constant as "${name}"`)
    return script.replace(declaration, (_, head) => head + JSON.stringify(value))
  }, readFileSync(FRAME_KEYS, 'utf8') + readFileSync(path.join(import.meta.dirname, 'tower.js'), 'utf8'))
}
