/**
 * The verbs of the `tower` command, as data: what each takes and does, and whose it is. The user's are read from the
 * system root and sent to the daemons (`src/cli.ts`); the workers' are read from the running tower
 * (`src/directory.ts`). Each runs them by name, and `tower --help` and `tower <verb> --help` print them from here.
 */

export type CliVerb = {
  /** `user`: the user's, run from the system root; `worker`: a worker's, run against the running tower. */
  of: 'user' | 'worker'
  /** What it takes, after `tower `. */
  usage: string
  help: string
}

export const CLI_VERBS = {
  init: { of: 'user', usage: 'init [hub] [repos...]', help: 'write a first config: one project, its hub here or at [hub], beside [repos]' },
  doctor: { of: 'user', usage: 'doctor [--all]', help: "check what the tower needs, with a fix for each failure; exits 1 on any. --all adds the extensions' warnings" },
  config: { of: 'user', usage: 'config check', help: 'check the config as the tower reads it, each problem at its key; exits 1 on any' },
  up: {
    of: 'user',
    usage: 'up [host|terms|jobs|tower...]',
    help: 'start the host, the terms daemon, the jobs daemon and the tower in the background, each unless already running; only the ones named, when named. Says when any runs from another checkout',
  },
  down: {
    of: 'user',
    usage: 'down [host|terms|jobs|tower...|--force]',
    help: "stop what tower up started (the host's end ends every session, terms' every shell, jobs' every running job); only the ones named, when named: `tower down tower && tower up tower` restarts the tower alone. With no names, while a session is mid-turn, it names who would be cut off and stops nothing unless given --force. One it refuses (started by hand) is reported, the rest still stopped, and it exits 1",
  },
  update: {
    of: 'user',
    usage: 'update',
    help: 'move this checkout to the newest release (a tag vX.Y.Z), refused while the tower or the jobs daemon runs from another checkout: show its CHANGELOG entries, check it out, install, rebuild Tower 3D if built, restart the tower if running; say when the host needs a restart, never restart it',
  },
  spawn: {
    of: 'user',
    usage: 'spawn <project> [--cwd <dir>] [--callsign <C>] [--model <m>] [--effort <e>] [-- <prompt...>]',
    help: "start a session through the tower (in the project's hub by default), print its id; --callsign names its worker (NAME-NN, or NAME given the id's number), refused when the name is a running worker's",
  },
  resume: {
    of: 'user',
    usage: 'resume <id> [--carry-on]',
    help: "start a session that continues <id>'s conversation, print its id; through the tower's resume queue. --carry-on tells Claude it was cut off mid-turn by the host and to carry on (a card's `carry-on`)",
  },
  submit: { of: 'user', usage: 'submit <id> <text...>', help: "type a prompt and submit it, through the tower; refused while it asks you something or waits on a screen. A worker's prompt (TOWER_SESSION_ID) is named in its log first" },
  kill: { of: 'user', usage: 'kill <id|CALLSIGN>', help: "end a session, by its id or its worker's callsign; a worker's kill (TOWER_SESSION_ID) is named in its log first" },
  live: { of: 'user', usage: 'live', help: 'ids of running sessions' },
  ls: { of: 'user', usage: 'ls', help: 'every session, with project, status and what it left running' },
  ps: { of: 'user', usage: 'ps', help: 'every process a session left running, with the ports it listens on' },
  reap: { of: 'user', usage: 'reap [id]', help: 'end what <id> left running, or what every session of this root no longer live left running' },
  screen: { of: 'user', usage: 'screen <id> [seconds]', help: "the session's screen, now or at a moment, rebuilt from its log" },
  attach: { of: 'user', usage: 'attach <id>', help: 'sit at the session: its live screen, your keyboard. Ctrl-] detaches' },
  app: {
    of: 'user',
    usage: 'app',
    help: 'open the tower as a Mac app, built from this checkout on first use or when its source changed (`src/app.ts`); the browser stays the default',
  },
  types: {
    of: 'user',
    usage: 'types <dir>',
    help: "write the library's declarations and a tsconfig to extend to <dir>/.tower/, so an extension outside the checkout typechecks; run it again to refresh them",
  },
  whoami: {
    of: 'worker',
    usage: 'whoami',
    help: "this session: callsign, peer name, floor and its dirs, its worktree and branch if it has one, the floor's shelf and collections, and the config's path",
  },
  agents: { of: 'worker', usage: 'agents [--all]', help: "the workers on duty on this session's floor, each under the one it reports to; --all, on every floor" },
  agent: { of: 'worker', usage: 'agent <CALLSIGN> [conversation]', help: 'one worker: its last prompts and answers in full, per conversation, saying when earlier turns are left out; with [conversation], every turn of that one, oldest first' },
  extensions: {
    of: 'worker',
    usage: 'extensions [restart <id> | check <dir> | freeze <dir>]',
    help: "every extension the tower found, bundled first: its state, the floors it is off on, its slots and each problem at its path; `restart` reads an extension's folder again and restarts it, with what depends on it; `check` reads a folder as the tower would, resolves it against the running tower and starts it in a throwaway process; `freeze` writes its contract.json",
  },
  show: { of: 'worker', usage: 'show <file|url> [title]', help: 'put a file this session wrote, or a web page, in front of the user beside this session' },
  open: { of: 'worker', usage: 'open <url> [title]', help: "ask the user to open a page in a browser tab (one that can't be shown in place)" },
  reveal: { of: 'worker', usage: 'reveal <path>', help: 'show a file or folder to the user selected in a Finder window' },
  edit: { of: 'worker', usage: 'edit <path> [line]', help: "open a file or folder in the user's editor, a file at `line` if given" },
  keep: {
    of: 'worker',
    usage: 'keep [<collection> [file] [name <words>]]',
    help: "a new item in one of the floor's collections, from a file or stdin (markdown), its id named by [name] or the file's base name or the markdown's title; no collection named, the floor's collections",
  },
  kept: {
    of: 'worker',
    usage: 'kept [collection]',
    help: "the floor's collections with their item counts and latest items, or every item of one: tag, title, age, size, keeper and file",
  },
  read: { of: 'worker', usage: 'read <tag|id>', help: "one item of the floor's collections, in full" },
  job: {
    of: 'worker',
    usage: 'job start [--cwd <dir>] [--label <words>] [--env NAME=VALUE...] -- <command...> | job cancel <id> | job list [--all]',
    help: "a command run to its end by the jobs daemon, outside the tower and owned by this session: it outlives a tower restart and takes no input, so pass what stops a prompt with --env (GIT_TERMINAL_PROMPT=0); env is never logged. Its command is kept in the jobs log, which everyone reads: never put a secret in it. Watch it at /job/<id>/screen. list: the jobs running or over within the last day, newest first; --all, every job the log holds",
  },
  hire: {
    of: 'worker',
    usage: 'hire [<tag|id>] [floor <id>] [model <m>] [effort <e>] [callsign <C>] [name <n>] [base origin/<b>]',
    help: "start a worker on this floor, or the floor named, on a prompt: the text of an item of this floor's collections, or stdin; refused past the hiring floor's `hiring` limits. `callsign` names the worker, `name` its new worktree",
  },
  home: {
    of: 'worker',
    usage: 'home <CALLSIGN>',
    help: "send a worker home with everyone under it: each that runs is killed, the deepest first (its card's `send-home`); naming this session's own callsign, it goes home once its turn ends (`tower.leave`)",
  },
  'let-go': {
    of: 'worker',
    usage: 'let-go <CALLSIGN>',
    help: "take a stranded worker (stopped, killed or lost) off duty, still resumable (its card's `let-go`)",
  },
  api: { of: 'worker', usage: 'api [name]', help: "the API's verbs and reads, one line each, or one in full as JSON Schema" },
  flows: {
    of: 'worker',
    usage: 'flows [verb] [--floor <project>]',
    help: "where extensions take part in each core verb: one line each, or one verb's every stage, open, wrapped or sealed, with who takes part (on --floor, those on there)",
  },
  x: {
    of: 'worker',
    usage: 'x [<capability> [<word> [--<flag> <value> …] [<<EOF]]]',
    help: "alone, the running extensions, each with its brief; with a capability, what it tells the workers, its words with their usage, then its doors, verbs and reads; with a word, runs it: flags from its input (--help lists them), text on stdin where it takes one, its reply printed. A word is a verb by its name, or what a read declares; a door is `facts/<fact>`, a read is reached by its path too",
  },
} satisfies Record<string, CliVerb>

