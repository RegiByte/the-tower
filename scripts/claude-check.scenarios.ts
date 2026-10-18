/**
 * The scenarios `scripts/claude-check.ts` drives on a new Claude release, as data: one per fixture recorded from
 * real Claude in `test/fixtures` (and a few with none, for their shapes), each driven the way its fixture was so an
 * unchanged release replays to the same statuses.
 *
 * A scenario runs in its own directory, its own git repo (Claude keeps folder trust per repo root), seeded again with
 * `seed` files on each run. The directory is the same on every run, so Claude asks to trust it only on the first; a
 * `fresh` scenario, which needs the trust screen, gets a directory Claude has never seen. Its steps run in order: each waits on what the session's log says (`on`), then `pause`s, then does
 * one thing (`do`). An `on` reads the log after the previous step: after its action when it acted, else after the
 * event it waited on. Every session it spawned is killed after its last step, and each log is a recording, named
 * after its session.
 */
import type { Status } from '../src/bridge/status.ts'
import type { BlockedKind } from '../src/bridge/blocked.ts'

/**
 * What a status replay leaves out to compare a recording with its fixture (`comparedForm`): `trust`, the trust screen's
 * leading `blocked`, left out of every scenario but a `fresh` one or one held at start by a `blocked` screen, since a
 * fixture and a run may differ in whether the directory was trusted; `watching` and `repeats`, for subagents that race the main loop to the end of its turn and
 * report in as many turns as the race leaves.
 */
export type Ignore = 'trust' | 'watching' | 'repeats'

/**
 * What a step waits for in a session's log. `event`: a hook event by name, the main loop's only unless `agents`,
 * whose fields equal each `where` string or match each pattern; the `count`th such. `status`: the session's folded
 * status entering it, the `count`th time.
 */
export type On =
  | { event: string; where?: Record<string, string | RegExp>; agents?: true; count?: number; within?: number }
  | { status: Status; count?: number; within?: number }

/**
 * What a step does. `spawn`: a session named `as` in the scenario's directory, answering the trust screen the
 * directory's first session raises, or held by `blocked`'s; `resume`: a session named `as` continuing the conversation of `from`, killed by
 * then; `keys`: raw input; `submit`: text typed and sent, as `POST /submit`; `write`: a file in the directory;
 * `kill`: the session, waited on until it exits.
 */
export type Act =
  | { spawn: string; prompt?: string; model?: string; callsign?: string; blocked?: BlockedKind }
  | { resume: string; from: string }
  | { keys: string }
  | { submit: string }
  | { write: string; text: string }
  | { kill: true }

/** `in`: the session the step waits on and acts in, the first spawned when left out. */
export type Step = { in?: string; on?: On; pause?: number; do?: Act }

/**
 * Claude's flags beyond the tower's own, and its environment: `{root}` is the run's root. Every scenario with the same
 * launch runs together, the config written once for them.
 */
export type Launch = { name: string; tools: string[]; argv?: string[]; env?: Record<string, string> }

/**
 * `recordings`: each session it records, by name, with the fixture its timeline replays against and what that leaves
 * out. `fresh`: it runs in a directory Claude has never trusted.
 */
export type Scenario = {
  name: string
  fresh?: true
  launch: Launch
  seed: Record<string, string>
  recordings: Record<string, { fixture?: string; ignore?: Ignore[] }>
  steps: Step[]
}

const ESC = '\x1b'
const ENTER = '\r'

const TOOLS = ['Bash', 'Monitor', 'CronCreate', 'CronDelete', 'CronList', 'ScheduleWakeup', 'TaskStop', 'Read', 'Skill', 'SendMessage']

/** Write is left out of every list, so a permission prompt shows. */
export const LAUNCHES = {
  plain: { name: 'plain', tools: TOOLS },
  /**
   * Automatic compaction on a short window: 54% of 100k is just above Haiku's first-call prefix. `--debug-file` names
   * each event Claude's built-in `sec-default` mod keeps from the tower's.
   */
  compaction: {
    name: 'compaction',
    tools: ['Read'],
    argv: ['--debug-file', '{root}/debug.log'],
    env: { CLAUDE_CODE_AUTO_COMPACT_WINDOW: '100k', CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: '54' },
  },
  /** Claude with no account: its sign-in screen. */
  signedOut: { name: 'signed-out', tools: TOOLS, env: { CLAUDE_CONFIG_DIR: '{root}/signed-out' } },
} satisfies Record<string, Launch>

