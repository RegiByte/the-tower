import * as THREE from 'three'
import { holdFill, type CatNames } from './acts.ts'
import { readViewer, reducedMotion } from '/lib/viewer.js'
import { tower, type Board, type Card, type ShelfSelf } from './api.ts'
import { boardErrorTitle, bubbleOf, WORLD, heededWaits, loudest, findCard, statusColor, onStatusColor, shownKey } from './cards.ts'
import { drawCompass, pointers } from './compass.ts'
import { poseDesk, poseRigs, type Desk } from './desk.ts'
import { tickFireworks } from './fireworks.ts'
import { CATS, CAT_SPEED, boarded, catAt, chase, deskPerch, followerOf, guestAt, keepEyeOn, keepUp, leanIn, nearDoors, roam, steer, tagAlong, walkIn, walkOut, watcherOf, arrivalPose, leaverPose, type Cat } from './life.ts'
import { drawHands, fitHands, holdBeer, holdNote, makeHands, poseHands } from './hands.ts'
import { tintOf } from './palette.ts'
import { petProgress, strokeAt } from './pet.ts'
import { idle } from './tv.ts'
import { DESK, carBox, inside, levelHeight, levelOfCard, levelY } from './layout.ts'
import { chairKit } from './chairs.ts'
import { checkWardrobe } from './closet.ts'
import { bloom } from './light/bloom.ts'
import { contactShadows } from './light/contact.ts'
import { rigFrame } from './light/rig.ts'
import { hangOn, levelOf, levelsShown, showLevels } from './levels.ts'
import { animateDanceFloors, animateParty, placeGuest, poseGuest, poseStaff } from './party.ts'
import { paintScreens } from './screens.ts'
import { isVideo, playFilms } from './showing.ts'
import { type Turn } from './input.ts'
import { wallNow } from './clock.ts'
import { installDoor } from './door.ts'
import { FIXTURE, fixtureBoards } from './fixtures.ts'
import * as loading from './loading.ts'
import { settledArchives } from './archive.ts'
import { poseFiling } from './filing.ts'
import { fitPicture, placePicture } from './gallery.ts'
import { s, type Spot, type Standing } from './state.ts'
import { aim, fallTo, jump, look, walk, type Walker } from './walker.ts'
import { groundAt } from './floorplan.ts'
import { panelGrid, setDoors } from './world.ts'
import type { Shell } from './shell.ts'
import type { Music } from './music.ts'
import type { Term } from './term.ts'
import type { Assets } from './loads.ts'
import type { Toasts } from './toasts.ts'
import type { Events } from './events.ts'
import { $, show } from './dom.ts'
import { nowOf } from './now.ts'
import type { World } from './building.ts'
import type { Views } from './views.ts'
import type { Spawn } from './spawn.ts'

import type { Hud } from './hud.ts'

import type { Navigation } from './navigation.ts'

import type { Panels } from './panels.ts'

import type { AppLoop } from './app-loop.ts'

import type { Controls } from './controls.ts'

/** The resources the page reads as it starts: the leaves' binding (`Shell`), and those only the page reads. */
export type Main = Shell & { music: Music; terminal: Term; assets: Assets; toasts: Toasts; events: Events; world: World; views: Views; spawn: Spawn; hud: Hud; navigation: Navigation; panels: Panels; app: AppLoop; controls: Controls }

/**
 * The page: what it draws, the listeners and timers it keeps, and the loops it runs, started by the `main` resource once
 * every resource it reads has (system.ts).
 */
