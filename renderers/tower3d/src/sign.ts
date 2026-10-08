import * as THREE from 'three'
import { projectTones, type } from '../../../src/shared/design.ts'
import { WORLD } from './cards.ts'
import type { Level } from './layout.ts'
import { cssHex } from './palette.ts'

/** A floor sign's facts: the key on its tile (a level's number, R for the roof), the name, the project colour. */
export type Sign = { key: string; name: string; band: string }

/** The band of the levels no project owns: the lobby and the roof. */
export const LOBBY_BAND = '#ffb547'

/** A level as its sign. */
export const signOf = (l: Level, band: string): Sign => ({ key: l.kind === 'roof' ? 'R' : String(l.index), name: l.name, band })

/** The sign's measures at a height of 1, the page's `.sign` divided by its 34px. */
const S = { pad: 13 / 34, gap: 9 / 34, end: 8 / 34, band: 5 / 34, radius: 4 / 34, tile: 22 / 34, tileMin: 26 / 34, tilePad: 4 / 34, tileRadius: 3 / 34, text: 14 / 34 }

const tones = new Map<string, ReturnType<typeof projectTones>>()

/** A band's tones in the world, from any CSS colour. */
function tonesOf(band: string) {
  if (!tones.has(band)) tones.set(band, projectTones(cssHex(band), 'light'))
  return tones.get(band)!
}

const nameFont = (h: number) => `800 ${h * S.text}px ${type.display}`
const keyFont = (h: number) => `900 ${h * S.text}px ${type.display}`

function setName(g: CanvasRenderingContext2D, h: number) {
  g.font = nameFont(h)
  g.letterSpacing = `${h * S.text * 0.06}px`
}

const tileWidth = (g: CanvasRenderingContext2D, h: number, key: string) => {
  g.font = keyFont(h)
  g.letterSpacing = '0px'
  return Math.max(h * S.tileMin, g.measureText(key).width + 2 * h * S.tilePad)
}

/** The text cut with … to fit `width`, in the context's current font. */
export function fitted(g: CanvasRenderingContext2D, text: string, width: number) {
  if (g.measureText(text).width <= width) return text
  let n = text.length
  while (n > 0 && g.measureText(`${text.slice(0, n)}…`).width > width) n--
  return `${text.slice(0, n)}…`
}

/** How wide a sign `h` tall must be to show its whole name. */
export function signWidth(g: CanvasRenderingContext2D, sign: Sign, h: number) {
  const tile = tileWidth(g, h, sign.key)
  setName(g, h)
  return h * (S.pad + S.gap + S.end) + tile + g.measureText(sign.name.toUpperCase()).width
}

/**
 * Paints a floor sign in the box (x, y, w, h), the canvas twin of the page's `.sign`: a plate washed by the project,
 * edged in its `plateEdge`, the band on its left edge, the key on a band-coloured tile, the name in display caps,
 * cut to the plate's width less `reserve` on the right, where the caller may paint more.
 */
export function paintSign(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, sign: Sign, reserve = 0) {
  const tone = tonesOf(sign.band)
  const line = Math.max(1, h / 34)
  g.save()
  g.beginPath()
  g.roundRect(x, y, w, h, h * S.radius)
  g.fillStyle = tone.plate
  g.fill()
  g.clip()
  g.fillStyle = sign.band
  g.fillRect(x, y, h * S.band, h)
  g.restore()
  g.beginPath()
  g.roundRect(x + line / 2, y + line / 2, w - line, h - line, h * S.radius)
  g.strokeStyle = tone.plateEdge
  g.lineWidth = line
  g.stroke()
  const tile = tileWidth(g, h, sign.key)
  const tileX = x + h * S.pad
  const tileY = y + (h - h * S.tile) / 2
  g.beginPath()
  g.roundRect(tileX, tileY, tile, h * S.tile, h * S.tileRadius)
  g.fillStyle = sign.band
  g.fill()
  g.textBaseline = 'middle'
  g.textAlign = 'center'
  g.fillStyle = WORLD.enamel
  g.fillText(sign.key, tileX + tile / 2, y + h / 2 + h * 0.03)
  const nameX = tileX + tile + h * S.gap
  setName(g, h)
  g.textAlign = 'left'
  g.fillStyle = tone.plateText
  g.fillText(fitted(g, sign.name.toUpperCase(), x + w - h * S.end - reserve - nameX), nameX, y + h / 2 + h * 0.06)
  g.letterSpacing = '0px'
}

/** A floor sign on a wall, facing +z and `height` world units tall, as wide as its name needs. */
export function signPlate(sign: Sign, height: number) {
  const px = 136
  const cv = document.createElement('canvas')
  const g = cv.getContext('2d')!
  cv.width = Math.ceil(signWidth(g, sign, px))
  cv.height = px
  paintSign(g, 0, 0, cv.width, px, sign)
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return new THREE.Mesh(new THREE.PlaneGeometry((height * cv.width) / px, height), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }))
}