const FILES = {
  'facts.txt': 'The tallest lighthouse in the sandbox is 42 meters.\n',
  'more.txt': 'Lighthouses were automated over the twentieth century.\n',
  'last.txt': 'The last keeper left in 1998.\n',
  'package.json': '{"name":"sandbox","version":"1.0.0","type":"module"}\n',
  'tsconfig.json': '{"compilerOptions":{"target":"ES2023","module":"NodeNext"}}\n',
  'src/bridge/status.ts': '// Folds a session\'s log events into its status: idle, working, needs_input, done.\nexport const status = 1\n',
  'src/bridge/facts.ts': 'export const facts = 1\n',
  '.claude/commands/magic.md': '---\ndescription: say the magic word\n---\nReply with exactly the word PINEAPPLE and nothing else. Argument: $ARGUMENTS\n',
  '.claude/skills/fruit/SKILL.md': '---\nname: fruit\ndescription: Names a fruit. Use when the user asks for a fruit.\n---\nReply with exactly the word MANGO and nothing else.\n',
}

/** Eight files of about 33 KB, each read pushing the context past the compaction threshold. */
const part = (n: number) =>
  Array.from({ length: 330 }, (_, i) => `Section ${n}.${i}: the quick brown fox number ${(i * 70 + 1) % 1000} jumps over lazy dog ${i} with notes about the ledger entry ${(i * 31) % 997}.\n`).join('')

const DOCS = {
  ...Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`docs/part${i + 1}.txt`, part(i + 1)])),
  '.claude/settings.local.json': '{"autoCompactEnabled": true}\n',
}

/** Longer than the tower's paste chunk, to check a submit lands whole. */
export const LONG_SUBMIT = `Count the words in this text and reply with only the number and the last word: ${Array.from({ length: 640 }, (_, i) => `w${i}`).join(' ')}`

const DONE: On = { status: 'done' }
const TURN: On = { event: 'turn.complete' }

/** A scenario of one session, named and recorded as its fixture. */
const one = (name: string, s: { fresh?: true; launch?: Launch; seed?: Record<string, string>; fixture?: false; ignore?: Ignore[]; prompt?: string; model?: string; blocked?: BlockedKind; steps: Step[] }): Scenario => ({
  name,
  ...(s.fresh && { fresh: s.fresh }),
  launch: s.launch ?? LAUNCHES.plain,
  seed: s.seed ?? FILES,
  recordings: { [name]: { ...(s.fixture !== false && { fixture: name }), ...(s.ignore && { ignore: s.ignore }) } },
  steps: [{ do: { spawn: name, ...(s.prompt && { prompt: s.prompt }), ...(s.model && { model: s.model }), ...(s.blocked && { blocked: s.blocked }) } }, ...s.steps],
})

const PERMISSION: On = { event: 'PermissionRequest' }

