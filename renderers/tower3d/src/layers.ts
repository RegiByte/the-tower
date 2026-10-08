import * as THREE from 'three'
import { act } from './acts.ts'
import { gameTitle, makeCabinet, type Cabinet } from './arcade.ts'
import { can } from './cards.ts'
import { makeNote, type Note } from './cork.ts'
import { heldUpAt, makeDesk, makeStation, makeVisitor, syncDesk, syncStation, type Desk, type Station } from './desk.ts'
import { dressPicture, hang, makePicture, type Picture } from './gallery.ts'
import { openStation, type DanceFloor, type DeskSlot, type GuestSlot, type Level, type PictureSlot, type Plan, type StationSlot } from './layout.ts'
import { arrival, leaver } from './life.ts'
import { noteTitle } from './notes.ts'
import { tintOf } from './palette.ts'
import { buildDanceFloors, makeGuest, type DanceFloors, type Guest } from './party.ts'
import { buildVideoWall, videoWallKey } from './room.ts'
import { buildRunning, runningKey, type Running } from './running.ts'
import { buildPigeonhole, pigeonholeKey, type Pigeonhole } from './pigeonhole.ts'
import { drawersAt } from './archive.ts'
import { buildFiling, filingKey, type Filing } from './filing.ts'
import { shownKey } from './showing.ts'
import { hangOn } from './levels.ts'
import { s, type WallItem } from './state.ts'

/**
 * Scene objects kept in step with the plan, one per slot it wants, by key, each hung on the level its slot stands on.
 * `keep` brings a kept item up to its slot, or answers false when the item must be made anew; `leave` runs as an item
 * goes, before it is discarded.
 */
export type Layer<S, T> = {
  slots: (p: Plan) => [key: string, slot: S][]
  level: (slot: S, p: Plan) => number
  make: (slot: S, key: string) => T
  keep: (item: T, slot: S) => boolean
  root: (item: T) => THREE.Object3D
  leave?: (item: T, key: string) => void
}

export function reconcile<S, T>(layer: Layer<S, T>, items: Map<string, T>, p: Plan, discard: (o: THREE.Object3D) => void) {
  const wanted = layer.slots(p)
  for (const [key, slot] of wanted) {
    const old = items.get(key)
    if (old && layer.keep(old, slot)) {
      hangOn(layer.level(slot, p), layer.root(old))
      continue
    }
    if (old) discard(layer.root(old))
    const item = layer.make(slot, key)
    hangOn(layer.level(slot, p), layer.root(item))
    items.set(key, item)
  }
  const keys = new Set(wanted.map(([key]) => key))
  for (const [key, item] of items) {
    if (keys.has(key)) continue
    layer.leave?.(item, key)
    discard(layer.root(item))
    items.delete(key)
  }
}

type FloorLevel = Extract<Level, { kind: 'floor' }>
const floors = (p: Plan) => p.levels.filter((l): l is FloorLevel => l.kind === 'floor')

/**
 * A desk per worker on duty, a reviewer's beside its author's. One that appears after the first board walks in from
 * the elevator; one that goes walks out. A reviewer whose author leaves first takes a desk of its own, walking in anew.
 */
type DeskAt = { slot: DeskSlot; level: number; y: number }

export const DESKS: Layer<DeskAt, Desk> = {
  slots: (p) => floors(p).flatMap((level) => level.desks.map((slot) => [slot.card.id, { slot, level: level.index, y: level.y }] as [string, DeskAt])),
  level: (at) => at.level,
  make({ slot, y }) {
    const desk = slot.beside ? makeVisitor(slot.card, s.models!) : makeDesk(slot.card, s.models!)
    act(desk.group, { kind: 'desk', id: slot.card.id }, [])
    if (desk.side) act(desk.side.group, { kind: 'shown', id: slot.card.id }, [])
    desk.group.position.set(slot.x, y, slot.z)
    if (!s.first) s.arrivals.set(slot.card.id, arrival(s.plan, desk))
    return desk
  },
  keep(desk, { slot, y }) {
    const visiting = desk.side === undefined
    if (visiting !== Boolean(slot.beside)) return false
    syncDesk(desk, slot.card)
    desk.group.position.set(slot.x, y, slot.z)
    return true
  },
  root: (desk) => desk.group,
  leave(desk, id) {
    if (desk.worker.visible) {
      const level = s.plan.levels.find((l) => l.y === desk.group.position.y)!.index
      const l = leaver(s.plan, id, level, desk.group.position, desk.group.localToWorld(desk.worker.position.clone()), s.models!)
      s.leavers.add(l)
      hangOn(level, l.group)
    }
    s.arrivals.delete(id)
  },
}

