import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Board } from '../src/bridge/board.ts'
import { hashOf, layoutOf, locationOf, shortHashOf, viewOn, type Location } from '../src/shared/views.ts'

const board = { floors: [{ id: 'p', cards: [{ id: 'w1', shown: [{ at: 100, target: 'a.md' }, { at: 200, target: 'a.md' }] }] }] } as unknown as Board

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
    ['#w1/shown%3Aa.md', { view: 'tower/card', subject: 'card:w1', pane: { view: 'tower/shown', subject: 'shown:w1/200' } }],
    ['#shelf/p/2/docs%2Fa.md', { view: 'tower/shelf', subject: 'shelf:p/2', args: ['docs/a.md'] }],
    ['#shelf/p/2', { view: 'tower/shelf', subject: 'shelf:p/2' }],
    ['#draft/p', { view: 'drafts/editor', subject: 'collection:p/drafts' }],
    ['#draft/p/d%201.md', { view: 'drafts/editor', subject: 'item.drafts:p/d 1.md' }],
    ['#kept/p/notes', { view: 'tower/collection', subject: 'collection:p/notes' }],
    ['#kept/p/notes/n%2F1.md', { view: 'tower/item', subject: 'item.notes:p/n/1.md' }],
    ['#archive/p', { view: 'tower/archive', subject: 'floor:p' }],
    ['#policies/p', { view: 'policies/policies', subject: 'floor:p' }],
  ]
  for (const [hash, location] of cases) assert.deepEqual(locationOf(hash, board), location, hash)
  for (const [hash, location] of cases.filter(([, l]) => l.view !== 'tower/card' && l.view !== 'tower/item')) assert.equal(shortHashOf(location), hash, hash)
  assert.equal(shortHashOf({ view: 'tower/skyline' }), '')
  assert.equal(shortHashOf({ view: 'grid/grid', subject: 'floor:p' }), undefined)
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
})
