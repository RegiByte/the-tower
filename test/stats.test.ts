import assert from 'node:assert/strict'
import { test } from 'node:test'
import { factsOf, PROMPTED_BY, type Session } from '../src/bridge/facts.ts'
import { conversationsOf } from '../src/bridge/conversation.ts'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { extensionOf, landed as landing, parseLog, type RepoLanded } from '../src/bridge/landed.ts'
import { bucketStart, pace, stats, today, weeklyBudget } from '../src/bridge/stats.ts'
import { fixture } from './replay.ts'

const session = (name: string): Session => {
  const log = fixture(name)
  return { header: log.header, facts: factsOf(log) }
}

const close = (actual: number | undefined, expected: number) => assert.ok(Math.abs(actual! - expected) < 1e-9, `${actual} ≉ ${expected}`)

test('a /clear starts its new conversation from zero: the reading after it counts in full though it is higher than the one before', () => {
  const { header, facts } = session('clear')
  const at = (t: number) => header.startedAt + t * 1000
  assert.deepEqual(facts.spend, [[at(7.092), 0.023221000000000002], [at(13.166), 0.025977399999999998]])
  assert.deepEqual(facts.turnSpans.map(([a, s]) => [a, +s.toFixed(3)]), [[at(5.848), 1.241], [at(11.867), 1.291]])
  assert.deepEqual(facts.waits.map(([a, s]) => [a, +s.toFixed(3)]), [[at(11.839), 4.766]])
  assert.deepEqual(facts.prompts, [[at(5.798), 'composer'], [at(11.839), 'composer']])
  assert.deepEqual(facts.tokens.map(([a, model, t]) => [a, model, t]), [
    [at(7.048), 'claude-haiku-4-5-20251001', { input: 10, output: 48, cacheRead: 25240, cacheWrite: 9743 }],
    [at(13.13), 'claude-haiku-4-5-20251001', { input: 10, output: 55, cacheRead: 29224, cacheWrite: 10910 }],
  ])
  assert.deepEqual(facts.limitReadings.seven_day, [[at(5.978), 17, '2026-10-04T22:00:00.000Z']])
})

test("a resume carries its conversation's cost: its first reading adds nothing, and with its source it spends the conversation's total", () => {
  const source = session('resume-source')
  const resumed = session('resumed')
  assert.deepEqual(source.facts.spend, [[source.header.startedAt + 15731, 0.023257]])
  assert.deepEqual(resumed.facts.spend.map(([a, usd]) => [a, +usd.toFixed(7)]), [[resumed.header.startedAt + 16523, 0.0149873]])
  close([source, resumed].flatMap((s) => s.facts.spend).reduce((a, [, usd]) => a + usd, 0), 0.0382443)
  assert.deepEqual(resumed.facts.waits, [])
})

test("a subagent's steps count their tokens, and a turn its notification starts is no wait on the user", () => {
  const { facts } = session('subagent-background')
  assert.equal(facts.tokens.length, 7)
  assert.equal(facts.tokens.filter(([, , t]) => t.output === 194 || t.output === 117).length, 2)
  assert.equal(facts.subagentRuns.length, 1)
  assert.equal(facts.subagentRuns[0].id, undefined)
  assert.equal(facts.turnSpans.length, 2)
  assert.deepEqual(facts.waits, [])
})

test("each subagent is a run: its spawn names its loop, whose steps add its tokens and whose turn's end ends it", () => {
  const log = fixture('subagent-fork')
  const at = (t: number) => log.header.startedAt + t * 1000
  const midway = factsOf({ header: log.header, events: log.events.filter(([t]) => t < 35.5) })
  assert.deepEqual(midway.subagentRuns.map((run) => [run.id, run.endedAt]), [['a6cd8e69660dcac39', at(35.335)], ['a3e6404c3b4b12502', undefined]])
  assert.deepEqual(factsOf(log).subagentRuns, [
    {
      id: 'a6cd8e69660dcac39', type: 'fork', description: 'Read facts.txt and report', background: true, parent: undefined, model: 'claude-haiku-5-5',
      startedAt: at(32.574), endedAt: at(35.335), ended: 'answer', tokens: { input: 6, output: 274, cacheRead: 75624, cacheWrite: 3086 },
    },
    {
      id: 'a3e6404c3b4b12502', type: 'general-purpose', description: 'Read more.txt and report', background: true, parent: undefined, model: 'claude-haiku-5-5',
      startedAt: at(32.933), endedAt: at(35.792), ended: 'answer', tokens: { input: 4, output: 253, cacheRead: 33534, cacheWrite: 36997 },
    },
  ])
})

