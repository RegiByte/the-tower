/**
 * The scenarios `scripts/runtime-check.ts` drives on a new opencode release, as data: one per fixture recorded from
 * real opencode in `test/fixtures/opencode-*.jsonl`, each driven the way its fixture was so an unchanged release
 * replays to the same statuses. What a scenario is: `runtime-check.scenario.ts`.
 *
 * opencode's config reaches a scenario through its directory's `opencode.json`, which opencode merges under the one
 * the tower composes: the fixture provider and the OAuth MCP server (`runtime-check.opencode.fakes.ts`), and shell
 * calls that ask. A session ends as its fixture's did, `/exit` typed and chosen, unless the scenario is about how it
 * is killed. opencode asks to trust no directory and draws no screen the bridge reads, so no step answers one.
 */
import type { On, Scenario as AnyScenario, Step } from './runtime-check.scenario.ts'

/** opencode takes everything from the config the tower composes and the directory's `opencode.json`: one launch. */
export type OpencodeLaunch = { name: string }

type Scenario = AnyScenario<OpencodeLaunch>

export const LAUNCHES = { plain: { name: 'plain' } } satisfies Record<string, OpencodeLaunch>

/** The model every scenario runs on unless it names one: a Claude model would not exercise opencode's own paths. */
export const MODEL = 'openrouter/google/gemini-4-argon'

const ESC = '\x1b'
const ENTER = '\r'
const DOWN = '\x1b[B'
const RIGHT = '\x1b[C'

const DONE: On = { status: 'done' }
const IDLE: On = { status: 'idle' }
const ASKED: On = { event: 'permission.asked' }

const README = { 'README.md': '# lab\n\nA folder for trying things.\n' }

const config = (value: Record<string, unknown>) => ({ 'opencode.json': `${JSON.stringify({ $schema: 'https://opencode.ai/config.json', ...value }, null, 2)}\n` })

/** The local provider's models, at `{provider}`; a context `big` fills with one answer. */
const PROVIDER = config({
  provider: {
    fixture: {
      npm: '@ai-sdk/openai-compatible',
      name: 'fixture',
      options: { baseURL: 'http://127.0.0.1:{provider}/v1', apiKey: 'fixture' },
      models: {
        big: { name: 'big', limit: { context: 32_000, output: 2_000 } },
        badsummary: { name: 'badsummary', limit: { context: 32_000, output: 2_000 } },
        fail: { name: 'fail' },
        retry: { name: 'retry' },
      },
    },
  },
})

/** `/exit` typed, its command chosen, and the exit waited on: how every fixture's session ended. */
const exit = (inSession?: string): Step[] => [
  { ...(inSession && { in: inSession }), pause: 1500, do: { keys: '/exit' } },
  { ...(inSession && { in: inSession }), pause: 700, do: { keys: ENTER } },
  { ...(inSession && { in: inSession }), on: { exit: true, within: 30_000 } },
]

/** A scenario of one session, named and recorded as its fixture `opencode-<name>`. */
const one = (name: string, s: { seed?: Record<string, string>; prompt?: string; model?: string; effort?: string; steps: Step[] }): Scenario => ({
  name,
  launch: LAUNCHES.plain,
  seed: { ...README, ...s.seed },
  recordings: { [name]: { fixture: `opencode-${name}` } },
  steps: [{ do: { spawn: name, ...(s.prompt && { prompt: s.prompt }), ...(s.model && { model: s.model }), ...(s.effort && { effort: s.effort }) } }, ...s.steps],
})

const LS = 'Run `ls` in the shell, then reply with one short sentence.'

