import { sessionDirs, worktreeName, worktreePath, type Project, type SessionHeader } from './model.ts'
import type { ToHost } from './protocol.ts'

/** What a new session is asked for. Whatever is left out is Claude's own default. */
export type Launch = { model?: string; effort?: string; prompt?: string }

/** Sessions are headless until someone watches them; a viewer resizes to its own terminal. */
const SPAWN_SIZE = { cols: 120, rows: 40 }

/**
 * Every session is told, in its system prompt, what every worker does on every turn: who it is, how to reach a peer,
 * showing what it made, keeping ideas for later. Workers follow these recipes whether or not they load the
 * tower:handbook skill, which holds the rest. `user`: the name the config gives the person running the tower, said
 * once so a worker knows them by it on review notes and when they name themselves.
 */
const towerBrief = (user: string | undefined) =>
  [
    `You are a worker in the tower, the HQ where the user${user ? ` (${user})` : ''} runs their Claude Code sessions, ` +
      'and the `tower` command on your PATH is how you work with it.',
    '- Who you are: run `tower whoami` once as you start: your callsign (like HOLMES-42), your floor, your ' +
      'directories, who hired you, if anyone, and the address of the tower\'s page and API.',
    '- Reaching another worker: a callsign is not a SendMessage name. Run `tower agents` (`--all` for every floor) ' +
      'and send to the worker\'s **message as** name. The other worker has none of your context: sign with your ' +
      'callsign, and name the commits and paths involved.',
    '- Showing what you made: the user watches you from the tower. Every file or page you write for the user to read ' +
      '(a report, a plan, an html page) gets `tower show <file>`, which puts it beside you; show it again after you ' +
      'change it. Make pages as local html files; publish a claude.ai artifact only when the user asks for one.',
    "- Keeping for later: an idea off the current goal, or a prompt the user wants for a later session, goes in the " +
      "floor's drafts with `tower keep drafts` (markdown on stdin, its first line a title, written to stand on its " +
      'own). Name it to the user by the tag and title it prints, and carry on. To change a kept item, edit its file ' +
      'in place (`tower kept` gives the path): never keep a second copy.',
    '- Everything else is in the tower:handbook skill: review threads and notes, hiring workers and sending them ' +
      "home, crews, the floor's shelf (the pages the user means by \"shelf\"), the tower's config, worktrees and the " +
      "tower's API. Load it when the task touches any of them. Don't create or remove " +
      'git worktrees unless the user asks.',
  ].join('\n')

/**
 * Where a worker in a worktree works, told on every spawn and resume: its directories hold Claude's only file access,
 * but auto and bypass modes skip that guard, and the hub's CLAUDE.md and memory name the main checkouts' paths.
 * `links`: the absolute sources of the worktree's links, which lie outside its directories.
 */
export type WorktreeBrief = { name: string; branch: string | undefined; dirs: string[]; mains: string[]; links: string[] }

/**
 * `branch`: the one checked out in `cwd`, `undefined` on a detached HEAD. `links`: the sources of the links a cut makes
 * (`linkedSources`). `undefined` for a main checkout.
 */
export const worktreeBrief = (project: Project, cwd: string, branch: string | undefined, links: string[]): WorktreeBrief | undefined => {
  const name = worktreeName(project, cwd)
  if (name === undefined) return undefined
  const dirs = sessionDirs(project, cwd)
  const suffix = worktreePath('', name)
  return { name, branch, dirs, mains: dirs.map((dir) => dir.slice(0, -suffix.length)), links }
}

const list = (paths: string[]) => paths.map((p) => `\`${p}\``).join(', ')

