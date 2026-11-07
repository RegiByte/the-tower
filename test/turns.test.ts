import assert from 'node:assert/strict'
import { test } from 'node:test'
import { factsOf } from '../src/bridge/facts.ts'
import { briefOf, toolCallOf, turnsByConversation, wholeConversation } from '../src/bridge/turns.ts'
import { briefParts } from '../src/shared/brief.ts'
import { CALLSIGNS, callsigns } from '../src/shared/callsign.ts'
import type { SessionLog } from '../src/shared/model.ts'
import { fixture } from './replay.ts'

const callsign = callsigns(CALLSIGNS)

test('each conversation of a log keeps its own turns, a prompt with the answer that followed', () => {
  const turns = Object.values(turnsByConversation(fixture('clear')))
  assert.deepEqual(turns.map((t) => t.map(({ prompt, answer }) => [prompt, answer])), [
    [['reply with exactly the word PONG and nothing else', 'PONG']],
    [['reply with exactly the word PING and nothing else', 'PING']],
  ])
  assert.deepEqual(turns.map((t) => t.map(({ startedAt, answeredAt }) => answeredAt! - startedAt)), [[1291], [1319]])
})

test('a resumed conversation brief goes on from the turns of the session it resumed, only as far as it needs', () => {
  const logs = [fixture('resume-source'), fixture('resumed')]
  const sessions = logs.map((log) => ({ header: log.header, facts: factsOf(log) }))
  const logOf = (id: string) => logs.find((l) => l.header.id === id)!
  const [resumed] = briefOf(sessions[1], sessions, logOf, 2, callsign)
  assert.deepEqual(resumed.turns.map((t) => [t.prompt, t.answer]), [
    ['-reply with exactly the word PONG and nothing else', 'PONG'],
    ['what single word did you answer before? reply with it lowercase', 'pong'],
  ])
  assert.equal(briefOf(sessions[1], sessions, logOf, 1, callsign)[0].turns.length, 1)
})

test('a worker’s brief holds every session it ran as: its own conversations first, then each earlier session’s', () => {
  const logs = ['lineage-root', 'lineage-heir', 'lineage-fork'].map(fixture)
  const sessions = logs.map((log) => ({ header: log.header, facts: factsOf(log) }))
  const [root, heir, fork] = sessions
  const logOf = (id: string) => logs.find((l) => l.header.id === id)!
  const brief = briefOf(heir, sessions, logOf, 2, callsign)
  const rootRef = { id: root.header.id, callsign: 'MORIARTY-05', startedAt: 1791198499292 }
  assert.deepEqual(brief.map((b) => [b.session, b.id, b.turns.map((t) => [t.prompt, t.answer])]), [
    [{ id: heir.header.id, callsign: 'MORIARTY-05', startedAt: 1791198520998 }, '11111111-2222-4333-8444-555555555555', [
      ['After the clear.', 'Second conversation.'],
      ['Say hello from **the sandbox**.', 'Hello from the sandbox, session 9889.\n\n- a list\n- of things'],
    ]],
    [rootRef, 'c355e388-7151-4cf4-b56a-9db39370e49d', [['Say hello from **the sandbox**.', 'Hello from the sandbox, session 6945.\n\n- a list\n- of things']]],
    [rootRef, '11111111-2222-4333-8444-555555555555', [['After the clear.', 'Second conversation.']]],
  ])
  assert.deepEqual(briefParts(brief).map((p) => [p.session.id, p.n, p.of, p.threads.length]), [[heir.header.id, 2, 2, 1], [root.header.id, 1, 2, 2]])
  assert.deepEqual(briefOf(fork, sessions, logOf, 2, callsign).map((b) => [b.session.id, b.id]), [[fork.header.id, 'c355e388-7151-4cf4-b56a-9db39370e49d']])
})

test('a message from another worker opens a turn of its own, from the session that sent it', () => {
  const logs = [fixture('peer-sender'), fixture('peer-receiver')]
  const sessions = logs.map((log) => ({ header: log.header, facts: factsOf(log) }))
  const [sender, receiver] = sessions
  const logOf = (id: string) => logs.find((l) => l.header.id === id)!
  const turnsOf = (s: typeof sender, among: typeof sessions) => briefOf(s, among, logOf, 2, callsign)[0].turns.map(({ prompt, from, answer }) => [prompt, from, answer])
  assert.deepEqual(turnsOf(sender, sessions), [
    ['With SendMessage, send the message ping to the Claude session named BISHOP-44, then end your turn. When its answer arrives, reply with the single word it sent.', undefined,
      'I\'ve sent the ping to BISHOP-44 (message as "BISHOP-44", lab floor). The message is in its inbox, and I\'ll reply with its single word once the answer arrives.'],
    ['pong', { callsign: 'BISHOP-44', session: receiver.header.id }, 'pong'],
  ])
  assert.deepEqual(turnsOf(receiver, sessions)[1].slice(0, 2), ['Ping from BEOWULF-38 (lab floor). Please reply with the single word you were asked to send.', { callsign: 'BEOWULF-38', session: sender.header.id }])
  assert.deepEqual(turnsOf(receiver, [receiver])[1][1], { callsign: 'BEOWULF-38' })
  assert.deepEqual(receiver.facts.prompts.map(([, origin]) => origin), ['composer', 'peer'])
})

