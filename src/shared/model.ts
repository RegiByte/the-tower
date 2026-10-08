import { CALLSIGN_NAME, CALLSIGNS, callsigns } from './callsign.ts'
import { keymapOf, keysProblems, type Keys } from './keymap.ts'

/** A unit of work spanning one or more repositories. Sessions start in `hub`; `repos` are granted file access only (`additionalDirectories`). */
export type Project = {
  name: string
  hub: string
  repos: string[]
  /** A CSS color renderers mark the project's things with. */
  color?: string
  shelf?: ShelfEntry[]
  /** Collections only this project has, beside the ones every project has. */
  collections?: Record<string, CollectionType>
  worktrees?: WorktreesConfig
  hiring?: HiringConfig
  brief?: BriefConfig
  /** Absolute plugin directories this project's sessions load, beside the ones every session loads. */
  plugins?: string[]
}

/**
 * A kind of files a project keeps in the system root, `collections/<project>/<collection>/<item>`: the tower lists,
 * reads, writes and deletes them, and what they hold and mean is up to the renderers that use them. `description`:
 * what the collection is for, in a sentence or two, shown to the user and the workers wherever it is listed.
 */
export type CollectionType = { label: string; description?: string }

/** A file in a collection. Its id is its file name, the extension included; `modifiedAt` is epoch ms. */
export type CollectionItem = { project: string; collection: string; id: string; size: number; modifiedAt: number }

/**
 * Something kept on a project's shelf, to read or use beside its sessions: a page the project builds (`html`),
 * a set of markdown files (`md`, a glob, in name order or `desc`), a web page shown in place (`url`), such
 * as a local server's UI, or one opened in a new tab (`link`), for pages that refuse to be framed, such as claude.ai
 * artifacts, a declared renderer framed as a page (`renderer`, its name), or an item of one of the project's
 * collections (`item`, `<collection>/<id>`, the id its file name): a markdown item is read like an `md` entry's file,
 * any other is framed like an `html` entry's page, alone. Paths are relative to the project's hub.
 */
export type ShelfEntry = { label: string } & (
  { html: string } | { md: string; order?: 'desc' } | { url: string } | { link: string } | { renderer: string } | { item: string }
)

/** The collection and id an `item` entry names. */
export const shelfItem = (entry: { item: string }): { collection: string; id: string } => {
  const slash = entry.item.indexOf('/')
  return { collection: entry.item.slice(0, slash), id: entry.item.slice(slash + 1) }
}

/** The main checkouts of a project: the hub first, then its repos. */
export const projectDirs = (project: Pick<Project, 'hub' | 'repos'>): string[] => [project.hub, ...project.repos]

/** Where the tower cuts a project dir's worktrees: inside the repo, which Claude's workspace trust covers. */
export const WORKTREES_DIR = '.worktrees'

/** A worktree's name is its folder name: one path segment, and a valid part of a branch name. */
export const WORKTREE_NAME = /^[a-z0-9][a-z0-9._-]*$/i

export const worktreePath = (dir: string, name: string): string => `${dir}/${WORKTREES_DIR}/${name}`

/** The name of the worktree `cwd` is, `d/.worktrees/<name>` for a project dir `d`; `undefined` for anything else. */
export const worktreeName = (project: Project, cwd: string): string | undefined =>
  projectDirs(project)
    .map((dir) => cwd.startsWith(`${dir}/${WORKTREES_DIR}/`) && cwd.slice(dir.length + WORKTREES_DIR.length + 2))
    .find((name): name is string => !!name && WORKTREE_NAME.test(name))

/**
 * A checkout is a worktree name across every dir of a project, or `main` for the main checkouts, as `git worktree list`
 * names them: what review threads are kept for. A cut refuses the name `main`.
 */
export const MAIN_CHECKOUT = 'main'

export const checkoutOf = (project: Project, cwd: string): string => worktreeName(project, cwd) ?? MAIN_CHECKOUT

export const checkoutDirs = (project: Pick<Project, 'hub' | 'repos'>, checkout: string): string[] =>
  checkout === MAIN_CHECKOUT ? projectDirs(project) : projectDirs(project).map((dir) => worktreePath(dir, checkout))

