/**
 * `tower types <dir>`: what an extension outside the checkout typechecks against. The declarations TypeScript emits
 * for the library and the bundled extensions' clients, with those of every package they name, are built once per
 * version of the code under `<root>/cache/types/` and copied to `<dir>/.tower/`.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { isBuiltin } from 'node:module'
import path from 'node:path'
import { CliError } from './cli-error.ts'
import { API_VERSION } from './shared/api.ts'

const REPO = path.join(import.meta.dirname, '..')
const TSC = path.join(REPO, 'node_modules', '.bin', 'tsc')
const MODULES = path.join(REPO, 'node_modules')
const EMIT_CONFIG = 'tsconfig.types.json'
/** Declares what `/tower.js` defines on a page. It is a declaration already, so the compiler emits nothing for it. */
const TOWER_GLOBAL = 'src/tower/client.d.ts'
const DECLARATION = /\.d\.[cm]?ts$/
const VENDORED = /(\.d\.[cm]?ts|(^|\/)package\.json|(^|\/)LICEN[CS]E[^/]*)$/

/** Every file below `dir`, by its path from `dir` with `/` between folders, sorted, no package's own `node_modules` among them. */
const filesBelow = (dir: string): string[] =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
    .filter((file) => !file.split('/').includes('node_modules'))
    .sort()

/** The code the declarations are made from, with the compiler and packages that make them. */
const typesSource = (): string => {
  const hash = createHash('sha256')
  const named = (root: string) => filesBelow(path.join(REPO, root)).map((file) => `${root}/${file}`)
  for (const file of [...named('src'), ...named('extensions'), EMIT_CONFIG, 'tsconfig.client.json', 'package-lock.json']) hash.update(`${file}\0${readFileSync(path.join(REPO, file))}\0`)
  return hash.digest('hex').slice(0, 16)
}

