import { HELD, offerForKey, type Act } from './acts.ts'
import { asking } from '/lib/chrome.js'
import { markedIn } from './app.ts'
import { carBox, inside } from './layout.ts'
import { levelForKey } from './ui.ts'
import { addedCommandOf, commandOf } from '/lib/keys.js'
import { MOVE_KEYS } from './input.ts'
import { s } from './state.ts'
import { $ } from './dom.ts'
import { nowOf } from './now.ts'
import type { World } from './building.ts'

import type { Hud } from './hud.ts'

import type { Navigation } from './navigation.ts'

import type { Panels } from './panels.ts'

import type { Stage } from './stage.ts'
import type { Port } from './port.ts'

/** What the controls resource is started with. */
export type ControlsDeps = { stage: Stage; port: Port; world: World; hud: Hud; navigation: Navigation; panels: Panels }

export type Controls = ReturnType<typeof startControls>

/**
 * The pointer and the keys: what a click, a wheel or a key does in the world, and the keys a panel takes.
 */
export function startControls(started: ControlsDeps) {
  const { port } = started
  const { canvas } = started.stage
  const { boardNow, captured, unlock, letGo, atDesk, panelNow, go, viewNow, motionNow, replayNow, aimNow } = nowOf(port)
  const { planNow, pick } = started.world
  const { startMusic, toggleMusic, lock, toggleFps } = started.hud
  const { lookAtNew, closeSide, closePanels, goLevel, nextWaiting, startRide, overview, leaveOverview, offersNow, aimAt, startHold, unhold, markedOffer } = started.navigation
  const { replay, run, runCommand } = started.panels

  /** A keydown outside a terminal that runs a shared command. Returns whether it ran one. */
  function commandKey(e: KeyboardEvent) {
    const focus = typing() ? 'field' : 'page'
    const id = boardNow() && (commandOf(boardNow()!.keys, e, focus) ?? addedCommandOf(boardNow()!.keys, e, focus))
    if (!id || !runCommand(id, e)) return false
    e.preventDefault()
    return true
  }

  /** Runs the marked offer on a click; a held one starts filling instead. */
  function pressMarked(a: Act) {
    const o = markedOffer()
    if (o && HELD.has(o.verb)) startHold(a, o, 'mouse')
  }

  function releaseMarked(a: Act) {
    if (aimNow().hold?.by === 'mouse') return unhold()
    const o = markedOffer()
    if (o && !HELD.has(o.verb)) run(a, o.verb)
  }

  /** A click acts on what it pressed: under pointer lock the cursor never moves, but the view can turn to another act. */
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId)
    const { aimed, aimedKey } = aimNow()
    s.down = { x: e.clientX, y: e.clientY, act: aimedKey }
    if (e.button === 0 && aimed && (captured() || viewNow() === 'overview')) pressMarked(aimed)
  })

  canvas.addEventListener('pointerup', (e) => {
    if (e.button !== 0 || !boardNow() || !s.down) return
    const { aimed, aimedKey } = aimNow()
    if (Math.hypot(e.clientX - s.down.x, e.clientY - s.down.y) > 5 || aimedKey !== s.down.act) return unhold()
    if (viewNow() === 'overview' || captured()) return aimed && releaseMarked(aimed)
    closePanels()
    lock()
  })

  canvas.addEventListener('pointermove', (e) => {
    if (viewNow() !== 'overview' || !boardNow()) return
    const a = pick((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
    canvas.style.cursor = a ? 'pointer' : ''
    aimAt(a, { x: e.clientX, y: e.clientY })
  })

  canvas.addEventListener('wheel', (e) => {
    const offers = offersNow()
    if (viewNow() !== 'walk' || !captured() || offers.length < 2) return
    port.dispatch({ type: 'mark', marked: (markedIn(aimNow(), offers.length) + Math.sign(e.deltaY) + offers.length) % offers.length })
  }, { passive: true })

  $('paused').addEventListener('click', (e) => {
    if ((e.target as Element).closest('a, [popovertarget]')) return
    if (viewNow() === 'overview') leaveOverview()
    lock()
  })

  const typing = () => {
    const el = document.activeElement
    return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || asking() || ($('spawn') as HTMLDialogElement).open || ($('landing') as HTMLDialogElement).open
  }

  /** The aimed thing's verb on a key, by `KeyboardEvent.code`. */
  const offerOnKey = (code: string) => (aimNow().aimed && (captured() || viewNow() === 'overview') ? offerForKey(offersNow(), code) : undefined)

  /** A key the building answers, by `KeyboardEvent.code`: the aimed thing's verbs first, then the building's own. Returns whether it answered. */
  function onKey(code: string, repeat: boolean): boolean {
    if (code === 'KeyB') return (toggleMusic(), true)
    if (code === 'Backquote') return (toggleFps(), true)
    startMusic()
    if (viewNow() === 'pet') return false
    const offer = offerOnKey(code)
    const { aimed } = aimNow()
    if (aimed && offer) {
      if (!repeat) HELD.has(offer.verb) ? startHold(aimed, offer, code) : run(aimed, offer.verb)
      return true
    }
    // WebKit dispatches the Esc that ends a pointer lock while the lock still holds: framed, the tower would run it too.
    if (code === 'Escape' && captured()) return (unlock(), true)
    if (code === 'KeyP' && captured()) return (letGo(), true)
    if (code === 'KeyN') return (nextWaiting(), true)
    if (code === 'KeyV') return (lookAtNew(), true)
    if (code === 'KeyM') return (panelNow()?.kind === 'directory' ? (closeSide(), lock()) : go({ kind: 'directory' }), true)
    if (code === 'KeyH') return (viewNow() === 'overview' ? (leaveOverview(), lock()) : overview(), true)
    if (code === 'Escape' && viewNow() === 'overview') return (leaveOverview(), true)
    if (code === 'Escape' && replayNow() !== undefined && replayNow()!.id === atDesk()) return (replay(replayNow()!.id, undefined), true)
    if (code === 'Escape' && panelNow()) return (closePanels(), true)
    const to = levelForKey(planNow(), code)
    if (to === undefined || to === s.me.level || motionNow().ride) return false
    if (viewNow() === 'walk' && inside(carBox(planNow()), s.me.x, s.me.z)) startRide(to)
    else goLevel(to)
    return true
  }

  /** Keys the building took on their first press and that are still down: their repeats are taken too, whatever is aimed by then. */
  const takenDown = new Set<string>()

  /** A key the building answered is taken (`preventDefault`): framed in the tower, the tower runs its own command only for a key left alone. */
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || asking() || commandKey(e)) return
    // A replayed screen takes no input, so Esc ends the replay even while that screen has focus.
    if (e.code === 'Escape' && replayNow() !== undefined && replayNow()!.id === atDesk()) return (e.preventDefault(), replay(replayNow()!.id, undefined))
    if (!boardNow() || typing() || e.metaKey || e.ctrlKey || e.altKey) return
    // A verb that ran on the first press changes what is aimed at: the key still down is no longer offered, and each repeat would beep.
    if (e.repeat && takenDown.has(e.code)) return e.preventDefault()
    // A key the page leaves alone goes back to the app around it: Tower.app's WKWebView beeps on each one.
    if (MOVE_KEYS.has(e.code) && viewNow() === 'walk' && (captured() || document.activeElement === document.body)) e.preventDefault()
    // A verb may focus a field (the spawn dialog's prompt): its key must not be typed into it.
    if (offerOnKey(e.code)) e.preventDefault()
    if (onKey(e.code, e.repeat)) e.preventDefault()
    if (e.defaultPrevented && !e.repeat) takenDown.add(e.code)
  })

  document.addEventListener('keyup', (e) => {
    takenDown.delete(e.code)
    if (aimNow().hold?.by === e.code) unhold()
  })

  /** A key or button released while the page has no focus never reports it: a hold is a confirmation only while it is seen. */
  addEventListener('blur', () => (takenDown.clear(), unhold()))

  document.addEventListener('visibilitychange', unhold)

  return { onKey }
}
