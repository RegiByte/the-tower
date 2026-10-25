import * as THREE from 'three'
import { type } from '../../../src/shared/design.ts'
import { act } from './acts.ts'
import { hueOf } from './avatar.ts'
import type { AddedTidy } from '../../../src/shared/extensions.ts'
import type { Card, Floor } from './api.ts'
import { WORLD, can, commandName, leftoversOf, tidyLine } from './cards.ts'
import { runningSpot, type Level, type Plan } from './layout.ts'
import { tintOf } from './palette.ts'
import { fitted } from './sign.ts'
import { mesh } from './toon.ts'

type FloorLevel = Extract<Level, { kind: 'floor' }>

/**
 * The board's measures in metres: its height, how far its base is off the floor, its header (the title over two lines
 * of what Tidy would do), a row (two lines: who and where, then the command) and a line's height.
 */
const BOARD = { height: 2.3, bottom: 0.65, header: 0.62, row: 0.3, pad: 0.12, line: 0.13 }
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
export const runningKey = (p: Plan, level: FloorLevel, added: AddedTidy[]) =>
  JSON.stringify([
    runningSpot(p), level.y, tintOf(level.floor), can(level.floor, 'tidy') && tidyLine(level.floor.tidy, added),
    rowsOf(level.floor).map((row) => ('resource' in row ? [row.card.id, row.card.callsign, row.resource.pid, row.resource.ports, row.resource.orphan, row.resource.command, row.tidy] : [row.card.id, row.card.callsign, row.since])),
  ])

/** `text` broken at spaces into at most `lines` lines that fit `width`, the last cut short if it must be. */
export function wrapped(g: CanvasRenderingContext2D, text: string, width: number, lines: number) {
  const out: string[] = []
  for (const word of text.split(' ')) {
    const last = out.at(-1)
    if (last !== undefined && g.measureText(`${last} ${word}`).width <= width) out[out.length - 1] = `${last} ${word}`
    else out.push(word)
  }
  return out.length > lines ? [...out.slice(0, lines - 1), fitted(g, out.slice(lines - 1).join(' '), width)] : out
}

const clock = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

/**
 * A floor's "Running" board: every process its workers left running, a row each (the worker, pid, ports, orphaned or
 * not, the command), each row its own `leftover` act, then the hires whose work has landed, Tidy's to kill, each its own
 * `landed` act. What Tidy
 * would end is edged in amber, and its head, Tidy's line, is the floor's `tidy` act. More than fit end in a row
 * counting the rest, which the floor panel lists.
 */
/** `added`: the extensions' tidy entries on the floor, counted in the head's line. */
export function buildRunning(p: Plan, level: FloorLevel, added: AddedTidy[]): Running {
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
  g.fillText('RUNNING', m(0.18), m(0.17))
  g.font = `700 ${m(0.085)}px ${type.ui}`
  g.letterSpacing = '0px'
  const head = tidy ? `${tidyLine(level.floor.tidy, added)} · held Z` : all.length ? `${all.length} left running · held Z ends one` : 'nothing left running'
  wrapped(g, head, W - m(0.32), 2).forEach((line, i) => g.fillText(line, m(0.18), m(0.36 + i * BOARD.line)))

  const group = new THREE.Group()
  const rowY = (i: number) => BOARD.header + BOARD.pad / 2 + i * BOARD.row
  const strip = (top: number, height: number) =>
    mesh(new THREE.PlaneGeometry(spot.width - 0.1, height), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }), 0.05, BOARD.bottom + BOARD.height - top - height / 2, 0.01)
  if (tidy) group.add(act(strip(0, BOARD.header), { kind: 'tidy', project: level.floor.id }, []))
  const left = m(1.25)
  shown.forEach((row, i) => {
    const { card } = row
    const y = m(rowY(i) + BOARD.row / 2 - BOARD.line / 2)
    const below = m(rowY(i) + BOARD.row / 2 + BOARD.line / 2)
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
    g.fillText(fitted(g, card.callsign, m(0.9)), m(0.3), y)
    g.font = `700 ${m(0.09)}px ${type.mono}`
    if (!('resource' in row)) {
      g.fillText(fitted(g, `LANDED · QUIET SINCE ${clock(row.since)}`, W - left - m(0.1)), left, y)
      g.fillStyle = WORLD.muted
      g.font = `400 ${m(0.08)}px ${type.ui}`
      g.fillText(fitted(g, 'kill: resumable, its next turn re-reads the conversation uncached', W - m(0.4)), m(0.3), below)
      group.add(act(strip(rowY(i), BOARD.row), { kind: 'landed', project: level.floor.id, id: card.id }, []))
      return
    }
    const r = row.resource
    g.fillText(String(r.pid), left, y)
    const ports = r.ports.map((port) => `:${port}`).join(' ')
    g.fillStyle = WORLD.accent
    g.fillText(fitted(g, ports, W - left - m(0.55)), left + m(0.45), y)
    let command = m(0.3)
    if (r.orphan) {
      g.fillStyle = WORLD.broken
      g.font = `800 ${m(0.075)}px ${type.display}`
      g.fillText('ORPHAN', command, below)
      command += g.measureText('ORPHAN').width + m(0.08)
    }
    g.fillStyle = WORLD.muted
    g.font = `400 ${m(0.085)}px ${type.mono}`
    g.fillText(fitted(g, commandName(r.command), W - command - m(0.1)), command, below)
    group.add(act(strip(rowY(i), BOARD.row), { kind: 'leftover', id: card.id, pid: r.pid }, []))
  })
  if (shown.length < all.length) {
    g.fillStyle = WORLD.faint
    g.font = `700 ${m(0.09)}px ${type.ui}`
    g.fillText(fitted(g, `and ${all.length - shown.length} more: the console lists every one`, W - m(0.4)), m(0.3), m(rowY(shown.length) + BOARD.row / 2))
  }

  const texture = new THREE.CanvasTexture(cv)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  const face = mesh(new THREE.PlaneGeometry(spot.width, BOARD.height), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }), 0, BOARD.bottom + BOARD.height / 2, 0)
  group.add(face)
  group.position.set(spot.x, level.y, spot.z)
  group.rotation.y = Math.PI / 2
  return { group, key: runningKey(p, level, added) }
}
