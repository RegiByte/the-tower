import assert from 'node:assert/strict'
import { test } from 'node:test'
import { z } from 'zod'
import { board, type Board } from '../src/bridge/board.ts'
import { factsOf } from '../src/bridge/facts.ts'
import { foldBoard, SLOW_MS, type Folder } from '../src/bridge/folds.ts'
import type { Fold } from '../src/shared/extensions.ts'
import type { Config } from '../src/shared/model.ts'
import { fixture } from './replay.ts'
import { viewOf } from './view.ts'

const CONFIG: Config = { argv: ['claude'], projects: { tower: { name: 'tower', hub: '/hub', repos: [] }, lab: { name: 'lab', hub: '/lab', repos: [] } } }

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

const fold = (folders: Folder[], b = core()) => foldBoard({ board: b, callsignOf: () => undefined, folders, subjects: new Map(), now: 1000, clock: () => 0 })

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
  assert.equal(b.adds['floor:lab'], undefined)
  assert.deepEqual(b.asks, [{ key: 'pulse:beat-tower', subject: 'floor:tower', title: 'Beat now?', since: 900, sound: 'offer', cap: 'pulse', actions: [{ verb: 'pulse/ping', call: { project: 'tower' }, cap: 'pulse' }] }])
})

test("a fold's input is frozen, and a build's folds of one extension over the bound are slow", () => {
  let t = 0
  const { problems } = foldBoard({
    board: core(),
    callsignOf: () => undefined,
    folders: [folder('pulse', { card: (card) => ((t += SLOW_MS + 1), (card.status = 'done'), {}) })],
    subjects: new Map(),
    now: 1000,
    clock: () => t,
  })
  assert.deepEqual(problems.map((p) => [p.problem.code, p.problem.level]), [['threw', 'error'], ['slow', 'warn']])
})
