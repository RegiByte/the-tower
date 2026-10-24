/**
 * The config checked the way the tower reads it, each problem at its key path (`projects.my-app.shelf[0]`): what
 * `tower config check` prints and `tower doctor` sums up. It changes nothing. A `fail` is a value the tower can't take;
 * a `warn` is a key the tower doesn't know, which it ignores, often a misspelled one. Every key is documented in
 * `docs/config.md`.
 */
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { manifestOf, parseSettings, resolve, settingsSchema, type Found, type Resolved } from './bridge/extensions.ts'
import { probesOf } from './bridge/probes.ts'
import { discover } from './extensions.ts'
import { API_VERSION } from './shared/api.ts'
import { defaultRenderer, renderersOf } from './renderers.ts'
import { SHELF_KINDS, shelfProblem } from './shelf.ts'
import {
  BRIEF_KEYS,
  CAPABILITY_KEYS,
  callsignsOf,
  COLLECTION_KEYS,
  CONFIG_KEYS,
  ConfigError,
  configuredUser,
  EDITOR_KEYS,
  editorArgv,
  EXTENSION_KEYS,
  FLOOR_EXTENSION_KEYS,
  HIRING_KEYS,
  PROBE_KEYS,
  projectCollections,
  PROJECT_KEYS,
  RENDERER_KEYS,
  RETENTION_KEYS,
  towerPort,
  USER_KEYS,
  WORKTREES_KEYS,
  type Config,
  type EditorAction,
  type Project,
  type Renderer,
} from './shared/model.ts'
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

/** The unknown keys of the object at `at`, when it is one. */
const unknownKeysAt = (at: string, value: unknown, known: readonly string[]): ConfigProblem[] => (isObject(value) ? unknownKeys(`${at}.`, value, known) : [])

/** The unknown keys of each object in a set of them by name, such as `probes.quota`. */
const unknownKeysEach = (at: string, value: unknown, known: readonly string[]): ConfigProblem[] =>
  isObject(value) ? Object.entries(value).flatMap(([name, each]) => unknownKeysAt(`${at}.${name}`, each, known)) : []

/** A shelf entry reads its `label`, its kind's key and, for `md`, its `order`. */
const shelfKeys = (entry: Record<string, unknown>): string[] => ['label', ...SHELF_KINDS.filter((kind) => kind in entry), ...('md' in entry ? ['order'] : [])]

/** An object of whole numbers, each of its `keys`. */
const counts = (at: string, value: unknown, keys: readonly string[]): ConfigProblem[] =>
  value === undefined
    ? []
    : !isObject(value)
      ? [fail(at, 'takes an object')]
      : [
          ...unknownKeys(`${at}.`, value, keys),
          ...keys.filter((key) => value[key] !== undefined && !(Number.isInteger(value[key]) && (value[key] as number) >= 0)).map((key) => fail(`${at}.${key}`, `${JSON.stringify(value[key])} is no whole number of 0 or more`)),
        ]

/** A set of collections by id, each with the `label` it is shown by and an optional `description`. */
const collections = (at: string, value: unknown): ConfigProblem[] => {
  if (value === undefined) return []
  if (!isObject(value)) return [fail(at, 'takes an object of collections by id, such as { "drafts": { "label": "Drafts" } }')]
  return Object.entries(value).flatMap(([id, collection]) => {
    if (!isObject(collection)) return [fail(`${at}.${id}`, `takes an object with a "label", not ${JSON.stringify(collection)}`)]
    return [
      ...unknownKeys(`${at}.${id}.`, collection, COLLECTION_KEYS),
      ...(typeof collection.label === 'string' && collection.label ? [] : [fail(`${at}.${id}.label`, 'takes the name the collection is shown by')]),
      ...(collection.description === undefined || typeof collection.description === 'string' ? [] : [fail(`${at}.${id}.description`, 'takes a sentence or two of text')]),
    ]
  })
}

