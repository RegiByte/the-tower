import { heldWhy } from './acts.ts'
import { briefCss } from '/lib/brief.js'
import { markdownCss } from '/lib/markdown.js'
import { changesSection, faceInstalled, keepingTyped, markdownSection, prefSections, settingsCss, settingsHtml, soundSection, wirePrefs } from '/lib/settings.js'
import { placeOnOpen, watchTips, toastsCss, ask } from '/lib/chrome.js'
import { ICON, morphPanel, panelsCss, itemsCss } from '/lib/view.js'
import { sawAll, seenOf } from '/lib/viewer.js'
import { isFresh as isNewAction, offeredIds } from '/lib/layout.js'
import { deskVerbs } from './desk-verbs.ts'
import type { Board, Card, Tower } from './api.ts'
import { untestedHtml, heededWaits, heededAsks, type Ring, type Sound, type DaemonVerb } from './cards.ts'
import { ring } from './life.ts'
import { sharing } from './tv.ts'
import { carBox, inside } from './layout.ts'
import { lightingSection } from './light/setting.ts'
import { elevatorHtml, hudHtml } from './ui.ts'
import type { Music } from './music.ts'
import type { Toasts } from './toasts.ts'
import { $, show } from './dom.ts'
import { nowOf } from './now.ts'
import type { World } from './building.ts'
import type { Views } from './views.ts'
import type { Spawn } from './spawn.ts'
import type { Lighting } from './light/setting.ts'
import type { Stage } from './stage.ts'
import type { Clients } from './clients.ts'
import type { Clock } from './clock.ts'
import type { Port } from './port.ts'
import type { WalkerCell } from './walker.ts'

/** What the hud resource is started with. */
export type HudDeps = { walker: WalkerCell; clock: Clock; tower: Tower; lighting: Lighting; clients: Clients; stage: Stage; music: Music; port: Port; toasts: Toasts; world: World; views: Views; spawn: Spawn }

export type Hud = ReturnType<typeof startHud>

/**
 * What is drawn over the world outside the panels: the HUD, the elevator's panel, the pause card, the settings, the
 * music and frame-rate toggles, and the viewer's record of what was seen.
 */
