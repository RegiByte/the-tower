/**
 * Tower 3D's app: one machine over what the page has decided (decision `tower3d-system`). Its db holds the panel open
 * beside the world, the view, the desk's tab, where to go once the board shows it, a replay, and attention. Handlers
 * are pure: each returns every effect of a transition at once, the next db first, so no executor dispatches while one
 * runs. The executors live where the DOM and the building are (app-loop.ts).
 *
 * A panel moves by `go`, as the page's views do: the panel open is left, unless the next stays in its room, and the
 * next entered, then drawn. Desks, shells and the big screen share one room; they and a game focus the view. Leaving or
 * entering a kind is an executor's table entry (`LEAVE`, `ENTER`); a kind whose opener and closer still do its DOM
 * themselves has an empty entry. A desk's tabs move the same way inside the desk (`tab`).
 */
import { attendNext, type AttendEvent, type AttendOut, type Attending } from '/lib/attend.js'
import type { Handlers, StateEffect, TimerEffect } from '/lib/machine.js'
import { subjectAt, type Lines, type Subject } from '/lib/board.js'
import { STATS_ALL, type Stats } from '/lib/stats.js'
import { askTransitions, cardsOf, findCard, pictureOf, shownKey, transitions } from './cards.ts'
import { gameItem } from './games.ts'
import { cabinetOf, deskOf, kioskOf, type Plan } from './layout.ts'
import type { Board, Floor, ShelfSelf } from './api.ts'
import type { Archived, Drawer } from './archive.ts'
import type { Act } from './acts.ts'
import type { Pet } from './pet.ts'
import type { Hold, Panel, Standing, View } from './state.ts'
import type { Layout } from '/lib/layout.js'
import { shownTab, type DeskTab } from './ui.ts'

/** The tab a desk opens on once it opens: its brief, its review thread, or lines of its Changes. */
export type PendingTab = { id: string; tab: 'brief' | 'reviews' } | { id: string; tab: 'changes'; lines: Lines }

/** Where to go once the board shows it, and what a desk opens on once it opens. */
export type Pending = {
  /** A desk or shell just spawned or resumed. */
  desk: string | undefined
  shell: string | undefined
  tab: PendingTab | undefined
  /** A desk to open on a showing's tab, by its worker and the showing's target. */
  shown: { id: string; target: string } | undefined
}

/** A past session of a worker at a desk replayed on its monitor, and in its desk panel: its last screen, until back to live. */
export type Replay = { id: string; session: string }

/** A desk's tab to show: Changes scrolled to `lines` when given, a showing by itself. */
export type TabTo = { tab: 'screen' } | { tab: 'brief' } | { tab: 'reviews' } | { tab: 'changes'; lines: Lines | undefined } | { tab: 'shown'; target: string }

/** A point or a direction, and a rotation, as plain numbers: the db holds no three.js object. */
export type Vec3 = readonly [number, number, number]
export type Quat = readonly [number, number, number, number]

/** The car riding from level `from` to `to` since `start`, in simulated ms: its doors shut, then it moves for `move` seconds. */
export type Ride = { from: number; to: number; start: number; move: number }
/** The camera flying from where it was to `to` over `ms` from `start`, in simulated ms, `then` fired once it lands. */
export type Flight = { from: Vec3; to: Vec3; fromQ: Quat; toQ: Quat; start: number; ms: number; then: AppEvent | undefined }
/** A cut to elsewhere in the building: out to black, there once `at` has passed, back in, `then` fired. */
export type Cut = { at: number; level: number; spot: Standing; then: AppEvent }

/**
 * What moves on its own until it is done, each from when it started: the frames derive how far along it is and
 * dispatch once when it is done, so the db changes only as one starts or ends.
 */
export type Motion = { ride: Ride | undefined; flight: Flight | undefined; cut: Cut | undefined; pet: Pet | undefined }

/** Where a cut or a flight leaves you, and what is done once there. */
export type Arrival =
  /** At a worker's desk, sat down if it still stands. */
  | { kind: 'desk'; id: string }
  /** At a shell's kiosk, its terminal open if the kiosk still stands. */
  | { kind: 'shell'; id: string }
  /** Out of the elevator on a level, the mouse taken. */
  | { kind: 'level' }
  /** On the floor an ask is about, its console open and the ask said. */
  | { kind: 'ask'; project: string; said: string }
  /** Over the city, the view orbiting `center`. */
  | { kind: 'overview'; center: Vec3 }
  /** Low beside the cat being petted, which purrs. */
  | { kind: 'pet' }

/** An act as a key: two acts with one key are the same thing, aimed at again. */
export const actKey = (a: Act | undefined) => JSON.stringify(a ?? null)

/**
 * What the crosshair or the pointer was last on, and what the prompt offers verbs for: the two part while the view is
 * elsewhere, the prompt emptied and the act last aimed at kept. Each act is kept with its key, so a frame compares keys
 * and dispatches only when one changes. What the prompt offers is derived (`offersOf`).
 */
