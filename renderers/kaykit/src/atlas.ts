import * as THREE from 'three'
import { GLOW, type Pack } from './catalog.ts'
import type { Theme } from './scene.ts'

/**
 * A pack's atlas as a theme paints it. Every model of a pack samples one atlas, so a theme is a texture per pack: a
 * shipped alternate, then hue swaps that keep each pixel's own lightness, so the swatch gradients survive.
 */

export type Atlases = Map<string, HTMLImageElement>

export async function loadAtlases(base: string, packs: Record<Pack, { atlases: string[] }>): Promise<Atlases> {
  const entries = Object.entries(packs).flatMap(([pack, info]) => info.atlases.map((name) => `${pack}/${name}`))
  const images = await Promise.all(entries.map(async (key) => {
    const img = new Image()
    img.src = `${base}/atlas/${key}.png`
    await img.decode()
    return [key, img] as const
  }))
  return new Map(images)
}

const textures = new Map<string, THREE.Texture>()

const finish = (t: THREE.Texture) => Object.assign(t, { colorSpace: THREE.SRGBColorSpace, flipY: false, anisotropy: 4 })

function canvasOf(img: HTMLImageElement) {
  const cv = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height })
  const g = cv.getContext('2d', { willReadFrequently: true })!
  g.drawImage(img, 0, 0)
  return { cv, g }
}

function recolor(img: HTMLImageElement, swaps: NonNullable<Theme['swaps']>[Pack] & {}) {
  const { cv, g } = canvasOf(img)
  const data = g.getImageData(0, 0, cv.width, cv.height)
  const hsl = swaps.map(({ from, to, tol = 14 }) => ({ from: new THREE.Color(from).getHSL({ h: 0, s: 0, l: 0 }), to: new THREE.Color(to).getHSL({ h: 0, s: 0, l: 0 }), tol }))
  const c = new THREE.Color(), h = { h: 0, s: 0, l: 0 }, rgb = new THREE.Color()
  const swapped = (r: number, gr: number, b: number) => {
    c.setRGB(r / 255, gr / 255, b / 255, THREE.SRGBColorSpace).getHSL(h)
    if (h.s < 0.2) return null
    const hit = hsl.find((s) => Math.min(Math.abs(h.h - s.from.h), 1 - Math.abs(h.h - s.from.h)) * 360 < s.tol)
    if (!hit) return null
    rgb.setHSL(hit.to.h, Math.min(1, h.s * (hit.to.s / Math.max(hit.from.s, 0.01))), Math.min(1, h.l * (hit.to.l / Math.max(hit.from.l, 0.01))))
    const out = rgb.getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace)
    return Uint8ClampedArray.of(out.r * 255, out.g * 255, out.b * 255)
  }
  // An atlas is a few thousand colours in swatches across a megapixel: each distinct colour is swapped once, and a
  // pixel the same as the one before it reuses that one's swap.
  const memo = new Map<number, Uint8ClampedArray | null>()
  const px = data.data
  let last = -1, out: Uint8ClampedArray | null | undefined = null
  for (let i = 0; i < px.length; i += 4) {
    const key = (px[i] << 16) | (px[i + 1] << 8) | px[i + 2]
    if (key !== last) {
      out = memo.get(key)
      if (out === undefined) memo.set(key, (out = swapped(px[i], px[i + 1], px[i + 2])))
      last = key
    }
    if (out) px.set(out, i)
  }
  g.putImageData(data, 0, 0)
  return finish(new THREE.CanvasTexture(cv))
}

/** The atlas a pack draws with under `theme`: shared by key, made once. */
export function atlasTexture(atlases: Atlases, pack: Pack, theme: Theme | undefined): THREE.Texture {
  const name = theme?.atlas?.[pack] ?? 'base'
  const swaps = theme?.swaps?.[pack] ?? []
  const key = `${pack}/${name}|${JSON.stringify(swaps)}`
  const hit = textures.get(key)
  if (hit) return hit
  const img = atlases.get(`${pack}/${name}`)
  if (!img) throw new Error(`${pack} has no atlas "${name}"`)
  const t = swaps.length ? recolor(img, swaps) : finish(new THREE.Texture(img))
  t.needsUpdate = true
  textures.set(key, t)
  return t
}

/** What lights up at night: black but for the pack's glowing regions (`GLOW`), or nothing when it has none. */
export function glowTexture(pack: Pack, atlas: HTMLImageElement): THREE.Texture | null {
  const regions = GLOW[pack]
  if (!regions) return null
  const key = `glow/${pack}`
  const hit = textures.get(key)
  if (hit) return hit
  const cv = Object.assign(document.createElement('canvas'), { width: atlas.width, height: atlas.height })
  const g = cv.getContext('2d')!
  g.fillStyle = '#000'
  g.fillRect(0, 0, cv.width, cv.height)
  for (const [x0, y0, x1, y1, color] of regions) {
    g.fillStyle = color
    g.fillRect(x0, y0, x1 - x0, y1 - y0)
  }
  const t = finish(new THREE.CanvasTexture(cv))
  textures.set(key, t)
  return t
}
