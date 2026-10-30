import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Board, Card, CardShown } from '../src/bridge/board.ts'
import { mediaTypeOf } from '../src/shared/media.ts'
import { KIT_MEMBERS, type Region } from '../src/shared/regions.ts'
import { ADDRESS_TYPE, fileSubject, shownSubject, subjectAt, type Subject } from '../src/shared/subjects.ts'
import { CORE_VIEWS, VIEW_ALIASES, coreViewOf, declaredLayout, displayed, hashOf, layoutOf, locationOf, pickView, shortHashOf, viewOn, type Location, type Placing, type View } from '../src/shared/views.ts'

const board = { floors: [{ id: 'p', cards: [{ id: 'w1', shown: [{ kind: 'file', at: 100, target: 'a.md' }, { kind: 'file', at: 200, target: 'a.md' }] }] }] } as unknown as Board

test('views: a location is written by the grammar and read back, every key and arg one segment, ; only before the pane', () => {
  const locations: Location[] = [
    { view: 'grid/grid', subject: 'floor:lab' },
    { view: 'grid/grid' },
    { view: 'tower/card', subject: 'card:20261027-014724-52e9', pane: { view: 'tower/document', subject: 'shown:20261027-014724-52e9/1761529200000' } },
    { view: 'tower/card', subject: 'card:w1', pane: { view: 'tower/changes' } },
    { view: 'tower/shelf', subject: 'shelf:tower/2', args: ['research/spec.html'] },
    { view: 'x/y', subject: 'item.notes:p/a;b#c/d e.md', args: ['1', 'two/;three'] },
  ]
  for (const l of locations) assert.deepEqual(locationOf(hashOf(l), board), l, hashOf(l))
  assert.equal(hashOf({ view: 'grid/grid', subject: 'floor:lab' }), '#v/grid/grid/floor%3Alab')
  assert.equal(hashOf(locations[2]), '#v/tower/card/card%3A20261027-014724-52e9;tower/document/shown%3A20261027-014724-52e9%2F1761529200000')
  assert.equal(hashOf(locations[4]), '#v/tower/shelf/shelf%3Atower%2F2/research%2Fspec.html')
  assert.equal(locationOf('', board), undefined)
  assert.equal(locationOf('#v/grid', board), undefined)
})

test("views: the tower page's short forms name their core views, a showing by its target's latest", () => {
  const cases: [string, Location][] = [
    ['#w1', { view: 'tower/card', subject: 'card:w1' }],
    ['#w1/changes', { view: 'tower/card', subject: 'card:w1', pane: { view: 'tower/changes' } }],
    ['#w1/screen', { view: 'tower/card', subject: 'card:w1', pane: { view: 'tower/terminal' } }],
    ['#w1/reviews', { view: 'tower/card', subject: 'card:w1', pane: { view: 'reviews/thread' } }],
    ['#w1/shown%3Aa.md', { view: 'tower/card', subject: 'card:w1', pane: { view: 'tower/document', subject: 'shown:w1/200' } }],
    ['#shelf/p/2/docs%2Fa.md', { view: 'tower/shelf', subject: 'shelf:p/2', args: ['docs/a.md'] }],
    ['#shelf/p/2', { view: 'tower/shelf', subject: 'shelf:p/2' }],
    ['#draft/p', { view: 'drafts/editor', subject: 'collection:p/drafts' }],
    ['#draft/p/d%201.md', { view: 'drafts/editor', subject: 'item.drafts:p/d 1.md' }],
    ['#kept/p/notes', { view: 'tower/collection', subject: 'collection:p/notes' }],
    ['#kept/p/notes/n%2F1.md', { view: 'tower/document', subject: 'item.notes:p/n/1.md' }],
    ['#kept/p/notes/a.html', { view: 'tower/html', subject: 'item.notes:p/a.html' }],
    ['#kept/p/notes/a.avif', { view: 'tower/image', subject: 'item.notes:p/a.avif' }],
    ['#kept/p/notes/a.mp4', { view: 'tower/video', subject: 'item.notes:p/a.mp4' }],
    ['#kept/p/notes/a.edn', { view: 'tower/text', subject: 'item.notes:p/a.edn' }],
    ['#kept/p/notes/a.bin', { view: 'tower/file', subject: 'item.notes:p/a.bin' }],
    ['#kept/p/drafts/d.md', { view: 'tower/document', subject: 'item.drafts:p/d.md' }],
    ['#archive/p', { view: 'tower/archive', subject: 'floor:p' }],
    ['#policies/p', { view: 'policies/policies', subject: 'floor:p' }],
  ]
  for (const [hash, location] of cases) assert.deepEqual(locationOf(hash, board), location, hash)
  for (const [hash, location] of cases.filter(([, l]) => l.view !== 'tower/card')) assert.equal(shortHashOf(location), hash, hash)
  assert.equal(shortHashOf({ view: 'tower/skyline' }), '')
  assert.equal(shortHashOf({ view: 'grid/grid', subject: 'floor:p' }), undefined)
  assert.equal(shortHashOf({ view: 'tower/text', subject: 'item.notes:p/a.md' }), undefined)
})

