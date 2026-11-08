import { failureAt, failureOf, heldHandlers, noReads, reading, valueAt, valueOf, loop } from '/lib/machine.js'
import type { Board, Card, Floor } from './api.ts'
import { archivedCard, archiveKey, type ArchiveReads, archiveWant } from './cards.ts'
import { readArchive } from './fixtures.ts'
import { historyFrom } from './seating.ts'
import { FILING } from './layout.ts'

/**
 * Every floor's archive as Tower 3D reads it: the cards the board leaves out, held reads read again when the floor's
 * `archiveKey` moves, and grouped into the filing cabinet's drawers by day. The archive panel lists the same read.
 */

const dayOf = (at: number) => new Date(at).setHours(0, 0, 0, 0)

let arrived = () => {}
let failed = (_: string) => {}
/** Runs `then` whenever an archive read lands or fails, and `fail` with why whenever one fails, whether or not cards were read before. */
export const onArchives = (then: () => void, fail: (message: string) => void) => ((arrived = then), (failed = fail))

/** The board the reads were last asked against: a fixture board serves its own archive. */
let readBoard: Board | undefined

const archives = loop({
  state: noReads<Card[]>() as ArchiveReads,
  handlers: heldHandlers<Card[]>(),
  execute: {
    read: reading((slot) =>
      readArchive(readBoard!, slot).catch((err: Error) => {
        failed(err.message)
        throw err
      }),
    ),
    draw: () => arrived(),
    toast: () => arrived(),
  },
})

/** Reads every floor's archive that moved since it was read, or was never read. */
export function readArchives(board: Board) {
  readBoard = board
  for (const f of board.floors) archives.dispatch(archiveWant(board, f))
}

/** Reads a floor's archive again now, as the archive panel's Read again asks. */
export function rereadArchive(board: Board, project: string) {
  readBoard = board
  archives.dispatch({ ...archiveWant(board, board.floors.find((f) => f.id === project)!), type: 'refresh' })
}

/** A floor's archive, once read. */
export const archiveOf = (project: string) => valueOf(archives.state().held[project])

/** Why a floor's archive can't be read, while none of it is. */
export const archiveFailure = (project: string) => failureOf(archives.state().held[project])

/**
 * A floor's history as `board` stands: every card it has had, the board's and its archive's as read at the board's
 * `archiveKey`. `undefined` until that read lands, and while it failed.
 */
export function historyOf(board: Board, f: Floor): Card[] | undefined {
  const archive = valueAt(archives.state().held[f.id], archiveKey(board, f))
  return archive && historyFrom(f.cards, archive)
}

/** Whether every floor's archive is read, or failed to be, at `board`'s `archiveKey`: a floor's history is then as current as `board`. */
export const archivesSettled = (board: Board) =>
  board.floors.every((f) => {
    const held = archives.state().held[f.id]
    const key = archiveKey(board, f)
    return valueAt(held, key) !== undefined || failureAt(held, key) !== undefined
  })

/** A past worker by id in the archives read. */
export const archivedOf = (id: string) => archivedCard(archives.state(), id)

const filed = new WeakMap<Card[], Drawer[]>()
/** A floor's drawers, once its archive is read. */
export function drawersAt(project: string) {
  const cards = archiveOf(project)
  if (!cards) return undefined
  if (!filed.has(cards)) filed.set(cards, drawersOf(cards))
  return filed.get(cards)!
}

/** A drawer's day and its folders, the latest worker first; the last drawer holds every older day too (`before`). */
export type Drawer = { day: number; before: boolean; folders: Card[] }

/** A floor's archive as drawers: a worker is its latest session, one nobody continued; by the day it started, the latest day first. */
export function drawersOf(archive: Card[]): Drawer[] {
  const folders = archive.filter((c) => !c.continuedBy).toSorted((a, b) => b.startedAt - a.startedAt)
  const days = [...new Set(folders.map((c) => dayOf(c.startedAt)))]
  const kept = days.slice(0, FILING.drawers)
  return kept.map((day, i) => {
    const before = i === FILING.drawers - 1 && days.length > FILING.drawers
    return { day, before, folders: folders.filter((c) => (before ? dayOf(c.startedAt) <= day : dayOf(c.startedAt) === day)) }
  })
}

/** A day as "Oct 3". */
export const dayName = (day: number) => new Date(day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

/** "Oct 3", or "Oct 3 and before" for the last drawer holding older days too. */
export const drawerLabel = (d: Drawer) => `${dayName(d.day)}${d.before ? ' and before' : ''}`

