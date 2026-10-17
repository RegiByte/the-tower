import * as THREE from 'three'
import { act } from './acts.ts'
import { random } from './random.ts'
import type { Card } from './api.ts'
import { WORLD, branchLine, bubbleOf, pairLine, glanceOf, onStatusColor, speechLines, speechOf, statusColor, statusName } from './cards.ts'
import type { FlatSlot } from '../../kaykit/src/scene.ts'
import { DESK, SEAT_OFFSET } from './layout.ts'
import { ASLEEP, OFFLINE, OPEN_DESK, awayScreen, screenTexture } from './screens.ts'
import { avatar, seatedAt, type Avatar, type Look } from './avatar.ts'
import { WARDROBE } from './closet.ts'
import { CHAIR } from './chair.ts'
import { instance, type Models } from './models.ts'
import { lookOf, lookOfWorker } from './wardrobe.ts'
import { clipLength, pose, type Pose } from './rig.ts'
import { posterOf, shownKey, type Shown } from './showing.ts'
import { block, dispose, glowing, glows, mesh, sprite, toon } from './toon.ts'

/**
 * A desk and the worker at it, in desk space: the desk centered on the origin, its monitor at the far edge (+z)
 * facing back, the worker seated on the near side (-z) facing it. Built once per worker; a board update re-dresses
 * it (sync) and every frame poses it (pose). A reviewer sitting beside its author is one too, in its own desk space
 * at its place on the author's desk: a chair and a notebook, no desk of its own.
 */

const SCREEN = { width: 1.56, height: 0.98, y: 1.33, z: 0.32 }
const BUBBLE_Y = 1.8
const TAG_Y = SCREEN.y + SCREEN.height / 2 + 0.36
const GIST_Y = TAG_Y + 0.19
const SPEECH_Y = GIST_Y + 0.13
const SPEECH_LINE = 0.11
const SPEECH_GAP = 0.04
/** The worker's chair on the floor, at the keyboard. */
export const SEAT = new THREE.Vector3(0, 0, -SEAT_OFFSET)
const Y = new THREE.Vector3(0, 1, 0)
/** The second monitor, where the dressing's `side_monitor` slot stands it: its screen's size and its centre's height over the desk's floor. */
const SIDE = { width: 0.66, height: 0.41, y: 1.07 }
/**
 * A reviewer's notebook on its author's desk, off the reviewer's middle toward the author (`x`) so it stays on the
 * desk: its lid's screen shows the reviewer's terminal, facing the reviewer.
 */
const NOTEBOOK = { width: 0.44, depth: 0.36, lid: 0.34, screen: 0.3, tilt: 0.28 }
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
  /** The tag's place and height, and whether it names the worker's branch and whom it works with as well as its status. */
  tag: THREE.Vector3; tagHeight: number; branch: boolean; pair: boolean; gist?: THREE.Vector3; speech: THREE.Vector3; lay: THREE.Vector3; layWidth: number
  /** Where each subagent stands, in order: as many stand as there are places. */
  minis: THREE.Vector3[]
  /** Where a fork of the worker sits beside it, in a chair of its own (turned, radians, at its size); a reviewer beside its author seats none. */
  twin?: { at: THREE.Vector3; turn: number; size: number }
  /** Where the papers new to the worker are stacked. */
  papers: THREE.Vector3
  /** Where a cat sits to keep an eye on the worker. */
  perch: THREE.Vector3
}

/**
 * The places around a worker at its desk, in desk space, as the desk dressing's slots set them
 * (`prefabs/desk_dress.json`): its fork's chair, its subagents on the desk (`subagent_1…`), its logbook, the papers new to
 * it, its second monitor, the frames for what it showed (`trophy_1…`), the cat's perch, and a reviewer sitting beside
 * it (`reviewer`, where its chair stands), its notebook and its subagents (`visitor_1…`).
 */
export type DeskSlots = {
  twin: FlatSlot; subagents: FlatSlot[]; logbook: FlatSlot; papers: FlatSlot; side: FlatSlot; trophies: FlatSlot[]; perch: FlatSlot
  reviewer: FlatSlot; notebook: FlatSlot; visitors: FlatSlot[]
}

