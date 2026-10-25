import { sessionDirs, worktreeName, worktreePath, type ModEvent, type Project, type Runtime } from './model.ts'
import type { ToHost } from './protocol.ts'

/** What a new session is asked for. Whatever is left out is Claude's own default. */
export type Launch = { model?: string; effort?: string; prompt?: string }

/** Sessions are headless until someone watches them; a viewer resizes to its own terminal. */
const SPAWN_SIZE = { cols: 120, rows: 40 }

/**
 * Every session is told, in its system prompt, what every worker does on every turn: who it is, how to reach a peer,
 * showing what it made, stopping what it started, keeping ideas for later. Workers follow these recipes whether or not
 * they load the tower:handbook skill, which holds the rest. `user`: the name the config gives the person running the tower, said
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
    '- Showing what you made: the user watches you from the tower and sees only what you show. Every file or page you ' +
      'make for the user (a report, a plan, a picture, an html page) gets `tower show <file>`, which puts it beside ' +
      'you: naming its path in your answer does not. Keep it where it lasts (the project, or a notes folder the ' +
      "user's instructions name), not a temporary folder, unless it is truly throwaway. Show it again after you " +
      'change it. Make pages as local html files; publish a claude.ai artifact only when the user asks for one.',
    "- Stopping what you started: other workers' command lines carry their briefs and paths, so `pkill -f` or " +
      '`killall` with a pattern can end them. Save the PID of anything you start (`… & echo $! > server.pid`) and ' +
      'stop it with `kill <pid>`.',
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

/** The tower's brief, its worktree line, then what launch contributors add to the session's instructions. */
const briefArgs = (user: string | undefined, worktree: WorktreeBrief | undefined, added: string[]) => [
  '--append-system-prompt',
  [towerBrief(user), ...(worktree ? [worktreeLine(worktree)] : []), ...added].join('\n\n'),
]

/** A prompt and what contributors add after it, as one: none when both are empty. */
const promptOf = (prompt: string | undefined, added: string[]): string | undefined => [prompt, ...added].filter(Boolean).join('\n\n') || undefined

/** The prompt is Claude's positional argument: after `--`, a prompt starting with `-` is not read as a flag. */
const launchArgs = ({ model, effort, prompt }: Launch): string[] => [
  ...(model ? ['--model', model] : []),
  ...(effort ? ['--effort', effort] : []),
  ...(prompt ? ['--', prompt] : []),
]

/** The prompt a session was started with, read back from its argv. */
export const launchPrompt = (argv: string[]): string | undefined => (argv.at(-2) === '--' ? argv.at(-1) : undefined)

/**
 * The model and effort a session's launch asked for, read back from its argv: `launchArgs` puts them last, before the
 * prompt. The config's `argv` comes first, so its flags are never read as the launch's. A resume asks for neither.
 */
export const launchFlags = (argv: string[]): Pick<Launch, 'model' | 'effort'> => {
  const flags = launchPrompt(argv) === undefined ? argv : argv.slice(0, -2)
  const effort = flags.at(-2) === '--effort' ? flags.at(-1) : undefined
  const rest = effort === undefined ? flags : flags.slice(0, -2)
  return { model: rest.at(-2) === '--model' ? rest.at(-1) : undefined, effort }
}

/** What a worker the host cut off mid-turn is told as it resumes (a card's `carry-on`). */
export const CARRY_ON = 'You were cut off mid-turn: your session stopped before your turn ended. Carry on where you left off.'

/** `conversation` is Claude's session id. Claude files conversations by directory: resume in the same cwd. */
const resumeArgs = (conversation: string, prompt: string | undefined): string[] => ['--resume', conversation, ...(prompt ? ['--', prompt] : [])]

/** Sortable by start time, readable in a directory listing: `20260930-141203-a1b2`. */
export const sessionId = (startedAt: Date, suffix: string): string =>
  `${startedAt.toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-')}-${suffix}`

export const newSessionId = (): string =>
  sessionId(new Date(), [...crypto.getRandomValues(new Uint8Array(2))].map((b) => b.toString(16).padStart(2, '0')).join(''))

/** Claude's session name, the one its peers message it by: the worker's callsign. */
const nameArgs = (name: string) => ['--name', name]

/**
 * Claude reads one `--settings`, the last it is given. `env`: what launch contributors set in the session's environment,
 * which Claude applies to itself and every command it runs. `dirs` are the session's directories, its own first
 * (`sessionDirs`): the others are granted file access only, so their CLAUDE.md and `.claude/` skills, commands and agents
 * stay out of the session, and a skill copied into several repos shows up once. Claude's fullscreen TUI keeps the
 * conversation on the alternate screen and reads the mouse, so a viewer's wheel scrolls Claude's transcript.
 */
const settingsArgs = ([, ...others]: string[], env: Record<string, string>) => [
  '--settings',
  JSON.stringify({ permissions: { additionalDirectories: others }, tui: 'fullscreen', ...(Object.keys(env).length && { env }) }),
]