test('views: an item is drawn by the view accepting its type most specifically, the owner first, the fallback last', () => {
  const board = { floors: [{ id: 'p', collections: [{ id: 'drafts', by: 'drafts' }, { id: 'notes' }] }] } as unknown as Board
  const editor: View = { id: 'drafts/editor', cap: 'drafts', on: ['item.drafts'], accepts: ['text/markdown'], scales: ['pane'], words: { label: 'Draft' } }
  const wide: View = { id: 'x/any', cap: 'x', on: ['item.*'], accepts: ['text/*'], scales: ['pane'], words: { label: 'Any' } }
  const offered = [...CORE_VIEWS, editor, wide]
  const item = (collection: string, id: string) => ({ kind: `item.${collection}`, key: `item.${collection}:p/${id}`, project: 'p', value: { collection, project: 'p', id, type: mediaTypeOf(id) } }) as Subject
  const pick = (collection: string, id: string, order?: string[]) => pickView(board, offered.filter((v) => viewOn(v.on, item(collection, id))), order, item(collection, id))?.id
  assert.equal(pick('notes', 'a.md'), 'tower/document')
  assert.equal(pick('notes', 'a.py'), 'tower/text')
  assert.equal(pick('notes', 'a.jsonl'), 'tower/text')
  assert.equal(pick('notes', 'a.png'), 'tower/image')
  assert.equal(pick('notes', 'a.htm'), 'tower/html')
  assert.equal(pick('notes', 'a.bin'), 'tower/file')
  assert.equal(pick('drafts', 'a.md'), 'drafts/editor')
  assert.equal(pick('notes', 'a.md', ['x/any']), 'x/any')
  assert.equal(coreViewOf('text/markdown').id, 'tower/document')
  assert.equal(coreViewOf('application/octet-stream').id, 'tower/file')
})

test('views: a file of a checkout is drawn by the views by type, a view for a type first in the order takes it over', () => {
  const board = { floors: [{ id: 'p', collections: [] }] } as unknown as Board
  const code: View = { id: 'files/code', cap: 'files', on: ['file'], accepts: ['text/plain'], scales: ['pane'], words: { label: 'Code' } }
  const pick = (path: string, type: string, order?: string[]) => {
    const at = fileSubject({ card: 'w1', project: 'p', repo: 'r', path, file: `/r/${path}`, text: `files/raw/${path}`, type })
    return pickView(board, [...CORE_VIEWS, code].filter((v) => viewOn(v.on, at)), order, at)?.id
  }
  assert.equal(pick('a.md', 'text/markdown', ['files/code']), 'tower/document')
  assert.equal(pick('a.ts', 'text/plain', ['files/code']), 'files/code')
  assert.equal(pick('a.html', 'text/html', ['files/code']), 'tower/html')
  assert.equal(pick('a.png', 'image/png', ['files/code']), 'tower/image')
  assert.equal(pick('a.mp4', 'video/mp4', ['files/code']), 'tower/video')
  assert.equal(pick('a.bin', 'application/octet-stream', ['files/code']), 'tower/file')
})