export function deskSlots(slots: FlatSlot[]): DeskSlots {
  const named = (name: string) => {
    const slot = slots.find((s) => s.name === name)
    if (!slot) throw new Error(`the desk dressing has no slot ${name}: add it to renderers/kaykit/scenes/prefabs/desk_dress.json`)
    return slot
  }
  const series = (base: string) => {
    const n = new RegExp(`^${base}_(\\d+)$`)
    const found = slots.filter((s) => n.test(s.name)).sort((a, b) => Number(n.exec(a.name)![1]) - Number(n.exec(b.name)![1]))
    if (!found.length) throw new Error(`the desk dressing has no slot ${base}_1: add it to renderers/kaykit/scenes/prefabs/desk_dress.json`)
    return found
  }
  return {
    twin: named('twin'), subagents: series('subagent'), logbook: named('logbook'), papers: named('papers'), side: named('side_monitor'), trophies: series('trophy'),
    perch: named('cat_perch'), reviewer: named('reviewer'), notebook: named('reviewer_notebook'), visitors: series('visitor'),
  }
}

/** From a desk's origin to the origin of a reviewer's own desk space beside it: its chair at `SEAT` there stands at the `reviewer` slot. */
export const besideOf = (slots: DeskSlots) => ({ x: slots.reviewer.at[0] - SEAT.x, z: slots.reviewer.at[2] - SEAT.z })

const DEG = Math.PI / 180
const vector = (at: readonly number[]) => new THREE.Vector3(at[0], at[1], at[2])

export type Desk = {
  group: THREE.Group
  marks: Marks
  card: Card
  models: Models
  look: Look
  avatar: Avatar
  /** The worker's chair, pulled back from `SEAT` while it sits down or stands up, and its seat and back, swivelling with the worker as it turns. */
  chair: THREE.Object3D
  swivel: THREE.Object3D
  strip: THREE.MeshBasicMaterial
  screen: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  /** The worker's subagents standing about its desk. */
  minis: { group: THREE.Group; avatars: Avatar[] }
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
  /** A reviewer's notebook on its author's desk, or a crew member's laptop at its meeting seat; a worker at its own desk has none. */
  notebook?: THREE.Group
  /** A crew member in a meeting room: at a seat, or standing (no chair, no laptop). */
  meeting?: { stand: boolean }
  /** How many subagents stood at the desk when last posed, and since when (sim seconds) the worker summoned the newest. */
  summoned: { count: number; at?: number }
  turn: number
  phase: number
}

/** A subagent: a small one of its worker's kind, a look of its own, wearing nothing. */
function mini(models: Models, parent: Look, id: string) {
  const own = lookOf(id, WARDROBE, models.catalogue)
  const look: Look = parent.species === 'bot' ? { ...parent, hue: own.species === 'bot' ? own.hue : parent.hue } : own.species === 'character' ? own : parent
  const bare = look.parts.filter((p) => models.catalogue.parts[p].from !== 'wear' && models.catalogue.parts[p].slot !== 'Gear')
  const a = avatar(models, { ...look, parts: bare }, WARDROBE)
  a.root.scale.setScalar(0.28)
  return a
}

/** A workstation's furniture: the desk, the strip along its near edge, and its monitor's screen. */
function furniture(models: Models) {
  const group = new THREE.Group()
  const model = instance(models.desk)
  group.add(model.root)
  const strip = glowing('#ffffff')
  group.add(mesh(new THREE.BoxGeometry(DESK.width - 0.1, 0.025, 0.02), strip, 0, DESK.height - 0.04, -DESK.depth / 2 - 0.005))
  const screen = mesh(new THREE.PlaneGeometry(SCREEN.width, SCREEN.height), glows(new THREE.MeshBasicMaterial({ toneMapped: false })), 0, SCREEN.y, SCREEN.z)
  screen.rotation.y = Math.PI
  screen.userData.screen = true
  group.add(screen)
  return { group, strip, screen, chair: model.part('chair') }
}