export type VerbName = keyof typeof CLI_VERBS

/**
 * An old core word kept until 2.0: `now`, the word it is under `tower x`, and `args`, its arguments rewritten into that
 * word's. Each alias says it is one on stderr, once per call.
 */
export type Alias = { now: string; args: (words: string[]) => string[] }

const NOTE_NUMBER = /^n?\d+$/

/** `tower note`'s old grammar as reviews' words: `on <checkout>`, `re n<k>`, `resolve n<k> …` and anchors, in any order. */
const noteWords = (words: string[]): string[] => {
  const flags: string[] = []
  const resolves: string[] = []
  let resolving = false
  for (let i = 0; i < words.length; i++) {
    if (words[i] === '--help' || words[i] === '-h') return ['note', '--help']
    if (words[i] === 'on' && words[i + 1]) flags.push('--on', words[++i])
    else if (words[i] === 're' && NOTE_NUMBER.test(words[i + 1] ?? '')) flags.push('--re', words[++i])
    else if (words[i] === 'resolve') {
      resolving = true
      while (NOTE_NUMBER.test(words[i + 1] ?? '')) resolves.push(words[++i])
    } else flags.push('--at', words[i])
  }
  return resolving ? ['resolve', ...resolves, ...flags] : ['note', ...flags]
}

