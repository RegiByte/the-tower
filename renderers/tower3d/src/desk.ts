import * as THREE from 'three'
import { act } from './acts.ts'
import { random } from './random.ts'
import type { Card } from './api.ts'
import { WORLD, branchLine, bubbleOf, pairLine, glanceOf, onStatusColor, speechLines, speechOf, statusColor, statusName } from './cards.ts'
import { DESK, SEAT_OFFSET } from './layout.ts'
import { ASLEEP, OFFLINE, OPEN_DESK, screenTexture } from './screens.ts'
import { avatar, lookOf, type Avatar, type Look } from './avatar.ts'
import { instance, type Models } from './models.ts'
import { posterOf, shownKey, type Shown } from './showing.ts'
import { block, dispose, glowing, mesh, sprite, toon } from './toon.ts'

/**
 * A desk and the worker at it, in desk space: the desk centered on the origin, its monitor at the far edge (+z)
 * facing back, the worker seated on the near side (-z) facing it. Built once per worker; a board update re-dresses
 * it (sync) and every frame poses it (pose). A reviewer sitting beside its author is one too, in its own desk space
 * at its place on the author's desk: a chair and a notebook, no desk of its own.
 */

const SCREEN = { width: 1.56, height: 0.98, y: 1.33, z: 0.32 }
const SEAT_Y = 0.48
const BUBBLE_Y = 1.8
const TAG_Y = SCREEN.y + SCREEN.height / 2 + 0.36
const GIST_Y = TAG_Y + 0.19
const SPEECH_Y = GIST_Y + 0.13
const SPEECH_LINE = 0.11
const SPEECH_GAP = 0.04
/** The worker's chair on the floor, at the keyboard. */
const SEAT = new THREE.Vector3(0, 0, -SEAT_OFFSET)
/** The second monitor, on the desk's left, turned toward the seat: what the worker last showed you. */
export const SIDE = { width: 0.66, height: 0.41, x: -0.98, y: 1.07, z: 0.06, turn: -0.55 }
/** A reviewer's notebook on its author's desk: its lid's screen shows the reviewer's terminal, facing the reviewer. */
const NOTEBOOK = { width: 0.44, depth: 0.36, lid: 0.34, screen: 0.3, tilt: 0.28, z: -0.24 }
/** Holding up something new: rising over its head, held there, then laid onto the second monitor (seconds). */
const RAISE = { rise: 0.45, hold: 3.6, lay: 4.4 }
const HELD_UP = { y: 2.35, width: 1.12 }

/** A bubble's look in its attention's colours: a question needs a hand, a failure is broken, an answer is ready; a doze wants nothing. */
const BUBBLE: Record<string, { color: string; bg: string }> = {
  '?': { color: '#fff', bg: WORLD.needs },
  '!': { color: WORLD.enamel, bg: WORLD.ready },
  '×': { color: '#fff', bg: WORLD.broken },
  z: { color: WORLD.muted, bg: WORLD.panel },
}

/**
 * How a desk's labels read and where they float, and where a showing held up is laid down, in desk space. A reviewer's
 * tag is smaller and leaves out its fork's branch, and it carries no gist.
 */
type Marks = {
  tag: THREE.Vector3; tagHeight: number; branch: boolean; gist?: THREE.Vector3; speech: THREE.Vector3; lay: THREE.Vector3; layWidth: number
  /** Where the first subagent stands, how far apart they stand along x, on what. */
  minis: { x: number; step: number; y: number; z: number }
  /** Where a fork of the worker sits beside it, in a chair of its own, turned toward the monitor; a reviewer beside its author seats none. */
  twin?: { x: number; z: number; turn: number }
}