/** A small monitor on a neck and foot at `slot`, its screen facing -z like the big one's. */
function sideMonitor(slot: FlatSlot) {
  const group = new THREE.Group()
  const dark = toon('#1d2421')
  const neck = SIDE.y - SIDE.height / 2 - DESK.height
  group.add(block(SIDE.width + 0.05, SIDE.height + 0.05, 0.04, dark, 0, SIDE.y - DESK.height - SIDE.height / 2 - 0.025, 0))
  group.add(block(0.05, neck, 0.04, dark, 0, 0, 0.03))
  group.add(block(0.26, 0.02, 0.18, dark, 0, 0, 0.03))
  const screen = mesh(new THREE.PlaneGeometry(SIDE.width, SIDE.height), glows(new THREE.MeshBasicMaterial({ toneMapped: false })), 0, SIDE.y - DESK.height, -0.021)
  screen.rotation.y = Math.PI
  const ribbon = sprite('NEW', 0.085, { color: '#fff', bg: WORLD.accent, px: 44 })
  ribbon.position.set(SIDE.width / 2 - 0.06, SIDE.y - DESK.height + SIDE.height / 2 + 0.07, -0.05)
  group.add(screen, ribbon)
  group.position.copy(vector(slot.at))
  group.rotation.y = slot.turn * DEG
  group.visible = false
  return { group, screen, ribbon }
}

/**
 * A workstation nobody sits at. The open one, where the next worker on its floor sits, is lit and offers a hire. One
 * whose worker is in a meeting room says so on its monitor and its sign.
 */
export type Station = {
  group: THREE.Group
  strip: THREE.MeshBasicMaterial
  screen: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  /** The open one's sign, or where its worker is, where a worker's tag would be: read from anywhere on the floor. */
  sign?: THREE.Sprite
  /** What it shows: open, dark, or where its worker is. */
  shows: string | undefined
  /** The chair at its seat: the one a worker leaving this workstation stands up from. */
  chair: THREE.Object3D
}

export function makeStation(models: Models): Station {
  return { ...furniture(models), shows: undefined }
}

/** A workstation as it stands: `open` lit, or its worker `away` in a meeting room, else dark. */
export function syncStation(station: Station, open: boolean, away: { callsign: string; room: string } | undefined) {
  const shows = away ? `${away.callsign} · in ${away.room}` : open ? 'open' : 'dark'
  if (station.shows === shows) return
  station.shows = shows
  station.strip.color.set(open ? WORLD.accent : '#2a2f3a')
  if (station.sign) (station.group.remove(station.sign), dispose(station.sign))
  station.sign = away ? sprite(shows, 0.13, { color: WORLD.ink, bg: WORLD.panel, px: 44 }) : open ? sprite('OPEN DESK', 0.15, { color: '#fff', bg: WORLD.accent, px: 44 }) : undefined
  station.sign?.position.set(0, TAG_Y, SCREEN.z + 0.05)
  if (station.sign) station.group.add(station.sign)
  station.screen.material.map = away ? awayScreen(away.room) : open ? OPEN_DESK : ASLEEP
  station.screen.material.needsUpdate = true
}

const LABELS_Z = SCREEN.z + 0.05
const sideCenter = (side: FlatSlot) => new THREE.Vector3(side.at[0], side.at[1] - DESK.height + SIDE.y, side.at[2] - 0.03)
const ownMarks = (slots: DeskSlots): Marks => ({
  tag: new THREE.Vector3(0, TAG_Y, LABELS_Z), tagHeight: 0.15, branch: true, pair: true, gist: new THREE.Vector3(0, GIST_Y, LABELS_Z),
  speech: new THREE.Vector3(0, SPEECH_Y, LABELS_Z), lay: sideCenter(slots.side), layWidth: SIDE.width, minis: slots.subagents.map((s) => vector(s.at)),
  twin: { at: vector(slots.twin.at), turn: slots.twin.turn * DEG, size: slots.twin.size },
  papers: vector(slots.papers.at), perch: vector(slots.perch.at),
})
/**
 * A worker's logbook right of its keyboard, clear of the cat's perch and its subagents: a thin notebook on a first
 * session, a binder growing a page block and a tab per session after (thickness and tabs stop growing at `most`).
 */
const BINDER = { width: 0.22, depth: 0.29, notebook: 0.012, thick: 0.02, page: 0.009, most: 9 }
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

