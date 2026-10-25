/**
 * What an extension's board trigger is called with (decision `extensions`): two boards, each holding only the floors
 * where its capability is on, with their cards' waits, their offers and what extensions added and asked on them. The
 * system's aggregates stay whole.
 */
import { projectOfKey } from '../shared/subjects.ts'
import type { Board } from './board.ts'

/** The board without the floors `off` names: their cards, their cards' waits, their offers, adds and asks go with them. */
export const boardWithout = (board: Board, off: Set<string>): Board => {
  if (!off.size) return board
  const floors = board.floors.filter((f) => !off.has(f.id))
  const cards = new Set(floors.flatMap((f) => f.cards.map((c) => c.id)))
  const on = (subject: string) => {
    const project = projectOfKey(board, subject)
    return project === undefined || !off.has(project)
  }
  return {
    ...board,
    floors,
    waiting: board.waiting.filter((w) => cards.has(w.id)),
    offers: board.offers.filter((o) => !off.has(o.project)),
    adds: Object.fromEntries(Object.entries(board.adds).filter(([subject]) => on(subject))),
    asks: board.asks.filter((a) => on(a.subject)),
  }
}

/**
 * The boards a trigger compares: `prev`, the `next` it was last called with, and `next` without the floors `off` names.
 * A floor in `next` and not in `prev` (made, or turned on) is a first build for itself: it is taken as already in
 * `prev`, its waits, offers, adds and asks with it, so its subjects are no change.
 */
export const triggerBoards = (prev: Board, next: Board, off: Set<string>): { prev: Board; next: Board } => {
  const now = boardWithout(next, off)
  const had = new Set(prev.floors.map((f) => f.id))
  const appeared = now.floors.filter((f) => !had.has(f.id))
  if (!appeared.length) return { prev, next: now }
  const ids = new Set(appeared.map((f) => f.id))
  const cards = new Set(appeared.flatMap((f) => f.cards.map((c) => c.id)))
  const appearedOn = (subject: string) => {
    const project = projectOfKey(now, subject)
    return project !== undefined && ids.has(project)
  }
  return {
    prev: {
      ...prev,
      floors: [...prev.floors, ...appeared],
      waiting: [...prev.waiting, ...now.waiting.filter((w) => cards.has(w.id))],
      offers: [...prev.offers, ...now.offers.filter((o) => ids.has(o.project))],
      adds: { ...prev.adds, ...Object.fromEntries(Object.entries(now.adds).filter(([subject]) => appearedOn(subject))) },
      asks: [...prev.asks, ...now.asks.filter((a) => appearedOn(a.subject))],
    },
    next: now,
  }
}
