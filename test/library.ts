/**
 * The library as data, for what holds it: `served-exports.json`'s `library` section (`test/served.test.ts`) and the
 * checks on its shape, reach, runtimes and direction (`test/library.test.ts`).
 */
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { LIBRARY, libraryUrls, MODULES, urlSource, urlVendor } from '../src/tower/served.ts'

export const REPO = path.join(import.meta.dirname, '..')
const TSC = path.join(REPO, 'node_modules', '.bin', 'tsc')

/** Where a library module runs: anywhere, in a browser, or in node. Each has a tsconfig of its own under `test/runtimes/`. */
export const RUNTIMES = ['generic', 'browser', 'server'] as const
export type Runtime = (typeof RUNTIMES)[number]

/** A name's place in the contract. `stability` only while provisional; `deprecated` only on an alias that goes at the next major. */
export type LibraryName = { since: string; stability?: 'provisional'; deprecated?: { since: string; use: string } }
export type LibraryModule = { runtime: Runtime; values: Record<string, LibraryName>; types: Record<string, LibraryName> }
export type Library = Record<string, LibraryModule>

/** What a library file names, by kind, and each line it may not hold. */
export type Shape = { values: Map<string, Omit<LibraryName, 'since'>>; types: Map<string, Omit<LibraryName, 'since'>>; problems: string[] }

const ID = String.raw`[A-Za-z_$][\w$]*`
const HEADER = /^\s*\/\*\*[\s\S]*?\*\/\s*/
const RE_EXPORT = new RegExp(String.raw`^export( type)? \{([^{}]*)\} from '(\.\./[\w./-]+\.ts)'\s*`)
const ALIAS_IMPORT = new RegExp(String.raw`^import( type)? \{[^{}]*\} from '\.\./[\w./-]+\.ts'\s*`)
const ALIAS = new RegExp(String.raw`^/\*\* @deprecated (\d+\.\d+): use (${ID}) \*/\s*export (const|type) (${ID}) = ${ID}\s*`)
const NAME = new RegExp(String.raw`^(/\*\* @provisional \*/ )?(${ID})$`)

/**
 * A library file read as its three kinds of line: a named re-export, a named re-export of types, and a deprecated
 * alias with the import it needs. Nothing else may stand in one, or a definition would become contract unread.
 */
export function shapeOf(text: string): Shape {
  const shape: Shape = { values: new Map(), types: new Map(), problems: [] }
  let rest = text.replace(HEADER, '')
  while (rest) {
    const reExport = RE_EXPORT.exec(rest)
    const alias = ALIAS.exec(rest)
    const taken = reExport ?? alias ?? ALIAS_IMPORT.exec(rest)
    if (!taken) {
      shape.problems.push(`holds something other than a named re-export or a deprecated alias: ${rest.split('\n')[0]}`)
      return shape
    }
    if (reExport) {
      for (const item of reExport[2]!.split(',').map((n) => n.trim()).filter(Boolean)) {
        const name = NAME.exec(item)
        if (!name) shape.problems.push(`names "${item}", which is not a plain name, marked @provisional or not`)
        else (reExport[1] ? shape.types : shape.values).set(name[2]!, name[1] ? { stability: 'provisional' } : {})
      }
    }
    if (alias) (alias[3] === 'type' ? shape.types : shape.values).set(alias[4]!, { deprecated: { since: alias[1]!, use: alias[2]! } })
    rest = rest.slice(taken[0].length)
  }
  return shape
}

/** Every library file's shape, by URL. */
export const libraryShapes = () => new Map(libraryUrls().map((url) => [url, shapeOf(readFileSync(urlSource(url)!, 'utf8'))]))

/** Each name more than one library module holds: names are flat, so one name can't mean two things. */
export function namedTwice(shapes: Map<string, Pick<Shape, 'values' | 'types'>>): string[] {
  const seen = new Map<string, string[]>()
  for (const [url, { values, types }] of shapes) for (const name of [...values.keys(), ...types.keys()]) seen.set(name, [...(seen.get(name) ?? []), url])
  return [...seen].filter(([, urls]) => urls.length > 1).map(([name, urls]) => `${name} in ${urls.join(' and ')}`)
}

/** A runtime's tsconfig as it stands. */
const runtimeConfig = (runtime: Runtime) => path.join(REPO, 'test', 'runtimes', `${runtime}.json`)

/** The library URLs a runtime's tsconfig checks. */
export const modulesOf = (runtime: Runtime): string[] =>
  (JSON.parse(readFileSync(runtimeConfig(runtime), 'utf8')) as { files: string[] }).files.filter((f) => f.startsWith('../../src/lib/')).map((f) => `/lib/${path.basename(f, '.ts')}.js`)