/**
 * The papers new to a worker, at the near edge in front of its mouse: where a reviewer beside it hands them over. They
 * are picked up to `above` over their flag, so they can be aimed at over the heads around them.
 */
const PAPERS = { sheet: { width: 0.26, depth: 0.18, thick: 0.012 }, most: 8, flag: 0.36, above: 0.4 }

/** The worker in its chair at a desk's seat, its subagents, speech and the papers it hasn't read, around `furniture`. */
function seated(card: Card, models: Models, marks: Marks, furniture: Pick<Desk, 'group' | 'chair' | 'swivel' | 'strip' | 'screen' | 'side' | 'binder'>): Desk {
  const look = lookOfWorker(card.id, card.callsign, WARDROBE, models.catalogue)
  const w = avatar(models, look, WARDROBE)
  w.root.position.copy(SEAT)
  if (w.gear) w.gear.visible = false
  furniture.group.add(w.root)
  const minis = { group: new THREE.Group(), avatars: [] }
  furniture.group.add(minis.group)
  const speech = new THREE.Group()
  speech.position.copy(marks.speech)
  furniture.group.add(speech)
  const papers = new THREE.Group()
  papers.position.copy(marks.papers)
  furniture.group.add(papers)
  const desk: Desk = {
    ...furniture, marks, card, models, look, avatar: w, minis, speech, papers, papersCount: 0, binderSessions: 0,
    tagText: '', gistText: '', bubbleText: '', speechText: '', sideText: '', summoned: { count: 0 }, turn: 0, phase: random() * 10,
  }
  syncDesk(desk, card)
  desk.summoned.count = desk.minis.avatars.length
  return desk
}

export function makeDesk(card: Card, models: Models, slots: DeskSlots): Desk {
  const { group, strip, screen, chair } = furniture(models)
  chair.position.copy(SEAT)
  const side = sideMonitor(slots.side)
  group.add(side.group)
  const binder = new THREE.Group()
  binder.position.copy(vector(slots.logbook.at))
  binder.rotation.y = slots.logbook.turn * DEG
  group.add(binder)
  return seated(card, models, ownMarks(slots), { group, chair, swivel: chair.getObjectByName('swivel')!, strip, screen, side, binder })
}

/** A notebook open on a desk, its base's near edge toward -z; its screen faces the one sitting there. */
function notebook(at: THREE.Vector3) {
  const group = new THREE.Group()
  const shell = toon('#39404c')
  group.add(block(NOTEBOOK.width, 0.02, NOTEBOOK.depth, shell))
  const strip = glowing('#ffffff')
  group.add(mesh(new THREE.BoxGeometry(NOTEBOOK.width * 0.4, 0.006, 0.02), strip, 0, 0.023, -NOTEBOOK.depth / 2 + 0.03))
  const lid = new THREE.Group()
  lid.position.set(0, 0.02, NOTEBOOK.depth / 2)
  lid.rotation.x = NOTEBOOK.tilt
  lid.add(block(NOTEBOOK.width, NOTEBOOK.lid, 0.016, shell, 0, 0, 0))
  const screen = mesh(new THREE.PlaneGeometry(NOTEBOOK.width - 0.04, NOTEBOOK.screen), glows(new THREE.MeshBasicMaterial({ toneMapped: false })), 0, NOTEBOOK.lid / 2, -0.009)
  screen.rotation.y = Math.PI
  screen.userData.screen = true
  lid.add(screen)
  group.add(lid)
  group.position.copy(at)
  return { group, strip, screen }
}

/** Where the notebook's screen is, in its desk space: where a reviewer lays down what it held up. */
const notebookScreen = (at: THREE.Vector3) => new THREE.Vector3(at.x, at.y + 0.02 + Math.cos(NOTEBOOK.tilt) * NOTEBOOK.lid / 2, at.z + NOTEBOOK.depth / 2 + Math.sin(NOTEBOOK.tilt) * NOTEBOOK.lid / 2 - 0.02)
/** A slot of its author's desk in a reviewer's own desk space. */
const besideAt = (slots: DeskSlots, slot: FlatSlot) => {
  const by = besideOf(slots)
  return vector(slot.at).sub(new THREE.Vector3(by.x, 0, by.z))
}
/**
 * A reviewer's tag hangs under its author's, in the same plane, so the two read as a pair from anywhere; what it says
 * floats over its head; its subagents stand where its author's desk has places for them (`visitor_1…`).
 */
