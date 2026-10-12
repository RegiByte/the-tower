import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { accountLimits, due, NO_READS, probeFacts, probesOf, probeStatus, probeView, readingsOf, usageAnswer, type Probe, type ProbeFacts } from '../src/bridge/probes.ts'
import { oldStreams } from '../src/bridge/retention.ts'
import { weeklyBudget } from '../src/bridge/stats.ts'
import { ConfigError, type Config } from '../src/shared/model.ts'

const text = (name: string) => readFileSync(path.join(import.meta.dirname, 'fixtures', name), 'utf8')

const MIN = 60_000
const QUOTA: Probe = { name: 'quota', reads: 'claude.usage', every: 10 * MIN, off: false }
const NOW = Date.parse('2026-10-11T12:00:00Z')
const NO_LIMITS = { rateLimitsAt: undefined, rateLimitsFrom: undefined }
const readAt = (at: number, rest: Partial<ProbeFacts> = {}): ProbeFacts => ({ ...NO_READS, lastAt: at, ...rest })

test("get_usage answers with the account's limits and costs nothing: no API time, $0", () => {
  const read = usageAnswer(text('probe-usage.out'))
  assert.ok('answer' in read)
  const answer = read.answer as { session: { total_cost_usd: number; total_api_duration_ms: number }; rate_limits: Record<string, unknown> }
  assert.deepEqual([answer.session.total_cost_usd, answer.session.total_api_duration_ms], [0, 0])
  assert.equal(answer.rate_limits.seven_day_opus, undefined, 'nulls are dropped')
  assert.deepEqual(usageAnswer('{"type":"control_response","response":{"subtype":"error","request_id":"usage","error":"unknown subtype"}}\n'), { error: 'unknown subtype' })
  assert.deepEqual(usageAnswer(''), { error: 'claude printed no answer to get_usage' })
})

test("a read's limits are the session's shape, its reset to the second, so a window is one whichever read it", () => {
  const read = usageAnswer(text('probe-usage.out')) as { answer: unknown }
  const facts = probeFacts([[NOW, { reads: 'claude.usage', ms: 1411, ok: true, answer: read.answer }]])
  assert.deepEqual(facts.rateLimits, {
    at: NOW,
    limits: [
      { kind: 'five_hour', percentUsed: 11, resetsAt: '2026-10-11T15:40:00.000Z' },
      { kind: 'seven_day', percentUsed: 89, resetsAt: '2026-10-11T22:00:00.000Z' },
    ],
  })
  assert.deepEqual(facts.limitReadings.seven_day, [[NOW, 89, '2026-10-11T22:00:00.000Z']])
})

test('the board reads the newest of the sessions and the probes, and says whose it is', () => {
  const limits = [{ kind: 'seven_day', percentUsed: 88 }]
  const session = { rateLimits: { at: NOW - MIN, limits } }
  const probe = readAt(NOW, { rateLimits: { at: NOW, limits: [{ kind: 'seven_day', percentUsed: 89 }] } })
  assert.deepEqual(accountLimits([session], [probe]), { rateLimits: probe.rateLimits!.limits, rateLimitsAt: NOW, rateLimitsFrom: 'probe' })
  assert.deepEqual(accountLimits([session], [NO_READS]), { rateLimits: limits, rateLimitsAt: NOW - MIN, rateLimitsFrom: 'session' })
  assert.deepEqual(accountLimits([], []), { rateLimits: [], rateLimitsAt: undefined, rateLimitsFrom: undefined })
})

test('a probe is due with no read yet, then once every `every` after its last read', () => {
  assert.equal(due(QUOTA, NO_READS, NO_LIMITS, NOW), true)
  assert.equal(due(QUOTA, readAt(NOW - 9 * MIN), NO_LIMITS, NOW), false)
  assert.equal(due(QUOTA, readAt(NOW - 10 * MIN), NO_LIMITS, NOW), true)
  assert.equal(due({ ...QUOTA, off: true }, NO_READS, NO_LIMITS, NOW), false)
})

test("the quota probe waits while a session's reading is newer than its interval, and not on its own reading", () => {
  assert.equal(due(QUOTA, NO_READS, { rateLimitsAt: NOW - 5 * MIN, rateLimitsFrom: 'session' }, NOW), false)
  assert.equal(due(QUOTA, NO_READS, { rateLimitsAt: NOW - 10 * MIN, rateLimitsFrom: 'session' }, NOW), true)
  assert.equal(due(QUOTA, readAt(NOW - 10 * MIN), { rateLimitsAt: NOW - 10 * MIN, rateLimitsFrom: 'probe' }, NOW), true)
})

test('failures in a row back off from the third: 10 min, doubling to an hour; an account with no limits waits 6 h', () => {
  const failed = (fails: number, ago: number) => due({ ...QUOTA, every: 2 * MIN }, readAt(NOW - ago, { failsInRow: fails }), NO_LIMITS, NOW)
  assert.equal(failed(2, 2 * MIN), true)
  assert.deepEqual([failed(3, 9 * MIN), failed(3, 10 * MIN)], [false, true])
  assert.deepEqual([failed(4, 19 * MIN), failed(4, 20 * MIN)], [false, true])
  assert.deepEqual([failed(9, 59 * MIN), failed(9, 60 * MIN)], [false, true])
  const unavailable = (ago: number) => due(QUOTA, readAt(NOW - ago, { unavailable: true }), NO_LIMITS, NOW)
  assert.deepEqual([unavailable(359 * MIN), unavailable(360 * MIN)], [false, true])
})

test('a last read dated after now (the clock moved back) makes the probe due', () => {
  assert.equal(due(QUOTA, readAt(NOW + 60 * MIN), NO_LIMITS, NOW), true)
})

