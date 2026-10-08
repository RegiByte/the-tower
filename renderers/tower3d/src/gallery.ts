import * as THREE from 'three'
import { type } from '../../../src/shared/design.ts'
import type { SessionRef } from './api.ts'
import { act } from './acts.ts'
import { hueOf } from './avatar.ts'
import { WORLD, ago, shownTitle } from './cards.ts'
import { wallNow } from './clock.ts'
import { PICTURE_ASPECT, type WallSlot } from './layout.ts'
import { imageOf, posterOf, type Shown } from './showing.ts'
import { block, plate, sprite, toon } from './toon.ts'

/**
 * A floor's shared wall (src/layout.ts places it) and the gallery on it: each showing a framed picture in its worker's
 * colour over a plaque. A picture is built at unit width and scaled to its place, so moving to another place is a
 * move and a scale. A new one flies in from where its worker held it up.
 */

const FRAME = 0.045
const PLAQUE = { width: 0.62, px: { width: 512, height: 120 }, gap: 0.05 }
/** How long a picture takes to reach a new place, and to fly in from a desk (seconds). */
const SHIFT = 0.9
const FLIGHT = 1.8

/** The partition, its skirting and cap, and the gallery's sign; the corkboard hangs on it on its own. */
export function buildWall(wall: WallSlot, facing: THREE.ColorRepresentation, tint: string) {
  const g = new THREE.Group()
  const width = wall.maxX - wall.minX
  const x = (wall.minX + wall.maxX) / 2
  const thick = (wall.face - wall.z) * 2
  g.add(block(width, wall.height, thick, toon(facing), x, 0, wall.z))
  g.add(block(width + 0.02, 0.12, thick + 0.02, toon('#20242e'), x, 0, wall.z))
  g.add(block(width + 0.06, 0.05, thick + 0.06, toon('#20242e'), x, wall.height, wall.z))
  const sign = plate('SHOWN TO YOU', 0.22, { color: tint, bg: WORLD.enamel, px: 48 })
  sign.position.set(wall.gallery.x, wall.height - 0.17, wall.face + 0.01)
  g.add(sign)
  return g
}

/** A plaque's face: who showed it and how long ago, over its title. */
function plaqueTexture(worker: SessionRef, s: Shown) {
  const cv = Object.assign(document.createElement('canvas'), PLAQUE.px)
  const g = cv.getContext('2d')!
  g.fillStyle = WORLD.panel
  g.fillRect(0, 0, cv.width, cv.height)
  g.fillStyle = WORLD.line
  g.fillRect(0, cv.height - 6, cv.width, 6)
  g.textBaseline = 'top'
  g.font = `800 34px ${type.display}`
  g.fillStyle = WORLD.ink
  g.fillText(worker.callsign, 18, 14)
  g.font = `400 26px ${type.ui}`
  g.fillStyle = WORLD.muted
  g.textAlign = 'end'
  g.fillText(`${ago(wallNow() - s.at)} ago`, cv.width - 18, 20)
  g.textAlign = 'start'
  g.font = `400 28px ${type.ui}`
  g.fillStyle = WORLD.ink
  let title = shownTitle(s)
  while (g.measureText(title).width > cv.width - 36 && title.length > 1) title = `${title.slice(0, -2)}…`
  g.fillText(title, 18, 64)
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

const plaqueTextOf = (s: Shown) => `${shownTitle(s)}|${ago(wallNow() - s.at)}`

/** Where a picture is going: its center in the world and its width, from `start` over `secs` (seconds). */
type Move = { from: THREE.Vector3; fromW: number; to: THREE.Vector3; toW: number; start: number; secs: number }

type Face = THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>

export type Picture = {
  group: THREE.Group
  worker: SessionRef
  shown: Shown
  frame: THREE.Mesh<THREE.BoxGeometry>
  face: Face
  plaque: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  plaqueText: string
  ribbon: THREE.Sprite
  move: Move
}

/** A showing in its frame, at unit width, standing for itself when aimed at. */
export function makePicture(worker: SessionRef, s: Shown): Picture {
  const group = new THREE.Group()
  const h = 1 / PICTURE_ASPECT
  const frame = block(1 + FRAME * 2, h + FRAME * 2, 0.05, toon(hueOf(worker.id)), 0, -h / 2 - FRAME, -0.03)
  const face: Face = new THREE.Mesh(new THREE.PlaneGeometry(1, h), new THREE.MeshBasicMaterial({ map: posterOf(worker, s), toneMapped: false }))
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(PLAQUE.width, (PLAQUE.width * PLAQUE.px.height) / PLAQUE.px.width), new THREE.MeshBasicMaterial({ map: plaqueTexture(worker, s), toneMapped: false }))
  const ribbon = sprite('NEW', 0.07, { color: '#fff', bg: WORLD.accent, px: 44 })
  group.add(frame, face, plaque, ribbon)
  act(group, { kind: 'picture', id: worker.id, target: s.target }, [])
  const at = new THREE.Vector3()
  const pic = { group, worker, shown: s, frame, face, plaque, plaqueText: plaqueTextOf(s), ribbon, move: { from: at, fromW: 1, to: at, toW: 1, start: 0, secs: 0 } }
  frameAround(pic, 1, h)
  return pic
}

