import { failureAt, failureOf, heldHandlers, noReads, reading, valueAt, valueOf, loop, type Listener } from '/lib/machine.js'
import type { Board, Card, Floor } from './api.ts'
import { archivedCard, archiveKey, type ArchiveReads, archiveWant } from './cards.ts'
import { readArchive } from './fixtures.ts'
import type { Clock } from './clock.ts'
import type { Port } from './port.ts'
import { historyFrom } from './seating.ts'
import { FILING } from './layout.ts'

/**
 * Every floor's archive as Tower 3D reads it: the cards the board leaves out, held reads read again when the floor's
 * `archiveKey` moves, and grouped into the filing cabinet's drawers by day. The archive panel lists the same read.
 */

const dayOf = (at: number) => new Date(at).setHours(0, 0, 0, 0)

/** Each floor's archive, by floor, as read for a board: what the building's seats and galleries are derived from. */
export type Archived = ReadonlyMap<string, Card[]>

/** A floor's history: every card it has had, the board's and its archive's as `archived` holds it; `undefined` without its archive. */
export function historyOf(f: Floor, archived: Archived): Card[] | undefined {
  const archive = archived.get(f.id)
  return archive && historyFrom(f.cards, archive)
}

/** Starts the archive reads, telling the port as each lands or fails. */
export function startArchive({ port, clock }: { port: Port; clock: Clock }) {
  const { now: wallNow } = clock
  /** The board the reads were last asked against: a fixture board serves its own archive. */
  let readBoard: Board | undefined

  /** An archive read landed or failed, at the wall time a board it settles is planned at. */
  const landed = () => port.dispatch({ type: 'archive/landed', at: wallNow() })

  const archives = loop({
    state: noReads<Card[]>() as ArchiveReads,
    handlers: heldHandlers<Card[]>(),
    execute: {
      read: reading((slot) =>
        readArchive(readBoard!, slot).catch((err: Error) => {
          port.dispatch({ type: 'archive/failed', message: err.message })
          throw err
        }),
      ),
      draw: () => landed(),
      toast: () => landed(),
    },
  })

  /** Calls `listener` with each event the archive reads handle (`Loop.subscribe`). */
  const watchArchives = (listener: Listener<unknown>) => archives.subscribe(listener)

  /** Reads every floor's archive that moved since it was read, or was never read. */
  function readArchives(board: Board) {
    readBoard = board
    for (const f of board.floors) archives.dispatch(archiveWant(board, f))
  }

  /** Reads every floor's archive at `board`'s keys, resolving once each has landed or failed to (`archivesSettled`). */
  async function settledArchives(board: Board) {
    readArchives(board)
    await archives.until(() => archivesSettled(board))
  }

  /** Reads a floor's archive again now, as the archive panel's Read again asks. */
  function rereadArchive(board: Board, project: string) {
    readBoard = board
    archives.dispatch({ ...archiveWant(board, board.floors.find((f) => f.id === project)!), type: 'refresh' })
  }

  /** A floor's archive, once read. */
  const archiveOf = (project: string) => valueOf(archives.state().held[project])

  /** Why a floor's archive can't be read, while none of it is. */
  const archiveFailure = (project: string) => failureOf(archives.state().held[project])

  /** Each floor's archive as read at `board`'s `archiveKey`: a floor whose read hasn't landed, or failed, is left out. */
  const archivedAt = (board: Board): Archived =>
    new Map(board.floors.flatMap((f) => {
      const archive = valueAt(archives.state().held[f.id], archiveKey(board, f))
      return archive ? [[f.id, archive] as const] : []
    }))

  /** Whether every floor's archive is read, or failed to be, at `board`'s `archiveKey`: a floor's history is then as current as `board`. */
  const archivesSettled = (board: Board) =>
    board.floors.every((f) => {
      const held = archives.state().held[f.id]
      const key = archiveKey(board, f)
      return valueAt(held, key) !== undefined || failureAt(held, key) !== undefined
    })

  /** A past worker by id in the archives read. */
  const archivedOf = (id: string) => archivedCard(archives.state(), id)

  const filed = new WeakMap<Card[], Drawer[]>()
  /** A floor's drawers, once its archive is read. */
  function drawersAt(project: string) {
    const cards = archiveOf(project)
    if (!cards) return undefined
    if (!filed.has(cards)) filed.set(cards, drawersOf(cards))
    return filed.get(cards)!
  }

  return { watchArchives, readArchives, settledArchives, rereadArchive, archiveOf, archiveFailure, archivedAt, archivesSettled, archivedOf, drawersAt }
}

export type Archive = ReturnType<typeof startArchive>

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