export function startMain(started: Main) {
  const { lit } = started.lighting
  const { camera, flyPlane, orbit, renderer, scene, tickOutside } = started.stage
  const { move, takeTurn } = started.input
  const { beatAt, duck, setRoom } = started.music
  const { toast } = started.toasts
  const { events } = started
  const { hiring } = started.spawn
  const { screenDistance, boxesHere, here, discard, planNow, ease, riddenFor, DOORS_SHUT, floorY, pickables, pick, floorOf, carried, firstBuilt, primeSeenAs } = started.world
  const { boardNow, captured, panelNow, panelAs, viewNow, motionNow, heed, aimNow } = nowOf(started.port)
  const { renderElevator, toggleFps } = started.hud
  const { leaveOverview, offersNow, aimAt, offerNothing, startHold } = started.navigation
  const { renderPanel, run, drawPending, tickPet } = started.panels
  const { app } = started.app
  const { onKey } = started.controls










  /** Where you stood, kept by the tower for this page so a reload puts you back, with the music on or off and what you've seen shown. */
  type Kept = { spot: Spot; muted: boolean; fps?: boolean; seen?: string[] }
  /** How many showings opened are kept: enough to cover every worker on duty. */
  const SEEN_KEPT = 300



  const spotOf = ({ level, x, z, yaw, pitch, y }: Walker): Spot => ({ level, x, z, yaw, pitch, y })


  /** The board's failure stays over the last board drawn, until the tower sends a board again. */
  function onBoardError(err: Error & { code: string }) {
    $('board-error').querySelector('b')!.textContent = boardErrorTitle(err.code)
    $('board-error').querySelector('span')!.textContent = err.message
    show('board-error', true)
    if (loading.shown()) loading.fail(`${boardErrorTitle(err.code)}: ${err.message}`)
    s.lost = err.code === 'disconnected'
    app.dispatch({ type: 'lost', lost: s.lost })
    if (s.lost) hiring.dispatch({ type: 'lost' })
    renderPanel()
  }

  /** `next` arrives: the building takes it once its floors' archives are read at its keys, planned then. */
  const boardArrived = (next: Board, self: ShelfSelf | undefined) => app.dispatch({ type: 'board/arrived', board: next, self })







  /** Standing at `spot` on `level` at once, out of any ride or flight. */
  const place = (level: number, spot: Standing) => app.dispatch({ type: 'place', level, spot })

























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

  let lastFrame = performance.now()
  function frame(now: number) {
    requestAnimationFrame(frame)
    // A frame's timestamp is when it began, which can precede a performance.now() read moments earlier.
    const dt = Math.max(0, Math.min(0.05, (now - lastFrame) / 1000))
    lastFrame = now
    if (s.stepped) return
    const start = performance.now()
    update(dt)
    if (drawing && !covered()) render()
    measure(now, performance.now() - start)
  }

  /** Whether frames draw: a live page draws nothing until its first board is built and its shaders compiled (`startOn`). */
  let drawing = FIXTURE !== undefined

  /**
   * Boards that arrive while the models load or the first is built supersede one another: the latest is drawn once the
   * page has started. Each is seen by the attention machine as it arrives: the loads and the start wait on a shown tab
   * (an image's decode, a frame), and a hidden one still rings.
   */
  let loaded = false
  let starting = false
  let latest: Parameters<typeof boardArrived> | undefined
  function onLiveBoard(next: Board, at: ShelfSelf | undefined) {
    show('board-error', false)
    s.lost = false
    app.dispatch({ type: 'lost', lost: false })
    app.dispatch({ type: 'board', board: next })
    if (!loaded || starting) return void (latest = [next, at])
    if (boardNow()) return boardArrived(next, at)
    start(next, at)
  }

  /** The models are in: the board that waited for them, if one did, starts the page. */
  function onLoaded() {
    loaded = true
    if (!loading.failed()) loading.stage('board')
    if (!latest) return
    const [next, at] = latest
    latest = undefined
    start(next, at)
  }

  function start(next: Board, at: ShelfSelf | undefined) {
    starting = true
    startOn(next, at).then(() => {
      starting = false
      const waiting = latest
      latest = undefined
      if (waiting) boardArrived(...waiting)
    }, failStart)
  }

  const failStart = (err: Error) => (toast(`start: ${err.message}`), loading.fail(`start: ${err.message}`), unbuilt(err))

  /**
   * The first board under the loading screen: a paint so the screen shows each stage, the building, then every program
   * its first frame draws with compiled off the main thread (KHR_parallel_shader_compile), the scene set as that frame
   * sets it (the rig's lights and shadows are part of each program), and that frame drawn under the screen as it leaves.
   */
  async function startOn(next: Board, at: ShelfSelf | undefined) {
    loading.stage('building')
    await painted()
    await settledArchives(next)
    boardArrived(next, at)
    if (!app.state().building) throw new Error("the first board was not taken: its floors' archives were read before it was sent in, and no longer were when it arrived")
    loading.stage('lighting')
    await painted()
    frameScene()
    await renderer.compileAsync(scene, camera)
    drawing = true
    render()
    loading.leave()
  }

  const painted = () => new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve)))

  /** A panel that hides the world: while it is open the scene isn't drawn, and the canvas keeps its last frame. */
  const covered = () => panelNow()?.kind === 'desk' || panelNow()?.kind === 'shell' || panelNow()?.kind === 'doc' || panelNow()?.kind === 'kept' || panelNow()?.kind === 'picture' || panelNow()?.kind === 'logbook'

  function render() {
    frameScene()
    renderer.render(scene, camera)
    if (lit) bloom(renderer, scene, camera)
    Object.assign(s.meter, { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles })
    if (s.hands && handsShown()) drawHands(renderer, s.hands)
  }

  /** What a frame sets on the scene before it is drawn: the screens painted, the levels shown, the lighting's passes. */
  function frameScene() {
    if (boardNow() && s.world) paintScreens(s.simNow, screenDistance)
    showLevels(levelsShown(viewNow(), motionNow(), s.me.level))
    if (lit) lightFrame()
  }

  /** The lighting's passes before the scene is drawn: the rig fitted to what is seen, and the contact shadows under your level, all counted on the meter. */
  function lightFrame() {
    const y = planNow().levels[s.me.level]?.y ?? 0
    const near = cameraOnLevel()
    rigFrame(scene, { ...planNow(), top: planNow().levels.at(-1)?.y ?? 0, y, height: levelHeight(s.me.level), whole: !near, panels: panelGrid(planNow()) })
    renderer.info.autoReset = false
    renderer.info.reset()
    contactShadows(renderer, scene, near ? standingOn() : [], { ...planNow(), y })
  }

  /** The camera is within your level's storey, out of the elevator: walking, seated, petting, or flying between those. */
  function cameraOnLevel() {
    const { x, y, z } = camera.position
    const floor = levelY(s.me.level)
    return !motionNow().ride && Math.abs(x) < planNow().width / 2 && Math.abs(z) < planNow().depth / 2 && y > floor && y < floor + levelHeight(s.me.level)
  }

  /** What stands on your level and its own part of the building. */
  const standingOn = () => (s.world ? [s.levels[s.me.level]?.group, s.world.levels[s.me.level]].filter((o) => o !== undefined) : [])

  /** Your hands are in view while you walk or pet a cat, but not while the camera rides or flies. */
  const handsShown = () => (viewNow() === 'walk' || viewNow() === 'pet') && !motionNow().ride && !motionNow().flight

  /** One frame of simulated time: `dt` seconds of it, `t` the clock in seconds, and the turn the input took. */
  type Frame = { dt: number; t: number; turned: Turn }

  function tickCut() {
    const { cut } = motionNow()
    if (cut && s.simNow >= cut.at) app.dispatch({ type: 'cut-reached' })
  }

  /** Riding turns you to face the doors, so you step out onto the floor. */
  function tickRide({ dt }: Frame) {
    const { ride } = motionNow()
    if (!ride) return
    const out = Math.round(s.me.yaw / (2 * Math.PI)) * 2 * Math.PI
    const k = Math.min(1, dt * 3)
    s.me = { ...s.me, yaw: s.me.yaw + (out - s.me.yaw) * k, pitch: s.me.pitch * (1 - k) }
    if (riddenFor(ride) < DOORS_SHUT + ride.move) return
    s.me = { ...s.me, level: ride.to }
    app.dispatch({ type: 'ride-arrived' })
  }

  function tickWalker(f: Frame) {
    const was = s.me
    stepWalker(f)
    const { pet } = motionNow()
    const stroke = pet && strokeAt(petProgress(pet, s.simNow), pet.tailward)
    const note = carried()
    holdNote(s.hands!, note && { title: note.title, tag: note.tag, tint: tintOf(floorOf(note.project)) })
    holdBeer(s.hands!, s.beer)
    poseHands(s.hands!, was, s.me, stroke, f.dt, f.t)
  }

  function stepWalker({ dt, turned }: Frame) {
    s.me = fallTo(s.me, here().kind === 'floor' ? groundAt(planNow().loft, s.me.x, s.me.z, s.me.y) : 0, dt)
    if (viewNow() !== 'walk' || !captured()) return
    s.me = look(s.me, turned)
    if (motionNow().ride || motionNow().flight) return
    const wasInCar = inside(carBox(planNow()), s.me.x, s.me.z)
    const m = move()
    s.me = walk(jump(s.me, m), m, dt, boxesHere())
    if (wasInCar !== inside(carBox(planNow()), s.me.x, s.me.z)) renderElevator()
  }

  /** A landing's doors: shut for a ride and behind a leaver who boarded; open where you stand and ahead of a leaver. */
  function doorTarget(level: number) {
    if (motionNow().ride) return 0
    const leaving = [...s.leavers].filter((l) => l.level === level)
    if (leaving.some(boarded)) return 0
    return level === s.me.level || leaving.some(nearDoors) ? 1 : 0
  }

  function tickDoors({ dt }: Frame) {
    for (const level of planNow().levels) {
      const target = doorTarget(level.index)
      const open = s.doorOpen.get(level.index) ?? 0
      const next = open + Math.sign(target - open) * Math.min(Math.abs(target - open), dt * 2.2)
      s.doorOpen.set(level.index, next)
      setDoors(s.world!.doors.get(level.index)!, next)
    }
    s.world!.car.position.y = floorY()
  }

  /** Where a flight goes from and to, written in place each frame it flies. */
  const flown = { from: new THREE.Vector3(), to: new THREE.Vector3(), fromQ: new THREE.Quaternion(), toQ: new THREE.Quaternion() }

  function tickCamera() {
    const { flight } = motionNow()
    if (flight) {
      const k = flight.ms ? Math.min(1, (s.simNow - flight.start) / flight.ms) : 1
      camera.position.lerpVectors(flown.from.fromArray(flight.from), flown.to.fromArray(flight.to), ease(k))
      camera.quaternion.slerpQuaternions(flown.fromQ.fromArray(flight.fromQ), flown.toQ.fromArray(flight.toQ), ease(k))
      if (k === 1) app.dispatch({ type: 'flight-landed' })
    } else if (viewNow() === 'walk') aim(camera, s.me, floorY())
    else if (viewNow() === 'overview') orbit.update()
  }

  function tickAim() {
    if (viewNow() === 'walk' && captured() && !motionNow().flight) aimAt(pick(0, 0))
    else if (viewNow() !== 'overview' && !app.state().capture.still) offerNothing()
  }

  /** A held verb's ring fills; once full, the verb runs. */
  function tickHold() {
    const { hold } = aimNow()
    if (!hold) return
    const ring = $('prompt').querySelector<HTMLElement>(`[data-verb="${hold.verb}"] kbd`)
    const k = holdFill(hold.start, s.simNow)
    ring?.style.setProperty('--hold', String(k))
    if (k < 1) return
    app.dispatch({ type: 'hold-filled' })
    run(hold.act, hold.verb)
  }

  /** The chair of the workstation standing where a worker left its desk at `desk`, once one stands there. */
  function chairLeft(desk: THREE.Vector3) {
    const station = [...s.stations.values()].find((st) => st.group.position.equals(desk))
    return station && { chair: station.chair, seat: station.chair.position.clone() }
  }

  /** Everyone moves where they go every frame; bones are posed only on the levels drawn (`levelsShown`). */
  function tickPeople({ dt, t }: Frame) {
    const shown = levelsShown(viewNow(), motionNow(), s.me.level)
    for (const desk of s.desks.values()) poseDesk(desk, t, dt)
    for (const [id, a] of s.arrivals) if (walkIn(a, dt)) s.arrivals.delete(id)
    for (const desk of s.desks.values()) {
      if (!shown(levelOf(desk.group))) continue
      const arriving = s.arrivals.get(desk.card.id)
      if (arriving) arrivalPose(s.models!, arriving, t)
      else poseRigs(desk, t, opened + t)
    }
    for (const l of s.leavers) {
      l.chair ??= chairLeft(l.desk)
      const inside = walkOut(l, dt)
      if (shown(l.level)) leaverPose(l, inside, t)
      if (inside && s.doorOpen.get(l.level) === 0) (s.leavers.delete(l), discard(l.group))
    }
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
    cat.watching && cat.root.position.y > levelY(cat.level) + DESK.height / 2 ? deskPerch(waiter!).at.y : levelY(cat.level)

  function tickCats(dt: number, t: number) {
    const places = new Map(CATS.map((name) => [name, catAt(name, opened + t, planNow())]))
    const waiter = heededWaits(boardNow()!, heed()).map((w) => s.desks.get(w.id)).find(Boolean)
    const level = waiter && levelOfCard(planNow(), waiter.card.id)!.index
    const watcher = waiter && watcherOf(s.cats.values(), places, waiter.card.id, level!)
    const follower = motionNow().ride ? undefined : followerOf(places, s.me.level)
    for (const cat of s.cats.values()) {
      const place = places.get(cat.name)!
      keepEyeOn(cat, cat.name === watcher ? waiter!.card.id : undefined)
      keepUp(cat, cat.name === follower && !cat.watching)
      const { pet } = motionNow()
      if (pet?.name === cat.name) {
        const stroke = strokeAt(petProgress(pet, s.simNow), pet.tailward)
        leanIn(cat, stroke?.reach ?? 0, stroke?.press ?? 0, petHeight(cat, waiter), t)
      } else if (cat.watching) {
        const perch = deskPerch(waiter!)
        chase(cat, planNow(), level!, perch.at, perch.face, dt, t)
      }
      else if (cat.following) tagAlong(cat, planNow(), s.me, dt, t)
      else if (cat.returning) cat.returning = !steer(cat, planNow(), place.level, place, 0.05, CAT_SPEED, dt, t)
      else roam(cat, place, levelY(place.level), t)
      hangOn(cat.level, cat.root)
    }
  }

  function tickParty({ dt, t }: Frame) {
    setRoom(here().kind === 'roof' ? 'roof' : 'inside')
    duck(viewNow() === 'focus')
    const beat = beatAt(t)
    const roof = planNow().levels.at(-1)!
    const posing = levelsShown(viewNow(), motionNow(), s.me.level)(roof.index)
    for (const g of s.guests.values()) {
      const at = guestAt(g.card, t, planNow())
      placeGuest(g, at, roof.y)
      if (posing) poseGuest(g, at, beat, t)
    }
    animateParty(s.world!.party, beat)
    if (posing) poseStaff(s.world!.party, beat, t)
    for (const df of s.dance.values()) animateDanceFloors(df, beat)
    tickFireworks(scene, dt)
  }

  const HEAD_Y = 1.3
  const head = new THREE.Vector3()

  /** While you walk a floor, an arrow on the screen's edge toward each worker on it waiting on you that you can't see. */
  function tickCompass() {
    const walking = viewNow() === 'walk' && !motionNow().ride
    const waits = walking ? heededWaits(boardNow()!, heed()).filter((w) => levelOfCard(planNow(), w.id)?.index === s.me.level && s.desks.has(w.id)) : []
    const targets = waits.map((w) => ({ id: w.id, at: s.desks.get(w.id)!.group.getWorldPosition(head).clone().setY(levelY(s.me.level) + HEAD_Y) }))
    const card = (id: string) => findCard(boardNow()!, id)!
    camera.updateMatrixWorld()
    drawCompass($('compass'), pointers(camera, targets, innerWidth, innerHeight), (id) => `${bubbleOf(card(id))} ${card(id).callsign}`, (id) => statusColor(card(id)), (id) => onStatusColor(card(id)))
  }

  /** One pulse of a waiting light: half a turn of `sin(4t)`, in seconds. */
  const PULSE_S = Math.PI / 4

  /**
   * Whatever waits on you lights in its loudest attention's colour: its floor's lamp, its tile on the wall, the beacon on
   * the roof. Only what needs you pulses, or everything waiting on you when the viewer has waits flash (`waits: 'flash'`
   * in `tower.prefs`); with reduced motion it pulses once when someone new starts waiting, then holds, and the idle beacon
   * holds.
   */
  function tickLamps({ t }: Frame) {
    const board = boardNow()!
    const heeded = heededWaits(board, heed()).map((w) => findCard(board, w.id)!)
    const still = reducedMotion()
    const pulse = still && t - s.waitedAt / 1000 > PULSE_S ? 1 : 0.55 + Math.abs(Math.sin(t * 4)) * 0.45
    const flash = tower.prefs.get().waits === 'flash'
    const glow = (cards: Card[]) => (flash || loudest(cards) === 'needs' ? pulse : 1)
    for (const level of planNow().levels) {
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
    const pulled = panelAs('drawer')
    for (const [index, filing] of s.filings) {
      const level = planNow().levels[Number(index)]
      poseFiling(filing, level?.kind === 'floor' && level.floor.id === pulled?.project ? pulled.n : undefined, dt)
    }
  }

  const TICKS: ((f: Frame) => void)[] = [tickCut, tickRide, tickPet, tickWalker, tickDoors, tickCamera, tickAim, tickHold, tickPeople, tickFilings, tickGallery, tickFilms, tickParty, tickLamps, tickCompass, tickTraffic]

  function update(dt: number) {
    s.simNow += dt * 1000
    const turned = takeTurn()
    if (!boardNow() || !s.world) return
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


















  idle(tower.framed)
  started.assets.loaded.then(({ models: m, kept, kit, declared: renderer }) => {
    s.declared = renderer ?? undefined
    checkWardrobe(m.catalogue)
    s.models = m
    s.chairKit = chairKit(m.desk.getObjectByName('chair')!)
    s.catNames = (renderer?.settings.cats ?? {}) as CatNames
    s.kit = kit
    flyPlane(m.plane)
    s.hands = makeHands(m)
    fitHands(s.hands, camera.aspect)
    s.saved = (kept as Kept | null)?.spot
    s.muted = (kept as Kept | null)?.muted ?? false
    s.seenShown = new Set((kept as Kept | null)?.seen)
    primeSeenAs((kept as Kept | null)?.seen === undefined)
    if ((kept as Kept | null)?.fps) toggleFps()
    if (fixture) onFixtureBoard(fixture[0])
    else onLoaded()
  }, failStart)
  /** How waits ring and what you dismissed are known before the first board, which may come long before the models. */
  if (FIXTURE === undefined) readViewer(tower.store.get).then((viewer) => (app.dispatch({ type: 'stored', viewer }), tower.subscribe(onLiveBoard), tower.onBoardError(onBoardError)))

  /** A fixture's boards, delivered by the door one after another: the first on load. */
  const fixture = fixtureBoards()
  let fixtureAt = 0
  function advance() {
    if (!fixture) throw new Error('advance works on a fixture board: open the page with ?board=')
    const next = fixture[fixtureAt + 1]
    if (!next) throw new Error(`the ${FIXTURE} fixture has ${fixture.length} board${fixture.length === 1 ? '' : 's'}, all delivered`)
    fixtureAt++
    onFixtureBoard(next)
  }

  function onFixtureBoard(next: Board) {
    app.dispatch({ type: 'board', board: next })
    boardArrived(next, undefined)
  }

  /** Kept only for a person: the door's walks would move their spot. */
  let keptKey = ''
  setInterval(() => {
    if (!boardNow() || viewNow() !== 'walk' || motionNow().ride || s.doorMode) return
    const kept: Kept = { spot: spotOf(s.me), muted: s.muted, fps: s.fpsShown, seen: [...s.seenShown].slice(-SEEN_KEPT) }
    const key = JSON.stringify(kept)
    if (key !== keptKey) (keptKey = key, tower.remember(kept))
  }, 1000)
  requestAnimationFrame(frame)

  let built: () => void
  let unbuilt: (err: Error) => void
  const ready = new Promise<void>((resolve, reject) => ((built = resolve), (unbuilt = reject)))
  firstBuilt.then(() => built())

  installDoor({
    ready, update, render, onKey, run, place, plan: planNow, leaveOverview, captured, pick, aimAt, offers: offersNow, startHold, floorY, pickables, advance, app: app.state, dispatch: app.dispatch, drawPending,
    events: events.read,
    play: () => (lastFrame = performance.now()),
  })
}