export type Desk = {
  group: THREE.Group
  marks: Marks
  card: Card
  models: Models
  look: Look
  worker: THREE.Object3D
  body: THREE.Object3D
  arms: THREE.Object3D[]
  bulb: THREE.MeshBasicMaterial
  strip: THREE.MeshBasicMaterial
  screen: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  minis: THREE.Group
  /** The fork of the worker running now in the second chair, and which run it is; the chair stands only while one runs. */
  twin?: { run: string; group: THREE.Group; avatar: Avatar }
  tag?: THREE.Sprite
  tagText: string
  gist?: THREE.Sprite
  gistText: string
  bubble?: THREE.Sprite
  bubbleText: string
  /** What the worker tells the user while it works, a bubble per message stacked over its gist, the newest lowest. */
  speech: THREE.Group
  speechText: string
  /** The second monitor, shown only once the worker has shown something; a reviewer beside its author has none. */
  side?: { group: THREE.Group; screen: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; ribbon: THREE.Sprite }
  /** What the second monitor shows: the showing's key and whether you have yet to open it. */
  sideText: string
  /** The picture held up over the worker's head since `start` (seconds), while it shows something new. */
  raised?: { picture: THREE.Sprite; start: number }
  /** The review notes new to the worker, stacked on its desk while there are any. */
  papers: THREE.Group
  papersCount: number
  /** Its logbook beside the keyboard, as thick as the sessions it ran as; a reviewer beside its author has none. */
  binder?: THREE.Group
  binderSessions: number
  turn: number
  phase: number
}

/** A subagent: a small one of its worker's kind, in a color of its own, wearing nothing. */
function mini(models: Models, parent: Look, id: string) {
  const a = avatar(models, { ...lookOf(id), species: parent.species, hat: undefined, face: undefined })
  a.root.scale.setScalar(0.28)
  return a.root
}

/** A workstation's furniture: the desk, the strip along its near edge, and its monitor's screen. */
function furniture(models: Models) {
  const group = new THREE.Group()
  const model = instance(models.desk)
  group.add(model.root)
  const strip = glowing('#ffffff')
  group.add(mesh(new THREE.BoxGeometry(DESK.width - 0.1, 0.025, 0.02), strip, 0, DESK.height - 0.04, -DESK.depth / 2 - 0.005))
  const screen = mesh(new THREE.PlaneGeometry(SCREEN.width, SCREEN.height), new THREE.MeshBasicMaterial({ toneMapped: false }), 0, SCREEN.y, SCREEN.z)
  screen.rotation.y = Math.PI
  screen.userData.screen = true
  group.add(screen)
  return { group, strip, screen, chair: model.part('chair') }
}

/** A small monitor on a neck and foot, its screen facing -z like the big one's. */
function sideMonitor() {
  const group = new THREE.Group()
  const dark = toon('#1d2421')
  const neck = SIDE.y - SIDE.height / 2 - DESK.height
  group.add(block(SIDE.width + 0.05, SIDE.height + 0.05, 0.04, dark, 0, SIDE.y - DESK.height - SIDE.height / 2 - 0.025, 0))
  group.add(block(0.05, neck, 0.04, dark, 0, 0, 0.03))
  group.add(block(0.26, 0.02, 0.18, dark, 0, 0, 0.03))
  const screen = mesh(new THREE.PlaneGeometry(SIDE.width, SIDE.height), new THREE.MeshBasicMaterial({ toneMapped: false }), 0, SIDE.y - DESK.height, -0.021)
  screen.rotation.y = Math.PI
  const ribbon = sprite('NEW', 0.085, { color: '#fff', bg: WORLD.accent, px: 44 })
  ribbon.position.set(SIDE.width / 2 - 0.06, SIDE.y - DESK.height + SIDE.height / 2 + 0.07, -0.05)
  group.add(screen, ribbon)
  group.position.set(SIDE.x, DESK.height, SIDE.z)
  group.rotation.y = SIDE.turn
  group.visible = false
  return { group, screen, ribbon }
}

/** A workstation nobody sits at. The open one, where the next worker on its floor sits, is lit and offers a hire. */
export type Station = {
  group: THREE.Group
  strip: THREE.MeshBasicMaterial
  screen: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  /** The open one's sign, where a worker's tag would be: read from anywhere on the floor. */
  sign?: THREE.Sprite
  open: boolean | undefined
}

