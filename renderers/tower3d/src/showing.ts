import * as THREE from 'three'
import { marked, type Token } from 'marked'
import { type } from '../../../src/shared/design.ts'
import { imagePath } from '../../../src/shared/markdown.ts'
import { tower, type Card } from './api.ts'
import { WORLD, base, shownTitle } from './cards.ts'
import { FIXTURE, readBlob } from './fixtures.ts'

/**
 * What a worker showed the user, painted for the world: a poster naming it, for markdown the page itself, typeset with
 * its images, and for an image the image. A page or a web site can't be painted into a texture (a framed one has an
 * opaque origin), so it gets a poster and opens for real in the desk panel.
 */

export type Shown = Card['shown'][number]

/** One showing of a target: showing it again is a new one. */
export const shownKey = (s: Shown) => `${s.session}|${s.target}|${s.at}`
/** Where the showing is served: a file through the tower, by the session that showed it; a page at its own address. */
export const shownHref = (s: Shown) => (s.kind === 'file' ? `/shown/${s.session}${s.target.split('/').map(encodeURIComponent).join('/')}` : s.target)
export const isMarkdown = (s: Shown) => s.kind === 'file' && s.target.endsWith('.md')

const IMAGE = /\.(png|jpe?g|gif|webp|svg)$/i
const VIDEO = /\.(mp4|webm)$/i
export const isImage = (s: Shown) => s.kind === 'file' && IMAGE.test(s.target)
export const isVideo = (s: Shown) => s.kind === 'file' && VIDEO.test(s.target)
const kindWord = (s: Shown) =>
  s.kind === 'link' ? 'LINK' : s.kind === 'url' ? 'WEB PAGE' : isMarkdown(s) ? 'NOTES' : isImage(s) ? 'IMAGE' : isVideo(s) ? 'VIDEO' : /\.html?$/.test(s.target) ? 'PAGE' : 'FILE'
