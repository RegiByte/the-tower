import type * as THREE from 'three'
import { draftItem } from '../../../src/shared/drafts.ts'
import type { ShelfEntry } from '../../../src/shared/model.ts'
import type { Board, Card } from './api.ts'
import { REVIEWS } from '../../../src/shared/reviews.ts'
import { HOST_MEANS, base, can, current, defaultWhere, findCard, landedRow, whyNot, type DaemonVerb, pictureOf, sendTargets, shelfKind, shownTitle, threadCheckoutOf, tidyLine, waitingCards } from './cards.ts'
import { wallNow } from './clock.ts'
import { drawerLabel, drawersAt } from './archive.ts'
import { gameItem } from './games.ts'
import type { CatName } from './life.ts'

/** A thing in the world you can aim at, by what it stands for. Its verbs are worked out from the board each time. */
export type Act =
  | { kind: 'desk'; id: string }
  /** The review notes new to a worker, stacked on its desk. */
  | { kind: 'papers'; id: string }
  /** A worker's binder beside its keyboard: its logbook, as thick as the sessions it ran as. */
  | { kind: 'binder'; id: string }
  /** A drawer of a floor's filing cabinet, by its place from the top: a day of its archive. */
  | { kind: 'drawer'; project: string; n: number }
  /** A checkout's slot in its floor's pigeonhole: its review thread. */
  | { kind: 'thread'; project: string; checkout: string }
  /** A free workstation; the open one is where the floor's next worker sits, lit while the floor can spawn. */
  | { kind: 'station'; project: string; n: number; open: boolean }
  | { kind: 'tile'; id: string }
  /** A worker's second monitor: what it last showed you. */
  | { kind: 'shown'; id: string }
  /** A showing hung in its floor's gallery, by its worker and target. */
  | { kind: 'picture'; id: string; target: string }
  /** A process a worker left running, a row on its floor's Running board. */
  | { kind: 'leftover'; id: string; pid: number }
  /** A floor's Tidy, the head of its Running board. */
  | { kind: 'tidy'; project: string }
  /** A hire whose work has landed, Tidy's to kill: a row on its floor's Running board. */
  | { kind: 'landed'; project: string; id: string }
  | { kind: 'shell'; id: string }
  | { kind: 'floor'; id: string }
  | { kind: 'shelf'; project: string; n: number }
  | { kind: 'book'; project: string; n: number; file: string }
  /** A floor's corkboard, and a draft pinned on it. */
  | { kind: 'cork'; project: string }
  | { kind: 'note'; project: string; id: string }
  /** A game's cabinet in its floor's arcade. */
  | { kind: 'arcade'; project: string; id: string }
  | { kind: 'guest'; id: string }
  | { kind: 'cat'; name: CatName; watching: string | undefined; following: boolean }
  | { kind: 'directory' }
  /** The roof's stats board. */
  | { kind: 'stats' }
  | { kind: 'elevator' }
  /** A big screen, by its index in `bigScreens`. */
  | { kind: 'tv'; n: number }
  | { kind: 'dj' }
  /** The roof's bar and its bartender. */
  | { kind: 'bar' }

/** Each cat's name and coat, as its card shows them, unless the renderer's settings name it. */
export const CAT_CARDS: Record<CatName, { name: string; coat: string }> = {
  tabby: { name: 'Mochi', coat: 'grey tabby' },
  calico: { name: 'Patches', coat: 'calico' },
  tuxedo: { name: 'Domino', coat: 'tuxedo' },
}

/** The names the renderer's settings give the cats, by coat: `settings.cats`, such as `{ "tabby": "Mochi" }`. */
export type CatNames = Partial<Record<CatName, string>>

export const catName = (name: CatName, named: CatNames): string => named[name] ?? CAT_CARDS[name].name

/** Marks `o` and everything under it as doing `what`, and makes it pickable. */
export const act = <T extends THREE.Object3D>(o: T, what: Act, pickables: THREE.Object3D[]) => {
  o.traverse((c) => (c.userData.act = what))
  pickables.push(o)
  return o
}

