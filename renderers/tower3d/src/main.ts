import * as THREE from 'three'
import { DRAFTS, discard as discardDraft, discardItem, keepUnsent, restore as restoreDraft, type Deleted, draftItem, draftsOf, edit, follow, keepsApart, leave, newDraft, openDraft, readDraft, save, sendable, settle, titleOf, type Draft, type DraftIo } from '../../../src/shared/drafts.ts'
import type { Call, Replies, Verb as ApiVerb, Verbs } from '../../../src/shared/api.ts'
import { HELD, byKind, heldWhy, keepsThreads, sentHome, holdFill, offerForKey, offersOf, reachOf, sendTargetOf, type Act, type ActOf, type ByKind, type Carried, type CatNames, type Held, type Offer, type Verb } from './acts.ts'
import { REVIEWS, THE_USER, sendText, threadId, unseenBy, type Anchor } from '../../../src/shared/reviews.ts'
import type { CheckoutState, FloorThread } from '../../../src/bridge/reviews.ts'
import type { NoteCalls } from '../../../src/bridge/verbs.ts'
import { changesFailed, changesOf, markViewed, onReviews, readChanges, rereadThread, threadFailed, threadOf, threadRead, type ChangesRead, type ThreadAt } from './reviews.ts'
import { BRIEF_MARKDOWN_KEY, briefCss, expandedSaid, openFolds, saidText, sessionWhen, type BriefMarkdown } from '../../../src/shared/brief.ts'
import { fenceText, markdownCss } from '../../../src/shared/markdown.ts'
import { faceInstalled, markdownSection, prefSections, settingsCss, settingsHtml, soundSection, wirePrefs } from '../../../src/shared/settings.ts'
import { placeOnOpen, watchTips } from '../../../src/shared/tips.ts'
import { toaster, toastsCss } from '../../../src/shared/toasts.ts'
import { ICON } from '../../../src/shared/icons.ts'
import { anchorOf, anchorSpot, changedFiles, changesHtml, fileKey, isFolded, marksToggled, drawPanel, panelsCss, livePick, pickAnchor, picked, spanned, watchPickDrag, reviewsHtml, spotSelector, STATS_ALL, statsHtml, statsQuery, failedHtml, fileCall, threadItemFiles, type StatsRange, type ThreadView } from '../../../src/shared/panels.ts'
import { pressing } from '../../../src/shared/press.ts'
import { shelfFiles, shelfText, shelfUrl, tower, type Board, type Card, type Floor, type ShelfSelf, type Wait } from './api.ts'
import { DISMISSED_KEY, REMIND_MS, boardErrorTitle, bubbleOf, claudeUntestedHtml, pictureOf, rendererUrl, renderersHtml, shelfKind, shelfPage, tidiedLine, RING_KEY, WORLD, ago, branchPlaceholder, cardsOf, dismissing, heededWaits, loudest, nextWait, ringing, soundOf, transitions, type Move, type Ring, type Sound, type SpawnForm, current, esc, findCard, gistLine, wordsOf, neighbours, sendTargets, shownTitle, spawnCall, spawnDefaults, spawnForm, spawnFormHtml, spawnSummaryHtml, statusColor, onStatusColor, threadCheckoutOf, workerIn, can, landedRow, tagOf, type DaemonVerb } from './cards.ts'
import { hueOf } from './avatar.ts'
import { drawCompass, pointers } from './compass.ts'
import { dressBinder, dressPapers, dressSide, holdUp, monitorOf, poseDesk, showOnMonitor, type Desk } from './desk.ts'
import { launch, tickFireworks } from './fireworks.ts'
import { beatAt, duck, pause, play, playing, setRoom } from './music.ts'
import { CATS, CAT_SPEED, boarded, catAt, chase, deskPerch, followerOf, guestAt, keepEyeOn, keepUp, leanIn, makeCat, nearDoors, purr, ring, roam, steer, tada, tagAlong, walkIn, walkOut, watcherOf, type Cat, type CatName } from './life.ts'
import { drawHands, fitHands, holdBeer, holdNote, makeHands, poseHands } from './hands.ts'
import { tintOf } from './palette.ts'
import { PET_IN, PET_MS, dropHearts, makeHearts, petProgress, petSpot, placeHearts, strokeAt } from './pet.ts'
import { idle, sharing, startShare, stopShare } from './tv.ts'
import { CABINET, DESK, EYE, bigScreens, cabinetOf, carBox, colliders, coreFront, deskOf, loungeSpots, deskSpot, inside, kioskOf, levelHeight, levelOfCard, levelOfShell, levelY, plan, type Box, type Plan } from './layout.ts'
import { loadModels } from './models.ts'
import { fillLayer, loadKit, zonesPlaced, type Kit, type Placed } from './kit.ts'
import { hangOn, levelsShown, onLevel, showLevels } from './levels.ts'
import { THEMES, bare, dress, itemOf, type Placement } from './dress.ts'
import { cityModel, furnish } from './zones.ts'
import { animateDanceFloors, animateParty, placeGuest } from './party.ts'
import { isScreenTexture, isStillScreen, keepScreens, paintScreens, replayTexture, screenPathOf } from './screens.ts'
import { isMarkdown, isPosterTexture, isVideo, keepPosters, pictured, playFilms, shownHref, shownKey, type Shown } from './showing.ts'
import { closeTerm, mountTerm, watchPanelSize } from './term.ts'
import { SHELL_SCROLLBACK } from '../../../src/shared/terms.ts'
import { dispose, loadFaces } from './toon.ts'
import { fillBooks } from './room.ts'
import { activityHtml, keptFileHtml, keptHeadHtml, keptTextHtml, archiveListHtml, archiveSideHtml, askHtml, drawerSideHtml, logbookBriefHtml, logbookHeadHtml, logbookHtml, logbookTabsHtml, sessionsHtml, stampHtml, deskHeadHtml, detailsHtml, movesHtml, deskTabsHtml, directoryHtml, docHeadHtml, statsHeadHtml, docHtml, draftHeadHtml, draftNoteHtml, elevatorHtml, floorHtml, floorSignHtml, gameHeadHtml, gameHtml, hudHtml, levelForKey, pictureHeadHtml, promptHtml, shellHeadHtml, shownHtml, shownTab, threadHeadHtml, type LogbookTab } from './ui.ts'
import { commandOf, keymapSheetHtml, type Keys } from '../../../src/shared/keymap.ts'
import { move, releaseKeys, takeTurn, type Turn } from './input.ts'
import { random } from './random.ts'
import { wallNow } from './clock.ts'
import { installDoor } from './door.ts'
import { reducedMotion } from '../../../src/shared/prefs.ts'
import { FIXTURE, fixtureBoards, readArchive, readConversations } from './fixtures.ts'
import { archiveOf, archiveRead, drawersAt, readArchives, readFloorArchive } from './archive.ts'
import { poseFiling } from './filing.ts'
import { CABINETS, DANCE, DESKS, FILINGS, GALLERY, GUESTS, NOTES, PIGEONHOLES, RUNNING, STATIONS, WALLS, reconcile } from './layers.ts'
import { fitPicture, placePicture } from './gallery.ts'
import { noteText, noteTitle, onTitles, pruneNoteTitles } from './notes.ts'
import { SCREEN, onGameTitles, pruneGameTitles } from './arcade.ts'
import { GAMES, gameItem } from './games.ts'
import { keptText, keptTitle, onKeptTitles, pruneKeptTitles } from './kept.ts'
import { itemKind, itemPath, itemsCss, keptOf, readsText } from '../../../src/shared/items.ts'
import type { FloorCollection, FloorItem } from '../../../src/bridge/board.ts'
import { camera, canvas, flyPlane, orbit, renderer, scene, tickOutside } from './stage.ts'
import { s, type GamePanel, type Panel, type Spot, type Standing, type Threads } from './state.ts'
import { aim, fall, jump, look, walk, type Walker } from './walker.ts'
import { boardFace, buildWorld, paintDirectory, setDoors, setLimits, setShellTitles } from './world.ts'

const $ = (id: string) => document.getElementById(id)!
const show = (id: string, on: boolean) => $(id).classList.toggle('hidden', !on)
/**
 * A document drawn in a frame follows the viewer's appearance: drawn again when the record changes, or the system's
 * scheme while the viewer chose none.
 */
const onAppearance = (fn: () => void) => (tower.onScheme(() => tower.prefs.get().scheme || fn()), tower.prefs.on(fn))

document.head.append(Object.assign(document.createElement('style'), { textContent: panelsCss + briefCss + markdownCss + settingsCss + toastsCss + itemsCss }))
watchTips(document)

const directory = boardFace(640, 480)
const statsBoard = boardFace(640, 400)

/**
 * Where each stream's monitors stand in what can be seen, in world space: a worker's screen is on its desk and on the
 * control room's video wall. Your level's, or every level's over the city.
 */
let screensAt: { plan?: Plan; level: number; overview: boolean; spots: Map<string, THREE.Vector3[]> } = { level: -1, overview: false, spots: new Map() }
function screensHere() {
  const overview = s.view === 'overview'
  if (screensAt.plan === s.plan && screensAt.level === s.me.level && screensAt.overview === overview) return screensAt.spots
  const spots = new Map<string, THREE.Vector3[]>()
  const levels = overview ? [...s.levels.map((l) => l.group), ...s.world!.levels] : [s.levels[s.me.level]?.group, s.world!.levels[s.me.level]]
  for (const group of levels) {
    group?.traverse((o) => {
      const map = o instanceof THREE.Mesh ? (o.material as THREE.MeshBasicMaterial).map : undefined
      const path = map && screenPathOf(map)
      if (path) spots.set(path, [...(spots.get(path) ?? []), o.getWorldPosition(new THREE.Vector3())])
    })
  }
  screensAt = { plan: s.plan, level: s.me.level, overview, spots }
  return spots
}

const screenDistance = (path: string) => {
  const at = screensHere().get(path)
  return at && Math.min(...at.map((p) => p.distanceTo(camera.position)))
}

/** What the walker bumps into on its level. */
let boxesAt: { plan?: Plan; level: number; boxes: Box[] } = { level: -1, boxes: [] }
function boxesHere() {
  if (boxesAt.plan === s.plan && boxesAt.level === s.me.level) return boxesAt.boxes
  boxesAt = { plan: s.plan, level: s.me.level, boxes: colliders(s.plan, here()) }
  return boxesAt.boxes
}

const here = () => s.plan.levels[s.me.level]
const keepTexture = (t: THREE.Texture) => isScreenTexture(t) || isStillScreen(t) || isPosterTexture(t) || t === directory.texture || t === statsBoard.texture
const discard = (o: THREE.Object3D) => (o.removeFromParent(), dispose(o, keepTexture))

/** Tells what just happened, with an action that follows it up when given (`/toasts.js`). */
const toast = toaster($('toasts'))

const call = <K extends Parameters<typeof tower.call>[0]>(verb: K, body: Parameters<typeof tower.call<K>>[1]) =>
  tower.call(verb, body).catch((err: Error) => (toast(err.message), undefined))

/** A call the board offers, with the fields the user supplied. */
const offered = <V extends ApiVerb>(c: Call<V>, fields?: Partial<Verbs[V]>) => tower.run(c, fields).catch((err: Error) => (toast(err.message), undefined))

/** Destructive buttons ask on their own label and act on a second click: a shelf page may not open `confirm()`. */
const ARM_MS = 3000
/** Why a daemon verb is held back now, for the panels' buttons. */
const held = (verb: DaemonVerb) => heldWhy(s.board!, s.lost, verb)
const isArmed = (key: string) => s.armed?.key === key && Date.now() < s.armed.until
function confirmed(key: string) {
  if (isArmed(key)) return (s.armed = undefined, true)
  s.armed = { key, until: Date.now() + ARM_MS }
  setTimeout(renderPanel, ARM_MS)
  renderPanel()
  return false
}

/** The drafts collection over the renderer API. */
const draftIo: DraftIo = { call: tower.call, read: noteText, failed: (err) => toast(err.message) }

/** What changes the building's shape: shell titles and limit readings are redrawn on their own. */
const structureKey = (pl: Plan, b: Board) => JSON.stringify([
  pl.width, pl.depth, b.hostUp, new Date(wallNow()).getMonth(),
  pl.levels.map((l) => [l.kind, l.name, l.kind === 'floor' ? [l.floor.color, l.floor.shelf, l.kiosks.map((k) => k.shell.id), Boolean(l.cork), Boolean(l.arcade?.cabinets.length)] : 0]),
  b.rateLimits.map((r) => r.kind),
])
const limitsKey = (b: Board) => JSON.stringify([b.rateLimits, b.today])

function rebuildWorld() {
  if (s.world) discard(s.world.group)
  s.rebuilds++
  s.world = buildWorld(s.plan, s.board!, directory, statsBoard, s.models!)
  scene.add(s.world.group)
  for (const level of s.plan.levels) fillLayer(s.kit!, onLevel(level.index).zones, zonesPlaced(s.kit!, level))
  for (const root of s.levels.slice(s.plan.levels.length)) fillLayer(s.kit!, root.zones, [])
  const built = s.world
  for (const b of s.world.bookcases) {
    shelfFiles(b.project, b.n).then((files) => s.world === built && fillBooks(b, files, built.pickables), (err: Error) => toast(`shelf: ${err.message}`))
  }
}

/** A firework over the roof party for every turn finished since the last board, in its worker's color: over its project's dance floor, else the roof's middle. */
function celebrate(next: Board) {
  const roof = s.plan.levels.at(-1)!
  const floors = roof.kind === 'roof' ? roof.floors : []
  for (const c of cardsOf(next)) {
    if (s.lastStatus.get(c.id) !== 'working' || (c.status !== 'done' && c.status !== 'idle')) continue
    const at = floors.find((f) => f.projects.includes(c.project)) ?? { x: 0, z: 0 }
    launch(scene, new THREE.Vector3(at.x + (random() - 0.5) * 8, roof.y + 1, at.z + (random() - 0.5) * 6), hueOf(c.id))
  }
  s.lastStatus = new Map(cardsOf(next).map((c) => [c.id, c.status] as const))
}

/** Where you stood, kept by the tower for this page so a reload puts you back, with the music on or off and what you've seen shown. */
type Kept = { spot: Spot; muted: boolean; fps?: boolean; seen?: string[] }
/** How many showings opened are kept: enough to cover every worker on duty. */
const SEEN_KEPT = 300
/** Nothing seen was kept (a first visit): what is shown already counts as seen, and only what comes after is new. */
let primeSeen = false

const everyShown = (b: Board) => cardsOf(b).flatMap((c) => c.shown.map((sh) => ({ c, sh, key: shownKey(sh) })))
const isFresh = (c: Card, sh: Shown) => !s.seenShown.has(shownKey(sh))
/** The showings you have yet to open, of workers at a desk, newest first. */
const freshShown = () => everyShown(s.board!).filter(({ c, sh }) => deskOf(s.plan, c.id) && isFresh(c, sh)).sort((a, b) => b.sh.at - a.sh.at)

/**
 * Each desk's second monitor, its worker's latest showing, ribboned while any of its showings is new to you; and every
 * gallery, its pictures ribboned while new.
 */
function dressSides() {
  for (const desk of s.desks.values()) dressSide(desk, desk.card.shown.at(-1), desk.card.shown.some((sh) => isFresh(desk.card, sh)))
  reconcile(GALLERY, s.pictures, s.plan, discard)
  keepPosters(new Set([...[...s.desks.values()].flatMap((d) => d.card.shown.slice(-1).map((sh) => shownKey(sh))), ...s.pictures.keys()]))
}

/** The review notes new to each worker, stacked on its own desk, beside its logbook; a reviewer beside its author has neither. */
function dressAllPapers() {
  for (const desk of s.desks.values()) {
    dressPapers(desk, desk.side ? (desk.card.unseen ?? 0) : 0)
    dressBinder(desk, desk.card.lineage.length)
  }
}

/** The replayed past session on its worker's monitor, every other monitor on its own screen; a replay whose worker left ends. */
function dressReplays() {
  if (s.replay && !s.desks.has(s.replay.id)) s.replay = undefined
  for (const desk of s.desks.values()) {
    const session = s.replay?.id === desk.card.id ? desk.card.lineage.find((l) => l.id === s.replay!.session) : undefined
    showOnMonitor(desk, session ? replayTexture(`screen/${session.id}`, `REPLAY · ${sessionWhen(session.startedAt)}`) : monitorOf(desk.card))
  }
  screensAt = { ...screensAt, plan: undefined }
}