export type Aim = {
  aimed: Act | undefined
  aimedKey: string
  offered: Act | undefined
  offeredKey: string
  /** The offer the wheel marked, as marked: read within the offers there are now (`markedIn`). */
  marked: number
  hold: Hold | undefined
}

/** The marked offer's index among `count` offers. */
export const markedIn = (aim: Aim, count: number) => Math.min(aim.marked, Math.max(0, count - 1))

/**
 * Whether walking has the mouse, as the page and the door report it: pointer lock, or the door's capture standing in
 * for it. `still`: the mouse let go with P, the view holding as it was, without the pause card, until it is taken again.
 */
export type Capture = { locked: boolean; door: boolean; still: boolean }

/** Whether walking has the mouse. */
export const captured = (c: Capture) => c.locked || c.door

/**
 * What the building took and its plan is derived from: a board, the shelf entry this page is, each floor's archive as
 * read for that board, and the wall time it was planned at.
 */
export type Building = { board: Board; self: ShelfSelf | undefined; archived: Archived; at: number }

/** A board arrived and waiting for its floors' archives to be read at its keys, and the shelf entry this page is with it. */
export type Waiting = { board: Board; self: ShelfSelf | undefined }

/**
 * The Stats panel's read: the last read over the viewer's range and when, why it failed while none is held, the scope
 * shown, and the number of the read whose answer is taken; an answer to an earlier one lands on nothing.
 */
export type StatsRead = { read: Stats | undefined; failed: string | undefined; at: number | undefined; scope: string; reading: number }

/** Which titles arrived: notes' (drafts), kept items', games'. */
export type Titles = 'notes' | 'kept' | 'games'

export type Db = {
  building: Building | undefined
  /** The latest board arrived whose archives aren't all read yet: a later one replaces it, and it is taken once they are. */
  waiting: Waiting | undefined
  panel: Panel | undefined
  /** Whether the window has your eye, and what asks for you, said and rung as every renderer does (`attend.ts`). */
  attending: Attending
  view: View
  deskTab: DeskTab
  pending: Pending
  replay: Replay | undefined
  motion: Motion
  aim: Aim
  capture: Capture
  stats: StatsRead
  /**
   * The door has captured: its capture stands in for pointer lock and follows every lock and unlock the way pointer
   * lock would (`capture.door`), and the page plays and rings nothing.
   */
  doorMode: boolean
  /** Kept by the tower for this page: the music off, the frame meter shown. */
  muted: boolean
  meterShown: boolean
  /** The waits visited by N this round (`Heed`); what you dismissed and how waits ring are attention's (`attend.ts`). */
  visited: ReadonlySet<string>
  /** The web page of each project directory's origin remote. */
  origins: Record<string, string>
  /** Your own layout of Tower 3D, kept in `tower.store` under `layout.tower3d`, over the config's and the renderer's. */
  layout: Layout | undefined
}

