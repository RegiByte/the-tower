import * as THREE from 'three'
import { act, type Held } from './acts.ts'
import type { Hiring } from './hiring.ts'
import { arcadeSignKey, buildArcadeSign, makeCabinet, type ArcadeSign, type Cabinet } from './arcade.ts'
import { addedTidyOf, can, cardsOf, shownKey } from './cards.ts'
import { makeNote, type Note } from './cork.ts'
import { DESK_DRESS, pickOf } from './dress.ts'
import { deskSlots, heldUpAt, makeDesk, makeSeat, makeStation, makeVisitor, situate, syncDesk, syncStation, type Desk, type DeskReads, type Station, type StationLook } from './desk.ts'
import { dressPicture, hang, makePicture, type Picture } from './gallery.ts'
import type { Screens } from './screens.ts'
import type { Pictures } from './showing.ts'
import { openStation, type AwaySlot, type DanceFloor, type DeskSlot, type GuestSlot, type Level, type PictureSlot, type Plan, type StationSlot } from './layout.ts'
import { arrival, carryChair, carryIn, leaver, moveTo, originOf } from './life.ts'
import { seatedness } from './rig.ts'
import type { Titles } from './titles.ts'
import type { Models } from './models.ts'
import type { Kit } from './kit.ts'
import { tintOf } from './palette.ts'
import { buildDanceFloors, makeGuest, type DanceFloors, type Guest } from './party.ts'
import { buildVideoWall, videoWallKey } from './room.ts'
import { buildRunning, runningKey, type Running } from './running.ts'
import { buildPigeonhole, pigeonholeKey, type Pigeonhole } from './pigeonhole.ts'
import type { Archive } from './archive.ts'
import type { Clients } from './clients.ts'
import { buildFiling, filingKey, type Filing } from './filing.ts'
import { s } from './state.ts'
import type { People } from './building.ts'
import type { VideoWall } from './room.ts'
import type { Board, Card } from './api.ts'
import type { AddedTidy } from '/lib/extension.js'

/**
 * Scene objects kept in step with the plan, one per slot it wants, by key, each hung on the level its slot stands on.
 * `keep` brings a kept item up to its slot, or answers false when the item must be made anew; `leave` runs as an item
 * goes, before it is discarded. Each is handed the plan being reconciled.
 */
/** Puts an object on a level of the scene, out of wherever it hung before (`hangOn`). */
export type ToLevel = (level: number, o: THREE.Object3D) => void

export type Layer<S, T> = {
  slots: (p: Plan) => [key: string, slot: S][]
  level: (slot: S, p: Plan) => number
  make: (slot: S, key: string, p: Plan) => T
  keep: (item: T, slot: S, p: Plan) => boolean
  root: (item: T) => THREE.Object3D
  leave?: (item: T, key: string, p: Plan) => void
}

export function reconcile<S, T>(layer: Layer<S, T>, items: Map<string, T>, p: Plan, toLevel: ToLevel, discard: (o: THREE.Object3D) => void) {
  const wanted = layer.slots(p)
  for (const [key, slot] of wanted) {
    const old = items.get(key)
    if (old && layer.keep(old, slot, p)) {
      toLevel(layer.level(slot, p), layer.root(old))
      continue
    }
    if (old) discard(layer.root(old))
    const item = layer.make(slot, key, p)
    toLevel(layer.level(slot, p), layer.root(item))
    items.set(key, item)
  }
  const keys = new Set(wanted.map(([key]) => key))
  for (const [key, item] of items) {
    if (keys.has(key)) continue
    layer.leave?.(item, key, p)
    discard(layer.root(item))
    items.delete(key)
  }
}

const DEG = Math.PI / 180

type FloorLevel = Extract<Level, { kind: 'floor' }>
const floors = (p: Plan) => p.levels.filter((l): l is FloorLevel => l.kind === 'floor')

/**
 * A desk per worker on duty, a reviewer's beside its author's, a crew member's at its place in a meeting room, as the
 * building takes a board after `was`, the one it stood on. One that appears walks in from the elevator, unless the
 * building stood on no board before; one that goes walks out. A worker whose desk becomes
 * another on its level (a reviewer whose author leaves first, taking a desk of its own; a crew gathering in a meeting
 * room or dispersing, a member moved to another place there) walks from the one to the other.
 */
type DeskAt = { slot: DeskSlot; level: number; y: number; author: Card }