const archiveFailed = (err: Error) => toast(`The archive can't be read: ${err.message}`)

/** An archive read landed or failed: the cabinets file it, and a panel listing it shows it. */
function archiveArrived() {
  reconcile(FILINGS, s.filings, s.plan, discard)
  renderPanel()
}

/** A showing new since the last board: its worker holds it up, and you hear it; at its desk, it opens. */
function shownArrives(c: Card, sh: Shown) {
  const desk = s.desks.get(c.id)
  if (desk) holdUp(desk, sh, s.simNow / 1000)
  tada()
  if (s.panel?.kind === 'desk' && s.panel.id === c.id) return openShown(c.id, sh)
  toast(`${c.callsign} showed you “${shownTitle(sh)}” · V to look`)
}

function noticeShown(next: Board) {
  const all = everyShown(next)
  if (!s.first) for (const { c, sh, key } of all) if (!s.lastShown.has(key)) shownArrives(c, sh)
  s.lastShown = new Set(all.map(({ key }) => key))
}

/** Seen again, it moves last: the oldest are the first to go once more than `SEEN_KEPT` are kept. */
function see(sh: Shown) {
  s.seenShown.delete(shownKey(sh))
  s.seenShown.add(shownKey(sh))
  dressSides()
  renderHud()
}

/** To the newest showing you have yet to open, at its worker's desk. */
function lookAtNew() {
  const newest = freshShown()[0]
  if (!newest) return toast('Nothing new shown to you')
  if (s.panel?.kind === 'desk' && s.panel.id === newest.c.id) return openShown(newest.c.id, newest.sh)
  goShown(newest.c.id, newest.sh.target)
}
const spotOf = ({ level, x, z, yaw, pitch }: Walker): Spot => ({ level, x, z, yaw, pitch })

/** Every project's colour as `#rrggbb`, by id. */
const tintsOf = (b: Board) => Object.fromEntries(b.floors.map((f) => [f.id, tintOf(f)]))
/** The lobby's frame: level space at the ground. */
const LOBBY = new THREE.Matrix4()

/** A workstation's placements in its desk's frame. */
function inDesk(kit: Kit, desk: THREE.Object3D, placements: Placement[]): Placed[] {
  desk.updateMatrix()
  return placements.map((p) => ({ item: itemOf(p, kit.models.get(p.model)!), frame: desk.matrix, theme: THEMES[p.model] }))
}

/** Every level's workstations in their KayKit models, and the city model in the lobby. */
function dressLevels(board: Board) {
  const month = new Date(wallNow()).getMonth()
  const placed = s.plan.levels.map((level): Placed[] => {
    if (level.kind === 'lobby') return cityModel(s.plan, tintsOf(board)).map(({ item, theme }) => ({ item, frame: LOBBY, theme }))
    if (level.kind === 'roof') return []
    return [
      ...level.desks.filter((slot) => !slot.beside).flatMap((slot) => inDesk(s.kit!, s.desks.get(slot.card.id)!.group, dress(slot.card, month))),
      ...level.free.flatMap((slot) => inDesk(s.kit!, s.stations.get(`${level.floor.id}/${slot.n}`)!.group, bare())),
    ]
  })
  placed.forEach((list, i) => fillLayer(s.kit!, onLevel(i).dressing, list))
  for (const root of s.levels.slice(placed.length)) fillLayer(s.kit!, root.dressing, [])
}

/** The board's failure stays over the last board drawn, until the tower sends a board again. */
function onBoardError(err: Error & { code: string }) {
  $('board-error').querySelector('b')!.textContent = boardErrorTitle(err.code)
  $('board-error').querySelector('span')!.textContent = err.message
  show('board-error', true)
  s.lost = err.code === 'disconnected'
  renderPanel()
}

function onBoard(next: Board, at: ShelfSelf | undefined) {
  show('board-error', false)
  s.lost = false
  const sheet = keymapSheetHtml(sheetKeys(next.keys))
  if ($('keys-sheet').innerHTML !== sheet) $('keys-sheet').innerHTML = sheet
  const { began } = transitions(s.board, next)
  s.boards++
  s.board = next
  s.self = at
  s.plan = furnish(plan(next, new Date(wallNow()).setHours(0, 0, 0, 0)), s.kit!.prefabs, tintsOf(next), new Date(wallNow()).getMonth())
  celebrate(next)
  if (began.length) s.waitedAt = s.simNow
  ringFor(began)
  readHeed()
  const key = structureKey(s.plan, next)
  if (key !== s.worldKey) (s.worldKey = key, s.limitsKey = limitsKey(next), rebuildWorld())
  if (limitsKey(next) !== s.limitsKey) (s.limitsKey = limitsKey(next), setLimits(s.world!, s.plan, next.rateLimits, next.today))
  setShellTitles(s.world!, next.shells)
  reconcile(DESKS, s.desks, s.plan, discard)
  reconcile(STATIONS, s.stations, s.plan, discard)
  dressLevels(next)
  reconcile(WALLS, s.walls, s.plan, discard)
  reconcile(RUNNING, s.running, s.plan, discard)
  reconcile(PIGEONHOLES, s.pigeonholes, s.plan, discard)
  reconcile(FILINGS, s.filings, s.plan, discard)
  readArchives(next, archiveArrived, archiveFailed)
  dressAllPapers()
  reconcile(DANCE, s.dance, s.plan, discard)
  reconcile(GUESTS, s.guests, s.plan, discard)
  if (s.first && primeSeen) for (const { key } of everyShown(next)) s.seenShown.add(key)
  dressSides()
  noticeShown(next)
  pruneNoteTitles(next.floors)
  pruneKeptTitles(next.floors)
  syncNotes()
  pruneGameTitles(next.floors)
  syncCabinets()
  if (s.carrying && !draftItem(next.floors, s.carrying.project, s.carrying.id)) (toast('The draft in your hand is gone'), drop())
  if (s.draft?.id) followDraft(s.draft)
  keepScreens(new Set([
    ...s.plan.levels.flatMap((l) => (l.kind === 'floor' ? l.desks.filter((d) => d.card.live).map((d) => `screen/${d.card.id}`) : [])),
    ...next.shells.map((sh) => `shell/${sh.id}`),
    ...(s.replay ? [`screen/${s.replay.session}`] : []),
  ]))
  dressReplays()
  paintDirectory(directory, s.plan)
  if (s.first) {
    for (const name of CATS) {
      const cat = makeCat(s.models!, name)
      s.cats.set(name, cat)
    }
    s.me = { x: 0, z: coreFront(s.plan) + 10.5, yaw: Math.PI, pitch: -0.05, level: 0, y: 0, vy: 0, ...s.saved }
    if (location.hash === '#tv') {
      const couch = loungeSpots(s.plan).couch
      s.me = { ...s.me, level: 0, x: couch.x, z: couch.z - 1.4, yaw: Math.PI, pitch: 0.12 }
      history.replaceState(null, '', location.pathname)
    }
    show('paused', !captured())
  }
  const wasFirst = s.first
  s.first = false
  if (s.me.level >= s.plan.levels.length) s.me = { ...s.me, level: 0 }
  renderHud()
  renderPanel()
  renderElevator()
  if (s.pendingDesk && deskOf(s.plan, s.pendingDesk)) goDesk(s.pendingDesk)
  if (s.pendingShell && kioskOf(s.plan, s.pendingShell)) goShell(s.pendingShell)
  if (wasFirst) pictured().then(built)
}

/**
 * Music unless you turned it off, kept with your spot, and never over a game, which may play its own. The door plays
 * none: an agent's browser has no one to hear it.
 */
const startMusic = () => !s.muted && !s.doorMode && s.panel?.kind !== 'game' && !playing() && play()
function toggleMusic() {
  s.muted = !s.muted
  if (s.muted) pause()
  else startMusic()
  renderHud()
}

let hudKey = ''
function renderHud() {
  const html = hudHtml(s.board!, here(), { music: !s.muted, sharing: sharing(), fresh: freshShown().length, waits: heededWaits(s.board!, s.heed) })
  if (html !== hudKey) ($('hud').innerHTML = hudKey = html)
  drawSettings()
  const notes = claudeUntestedHtml(s.board!) ?? ''
  if (notes !== $('hud-notes').innerHTML) $('hud-notes').innerHTML = notes
}

function renderElevator() {
  const inCar = s.view === 'walk' && (s.ride !== undefined || inside(carBox(s.plan), s.me.x, s.me.z))
  show('elevator', inCar)
  if (inCar) $('elevator').innerHTML = elevatorHtml(s.plan, s.ride ? s.ride.to : s.me.level, s.ride !== undefined)
}

tower.get('origins').then((o) => (s.origins = o), (err: Error) => toast(`origins: ${err.message}`))

function renderPanel() {
  const { board, panel } = s
  if (!board || !panel) return
  if (panel.kind === 'desk') {
    const c = findCard(board, panel.id)
    if (!c) return unfocus()
    $('desk-head').innerHTML = deskHeadHtml(c, board.floors.find((f) => f.id === c.project), isArmed, held, tower.framed)
    $('desk-tabs').innerHTML = deskTabsHtml(c, board.floors.find((f) => f.id === c.project)!, s.deskTab, (sh) => isFresh(c, sh))
    if (s.deskTab === 'reviews') drawThread($('desk-reviews'), deskThread(c))
    if (s.deskTab === 'changes') drawChanges(c)
    $('desk-activity').innerHTML = activityHtml(c)
    $('desk-activity').dataset.tip = gistLine(c)
    $('desk-moves').innerHTML = movesHtml(board, c, s.heed)
    $('desk-details').innerHTML = detailsHtml(board, c)
    $('desk-ask').innerHTML = askHtml(c)
    show('desk-ask', c.status === 'needs_input' || c.status === 'blocked')
  }
  if (panel.kind === 'shell') {
    const id = panel.id
    const sh = board.shells.find((sh) => sh.id === id)
    if (!sh) return unfocus()
    show('desk-ask', false)
    for (const el of ['desk-tabs', 'desk-activity', 'desk-moves', 'desk-details']) $(el).innerHTML = ''
    $('desk-head').innerHTML = shellHeadHtml(sh, board.floors.find((f) => f.id === sh.project), isArmed(`shell ${id}`))
  }
  if (panel.kind === 'floor') {
    const id = panel.id
    const f = board.floors.find((f) => f.id === id)
    if (!f) return closeSide()
    $('side').innerHTML = floorHtml(board, f, s.origins, tower.framed, isArmed, held, panel.tray)
  }
  if (panel.kind === 'archive') {
    const f = board.floors.find((f) => f.id === panel.id)
    if (!f) return closeSide()
    if (!$('side').querySelector(`[data-archive-of="${CSS.escape(f.id)}"]`)) $('side').innerHTML = archiveSideHtml(f)
    const { count, html } = archiveListHtml(board, f, archiveRead(f.id), panel.words, held)
    $('archive-count').textContent = count
    if ($('archive-list').innerHTML !== html) $('archive-list').innerHTML = html
  }
  if (panel.kind === 'directory') $('side').innerHTML = directoryHtml(s.plan, held)
  if (panel.kind === 'drawer') {
    const f = board.floors.find((f) => f.id === panel.project)
    const d = drawersAt(panel.project)?.[panel.n]
    if (!f || !d) return closeSide()
    $('side').innerHTML = drawerSideHtml(f, d)
  }
  if (panel.kind === 'logbook') {
    const c = findCard(board, panel.card.id) ?? panel.card
    $('doc-head').innerHTML = logbookHeadHtml(c, board.floors.find((f) => f.id === c.project))
    $('logbook-tabs').innerHTML = logbookTabsHtml(panel.tab)
    show('logbook-shot', panel.tab === 'screen')
    show('logbook-text', panel.tab === 'brief')
    $('logbook-sessions').innerHTML = sessionsHtml(c, panel.on, panel.threads)
    $('logbook-text').innerHTML = logbookBriefHtml(c, panel.threads, briefLook($('logbook-text')))
  }
  if (panel.kind === 'draft') {
    const d = s.draft!
    const f = board.floors.find((f) => f.id === d.project)
    if (!f || !draftsOf(f)) return dropDraftPanel()
    $('draft-head').innerHTML = draftHeadHtml(f, d, held, Boolean(s.carrying))
    $('draft-note').innerHTML = d.conflict !== undefined ? draftNoteHtml : ''
    show('draft-note', d.conflict !== undefined)
  }
  if (panel.kind === 'thread') {
    const f = board.floors.find((f) => f.id === panel.project)
    const t = f?.threads.find((t) => t.checkout === panel.checkout)
    if (!t) return closeDoc()
    $('doc-head').innerHTML = threadHeadHtml(f!, panel.checkout)
    drawThread($('doc-body'), floorThread(panel.project, t))
  }
  if (panel.kind === 'stats') {
    $('doc-head').innerHTML = statsHeadHtml()
    const projects = board.floors.map((f) => ({ id: f.id, label: f.name, color: f.color }))
    const tabs = [{ id: STATS_ALL, label: 'Overview' }, ...projects.map(({ id, label }) => ({ id, label }))]
    const { read: stats, failed, at, range, scope } = s.stats
    drawPanel($('doc-body'), statsHtml({ stats, failed, at, range, projects, tabs, scope: tabs.some((t) => t.id === scope) ? scope : STATS_ALL }), {})
    showSince($('doc-body'))
  }
  if (panel.kind === 'picture') {
    const picture = pictureOf(board, panel.id, panel.target)
    if (!picture) return closeDoc()
    $('doc-head').innerHTML = pictureHeadHtml(picture.worker, picture.card?.onDuty ?? false, picture.shown, `#${hueOf(panel.id).getHexString()}`)
  }
  if (panel.kind === 'game') {
    const f = board.floors.find((f) => f.id === panel.project)
    const at = cabinetOf(s.plan, panel.project, panel.id)
    if (!f || !gameItem([f], panel.project, panel.id) || !at) return closeGame()
    if (at.cabinet.x !== panel.x) frameCabinet(panel, at)
    $('game-head').innerHTML = gameHeadHtml(f, panel.project, panel.id)
  }
  if (panel.kind === 'doc') {
    const f = board.floors.find((f) => f.id === panel.project)
    const entry = f?.shelf?.[panel.n]
    if (!f || !entry) return closeDoc()
    $('doc-head').innerHTML = docHeadHtml(f, entry, tower.framed)
  }
  if (panel.kind === 'kept') {
    const f = board.floors.find((f) => f.id === panel.project)
    const c = f?.collections.find((c) => c.id === panel.collection)
    const item = c?.items.find((i) => i.id === panel.id)
    if (!f || !c || !item) return (closeDoc(), toast('The item was deleted'))
    $('doc-head').innerHTML = keptHeadHtml(f, c, item, keptTitle(f.id, c.id, item), isArmed(`kept ${panel.id}`))
    if (panel.drawn !== item.modifiedAt) drawKept(panel, c, item)
  }
}

const locked = () => document.pointerLockElement === canvas
const captured = () => locked() || s.doorHeld
/** The pause card stands for the free mouse only while nothing else holds it: a panel, the spawn dialog, or P. */
const showPaused = () => show('paused', !captured() && s.view === 'walk' && !s.panel && !s.still && !spawn.open)

function captureChanged() {
  releaseKeys()
  if (captured()) s.still = false
  showPaused()
}
document.addEventListener('pointerlockchange', captureChanged)

function lock() {
  startMusic()
  show('paused', false)
  if (s.doorMode) return (s.doorHeld = true, captureChanged())
  canvas.requestPointerLock().catch((err: Error) => (show('paused', true), toast(`pointer lock: ${err.message}`)))
}
function unlock() {
  s.still = false
  if (s.doorHeld) (s.doorHeld = false, captureChanged())
  if (document.pointerLockElement) document.exitPointerLock()
}
function letGo() {
  s.still = true
  if (s.doorHeld) (s.doorHeld = false, captureChanged())
  document.exitPointerLock()
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const eyeQuaternion = (w: Walker) => new THREE.Quaternion().setFromEuler(new THREE.Euler(w.pitch, w.yaw + Math.PI, 0, 'YXZ'))
const lookQuaternion = (from: THREE.Vector3, at: THREE.Vector3) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(from, at, camera.up))

