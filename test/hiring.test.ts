import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hiringHandlers, noHires, type Hiring as HiringOf, type HiringEffect, type HiringEvent } from '../renderers/tower3d/src/hiring.ts'
import type { Board, Card } from '../src/bridge/board.ts'
import type { SpawnForm } from '../src/shared/spawn-form.ts'

type Note = { project: string; id: string }
type Hiring = HiringOf<Note>
type Event = HiringEvent<Note>
type Effect = HiringEffect<Note>
const h = hiringHandlers<Note>()
const empty: Hiring = noHires()

const form: SpawnForm = { where: 'new', worktree: '', checkout: '/hub', callsign: '', name: '', branch: '', base: '', model: '', effort: '', command: '', prompt: '', x: {} }
const note = { project: 'p', id: 'n1' }

/** Runs events from `state` as the loop does, answering the state they leave and every effect but `state`. */
function run(events: Event[], state: Hiring = empty) {
  const effects: Exclude<Effect, { type: 'state' }>[] = []
  for (const e of events) {
    for (const f of (h[e.type] as (h: Hiring, e: Event) => Effect[])(state, e)) {
      if (f.type === 'state') state = f.state
      else effects.push(f)
    }
  }
  return { state, effects }
}

/** The effects' kinds without `draw`, which only picks a callsign and is not what a test about hiring is about. */
const types = (effects: { type: string }[]) => effects.map((f) => f.type).filter((type) => type !== 'draw')
const hire = (project = 'p', on?: typeof note, starting?: string): Event => ({ type: 'hire', project, name: project.toUpperCase(), form, on, starting })
const replied = (id: string, project = 'p'): Event => ({ type: 'replied', project, reply: { t: 'spawned', id } })
/** A board holding one card with `id`, on duty or not. */
const boardWith = (id: string, onDuty: boolean) => ({ floors: [{ id: 'p', cards: [{ id, callsign: 'ODIN-07', onDuty } as Card] }], crews: [] }) as unknown as Board

test('hiring: a second press on a floor hiring starts nothing until the board shows the worker the first started', () => {
  const pressed = run([hire(), hire(), replied('s1'), hire()])
  assert.deepEqual(types(pressed.effects), ['toast', 'run', 'toast', 'started', 'toast'])
  assert.deepEqual(pressed.state, { p: { t: 'arriving', name: 'P', id: 's1' } })
  assert.equal(pressed.effects.filter((f) => f.type === 'run').length, 1)
  const seated = run([{ type: 'board', board: boardWith('s1', true) }, hire()], pressed.state)
  assert.deepEqual(types(seated.effects), ['toast', 'run'])
})

test('hiring: each floor hires on its own, and the floor the dialog starts on takes no hire meanwhile', () => {
  assert.deepEqual(Object.keys(run([hire('p'), hire('q')]).state), ['p', 'q'])
  assert.deepEqual(run([hire('p', undefined, 'p')]), { state: empty, effects: [{ type: 'toast', text: 'Already hiring a worker on P: wait for its desk' }] })
  const opened = run([hire(), { type: 'open', project: 'p', name: 'P', on: undefined, text: '' }, { type: 'open', project: 'q', name: 'Q', on: undefined, text: '' }])
  assert.deepEqual(types(opened.effects), ['toast', 'run', 'toast', 'open'])
  const dialog = run([{ type: 'arriving', project: 'p', name: 'P', id: 's2' }, hire()])
  assert.deepEqual(types(dialog.effects), ['toast'], "the dialog's worker holds the floor until it sits down")
})

test('hiring: a failure, a worker that ended before its desk, or a lost tower unlocks the floor, said in a toast', () => {
  assert.deepEqual(run([hire(), { type: 'failed', project: 'p', message: 'refused' }]).state, empty)
  const ended = run([hire(), replied('s1'), { type: 'board', board: boardWith('s1', false) }])
  assert.deepEqual(ended.state, empty)
  assert.ok(ended.effects.some((f) => f.type === 'toast' && f.text === 'ODIN-07 ended before it reached its desk'))
  const lost = run([hire('p'), hire('q'), replied('s1'), { type: 'lost' }])
  assert.deepEqual(lost.state, empty)
  assert.deepEqual(lost.effects.at(-2), { type: 'toast', text: 'The tower stopped answering while hiring on P, Q: look there once it is back' })
  assert.deepEqual(run([{ type: 'failed', project: 'p', message: 'late' }, replied('s9')]), { state: empty, effects: [] }, 'an answer to a hire no longer held changes nothing')
})

test('hiring: a hire on the carried note hands the note over with the worker it started', () => {
  const started = run([hire('p', note), replied('s1')])
  assert.deepEqual(started.effects.at(-1), { type: 'started', id: 's1', on: note })
})
