import assert from 'node:assert/strict'
import { test } from 'node:test'
import { board } from '../src/bridge/board.ts'
import { conversationsOf } from '../src/bridge/conversation.ts'
import { factsOf } from '../src/bridge/facts.ts'
import { turnsByConversation, type Step } from '../src/bridge/turns.ts'
import type { Config, LogEvent, SessionLog } from '../src/shared/model.ts'
import { HOST_PROTOCOL } from '../src/shared/protocol.ts'
import { fixture, normalized, timeline } from './replay.ts'
import { viewOf } from './view.ts'

const turnsOf = (log: SessionLog) => Object.values(turnsByConversation(log)).flat()

const spentIn = (spend: [number, number][]) => spend.reduce((sum, [, usd]) => sum + usd, 0)

const stepWords = (steps: Step[]) => steps.map((s) => (s.t === 'tool' ? `${s.tool} ${s.outcome}: ${s.line}` : s.t))

test('opencode: a turn with tools runs from idle to done, with its model, cost and context', () => {
  const log = fixture('opencode-basic')
  assert.deepEqual(timeline(log), [['idle', 0.421], ['working', 1.367], ['done', 36.171], ['exited', 97.552]])
  const facts = factsOf(log)
  assert.deepEqual([facts.model, facts.effort, facts.costUsd, facts.context, facts.turns, facts.runtimeRelease], ['openrouter/google/gemini-4-argon', undefined, 0.028737600000000002, 1, 1, '2.2.5'])
  assert.deepEqual(facts.tokens.map(([, model, tokens]) => [model, tokens]), [
    ['openrouter/google/gemini-4-argon', { input: 10480, output: 38, cacheRead: 0, cacheWrite: 0 }],
    ['openrouter/google/gemini-4-argon', { input: 2738, output: 16, cacheRead: 8426, cacheWrite: 0 }],
  ])
  assert.deepEqual(conversationsOf(log).map(({ id, prompt, answer, resumed }) => [id, prompt, answer, resumed]), [
    ['ses_e202c54b1ffeFCLp4CmRTNuMFL', 'Run `ls` in the shell, then reply with one short sentence.', 'The directory contains a single `README.md` file.', false],
  ])
  assert.deepEqual(turnsOf(log).map((t) => stepWords(t.steps)), [['shell ok: ls', 'shell ok: tower whoami']])
})

test('opencode: prompts sent mid-turn open their turns where the running turn takes them in', () => {
  const log = fixture('opencode-queued')
  assert.deepEqual(timeline(log), [['idle', 0.363], ['working', 1.315], ['done', 63.827], ['exited', 73.414]])
  const turns = turnsOf(log)
  assert.deepEqual(turns.map((t) => [t.prompt.slice(0, 26), stepWords(t.steps)]), [
    ['Do these one at a time: re', ['read ok: README.md', 'write ok: notes.txt']],
    ['Also: what is 17 times 23?', ['grep ok: lentil']],
    ['And name one lentil dish i', ['shell error: ls nope-missing', 'read error: missing.txt', 'shell ok: which tower']],
  ])
  assert.ok(turns[2].answer?.startsWith('I read `README.md`'))
  const facts = factsOf(log)
  assert.deepEqual([facts.turns, facts.prompts.length, facts.failures.length], [1, 3, 1])
})

test('opencode: an ask holds the session until it is answered, whatever its other calls do meanwhile; a reject leaves it idle', () => {
  const log = fixture('opencode-permission')
  assert.deepEqual(timeline(log), [
    ['idle', 0.378],
    ['working', 1.323],
    ['needs_input', 7.376],
    ['working', 154.36],
    ['done', 159.34],
    ['working', 167.655],
    ['needs_input', 171.901],
    ['working', 181.464],
    ['done', 185.679],
    ['working', 189.129],
    ['needs_input', 194.439],
    ['working', 198.645],
    ['idle', 198.646],
    ['working', 205.611],
    ['needs_input', 213.736],
    ['working', 217.642],
    ['done', 221.84],
    ['exited', 231.153],
  ])
  assert.equal(factsOf(log).asks.length, 4)
  assert.deepEqual(turnsOf(log).map((t) => stepWords(t.steps)), [
    ['read ok: notes/shelf.md', 'shell ok: tower whoami'],
    ['read ok: README.md'],
    ['read abandoned: /tmp/tower-daedalus-18/outside/far.txt'],
    ['shell ok: echo hi'],
  ])
})