/** How far away each act can be used from while walking: a video wall or a big screen is read from across the room. */
export const reachOf = (a: Act) => (a.kind === 'tile' ? 9 : a.kind === 'tv' ? 12 : a.kind === 'picture' || a.kind === 'leftover' || a.kind === 'tidy' || a.kind === 'landed' ? 6 : 4.5)

/**
 * What can be done to an aimed thing. `use` is the thing's own action (sit, read, watch, open its panel); the rest
 * are the board's verbs for what it stands for, plus the building's own (`next`, `overview`, `stop`).
 */
export type Verb = 'use' | 'resume' | 'goto' | 'next' | 'brief' | 'overview' | 'review' | 'thread' | 'spawn' | 'shell' | 'editor' | 'kill' | 'stop' | 'reap' | 'hand' | 'send'

/**
 * Each verb's key, the same on every object, grouped by meaning: E use, F go on, Q look closer, Y hire a reviewer, T a
 * review thread (or a shell at the console), X end, H hand over what you carry or the review notes to their worker.
 * Verbs sharing a key are never offered together. An aimed verb's key comes before the building's own (H, the
 * overview, while a carried note or review notes can be handed over).
 */
export const KEY: Record<Verb, string> = {
  use: 'E', resume: 'F', goto: 'F', next: 'F', brief: 'Q', overview: 'Q', review: 'Y', thread: 'T', spawn: 'G', shell: 'T', editor: 'C', kill: 'X', stop: 'X', reap: 'Z', hand: 'H', send: 'H',
}

/** Verbs that end something run only once their key or the mouse button is held: the hold is the confirmation. */
export const HELD: ReadonlySet<Verb> = new Set(['kill', 'stop', 'reap'])
export const HOLD_MS = 1200
/** How full a hold started at `start` is at `now`, 0 to 1: it runs at 1. */
export const holdFill = (start: number, now: number) => Math.min(1, (now - start) / HOLD_MS)

/** `whyNot`: the verb is offered but held back, a daemon it needs down or the tower lost; the prompt says why. */
export type Offer = { verb: Verb; label: string; whyNot?: string }

/** A draft taken off its corkboard, in your hand until handed over or put back. */
export type Held = { project: string; id: string }
/** The held draft with its title, as its text shows it now, and its tag. */
export type Carried = Held & { title: string; tag: string }

/**
 * What the building around you is doing, and what you carry, for the verbs that depend on them. `lost`: the tower
 * stopped answering, so the board on show can't say a daemon verb would run.
 */
export type Scene = { sharing: boolean; framed: boolean; music: boolean; carrying: Carried | undefined; beer: boolean; cats: CatNames; lost: boolean }

/** Why a daemon verb can't run now: the tower lost (`lost`), or a daemon it needs down (`whyNot`). */
export const heldWhy = (board: Board, lost: boolean, verb: DaemonVerb) => (lost ? HOST_MEANS.unknown : whyNot(board, verb))

/** `offer` held back with its reason while `heldWhy` holds its verb. */
const holding = (board: Board, scene: Scene, verb: DaemonVerb, offer: Offer): Offer => {
  const why = heldWhy(board, scene.lost, verb)
  return why ? { ...offer, whyNot: why } : offer
}

const quoted = (title: string) => `“${title.length > 28 ? `${title.slice(0, 27)}…` : title}”`

const callsignOf = (board: Board, id: string | undefined) => (id && findCard(board, id)?.callsign) ?? 'its resume'

/** A worker's continuation: resumed here, or followed to whoever resumed it. */
const goOn = (board: Board, scene: Scene, c: Card): Offer[] =>
  can(c, 'goto') ? [{ verb: 'goto', label: `go to ${current(c)!.resumedBy!.callsign}` }]
    : can(c, 'resume') ? [holding(board, scene, 'resume', { verb: 'resume', label: 'resume' })] : []

const floorOf = (board: Board, project: string) => board.floors.find((f) => f.id === project)

/** Whether a floor keeps review threads. */
export const keepsThreads = (board: Board, project: string) => Boolean(floorOf(board, project)?.collections.some((c) => c.id === REVIEWS))