export function makeStation(models: Models): Station {
  return { ...furniture(models), open: undefined }
}

export function syncStation(station: Station, open: boolean) {
  if (station.open === open) return
  station.open = open
  station.strip.color.set(open ? WORLD.accent : '#2a2f3a')
  if (station.sign) (station.group.remove(station.sign), dispose(station.sign))
  station.sign = open ? sprite('OPEN DESK', 0.15, { color: '#fff', bg: WORLD.accent, px: 44 }) : undefined
  station.sign?.position.set(0, TAG_Y, SCREEN.z + 0.05)
  if (station.sign) station.group.add(station.sign)
  station.screen.material.map = open ? OPEN_DESK : ASLEEP
  station.screen.material.needsUpdate = true
}

const LABELS_Z = SCREEN.z + 0.05
const SIDE_CENTER = new THREE.Vector3(SIDE.x, SIDE.y, SIDE.z - 0.03)
const OWN: Marks = {
  tag: new THREE.Vector3(0, TAG_Y, LABELS_Z), tagHeight: 0.15, branch: true, gist: new THREE.Vector3(0, GIST_Y, LABELS_Z),
  speech: new THREE.Vector3(0, SPEECH_Y, LABELS_Z), lay: SIDE_CENTER, layWidth: SIDE.width, minis: { x: 0.72, step: 0.15, y: DESK.height, z: -0.34 },
  twin: { x: 0.8, z: -0.3, turn: -0.4 },
}
/**
 * A worker's logbook right of its keyboard, clear of the cat's perch and its subagents: a thin notebook on a first
 * session, a binder growing a page block and a tab per session after (thickness and tabs stop growing at `most`).
 */
const BINDER = { x: 0.52, z: -0.2, turn: 0.14, width: 0.22, depth: 0.29, notebook: 0.012, thick: 0.02, page: 0.009, most: 9 }
const TABS = ['#e5484d', '#f5d90a', '#4f7cff', '#30a46c', '#e9a13a', '#c792ea', '#5fa8d3', '#f76b15']

/** The binder for `sessions`, built anew when the count changes; picked as a whole, up to a reach over it. */
export function dressBinder(desk: Desk, sessions: number) {
  const binder = desk.binder
  if (!binder || sessions === desk.binderSessions) return
  desk.binderSessions = sessions
  dispose(binder)
  binder.clear()
  const { width: w, depth: d } = BINDER
  const n = Math.min(sessions, BINDER.most)
  if (n === 1) {
    binder.add(block(w * 0.9, BINDER.notebook, d * 0.9, toon('#d8c7a2')))
    binder.add(block(0.012, BINDER.notebook + 0.002, d * 0.9, toon('#8a6d3b'), -w * 0.45 + 0.006, 0, 0))
  } else {
    const thick = BINDER.thick + (n - 1) * BINDER.page
    const cover = toon('#2f4a6b')
    const board = 0.005
    binder.add(block(w, board, d, cover), block(w, board, d, cover, 0, thick - board, 0))
    binder.add(block(0.02, thick, d, toon('#22364f'), -w / 2 + 0.01, 0, 0))
    binder.add(block(w - 0.03, thick - 2 * board, d - 0.02, toon('#f4f1ea'), 0.005, board, 0))
    for (let i = 0; i < n - 1; i++) {
      const y = board + ((i + 0.5) / (n - 1)) * (thick - 2 * board) - 0.003
      binder.add(block(0.022, 0.006, 0.035, toon(TABS[i % TABS.length]), w / 2 + 0.008, y, d / 2 - 0.03 - ((i * 0.045) % (d - 0.06))))
    }
  }
  const reach = 0.1
  binder.add(mesh(new THREE.BoxGeometry(w + 0.04, reach, d), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }), 0, reach / 2, 0))
  act(binder, { kind: 'binder', id: desk.card.id }, [])
}

/** The papers new to a worker, at the near edge in front of its mouse: where a reviewer beside it hands them over. */
const PAPERS = { x: -0.58, z: -0.42, sheet: { width: 0.26, depth: 0.18, thick: 0.012 }, most: 8, flag: 0.36 }

