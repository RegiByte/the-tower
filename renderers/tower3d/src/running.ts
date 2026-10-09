import * as THREE from 'three'
import { type } from '../../../src/shared/design.ts'
import { act } from './acts.ts'
import { hueOf } from './avatar.ts'
import type { Card, Floor } from './api.ts'
import { WORLD, can, commandName, leftoversOf, tidyLine } from './cards.ts'
import { runningSpot, type Level, type Plan } from './layout.ts'
import { tintOf } from './palette.ts'
import { fitted } from './sign.ts'
import { mesh } from './toon.ts'

type FloorLevel = Extract<Level, { kind: 'floor' }>

/** The board's measures in metres: its height, how far its base is off the floor, its header and a row. */
const BOARD = { height: 2.3, bottom: 0.65, header: 0.36, row: 0.2, pad: 0.12 }
/** Pixels per metre on the board's canvas. */
const PX = 360
const ROWS = Math.floor((BOARD.height - BOARD.header - BOARD.pad) / BOARD.row)

export type Running = { group: THREE.Group; key: string }

/** A row of the board: a process a worker left running, Tidy's to reap or not, or a hire done with its purpose, Tidy's to kill. */
type Row = { card: Card } & ({ resource: Card['resources'][number]; tidy: boolean } | { since: number })

const rowsOf = (f: Floor): Row[] => {
  const reaps = new Set(f.tidy.prune.flatMap((p) => (p.t === 'reap' ? [`${p.id} ${p.pid}`] : [])))
  return [
    ...leftoversOf(f).map(({ card, resource }) => ({ card, resource, tidy: reaps.has(`${card.id} ${resource.pid}`) })),
    ...f.tidy.prune.flatMap((p) => (p.t === 'kill' ? [{ card: f.cards.find((c) => c.id === p.id)!, since: p.since }] : [])),
  ]
}

/** What the board shows: rebuilt only when this changes. */
export const runningKey = (p: Plan, level: FloorLevel) =>
  JSON.stringify([
    runningSpot(p), level.y, tintOf(level.floor), can(level.floor, 'tidy') && tidyLine(level.floor.tidy),
    rowsOf(level.floor).map((row) => ('resource' in row ? [row.card.id, row.card.callsign, row.resource.pid, row.resource.ports, row.resource.orphan, row.resource.command, row.tidy] : [row.card.id, row.card.callsign, row.since])),
  ])

const clock = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

/**
 * A floor's "Running" board: every process its workers left running, a row each (the worker, pid, ports, orphaned or
 * not, the command), each row its own `leftover` act, then the hires whose work has landed, Tidy's to kill, each its own
 * `landed` act. What Tidy
 * would end is edged in amber, and its head, Tidy's line, is the floor's `tidy` act. More than fit end in a row
 * counting the rest, which the floor panel lists.
 */