/** What kind of desk a slot asks for, and what kind a desk is: a worker's own, beside its author, a seat in a meeting room, or a place to stand there. */
const kindOfSlot = (slot: DeskSlot) => (slot.meeting ? (slot.meeting.stand ? 'stand' : 'seat') : slot.beside ? 'beside' : 'own')
const kindOfDesk = (desk: Desk) => (desk.meeting ? (desk.meeting.stand ? 'stand' : 'seat') : desk.side ? 'own' : 'beside')

/** How far onto its chair a worker at `desk` sits: not at all while it still walks there, or standing at a meeting. */
const seatedAt = (arrivals: People['arrivals'], desk: Desk, id: string) => {
  const arriving = arrivals.get(id)
  if (desk.meeting?.stand) return 0
  return !arriving ? 1 : arriving.sat > 0 ? seatedness(desk.models.cast, desk.avatar.rig) : 0
}

/** The dressing's slots of the desk a worker sits at, in that desk's states: a reviewer's are its author's. */
export const slotsAt = (kit: Kit, author: Card, now: number) => deskSlots(pickOf(author, new Date(now).getMonth(), kit.prefabs[DESK_DRESS]).slots)

/** What the layers make their things from, as loaded. */
export type Art = { models: Models; kit: Kit }

export const desksAfter = (was: Board | undefined, toLevel: ToLevel, reads: DeskReads, now: number, { models, kit }: Art, { arrivals, leavers, moves }: People): Layer<DeskAt, Desk> => ({
  slots: (p) => floors(p).flatMap((level) => level.desks.map((slot) => {
    const author = slot.beside ? level.desks.find((d) => d.card.id === slot.beside)!.card : slot.card
    return [slot.card.id, { slot, level: level.index, y: level.y, author }] as [string, DeskAt]
  })),
  level: (at) => at.level,
  make({ slot, y, author }, _key, p) {
    const slots = slotsAt(kit, author, now)
    const desk = slot.meeting ? makeSeat(slot.card, models, slots, slot.meeting.stand, slot.meeting.play, reads) : slot.beside ? makeVisitor(slot.card, models, slots, reads) : makeDesk(slot.card, models, slots, reads)
    act(desk.group, { kind: 'desk', id: slot.card.id }, [])
    if (desk.side) act(desk.side.group, { kind: 'shown', id: slot.card.id }, [])
    desk.group.position.set(slot.x, y, slot.z)
    desk.group.rotation.y = slot.turn * DEG
    const from = moves.get(slot.card.id)
    moves.delete(slot.card.id)
    const coming = from ? moveTo(p, desk, from) : was === undefined ? undefined : arrival(p, desk)
    if (!from && coming && kindOfDesk(desk) === 'beside') carryIn(coming)
    if (coming) arrivals.set(slot.card.id, coming)
    return desk
  },
  keep(desk, { slot, y, author }, p) {
    const moved = desk.meeting && (desk.group.position.x !== slot.x || desk.group.position.z !== slot.z)
    if (kindOfDesk(desk) !== kindOfSlot(slot) || moved) {
      if (desk.avatar.root.visible) moves.set(slot.card.id, originOf(p, desk, seatedAt(arrivals, desk, slot.card.id)))
      return false
    }
    situate(desk, slotsAt(kit, author, now))
    syncDesk(desk, slot.card, reads)
    desk.group.position.set(slot.x, y, slot.z)
    desk.group.rotation.y = slot.turn * DEG
    return true
  },
  root: (desk) => desk.group,
  leave(desk, id, p) {
    if (desk.avatar.root.visible) {
      const level = p.levels.find((l) => l.y === desk.group.position.y)!.index
      const l = leaver(p, desk, level, seatedAt(arrivals, desk, id), models)
      leavers.add(l)
      toLevel(level, l.group)
      if (kindOfDesk(desk) === 'beside') carryChair(l, desk)
    }
    arrivals.delete(id)
  },
})

/** `open`: where the floor's next worker sits; `lit` while the floor can spawn; `away`, the worker whose it is while it is in a meeting room. */
type StationAt = { slot: StationSlot; level: number; y: number; project: string; open: boolean; lit: boolean; away?: AwaySlot }

/** A workstation's look: the open one reads hiring while its floor's hire is in flight in `hires`. */
const lookOf = (hires: Hiring<Held>, project: string, lit: boolean, away: AwaySlot | undefined): StationLook => {
  if (away) return { t: 'away', callsign: away.card.callsign, room: away.room }
  if (!lit) return { t: 'dark' }
  return hires[project] ? { t: 'hiring' } : { t: 'open' }
}

