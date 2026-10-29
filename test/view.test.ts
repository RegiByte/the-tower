import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Board } from '../src/bridge/board.ts'
import { HOME, floorOfView, hashOf, mainClass, mainViewOf, sameRoom, viewOf, type MainView } from '../renderers/page/view.js'
import { locationOf } from '../src/shared/views.ts'

const board = {
  floors: [
    {
      id: 'p',
      shelf: [{ label: 'Docs', md: 'docs/*.md' }],
      cards: [{ id: 'w1', shown: [{ at: 100, target: 'https://example.com/a b?x=1#y' }, { at: 200, target: 'docs/a b.md' }] }],
      collections: [{ id: 'drafts', items: [{ id: 'd 1.md' }] }, { id: 'notes', items: [{ id: 'n/1.md' }] }],
    },
  ],
} as unknown as Board

const views: MainView[] = [
  HOME,
  { t: 'worker', id: 'w1', pane: undefined },
  { t: 'worker', id: 'w1', pane: 'brief' },
  { t: 'worker', id: 'w1', pane: 'changes' },
  { t: 'worker', id: 'w1', pane: 'reviews' },
  { t: 'worker', id: 'w1', pane: 'shown:https://example.com/a b?x=1#y' },
  { t: 'worker', id: 'w1', pane: 'shown:docs/a b.md' },
  { t: 'shelf', project: 'p', n: 0, file: undefined },
  { t: 'shelf', project: 'p', n: 0, file: 'docs/a b.md' },
  { t: 'archive', project: 'p' },
  { t: 'policies', project: 'p' },
  { t: 'collection', project: 'p', collection: 'notes' },
  { t: 'draft', project: 'p', id: undefined },
  { t: 'draft', project: 'p', id: 'd 1.md' },
  { t: 'item', project: 'p', collection: 'notes', id: 'n/1.md' },
  { t: 'view', location: { view: 'grid/grid', subject: 'floor:p' } },
  { t: 'view', location: { view: 'grid/grid', subject: 'board' } },
]

test('view: every view the board carries is named by its hash and read back from it', () => {
  for (const v of views) assert.deepEqual(viewOf(hashOf(v).slice(1), board), v, hashOf(v))
})

test('view: a hash naming nothing on the board is the skyline; an unknown id is looked up', () => {
  for (const hash of ['shelf/p/3', 'shelf/q/0', 'archive/q', 'policies/q', 'draft/q', 'kept/p/games', 'kept/p/notes/gone.md']) assert.deepEqual(viewOf(hash, board), HOME, hash)
  assert.deepEqual(viewOf('w9', board), { t: 'lookup', id: 'w9', pane: undefined })
  assert.deepEqual(viewOf('w9/changes', board), { t: 'lookup', id: 'w9', pane: 'changes' })
  assert.deepEqual(viewOf('w1/nonsense', board), { t: 'worker', id: 'w1', pane: undefined })
  assert.equal(hashOf({ t: 'worker', id: 'w1', pane: undefined }), '#w1')
  assert.equal(hashOf({ t: 'arriving', id: 'w9' }), '')
})

test('view: another pane or shelf file is the same place; another worker or kind is not', () => {
  assert.ok(sameRoom({ t: 'worker', id: 'w1', pane: undefined }, { t: 'worker', id: 'w1', pane: 'changes' }))
  assert.ok(sameRoom({ t: 'shelf', project: 'p', n: 0, file: undefined }, { t: 'shelf', project: 'p', n: 0, file: 'docs/a b.md' }))
  assert.ok(!sameRoom({ t: 'worker', id: 'w1', pane: undefined }, { t: 'worker', id: 'w2', pane: undefined }))
  assert.ok(!sameRoom({ t: 'draft', project: 'p', id: undefined }, { t: 'draft', project: 'p', id: 'd 1.md' }))
  assert.ok(!sameRoom({ t: 'archive', project: 'p' }, { t: 'policies', project: 'p' }))
})

test('view: the floor in view and the class of the main pane', () => {
  assert.equal(floorOfView({ t: 'worker', id: 'w1', pane: undefined }, () => 'p'), 'p')
  assert.equal(floorOfView({ t: 'policies', project: 'p' }, () => undefined), 'p')
  assert.equal(floorOfView({ t: 'collection', project: 'p', collection: 'notes' }, () => undefined), 'p')
  assert.equal(floorOfView({ t: 'arriving', id: 'w9' }, () => 'p'), undefined)
  assert.equal(mainClass({ t: 'arriving', id: 'w9' }), mainClass(HOME))
})

test("view: every short form opens what the served locationOf names it as, through the page's route for its core view", () => {
  for (const v of views) {
    const hash = hashOf(v)
    if (hash.startsWith('#v/') || !hash) continue
    assert.deepEqual(mainViewOf(locationOf(hash, board), board), viewOf(hash.slice(1), board), hash)
  }
  for (const hash of ['shelf/p/3', 'archive/q', 'kept/p/notes/gone.md', 'w9/changes', 'w1/nonsense']) assert.deepEqual(mainViewOf(locationOf(hash, board), board), viewOf(hash, board), hash)
})

test('view: a #v/ hash naming a core view opens its route; one naming an extension view, the view case', () => {
  assert.deepEqual(viewOf('v/tower/card/card%3Aw1;tower/changes', board), { t: 'worker', id: 'w1', pane: 'changes' })
  assert.deepEqual(viewOf('v/tower/shelf/shelf%3Ap%2F0/docs%2Fa%20b.md', board), { t: 'shelf', project: 'p', n: 0, file: 'docs/a b.md' })
  assert.deepEqual(viewOf('v/grid/grid/floor%3Ap', board), { t: 'view', location: { view: 'grid/grid', subject: 'floor:p' } })
  assert.equal(floorOfView({ t: 'view', location: { view: 'grid/grid', subject: 'floor:p' } }, () => undefined), 'p')
  assert.ok(!sameRoom({ t: 'view', location: { view: 'grid/grid', subject: 'floor:p' } }, { t: 'view', location: { view: 'grid/grid', subject: 'board' } }))
})
