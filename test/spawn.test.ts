import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawnClosed, spawnHandlers, type SpawnEffect, type SpawnEvent, type Spawning } from '../src/shared/spawn.ts'
import type { SpawnForm } from '../src/shared/cards.ts'

const h = spawnHandlers<string>()
const form: SpawnForm = { where: 'main', worktree: '', checkout: '/hub', callsign: '', name: '', branch: '', base: '', model: '', effort: '', prompt: 'go' }

/** Runs events from `state` as the loop does, answering the state they leave and every effect but `state`. */
function run(events: SpawnEvent<string>[], state: Spawning<string> = spawnClosed()) {
  const effects: SpawnEffect<string>['type'][] = []
  for (const e of events) {
    for (const f of (h[e.type] as (s: Spawning<string>, e: SpawnEvent<string>, ctx: unknown) => SpawnEffect<string>[])(state, e, undefined)) {
      if (f.type === 'state') state = f.state
      else effects.push(f.type)
    }
  }
  return { state, effects }
}

const open: SpawnEvent<string> = { type: 'open', project: 'p', on: 'draft', text: 'go' }

test('spawn: closing an unstarted form keeps its prompt; a started one closes without keeping', () => {
  assert.deepEqual(run([open, { type: 'cancel' }, { type: 'closed', text: 'go on' }]), { state: { t: 'closed' }, effects: ['show', 'close', 'keep'] })
  const started = run([open, { type: 'start', form }, { type: 'started', reply: { t: 'spawned', id: 's1' } }, { type: 'closed', text: 'go' }])
  assert.deepEqual(started, { state: { t: 'closed' }, effects: ['show', 'draw', 'run', 'draw', 'close', 'started'] })
})

test('spawn: while Start waits nothing closes it but the browser, and a failure comes back on its error', () => {
  const starting = run([open, { type: 'start', form }, { type: 'cancel' }, { type: 'start', form }])
  assert.deepEqual(starting.effects, ['show', 'draw', 'run'])
  const failed = run([{ type: 'failed', message: 'refused' }], starting.state)
  assert.deepEqual(failed, { state: { t: 'editing', project: 'p', on: 'draft', error: 'refused' }, effects: ['draw'] })
  const forced = run([{ type: 'closed', text: 'go' }, { type: 'failed', message: 'refused' }], starting.state)
  assert.deepEqual(forced, { state: { t: 'editing', project: 'p', on: 'draft', error: 'refused' }, effects: ['reshow', 'draw'] })
})