export type AppEvent =
  | AttendEvent
  | { type: 'go'; to: Panel | undefined }
  /** The open panel's own data changed, the same panel still open: a read landed, a filter typed, a tray unfolded. */
  | { type: 'panel'; to: Panel }
  | { type: 'tab'; to: TabTo }
  | { type: 'replay'; id: string; session: string | undefined }
  | { type: 'pend'; pending: Partial<Pending> }
  /** The view, set by what isn't a panel: the overview, petting. */
  | { type: 'view'; view: View }
  /** A board arrived: it waits for its floors' archives, read at its keys, and the building takes it once they are. */
  | { type: 'board/arrived'; board: Board; self: ShelfSelf | undefined }
  /** The archives the board waiting needs were asked for at wall time `at`: if every one was held already, it is taken now. */
  | { type: 'archives/asked'; at: number }
  /** A floor's archive read landed or failed at wall time `at`: the board waiting is taken if it was the last. */
  | { type: 'archive/landed'; at: number }
  /** A floor's archive can't be read. */
  | { type: 'archive/failed'; message: string }
  /** A text arrived that titles are drawn from: notes on the boards, kept items in the trays, games on the cabinets. */
  | { type: 'titles/arrived'; of: Titles }
  /** The Stats panel read again over the viewer's range: on entering it, every minute while it is open. */
  | { type: 'stats/read' }
  /** The Stats panel's Read again: its failure forgotten, read again. */
  | { type: 'stats/again' }
  /** The viewer's stats range changed: what is held or in flight was over another, so it is dropped. */
  | { type: 'stats/range' }
  /** The Stats panel shows `scope`: the overview or a floor. */
  | { type: 'stats/scope'; scope: string }
  /** Read `reading` answered `read` at wall time `at`. */
  | { type: 'stats/landed'; reading: number; read: Stats; at: number }
  | { type: 'stats/failed'; reading: number; message: string }
  /** The plan stops holding by time alone at wall time `until`: its timer fired, maybe late. */
  | { type: 'replan-due'; until: number }
  /** The building plans its board again at wall time `at`, `until` or later when the timer fired late. */
  | { type: 'replan'; at: number }
  | { type: 'ride'; ride: Ride }
  | { type: 'ride-arrived' }
  | { type: 'fly'; flight: Flight }
  | { type: 'flight-landed' }
  | { type: 'cut'; cut: Cut }
  | { type: 'cut-reached' }
  /** Standing at `spot` on `level` at once, out of any ride or flight. */
  | { type: 'place'; level: number; spot: Standing }
  | { type: 'pet'; pet: Pet }
  | { type: 'pet-done' }
  | { type: 'arrived'; at: Arrival }
  /** The crosshair or the pointer found `act`, which the prompt now offers verbs for. */
  | { type: 'aimed'; act: Act | undefined; key: string }
  /** The prompt offers verbs for `act`, what was last aimed at kept. */
  | { type: 'offered'; act: Act | undefined; key: string }
  | { type: 'mark'; marked: number }
  | { type: 'hold'; hold: Hold }
  /** The held key or button let go of, or no longer seen held. */
  | { type: 'unhold' }
  /** Pointer lock was taken or lost (`pointer`), or the door's capture (`door`). */
  | { type: 'capture'; by: 'pointer' | 'door'; held: boolean }
  /** The mouse let go of: by Esc, or as a panel opens. */
  | { type: 'unlock' }
  /** The mouse let go of with P: the view holds still. */
  | { type: 'let-go' }
  /** The held verb's ring filled: the frame that saw it runs the verb, as a key does, once this is handled. */
  | { type: 'hold-filled' }
  /** A view mounted in a panel changed what it draws. */
  | { type: 'views/changed' }
  /** A view mounted in a panel handed `subject` to be placed (the kit's `display`). */
  | { type: 'display'; subject: Subject | string }
  /** The door took over the mouse (`capture`) or gave it back (`release`). */
  | { type: 'door/mode'; on: boolean }
  /** The music turned off or on. */
  | { type: 'music/muted'; muted: boolean }
  /** The frame meter shown or hidden. */
  | { type: 'meter/shown'; shown: boolean }
  /** What the tower kept for this page, landed with the models: it sets the music's state without starting it. */
  | { type: 'kept/landed'; muted: boolean; meterShown: boolean }
  /** N went round the waits: those visited this round. */
  | { type: 'visited'; visited: ReadonlySet<string> }
  /** The origin remotes' web pages read. */
  | { type: 'origins/read'; origins: Record<string, string> }
  /** Your layout as `tower.store` keeps it, read again. */
  | { type: 'layout/stored'; layout: Layout | undefined }

export type AppEffect =
  | AttendOut
  | StateEffect<Db>
  | TimerEffect<AppEvent>
  | { type: 'leave'; panel: Panel }
  | { type: 'enter'; panel: Panel; from: Panel | undefined }
  | { type: 'tab/leave'; tab: DeskTab }
  | { type: 'tab/enter'; id: string; to: TabTo }
  /** The desk's screen mounted again: live, or the replay of its worker's session. */
  | { type: 'desk/screen'; id: string }
  /** The monitors show the replay, or live again. */
  | { type: 'replays' }
  | { type: 'fly-home' }
  | { type: 'toast'; text: string }
  /** Every floor's archive read at `board`'s keys, then `archives/asked` dispatched. */
  | { type: 'archives/read'; board: Board }
  /** The filing cabinets file what the archives read now hold. */
  | { type: 'filings' }
  /** The notes on the floors' boards, titled as their drafts' texts say. */
  | { type: 'notes' }
  /** The arcade's cabinets, titled as their games' texts say. */
  | { type: 'cabinets' }
  /** The stats read over the viewer's range, answered as `stats/landed` or `stats/failed` with `reading`. */
  | { type: 'stats/fetch'; reading: number }
  /** The world takes the building's board: its layers reconciled, what it shows outside panels written. `was` is the board before. */
  | { type: 'world/apply'; was: Board | undefined }
  /** A firework over the roof party for each worker whose turn finished. */
  | { type: 'fireworks'; cards: { id: string; project: string }[] }
  /** A wait began: the lamps pulse from now. */
  | { type: 'waits/began' }
  /** An ask began that you haven't dismissed: said, with a way to go to it. */
  | { type: 'asked'; ask: Board['asks'][number] }
  /** A showing new since the board before: its worker holds it up and you hear it, said unless you sit at its desk. */
  | { type: 'shown/arrived'; id: string; target: string; atDesk: boolean }
  /** `replan` dispatched at the wall clock's time, never before `until`. */
  | { type: 'replan/at'; until: number }
  /** The game open framed again on its cabinet, which moved along. */
  | { type: 'game/frame'; project: string; id: string }
  /** The open desk's brief and the reader's logbook read again when their worker changed. */
  | { type: 'logbooks' }
  /** To a desk or a shell pending once the board shows it, sat down at it. */
  | { type: 'desk/go'; id: string }
  | { type: 'shell/go'; id: string }
  /** The panels drawn from the db and the board, once, at the next frame. */
  | { type: 'draw' }
  /** Focus on the first element `selector` names once the panels are drawn. */
  | { type: 'focus'; selector: string }
  /** `subject` placed: a worker's lines in its desk's Changes, anything else said in a toast. */
  | { type: 'display'; subject: Subject | string }
  /** `event` dispatched, once this transition's effects have run: what a cut or a flight fires as it ends. */
  | { type: 'fire'; event: AppEvent }
  /** You stand at `spot` on `level`, the camera at your eyes, the HUD and the elevator's panel drawn for where you are. */
  | { type: 'place'; level: number; spot: Standing }
  /** The screen faded out to black, or back in. */
  | { type: 'fade'; on: boolean }
  | { type: 'hud' }
  | { type: 'elevator' }
  /** What is done once there that the db can't decide: a desk or a kiosk still standing, the mouse, the orbit, a purr. */
  | { type: 'arrived'; at: Exclude<Arrival, { kind: 'ask' }> }
  /** The mouse let go of: pointer lock exited, the door's capture released. */
  | { type: 'unlock' }
  /** The keys held let go of and the pause card drawn, as the mouse is taken or let go of. */
  | { type: 'captured' }
  /** The music played, unless something keeps it quiet, or paused. */
  | { type: 'music'; on: boolean }
  /** The frame meter shown or hidden. */
  | { type: 'meter'; shown: boolean }