/** The project's dirs, or the same worktree of each of them when `cwd` is a worktree of one. */
const checkoutDirsAt = (project: Project, cwd: string): string[] => {
  const name = worktreeName(project, cwd)
  return name === undefined ? projectDirs(project) : projectDirs(project).map((dir) => worktreePath(dir, name))
}

/** Whether a session can work in `cwd`: a directory of the project, or a worktree of one (`sessionDirs`). */
export const inProject = (project: Project, cwd: string): boolean => checkoutDirsAt(project, cwd).includes(cwd)

/** Why no session works in `cwd`, `undefined` when one can. */
export const outsideProject = (project: Project, cwd: string): string | undefined =>
  inProject(project, cwd) ? undefined : `"${cwd}" is neither a directory of project "${project.name}" (${projectDirs(project).join(', ')}) nor a worktree of one (<dir>/${WORKTREES_DIR}/<name>)`

/**
 * The directories a session in `cwd` works in, its own first: the project's dirs, or the same worktree of each of them.
 * A session in a worktree never reaches the main checkouts, which belong to other workers.
 */
export const sessionDirs = (project: Project, cwd: string): string[] => {
  const outside = outsideProject(project, cwd)
  if (outside) throw new Error(outside)
  return [cwd, ...checkoutDirsAt(project, cwd).filter((dir) => dir !== cwd)]
}

/**
 * How the tower cuts worktrees, at the top level and per project, merged per key with the project's winning.
 * `links`: a path inside each worktree → its source, relative to that repo's main checkout or absolute, symlinked in
 * every cut. `branchPrefix` starts every default branch name. `cutByDefault`: a new worker starts in a worktree of
 * its own unless told where (on by default); off, it starts in the hub's main checkout.
 */
export type WorktreesConfig = { branchPrefix?: string; links?: Record<string, string>; cutByDefault?: boolean }

export const DEFAULT_BRANCH_PREFIX = 'tower/'

export const worktreesConfig = (config: Config, projectId: string): Required<WorktreesConfig> => {
  const own = config.projects[projectId].worktrees
  return {
    branchPrefix: own?.branchPrefix ?? config.worktrees?.branchPrefix ?? DEFAULT_BRANCH_PREFIX,
    links: { ...config.worktrees?.links, ...own?.links },
    cutByDefault: own?.cutByDefault ?? config.worktrees?.cutByDefault ?? true,
  }
}

/**
 * How far workers hire workers through `tower hire`, at the top level and per project, the project's winning per key:
 * a guard against a chain of hires running away by accident, not a boundary (a worker can call `spawn` itself).
 * `depth`: how many hires deep a hired worker may stand, a worker started any other way standing at 0. `live`: how
 * many of a worker's hires may run at once. Reviews are never limited.
 */
export type HiringConfig = { depth?: number; live?: number }

/**
 * How much of a worker's history its brief shows, at the top level and per project, the project's winning:
 * `pairs`: the last that many turns of each conversation, each a prompt of the user with Claude's latest answer to it.
 */
export type BriefConfig = { pairs?: number }

export const briefConfig = (config: Config, projectId: string): Required<BriefConfig> => ({
  pairs: config.projects[projectId].brief?.pairs ?? config.brief?.pairs ?? 2,
})

/**
 * How long a session's log stays plain: `days` after its worker ended, Tidy offers to archive it (gzip it in place).
 * Unset: never offered.
 */
export type RetentionConfig = { days?: number }

/** The person running the tower, as renderers name them and review notes are signed: `name` is free text a message heading can carry. */
export type UserConfig = { name?: string }

/** A name a review note's heading can carry: no `·`, no line break, no space at either end. */
export const AUTHOR = /^[^\s·]([^\n·]*[^\s·])?$/

/** A config the tower can't read, or a value in it the tower can't take: the message names what to fix. */
export class ConfigError extends Error {}

/** The name the config gives the user, `undefined` when it gives none. A name no note could be signed with is a config error. */
export const configuredUser = (config: Config): string | undefined => {
  const name = config.user?.name
  if (name !== undefined && !AUTHOR.test(name))
    throw new ConfigError(`user.name ${JSON.stringify(name)} in the config can't sign a review note: give it some text, with no "·", no line break and no space at either end`)
  return name
}

/** The name notes the user writes are signed with, `user` unless the config names them. */
export const userName = (config: Config): string => configuredUser(config) ?? 'user'

