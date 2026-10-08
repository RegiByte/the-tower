import * as THREE from 'three'
import { act } from './acts.ts'
import { WORLD } from './cards.ts'
import type { Card } from './api.ts'
import { avatar, lookOf, type Avatar, type Look } from './avatar.ts'
import { walkPose, type GuestPlace } from './life.ts'
import { DANCE_TILE, STRING_ROWS, partySpots, type DanceFloor, type Plan } from './layout.ts'
import { instance, type Models } from './models.ts'
import { tintOf } from './palette.ts'
import { block, sprite, toon } from './toon.ts'

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
export type Party = { neon: THREE.MeshBasicMaterial[]; dj: Avatar }

const BARTENDER: Look = { species: 'bean', hue: new THREE.Color('#ffd27a'), wear: new THREE.Color('#2b2d42'), hat: 'hat_cap', build: { width: 1, height: 1 } }
const DJ: Look = { species: 'puff', hue: new THREE.Color('#9b7bff'), wear: new THREE.Color('#ff4fa3'), face: 'face_shades', build: { width: 1, height: 1 } }

function stringLights(p: Plan) {
  const bulbs: THREE.Vector3[] = []
  const poles = new THREE.Group()
  const ends = p.width / 2 - 1
  for (const z of STRING_ROWS.map((dz) => -p.depth / 2 + dz)) {
    for (const x of [-ends, ends]) poles.add(block(0.08, 3.4, 0.08, toon('#2a3142'), x, 0, z))
    for (let x = -ends; x <= ends; x += 0.9) bulbs.push(new THREE.Vector3(x, 3.3 - 0.9 * (1 - (x / ends) ** 2), z))
  }
  const lights = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ toneMapped: false }), bulbs.length)
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
  const bartender = avatar(models, BARTENDER)
  bartender.root.position.set(spots.bar.x, 0, spots.bar.z - 0.6)
  bartender.body.position.y = 0.3
  const dj = avatar(models, DJ)
  dj.root.position.set(spots.dj.x, 0.95, spots.dj.z - 0.5)
  dj.root.scale.setScalar(1.25)
  dj.bulb.color.set('#ffd9a0')
  const sign = sprite('ROOFTOP BAR', 0.35, { color: '#0b1020', bg: '#ff4fa3', px: 48 })
  sign.position.set(spots.bar.x, 2.9, spots.bar.z - 1.2)
  group.add(act(booth.root, { kind: 'dj' }, pickables), act(dj.root, { kind: 'dj' }, pickables), act(bar.root, { kind: 'bar' }, pickables), act(bartender.root, { kind: 'bar' }, pickables), sign, ...stringLights(p))
  return { group, party: { neon: [booth.material<THREE.MeshBasicMaterial>('neon_glow_own')!, barStrip], dj } }
}

/**
 * Every dance floor on the roof: one plinth and one tile mesh for them all, each tile flashing between the colours of
 * its floor (its project's, lit and pale; the party's on the shared floor), and a sign over each floor's back edge.
 */
export type DanceFloors = { group: THREE.Group; tiles: THREE.InstancedMesh; colors: THREE.Color[][] }

export function buildDanceFloors(floors: DanceFloor[]): DanceFloors {
  const group = new THREE.Group()
  const count = floors.reduce((n, f) => n + f.columns * f.rows, 0)
  const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(DANCE_TILE - 0.06, TILE, DANCE_TILE - 0.06), new THREE.MeshBasicMaterial({ toneMapped: false }), count)
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

/** The neon breathes and the DJ bobs and scratches, on the beat. */
export function animateParty(party: Party, beat: number) {
  const pulse = 0.6 + 0.4 * Math.pow(1 - (beat % 1), 2)
  party.neon[0].color.copy(PARTY_COLORS[Math.floor(beat / 4) % PARTY_COLORS.length]).multiplyScalar(pulse)
  party.neon[1].color.set('#ff4fa3').multiplyScalar(0.7 + 0.3 * pulse)
  const { dj } = party
  dj.body.position.y = Math.pow(1 - (beat % 1), 3) * 0.05
  dj.body.rotation.y = Math.sin(beat * Math.PI * 0.25) * 0.2
  dj.arms[0].rotation.x = -1.3 + Math.sin(beat * Math.PI * 4) * 0.25
  dj.arms[1].rotation.x = Math.floor(beat / 4) % 2 ? -2.4 + Math.sin(beat * Math.PI) * 0.3 : -1.2
}

