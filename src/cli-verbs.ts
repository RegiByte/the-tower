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
  doctor: { of: 'user', usage: 'doctor', help: 'check what the tower needs, with a fix for each failure; exits 1 on any' },
  config: { of: 'user', usage: 'config check', help: 'check the config as the tower reads it, each problem at its key; exits 1 on any' },
  up: {
    of: 'user',
    usage: 'up [host|terms|tower...]',
    help: 'start the host, the terms daemon and the tower in the background, each unless already running; only the ones named, when named',
  },
  down: {
    of: 'user',
    usage: 'down [host|terms|tower...]',
    help: "stop what tower up started (the host's end ends every session, terms' every shell); only the ones named, when named: `tower down tower && tower up tower` restarts the tower alone. One it refuses (started by hand) is reported, the rest still stopped, and it exits 1",
  },
  update: {
    of: 'user',
    usage: 'update',
    help: 'move this checkout to the newest release (a tag vX.Y.Z): show its CHANGELOG entries, check it out, install, rebuild Tower 3D if built, restart the tower if running; say when the host needs a restart, never restart it',
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
  submit: { of: 'user', usage: 'submit <id> <text...>', help: "type a prompt and submit it; a worker's prompt (TOWER_SESSION_ID) is named in its log first" },
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
  whoami: {
    of: 'worker',
    usage: 'whoami',
    help: "this session: callsign, peer name, floor and its dirs, its worktree and branch if it has one, the floor's shelf and collections, and the config's path",
  },
  agents: { of: 'worker', usage: 'agents [--all]', help: "the workers on duty on this session's floor, each under the one it reports to; --all, on every floor" },
  agent: { of: 'worker', usage: 'agent <CALLSIGN>', help: 'one worker: its latest prompt and answer in full, per conversation' },
  probes: {
    of: 'worker',
    usage: 'probes [run <name>]',
    help: 'each probe the tower runs: its state, last read, why it failed and when it reads next; `run` reads one now (refused while off, while a read is in flight or within a minute of the last)',
  },
  policies: {
    of: 'worker',
    usage: 'policies [approve|run <tag|id>]',
    help: "the floor's policies: each one's rule, approval, live runs, last run and where it stands now; `approve` approves its words as they are, `run` starts it now (an open offer's slot when it has one)",
  },
  runs: {
    of: 'worker',
    usage: 'runs [<tag|id>] [--limit n]',
    help: "a policy's latest runs (5 unless told, 20 at most), each with its worker, what it showed and its latest answer cut short; no policy named, the one this session is a run of",
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
  thread: {
    of: 'worker',
    usage: 'thread [checkout]',
    help: "the review thread about this session's work (a reviewer's is its author's), or another, and what is new to you",
  },
  note: {
    of: 'worker',
    usage: 'note [on <checkout>] [re n<k>] [repo:path:<line>[-<line>] …]',
    help: "a message on the thread, the body on stdin, each anchor's lines quoted from the checkout's files as they are now (from your own, when it is a fork of that checkout: the version you read)",
  },
  send: { of: 'worker', usage: 'send <CALLSIGN>', help: "submit into a worker a pointer to the notes on its checkout's thread new to it" },
  review: {
    of: 'worker',
    usage: 'review <CALLSIGN> [tell]',
    help: "hire a reviewer of a worker's work, in a fork of its checkout (its card's `review`); with `tell`, the reviewer sends its notes to that worker when done",
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
} satisfies Record<string, CliVerb>

export type VerbName = keyof typeof CLI_VERBS

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
