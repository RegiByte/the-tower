import * as THREE from 'three'
import { offersOf, type Act, type Offer } from './acts.ts'
import { projectOfKey } from '/lib/board.js'
import { tower, type Board, type Wait } from './api.ts'
import { attentionOrder, isAsk, nextAttended, type Move, findCard, neighboursIn, shownKey } from './cards.ts'
import { actKey, markedIn, type AppEvent } from './app.ts'
import { sharing } from './tv.ts'
import { carBox, coreFront, deskOf, deskSpot, inside, kioskOf, levelOfCard, levelOfShell, levelY } from './layout.ts'
import { type Shown } from './showing.ts'
import { promptHtml } from './ui.ts'
import { s, type Standing } from './state.ts'
import { aim } from './walker.ts'
import { DECK } from './floorplan.ts'
import type { Toasts } from './toasts.ts'
import { $, show } from './dom.ts'
import { nowOf } from './now.ts'
import type { World } from './building.ts'
import type { Hud } from './hud.ts'
import type { Stage } from './stage.ts'
import type { Port } from './port.ts'

/** What the navigation resource is started with. */
export type NavigationDeps = { stage: Stage; port: Port; toasts: Toasts; world: World; hud: Hud }

export type Navigation = ReturnType<typeof startNavigation>

/**
 * Getting about: travel and its cut, going to a desk, a shell, a level or an ask, the overview, the elevator's ride,
 * and aiming at what the prompt offers.
 */