/**
 * Every workstation nobody sits at, by floor and number: the free ones, the open one lit while its floor can spawn,
 * reading hiring while `hires` holds its floor's, and those whose workers are in a meeting room, saying where.
 */
export const stationsOf = (models: Models, hires: Hiring<Held>): Layer<StationAt, Station> => {
  const layer: Layer<StationAt, Station> = {
    slots: (p) => floors(p).flatMap((level) => [
      ...level.free.map((slot) => {
        const open = slot === openStation(level)
        return [`${level.floor.id}/${slot.n}`, { slot, level: level.index, y: level.y, project: level.floor.id, open, lit: open && can(level.floor, 'spawn') }] as [string, StationAt]
      }),
      ...level.away.map((slot) => [`${level.floor.id}/${slot.n}`, { slot, level: level.index, y: level.y, project: level.floor.id, open: false, lit: false, away: slot }] as [string, StationAt]),
    ]),
    level: (at) => at.level,
    make(at, _key, p) {
      const station = makeStation(models)
      layer.keep(station, at, p)
      return station
    },
    keep(station, { slot, y, project, open, lit, away }) {
      syncStation(station, lookOf(hires, project, lit, away))
      if (away) act(station.group, { kind: 'desk', id: away.card.id }, [])
      else act(station.group, { kind: 'station', project, n: slot.n, open }, [])
      station.group.position.set(slot.x, y, slot.z)
      station.group.rotation.y = slot.turn * DEG
      return true
    },
    root: (station) => station.group,
  }
  return layer
}

type NoteAt = { project: string; id: string; tag: string; modifiedAt: number; level: number; x: number; y: number; z: number; tint: string }
const isHeld = (held: Held | undefined, at: NoteAt) => held?.project === at.project && held.id === at.id

/** Every draft pinned on its floor's corkboard, drawn again when its title (`noteTitle`'s) or tint changes; the one in your hand (`held`) is not there. */
export const notesOf = (noteTitle: Titles['noteTitle'], held: () => Held | undefined): Layer<NoteAt, Note> => ({
  slots: (p) => floors(p).flatMap((level) => (level.cork?.notes ?? []).map((n) => {
    const at = { project: level.floor.id, id: n.id, tag: n.tag, modifiedAt: n.modifiedAt, level: level.index, x: n.x, y: level.y + n.y, z: level.cork!.z + 0.06, tint: tintOf(level.floor) }
    return [`${at.project}/${at.id}`, at] as [string, NoteAt]
  })),
  level: (at) => at.level,
  make(at) {
    const note = makeNote(at.project, at.id, noteTitle(at.project, at), at.tag, at.tint)
    note.group.position.set(at.x, at.y, at.z)
    note.group.visible = !isHeld(held(), at)
    return note
  },
  keep(note, at) {
    if (note.title !== noteTitle(at.project, at) || note.tint !== at.tint) return false
    note.group.position.set(at.x, at.y, at.z)
    note.group.visible = !isHeld(held(), at)
    return true
  },
  root: (note) => note.group,
})

type CabinetAt = { project: string; id: string; tag: string; modifiedAt: number; keptBy: string | undefined; level: number; x: number; y: number; z: number; tint: string }

/** Every game's cabinet in its floor's arcade, facing into the room, drawn again when its title (`gameTitle`'s), keeper or tint changes. */
export const cabinetsOf = (gameTitle: Titles['gameTitle']): Layer<CabinetAt, Cabinet> => ({
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
})

type PictureAt = { slot: PictureSlot; level: number; at: THREE.Vector3 }

/** Every showing on `board`, by `shownKey`. */
export const shownOn = (board: Board) => new Set(cardsOf(board).flatMap((c) => c.shown.map(shownKey)))

/**
 * Every floor's gallery, a picture per showing hung, by `shownKey`, as the building takes a board after `was`, the one
 * it stood on. A showing `was` didn't hold flies in from over its worker's head once it has been held up; the others
 * slide to their new places.
 */
