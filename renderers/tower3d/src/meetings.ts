import { turnXZ, type Vec3 } from '../../kaykit/src/catalog.ts'
import type { FlatSlot } from '../../kaykit/src/scene.ts'
import type { Card } from './api.ts'
import { crewsOf } from './cards.ts'
import type { Room } from './floorplan.ts'
import type { Box } from './layout.ts'
import { stateKey, turnBox, type Prefabs } from './zones.ts'

/**
 * Where a crew meets (decision `whereabouts`): a pure function of one board. A crew is a lead, a worker reporting to
 * no one on its floor, and everyone under it. It gathers in a meeting room once three of it, its lead among them, are
 * on duty at once, and disperses only when its lead goes home; in the room sit only its members on duty. The first crew
 * to gather takes Meeting · 8, the next Meeting · 4, a crew finding both taken stays at its desks until one frees.
 * Inside, the lead takes the table's head and the members the seats in the order they came, a reviewer a free seat
 * next to its author's or, with none free, stands behind its author's chair; past the table's seats they sit at the
 * counter's laptops, then stand at the table's foot. A worker resumed comes back as a new arrival. Who holds which room
 * and seat is replayed from the crews' comings and goings, so nobody moves when someone else does, and every reload
 * draws the same room.
 */

/** A crew gathers once this many of it, its lead among them, are on duty at once. */
const GATHER = 3

/** The long table each meeting room places at its `table` slot, in a state of its `seats` group. */
export const TABLE = 'prefabs/meeting_long.json'

/** A place a member takes in a meeting room, on the level: its chair, or where it stands, and the way it faces (degrees about +y, 0 facing +z). */
export type Place = { name: string; x: number; z: number; turn: number; stand: boolean }

/** A state of the long table, and how many it seats, its head included. */
export type TableState = { name: string; seats: number }

/** The meeting rooms' furniture as placed by hand: the long table's states, where it stands in each room, and every place in a room with the table in a state. */
export type MeetingKit = {
  states: TableState[]
  table: (room: Room) => { x: number; z: number; turn: number }
  places: (room: Room, state: string) => Place[]
  footprint: (room: Room, state: string) => Box[]
}

/** A crew gathered in a meeting room: its lead, the table's state, and where each of its members on duty sits or stands. */
export type Meeting = { room: Room; lead: Card; state: string; seats: { card: Card; place: Place }[] }

export const series = (slots: FlatSlot[], base: string) => {
  const n = new RegExp(`^${base}_(\\d+)$`)
  return slots.filter((s) => n.test(s.name)).sort((a, b) => Number(n.exec(a.name)![1]) - Number(n.exec(b.name)![1]))
}

function named(slots: FlatSlot[], name: string, prefab: string) {
  const slot = slots.find((s) => s.name === name)
  if (!slot) throw new Error(`${prefab} has no slot ${name}: add it in the prefab editor`)
  return slot
}

/** A prefab's frame on the level: its origin at (x, z), turned `turn`. */
export const frame = (x: number, z: number, turn: number) => (at: Vec3 | readonly number[], t: number) => {
  const [dx, dz] = turnXZ(at[0], at[2], turn)
  return { x: x + dx, z: z + dz, turn: turn + t }
}

export function meetingKit(prefabs: Prefabs): MeetingKit {
  const table = prefabs[TABLE]
  const stateOf = (name: string) => table.states[stateKey([name])]
  const states = table.groups.seats.map((name) => ({ name, seats: stateOf(name).slots.filter((s) => s.pose === 'sit').length })).sort((a, b) => a.seats - b.seats)
  const inRoom = (room: Room) => frame(room.door.x, room.door.z, room.door.turn)
  const tableAt = (room: Room) => {
    const slot = named(prefabs[room.prefab].slots, 'table', room.prefab)
    return inRoom(room)(slot.at, slot.turn)
  }
  return {
    states,
    table: tableAt,
    places(room, state) {
      const t = tableAt(room)
      const inTable = frame(t.x, t.z, t.turn)
      const own = prefabs[room.prefab].slots
      const seats = stateOf(state).slots
      return [
        ...[named(seats, 'head', TABLE), ...series(seats, 'seat')].map((s) => ({ name: s.name, ...inTable(s.at, s.turn), stand: false })),
        ...series(own, 'counter').map((s) => ({ name: s.name, ...inRoom(room)(s.at, s.turn), stand: false })),
        ...series(own, 'stand').map((s) => ({ name: s.name, ...inRoom(room)(s.at, s.turn), stand: true })),
      ]
    },
    footprint(room, state) {
      const t = tableAt(room)
      return stateOf(state).footprint.map((b) => turnBox(b, t.x, t.z, t.turn))
    },
  }
}

/** The table's state for a crew `n` strong at most: the fewest seats that hold it, in the room's largest at most. */
export function stateFor(room: Room, n: number, states: TableState[]) {
  const fits = states.filter((s) => s.seats <= room.seats!)
  return (fits.find((s) => s.seats >= n) ?? fits.at(-1)!).name
}

/**
 * A worker's time on duty (epoch ms): from its latest session's start to when it stopped, if it has. A resume comes on
 * duty anew: the board says when each session started, not when the one before it stopped.
 */
type Life = { card: Card; from: number; to: number }
const lifeOf = (c: Card): Life => ({ card: c, from: c.lineage.at(-1)!.startedAt, to: c.onDuty ? Infinity : (c.letGoAt ?? c.enteredAt) })
const onAt = (l: Life, t: number) => l.from <= t && t < l.to