function flyTo(to: THREE.Vector3, toQ: THREE.Quaternion, ms = 700, done?: () => void) {
  s.flight = { from: camera.position.clone(), to, fromQ: camera.quaternion.clone(), toQ, start: s.simNow, ms: reducedMotion() ? 0 : ms, done }
}
const flyHome = (done?: () => void) => flyTo(new THREE.Vector3(s.me.x, floorY() + EYE, s.me.z), eyeQuaternion(s.me), 600, done)

/** Frames a face `size` wide in the middle of the view, straight out from it: the camera stays in front, never in a wall. */
function frameOn(point: THREE.Vector3, normal: THREE.Vector3, size: number) {
  const span = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect
  const from = point.clone().addScaledVector(normal, size / 0.7 / span).add(new THREE.Vector3(0, 0.08, 0))
  flyTo(from, lookQuaternion(from, point))
}

/** Frames a face `size` wide straight on, in the middle of the view's left half: the right half holds a panel. */
function frameAside(point: THREE.Vector3, normal: THREE.Vector3, size: number) {
  const span = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect
  const distance = size / 0.7 / (span / 2)
  const right = normal.clone().negate().cross(camera.up).normalize()
  const from = point.clone().addScaledVector(normal, distance).addScaledVector(right, (distance * span) / 4)
  flyTo(from, lookQuaternion(from, from.clone().sub(normal)))
}

/** Standing at `spot` on `level` at once, on its floor, out of any ride or flight. */
function place(level: number, spot: Standing) {
  s.me = { ...s.me, pitch: 0, ...spot, level, y: 0, vy: 0 }
  s.ride = undefined
  s.flight = undefined
  aim(camera, s.me, floorY())
  renderHud()
  renderElevator()
}

/** A cut to elsewhere in the building: out to black, there (once `CUT_MS` have passed), back in. */
const CUT_MS = 200
function travel(level: number, spot: Standing, then: () => void) {
  if (level === s.me.level) return then()
  $('fade').classList.add('on')
  s.cut = { at: s.simNow + CUT_MS, level, spot, then }
}

function closeSide() {
  if (s.panel?.kind === 'floor' || s.panel?.kind === 'archive' || s.panel?.kind === 'directory' || s.panel?.kind === 'elevator' || s.panel?.kind === 'drawer') s.panel = undefined
  show('side', false)
}

/** Back to walking: the terminal closes and the camera returns to your eyes. */
function unfocus() {
  closeTerm($('desk-screen'))
  show('desk', false)
  show('desk-brief', false)
  hideReviewing()
  closeShown()
  show('watch', false)
  if (s.panel?.kind === 'desk' || s.panel?.kind === 'shell' || s.panel?.kind === 'tv') s.panel = undefined
  if (s.view === 'focus') (s.view = 'walk', flyHome())
  showPaused()
}

function closeDoc() {
  if (s.panel?.kind === 'logbook' && s.panel.tab === 'screen') closeTerm($('logbook-screen'))
  show('doc', false)
  $('doc-body').innerHTML = ''
  delete $('doc-body').dataset.thread
  delete $('doc-body').dataset.stats
  delete $('doc-body').dataset.logbook
  clearInterval(statsPoll)
  if (s.panel?.kind === 'doc' || s.panel?.kind === 'kept' || s.panel?.kind === 'picture' || s.panel?.kind === 'thread' || s.panel?.kind === 'stats' || s.panel?.kind === 'logbook') s.panel = undefined
}

/** The Stats panel is read again every minute while it is open. */
const STATS_POLL_MS = 60_000
let statsPoll: ReturnType<typeof setInterval> | undefined

/** Every floor's stats in the reader where you stand: the overview first, each floor a tab. */
function openStats() {
  closePanels()
  s.panel = { kind: 'stats' }
  unlock()
  show('paused', false)
  show('doc', true)
  $('doc-body').dataset.stats = ''
  renderPanel()
  readStats()
  statsPoll = setInterval(readStats, STATS_POLL_MS)
}

async function readStats() {
  const reading = ++s.stats.reading
  const read = await tower.stats(statsQuery(s.stats.range, wallNow())).catch((err: Error) => {
    if (reading !== s.stats.reading) return
    if (s.stats.read) return void toast(err.message)
    s.stats = { ...s.stats, failed: err.message }
    renderPanel()
  })
  if (!read || reading !== s.stats.reading) return
  s.stats = { ...s.stats, read, failed: undefined, at: wallNow() }
  renderPanel()
}

function closePanels() {
  closeSide()
  closeDoc()
  closeDraftPanel()
  closeGame()
  unfocus()
}

/**
 * A game beside its cabinet: the camera faces the cabinet's screen in the left half of the view, the game fills the
 * right half in a sandboxed frame and takes the keys, and the music stops until it closes.
 */
function openGame(project: string, id: string) {
  const at = cabinetOf(s.plan, project, id)
  if (!at) return
  closePanels()
  const panel: GamePanel = { kind: 'game', project, id, x: at.cabinet.x }
  s.panel = panel
  s.view = 'focus'
  unlock()
  pause()
  show('paused', false)
  show('game', true)
  renderPanel()
  $('game-body').innerHTML = gameHtml(project, id)
  const frame = $('game-body').querySelector('iframe')!
  frame.addEventListener('load', () => frame.focus())
  frame.focus()
  frameCabinet(panel, at)
}

/** The camera on the game's cabinet, where the arcade stands it now: a game kept since moves every cabinet along. */
function frameCabinet(panel: GamePanel, { cabinet, level }: NonNullable<ReturnType<typeof cabinetOf>>) {
  panel.x = cabinet.x
  const front = new THREE.Vector3(cabinet.x, level.y + SCREEN.y, cabinet.z - CABINET.depth / 2)
  frameAside(front, new THREE.Vector3(0, 0, -1), 2 * CABINET.width)
}

function closeGame() {
  if (s.panel?.kind !== 'game') return
  s.panel = undefined
  show('game', false)
  $('game-body').innerHTML = ''
  if (s.view === 'focus') (s.view = 'walk', flyHome())
  startMusic()
}

/**
 * A shelf entry where you stand: markdown to read, a page in a frame, a link in a new tab. A url opens outside this
 * page: a frame in it inherits the shelf sandbox (an opaque origin, no forms, no storage), which breaks most web apps.
 * A renderer reads the board, which only the framing tower relays: framed, the tower opens it; on its own, a new tab.
 */
async function openShelf(project: string, n: number, file?: string) {
  const entry = s.board!.floors.find((f) => f.id === project)?.shelf?.[n]
  if (!entry) return
  if ('link' in entry) return (unlock(), open(entry.link, '_blank', 'noopener'))
  if ('url' in entry) return tower.framed ? tower.ui('shelf', { project, n }) : (unlock(), open(entry.url, '_blank', 'noopener'))
  if (s.self?.project === project && s.self.n === n) return toast(`${entry.label} is where you are standing`)
  if ('renderer' in entry) return tower.framed ? tower.ui('shelf', { project, n }) : (unlock(), open(rendererUrl(entry.renderer), '_blank', 'noopener'))
  closePanels()
  s.panel = { kind: 'doc', project, n, file }
  unlock()
  show('paused', false)
  show('doc', true)
  renderPanel()
  if (shelfKind(entry) === 'html') return ($('doc-body').innerHTML = docHtml({ frame: shelfUrl(project, n, shelfPage(entry)) }, tower.prefs.attributes()))
  const files = await shelfFiles(project, n).catch((err: Error) => (toast(err.message), []))
  const shown = file ?? files[0]
  const text = shown ? await shelfText(project, n, shown).catch((err: Error) => `*${err.message}*`) : ''
  if (s.panel?.kind !== 'doc' || s.panel.project !== project || s.panel.n !== n) return
  s.panel.file = shown
  $('doc-body').innerHTML = docHtml({ files, file: shown, text, url: shelfUrl(project, n, shown ?? '') }, tower.prefs.attributes())
}
onAppearance(() => s.panel?.kind === 'doc' && s.panel.file && openShelf(s.panel.project, s.panel.n, s.panel.file))

/** Opens a kept item where it lives: a draft in its editor, a game at its cabinet, anything else in the reader. */
function openKept(k: { project: string; collection: string; id: string }) {
  if (k.collection === DRAFTS) return openNote(k.project, k.id)
  if (k.collection === GAMES) return openGame(k.project, k.id)
  closePanels()
  s.panel = { kind: 'kept', ...k, drawn: undefined }
  unlock()
  show('paused', false)
  show('doc', true)
  renderPanel()
}

/** The item's body, drawn again only when the item changes; a text read that fails says so with Read again. */
async function drawKept(panel: Extract<Panel, { kind: 'kept' }>, c: FloorCollection, item: FloorItem) {
  panel.drawn = item.modifiedAt
  if (!readsText(itemKind(item.id))) return ($('doc-body').innerHTML = keptFileHtml(c, item, `/${itemPath(panel.project, c.id, item.id)}`))
  const text = await keptText(panel.project, c.id, item.id).catch((err: Error) => {
    if (s.panel === panel) $('doc-body').innerHTML = failedHtml(item.tag, err.message, 'data-kept-read')
  })
  if (text === undefined || s.panel !== panel || panel.drawn !== item.modifiedAt) return
  $('doc-body').innerHTML = keptTextHtml(item, text, tower.prefs.attributes())
}
onAppearance(() => s.panel?.kind === 'kept' && ((s.panel.drawn = undefined), renderPanel()))

/** Deleting is the user's, asked on a second press: the reader closes before the file goes. */
async function deleteKept(panel: Extract<Panel, { kind: 'kept' }>) {
  const c = floorOf(panel.project).collections.find((c) => c.id === panel.collection)!
  const item = c.items.find((i) => i.id === panel.id)!
  closeDoc()
  lock()
  if (await call('collection/delete', { project: panel.project, collection: panel.collection, id: panel.id })) toast(`Deleted ${item.tag} from ${c.label}`)
}

/** A gallery's picture in the reader where you stand, as its desk's tab shows it; it counts as seen once opened. */
async function openPicture(id: string, target: string) {
  const picture = pictureOf(s.board!, id, target)
  if (!picture) return
  const { worker, shown: sh } = picture
  closePanels()
  s.panel = { kind: 'picture', id, target }
  unlock()
  show('paused', false)
  show('doc', true)
  see(sh)
  renderPanel()
  $('doc-body').innerHTML = shownHtml(worker.callsign, sh, tower.prefs.attributes())
  if (!isMarkdown(sh)) return
  const md = await tower.text(shownHref(sh).slice(1)).catch((err: Error) => `*${err.message}*`)
  if (s.panel?.kind !== 'picture' || s.panel.id !== id || s.panel.target !== target) return
  $('doc-body').innerHTML = shownHtml(worker.callsign, sh, tower.prefs.attributes(), md)
}
onAppearance(() => s.panel?.kind === 'picture' && openPicture(s.panel.id, s.panel.target))

/** To the worker's desk, on the showing's tab. */
function goShown(id: string, target: string) {
  s.pendingShown = { id, target }
  goDesk(id)
}

function openSide(next: Panel) {
  unfocus()
  closeDoc()
  closeDraftPanel()
  s.panel = next
  renderPanel()
  show('side', true)
  unlock()
}

function focusDesk(id: string) {
  const c = s.board && findCard(s.board, id)
  if (!c) return
  closeSide()
  closeDoc()
  closeDraftPanel()
  s.panel = { kind: 'desk', id }
  s.deskTab = 'screen'
  dropPick()
  s.view = 'focus'
  unlock()
  show('paused', false)
  show('desk', true)
  show('desk-brief', false)
  hideReviewing()
  closeShown()
  renderPanel()
  mountDeskScreen(c)
  const tab = s.pendingTab?.id === id ? s.pendingTab.tab : undefined
  s.pendingTab = undefined
  if (tab === 'brief') openBrief(id)
  if (tab === 'reviews') openReviews(id)
  const pending = s.pendingShown?.id === id ? c.shown.find((sh) => sh.target === s.pendingShown!.target) : undefined
  s.pendingShown = undefined
  if (pending) openShown(id, pending)
}

/**
 * The desk panel's screen: the worker's real terminal, or while a past session of its is replayed, that session's last
 * screen, read-only, sepia under its stamp.
 */
function mountDeskScreen(c: Card) {
  const id = c.id
  const past = s.replay?.id === id ? c.lineage.find((l) => l.id === s.replay!.session) : undefined
  $('desk-screen').classList.toggle('replay', Boolean(past))
  $('desk-stamp').innerHTML = past ? stampHtml(past.startedAt, true) : ''
  show('desk-stamp', Boolean(past))
  mountTerm($('desk-screen'), {
    path: past ? `screen/${past.id}` : `terminal/${id}`, id: past?.id ?? id, sendKeys: tower.keys, resizeVerb: 'resize', scrollback: 0, onError: (err) => toast(err.message),
    onMode: (text, owner) => (($('desk-mode').textContent = text), $('desk-mode').classList.toggle('owner', owner)),
    ...terminalKeys,
    onEnd: () => s.panel?.kind === 'desk' && s.panel.id === id && unfocus(),
  })
}

/** A past session of a worker at a desk on its monitor, and on the desk panel's screen while it is open there. */
function replay(id: string, session: string | undefined) {
  s.replay = session === undefined ? undefined : { id, session }
  dressReplays()
  const c = findCard(s.board!, id)
  if (!c || s.panel?.kind !== 'desk' || s.panel.id !== id) return
  mountDeskScreen(c)
  openScreen()
}

/** A past worker, on the board or in the archive read of the floor whose panel listed it. */
const pastCard = (id: string) =>
  findCard(s.board!, id) ?? s.board!.floors.flatMap((f) => archiveOf(f.id) ?? []).find((c) => c.id === id)!

function focusShell(id: string) {
  if (!kioskOf(s.plan, id)) return
  $('desk-screen').classList.remove('replay')
  show('desk-stamp', false)
  closeSide()
  closeDoc()
  closeDraftPanel()
  s.panel = { kind: 'shell', id }
  s.view = 'focus'
  unlock()
  show('paused', false)
  show('desk', true)
  show('desk-brief', false)
  renderPanel()
  mountTerm($('desk-screen'), {
    path: `shell/${id}`, id, sendKeys: tower.shellKeys, resizeVerb: 'shell/resize', scrollback: SHELL_SCROLLBACK, onError: (err) => toast(err.message),
    onMode: (text, owner) => (($('desk-mode').textContent = text), $('desk-mode').classList.toggle('owner', owner)),
    ...terminalKeys,
    onEnd: () => s.panel?.kind === 'shell' && s.panel.id === id && unfocus(),
  })
}

/** Up close to a big screen, filling the view. */
function watch(n: number) {
  const screen = bigScreens(s.plan)[n]
  closeSide()
  closeDoc()
  closeDraftPanel()
  s.panel = { kind: 'tv', n }
  s.view = 'focus'
  unlock()
  show('paused', false)
  show('watch', true)
  frameOn(new THREE.Vector3(screen.x, levelY(screen.level) + screen.y, screen.z), new THREE.Vector3(0, 0, 1), screen.w)
}

/** Where this page runs on its own: a declared renderer at its `/r/<name>/` path, a shelf's `html` entry at `/run/…`. */
const ownUrl = () => (location.pathname.startsWith('/r/') ? location.pathname : `/run/${s.self!.project}/${s.self!.n}`)

/**
 * A big screen: once something is shared, watch it; else share something. A page framed in the tower can't capture
 * (src/tv.ts), so there it opens this renderer in a tab of its own, at the lobby's screen.
 */
function useScreen(n: number) {
  unlock()
  if (sharing()) return watch(n)
  if (tower.framed) return open(`${ownUrl()}#tv`, '_blank', 'noopener')
  startShare(renderHud).then(() => (renderHud(), watch(n)), (err: Error) => toast(`share: ${err.message}`))
}

function endShare() {
  stopShare()
  renderHud()
  if (s.panel?.kind === 'tv') (unfocus(), lock())
}

