import assert from 'node:assert/strict'
import { test } from 'node:test'
import { z } from 'zod'
import { board, type Board } from '../src/bridge/board.ts'
import { factsOf } from '../src/bridge/facts.ts'
import { foldBoard, SLOW_MS, type Folder } from '../src/bridge/folds.ts'
import { actionWords, addedActions } from '../src/shared/adds.ts'
import type { ExtensionView, Fold } from '../src/shared/extensions.ts'
import { parentOf, projectOfKey, subjectAt, type Subject } from '../src/shared/subjects.ts'
import type { Config } from '../src/shared/model.ts'
import { fixture } from './replay.ts'
import { viewOf } from './view.ts'

const CONFIG: Config = {
  argv: ['claude'],
  projects: { tower: { name: 'tower', hub: '/hub', repos: [], shelf: [{ label: 'KB', html: 'kb.html' }] }, lab: { name: 'lab', hub: '/lab', repos: [] } },
}

const core = (): Board => {
  const log = fixture('tool-turn')
  return board(viewOf(CONFIG, { sessions: [{ header: log.header, facts: factsOf(log) }] }))
}

const CARD = (b: Board) => b.floors[0].cards[0]

/** An extension providing `cap` that folds `folds`, each declared with an x of any shape and every add. */
const folder = (cap: string, folds: Record<string, Fold>, over: Partial<Folder> = {}): Folder => ({
  id: cap,
  cap,
  requires: [],
  wants: [],
  off: [],
  specs: new Map(Object.keys(folds).map((kind) => [kind, { x: z.unknown(), adds: ['actions', 'badges', 'asks', ...(kind === 'card' ? (['lines'] as const) : []), ...(kind === 'floor' ? (['tidy'] as const) : [])] }])),
  folds,
  commands: [],
  verbs: new Map([[cap, new Set(['ping'])]]),
  settings: () => undefined,
  own: () => ({ streams: {}, collections: {} }),
  ...over,
})

const fold = (folders: Folder[], b = core(), subjects: Parameters<typeof foldBoard>[0]['subjects'] = new Map()) =>
  foldBoard({ board: b, callsignOf: () => undefined, folders, subjects, now: 1000, clock: () => 0 })

/** A started extension as the board shows it, with only what a test reads. */
const started = (provides: string, over: Partial<ExtensionView>): ExtensionView => ({
  id: provides,
  provides,
  version: '1.0',
  title: provides,
  bundled: false,
  state: 'started',
  problems: [],
  verbs: [],
  commands: [],
  slots: [],
  subjects: [],
  views: [],
  regions: [],
  ...over,
})

test('an extension folds card, floor, then board, each seeing its own parts made before; its part goes at x.<cap>', () => {
  const seen: string[] = []
  const { board: b, problems } = fold([
    folder('pulse', {
      board: (board: Board) => (seen.push(`board ${JSON.stringify(board.floors.map((f) => f.x))}`), { x: { floors: board.floors.length } }),
      floor: (floor) => (seen.push(`floor ${JSON.stringify(floor.cards.map((c: { x?: unknown }) => c.x))}`), { x: { cards: floor.cards.length } }),
      card: (card) => (seen.push(`card ${card.id}`), { x: { beat: 1 } }),
    }),
  ])
  const id = CARD(core()).id
  assert.deepEqual(seen, [`card ${id}`, `floor [{"pulse":{"beat":1}}]`, 'floor []', 'board [{"pulse":{"cards":1}},{"pulse":{"cards":0}}]'])
  assert.deepEqual(problems, [])
  assert.deepEqual(CARD(b).x, { pulse: { beat: 1 } })
  assert.deepEqual(b.x, { pulse: { floors: 2 } })
})

test("a fold sees only the parts of the capabilities it declares, in resolved order; its contributions are tagged by capability", () => {
  const sawOf: Record<string, unknown> = {}
  const { board: b } = fold([
    folder('alpha', { card: () => ({ x: 'a', badges: [{ label: 'A' }] }) }),
    folder('beta', { card: () => ({ x: 'b', actions: [{ verb: 'beta/ping', call: {} }] }) }),
    folder('gamma', { card: (card) => ((sawOf.gamma = card.x), { badges: [{ label: 'G', tone: 'ready' }] }) }, { requires: ['alpha'] }),
    folder('delta', { card: (card) => ((sawOf.delta = card.x), {}) }),
  ])
  assert.deepEqual(sawOf, { gamma: { alpha: 'a' }, delta: undefined })
  assert.deepEqual(b.adds[`card:${CARD(b).id}`], { badges: [{ label: 'A', cap: 'alpha' }, { label: 'G', tone: 'ready', cap: 'gamma' }], actions: [{ verb: 'beta/ping', call: {}, cap: 'beta' }] })
})

test("a fold that throws or returns what it doesn't declare drops its part there and its dependents' there, each a problem with the subject", () => {
  const { board: b, problems } = fold([
    folder('alpha', { card: () => { throw new Error('no beat') } }),
    folder('beta', { card: () => ({ x: 1 }) }, { requires: ['alpha'] }),
    folder('gamma', { card: (card) => ({ x: card.x ?? 'none' }) }, { wants: ['alpha'] }),
    folder('delta', { card: () => ({ lines: ['hi'], slots: [] }) as never }),
    folder('eps', { card: () => ({ actions: [{ verb: 'chime/ring', call: {} }] }) }),
  ])
  const key = `card:${CARD(b).id}`
  assert.deepEqual(CARD(b).x, { gamma: 'none' })
  assert.deepEqual(
    problems.map((p) => [p.id, p.problem.code, p.problem.subject, p.problem.path]),
    [
      ['alpha', 'threw', key, 'folds.card'],
      ['delta', 'shape', key, 'folds.card'],
      ['eps', 'shape', key, 'folds.card'],
    ],
  )
  assert.match(problems[0].problem.message, /no beat/)
})

