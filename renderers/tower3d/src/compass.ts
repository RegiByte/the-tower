import * as THREE from 'three'
import { esc } from './cards.ts'

/** An arrow on the screen's edge toward something out of view: where it sits in CSS px, and its turn in radians. */
export type Pointer = { id: string; x: number; y: number; angle: number }

/** How far arrows keep from the screen's edge, clear of the HUD along the bottom. */
const MARGIN = 44

const view = new THREE.Vector3()
const ndc = new THREE.Vector3()

/**
 * For each point the camera doesn't see, the arrow toward it on a `width` × `height` screen. A point in front points
 * where it projects; a point behind points the way to turn to it.
 */
export function pointers(camera: THREE.Camera, targets: { id: string; at: THREE.Vector3 }[], width: number, height: number): Pointer[] {
  const hw = width / 2 - MARGIN
  const hh = height / 2 - MARGIN
  const onEdge = targets.flatMap(({ id, at }): Pointer[] => {
    view.copy(at).applyMatrix4(camera.matrixWorldInverse)
    ndc.copy(at).project(camera)
    const ahead = view.z < 0
    if (ahead && Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1) return []
    const [dx, dy] = ahead ? [ndc.x * hw, ndc.y * hh] : Math.hypot(view.x, view.y) < 1e-3 ? [0, -1] : [view.x, view.y]
    const t = Math.min(hw / Math.abs(dx || 1e-9), hh / Math.abs(dy || 1e-9))
    return [{ id, x: width / 2 + dx * t, y: height / 2 - dy * t, angle: Math.atan2(-dy, dx) }]
  })
  return onEdge.reduce<Pointer[]>((placed, p) => [...placed, spread(p, placed, width, height)], [])
}

/** Arrows closer than this would hide each other's labels. */
const APART = 40

/** `p` moved along its edge until it keeps `APART` from every arrow placed before it. */
function spread(p: Pointer, placed: Pointer[], width: number, height: number): Pointer {
  const side = Math.abs(p.x - MARGIN) < 1 || Math.abs(p.x - (width - MARGIN)) < 1
  const crowded = (q: Pointer) => placed.some((o) => Math.hypot(o.x - q.x, o.y - q.y) < APART)
  let q = p
  for (let i = 0; crowded(q) && i < 20; i++) q = side ? { ...q, y: Math.min(height - MARGIN, q.y + APART) } : { ...q, x: Math.min(width - MARGIN, q.x + APART) }
  return q
}

/** Draws the arrows into `el`, each with what it points at: `labelOf` its text, `colorOf` its colour. */
export function drawCompass(el: HTMLElement, ps: Pointer[], labelOf: (id: string) => string, colorOf: (id: string) => string) {
  const html = ps
    .map((p) => `<div class="pointer" style="left:${p.x.toFixed(0)}px;top:${p.y.toFixed(0)}px;--c:${colorOf(p.id)}"><i style="transform:rotate(${p.angle.toFixed(2)}rad)"></i><span>${esc(labelOf(p.id))}</span></div>`)
    .join('')
  if (el.innerHTML !== html) el.innerHTML = html
}
