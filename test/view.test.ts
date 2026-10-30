import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Board } from '../src/bridge/board.ts'
import { HOME, floorOfView, hashOf, mainClass, mainViewOf, sameRoom, viewOf, type MainView } from '../renderers/page/view.js'
import { locationOf } from '../src/shared/views.ts'
import { subjectAt } from '../src/shared/subjects.ts'

const board = {
  floors: [
    {
      id: 'p',
      shelf: [{ label: 'Docs', md: 'docs/*.md' }],
      cards: [{ id: 'w1', shown: [{ kind: 'url', at: 100, target: 'https://example.com/a b?x=1#y' }, { kind: 'file', at: 200, target: 'docs/a b.md' }] }],
      collections: [{ id: 'drafts', items: [{ id: 'd 1.md' }] }, { id: 'notes', items: [{ id: 'n/1.md' }, { id: 'run.py' }, { id: 'clip.webm' }, { id: 'blob.bin' }] }],
    },
  ],
} as unknown as Board

const has = (key: string) => subjectAt(board, key) !== undefined

const worker = (pane?: { view: string; subject?: string }): MainView => ({ t: 'view', location: { view: 'tower/card', subject: 'card:w1', ...(pane && { pane }) } })

const views: MainView[] = [
  HOME,
  worker(),
  worker({ view: 'tower/brief' }),
  worker({ view: 'tower/changes' }),
  worker({ view: 'reviews/thread' }),
  worker({ view: 'tower/terminal' }),
  worker({ view: 'tower/link', subject: 'shown:w1/100' }),
  worker({ view: 'tower/document', subject: 'shown:w1/200' }),
  worker({ view: 'tower/text', subject: 'shown:w1/200' }),
  { t: 'view', location: { view: 'tower/shelf', subject: 'shelf:p/0' } },
  { t: 'view', location: { view: 'tower/shelf', subject: 'shelf:p/0', args: ['docs/a b.md'] } },
  { t: 'view', location: { view: 'tower/archive', subject: 'floor:p' } },
  { t: 'view', location: { view: 'policies/policies', subject: 'floor:p' } },
  { t: 'view', location: { view: 'tower/collection', subject: 'collection:p/notes' } },
  { t: 'view', location: { view: 'drafts/editor', subject: 'collection:p/drafts' } },
  { t: 'view', location: { view: 'drafts/editor', subject: 'item.drafts:p/d 1.md' } },
  { t: 'view', location: { view: 'tower/document', subject: 'item.notes:p/n/1.md' } },
  { t: 'view', location: { view: 'tower/text', subject: 'item.notes:p/n/1.md' } },
  { t: 'view', location: { view: 'tower/text', subject: 'item.notes:p/run.py' } },
  { t: 'view', location: { view: 'tower/video', subject: 'item.notes:p/clip.webm' } },
  { t: 'view', location: { view: 'tower/file', subject: 'item.notes:p/blob.bin' } },
  { t: 'view', location: { view: 'tower/document', subject: 'item.drafts:p/d 1.md' } },
  { t: 'view', location: { view: 'grid/grid', subject: 'floor:p' } },
  { t: 'view', location: { view: 'grid/grid', subject: 'board' } },
]

test('view: every view the board carries is named by its hash and read back from it', () => {
  for (const v of views) assert.deepEqual(viewOf(hashOf(v, board).slice(1), board, has), v, hashOf(v, board))
})

test('view: a hash naming nothing on the board is the skyline; an unknown id is looked up', () => {
  for (const hash of ['shelf/p/3', 'shelf/q/0', 'archive/q', 'policies/q', 'draft/q', 'draft/p/gone.md', 'kept/p/games', 'kept/p/notes/gone.md']) assert.deepEqual(viewOf(hash, board, has), HOME, hash)
  assert.deepEqual(viewOf('w9', board, has), { t: 'lookup', id: 'w9', location: { view: 'tower/card', subject: 'card:w9' } })
  assert.deepEqual(viewOf('w9/changes', board, has), { t: 'lookup', id: 'w9', location: { view: 'tower/card', subject: 'card:w9', pane: { view: 'tower/changes' } } })
  assert.deepEqual(viewOf('w1/nonsense', board, has), worker())
  assert.equal(hashOf(worker(), board), '#w1')
  assert.equal(hashOf(worker({ view: 'tower/changes' }), board), '#w1/changes')
  assert.equal(hashOf(worker({ view: 'tower/document', subject: 'shown:w1/200' }), board), '#w1/shown%3Adocs%2Fa%20b.md')
  assert.equal(hashOf(worker({ view: 'tower/text', subject: 'shown:w1/200' }), board), '#v/tower/card/card%3Aw1;tower/text/shown%3Aw1%2F200', 'a showing opened by another view than its type picks keeps the long form')
  assert.equal(hashOf({ t: 'arriving', id: 'w9' }, board), '')
})

