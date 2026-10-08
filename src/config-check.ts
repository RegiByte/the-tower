/**
 * The config checked the way the tower reads it, each problem at its key path (`projects.my-app.shelf[0]`): what
 * `tower config check` prints and `tower doctor` sums up. It changes nothing. A `fail` is a value the tower can't take;
 * a `warn` is a key the tower doesn't know, which it ignores, often a misspelled one. Every key is documented in
 * `docs/config.md`.
 */
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { defaultRenderer, renderersOf } from './renderers.ts'
import { SHELF_KINDS, shelfProblem } from './shelf.ts'
import { callsignsOf, CONFIG_KEYS, ConfigError, configuredUser, editorArgv, projectCollections, PROJECT_KEYS, towerPort, type Config, type EditorAction, type Project, type Renderer } from './shared/model.ts'
import { keysProblems } from './shared/keymap.ts'
import { readConfig } from './system.ts'

export type ConfigProblem = { level: 'fail' | 'warn'; key: string; problem: string }

/** Where every key of the config is documented, in the tower's checkout. */
export const CONFIG_DOCS = path.join(import.meta.dirname, '..', 'docs', 'config.md')


const EDITOR_VALUES: Record<EditorAction, Record<string, string>> = { window: { dir: '.' }, open: { path: '.' }, goto: { path: '.', line: '1' } }

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isDirectory = (dir: string): boolean => existsSync(dir) && statSync(dir).isDirectory()

const fail = (key: string, problem: string): ConfigProblem => ({ level: 'fail', key, problem })

/** A validator of the tower's own, run as the tower runs it: the config error it throws is the problem. */
const checked = (key: string, check: () => unknown): ConfigProblem[] => {
  try {
    check()
    return []
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err
    return [fail(key, err.message)]
  }
}

const unknownKeys = (at: string, value: Record<string, unknown>, known: readonly string[]): ConfigProblem[] =>
  Object.keys(value)
    .filter((key) => !known.includes(key))
    .map((key) => ({ level: 'warn', key: `${at}${key}`, problem: `the tower reads no "${key}" here: known keys are ${known.join(', ')}` }))

const counts = (at: string, value: unknown, keys: string[]): ConfigProblem[] =>
  value === undefined
    ? []
    : !isObject(value)
      ? [fail(at, 'takes an object')]
      : keys.filter((key) => value[key] !== undefined && !(Number.isInteger(value[key]) && (value[key] as number) >= 0)).map((key) => fail(`${at}.${key}`, `${JSON.stringify(value[key])} is no whole number of 0 or more`))

/** A set of collections by id, each with the `label` it is shown by and an optional `description`. */
const collections = (at: string, value: unknown): ConfigProblem[] => {
  if (value === undefined) return []
  if (!isObject(value)) return [fail(at, 'takes an object of collections by id, such as { "drafts": { "label": "Drafts" } }')]
  return Object.entries(value).flatMap(([id, collection]) => {
    if (!isObject(collection)) return [fail(`${at}.${id}`, `takes an object with a "label", not ${JSON.stringify(collection)}`)]
    return [
      ...(typeof collection.label === 'string' && collection.label ? [] : [fail(`${at}.${id}.label`, 'takes the name the collection is shown by')]),
      ...(collection.description === undefined || typeof collection.description === 'string' ? [] : [fail(`${at}.${id}.description`, 'takes a sentence or two of text')]),
    ]
  })
}

const worktrees = (at: string, value: unknown): ConfigProblem[] => {
  if (value === undefined) return []
  if (!isObject(value)) return [fail(at, 'takes an object: branchPrefix, links, cutByDefault')]
  return [
    ...(value.branchPrefix === undefined || typeof value.branchPrefix === 'string' ? [] : [fail(`${at}.branchPrefix`, 'takes a string')]),
    ...(value.links === undefined || (isObject(value.links) && Object.values(value.links).every((v) => typeof v === 'string')) ? [] : [fail(`${at}.links`, 'takes an object of paths: a path inside each worktree → its source')]),
    ...(value.cutByDefault === undefined || typeof value.cutByDefault === 'boolean' ? [] : [fail(`${at}.cutByDefault`, 'takes true or false')]),
  ]
}

const directories = (at: string, dirs: unknown, what: string): ConfigProblem[] => {
  if (dirs === undefined) return []
  if (!Array.isArray(dirs)) return [fail(at, `takes a list of ${what}`)]
  return dirs.flatMap((dir, i) => (typeof dir === 'string' && path.isAbsolute(dir) && isDirectory(dir) ? [] : [fail(`${at}[${i}]`, `${JSON.stringify(dir)} is no absolute path of a directory`)]))
}

