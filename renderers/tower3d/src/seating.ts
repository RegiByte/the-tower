import type { Card } from './api.ts'

/**
 * Where each worker sits on its floor, derived from the floor's history: every card it has had, the board's and its
 * archive's (`historyOf`). Replaying the whole history, not only the board's present, is what keeps a long-running
 * worker at its desk once the workers who arrived before it leave the board at the day's end.
 */

/** A workstation of its own, numbered from the landing, or beside the worker it reports to by its crew edge (that worker's card id). */
export type Seat = { n: number } | { beside: string }

/** Each seated worker's seat, by card id. */
export type Seats = Map<string, Seat>

/** When a worker left its desk: a stranded one when it was let go or its conversation resumed, any other when it stopped. */
function leftAt(c: Card, everyone: Card[]) {
  if (c.letGoAt !== undefined) return c.letGoAt
  const resumer = c.stranded ? c.conversations.at(-1)?.resumedBy : undefined
  return resumer ? everyone.find((r) => r.id === resumer.id)!.startedAt : c.enteredAt
}

/**
 * A floor's history from its board's cards and its archive's: every card once, the board's where both hold it. The
 * archive is read at the time it is served, not the board's, so one served just past midnight holds the day's off-duty
 * cards the board before it still carries; a card replayed twice would arrive twice and move a desk.
 */
export const historyFrom = (cards: Card[], archive: Card[]): Card[] => {
  const onBoard = new Set(cards.map((c) => c.id))
  return [...cards, ...archive.filter((c) => !onBoard.has(c.id))]
}

/** The workstations seats take. */
export const stationsTaken = (seats: Iterable<Seat>) => [...seats].flatMap((seat) => ('n' in seat ? [seat.n] : []))

/**
 * Each on-duty worker's seat on a floor, from `history`, every card the floor has had: the lowest free workstation when
 * it came on duty, kept until it leaves; a worker with a crew edge (a reviewer, its author) whose lead is seated when it
 * comes sits beside the lead instead, while nobody else does, and takes the lowest free workstation if the lead leaves
 * first. `everyone`: every floor's history, where a stranded worker's resumer is found.
 */
export function seatsOf(history: Card[], everyone: Card[]): Seats {
  const moves = history
    .flatMap((c) => [{ at: c.startedAt, card: c, comes: true }, ...(c.onDuty ? [] : [{ at: leftAt(c, everyone), card: c, comes: false }])])
    .sort((a, b) => a.at - b.at || Number(a.comes) - Number(b.comes))
  const seated: Seats = new Map()
  const lowestFree = () => {
    const taken = new Set(stationsTaken(seated.values()))
    let n = 0
    while (taken.has(n)) n++
    return { n }
  }
  for (const { card, comes } of moves) {
    if (!comes) {
      seated.delete(card.id)
      for (const [id, seat] of seated) if ('beside' in seat && seat.beside === card.id) seated.set(id, lowestFree())
      continue
    }
    const beside = card.crew && history.find((a) => a.callsign === card.crew!.callsign && 'n' in (seated.get(a.id) ?? {}))
    const free = beside && ![...seated.values()].some((seat) => 'beside' in seat && seat.beside === beside.id)
    seated.set(card.id, free ? { beside: beside.id } : lowestFree())
  }
  return seated
}

/** Every floor's seats, from each floor's history by project: a floor missing from `histories` seats nobody. */
export function buildingSeats(histories: Map<string, Card[]>): Seats {
  const everyone = [...histories.values()].flat()
  return new Map([...histories.values()].flatMap((history) => [...seatsOf(history, everyone)]))
}