const notes = (n: number) => `${n} note${n === 1 ? '' : 's'}`

/** A worker's review thread: its own checkout's, its author's for a reviewer, with what is new to it. */
const threadOffer = (board: Board, c: Card): Offer[] => {
  if (!keepsThreads(board, c.project)) return []
  const checkout = threadCheckoutOf(c)
  if (checkout !== c.checkout) return [{ verb: 'thread', label: `the review thread of ${checkout}` }]
  return [{ verb: 'thread', label: c.unseen ? `read ${notes(c.unseen)} new to it` : 'review thread' }]
}

/** Who Send reaches on a checkout's thread unless the viewer picks: the worker most recently active there, at its composer. */
export const sendTargetOf = (board: Board, project: string, checkout: string) => {
  const f = floorOf(board, project)
  return f && sendTargets(f, checkout).find((c) => c.checkout === checkout)
}

/** Those X sends home: the worker's crew that runs when it is in one (`send-home`), else the worker. */
export const sentHome = (cards: Card[], c: Card): Card[] => (c.calls['send-home'] ?? [c.calls.kill!]).map(([, { id }]) => cards.find((h) => h.id === id)!)

const homeLabel = (board: Board, c: Card) => {
  const others = sentHome(floorOf(board, c.project)!.cards, c).filter((h) => h.id !== c.id)
  return others.length ? `send home${c.live ? ' with' : ''} ${others.map((h) => h.callsign).join(', ')}` : 'send home'
}

/**
 * A worker at its desk or on the wall: a running one is driven first; a stopped one is resumed first, and can still
 * be looked at, its last screen read-only.
 */
const workerOffers = (board: Board, scene: Scene, c: Card, drive: string): Offer[] => {
  const look: Offer = { verb: 'use', label: c.live ? drive : 'see its last screen' }
  const rest: Offer[] = [
    ...(can(c, 'brief') ? [{ verb: 'brief' as const, label: 'logbook' }] : []),
    ...threadOffer(board, c),
    ...(can(c, 'review') ? [holding(board, scene, 'review', { verb: 'review', label: 'hire a reviewer' })] : []),
    ...(can(c, 'reap') ? [{ verb: 'reap' as const, label: `reap ${c.resources.length} leftover${c.resources.length === 1 ? '' : 's'}` }] : []),
    ...(can(c, 'send-home') || can(c, 'kill') ? [{ verb: 'kill' as const, label: homeLabel(board, c) }] : []),
  ]
  return c.live ? [look, ...goOn(board, scene, c), ...rest] : [...goOn(board, scene, c), look, ...rest]
}

/** One act kind, by its `kind`. */
export type ActOf<K extends Act['kind']> = Extract<Act, { kind: K }>
/** A function for every act kind, each given its own kind: a new kind fails the typecheck until it has one. */
export type ByKind<R, Args extends unknown[]> = { [K in Act['kind']]: (a: ActOf<K>, ...args: Args) => R }

/** Calls the entry for `a`'s kind. */
export const byKind = <R, Args extends unknown[]>(table: ByKind<R, Args>, a: Act, ...args: Args): R =>
  (table[a.kind] as (a: Act, ...args: Args) => R)(a, ...args)

/** A carried note goes to a worker at its composer: typed in and submitted. */
const handTo = (c: Card, scene: Scene): Offer[] =>
  scene.carrying && can(c, 'submit') ? [{ verb: 'hand', label: `hand over ${quoted(scene.carrying.title)}` }] : []

const workerAt = (drive: string) => (a: { id: string }, board: Board, scene: Scene): Offer[] => {
  const c = findCard(board, a.id)
  if (!c) return []
  const [first, ...rest] = workerOffers(board, scene, c, drive)
  return [first, ...handTo(c, scene), ...rest]
}

const shelfOffers = (a: { project: string; n: number }, board: Board, label: (entry: ShelfEntry) => string): Offer[] => {
  const entry = board.floors.find((f) => f.id === a.project)?.shelf?.[a.n]
  return entry ? [{ verb: 'use', label: label(entry) }] : []
}