/** A crew whose lead had `GATHER` on duty at once: its lives, the lead's first, when it gathered and when its lead left. */
type Crew = { lives: Life[]; at: number; to: number }

function gathered(lives: Life[]): Crew | undefined {
  const [lead] = lives
  const at = lives.map((l) => l.from).filter((t) => onAt(lead, t)).sort((a, b) => a - b).find((t) => lives.filter((l) => onAt(l, t)).length >= GATHER)
  return at === undefined ? undefined : { lives, at, to: lead.to }
}

/** Which crew holds each room now, and since when: each gathering crew takes the first free room in `rooms`' order, or waits for one to free. */
function roomsHeld(crews: Crew[], rooms: Room[]) {
  const events = [...crews.map((crew) => ({ t: crew.at, crew, gathers: true })), ...crews.filter((c) => c.to < Infinity).map((crew) => ({ t: crew.to, crew, gathers: false }))]
    .sort((a, b) => a.t - b.t || Number(a.gathers) - Number(b.gathers) || a.crew.lives[0].card.id.localeCompare(b.crew.lives[0].card.id))
  const held = new Map<Room, { crew: Crew; since: number }>()
  const waiting: Crew[] = []
  for (const { t, crew, gathers } of events) {
    if (gathers) {
      const free = rooms.find((r) => !held.has(r))
      if (free) held.set(free, { crew, since: t })
      else waiting.push(crew)
      continue
    }
    if (waiting.includes(crew)) {
      waiting.splice(waiting.indexOf(crew), 1)
      continue
    }
    const [room] = [...held].find(([, h]) => h.crew === crew)!
    held.delete(room)
    const next = waiting.shift()
    if (next) held.set(room, { crew: next, since: t })
  }
  return held
}

const apart = (a: Place, b: Place) => Math.hypot(a.x - b.x, a.z - b.z)

/** How far apart two seats can be and still be next to each other: a table's pitch, with room to spare. */
const NEXT_TO = 0.9
/** Where a reviewer stands behind its author's chair, looking over its shoulder. */
const OVER_SHOULDER = 0.75
const BEHIND = 'behind_'

/** A place by name among `places`: a reviewer's `behind_<place>` is behind that place's chair, facing the same way. */
function placeNamed(places: Place[], name: string): Place {
  if (!name.startsWith(BEHIND)) return places.find((p) => p.name === name)!
  const seat = placeNamed(places, name.slice(BEHIND.length))
  const [dx, dz] = turnXZ(0, -OVER_SHOULDER, seat.turn)
  return { name, x: seat.x + dx, z: seat.z + dz, turn: seat.turn, stand: true }
}

/**
 * A crew in `room` since `since`: who takes which place, replayed from its members' comings and goings there. The table
 * grows (its state) with the most it has held at once and never shrinks while the crew stays; a member finding no place
 * left stays at its desk.
 */
function meetingIn(room: Room, { crew, since }: { crew: Crew; since: number }, kit: MeetingKit): Meeting {
  const [lead] = crew.lives
  const moves = crew.lives
    .filter((l) => l.to > since)
    .flatMap((life) => [{ t: Math.max(life.from, since), life, comes: true }, ...(life.to < Infinity ? [{ t: life.to, life, comes: false }] : [])])
    .sort((a, b) => a.t - b.t || Number(a.comes) - Number(b.comes) || Number(b.life === lead) - Number(a.life === lead) || a.life.from - b.life.from)
  const at = new Map<string, string>()
  let present = 0
  let most = 0
  for (const { life, comes } of moves) {
    if (!comes) {
      present -= 1
      at.delete(life.card.id)
      continue
    }
    present += 1
    most = Math.max(most, present)
    if (life === lead) {
      at.set(life.card.id, 'head')
      continue
    }
    const places = kit.places(room, stateFor(room, most, kit.states))
    const taken = new Set(at.values())
    const free = places.filter((p) => p.name !== 'head' && !taken.has(p.name))
    const author = crew.lives.find((l) => l.card.callsign === life.card.crew?.callsign && at.has(l.card.id))
    const theirs = author && placeNamed(places, at.get(author.card.id)!)
    const next = theirs && free.filter((p) => !p.stand && apart(p, theirs) <= NEXT_TO).toSorted((a, b) => apart(a, theirs) - apart(b, theirs))[0]
    const behind = theirs && `${BEHIND}${theirs.name}`
    const place = theirs ? (next?.name ?? (taken.has(behind!) ? free[0]?.name : behind)) : free[0]?.name
    if (place) at.set(life.card.id, place)
  }
  const state = stateFor(room, most, kit.states)
  const places = kit.places(room, state)
  const seats = crew.lives.filter((l) => l.to === Infinity && at.has(l.card.id)).map((l) => ({ card: l.card, place: placeNamed(places, at.get(l.card.id)!) }))
  return { room, lead: lead.card, state, seats }
}

/** The crews of a floor's cards gathered in its meeting `rooms` (the largest first) now. */
export function meetingsOf(cards: Card[], rooms: Room[], kit: MeetingKit): Meeting[] {
  const current = cards.filter((c) => !c.continuedBy)
  const ids = new Set(current.map((c) => c.id))
  const crewOf = crewsOf(current)
  const crews = current
    .filter((c) => !(c.reportsTo && ids.has(c.reportsTo)))
    .map((lead) => [lead, ...crewOf(lead)].map(lifeOf))
    .filter((lives) => lives.length >= GATHER)
    .flatMap((lives) => gathered(lives) ?? [])
  return [...roomsHeld(crews, rooms)].map(([room, held]) => meetingIn(room, held, kit))
}