export const startingDb = (attending: Attending): Db => ({
  building: undefined,
  waiting: undefined,
  panel: undefined,
  attending,
  view: 'walk',
  deskTab: 'screen',
  pending: { desk: undefined, shell: undefined, tab: undefined, shown: undefined },
  replay: undefined,
  motion: { ride: undefined, flight: undefined, cut: undefined, pet: undefined },
  aim: { aimed: undefined, aimedKey: actKey(undefined), offered: undefined, offeredKey: actKey(undefined), marked: 0, hold: undefined },
  capture: { locked: false, door: false, still: false },
  stats: { read: undefined, failed: undefined, at: undefined, scope: STATS_ALL, reading: 0 },
  doorMode: false,
  muted: false,
  meterShown: false,
  visited: new Set(),
  origins: {},
  layout: undefined,
})

const into = (db: Db): AppEffect => ({ type: 'state', state: db })
const DRAW: AppEffect = { type: 'draw' }
const moved = (db: Db, motion: Partial<Motion>): Db => ({ ...db, motion: { ...db.motion, ...motion } })
const fire = (event: AppEvent | undefined): AppEffect[] => (event ? [{ type: 'fire', event }] : [])

const UNLOCK: AppEffect = { type: 'unlock' }
const withCapture = (db: Db, capture: Partial<Capture>): Db => ({ ...db, capture: { ...db.capture, ...capture } })
const withAim = (db: Db, aim: Partial<Aim>): Db => ({ ...db, aim: { ...db.aim, ...aim } })

/** The prompt offers verbs for `act`: a different act starts the mark and the hold over. */
const offering = (aim: Aim, act: Act | undefined, key: string): Aim =>
  key === aim.offeredKey ? { ...aim, offered: act } : { ...aim, offered: act, offeredKey: key, marked: 0, hold: undefined }

/** Standing at `spot` on `level`, out of any ride or flight. */
const placed = (db: Db, level: number, spot: Standing): AppEffect[] => [into(moved(db, { ride: undefined, flight: undefined })), { type: 'place', level, spot }]

const attend = (db: Db, e: AttendEvent): AppEffect[] => {
  const [attending, effects] = attendNext(db.attending, e)
  return [into({ ...db, attending }), ...effects]
}

/** The panels that share one room, the desk's panel and the big screen: from one to another, the first isn't left. */
const ROOM = new Set<Panel['kind']>(['desk', 'shell', 'tv'])
const inRoom = (p: Panel | undefined) => p !== undefined && ROOM.has(p.kind)
const sameRoom = (from: Panel | undefined, to: Panel | undefined) => from?.kind === to?.kind || (inRoom(from) && inRoom(to))

/** The panels the view focuses on as they are entered: the camera up close, not at your eyes. */
const FOCUSES = new Set<Panel['kind']>(['desk', 'shell', 'tv', 'game'])
const focuses = (p: Panel | undefined) => p !== undefined && FOCUSES.has(p.kind)

/** What a panel's keys go to once it is entered and drawn: the picker's first place, the archive's filter, the draft's text. */
const FOCUS_ON: Partial<Record<Panel['kind'], string>> = { 'shell-pick': '#shell-pick [data-shell-dir]', archive: '#archive-filter', draft: '#draft-text' }

/** The worker whose desk is open. */
export const atDesk = (db: Db) => (db.panel?.kind === 'desk' ? db.panel.id : undefined)

const tabName = (to: TabTo): DeskTab => (to.tab === 'shown' ? shownTab(to) : to.tab)

