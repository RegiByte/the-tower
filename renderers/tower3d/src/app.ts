/**
 * Tower 3D's app: one machine over what the page has decided (decision `tower3d-system`). Its db holds the panel open
 * beside the world, the view, the desk's tab, where to go once the board shows it, a replay, and attention. Handlers
 * are pure: each returns every effect of a transition at once, the next db first, so no executor dispatches while one
 * runs. The executors live where the DOM and the building are (main.ts).
 *
 * A panel moves by `go`, as the page's views do: the panel open is left, unless the next stays in its room, and the
 * next entered, then drawn. Desks, shells and the big screen share one room; they and a game focus the view. Leaving or
 * entering a kind is an executor's table entry (`LEAVE`, `ENTER`); a kind whose opener and closer still do its DOM
 * themselves has an empty entry. A desk's tabs move the same way inside the desk (`tab`).
 */
import { attendNext, type AttendEvent, type AttendOut, type Attending } from '/lib/attend.js'
import type { Handlers, StateEffect, TimerEffect } from '/lib/machine.js'
import { subjectAt, type Lines } from '/lib/board.js'
import { findCard } from './cards.ts'
import { gameItem } from './games.ts'
import type { Board, Floor } from './api.ts'
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
  /** The view, set by what isn't a panel: the overview, petting. */
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
  | { type: 'toast'; text: string }
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

/** What the handlers read of a board through an extension's client, handed in once: pure reads of the board's data. */
export type AppReads = {
  /** A floor's review threads, by checkout and the key their subject is named by. */
  threadsOf: (f: Floor) => { checkout: string; key: string }[]
  /** Whether a floor keeps drafts: the drafts extension is on there. */
  keepsDrafts: (f: Floor) => boolean
}

/**
 * The panel whose subject the board no longer holds: a desk's worker gone, a shell ended, a floor removed, a shelf
 * entry, a kept item, a game or a review thread gone, a floor no longer keeping drafts.
 */
function subjectLeft(panel: Panel | undefined, board: Board, reads: AppReads) {
  if (!panel) return false
  const floor = (id: string) => board.floors.find((f) => f.id === id)
  switch (panel.kind) {
    case 'desk': return !findCard(board, panel.id)
    case 'shell': return !board.shells.some((sh) => sh.id === panel.id)
    case 'floor': case 'archive': return !floor(panel.id)
    case 'doc': return !floor(panel.project)?.shelf?.[panel.n]
    case 'kept': return !keptItem(board, panel)
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
    if (subjectLeft(next.panel, board, reads)) return [...went(next, undefined), ...leftSaid(next.panel)]
    const kept = keptChanged(next.panel, board)
    return kept ? went(next, kept) : [into(next), DRAW]
  },
  'replay-left': (db) => [into({ ...db, replay: undefined })],
})