const SPECIFIER = /(?:(?<!['"])\bfrom\s*|\bimport\s*\(\s*|^\s*import\s+|<reference\s+types=)["']([^"']+)["']/gm

/** The npm packages a declaration names, its comments set aside: their examples name packages nobody imports. */
export const packagesNamed = (text: string): string[] =>
  [...text.replace(/\/\*[\s\S]*?\*\/|^\s*\/\/ .*$/gm, '').matchAll(SPECIFIER)]
    .map((match) => match[1]!)
    .filter((specifier) => !/^[./]/.test(specifier) && !isBuiltin(specifier))
    .map((specifier) => specifier.split('/').slice(0, specifier.startsWith('@') ? 2 : 1).join('/'))

/** Copies the declarations of every package `tree` names, and of every package those name, to `tree/node_modules`. */
const vendor = (tree: string) => {
  const held = new Set<string>()
  const named = (root: string, files: string[]) => files.filter((file) => DECLARATION.test(file)).flatMap((file) => packagesNamed(readFileSync(path.join(root, file), 'utf8')))
  for (const queue = named(tree, filesBelow(tree)); queue.length; ) {
    const name = queue.pop()!
    if (held.has(name)) continue
    held.add(name)
    const from = path.join(MODULES, name)
    if (!existsSync(from)) throw new CliError(`The declarations name the package ${name}, which isn't in ${MODULES}`, `npm ci in ${REPO}`)
    const files = filesBelow(from).filter((file) => VENDORED.test(file))
    for (const file of files) cpSync(path.join(from, file), path.join(tree, 'node_modules', name, file))
    queue.push(...named(from, files))
  }
}

const emit = (outDir: string) => {
  try {
    execFileSync(TSC, ['-p', EMIT_CONFIG, '--outDir', outDir], { cwd: REPO, encoding: 'utf8' })
  } catch (err) {
    throw new CliError(`The checkout's declarations don't typecheck:\n${(err as { stdout: string }).stdout}`, `fix the errors above in ${REPO}, or check out a commit whose typecheck passes`)
  }
}

/** Moves a built tree into its place, unless a run sharing the cache got there first. */
const placed = (staging: string, tree: string): boolean => {
  try {
    renameSync(staging, tree)
    return true
  } catch (err) {
    if (existsSync(tree)) return false
    throw err
  }
}

/**
 * The declarations of this code, built when no earlier run built them. Runs share the cache, so one that finds its
 * tree built meanwhile takes that one; the run that placed it clears older versions, being a cache.
 */
const typesTree = (cache: string): string => {
  const types = path.join(cache, 'types')
  const tree = path.join(types, `${API_VERSION}-${typesSource()}`)
  if (existsSync(tree)) return tree
  if (!existsSync(TSC)) throw new CliError(`No TypeScript in ${MODULES}`, `npm ci in ${REPO}`)
  const staging = path.join(types, `.staging-${process.pid}`)
  mkdirSync(types, { recursive: true })
  try {
    emit(staging)
    cpSync(path.join(REPO, TOWER_GLOBAL), path.join(staging, TOWER_GLOBAL))
    vendor(staging)
    writeFileSync(path.join(staging, 'stamp.json'), `${JSON.stringify({ api: API_VERSION }, null, 2)}\n`)
    if (!placed(staging, tree)) return tree
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
  for (const older of readdirSync(types)) if (older !== path.basename(tree) && !older.startsWith('.')) rmSync(path.join(types, older), { recursive: true, force: true })
  return tree
}

/** A tsconfig's `paths` for `dir`, a path from that tsconfig to the folder holding `types`: the library's, `/tower.js` and each bundled client's. */
const pathsOf = (tree: string, dir: string): Record<string, string[]> => ({
  '/lib/*.js': [`${dir}/types/src/lib/*.d.ts`],
  '/tower.js': [`${dir}/types/${TOWER_GLOBAL}`],
  ...Object.fromEntries(
    readdirSync(path.join(tree, 'extensions'))
      .filter((cap) => existsSync(path.join(tree, 'extensions', cap, 'client')))
      .sort()
      .map((cap) => [`/x/${cap}/*.js`, [`${dir}/types/extensions/${cap}/client/*.d.ts`]]),
  ),
})

/**
 * The tsconfig a folder extends. A server's and a client's code live in one extension, so it holds both runtimes'
 * types. `skipLibCheck` stays off: with it on, a package missing from the declarations turns what it reaches into `any`, unsaid.
 */
const folderConfig = (tree: string) => ({
  compilerOptions: {
    target: 'es2024',
    module: 'esnext',
    moduleResolution: 'bundler',
    lib: ['es2024', 'dom', 'dom.iterable'],
    types: ['node'],
    strict: true,
    noEmit: true,
    skipLibCheck: false,
    allowImportingTsExtensions: true,
    paths: pathsOf(tree, '.'),
  },
})

/** What a folder's own tsconfig needs to be told, as it stands: `paths` of its own replace the ones it would extend. */
export const advice = (dir: string, paths: Record<string, string[]>): string[] => {
  const own = path.join(dir, 'tsconfig.json')
  const text = existsSync(own) ? readFileSync(own, 'utf8') : undefined
  const extending = text?.includes('.tower/tsconfig.json')
  return [
    ...(text === undefined ? ['Write a tsconfig.json in the folder: { "extends": "./.tower/tsconfig.json" }'] : extending ? [] : ['Add to the folder\'s tsconfig.json: "extends": "./.tower/tsconfig.json"']),
    ...(text && /"paths"\s*:/.test(text) ? ['Warning: its tsconfig.json has paths, which replace the ones it extends. Copy these into them:', ...Object.entries(paths).map(([from, to]) => `  ${JSON.stringify(from)}: ${JSON.stringify(to)},`)] : []),
    'Server code needs @types/node in the folder: npm install --save-dev @types/node',
  ]
}

/**
 * Writes `<dir>/.tower/`: the declarations, the tsconfig to extend and a `.gitignore`, since a committed copy goes
 * stale against the tower. An author whose own CI typechecks changes that file, so only a first run writes it.
 */
export const writeTypes = (cache: string, dir: string): string[] => {
  const tree = typesTree(cache)
  const folder = path.join(dir, '.tower')
  const copied = path.join(folder, 'types')
  const first = !existsSync(copied)
  rmSync(copied, { recursive: true, force: true })
  cpSync(tree, copied, { recursive: true })
  writeFileSync(path.join(folder, 'tsconfig.json'), `${JSON.stringify(folderConfig(tree), null, 2)}\n`)
  if (first) writeFileSync(path.join(folder, '.gitignore'), '*\n')
  return [`Wrote ${folder}: the library's declarations at API ${API_VERSION}. \`tower types\` again refreshes them.`, ...advice(dir, pathsOf(tree, './.tower'))]
}
