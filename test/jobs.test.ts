import assert from 'node:assert/strict'
import { test } from 'node:test'
import { jobState, jobsNow, jobsOf, recentJobs } from '../src/bridge/jobs.ts'
import type { StreamFact } from '../src/bridge/streams.ts'

const started = (at: number, id: string): StreamFact => [at, 'started', { id, pid: 100 + at, argv: ['git', 'clone', 'x'], cwd: '/w', owner: 'floors', label: id }]

test('a job is what its facts say: started, asked to stop, ended', () => {
  const [job] = jobsOf([started(1, 'a'), [2, 'cancelled', { id: 'a', by: 'user' }], [3, 'ended', { id: 'a', exit: null, signal: 'SIGTERM' }]])
  assert.deepEqual(job, {
    id: 'a',
    pid: 101,
    argv: ['git', 'clone', 'x'],
    cwd: '/w',
    owner: 'floors',
    label: 'a',
    startedAt: 1,
    cancelled: { by: 'user', at: 2 },
    ended: { exit: null, signal: 'SIGTERM', at: 3 },
  })
})

test("a job's state: ended or cancelled from its facts; without an end, running while the daemon holds it, else lost", () => {
  const [ran, stopped, open] = jobsOf([
    started(1, 'ran'),
    started(2, 'stopped'),
    started(3, 'open'),
    [4, 'ended', { id: 'ran', exit: 1, signal: null }],
    [5, 'cancelled', { id: 'stopped', by: 'user' }],
    [6, 'ended', { id: 'stopped', exit: null, signal: 'SIGTERM' }],
  ])
  const held = new Set(['open'])
  assert.deepEqual([ran, stopped, open].map((j) => jobState(j, held)), ['ended', 'cancelled', 'running'])
  assert.equal(jobState(open, new Set()), 'lost', 'a daemon that restarted holds none of the jobs before it')
  assert.equal(jobState(open, undefined), 'lost', 'no daemon running')
  assert.equal(jobState(ran, undefined), 'ended', 'an end written stays, daemon or not')
})

test('a fact about a job no "started" began, or of a code no daemon writes, fails the fold and says which', () => {
  assert.throws(() => jobsOf([[1, 'ended', { id: 'ghost', exit: 0, signal: null }]]), /"ended" for job "ghost"/)
  assert.throws(() => jobsOf([started(1, 'a'), [2, 'output', { id: 'a' }]]), /fact "output"/)
})

test('the board keeps the jobs running and those over within the last day, newest first, each in its state', () => {
  const day = 86_400_000
  const now = 10 * day
  const jobs = jobsNow(
    jobsOf([
      started(now - 3 * day, 'old'),
      started(now - 2 * day, 'lostOld'),
      started(now - 2 * day + 1, 'longRunning'),
      started(now - 3 * day + 2, 'endedToday'),
      started(now - 1000, 'cancelled'),
      [now - 3 * day + 5, 'ended', { id: 'old', exit: 0, signal: null }],
      [now - 1000, 'ended', { id: 'endedToday', exit: 1, signal: null }],
      [now - 900, 'cancelled', { id: 'cancelled', by: 'user' }],
      [now - 800, 'ended', { id: 'cancelled', exit: null, signal: 'SIGTERM' }],
    ]),
    new Set(['longRunning']),
  )
  assert.deepEqual(
    recentJobs(jobs, now).map((j) => [j.id, j.state, j.exit, j.signal]),
    [
      ['cancelled', 'cancelled', null, 'SIGTERM'],
      ['longRunning', 'running', undefined, undefined],
      ['endedToday', 'ended', 1, null],
    ],
  )
})