test('opencode: a question form asks the user until it is answered', () => {
  const log = fixture('opencode-question')
  assert.deepEqual(timeline(log), [['idle', 0.374], ['working', 1.323], ['needs_input', 8.891], ['working', 105.094], ['done', 112.508], ['exited', 120.598]])
  assert.deepEqual(turnsOf(log).map((t) => t.steps.flatMap((s) => (s.t === 'tool' ? [s.tool] : []))), [['shell', 'question']])
})

test('opencode: a resumed conversation is named from the start; Esc abandons the call, and a /compact is no turn', () => {
  const log = fixture('opencode-resume')
  assert.deepEqual(timeline(log), [['idle', 0.376], ['working', 8.642], ['idle', 26.949], ['working', 31.923], ['idle', 45.627], ['exited', 76.708]])
  assert.deepEqual(conversationsOf(log).map(({ id, resumed }) => [id, resumed]), [['ses_e202c54b1ffeFCLp4CmRTNuMFL', true]])
  assert.deepEqual(turnsOf(log).map((t) => stepWords(t.steps)), [['shell abandoned: sleep 60 && echo done']])
  const facts = factsOf(log)
  assert.deepEqual([facts.turns, facts.turnSpans.length], [0, 1])
})

test('opencode: a resumed session spends only what its own requests charged', () => {
  const resumed = factsOf(fixture('opencode-resume'))
  assert.equal(resumed.costUsd, 0.05922910000000001)
  assert.deepEqual(resumed.spend.map(([, usd]) => usd), [0.0055515, 0.02494])
  const before = factsOf(fixture('opencode-basic'))
  assert.equal((before.costUsd! + spentIn(resumed.spend)).toFixed(9), resumed.costUsd!.toFixed(9))
})

const SESSION = 'ses_e202c54b1ffeFCLp4CmRTNuMFL'
const hookLine = (at: number, type: string, data: Record<string, unknown>): LogEvent => [at, 'h', { type, data, hook_event_name: type }] as LogEvent
const NO_STEP_TOKENS = { input: 1, output: 1, reasoning: 0, cache: { read: 0, write: 0 } }
const hookIndex = (log: SessionLog, type: string) => log.events.findIndex((e) => e[1] === 'h' && (e[2] as { hook_event_name?: string }).hook_event_name === type)

test('opencode: a step after a compaction adds only its own charge', () => {
  const log = fixture('opencode-resume')
  const shutdown = hookIndex(log, 'location.shutdown')
  const before = factsOf(log)
  const after = factsOf({
    ...log,
    events: [
      ...log.events.slice(0, shutdown),
      hookLine(50, 'session.step.ended', { sessionID: SESSION, assistantMessageID: 'msg_x', cost: 0.01, tokens: NO_STEP_TOKENS }),
      hookLine(50.001, 'session.usage.updated', { sessionID: SESSION, cost: before.costUsd! + 0.01 }),
      ...log.events.slice(shutdown),
    ],
  })
  assert.equal(Number((spentIn(after.spend) - spentIn(before.spend)).toFixed(6)), 0.01)
})

test('opencode: a step refused by the provider charges nothing, and the next step still counts', () => {
  const log = fixture('opencode-failed')
  const failed = hookIndex(log, 'session.step.failed')
  const session = (log.events[failed][2] as unknown as { data: { sessionID: string } }).data.sessionID
  const facts = factsOf({
    ...log,
    events: [
      ...log.events.slice(0, failed + 1),
      hookLine(2, 'session.step.ended', { sessionID: session, assistantMessageID: 'msg_y', cost: 0.01, tokens: NO_STEP_TOKENS }),
      hookLine(2.001, 'session.usage.updated', { sessionID: session, cost: 0.01 }),
      ...log.events.slice(failed + 1),
    ],
  })
  assert.deepEqual(facts.spend.map(([, usd]) => usd), [0.01])
})