const visitMarks = (slots: DeskSlots): Marks => ({
  tag: new THREE.Vector3(0, TAG_Y - 0.2, LABELS_Z), tagHeight: 0.12, branch: false, pair: true, speech: new THREE.Vector3(0, BUBBLE_Y + 0.25, -SEAT_OFFSET),
  lay: notebookScreen(besideAt(slots, slots.notebook)), layWidth: NOTEBOOK.width - 0.04, minis: slots.visitors.map((s) => besideAt(slots, s)),
  papers: vector(slots.papers.at), perch: vector(slots.perch.at),
})

/**
 * A crew member's place in a meeting room, in its own desk space (its chair at `SEAT`, the table or the counter before
 * it): its laptop on the table in front of it, its tag over its head, its subagents on the floor behind its chair, the
 * cat's perch beside the laptop. Standing at the table's foot, it has neither chair nor laptop.
 */
const MEETING = { laptop: new THREE.Vector3(0, DESK.height, SEAT.z + 0.67), tag: 2.1, perch: new THREE.Vector3(0.36, DESK.height, SEAT.z + 0.62) }
const meetingMarks = (stand: boolean): Marks => {
  const laptop = stand ? SEAT.clone().setY(1.25) : notebookScreen(MEETING.laptop)
  return {
    tag: new THREE.Vector3(0, MEETING.tag, SEAT.z), tagHeight: 0.1, branch: false, pair: false, speech: new THREE.Vector3(0, MEETING.tag + 0.16, SEAT.z),
    lay: laptop, layWidth: stand ? 0.3 : NOTEBOOK.width - 0.04, minis: [-0.36, -0.12, 0.12, 0.36].map((x) => new THREE.Vector3(x, 0, SEAT.z - 0.62)),
    papers: MEETING.laptop.clone().setX(-0.36), perch: MEETING.perch,
  }
}

/** A crew member at its place in a meeting room: its own chair and its laptop, whose screen is its terminal; standing, neither. */
export function makeSeat(card: Card, models: Models, stand: boolean): Desk {
  const group = new THREE.Group()
  if (stand) {
    const none = new THREE.Group()
    group.add(none)
    return { ...seated(card, models, meetingMarks(true), { group, chair: none, swivel: none, strip: new THREE.MeshBasicMaterial(), screen: mesh(new THREE.PlaneGeometry(0.01, 0.01), new THREE.MeshBasicMaterial({ visible: false })) }), meeting: { stand } }
  }
  const chair = instance(models.desk).part('chair')
  chair.position.copy(SEAT)
  group.add(chair)
  const laptop = notebook(MEETING.laptop)
  group.add(laptop.group)
  return { ...seated(card, models, meetingMarks(false), { group, chair, swivel: chair.getObjectByName('swivel')!, strip: laptop.strip, screen: laptop.screen }), notebook: laptop.group, meeting: { stand } }
}

/** A reviewer beside its author: its own chair at the author's desk, and its notebook on it. */
export function makeVisitor(card: Card, models: Models, slots: DeskSlots): Desk {
  const group = new THREE.Group()
  const chair = instance(models.desk).part('chair')
  chair.position.copy(SEAT)
  group.add(chair)
  const book = notebook(besideAt(slots, slots.notebook))
  group.add(book.group)
  return { ...seated(card, models, visitMarks(slots), { group, chair, swivel: chair.getObjectByName('swivel')!, strip: book.strip, screen: book.screen }), notebook: book.group }
}

/**
 * Places what the dressing's slots place around a worker again, as its desk is drawn now: a slot may stand elsewhere in
 * another of its states. A reviewer's are its author's desk's.
 */
