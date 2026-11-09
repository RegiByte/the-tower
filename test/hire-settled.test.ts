import assert from 'node:assert/strict'
import { test } from 'node:test'
import { factsOf, type FoldEvent } from '../src/bridge/facts.ts'
import { hireSettled } from '../src/tower/hires.ts'

const HIRE = '20261004-213000-d4f1'
const header = { id: HIRE, project: 'lab', cwd: '/lab', argv: ['claude'], startedAt: Date.UTC(2026, 9, 4, 21, 30), cols: 80, rows: 24 }
const hireFacts = (events: FoldEvent[]) => factsOf({ header, events })
const started = hireFacts([[0.1, 'o', 'a worker\r\n']])
const exited = hireFacts([[0.1, 'o', 'a worker\r\n'], [0.2, 'x', { exitCode: 0 }]])

test('a hire has settled once it is counted: its log held, named in its hirer\'s hires and live', () => {
  assert.equal(hireSettled(HIRE, started, [HIRE], new Set([HIRE])), true)
})

test('a hire has settled once its log holds its exit, though it was never live', () => {
  assert.equal(hireSettled(HIRE, exited, [HIRE], new Set()), true)
})

test('a hire spawned but not live yet, with no exit, has not settled', () => {
  assert.equal(hireSettled(HIRE, started, [HIRE], new Set()), false)
  assert.equal(hireSettled(HIRE, undefined, [HIRE], new Set([HIRE])), false, 'nor one whose log the system does not hold yet')
})

test("a live hire its hirer's log does not name yet has not settled", () => {
  assert.equal(hireSettled(HIRE, started, [], new Set([HIRE])), false)
})