test("views: a worker's showing is drawn by the views by type, an address by tower/link; a user's view for a type takes it over by the order", () => {
  const board = { floors: [{ id: 'p', collections: [] }] } as unknown as Board
  const card = { id: 'w1', project: 'p' } as unknown as Card
  const mine: View = { id: 'mine/markdown', cap: 'mine', on: ['shown'], accepts: ['text/markdown'], scales: ['pane'], words: { label: 'Mine' } }
  const wasm: View = { id: 'mine/wasm', cap: 'mine', on: ['shown'], accepts: ['application/wasm'], scales: ['pane'], words: { label: 'Wasm' } }
  const offered = [...CORE_VIEWS, mine, wasm]
  const pick = (s: Partial<CardShown>, order?: string[]) => {
    const at = shownSubject(card, { at: 1, session: 'w1', ...s } as CardShown)
    return pickView(board, offered.filter((v) => viewOn(v.on, at)), order, at)?.id
  }
  assert.equal(pick({ kind: 'file', target: '/r/a.md' }), 'tower/document')
  assert.equal(pick({ kind: 'file', target: '/r/a.txt' }), 'tower/text')
  assert.equal(pick({ kind: 'file', target: '/r/a.html' }), 'tower/html')
  assert.equal(pick({ kind: 'file', target: '/r/a.svg' }), 'tower/image')
  assert.equal(pick({ kind: 'file', target: '/r/a.mp4' }), 'tower/video')
  assert.equal(pick({ kind: 'file', target: '/r/a.bin' }), 'tower/file')
  assert.equal(pick({ kind: 'url', target: 'http://localhost:5173/' }), 'tower/link')
  assert.equal(pick({ kind: 'link', target: 'https://example.com/' }), 'tower/link')
  assert.equal(pick({ kind: 'file', target: '/r/a.md' }, ['tower/terminal', 'mine/markdown']), 'mine/markdown')
  assert.equal(pick({ kind: 'url', target: 'http://localhost:5173/' }, ['mine/markdown']), 'tower/link', 'an order taking markdown leaves addresses alone')
  assert.equal(pick({ kind: 'url', target: 'http://localhost:5173/' }, ['tower/text']), 'tower/text', 'an address is text: an order taking text/* draws it as its text')
  assert.equal(pick({ kind: 'file', target: '/r/a.wasm' }), 'mine/wasm', 'a type only the fallback covered is taken by installing a view for it')
  assert.deepEqual(shownSubject(card, { kind: 'url', at: 1, session: 'w1', target: 'http://localhost:5173/' }).value, { kind: 'url', at: 1, session: 'w1', target: 'http://localhost:5173/', card: 'w1', project: 'p', body: 'http://localhost:5173/', type: ADDRESS_TYPE })
})

test('views: a view on collection.<id> is on that one collection, as one on item.* is on every item', () => {
  const drafts = { kind: 'collection', value: { id: 'drafts' } }
  assert.ok(viewOn(['collection.drafts'], drafts))
  assert.ok(!viewOn(['collection.drafts'], { kind: 'collection', value: { id: 'games' } }))
  assert.ok(viewOn(['collection'], drafts))
  assert.ok(viewOn(['item.*'], { kind: 'item.games', value: {} }))
})

