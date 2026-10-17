import type { Card } from './api.ts'
import type { Room } from './floorplan.ts'
import { rendezvous } from './hashed.ts'
import { frame, series, type Place } from './meetings.ts'
import type { Prefabs } from './zones.ts'

/**
 * The break room (decision `break-room`): a pure function of one board and the wall clock. A worker the board says
 * waits on its hirer (`card.waitsOn`: done, nobody has typed to it since, its latest prompt its hirer's, the hirer
 * running) leaves its desk for its floor's game room once it has waited `GRACE`, and stays until someone prompts it or
 * it goes home. A reviewer beside its author stays there: its verdict is delivered, and it says the work is under
 * review. A crew member steps out of its meeting for it, its place there kept (src/meetings.ts). Inside, it plays at a
 * free cabinet, else stands at a free place, else stays where it was. Workers take places in the order they left;
 * which free one each takes is hashed from its id, so a worker going back can move a few later ones, each to a place
 * it scores higher.
 */

/** How long an answer waits on its hirer before its worker leaves its desk: a quick reply keeps it there. */
export const GRACE = 2 * 60_000

/** When a worker waiting on its hirer leaves for the break room (epoch ms): never for a reviewer beside its author. */
const leavesAt = (c: Card) => (c.waitsOn && !('beside' in c.seat!) ? c.enteredAt + GRACE : Infinity)

/** A place in the game room: before a cabinet, playing it, or standing about. */
export type BreakPlace = Place & { play: boolean }

/** The game room's standing places on the level: its prefab's `stand_<n>` slots. */
export function standingIn(room: Room, prefabs: Prefabs): BreakPlace[] {
  const own = series(prefabs[room.prefab].slots, 'stand')
  const inRoom = frame(room.door.x, room.door.z, room.door.turn)
  return own.map((s) => ({ name: s.name, ...inRoom(s.at, s.turn), stand: true, play: false }))
}

/** The workers on `cards` in the break room at `now`, each at the place it took among `places`. */
export function breaksOf(cards: Card[], places: BreakPlace[], now: number): { card: Card; place: BreakPlace }[] {
  const due = cards.filter((c) => leavesAt(c) <= now).sort((a, b) => leavesAt(a) - leavesAt(b) || a.id.localeCompare(b.id))
  const taken = new Set<string>()
  return due.flatMap((card) => {
    const free = (play: boolean) => places.filter((p) => p.play === play && !taken.has(p.name)).map((p) => p.name)
    const pool = [free(true), free(false)].find((names) => names.length)
    if (!pool) return []
    const name = rendezvous(card.id, 'break', pool)
    taken.add(name)
    return [{ card, place: places.find((p) => p.name === name)! }]
  })
}

/** The next moment after `now` one of `cards` leaves for the break room: what the break room draws holds until then. */
export const nextBreak = (cards: Card[], now: number) => Math.min(...cards.map(leavesAt).filter((t) => t > now))