/** What each kind of thing offers now, its primary first. Empty when it offers nothing. */
const OFFERS: ByKind<Offer[], [Board, Scene]> = {
  desk: workerAt('sit'),
  papers(a, board) {
    const c = findCard(board, a.id)
    if (!c?.unseen) return []
    return [
      { verb: 'thread', label: `read ${notes(c.unseen)} new to ${c.callsign}` },
      ...(can(c, 'submit') ? [{ verb: 'send' as const, label: `send them to ${c.callsign}` }] : []),
      { verb: 'use', label: c.live ? 'sit' : 'see its last screen' },
    ]
  },
  binder: (a, board) => (findCard(board, a.id) ? [{ verb: 'use', label: 'open its logbook' }] : []),
  drawer(a) {
    const d = drawersAt(a.project)?.[a.n]
    return d ? [{ verb: 'use', label: `pull out ${drawerLabel(d)}: ${d.folders.length} worker${d.folders.length === 1 ? '' : 's'}` }] : []
  },
  thread(a, board) {
    const t = floorOf(board, a.project)?.threads.find((t) => t.checkout === a.checkout)
    if (!t) return []
    const to = sendTargetOf(board, a.project, a.checkout)
    return [
      { verb: 'thread', label: `read the thread of ${a.checkout}: ${notes(t.messages)}` },
      ...(to?.unseen ? [{ verb: 'send' as const, label: `send ${notes(to.unseen)} new to ${to.callsign}` }] : []),
    ]
  },
  station(a, board, scene) {
    const f = board.floors.find((f) => f.id === a.project)
    if (!a.open || !f) return []
    const why = heldWhy(board, scene.lost, 'spawn')
    if (why) return [{ verb: 'use', label: 'hire a worker', whyNot: why }]
    if (!can(f, 'spawn')) return []
    const note = scene.carrying
    const where = defaultWhere(f) === 'new' ? 'in a worktree of its own' : 'in the main checkout'
    return [
      { verb: 'use', label: `hire a worker ${where}` },
      ...(note ? [{ verb: 'hand' as const, label: `hire a worker ${where} on ${quoted(note.title)}` }] : []),
      { verb: 'spawn', label: note ? `new worker on ${quoted(note.title)}: choose where, model, effort` : 'new worker: choose where, model, effort' },
    ]
  },
  tile: workerAt('open here'),
  shown(a, board) {
    const latest = findCard(board, a.id)?.shown.at(-1)
    return latest ? [{ verb: 'use', label: `look at ${quoted(shownTitle(latest))}` }] : []
  },
  picture(a, board) {
    const picture = pictureOf(board, a.id, a.target)
    if (!picture) return []
    return [
      { verb: 'use', label: `look at ${quoted(shownTitle(picture.shown))}` },
      ...(picture.card?.onDuty ? [{ verb: 'goto' as const, label: `go to ${picture.worker.callsign}'s desk` }] : []),
    ]
  },
  leftover(a, board) {
    const c = findCard(board, a.id)
    const r = c?.resources.find((r) => r.pid === a.pid)
    if (!c || !r) return []
    return [
      ...(can(r, 'reap') ? [{ verb: 'reap' as const, label: `end ${r.pid}${r.ports.length ? ` :${r.ports.join(' :')}` : ''}` }] : []),
      ...(c.onDuty ? [{ verb: 'goto' as const, label: `go to ${c.callsign}'s desk` }] : []),
    ]
  },
  tidy(a, board) {
    const f = floorOf(board, a.project)
    if (!f || !can(f, 'tidy')) return []
    return [{ verb: 'use', label: 'the list, at the console' }, { verb: 'reap', label: tidyLine(f.tidy).toLowerCase() }]
  },
  landed(a, board) {
    const f = floorOf(board, a.project)
    const row = f && landedRow(f, a.id, wallNow())
    if (!row) return []
    return [
      { verb: 'reap', label: `kill ${row.what}: only this` },
      ...(findCard(board, a.id)?.onDuty ? [{ verb: 'goto' as const, label: `go to ${row.what}'s desk` }] : []),
      { verb: 'use', label: 'the list, at the console' },
    ]
  },
  guest(a, board, scene) {
    const c = findCard(board, a.id)
    return c ? [...goOn(board, scene, c), ...(can(c, 'brief') ? [{ verb: 'brief' as const, label: 'logbook' }] : [])] : []
  },
  shell: (a, board) => (board.shells.some((s) => s.id === a.id) ? [{ verb: 'use', label: 'use' }, { verb: 'kill', label: 'kill' }] : []),
  floor(a, board, scene) {
    const f = board.floors.find((f) => f.id === a.id)
    if (!f) return []
    const spawn: Offer = { verb: 'spawn', label: 'new session' }
    const shell: Offer = { verb: 'shell', label: `shell in ${base(f.hub)}` }
    return [
      { verb: 'use', label: 'dirs, shells, archive' },
      ...(heldWhy(board, scene.lost, 'spawn') || can(f, 'spawn') ? [holding(board, scene, 'spawn', spawn)] : []),
      ...(heldWhy(board, scene.lost, 'shell') || can(f, 'shell') ? [holding(board, scene, 'shell', shell)] : []),
      ...(can(f, 'editor') ? [{ verb: 'editor' as const, label: `${base(f.hub)} in your editor` }] : []),
    ]
  },
  shelf: (a, board) => shelfOffers(a, board, (entry) => ('link' in entry ? 'open in a new tab' : shelfKind(entry) === 'md' ? 'read the newest' : 'watch')),
  book: (a, board) => shelfOffers(a, board, () => 'read'),
  cork(a, _, scene) {
    const note = scene.carrying
    if (!note) return [{ verb: 'use', label: 'write a new draft' }]
    return note.project === a.project ? [{ verb: 'use', label: `put ${quoted(note.title)} back` }] : []
  },
  note(a, board, scene) {
    if (!draftItem(board.floors, a.project, a.id)) return []
    return [
      ...(scene.carrying ? [] : [{ verb: 'use' as const, label: 'take it' }]),
      { verb: 'brief', label: 'read and edit' },
      { verb: 'kill', label: 'throw away' },
    ]
  },
  arcade: (a, board) => (gameItem(board.floors, a.project, a.id) ? [{ verb: 'use', label: 'play' }] : []),
  cat: (a, board, scene) => [
    { verb: 'use', label: `pet ${catName(a.name, scene.cats)}` },
    ...(a.watching ? [{ verb: 'goto' as const, label: `go to ${callsignOf(board, a.watching)}` }] : []),
  ],
  tv(_, __, scene) {
    const label = scene.sharing ? 'watch' : scene.framed ? 'share a screen: opens the tower in a tab of its own' : 'share a screen, a window or a tab'
    return [{ verb: 'use', label }, ...(scene.sharing ? [{ verb: 'stop' as const, label: 'stop sharing' }] : [])]
  },
  directory: (_, board) => [
    { verb: 'use', label: 'every floor and desk' },
    ...(waitingCards(board).length ? [{ verb: 'next' as const, label: 'next waiting' }] : []),
    { verb: 'overview', label: 'the whole tower' },
  ],
  dj: (_, __, scene) => [{ verb: 'use', label: scene.music ? 'music off' : 'music on' }],
  bar: (_, __, scene) => (scene.carrying ? [] : [{ verb: 'use', label: scene.beer ? 'put your beer down' : 'grab a beer' }]),
  elevator: () => [{ verb: 'use', label: 'choose a floor' }],
  stats: () => [{ verb: 'use', label: "every floor's stats" }],
}

/** The verbs an aimed thing offers now, its primary first. Empty when it offers nothing. */
export const offersOf = (a: Act, board: Board, scene: Scene): Offer[] => byKind(OFFERS, a, board, scene)

/** The offer a key runs, by `KeyboardEvent.code`. */
export const offerForKey = (offers: Offer[], code: string) => offers.find((o) => `Key${KEY[o.verb]}` === code)