type StationAt = { slot: StationSlot; level: number; y: number; project: string; open: boolean }

/** Every free workstation, by floor and number. The open one is lit while its floor can spawn. */
export const STATIONS: Layer<StationAt, Station> = {
  slots: (p) => floors(p).flatMap((level) => level.free.map((slot) => {
    const open = slot === openStation(level) && can(level.floor, 'spawn')
    return [`${level.floor.id}/${slot.n}`, { slot, level: level.index, y: level.y, project: level.floor.id, open }] as [string, StationAt]
  })),
  level: (at) => at.level,
  make(at) {
    const station = makeStation(s.models!)
    STATIONS.keep(station, at)
    return station
  },
  keep(station, { slot, y, project, open }) {
    syncStation(station, open)
    act(station.group, { kind: 'station', project, n: slot.n, open }, [])
    station.group.position.set(slot.x, y, slot.z)
    return true
  },
  root: (station) => station.group,
}

type NoteAt = { project: string; id: string; tag: string; modifiedAt: number; level: number; x: number; y: number; z: number; tint: string }
const carried = (at: NoteAt) => s.carrying?.project === at.project && s.carrying.id === at.id

/** Every draft pinned on its floor's corkboard, drawn again when its title or tint changes; the one you carry is not there. */
export const NOTES: Layer<NoteAt, Note> = {
  slots: (p) => floors(p).flatMap((level) => (level.cork?.notes ?? []).map((n) => {
    const at = { project: level.floor.id, id: n.id, tag: n.tag, modifiedAt: n.modifiedAt, level: level.index, x: n.x, y: level.y + n.y, z: level.cork!.z + 0.06, tint: tintOf(level.floor) }
    return [`${at.project}/${at.id}`, at] as [string, NoteAt]
  })),
  level: (at) => at.level,
  make(at) {
    const note = makeNote(at.project, at.id, noteTitle(at.project, at), at.tag, at.tint)
    note.group.position.set(at.x, at.y, at.z)
    note.group.visible = !carried(at)
    return note
  },
  keep(note, at) {
    if (note.title !== noteTitle(at.project, at) || note.tint !== at.tint) return false
    note.group.position.set(at.x, at.y, at.z)
    note.group.visible = !carried(at)
    return true
  },
  root: (note) => note.group,
}

type CabinetAt = { project: string; id: string; tag: string; modifiedAt: number; keptBy: string | undefined; level: number; x: number; y: number; z: number; tint: string }

/** Every game's cabinet in its floor's arcade, facing into the room, drawn again when its title, keeper or tint changes. */
export const CABINETS: Layer<CabinetAt, Cabinet> = {
  slots: (p) => floors(p).flatMap((level) => (level.arcade?.cabinets ?? []).map((c) => {
    const at = { project: level.floor.id, id: c.id, tag: c.tag, modifiedAt: c.modifiedAt, keptBy: c.keptBy, level: level.index, x: c.x, y: level.y, z: c.z, tint: tintOf(level.floor) }
    return [`${at.project}/${at.id}`, at] as [string, CabinetAt]
  })),
  level: (at) => at.level,
  make(at) {
    const cabinet = makeCabinet(at.project, at.id, gameTitle(at.project, at), at.tag, at.keptBy, at.tint)
    cabinet.group.rotation.y = Math.PI
    cabinet.group.position.set(at.x, at.y, at.z)
    return cabinet
  },
  keep(cabinet, at) {
    if (cabinet.title !== gameTitle(at.project, at) || cabinet.keptBy !== at.keptBy || cabinet.tint !== at.tint) return false
    cabinet.group.position.set(at.x, at.y, at.z)
    return true
  },
  root: (cabinet) => cabinet.group,
}

type PictureAt = { slot: PictureSlot; level: number; at: THREE.Vector3 }

/**
 * Every floor's gallery, a picture per showing hung, by `shownKey`. A showing new since the last board flies in from
 * over its worker's head once it has been held up; the others slide to their new places.
 */
