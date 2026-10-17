import * as THREE from 'three'
import { act } from './acts.ts'
import { WORLD } from './cards.ts'
import type { Card } from './api.ts'
import { avatar, seatedAt, topOf, type Avatar } from './avatar.ts'
import { WARDROBE } from './closet.ts'
import { walkPose, type GuestPlace } from './life.ts'
import { DANCE_TILE, STRING_ROWS, partySpots, type DanceFloor, type Plan } from './layout.ts'
import { BPM } from './music.ts'
import { instance, type Models } from './models.ts'
import { pose, type Cast, type ClipKey, type Layer, type Rig } from './rig.ts'
import { tintOf } from './palette.ts'
import { block, glows, sprite, toon } from './toon.ts'
import { lookNamed, lookOfWorker, type Staff } from './wardrobe.ts'

/**
 * The roof party: a puff on the decks, a bar and string lights, built with the roof (`buildParty`); a dance floor per
 * project with guests today, tinted in its colour (`buildDanceFloors`); and today's off-duty workers dancing on them,
 * kept by worker like the desks (`makeGuest`). Everything moves to one beat, the music's (src/music.ts).
 */

/** The roof's deck top (src/world.ts#roofLevel), the dance floor's dark plinth on it, and the tiles on that. */
const DECK = 0.02
const PLINTH = 0.03
const TILE = 0.02

const PARTY_COLORS = ['#ff4fa3', '#c792ea', '#6cb6ff', '#5ee38f', '#ffb547', '#4fb3c8'].map((c) => new THREE.Color(c))

/** What the party animates each frame: the neon and the DJ. */
export type Party = { models: Models; neon: THREE.MeshBasicMaterial[]; dj: Avatar; bartender: Avatar }

function stringLights(p: Plan) {
  const bulbs: THREE.Vector3[] = []
  const poles = new THREE.Group()
  const ends = p.width / 2 - 1
  for (const z of STRING_ROWS.map((dz) => -p.depth / 2 + dz)) {
    for (const x of [-ends, ends]) poles.add(block(0.08, 3.4, 0.08, toon('#2a3142'), x, 0, z))
    for (let x = -ends; x <= ends; x += 0.9) bulbs.push(new THREE.Vector3(x, 3.3 - 0.9 * (1 - (x / ends) ** 2), z))
  }
  const lights = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 8, 6), glows(new THREE.MeshBasicMaterial({ toneMapped: false })), bulbs.length)
  const warm = new THREE.Color('#ffd9a0')
  bulbs.forEach((b, i) => {
    lights.setMatrixAt(i, new THREE.Matrix4().makeTranslation(b))
    lights.setColorAt(i, i % 4 === 0 ? PARTY_COLORS[(i / 4) % PARTY_COLORS.length] : warm)
  })
  return [poles, lights]
}

export function buildParty(p: Plan, models: Models, pickables: THREE.Object3D[]): { group: THREE.Group; party: Party } {
  const group = new THREE.Group()
  const spots = partySpots(p)
  const booth = instance(models.dj)
  booth.root.position.set(spots.dj.x, 0, spots.dj.z)
  const bar = instance(models.bar)
  bar.root.position.set(spots.bar.x, 0, spots.bar.z)
  const barStrip = bar.material<THREE.MeshBasicMaterial>('strip_glow_own')!
  barStrip.color.set('#ff4fa3')
  const bartender = avatar(models, lookNamed('bartender' satisfies Staff, WARDROBE, models.catalogue), WARDROBE)
  bartender.root.position.set(spots.bar.x, 0, spots.bar.z - 0.6)
  bartender.body.position.y = 0.5
  const dj = avatar(models, lookNamed('dj' satisfies Staff, WARDROBE, models.catalogue), WARDROBE)
  dj.root.position.set(spots.dj.x, 0.55, spots.dj.z - 0.5)
  dj.bulb.color.set('#ffd9a0')
  const sign = sprite('ROOFTOP BAR', 0.35, { color: '#0b1020', bg: '#ff4fa3', px: 48 })
  sign.position.set(spots.bar.x, 2.9, spots.bar.z - 1.2)
  group.add(act(booth.root, { kind: 'dj' }, pickables), act(dj.root, { kind: 'dj' }, pickables), act(bar.root, { kind: 'bar' }, pickables), act(bartender.root, { kind: 'bar' }, pickables), sign, ...stringLights(p))
  return { group, party: { models, neon: [booth.material<THREE.MeshBasicMaterial>('neon_glow_own')!, barStrip], dj, bartender } }
}

/**
 * Every dance floor on the roof: one plinth and one tile mesh for them all, each tile flashing between the colours of
 * its floor (its project's, lit and pale; the party's on the shared floor), and a sign over each floor's back edge.
 */
export type DanceFloors = { group: THREE.Group; tiles: THREE.InstancedMesh; colors: THREE.Color[][] }

