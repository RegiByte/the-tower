import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Job } from '../src/bridge/jobs.ts'
import type { StreamFact } from '../src/bridge/streams.ts'
import { adoptCalls, asksOf, carriesCredentials, clonesOf, holding, NO_CLONES, step, type ClonesState } from '../extensions/floors/clones.ts'

const DAY = 86_400_000
const job = (id: string, rest: Partial<Job>): Job => ({ id, owner: 'floors', label: `Clone ${id}`, argv: ['git', 'clone'], cwd: '/code', state: 'running', startedAt: 1_000, ...rest })
const fold = (facts: StreamFact[]): ClonesState => facts.reduce(step, NO_CLONES)
const started = (j: string, id: string, at = 1_000): StreamFact => [at, 's', { job: j, id, name: id, url: `https://example.com/${id}.git`, into: `/code/${id}` }]

test('the trigger adopts each cloned clone once, and never again after the floor was added, refused or dismissed', () => {
  const jobs = [job('j1', { state: 'ended', exit: 0, endedAt: 2_000 }), job('j2', { state: 'ended', exit: 0, endedAt: 2_000 }), job('j3', { state: 'running' })]
  const before = fold([started('j1', 'a'), started('j2', 'b'), started('j3', 'c')])
  assert.deepEqual(adoptCalls(clonesOf(before, jobs, 'floors')), [{ verb: 'floors/adopt', input: { job: 'j1' } }, { verb: 'floors/adopt', input: { job: 'j2' } }])
  const after = fold([started('j1', 'a'), started('j2', 'b'), started('j3', 'c'), [3_000, 'a', { job: 'j1', project: 'a' }], [3_000, 'r', { job: 'j2', message: 'taken' }]])
  assert.deepEqual(adoptCalls(clonesOf(after, jobs, 'floors')), [], 'a floor removed by hand after it was added is not added back')
})

test("a clone holds its id and folder while running, while its floor is still to add, and before the board carries its job", () => {
  const state = fold([started('j1', 'run'), started('j2', 'done'), started('j3', 'failed'), started('j4', 'fresh', 5_000), started('j5', 'old', 5_000 - 2 * DAY)])
  const jobs = [job('j1', {}), job('j2', { state: 'ended', exit: 0, endedAt: 2_000 }), job('j3', { state: 'ended', exit: 128, endedAt: 2_000 })]
  assert.deepEqual(holding(state, jobs, 'floors', 5_000).map((c) => c.id).sort(), ['done', 'fresh', 'run'])
})

test("a clone's ask follows what its job came to: running, refused, failed, lost; none once added, after a refusal too, or dismissed", () => {
  const state = fold([
    started('j1', 'a'),
    started('j2', 'b'),
    started('j3', 'c'),
    started('j4', 'd'),
    started('j5', 'e'),
    started('j7', 'g'),
    [3_000, 'r', { job: 'j2', message: 'taken' }],
    [3_000, 'd', { job: 'j5' }],
    [3_000, 'r', { job: 'j7', message: 'taken' }],
    [4_000, 'a', { job: 'j7', project: 'g' }],
  ])
  const jobs = [
    job('j1', {}),
    job('j2', { state: 'ended', exit: 0, endedAt: 2_000 }),
    job('j3', { state: 'ended', exit: 128, endedAt: 2_000 }),
    job('j4', { state: 'lost' }),
    job('j5', { state: 'ended', exit: 1, endedAt: 2_000 }),
    job('j6', { owner: 'someone-else' }),
    job('j7', { state: 'ended', exit: 0, endedAt: 2_000 }),
  ]
  const asks = asksOf(clonesOf(state, jobs, 'floors'))
  assert.deepEqual(
    asks.map((a) => [a.key, a.actions.map((x) => x.words?.label)]),
    [
      ['j1', ['Stop', 'Watch']],
      ['j2', ['Add as floor', 'Dismiss']],
      ['j3', ['Remove', 'Retry', 'Dismiss']],
      ['j4', ['Remove', 'Retry', 'Dismiss']],
    ],
  )
})

test('a URL carrying credentials is one with a password, or any user over http(s)', () => {
  assert.equal(carriesCredentials('https://u:p@example.com/r.git'), true)
  assert.equal(carriesCredentials('https://token@example.com/r.git'), true)
  assert.equal(carriesCredentials('https://example.com/r.git'), false)
  assert.equal(carriesCredentials('ssh://git@example.com/r.git'), false)
  assert.equal(carriesCredentials('git@example.com:o/r.git'), false)
})