/** The frame, plaque and ribbon around a face `w` by `h`, centred on the picture's place. */
function frameAround(pic: Picture, w: number, h: number) {
  pic.frame.geometry.dispose()
  pic.frame.geometry = new THREE.BoxGeometry(w + FRAME * 2, h + FRAME * 2, 0.05)
  pic.plaque.position.set(0, -h / 2 - FRAME - PLAQUE.gap - pic.plaque.geometry.parameters.height / 2, 0)
  pic.ribbon.position.set(w / 2 - 0.04, h / 2 + FRAME + 0.03, 0.02)
}

/** An image, once read, hangs bare at its own proportions, as large as its place allows. */
export function fitPicture(pic: Picture) {
  const image = imageOf(pic.worker, pic.shown)
  if (!image || pic.face.material.map === image) return
  const { width, height } = image.image as HTMLCanvasElement
  const w = Math.min(1, (1 / PICTURE_ASPECT) * (width / height))
  const h = (w * height) / width
  pic.face.geometry.dispose()
  pic.face.geometry = new THREE.PlaneGeometry(w, h)
  pic.face.material.map = image
  pic.face.material.needsUpdate = true
  frameAround(pic, w, h)
}

/** Redraws the plaque once its age reads differently, and shows the ribbon while you have yet to open it. */
export function dressPicture(pic: Picture, fresh: boolean) {
  pic.ribbon.visible = fresh
  const text = plaqueTextOf(pic.shown)
  if (text === pic.plaqueText) return
  pic.plaqueText = text
  pic.plaque.material.map!.dispose()
  pic.plaque.material.map = plaqueTexture(pic.worker, pic.shown)
  pic.plaque.material.needsUpdate = true
}

/** Sends a picture to its place: at once, sliding from where it is, or flying in from `from` once `delay` has passed. */
export function hang(pic: Picture, to: THREE.Vector3, w: number, t: number, how: 'now' | 'slide' | { from: THREE.Vector3; w: number; delay: number }) {
  const m = pic.move
  if (m.to.equals(to) && m.toW === w) return
  if (how === 'now') pic.move = { from: to, fromW: w, to, toW: w, start: t, secs: 0 }
  else if (how === 'slide') pic.move = { from: pic.group.position.clone(), fromW: pic.group.scale.x, to, toW: w, start: t, secs: SHIFT }
  else pic.move = { from: how.from, fromW: how.w, to, toW: w, start: t + how.delay, secs: FLIGHT }
  placePicture(pic, t)
}

/** Where the picture is along its move at `t`; hidden while it waits to fly in. */
export function placePicture(pic: Picture, t: number) {
  const m = pic.move
  const k = m.secs === 0 ? 1 : (t - m.start) / m.secs
  pic.group.visible = k >= 0
  const e = Math.max(0, Math.min(1, k))
  const smooth = e * e * (3 - 2 * e)
  pic.group.position.lerpVectors(m.from, m.to, smooth)
  pic.group.scale.setScalar(m.fromW + (m.toW - m.fromW) * smooth)
}