/** A worker edits the items its floor keeps, outside its own directories. The directory holds no `.claude/`. */
const keptArgs = (kept: string) => ['--add-dir', kept]

/** A worktree's links lead into the main checkouts: writing through one asks no permission when its source is a directory of the session. */
const linkArgs = (worktree: WorktreeBrief | undefined) => (worktree?.links ?? []).flatMap((source) => ['--add-dir', source])

/** The plugins the config names for the session's project (`projectPlugins`) and the extensions on its floor, loaded beside the tower mod the host passes. */
const pluginArgs = (plugins: string[]) => plugins.flatMap((dir) => ['--plugin-dir', dir])

/**
 * What launch contributors add to a session, merged in fold order, as the runtime places it: text after the tower's
 * brief, prompts after the first one, environment variables, and flags placed before every flag the core composes.
 */
export type Contributed = { systemPrompt: string[]; prompt: string[]; env: Record<string, string>; args: string[] }

export const NOTHING_CONTRIBUTED: Contributed = { systemPrompt: [], prompt: [], env: {}, args: [] }

/**
 * A session the host starts. `name`: the worker's callsign (`callsignsOf`), or a fork's own (`resumeName`). `dirs`: the
 * session's directories (`sessionDirs`). `user`: the config's `user.name`. `worktree`: the brief of the worktree `cwd`
 * is, `undefined` in a main checkout (`worktreeBrief`). `kept`: the project's collections directory
 * (`projectCollectionsPath`). `plugins`: the plugin directories for the project (`projectPlugins`, and the extensions'
 * on its floor). `facts`: `tower.*` facts the host logs before the session's first event.
 */
type Start = {
  runtime: Runtime
  id: string
  name: string
  project: string
  cwd: string
  dirs: string[]
  user: string | undefined
  worktree: WorktreeBrief | undefined
  kept: string
  plugins: string[]
  contributed: Contributed
  facts: ModEvent[]
}

/** A new worker, on what its spawn asked for. */
export type SpawnLaunch = Start & { kind: 'spawn'; launch: Launch }

/**
 * A resume continues a session's conversation in the directory it ran in, under the same project: as the same worker,
 * or a new one on a fork (`resumeName`). `prompt`: Claude's first prompt in it, as a spawn's.
 */
export type ResumeLaunch = Start & { kind: 'resume' | 'fork'; conversation: string; prompt: string | undefined }

const startArgs = (s: Start): string[] => [
  ...s.contributed.args,
  ...nameArgs(s.name),
  ...settingsArgs(s.dirs, s.contributed.env),
  ...keptArgs(s.kept),
  ...linkArgs(s.worktree),
  ...pluginArgs(s.plugins),
  ...briefArgs(s.user, s.worktree, s.contributed.systemPrompt),
]

type HostSpawn = Extract<ToHost, { t: 'spawn' }>

const hostSpawn = (s: Start, args: string[]): HostSpawn => ({
  t: 'spawn',
  id: s.id,
  project: s.project,
  cwd: s.cwd,
  args,
  ...(s.facts.length && { facts: s.facts }),
  ...SPAWN_SIZE,
})

export const spawnRequest = (s: SpawnLaunch): HostSpawn =>
  hostSpawn(s, [...startArgs(s), ...launchArgs({ ...s.launch, prompt: promptOf(s.launch.prompt, s.contributed.prompt) })])

export const resumeRequest = (s: ResumeLaunch): HostSpawn => hostSpawn(s, [...startArgs(s), ...resumeArgs(s.conversation, s.prompt)])

/** A flag's name: `--model` of `--model` and of `--model=opus`. */
export const flagName = (arg: string): string => arg.split('=')[0]

/** A launch with every part the core composes, so the flags it passes can be read from it. */
const EVERY_PART: Start = {
  runtime: 'claude', id: 'id', name: 'name', project: 'project', cwd: 'cwd', dirs: ['dir', 'other'], user: 'user', kept: 'kept',
  worktree: { name: 'name', branch: 'branch', dirs: ['dir'], mains: ['main'], links: ['link'] }, plugins: ['plugin'], contributed: NOTHING_CONTRIBUTED, facts: [],
}

/**
 * The flags the core composes, by runtime, read from what it composes: a contributor may pass none of them. `--` ends
 * the flags before a prompt. The host's own `--plugin-dir` is one of them.
 */
export const CORE_FLAGS: Record<Runtime, string[]> = {
  claude: [
    ...new Set(
      [
        ...spawnRequest({ ...EVERY_PART, kind: 'spawn', launch: { model: 'model', effort: 'effort', prompt: 'prompt' } }).args,
        ...resumeRequest({ ...EVERY_PART, kind: 'resume', conversation: 'conversation', prompt: 'prompt' }).args,
      ].flatMap((arg) => (arg.startsWith('-') ? [flagName(arg)] : [])),
    ),
  ],
}