export const SCENARIOS: Scenario[] = [
  one('basic', { prompt: LS, steps: [{ on: DONE }, ...exit()] }),
  one('permission', {
    seed: { ...config({ permission: { bash: 'ask', external_directory: 'ask' } }), 'notes/shelf.md': 'Lentils keep for a year in a dry jar.\n' },
    prompt: 'First run `tower whoami` in the shell. Then read notes/shelf.md (a relative path) and quote it.',
    steps: [
      { on: ASKED, pause: 1500, do: { keys: ENTER } },
      { on: DONE, do: { submit: 'Read the file /etc/hosts by exactly that absolute path, using the read tool only.' } },
      { on: ASKED, pause: 1500, do: { keys: ENTER } },
      { on: DONE, do: { submit: 'Now read {root}/outside/far.txt with the read tool.' } },
      { on: ASKED, pause: 1500, do: { keys: RIGHT } },
      { pause: 500, do: { keys: RIGHT } },
      { pause: 500, do: { keys: ENTER } },
      { on: IDLE, do: { submit: 'Run echo hi in the shell.' } },
      { on: ASKED, pause: 1500, do: { keys: RIGHT } },
      { pause: 500, do: { keys: ENTER } },
      { on: DONE },
      ...exit(),
    ],
  }),
  one('question', {
    prompt: 'Use your question tool to ask me which lentil colour I prefer: red, green or brown. Then answer in one sentence based on my choice.',
    steps: [{ on: { event: 'form.created' }, pause: 1500, do: { keys: DOWN } }, { pause: 500, do: { keys: ENTER } }, { on: DONE }, ...exit()],
  }),
  one('queued', {
    prompt:
      'Do these one at a time: read README.md; write notes.txt with three short facts about lentils; grep for lentil in this folder; run `ls nope-missing` in the shell (it fails, that is fine); read missing.txt (also missing); run `which tower`. Then summarise in two sentences.',
    steps: [
      { on: { event: 'session.execution.started' }, pause: 6000, do: { submit: 'Also: what is 17 times 23?' } },
      { pause: 3000, do: { submit: 'And name one lentil dish in three words.' } },
      { on: DONE },
      ...exit(),
    ],
  }),
  one('subagent', {
    prompt: 'Delegate to a subagent with your subagent tool (the general agent): have it list the files in this folder and read README.md. Then tell me in one sentence what it found.',
    steps: [{ on: DONE }, ...exit()],
  }),
  one('variant', { prompt: 'In one sentence: which model and effort are you running on, as far as you know?', effort: 'high', steps: [{ on: DONE }, ...exit()] }),
  one('standalone', { prompt: 'Reply with the single word PONG.', model: 'openrouter/google/gemini-4-hydrogen', steps: [{ on: DONE }, ...exit()] }),
  one('failed', { seed: PROVIDER, prompt: 'Say hi.', model: 'fixture/fail', steps: [{ on: { status: 'failed' } }, ...exit()] }),
  one('retry', { seed: PROVIDER, prompt: 'Say hi.', model: 'fixture/retry', steps: [{ on: DONE }, ...exit()] }),
  one('compaction', {
    seed: PROVIDER,
    prompt: 'Say hi.',
    model: 'fixture/big',
    steps: [{ on: DONE, do: { submit: 'Say hi again.' } }, { on: { event: 'session.compaction.ended' } }, { on: DONE }, ...exit()],
  }),
  one('compaction-failed', {
    seed: PROVIDER,
    prompt: 'Say hi.',
    model: 'fixture/badsummary',
    steps: [{ on: DONE, do: { submit: 'Say hi again.' } }, { on: { status: 'failed' } }, ...exit()],
  }),
  one('mcp-auth', {
    seed: config({ mcp: { sandbox: { type: 'remote', url: 'http://127.0.0.1:{mcp}/mcp' } } }),
    steps: [
      { on: { event: 'mcp.status.changed' }, pause: 3000, do: { keys: '/mcps' } },
      { pause: 900, do: { keys: ENTER } },
      { pause: 3000, do: { keys: ESC } },
      ...exit(),
    ],
  }),
  one('sent-home', { steps: [{ pause: 3000, do: { kill: true } }] }),
  one('killed-outside', { steps: [{ pause: 3000, do: { killOutside: true } }] }),
  {
    name: 'resume',
    launch: LAUNCHES.plain,
    seed: README,
    recordings: { 'resume-source': { fixture: 'opencode-basic' }, resumed: { fixture: 'opencode-resume' } },
    steps: [
      { do: { spawn: 'resume-source', prompt: LS } },
      { on: DONE },
      ...exit(),
      { do: { resume: 'resumed', from: 'resume-source' } },
      { in: 'resumed', on: { event: 'plugin.started' }, pause: 3000, do: { submit: 'Run the shell command: sleep 60 && echo done. Then write a long essay about lentils.' } },
      { in: 'resumed', on: { event: 'shell.created' }, pause: 3000, do: { keys: ESC } },
      { in: 'resumed', pause: 600, do: { keys: ESC } },
      { in: 'resumed', on: IDLE, pause: 2000, do: { keys: '/compact' } },
      { in: 'resumed', pause: 700, do: { keys: ENTER } },
      { in: 'resumed', on: { event: 'session.compaction.ended', within: 120_000 } },
      { in: 'resumed', on: { event: 'session.execution.succeeded' } },
      ...exit('resumed'),
    ],
  },
]

/** The fixtures of opencode's no scenario records, and why: a scenario for every other one is above. */
export const UNRECORDED: Record<string, string> = {}