/**
 * How the tower opens things in the user's editor, each an argv whose arguments may hold placeholders: `window` opens
 * `{dir}` in a new window, `open` opens `{path}` (a file or folder), `goto` opens the file `{path}` at `{line}`. All
 * three are VS Code's when the config sets no `editor`, and each is required when it does.
 */
export type EditorConfig = { window: string[]; open: string[]; goto: string[] }

export type EditorAction = keyof EditorConfig

/** VS Code's `code`, whose flags editors built on it share. */
const CODE: EditorConfig = {
  window: ['code', '--new-window', '{dir}'],
  open: ['code', '{path}'],
  goto: ['code', '--goto', '{path}:{line}'],
}

/**
 * The argv that does `action` in the user's editor, its placeholders filled from `values`. A set `editor` without the
 * action, or a placeholder with no value, is a config error.
 */
export const editorArgv = (config: Config, action: EditorAction, values: Record<string, string>): string[] => {
  const template = (config.editor ?? CODE)[action]
  if (!template) throw new ConfigError(`editor in the config has no "${action}": set window, open and goto, or leave editor out for VS Code's code`)
  return template.map((arg) =>
    arg.replace(/\{(\w+)\}/g, (_, key: string) => {
      if (!Object.hasOwn(values, key)) throw new ConfigError(`editor.${action} in the config uses {${key}}: it takes ${Object.keys(values).map((k) => `{${k}}`).join(' and ')}`)
      return values[key]
    }),
  )
}

/** Every command's chords, the config's `keys` over the keymap's defaults. Keys that can't be bound so are a config error. */
export const configuredKeys = (config: Config): Keys => {
  const overrides = config.keys ?? {}
  const failed = keysProblems(overrides).find((p) => p.level === 'fail')
  if (failed) throw new ConfigError(`keys${failed.at} in the config: ${failed.problem}`)
  return keymapOf(overrides)
}

/** The names workers are called by: the config's `callsigns`, or `CALLSIGNS` when it names none. A list that can't name workers is a config error. */
export const configuredCallsigns = (config: Config): readonly string[] => {
  const names = config.callsigns ?? CALLSIGNS
  if (!Array.isArray(names) || !names.length) throw new ConfigError(`callsigns in the config must be a list of at least one name, not ${JSON.stringify(names)}`)
  const bad = names.find((name) => typeof name !== 'string' || !CALLSIGN_NAME.test(name))
  if (bad !== undefined) throw new ConfigError(`callsigns in the config can't call a worker ${JSON.stringify(bad)}: a name is an upper case letter, then upper case letters and digits`)
  const twice = names.find((name, i) => names.indexOf(name) !== i)
  if (twice !== undefined) throw new ConfigError(`callsigns in the config names ${twice} twice`)
  return names
}

/** The loopback port the tower serves on: the config's `port`, 4317 when it names none. A port that isn't one is a config error. */
export const towerPort = (config: Config): number => {
  const port = config.port ?? 4317
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new ConfigError(`port in the config must be a whole number from 1 to 65535, not ${JSON.stringify(port)}`)
  return port
}

export const towerUrl = (config: Config): string => `http://127.0.0.1:${towerPort(config)}`

/** Each session's callsign by its id, from the config's names (`configuredCallsigns`). */
export const callsignsOf = (config: Config): ((id: string) => string) => callsigns(configuredCallsigns(config))

export const hiringConfig = (config: Config, projectId: string): Required<HiringConfig> => {
  const own = config.projects[projectId].hiring
  return {
    depth: own?.depth ?? config.hiring?.depth ?? 2,
    live: own?.live ?? config.hiring?.live ?? 3,
  }
}

/**
 * The whole system's configuration. The directory holding this file is the system's root:
 * session logs and the host sockets live next to it.
 */