/** The old core words that moved under `tower x`. */
export const ALIASES: Record<string, Alias> = {
  policies: { now: 'policies', args: ([sub, ...rest]) => (sub === undefined ? ['list'] : sub === 'run' ? ['run-now', ...rest] : sub === 'approve' ? ['approve-now', ...rest] : [sub, ...rest]) },
  runs: { now: 'policies runs', args: (words) => words },
  probes: { now: 'quota', args: (words) => (words[0] === 'run' ? ['read-now', ...words.slice(2)] : ['probes', ...words]) },
  note: { now: 'reviews', args: noteWords },
  thread: { now: 'reviews thread', args: (words) => words },
  send: { now: 'reviews send', args: (words) => words },
  review: { now: 'reviews review', args: (words) => words.map((w) => (w === 'tell' ? '--tell' : w)) },
}

/** The words an alias stands for, after `tower x`, and what it says about itself: the command as typed and as it runs, so the line can be typed. */
export const aliased = (alias: Alias, name: string, words: string[]): { args: string[]; line: string } => {
  const args = [...alias.now.split(' '), ...alias.args(words)]
  return { args, line: `${['tower', name, ...words].join(' ')} is ${['tower x', ...args].join(' ')}; the old word goes at 2.0` }
}

/** The verbs that are `of`'s: each dispatcher's handlers are keyed by them. */
export type VerbOf<Of extends CliVerb['of']> = { [K in VerbName]: (typeof CLI_VERBS)[K]['of'] extends Of ? K : never }[VerbName]

/** A verb's handler, given the words after the verb. */
export type Run = (args: string[]) => Promise<void>

export const verbNamed = (name: string): VerbName | undefined => (Object.hasOwn(CLI_VERBS, name) ? (name as VerbName) : undefined)

export const usageLine = (name: VerbName): string => `Usage: tower ${CLI_VERBS[name].usage}`

const OF_TITLE: Record<CliVerb['of'], string> = {
  user: "The user's verbs, read from the system root and sent to the daemons:",
  worker: "A worker's verbs, read from the running tower (the tower:handbook skill says what each is for):",
}

const namesOf = (of: CliVerb['of']): VerbName[] => (Object.keys(CLI_VERBS) as VerbName[]).filter((name) => CLI_VERBS[name].of === of)

/** `tower --help`: every verb, the user's then the workers', each with what it takes and does. */
export const helpLines = (): string[] => [
  'Usage: tower <verb> [args...]; `tower <verb> --help` prints what one takes.',
  ...(['user', 'worker'] as const).flatMap((of) => ['', OF_TITLE[of], ...namesOf(of).flatMap((name) => [`  tower ${CLI_VERBS[name].usage}`, `      ${CLI_VERBS[name].help}`])]),
]

/** An unknown verb's message: every verb by name, the user's then the workers'. */
export const unknownLine = (name: string): string => `Unknown command "${name}". The user's: ${namesOf('user').join(', ')}. A worker's: ${namesOf('worker').join(', ')}`