export const GALLERY: Layer<PictureAt, Picture> = {
  slots: (p) => floors(p).flatMap((level) => level.wall.pictures.map((slot) => {
    const at = new THREE.Vector3(slot.x, level.y + slot.y, level.wall.face + 0.04)
    return [shownKey(slot.shown), { slot, level: level.index, at }] as [string, PictureAt]
  })),
  level: (at) => at.level,
  make({ slot, at }, key) {
    const pic = makePicture(slot.worker, slot.shown)
    const desk = s.desks.get(slot.worker.id)
    const arrives = !s.first && !s.lastShown.has(key) && desk
    hang(pic, at, slot.w, s.simNow / 1000, arrives ? heldUpAt(desk) : 'now')
    dressPicture(pic, !s.seenShown.has(key))
    return pic
  },
  keep(pic, { slot, at }) {
    pic.worker = slot.worker
    hang(pic, at, slot.w, s.simNow / 1000, 'slide')
    dressPicture(pic, !s.seenShown.has(shownKey(slot.shown)))
    return true
  },
  root: (pic) => pic.group,
}

/** Each floor's video wall, rebuilt when what it shows changes. */
export const WALLS: Layer<{ level: FloorLevel; key: string }, WallItem> = {
  slots: (p) => floors(p).map((level) => [String(level.index), { level, key: `${p.width}|${p.depth}|${level.y}|${videoWallKey(level)}` }]),
  level: (at) => at.level.index,
  make: ({ level, key }) => ({ key, wall: buildVideoWall(s.plan, level) }),
  keep: (item, { key }) => item.key === key,
  root: (item) => item.wall.group,
}

/** Each floor's Running board, rebuilt when what it lists changes. */
export const RUNNING: Layer<{ level: FloorLevel; key: string }, Running> = {
  slots: (p) => floors(p).map((level) => [String(level.index), { level, key: runningKey(p, level) }]),
  level: (at) => at.level.index,
  make: ({ level }) => buildRunning(s.plan, level),
  keep: (item, { key }) => item.key === key,
  root: (item) => item.group,
}

/** Each floor's pigeonhole, while it keeps review threads, rebuilt when what it shows changes. */
export const PIGEONHOLES: Layer<{ level: FloorLevel; key: string }, Pigeonhole> = {
  slots: (p) => floors(p).filter((level) => level.pigeonhole).map((level) => [String(level.index), { level, key: pigeonholeKey(level) }]),
  level: (at) => at.level.index,
  make: ({ level }) => buildPigeonhole(level, level.pigeonhole!),
  keep: (item, { key }) => item.key === key,
  root: (item) => item.group,
}

/** Each floor's filing cabinet, rebuilt when its archive's drawers change (or once the archive is first read). */
export const FILINGS: Layer<{ level: FloorLevel; key: string }, Filing> = {
  slots: (p) => floors(p).map((level) => [String(level.index), { level, key: filingKey(p, level, drawersAt(level.floor.id)) }]),
  level: (at) => at.level.index,
  make: ({ level }) => buildFiling(s.plan, level, drawersAt(level.floor.id)),
  keep: (item, { key }) => item.key === key,
  root: (item) => item.group,
}

/** Today's off-duty workers at the roof's party. Where each stands is set every frame, from the time (src/life.ts#guestAt). */
export const GUESTS: Layer<GuestSlot, Guest> = {
  slots(p) {
    const roof = p.levels.at(-1)!
    return roof.kind === 'roof' ? roof.guests.map((slot) => [slot.card.id, slot]) : []
  },
  level: (_, p) => p.levels.length - 1,
  make: (slot) => makeGuest(slot.card, s.models!),
  keep(g, slot) {
    g.card = slot.card
    return true
  },
  root: (g) => g.group,
}

/** The roof's dance floors, while anyone dances, rebuilt when which floors there are, or where, changes. */
export const DANCE: Layer<{ floors: DanceFloor[]; y: number; key: string }, DanceFloors & { key: string }> = {
  slots(p) {
    const roof = p.levels.at(-1)!
    return roof.kind === 'roof' && roof.floors.length ? [['roof', { floors: roof.floors, y: roof.y, key: JSON.stringify([roof.y, roof.floors]) }]] : []
  },
  level: (_, p) => p.levels.length - 1,
  make({ floors, y, key }) {
    const df = buildDanceFloors(floors)
    df.group.position.y = y
    return { ...df, key }
  },
  keep: (item, { key }) => item.key === key,
  root: (item) => item.group,
}