export function buildDanceFloors(floors: DanceFloor[]): DanceFloors {
  const group = new THREE.Group()
  const count = floors.reduce((n, f) => n + f.columns * f.rows, 0)
  const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(DANCE_TILE - 0.06, TILE, DANCE_TILE - 0.06), glows(new THREE.MeshBasicMaterial({ toneMapped: false })), count)
  const plinths = new THREE.InstancedMesh(new THREE.BoxGeometry(1, PLINTH, 1), toon('#0b0f18'), floors.length)
  const colors: THREE.Color[][] = []
  floors.forEach((f, k) => {
    const tint = f.color === undefined ? undefined : new THREE.Color(tintOf(f))
    const own = tint && [tint, tint.clone().lerp(new THREE.Color('#ffffff'), 0.45)]
    for (let r = 0; r < f.rows; r++) {
      for (let c = 0; c < f.columns; c++) {
        const i = colors.length
        tiles.setMatrixAt(i, new THREE.Matrix4().makeTranslation(f.x + (c - (f.columns - 1) / 2) * DANCE_TILE, DECK + PLINTH + TILE / 2, f.z + (r - (f.rows - 1) / 2) * DANCE_TILE))
        colors.push(own ?? PARTY_COLORS)
        tiles.setColorAt(i, colors[i][i % colors[i].length])
      }
    }
    const [w, d] = [f.columns * DANCE_TILE + 0.3, f.rows * DANCE_TILE + 0.3]
    plinths.setMatrixAt(k, new THREE.Matrix4().makeTranslation(f.x, DECK + PLINTH / 2, f.z).scale(new THREE.Vector3(w, 1, d)))
    const sign = sprite(f.name, 0.3, { color: '#0b1020', bg: tint ? `#${tint.getHexString()}` : '#ff4fa3', px: 44 })
    sign.position.set(f.x, 2.5, f.z - d / 2)
    group.add(sign)
  })
  group.add(plinths, tiles)
  return { group, tiles, colors }
}

/** The dance floors flash on the beat. */
export function animateDanceFloors(df: DanceFloors, beat: number) {
  const step = Math.floor(beat)
  const color = new THREE.Color()
  df.colors.forEach((own, i) => {
    const on = (i * 7 + step * 3) % 5 < 2
    df.tiles.setColorAt(i, color.copy(own[(i + step) % own.length]).multiplyScalar(on ? 1 : 0.18))
  })
  df.tiles.instanceColor!.needsUpdate = true
}

/** The neon breathes on the beat. */
export function animateParty(party: Party, beat: number) {
  const pulse = 0.6 + 0.4 * Math.pow(1 - (beat % 1), 2)
  party.neon[0].color.copy(PARTY_COLORS[Math.floor(beat / 4) % PARTY_COLORS.length]).multiplyScalar(pulse)
  party.neon[1].color.set('#ff4fa3').multiplyScalar(0.7 + 0.3 * pulse)
}

/** The DJ bobs and scratches on the beat, at sim time `t`; the bartender waits behind the bar. */
export function poseStaff(party: Party, beat: number, t: number) {
  const { dj, bartender, models } = party
  dj.body.position.y = Math.pow(1 - (beat % 1), 3) * 0.05
  dj.body.rotation.y = Math.sin(beat * Math.PI * 0.25) * 0.2
  pose(models.cast, dj.rig, { layers: [{ clip: 'Idle_A:rest', at: beat }, onBeat(models.cast, dj.rig, Math.floor(beat / 8) % 2 ? 'Cheering:arms' : 'Working_A:arms', beat)] }, t)
  pose(models.cast, bartender.rig, { layers: [{ clip: 'Idle_B', at: beat / (BPM / 60) }] }, t)
}

/** A clip played in time with the music: a whole number of beats to a loop, as near its own pace as that allows. */
function onBeat(cast: Cast, rig: Rig, clip: ClipKey, beat: number): Layer {
  const length = cast.skeletons[rig.kind].clips.get(clip)!.duration
  const beats = Math.max(1, Math.round((length * BPM) / 60))
  return { clip, at: ((beat % beats) / beats) * length }
}

/** A worker at the party, in its own color with its callsign over its head, and a beer in its hand while at the bar. */
export type Guest = { card: Card; group: THREE.Group; models: Models; avatar: Avatar; mug: THREE.Object3D; phase: number }

const shared = <G extends THREE.BufferGeometry>(g: G) => ((g.userData.shared = true), g)
const MUG = {
  glass: shared(new THREE.CylinderGeometry(0.058, 0.05, 0.14, 14)),
  foam: shared(new THREE.SphereGeometry(0.062, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2)),
  handle: shared(new THREE.TorusGeometry(0.038, 0.013, 6, 12, Math.PI)),
}

