import * as THREE from 'three'
import { holdFill } from './acts.ts'
import { reducedMotion } from '/lib/viewer.js'
import type { Card, Tower } from './api.ts'
import { bubbleOf, WORLD, heededWaits, loudest, findCard, statusColor, onStatusColor, shownKey } from './cards.ts'
import { drawCompass, pointers } from './compass.ts'
import { poseDesk, poseRigs, type Desk } from './desk.ts'
import { tickFireworks } from './fireworks.ts'
import { CATS, CAT_SPEED, boarded, catAt, chase, deskPerch, followerOf, guestAt, keepEyeOn, keepUp, leanIn, nearDoors, roam, steer, tagAlong, walkIn, walkOut, watcherOf, arrivalPose, leaverPose, type Cat } from './life.ts'
import { drawHands, fitHands, holdBeer, holdNote, makeHands, poseHands, type Hands } from './hands.ts'
import type { Models } from './models.ts'
import { tintOf } from './palette.ts'
import { petProgress, strokeAt } from './pet.ts'
import { DESK, carBox, inside, levelHeight, levelOfCard, levelY } from './layout.ts'
import { bloom } from './light/bloom.ts'
import { contactShadows } from './light/contact.ts'
import { rigFrame } from './light/rig.ts'
import { levelOf, levelsShown, showLevels } from './levels.ts'
import { animateDanceFloors, animateParty, placeGuest, poseGuest, poseStaff } from './party.ts'
import type { Screens } from './screens.ts'
import { isVideo, type Pictures } from './showing.ts'
import { type Turn } from './input.ts'
import type { Clock } from './clock.ts'
import type { Sim } from './sim.ts'
import type { AppLoop } from './app-loop.ts'
import { poseFiling } from './filing.ts'
import { fitPicture, placePicture } from './gallery.ts'
import { s } from './state.ts'
import { aim, fallTo, jump, look, walk } from './walker.ts'
import { groundAt } from './floorplan.ts'
import { panelGrid, setDoors } from './world.ts'
import type { Music } from './music.ts'
import { $ } from './dom.ts'
import { nowOf } from './now.ts'
import type { World } from './building.ts'
import type { Hud } from './hud.ts'
import type { Navigation } from './navigation.ts'
import type { Panels } from './panels.ts'
import type { Lighting } from './light/setting.ts'
import type { Stage } from './stage.ts'
import type { Input } from './input.ts'
import type { Port } from './port.ts'

/** What the frames resource is started with. */
export type FramesDeps = { clock: Clock; sim: Sim; tower: Tower; screens: Screens; pictures: Pictures; lighting: Lighting; stage: Stage; input: Input; music: Music; port: Port; world: World; hud: Hud; navigation: Navigation; panels: Panels; app: AppLoop }

export type Frames = ReturnType<typeof startFrames>

/** Real frames over the last second: how many, and the ms each spent in update and render; and what the last frame drew of the scene. */
export type Meter = { since: number; frames: number; work: number; fps: number; frameMs: number; calls: number; triangles: number }

/**
 * The frames: each one's update of what moves on its own, the walker, the camera, the aim and the life of the building,
 * and its render.
 */