/** To a worker's desk, wherever it is, and sit down. */
function goDesk(id: string) {
  s.pendingDesk = undefined
  const level = levelOfCard(s.plan, id)
  const slot = deskOf(s.plan, id)
  if (!level || !slot) return toast(`${findCard(s.board!, id)?.callsign ?? id} is not on duty`)
  if (s.view === 'overview') leaveOverview()
  closeSide()
  travel(level.index, deskSpot(slot), () => {
    if (s.desks.has(id)) focusDesk(id)
  })
}

function goShell(id: string) {
  s.pendingShell = undefined
  const level = levelOfShell(s.plan, id)
  const k = kioskOf(s.plan, id)
  if (!level || !k) return
  if (s.view === 'overview') leaveOverview()
  closeSide()
  travel(level.index, { x: k.x + 1.9, z: k.z, yaw: -Math.PI / 2 }, () => focusShell(id))
}

/** A draft deleted, said with an Undo that puts its file back under its id. */
function deleted(gone: Deleted | undefined) {
  if (gone) toast(`Deleted “${titleOf(gone.text)}” from Drafts`, { label: 'Undo', run: () => undoDelete(gone) })
}
const undoDelete = (gone: Deleted) => restoreDraft(draftIo, gone).then(() => toast(`“${titleOf(gone.text)}” is back in Drafts`), (err: Error) => toast(err.message))

/** A draft pinned on its corkboard thrown away, what it held read first so Undo can put it back. */
async function throwAway(project: string, id: string) {
  const text = await readDraft(draftIo, project, id).catch((err: Error) => (toast(err.message), undefined))
  if (text !== undefined && (await discardItem(draftIo, project, id))) deleted({ project, id, text })
}

/** Out of the elevator on a level, facing its floor. */
function goLevel(index: number) {
  if (s.view === 'overview') leaveOverview()
  closePanels()
  travel(index, { x: 0, z: coreFront(s.plan) + 1.6, yaw: 0 }, lock)
}

/** Ends a worker, with its crew that runs when it is in one, the deepest first; the toast offers its resume. */
async function sendHome(c: Card) {
  const crew = sentHome(floorOf(c.project).cards, c)
  for (const call of c.calls['send-home'] ?? [c.calls.kill!]) if (!(await offered(call))) return
  toast(`Sent ${crew.map((h) => h.callsign).join(', ')} home`, { label: 'Resume', run: () => resumeSentHome(c) })
}

/** A worker sent home, resumed from the board or its floor's archive, read again. */
async function resumeSentHome(c: Card) {
  const dead = findCard(s.board!, c.id) ?? (await readArchive(s.board!, c.project).catch((err: Error) => (toast(err.message), [])))?.find((d) => d.id === c.id)
  if (!dead?.calls.resume) return toast(`${c.callsign} can't be resumed now`)
  resume(dead.calls.resume)
}

/** A worker's verbs, wherever it stands: at its desk, on the wall, as a guest on the roof. */
function runOnWorker(a: ActOf<'desk' | 'tile' | 'guest'>, verb: Verb) {
  const c = findCard(s.board!, a.id)
  if (!c) return
  if (verb === 'resume') return resume(c.calls.resume!)
  if (verb === 'goto') return goDesk(current(c)!.resumedBy!.id)
  if (verb === 'kill') return sendHome(c)
  if (verb === 'review') return offered(c.calls.review!)
  if (verb === 'reap') return offered(c.calls.reap!)
  if (verb === 'hand') return handOver(c.calls.submit!)
  if (verb !== 'brief' && verb !== 'thread') return
  if (a.kind === 'guest') return openLogbook(c)
  s.pendingTab = { id: c.id, tab: verb === 'brief' ? 'brief' : 'reviews' }
  byKind(RUN, a, 'use')
}

/** What a verb does to each kind of thing; `use` is the thing's own action. `run` takes the building's verbs first. */
const RUN: ByKind<unknown, [Verb]> = {
  desk: (a, verb) => (verb === 'use' ? goDesk(a.id) : runOnWorker(a, verb)),
  papers(a, verb) {
    const c = findCard(s.board!, a.id)
    if (!c) return
    if (verb === 'send') return sendNotes(deskThread(c), c)
    if (verb === 'thread') s.pendingTab = { id: a.id, tab: 'reviews' }
    goDesk(a.id)
  },
  binder(a) {
    if (!s.desks.has(a.id)) return
    s.pendingTab = { id: a.id, tab: 'brief' }
    focusDesk(a.id)
  },
  drawer: (a) => openSide({ kind: 'drawer', project: a.project, n: a.n }),
  thread(a, verb) {
    const t = floorOf(a.project).threads.find((t) => t.checkout === a.checkout)
    if (verb === 'send' && t) return sendNotes(floorThread(a.project, t), sendTargetOf(s.board!, a.project, a.checkout))
    openThread(a.project, a.checkout)
  },
  station(a, verb) {
    if (verb === 'use') return hire(a.project)
    if (verb === 'hand') return hireOnNote(a.project)
    return s.carrying ? openSpawnOnNote(a.project, s.carrying) : openSpawn(a.project)
  },
  shown(a) {
    const latest = findCard(s.board!, a.id)?.shown.at(-1)
    if (latest) goShown(a.id, latest.target)
  },
  picture: (a, verb) => (verb === 'use' ? openPicture(a.id, a.target) : goShown(a.id, a.target)),
  tile(a, verb) {
    return verb === 'use' ? focusDesk(a.id) : runOnWorker(a, verb)
  },
  guest: (a, verb) => verb !== 'use' && runOnWorker(a, verb),
  tidy: (a, verb) => (verb === 'use' ? openSide({ kind: 'floor', id: a.project, tray: undefined }) : tidy(floorOf(a.project).calls.tidy!)),
  landed(a, verb) {
    if (verb === 'use') return openSide({ kind: 'floor', id: a.project, tray: undefined })
    if (verb === 'goto') return goDesk(a.id)
    const row = landedRow(floorOf(a.project), a.id, wallNow())
    return row && tidy(row.call)
  },
  leftover(a, verb) {
    if (verb === 'goto') return goDesk(a.id)
    const r = findCard(s.board!, a.id)?.resources.find((r) => r.pid === a.pid)
    return r && offered(r.calls.reap)
  },
  shell: (a, verb) => (verb === 'use' ? goShell(a.id) : call('shell/kill', { id: a.id })),
  floor(a, verb) {
    if (verb === 'use') return openSide({ kind: 'floor', id: a.id, tray: undefined })
    const f = s.board!.floors.find((f) => f.id === a.id)!
    if (verb === 'spawn') return openSpawn(f.id)
    if (verb === 'shell') return spawnShell(f.calls.shell!, f.hub)
    return offered(f.calls.editor!, { dir: f.hub })
  },
  shelf: (a) => openShelf(a.project, a.n),
  book: (a) => openShelf(a.project, a.n, a.file),
  cork: (a) => (s.carrying ? drop() : openDraftPanel(newDraft(a.project))),
  note(a, verb) {
    if (verb === 'use') return carry(a.project, a.id)
    if (verb === 'brief') return openNote(a.project, a.id)
    return throwAway(a.project, a.id)
  },
  arcade: (a) => openGame(a.project, a.id),
  cat: (a, verb) => (verb === 'use' ? startPet(a.name) : a.watching && goDesk(a.watching)),
  tv: (a) => useScreen(a.n),
  directory: () => openSide({ kind: 'directory' }),
  stats: () => openStats(),
  dj: () => toggleMusic(),
  bar: () => (s.beer = !s.beer),
  elevator: () => (s.panel = { kind: 'elevator' }, unlock()),
}

function run(a: Act, verb: Verb) {
  const held = s.offers.find((o) => o.verb === verb)?.whyNot
  if (held) return toast(held)
  if (verb === 'next') return nextWaiting()
  if (verb === 'overview') return overview()
  if (verb === 'stop') return endShare()
  byKind(RUN, a, verb)
}

/** The worker whose desk you sit at: its waits ring for nobody, since you are looking at it. */
const watched = () => (s.panel?.kind === 'desk' ? s.panel.id : undefined)

/**
 * To the desk a move key names, in the order every renderer moves in (src/shared/cards.ts): N goes round the waits you
 * haven't dismissed, each once a round.
 */
function goMove(m: Move) {
  if (m !== 'waiting') {
    const to = neighbours(s.board!, watched(), s.heed)[m]
    return to && goDesk(to.id)
  }
  const step = nextWait(heededWaits(s.board!, s.heed), s.heed.visited, watched())
  s.heed = { ...s.heed, visited: step.visited }
  if (step.to) goDesk(step.to.id)
}

/**
 * Rings for the first of `waits` you haven't dismissed and don't sit at, unless rings are off. The door rings nothing,
 * nor does a framed page: the page framing it rings for the same waits.
 */
function ringFor(waits: Wait[]) {
  const wait = s.ring === 'off' || s.doorMode || tower.framed ? undefined : ringing(waits.filter((w) => !s.heed.dismissed.has(w.key)), watched())
  if (!wait) return
  s.rungAt = s.simNow
  ring(soundOf(wait))
}

/** With `remind`, the waits you haven't dismissed ring again while nobody looks at them. */
function tickRing() {
  if (s.ring === 'remind' && s.simNow - s.rungAt >= REMIND_MS) ringFor(heededWaits(s.board!, s.heed))
}

/** Your dismissals and ring setting, as all your renderers keep them in `tower.store`: another may have changed them. */
function readHeed() {
  if (FIXTURE !== undefined) return
  Promise.all([tower.store.get(DISMISSED_KEY), tower.store.get(RING_KEY), tower.store.get(BRIEF_MARKDOWN_KEY)]).then(([dismissed, ring, markdown]) => {
    s.heed = { ...s.heed, dismissed: new Set((dismissed as string[] | null) ?? []) }
    s.ring = (ring as Ring | null) ?? 'once'
    s.briefMarkdown = (markdown as BriefMarkdown | null) ?? 'rendered'
    renderHud()
  })
}

function dismissWait(key: string) {
  const dismissed = dismissing(s.board!, s.heed.dismissed, key)
  s.heed = { ...s.heed, dismissed: new Set(dismissed) }
  if (FIXTURE === undefined) tower.store.set(DISMISSED_KEY, dismissed)
  renderHud()
  renderPanel()
}

function chooseRing(ring: Ring) {
  s.ring = ring
  if (FIXTURE === undefined) tower.store.set(RING_KEY, s.ring)
  drawSettings()
}

/**
 * The settings popover: how waits ring and the viewer's appearance. Notifications are the tower page's, so it offers none. It
 * stands by the button that opened it, in the HUD or on the pause card.
 */
let settingsDrawn = ''
let settingsBy: Element = $('hud')
const settingsEl = $('settings')
const drawSettings = () => settingsEl.matches(':popover-open') && paintSettings()
function paintSettings() {
  const html = settingsHtml([soundSection(s.ring), ...prefSections(tower.prefs.get(), faceInstalled), markdownSection(s.briefMarkdown)])
  if (html !== settingsDrawn) settingsEl.innerHTML = settingsDrawn = html
}
placeOnOpen(settingsEl, () => settingsBy)
document.querySelector('.paused-settings')!.innerHTML = `${ICON.settings}Settings`
settingsEl.addEventListener('beforetoggle', (e) => (e as ToggleEvent).newState === 'open' && paintSettings())
document.addEventListener('click', (e) => (settingsBy = (e.target as Element).closest('[popovertarget="settings"]') ?? settingsBy), true)
settingsEl.addEventListener('click', (e) => {
  const el = (e.target as Element).closest<HTMLElement>('[data-ring-choice], [data-sound-play]')
  if (!el) return
  if (el.dataset.ringChoice) return chooseRing(el.dataset.ringChoice as Ring)
  ring(el.dataset.soundPlay as Sound)
})
wirePrefs(settingsEl, tower.prefs.set)
tower.prefs.on(() => drawSettings())

const MOVE_OF: Record<string, Move> = { 'prev-worker': 'prev', 'next-worker': 'next', 'next-waiting': 'waiting' }

/** The keymap's commands only the tower page has (its skyline, sidebar and ? sheet): left out of the building's sheet. */
const PAGE_ONLY = new Set(['home', 'sidebar', 'help'])
const sheetKeys = (keys: Keys): Keys => Object.fromEntries(Object.entries(keys).filter(([id]) => !PAGE_ONLY.has(id)))

const PANE_OF: Record<string, 'screen' | 'brief' | 'changes' | 'reviews'> = { 'pane-terminal': 'screen', 'pane-brief': 'brief', 'pane-changes': 'changes', 'pane-reviews': 'reviews' }

/**
 * A pane of the open panel, by the keymap's names for the tower page's panes: a desk's tabs, the logbook reader's Screen
 * and Logbook. Answers whether the panel has that pane.
 */
function toPane(pane: (typeof PANE_OF)[string]) {
  const panel = s.panel
  if (panel?.kind === 'logbook') return pane === 'screen' || pane === 'brief' ? (logbookTab(pane), true) : false
  if (panel?.kind !== 'desk') return false
  const c = findCard(s.board!, panel.id)!
  if (pane === 'reviews' && !keepsThreads(s.board!, c.project)) return false
  if (pane === 'screen') return (openScreen(), $('desk-screen').querySelector('textarea')?.focus(), true)
  const typingInto = document.activeElement as HTMLElement | null
  typingInto?.blur()
  if (pane === 'brief') openBrief(c.id)
  else if (pane === 'changes') openChanges(c.id, undefined)
  else openReviews(c.id)
  return true
}

/** The keymap's commands the building shares with every renderer, from anywhere: walking, at a desk, in its terminal. */
function runCommand(id: string, e: KeyboardEvent) {
  if (MOVE_OF[id]) return (e.repeat || goMove(MOVE_OF[id]), true)
  if (PANE_OF[id]) return toPane(PANE_OF[id])
  if (id === 'leave-terminal') return ((document.activeElement as HTMLElement | null)?.blur(), true)
  return false
}

const terminalKeys = { keys: () => s.board!.keys, run: runCommand }

/** A keydown outside a terminal that runs a shared command. Returns whether it ran one. */
function commandKey(e: KeyboardEvent) {
  const id = s.board && commandOf(s.board.keys, e, typing() ? 'field' : 'page')
  if (!id || !runCommand(id, e)) return false
  e.preventDefault()
  return true
}

const nextWaiting = () => goMove('waiting')

function startRide(to: number) {
  if (s.ride || to === s.me.level || !inside(carBox(s.plan), s.me.x, s.me.z)) return
  s.ride = { from: s.me.level, to, t: 0, move: Math.min(3.5, 0.9 + 0.3 * Math.abs(to - s.me.level)) }
  renderElevator()
}

const DOORS_SHUT = 0.55
function floorY() {
  if (!s.ride) return levelY(s.me.level)
  const k = ease(THREE.MathUtils.clamp((s.ride.t - DOORS_SHUT) / s.ride.move, 0, 1))
  return THREE.MathUtils.lerp(levelY(s.ride.from), levelY(s.ride.to), k)
}

function overview() {
  closePanels()
  unlock()
  s.view = 'overview'
  s.aimed = undefined
  showPrompt(undefined)
  show('paused', false)
  const top = s.plan.levels.at(-1)!.y
  const center = new THREE.Vector3(0, top / 2, 0)
  const from = new THREE.Vector3(s.plan.width * 0.85, top * 0.6 + 8, s.plan.depth * 1.4 + top * 0.45)
  flyTo(from, lookQuaternion(from, center), 900, () => {
    orbit.target.copy(center)
    orbit.enabled = true
  })
}

function leaveOverview() {
  orbit.enabled = false
  s.view = 'walk'
  show('prompt', false)
  flyHome()
}

const raycaster = new THREE.Raycaster()
/** Whether `o` is drawn: it and every parent visible. Rays hit hidden objects too. */
const shown = (o: THREE.Object3D | null): boolean => !o || (o.visible && shown(o.parent))
const pickables = () => [
  ...(s.world?.pickables ?? []),
  ...[...s.desks.values()].map((d) => d.group),
  ...[...s.stations.values()].map((st) => st.group),
  ...[...s.walls.values()].map((w) => w.wall.group),
  ...[...s.running.values()].map((r) => r.group),
  ...[...s.pigeonholes.values()].map((r) => r.group),
  ...[...s.filings.values()].map((f) => f.group),
  ...[...s.guests.values()].map((g) => g.group),
  ...[...s.notes.values()].map((n) => n.group),
  ...[...s.cabinets.values()].map((c) => c.group),
  ...[...s.pictures.values()].map((p) => p.group),
  ...[...s.cats.values()].map((c) => c.root),
]