export function situate(desk: Desk, slots: DeskSlots) {
  if (desk.meeting) return
  desk.marks = desk.side ? ownMarks(slots) : visitMarks(slots)
  desk.papers.position.copy(desk.marks.papers)
  desk.minis.avatars.forEach((m, i) => m.root.position.copy(desk.marks.minis[i]))
  if (desk.twin) (desk.twin.group.position.copy(desk.marks.twin!.at), (desk.twin.group.rotation.y = desk.marks.twin!.turn))
  if (desk.binder) (desk.binder.position.copy(vector(slots.logbook.at)), (desk.binder.rotation.y = slots.logbook.turn * DEG))
  if (desk.side) (desk.side.group.position.copy(vector(slots.side.at)), (desk.side.group.rotation.y = slots.side.turn * DEG))
  desk.notebook?.position.copy(besideAt(slots, slots.notebook))
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
  desk.avatar.bulb.color.set(color)
  desk.strip.color.set(color)
  desk.avatar.root.visible = !card.stranded
  showOnMonitor(desk, monitorOf(card))

  const tagText = [card.callsign, statusName(card), desk.marks.branch && card.worktree && branchLine(card), desk.marks.pair && pairLine(card)].filter(Boolean).join('  ·  ')
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
  const minis = Math.min(running.filter((run) => run !== fork).length, desk.marks.minis.length)
  if (desk.minis.avatars.length !== minis) {
    dispose(desk.minis.group)
    desk.minis.group.clear()
    desk.minis.avatars = Array.from({ length: minis }, (_, i) => {
      const m = mini(desk.models, desk.look, `${card.id}/${i}`)
      m.root.position.copy(desk.marks.minis[i])
      desk.minis.group.add(m.root)
      return m
    })
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
  const twin = avatar(desk.models, desk.look, WARDROBE)
  twin.root.scale.setScalar(at.size)
  if (twin.gear) twin.gear.visible = false
  group.add(chair, twin.root)
  group.position.copy(at.at)
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
  const flag = sprite(`${count} NEW`, 0.09, { color: '#fff', bg: WORLD.accent, px: 44 })
  flag.position.set(0, Math.min(count, PAPERS.most) * thick + PAPERS.flag, 0)
  desk.papers.add(flag)
  const reach = PAPERS.flag + PAPERS.above
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

/** How long after the user last typed to a resting worker it still talks back, seconds. */
const TALKING = 6

/**
 * What the worker in its chair is doing at `wall` (epoch seconds), `summoning` seconds after it summoned its newest
 * subagent: a showing held up over its head; talking back while you type to it; waving you over while it asks;
 * summoning; working (casting while it compacts, picking at a turn that seems stuck, else typing); flinching over the
 * `flinch` seconds after it fails, then slumped; else sitting back.
 */
function seatedPose(card: Card, p: number, wall: number, holding: boolean, summoning: number | undefined, flinch: number): Pose {
  const sit = { clip: 'Sit_Chair_Idle:rest', at: p } as const
  const working = card.status === 'working' || card.status === 'booting'
  if (holding) return { layers: [sit, { clip: 'Cheering:arms', at: p * 0.5 }] }
  if (!working && card.typedAt !== undefined && wall - card.typedAt / 1000 < TALKING) return { layers: [{ clip: 'UAL_Sitting_Talking_Loop', at: p }] }
  if (card.status === 'needs_input' || card.status === 'blocked') return { layers: [sit, { clip: 'Waving:arms', at: p }] }
  if (summoning !== undefined) return { layers: [sit, { clip: 'Ranged_Magic_Summon:arms', at: summoning, once: true }] }
  if (working && card.compacting) return { layers: [sit, { clip: 'Ranged_Magic_Spellcasting_Long:arms', at: p }] }
  if (working && card.stuck) return { layers: [sit, { clip: 'Lockpicking:arms', at: p }] }
  if (working) return { layers: [sit, { clip: 'Type', at: p }] }
  const failedFor = wall - card.enteredAt / 1000
  if (card.status === 'failed' && failedFor < flinch) return { layers: [sit, { clip: 'Hit_B:arms', at: failedFor, once: true }], lean: 0.45 }
  const lean = card.status === 'failed' ? 0.45 : card.status === 'idle' ? 0.22 + Math.sin(p * 0.9) * 0.04 : card.status === 'watching' ? -0.15 : 0
  return { layers: [{ clip: 'Sit_Chair_Idle', at: p }], lean }
}

/** What a crew member standing at the table's foot is doing: waving you over while it asks, cheering while it holds something up, else standing about. */
function standingPose(card: Card, p: number, holding: boolean): Pose {
  const stand = { clip: 'Idle_A:rest', at: p } as const
  if (holding) return { layers: [stand, { clip: 'Cheering:arms', at: p * 0.5 }] }
  if (card.status === 'needs_input' || card.status === 'blocked') return { layers: [stand, { clip: 'Waving:arms', at: p }] }
  return { layers: [{ clip: 'Idle_A', at: p }] }
}

/** Whether the worker holds a showing up over its head at `t`. */
const holdingUp = (desk: Desk, t: number) => desk.raised !== undefined && t - desk.raised.start < RAISE.hold

/** How long ago (sim seconds) the worker summoned its newest subagent, while it still summons. */
function summoning(desk: Desk, t: number) {
  const { at } = desk.summoned
  if (at === undefined || t - at >= clipLength(desk.models.cast, desk.avatar.rig, 'Ranged_Magic_Summon')) return undefined
  return t - at
}

/**
 * Moves the worker for its status: turned round to you while it asks or holds something up, hopping while it asks;
 * its bubble, its light and its subagents' hops. Its bones are posed apart (`poseRigs`), only where it is seen.
 */
export function poseDesk(desk: Desk, t: number, dt: number) {
  const { card, avatar: a } = desk
  const p = t + desk.phase
  const asks = card.status === 'needs_input' || card.status === 'blocked'
  const holding = poseRaised(desk, t, SEAT)
  const turnTo = asks || holding ? Math.PI : card.waiting && card.status === 'done' ? Math.PI * 0.55 : 0
  desk.turn = ease(desk.turn, turnTo, dt * 5)
  desk.swivel.rotation.y = desk.turn
  a.body.rotation.y = desk.turn
  if (desk.minis.avatars.length > desk.summoned.count) desk.summoned.at = t
  desk.summoned.count = desk.minis.avatars.length
  const hop = asks ? Math.max(0, Math.sin(p * 5)) * 0.08 : 0
  const off = desk.meeting?.stand ? new THREE.Vector3() : seatedAt(desk.models.cast, a, CHAIR).applyAxisAngle(Y, desk.turn)
  a.body.position.copy(off).add(new THREE.Vector3(0, hop, 0))
  if (desk.twin) desk.twin.avatar.body.position.copy(seatedAt(desk.models.cast, desk.twin.avatar, { y: CHAIR.y / desk.marks.twin!.size, back: CHAIR.back / desk.marks.twin!.size }))
  desk.minis.avatars.forEach((m, i) => (m.root.position.y = desk.marks.minis[i].y + Math.max(0, Math.sin(p * 6 + i * 1.7)) * 0.08))
  if (desk.bubble) desk.bubble.position.set(SEAT.x + 0.32, BUBBLE_Y + Math.sin(p * 3) * 0.05 + hop, SEAT.z)
  a.bulb.color.set(statusColor(card)).multiplyScalar(card.waiting ? 0.6 + Math.abs(Math.sin(p * 4)) * 0.6 : 1)
}

/**
 * Poses the bones at a desk at sim time `t`, `wall` on the wall clock (epoch seconds): the worker for what it does
 * (`seatedPose`), its twin typing, its subagents cheering.
 */
export function poseRigs(desk: Desk, t: number, wall: number) {
  const { cast } = desk.models
  const p = t + desk.phase
  const own = desk.meeting?.stand ? standingPose(desk.card, p, holdingUp(desk, t)) : seatedPose(desk.card, p, wall, holdingUp(desk, t), summoning(desk, t), clipLength(cast, desk.avatar.rig, 'Hit_B'))
  pose(cast, desk.avatar.rig, own, t)
  if (desk.twin) pose(cast, desk.twin.avatar.rig, { layers: [{ clip: 'Sit_Chair_Idle:rest', at: p + 1.3 }, { clip: 'Type', at: p + 1.3 }] }, t)
  desk.minis.avatars.forEach((m, i) => pose(cast, m.rig, { layers: [{ clip: 'Cheering', at: p + i * 0.4 }] }, t))
}
