import * as THREE from 'three'
import { type } from '../../../src/shared/design.ts'
import { LABEL_HEIGHT, type Label } from './scene.ts'

/**
 * Every label of a scene drawn into a few atlas pages and merged into one mesh per page: hundreds of labels cost a
 * couple of draw calls. The first line is set in the display face, the rest in mono.
 */

const PAGE = 4096
/** Pixels per line of text: a label's `height` in meters maps onto this. */
const LINE = 56
const PAD = 14
const INK = '#1f2628', PAPER = '#faf6ee'

type Laid = { label: Label; w: number; h: number; x: number; y: number; page: number }

const fontOf = (line: number) => (line === 0 ? `800 ${LINE * 0.8}px ${type.display}` : `400 ${LINE * 0.62}px ${type.mono}`)

function measure(labels: Label[]): Laid[] {
  const g = document.createElement('canvas').getContext('2d')!
  return labels.map((label) => {
    const lines = label.text.split('\n')
    const w = Math.ceil(Math.max(...lines.map((l, i) => ((g.font = fontOf(i)), g.measureText(l).width)))) + PAD * 2
    return { label, w: Math.min(w, PAGE), h: lines.length * LINE + PAD, x: 0, y: 0, page: 0 }
  })
}

/** Shelf packing: rows of labels left to right, a new page when one fills. */
function pack(laid: Laid[]) {
  let x = 0, y = 0, row = 0, page = 0
  for (const l of [...laid].sort((a, b) => b.h - a.h)) {
    if (x + l.w > PAGE) (x = 0, (y += row + 2), (row = 0))
    if (y + l.h > PAGE) (x = 0, (y = 0), (row = 0), page++)
    Object.assign(l, { x, y, page })
    x += l.w + 2
    row = Math.max(row, l.h)
  }
  return page + 1
}

function paint(laid: Laid[], page: number) {
  const mine = laid.filter((l) => l.page === page)
  const height = Math.max(...mine.map((l) => l.y + l.h))
  const cv = Object.assign(document.createElement('canvas'), { width: PAGE, height: THREE.MathUtils.ceilPowerOfTwo(height) })
  const g = cv.getContext('2d')!
  g.textBaseline = 'middle'
  for (const { label, x, y, w, h } of mine) {
    g.fillStyle = label.bg ?? PAPER
    g.fillRect(x, y, w, h)
    label.text.split('\n').forEach((line, i) => {
      g.font = fontOf(i)
      g.fillStyle = i === 0 ? (label.color ?? INK) : '#5c6466'
      g.fillText(line, x + PAD, y + PAD / 2 + LINE * (i + 0.5))
    })
  }
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return { texture: t, height: cv.height }
}

/** The quad of one label: bottom edge centred on `at`, leaned back by `tilt`, turned about +Y. */
function quad(l: Laid, texHeight: number, pos: number[], uv: number[], index: number[]) {
  const m = (l.label.height ?? LABEL_HEIGHT) / LINE
  const w = l.w * m, h = l.h * m
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...l.label.at),
    new THREE.Quaternion().setFromEuler(new THREE.Euler((-(l.label.tilt ?? 0) * Math.PI) / 180, ((l.label.turn ?? 0) * Math.PI) / 180, 0, 'YXZ')),
    new THREE.Vector3(1, 1, 1),
  )
  const base = pos.length / 3
  const v = new THREE.Vector3()
  for (const [cx, cy, u, t] of [[-w / 2, 0, l.x, l.y + l.h], [w / 2, 0, l.x + l.w, l.y + l.h], [w / 2, h, l.x + l.w, l.y], [-w / 2, h, l.x, l.y]]) {
    v.set(cx, cy, 0).applyMatrix4(matrix)
    pos.push(v.x, v.y, v.z)
    uv.push(u / PAGE, 1 - t / texHeight)
  }
  index.push(base, base + 1, base + 2, base, base + 2, base + 3)
}

export function drawLabels(labels: Label[]): THREE.Group {
  const group = new THREE.Group()
  if (!labels.length) return group
  const laid = measure(labels)
  const pages = pack(laid)
  for (let p = 0; p < pages; p++) {
    const { texture, height } = paint(laid, p)
    const pos: number[] = [], uv: number[] = [], index: number[] = []
    for (const l of laid.filter((l) => l.page === p)) quad(l, height, pos, uv, index)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    geo.setIndex(index)
    group.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })))
  }
  return group
}