test('opencode: the effort a step ran at is its variant', () => {
  const facts = factsOf(fixture('opencode-variant'))
  assert.deepEqual([facts.model, facts.effort, facts.exitCode], ['openrouter/google/gemini-4-argon', 'high', 130])
  assert.deepEqual([factsOf(fixture('opencode-standalone')).model, factsOf(fixture('opencode-standalone')).effort], ['openrouter/google/gemini-4-hydrogen', undefined])
})

test('opencode: a provider error fails the turn; a retry keeps it working until its answer', () => {
  assert.deepEqual(timeline(fixture('opencode-failed')), [['idle', 0.374], ['working', 1.319], ['failed', 1.356], ['exited', 17.189]])
  const retry = fixture('opencode-retry')
  assert.deepEqual(timeline(retry), [['idle', 0.376], ['working', 1.33], ['done', 7.414], ['exited', 16.85]])
  assert.deepEqual(normalized(retry).flatMap((e) => (e[1] === 'e' && e[2].t === 'turn.retrying' ? [e[2].at] : [])), [1794757390718, 1794757394738])
  assert.deepEqual(turnsOf(retry).map((t) => t.answer), ['Fine, after a wait.'])
})

test('opencode: an automatic compaction runs inside its turn; one that fails fails the turn', () => {
  const log = fixture('opencode-compaction')
  assert.deepEqual(timeline(log), [['idle', 0.381], ['working', 1.333], ['done', 1.363], ['working', 3.756], ['done', 3.783], ['exited', 25.621]])
  assert.deepEqual(normalized(log).flatMap((e) => (e[1] === 'e' && e[2].t.startsWith('compaction.') ? [e[2].t] : [])), ['compaction.started', 'compaction.ended'])
  assert.equal(factsOf(log).turns, 2)
  assert.deepEqual(timeline(fixture('opencode-compaction-failed')), [['idle', 0.374], ['working', 1.316], ['done', 1.356], ['working', 3.822], ['failed', 3.827], ['exited', 31.52]])
})

test('opencode: a subagent runs in a child session: its spawn, its own calls and tokens, the cost of both', () => {
  const log = fixture('opencode-subagent')
  assert.deepEqual(timeline(log), [['idle', 0.386], ['working', 1.325], ['done', 28.404], ['exited', 32.516]])
  const facts = factsOf(log)
  assert.deepEqual(facts.subagentRuns.map(({ id, type, description, background, model, tokens, ended }) => ({ id, type, description, background, model, tokens, ended })), [{
    id: 'ses_e201c544fffe80lM0SieunJ9ZX', type: 'general', description: 'List files and read README.md', background: false, model: 'openrouter/google/gemini-4-argon',
    tokens: { input: 11997, output: 162, cacheRead: 7543, cacheWrite: 0 }, ended: 'ok',
  }])
  assert.equal(facts.costUsd, 0.0403009)
  const [turn] = turnsOf(log)
  assert.deepEqual(stepWords(turn.steps), ['shell ok: tower whoami', 'subagent ok: List files and read README.md'])
  assert.ok(turn.answer?.startsWith('The subagent found seven items'))
  assert.deepEqual(conversationsOf(log).map((c) => c.id), ['ses_e201c71d6ffeNa6W5MCwi8FXQ6'])
})

test('opencode: a session nobody prompts stays idle, an MCP server waiting on a login included', () => {
  assert.deepEqual(timeline(fixture('opencode-mcp-auth')), [['idle', 0.355], ['exited', 11.93]])
})

test('opencode: the board says what its workers can show and run, the models as its latest session reported them', () => {
  const logs = [fixture('opencode-basic'), fixture('opencode-failed')]
  const config = { runtimes: { claude: { argv: ['claude'] }, opencode: { argv: ['opencode'] } }, env: {}, projects: { lab: { name: 'lab', hub: '/hub/lab', repos: [] } } } as unknown as Config
  const { runtimes } = board(viewOf(config, { sessions: logs.map((log) => ({ header: log.header, facts: factsOf(log) })), host: { ids: new Set(), protocol: HOST_PROTOCOL } }))
  assert.deepEqual(runtimes.opencode.statuses, ['booting', 'idle', 'working', 'needs_input', 'done', 'failed', 'exited', 'lost'])
  assert.deepEqual(runtimes.opencode.absent, ['rateLimits', 'watching', 'peers', 'slashCommands', 'modelList'])
  assert.deepEqual(runtimes.opencode.models, [
    { id: 'openrouter/google/gemini-4-hydrogen', efforts: ['low', 'medium', 'high', 'xhigh'] },
    { id: 'openrouter/google/gemini-4-carbon', efforts: ['low', 'medium', 'high'] },
    { id: 'openrouter/google/gemini-4-argon', efforts: ['low', 'medium', 'high'] },
  ])
  assert.deepEqual([runtimes.claude.statuses.length, runtimes.claude.absent, runtimes.claude.models.map((m) => m.id)], [10, [], ['fable', 'opus', 'sonnet', 'haiku']])
})

