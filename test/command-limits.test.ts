import assert from 'node:assert/strict'
import { test } from 'node:test'
import { board, type Board } from '../src/bridge/board.ts'
import { factsOf } from '../src/bridge/facts.ts'
import { accountsOf, commandLimits, limitFacts, type LimitFacts } from '../src/bridge/rate-limits.ts'
import { today, weeklyBudget } from '../src/bridge/stats.ts'
import { defaultLimits, floorLimits, limitsOf } from '../src/shared/command-limits.ts'
import { runtimeCommands, type Config, type Runtime } from '../src/shared/model.ts'
import type { RateLimitsReading } from '../src/shared/rate-limits.ts'
import { fixture } from './replay.ts'
import { viewOf } from './view.ts'

const projects = { lab: { name: 'lab', hub: '/lab', repos: [] } }
const TWO: Config = { argv: { work: ['claude'], home: ['claude-home'] }, env: { A: '1' }, projects }
const ONE: Config = { argv: ['claude'], env: {}, projects }

const sessions = ['limits-command-work', 'limits-command-home'].map(fixture).map((log) => ({ header: log.header, facts: factsOf(log) }))
const [work, home] = sessions
const atOf = (s: (typeof sessions)[number]) => s.facts.rateLimits!.at

const WORK_LIMITS = [{ kind: 'five_hour', percentUsed: 12, resetsAt: '2026-11-06T05:00:00.000Z' }, { kind: 'seven_day', percentUsed: 34, resetsAt: '2026-11-12T16:00:00.000Z' }]
const HOME_LIMITS = [{ kind: 'five_hour', percentUsed: 5, resetsAt: '2026-11-06T05:00:00.000Z' }, { kind: 'seven_day', percentUsed: 60, resetsAt: '2026-11-12T16:00:00.000Z' }]

const read = (limits: RateLimitsReading['limits'], command?: string): RateLimitsReading => ({ limits, ...(command !== undefined && { command }) })
const streamOf = (...readings: [at: number, read: RateLimitsReading][]): LimitFacts[] =>
  limitFacts(readings.map(([at, reading]) => [at, 'u', reading]), (_, fact) => fact as RateLimitsReading)

test("two sessions under two named commands fold into two entries, each its own turn's reading", () => {
  const entries = accountsOf(TWO, sessions, []).map(commandLimits)
  assert.deepEqual(entries, [
    { command: 'work', rateLimits: WORK_LIMITS, rateLimitsAt: atOf(work), rateLimitsFrom: 'session', turnLimits: { at: atOf(work), limits: WORK_LIMITS } },
    { command: 'home', rateLimits: HOME_LIMITS, rateLimitsAt: atOf(home), rateLimitsFrom: 'session', turnLimits: { at: atOf(home), limits: HOME_LIMITS } },
  ])
})

test('the board holds an entry per command in argv order, the top-level fields the default command\'s copies', () => {
  const b = board(viewOf(TWO, { sessions }))
  assert.deepEqual(b.limits.map((l) => l.command), ['work', 'home'])
  assert.deepEqual([b.rateLimits, b.rateLimitsAt, b.rateLimitsFrom, b.turnLimits], [WORK_LIMITS, atOf(work), 'session', { at: atOf(work), limits: WORK_LIMITS }])
  const swapped = board(viewOf({ ...TWO, argv: { home: ['claude-home'], work: ['claude'] } }, { sessions }))
  assert.deepEqual(swapped.limits.map((l) => l.command), ['home', 'work'])
  assert.deepEqual(swapped.rateLimits, HOME_LIMITS, 'the default is whichever argv writes first')
})

test('a command with no reading has its entry, empty', () => {
  const b = board(viewOf(TWO, { sessions: [work] }))
  assert.deepEqual(b.limits[1], { command: 'home', rateLimits: [], rateLimitsAt: undefined, rateLimitsFrom: undefined })
})

test('what names no command is the default command\'s, what names one argv lost is no account\'s', () => {
  const unnamed = { ...work, header: { ...work.header, command: undefined } }
  const lost = { ...home, header: { ...home.header, command: 'gone' } }
  const stream = streamOf([1, read([{ kind: 'seven_day', percentUsed: 1 }])], [2, read([{ kind: 'seven_day', percentUsed: 2 }], 'gone')])
  const [first, second] = accountsOf(TWO, [unnamed, lost], stream)
  assert.deepEqual([first.sessions, first.streams.map((s) => s.command)], [[unnamed], [undefined]])
  assert.deepEqual([second.sessions, second.streams], [[], []])
})