test('the core declares the quota probe, on; the config overrides its fields, and a probe the tower cannot run is a config error', () => {
  const config = (probes?: Config['probes']) => ({ argv: ['claude'], env: {}, projects: {}, probes }) as Config
  assert.deepEqual(probesOf(config()), [QUOTA])
  assert.deepEqual(probesOf(config({ quota: { off: true } })), [{ ...QUOTA, off: true }])
  assert.deepEqual(probesOf(config({ quota: { every: '1h' } })), [{ ...QUOTA, every: 60 * MIN }])
  assert.throws(() => probesOf(config({ quota: { every: '30s' } })), (e) => e instanceof ConfigError && /under the floor of 60s/.test(e.message))
  assert.throws(() => probesOf(config({ quota: { every: '10' } })), /"every" takes how often it reads/)
  assert.throws(() => probesOf(config({ mine: { every: '10m' } })), /"reads" takes one of the readers: claude.usage/)
})

test("a probe's stream, read by a tower: two answers, then three failures; the fold keeps the limits and counts the failures", () => {
  const { readings, unreadable } = readingsOf(text('probe-quota.jsonl'))
  assert.equal(unreadable, 0)
  const at = (i: number) => readings[i][0]
  assert.deepEqual(readings.map(([, r]) => [r.reads, r.ok]), [['claude.usage', true], ['claude.usage', true], ['claude.usage', false], ['claude.usage', false], ['claude.usage', false]])
  const facts = probeFacts(readings)
  assert.deepEqual([facts.lastAt, facts.failsInRow, facts.unavailable], [at(4), 3, false])
  assert.deepEqual(facts.limitReadings, {
    five_hour: [[at(0), 12, '2026-10-11T15:40:00.000Z'], [at(1), 13, '2026-10-11T15:40:00.000Z']],
    seven_day: [[at(0), 89, '2026-10-11T22:00:00.000Z']],
  })
  assert.equal(facts.rateLimits?.at, at(1))
  const every2m = { ...QUOTA, every: 2 * MIN }
  assert.deepEqual([due(every2m, facts, NO_LIMITS, at(4) + 2 * MIN), due(every2m, facts, NO_LIMITS, at(4) + 10 * MIN)], [false, true])
  assert.deepEqual(probeFacts(readings.slice(0, 2)).failsInRow, 0)
})

test("with no session, the weekly budget is read from the probe's reads", () => {
  const facts = probeFacts(readingsOf(text('probe-quota.jsonl')).readings)
  const budget = weeklyBudget([], [facts], Date.parse('2026-10-11T12:00:00Z'))
  assert.deepEqual([budget?.percentUsed, budget?.resetsAt, budget?.since, budget?.spent], [89, '2026-10-11T22:00:00.000Z', facts.limitReadings.seven_day[0][0], 0])
})

test('a line that is no JSON costs its own read only: the reads before and after it are kept', () => {
  const [header, first, second, ...rest] = text('probe-quota.jsonl').split('\n')
  const torn = [header, first, second.slice(0, 40), ...rest].join('\n')
  const { readings, unreadable } = readingsOf(torn)
  assert.equal(unreadable, 1)
  assert.deepEqual(readings.map(([, r]) => r.ok), [true, false, false, false])
  assert.deepEqual(readingsOf(['{"stream"', first, ''].join('\n')), { readings: [], unreadable: 2 })
})

test("a probe's status says how its stream stands: three failures back off, with why the last failed and when it reads next", () => {
  const { readings } = readingsOf(text('probe-quota.jsonl'))
  const at = (i: number) => readings[i][0]
  const status = probeStatus(QUOTA, probeFacts(readings), NO_LIMITS)
  assert.deepEqual(
    [status.state, status.lastAt, status.answeredAt, status.failsInRow, status.wait, status.nextAt, status.held],
    ['backoff', at(4), at(1), 3, 10 * MIN, at(4) + 10 * MIN, false],
  )
  assert.equal(status.error, (readings[4][1] as { error: string }).error)
  assert.deepEqual([probeStatus(QUOTA, probeFacts(readings.slice(0, 3)), NO_LIMITS).state, probeStatus(QUOTA, probeFacts(readings.slice(0, 2)), NO_LIMITS).error], ['failing', undefined])
})

test("a probe's next read waits for a session's newer reading, and an off probe has none", () => {
  const facts = readAt(NOW - 9 * MIN)
  assert.deepEqual(probeStatus(QUOTA, facts, { rateLimitsAt: NOW - 2 * MIN, rateLimitsFrom: 'session' }), { ...probeStatus(QUOTA, facts, NO_LIMITS), nextAt: NOW + 8 * MIN, held: true })
  assert.deepEqual([probeStatus(QUOTA, NO_READS, NO_LIMITS).state, probeStatus(QUOTA, NO_READS, NO_LIMITS).nextAt], ['new', 0])
  const off = probeStatus({ ...QUOTA, off: true }, facts, NO_LIMITS)
  assert.deepEqual([off.state, off.nextAt, off.held], ['off', undefined, false])
  assert.equal(probeStatus(QUOTA, readAt(NOW, { unavailable: true }), NO_LIMITS).state, 'unavailable')
  assert.equal(probeStatus(QUOTA, readAt(NOW, { unavailable: true, failsInRow: 1, error: 'spawn claude ENOENT' }), NO_LIMITS).state, 'failing', 'a failure since says more than the answer before it')
})

test("GET /probe/<name> reads the latest reads, newest first, each at its moment", () => {
  const { readings } = readingsOf(text('probe-quota.jsonl'))
  const view = probeView(probeStatus(QUOTA, probeFacts(readings), NO_LIMITS), readings, 2)
  assert.deepEqual(view.reads.map((r) => [r.at, r.ok]), [[readings[4][0], false], [readings[3][0], false]])
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
