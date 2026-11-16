/**
 * Tower 3D's app: one machine over what the page has decided (decision `tower3d-system`). Its db holds the panel open
 * beside the world, the view, the desk's tab, where to go once the board shows it, a replay, and attention. Handlers
 * are pure: each returns every effect of a transition at once, the next db first, so no executor dispatches while one
 * runs. The executors live where the DOM and the building are (main.ts).
 *
 * A panel moves by `go`, as the page's views do: the panel open is left, unless the next stays in its room, and the
 * next entered, then drawn. Desks, shells and the big screen share one room, the view focused on them. Leaving or
 * entering a kind is an executor's table entry (`LEAVE`, `ENTER`); a kind whose opener and closer still do its DOM
 * themselves has an empty entry. A desk's tabs move the same way inside the desk (`tab`).
 */
import { attendNext, type AttendEvent, type AttendOut, type Attending } from '/lib/attend.js'
import type { Handlers, StateEffect, TimerEffect } from '/lib/machine.js'
import type { Lines } from '/lib/board.js'
import { findCard } from './cards.ts'
import type { Board } from './api.ts'
import type { Panel, View } from './state.ts'
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

export type Db = {
  panel: Panel | undefined
  /** Whether the window has your eye, and what asks for you, said and rung as every renderer does (`attend.ts`). */
  attending: Attending
  view: View
  deskTab: DeskTab
  pending: Pending
  replay: Replay | undefined
}

export type AppEvent =
  | AttendEvent
  | { type: 'go'; to: Panel | undefined }
  /** The open panel's own data changed, the same panel still open: a read landed, a filter typed, a tray unfolded. */
  | { type: 'panel'; to: Panel }
  | { type: 'tab'; to: TabTo }
  | { type: 'replay'; id: string; session: string | undefined }
  | { type: 'pend'; pending: Partial<Pending> }
  /** The view, set by what isn't a panel `go` moves yet: the overview, petting, a game, the big screen. */
  | { type: 'view'; view: View }
  /** The building took `board`: a panel whose subject left it closes. */
  | { type: 'board-applied'; board: Board }
  /** The replayed worker's desk left the building: the replay ends with it. */
  | { type: 'replay-left' }

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
  /** The panels drawn from the db and the board, once, at the next frame. */
  | { type: 'draw' }
  /** Focus on the first element `selector` names once the panels are drawn. */
  | { type: 'focus'; selector: string }

export const startingDb = (attending: Attending): Db => ({
  panel: undefined,
  attending,
  view: 'walk',
  deskTab: 'screen',
  pending: { desk: undefined, shell: undefined, tab: undefined, shown: undefined },
  replay: undefined,
})

const into = (db: Db): AppEffect => ({ type: 'state', state: db })
const DRAW: AppEffect = { type: 'draw' }

const attend = (db: Db, e: AttendEvent): AppEffect[] => {
  const [attending, effects] = attendNext(db.attending, e)
  return [into({ ...db, attending }), ...effects]
}

/** The panels the view focuses on, which share one room: from one to another, the first isn't left. */
const FOCUSED = new Set<Panel['kind']>(['desk', 'shell', 'tv'])
const focused = (p: Panel | undefined) => p !== undefined && FOCUSED.has(p.kind)
const sameRoom = (from: Panel | undefined, to: Panel | undefined) => from?.kind === to?.kind || (focused(from) && focused(to))

/** What a panel's keys go to once it is entered and drawn: the picker's first place, the archive's filter. */
const FOCUS_ON: Partial<Record<Panel['kind'], string>> = { 'shell-pick': '#shell-pick [data-shell-dir]', archive: '#archive-filter' }

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
 * its screen, then on what was pending for it; entering a desk or shell focuses the view, and leaving the focused room
 * for anything else walks again, the camera back at your eyes. Attention is told the desk you sit at.
 */
function went(db: Db, to: Panel | undefined): AppEffect[] {
  const from = db.panel
  const stays = sameRoom(from, to)
  const enters = to?.kind === 'desk' || to?.kind === 'shell'
  const unfocuses = !stays && focused(from) && db.view === 'focus'
  const view = enters ? 'focus' : unfocuses ? 'walk' : db.view
  const tabs = to?.kind === 'desk' ? tabsPending(db.pending, to.id) : []
  const steps = to?.kind === 'desk' ? tabs.reduce<{ at: DeskTab; effects: AppEffect[] }>((t, next) => ({ at: tabName(next), effects: [...t.effects, ...tabbed(t.at, to.id, next)] }), { at: 'screen', effects: [] }) : undefined
  const next: Db = {
    ...db,
    panel: to,
    view,
    ...(steps && { deskTab: steps.at, pending: { ...db.pending, tab: undefined, shown: undefined } }),
  }
  const [state, ...told] = attend(next, { type: 'watch', at: to?.kind === 'desk' ? to.id : undefined })
  return [
    state,
    ...told,
    ...(!stays && from ? [{ type: 'leave', panel: from } as const] : []),
    ...(unfocuses ? [{ type: 'fly-home' } as const] : []),
    ...(to ? [{ type: 'enter', panel: to, from } as const] : []),
    ...(steps?.effects ?? []),
    DRAW,
    ...(to && FOCUS_ON[to.kind] ? [{ type: 'focus', selector: FOCUS_ON[to.kind]! } as const] : []),
  ]
}

/** The panel whose subject the board no longer holds: a desk's worker gone, a shell ended, a floor removed. */
const subjectLeft = (panel: Panel | undefined, board: Board) =>
  (panel?.kind === 'desk' && !findCard(board, panel.id)) ||
  (panel?.kind === 'shell' && !board.shells.some((sh) => sh.id === panel.id)) ||
  ((panel?.kind === 'floor' || panel?.kind === 'archive') && !board.floors.some((f) => f.id === panel.id))

/** What is pending, less what `board` no longer holds: a tab of a worker gone, a showing withdrawn. */
const pendingOn = (pending: Pending, board: Board): Pending => ({
  ...pending,
  tab: pending.tab && findCard(board, pending.tab.id) ? pending.tab : undefined,
  shown: pending.shown && findCard(board, pending.shown.id)?.shown.some((sh) => sh.target === pending.shown!.target) ? pending.shown : undefined,
})

export const appHandlers: Handlers<Db, AppEvent, AppEffect> = {
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
    return [into({ ...db, deskTab: tabName(to) }), ...tabbed(db.deskTab, id, to), DRAW]
  },
  replay: (db, { id, session }) => {
    const replay = session === undefined ? undefined : { id, session }
    if (atDesk(db) !== id) return [into({ ...db, replay }), { type: 'replays' }]
    return [into({ ...db, replay, deskTab: 'screen' }), { type: 'replays' }, { type: 'desk/screen', id }, ...tabbed(db.deskTab, id, { tab: 'screen' }), DRAW]
  },
  pend: (db, { pending }) => [into({ ...db, pending: { ...db.pending, ...pending } })],
  view: (db, { view }) => [into({ ...db, view })],
  'board-applied': (db, { board }) => {
    const next = { ...db, pending: pendingOn(db.pending, board) }
    return subjectLeft(next.panel, board) ? went(next, undefined) : [into(next), DRAW]
  },
  'replay-left': (db) => [into({ ...db, replay: undefined })],
}