export const SCENARIOS: Scenario[] = [
  one('api-error', { prompt: 'say hi', model: 'claude-nonexistent-9', steps: [{ on: { status: 'failed' } }] }),
  one('background-shell', {
    prompt: 'Run this Bash command in the background with run_in_background true: sleep 15 && echo finished. Then end your turn right away without waiting. When it finishes, tell me its output in one line.',
    steps: [{ on: DONE }],
  }),
  one('clear', {
    prompt: 'reply with exactly the word PONG and nothing else',
    steps: [{ on: DONE, do: { submit: '/clear' } }, { on: { event: 'SessionStart', where: { source: 'clear' } }, do: { submit: 'reply with exactly the word PING and nothing else' } }, { on: DONE }],
  }),
  one('interrupt-says', {
    prompt: 'First write one short sentence saying you will read facts.txt. Then read facts.txt with the Read tool. Then write an 800-word story inspired by it. Do not use any other tools.',
    steps: [{ on: { event: 'tower.tool.result' }, pause: 2500, do: { keys: ESC } }, { on: TURN }],
  }),
  one('interrupts', {
    prompt: 'Write a 900-word story about a lighthouse keeper. Do not use any tools.',
    steps: [
      { on: { event: 'turn.start' }, pause: 3000, do: { keys: ESC } },
      { on: TURN, do: { submit: 'Use the Write tool to create the file deny-probe.txt containing the word hi.' } },
      { on: PERMISSION, pause: 1500, do: { keys: ESC } },
      { on: TURN, do: { submit: 'Reply with just the word ok.' } },
      { on: DONE },
    ],
  }),
  one('permission-answered', {
    prompt: 'Use the Write tool to create a file named hello.txt containing the single word hi. Then reply with just: done.',
    steps: [{ on: PERMISSION, pause: 1500, do: { keys: ENTER } }, { on: DONE }],
  }),
  one('permission-denied', {
    prompt: 'Use the Write tool to create the file note.txt containing the word hello.',
    steps: [{ on: PERMISSION, pause: 1500, do: { keys: ESC } }, { on: TURN, do: { submit: 'Reply with just the word ok.' } }, { on: DONE }],
  }),
  one('step-answers', {
    prompt: 'Read package.json, then tsconfig.json, one at a time. Before each read, tell me in one short sentence what you are about to do. Then answer in one line: which TypeScript target does the project use?',
    steps: [{ on: DONE }],
  }),
  one('tool-turn', {
    prompt: 'List the files in src/bridge with ls, then tell me in one sentence what status.ts does.',
    steps: [{ on: DONE, do: { submit: 'List the files in src/bridge with ls, then tell me in one sentence what status.ts does.' } }, { on: DONE }],
  }),
  one('tool-error', { prompt: 'Use the Read tool to read the file missing-notes.txt in this folder, then tell me in one sentence what happened.', steps: [{ on: DONE }] }),
  one('monitor', {
    prompt: 'Use the Monitor tool to watch this command: for i in 1 2; do sleep 6; echo tick $i; done. Then end your turn right away. When it reports, tell me what it said in one line.',
    steps: [{ on: DONE }],
  }),
  one('subagent-background', {
    prompt: 'Use the Agent tool to start one general-purpose subagent with this task: read facts.txt, then more.txt, then last.txt with the Read tool, one file per message, waiting for each before the next, then report all three. When it returns, tell me in one sentence what it found.',
    steps: [{ on: DONE }],
  }),
  one('subagent-fork', {
    prompt: 'Use the Agent tool twice, in one message: first a fork (subagent_type "fork", run in the background) whose task is to read facts.txt with the Read tool and report it; second a general-purpose subagent (not in the background) whose task is to read more.txt with the Read tool and report it. When both have reported, tell me in one sentence what they found.',
    ignore: ['watching', 'repeats'],
    steps: [{ on: DONE, pause: 10_000 }],
  }),
  one('subagent-stopped', {
    prompt: 'Start one general-purpose subagent with the Agent tool, in the background, whose task is to run the Bash command "ping -c 90 127.0.0.1 > /dev/null" in the foreground (not in the background) and then report done. Then run the Bash command "ping -c 8 127.0.0.1 > /dev/null" yourself, then stop that subagent with the TaskStop tool, and tell me in one sentence that you stopped it.',
    steps: [{ on: DONE }],
  }),
  one('subagent-resume', {
    prompt: 'Use the Agent tool to start one general-purpose subagent (not in the background) named reader, whose task is to run the Bash command "sleep 5", then read facts.txt with the Read tool and report it in one line. When it returns, tell me what it found in one sentence.',
    steps: [
      { on: DONE, do: { submit: 'Now use SendMessage to send the subagent you started (by its agent ID or name) this message: run the Bash command "sleep 5", then read more.txt with the Read tool and report it in one line. Wait for its answer, then tell me what it said in one sentence.' } },
      { on: DONE },
    ],
  }),
  one('task-stopped', {
    prompt: 'Run this Bash command in the background with run_in_background true: sleep 600 && echo finished. Then end your turn right away without waiting.',
    steps: [{ on: { status: 'watching' }, do: { submit: '/tasks' } }, { on: { event: 'command.run' }, pause: 2500, do: { keys: 'x' } }, { pause: 2000, do: { keys: ESC } }, { pause: 8000 }],
  }),
  one('loop-cron', {
    prompt: '/loop 1m say the word tick, nothing else',
    steps: [{ on: { ...TURN, count: 3, within: 300_000 }, do: { submit: 'Stop the loop: delete the cron job.' } }, { on: DONE }],
  }),
  one('loop-wakeup', {
    prompt: '/loop check whether the file flag exists in this folder; if it does, say found and stop the loop; if not, say waiting and check again in about a minute',
    steps: [{ on: { ...TURN, count: 2, within: 300_000 }, do: { write: 'flag', text: 'x\n' } }, { on: { ...TURN, where: { answer: /found/i }, within: 300_000 } }],
  }),
  one('skill-command', {
    prompt: '/magic banana',
    fixture: false,
    steps: [{ on: DONE, do: { submit: 'Give me a fruit.' } }, { on: DONE, do: { submit: '/fruit' } }, { on: DONE }],
  }),
  one('long-submit', {
    prompt: 'Reply with the single word: ready',
    fixture: false,
    steps: [{ on: DONE, do: { submit: LONG_SUBMIT } }, { on: { event: 'prompt.submit', where: { text: LONG_SUBMIT } } }, { on: DONE }],
  }),
  one('trust-dialog', { fresh: true, steps: [{ on: { event: 'SessionStart' }, pause: 3000 }] }),
  one('login-screen', { launch: LAUNCHES.signedOut, prompt: 'say hi', blocked: 'login', steps: [{ pause: 3000 }] }),
  {
    name: 'peers',
    launch: LAUNCHES.plain,
    seed: FILES,
    recordings: { 'peer-receiver': { fixture: 'peer-receiver' }, 'peer-sender': { fixture: 'peer-sender' } },
    steps: [
      {
        do: {
          spawn: 'peer-receiver',
          callsign: 'BISHOP-44',
          prompt: 'When another Claude session sends you a message, answer it with SendMessage, to its from attribute, with the single word pong. For now reply with the single word ready.',
        },
      },
      { on: DONE, do: { spawn: 'peer-sender', prompt: 'With SendMessage, send the message ping to the Claude session named BISHOP-44, then end your turn. When its answer arrives, reply with the single word it sent.' } },
      { in: 'peer-sender', on: { ...TURN, where: { answer: /pong/i } } },
      { in: 'peer-receiver', on: DONE },
    ],
  },
  {
    name: 'resume',
    launch: LAUNCHES.plain,
    seed: FILES,
    recordings: { 'resume-source': { fixture: 'resume-source' }, resumed: { fixture: 'resumed' } },
    steps: [
      { do: { spawn: 'resume-source', prompt: 'reply with exactly the word PONG and nothing else' } },
      { on: DONE, do: { kill: true } },
      { do: { resume: 'resumed', from: 'resume-source' } },
      { in: 'resumed', on: { event: 'SessionStart' }, do: { submit: 'what single word did you answer before? reply with it lowercase' } },
      { in: 'resumed', on: DONE },
    ],
  },
  one('compact-manual', {
    launch: LAUNCHES.compaction,
    seed: DOCS,
    prompt: 'Without using any tools, reply with the single word: hello',
    steps: [{ on: DONE, do: { submit: '/compact' } }, { on: { event: 'SessionStart', where: { source: 'compact' } }, pause: 3000 }],
  }),
  one('compact-auto', {
    launch: LAUNCHES.compaction,
    seed: DOCS,
    prompt: 'Read docs/part1.txt, then docs/part2.txt, then docs/part3.txt, one Read call per message, never in parallel. After each read, say in one short sentence what its last line says. Then say done.',
    steps: [{ on: { ...DONE, within: 600_000 } }],
  }),
  one('compact-thrashing', {
    launch: LAUNCHES.compaction,
    seed: DOCS,
    prompt: 'Read docs/part1.txt, then docs/part2.txt, and so on through docs/part8.txt, one Read call per message, never two in one message. Then read all eight again in the same order, one per message. Then answer with the single word done.',
    steps: [{ on: { status: 'failed', within: 600_000 } }],
  }),
  one('compact-subagent', {
    launch: LAUNCHES.compaction,
    seed: DOCS,
    prompt: 'Use the Agent tool once to start one general-purpose subagent with this task, word for word: "Read docs/part1.txt, then docs/part2.txt, and so on through docs/part8.txt, one Read call per message, never two in one message. Then read them all again in the same order, one per message. Then answer with the single word done." Do not read any file yourself. When the subagent finishes, answer with the single word finished.',
    steps: [{ on: { event: 'agent.spawn' }, pause: 5000, do: { submit: '/compact' } }, { on: { ...DONE, within: 600_000 } }],
  }),
]

/**
 * The fixtures no scenario records, and why: a scenario for every other fixture of real Claude's is above.
 */
export const UNRECORDED: Record<string, string> = {
  'host-stopped-done': 'a sandbox session (bash), not Claude',
  'host-stopped-mid-turn': 'a sandbox session (bash), not Claude',
  'lineage-fork': 'a sandbox session (bash), not Claude',
  'lineage-heir': 'a sandbox session (bash), not Claude',
  'lineage-root': 'a sandbox session (bash), not Claude',
  shown: 'a sandbox session (bash), not Claude',
  'stop-without-tasks': 'a sandbox session (bash), not Claude',
  'probe-quota': "the quota probe's stream, not a session",
  'compact-auto-outside-org': 'needs an account outside a Team or Enterprise organization',
  'compact-manual-outside-org': 'needs an account outside a Team or Enterprise organization',
}