test('a turn holds what Claude did on the way to its answer: its words before each call it made, not the answer again', () => {
  const [[turn]] = Object.values(turnsByConversation(fixture('step-answers')))
  assert.deepEqual(turn.steps.map((s) => (s.t === 'tool' ? [s.tool, s.line, s.outcome] : [s.t, s.t === 'text' ? s.text : ''])), [
    ['text', "Reading the project's package.json to understand the TypeScript setup."],
    ['Read', 'package.json', 'ok'],
    ['text', "Reading the project's tsconfig.json to find the TypeScript target."],
    ['Read', 'tsconfig.json', 'ok'],
  ])
  assert.equal(turn.answer, 'The project uses TypeScript target `es2024`.')
})

test('a tool call says how it ended: failed, or stopped by a denied permission', () => {
  const outcomes = (name: string) => Object.values(turnsByConversation(fixture(name))).flat().flatMap((t) => t.steps.flatMap((s) => (s.t === 'tool' ? [[s.tool, s.outcome]] : [])))
  assert.deepEqual(outcomes('tool-error'), [['Read', 'error']])
  assert.deepEqual(outcomes('permission-denied'), [['Write', 'abandoned']])
})

test('a message a worker sends is a step to the worker that received it, not a tool call', () => {
  const logs = [fixture('peer-sender'), fixture('peer-receiver')]
  const sessions = logs.map((log) => ({ header: log.header, facts: factsOf(log) }))
  const logOf = (id: string) => logs.find((l) => l.header.id === id)!
  const [first] = briefOf(sessions[0], sessions, logOf, 2, callsign)[0].turns
  assert.deepEqual(first.steps.map((s) => (s.t === 'tool' ? s.tool : s.t === 'sent' ? [s.to, s.text] : s.t)), [
    'Skill', 'ToolSearch', 'Bash',
    [{ callsign: 'BISHOP-44', session: sessions[1].header.id }, 'Ping from BEOWULF-38 (lab floor). Please reply with the single word you were asked to send.'],
  ])
})

test('a tool call reads whole by its id: its input as given, the check it met, how it ended', () => {
  const log = fixture('tool-error')
  const [[turn]] = Object.values(turnsByConversation(log))
  const call = turn.steps.find((s) => s.t === 'tool')!
  const read = toolCallOf(log, (call as { id: string }).id)!
  assert.equal(read.tool, 'Read')
  assert.equal(read.outcome, 'error')
  assert.deepEqual(Object.keys(read.input), ['file_path'])
  assert.match(read.error!, /File does not exist/)
  assert.equal(toolCallOf(log, 'toolu_none'), undefined)
})

test('a conversation with turns before those a brief gives says so, and reads whole across the session it resumed', () => {
  const logs = [fixture('resume-source'), fixture('resumed')]
  const sessions = logs.map((log) => ({ header: log.header, facts: factsOf(log) }))
  const logOf = (id: string) => logs.find((l) => l.header.id === id)!
  const [last] = briefOf(sessions[1], sessions, logOf, 1, callsign)
  assert.equal(last.earlier, true)
  const whole = wholeConversation(sessions[1], sessions, logOf, last.id, callsign)!
  assert.equal(whole.earlier, false)
  assert.deepEqual(whole.turns.map((t) => [t.session, t.answer]), [[sessions[0].header.id, 'PONG'], [sessions[1].header.id, 'pong']])
  assert.equal(wholeConversation(sessions[1], sessions, logOf, 'no-such-conversation', callsign), undefined)
})

test('a message to a subagent is its SendMessage call, not a message to a worker', () => {
  const steps = Object.values(turnsByConversation(fixture('subagent-resume'))).flat().flatMap((t) => t.steps)
  assert.equal(steps.some((s) => s.t === 'sent'), false)
  const call = steps.find((s) => s.t === 'tool' && s.tool === 'SendMessage')
  assert.deepEqual(call && call.t === 'tool' && [call.line, call.outcome], ['Ask reader to read more.txt', 'ok'])
})

const dialogInput = {
  questions: [
    { question: 'Which database should the service use?', header: 'Database', options: [{ label: 'SQLite', description: 'one file' }, { label: 'Postgres', description: 'a server' }], multiSelect: false },
    { question: 'Which checks should run?', header: 'Checks', options: [{ label: 'Lint', description: '' }, { label: 'Types', description: '' }], multiSelect: true },
  ],
}

