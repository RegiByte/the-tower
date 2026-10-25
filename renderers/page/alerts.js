import { SOUNDS, gistLine, shownTitle, statusName } from '/cards.js'
import { offerWords } from '/x/policies/panel.js'
import { shownPane, shownKey } from './kit.js'

/**
 * @import { Board, Card, CardShown, Floor, Wait } from '../../src/bridge/board.ts'
 * @import { Offer } from '../../extensions/policies/policies.ts'
 * @import { BoardAsk } from '../../src/shared/extensions.ts'
 * @import { Sound } from '../../src/shared/cards.ts'
 * @import { Pane } from './view.js'
 */

/**
 * @typedef {{
 *   callsign: (id: string) => string,
 *   select: (id: string) => void,
 *   showPane: (pane: Pane) => void,
 *   floorOf: (project: string) => Floor | undefined,
 *   board: () => Board,
 *   openPolicies: (project: string) => void,
 *   goToSubject: (key: string) => void,
 * }} AlertingDeps
 */

/**
 * What reaches the viewer away from the page: a notification for a wait, an ask, an offer or a showing, each opening what
 * it is about when clicked, and the sounds, played on one audio context.
 * @param {AlertingDeps} deps
 */
export function alerting(deps) {
  const { callsign, select, showPane, floorOf, board, openPolicies, goToSubject } = deps
  /**
   * One notification per wait or offer that begins (`/attend.js`), closed once it is over or dismissed.
   * @type {Map<string, Notification>}
   */
  const alerts = new Map()

  /** @type {AudioContext | undefined} */
  let audio

  /** @param {(typeof SOUNDS)[Sound]} sound */
  function playSound({ notes, wave, step }) {
    const ctx = (audio ??= new AudioContext())
    const now = ctx.currentTime
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = wave
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, now + i * step)
      gain.gain.linearRampToValueAtTime(0.12, now + i * step + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * step + 0.9)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now + i * step)
      osc.stop(now + i * step + 1)
    })
  }

  /** @param {Card} c @param {CardShown} s */
  function showShownAlert(c, s) {
    const n = new Notification(`${callsign(c.id)} ${s.kind === 'link' ? 'asks you to open' : 'shows you'} ${shownTitle(s)}`, { body: `${c.project}: ${s.target}`, tag: shownKey(s) })
    n.onclick = () => (window.focus(), select(c.id), showPane(shownPane(s)), n.close())
  }

  /** @param {Omit<Offer, 'calls' | 'actions'>} o */
  function showOfferAlert(o) {
    const n = new Notification(`${o.title ?? o.tag} · offered`, { body: `${/** @type {Floor} */ (floorOf(o.project)).name}: ${offerWords(board(), o, Date.now())}`, tag: o.key })
    n.onclick = () => (window.focus(), openPolicies(o.project), n.close())
    return n
  }

  /** @param {BoardAsk} a */
  function showAskAlert(a) {
    const n = new Notification(a.title, { body: `${a.cap} asks`, tag: a.key, requireInteraction: a.sound === 'wait' })
    n.onclick = () => (window.focus(), goToSubject(a.subject), n.close())
    return n
  }

  /** @param {Card} c @param {Wait} w */
  function showAlert(c, w) {
    const n = new Notification(`${callsign(c.id)} · ${statusName(c)}`, {
      body: `${c.project}: ${gistLine(c)}`, tag: c.id, requireInteraction: w.reason === 'blocked' || w.reason === 'asks',
    })
    n.onclick = () => (window.focus(), select(c.id), n.close())
    return n
  }

  return { alerts, playSound, showShownAlert, showOfferAlert, showAskAlert, showAlert }
}