test('a subagent stopped mid-turn ends aborted', () => {
  const log = fixture('subagent-stopped')
  const [run] = factsOf(log).subagentRuns
  assert.deepEqual([run.id, run.endedAt, run.ended], ['a879d6a43ea150891', log.header.startedAt + 17315, 'aborted'])
})

test('a permission dialog is an ask, and a failed tool call a failure', () => {
  assert.equal(session('permission-answered').facts.asks.length, 1)
  assert.equal(session('tool-error').facts.failures.length, 1)
})

test('stats over a window: summaries, buckets, the hours of the day and the weekly budget', () => {
  const sessions = ['resume-source', 'resumed', 'clear'].map(session)
  const from = bucketStart(sessions[0].header.startedAt, 'day')
  const now = Date.parse('2026-10-04T12:00:00Z')
  const s = { ...stats(sessions, {}, { from, to: from + 2 * 86400_000, bucket: 'day' }), budget: weeklyBudget(sessions, now) }
  const sum = s.all.summary
  assert.equal(s.buckets.length, 2)
  assert.deepEqual([sum.sessions, sum.worked, sum.resumes, sum.turns], [3, 3, 1, 4])
  close(sum.spend, 0.023257 + 0.0149873 + 0.023221000000000002 + 0.025977399999999998)
  assert.deepEqual(sum.prompts, { composer: 4 })
  assert.deepEqual(sum.tokens, { 'claude-haiku-4-5-20251001': { input: 40, output: 248, cacheRead: 114697, cacheWrite: 35910 } })
  assert.equal(sum.waits.n, 1)
  assert.deepEqual(s.all.series.turns, [4, 0])
  assert.deepEqual(s.all.series.sessions, [3, 0])
  close(s.all.series.spend[0], sum.spend)
  assert.equal(s.all.byHour.turns.reduce((a, n) => a + n, 0), 4)
  assert.equal(s.all.peak.turns, 1)
  close(sum.busyHours, sum.agentHours)
  assert.equal(sum.atOnce, 1)
  assert.deepEqual(s.all.series.peak, [1, 0])
  assert.deepEqual(Object.keys(s.projects), ['t'])
  assert.equal(s.budget?.percentUsed, 17)
  close(s.budget!.spent, 0.0382443)
  close(s.budget!.usdPerPercent!, 0.0382443)
  close(s.budget!.usdLeft!, 83 * 0.0382443)
  assert.equal(weeklyBudget(sessions, Date.parse('2026-10-05T00:00:00Z')), undefined)
  const day = today(sessions, sessions[2].header.startedAt + 20_000)
  close(day.spend, sum.spend)
  assert.deepEqual(day.waits, { n: 1, p50: sum.waits.p50 })
})

const logged = () => parseLog(readFileSync(path.join(import.meta.dirname, 'fixtures', 'landed.gitlog'), 'utf8'))
/** The fixture's landings, its merge bringing one commit besides itself (`rev-list --count M^1..M` answered 2). */
const landed = () => logged().map((c) => landing(c, c.parents.length > 1 ? 2 : 1))

