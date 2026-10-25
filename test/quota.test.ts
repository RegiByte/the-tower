import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { due, NO_READS, readOf, statusOf, step, type Reads } from '../extensions/quota/status.ts'
import { LEGACY_FIELDS, LEGACY_READS, type ProbeRead } from '../src/bridge/legacy.ts'
import type { Board } from '../src/bridge/board.ts'
import type { RateLimit } from '../src/bridge/facts.ts'
import { accountLimits, NO_LIMITS as NO_STREAM } from '../src/bridge/rate-limits.ts'
import { oldStreams } from '../src/bridge/retention.ts'
import { streamFacts } from '../src/bridge/streams.ts'
import { weeklyBudget } from '../src/bridge/stats.ts'
import { usageAnswer } from '../src/shared/rate-limits.ts'
import { quotaLimits, type ProbeReading } from './quota-reads.ts'

const text = (name: string) => readFileSync(path.join(import.meta.dirname, 'fixtures', name), 'utf8')

const MIN = 60_000
const EVERY = 10 * MIN
const NOW = Date.parse('2026-10-11T12:00:00Z')
const NO_LIMITS = undefined
const WEEKS = [{ kind: 'five_hour', percentUsed: 10 }, { kind: 'seven_day', percentUsed: 40 }]
const measured = (at: number) => ({ at, limits: WEEKS })
const readAt = (at: number, rest: Partial<Reads> = {}): Reads => ({ ...NO_READS, lastAt: at, ...rest })
/** The old stream's facts, as the quota extension's stream reads them from the folder it kept. */
const stream = (name: string) => streamFacts(text(name)).facts
const readingsOf = (t: string) => {
  const { facts, unreadable } = streamFacts(t)
  return { readings: facts.map(([at, , read]): ProbeReading => [at, read as ProbeRead]), unreadable }
}
const foldReads = (facts: ReturnType<typeof stream>) => facts.reduce(step, NO_READS)

test("get_usage answers with the account's limits and costs nothing: no API time, $0", () => {
  const read = usageAnswer(text('probe-usage.out'))
  assert.ok('answer' in read)
  const answer = read.answer as { session: { total_cost_usd: number; total_api_duration_ms: number }; rate_limits: Record<string, unknown> }
  assert.deepEqual([answer.session.total_cost_usd, answer.session.total_api_duration_ms], [0, 0])
  assert.equal(answer.rate_limits.seven_day_opus, undefined, 'nulls are dropped')
  assert.deepEqual(usageAnswer('{"type":"control_response","response":{"subtype":"error","request_id":"usage","error":"unknown subtype"}}\n'), { error: 'unknown subtype' })
  assert.deepEqual(usageAnswer(''), { error: 'claude printed no answer to get_usage' })
})

test("a read's limits are the session's shape, its reset to the second, so a window is one whichever read it; a model's own week is seven_day_<model>", () => {
  const read = usageAnswer(text('probe-usage.out')) as { answer: unknown }
  const facts = quotaLimits([[NOW, { reads: 'claude.usage', ms: 1411, ok: true, answer: read.answer }]])
  assert.deepEqual(facts.rateLimits, {
    at: NOW,
    limits: [
      { kind: 'five_hour', percentUsed: 11, resetsAt: '2026-10-11T15:40:00.000Z' },
      { kind: 'seven_day', percentUsed: 89, resetsAt: '2026-10-11T22:00:00.000Z' },
      { kind: 'seven_day_fable', percentUsed: 0, resetsAt: '2026-10-11T22:00:00.000Z' },
    ],
  })
  assert.deepEqual(facts.limitReadings.seven_day, [[NOW, 89, '2026-10-11T22:00:00.000Z']])
  assert.deepEqual(facts.extraUsage, { at: NOW, enabled: true, used: 0, limit: 1000, currency: 'USD', reached: false }, 'extra usage in currency units, from minor units')
  assert.deepEqual(quotaLimits([[NOW, { reads: 'claude.usage', ms: 1, ok: true, answer: read.answer }], [NOW + MIN, { reads: 'claude.usage', ms: 1, ok: true, answer: {} }]]).extraUsage?.at, NOW, 'an answer without it keeps the last')
})