/** The second line of a poster: the file's name or the page's address without its scheme. */
const whereOf = (s: Shown) => (s.kind === 'file' ? base(s.target) : s.target.replace(/^https?:\/\//, ''))

const W = 1024
const H = 640
const PAD = 56
const BAND = 76
/** The longest side an image is kept at: enough for a picture you walk up to. */
const IMAGE_SIDE = 2048
/** The longest side a video's frames are painted at: each new frame of a playing video is copied to the GPU. */
const VIDEO_SIDE = 1280

/** Breaks `text` into lines no wider than `width` in the canvas's current font. */
function wrap(g: CanvasRenderingContext2D, text: string, width: number) {
  return text.split(/\s+/).filter(Boolean).reduce<string[]>((lines, word) => {
    const last = lines.at(-1)
    if (last !== undefined && g.measureText(`${last} ${word}`).width <= width) lines[lines.length - 1] = `${last} ${word}`
    else lines.push(word)
    return lines
  }, [])
}

/** At most `n` lines, the last one cut with an ellipsis when there is more. */
function fit(g: CanvasRenderingContext2D, lines: string[], n: number, width: number) {
  if (lines.length <= n) return lines
  const kept = lines.slice(0, n)
  let last = `${kept[n - 1]}…`
  while (g.measureText(last).width > width && last.length > 1) last = `${last.slice(0, -2)}…`
  kept[n - 1] = last
  return kept
}

/** The paper, its outline, and the band naming the kind and who showed it. */
function sheet(g: CanvasRenderingContext2D, s: Shown, callsign: string) {
  g.fillStyle = WORLD.panel
  g.fillRect(0, 0, W, H)
  g.fillStyle = WORLD.enamel
  g.fillRect(0, 0, W, BAND)
  g.lineWidth = 10
  g.strokeStyle = WORLD.enamel
  g.strokeRect(5, 5, W - 10, H - 10)
  g.textBaseline = 'middle'
  g.font = `800 34px ${type.display}`
  g.fillStyle = WORLD.panel
  g.textAlign = 'start'
  g.fillText(kindWord(s), PAD, BAND / 2 + 3)
  g.textAlign = 'end'
  g.fillStyle = WORLD.faint
  g.fillText(callsign, W - PAD, BAND / 2 + 3)
  g.textAlign = 'start'
  g.textBaseline = 'top'
}

const clock = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

function paintPoster(g: CanvasRenderingContext2D, s: Shown, callsign: string) {
  sheet(g, s, callsign)
  const width = W - PAD * 2
  g.font = `800 84px ${type.display}`
  g.fillStyle = WORLD.ink
  const title = fit(g, wrap(g, shownTitle(s), width), 3, width)
  title.forEach((line, i) => g.fillText(line, PAD, BAND + 70 + i * 96))
  g.font = `400 32px ${type.mono}`
  g.fillStyle = WORLD.muted
  g.fillText(fit(g, [whereOf(s)], 1, width)[0], PAD, BAND + 90 + title.length * 96)
  g.font = `700 32px ${type.ui}`
  g.fillStyle = WORLD.accent
  g.textBaseline = 'bottom'
  g.fillText(`shown to you at ${clock(s.at)}`, PAD, H - PAD + 10)
}

/** A line of the page as it is set: its words, its face and its size, or one of its images at its height. */
type SetLine = ({ text: string; font: string; color: string } | { image: HTMLCanvasElement }) & { size: number; indent: number; gap: number }

const HEADING_SIZE = [0, 64, 50, 42, 36, 34, 34]
const BODY = 32
const IMAGE_HEIGHT = 360
/** An image squeezed shorter than this to fit the sheet is left out. */
const IMAGE_MIN = 140

/** Markdown's blocks as lines of one width, in reading order, the inline marks dropped, its images by `href` set whole. */
function setLines(g: CanvasRenderingContext2D, tokens: Token[], width: number, images: Map<string, HTMLCanvasElement>): SetLine[] {
  const words = (text: string, font: string, color: string, size: number, indent: number, gap: number): SetLine[] => {
    g.font = font
    return wrap(g, text, width - indent).map((line, i) => ({ text: line, font, color, size, indent, gap: i === 0 ? gap : 0 }))
  }
  const plainOf = (t: Token) =>
    ('text' in t ? String(t.text) : '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/[*_`~]+/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  const pictures = (t: Token): SetLine[] =>
    ('tokens' in t ? t.tokens ?? [] : []).flatMap((i) => {
      const image = i.type === 'image' ? images.get(i.href) : undefined
      return image ? [{ image, size: Math.min(IMAGE_HEIGHT, (width * image.height) / image.width), indent: 0, gap: 14 }] : []
    })
  return tokens.flatMap((t): SetLine[] => {
    if (t.type === 'heading') return words(plainOf(t), `800 ${HEADING_SIZE[t.depth]}px ${type.display}`, WORLD.ink, HEADING_SIZE[t.depth], 0, 18)
    if (t.type === 'paragraph' || t.type === 'text') return [...pictures(t), ...words(plainOf(t), `400 ${BODY}px ${type.ui}`, WORLD.ink, BODY, 0, 14)]
    if (t.type === 'blockquote') return words(plainOf(t), `400 ${BODY}px ${type.ui}`, WORLD.muted, BODY, 24, 14)
    if (t.type === 'code') return t.text.split('\n').map((line: string, i: number) => ({ text: line, font: `400 26px ${type.mono}`, color: WORLD.muted, size: 26, indent: 16, gap: i === 0 ? 14 : 0 }))
    if (t.type === 'list') {
      return t.items.flatMap((item: Token, i: number) =>
        words(`${t.ordered ? `${Number(t.start || 1) + i}.` : '•'} ${plainOf(item)}`, `400 ${BODY}px ${type.ui}`, WORLD.ink, BODY, 12, i === 0 ? 14 : 4))
    }
    return []
  })
}

/** The markdown's opening, typeset on the sheet until the page is full; the rest fades out under it. */
function paintPage(g: CanvasRenderingContext2D, s: Shown, callsign: string, tokens: Token[], images: Map<string, HTMLCanvasElement>) {
  sheet(g, s, callsign)
  const lines = setLines(g, tokens, W - PAD * 2, images)
  lines.reduce((y, line) => {
    const top = y + line.gap
    if ('image' in line) {
      const size = Math.min(line.size, H - 20 - top)
      if (size < IMAGE_MIN) return y
      g.drawImage(line.image, PAD + line.indent, top, (size * line.image.width) / line.image.height, size)
      return top + size + 10
    }
    if (top + line.size > H - 20) return y
    g.font = line.font
    g.fillStyle = line.color
    g.fillText(line.text, PAD + line.indent, top)
    return top + line.size * 1.3
  }, BAND + 30)
  const fade = g.createLinearGradient(0, H - 120, 0, H - 10)
  fade.addColorStop(0, `${WORLD.panel}00`)
  fade.addColorStop(1, WORLD.panel)
  g.fillStyle = fade
  g.fillRect(10, H - 120, W - 20, 110)
}

/** The image fitted whole onto the sheet, on the dark of a screen. */
function paintImage(g: CanvasRenderingContext2D, image: HTMLCanvasElement) {
  g.fillStyle = WORLD.ink
  g.fillRect(0, 0, W, H)
  const k = Math.min(W / image.width, H / image.height)
  g.drawImage(image, (W - image.width * k) / 2, (H - image.height * k) / 2, image.width * k, image.height * k)
}

/** An image file, decoded and drawn onto a canvas no longer than `IMAGE_SIDE` on either side. */
async function decode(blob: Blob) {
  const url = URL.createObjectURL(blob)
  const img = new Image()
  img.src = url
  await img.decode().finally(() => URL.revokeObjectURL(url))
  const k = Math.min(1, IMAGE_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
  const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(img.naturalWidth * k), height: Math.round(img.naturalHeight * k) })
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas
}

/** The images a markdown page served at `url` shows beside it, by `href`; one that can't be read is left out. */
async function pageImages(tokens: Token[], url: string) {
  const hrefs = new Set<string>()
  marked.walkTokens(tokens, (t) => void (t.type === 'image' && hrefs.add(t.href)))
  const read = [...hrefs].map(async (href): Promise<[string, HTMLCanvasElement][]> => {
    const path = imagePath(href, url)
    return path ? [[href, await decode(await readBlob(path.slice(1)))]] : []
  })
  const settled = await Promise.allSettled(read)
  return new Map(settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])))
}

