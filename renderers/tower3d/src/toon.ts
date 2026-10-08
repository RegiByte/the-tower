import * as THREE from 'three'
import { type } from '../../../src/shared/design.ts'
import { WORLD } from './cards.ts'

/** A three-step ramp: MeshToonMaterial's flat cartoon banding. */
const RAMP = (() => {
  const t = new THREE.DataTexture(new Uint8Array([95, 95, 95, 255, 180, 180, 180, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat)
  t.minFilter = t.magFilter = THREE.NearestFilter
  t.needsUpdate = true
  return t
})()

const shared = new Map<string, THREE.MeshToonMaterial>()

/** A toon material shared by everything of its color: never animate or dispose one. */
export function toon(color: THREE.ColorRepresentation, emissive?: THREE.ColorRepresentation, emissiveIntensity = 1) {
  const key = `${new THREE.Color(color).getHexString()}|${emissive === undefined ? '' : new THREE.Color(emissive).getHexString()}|${emissiveIntensity}`
  let m = shared.get(key)
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: RAMP })
    if (emissive !== undefined) (m.emissive.set(emissive), (m.emissiveIntensity = emissiveIntensity))
    m.userData.shared = true
    shared.set(key, m)
  }
  return m
}

/** A toon material of its own, for something whose color changes. */
export const toonOwn = (color: THREE.ColorRepresentation) => new THREE.MeshToonMaterial({ color, gradientMap: RAMP })

/** A toon material over a texture: a KayKit pack's atlas, shared by every model of the pack. */
export const toonMapped = (map: THREE.Texture) => new THREE.MeshToonMaterial({ map, gradientMap: RAMP })

/** Lit by nothing: screens, lamps, neon. */
export const glowing = (color: THREE.ColorRepresentation) => new THREE.MeshBasicMaterial({ color, toneMapped: false })

export function mesh<G extends THREE.BufferGeometry, M extends THREE.Material>(geo: G, mat: M, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat)
  m.position.set(x, y, z)
  return m
}

/** A box resting its base at y. */
export const block = (w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y + h / 2, z)

/** `tracking` spaces the letters, in ems: display caps take .06. */
type TextStyle = { color?: string; bg?: string; px?: number; weight?: number; face?: 'display' | 'ui'; shape?: 'pill' | 'card'; tracking?: number }

const FACES = ['800 56px Overpass', '900 56px Overpass', '400 40px "Atkinson Hyperlegible"', '700 40px "Atkinson Hyperlegible"', '400 13px "JetBrains Mono"', '700 13px "JetBrains Mono"']

/** A canvas draws in whatever face is loaded when it draws: wait for the design's faces before the first label or terminal. */
export const loadFaces = () => Promise.all(FACES.map((f) => document.fonts.load(f)))

/** Text drawn on a canvas: on a pill, or a card with small corners, when `bg` is given. */
function textCanvas(text: string, { color = WORLD.ink, bg, px = 56, weight = 800, face = 'display', shape = 'pill', tracking = 0 }: TextStyle) {
  const font = `${weight} ${px}px ${type[face]}`
  const cv = document.createElement('canvas')
  const g = cv.getContext('2d')!
  g.font = font
  g.letterSpacing = `${px * tracking}px`
  const lines = text.split('\n')
  const w = Math.ceil(Math.max(...lines.map((l) => g.measureText(l).width))) + px
  const h = Math.ceil(px * 1.35 * lines.length + px * 0.35)
  cv.width = w
  cv.height = h
  if (bg) {
    g.fillStyle = bg
    g.beginPath()
    g.roundRect(0, 0, w, h, shape === 'pill' ? Math.min(h / 2, px * 0.7) : px * 0.22)
    g.fill()
  }
  g.font = font
  g.letterSpacing = `${px * tracking}px`
  g.fillStyle = color
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  lines.forEach((l, i) => g.fillText(l, w / 2, px * 0.18 + px * 1.35 * (i + 0.5) + px * 0.05))
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return { tex, aspect: w / h }
}

/** A label that always faces the camera, `height` world units tall. */
export function sprite(text: string, height: number, style: TextStyle = {}) {
  const { tex, aspect } = textCanvas(text, style)
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }))
  s.scale.set(height * aspect, height, 1)
  s.renderOrder = 10
  return s
}

/** A flat sign facing +z, for walls: `height` world units tall. */
export function plate(text: string, height: number, style: TextStyle = {}) {
  const { tex, aspect } = textCanvas(text, style)
  const m = new THREE.Mesh(new THREE.PlaneGeometry(height * aspect, height), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }))
  return m
}

/** Frees what a subtree owns on the GPU, leaving shared geometries and materials, and the textures `keep` names, alone. */
export function dispose(root: THREE.Object3D, keep: (t: THREE.Texture) => boolean = () => false) {
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh || o instanceof THREE.Sprite || o instanceof THREE.Points)) return
    if (!(o instanceof THREE.Sprite) && !o.geometry.userData.shared) o.geometry.dispose()
    const mats: THREE.Material[] = Array.isArray(o.material) ? o.material : [o.material]
    for (const m of mats) {
      if (m.userData.shared) continue
      const map = (m as THREE.MeshBasicMaterial).map
      if (map && !keep(map)) map.dispose()
      m.dispose()
    }
  })
}