test('the board reads the newest of the sessions and the probes, and says whose it is', () => {
  const limits = [{ kind: 'seven_day', percentUsed: 88 }]
  const session = { rateLimits: { at: NOW - MIN, limits } }
  const probe = { ...NO_STREAM, rateLimits: { at: NOW, limits: [{ kind: 'seven_day', percentUsed: 89 }] } }
  assert.deepEqual(accountLimits([session], [probe]), { rateLimits: probe.rateLimits!.limits, rateLimitsAt: NOW, rateLimitsFrom: 'probe' })
  assert.deepEqual(accountLimits([session], [NO_STREAM]), { rateLimits: limits, rateLimitsAt: NOW - MIN, rateLimitsFrom: 'session' })
  assert.deepEqual(accountLimits([], []), { rateLimits: [], rateLimitsAt: undefined, rateLimitsFrom: undefined })
  const opus = { kind: 'seven_day_opus', percentUsed: 5 }
  const newerSession = { rateLimits: { at: NOW + MIN, limits } }
  const probeAt = (at: number, week: RateLimit = opus) => [{ ...NO_STREAM, rateLimits: { at, limits: [{ kind: 'seven_day', percentUsed: 89 }, week] } }]
  assert.deepEqual(accountLimits([newerSession], probeAt(NOW)).rateLimits, [...limits, opus], "a limit only the probe reads stays beside a newer session's")
  assert.deepEqual(accountLimits([newerSession], probeAt(NOW + MIN - 16 * MIN)).rateLimits, limits, 'not once the probe has not read for longer than it would at its interval')
  assert.deepEqual(accountLimits([newerSession], probeAt(NOW, { ...opus, resetsAt: new Date(NOW).toISOString() })).rateLimits, limits, 'nor once its window reset')
})

test('a probe is due with no read yet, then once every `every` after its last read', () => {
  assert.equal(due(EVERY, NO_READS, NO_LIMITS, NOW), true)
  assert.equal(due(EVERY, readAt(NOW - 9 * MIN), NO_LIMITS, NOW), false)
  assert.equal(due(EVERY, readAt(NOW - 10 * MIN), NO_LIMITS, NOW), true)
})

test("the quota probe waits while a session's reading is newer than its interval and has every limit the probe read", () => {
  assert.equal(due(EVERY, NO_READS, measured(NOW - 5 * MIN), NOW), false)
  assert.equal(due(EVERY, NO_READS, measured(NOW - 10 * MIN), NOW), true)
  assert.equal(due(EVERY, readAt(NOW - 10 * MIN), NO_LIMITS, NOW), true)
  const modelWeek = readAt(NOW - 10 * MIN, { kinds: [...WEEKS, { kind: 'seven_day_opus', percentUsed: 5 }].map((l) => l.kind) })
  assert.equal(due(EVERY, modelWeek, measured(NOW - MIN), NOW), true, 'no session measures a model of its own week')
})

test('failures in a row back off from the third: 10 min, doubling to an hour; an account with no limits waits 6 h', () => {
  const failed = (fails: number, ago: number) => due(2 * MIN, readAt(NOW - ago, { failsInRow: fails }), NO_LIMITS, NOW)
  assert.equal(failed(2, 2 * MIN), true)
  assert.deepEqual([failed(3, 9 * MIN), failed(3, 10 * MIN)], [false, true])
  assert.deepEqual([failed(4, 19 * MIN), failed(4, 20 * MIN)], [false, true])
  assert.deepEqual([failed(9, 59 * MIN), failed(9, 60 * MIN)], [false, true])
  const unavailable = (ago: number) => due(EVERY, readAt(NOW - ago, { unavailable: true }), NO_LIMITS, NOW)
  assert.deepEqual([unavailable(359 * MIN), unavailable(360 * MIN)], [false, true])
})