const worktreeLine = ({ name, branch, dirs, mains }: WorktreeBrief): string =>
  `You work in worktree \`${name}\`${branch ? ` on branch \`${branch}\`` : ', on a detached HEAD'}. Your directories are ${list(dirs)}. ` +
  `They are your copies of ${list(mains)}. Paths that point to those main checkouts mean your copies: edit only yours, ` +
  'because the main checkouts belong to the user and other workers.'

const briefArgs = (user: string | undefined, worktree: WorktreeBrief | undefined) =>
  ['--append-system-prompt', worktree ? `${towerBrief(user)}\n\n${worktreeLine(worktree)}` : towerBrief(user)]

/** The prompt is Claude's positional argument: after `--`, a prompt starting with `-` is not read as a flag. */
const launchArgs = ({ model, effort, prompt }: Launch, user: string | undefined, worktree: WorktreeBrief | undefined): string[] => [
  ...briefArgs(user, worktree),
  ...(model ? ['--model', model] : []),
  ...(effort ? ['--effort', effort] : []),
  ...(prompt ? ['--', prompt] : []),
]

/** The prompt a session was started with, read back from its argv. */
export const launchPrompt = (argv: string[]): string | undefined => (argv.at(-2) === '--' ? argv.at(-1) : undefined)

/** `conversation` is Claude's session id. Claude files conversations by directory: resume in the same cwd. */
const resumeArgs = (conversation: string, user: string | undefined, worktree: WorktreeBrief | undefined): string[] => [
  ...briefArgs(user, worktree),
  '--resume',
  conversation,
]

/** Sortable by start time, readable in a directory listing: `20260930-141203-a1b2`. */
export const sessionId = (startedAt: Date, suffix: string): string =>
  `${startedAt.toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-')}-${suffix}`

export const newSessionId = (): string =>
  sessionId(new Date(), [...crypto.getRandomValues(new Uint8Array(2))].map((b) => b.toString(16).padStart(2, '0')).join(''))

/** Claude's session name, the one its peers message it by: the worker's callsign. */
const nameArgs = (name: string) => ['--name', name]

/** A worker edits the items its floor keeps, outside its own directories. The directory holds no `.claude/`. */
const keptArgs = (kept: string) => ['--add-dir', kept]

/** A worktree's links lead into the main checkouts: writing through one asks no permission when its source is a directory of the session. */
const linkArgs = (worktree: WorktreeBrief | undefined) => (worktree?.links ?? []).flatMap((source) => ['--add-dir', source])

/** The plugins the config names for the session's project (`projectPlugins`), loaded beside the tower mod the host passes. */
const pluginArgs = (plugins: string[]) => plugins.flatMap((dir) => ['--plugin-dir', dir])

/**
 * `name`: the new worker's callsign (`callsignsOf`). `user`: the config's `user.name`. `worktree`: the brief of the worktree `cwd` is, `undefined` in a main checkout
 * (`worktreeBrief`). `kept`: the project's collections directory (`projectCollectionsPath`). `plugins`: the project's
 * plugin directories (`projectPlugins`).
 */
export const spawnRequest = (id: string, name: string, project: string, cwd: string, launch: Launch, user: string | undefined, worktree: WorktreeBrief | undefined, kept: string, plugins: string[]): ToHost => ({
  t: 'spawn',
  id,
  project,
  cwd,
  args: [...nameArgs(name), ...keptArgs(kept), ...linkArgs(worktree), ...pluginArgs(plugins), ...launchArgs(launch, user, worktree)],
  ...SPAWN_SIZE,
})

/**
 * A resume continues a session's conversation in the directory it ran in, under the same project, as session `id`.
 * `name`: the callsign of the worker it carries on, or its own on a fork (`resumeName`).
 */
export const resumeRequest = ({ project, cwd }: SessionHeader, conversation: string, id: string, name: string, user: string | undefined, worktree: WorktreeBrief | undefined, kept: string, plugins: string[]): ToHost => ({
  t: 'spawn',
  id,
  project,
  cwd,
  args: [...nameArgs(name), ...keptArgs(kept), ...linkArgs(worktree), ...pluginArgs(plugins), ...resumeArgs(conversation, user, worktree)],
  ...SPAWN_SIZE,
})