const worktrees = (at: string, value: unknown): ConfigProblem[] => {
  if (value === undefined) return []
  if (!isObject(value)) return [fail(at, 'takes an object: branchPrefix, links, cutByDefault')]
  return [
    ...unknownKeys(`${at}.`, value, WORKTREES_KEYS),
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

/** The extensions as the tower finds and resolves them, to check their settings against their manifests. */
type Extensions = { found: Found[]; resolved: Resolved }

/** Settings parsed by the settings schema of the manifest `found` holds, each problem at its key path below `at`. */
const settingsProblems = (at: string, found: Found | undefined, settings: unknown): ConfigProblem[] => {
  const manifest = found && manifestOf(found)
  if (!manifest) return []
  if (!manifest.settings) return [fail(at, `${manifest.id} takes no settings`)]
  const schema = settingsSchema(manifest.settings)
  if (typeof schema === 'string') return []
  const parsed = parseSettings(schema, settings, at)
  return parsed.ok ? [] : parsed.problems.map((p) => fail(p.path, p.message))
}

/** A bundled extension's folder is the checkout's; a new one's is the absolute `path` holding its extension.json. */
const folderProblems = (at: string, found: Found, dir: unknown): ConfigProblem[] => {
  if (found.bundled) return dir === undefined ? [] : [{ level: 'warn', key: `${at}.path`, problem: `${found.id} is bundled, in the checkout: path is read only for a new extension` }]
  if (dir === undefined) return [fail(at, `${found.id} is no bundled extension: a new one takes path, the absolute folder holding its extension.json`)]
  if (typeof dir !== 'string' || !path.isAbsolute(dir) || !isDirectory(dir)) return [fail(`${at}.path`, `${JSON.stringify(dir)} is no absolute path of a directory: a new extension takes the folder holding its extension.json`)]
  return found.text === undefined ? [fail(`${at}.path`, `${dir} holds no extension.json`)] : []
}

/** The system's extensions by id: a new one's folder, and each one's settings by its manifest. */
const extensionEntries = (config: Config, { found }: Extensions): ConfigProblem[] => {
  if (config.extensions === undefined) return []
  if (!isObject(config.extensions)) return [fail('extensions', 'takes an object of extensions by id, such as { "roles": { "path": "/an/absolute/folder" } }')]
  return Object.entries(config.extensions).flatMap(([id, entry]) => {
    const at = `extensions.${id}`
    if (!isObject(entry)) return [fail(at, `takes an object: path, off and settings, not ${JSON.stringify(entry)}`)]
    const one = found.find((f) => f.id === id)!
    return [
      ...unknownKeys(`${at}.`, entry, EXTENSION_KEYS),
      ...folderProblems(at, one, entry.path),
      ...(entry.off === undefined || typeof entry.off === 'boolean' ? [] : [fail(`${at}.off`, 'takes true or false')]),
      ...(entry.settings === undefined ? [] : isObject(entry.settings) ? settingsProblems(`${at}.settings`, one, entry.settings) : [fail(`${at}.settings`, 'takes an object')]),
    ]
  })
}

/** A floor's extension settings, merged over the system's and parsed by the manifest's schema, and its capabilities turned off. */
const floorExtensions = (config: Config, at: string, project: Project, { found, resolved }: Extensions): ConfigProblem[] => {
  const settings =
    project.extensions === undefined
      ? []
      : !isObject(project.extensions)
        ? [fail(`${at}.extensions`, 'takes an object of extensions by id, each with its settings on this floor')]
        : Object.entries(project.extensions).flatMap(([id, entry]) => {
            const key = `${at}.extensions.${id}`
            if (!isObject(entry)) return [fail(key, 'takes an object: settings')]
            const provider = resolved.accepted.has(id)
              ? []
              : [{ level: 'warn' as const, key, problem: `${id} provides no capability the tower runs: its settings here are read by no one` }]
            const merged = isObject(entry.settings) ? { ...config.extensions?.[id]?.settings, ...entry.settings } : undefined
            return [
              ...unknownKeys(`${key}.`, entry, FLOOR_EXTENSION_KEYS),
              ...provider,
              ...(entry.settings === undefined ? [] : merged ? settingsProblems(`${key}.settings`, found.find((f) => f.id === id), merged) : [fail(`${key}.settings`, 'takes an object')]),
            ]
          })
  const capabilities =
    project.capabilities === undefined
      ? []
      : !isObject(project.capabilities)
        ? [fail(`${at}.capabilities`, 'takes an object of capabilities by name, such as { "github": { "off": true } }')]
        : Object.entries(project.capabilities).flatMap(([cap, entry]) => {
            const key = `${at}.capabilities.${cap}`
            if (cap === 'tower') return [fail(key, 'the core is the capability tower, and is never off')]
            if (!isObject(entry)) return [fail(key, 'takes an object: off')]
            return [...unknownKeys(`${key}.`, entry, CAPABILITY_KEYS), ...(entry.off === undefined || typeof entry.off === 'boolean' ? [] : [fail(`${key}.off`, 'takes true or false')])]
          })
  return [...settings, ...capabilities]
}

const projectProblems = (config: Config, id: string, project: Project, renderers: Renderer[] | undefined, extensions: Extensions): ConfigProblem[] => {
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
            return [...unknownKeysAt(`${at}.shelf[${n}]`, entry, shelfKeys(entry)), ...(problem ? [fail(`${at}.shelf[${n}]`, problem)] : [])]
          })
  return [
    ...unknownKeys(`${at}.`, project, PROJECT_KEYS),
    ...shape,
    ...shelf,
    ...collections(`${at}.collections`, project.collections),
    ...(isObject(config.collections ?? {}) && isObject(project.collections ?? {}) ? checked(`${at}.collections`, () => projectCollections(config, id)) : []),
    ...worktrees(`${at}.worktrees`, project.worktrees),
    ...counts(`${at}.hiring`, project.hiring, HIRING_KEYS),
    ...counts(`${at}.brief`, project.brief, BRIEF_KEYS),
    ...directories(`${at}.plugins`, project.plugins, 'absolute plugin directories'),
    ...floorExtensions(config, at, project, extensions),
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
  const found = discover(isObject(config.extensions) ? config : { ...config, extensions: undefined })
  const extensions: Extensions = { found, resolved: resolve(found, { ...config, projects: Object.fromEntries(projects) }, API_VERSION) }
  return [
    ...unknownKeys('', config, CONFIG_KEYS),
    ...(Array.isArray(config.argv) && config.argv.length && config.argv.every((arg) => typeof arg === 'string') ? [] : [fail('argv', 'takes the command sessions start with, such as ["claude"]')]),
    ...(config.env === undefined || (isObject(config.env) && Object.values(config.env).every((v) => typeof v === 'string')) ? [] : [fail('env', 'takes an object of strings, {} for none')]),
    ...(projects.length ? [] : [fail('projects', 'names no project: add one, or `tower init` on a fresh system')]),
    ...unknownKeysAt('user', config.user, USER_KEYS),
    ...checked('user.name', () => configuredUser(config)),
    ...checked('callsigns', () => callsignsOf(config)),
    ...checked('port', () => towerPort(config)),
    ...checked('renderers', () => renderersOf(config)),
    ...unknownKeysEach('renderers', config.renderers, RENDERER_KEYS),
    ...(renderers ? checked('renderer', () => defaultRenderer(config, renderers)) : []),
    ...unknownKeysAt('editor', config.editor, EDITOR_KEYS),
    ...(config.editor === undefined ? [] : (Object.keys(EDITOR_VALUES) as EditorAction[]).flatMap((action) => checked(`editor.${action}`, () => editorArgv(config, action, EDITOR_VALUES[action])))),
    ...collections('collections', config.collections),
    ...worktrees('worktrees', config.worktrees),
    ...counts('hiring', config.hiring, HIRING_KEYS),
    ...counts('brief', config.brief, BRIEF_KEYS),
    ...counts('retention', config.retention, RETENTION_KEYS),
    ...(config.probes === undefined || isObject(config.probes) ? checked('probes', () => probesOf(config)) : [fail('probes', 'takes an object of probes by name, such as { "quota": { "off": true } }')]),
    ...unknownKeysEach('probes', config.probes, PROBE_KEYS),
    ...directories('plugins', config.plugins, 'absolute plugin directories'),
    ...(config.keys === undefined ? [] : keysProblems(config.keys).map(({ level, at, problem }) => ({ level, key: `keys${at}`, problem }))),
    ...extensionEntries(config, extensions),
    ...projects.flatMap(([id, project]) => projectProblems(config, id, project, renderers, extensions)),
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
