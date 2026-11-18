import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Board, Card, CardResource, Floor } from '../src/bridge/board.ts'
import { subjectMenu, type MenuContext, type MenuGroup, type MenuLine, type MenuSub } from '../src/shared/subject-menu.ts'

const card = {
  id: 'w1',
  callsign: 'ODIN-07',
  project: 'p',
  onDuty: true,
  worktree: undefined,
  conversations: [{ id: 'c1', actions: [] }],
  resources: [],
  shown: [
    { kind: 'file', target: '/tmp/a/report.html', at: 10, session: 's1' },
    { kind: 'link', target: 'https://example.com/page', title: 'Page', at: 20, session: 's1' },
  ],
  actions: [{ verb: 'drive' }, { verb: 'submit', call: ['submit', { id: 'w1' }] }, { verb: 'brief' }, { verb: 'kill', call: ['kill', { id: 'w1' }] }, { verb: 'send-home', call: [['kill', { id: 'w1' }]] }],
} as unknown as Card

const floor = {
  id: 'p',
  name: 'the-tower',
  hub: '/code/the-tower',
  repos: ['/code/site'],
  archived: 2,
  cards: [card],
  collections: [{ id: 'drafts', label: 'Drafts', items: [{ id: 'a.md' }] }],
  shelf: [{ label: 'KB', html: 'kb/index.html' }, { label: 'Overview', link: 'https://example.com/overview' }],
  actions: [
    { verb: 'spawn', call: ['spawn', { project: 'p' }] },
    { verb: 'cut', call: ['spawn', { project: 'p', cut: {} }] },
    { verb: 'shell', call: ['shell/spawn', { project: 'p' }] },
    { verb: 'editor', call: ['open', {}] },
  ],
} as unknown as Floor

const board = { floors: [floor], extensions: [], adds: {} } as unknown as Board

const nothingOpen: MenuContext = { open: [], origins: {} }

const labels = (g: MenuGroup) => g.lines.map((l) => l.label)
const group = (groups: MenuGroup[], label: string) => groups.find((g) => g.label === label)!
const ticks = (g: MenuGroup) => g.lines.map((l) => (l as MenuLine).open)

test("a floor's menu: its verbs less those each dir or the form offers, its archive, then what it keeps, its shelf and each repo", () => {
  const menu = subjectMenu(board, 'floor:p', { open: [{ view: 'tower/shelf', subject: 'shelf:p/0' }], origins: { '/code/site': 'https://example.com/site' } })!
  assert.equal(menu.title, 'the-tower')
  assert.deepEqual(menu.groups.map((g) => g.label), ['the-tower', 'Kept', 'Shelf', 'Repos'], 'a group with nothing in it is left out')
  assert.deepEqual(labels(menu.groups[0]), ['New worker', 'Archive'])
  assert.deepEqual(ticks(group(menu.groups, 'Shelf')), [true, undefined], 'an entry opened in place ticks; a link is an action')
  const repos = group(menu.groups, 'Repos').lines as MenuSub[]
  assert.deepEqual(repos.map((r) => [r.label, r.lines.map((l) => l.label)]), [
    ['the-tower', ['New shell', 'Open in editor']],
    ['site', ['New shell', 'Open in editor', 'Open on example.com']],
  ])
  assert.deepEqual(repos[1].lines[0].does, { t: 'dir', verb: 'shell', project: 'p', dir: '/code/site' })
})

test("a floor's archive and collections tick where the renderer has them open", () => {
  const menu = subjectMenu(board, 'floor:p', { open: [{ view: 'tower/archive', subject: 'floor:p' }, { view: 'tower/collection', subject: 'collection:p/drafts' }], origins: {} })!
  assert.deepEqual(ticks(menu.groups[0]), [undefined, true])
  assert.deepEqual(ticks(group(menu.groups, 'Kept')), [true])
  assert.deepEqual((group(menu.groups, 'Kept').lines[0] as MenuLine).does, { t: 'open', subject: 'collection:p/drafts', view: 'tower/collection' }, "every item, whichever view the collection's own kind prefers")
})