test('a stream keeps each command\'s readings apart: no climb between two accounts, each extra usage its own', () => {
  const resetsAt = '2026-11-12T16:00:00.000Z'
  const extraUsage = { enabled: true, used: 1, limit: 10, currency: 'USD', reached: false }
  const stream = streamOf(
    [10, read([{ kind: 'seven_day', percentUsed: 20, resetsAt }])],
    [20, { ...read([{ kind: 'seven_day', percentUsed: 70, resetsAt }], 'home'), extraUsage }],
    [30, read([{ kind: 'seven_day', percentUsed: 21, resetsAt }])],
  )
  assert.deepEqual(stream.map((s) => s.command), ['home', undefined])
  assert.deepEqual(stream.find((s) => s.command === undefined)?.rises.seven_day, [[10, 30, 1, resetsAt]])
  assert.deepEqual(stream.find((s) => s.command === 'home')?.rises, {})
  const entries = accountsOf(TWO, [], stream).map(commandLimits)
  assert.deepEqual(entries.map((e) => [e.command, e.rateLimitsFrom, e.rateLimits[0].percentUsed, e.extraUsage?.at]), [['work', 'probe', 21, undefined], ['home', 'probe', 70, 20]])
})

test("a limit only the other source reads is carried within one command, never across", () => {
  const opus = { kind: 'seven_day_opus', percentUsed: 9 }
  const stream = streamOf([atOf(work) - 60_000, read([opus], 'work')], [atOf(home) - 60_000, read([{ ...opus, percentUsed: 80 }], 'home')])
  const entries = accountsOf(TWO, sessions, stream).map(commandLimits)
  assert.deepEqual(entries.map((e) => e.rateLimits), [[...WORK_LIMITS, opus], [...HOME_LIMITS, { ...opus, percentUsed: 80 }]])
})

test("a single-command system's one entry holds every reading, named or not, and names no command", () => {
  const b = board(viewOf(ONE, { sessions }))
  const newest = atOf(work) > atOf(home) ? work : home
  const { rateLimits, rateLimitsAt, rateLimitsFrom, turnLimits, extraUsage } = b
  assert.deepEqual(b.limits, [{ rateLimits, rateLimitsAt, rateLimitsFrom, turnLimits, ...(extraUsage && { extraUsage }) }])
  assert.deepEqual(rateLimits, newest.facts.rateLimits!.limits)
  assert.equal('command' in b.limits[0], false)
})

test('the weekly budget is the default command\'s', () => {
  const now = atOf(home) + 1000
  const b = board(viewOf(TWO, { sessions, now }))
  assert.equal(b.today.budget?.percentUsed, 34)
  assert.deepEqual(b.today, today(sessions, weeklyBudget([work], [], now), now))
})

test('limitsOf, defaultLimits and floorLimits find an entry; a floor that names none has the default', () => {
  const entry = (command?: string) => ({ ...(command && { command }), rateLimits: [] })
  const two = { limits: [entry('work'), entry('home')] } as Pick<Board, 'limits'>
  assert.equal(limitsOf(two, 'home'), two.limits[1])
  assert.equal(limitsOf(two, 'gone'), undefined)
  assert.equal(defaultLimits(two), two.limits[0])
  assert.equal(floorLimits(two, { command: 'home' }), two.limits[1])
  assert.equal(floorLimits(two, {}), two.limits[0])
  const one = { limits: [entry()] } as Pick<Board, 'limits'>
  assert.equal(defaultLimits(one), one.limits[0])
  assert.equal(floorLimits(one, {}), one.limits[0])
})

test('runtimeCommands: every command in order with the env, none named for the single array, an unknown runtime refused', () => {
  assert.deepEqual(runtimeCommands(TWO, 'claude'), [{ name: 'work', argv: ['claude'], env: { A: '1' } }, { name: 'home', argv: ['claude-home'], env: { A: '1' } }])
  assert.deepEqual(runtimeCommands(ONE, 'claude'), [{ argv: ['claude'], env: {} }])
  assert.throws(() => runtimeCommands(ONE, 'codex' as Runtime), /runtime "codex" is none the tower knows: it runs claude/)
})