export function startHud(started: HudDeps) {
  const { me } = started.walker
  const { now: wallNow } = started.clock
  const { tower } = started
  const { port } = started
  const { lit, choose: chooseLighting } = started.lighting
  const { canvas } = started.stage
  const { pause, play, playing } = started.music
  const { boardNow, captured, unlock, panelNow, viewNow, motionNow, heed } = nowOf(port)
  const { toast } = started.toasts
  const { here, freshShown, planNow } = started.world
  const { deskNow } = started.views
  const { spawn } = started.spawn

  document.head.append(Object.assign(document.createElement('style'), { textContent: panelsCss + briefCss + markdownCss + settingsCss + toastsCss + itemsCss }))

  watchTips(document)

  /** Why a daemon verb is held back now, for the panels' buttons. */
  const held = (verb: DaemonVerb) => heldWhy(boardNow()!, port.state().attending.lost, verb)

  /**
   * Whether a panel button that asks first (`data-ask`, as `askingButton` draws it) was answered yes in the library's
   * dialog. A button that asks nothing is answered at once, in the press that made it, so a lock still has its gesture.
   */
  const answered = (el: HTMLElement) => el.dataset.ask === undefined || ask(el.dataset.ask, el.dataset.askVerb!)

  /**
   * Music unless you turned it off, kept with your spot, and never over a game, which may play its own. The door plays
   * none: an agent's browser has no one to hear it.
   */
  const startMusic = () => !port.state().muted && !port.state().doorMode && panelNow()?.kind !== 'game' && !playing() && play()

  const toggleMusic = () => port.dispatch({ type: 'music/muted', muted: !port.state().muted })

  /** The music played as `startMusic` would, or paused (the app's `music`). */
  const turnMusic = (on: boolean) => void (on ? startMusic() : pause())

  let hudKey = ''

  function renderHud() {
    const waits = heededWaits(boardNow()!, heed())
    const asks = heededAsks(boardNow()!, heed())
    document.title = waits.length + asks.length ? `(${waits.length + asks.length}) The Tower` : 'The Tower'
    const html = hudHtml(boardNow()!, here(), { music: !port.state().muted, sharing: sharing(), fresh: freshShown().length, waits, asks: asks.length, now: wallNow() }, started.clients)
    if (html !== hudKey) ($('hud').innerHTML = hudKey = html)
    drawSettings()
    const notes = untestedHtml(boardNow()!) ?? ''
    if (notes !== $('hud-notes').innerHTML) $('hud-notes').innerHTML = notes
  }

  function renderElevator() {
    const { ride } = motionNow()
    const inCar = viewNow() === 'walk' && (ride !== undefined || inside(carBox(planNow()), me().x, me().z))
    show('elevator', inCar)
    if (inCar) $('elevator').innerHTML = elevatorHtml(planNow(), ride ? ride.to : me().level, ride !== undefined, heededWaits(boardNow()!, heed()))
  }

  /** The pause card stands for the free mouse only while nothing else holds it: a panel, the spawn dialog, or P. */
  const showPaused = () => show('paused', !captured() && viewNow() === 'walk' && !panelNow() && !port.state().capture.still && !spawn.open)

  /** Walking takes the mouse: pointer lock, or the door's capture once the door has captured. */
  function lock() {
    startMusic()
    show('paused', false)
    if (port.state().doorMode) return port.dispatch({ type: 'capture', by: 'door', held: true })
    canvas.requestPointerLock().catch((err: Error) => (show('paused', true), toast(`pointer lock: ${err.message}`)))
  }

  /** The mouse let go of: the door's capture released, pointer lock exited. */
  function unlocked() {
    if (port.state().capture.door) port.dispatch({ type: 'capture', by: 'door', held: false })
    if (document.pointerLockElement) document.exitPointerLock()
  }

  /**
   * The actions seen as `read` from the store, with what this page saw (`here`) kept: the set only grows, and a read
   * sent before this page's last write may answer without it.
   */
  const seenSince = (read: string[] | null, here: string[] | null) => (read && here ? (sawAll(read, here) ?? read) : (read ?? here))

  /** The actions you have seen, by `actionId`, across every renderer of yours. */
  const seenNow = (board: Board) => seenOf(port.state().viewer.seen, offeredIds(board))

  /** The actions the open desk drew with a "new" dot: drawn so until its panel closes, though seen once drawn. */
  const dotted = new Set<string>()

  /** The open desk's dots forgotten, as its panel closes. */
  const clearDots = () => dotted.clear()

  /** Whether the open desk draws an action's "new" dot: while it is new to you, and until the panel closes once it drew it so. */
  const dottedNow = (board: Board) => {
    const offered = offeredIds(board)
    const seen = seenNow(board)
    return (id: string) => dotted.has(id) || isNewAction(offered, seen, id)
  }

  /** `ids` seen by you, kept for every renderer of yours when that adds any. */
  function sawActions(board: Board, ids: string[]) {
    const seen = sawAll(seenNow(board), ids)
    if (seen) port.dispatch({ type: 'viewer/kept', field: 'seen', value: seen })
  }

  /**
   * The verbs new to you that worker `c`'s desk draws count as seen once drawn in a focused window; the desk keeps their
   * dots until its panel closes, so you see them. Run at every paint of the desk and when the window gains focus.
   */
  function sawDesk(board: Board, c: Card) {
    if (!document.hasFocus()) return
    const offered = offeredIds(board)
    const seen = seenNow(board)
    const fresh = deskVerbs(board, c, deskNow(board)).map((r) => r.id).filter((id) => isNewAction(offered, seen, id))
    for (const id of fresh) dotted.add(id)
    sawActions(board, fresh)
  }

  function chooseRing(ring: Ring) {
    port.dispatch({ type: 'ring', ring })
    drawSettings()
  }

  /**
   * The settings popover: how waits ring, the viewer's appearance and the building's lighting. Notifications are the tower page's, so it offers none. It
   * stands by the button that opened it, in the HUD or on the pause card.
   */
  /** The lighting setting as last chosen, kept in `tower.store` under `LIGHTING_KEY`: the page draws what it started with (`lit`). */
  let chosen = lit

  let settingsBy: Element = $('hud')

  const settingsEl = $('settings')

  const drawSettings = () => settingsEl.matches(':popover-open') && paintSettings()

  function paintSettings() {
    const html = settingsHtml([soundSection(port.state().attending.ring), ...prefSections(tower.prefs.get(), faceInstalled), markdownSection(port.state().viewer.briefMarkdown), changesSection(port.state().viewer.changesTree), lightingSection(chosen, lit)])
    keepingTyped(settingsEl, () => morphPanel(settingsEl, html))
  }

  placeOnOpen(settingsEl, () => settingsBy)

  document.querySelector('.paused-settings')!.innerHTML = `${ICON.settings}Settings`

  $('watch-close').innerHTML = ICON.close

  settingsEl.addEventListener('beforetoggle', (e) => (e as ToggleEvent).newState === 'open' && paintSettings())

  document.addEventListener('click', (e) => (settingsBy = (e.target as Element).closest('[popovertarget="settings"]') ?? settingsBy), true)

  settingsEl.addEventListener('click', (e) => {
    const el = (e.target as Element).closest<HTMLElement>('[data-ring-choice], [data-sound-play], [data-lighting], [data-lighting-reload]')
    if (!el) return
    if (el.dataset.lighting) return (chooseLighting((chosen = el.dataset.lighting === 'true')), drawSettings())
    if (el.hasAttribute('data-lighting-reload')) return location.reload()
    if (el.dataset.ringChoice) return chooseRing(el.dataset.ringChoice as Ring)
    ring(el.dataset.soundPlay as Sound)
  })

  wirePrefs(settingsEl, tower.prefs.set)

  tower.prefs.on(() => drawSettings())

  const toggleFps = () => port.dispatch({ type: 'meter/shown', shown: !port.state().meterShown })

  /** The frame meter shown or hidden (the app's `meter`). */
  const showMeter = (shown: boolean) => show('fps', shown)

  spawn.addEventListener('close', showPaused)

  /**
   * The window's and the document's listeners that read the app's db or dispatch to it, and the HUD's refresh: added by
   * the app as it attaches, so none can run before it.
   */
  function listen() {
    tower.get('origins').then((origins) => port.dispatch({ type: 'origins/read', origins }), (err: Error) => toast(`origins: ${err.message}`))

    document.addEventListener('pointerlockchange', () => port.dispatch({ type: 'capture', by: 'pointer', held: document.pointerLockElement === canvas }))

    /**
     * Focus leaving the window takes the keys with it, to another app or to what the page framing this one opened over it
     * (its palette, a dialog), and Chrome keeps a frame's pointer lock through that: the mouse is let go of, as on Esc, so
     * the pause card stands and the next Esc reaches where focus went. Focus moving into one of this page's own frames
     * leaves the document focused.
     */
    addEventListener('blur', () => setTimeout(() => captured() && !document.hasFocus() && unlock()))

    /** The HUD's limits count down to their resets and age between boards. */
    setInterval(() => boardNow() && renderHud(), 30_000)
  }

  return { listen, held, answered, startMusic, toggleMusic, renderHud, renderElevator, showPaused, lock, unlocked, seenSince, dottedNow, clearDots, sawActions, sawDesk, drawSettings, toggleFps, turnMusic, showMeter }
}
