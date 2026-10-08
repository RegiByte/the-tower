import assert from 'node:assert/strict'
import { test } from 'node:test'
import { factsOf } from '../src/bridge/facts.ts'
import { briefOf, turnsByConversation } from '../src/bridge/turns.ts'
import { briefParts } from '../src/shared/brief.ts'
import { CALLSIGNS, callsigns } from '../src/shared/callsign.ts'
import { fixture } from './replay.ts'

const callsign = callsigns(CALLSIGNS)

test('each conversation of a log keeps its own turns, a prompt with the answer that followed', () => {
  const turns = Object.values(turnsByConversation(fixture('clear')))
  assert.deepEqual(turns.map((t) => t.map(({ prompt, answer }) => [prompt, answer])), [
    [['reply with exactly the word PONG and nothing else', 'PONG']],
    [['reply with exactly the word PING and nothing else', 'PING']],
  ])
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
  const rootRef = { id: root.header.id, callsign: callsign(root.header.id), startedAt: 1791198499292 }
  assert.deepEqual(brief.map((b) => [b.session, b.id, b.turns.map((t) => [t.prompt, t.answer])]), [
    [{ id: heir.header.id, callsign: callsign(root.header.id), startedAt: 1791198520998 }, '11111111-2222-4333-8444-555555555555', [
      ['After the clear.', 'Second conversation.'],
      ['Say hello from **the sandbox**.', 'Hello from the sandbox, session 9889.\n\n- a list\n- of things'],
    ]],
    [rootRef, 'c355e388-7151-4cf4-b56a-9db39370e49d', [['Say hello from **the sandbox**.', 'Hello from the sandbox, session 6945.\n\n- a list\n- of things']]],
    [rootRef, '11111111-2222-4333-8444-555555555555', [['After the clear.', 'Second conversation.']]],
  ])
  assert.deepEqual(briefParts(brief).map((p) => [p.session.id, p.n, p.of, p.threads.length]), [[heir.header.id, 2, 2, 1], [root.header.id, 1, 2, 2]])
  assert.deepEqual(briefOf(fork, sessions, logOf, 2, callsign).map((b) => [b.session.id, b.id]), [[fork.header.id, 'c355e388-7151-4cf4-b56a-9db39370e49d']])
})