/** What's under the screen point (x, y in -1..1): within its reach and on your level while walking, anywhere from outside. */
function pick(x: number, y: number): Act | undefined {
  raycaster.setFromCamera(new THREE.Vector2(x, y), camera)
  raycaster.far = s.view === 'overview' ? Infinity : 9
  const floor = floorY()
  const hit = raycaster.intersectObjects(pickables(), true).find((h) => {
    if (!shown(h.object) || !h.object.userData.act) return false
    return s.view === 'overview' || (h.point.y > floor - 0.2 && h.point.y < floor + levelHeight(s.me.level))
  })
  const a: Act | undefined = hit?.object.userData.act
  return a && (s.view === 'overview' || hit!.distance <= reachOf(a)) ? a : undefined
}

/**
 * What the aimed thing offers, each verb on its own key. The mouse wheel marks one and a click runs it; a verb that
 * ends something runs only once its key or the button has been held for `HOLD_MS`.
 */
let promptKey = ''
function showPrompt(a: Act | undefined, at?: { x: number; y: number }) {
  $('crosshair').classList.toggle('on', Boolean(a) && s.view === 'walk')
  const which = JSON.stringify(a ?? null)
  if (which !== s.offersOfAimed) (s.offersOfAimed = which, s.marked = 0, s.hold = undefined)
  s.offers = a && s.board ? offersOf(a, s.board, { sharing: sharing(), framed: tower.framed, music: !s.muted, carrying: carried(), beer: s.beer, cats: s.catNames, lost: s.lost }) : []
  s.marked = Math.min(s.marked, Math.max(0, s.offers.length - 1))
  const key = a ? `${which}|${JSON.stringify(s.offers)}|${s.marked}|${Math.floor(s.simNow / 1000)}` : ''
  if (key !== promptKey) {
    promptKey = key
    const html = a && s.board ? promptHtml(a, s.board, s.offers, s.marked, s.catNames) : ''
    $('prompt').innerHTML = html
    show('prompt', Boolean(html))
  }
  const el = $('prompt')
  if (at) Object.assign(el.style, { left: `${Math.min(at.x + 20, innerWidth - el.offsetWidth - 10)}px`, top: `${at.y + 20}px`, right: 'auto', bottom: 'auto' })
  else Object.assign(el.style, { left: '', top: '', right: '', bottom: '' })
}

function startHold(a: Act, o: Offer, by: string) {
  s.hold = { act: a, verb: o.verb, start: s.simNow, by }
}

/** Runs the marked offer on a click; a held one starts filling instead. */
function pressMarked(a: Act) {
  const o = s.offers[s.marked]
  if (o && HELD.has(o.verb)) startHold(a, o, 'mouse')
}
function releaseMarked(a: Act) {
  if (s.hold?.by === 'mouse') return (s.hold = undefined)
  const o = s.offers[s.marked]
  if (o && !HELD.has(o.verb)) run(a, o.verb)
}

function measure(now: number, work: number) {
  const m = s.meter
  m.frames++
  m.work += work
  if (now - m.since < 1000) return
  m.fps = (m.frames * 1000) / (now - m.since)
  m.frameMs = m.work / m.frames
  Object.assign(m, { since: now, frames: 0, work: 0 })
  if (s.fpsShown) $('fps').textContent = `${Math.round(m.fps)} fps · ${m.frameMs.toFixed(1)} ms`
}
function toggleFps() {
  s.fpsShown = !s.fpsShown
  show('fps', s.fpsShown)
}

let lastFrame = performance.now()
function frame(now: number) {
  requestAnimationFrame(frame)
  // A frame's timestamp is when it began, which can precede a performance.now() read moments earlier.
  const dt = Math.max(0, Math.min(0.05, (now - lastFrame) / 1000))
  lastFrame = now
  if (s.stepped) return
  const start = performance.now()
  update(dt)
  if (!covered()) render()
  measure(now, performance.now() - start)
}

/** A panel that hides the world: while it is open the scene isn't drawn, and the canvas keeps its last frame. */
const covered = () => s.panel?.kind === 'desk' || s.panel?.kind === 'shell' || s.panel?.kind === 'doc' || s.panel?.kind === 'kept' || s.panel?.kind === 'picture' || s.panel?.kind === 'logbook'

function render() {
  if (s.board && s.world) paintScreens(s.simNow, screenDistance)
  showLevels(levelsShown(s))
  renderer.render(scene, camera)
  Object.assign(s.meter, { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles })
  if (s.hands && handsShown()) drawHands(renderer, s.hands)
}

/** Your hands are in view while you walk or pet a cat, but not while the camera rides or flies. */
const handsShown = () => (s.view === 'walk' || s.view === 'pet') && !s.ride && !s.flight

/** One frame of simulated time: `dt` seconds of it, `t` the clock in seconds, and the turn the input took. */
type Frame = { dt: number; t: number; turned: Turn }

function tickCut() {
  if (!s.cut || s.simNow < s.cut.at) return
  const { level, spot, then } = s.cut
  s.cut = undefined
  place(level, spot)
  $('fade').classList.remove('on')
  then()
}

/** Riding turns you to face the doors, so you step out onto the floor. */
function tickRide({ dt }: Frame) {
  if (!s.ride) return
  s.ride.t += dt
  const out = Math.round(s.me.yaw / (2 * Math.PI)) * 2 * Math.PI
  const k = Math.min(1, dt * 3)
  s.me = { ...s.me, yaw: s.me.yaw + (out - s.me.yaw) * k, pitch: s.me.pitch * (1 - k) }
  if (s.ride.t < DOORS_SHUT + s.ride.move) return
  s.me = { ...s.me, level: s.ride.to }
  s.ride = undefined
  renderHud()
  renderElevator()
}

function tickWalker(f: Frame) {
  const was = s.me
  stepWalker(f)
  const stroke = s.pet && strokeAt(petProgress(s.pet, s.simNow), s.pet.tailward)
  const note = carried()
  holdNote(s.hands!, note && { title: note.title, tag: note.tag, tint: tintOf(floorOf(note.project)) })
  holdBeer(s.hands!, s.beer)
  poseHands(s.hands!, was, s.me, stroke, f.dt, f.t)
}

function stepWalker({ dt, turned }: Frame) {
  s.me = fall(s.me, dt)
  if (s.view !== 'walk' || !captured()) return
  s.me = look(s.me, turned)
  if (s.ride || s.flight) return
  const wasInCar = inside(carBox(s.plan), s.me.x, s.me.z)
  const m = move()
  s.me = walk(jump(s.me, m), m, dt, boxesHere())
  if (wasInCar !== inside(carBox(s.plan), s.me.x, s.me.z)) renderElevator()
}

/**
 * Pets the cat `name`: the camera flies low beside it, the right hand strokes its back while it leans in, purring and
 * raising hearts, and the camera flies home once it's done (`tickPet`).
 */
function startPet(name: CatName) {
  const cat = s.cats.get(name)!
  const spot = petSpot(cat, camera.position)
  s.view = 'pet'
  s.aimed = undefined
  showPrompt(undefined)
  s.pet = { name, start: s.simNow, tailward: spot.tailward, hearts: makeHearts() }
  scene.add(s.pet.hearts)
  flyTo(spot.from, lookQuaternion(spot.from, spot.at), PET_IN, () => !s.muted && purr(PET_MS / 1000))
}

/** A pet runs its strokes, then flies you home; anything else taking the view ends it where it is. */
function tickPet() {
  const p = s.pet
  if (!p) return
  const k = petProgress(p, s.simNow)
  if (s.view === 'pet' && k < 1) return placeHearts(p, s.cats.get(p.name)!, k)
  dropHearts(p)
  s.pet = undefined
  if (s.view === 'pet') (s.view = 'walk', flyHome())
}

/** A landing's doors: shut for a ride and behind a leaver who boarded; open where you stand and ahead of a leaver. */
function doorTarget(level: number) {
  if (s.ride) return 0
  const leaving = [...s.leavers].filter((l) => l.level === level)
  if (leaving.some(boarded)) return 0
  return level === s.me.level || leaving.some(nearDoors) ? 1 : 0
}

function tickDoors({ dt }: Frame) {
  for (const level of s.plan.levels) {
    const target = doorTarget(level.index)
    const open = s.doorOpen.get(level.index) ?? 0
    const next = open + Math.sign(target - open) * Math.min(Math.abs(target - open), dt * 2.2)
    s.doorOpen.set(level.index, next)
    setDoors(s.world!.doors.get(level.index)!, next)
  }
  s.world!.car.position.y = floorY()
}

function tickCamera() {
  if (s.flight) {
    const k = s.flight.ms ? Math.min(1, (s.simNow - s.flight.start) / s.flight.ms) : 1
    camera.position.lerpVectors(s.flight.from, s.flight.to, ease(k))
    camera.quaternion.slerpQuaternions(s.flight.fromQ, s.flight.toQ, ease(k))
    if (k === 1) {
      const done = s.flight.done
      s.flight = undefined
      done?.()
    }
  } else if (s.view === 'walk') aim(camera, s.me, floorY())
  else if (s.view === 'overview') orbit.update()
}

function tickAim() {
  if (s.view === 'walk' && captured() && !s.flight) {
    s.aimed = pick(0, 0)
    showPrompt(s.aimed)
  } else if (s.view !== 'overview' && !s.still) showPrompt(undefined)
}

/** A held verb's ring fills; once full, the verb runs. */
function tickHold() {
  if (!s.hold) return
  const ring = $('prompt').querySelector<HTMLElement>(`[data-verb="${s.hold.verb}"] kbd`)
  const k = holdFill(s.hold.start, s.simNow)
  ring?.style.setProperty('--hold', String(k))
  if (k < 1) return
  const { act: a, verb } = s.hold
  s.hold = undefined
  run(a, verb)
}

function tickPeople({ dt, t }: Frame) {
  for (const desk of s.desks.values()) poseDesk(desk, t, dt)
  for (const [id, a] of s.arrivals) if (walkIn(a, dt, t)) s.arrivals.delete(id)
  for (const l of s.leavers) if (walkOut(l, dt, t) && s.doorOpen.get(l.level) === 0) (s.leavers.delete(l), discard(l.group))
  tickCats(dt, t)
}

/** The wall clock when the page opened, in seconds: the cats keep their schedules across loads. */
const opened = wallNow() / 1000

/**
 * The cats roam on their schedules, but for one that sits on the desk of whoever has waited longest, and the one on
 * your floor, which follows you while you walk it.
 */
/** What a petted cat sits on: the desk it watches once it is up there, else its floor, so a cat petted mid-walk stays down. */
const petHeight = (cat: Cat, waiter: Desk | undefined) =>
  cat.watching && cat.root.position.y > levelY(cat.level) + DESK.height / 2 ? deskPerch(waiter!).y : levelY(cat.level)

function tickCats(dt: number, t: number) {
  const places = new Map(CATS.map((name) => [name, catAt(name, opened + t, s.plan)]))
  const waiter = heededWaits(s.board!, s.heed).map((w) => s.desks.get(w.id)).find(Boolean)
  const level = waiter && levelOfCard(s.plan, waiter.card.id)!.index
  const watcher = waiter && watcherOf(s.cats.values(), places, waiter.card.id, level!)
  const follower = s.ride ? undefined : followerOf(places, s.me.level)
  for (const cat of s.cats.values()) {
    const place = places.get(cat.name)!
    keepEyeOn(cat, cat.name === watcher ? waiter!.card.id : undefined)
    keepUp(cat, cat.name === follower && !cat.watching)
    if (s.pet?.name === cat.name) {
      const stroke = strokeAt(petProgress(s.pet, s.simNow), s.pet.tailward)
      leanIn(cat, stroke?.reach ?? 0, stroke?.press ?? 0, petHeight(cat, waiter), t)
    } else if (cat.watching) chase(cat, s.plan, level!, deskPerch(waiter!), Math.PI, dt, t)
    else if (cat.following) tagAlong(cat, s.plan, s.me, dt, t)
    else if (cat.returning) cat.returning = !steer(cat, s.plan, place.level, place, 0.05, CAT_SPEED, dt, t)
    else roam(cat, place, levelY(place.level), t)
    hangOn(cat.level, cat.root)
  }
}

function tickParty({ dt, t }: Frame) {
  setRoom(here().kind === 'roof' ? 'roof' : 'inside')
  duck(s.view === 'focus')
  const beat = beatAt(t)
  const roof = s.plan.levels.at(-1)!
  for (const g of s.guests.values()) placeGuest(g, guestAt(g.card, t, s.plan), roof.y, beat, t)
  animateParty(s.world!.party, beat)
  for (const df of s.dance.values()) animateDanceFloors(df, beat)
  tickFireworks(scene, dt)
}

const HEAD_Y = 1.3
const head = new THREE.Vector3()

/** While you walk a floor, an arrow on the screen's edge toward each worker on it waiting on you that you can't see. */
function tickCompass() {
  const walking = s.view === 'walk' && !s.ride
  const waits = walking ? heededWaits(s.board!, s.heed).filter((w) => levelOfCard(s.plan, w.id)?.index === s.me.level && s.desks.has(w.id)) : []
  const targets = waits.map((w) => ({ id: w.id, at: s.desks.get(w.id)!.group.getWorldPosition(head).clone().setY(levelY(s.me.level) + HEAD_Y) }))
  const card = (id: string) => findCard(s.board!, id)!
  camera.updateMatrixWorld()
  drawCompass($('compass'), pointers(camera, targets, innerWidth, innerHeight), (id) => `${bubbleOf(card(id))} ${card(id).callsign}`, (id) => statusColor(card(id)), (id) => onStatusColor(card(id)))
}

/** One pulse of a waiting light: half a turn of `sin(4t)`, in seconds. */
const PULSE_S = Math.PI / 4

/**
 * Whatever waits on you lights in its loudest attention's colour: its floor's lamp, its tile on the wall, the beacon on
 * the roof. Only what needs you pulses; with reduced motion it pulses once when someone new starts waiting, then holds,
 * and the idle beacon holds.
 */
function tickLamps({ t }: Frame) {
  const board = s.board!
  const heeded = heededWaits(board, s.heed).map((w) => findCard(board, w.id)!)
  const still = reducedMotion()
  const pulse = still && t - s.waitedAt / 1000 > PULSE_S ? 1 : 0.55 + Math.abs(Math.sin(t * 4)) * 0.45
  const glow = (cards: Card[]) => (loudest(cards) === 'needs' ? pulse : 1)
  for (const level of s.plan.levels) {
    if (level.kind !== 'floor') continue
    const waits = heeded.filter((c) => level.desks.some((d) => d.card.id === c.id))
    s.world!.waitLamps.get(level.index)!.color.set(waits.length ? WORLD[loudest(waits)!] : '#2a2f3a').multiplyScalar(glow(waits))
  }
  for (const { wall } of s.walls.values()) {
    for (const f of wall.frames) {
      const c = findCard(board, f.id)
      if (c) f.material.color.set(statusColor(c)).multiplyScalar(heeded.includes(c) ? glow([c]) : 1)
    }
  }
  const all = loudest(heeded)
  s.world!.beacon.color.set(all ? WORLD[all] : '#ff3b3b').multiplyScalar(all ? glow(heeded) : still ? 0.5 : 0.5 + Math.sin(t * 1.5) * 0.3)
}

/** A frame's work, in order: where you are, what the camera sees, what you aim at, then everything alive. */
function tickGallery({ t }: Frame) {
  for (const pic of s.pictures.values()) (fitPicture(pic), placePicture(pic, t))
}

/** At most this many videos play at once: each decodes and copies its frames to the GPU. */
const PLAYING = 2

/**
 * The newest videos shown on your floor play, muted, on its desks' monitors and in its gallery; every other holds the
 * frame it stopped on. None plays on a stepped clock, so its frames stay the same on every load.
 */