/** A beer mug of amber glass with a foam head, sitting in a fist with its handle toward the body. */
export function mug() {
  const group = new THREE.Group()
  const glass = new THREE.Mesh(MUG.glass, toon('#e9a227'))
  glass.position.y = 0.04
  const foam = new THREE.Mesh(MUG.foam, toon('#fff4dc'))
  foam.position.y = 0.11
  foam.scale.y = 0.55
  const handle = new THREE.Mesh(MUG.handle, toon('#e9a227'))
  handle.position.set(0.058, 0.04, 0)
  handle.rotation.z = -Math.PI / 2
  group.add(glass, foam, handle)
  return group
}

const TAG_HEIGHT = 0.2
/** Between the top of a guest, hat and all, and the bottom of its tag. */
const TAG_GAP = 0.08

export function makeGuest(card: Card, models: Models): Guest {
  const w = avatar(models, lookOfWorker(card.id, card.callsign, WARDROBE, models.catalogue), WARDROBE)
  w.bulb.color.copy(PARTY_COLORS[card.id.length % PARTY_COLORS.length])
  const group = new THREE.Group()
  group.add(w.root)
  const tag = sprite(card.callsign, TAG_HEIGHT, { color: WORLD.panel, bg: WORLD.enamel, px: 40 })
  tag.position.y = topOf(w) + TAG_GAP + TAG_HEIGHT / 2
  group.add(tag)
  const beer = mug()
  w.hand.add(beer)
  act(group, { kind: 'guest', id: card.id }, [])
  return { card, group, models, avatar: w, mug: beer, phase: (card.startedAt % 997) / 997 }
}

/** A guest where its schedule has it, at `y`'s level. */
export function placeGuest(g: Guest, at: GuestPlace, y: number) {
  g.group.position.set(at.x, y + at.y, at.z)
  g.group.rotation.y = at.heading
}

/** Poses a guest for what it does where it is, at sim time `t`: walking, dancing, drinking or mingling. */
export function poseGuest(g: Guest, at: GuestPlace, beat: number, t: number) {
  g.mug.visible = at.pose === 'drink'
  if (g.avatar.gear) g.avatar.gear.visible = at.pose !== 'drink'
  if (at.pose === 'walk') walkPose(g.models, g.avatar, at.walked, t)
  else if (at.pose === 'dance') dance(g, beat, t)
  else if (at.pose === 'drink') drink(g, at.since, t)
  else mingle(g, at.since, t)
}

/** The moves a guest dances, a few bars of each, in its own order: the dance itself most of the time. */
const MOVES: ClipKey[] = ['UAL_Dance_Loop', 'Cheering', 'UAL_Dance_Loop', 'Jump_Idle', 'UAL_Dance_Loop', 'Waving', 'Cheering:arms']

/** Dances, changing moves every two bars; between dances, bounces on the beat and sways. */
function dance(g: Guest, at: number, t: number) {
  const beat = at + g.phase
  const { body, rig } = g.avatar
  const move = MOVES[(Math.floor(beat / 8) + Math.floor(g.phase * MOVES.length)) % MOVES.length]
  const bounce = move === 'UAL_Dance_Loop' ? 0 : 1
  body.position.set(0, Math.abs(Math.sin(beat * Math.PI)) * 0.06 * bounce, 0)
  body.rotation.set(0, Math.sin(beat * Math.PI * 0.25) * 0.5 * bounce, 0)
  const layers = move.endsWith(':arms') ? [{ clip: 'Jump_Idle:rest', at: beat } as const, onBeat(g.models.cast, rig, move, beat)] : [onBeat(g.models.cast, rig, move, beat)]
  pose(g.models.cast, rig, { layers }, t)
}

/** How often a guest at the bar sips, give or take its own phase, and how long a sip takes. */
const SIP = { every: 5, takes: 1.4 }

/** Sits at the counter, and every few seconds lifts its beer for a sip. */
function drink(g: Guest, since: number, t: number) {
  const cycle = (since + g.phase * SIP.every) % (SIP.every + g.phase * 2)
  const lift = cycle < SIP.takes ? Math.sin((cycle / SIP.takes) * Math.PI) : 0
  const { body, rig } = g.avatar
  body.position.copy(seatedAt(g.models.cast, g.avatar, { y: 0 }))
  body.rotation.set(0, 0, 0)
  pose(g.models.cast, rig, { layers: [{ clip: 'Sit_Chair_Idle:rest', at: since + g.phase * 3 }, { clip: 'Holding_A:arms', at: since, weight: 1 - lift }, { clip: 'Use_Item:arms', at: 0.6, weight: lift }] }, t)
}

/** Chats: turns a little to the others and now and then talks, hands and all. */
function mingle(g: Guest, since: number, t: number) {
  const talk = Math.max(0, Math.sin(since * 0.9 + g.phase * 7))
  const { body, rig } = g.avatar
  body.position.set(0, 0, 0)
  body.rotation.set(0, Math.sin(since * 0.4 + g.phase * 5) * 0.25, 0)
  const at = since + g.phase * 4
  pose(g.models.cast, rig, { layers: [{ clip: 'Idle_B', at, weight: 1 - talk }, { clip: 'UAL_Idle_Talking_Loop', at: since, weight: talk }] }, t)
}
