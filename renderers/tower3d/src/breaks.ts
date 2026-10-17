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

/**
 * DEFAULT, to be moved by hand: where workers stand in the game room, in its prefab's frame (its door's middle, +z out
 * through it), two loose rows behind the players facing the cabinets. A `stand_<n>` slot in the room's prefab replaces
 * them all.
 */
const STANDING = [
  { name: 'stand_1', at: [-3.7, 0, -6.2], turn: -90 },
  { name: 'stand_2', at: [-3.7, 0, -4.6], turn: -90 },
  { name: 'stand_3', at: [-3.7, 0, -3.0], turn: -90 },
  { name: 'stand_4', at: [-2.3, 0, -5.4], turn: -90 },
  { name: 'stand_5', at: [-2.3, 0, -3.8], turn: -90 },
  { name: 'stand_6', at: [-2.3, 0, -2.2], turn: -90 },
]

/** The game room's standing places on the level: its prefab's `stand_<n>` slots. */
export function standingIn(room: Room, prefabs: Prefabs): BreakPlace[] {
  const own = series(prefabs[room.prefab].slots, 'stand')
  const inRoom = frame(room.door.x, room.door.z, room.door.turn)
  return (own.length ? own : STANDING).map((s) => ({ name: s.name, ...inRoom(s.at, s.turn), stand: true, play: false }))
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
