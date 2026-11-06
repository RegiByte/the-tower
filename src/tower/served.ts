/**
 * What the tower serves for renderers to build on, part of the renderer API's contract: `/tower.js`, `/design.css`
 * and the shared modules. An export removed or renamed is an API major; one added, a minor. The names each one
 * exports are listed in test/served-exports.json, which test/served.test.ts holds them to.
 *
 * Every source file under `src/` that a page reaches is served once, at a URL of its own, so a module has one
 * instance on a page however many modules import it: a shared module is a re-export of its file's URL, and a core
 * view or a bundled client imports what it reaches under `src/` by URL. Those URLs (`/shared/…`, `/src/…`, and each npm
 * package at `/vendor/…`, and their hashed forms a renderer's import map names) are internal, not contract: renderers
 * import the shared modules' names.
 *
 * The library, `/lib/<module>.js`, is what code outside the core builds on: each module a file of `src/lib/` that names
 * what it re-exports. It is served like any other file, and `src/lent-modules.ts` lends it to server code at the same
 * specifier, so a module shared by an extension's server and client imports it one way.
 */
import { execFileSync } from 'node:child_process'
import { build, buildSync, type BuildOptions, type Metafile, type Plugin } from 'esbuild'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { API_VERSION } from '../shared/api.ts'
import type { Served } from '../shared/shelf-page.ts'
import { type } from '../shared/design.ts'
import { GENERIC_FACES, PREFS_DEFAULT, PREF_CHOICES, TERM_SIZES } from '../shared/prefs.ts'

const SRC = path.join(import.meta.dirname, '..')
const SHARED = path.join(SRC, 'shared')
const LIB = path.join(SRC, 'lib')
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
  '/picks.js': path.join(SHARED, 'picks.ts'),
  '/reads.js': path.join(SHARED, 'reads.ts'),
  '/viewer.js': path.join(SHARED, 'viewer.ts'),
  '/spawn.js': path.join(SHARED, 'spawn.ts'),
  '/attend.js': path.join(SHARED, 'attend.ts'),
  '/term-view.js': path.join(SHARED, 'term-view.ts'),
  '/views.js': path.join(SHARED, 'views.ts'),
  '/media.js': path.join(SHARED, 'media.ts'),
  '/repos.js': path.join(SHARED, 'repos.ts'),
}

/** Where the library is served, and where server code imports it from. */
export const LIBRARY = '/lib/'

/** The library's URLs, one per file of `src/lib/`. */
export const libraryUrls = () => readdirSync(LIB).filter((f) => f.endsWith('.ts')).map((f) => `${LIBRARY}${f.replace(/\.ts$/, '.js')}`).sort()

/** Library modules that hold server code: a browser asking for one is told so (`serverOnlyModule`), and takes its types with `import type`. */
export const SERVER_ONLY = ['/lib/extension.js']

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
  [LIB, LIBRARY],
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

/** An import of a URL the tower serves stays that URL, whatever a tsconfig path would make of it: the library, `/tower.js` and an extension's client. */
const SERVED_URL = /^\/(?:lib\/|x\/|tower\.js$)/
const servedUrls: Plugin = {
  name: 'served-urls',
  setup(b) {
    b.onResolve({ filter: SERVED_URL }, (args) => ({ path: args.path, external: true }))
  },
}

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

/**
 * A library module that holds server code, as a browser gets it: it fails as it runs, saying why. It still exports its
 * names, or a browser would stop at the first import of one and say only that the name is missing.
 */
export const serverOnlyModule = (url: string) =>
  cached(`server-only:${url}`, async () => {
    const { metafile } = await esm({ entryPoints: [urlSource(url)!], plugins: [sourceImports] })
    const said = `${url} is for an extension's server code, which node runs, and a browser can't load it. A client takes its types with \`import type\`, which leaves no import behind.`
    const names = Object.values(metafile.outputs)[0]!.exports
    return { text: [`throw new Error(${JSON.stringify(said)})`, ...names.map((name) => `export const ${name} = undefined`)].join('\n') + '\n', metafile }
  })