function tickFilms() {
  const l = here()
  const shown = l?.kind === 'floor' && !s.stepped
    ? [...l.wall.pictures.map((p) => ({ c: p.worker, sh: p.shown })), ...l.desks.flatMap((d) => d.card.shown.slice(-1).map((sh) => ({ c: d.card, sh })))]
    : []
  const newest = shown.filter(({ sh }) => isVideo(sh)).sort((a, b) => b.sh.at - a.sh.at).map(({ c, sh }) => shownKey(sh))
  playFilms(new Set([...new Set(newest)].slice(0, PLAYING)))
}

function tickTraffic({ t }: Frame) {
  tickOutside(t)
}

/** Each filing cabinet's drawers: the pulled one out while its folders are listed, every other in. */
function tickFilings({ dt }: Frame) {
  const pulled = s.panel?.kind === 'drawer' ? s.panel : undefined
  for (const [index, filing] of s.filings) {
    const level = s.plan.levels[Number(index)]
    poseFiling(filing, level?.kind === 'floor' && level.floor.id === pulled?.project ? pulled.n : undefined, dt)
  }
}

const TICKS: ((f: Frame) => void)[] = [tickCut, tickRide, tickPet, tickWalker, tickDoors, tickCamera, tickAim, tickHold, tickPeople, tickFilings, tickGallery, tickFilms, tickParty, tickLamps, tickRing, tickCompass, tickTraffic]

function update(dt: number) {
  s.simNow += dt * 1000
  const turned = takeTurn()
  if (!s.board || !s.world) return
  const f: Frame = { dt, t: s.simNow / 1000, turned }
  for (const tick of TICKS) tick(f)
}

function resize() {
  renderer.setSize(innerWidth, innerHeight, false)
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  if (s.hands) fitHands(s.hands, camera.aspect)
  if (covered()) render()
}
addEventListener('resize', resize)
resize()