/** A worker at the party, in its own color with its callsign over its head, and a beer in its hand while at the bar. */
export type Guest = { card: Card; group: THREE.Group; body: THREE.Object3D; arms: THREE.Object3D[]; mug: THREE.Object3D; phase: number }

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

export function makeGuest(card: Card, models: Models): Guest {
  const w = avatar(models, lookOf(card.id))
  w.bulb.color.copy(PARTY_COLORS[card.id.length % PARTY_COLORS.length])
  const group = new THREE.Group()
  group.add(w.root)
  const tag = sprite(card.callsign, 0.2, { color: WORLD.panel, bg: WORLD.enamel, px: 40 })
  tag.position.y = 1.7
  group.add(tag)
  const beer = mug()
  w.hand.add(beer)
  act(group, { kind: 'guest', id: card.id }, [])
  return { card, group, body: w.body, arms: w.arms, mug: beer, phase: (card.startedAt % 997) / 997 }
}

/** A guest where its schedule has it at `y`'s level, posed for what it does there: walking, dancing, drinking or mingling. */
export function placeGuest(g: Guest, at: GuestPlace, y: number, beat: number, t: number) {
  g.group.position.set(at.x, y + at.y, at.z)
  g.group.rotation.y = at.heading
  g.mug.visible = at.pose === 'drink'
  if (at.pose === 'walk') walkPose(g.body, g.arms, t)
  else if (at.pose === 'dance') dance(g, beat)
  else if (at.pose === 'drink') drink(g, at.since)
  else mingle(g, at.since)
}

/** Bounces on the beat, sways, and throws its arms up every other bar. */
function dance(g: Guest, at: number) {
  const beat = at + g.phase
  const bounce = Math.abs(Math.sin(beat * Math.PI))
  g.body.position.y = bounce * 0.18
  g.body.rotation.set(0, Math.sin(beat * Math.PI * 0.25) * 0.5, Math.sin(beat * Math.PI) * 0.12)
  const hands = Math.floor(beat / 8) % 2 === 0
  g.arms.forEach((a, i) => (a.rotation.x = hands ? -2.2 + Math.sin(beat * Math.PI + i * Math.PI) * 0.4 : Math.sin(beat * Math.PI + i) * 0.6))
}

/** How often a guest at the bar sips, give or take its own phase, and how long a sip takes. */
const SIP = { every: 5, takes: 1.4 }

/** Sits at the counter, shifting its weight, and every few seconds lifts its beer for a sip. */
function drink(g: Guest, since: number) {
  const cycle = (since + g.phase * SIP.every) % (SIP.every + g.phase * 2)
  const lift = cycle < SIP.takes ? Math.sin((cycle / SIP.takes) * Math.PI) : 0
  g.body.position.y = 0
  g.body.rotation.set(0.06 - lift * 0.14, 0, Math.sin(since * 0.8 + g.phase * 6) * 0.04)
  g.arms[0].rotation.x = -0.3
  g.arms[1].rotation.x = 0.15 - lift * 1.6
}

/** Chats: turns a little to the others and talks with a hand now and then. */
function mingle(g: Guest, since: number) {
  const talk = Math.max(0, Math.sin(since * 0.9 + g.phase * 7))
  g.body.position.y = 0
  g.body.rotation.set(0, Math.sin(since * 0.4 + g.phase * 5) * 0.25, 0)
  g.arms.forEach((a, i) => (a.rotation.x = i === 1 ? -0.4 - talk * 0.8 + Math.sin(since * 6) * 0.15 * talk : 0))
}
