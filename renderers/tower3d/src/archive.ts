import type { Board, Card } from './api.ts'
import { archiveKey } from './cards.ts'
import { readArchive } from './fixtures.ts'
import { FILING } from './layout.ts'

/**
 * Every floor's archive as Tower 3D reads it: the cards the board leaves out, read again when the floor's `archiveKey`
 * moves, and grouped into the filing cabinet's drawers by day. The archive panel lists the same read.
 */

const dayOf = (at: number) => new Date(at).setHours(0, 0, 0, 0)

/** Each floor's archive (`GET /archive/<project>`): the `archiveKey` it was read at, and its cards once read. */
const archives = new Map<string, { key: string; cards?: Card[] }>()

/**
 * Reads again every floor's archive that moved since it was read, keeping the cards read before until the new ones
 * land; a read a later one overtook is dropped. `arrived` runs as each lands.
 */
export function readArchives(board: Board, arrived: () => void, failed: (err: Error) => void) {
  for (const f of board.floors) {
    const key = archiveKey(board, f)
    const known = archives.get(f.id)
    if (known?.key === key) continue
    const reading = { key, cards: known?.cards }
    archives.set(f.id, reading)
    readArchive(board, f.id).then((cards) => archives.get(f.id) === reading && ((reading.cards = cards), arrived()), failed)
  }
}

/** A floor's archive, once read. */
export const archiveOf = (project: string) => archives.get(project)?.cards

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

