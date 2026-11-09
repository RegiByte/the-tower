import { sessionDirs, worktreeName, worktreePath, type ModEvent, type Project, type Runtime, type SessionCommand } from './model.ts'
import type { OldHostSpawn, ToHost } from './protocol.ts'

/** What a new session is asked for. Whatever is left out is Claude's own default. */
export type Launch = { model?: string; effort?: string; prompt?: string; command?: string }

/** Sessions are headless until someone watches them; a viewer resizes to its own terminal. */
const SPAWN_SIZE = { cols: 120, rows: 40 }

/**
 * Every session is told, in its system prompt, what every worker does on every turn: who it is, how to reach a peer,
 * showing what it made, stopping what it started, editing a kept item in place. Workers follow these recipes whether or not
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
    '- Kept items: to change one, edit its file in place (`tower kept` gives the path): never keep a second copy.',
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

/**
 * A gone worktree a resume brought back before it started, under its old name (`restoreOf`): how, and each repo's
 * worktree as it came back, checked out from `from` (its branch, or for `fresh` the base it was cut from) at `commit`.
 */
export type Restored = { name: string; how: 'lost' | 'kept' | 'fresh'; repos: { dir: string; from: string; commit: string }[] }

const placesOf = ({ repos }: Restored) =>
  repos.map(({ dir, from, commit }) => `\`${from}\` at \`${commit.slice(0, 7)}\`${repos.length > 1 ? ` in \`${dir}\`` : ''}`).join(', ')

/** What a resumed worker is told of its worktree's restore, so it doesn't look for a branch or commits that are gone. */
const restoredNote = (r: Restored): string =>
  r.how === 'fresh'
    ? `Your worktree \`${r.name}\` was removed after you went home, with its branch, which the tower deletes only once its work has landed. ` +
      `It was recut on a new branch from ${placesOf(r)}: your earlier work is there, not on your old branch or at its commits.`
    : r.how === 'kept'
      ? `Your worktree \`${r.name}\` was removed after you went home, its branch kept: it was checked out again from ${placesOf(r)}.`
      : `Your worktree \`${r.name}\`'s folders were deleted: they were checked out again from ${placesOf(r)}, without whatever was uncommitted in them.`

/** What a worker told only of its restore does with the turn the telling spends. */
const RESTORED_WAIT = "Make no changes now: answer briefly that you've read this, then wait for the next message."

/**
 * The prompt of a resume that restored the worker's worktree (`Restored`): the note, then the resume's own prompt in the
 * same message (a user's, a hirer's, or `CARRY_ON`), or, with none, the note alone, asking the worker to wait. A resume
 * keeps the system prompt its conversation started with, so the note can only reach Claude as a prompt.
 */
export const restoredPrompt = (r: Restored, prompt: string | undefined): string => `${restoredNote(r)}\n\n${prompt || RESTORED_WAIT}`

/**
 * The tower's brief, its worktree line, then what launch contributors add to the session's instructions. Claude reads
 * them when a conversation starts: `--resume` keeps the conversation's own and ignores new ones.
 */
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

/**
 * What a session's launch asked for, read back from its header's argv: the parts the composer places last, after the
 * config's `argv` (whichever command it names) and the flags placed before them. `name`: the worker's callsign
 * (`nameArgs`). `resume`: the conversation a resume continues (`resumeArgs`). `model` and `effort`: what a spawn asked
 * for (`launchArgs`), never what the config passes every session; a resume asks for neither. `prompt`: Claude's first
 * prompt, after `--`.
 */
export type LaunchRead = { name?: string; resume?: string; model?: string; effort?: string; prompt?: string }

/** The value after the last `flag` among `flags`: the composer's, as the config's `argv` comes first and no contributor passes a flag the core composes. */
const lastValue = (flags: string[], flag: string): string | undefined => {
  const at = flags.lastIndexOf(flag)
  return at === -1 ? undefined : flags[at + 1]
}

export const launchOf = (argv: string[]): LaunchRead => {
  const prompt = argv.at(-2) === '--' ? argv.at(-1) : undefined
  const flags = prompt === undefined ? argv : argv.slice(0, -2)
  const effort = flags.at(-2) === '--effort' ? flags.at(-1) : undefined
  const rest = effort === undefined ? flags : flags.slice(0, -2)
  const model = rest.at(-2) === '--model' ? rest.at(-1) : undefined
  return { name: lastValue(flags, '--name'), resume: lastValue(flags, '--resume'), model, effort, prompt }
}

