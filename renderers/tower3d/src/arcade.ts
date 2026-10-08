import * as THREE from 'three'
import { type } from '../../../src/shared/design.ts'
import { itemTitles, titleIn } from '../../../src/shared/titles.ts'
import { act } from './acts.ts'
import { tower } from './api.ts'
import { FIXTURE, FIXTURE_GAMES } from './fixtures.ts'
import { GAMES, gamePath } from './games.ts'
import { CABINET } from './layout.ts'
import { picture } from './room.ts'
import { block, glowing, mesh, toon } from './toon.ts'

/**
 * A floor's arcade (src/layout.ts places it): a cabinet per game, its marquee titled by the game's `<title>` and its
 * keeper, its screen inviting you to play.
 */

/** A game's text, rejecting as the API does. A fixture board reads its own games, the same on every load. */
const gameText = (project: string, id: string): Promise<string> => {
  if (FIXTURE === undefined) return tower.text(gamePath(project, id))
  const text = FIXTURE_GAMES[`${project}/${id}`]
  return text === undefined ? Promise.reject(Object.assign(new Error(`No game "${id}"`), { code: 'not_found' })) : Promise.resolve(text)
}

let titlesArrived = () => {}
/** Runs `fn` whenever a game's text arrives, to draw its title. */
export const onGameTitles = (fn: () => void) => void (titlesArrived = fn)

/** Each game's title, its `<title>` or else its tag, `…` until its text has arrived; `pruneGameTitles` with each board. */
export const { title: gameTitle, prune: pruneGameTitles } = itemTitles(GAMES, gameText, (item, text) => titleIn(item.id, text) ?? item.tag, () => titlesArrived())

/** The cabinet's parts, from its own origin on the floor, facing +z: the screen's center and size. */
export const SCREEN = { y: 1.38, w: 0.62, h: 0.46, tilt: 0.12 }
const BODY = { height: 1.72, color: '#1b2030' }
const MARQUEE = { y: 1.72, h: 0.36 }

/** The attract screen: an invitation to play in the floor's colour, over the game's tag. */
function screenTexture(tag: string, tint: string) {
  const cv = Object.assign(document.createElement('canvas'), { width: 384, height: 288 })
  const g = cv.getContext('2d')!
  g.fillStyle = '#05070d'
  g.fillRect(0, 0, cv.width, cv.height)
  g.fillStyle = tint
  g.globalAlpha = 0.12
  for (let y = 0; y < cv.height; y += 6) g.fillRect(0, y, cv.width, 2)
  g.globalAlpha = 1
  g.textAlign = 'center'
  g.font = `800 64px ${type.display}`
  g.fillText('▶ PLAY', cv.width / 2, cv.height / 2 + 8)
  g.fillStyle = '#7d8ba6'
  g.font = `500 26px ${type.mono}`
  g.fillText(tag, cv.width / 2, cv.height / 2 + 64, cv.width - 40)
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  return new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })
}

/** A game's cabinet: the title, tint and keeper it was drawn with, so a change draws it anew. */
export type Cabinet = { group: THREE.Group; title: string; tint: string; keptBy: string | undefined }

export function makeCabinet(project: string, id: string, title: string, tag: string, keptBy: string | undefined, tint: string): Cabinet {
  const group = new THREE.Group()
  const { width: w, depth: d } = CABINET
  const body = toon(BODY.color)
  const trim = glowing(tint)
  group.add(block(w, BODY.height, d, body))
  group.add(block(w, MARQUEE.h, d * 0.55, body, 0, MARQUEE.y, -d * 0.225))
  group.add(mesh(new THREE.PlaneGeometry(w - 0.06, MARQUEE.h - 0.06), picture([title, keptBy ? `kept by ${keptBy}` : 'insert coin'], tint, w - 0.06, MARQUEE.h - 0.06), 0, MARQUEE.y + MARQUEE.h / 2, d * 0.055))
  for (const side of [-1, 1]) group.add(block(0.025, BODY.height - 0.05, 0.03, trim, side * (w / 2 + 0.005), 0.05, d / 2))
  const screen = mesh(new THREE.PlaneGeometry(SCREEN.w, SCREEN.h), screenTexture(tag, tint), 0, SCREEN.y, d / 2 + (SCREEN.h / 2) * Math.sin(SCREEN.tilt) + 0.005)
  screen.rotation.x = -SCREEN.tilt
  group.add(screen)
  group.add(block(w, 0.09, 0.32, toon('#2a3142'), 0, 0.95, d / 2 + 0.14))
  group.add(block(0.04, 0.12, 0.04, toon('#0b0f18'), -0.2, 1.04, d / 2 + 0.16), mesh(new THREE.SphereGeometry(0.035, 12, 8), trim, -0.2, 1.17, d / 2 + 0.16))
  for (const [i, color] of ['#e5484d', '#f5d90a', '#4f7cff'].entries()) group.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 16), glowing(color), 0.06 + i * 0.1, 1.05, d / 2 + 0.16))
  group.add(block(w, 0.1, 0.02, trim, 0, 0.04, d / 2 + 0.01))
  act(group, { kind: 'arcade', project, id }, [])
  return { group, title, tint, keptBy }
}