/** A click acts on what it pressed: under pointer lock the cursor never moves, but the view can turn to another act. */
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId)
  s.down = { x: e.clientX, y: e.clientY, act: JSON.stringify(s.aimed ?? null) }
  if (e.button === 0 && s.aimed && (captured() || s.view === 'overview')) pressMarked(s.aimed)
})
canvas.addEventListener('pointerup', (e) => {
  if (e.button !== 0 || !s.board || !s.down) return
  if (Math.hypot(e.clientX - s.down.x, e.clientY - s.down.y) > 5 || JSON.stringify(s.aimed ?? null) !== s.down.act) return (s.hold = undefined)
  if (s.view === 'overview' || captured()) return s.aimed && releaseMarked(s.aimed)
  closePanels()
  lock()
})
canvas.addEventListener('pointermove', (e) => {
  if (s.view !== 'overview' || !s.board) return
  s.aimed = pick((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
  canvas.style.cursor = s.aimed ? 'pointer' : ''
  showPrompt(s.aimed, { x: e.clientX, y: e.clientY })
})
canvas.addEventListener('wheel', (e) => {
  if (s.view !== 'walk' || !captured() || s.offers.length < 2) return
  s.marked = (s.marked + Math.sign(e.deltaY) + s.offers.length) % s.offers.length
  s.hold = undefined
}, { passive: true })
$('paused').addEventListener('click', (e) => {
  if ((e.target as Element).closest('a, [popovertarget]')) return
  if (s.view === 'overview') leaveOverview()
  lock()
})

const typing = () => {
  const el = document.activeElement
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || ($('spawn') as HTMLDialogElement).open
}
/** The aimed thing's verb on a key, by `KeyboardEvent.code`. */
const offerOnKey = (code: string) => (s.aimed && (captured() || s.view === 'overview') ? offerForKey(s.offers, code) : undefined)

/** A key the building answers, by `KeyboardEvent.code`: the aimed thing's verbs first, then the building's own. */
function onKey(code: string, repeat: boolean) {
  if (code === 'KeyB') return toggleMusic()
  if (code === 'Backquote') return toggleFps()
  startMusic()
  if (s.view === 'pet') return
  const offer = offerOnKey(code)
  if (s.aimed && offer) {
    if (repeat) return
    return HELD.has(offer.verb) ? startHold(s.aimed, offer, code) : run(s.aimed, offer.verb)
  }
  if (code === 'Escape' && s.doorHeld) return unlock()
  if (code === 'KeyP' && captured()) return letGo()
  if (code === 'KeyN') return nextWaiting()
  if (code === 'KeyV') return lookAtNew()
  if (code === 'KeyM') return s.panel?.kind === 'directory' ? (closeSide(), lock()) : openSide({ kind: 'directory' })
  if (code === 'KeyH') return s.view === 'overview' ? (leaveOverview(), lock()) : overview()
  if (code === 'Escape' && s.view === 'overview') return leaveOverview()
  if (code === 'Escape' && s.panel?.kind === 'desk' && s.replay?.id === s.panel.id) return replay(s.panel.id, undefined)
  if (code === 'Escape' && s.panel) return closePanels()
  const to = levelForKey(s.plan, code)
  if (to === undefined || to === s.me.level || s.ride) return
  if (s.view === 'walk' && inside(carBox(s.plan), s.me.x, s.me.z)) return startRide(to)
  goLevel(to)
}

document.addEventListener('keydown', (e) => {
  if (e.defaultPrevented || commandKey(e)) return
  // A replayed screen takes no input, so Esc ends the replay even while that screen has focus.
  if (e.code === 'Escape' && s.panel?.kind === 'desk' && s.replay?.id === s.panel.id) return replay(s.panel.id, undefined)
  if (!s.board || typing() || e.metaKey || e.ctrlKey || e.altKey) return
  if (e.code === 'Space' && captured()) e.preventDefault()
  // A verb may focus a field (the spawn dialog's prompt): its key must not be typed into it.
  if (offerOnKey(e.code)) e.preventDefault()
  onKey(e.code, e.repeat)
})

document.addEventListener('keyup', (e) => {
  if (s.hold?.by === e.code) s.hold = undefined
})
/** A key or button released while the page has no focus never reports it: a hold is a confirmation only while it is seen. */
addEventListener('blur', () => (s.hold = undefined))
document.addEventListener('visibilitychange', () => (s.hold = undefined))
/** A file's Finder and editor buttons work in every panel, before the panel's own click handling sees the click. */
document.addEventListener(
  'click',
  (e) => {
    const file = fileCall(e.target as Element)
    if (!file) return
    e.stopPropagation()
    void offered(file)
  },
  true,
)

$('hud').addEventListener('click', (e) => {
  const el = e.target as HTMLElement
  if (el.closest('[data-next]')) nextWaiting()
  if (el.closest('[data-music]')) toggleMusic()
  if (el.closest('[data-stop-share]')) endShare()
  if (el.closest('[data-shown]')) lookAtNew()
})
$('watch').addEventListener('click', (e) => {
  const what = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act
  if (what === 'stop') return endShare()
  if (what === 'close') return (unfocus(), lock())
})
$('elevator').addEventListener('click', (e) => {
  const to = (e.target as HTMLElement).closest<HTMLElement>('[data-ride]')?.dataset.ride
  if (to === undefined) return
  if (s.panel?.kind === 'elevator') s.panel = undefined
  startRide(Number(to))
  lock()
})

const threadsOf = (id: string) => readConversations(s.board!, id).catch((err: Error) => (toast(err.message), [] as Threads))

/** The brief lies over the terminal, which keeps its size: a hidden terminal would refit the PTY to nothing. */
async function openBrief(id: string) {
  s.deskTab = 'brief'
  closeShown()
  hideReviewing()
  renderPanel()
  const threads = await threadsOf(id)
  if (!findCard(s.board!, id) || s.panel?.kind !== 'desk' || s.panel.id !== id || s.deskTab !== 'brief') return
  const same = deskBrief?.id === id
  deskBrief = { id, threads }
  drawDeskBrief(same)
  show('desk-brief', true)
  if (!same) $('desk-brief').scrollTop = $('desk-brief').scrollHeight
}

/** The desk's brief as last read: what it is drawn again from, and what a copy reads its text from. */
let deskBrief: { id: string; threads: Threads } | undefined

/** What the viewer opened in a drawn logbook, and how they read its words. */
const briefLook = (el: HTMLElement) => ({ open: openFolds(el), expanded: expandedSaid(el), markdown: s.briefMarkdown })

function drawDeskBrief(same: boolean) {
  const c = findCard(s.board!, deskBrief!.id)!
  const look = same ? briefLook($('desk-brief')) : { open: new Set<string>(), expanded: new Set<string>(), markdown: s.briefMarkdown }
  $('desk-brief').innerHTML = logbookHtml(c, deskBrief!.threads, look, s.replay?.id === c.id ? s.replay.session : undefined)
}

function chooseBriefMarkdown(markdown: BriefMarkdown) {
  s.briefMarkdown = markdown
  if (FIXTURE === undefined) tower.store.set(BRIEF_MARKDOWN_KEY, markdown)
  if (deskBrief && s.panel?.kind === 'desk' && s.panel.id === deskBrief.id && s.deskTab === 'brief') drawDeskBrief(true)
  renderPanel()
  drawSettings()
}

/** A logbook's words and code, copied as written; its words rendered or raw, wherever the choice is offered. */
document.addEventListener('click', (e) => {
  const el = e.target as Element
  const code = el.closest('[data-copy-code]')
  if (code) return copiedAs(fenceText(code), 'the code')
  const markdown = el.closest<HTMLElement>('[data-brief-markdown]')?.dataset.briefMarkdown
  if (markdown) return chooseBriefMarkdown(markdown as BriefMarkdown)
  const said = el.closest<HTMLElement>('[data-copy-said]')?.dataset.copySaid
  const threads = el.closest('#desk-brief') ? deskBrief?.threads : s.panel?.kind === 'logbook' ? s.panel.threads : undefined
  if (said && threads) copiedAs(saidText(threads, said)!, said.endsWith(':prompt') ? 'the prompt' : 'the answer')
})

function openScreen() {
  s.deskTab = 'screen'
  show('desk-brief', false)
  hideReviewing()
  closeShown()
  renderPanel()
}

/** A showing lies over the terminal like the brief, and counts as seen once opened. */
async function openShown(id: string, sh: Shown) {
  const c = findCard(s.board!, id)!
  s.deskTab = shownTab(sh)
  show('desk-brief', false)
  hideReviewing()
  see(sh)
  renderPanel()
  $('desk-shown').innerHTML = shownHtml(c.callsign, sh, tower.prefs.attributes())
  show('desk-shown', true)
  if (!isMarkdown(sh)) return
  const md = await tower.text(shownHref(sh).slice(1)).catch((err: Error) => `*${err.message}*`)
  if (s.panel?.kind !== 'desk' || s.panel.id !== id || s.deskTab !== shownTab(sh)) return
  $('desk-shown').innerHTML = shownHtml(c.callsign, sh, tower.prefs.attributes(), md)
}

function closeShown() {
  show('desk-shown', false)
  $('desk-shown').innerHTML = ''
}

/** A link or a showing's ↗ opens in a browser tab: a click is what lets a page open one. */
function openOut(e: MouseEvent) {
  const out = (e.target as HTMLElement).closest<HTMLElement>('[data-out]')?.dataset.out
  if (!out) return false
  unlock()
  open(out, '_blank', 'noopener')
  return true
}

/** The details open over the top of the screen, clear of the head that opened them. */
$('desk-details').addEventListener('beforetoggle', (e) => (e as ToggleEvent).newState === 'open' && ($('desk-details').style.top = `${$('desk-body').getBoundingClientRect().top + 6}px`))
$('desk-moves').addEventListener('click', (e) => {
  const el = e.target as HTMLElement
  const m = el.closest<HTMLElement>('[data-move]')?.dataset.move as Move | undefined
  const dismissed = el.closest<HTMLElement>('[data-dismiss]')?.dataset.dismiss
  if (m) goMove(m)
  if (dismissed) dismissWait(dismissed)
})
$('desk-tabs').addEventListener('click', (e) => {
  const tab = (e.target as HTMLElement).closest<HTMLElement>('[data-tab]')?.dataset.tab
  if (s.panel?.kind !== 'desk' || openOut(e) || !tab) return
  const c = findCard(s.board!, s.panel.id)!
  const sh = c.shown.find((sh) => shownTab(sh) === tab)
  if (sh) return openShown(c.id, sh)
  if (tab === 'brief') openBrief(s.panel.id)
  else if (tab === 'reviews') openReviews(s.panel.id)
  else if (tab === 'changes') openChanges(s.panel.id, undefined)
  else openScreen()
})
$('desk-shown').addEventListener('click', openOut)
/** A session in the logbook, or the stamp's way back: the desk's screen replays it, or goes live again. */
for (const el of ['desk-brief', 'desk-stamp']) {
  $(el).addEventListener('click', (e) => {
    const session = (e.target as HTMLElement).closest<HTMLElement>('[data-replay]')?.dataset.replay
    if (s.panel?.kind === 'desk' && session !== undefined) replay(s.panel.id, session || undefined)
  })
}
onAppearance(() => {
  if (s.panel?.kind !== 'desk') return
  const sh = findCard(s.board!, s.panel.id)?.shown.find((sh) => shownTab(sh) === s.deskTab)
  if (sh && isMarkdown(sh)) openShown(s.panel.id, sh)
})

function hideReviewing() {
  show('desk-reviews', false)
  show('desk-changes', false)
}

/** A thread a panel shows, with where its checkout's work stands and whether it offers a note: a card, or a floor's thread. */
type ShownThread = ThreadAt & { state: CheckoutState; offers: { verbs: readonly string[]; calls: NoteCalls } }

/** The thread a desk's Reviews tab shows: its checkout's, or the one Tidy filed once its work landed. */
const deskThread = (c: Card): ShownThread => {
  const checkout = threadCheckoutOf(c)
  const filed = c.threadState.is === 'landed' ? c.threadState.filed : undefined
  return { project: c.project, checkout, id: filed?.id ?? threadId(checkout), state: c.threadState, offers: c }
}

const floorThread = (project: string, t: FloorThread): ShownThread => ({ project, checkout: t.checkout, id: t.id, state: t.state, offers: t })

/** The thread the open panel shows: the desk's, or the reader's. */
function shownThread(): ShownThread | undefined {
  const panel = s.panel
  if (panel?.kind === 'desk') {
    const c = findCard(s.board!, panel.id)
    return c && deskThread(c)
  }
  if (panel?.kind !== 'thread') return undefined
  const t = floorOf(panel.project).threads.find((t) => t.checkout === panel.checkout)
  return t && floorThread(panel.project, t)
}

const noting = (t: ShownThread) => t.offers.verbs.includes('note')

/**
 * A thread as the Reviews tab and the thread panel draw it: the notes new to the worker on duty in its checkout
 * marked, anchors looked for in the Changes of whoever worked there last.
 */
function threadView(at: ShownThread): ThreadView {
  const { project, checkout } = at
  const f = floorOf(project)
  const worker = workerIn(f, checkout)
  return {
    checkout, tag: f.collections.find((c) => c.id === REVIEWS)?.items.find((i) => i.id === at.id)?.tag, thread: threadOf(s.board!, at), failed: threadFailed(s.board!, at),
    reader: worker?.onDuty ? worker : undefined, changes: worker && changesOf(worker.id)?.repos, targets: sendTargets(f, checkout),
    target: sendTarget(project, checkout), re: s.noteRe, user: s.board!.user.name, files: threadItemFiles(f, checkout, at.id), state: at.state, noting: noting(at),
  }
}

/** Who a thread's Send reaches: the worker the viewer picked, else the one most recently active in its checkout. */
const sendTarget = (project: string, checkout: string) =>
  sendTargets(floorOf(project), checkout).find((t) => t.id === s.sendPicks.get(`${project}/${checkout}`)) ?? sendTargetOf(s.board!, project, checkout)

function drawThread(el: HTMLElement, at: ShownThread) {
  el.dataset.thread = `${at.project}/${at.checkout}`
  drawPanel(el, reviewsHtml(threadView(at)), { 'note-text': s.noteTexts.get(el.dataset.thread) ?? '' })
}

/** A worker's Changes, its lines marked by the notes on the thread its Reviews tab shows, where a note on picked lines goes. */
function drawChanges(c: Card) {
  const el = $('desk-changes')
  const checkout = threadCheckoutOf(c)
  const read = changesOf(c.id)
  const live = read && livePick(read, s.pick)
  if (read && s.pick && !live) toast('The file changed under your pick: pick its lines again, your note is kept')
  if (read) s.pick = live
  drawPanel(el, changesHtml({ read, failed: changesFailed(c.id), folds: s.folds, pick: s.pick, picking: s.picking, thread: threadOf(s.board!, deskThread(c)), checkout, user: s.board!.user.name, state: c.checkoutState, noting: can(c, 'note') }), { 'pick-text': s.pickText })
  showSince(el)
  if (s.pickFresh) el.querySelector<HTMLTextAreaElement>('[data-pick-text]')?.focus()
  s.pickFresh = false
  if (s.jump && read) jumpTo(read)
}

/** Each `data-since` time under `el`, as how long ago it was. */
const showSince = (el: HTMLElement) => {
  for (const t of el.querySelectorAll<HTMLElement>('[data-since]')) t.textContent = ago(wallNow() - Number(t.dataset.since))
}

/** Scrolls to the anchor's lines, its file unfolded. */
function jumpTo(read: ChangesRead) {
  const a = s.jump!
  s.jump = undefined
  const spot = anchorSpot(read.repos, a)
  if (!spot) return toast(`${a.repo}:${a.path} has no changes now`)
  if (isFolded(read, s.folds, spot.repo, spot.file)) toggleFold(spot.key)
  $('desk-changes').querySelector(spotSelector(spot))?.scrollIntoView({ block: spot.row === -1 ? 'start' : 'center' })
}

function toggleFold(key: string) {
  if (!s.folds.delete(key)) s.folds.add(key)
  renderPanel()
}

function toggleViewed(read: ChangesRead, key: string) {
  const [repo, f] = changedFiles(read.repos).find(([r, f]) => fileKey(r, f) === key)!
  markViewed(read, repo.dir, marksToggled(read.viewed, repo, f))
  s.folds.delete(key)
  renderPanel()
}

const dropPick = () => ((s.pick = undefined), (s.pickText = ''))

/** The Reviews tab lies over the terminal like the brief; its anchors are looked for in the Changes of whoever works in the thread's checkout. */
function openReviews(id: string) {
  const c = findCard(s.board!, id)!
  s.deskTab = 'reviews'
  show('desk-brief', false)
  show('desk-changes', false)
  closeShown()
  const worker = workerIn(floorOf(c.project), threadCheckoutOf(c))
  if (worker) readChanges(worker.id, wallNow())
  show('desk-reviews', true)
  renderPanel()
}

/** What changed in the worker's repos; `jump` is a note's anchor whose lines to scroll to. */
function openChanges(id: string, jump: Anchor | undefined) {
  s.deskTab = 'changes'
  s.jump = jump
  show('desk-brief', false)
  show('desk-reviews', false)
  closeShown()
  readChanges(id, wallNow())
  show('desk-changes', true)
  renderPanel()
}

/** A thread's slot: at the desk of whoever works in its checkout, else in the reader. */
function openThread(project: string, checkout: string) {
  const worker = workerIn(floorOf(project), checkout)
  if (worker?.onDuty) {
    s.pendingTab = { id: worker.id, tab: 'reviews' }
    return goDesk(worker.id)
  }
  closePanels()
  s.panel = { kind: 'thread', project, checkout }
  unlock()
  show('paused', false)
  show('doc', true)
  renderPanel()
}

/** Types a pointer to the thread into `to`'s composer, naming the notes new to it. */
async function sendNotes(at: ShownThread, to: Card | undefined) {
  const { checkout } = at
  if (!to) return toast(`Pick a worker to send the notes on ${checkout} to`)
  const thread = await threadRead(s.board!, at).catch((err: Error) => (toast(err.message), undefined))
  if (!thread) return
  const text = sendText(THE_USER, checkout, unseenBy(thread, to.callsign).map((m) => m.n))
  if (await offered(to.calls.submit!, { text })) toast(`Sent ${to.callsign} to the thread of ${checkout}`)
}

async function addNote(at: ShownThread) {
  const { project, checkout } = at
  const key = `${project}/${checkout}`
  const reply = await offered(at.offers.calls.note!, { author: s.board!.user.name, re: s.noteRe, anchors: [], body: s.noteTexts.get(key) ?? '' })
  if (!reply) return
  toast(`n${reply.n} is on the thread of ${checkout}`)
  s.noteTexts.delete(key)
  s.noteRe = undefined
  renderPanel()
}

/** A note on the lines picked in a worker's Changes, on the thread its Reviews tab shows. */
async function addPicked(c: Card) {
  const checkout = threadCheckoutOf(c)
  const anchors = [pickAnchor(changesOf(c.id)!.repos, s.pick!)]
  const reply = await offered(c.calls.note!, { author: s.board!.user.name, anchors, body: s.pickText })
  if (!reply) return
  toast(`n${reply.n} is on the thread of ${checkout}`)
  dropPick()
  renderPanel()
}

const copiedAs = (text: string, what: string) => navigator.clipboard.writeText(text).then(() => toast(`Copied ${what}`), (err: Error) => toast(err.message))
const copied = (text: string) => copiedAs(text, text)

/** The thread an element shows, as `drawThread` drew it. */
const threadIn = (el: HTMLElement) => {
  const key = el.closest<HTMLElement>('[data-thread]')!.dataset.thread!
  const at = key.indexOf('/')
  return { project: key.slice(0, at), checkout: key.slice(at + 1), key }
}

function onThreadClick(e: MouseEvent) {
  const el = e.target as HTMLElement
  const box = el.closest<HTMLElement>('[data-thread]')
  if (!box) return
  const at = shownThread()
  if (!at) return
  const { project, checkout } = at
  if (el.closest('[data-send]')) return sendNotes(at, sendTarget(project, checkout))
  if (el.closest('[data-note-add]')) return addNote(at)
  if (el.closest('[data-thread-read]')) return (rereadThread(at), renderPanel())
  if (el.closest('[data-reply-clear]')) return ((s.noteRe = undefined), renderPanel())
  const copy = el.closest<HTMLElement>('[data-copy]')?.dataset.copy
  if (copy) return copied(copy)
  const reply = el.closest<HTMLElement>('[data-reply]')?.dataset.reply
  if (reply) return ((s.noteRe = Number(reply)), renderPanel(), box.querySelector<HTMLTextAreaElement>('[data-note-text]')?.focus())
  const toNote = el.closest<HTMLElement>('[data-to-note]')?.dataset.toNote
  if (toNote) return box.querySelector(`[data-note="${toNote}"]`)?.scrollIntoView({ block: 'center' })
  const anchor = el.closest<HTMLElement>('[data-anchor]')?.dataset.anchor
  const thread = threadOf(s.board!, at)
  const a = anchor && thread ? anchorOf(thread, anchor) : undefined
  if (!a) return
  if (s.panel?.kind !== 'desk') return toast(`Nobody works in ${checkout} now: its Changes are read at a worker's desk`)
  openChanges(s.panel.id, a)
}

for (const id of ['desk-reviews', 'doc-body']) {
  $(id).addEventListener('click', onThreadClick)
  $(id).addEventListener('input', (e) => {
    const el = e.target as HTMLTextAreaElement
    if (el.matches('[data-note-text]')) s.noteTexts.set(threadIn(el).key, el.value)
  })
  $(id).addEventListener('change', (e) => {
    const el = e.target as HTMLSelectElement
    if (el.matches('[data-send-pick]')) (s.sendPicks.set(threadIn(el).key, el.value), renderPanel())
  })
  $(id).addEventListener('keydown', (e) => {
    const el = e.target as HTMLElement
    if (!el.matches('[data-note-text]') || e.key !== 'Enter' || !(e.metaKey || e.ctrlKey)) return
    e.preventDefault()
    const at = shownThread()
    if (at && noting(at)) addNote(at)
  })
}
$('desk-changes').addEventListener('click', (e) => {
  if (s.panel?.kind !== 'desk') return
  const el = e.target as HTMLElement
  const c = findCard(s.board!, s.panel.id)!
  const read = changesOf(c.id)
  if (el.closest('[data-changes-read]')) return (readChanges(c.id, wallNow()), renderPanel())
  if (!read) return
  const viewed = el.closest<HTMLElement>('[data-viewed]')?.dataset.viewed
  if (viewed) return toggleViewed(read, viewed)
  const fold = el.closest<HTMLElement>('[data-fold]')?.dataset.fold
  if (fold) return toggleFold(fold)
  const line = el.closest<HTMLElement>('[data-pick]')?.dataset.pick
  if (line) return ((s.pick = picked(read, s.pick, line, e.shiftKey)), (s.pickFresh = true), renderPanel())
  if (el.closest('[data-pick-add]')) return addPicked(c)
  if (el.closest('[data-pick-cancel]')) return (dropPick(), renderPanel())
})
watchPickDrag($('desk-changes'), {
  drag: (from, to) => {
    if (s.panel?.kind !== 'desk') return
    s.pick = spanned(changesOf(s.panel.id)!, from, to)
    s.picking = true
    renderPanel()
  },
  drop: () => ((s.picking = false), (s.pickFresh = true), renderPanel()),
})
$('desk-changes').addEventListener('input', (e) => {
  const el = e.target as HTMLTextAreaElement
  if (el.matches('[data-pick-text]')) s.pickText = el.value
})
$('desk-changes').addEventListener('keydown', (e) => {
  const el = e.target as HTMLElement
  if (!el.matches('[data-pick-text]') || s.panel?.kind !== 'desk') return
  const id = commandOf(s.board!.keys, e, 'field')
  if (id === 'submit') return (e.preventDefault(), addPicked(findCard(s.board!, s.panel.id)!))
  if (id === 'cancel-pick') (e.preventDefault(), dropPick(), renderPanel())
})
setInterval(() => {
  if (s.panel?.kind === 'desk' && s.deskTab === 'changes') showSince($('desk-changes'))
  if (s.panel?.kind === 'stats') showSince($('doc-body'))
}, 1000)

const CHANGES_POLL_MS = 30_000
/** While a desk's Changes or Reviews tab is open, what changed is read again every `CHANGES_POLL_MS`. */
setInterval(() => {
  if (s.panel?.kind !== 'desk' || (s.deskTab !== 'changes' && s.deskTab !== 'reviews')) return
  const c = findCard(s.board!, s.panel.id)
  const id = s.deskTab === 'changes' ? c?.id : c && workerIn(floorOf(c.project), threadCheckoutOf(c))?.id
  if (id) readChanges(id, wallNow())
}, CHANGES_POLL_MS)
onReviews(renderPanel, (err) => toast(err.message))

/**
 * The logbook of a worker with no desk in the reader, opened on its conversations, read at once, the latest at the
 * bottom; the Screen tab replays its sessions' last screens, its own session's first.
 */
function openLogbook(c: Card) {
  closeSide()
  unfocus()
  closeDraftPanel()
  closeDoc()
  s.panel = { kind: 'logbook', card: c, threads: undefined, tab: 'brief', on: c.id }
  $('doc-body').dataset.logbook = ''
  $('doc-body').innerHTML = `<div class="desk-bar tab-row"><span class="desk-tabs tab-set" id="logbook-tabs"></span></div>
    <div class="logbook-shot" id="logbook-shot"><div id="logbook-sessions"></div><div class="logbook-frame"><div class="logbook-screen" id="logbook-screen"></div><div class="stamp" id="logbook-stamp"></div></div></div>
    <div class="logbook-text" id="logbook-text"></div>`
  show('doc', true)
  unlock()
  show('paused', false)
  renderPanel()
  const panel = s.panel
  threadsOf(c.id).then((threads) => s.panel === panel && ((panel.threads = threads), renderPanel(), ($('logbook-text').scrollTop = $('logbook-text').scrollHeight)))
}

/** The reader's tab: the Screen tab's terminal runs only while it shows. */
function logbookTab(tab: LogbookTab) {
  const panel = s.panel
  if (panel?.kind !== 'logbook' || panel.tab === tab) return
  panel.tab = tab
  if (tab === 'screen') showLogbookScreen(panel.card, panel.on)
  else closeTerm($('logbook-screen'))
  renderPanel()
  if (tab === 'brief') $('logbook-text').scrollTop = $('logbook-text').scrollHeight
}

/** The reader's screen: a session's last screen from its log, read-only, stamped. */
function showLogbookScreen(c: Card, session: string) {
  mountTerm($('logbook-screen'), {
    path: `screen/${session}`, id: session, sendKeys: tower.keys, resizeVerb: 'resize', scrollback: 0, onError: (err) => toast(err.message),
    onMode: () => {}, ...terminalKeys, onEnd: () => {},
  })
  $('logbook-stamp').innerHTML = stampHtml(c.lineage.find((l) => l.id === session)!.startedAt, false)
}

async function resume(c: Call<'resume'>) {
  const reply = await offered(c)
  if (reply?.t === 'spawned') s.pendingDesk = reply.id
}

$('desk-head').addEventListener('click', (e) => {
  const what = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act
  const { board, panel } = s
  if (!what || !board || !panel) return
  if (what === 'close') return (unfocus(), lock())
  if (panel.kind === 'shell') return what === 'shell-kill' && confirmed(`shell ${panel.id}`) && call('shell/kill', { id: panel.id })
  if (panel.kind !== 'desk') return
  const c = findCard(board, panel.id)!
  if (what === 'tower') return tower.ui('select', { id: c.id })
  if (what === 'resume') return resume(c.calls.resume!)
  if (what === 'kill') return confirmed(`kill ${c.id}`) && sendHome(c)
  if (what === 'reap') return confirmed(`reap ${c.id}`) && offered(c.calls.reap!)
})

$('doc-head').addEventListener('click', (e) => {
  const what = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act
  if (s.panel?.kind === 'picture') {
    if (openOut(e)) return
    if (what === 'close') return (closeDoc(), lock())
    if (what === 'desk') return goShown(s.panel.id, s.panel.target)
  }
  if (s.panel?.kind === 'stats' && what === 'close') return (closeDoc(), lock())
  if (s.panel?.kind === 'kept') {
    if (openOut(e)) return
    if (what === 'close') return (closeDoc(), lock())
    if (what === 'delete') return confirmed(`kept ${s.panel.id}`) && deleteKept(s.panel)
  }
  if (s.panel?.kind !== 'doc') return
  if (what === 'close') return (closeDoc(), lock())
  if (what === 'tower') return tower.ui('shelf', { project: s.panel.project, n: s.panel.n })
})
$('game-head').addEventListener('click', (e) => {
  if (openOut(e)) return
  if ((e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act === 'close') (closeGame(), lock())
})
$('doc-body').addEventListener('click', (e) => {
  if (s.panel?.kind === 'picture') return openOut(e)
  if (s.panel?.kind === 'kept' && (e.target as HTMLElement).closest('[data-kept-read]')) return ((s.panel.drawn = undefined), renderPanel())
  if (s.panel?.kind === 'logbook') {
    const tab = (e.target as HTMLElement).closest<HTMLElement>('[data-tab]')?.dataset.tab
    if (tab) return logbookTab(tab as LogbookTab)
    const session = (e.target as HTMLElement).closest<HTMLElement>('[data-replay]')?.dataset.replay
    if (!session) return
    s.panel.on = session
    showLogbookScreen(s.panel.card, session)
    return renderPanel()
  }
  if (s.panel?.kind === 'stats') return onStatsClick(e.target as HTMLElement)
  const file = (e.target as HTMLElement).closest<HTMLElement>('[data-file]')?.dataset.file
  if (file && s.panel?.kind === 'doc') openShelf(s.panel.project, s.panel.n, file)
})

function onStatsClick(el: HTMLElement) {
  const scope = el.closest<HTMLElement>('[data-stats-scope]')?.dataset.statsScope
  if (scope) return ((s.stats = { ...s.stats, scope }), renderPanel())
  const range = el.closest<HTMLElement>('[data-stats-range]')?.dataset.statsRange as StatsRange | undefined
  if (range) return ((s.stats = { ...s.stats, range, read: undefined }), renderPanel(), readStats())
  if (el.closest('[data-stats-read]')) ((s.stats = { ...s.stats, failed: undefined }), renderPanel(), readStats())
}

$('side').addEventListener('click', async (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('button, [data-desk], [data-shell], [data-go], [data-logbook]')
  if (!el || !s.board) return
  const d = el.dataset
  if (d.act === 'close') return (closeSide(), lock())
  if (d.logbook) return openLogbook(pastCard(d.logbook))
  if (d.desk) return goDesk(d.desk)
  if (d.shell) return goShell(d.shell)
  if (d.go) return goLevel(Number(d.go))
  if (d.spawn) return openSpawn(d.spawn)
  if (d.open && s.panel?.kind === 'floor') return offered(floorOf(s.panel.id).calls.editor!, { dir: d.open })
  if (d.shelf && s.panel?.kind === 'floor') return tower.ui('shelf', { project: s.panel.id, n: Number(d.shelf) })
  if (d.resume) return resume(JSON.parse(d.resume))
  if (d.reapPid) return reapProcess(d.reapPid)
  if (d.shellDir && s.panel?.kind === 'floor') return spawnShell(floorOf(s.panel.id).calls.shell!, d.shellDir)
  if (d.wtCall) return offered(JSON.parse(d.wtCall))
  if (d.tidyCall) return confirmed(`tidy ${d.tidyCall}`) && tidy(JSON.parse(d.tidyCall))
  if (d.tidy !== undefined && s.panel?.kind === 'floor') return confirmed(`tidy ${s.panel.id}`) && tidy(floorOf(s.panel.id).calls.tidy!)
  if (d.tray && s.panel?.kind === 'floor') return ((s.panel.tray = s.panel.tray === d.tray ? undefined : d.tray), renderPanel())
  if (d.kept && s.panel?.kind === 'floor') return openKept(keptOf(d.kept))
  if (d.archive !== undefined && s.panel?.kind === 'floor') return (openSide({ kind: 'archive', id: s.panel.id, words: [] }), $('archive-filter').focus())
  if (d.floor !== undefined && s.panel?.kind === 'archive') return openSide({ kind: 'floor', id: s.panel.id, tray: undefined })
  if (d.archiveRead !== undefined && s.panel?.kind === 'archive') return (readFloorArchive(s.board, s.panel.id, archiveArrived, archiveFailed), renderPanel())
})
$('side').addEventListener('input', (e) => {
  const el = e.target as HTMLInputElement
  if (el.id !== 'archive-filter' || s.panel?.kind !== 'archive') return
  s.panel.words = wordsOf(el.value)
  renderPanel()
})

async function tidy(c: Call<'tidy'>) {
  const reply = await offered(c)
  if (reply) toast(tidiedLine(reply))
}

/** `"<session> <pid>"` from the floor panel, ended on the second click. */
function reapProcess(which: string) {
  const [id, pid] = which.split(' ')
  const r = findCard(s.board!, id)?.resources.find((r) => r.pid === Number(pid))
  return r && confirmed(`reap ${which}`) && offered(r.calls.reap)
}

async function spawnShell(c: Call<'shell/spawn'>, cwd: string) {
  const reply = await offered(c, { cwd })
  if (reply?.t === 'spawned') s.pendingShell = reply.id
}

/** A new worker from the form's values. Answers its session id once it started. */
const hireWorker = async (project: string, form: SpawnForm) => spawnedId(await offered(...spawnCall(floorOf(project), form)))

/** A spawn's reply: the worktree it cut told, and the new session's id. */
function spawnedId(reply: Replies['spawn'] | undefined) {
  if (reply?.cut) toast(`worktree ${reply.cut.name} on ${reply.cut.branch}, from ${[...new Set(reply.cut.bases.map((b) => b.base))].join(', ')}`)
  return reply?.t === 'spawned' ? reply.id : undefined
}

/** A new worker from the form's values, and you sit down at its terminal once the board shows it. Answers whether it started. */
async function startWorker(project: string, form: SpawnForm) {
  const id = await hireWorker(project, form)
  if (id) s.pendingDesk = id
  return id !== undefined
}

const floorOf = (project: string) => s.board!.floors.find((f) => f.id === project)!

/** A worker with the floor's defaults, in its hub: it takes the open workstation. */
/** A worker where the floor starts one unless told: its own worktree, or the hub. */
const hire = (project: string) => startWorker(project, spawnDefaults(floorOf(project)))

/** The note in your hand, titled as its text shows it now. */
function carried(): Carried | undefined {
  const held = s.carrying
  const item = held && s.board && draftItem(s.board.floors, held.project, held.id)
  return item && { ...held!, title: noteTitle(held!.project, item), tag: item.tag }
}

/** The note in your hand, drawn by your hands; its draft stays pinned, hidden, until it is handed over. */
function carry(project: string, id: string) {
  s.carrying = { project, id }
  s.beer = false
  syncNotes()
}

/** Empty hands: the note goes back on its board. */
function drop() {
  s.carrying = undefined
  syncNotes()
}

const syncNotes = () => s.board && reconcile(NOTES, s.notes, s.plan, discard)
onTitles(() => (syncNotes(), renderPanel()))
onKeptTitles(renderPanel)

const syncCabinets = () => s.board && reconcile(CABINETS, s.cabinets, s.plan, discard)
onGameTitles(() => (syncCabinets(), renderPanel()))

/** The editor's last save, which a note's text is read after. */
let saving: Promise<boolean> = Promise.resolve(true)

/** The carried note's text as it is on disk now, `undefined` when it can't be sent: a note that can't be read stays in hand. */
async function carriedText() {
  const note = s.carrying!
  await saving
  const text = await readDraft(draftIo, note.project, note.id).catch((err: Error) => (toast(err.message), null))
  if (text === null) return undefined
  if (text === undefined) return (toast('The draft in your hand is gone'), drop(), undefined)
  if (!text.trim()) return (toast('The draft is empty'), undefined)
  return text
}

/** After a draft's words reached a session: it is deleted, and out of your hand if you held it. */
async function sent(note: Held) {
  await discardItem(draftIo, note.project, note.id)
  if (s.carrying?.project === note.project && s.carrying.id === note.id) drop()
}

/** The carried note on its way to a session: pressing again meanwhile sends nothing. */
let handing = false

/** Sends the carried note with `send`, then deletes its draft: a failed send keeps it in your hand. */
async function sendCarried(send: (text: string) => Promise<boolean>) {
  if (handing) return
  handing = true
  try {
    const note = s.carrying!
    const text = await carriedText()
    if (text !== undefined && (await send(text))) await sent(note)
  } finally {
    handing = false
  }
}

const handOver = (c: Call<'submit'>) => sendCarried(async (text) => (await offered(c, { text }))?.t === 'ok')
/** A worker hired on the carried note goes to work on it alone: you stay where you are. */
const hireOnNote = (project: string) => sendCarried(async (prompt) => (await hireWorker(project, spawnDefaults(floorOf(project), prompt))) !== undefined)

const spawn = $('spawn') as HTMLDialogElement
/** The draft the spawn dialog was opened on, deleted once its session starts. */
let spawnNote: Held | undefined

function openSpawn(projectId: string, draft?: { note: Held; text: string }) {
  const f = floorOf(projectId)
  spawnNote = draft?.note
  spawn.dataset.project = projectId
  spawn.innerHTML = spawnFormHtml(f, { sign: floorSignHtml(s.plan, projectId), draft: draft && titleOf(draft.text) })
  spawnField<HTMLTextAreaElement>('prompt').value = draft?.text ?? ''
  syncSpawn()
  spawn.returnValue = ''
  spawn.showModal()
  unlock()
  spawnField('prompt').focus()
}
const spawnField = <E extends HTMLElement = HTMLInputElement>(name: string) => spawn.querySelector<E>(`[name=${name}]`)!
const spawnFormEl = () => spawn.querySelector('form')!

/** The form's values as they stand, its branch placeholder and summary redrawn from them. */
function syncSpawn() {
  const f = floorOf(spawn.dataset.project!)
  const v = spawnForm(f, new FormData(spawnFormEl()))
  spawnField('branch').placeholder = branchPlaceholder(f, v.name)
  spawn.querySelector('[data-summary]')!.innerHTML = spawnSummaryHtml(f, v)
  return v
}
spawn.addEventListener('input', syncSpawn)
/** A shelf page runs sandboxed without `allow-forms`: the dialog closes from its buttons, never by a form submit. */
spawn.addEventListener('click', (e) => {
  const close = (e.target as HTMLElement).closest<HTMLElement>('[data-close]')
  if (!close || spawnStarting()) return
  if (close.dataset.close === 'cancel') return spawn.close('cancel')
  if (spawnFormEl().reportValidity()) void startSpawn(close)
})
/** While Start waits on its reply the form stays, so its draft is sent only with a worker started on it. */
spawn.addEventListener('cancel', (e) => spawnStarting() && e.preventDefault())
const spawnStarting = () => spawn.querySelector('[data-close=start]')?.getAttribute('aria-busy') === 'true'

/** Start stays busy until the tower answers: the form closes on a new worker, at whose terminal you sit, and says why when there is none. */
async function startSpawn(button: HTMLElement) {
  const error = spawn.querySelector('[data-spawn-error]')!
  error.textContent = ''
  const reply = await pressing(button, () => tower.run(...spawnCall(floorOf(spawn.dataset.project!), syncSpawn()))).catch((err: Error) => ((error.textContent = err.message), undefined))
  const id = spawnedId(reply)
  if (!id) return
  const note = spawnNote
  spawn.close('start')
  s.pendingDesk = id
  if (note) await sent(note)
}
spawn.addEventListener('keydown', (e) => {
  if (commandOf(s.board!.keys, e, 'field') === 'submit') spawn.querySelector<HTMLElement>('[data-close=start]')!.click()
})

async function openSpawnOnNote(project: string, note: Held) {
  const text = await carriedText()
  if (text !== undefined) openSpawn(project, { note, text })
}

spawn.addEventListener('close', () => {
  showPaused()
  const note = spawnNote
  spawnNote = undefined
  if (spawn.returnValue !== 'start') keepSpawnPrompt(spawn.dataset.project!, note, spawnField<HTMLTextAreaElement>('prompt').value)
})

/** A prompt typed into the form that closed without starting a worker is kept in the floor's drafts, or in the draft the form was opened on (`note`). */
async function keepSpawnPrompt(project: string, note: Held | undefined, text: string) {
  const f = floorOf(project)
  if (!draftsOf(f)) return
  const item = note && draftItem(s.board!.floors, note.project, note.id)
  const from = item && (await openDraft(draftIo, note.project, item).catch((err: Error) => (toast(err.message), undefined)))
  const kept = await keepUnsent(draftIo, project, from, text)
  if (kept) toast(`${from ? 'Your edits were kept in the draft' : 'Your prompt was kept as a draft'}: ${titleOf(kept.text)} (${tagOf(kept.id!)})`)
}

/** The draft editor beside the world: saved as you type, on leaving, and before it is carried or sent. */
const AUTOSAVE_MS = 800
let saveTimer: ReturnType<typeof setTimeout>
const draftText = $('draft-text') as HTMLTextAreaElement

function openDraftPanel(d: Draft) {
  closePanels()
  s.draft = d
  s.panel = { kind: 'draft' }
  unlock()
  show('paused', false)
  show('draft', true)
  draftText.value = d.text
  renderPanel()
  draftText.focus()
}

async function openNote(project: string, id: string) {
  const item = draftItem(s.board!.floors, project, id)
  const d = item && (await openDraft(draftIo, project, item).catch((err: Error) => (toast(err.message), null)))
  if (d === null) return
  if (!d) return toast('That draft is gone')
  openDraftPanel(d)
}

/** Closes the editor without saving: for a draft that is gone. */
function dropDraftPanel() {
  clearTimeout(saveTimer)
  s.draft = undefined
  show('draft', false)
  if (s.panel?.kind === 'draft') s.panel = undefined
}

/** Closes the editor, its text saved. */
function closeDraftPanel() {
  const d = s.draft
  if (d) {
    if (keepsApart(d)) toast('Your edits were kept as a new draft')
    saving = leave(draftIo, d)
  }
  dropDraftPanel()
}

function saveDraft() {
  clearTimeout(saveTimer)
  const d = s.draft!
  saving = save(draftIo, d)
  saving.then(() => s.draft === d && renderPanel())
}

async function followDraft(d: Draft) {
  const outcome = await follow(draftIo, d, draftItem(s.board!.floors, d.project, d.id!))
  if (s.draft !== d) return
  if (outcome === 'gone') return (dropDraftPanel(), toast('The draft was deleted elsewhere'))
  if (outcome === 'replaced') draftText.value = d.text
  renderPanel()
}

draftText.addEventListener('input', () => {
  edit(s.draft!, draftText.value)
  clearTimeout(saveTimer)
  saveTimer = setTimeout(saveDraft, AUTOSAVE_MS)
  renderPanel()
})
draftText.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') return (closeDraftPanel(), lock())
  if (commandOf(s.board!.keys, e, 'field') === 'save-draft') (e.preventDefault(), saveDraft())
})

$('draft-head').addEventListener('click', async (e) => {
  const what = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act
  const d = s.draft
  if (!what || !d) return
  if (what === 'close') return (closeDraftPanel(), lock())
  if (what === 'carry') return d.conflict !== undefined ? toast('Settle the change made on disk first') : (closeDraftPanel(), carry(d.project, d.id!), lock())
  if (what === 'delete') return (dropDraftPanel(), lock(), save(draftIo, d), deleted(await discardDraft(draftIo, d)))
  if (what !== 'start') return
  clearTimeout(saveTimer)
  const text = await sendable(draftIo, d)
  if (text === undefined) return toast(d.conflict !== undefined ? 'Settle the change made on disk first' : 'The draft is empty')
  dropDraftPanel()
  openSpawn(d.project, { note: { project: d.project, id: d.id! }, text })
})
$('draft-note').addEventListener('click', (e) => {
  const what = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act
  const d = s.draft
  if (!d || (what !== 'take' && what !== 'keep')) return
  saving = settle(draftIo, d, what === 'take')
  if (what === 'take') draftText.value = d.text
  renderPanel()
})

watchPanelSize($('desk-screen'))
idle(tower.framed)
Promise.all([loadModels(), tower.recall(), loadFaces(), loadKit(), tower.renderer()]).then(([m, kept, , kit, renderer]) => {
  s.models = m
  s.catNames = (renderer?.settings.cats ?? {}) as CatNames
  s.kit = kit
  flyPlane(m.plane)
  s.hands = makeHands(m)
  fitHands(s.hands, camera.aspect)
  s.saved = (kept as Kept | null)?.spot
  s.muted = (kept as Kept | null)?.muted ?? false
  s.seenShown = new Set((kept as Kept | null)?.seen)
  primeSeen = (kept as Kept | null)?.seen === undefined
  if ((kept as Kept | null)?.fps) toggleFps()
  if (fixture) onBoard(fixture[0], undefined)
  else (tower.subscribe(onBoard), tower.onBoardError(onBoardError))
}, (err: Error) => toast(`start: ${err.message}`))
Promise.all([tower.get('renderers'), tower.renderer()]).then(([{ renderers }, here]) =>
  ($('renderers').innerHTML = renderersHtml(renderers, here?.name, tower.framed)), (err: Error) => toast(`renderers: ${err.message}`))

/** A fixture's boards, delivered by the door one after another: the first on load. */
const fixture = fixtureBoards()
let fixtureAt = 0
function advance() {
  if (!fixture) throw new Error('advance works on a fixture board: open the page with ?board=')
  const next = fixture[fixtureAt + 1]
  if (!next) throw new Error(`the ${FIXTURE} fixture has ${fixture.length} board${fixture.length === 1 ? '' : 's'}, all delivered`)
  fixtureAt++
  onBoard(next, undefined)
}

/** The HUD's limits count down to their resets and age between boards. */
setInterval(() => s.board && renderHud(), 30_000)

/** Kept only for a person: the door's walks would move their spot. */
let keptKey = ''
setInterval(() => {
  if (!s.board || s.view !== 'walk' || s.ride || s.doorMode) return
  const kept: Kept = { spot: spotOf(s.me), muted: s.muted, fps: s.fpsShown, seen: [...s.seenShown].slice(-SEEN_KEPT) }
  const key = JSON.stringify(kept)
  if (key !== keptKey) (keptKey = key, tower.remember(kept))
}, 1000)
requestAnimationFrame(frame)

let built: () => void
const ready = new Promise<void>((resolve) => (built = resolve))

installDoor({
  ready, update, render, onKey, run, place, leaveOverview, captured, captureChanged, pick, showPrompt, startHold, floorY, pickables, advance,
  play: () => (lastFrame = performance.now()),
})