/** The desk's tab `from` left for `to`, unless it is `to`, and `to` entered, even when it is: a tab entered again is read again. */
const tabbed = (from: DeskTab, id: string, to: TabTo): AppEffect[] => [...(tabName(to) === from ? [] : [{ type: 'tab/leave', tab: from } as const]), { type: 'tab/enter', id, to }]

/** The tabs a desk opens on: the one pending for it, then a showing pending for it. */
const tabsPending = (pending: Pending, id: string): TabTo[] => {
  const tab = pending.tab?.id === id ? pending.tab : undefined
  return [
    ...(tab ? [tab.tab === 'changes' ? { tab: 'changes' as const, lines: tab.lines } : { tab: tab.tab }] : []),
    ...(pending.shown?.id === id ? [{ tab: 'shown' as const, target: pending.shown.target }] : []),
  ]
}

/**
 * The panel goes to `to`: the open one left unless `to` stays in its room, `to` entered, all drawn. A desk opens on
 * its screen, then on what was pending for it; entering a desk, a shell, the big screen or a game focuses the view, and
 * leaving one for a panel that doesn't walks again, the camera back at your eyes. Attention is told the desk you sit at.
 */
function went(db: Db, to: Panel | undefined): AppEffect[] {
  const from = db.panel
  const stays = sameRoom(from, to)
  const enters = focuses(to)
  const unfocuses = !stays && focuses(from) && !enters && db.view === 'focus'
  const view = enters ? 'focus' : unfocuses ? 'walk' : db.view
  const tabs = to?.kind === 'desk' ? tabsPending(db.pending, to.id) : []
  const steps = to?.kind === 'desk' ? tabs.reduce<{ at: DeskTab; effects: AppEffect[] }>((t, next) => ({ at: tabName(next), effects: [...t.effects, ...tabbed(t.at, to.id, next)] }), { at: 'screen', effects: [] }) : undefined
  const next: Db = {
    ...db,
    panel: to,
    view,
    ...(to && { capture: { ...db.capture, still: false } }),
    ...(steps && { deskTab: steps.at, pending: { ...db.pending, tab: undefined, shown: undefined } }),
  }
  const [state, ...told] = attend(next, { type: 'watch', at: to?.kind === 'desk' ? to.id : undefined })
  return [
    state,
    ...told,
    ...(!stays && from ? [{ type: 'leave', panel: from } as const] : []),
    ...(unfocuses ? [{ type: 'fly-home' } as const] : []),
    ...(to ? [UNLOCK, { type: 'enter', panel: to, from } as const] : []),
    ...(steps?.effects ?? []),
    DRAW,
    ...(to && FOCUS_ON[to.kind] ? [{ type: 'focus', selector: FOCUS_ON[to.kind]! } as const] : []),
  ]
}

/**
 * What the handlers read of a board through an extension's client, and the building's plan, handed in once: pure reads
 * of the board's data.
 */
export type AppReads = {
  /** The building's plan, derived from what it took (memoized on it). */
  planOf: (b: Building) => Plan
  /** Whether the wall clock moves: a pinned one (`?at=`, a fixture) never replans. */
  clockMoves: boolean
  /** Whether every floor's archive is read, or failed to be, at `board`'s keys. */
  archivesSettled: (board: Board) => boolean
  /** Each floor's archive as read at `board`'s keys: the snapshot a building takes with it. */
  archivedAt: (board: Board) => Archived
  /** A floor's filing cabinet's drawers, as its archive's latest read holds them; `undefined` until one lands. */
  drawersAt: (project: string) => Drawer[] | undefined
  /** A floor's review threads, by checkout and the key their subject is named by. */
  threadsOf: (f: Floor) => { checkout: string; key: string }[]
  /** Whether a floor keeps drafts: the drafts extension is on there. */
  keepsDrafts: (f: Floor) => boolean
}

/**
 * The panel whose subject the board no longer holds: a desk's worker gone, a shell ended, a floor removed, a shelf
 * entry, a kept item, a game or a review thread gone, a floor no longer keeping drafts, a drawer its floor's archive no
 * longer fills, a picture its gallery no longer hangs.
 */
function subjectLeft(panel: Panel | undefined, board: Board, plan: Plan, reads: AppReads) {
  if (!panel) return false
  const floor = (id: string) => board.floors.find((f) => f.id === id)
  switch (panel.kind) {
    case 'desk': return !findCard(board, panel.id)
    case 'shell': return !board.shells.some((sh) => sh.id === panel.id)
    case 'floor': case 'archive': return !floor(panel.id)
    case 'doc': return !floor(panel.project)?.shelf?.[panel.n]
    case 'kept': return !keptItem(board, panel)
    case 'drawer': return !floor(panel.project) || !reads.drawersAt(panel.project)?.[panel.n]
    case 'picture': return !pictureOf(plan.galleries, board, panel.id, panel.target)
    case 'game': return !gameItem(board.floors, panel.project, panel.id)
    case 'draft': {
      const f = floor(panel.project)
      return !f || !reads.keepsDrafts(f)
    }
    case 'thread': {
      const f = floor(panel.project)
      const t = f && reads.threadsOf(f).find((t) => t.checkout === panel.checkout)
      return !t || !subjectAt(board, threadSubjectKey(panel.project, t.key))
    }
    default: return false
  }
}