test('view: another pane or shelf file is the same place; another worker or kind is not', () => {
  assert.ok(sameRoom(worker(), worker({ view: 'tower/changes' })))
  const shelf = { view: 'tower/shelf', subject: 'shelf:p/0' }
  assert.ok(sameRoom({ t: 'view', location: shelf }, { t: 'view', location: { ...shelf, args: ['docs/a b.md'] } }))
  assert.ok(sameRoom(HOME, { t: 'view', location: { view: 'tower/skyline', subject: 'board' } }))
  assert.ok(!sameRoom(worker(), { t: 'view', location: { view: 'tower/card', subject: 'card:w2' } }))
  assert.ok(!sameRoom({ t: 'view', location: { view: 'drafts/editor', subject: 'collection:p/drafts' } }, { t: 'view', location: { view: 'drafts/editor', subject: 'item.drafts:p/d 1.md' } }))
  assert.ok(!sameRoom({ t: 'view', location: { view: 'tower/archive', subject: 'floor:p' } }, { t: 'view', location: { view: 'policies/policies', subject: 'floor:p' } }))
})

test('view: the floor in view and the class of the main pane', () => {
  assert.equal(floorOfView(worker(), () => 'p'), 'p')
  assert.equal(floorOfView({ t: 'view', location: { view: 'policies/policies', subject: 'floor:p' } }, () => undefined), 'p')
  assert.equal(floorOfView({ t: 'view', location: { view: 'tower/collection', subject: 'collection:p/notes' } }, () => undefined), 'p')
  assert.equal(floorOfView({ t: 'arriving', id: 'w9' }, () => 'p'), undefined)
  assert.equal(mainClass({ t: 'arriving', id: 'w9' }), mainClass(HOME))
})

test('view: every short form opens what the served locationOf names it as, and the page writes it back', () => {
  for (const v of views) {
    const hash = hashOf(v, board)
    if (hash.startsWith('#v/') || !hash) continue
    assert.deepEqual(mainViewOf(locationOf(hash, board), has), viewOf(hash.slice(1), board, has), hash)
  }
  for (const hash of ['shelf/p/3', 'archive/q', 'kept/p/notes/gone.md', 'w9/changes', 'w1/nonsense']) assert.deepEqual(mainViewOf(locationOf(hash, board), has), viewOf(hash, board, has), hash)
})

test('view: a #v/ hash opens the view it names, written back short where it has a short form', () => {
  assert.deepEqual(viewOf('v/tower/card/card%3Aw1;tower/changes', board, has), worker({ view: 'tower/changes' }))
  assert.equal(hashOf(viewOf('v/tower/card/card%3Aw1;tower/changes', board, has) as MainView, board), '#w1/changes')
  assert.deepEqual(viewOf('v/tower/shelf/shelf%3Ap%2F0/docs%2Fa%20b.md', board, has), { t: 'view', location: { view: 'tower/shelf', subject: 'shelf:p/0', args: ['docs/a b.md'] } })
  assert.equal(hashOf(viewOf('v/tower/shelf/shelf%3Ap%2F0/docs%2Fa%20b.md', board, has) as MainView, board), '#shelf/p/0/docs%2Fa%20b.md')
  assert.deepEqual(viewOf('v/grid/grid/floor%3Ap', board, has), { t: 'view', location: { view: 'grid/grid', subject: 'floor:p' } })
  assert.equal(floorOfView({ t: 'view', location: { view: 'grid/grid', subject: 'floor:p' } }, () => undefined), 'p')
  assert.ok(!sameRoom({ t: 'view', location: { view: 'grid/grid', subject: 'floor:p' } }, { t: 'view', location: { view: 'grid/grid', subject: 'board' } }))
})
