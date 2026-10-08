import * as THREE from 'three'
import { type } from '../../../src/shared/design.ts'
import { act } from './acts.ts'
import { WORLD } from './cards.ts'
import { CORK, NOTE, type CorkSlot } from './layout.ts'
import { block, plate, toon } from './toon.ts'

/** A floor's corkboard (src/layout.ts places it) and the drafts pinned on it as paper notes, each titled. */

export const NOTE_PX = { width: 256, height: 190 }
const LINES = 3

/** The board in its frame with its sign, built with the building; the notes come and go on their own. */
export function buildCork(slot: CorkSlot, project: string, label: string, tint: string, pickables: THREE.Object3D[]) {
  const g = new THREE.Group()
  const z = slot.z
  g.add(block(CORK.width + 0.16, CORK.height + 0.16, 0.06, toon('#5a4330'), slot.x, CORK.bottom - 0.08, z))
  const cork = block(CORK.width, CORK.height, 0.03, toon('#b8875a'), slot.x, CORK.bottom, z + 0.03)
  g.add(act(cork, { kind: 'cork', project }, pickables))
  const sign = plate(label.toUpperCase(), CORK.header * 0.6, { color: tint, bg: WORLD.enamel, px: 48 })
  sign.position.set(slot.x, CORK.bottom + CORK.height - CORK.header / 2, z + 0.05)
  g.add(sign)
  return g
}

function wrap(g: CanvasRenderingContext2D, text: string, width: number) {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word
    if (g.measureText(next).width <= width || !line) line = next
    else (lines.push(line), (line = word))
  }
  if (line) lines.push(line)
  if (lines.length <= LINES) return lines
  return [...lines.slice(0, LINES - 1), `${lines[LINES - 1]}…`]
}

/** A note's face: its title in ink on paper, under a pin in the floor's colour, its tag at the foot. */
export function noteTexture(title: string, tag: string, tint: string) {
  const cv = Object.assign(document.createElement('canvas'), NOTE_PX)
  const g = cv.getContext('2d')!
  g.fillStyle = WORLD.panel
  g.fillRect(0, 0, cv.width, cv.height)
  g.fillStyle = WORLD.line
  g.fillRect(0, cv.height - 10, cv.width, 10)
  g.fillStyle = tint
  g.beginPath()
  g.arc(cv.width / 2, 20, 11, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = WORLD.ink
  g.font = `700 28px ${type.ui}`
  g.textBaseline = 'top'
  wrap(g, title, cv.width - 28).forEach((l, i) => g.fillText(l, 14, 42 + i * 34))
  g.fillStyle = WORLD.muted
  g.font = `700 22px ${type.mono}`
  g.textBaseline = 'alphabetic'
  g.fillText(tag, 14, cv.height - 22, cv.width - 28)
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/** A draft pinned on the board: the title and tint it was drawn with, so a new one draws it anew. */
export type Note = { group: THREE.Group; title: string; tint: string }

const tilt = (id: string) => {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return ((h % 100) / 100 - 0.5) * 0.12
}

export function makeNote(project: string, id: string, title: string, tag: string, tint: string): Note {
  const group = new THREE.Group()
  const face = new THREE.Mesh(new THREE.PlaneGeometry(NOTE.width, NOTE.height), new THREE.MeshBasicMaterial({ map: noteTexture(title, tag, tint), toneMapped: false }))
  face.rotation.z = tilt(id)
  group.add(face)
  act(group, { kind: 'note', project, id }, [])
  return { group, title, tint }
}