/** The subject a floor's review thread is read as, its view mounted on it. */
export const threadSubjectKey = (project: string, key: string) => `reviews.thread:floor:${project}/${key}`

const keptItem = (board: Board, k: Extract<Panel, { kind: 'kept' }>) =>
  board.floors.find((f) => f.id === k.project)?.collections.find((c) => c.id === k.collection)?.items.find((i) => i.id === k.id)

/** What closing a panel whose subject left says: a kept item deleted, since nothing else shows it went. */
const leftSaid = (panel: Panel | undefined): AppEffect[] => (panel?.kind === 'kept' ? [{ type: 'toast', text: 'The item was deleted' }] : [])

/** The kept item open, as `board` holds it now when it changed since its body was read: entered again, it is read again. */
function keptChanged(panel: Panel | undefined, board: Board): Panel | undefined {
  if (panel?.kind !== 'kept') return undefined
  const item = keptItem(board, panel)
  return item && item.modifiedAt !== panel.drawn ? { ...panel, drawn: item.modifiedAt } : undefined
}

/** What is pending, less what `board` no longer holds: a tab of a worker gone, a showing withdrawn. */
const pendingOn = (pending: Pending, board: Board): Pending => ({
  ...pending,
  tab: pending.tab && findCard(board, pending.tab.id) ? pending.tab : undefined,
  shown: pending.shown && findCard(board, pending.shown.id)?.shown.some((sh) => sh.target === pending.shown!.target) ? pending.shown : undefined,
})

/** Each step run on the db the step before it left, their effects in order. */
function steps(db: Db, ...each: ((db: Db) => AppEffect[])[]): AppEffect[] {
  let at = db
  return each.flatMap((step) => {
    const effects = step(at)
    for (const e of effects) if (e.type === 'state') at = e.state
    return effects
  })
}

/** What the building's board leaves of the db: what is pending it no longer holds dropped, the panel whose subject left closed, a kept item changed read again. */
function applied(db: Db, board: Board, plan: Plan, reads: AppReads): AppEffect[] {
  const next = { ...db, pending: pendingOn(db.pending, board) }
  if (subjectLeft(next.panel, board, plan, reads)) return [...went(next, undefined), ...leftSaid(next.panel)]
  const kept = keptChanged(next.panel, board)
  return kept ? went(next, kept) : [into(next), DRAW]
}

/** The game open follows its cabinet: closed once the arcade no longer stands it, framed again where a game kept since moved it along. */
function followCabinet(db: Db, plan: Plan): AppEffect[] {
  if (db.panel?.kind !== 'game') return []
  const game = db.panel
  const at = cabinetOf(plan, game.project, game.id)
  if (!at) return went(db, undefined)
  if (at.cabinet.x === game.x) return []
  return [into({ ...db, panel: { ...game, x: at.cabinet.x } }), DRAW, { type: 'game/frame', project: game.project, id: game.id }]
}

/** Each showing on `next` that `was` didn't hold arrives; at its open desk, its tab opens on it. On the first board, none does. */
function shownArrived(db: Db, was: Board | undefined, next: Board): AppEffect[] {
  if (!was) return []
  const before = new Set(cardsOf(was).flatMap((c) => c.shown.map(shownKey)))
  const arrived = cardsOf(next).flatMap((c) => c.shown.filter((sh) => !before.has(shownKey(sh))).map((sh) => ({ id: c.id, target: sh.target })))
  return steps(db, ...arrived.map(({ id, target }) => (db: Db): AppEffect[] => {
    const here = atDesk(db) === id
    const said: AppEffect = { type: 'shown/arrived', id, target, atDesk: here }
    return here ? [said, ...tabTo(db, id, { tab: 'shown', target })] : [said]
  }))
}

/** The workers whose turn finished between the two boards: working on `was`, done or idle on `next`. */
function finished(was: Board | undefined, next: Board) {
  const working = new Set(was ? cardsOf(was).filter((c) => c.status === 'working').map((c) => c.id) : [])
  return cardsOf(next).filter((c) => working.has(c.id) && (c.status === 'done' || c.status === 'idle')).map((c) => ({ id: c.id, project: c.project }))
}

/**
 * The building takes a board: what changed since the board before said (turns finished, waits and asks begun, showings
 * arrived), the world applied, then what the db holds that the board no longer does (a replay whose desk left, a panel
 * whose subject left, a game whose cabinet moved), and a desk or shell pending gone to once it stands.
 */
