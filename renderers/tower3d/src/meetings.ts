import { turnXZ, type Vec3 } from '../../kaykit/src/catalog.ts'
import type { FlatSlot } from '../../kaykit/src/scene.ts'
import type { Room } from './floorplan.ts'
import type { Box } from './layout.ts'
import { stateKey, turnBox, type Prefabs } from './zones.ts'

/** The meeting rooms' furniture, placed by hand: where a crew will sit (decision `floor-plan`). */

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

const series = (slots: FlatSlot[], base: string) => {
  const n = new RegExp(`^${base}_(\\d+)$`)
  return slots.filter((s) => n.test(s.name)).sort((a, b) => Number(n.exec(a.name)![1]) - Number(n.exec(b.name)![1]))
}

function named(slots: FlatSlot[], name: string, prefab: string) {
  const slot = slots.find((s) => s.name === name)
  if (!slot) throw new Error(`${prefab} has no slot ${name}: add it in the prefab editor`)
  return slot
}

/** A prefab's frame on the level: its origin at (x, z), turned `turn`. */
const frame = (x: number, z: number, turn: number) => (at: Vec3 | readonly number[], t: number) => {
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