export function buildRunning(p: Plan, level: FloorLevel): Running {
  const spot = runningSpot(p)
  const all = rowsOf(level.floor)
  const tidy = can(level.floor, 'tidy')
  const shown = all.length > ROWS ? all.slice(0, ROWS - 1) : all
  const W = Math.round(spot.width * PX)
  const H = Math.round(BOARD.height * PX)
  const cv = Object.assign(document.createElement('canvas'), { width: W, height: H })
  const g = cv.getContext('2d')!
  const m = (metres: number) => metres * PX
  g.fillStyle = WORLD.panel
  g.beginPath()
  g.roundRect(0, 0, W, H, m(0.04))
  g.fill()
  g.fillStyle = WORLD.enamel
  g.fillRect(0, 0, W, m(BOARD.header))
  g.fillStyle = tintOf(level.floor)
  g.fillRect(0, 0, m(0.05), H)
  g.textBaseline = 'middle'
  g.fillStyle = WORLD.panel
  g.font = `900 ${m(0.17)}px ${type.display}`
  g.letterSpacing = `${m(0.17) * 0.08}px`
  g.fillText('RUNNING', m(0.18), m(BOARD.header / 2))
  g.font = `700 ${m(0.1)}px ${type.ui}`
  g.letterSpacing = '0px'
  g.textAlign = 'right'
  const head = tidy ? `${tidyLine(level.floor.tidy)} · held Z` : all.length ? `${all.length} left running · held Z ends one` : 'nothing left running'
  g.fillText(fitted(g, head, W - m(1.3)), W - m(0.14), m(BOARD.header / 2))
  g.textAlign = 'left'

  const group = new THREE.Group()
  const rowY = (i: number) => BOARD.header + BOARD.pad / 2 + i * BOARD.row
  const strip = (top: number, height: number) =>
    mesh(new THREE.PlaneGeometry(spot.width - 0.1, height), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }), 0.05, BOARD.bottom + BOARD.height - top - height / 2, 0.01)
  if (tidy) group.add(act(strip(0, BOARD.header), { kind: 'tidy', project: level.floor.id }, []))
  shown.forEach((row, i) => {
    const { card } = row
    const y = m(rowY(i) + BOARD.row / 2)
    if (i % 2) {
      g.fillStyle = WORLD.panel2
      g.fillRect(m(0.05), m(rowY(i)), W - m(0.05), m(BOARD.row))
    }
    if (!('resource' in row) || row.tidy) {
      g.fillStyle = WORLD.working
      g.fillRect(m(0.05), m(rowY(i)), m(0.05), m(BOARD.row))
    }
    g.fillStyle = `#${hueOf(card.id).getHexString()}`
    g.beginPath()
    g.arc(m(0.2), y, m(0.045), 0, Math.PI * 2)
    g.fill()
    g.fillStyle = WORLD.ink
    g.font = `800 ${m(0.095)}px ${type.display}`
    g.fillText(fitted(g, card.callsign, m(1.0)), m(0.3), y)
    g.font = `700 ${m(0.09)}px ${type.mono}`
    if (!('resource' in row)) {
      g.fillText(`LANDED · QUIET SINCE ${clock(row.since)}`, m(1.35), y)
      g.fillStyle = WORLD.muted
      g.font = `400 ${m(0.085)}px ${type.ui}`
      g.fillText(fitted(g, 'kill: resumable, its next turn re-reads the conversation uncached', W - m(3.35) - m(0.12)), m(3.35), y)
      group.add(act(strip(rowY(i), BOARD.row), { kind: 'landed', project: level.floor.id, id: card.id }, []))
      return
    }
    const r = row.resource
    g.fillText(String(r.pid), m(1.35), y)
    const ports = r.ports.map((port) => `:${port}`).join(' ')
    g.fillStyle = WORLD.accent
    g.fillText(fitted(g, ports, m(0.75)), m(1.95), y)
    if (r.orphan) {
      g.fillStyle = WORLD.broken
      g.font = `800 ${m(0.075)}px ${type.display}`
      g.fillText('ORPHAN', m(2.75), y)
    }
    g.fillStyle = WORLD.muted
    g.font = `400 ${m(0.085)}px ${type.mono}`
    g.fillText(fitted(g, commandName(r.command), W - m(3.35) - m(0.12)), m(3.35), y)
    group.add(act(strip(rowY(i), BOARD.row), { kind: 'leftover', id: card.id, pid: r.pid }, []))
  })
  if (shown.length < all.length) {
    g.fillStyle = WORLD.faint
    g.font = `700 ${m(0.09)}px ${type.ui}`
    g.fillText(`and ${all.length - shown.length} more: the console lists every one`, m(0.3), m(rowY(shown.length) + BOARD.row / 2))
  }

  const texture = new THREE.CanvasTexture(cv)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  const face = mesh(new THREE.PlaneGeometry(spot.width, BOARD.height), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }), 0, BOARD.bottom + BOARD.height / 2, 0)
  group.add(face)
  group.position.set(spot.x, level.y, spot.z)
  group.rotation.y = Math.PI / 2
  return { group, key: runningKey(p, level) }
}