function took(db: Db, building: Building, reads: AppReads): AppEffect[] {
  const was = db.building?.board
  const next = building.board
  const plan = reads.planOf(building)
  const fireworks = finished(was, next)
  const asked = askTransitions(was, next).began.filter((a) => !db.attending.dismissed.has(a.key))
  return steps(
    { ...db, building },
    (db) => [
      into(db),
      ...(fireworks.length ? [{ type: 'fireworks', cards: fireworks } as const] : []),
      ...(transitions(was, next).began.length ? [{ type: 'waits/began' } as const] : []),
      ...asked.map((ask) => ({ type: 'asked', ask }) as const),
      { type: 'world/apply', was },
    ],
    (db) => shownArrived(db, was, next),
    (db) => (db.replay && !deskOf(plan, db.replay.id) ? [into({ ...db, replay: undefined })] : []),
    (db) => applied(db, next, plan, reads),
    (db) => followCabinet(db, plan),
    () => [{ type: 'logbooks' }, { type: 'elevator' }],
    (db) => (db.pending.desk && deskOf(plan, db.pending.desk) ? [into({ ...db, pending: { ...db.pending, desk: undefined } }), { type: 'desk/go', id: db.pending.desk }] : []),
    (db) => (db.pending.shell && kioskOf(plan, db.pending.shell) ? [into({ ...db, pending: { ...db.pending, shell: undefined } }), { type: 'shell/go', id: db.pending.shell }] : []),
    () => replanAt(building, plan, reads),
  )
}

/** The board waiting, once every floor's archive is read at its keys: a floor's history is then as current as the board. */
const settles = (db: Db, reads: AppReads) => (db.waiting && reads.archivesSettled(db.waiting.board) ? db.waiting : undefined)

/** The board waiting taken at wall time `at`, once it settles. */
function settled(db: Db, at: number, reads: AppReads): AppEffect[] {
  const w = settles(db, reads)
  return w ? took({ ...db, waiting: undefined }, { board: w.board, self: w.self, archived: reads.archivedAt(w.board), at }, reads) : []
}

/** An archive read landed with no board to take: the panel open closes if its subject left, which only a drawer's can then. */
function archiveLeft(db: Db, reads: AppReads): AppEffect[] {
  const b = db.building
  return b && subjectLeft(db.panel, b.board, reads.planOf(b), reads) ? [...went(db, undefined), ...leftSaid(db.panel)] : []
}

/** What a title's text arriving draws again besides the panels: the notes' boards, the cabinets. */
const TITLED: Record<Titles, AppEffect[]> = { notes: [{ type: 'notes' }], kept: [], games: [{ type: 'cabinets' }] }

/** The Stats panel read again: an answer to any read before this one lands on nothing. */
function statsRead(db: Db): AppEffect[] {
  const reading = db.stats.reading + 1
  return [into({ ...db, stats: { ...db.stats, reading } }), { type: 'stats/fetch', reading }]
}

const withStats = (db: Db, stats: Partial<StatsRead>): Db => ({ ...db, stats: { ...db.stats, ...stats } })

/**
 * The building planned again once its plan stops holding by time alone, while the clock moves; a plan with no end
 * cancels the timer an earlier plan started.
 */
function replanAt(building: Building, plan: Plan, reads: AppReads): AppEffect[] {
  if (!reads.clockMoves) return []
  if (!Number.isFinite(plan.until)) return [{ type: 'timer/cancel', id: 'replan' }]
  return [{ type: 'timer/start', id: 'replan', ms: Math.max(0, plan.until - building.at), fire: { type: 'replan-due', until: plan.until } }]
}

/** The desk's tab goes to `to`. */
const tabTo = (db: Db, id: string, to: TabTo): AppEffect[] => [into({ ...db, deskTab: tabName(to) }), ...tabbed(db.deskTab, id, to), DRAW]