/** The worker in its chair at a desk's seat, its subagents, speech and the papers it hasn't read, around `furniture`. */
function seated(card: Card, models: Models, marks: Marks, furniture: Pick<Desk, 'group' | 'strip' | 'screen' | 'side' | 'binder'>): Desk {
  const look = lookOf(card.id)
  const w = avatar(models, look)
  w.root.position.copy(SEAT)
  furniture.group.add(w.root)
  const minis = new THREE.Group()
  furniture.group.add(minis)
  const speech = new THREE.Group()
  speech.position.copy(marks.speech)
  furniture.group.add(speech)
  const papers = new THREE.Group()
  papers.position.set(PAPERS.x, DESK.height, PAPERS.z)
  furniture.group.add(papers)
  const desk: Desk = {
    ...furniture, marks, card, models, look, worker: w.root, body: w.body, arms: w.arms, bulb: w.bulb, minis, speech, papers, papersCount: 0, binderSessions: 0,
    tagText: '', gistText: '', bubbleText: '', speechText: '', sideText: '', turn: 0, phase: random() * 10,
  }
  syncDesk(desk, card)
  return desk
}

export function makeDesk(card: Card, models: Models): Desk {
  const { group, strip, screen, chair } = furniture(models)
  chair.position.copy(SEAT)
  const side = sideMonitor()
  group.add(side.group)
  const binder = new THREE.Group()
  binder.position.set(BINDER.x, DESK.height, BINDER.z)
  binder.rotation.y = BINDER.turn
  group.add(binder)
  return seated(card, models, OWN, { group, strip, screen, side, binder })
}

/** A notebook open on a desk, its base's near edge toward -z; its screen faces the one sitting there. */
function notebook() {
  const group = new THREE.Group()
  const shell = toon('#39404c')
  group.add(block(NOTEBOOK.width, 0.02, NOTEBOOK.depth, shell))
  const strip = glowing('#ffffff')
  group.add(mesh(new THREE.BoxGeometry(NOTEBOOK.width * 0.4, 0.006, 0.02), strip, 0, 0.023, -NOTEBOOK.depth / 2 + 0.03))
  const lid = new THREE.Group()
  lid.position.set(0, 0.02, NOTEBOOK.depth / 2)
  lid.rotation.x = NOTEBOOK.tilt
  lid.add(block(NOTEBOOK.width, NOTEBOOK.lid, 0.016, shell, 0, 0, 0))
  const screen = mesh(new THREE.PlaneGeometry(NOTEBOOK.width - 0.04, NOTEBOOK.screen), new THREE.MeshBasicMaterial({ toneMapped: false }), 0, NOTEBOOK.lid / 2, -0.009)
  screen.rotation.y = Math.PI
  screen.userData.screen = true
  lid.add(screen)
  group.add(lid)
  group.position.set(0, DESK.height, NOTEBOOK.z)
  return { group, strip, screen }
}

/** Where the notebook's screen is, in its desk space: where a reviewer lays down what it held up. */
const NOTEBOOK_SCREEN = new THREE.Vector3(0, DESK.height + 0.02 + Math.cos(NOTEBOOK.tilt) * NOTEBOOK.lid / 2, NOTEBOOK.z + NOTEBOOK.depth / 2 + Math.sin(NOTEBOOK.tilt) * NOTEBOOK.lid / 2 - 0.02)
/**
 * A reviewer's tag hangs under its author's, in the same plane, so the two read as a pair from anywhere; what it says
 * floats over its head; its subagents stand on the floor at its left.
 */
const VISIT: Marks = {
  tag: new THREE.Vector3(0, TAG_Y - 0.2, LABELS_Z), tagHeight: 0.12, branch: false, speech: new THREE.Vector3(0, BUBBLE_Y + 0.25, -SEAT_OFFSET),
  lay: NOTEBOOK_SCREEN, layWidth: NOTEBOOK.width - 0.04, minis: { x: -0.42, step: -0.17, y: 0, z: -SEAT_OFFSET },
}