export function startFrames(started: FramesDeps) {
  const { now: wallNow } = started.clock
  const { now: simNow, advance, stepped } = started.sim
  const { waitedAt } = started.app
  const { tower } = started
  const { paintScreens } = started.screens
  const { playFilms, imageOf } = started.pictures
  const { port } = started
  const { lit } = started.lighting
  const { camera, orbit, renderer, scene, tickOutside } = started.stage
  const { move, takeTurn } = started.input
  const { beatAt, duck, setRoom } = started.music
  const { boardNow, captured, panelNow, panelAs, viewNow, motionNow, heed, aimNow } = nowOf(port)
  const { screenDistance, boxesHere, here, discard, hang, planNow, ease, riddenFor, DOORS_SHUT, floorY, pick, floorOf, carried } = started.world
  const { renderElevator } = started.hud
  const { aimAt, offerNothing } = started.navigation
  const { run, tickPet } = started.panels

  /** Your hands in first person, made from the models once they load. */
  let hands: Hands | undefined

  /** The hands made from the models as they land, fitted to the camera. */
  function landHands(models: Models) {
    hands = makeHands(models)
    fitHands(hands, camera.aspect)
  }

  /** The hands, which a frame poses only once a board is built, after the models landed. */
  function landedHands() {
    if (!hands) throw new Error('the frames posed your hands before the models landed: a board was built before the feed started the first')
    return hands
  }

  const meter: Meter = { since: 0, frames: 0, work: 0, fps: 0, frameMs: 0, calls: 0, triangles: 0 }

  function measure(now: number, work: number) {
    const m = meter
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
    if (stepped()) return
    const start = performance.now()
    update(dt)
    if (drawing && !covered()) render()
    measure(now, performance.now() - start)
  }

  /**
   * Whether frames draw: a live page draws nothing until its first board is built and its shaders compiled (`startOn`),
   * a fixture page from its start.
   */
  let drawing = false

  /** Frames draw from now on. */
  const drawEachFrame = () => void (drawing = true)

  /** Frames draw from now on, this one at once. */
  function beginDrawing() {
    drawEachFrame()
    render()
  }

  /** The frame clock restarts now: the door hands the frames back to the browser. */
  const play = () => (lastFrame = performance.now())

  /** A panel that hides the world: while it is open the scene isn't drawn, and the canvas keeps its last frame. */
  const covered = () => panelNow()?.kind === 'desk' || panelNow()?.kind === 'shell' || panelNow()?.kind === 'doc' || panelNow()?.kind === 'kept' || panelNow()?.kind === 'picture' || panelNow()?.kind === 'logbook'

  function render() {
    frameScene()
    renderer.render(scene, camera)
    if (lit) bloom(renderer, scene, camera, wallNow())
    Object.assign(meter, { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles })
    if (hands && handsShown()) drawHands(renderer, hands)
  }

  /** What a frame sets on the scene before it is drawn: the screens painted, the levels shown, the lighting's passes. */
  function frameScene() {
    if (boardNow() && s.world) paintScreens(simNow(), screenDistance)
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
    if (cut && simNow() >= cut.at) port.dispatch({ type: 'cut-reached' })
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
    port.dispatch({ type: 'ride-arrived' })
  }

  function tickWalker(f: Frame) {
    const was = s.me
    stepWalker(f)
    const { pet } = motionNow()
    const stroke = pet && strokeAt(petProgress(pet, simNow()), pet.tailward)
    const note = carried()
    holdNote(landedHands(), note && { title: note.title, tag: note.tag, tint: tintOf(floorOf(note.project)) })
    holdBeer(landedHands(), s.beer)
    poseHands(landedHands(), was, s.me, stroke, f.dt, f.t)
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

  /** How open each level's landing doors are, 0 to 1, by level index. */
  const doorOpen = new Map<number, number>()

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
      const open = doorOpen.get(level.index) ?? 0
      const next = open + Math.sign(target - open) * Math.min(Math.abs(target - open), dt * 2.2)
      doorOpen.set(level.index, next)
      setDoors(s.world!.doors.get(level.index)!, next)
    }
    s.world!.car.position.y = floorY()
  }

  /** Where a flight goes from and to, written in place each frame it flies. */
  const flown = { from: new THREE.Vector3(), to: new THREE.Vector3(), fromQ: new THREE.Quaternion(), toQ: new THREE.Quaternion() }

  function tickCamera() {
    const { flight } = motionNow()
    if (flight) {
      const k = flight.ms ? Math.min(1, (simNow() - flight.start) / flight.ms) : 1
      camera.position.lerpVectors(flown.from.fromArray(flight.from), flown.to.fromArray(flight.to), ease(k))
      camera.quaternion.slerpQuaternions(flown.fromQ.fromArray(flight.fromQ), flown.toQ.fromArray(flight.toQ), ease(k))
      if (k === 1) port.dispatch({ type: 'flight-landed' })
    } else if (viewNow() === 'walk') aim(camera, s.me, floorY())
    else if (viewNow() === 'overview') orbit.update()
  }

  function tickAim() {
    if (viewNow() === 'walk' && captured() && !motionNow().flight) aimAt(pick(0, 0))
    else if (viewNow() !== 'overview' && !port.state().capture.still) offerNothing()
  }

  /** A held verb's ring fills; once full, the verb runs. */
  function tickHold() {
    const { hold } = aimNow()
    if (!hold) return
    const ring = $('prompt').querySelector<HTMLElement>(`[data-verb="${hold.verb}"] kbd`)
    const k = holdFill(hold.start, simNow())
    ring?.style.setProperty('--hold', String(k))
    if (k < 1) return
    port.dispatch({ type: 'hold-filled' })
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
      if (arriving) arrivalPose(desk.models, arriving, t)
      else poseRigs(desk, t, opened + t)
    }
    for (const l of s.leavers) {
      l.chair ??= chairLeft(l.desk)
      const inside = walkOut(l, dt)
      if (shown(l.level)) leaverPose(l, inside, t)
      if (inside && doorOpen.get(l.level) === 0) (s.leavers.delete(l), discard(l.group))
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
        const stroke = strokeAt(petProgress(pet, simNow()), pet.tailward)
        leanIn(cat, stroke?.reach ?? 0, stroke?.press ?? 0, petHeight(cat, waiter), t)
      } else if (cat.watching) {
        const perch = deskPerch(waiter!)
        chase(cat, planNow(), level!, perch.at, perch.face, dt, t)
      }
      else if (cat.following) tagAlong(cat, planNow(), s.me, dt, t)
      else if (cat.returning) cat.returning = !steer(cat, planNow(), place.level, place, 0.05, CAT_SPEED, dt, t)
      else roam(cat, place, levelY(place.level), t)
      hang(cat.level, cat.root)
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
    const pulse = still && t - waitedAt() / 1000 > PULSE_S ? 1 : 0.55 + Math.abs(Math.sin(t * 4)) * 0.45
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
    for (const pic of s.pictures.values()) (fitPicture(pic, imageOf), placePicture(pic, t))
  }

  /** At most this many videos play at once: each decodes and copies its frames to the GPU. */
  const PLAYING = 2

  /**
   * The newest videos shown on your floor play, muted, on its desks' monitors and in its gallery; every other holds the
   * frame it stopped on. None plays on a stepped clock, so its frames stay the same on every load.
   */
  function tickFilms() {
    const l = here()
    const shown = l?.kind === 'floor' && !stepped()
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
    advance(dt)
    const turned = takeTurn()
    if (!boardNow() || !s.world) return
    const f: Frame = { dt, t: simNow() / 1000, turned }
    for (const tick of TICKS) tick(f)
  }

  function resize() {
    renderer.setSize(innerWidth, innerHeight, false)
    camera.aspect = innerWidth / innerHeight
    camera.updateProjectionMatrix()
    if (hands) fitHands(hands, camera.aspect)
    if (covered()) render()
  }

  addEventListener('resize', resize)

  resize()

  requestAnimationFrame(frame)

  return { beginDrawing, drawEachFrame, play, render, frameScene, update, meter: (): Readonly<Meter> => meter, landHands }
}
