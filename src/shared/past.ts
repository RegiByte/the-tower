import type { Board, Card, Floor } from '../bridge/board.ts'
import { type ReadEvent, type Reads, valueOf } from './reads.ts'

/** A floor's past workers: the archive by crew, and the filter over it. */

/** A floor's past workers, the newest first: those the board carries, and its archive as read (`tower.archive`). */
export const pastOf = (f: Floor, archive: Card[]) => [...f.cards.filter((c) => !c.onDuty), ...archive].sort((a, b) => b.startedAt - a.startedAt)

/** A past worker and its crew, the workers under it, drawn after it and each the same way (`pastCrews`). */
export type PastCrew = { card: Card; crew: PastCrew[] }

/**
 * A floor's past workers (`pastOf`) by crew: each worker that reports to none of them heads one, its hires under it and
 * their hires under them, in the order they were hired, as a crew on duty reads. A worker's earlier lives, the sessions
 * a resume carried on, follow its latest one and its crew, the newest first. Crews go by the latest start among them,
 * the newest first.
 */
export const pastCrews = (f: Floor, archive: Card[]): PastCrew[] => {
  const past = pastOf(f, archive)
  const byId = new Map(past.map((c) => [c.id, c]))
  const latest = (c: Card): Card => (c.continuedBy && byId.has(c.continuedBy.id) ? latest(byId.get(c.continuedBy.id)!) : c)
  const heads = past.filter((c) => latest(c) === c)
  const lives = (c: Card) => past.filter((l) => l !== c && latest(l) === c).map((card) => ({ card, crew: [] }))
  const hired = (c: Card) => Math.min(c.startedAt, ...lives(c).map((l) => l.card.startedAt))
  const withLives = (c: Card): PastCrew[] => [{ card: c, crew: crewUnder(c) }, ...lives(c)]
  const crewUnder = (c: Card): PastCrew[] =>
    heads
      .filter((h) => h.reportsTo === c.id)
      .sort((a, b) => hired(a) - hired(b))
      .flatMap(withLives)
  const newest = ({ card, crew }: PastCrew): number => Math.max(card.startedAt, ...crew.map(newest))
  return heads
    .filter((c) => c.reportsTo === undefined || !byId.has(c.reportsTo))
    .map(withLives)
    .sort((a, b) => newest(b[0]) - newest(a[0]))
    .flat()
}

/**
 * The past workers that match `words`, in their crews' order: a worker that doesn't match leaves its place to its crew,
 * so a matching hire is drawn under the nearest worker it reports to, at any depth, that matches too.
 */
export const pastMatching = (crews: PastCrew[], words: string[]): PastCrew[] =>
  crews.flatMap(({ card, crew }) => {
    const shown = pastMatching(crew, words)
    return matchesWords(card, words) ? [{ card, crew: shown }] : shown
  })

/** How many workers crews hold, every depth counted. */
export const pastSize = (crews: PastCrew[]): number => crews.reduce((n, { crew }) => n + 1 + pastSize(crew), 0)

/** How many past workers a floor has, its archive's among them, before the archive is read. */
export const pastCount = (f: Floor) => f.cards.filter((c) => !c.onDuty).length + f.archived

/** What a renderer holding a floor's archive watches: the archive moved when this did. */
export const archiveKey = (board: Board, f: Floor) => `${board.archiveAt}/${f.archived}`

/**
 * The floors' archives a viewer reads, as held reads (`/reads.js`): a slot per floor, named by its project, read at the
 * floor's `archiveKey`. A renderer runs them on a loop of its own with `heldHandlers`, reading each with
 * `tower.archive`.
 */
export type ArchiveReads = Reads<Card[]>

/** The read of a floor's archive as `board` stands. @since 1.162 */
export const archiveWant = (board: Board, f: Floor): Extract<ReadEvent<Card[]>, { type: 'want' }> => ({ type: 'want', slot: f.id, key: archiveKey(board, f) })

/** The archives held whose floor's archive moved since they were read, wanted again as `board` stands. @since 1.162 */
export const archivesMoved = (reads: ArchiveReads, board: Board) =>
  board.floors.filter((f) => reads.held[f.id] && reads.held[f.id].key !== archiveKey(board, f)).map((f) => archiveWant(board, f))

/** A worker by id in the archives held, those being read again among them. @since 1.162 */
export const archivedCard = (reads: ArchiveReads, id: string) =>
  Object.values(reads.held)
    .flatMap((h) => valueOf(h) ?? [])
    .find((c) => c.id === id)

/** A filter's words, lower-cased. */
export const wordsOf = (query: string) => query.toLowerCase().split(/\s+/).filter(Boolean)

/** Whether every word is in a worker's callsign or in one of its conversations' prompt and answer. */
export const matchesWords = (c: Card, words: string[]) => {
  const text = [c.callsign, ...c.conversations.flatMap((conv) => [conv.prompt, conv.answer])].filter(Boolean).join('\n').toLowerCase()
  return words.every((w) => text.includes(w))
}