const dialogLog = (outcome: 'answered' | 'unanswered') => {
  const session = { session_id: 's1', cwd: '/work' }
  const at = (t: number, data: Record<string, unknown>): [number, 'h', never] => [t, 'h', data as never]
  return {
    header: { id: 'dialog', project: 'p', cwd: '/work', argv: [], startedAt: 0, cols: 120, rows: 40 },
    events: [
      at(1, { ...session, hook_event_name: 'SessionStart', source: 'startup' }),
      at(2, { text: 'pick', wait: false, origin: { kind: 'composer' }, hook_event_name: 'prompt.submit' }),
      at(3, { ...dialogInput, tool: 'AskUserQuestion', tool_use_id: 'toolu_1', hook_event_name: 'tool.call' }),
      ...(outcome === 'answered'
        ? [
            at(4, { ...session, hook_event_name: 'PostToolUse', tool_name: 'AskUserQuestion', tool_use_id: 'toolu_1', duration_ms: 1, tool_input: { ...dialogInput, answers: { 'Which database should the service use?': 'SQLite', 'Which checks should run?': 'Lint, Types' }, annotations: { 'Which database should the service use?': { notes: 'it is a prototype' } } } }),
            at(5, { tool: 'AskUserQuestion', tool_use_id: 'toolu_1', hook_event_name: 'tower.tool.result' }),
          ]
        : [at(4, { tool: 'AskUserQuestion', tool_use_id: 'toolu_1', hook_event_name: 'tower.tool.abandoned' })]),
      at(6, { answer: 'done', turnId: 't', hook_event_name: 'turn.complete' }),
    ],
  } as unknown as SessionLog
}

test('a question dialog reads as its questions and what was answered, with notes, and says when it was not answered', () => {
  const lines = (outcome: 'answered' | 'unanswered') => Object.values(turnsByConversation(dialogLog(outcome)))[0][0].steps.map((s) => s.t === 'tool' && [s.tool, s.line, s.outcome])
  assert.deepEqual(lines('answered'), [['AskUserQuestion', 'Database: Which database should the service use? → SQLite (it is a prototype) · Checks: Which checks should run? → Lint, Types', 'ok']])
  assert.deepEqual(lines('unanswered'), [['AskUserQuestion', 'Database: Which database should the service use? → unanswered · Checks: Which checks should run? → unanswered', 'abandoned']])
})

test('a tool call reads in full with the input Claude logged once the tool ran, the answers of a dialog among it', () => {
  const answered = toolCallOf(dialogLog('answered'), 'toolu_1')!
  assert.deepEqual(answered.input.answers, { 'Which database should the service use?': 'SQLite', 'Which checks should run?': 'Lint, Types' })
  assert.equal(toolCallOf(dialogLog('unanswered'), 'toolu_1')!.input.answers, undefined)
})

const loggedDialog = (questions: unknown, tool_input?: Record<string, unknown>) => {
  const dialog = dialogLog('unanswered')
  dialog.events = dialog.events.slice(0, 2)
  const hook = (t: number, data: Record<string, unknown>) => dialog.events.push([t, 'h', data as never])
  hook(3, { questions, tool: 'AskUserQuestion', tool_use_id: 'toolu_1', hook_event_name: 'tool.call' })
  if (tool_input) hook(4, { hook_event_name: 'PostToolUse', tool_name: 'AskUserQuestion', tool_use_id: 'toolu_1', duration_ms: 1, tool_input })
  hook(6, { answer: 'done', turnId: 't', hook_event_name: 'turn.complete' })
  return dialog
}

const lineOfDialog = (questions: unknown, tool_input?: Record<string, unknown>) => {
  const [step] = Object.values(turnsByConversation(loggedDialog(questions, tool_input)))[0][0].steps
  return step.t === 'tool' ? step.line : undefined
}

test('review: a call Claude refused before it ran does not cost the session its turns', () => {
  assert.doesNotThrow(() => lineOfDialog('[{"question":"Which?"}]'))
})

test('review: every decision of a four-question dialog stays in its line', () => {
  const questions = ['Storage', 'Rollout', 'Failure', 'Ownership'].map((header) => ({ question: `${header}?`, header }))
  const answers = Object.fromEntries(questions.map((q) => [q.question, `The ${q.header.toLowerCase()} option the user chose, about forty characters`]))
  const line = lineOfDialog(questions, { questions, answers, annotations: {} })!
  assert.ok(line.includes('Ownership: '), line)
})

test('review: a free-text answer of several lines stays one line', () => {
  const questions = [{ question: 'Why?', header: 'Why' }]
  assert.ok(!lineOfDialog(questions, { questions, answers: { 'Why?': 'first\nsecond' }, annotations: {} })!.includes('\n'))
})

test('recorded dialogs: a note on a preview, an Other answer typed in, and one dismissed with Esc', () => {
  const log = fixture('question-dialogs')
  const turns = Object.values(turnsByConversation(log)).flat()
  assert.deepEqual(turns.flatMap((t) => t.steps.map((s) => s.t === 'tool' && [s.line, s.outcome])), [
    ['Fruit: Which fruit? → Apple (sweet and green)', 'ok'],
    ['Color: Which color? → teal, a mix', 'ok'],
    ['Size: Which size? → unanswered', 'abandoned'],
  ])
  const [first] = turns[0].steps
  const call = toolCallOf(log, first.t === 'tool' ? first.id : '')!
  assert.equal((call.input.annotations as Record<string, { notes: string }>)['Which fruit?'].notes, 'sweet and green')
})