test('a last read dated after now (the clock moved back) makes the probe due', () => {
  assert.equal(due(EVERY, readAt(NOW + 60 * MIN), NO_LIMITS, NOW), true)
})

test("a probe's stream, read by a tower: two answers, then three failures; the fold keeps the limits and counts the failures", () => {
  const { readings, unreadable } = readingsOf(text('probe-quota.jsonl'))
  assert.equal(unreadable, 0)
  const at = (i: number) => readings[i][0]
  assert.deepEqual(readings.map(([, r]) => [r.reads, r.ok]), [['claude.usage', true], ['claude.usage', true], ['claude.usage', false], ['claude.usage', false], ['claude.usage', false]])
  const limits = quotaLimits(readings)
  const reads = foldReads(stream('probe-quota.jsonl'))
  assert.deepEqual([reads.lastAt, reads.failsInRow, reads.unavailable], [at(4), 3, false])
  assert.deepEqual(limits.limitReadings, {
    five_hour: [[at(0), 12, '2026-10-11T15:40:00.000Z'], [at(1), 13, '2026-10-11T15:40:00.000Z']],
    seven_day: [[at(0), 89, '2026-10-11T22:00:00.000Z']],
    seven_day_fable: [[at(0), 0, '2026-10-11T22:00:00.000Z']],
  })
  assert.equal(limits.rateLimits?.at, at(1))
  assert.deepEqual([due(2 * MIN, reads, NO_LIMITS, at(4) + 2 * MIN), due(2 * MIN, reads, NO_LIMITS, at(4) + 10 * MIN)], [false, true])
  assert.deepEqual(foldReads(stream('probe-quota.jsonl').slice(0, 2)).failsInRow, 0)
})

test("with no session, the weekly budget is read from the probe's reads", () => {
  const limits = quotaLimits(readingsOf(text('probe-quota.jsonl')).readings)
  const budget = weeklyBudget([], [limits], Date.parse('2026-10-11T12:00:00Z'))
  assert.deepEqual([budget?.percentUsed, budget?.resetsAt, budget?.since, budget?.spent], [89, '2026-10-11T22:00:00.000Z', limits.limitReadings.seven_day[0][0], 0])
})

test('a line that is no JSON costs its own read only: the reads before and after it are kept', () => {
  const [header, first, second, ...rest] = text('probe-quota.jsonl').split('\n')
  const torn = [header, first, second.slice(0, 40), ...rest].join('\n')
  const { readings, unreadable } = readingsOf(torn)
  assert.equal(unreadable, 1)
  assert.deepEqual(readings.map(([, r]) => r.ok), [true, false, false, false])
  assert.deepEqual(readingsOf(['{"stream"', first, ''].join('\n')), { readings: [], unreadable: 2 })
})

test("the quota probe's status says how its stream stands: three failures back off, with why the last failed and when it reads next", () => {
  const facts = stream('probe-quota.jsonl')
  const at = (i: number) => facts[i][0]
  const status = statusOf(EVERY, foldReads(facts), NO_LIMITS)
  assert.deepEqual(
    [status.state, status.lastAt, status.answeredAt, status.failsInRow, status.wait, status.nextAt, status.held],
    ['backoff', at(4), at(1), 3, 10 * MIN, at(4) + 10 * MIN, false],
  )
  assert.equal(status.error, (facts[4][2] as { error: string }).error)
  assert.deepEqual([statusOf(EVERY, foldReads(facts.slice(0, 3)), NO_LIMITS).state, statusOf(EVERY, foldReads(facts.slice(0, 2)), NO_LIMITS).error], ['failing', undefined])
})

