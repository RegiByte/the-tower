import * as THREE from 'three'
import { act } from './acts.ts'
import { arcadeSignKey, buildArcadeSign, gameTitle, makeCabinet, type ArcadeSign, type Cabinet } from './arcade.ts'
import { can } from './cards.ts'
import { makeNote, type Note } from './cork.ts'
import { DESK_DRESS, pickOf } from './dress.ts'
import { deskSlots, heldUpAt, makeDesk, makeSeat, makeStation, makeVisitor, situate, syncDesk, syncStation, type Desk, type Station } from './desk.ts'
import { dressPicture, hang, makePicture, type Picture } from './gallery.ts'
import { openStation, type AwaySlot, type DanceFloor, type DeskSlot, type GuestSlot, type Level, type PictureSlot, type Plan, type StationSlot } from './layout.ts'
import { arrival, carryChair, leaver, moveTo, originOf } from './life.ts'
import { seatedness } from './rig.ts'
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
import type { Card } from './api.ts'
import { wallNow } from './clock.ts'

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

const DEG = Math.PI / 180

type FloorLevel = Extract<Level, { kind: 'floor' }>
const floors = (p: Plan) => p.levels.filter((l): l is FloorLevel => l.kind === 'floor')

/**
 * A desk per worker on duty, a reviewer's beside its author's, a crew member's at its place in a meeting room. One that
 * appears after the first board walks in from the elevator; one that goes walks out. A worker whose desk becomes
 * another on its level (a reviewer whose author leaves first, taking a desk of its own; a crew gathering in a meeting
 * room or dispersing, a member moved to another place there) walks from the one to the other.
 */
type DeskAt = { slot: DeskSlot; level: number; y: number; author: Card }

/** What kind of desk a slot asks for, and what kind a desk is: a worker's own, beside its author, a seat in a meeting room, or a place to stand there. */
const kindOfSlot = (slot: DeskSlot) => (slot.meeting ? (slot.meeting.stand ? 'stand' : 'seat') : slot.beside ? 'beside' : 'own')
const kindOfDesk = (desk: Desk) => (desk.meeting ? (desk.meeting.stand ? 'stand' : 'seat') : desk.side ? 'own' : 'beside')

/** How far onto its chair a worker at `desk` sits: not at all while it still walks there, or standing at a meeting. */
const seatedAt = (desk: Desk, id: string) => {
  const arriving = s.arrivals.get(id)
  if (desk.meeting?.stand) return 0
  return !arriving ? 1 : arriving.sat > 0 ? seatedness(s.models!.cast, desk.avatar.rig) : 0
}

/** The dressing's slots of the desk a worker sits at, in that desk's states: a reviewer's are its author's. */
export const slotsAt = (author: Card) => deskSlots(pickOf(author, new Date(wallNow()).getMonth(), s.kit!.prefabs[DESK_DRESS]).slots)

export const DESKS: Layer<DeskAt, Desk> = {
  slots: (p) => floors(p).flatMap((level) => level.desks.map((slot) => {
    const author = slot.beside ? level.desks.find((d) => d.card.id === slot.beside)!.card : slot.card
    return [slot.card.id, { slot, level: level.index, y: level.y, author }] as [string, DeskAt]
  })),
  level: (at) => at.level,
  make({ slot, y, author }) {
    const slots = slotsAt(author)
    const desk = slot.meeting ? makeSeat(slot.card, s.models!, slot.meeting.stand) : slot.beside ? makeVisitor(slot.card, s.models!, slots) : makeDesk(slot.card, s.models!, slots)
    act(desk.group, { kind: 'desk', id: slot.card.id }, [])
    if (desk.side) act(desk.side.group, { kind: 'shown', id: slot.card.id }, [])
    desk.group.position.set(slot.x, y, slot.z)
    desk.group.rotation.y = slot.turn * DEG
    const from = s.moves.get(slot.card.id)
    s.moves.delete(slot.card.id)
    if (from) s.arrivals.set(slot.card.id, moveTo(s.plan, desk, from))
    else if (!s.first) s.arrivals.set(slot.card.id, arrival(s.plan, desk))
    return desk
  },
  keep(desk, { slot, y, author }) {
    const moved = desk.meeting && (desk.group.position.x !== slot.x || desk.group.position.z !== slot.z)
    if (kindOfDesk(desk) !== kindOfSlot(slot) || moved) {
      if (desk.avatar.root.visible) s.moves.set(slot.card.id, originOf(s.plan, desk, seatedAt(desk, slot.card.id)))
      return false
    }
    situate(desk, slotsAt(author))
    syncDesk(desk, slot.card)
    desk.group.position.set(slot.x, y, slot.z)
    desk.group.rotation.y = slot.turn * DEG
    return true
  },
  root: (desk) => desk.group,
  leave(desk, id) {
    if (desk.avatar.root.visible) {
      const level = s.plan.levels.find((l) => l.y === desk.group.position.y)!.index
      const l = leaver(s.plan, desk, level, seatedAt(desk, id), s.models!)
      s.leavers.add(l)
      hangOn(level, l.group)
      if (kindOfDesk(desk) === 'beside') carryChair(l, desk)
    }
    s.arrivals.delete(id)
  },
}

/** `open`: where the floor's next worker sits; `lit` while the floor can spawn; `away`, the worker whose it is while it is in a meeting room. */
type StationAt = { slot: StationSlot; level: number; y: number; project: string; open: boolean; lit: boolean; away?: AwaySlot }

/**
 * Every workstation nobody sits at, by floor and number: the free ones, the open one lit while its floor can spawn,
 * and those whose workers are in a meeting room, saying where.
 */
export const STATIONS: Layer<StationAt, Station> = {
  slots: (p) => floors(p).flatMap((level) => [
    ...level.free.map((slot) => {
      const open = slot === openStation(level)
      return [`${level.floor.id}/${slot.n}`, { slot, level: level.index, y: level.y, project: level.floor.id, open, lit: open && can(level.floor, 'spawn') }] as [string, StationAt]
    }),
    ...level.away.map((slot) => [`${level.floor.id}/${slot.n}`, { slot, level: level.index, y: level.y, project: level.floor.id, open: false, lit: false, away: slot }] as [string, StationAt]),
  ]),
  level: (at) => at.level,
  make(at) {
    const station = makeStation(s.models!)
    STATIONS.keep(station, at)
    return station
  },
  keep(station, { slot, y, project, open, lit, away }) {
    syncStation(station, lit, away && { callsign: away.card.callsign, room: away.room })
    if (away) act(station.group, { kind: 'desk', id: away.card.id }, [])
    else act(station.group, { kind: 'station', project, n: slot.n, open }, [])
    station.group.position.set(slot.x, y, slot.z)
    station.group.rotation.y = slot.turn * DEG
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

/** Each floor's arcade sign, while its game room holds no cabinet. */
export const ARCADE_SIGNS: Layer<{ level: FloorLevel; key: string }, ArcadeSign> = {
  slots: (p) => floors(p).filter((level) => level.arcadeSign).map((level) => [String(level.index), { level, key: arcadeSignKey(level) }]),
  level: (at) => at.level.index,
  make: ({ level }) => buildArcadeSign(level, level.arcadeSign!),
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