test("the first-parent log as landings: a merge's lines are its whole branch's against the first parent, a binary file changes none, a rename is named after it", () => {
  assert.deepEqual(logged().map((c) => [c.at / 1000, c.parents.length, c.files]), [
    [1791288000, 1, [['docs.md', 0, 0]]],
    [1791284400, 2, [['a.ts', 2, 1], ['logo.png', 0, 0]]],
    [1791277200, 1, [['README.md', 1, 0]]],
    [1791194400, 0, [['a.ts', 3, 0]]],
  ])
  assert.deepEqual(landed().map((c) => [c.merge, c.commits]), [[false, 1], [true, 2], [false, 1], [false, 1]])
  assert.deepEqual(['src/a.ts', 'Makefile', '.env', 'docs/x.test.ts'].map(extensionOf), ['.ts', 'Makefile', '.env', '.ts'])
})

test('what landed, per project and for all: a repo read twice counts once, each landing in the bucket it reached the branch', () => {
  const repo: RepoLanded = { dir: '/r', branch: 'origin/main', commits: landed() }
  const from = bucketStart(1791194400_000, 'day')
  const q = { from, to: from + 3 * 86400_000, bucket: 'day' as const }
  const s = stats([], { a: [repo], b: [repo, repo, { dir: '/none', branch: undefined, commits: [] }] }, q)
  const git = s.all.summary.git
  assert.deepEqual([git.commits, git.merges, git.added, git.removed], [5, 1, 6, 1])
  assert.deepEqual(git.byExtension, { '.md': { added: 1, removed: 0 }, '.ts': { added: 5, removed: 1 }, '.png': { added: 0, removed: 0 } })
  assert.deepEqual(s.projects.b.summary.git.repos, [{ dir: '/r', branch: 'origin/main' }, { dir: '/none' }])
  assert.equal(s.projects.b.summary.git.commits, 5)
  const day = (at: number) => s.buckets.indexOf(bucketStart(at * 1000, 'day'))
  const expected = s.buckets.map(() => 0)
  for (const [at, n] of [[1791288000, 1], [1791284400, 2], [1791277200, 1], [1791194400, 1]]) expected[day(at)] += n
  assert.deepEqual(s.all.series.commits, expected)
  assert.equal(s.all.series.added.reduce((a, n) => a + n, 0), 6)
  assert.equal(stats([], { a: [repo] }, { from: from + 86400_000 * 3, to: from + 86400_000 * 4, bucket: 'day' }).all.summary.git.commits, 0)
})

test('the weekly budget pace: the even daily spend to the reset, and when today\'s rate runs it out', () => {
  const day = Date.parse('2026-10-08T00:00:00Z')
  const now = day + 10 * 3600_000
  const resetsAt = new Date(now + 2 * 86400_000).toISOString()
  const left = { resetsAt, usdLeft: 400 }
  assert.deepEqual(pace(left, { since: day, spend: 0 }, now), { perDay: 200, runsOutAt: undefined })
  assert.deepEqual(pace(left, { since: day, spend: 50 }, now), { perDay: 200, runsOutAt: undefined })
  assert.deepEqual(pace(left, { since: day, spend: 200 }, now), { perDay: 200, runsOutAt: now + 20 * 3600_000 })
  assert.equal(pace({ resetsAt, usdLeft: undefined }, { since: day, spend: 200 }, now), undefined)
  assert.equal(pace({ resetsAt: new Date(now + 1800_000).toISOString(), usdLeft: 400 }, { since: day, spend: 0 }, now)?.perDay, 400)
})

test("a prompt a worker typed through the tower is the worker's: it answers no wait, and the mark is spent on it", () => {
  const log = fixture('tool-turn')
  const at = log.events.findIndex((e) => e[0] === 39.495)
  const marked = { ...log, events: [...log.events.slice(0, at), [39.4, 'h', { hook_event_name: PROMPTED_BY, by: 'hirer' }], ...log.events.slice(at)] as typeof log.events }
  const facts = factsOf(marked)
  assert.deepEqual(facts.prompts.map(([, origin]) => origin), ['composer', 'peer'])
  assert.deepEqual(facts.waits, [])
  assert.equal(facts.promptedBy, undefined)
  assert.deepEqual(factsOf(log).waits.map(([, seconds]) => +seconds.toFixed(3)), [21.197])
  assert.equal(conversationsOf(marked).at(-1)?.prompt, conversationsOf(log).at(-1)?.prompt)
})