test("views: the layout takes each field from the highest layer that sets it; hidden is the union less what a higher layer orders", () => {
  const layout = layoutOf(
    { 'floor.section': { hidden: ['policies/policies'] }, 'card.panes': { order: ['a/a'] } },
    { 'card.panes': { order: ['b/b'], options: { 'b/b': { x: 1 } } } },
    { 'floor.section': { order: ['grid/grid'] }, 'card.panes': { options: { 'c/c': { y: 2 } } } },
  )
  assert.deepEqual(layout['floor.section'], { order: ['grid/grid'], hidden: ['policies/policies'] })
  assert.deepEqual(layout['card.panes'], { order: ['b/b'], options: { 'b/b': { x: 1 }, 'c/c': { y: 2 } } })
  assert.deepEqual(layoutOf({ r: { hidden: ['v/v'] } }, {}, { r: { order: ['v/v'] } }).r, { order: ['v/v'] })
  const declaring = { extensions: [{ state: 'started', layout: { 'file.open': { order: ['files/code'], hidden: ['tower/text'] } } }, { state: 'failed', layout: { 'x.y': { order: ['x/x'] } } }] } as unknown as Board
  assert.deepEqual(declaredLayout(declaring, { 'card.panes': { order: ['a/a'] } }), { 'file.open': { order: ['files/code'], hidden: ['tower/text'] }, 'card.panes': { order: ['a/a'] } }, "a started extension's region defaults lie under the renderer's own")
  assert.deepEqual(layoutOf(declaredLayout(declaring, {}), { 'file.open': { order: ['tower/text'] } }, undefined)['file.open'], { order: ['tower/text'] }, 'a higher layer orders a view the default hid')
  const retired = layoutOf({}, { 'card.panes': { order: ['tower/brief', 'tower/shown'], hidden: ['tower/shown'] } }, undefined)['card.panes']
  assert.deepEqual(retired.order, ['tower/brief'], 'a retired view in an order leaves its subjects to their pick')
  assert.deepEqual(retired.hidden, VIEW_ALIASES['tower/shown'], 'a retired view hidden hides the views that draw its subjects now')
  assert.ok(VIEW_ALIASES['tower/shown'].includes('tower/document') && VIEW_ALIASES['tower/shown'].includes('tower/link'))
})

test('views: display places a card on its worker view, its children in its tabs, and a view showing cards on the floor', () => {
  const card = { id: 'w1', project: 'p', conversations: [{ id: 'c1' }], shown: [{ kind: 'file', at: 100, target: 'a.md' }, { kind: 'url', at: 200, target: 'http://localhost:5173/' }, { kind: 'file', at: 300, target: 'notes.txt' }] }
  const board = { floors: [{ id: 'p', cards: [card], collections: [] }], extensions: [] } as unknown as Board
  const grid: View = { id: 'grid/grid', cap: 'grid', on: ['floor', 'board'], shows: ['card'], scales: ['pane'], words: { label: 'Grid' } }
  const main: Region = { id: 'board.main', subject: 'board', holds: ['views'], scale: 'pane', arity: 'one' }
  const panes: Region = { id: 'card.panes', subject: 'card', holds: ['views'], scale: 'pane', arity: 'tabs' }
  const p: Placing = { board, views: [...CORE_VIEWS, grid], regions: [main, panes], layout: {}, kit: KIT_MEMBERS, main }
  const at = (key: string, view?: string) => displayed(p, subjectAt(board, key)!, view)
  assert.deepEqual(at('card:w1'), { view: 'tower/card', subject: 'card:w1' })
  assert.deepEqual(at('card:w1', 'tower/changes'), { view: 'tower/card', subject: 'card:w1', pane: { view: 'tower/changes', subject: 'card:w1' } })
  assert.deepEqual(at('conversation:c1'), { view: 'tower/card', subject: 'card:w1', pane: { view: 'tower/brief', subject: 'card:w1' } })
  assert.deepEqual(at('shown:w1/100'), { view: 'tower/card', subject: 'card:w1', pane: { view: 'tower/document', subject: 'shown:w1/100' } })
  assert.deepEqual(at('shown:w1/200'), { view: 'tower/card', subject: 'card:w1', pane: { view: 'tower/link', subject: 'shown:w1/200' } })
  assert.deepEqual(at('shown:w1/300'), { view: 'tower/card', subject: 'card:w1', pane: { view: 'tower/text', subject: 'shown:w1/300' } })
  assert.deepEqual(at('shown:w1/100', 'tower/text'), { view: 'tower/card', subject: 'card:w1', pane: { view: 'tower/text', subject: 'shown:w1/100' } })
  assert.deepEqual(at('card:w1', 'grid/grid'), { view: 'grid/grid', subject: 'floor:p' })
})