export function startNavigation(started: NavigationDeps) {
  const { port } = started
  const { orbit } = started.stage
  const { boardNow, unlock, atDesk, panelNow, go, viewNow, motionNow, heed, aimNow } = nowOf(port)
  const { toast } = started.toasts
  const { freshShown, dressSides, planNow, lookQuaternion, vec3, flyTo, flyHome, RIDE, carried } = started.world
  const { renderHud, showPaused, lock } = started.hud

  /** Seen again, it moves last: the oldest are the first to go once more than `SEEN_KEPT` are kept. */
  function see(sh: Shown) {
    s.seenShown.delete(shownKey(sh))
    s.seenShown.add(shownKey(sh))
    dressSides(boardNow())
    renderHud()
  }

  /** To the newest showing you have yet to open, at its worker's desk. */
  function lookAtNew() {
    const newest = freshShown()[0]
    if (!newest) return toast('Nothing new shown to you')
    if (atDesk() === newest.c.id) return openShown(newest.sh)
    goShown(newest.c.id, newest.sh.target)
  }

  /** A cut to elsewhere in the building: out to black, there (once `CUT_MS` have passed), back in, `then` fired. */
  const CUT_MS = 200

  function travel(level: number, spot: Standing, then: AppEvent) {
    if (level === s.me.level) return port.dispatch(then)
    port.dispatch({ type: 'cut', cut: { at: s.simNow + CUT_MS, level, spot, then } })
  }

  function closeSide() {
    if (panelNow()?.kind === 'floor' || panelNow()?.kind === 'archive' || panelNow()?.kind === 'directory' || panelNow()?.kind === 'elevator' || panelNow()?.kind === 'drawer' || panelNow()?.kind === 'shell-pick') go(undefined)
    sideClosed()
  }

  function sideClosed() {
    show('side', false)
    show('shell-pick', false)
  }

  /** Back to walking: the terminal closes and the camera returns to your eyes. */
  function unfocus() {
    const panel = panelNow()
    if (panel?.kind === 'desk' || panel?.kind === 'shell' || panel?.kind === 'tv') return go(undefined)
    showPaused()
  }

  /** Whatever panel is open left, back to walking: the picker hidden as it closes, since it doesn't leave by the app yet. */
  function closePanels() {
    closeSide()
    if (panelNow()) go(undefined)
    showPaused()
  }

  /** To the worker's desk, on the tab of its showing of `target`. */
  function goShown(id: string, target: string) {
    if (findCard(boardNow()!, id)?.shown.some((sh) => sh.target === target)) port.dispatch({ type: 'pend', pending: { shown: { id, target } } })
    goDesk(id)
  }

  /** To a worker's desk, wherever it is, and sit down. */
  function goDesk(id: string) {
    port.dispatch({ type: 'pend', pending: { desk: undefined } })
    toDesk(id)
  }

  function toDesk(id: string) {
    const level = levelOfCard(planNow(), id)
    const slot = deskOf(planNow(), id)
    if (!level || !slot) return toast(`${findCard(boardNow()!, id)?.callsign ?? id} is not on duty`)
    if (viewNow() === 'overview') leaveOverview()
    closeSide()
    travel(level.index, deskSpot(slot), { type: 'arrived', at: { kind: 'desk', id } })
  }

  function goShell(id: string) {
    port.dispatch({ type: 'pend', pending: { shell: undefined } })
    toShell(id)
  }

  function toShell(id: string) {
    const level = levelOfShell(planNow(), id)
    const k = kioskOf(planNow(), id)
    if (!level || !k) return
    if (viewNow() === 'overview') leaveOverview()
    closeSide()
    travel(level.index, { x: k.x + 1.9, z: k.z, y: DECK.top, yaw: -Math.PI / 2 }, { type: 'arrived', at: { kind: 'shell', id } })
  }

  /** To a level, in front of the elevator, `then` once there. */
  function arriveAt(index: number, then: AppEvent) {
    if (viewNow() === 'overview') leaveOverview()
    closePanels()
    travel(index, { x: 0, z: coreFront(planNow()) + 1.6, yaw: 0 }, then)
  }

  /** Out of the elevator on a level, facing its floor. */
  const goLevel = (index: number) => arriveAt(index, { type: 'arrived', at: { kind: 'level' } })

  /**
   * To the desk a move key names, in the order every renderer moves in (src/shared/cards.ts): N goes round the waits and
   * the asks you haven't dismissed (`attentionOrder`), each once a round.
   */
  function goMove(m: Move) {
    if (m !== 'waiting') {
      const to = neighboursIn(boardNow()!, s.viewer.crewsOrder, atDesk(), heed())[m]
      return to && goDesk(to.id)
    }
    const step = nextAttended(attentionOrder(boardNow()!, heed()), s.visited, { id: atDesk() })
    s.visited = step.visited
    if (!step.to) return
    if (isAsk(step.to)) return goToAsk(step.to)
    goDesk((step.to as Wait).id)
  }

  /**
   * Goes to what an ask is about: a worker's desk, else the floor its subject is on, its console open and the ask said
   * in a toast, since the console doesn't show it. The views an ask opens on the page have no place in the building
   * yet, so its subject stands for them; an ask about nothing on a floor is said in a toast alone.
   */
  function goToAsk(a: Board['asks'][number]) {
    const id = a.subject.startsWith('card:') ? a.subject.slice('card:'.length) : undefined
    if (id && deskOf(planNow(), id)) return goDesk(id)
    const project = projectOfKey(boardNow()!, a.subject)
    const level = project && planNow().levels.find((l) => l.kind === 'floor' && l.floor.id === project)
    if (level) return arriveAt(level.index, { type: 'arrived', at: { kind: 'ask', project, said: askSaid(a) } })
    toast(askSaid(a))
  }

  /** An ask in words: its title, and its hint after a blank line when it has one. */
  const askSaid = (a: Board['asks'][number]) => (a.hint ? `${a.title}\n\n${a.hint}` : a.title)

  const nextWaiting = () => goMove('waiting')

  function startRide(to: number) {
    if (motionNow().ride || to === s.me.level || !inside(carBox(planNow()), s.me.x, s.me.z)) return
    port.dispatch({ type: 'ride', ride: { from: s.me.level, to, start: s.simNow, move: Math.min(RIDE.most, RIDE.start + Math.abs(levelY(to) - levelY(s.me.level)) / RIDE.speed) } })
  }

  function overview() {
    closePanels()
    unlock()
    port.dispatch({ type: 'view', view: 'overview' })
    aimAt(undefined)
    show('paused', false)
    const top = planNow().levels.at(-1)!.y
    const center = new THREE.Vector3(0, top / 2, 0)
    const from = new THREE.Vector3(planNow().width * 0.85, top * 0.6 + 8, planNow().depth * 1.4 + top * 0.45)
    flyTo(from, lookQuaternion(from, center), 900, { type: 'arrived', at: { kind: 'overview', center: vec3(center) } })
  }

  function leaveOverview() {
    orbit.enabled = false
    port.dispatch({ type: 'view', view: 'walk' })
    show('prompt', false)
    flyHome()
  }

  /** What the prompt's act offers now: derived from the board and what you hold, never kept. */
  function offersNow() {
    const a = aimNow().offered
    return a && boardNow() ? offersOf(a, boardNow()!, { sharing: sharing(), framed: tower.framed, music: !s.muted, carrying: carried(), beer: s.beer, cats: s.catNames, lost: s.lost, galleries: planNow().galleries }) : []
  }

  /** The crosshair or the pointer is on `a`, and the prompt offers its verbs, drawn by `at` when the pointer gives one. */
  function aimAt(a: Act | undefined, at?: { x: number; y: number }) {
    const key = actKey(a)
    const aim = aimNow()
    if (key !== aim.aimedKey || key !== aim.offeredKey) port.dispatch({ type: 'aimed', act: a, key })
    drawPrompt(at)
  }

  /** The prompt offers nothing, what was last aimed at kept. */
  function offerNothing() {
    if (aimNow().offeredKey !== actKey(undefined)) port.dispatch({ type: 'offered', act: undefined, key: actKey(undefined) })
    drawPrompt()
  }

  let promptKey = ''

  function drawPrompt(at?: { x: number; y: number }) {
    const aim = aimNow()
    const a = aim.offered
    $('crosshair').classList.toggle('on', Boolean(a) && viewNow() === 'walk')
    const offers = offersNow()
    const marked = markedIn(aim, offers.length)
    const key = a ? `${aim.offeredKey}|${JSON.stringify(offers)}|${marked}|${Math.floor(s.simNow / 1000)}` : ''
    if (key !== promptKey) {
      promptKey = key
      const html = a && boardNow() ? promptHtml(a, boardNow()!, offers, marked, s.catNames, planNow().galleries) : ''
      $('prompt').innerHTML = html
      show('prompt', Boolean(html))
    }
    const el = $('prompt')
    if (at) Object.assign(el.style, { left: `${Math.min(at.x + 20, innerWidth - el.offsetWidth - 10)}px`, top: `${at.y + 20}px`, right: 'auto', bottom: 'auto' })
    else Object.assign(el.style, { left: '', top: '', right: '', bottom: '' })
  }

  function startHold(a: Act, o: Offer, by: string) {
    port.dispatch({ type: 'hold', hold: { act: a, verb: o.verb, start: s.simNow, by } })
  }

  /** A hold let go of: the key or the button released, or the page no longer seeing it held. */
  const unhold = () => void (aimNow().hold && port.dispatch({ type: 'unhold' }))

  /** The offer the wheel marked, among those offered now. */
  function markedOffer() {
    const offers = offersNow()
    return offers[markedIn(aimNow(), offers.length)]
  }

  $('elevator').addEventListener('click', (e) => {
    const to = (e.target as HTMLElement).closest<HTMLElement>('[data-ride]')?.dataset.ride
    if (to === undefined) return
    if (panelNow()?.kind === 'elevator') go(undefined)
    startRide(Number(to))
    lock()
  })

  const openShown = (shown: Shown) => port.dispatch({ type: 'tab', to: { tab: 'shown', target: shown.target } })

  return { see, lookAtNew, closeSide, sideClosed, unfocus, closePanels, goShown, goDesk, toDesk, goShell, toShell, goLevel, goMove, goToAsk, nextWaiting, startRide, overview, leaveOverview, offersNow, aimAt, offerNothing, startHold, unhold, markedOffer, openShown }
}