test("opencode: its default model is the one a spawn that asked for none ran on, as the spawn's fact says", () => {
  const log = fixture('opencode-basic')
  const asked = (fact: Record<string, string>): SessionLog => ({ header: log.header, events: [[0, 'h', { hook_event_name: 'tower.asked', ...fact }], ...log.events] as LogEvent[] })
  const config = { runtimes: { claude: { argv: ['claude'] }, opencode: { argv: ['opencode'] } }, env: {}, projects: { lab: { name: 'lab', hub: log.header.cwd, repos: [] } } } as unknown as Config
  const defaultsOf = (log: SessionLog) => board(viewOf(config, { sessions: [{ header: log.header, facts: factsOf(log) }], host: { ids: new Set(), protocol: HOST_PROTOCOL } })).runtimes.opencode.defaults
  assert.ok(factsOf(log).model)
  assert.equal(defaultsOf(asked({})).model, factsOf(log).model)
  assert.equal(defaultsOf(asked({ model: 'openrouter/google/gemini-4-argon' })).model, undefined)
  assert.equal(defaultsOf(log).model, undefined)
})

test('a session whose command exited with an error before its runtime started says so on its card, naming the command', () => {
  const header = { ...fixture('opencode-basic').header, argv: ['opencode-missing', '--standalone'] }
  const config = { runtimes: { claude: { argv: ['claude'] }, opencode: { argv: ['opencode-missing'] } }, env: {}, projects: { lab: { name: 'lab', hub: header.cwd, repos: [] } } } as unknown as Config
  const cardOf = (events: unknown[]) => {
    const log = { header, events } as SessionLog
    return board(viewOf(config, { sessions: [{ header, facts: factsOf(log) }], host: { ids: new Set(), protocol: HOST_PROTOCOL } })).floors[0].cards[0]
  }
  const facts = [[0.001, 'h', { hook_event_name: 'tower.named', callsign: 'MORGAN-87' }], [0.001, 'h', { hook_event_name: 'tower.asked' }]]
  assert.match(cardOf([...facts, [0.005, 'x', { exitCode: 1 }]]).startFailure ?? '', /^opencode-missing exited with code 1 before opencode started: .*`tower doctor`/)
  assert.equal(cardOf([...facts, [0.2, 'o', 'error\r\n'], [0.3, 'x', { exitCode: 1 }]]).startFailure, undefined)
  assert.equal(cardOf([...facts, [0.005, 'x', { exitCode: 0 }]]).startFailure, undefined)
})

test('opencode: a worker is named by the callsign it was started under, which its TUI never shows', () => {
  const log = fixture('opencode-basic')
  const [header, ...events] = [log.header, ...log.events]
  const named: SessionLog = { header, events: [[0, 'h', { hook_event_name: 'tower.named', callsign: 'TYPED-7' }], ...events] as LogEvent[] }
  const config = { runtimes: { claude: { argv: ['claude'] }, opencode: { argv: ['opencode'] } }, env: {}, projects: { lab: { name: 'lab', hub: header.cwd, repos: [] } } } as unknown as Config
  const callsignOf = (log: SessionLog) =>
    board(viewOf(config, { sessions: [{ header: log.header, facts: factsOf(log) }], host: { ids: new Set(), protocol: HOST_PROTOCOL } })).floors.flatMap((f) => f.cards).find((c) => c.id === header.id)?.callsign
  assert.equal(callsignOf(named), 'TYPED-7')
  assert.notEqual(callsignOf(log), 'TYPED-7')
})