test("a worker's menu: its verbs less the prompt's and kill, its tabs ticked where open, its showings newest first", () => {
  const menu = subjectMenu(board, 'card:w1', { open: [{ view: 'tower/card', subject: 'card:w1' }, { view: 'tower/brief', subject: 'card:w1' }], origins: {} })!
  assert.equal(menu.title, 'ODIN-07')
  assert.deepEqual(labels(menu.groups[0]), ['Open terminal', 'Brief', 'Send home'])
  assert.deepEqual(ticks(menu.groups[0]), [false, true, undefined])
  assert.deepEqual((group(menu.groups, 'Shown').lines as MenuLine[]).map((l) => [l.label, l.does]), [
    ['Page', { t: 'display', subject: 'shown:w1/20' }],
    ['report.html', { t: 'display', subject: 'shown:w1/10' }],
  ])
})

test("a worker's processes are one line that asks first, none while it works; its earlier conversations a group of one-line labels", () => {
  const resources = [101, 102].map((pid): CardResource => ({ pid, command: `bash -c 'eval run ${pid}'`, ports: [], orphan: false, actions: [{ verb: 'reap', call: ['reap/process', { id: 'w1', pid }] }] }))
  const earlier = { id: 'c0', prompt: 'Fix the login form\n\nIt drops the session cookie when the user signs in from a phone on the slow network', actions: [{ verb: 'resume', call: ['resume', { id: 'w1', conversation: 'c0' }] }] }
  const left = { ...card, status: 'idle', resources, conversations: [earlier, ...card.conversations], actions: card.actions.toSpliced(3, 0, { verb: 'reap', call: ['reap', { id: 'w1' }] }) } as unknown as Card
  const menuOf = (c: Card) => subjectMenu({ ...board, floors: [{ ...floor, cards: [c] }] } as unknown as Board, 'card:w1', nothingOpen)!
  const menu = menuOf(left)
  assert.deepEqual(labels(menu.groups[0]), ['Open terminal', 'Brief', 'End 2 processes…', 'Send home'])
  assert.deepEqual((menu.groups[0].lines[2] as MenuLine).does, { t: 'action', subject: 'card', verb: 'reap', id: 'w1' }, "the card's reap, which asks with every process listed")
  assert.deepEqual(labels(group(menu.groups, 'Earlier conversations')), ['Resume: Fix the login form It drops the session cookie when the use…'])
  assert.equal(labels(menuOf({ ...left, resources: resources.slice(0, 1) } as Card).groups[0])[2], 'End 1 process…')
  for (const status of ['working', 'needs_input', 'blocked', 'watching', 'booting'] as const)
    assert.ok(!labels(menuOf({ ...left, status } as Card).groups[0]).some((l) => l.startsWith('End')), `${status}: its processes may be its own work in flight`)
})

test("a showing's menu offers a browser tab and its worker's tab, not the showing a click opens already", () => {
  const menu = subjectMenu(board, 'shown:w1/10', { open: [{ view: 'tower/document', subject: 'shown:w1/10' }], origins: {} })!
  assert.deepEqual(labels(menu.groups[0]), ['Open in a browser tab', "Show ODIN-07's terminal"])
  assert.deepEqual((menu.groups[0].lines[0] as MenuLine).does, { t: 'link', href: '/shown/s1/tmp/a/report.html' })
  assert.deepEqual((menu.groups[0].lines[1] as MenuLine).does, { t: 'action', subject: 'card', verb: 'drive', id: 'w1' })
  const home = { ...card, onDuty: false, actions: [{ verb: 'brief' }] } as unknown as Card
  const gone = subjectMenu({ ...board, floors: [{ ...floor, cards: [home] }] } as unknown as Board, 'shown:w1/10', nothingOpen)!
  assert.deepEqual((gone.groups[0].lines[1] as MenuLine).label, "Show ODIN-07's brief", 'a worker gone home has no terminal')
})

test("a menu's line ids are each its own: a menu that would hold two alike throws", () => {
  const twice = { ...board, floors: [{ ...floor, collections: [...floor.collections, ...floor.collections] }] } as unknown as Board
  assert.throws(() => subjectMenu(twice, 'floor:p', nothingOpen), /two lines with the id collection:p\/drafts/)
})

test('a key the board no longer holds, or of another kind, has no menu', () => {
  for (const key of ['floor:gone', 'card:gone', 'shown:w1/99', 'collection:p/drafts', 'board']) assert.equal(subjectMenu(board, key, nothingOpen), undefined, key)
})