/** What a worker the host cut off mid-turn is told as it resumes (a card's `carry-on`). */
export const CARRY_ON = 'You were cut off mid-turn: your session stopped before your turn ended. Carry on where you left off.'

/** `conversation` is Claude's session id. Claude files conversations by directory: resume in the same cwd. */
const resumeArgs = (conversation: string, prompt: string | undefined): string[] => ['--resume', conversation, ...(prompt ? ['--', prompt] : [])]

/** Sortable by start time, readable in a directory listing: `20260930-141203-a1b2`. */
export const sessionId = (startedAt: Date, suffix: string): string =>
  `${startedAt.toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-')}-${suffix}`

/** The second a `sessionId` was made in (epoch ms); 0 for an id of another shape. */
export const startOfSessionId = (id: string): number => Date.parse(id.replace(/^(\d{4})(\d\d)(\d\d)-(\d\d)(\d\d)(\d\d)-.*$/, '$1-$2-$3T$4:$5:$6Z')) || 0

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
export type ResumeLaunch = Start & { kind: 'resume' | 'fork'; conversation: string; prompt: string | undefined; command?: string }

const startArgs = (s: Start): string[] => [
  ...s.contributed.args,
  ...nameArgs(s.name),
  ...settingsArgs(s.dirs, s.contributed.env),
  ...keptArgs(s.kept),
  ...linkArgs(s.worktree),
  ...pluginArgs(s.plugins),
  ...briefArgs(s.user, s.worktree, s.contributed.systemPrompt),
]

/**
 * A session composed for the host, before it is said in the shape the running host takes (`hostSpawn`,
 * `oldHostSpawn`). `args` are Claude's own, after the command and the mod; `command` names one of the config's `argv`.
 */
export type HostStart = { id: string; project: string; cwd: string; runtime: Runtime; args: string[]; command?: string; facts: ModEvent[] }

const hostStart = (s: Start, args: string[], command: string | undefined): HostStart => ({
  id: s.id,
  project: s.project,
  cwd: s.cwd,
  runtime: s.runtime,
  args,
  ...(command !== undefined && { command }),
  facts: s.facts,
})

export const spawnRequest = (s: SpawnLaunch): HostStart =>
  hostStart(s, [...startArgs(s), ...launchArgs({ ...s.launch, prompt: promptOf(s.launch.prompt, s.contributed.prompt) })], s.launch.command)

export const resumeRequest = (s: ResumeLaunch): HostStart => hostStart(s, [...startArgs(s), ...resumeArgs(s.conversation, s.prompt)], s.command)

/**
 * `start` as a whole command line: `command`'s argv, the tower mod (`modDir`), which posts Claude's events to the host
 * and is read by each Claude as it starts, then its own args, which can end with `-- <prompt>`. The header names the
 * command by the name it resolved to.
 */
export const hostSpawn = ({ id, project, cwd, runtime, args, facts }: HostStart, command: SessionCommand, modDir: string): Extract<ToHost, { t: 'spawn' }> => ({
  t: 'spawn',
  id,
  project,
  cwd,
  runtime,
  argv: [...command.argv, '--plugin-dir', modDir, ...args],
  env: command.env,
  ...(command.name !== undefined && { command: command.name }),
  ...(facts.length && { facts }),
  ...SPAWN_SIZE,
})

/** `start` as a host older than protocol 5 takes it: that host adds the command and the mod, and resolves `command` itself. */
export const oldHostSpawn = ({ id, project, cwd, args, command, facts }: HostStart): OldHostSpawn => ({
  t: 'spawn',
  id,
  project,
  cwd,
  args,
  ...(command !== undefined && { command }),
  ...(facts.length && { facts }),
  ...SPAWN_SIZE,
})

/** A flag's name: `--model` of `--model` and of `--model=opus`. */
export const flagName = (arg: string): string => arg.split('=')[0]

/** A launch with every part the core composes, so the flags it passes can be read from it. */
export const EVERY_PART: Start = {
  runtime: 'claude', id: 'id', name: 'name', project: 'project', cwd: 'cwd', dirs: ['dir', 'other'], user: 'user', kept: 'kept',
  worktree: { name: 'name', branch: 'branch', dirs: ['dir'], mains: ['main'], links: ['link'] }, plugins: ['plugin'], contributed: NOTHING_CONTRIBUTED, facts: [],
}

/**
 * The flags the core composes, by runtime, read from what it composes: a contributor may pass none of them. `--` ends
 * the flags before a prompt. `--plugin-dir`, which also loads the tower mod (`hostSpawn`), is one of them.
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
