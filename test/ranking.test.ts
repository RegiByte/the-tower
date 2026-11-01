import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Board } from '../src/bridge/board.ts'
import { actionId, headRanked, isFresh, offeredIds, rankedActions, rankedBadges, rankedLines } from '../src/shared/adds.ts'
import type { Added, Badge, CommandAction, VerbAction } from '../src/shared/extensions.ts'
import { fill } from '../src/shared/fill.ts'
import { layoutOf } from '../src/shared/views.ts'

const verb = (name: string): Added<VerbAction> => ({ verb: name, call: {}, cap: name.split('/')[0] })
const command = (cap: string, name: string): Added<CommandAction> => ({ command: name, cap })
const ids = (ranked: { id: string }[]) => ranked.map((r) => r.id)

test('ranking: the pinned first in their order, then the rest in board order, less the hidden', () => {
  const actions = [verb('reviews/hire'), command('grid', 'add'), verb('pulse/ping'), command('narrate', 'speak')]
  assert.deepEqual(ids(rankedActions(actions, undefined)), ['reviews/hire', 'grid/add', 'pulse/ping', 'narrate/speak'], 'no layout keeps board order')
  const ranked = rankedActions(actions, { pinned: ['narrate/speak', 'missing/x', 'grid/add'], hidden: ['pulse/ping'] })
  assert.deepEqual(ids(ranked), ['narrate/speak', 'grid/add', 'reviews/hire'], 'a pin of nothing offered is passed over')
  assert.deepEqual(
    ranked.map((r) => r.pinned),
    [true, true, false],
  )
  assert.equal(actionId(command('grid', 'add')), 'grid/add')
  const twice = rankedActions([verb('pulse/ping'), verb('reviews/hire'), verb('pulse/ping')], { pinned: ['pulse/ping'] })
  assert.deepEqual(ids(twice), ['pulse/ping', 'pulse/ping', 'reviews/hire'], 'actions sharing an id pin together')
})

test('ranking: badges by severity, board order within a tone; a head interleaves severe badges, pins, badges, actions', () => {
  const badge = (label: string, tone?: Badge['tone']): Added<Badge> => ({ label, ...(tone && { tone }), cap: 'x' })
  const board = { adds: { 'card:w1': { badges: [badge('a'), badge('b', 'ready'), badge('c', 'needs'), badge('d', 'broken'), badge('e', 'needs')], lines: [] } } } as unknown as Board
  const badges = rankedBadges(board, { kind: 'card', key: 'card:w1', value: {} } as never)
  assert.deepEqual(
    badges.map((b) => b.label),
    ['d', 'c', 'e', 'b', 'a'],
  )
  const head = headRanked(badges, rankedActions([verb('p/one'), verb('p/two')], { pinned: ['p/two'] }))
  assert.deepEqual(
    head.map((i) => (i.t === 'badge' ? i.badge.label : i.ranked.id)),
    ['d', 'c', 'e', 'p/two', 'b', 'a', 'p/one'],
  )
})

test("ranking: an extension's lines rank and pin by its capability, fold order otherwise", () => {
  const board = { adds: { 'card:w1': { lines: [{ text: 'run', cap: 'policies' }, { text: 'tab', cap: 'tabline' }, { text: 'more', cap: 'policies' }] } } } as unknown as Board
  assert.deepEqual(
    rankedLines(board, 'w1', undefined).map((l) => l.text),
    ['run', 'tab', 'more'],
  )
  assert.deepEqual(
    rankedLines(board, 'w1', { pinned: ['tabline'] }).map((l) => l.text),
    ['tab', 'run', 'more'],
  )
  assert.deepEqual(
    rankedLines(board, 'w1', { hidden: ['policies'] }).map((l) => l.text),
    ['tab'],
  )
})

test('layout: pins are a union, the viewer first, then the config, then the renderer, less what a higher layer unpins', () => {
  const merged = layoutOf({ 'card.head': { pinned: ['r/own'] } }, { 'card.head': { pinned: ['c/one', 'c/two'] } }, { 'card.head': { pinned: ['v/mine', 'c/two'], unpinned: ['c/one'] } })['card.head']
  assert.deepEqual(merged.pinned, ['v/mine', 'c/two', 'r/own'])
  assert.deepEqual(merged.unpinned, ['c/one'], 'an unpin of what a lower layer pins stays, for the menu to say')
  const stale = layoutOf({}, { 'card.head': { pinned: ['c/one'] } }, { 'card.head': { unpinned: ['gone/x'] } })['card.head']
  assert.deepEqual(stale, { pinned: ['c/one'] }, 'an unpin of what no lower layer pins is dropped when read')
  assert.deepEqual(layoutOf({}, { r: { pinned: ['a/a'], unpinned: ['a/a'] } }, undefined).r.pinned, ['a/a'], "a layer's unpinned drops only a lower layer's pin")
  assert.deepEqual(layoutOf({ r: { pinned: ['a/a'] } }, { r: { unpinned: ['a/a'] } }, { r: { pinned: ['a/a'] } }).r, { pinned: ['a/a'] }, 'an unpin a higher layer pins again is dropped')
})

test('layout: hidden is the union, less what a higher layer orders or pins; form and budgets come from the highest layer', () => {
  const merged = layoutOf({ r: { hidden: ['a/a', 'b/b'], overflow: 'wrap', lines: 1 } }, { r: { hidden: ['c/c'], badges: 2 } }, { r: { pinned: ['a/a'], overflow: 'menu', lines: 0 } }).r
  assert.deepEqual(merged.hidden, ['b/b', 'c/c'], 'pinning in the viewer un-hides what a lower layer hid')
  const unpinnedPin = layoutOf({ r: { hidden: ['x/x'] } }, { r: { pinned: ['x/x'] } }, { r: { unpinned: ['x/x'] } }).r
  assert.deepEqual(unpinnedPin, { hidden: ['x/x'], unpinned: ['x/x'] }, 'a pin unpinned above un-hides nothing')
  assert.equal(merged.overflow, 'menu')
  assert.equal(merged.lines, 0, 'a budget of 0 is set, not absent')
  assert.equal(merged.badges, 2)
})

test('fresh: an action is new while an extension offers it and the viewer has not seen it; a core verb never is', () => {
  const board = { extensions: [{ provides: 'reviews', state: 'refused', verbs: [{ name: 'reviews/hire' }], commands: [{ name: 'open' }] }] } as unknown as Board
  const offered = offeredIds(board)
  assert.deepEqual(offered, ['reviews/hire', 'reviews/open'], 'whatever its state')
  assert.ok(isFresh(offered, [], 'reviews/open'))
  assert.ok(!isFresh(offered, ['reviews/open'], 'reviews/open'))
  assert.ok(!isFresh(offered, [], 'tower/resume'))
})

test('fill: fewer as soon as they do not fit, more only with the margin to spare', () => {
  const widths = [40, 40, 40]
  assert.equal(fill(widths, 120, 20, widths.length, 24), 3, 'all fit with no menu')
  assert.equal(fill(widths, 119, 20, 3, 24), 2, 'a pixel short tucks one, the menu taking its place')
  assert.equal(fill(widths, 120, 20, 2, 24), 2, 'room for all again is not enough to bring one back')
  assert.equal(fill(widths, 144, 20, 2, 24), 3, 'with the margin to spare it comes back')
  assert.equal(fill(widths, 30, 20, 3, 24), 0, 'nothing fits beside the menu')
  assert.equal(fill([40, 10], 52, 20, 2, 24), 2, 'the last item narrower than the menu draws in its place')
})