export const appHandlers = (reads: AppReads): Handlers<Db, AppEvent, AppEffect> => ({
  board: attend,
  lost: attend,
  stored: attend,
  dismiss: attend,
  ring: attend,
  remind: attend,
  focus: attend,
  visible: attend,
  watch: attend,
  go: (db, { to }) => went(db, to),
  panel: (db, { to }) => {
    if (db.panel?.kind !== to.kind) throw new Error(`a ${to.kind} panel's data changes only while it is open; the panel is ${db.panel?.kind ?? 'none'}: go to it instead`)
    return [into({ ...db, panel: to }), DRAW]
  },
  tab: (db, { to }) => {
    const id = atDesk(db)
    if (id === undefined) throw new Error(`a desk's ${to.tab} tab opens only at a desk; the panel is ${db.panel?.kind ?? 'none'}`)
    return tabTo(db, id, to)
  },
  replay: (db, { id, session }) => {
    const replay = session === undefined ? undefined : { id, session }
    if (atDesk(db) !== id) return [into({ ...db, replay }), { type: 'replays' }]
    return [into({ ...db, replay, deskTab: 'screen' }), { type: 'replays' }, { type: 'desk/screen', id }, ...tabbed(db.deskTab, id, { tab: 'screen' }), DRAW]
  },
  pend: (db, { pending }) => [into({ ...db, pending: { ...db.pending, ...pending } })],
  view: (db, { view }) => [into({ ...db, view })],
  'board/arrived': (db, { board, self }) => [into({ ...db, waiting: { board, self } }), { type: 'archives/read', board }],
  'archives/asked': (db, { at }) => settled(db, at, reads),
  'archive/landed': (db, { at }) => [...(settles(db, reads) ? settled(db, at, reads) : archiveLeft(db, reads)), { type: 'filings' }, DRAW],
  'archive/failed': (_, { message }) => [{ type: 'toast', text: `The archive can't be read: ${message}` }],
  'titles/arrived': (_, { of }) => [...TITLED[of], DRAW],
  'stats/read': (db) => statsRead(db),
  'stats/again': (db) => [...statsRead(withStats(db, { failed: undefined })), DRAW],
  'stats/range': (db) => {
    const dropped = withStats(db, { read: undefined, reading: db.stats.reading + 1 })
    return db.panel?.kind === 'stats' ? [into(dropped), DRAW, ...statsRead(dropped)] : [into(dropped)]
  },
  'stats/scope': (db, { scope }) => [into(withStats(db, { scope })), DRAW],
  'stats/landed': (db, { reading, read, at }) => (reading === db.stats.reading ? [into(withStats(db, { read, failed: undefined, at })), DRAW] : []),
  'stats/failed': (db, { reading, message }) => {
    if (reading !== db.stats.reading) return []
    return db.stats.read ? [{ type: 'toast', text: message }] : [into(withStats(db, { failed: message })), DRAW]
  },
  'replan-due': (_db, { until }) => [{ type: 'replan/at', until }],
  /** The same board planned again at `at`, its archive as read for it kept: only a new board takes a new read. */
  replan: (db, { at }) => (db.building ? took(db, { ...db.building, at }, reads) : []),
  ride: (db, { ride }) => [into(moved(db, { ride })), { type: 'elevator' }],
  'ride-arrived': (db) => [into(moved(db, { ride: undefined })), { type: 'hud' }, { type: 'elevator' }],
  fly: (db, { flight }) => [into(moved(db, { flight }))],
  'flight-landed': (db) => [into(moved(db, { flight: undefined })), ...fire(db.motion.flight?.then)],
  cut: (db, { cut }) => [into(moved(db, { cut })), { type: 'fade', on: true }],
  'cut-reached': (db) => {
    const cut = db.motion.cut
    if (!cut) throw new Error('a cut is reached only while one is under way: dispatch cut-reached from the frame that finds its time passed')
    return [...placed(moved(db, { cut: undefined }), cut.level, cut.spot), { type: 'fade', on: false }, ...fire(cut.then)]
  },
  place: (db, { level, spot }) => placed(db, level, spot),
  pet: (db, { pet }) => [into(moved({ ...db, view: 'pet' }, { pet }))],
  /** A pet done, or ended by anything else taking the view: you walk again only from the pet's own view, flown home. */
  'pet-done': (db) => {
    const petting = db.view === 'pet'
    return [into(moved({ ...db, view: petting ? 'walk' : db.view }, { pet: undefined })), ...(petting ? [{ type: 'fly-home' } as const] : [])]
  },
  aimed: (db, { act, key }) => [into({ ...db, aim: offering({ ...db.aim, aimed: act, aimedKey: key }, act, key) })],
  offered: (db, { act, key }) => [into({ ...db, aim: offering(db.aim, act, key) })],
  mark: (db, { marked }) => [into(withAim(db, { marked, hold: undefined }))],
  hold: (db, { hold }) => [into(withAim(db, { hold }))],
  unhold: (db) => [into(withAim(db, { hold: undefined }))],
  'hold-filled': (db) => [into(withAim(db, { hold: undefined }))],
  capture: (db, { by, held }) => {
    const next = { ...db.capture, [by === 'pointer' ? 'locked' : 'door']: held }
    return [into({ ...db, capture: captured(next) ? { ...next, still: false } : next }), { type: 'captured' }]
  },
  unlock: (db) => [into(withCapture(db, { still: false })), UNLOCK],
  'let-go': (db) => [into(withCapture(db, { still: true })), UNLOCK],
  'views/changed': () => [DRAW],
  display: (_, { subject }) => [{ type: 'display', subject }],
  'door/mode': (db, { on }) => [into({ ...db, doorMode: on })],
  'music/muted': (db, { muted }) => [into({ ...db, muted }), { type: 'music', on: !muted }, { type: 'hud' }],
  'meter/shown': (db, { shown }) => [into({ ...db, meterShown: shown }), { type: 'meter', shown }],
  'kept/landed': (db, { muted, meterShown }) => [into({ ...db, muted, meterShown }), ...(meterShown ? [{ type: 'meter', shown: true } as const] : [])],
  visited: (db, { visited }) => [into({ ...db, visited })],
  'origins/read': (db, { origins }) => [into({ ...db, origins })],
  'layout/stored': (db, { layout }) => [into({ ...db, layout })],
  arrived: (db, { at }) => (at.kind === 'ask' ? [...went(db, { kind: 'floor', id: at.project, tray: undefined }), { type: 'toast', text: at.said }] : [{ type: 'arrived', at }]),
})
