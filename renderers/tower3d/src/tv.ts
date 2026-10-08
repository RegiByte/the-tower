import * as THREE from 'three'
import { type } from '../../../src/shared/design.ts'
import { WORLD } from './cards.ts'
import { loadFaces } from './toon.ts'

/**
 * The building's big screens: one picture on all of them, a placard until you share a screen, a window or a tab
 * through the browser's own picker, then that, fitted inside. A share lives in this page only and ends when you stop
 * it here or in the browser's bar.
 *
 * Capture needs a page of a real origin: a shelf page framed in the tower has an opaque one, so there the screens
 * send you to this renderer in a tab of its own (src/main.ts).
 */

const W = 1920
const H = 1080
const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H })
const g = canvas.getContext('2d')!
const texture = new THREE.CanvasTexture(canvas)
texture.colorSpace = THREE.SRGBColorSpace
texture.anisotropy = 8

/** Every big screen's face: shared, never disposed with a building. */
export const screenMaterial = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })
screenMaterial.userData.shared = true

let share: { stream: MediaStream; video: HTMLVideoElement } | undefined
let hint = ''

function placard() {
  g.fillStyle = WORLD.enamel
  g.fillRect(0, 0, W, H)
  g.strokeStyle = WORLD.enamel2
  g.lineWidth = 6
  g.beginPath()
  g.roundRect(60, 60, W - 120, H - 120, 16)
  g.stroke()
  g.textAlign = 'center'
  g.textBaseline = 'alphabetic'
  g.fillStyle = WORLD.panel
  g.font = `900 150px ${type.display}`
  g.letterSpacing = `${150 * 0.06}px`
  g.fillText('THE BIG SCREEN', W / 2, H / 2 - 20)
  g.letterSpacing = '0px'
  g.fillStyle = WORLD.line
  g.font = `400 64px ${type.ui}`
  g.fillText(hint, W / 2, H / 2 + 110)
  texture.needsUpdate = true
}

/** What the screens say while nothing is shared: how to share from where this page runs. */
export function idle(framed: boolean) {
  hint = framed ? 'E · share a screen (opens a tab)' : 'E · share a screen, window or tab'
  loadFaces().then(() => share || placard())
}

function paint(video: HTMLVideoElement) {
  const k = Math.min(W / video.videoWidth, H / video.videoHeight)
  const w = video.videoWidth * k
  const h = video.videoHeight * k
  g.fillStyle = '#000'
  g.fillRect(0, 0, W, H)
  g.drawImage(video, (W - w) / 2, (H - h) / 2, w, h)
  texture.needsUpdate = true
}

export const sharing = () => share !== undefined

/** Asks the browser for something to show, and shows it until it ends; `onEnd` hears when it does. */
export async function startShare(onEnd: () => void) {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false })
  const video = Object.assign(document.createElement('video'), { muted: true, playsInline: true, srcObject: stream })
  await video.play()
  share = { stream, video }
  const onFrame = () => {
    if (share?.video !== video) return
    paint(video)
    video.requestVideoFrameCallback(onFrame)
  }
  video.requestVideoFrameCallback(onFrame)
  stream.getVideoTracks()[0].addEventListener('ended', () => (stopShare(), onEnd()))
}

export function stopShare() {
  if (!share) return
  for (const track of share.stream.getTracks()) track.stop()
  share = undefined
  placard()
}