/** An npm package's module bundled as one ES module. */
export const vendorModule = (specifier: string) => cached(`vendor:${specifier}`, () => esm({ entryPoints: [specifier], platform: 'browser' }))

/** A core view or a client's `.ts` module bundled with its own modules and packages, what it reaches below `src/` imported by URL, and the library, `/tower.js` and `/x/` kept as the URLs they are. */
export const clientModule = (file: string) => cached(`client:${file}`, () => esm({ entryPoints: [file], plugins: [servedUrls, clientImports] }))

/** `/frame-keys.js`: a framed page's keys sent to the tower framing it, run by every sandboxed html page and by `/tower.js`. */
export const FRAME_KEYS = path.join(import.meta.dirname, 'frame-keys.js')

/** The folders of the checkout whose files the tower runs or serves, and the lock that pins the packages it serves at `/vendor/`. */
const CODE = { dirs: ['src', 'renderers', 'extensions'], files: ['package-lock.json'] }

/**
 * An id of the code the tower runs and serves: a hash over every file of `CODE`, each by its path in the checkout and
 * its bytes, read as the tower starts. It changes with any of them and is the same on every start over the same files;
 * a page loaded with another id runs code the tower no longer serves (`tower.stale()` in `/tower.js`). A name starting
 * with a dot is left out, file or folder: what the system and editors drop there (`.DS_Store`, swap files) is no code,
 * and git-ignored files are kept, since a built renderer (`renderers/tower3d/out`) is served. A renderer or an
 * extension the config roots outside the checkout is not in it.
 */
export function servedCode(): string {
  const files = [
    ...CODE.files,
    ...CODE.dirs.flatMap((dir) =>
      readdirSync(path.join(REPO, dir), { recursive: true, withFileTypes: true })
        .filter((e) => e.isFile())
        .map((e) => path.relative(REPO, path.join(e.parentPath, e.name)))
        .filter((file) => !file.split(path.sep).some((name) => name.startsWith('.'))),
    ),
  ].sort()
  const hash = createHash('sha256')
  for (const file of files) hash.update(`${file}\0`).update(readFileSync(path.join(REPO, file))).update('\0')
  return hash.digest('hex').slice(0, 16)
}

/**
 * The checkout's release as `git describe --tags --always` says it: `v1.87.1` on a tag, `v1.87.1-3-gabc1234` ahead of
 * one, the commit alone where no tag is reached. Null for a checkout outside git, which has none.
 */