/** A video, its first frame decoded: muted, looping, on a blob URL of its own. */
async function load(blob: Blob) {
  const video = Object.assign(document.createElement('video'), { muted: true, loop: true, playsInline: true, preload: 'auto', src: URL.createObjectURL(blob) })
  await new Promise((resolve, reject) => {
    video.onloadeddata = resolve
    video.onerror = () => reject(video.error)
  })
  return video
}

/** A video showing: its element, and how to paint its current frame where it hangs. */
type Film = { video: HTMLVideoElement; paint: () => void }
const films = new Map<string, Film>()

const textureOf = (canvas: HTMLCanvasElement) => {
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

const posters = new Map<string, THREE.CanvasTexture>()
/** The pictures being read: a texture changes when one settles. */
const reading = new Set<Promise<unknown>>()
const read = (p: Promise<unknown>) => (reading.add(p), p.finally(() => reading.delete(p)))
/** Settles once every picture being read has been painted, or left a poster. */
export const pictured = () => Promise.allSettled([...reading]).then(() => undefined)
/** Each image showing's picture as the image alone, at its own proportions, by `shownKey`. */
const images = new Map<string, THREE.CanvasTexture>()

/**
 * A showing's picture, painted on first use: its poster; for markdown the page once its text arrives, and again with
 * its images; for an image the image fitted to the sheet, kept bare for the gallery too (`imageOf`); for a video its
 * frames, the same two ways (`playFilms`). A fixture board
 * has no host to read from, so its markdown stays a poster. A file gone since it was shown keeps its poster.
 */
export function posterOf(c: Pick<Card, 'callsign'>, s: Shown) {
  const key = shownKey(s)
  const known = posters.get(key)
  if (known) return known
  const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H })
  const g = canvas.getContext('2d')!
  paintPoster(g, s, c.callsign)
  const texture = textureOf(canvas)
  posters.set(key, texture)
  const current = () => posters.get(key) === texture
  const url = shownHref(s)
  if (isMarkdown(s) && FIXTURE === undefined) {
    const typeset = async (md: string) => {
      const tokens = marked.lexer(md)
      const paint = (pictures: Map<string, HTMLCanvasElement>) => {
        if (!current()) return
        paintPage(g, s, c.callsign, tokens, pictures)
        texture.needsUpdate = true
      }
      paint(new Map())
      const pictures = await pageImages(tokens, url)
      if (pictures.size) paint(pictures)
    }
    read(tower.text(url.slice(1)).then(typeset, () => undefined))
  }
  if (isImage(s)) {
    const hang = (image: HTMLCanvasElement) => {
      if (!current()) return
      paintImage(g, image)
      texture.needsUpdate = true
      images.set(key, textureOf(image))
    }
    read(readBlob(url.slice(1)).then(decode).then(hang, () => undefined))
  }
  if (isVideo(s)) {
    const film = (video: HTMLVideoElement) => {
      if (!current()) return URL.revokeObjectURL(video.src)
      const k = Math.min(1, VIDEO_SIDE / Math.max(video.videoWidth, video.videoHeight))
      const frame = Object.assign(document.createElement('canvas'), { width: Math.round(video.videoWidth * k), height: Math.round(video.videoHeight * k) })
      const bare = textureOf(frame)
      const paint = () => {
        frame.getContext('2d')!.drawImage(video, 0, 0, frame.width, frame.height)
        paintImage(g, frame)
        texture.needsUpdate = true
        bare.needsUpdate = true
      }
      paint()
      images.set(key, bare)
      films.set(key, { video, paint })
    }
    read(readBlob(url.slice(1)).then(load).then(film, () => undefined))
  }
  return texture
}