export function galleryAfter(was: Board | undefined, posterOf: Pictures['posterOf'], now: number, t: number, desks: ReadonlyMap<string, Desk>): Layer<PictureAt, Picture> {
  const before = was && shownOn(was)
  return {
    slots: (p) => floors(p).flatMap((level) => level.wall.pictures.map((slot) => {
      const at = new THREE.Vector3(slot.x, level.y + slot.y, level.wall.face + 0.04)
      return [shownKey(slot.shown), { slot, level: level.index, at }] as [string, PictureAt]
    })),
    level: (at) => at.level,
    make({ slot, at }, key) {
      const pic = makePicture(slot.worker, slot.shown, posterOf, now)
      const desk = desks.get(slot.worker.id)
      const arrives = before && !before.has(key) && desk
      hang(pic, at, slot.w, t, arrives ? heldUpAt(desk) : 'now')
      dressPicture(pic, !s.seenShown.has(key), now)
      return pic
    },
    keep(pic, { slot, at }) {
      pic.worker = slot.worker
      hang(pic, at, slot.w, t, 'slide')
      dressPicture(pic, !s.seenShown.has(shownKey(slot.shown)), now)
      return true
    },
    root: (pic) => pic.group,
  }
}

/** A floor's video wall, and what it showed when built. */
export type WallItem = { key: string; wall: VideoWall }

/** Each floor's video wall, its monitors' streams from `screenTexture`, rebuilt when what it shows changes. */
export const wallsOf = (screenTexture: Screens['screenTexture']): Layer<{ level: FloorLevel; key: string }, WallItem> => ({
  slots: (p) => floors(p).map((level) => [String(level.index), { level, key: `${p.width}|${p.depth}|${level.y}|${videoWallKey(level)}` }]),
  level: (at) => at.level.index,
  make: ({ level, key }, _key, p) => ({ key, wall: buildVideoWall(p, level, screenTexture) }),
  keep: (item, { key }) => item.key === key,
  root: (item) => item.wall.group,
})

/** Each floor's Running board on `board`, rebuilt when what it lists changes. */
export const runningOn = (board: Board): Layer<{ level: FloorLevel; added: AddedTidy[]; key: string }, Running> => ({
  slots: (p) =>
    floors(p).map((level) => {
      const added = addedTidyOf(board, level.floor)
      return [String(level.index), { level, added, key: runningKey(p, level, added) }]
    }),
  level: (at) => at.level.index,
  make: ({ level, added }, _key, p) => buildRunning(p, level, added),
  keep: (item, { key }) => item.key === key,
  root: (item) => item.group,
})

/** Each floor's pigeonhole, while it keeps review threads, rebuilt when what it shows changes; what is new to a worker is `cardReviews`'. */
export const pigeonholesOf = (cardReviews: Clients['cardReviews']): Layer<{ level: FloorLevel; key: string }, Pigeonhole> => ({
  slots: (p) => floors(p).filter((level) => level.pigeonhole).map((level) => [String(level.index), { level, key: pigeonholeKey(level, cardReviews) }]),
  level: (at) => at.level.index,
  make: ({ level }) => buildPigeonhole(level, level.pigeonhole!, cardReviews),
  keep: (item, { key }) => item.key === key,
  root: (item) => item.group,
})

/** Each floor's arcade sign, while its game room holds no cabinet. */
export const ARCADE_SIGNS: Layer<{ level: FloorLevel; key: string }, ArcadeSign> = {
  slots: (p) => floors(p).filter((level) => level.arcadeSign).map((level) => [String(level.index), { level, key: arcadeSignKey(level) }]),
  level: (at) => at.level.index,
  make: ({ level }) => buildArcadeSign(level, level.arcadeSign!),
  keep: (item, { key }) => item.key === key,
  root: (item) => item.group,
}

/** Each floor's filing cabinet, rebuilt when its archive's drawers (`drawersAt`'s) change (or once the archive is first read). */
export const filingsOf = (drawersAt: Archive['drawersAt']): Layer<{ level: FloorLevel; key: string }, Filing> => ({
  slots: (p) => floors(p).map((level) => [String(level.index), { level, key: filingKey(p, level, drawersAt(level.floor.id)) }]),
  level: (at) => at.level.index,
  make: ({ level }, _key, p) => buildFiling(p, level, drawersAt(level.floor.id)),
  keep: (item, { key }) => item.key === key,
  root: (item) => item.group,
})

/** Today's off-duty workers at the roof's party. Where each stands is set every frame, from the time (src/life.ts#guestAt). */
export const guestsOf = (models: Models): Layer<GuestSlot, Guest> => ({
  slots(p) {
    const roof = p.levels.at(-1)!
    return roof.kind === 'roof' ? roof.guests.map((slot) => [slot.card.id, slot]) : []
  },
  level: (_, p) => p.levels.length - 1,
  make: (slot) => makeGuest(slot.card, models),
  keep(g, slot) {
    g.card = slot.card
    return true
  },
  root: (g) => g.group,
})

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
