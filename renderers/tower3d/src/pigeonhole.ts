import * as THREE from 'three'
import { type } from '../../../src/shared/design.ts'
import { act } from './acts.ts'
import { WORLD, workerIn } from './cards.ts'
import { PIGEONHOLE, type Level, type PigeonholeSlot } from './layout.ts'
import { tintOf } from './palette.ts'
import { fitted } from './sign.ts'
import { block, mesh, toon } from './toon.ts'

type FloorLevel = Extract<Level, { kind: 'floor' }>

/** Pixels per metre on the rack's labels. */
const PX = 360
const HEADER = 0.3
const LIP = 0.1
/** The most sheets a slot holds: past it, its label says how many. */
const SHEETS = 6

export type Pigeonhole = { group: THREE.Group; key: string }

/** What a slot says and how: its checkout, its notes, and how many are new to the worker on duty there. */
const slotsOf = (level: FloorLevel, slot: PigeonholeSlot) =>
  slot.threads.map((t) => {
    const worker = workerIn(level.floor, t.checkout)
    return { ...t, unseen: worker?.onDuty ? (worker.unseen ?? 0) : 0 }
  })

/** What the rack shows: rebuilt only when this changes. */
export const pigeonholeKey = (level: FloorLevel) =>
  level.pigeonhole ? JSON.stringify([level.pigeonhole.x, level.pigeonhole.z, level.y, tintOf(level.floor), level.pigeonhole.more, slotsOf(level, level.pigeonhole)]) : ''

/**
 * A floor's pigeonhole on the control room's outer wall: a wooden rack, a slot per checkout's review thread with a
 * sheet in it per note, its label below it (the checkout, how many notes, how many are new to its worker), each slot
 * its own `thread` act. Labels are one canvas over the rack's face.
 */
export function buildPigeonhole(level: FloorLevel, slot: PigeonholeSlot): Pigeonhole {
  const { columns, rows, cell, height, depth, bottom } = PIGEONHOLE
  const width = columns * cell
  const tall = rows * height
  const group = new THREE.Group()
  const wood = toon('#8d6b4c')
  const paper = toon('#f4f1ea')
  const board = 0.022
  group.add(block(width + board, tall + board, board, wood, 0, bottom - board / 2, -depth / 2))
  for (let r = 0; r <= rows; r++) group.add(block(width + board, board, depth, wood, 0, bottom + r * height - board / 2, 0))
  for (let c = 0; c <= columns; c++) group.add(block(board, tall, depth, wood, -width / 2 + c * cell, bottom, 0))

  const W = Math.round(width * PX)
  const H = Math.round((tall + HEADER) * PX)
  const cv = Object.assign(document.createElement('canvas'), { width: W, height: H })
  const g = cv.getContext('2d')!
  const m = (metres: number) => metres * PX
  g.fillStyle = WORLD.enamel
  g.beginPath()
  g.roundRect(0, 0, W, m(HEADER - 0.04), m(0.03))
  g.fill()
  g.fillStyle = tintOf(level.floor)
  g.fillRect(0, 0, m(0.05), m(HEADER - 0.04))
  g.textBaseline = 'middle'
  g.fillStyle = WORLD.panel
  g.font = `900 ${m(0.13)}px ${type.display}`
  g.letterSpacing = `${m(0.13) * 0.08}px`
  g.fillText('REVIEWS', m(0.14), m((HEADER - 0.04) / 2))
  g.letterSpacing = '0px'
  g.font = `700 ${m(0.075)}px ${type.ui}`
  g.textAlign = 'right'
  const total = slot.threads.length + slot.more
  g.fillText(total ? `${total} thread${total === 1 ? '' : 's'}${slot.more ? ` · ${slot.more} more in the console` : ''}` : 'no threads yet', W - m(0.1), m((HEADER - 0.04) / 2))
  g.textAlign = 'left'

  slotsOf(level, slot).forEach((t, i) => {
    const col = i % columns
    const row = Math.floor(i / columns)
    const x = -width / 2 + (col + 0.5) * cell
    const floorY = bottom + (rows - 1 - row) * height
    for (let k = 0; k < Math.min(t.messages, SHEETS); k++) {
      const sheet = block(cell - 0.12, height * 0.72, 0.006, paper, x + Math.sin(k * 2.1) * 0.012, floorY + 0.011, -depth / 2 + 0.05 + k * 0.03)
      sheet.rotation.x = -0.12 + Math.sin(k * 1.7) * 0.03
      group.add(sheet)
    }
    const lipY = HEADER + (row + 1) * height - LIP
    const fresh = t.unseen > 0
    g.fillStyle = fresh ? WORLD.needs : t.landed ? WORLD.panel2 : WORLD.panel
    g.fillRect(m(col * cell + 0.03), m(lipY), m(cell - 0.06), m(LIP - 0.012))
    g.fillStyle = fresh ? '#fff' : t.landed ? WORLD.faint : WORLD.ink
    g.font = `800 ${m(0.04)}px ${type.display}`
    g.fillText(fitted(g, t.checkout, m(cell - 0.1)), m(col * cell + 0.05), m(lipY + 0.028))
    g.font = `700 ${m(0.032)}px ${type.ui}`
    const note = `${t.messages} note${t.messages === 1 ? '' : 's'}${fresh ? ` · ${t.unseen} new` : t.landed ? ' · landed' : ''}`
    g.fillText(fitted(g, note, m(cell - 0.1)), m(col * cell + 0.05), m(lipY + 0.064))
    const pick = mesh(new THREE.BoxGeometry(cell - 0.02, height - 0.02, 0.02), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }), x, floorY + height / 2, depth / 2)
    group.add(act(pick, { kind: 'thread', project: level.floor.id, checkout: t.checkout }, []))
  })

  const texture = new THREE.CanvasTexture(cv)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  const face = mesh(new THREE.PlaneGeometry(width, tall + HEADER), new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false }), 0, bottom + (tall + HEADER) / 2 - board / 2, depth / 2 + 0.004)
  face.raycast = () => {}
  group.add(face)
  group.position.set(slot.x, level.y, slot.z)
  group.rotation.y = Math.PI / 2
  return { group, key: pigeonholeKey(level) }
}
