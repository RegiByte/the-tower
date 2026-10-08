import type { Card } from './board.ts'

/** Where a worker sits on its floor: a workstation of its own, numbered from the landing, or beside the author it reviews (the author's card id). */
export type Seat = { n: number } | { beside: string }

/** When a worker left its desk: a stranded one when its conversation was resumed, any other when it stopped. */
function leftAt(c: Card, everyone: Card[]) {
  const resumer = c.stranded ? c.conversations.at(-1)?.resumedBy : undefined
  return resumer ? everyone.find((r) => r.id === resumer.id)!.startedAt : c.enteredAt
}

/** The workstations seats take. */
const stationsTaken = (seated: Map<string, Seat>) => [...seated.values()].flatMap((seat) => ('n' in seat ? [seat.n] : []))

/**
 * Each on-duty worker's seat on its floor: the lowest free workstation when it came on duty, kept until it leaves; a
 * reviewer whose author is seated when it comes sits beside the author instead, while nobody else does, and takes the
 * lowest free workstation if the author leaves first. Replaying the floor's comings and goings gives every board, and
 * every reload, the same seats.
 */
function seats(floor: Card[], everyone: Card[]): Map<string, Seat> {
  const moves = floor
    .flatMap((c) => [{ at: c.startedAt, card: c, comes: true }, ...(c.onDuty ? [] : [{ at: leftAt(c, everyone), card: c, comes: false }])])
    .sort((a, b) => a.at - b.at || Number(a.comes) - Number(b.comes))
  const seated = new Map<string, Seat>()
  const lowestFree = () => {
    const taken = new Set(stationsTaken(seated))
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
    const author = card.reviews ? floor.find((a) => a.callsign === card.reviews && 'n' in (seated.get(a.id) ?? {})) : undefined
    const free = author && ![...seated.values()].some((seat) => 'beside' in seat && seat.beside === author.id)
    seated.set(card.id, free ? { beside: author.id } : lowestFree())
  }
  return seated
}

/** Every card with the seat its floor's replay leaves it in: every on-duty card has one. */
export const withSeats = (cards: Card[]): Card[] => {
  const seated = new Map([...new Set(cards.map((c) => c.project))].flatMap((project) => [...seats(cards.filter((c) => c.project === project), cards)]))
  return cards.map((c) => (seated.has(c.id) ? { ...c, seat: seated.get(c.id) } : c))
}