export function servedVersion(): string | null {
  try {
    return execFileSync('git', ['describe', '--tags', '--always'], { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}

/** What the tower runs and serves, read once as it starts: the process runs that code until it restarts. */
export const servedNow = (): Served => ({ id: servedCode(), version: servedVersion() })

/**
 * `/tower.js` speaks the API version this tower serves, knows the code it was served from (`served`, from `servedNow`), starts a viewer from the default appearance and knows the shipped
 * faces: the script names each constant and it is filled in here, from api.ts, prefs.ts and design.ts. It sends a
 * framed page's keys as `/frame-keys.js` does, which runs first.
 */
export function towerClient(served: Served) {
  const filled: Record<string, unknown> = { API_VERSION, SERVED: served, PREFS_DEFAULT, PREF_CHOICES, TERM_SIZES, GENERIC_FACES, FACES: type }
  return Object.entries(filled).reduce((script, [name, value]) => {
    const declaration = new RegExp(`^(\\s*const \\w+ = )${name}$`, 'm')
    if (!declaration.test(script)) throw new Error(`tower.js no longer declares a constant as "${name}"`)
    return script.replace(declaration, (_, head) => head + JSON.stringify(value))
  }, readFileSync(FRAME_KEYS, 'utf8') + readFileSync(path.join(import.meta.dirname, 'tower.js'), 'utf8'))
}

/** Every import marked external as written, so a build reads a module's imports without resolving them. */
const asWritten: Plugin = { name: 'as-written', setup: (b) => b.onResolve({ filter: /.*/ }, (args) => (args.kind === 'entry-point' ? undefined : { path: args.path, external: true })) }

const importsCache = new Map<string, { text: string; imports: string[] }>()

/** The URLs a module served at `url` imports statically (`import`, `export … from`), each resolved against `url`. */
export async function staticImports(url: string, text: string): Promise<string[]> {
  const hit = importsCache.get(url)
  if (hit?.text === text) return hit.imports
  const { metafile } = await build({ stdin: { contents: text, loader: 'js' }, bundle: true, format: 'esm', write: false, metafile: true, logLevel: 'silent', plugins: [asWritten] })
  const imports = Object.values(metafile.inputs)
    .flatMap((input) => input.imports)
    .filter((i) => i.kind === 'import-statement')
    .map((i) => new URL(i.path, `http://tower${url}`).pathname)
  importsCache.set(url, { text, imports })
  return imports
}

/**
 * Every module `entries` import statically, at any depth, each once: what a page loads before its scripts run.
 * `textOf` answers a URL's text as the tower serves it, or `undefined` for one it doesn't serve as a module.
 */
export async function moduleGraph(entries: string[], textOf: (url: string) => Promise<string | undefined>): Promise<Map<string, string>> {
  const seen = new Set<string>()
  const modules = new Map<string, string>()
  for (let wave = entries; wave.length; ) {
    wave.forEach((url) => seen.add(url))
    const imports = await Promise.all(
      wave.map(async (url) => {
        const text = await textOf(url)
        if (text === undefined) return []
        modules.set(url, text)
        return staticImports(url, text)
      }),
    )
    wave = [...new Set(imports.flat())].filter((url) => !seen.has(url))
  }
  return modules
}

/** The URLs of an html page's module scripts (`<script type="module" src>`, its attributes in any order and quoting), the page served at `url`. */
export const moduleScripts = (html: string, url: string): string[] =>
  [...html.matchAll(/<script\b([^>]*)>/gi)]
    .map(([, attributes]) => attributes!)
    .filter((attributes) => /\btype\s*=\s*["']?module\b/i.test(attributes))
    .flatMap((attributes) => /\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i.exec(attributes)?.slice(1).filter(Boolean) ?? [])
    .map((src) => new URL(src!, `http://tower${url}`).pathname)

/** A file or package's URL with its text's hash in it: `/shared/press.js` as `/shared/press.3f9a0c21be.js`. */
export const hashedUrl = (url: string, text: string) => url.replace(/\.js$/, `.${createHash('sha256').update(text).digest('hex').slice(0, 10)}.js`)

/** The unhashed URL a hashed one names, if it is one. */
export const unhashedUrl = (url: string): string | undefined => /^(?<base>\/.+)\.[0-9a-f]{10}\.js$/.exec(url)?.groups?.base?.concat('.js')

/**
 * What a page loads by an import map, from its static module graph: each file below `src/` and each package at the
 * URL of its text's hash, a served module at its file's, so a page that loaded them once asks for none again until
 * one changes. Modules keep importing the unhashed URLs; the map resolves them, so each still has one record.
 */
export function importMap(modules: Map<string, string>): Record<string, string> {
  const own = (url: string) => /^\/(lib|shared|src|vendor)\//.test(url)
  const hashed = new Map([...modules].filter(([url]) => own(url)).map(([url, text]) => [url, hashedUrl(url, text)]))
  const served = [...modules.keys()].filter((url) => MODULES[url] && hashed.has(sourceUrl(MODULES[url]!))).map((url) => [url, hashed.get(sourceUrl(MODULES[url]!))!] as const)
  return Object.fromEntries([...hashed, ...served])
}

/** An html page that starts with `imports` as its import map, before its first script. */
export const withImportMap = (html: string, imports: Record<string, string>): string =>
  html.replace(/<script\b|<\/head>/, (tag) => `<script type="importmap">${JSON.stringify({ imports })}</script>\n${tag}`)

/** An html page asking for each module of `preloads` at once, with a `modulepreload` link at the end of its head. */
export const withPreloads = (html: string, preloads: string[]): string =>
  html.replace('</head>', `${preloads.map((m) => `<link rel="modulepreload" href="${m}">`).join('\n')}\n</head>`)