export type Config = {
  /** Command every session starts with, before the arguments the host adds. */
  argv: string[]
  /** Added to every session's environment after the parent-session scrub. */
  env: Record<string, string>
  projects: Record<string, Project>
  /** Collections every project has. */
  collections?: Record<string, CollectionType>
  worktrees?: WorktreesConfig
  hiring?: HiringConfig
  brief?: BriefConfig
  retention?: RetentionConfig
  user?: UserConfig
  editor?: EditorConfig

  /** The names worker callsigns are drawn from, the same on every floor; `CALLSIGNS` when left out. */
  callsigns?: string[]
  /** The loopback port the tower serves on, 4317 when left out (`towerPort`). */
  port?: number
  /**
   * Absolute plugin directories every session loads, each passed to Claude as `--plugin-dir`: Claude reads a path as
   * written: no `~` expanded, a relative path against the session's cwd.
   */
  plugins?: string[]
  /** Renderers served at `/r/<name>/`, beside the core's (`page`, `tower3d`): a new name adds one, a built-in's name overrides its fields. */
  renderers?: Record<string, RendererConfig>
  /** The renderer `/` opens, `page` unless set. */
  renderer?: string
  /** Chords that replace the keymap's defaults, by command id (`src/shared/keymap.ts`); null unbinds a command. */
  keys?: Record<string, string | string[] | null>
}

/** Every key of `T`, from a list the typecheck holds to it: a key of `T` missing from the list, or one `T` lacks, fails it. */
const keysOf =
  <T>() =>
  <const K extends readonly (keyof T)[]>(keys: K & ([Exclude<keyof T, K[number]>] extends [never] ? unknown : { missing: Exclude<keyof T, K[number]> })): readonly string[] =>
    keys as readonly string[]

/** The keys the tower reads at the config's top level. */
export const CONFIG_KEYS = keysOf<Config>()(['argv', 'env', 'projects', 'collections', 'worktrees', 'hiring', 'brief', 'retention', 'user', 'editor', 'callsigns', 'plugins', 'renderers', 'renderer', 'port', 'keys'])

/** The keys the tower reads in a project. */
export const PROJECT_KEYS = keysOf<Project>()(['name', 'hub', 'repos', 'color', 'shelf', 'collections', 'worktrees', 'hiring', 'brief', 'plugins'])

/**
 * A renderer: `root`, the absolute directory of its built files, all served below `/r/<name>/`; `entry`, its page in
 * it (`index.html` unless set); `settings`, its own configuration, which the core passes through unread.
 */
export type RendererConfig = { root?: string; entry?: string; settings?: Record<string, unknown> }

/** A renderer as the tower serves it: `available` while its entry exists, which for a built renderer means it was built. */
export type Renderer = { name: string; root: string; entry: string; available: boolean; settings: Record<string, unknown> }

/** A project's collections: every project's, then its own. A collection declared in both is a config error. */
export const projectCollections = (config: Config, projectId: string): Record<string, CollectionType> => {
  const own = config.projects[projectId].collections ?? {}
  const clash = Object.keys(own).find((id) => config.collections?.[id])
  if (clash) throw new ConfigError(`projects.${projectId}.collections.${clash} in the config: "${clash}" is declared under collections for every project already: drop one of them`)
  return { ...config.collections, ...own }
}

/** The plugin directories a project's sessions load: every session's, then its own. */
export const projectPlugins = (config: Config, projectId: string): string[] => [...(config.plugins ?? []), ...(config.projects[projectId].plugins ?? [])]

/** First line of a session log: everything known about the session when it started. */
export type SessionHeader = {
  id: string
  project: string
  cwd: string
  argv: string[]
  startedAt: number
  cols: number
  rows: number
}

/** What Claude Code writes to a hook command's stdin. */
export type ClaudeHookInput = {
  hook_event_name: string
  session_id: string
  transcript_path: string
  cwd: string
  [field: string]: unknown
}

/** What the tower mod (`src/mod`) posts: the input of one of Claude's mod events, or a `tower.*` event the mod derives. */
export type ModEvent = {
  hook_event_name: string
  [field: string]: unknown
}

/** `t` is seconds since the session's `startedAt`. */
export type LogEvent =
  | [t: number, code: 'o', output: string]
  | [t: number, code: 'i', input: string]
  | [t: number, code: 'r', size: `${number}x${number}`]
  | [t: number, code: 'h', hook: ClaudeHookInput | ModEvent]
  /** `hostStopped`: the session ended because the host stopped, not by its own or a user's doing. */
  | [t: number, code: 'x', exit: { exitCode: number; hostStopped?: true }]

export type SessionLog = { header: SessionHeader; events: LogEvent[] }