/** A reviewer beside its author: its own chair at the author's desk, and its notebook on it. */
export function makeVisitor(card: Card, models: Models): Desk {
  const group = new THREE.Group()
  const chair = instance(models.desk).part('chair')
  chair.position.copy(SEAT)
  group.add(chair)
  const book = notebook()
  group.add(book.group)
  return seated(card, models, VISIT, { group, strip: book.strip, screen: book.screen })
}

function relabel(desk: Desk, key: 'tag' | 'gist' | 'bubble', next: THREE.Sprite | undefined) {
  const old = desk[key]
  if (old) (desk.group.remove(old), dispose(old))
  if (next) desk.group.add(next)
  desk[key] = next
}

/** What a worker's monitor shows: its live screen while it runs. */
export const monitorOf = (card: Card) => (!card.live ? OFFLINE : screenTexture(`screen/${card.id}`))

export function showOnMonitor(desk: Desk, map: THREE.Texture) {
  if (desk.screen.material.map !== map) (desk.screen.material.map = map, (desk.screen.material.needsUpdate = true))
}

/** Dresses the desk for its card: what changed since the last board. */
export function syncDesk(desk: Desk, card: Card) {
  desk.card = card
  const color = statusColor(card)
  desk.bulb.color.set(color)
  desk.strip.color.set(color)
  desk.worker.visible = !card.stranded
  showOnMonitor(desk, monitorOf(card))

  const tagText = [card.callsign, statusName(card), desk.marks.branch && card.worktree && branchLine(card), pairLine(card)].filter(Boolean).join('  ·  ')
  if (`${tagText}|${card.attention}` !== desk.tagText) {
    desk.tagText = `${tagText}|${card.attention}`
    const tag = sprite(tagText, desk.marks.tagHeight, { color: onStatusColor(card), bg: color, px: 44 })
    tag.position.copy(desk.marks.tag)
    relabel(desk, 'tag', tag)
  }
  const gistAt = desk.marks.gist
  const gistText = gistAt ? glanceOf(card) : ''
  if (gistText !== desk.gistText) {
    desk.gistText = gistText
    const gist = gistText ? sprite(gistText, 0.15, { color: WORLD.ink, bg: WORLD.panel, px: 40, weight: 400, face: 'ui', shape: 'card' }) : undefined
    if (gist && gistAt) gist.position.copy(gistAt)
    relabel(desk, 'gist', gist)
  }
  const bubbleText = bubbleOf(card)
  if (bubbleText !== desk.bubbleText) {
    desk.bubbleText = bubbleText
    const bubble = bubbleText ? sprite(bubbleText, bubbleText === 'z' ? 0.2 : 0.28, { ...BUBBLE[bubbleText], weight: 900 }) : undefined
    bubble?.position.set(0.32, BUBBLE_Y, -SEAT_OFFSET)
    relabel(desk, 'bubble', bubble)
  }
  const said = speechOf(card)
  if (said.join('\n\n') !== desk.speechText) {
    desk.speechText = said.join('\n\n')
    dispose(desk.speech)
    desk.speech.clear()
    said.toReversed().reduce((y, text, i) => {
      const lines = speechLines(text)
      const height = SPEECH_LINE * lines.length
      const bubble = sprite(lines.join('\n'), height, { color: WORLD.ink, bg: WORLD.panel, px: 40, weight: 400, face: 'ui', shape: 'card' })
      bubble.material.opacity = i === 0 ? 1 : 0.7
      bubble.position.y = y + height / 2
      desk.speech.add(bubble)
      return y + height + SPEECH_GAP
    }, 0)
  }

  const running = card.stranded ? [] : card.subagentRuns.filter((run) => run.running)
  const fork = desk.marks.twin && running.find((run) => run.type === 'fork')
  if (fork?.id !== desk.twin?.run) seatTwin(desk, fork?.id)
  const minis = Math.min(running.filter((run) => run !== fork).length, 4)
  if (desk.minis.children.length !== minis) {
    dispose(desk.minis)
    desk.minis.clear()
    for (let i = 0; i < minis; i++) {
      const m = mini(desk.models, desk.look, `${card.id}/${i}`)
      const at = desk.marks.minis
      m.position.set(at.x + i * at.step, at.y, at.z)
      desk.minis.add(m)
    }
  }
}