/**
 * Plays the videos `playing` names (by `shownKey`) and pauses every other where it stands. A playing video paints
 * each new frame it presents.
 */
export function playFilms(playing: ReadonlySet<string>) {
  for (const [key, { video, paint }] of films) {
    if (!playing.has(key)) {
      if (!video.paused) video.pause()
      continue
    }
    if (!video.paused) continue
    const onFrame = () => {
      if (video.paused || films.get(key)?.video !== video) return
      paint()
      video.requestVideoFrameCallback(onFrame)
    }
    video.play().then(
      () => video.requestVideoFrameCallback(onFrame),
      (err: DOMException) => {
        if (err.name !== 'AbortError') throw err
      },
    )
  }
}

/** The showing's image alone, once it has been read: an image or video showing's picture for the gallery. */
export const imageOf = (c: Pick<Card, 'callsign'>, s: Shown) => images.get(shownKey(s))

export const isPosterTexture = (t: THREE.Texture) => [...posters.values(), ...images.values()].includes(t as THREE.CanvasTexture)

/** Lets go of every picture not in `keys`: only what stands in the building is kept. */
export function keepPosters(keys: ReadonlySet<string>) {
  for (const [key, { video }] of films) {
    if (keys.has(key)) continue
    video.pause()
    URL.revokeObjectURL(video.src)
    video.removeAttribute('src')
    video.load()
    films.delete(key)
  }
  for (const map of [posters, images]) {
    for (const [key, texture] of map) {
      if (keys.has(key)) continue
      texture.dispose()
      map.delete(key)
    }
  }
}