test("the quota probe's next read waits for a session's newer reading", () => {
  const reads = readAt(NOW - 9 * MIN)
  assert.deepEqual(statusOf(EVERY, reads, measured(NOW - 2 * MIN)), { ...statusOf(EVERY, reads, NO_LIMITS), nextAt: NOW + 8 * MIN, held: true })
  assert.deepEqual([statusOf(EVERY, NO_READS, NO_LIMITS).state, statusOf(EVERY, NO_READS, NO_LIMITS).nextAt], ['new', 0])
  assert.equal(statusOf(EVERY, readAt(NOW, { unavailable: true }), NO_LIMITS).state, 'unavailable')
  assert.equal(statusOf(EVERY, readAt(NOW, { unavailable: true, failsInRow: 1, error: 'spawn claude ENOENT' }), NO_LIMITS).state, 'failing', 'a failure since says more than the answer before it')
})

test('a read the quota extension writes folds as one the core wrote: u and f beside p', () => {
  const answer = (usageAnswer(text('probe-usage.out')) as { answer: unknown }).answer
  const old = foldReads([[NOW, 'p', { reads: 'claude.usage', ms: 1, ok: true, answer }], [NOW + MIN, 'p', { reads: 'claude.usage', ms: 1, ok: false, error: 'x' }]])
  const now = foldReads([[NOW, 'u', { ms: 1, answer, limits: [{ kind: 'five_hour', percentUsed: 11 }, { kind: 'seven_day', percentUsed: 89 }, { kind: 'seven_day_fable', percentUsed: 0 }], unavailable: false }], [NOW + MIN, 'f', { ms: 1, error: 'x' }]])
  assert.deepEqual(now, old)
  assert.deepEqual(readOf([NOW, 'f', { ms: 1, error: 'x' }]), readOf([NOW, 'p', { reads: 'claude.usage', ms: 1, ok: false, error: 'x' }]))
})

test("LEGACY copies the quota part back to board.probes as 1.88 had it, and GET /probe/quota answers its old shape", () => {
  const facts = stream('probe-quota.jsonl')
  const x = statusOf(EVERY, foldReads(facts), NO_LIMITS)
  const [probe] = LEGACY_FIELDS['board.probes']({ x: { quota: x } }, {} as Board) as Board['probes']
  assert.deepEqual(Object.keys(probe).slice(0, 4), ['name', 'reads', 'every', 'state'])
  assert.deepEqual([probe.name, probe.reads, probe.state, probe.calls], ['quota', 'claude.usage', 'backoff', { run: ['probe/run', { name: 'quota' }] }])
  assert.deepEqual(LEGACY_FIELDS['board.probes']({}, {} as Board), [], 'none while the extension does not run')
  const { request, reply } = LEGACY_READS['probe/<name>']
  assert.deepEqual(request({ name: 'quota' }, { last: 2 }), { params: {}, query: { last: '2' } })
  assert.equal((request({ name: 'mine' }, { last: 2 }) as { code: string }).code, 'not_found')
  const reads = facts.slice(-2).reverse().map((f) => readOf(f)!)
  const view = reply({ reads }, { probes: [probe] } as Board) as { reads: ProbeRead[] }
  assert.deepEqual(view.reads.map((r) => [r.reads, r.ok]), [['claude.usage', false], ['claude.usage', false]])
})

test("Tidy archives a stream's month once it closed more than retention.days ago, never the month still written", () => {
  const months = [
    { file: 'system/probe.quota/2026-09.jsonl', archived: false, bytes: 900 },
    { file: 'system/probe.quota/2026-08.jsonl', archived: true, bytes: 300 },
    { file: 'system/probe.quota/2026-10.jsonl', archived: false, bytes: 100 },
  ]
  const oct = (day: number) => Date.parse(`2026-10-${String(day).padStart(2, '0')}T12:00:00Z`)
  assert.deepEqual(oldStreams(months, 7, oct(8)), [{ file: 'system/probe.quota/2026-09.jsonl', bytes: 900 }])
  assert.deepEqual(oldStreams(months, 14, oct(8)), [])
  assert.deepEqual(oldStreams(months, undefined, oct(30)), [])
  assert.deepEqual(oldStreams(months, 0, oct(1)), [{ file: 'system/probe.quota/2026-09.jsonl', bytes: 900 }])
})