/** A fork of the worker in the second chair: the worker's own look, a little smaller, its twin; none when `run` is. */
function seatTwin(desk: Desk, run: string | undefined) {
  if (desk.twin) (desk.group.remove(desk.twin.group), dispose(desk.twin.group))
  desk.twin = undefined
  const at = desk.marks.twin
  if (run === undefined || !at) return
  const group = new THREE.Group()
  const chair = instance(desk.models.desk).part('chair')
  chair.position.set(0, 0, 0)
  const twin = avatar(desk.models, desk.look)
  twin.root.scale.setScalar(0.85)
  group.add(chair, twin.root)
  group.position.set(SEAT.x + at.x, SEAT.y, SEAT.z + at.z)
  group.rotation.y = at.turn
  desk.group.add(group)
  desk.twin = { run, group, avatar: twin }
}

/** Puts what the worker last showed on its second monitor, ribboned NEW until you open it. */
export function dressSide(desk: Desk, latest: Shown | undefined, fresh: boolean) {
  const text = latest ? `${shownKey(latest)}|${fresh}` : ''
  if (!desk.side || text === desk.sideText) return
  desk.sideText = text
  desk.side.group.visible = Boolean(latest)
  desk.side.ribbon.visible = fresh
  if (!latest) return
  desk.side.screen.material.map = posterOf(desk.card, latest)
  desk.side.screen.material.needsUpdate = true
}

/** The worker stands it up for you: `latest` held over its head from `t` (seconds), then laid on its second monitor. */
export function holdUp(desk: Desk, latest: Shown, t: number) {
  lower(desk)
  const picture = new THREE.Sprite(new THREE.SpriteMaterial({ map: posterOf(desk.card, latest), toneMapped: false }))
  picture.scale.set(0.01, 0.01, 1)
  desk.group.add(picture)
  desk.raised = { picture, start: t }
}

/** Where the worker holds up a showing, in the world, and how wide: where a gallery's new picture flies from. */
export function heldUpAt(desk: Desk) {
  desk.group.updateWorldMatrix(true, false)
  return { from: desk.group.localToWorld(SEAT.clone().setY(HELD_UP.y)), w: HELD_UP.width, delay: RAISE.hold }
}

/**
 * The review notes new to the worker, a sheet each up to `PAPERS.most`, squared off a little differently each, with a
 * flag saying how many. The stack, up to its flag, is its own act: reading and sending are its verbs.
 */
export function dressPapers(desk: Desk, count: number) {
  if (count === desk.papersCount) return
  desk.papersCount = count
  dispose(desk.papers)
  desk.papers.clear()
  if (!count) return
  const paper = toon('#f4f1ea')
  const { width, depth, thick } = PAPERS.sheet
  for (let i = 0; i < Math.min(count, PAPERS.most); i++) {
    const sheet = block(width, thick, depth, paper, Math.sin(i * 2.3) * 0.015, i * thick, Math.cos(i * 1.7) * 0.012)
    sheet.rotation.y = Math.sin(i * 1.3) * 0.12
    desk.papers.add(sheet)
  }
  const flag = sprite(`${count} NEW`, 0.09, { color: '#fff', bg: WORLD.needs, px: 44 })
  flag.position.set(0, Math.min(count, PAPERS.most) * thick + PAPERS.flag, 0)
  desk.papers.add(flag)
  const reach = PAPERS.flag + 0.06
  desk.papers.add(mesh(new THREE.BoxGeometry(width, reach, depth), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }), 0, reach / 2, 0))
  act(desk.papers, { kind: 'papers', id: desk.card.id }, [])
}

/** The held picture's material goes with it; its texture is the second monitor's. */
function lower(desk: Desk) {
  if (!desk.raised) return
  desk.group.remove(desk.raised.picture)
  desk.raised.picture.material.dispose()
  desk.raised = undefined
}



