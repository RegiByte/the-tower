import assert from 'node:assert/strict'
import { test } from 'node:test'
import { factsOf } from '../src/bridge/facts.ts'
import { outsideUse } from '../src/bridge/stats.ts'
import { probeFacts, type ProbeReading } from '../src/bridge/probes.ts'
import { fixture } from './replay.ts'

test('a session that exited mid-turn holds no climb after its exit', () => {
  const log = fixture('clear')
  const cut = log.events.findIndex((e) => e[1] === 'h' && (e[2] as { hook_event_name?: string }).hook_event_name === 'turn.start')
  assert.ok(cut >= 0, 'the fixture starts a turn')
  const t = log.events[cut][0] as number
  const killed = { ...log, events: [...log.events.slice(0, cut + 1), [t + 1, 'x', { code: 0 }]] } as typeof log
  const facts = factsOf(killed)
  assert.notEqual(facts.turnStartedAt, undefined, 'the cut turn is still open in the facts after the exit')
  const start = log.header.startedAt
  const DAY = 86_400_000
  const resetsAt = '2026-10-11T22:00:00.000Z'
  const read = (at: number, utilization: number): ProbeReading => [at, { reads: 'claude.usage', ms: 1000, ok: true, answer: { rate_limits: { seven_day: { utilization, resets_at: resetsAt } } } }]
  const probe = probeFacts([read(start + 2 * DAY, 20), read(start + 2 * DAY + 3_600_000, 25)])
  assert.equal(outsideUse([{ header: log.header, facts }], [probe], () => true), 5, 'a climb two days after the session exited is outside use')
})