const projectProblems = (config: Config, id: string, project: Project, renderers: Renderer[] | undefined): ConfigProblem[] => {
  const at = `projects.${id}`
  if (!isObject(project)) return [fail(at, 'takes an object: name, hub and repos at least')]
  const shape = [
    ...(typeof project.name === 'string' && project.name ? [] : [fail(`${at}.name`, 'takes the name the floor is shown by')]),
    ...(typeof project.hub === 'string' && path.isAbsolute(project.hub) && isDirectory(project.hub) ? [] : [fail(`${at}.hub`, `${JSON.stringify(project.hub)} is no absolute path of a directory: sessions start in the hub`)]),
    ...(project.repos === undefined ? [fail(`${at}.repos`, 'takes a list of absolute directories, [] for none')] : directories(`${at}.repos`, project.repos, 'absolute directories')),
  ]
  if (shape.some((p) => p.key === `${at}.hub`)) return [...unknownKeys(`${at}.`, project, PROJECT_KEYS), ...shape]
  const collectionIds = [config.collections, project.collections].flatMap((c) => (isObject(c) ? Object.keys(c) : []))
  const shelf =
    project.shelf === undefined
      ? []
      : !Array.isArray(project.shelf)
        ? [fail(`${at}.shelf`, 'takes a list of entries')]
        : project.shelf.flatMap((entry, n) => {
            if (!isObject(entry)) return [fail(`${at}.shelf[${n}]`, `takes an object: a label and one of ${SHELF_KINDS.join(', ')}`)]
            const problem = renderers && shelfProblem(project, entry, renderers, collectionIds)
            return problem ? [fail(`${at}.shelf[${n}]`, problem)] : []
          })
  return [
    ...unknownKeys(`${at}.`, project, PROJECT_KEYS),
    ...shape,
    ...shelf,
    ...collections(`${at}.collections`, project.collections),
    ...(isObject(config.collections ?? {}) && isObject(project.collections ?? {}) ? checked(`${at}.collections`, () => projectCollections(config, id)) : []),
    ...worktrees(`${at}.worktrees`, project.worktrees),
    ...counts(`${at}.hiring`, project.hiring, ['depth', 'live']),
    ...counts(`${at}.brief`, project.brief, ['pairs']),
    ...directories(`${at}.plugins`, project.plugins, 'absolute plugin directories'),
  ]
}

/** Every problem of a config read from its file, each at the key it is at. */
export const configProblems = (config: Config): ConfigProblem[] => {
  if (!isObject(config)) return [fail('(the file)', 'holds no JSON object')]
  const renderers = (() => {
    try {
      return renderersOf(config)
    } catch (err) {
      if (err instanceof ConfigError) return undefined
      throw err
    }
  })()
  const projects = isObject(config.projects) ? Object.entries(config.projects) : []
  return [
    ...unknownKeys('', config, CONFIG_KEYS),
    ...(Array.isArray(config.argv) && config.argv.length && config.argv.every((arg) => typeof arg === 'string') ? [] : [fail('argv', 'takes the command sessions start with, such as ["claude"]')]),
    ...(config.env === undefined || (isObject(config.env) && Object.values(config.env).every((v) => typeof v === 'string')) ? [] : [fail('env', 'takes an object of strings, {} for none')]),
    ...(projects.length ? [] : [fail('projects', 'names no project: add one, or `tower init` on a fresh system')]),
    ...checked('user.name', () => configuredUser(config)),
    ...checked('callsigns', () => callsignsOf(config)),
    ...checked('port', () => towerPort(config)),
    ...checked('renderers', () => renderersOf(config)),
    ...(renderers ? checked('renderer', () => defaultRenderer(config, renderers)) : []),
    ...(config.editor === undefined ? [] : (Object.keys(EDITOR_VALUES) as EditorAction[]).flatMap((action) => checked(`editor.${action}`, () => editorArgv(config, action, EDITOR_VALUES[action])))),
    ...collections('collections', config.collections),
    ...worktrees('worktrees', config.worktrees),
    ...counts('hiring', config.hiring, ['depth', 'live']),
    ...counts('brief', config.brief, ['pairs']),
    ...counts('retention', config.retention, ['days']),
    ...directories('plugins', config.plugins, 'absolute plugin directories'),
    ...(config.keys === undefined ? [] : keysProblems(config.keys).map(({ level, at, problem }) => ({ level, key: `keys${at}`, problem }))),
    ...projects.flatMap(([id, project]) => projectProblems(config, id, project, renderers)),
  ]
}

/** The config file's problems; JSON it can't parse is the one problem. A missing file is a `ENOENT` error. */
export const checkConfigFile = (file: string): ConfigProblem[] => {
  try {
    return configProblems(readConfig(file))
  } catch (err) {
    if (err instanceof ConfigError) return [fail('(the file)', err.message)]
    throw err
  }
}

const LABEL: Record<ConfigProblem['level'], string> = { fail: 'FAIL', warn: 'warn' }

export const problemLines = (problems: ConfigProblem[]): string[] => problems.map((p) => `${LABEL[p.level]}  ${p.key}: ${p.problem}`)