/** Where the held picture is `k` seconds after it was raised, and how wide; undefined once it lies where `marks` lay it. */
function raisedAt(k: number, seat: THREE.Vector3, marks: Marks) {
  const head = seat.clone().setY(HELD_UP.y)
  if (k < RAISE.rise) {
    const e = k / RAISE.rise
    return { at: seat.clone().setY(1.3 + (HELD_UP.y - 1.3) * e), width: HELD_UP.width * e }
  }
  if (k < RAISE.hold) return { at: head.setY(HELD_UP.y + Math.sin((k - RAISE.rise) * 3) * 0.04), width: HELD_UP.width }
  if (k < RAISE.lay) {
    const e = (k - RAISE.hold) / (RAISE.lay - RAISE.hold)
    const smooth = e * e * (3 - 2 * e)
    return { at: head.lerp(marks.lay, smooth), width: HELD_UP.width + (marks.layWidth - HELD_UP.width) * smooth }
  }
}

const ease = (from: number, to: number, k: number) => from + (to - from) * Math.min(1, k)

/** Moves the held picture along its way, lowered at its end. Answers whether it is still held up. */
function poseRaised(desk: Desk, t: number, seat: THREE.Vector3) {
  if (!desk.raised) return false
  const k = t - desk.raised.start
  const raised = raisedAt(k, seat, desk.marks)
  if (!raised) return (lower(desk), false)
  desk.raised.picture.position.copy(raised.at)
  desk.raised.picture.scale.set(raised.width, raised.width / 1.6, 1)
  return k < RAISE.hold
}

/** Poses the worker for its status: typing, turned round to you, leaning back to watch, slumped, dozing. */
export function poseDesk(desk: Desk, t: number, dt: number) {
  const { card, body, arms } = desk
  const p = t + desk.phase
  const working = card.status === 'working' || card.status === 'booting'
  const asks = card.status === 'needs_input' || card.status === 'blocked'
  const holding = poseRaised(desk, t, SEAT)
  const turnTo = asks || holding ? Math.PI : card.waiting && card.status === 'done' ? Math.PI * 0.55 : 0
  desk.turn = ease(desk.turn, turnTo, dt * 5)
  body.rotation.y = desk.turn
  const hop = asks ? Math.max(0, Math.sin(p * 5)) * 0.12 : 0
  body.position.y = SEAT_Y + hop + (working ? Math.abs(Math.sin(p * 10)) * 0.025 : Math.sin(p * 1.3) * 0.01)
  body.rotation.x = card.status === 'failed' ? 0.4 : card.status === 'idle' ? 0.14 + Math.sin(p * 0.9) * 0.03 : card.status === 'watching' ? -0.12 : 0
  arms.forEach((a, i) => {
    a.rotation.x = holding ? -2.7 + Math.sin(p * 3 + i) * 0.08 : working ? Math.sin(p * 16 + i * Math.PI) * 0.25 : asks ? -1.6 + Math.sin(p * 6 + i) * 0.4 : 0
  })
  if (desk.twin) {
    const { body: twinBody, arms: twinArms } = desk.twin.avatar
    twinBody.position.y = SEAT_Y + Math.abs(Math.sin(p * 10 + 1.3)) * 0.025
    twinArms.forEach((a, i) => (a.rotation.x = Math.sin(p * 16 + 1.3 + i * Math.PI) * 0.25))
  }
  desk.minis.children.forEach((m, i) => (m.position.y = desk.marks.minis.y + Math.max(0, Math.sin(p * 6 + i * 1.7)) * 0.08))
  if (desk.bubble) desk.bubble.position.set(SEAT.x + 0.32, BUBBLE_Y + Math.sin(p * 3) * 0.05 + hop, SEAT.z)
  desk.bulb.color.set(statusColor(card)).multiplyScalar(card.waiting ? 0.6 + Math.abs(Math.sin(p * 4)) * 0.6 : 1)
}