test('x is checked against its schema; tidy and asks land on the board, an ask past its until gone; a floor off skips its subjects', () => {
  const folders = [
    folder('pulse', {
      card: () => ({ x: { beat: 'one' } }),
      floor: (floor) => ({
        tidy: [{ key: 'old', label: 'file old beats' }],
        asks: [
          { key: `beat-${floor.id}`, subject: `floor:${floor.id}`, title: 'Beat now?', since: 900, sound: 'offer', actions: [{ verb: 'pulse/ping', call: { project: floor.id } }] },
          { key: 'stale', subject: 'board', title: 'Gone', since: 10, until: 999, sound: 'wait', actions: [] },
        ],
      }),
    }, { off: ['lab'] }),
  ]
  folders[0].specs.set('card', { x: z.object({ beat: z.number() }), adds: [] })
  const { board: b, problems } = fold(folders)
  assert.equal(CARD(b).x, undefined)
  assert.deepEqual(problems.map((p) => p.problem.code), ['shape'])
  assert.deepEqual(b.adds['floor:tower'].tidy, [{ key: 'old', label: 'file old beats', cap: 'pulse' }])
  assert.equal(b.adds['floor:lab'].tidy, undefined, "the core's badges alone: nothing answers its discard hooks there")
  assert.deepEqual(b.asks, [{ key: 'pulse:beat-tower', subject: 'floor:tower', title: 'Beat now?', since: 900, sound: 'offer', cap: 'pulse', actions: [{ verb: 'pulse/ping', call: { project: 'tower' }, cap: 'pulse' }] }])
})

test("a fold's input is frozen, and a build's folds of one extension over the bound are slow", () => {
  let t = 0
  const { problems, spent } = foldBoard({
    board: core(),
    callsignOf: () => undefined,
    folders: [folder('pulse', { card: (card) => ((t += SLOW_MS + 1), (card.status = 'done'), {}) })],
    subjects: new Map(),
    now: 1000,
    clock: () => t,
  })
  assert.deepEqual(problems.map((p) => [p.problem.code, p.problem.level]), [['threw', 'error'], ['slow', 'warn']])
  assert.equal(spent.get('pulse'), SLOW_MS + 1)
})

test("what a worker showed and a floor's shelf entries are folded; an action's own words are its; a command is offered by its accepts", () => {
  const built = core()
  const card = CARD(built)
  card.shown = [
    { kind: 'file', target: '/hub/notes.md', at: 5, session: card.id },
    { kind: 'file', target: '/hub/shot.png', at: 6, session: card.id },
  ]
  const { board: folded, problems } = fold(
    [folder('narrate', { shown: (s) => ({ actions: [{ command: 'speak', words: { label: `Listen · ${s.target}` } }] }), shelf: (e) => ({ badges: [{ label: e.label }] }) }, { commands: ['speak'] })],
    built,
  )
  assert.deepEqual(problems, [])
  const b = { ...folded, extensions: [started('narrate', { commands: [{ name: 'speak', module: 'n.js', export: 'speak', words: { label: 'Listen' }, on: ['item.*', 'shown'], accepts: ['text/*'] }] })] }
  const key = `shown:${card.id}/5`
  const md = subjectAt(b, key) as Subject
  assert.deepEqual([md.kind, md.project, parentOf(md), projectOfKey(b, key)], ['shown', 'tower', `card:${card.id}`, 'tower'])
  assert.deepEqual([(md.value as { text: string }).text, (md.value as { type: string }).type], [`shown/${card.id}/hub/notes.md`, 'text/markdown'])
  assert.deepEqual(
    addedActions(b, md).map((a) => actionWords(b, a).label),
    ['Listen · /hub/notes.md', 'Listen'],
  )
  assert.deepEqual(
    addedActions(b, subjectAt(b, `shown:${card.id}/6`) as Subject).map((a) => actionWords(b, a).label),
    ['Listen · /hub/shot.png'],
  )
  assert.deepEqual(b.adds['shelf:tower/0'].badges, [{ label: 'KB', cap: 'narrate' }])
  assert.equal(parentOf(subjectAt(b, 'shelf:tower/0') as Subject), 'floor:tower')
})

test("an own kind's entry is keyed by the subject it was found in, its contributions copied to its old key, and resolved while its extension runs", () => {
  const { board: folded, problems } = fold(
    [folder('reviews', { floor: () => ({ x: { threads: [{ key: 'main' }] } }) }), folder('chime', { 'reviews.thread': (t) => ({ badges: [{ label: t.key }] }) }, { wants: ['reviews'] })],
    core(),
    new Map([['reviews.thread', { in: 'floor', list: 'threads' }]]),
  )
  assert.deepEqual(problems, [])
  assert.deepEqual(folded.adds['reviews.thread:floor:lab/main'].badges, [{ label: 'main', cap: 'chime' }])
  assert.equal(folded.adds['reviews.thread:main'].badges?.length, 2)
  assert.equal(subjectAt(folded, 'reviews.thread:floor:lab/main'), undefined)
  const b = { ...folded, extensions: [started('reviews', { subjects: [{ kind: 'reviews.thread', in: 'floor', list: 'threads' }] })] }
  const thread = subjectAt(b, 'reviews.thread:floor:lab/main') as Subject
  assert.deepEqual([thread.project, thread.value, parentOf(thread), projectOfKey(b, thread.key)], ['lab', { key: 'main' }, 'floor:lab', 'lab'])
})