const runtimeOf = (url: string): Runtime => {
  const found = RUNTIMES.find((runtime) => modulesOf(runtime).includes(url))
  if (!found) throw new Error(`${url} is in no runtime: add it to one of test/runtimes/*.json`)
  return found
}

/** `tsc` over a tsconfig: what it printed and the files it read, a failure's output kept in place of throwing. */
export function typecheck(config: string): { errors: string; files: string[] } {
  try {
    const listed = execFileSync(TSC, ['-p', config, '--listFiles'], { cwd: REPO, encoding: 'utf8' })
    return { errors: '', files: listed.trim().split('\n') }
  } catch (err) {
    return { errors: (err as { stdout: string }).stdout, files: [] }
  }
}

export const checkRuntime = (runtime: Runtime) => typecheck(runtimeConfig(runtime))

/** The library as it stands now, each name with the `since` `listed` gives it, a new one with `since`. */
export function libraryNow(listed: Library, since: string): Library {
  const stamped = (names: Shape['values'], kept: Record<string, LibraryName> | undefined) =>
    Object.fromEntries([...names].sort(([a], [b]) => (a < b ? -1 : 1)).map(([name, mark]) => [name, { since: kept?.[name]?.since ?? since, ...mark }]))
  return Object.fromEntries(
    [...libraryShapes()].map(([url, { values, types }]) => [
      url,
      { runtime: runtimeOf(url), values: stamped(values, listed[url]?.values), types: stamped(types, listed[url]?.types) },
    ]),
  )
}

const SKIPPED = new Set(['node_modules', 'dist', 'out', 'shots', 'assets', 'models', 'build', '.git'])
const SOURCE = /\.(ts|tsx|js|mjs|html|swift)$/

/** Every source file below `dir`, by its path in the checkout. */
const sourcesIn = (dir: string): string[] =>
  readdirSync(path.join(REPO, dir), { withFileTypes: true }).flatMap((entry) => {
    const inside = path.join(dir, entry.name)
    if (entry.isDirectory()) return SKIPPED.has(entry.name) ? [] : sourcesIn(inside)
    return SOURCE.test(entry.name) && !entry.name.endsWith('.d.ts') ? [inside] : []
  })

/** Every module specifier a text names: `import`, `export … from`, `import()`, a type's `import('x').T` and JSDoc's `@import`. */
export const specifiersOf = (text: string): string[] =>
  [...text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s+)(['"])([^'"\n]+)\1/gm)].map((m) => m[2]!)

/** A file's way into the core outside the library: a path below `src/`, a served module's URL, a loan from `tower:`, or an internal URL. */
export const reachesCore = (file: string, specifier: string): boolean =>
  specifier.startsWith('.')
    ? path.resolve(REPO, path.dirname(file), specifier).startsWith(path.join(REPO, 'src') + path.sep)
    : specifier.startsWith('tower:') || Boolean(MODULES[specifier]) || (specifier.startsWith('/') && !specifier.startsWith(LIBRARY) && (urlSource(specifier) ?? urlVendor(specifier)) !== undefined)

/** Each way into the core outside the library from code that isn't the core, once per file: `<file> -> <specifier>`. */
export const reachNow = (): string[] => [
  ...new Set(
    ['extensions', 'examples', 'renderers', 'apps'].flatMap(sourcesIn).flatMap((file) =>
      specifiersOf(readFileSync(path.join(REPO, file), 'utf8'))
        .filter((specifier) => reachesCore(file, specifier))
        .map((specifier) => `${file} -> ${specifier}`),
    ),
  ),
].sort()

/** A source with its comments blanked, so what is read is what runs. */
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`/g, (m) => (m.startsWith('/') ? '' : m))

/** The imports of the library from inside the core: any by path, and any by URL but a core view's, which is a client. */
export const libraryInCore = (): string[] =>
  sourcesIn('src')
    .filter((file) => !file.startsWith(path.join('src', 'lib') + path.sep))
    .flatMap((file) =>
      specifiersOf(code(readFileSync(path.join(REPO, file), 'utf8')))
        .filter((specifier) => (specifier.startsWith('.') ? path.resolve(REPO, path.dirname(file), specifier).startsWith(path.join(REPO, 'src', 'lib') + path.sep) : specifier.startsWith('/lib/') && !file.startsWith(path.join('src', 'views') + path.sep)))
        .map((specifier) => `${file} -> ${specifier}`),
    )
