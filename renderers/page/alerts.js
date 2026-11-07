import { projectOfKey } from '/lib/board.js'
import { gistLine, shownTitle, SOUNDS, statusName } from '/lib/cards.js'
import { shownKey } from './kit.js'

/**
 * @import { Board, Card, CardShown, Floor, Wait } from '/lib/board.js'
 * @import { Sound } from '/lib/cards.js'
 * @import { BoardAsk } from '/lib/extension.js'
 */

/**
 * @typedef {{
 *   callsign: (id: string) => string,
 *   select: (id: string) => void,
 *   openShown: (c: Card, s: CardShown) => void,
 *   floorOf: (project: string) => Floor | undefined,
 *   board: () => Board,
 *   openAsk: (a: BoardAsk) => void,
 * }} AlertingDeps
 */

/**
 * What reaches the viewer away from the page: a notification for a wait, an ask, an offer or a showing, each opening what
 * it is about when clicked, and the sounds, played on one audio context.
 * @param {AlertingDeps} deps
 */
export function alerting(deps) {
  const { callsign, select, openShown, floorOf, board, openAsk } = deps
  /**
   * One notification per wait or offer that begins (`/lib/attend.js`), closed once it is over or dismissed.
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
    n.onclick = () => (window.focus(), openShown(c, s), n.close())
  }

  /**
   * An ask's notification: an offer says it is offered, where and its hint, anything else who asks.
   * @param {BoardAsk} a
   */
  function showAskAlert(a) {
    const project = projectOfKey(board(), a.subject)
    const said = a.sound === 'offer' ? [project && floorOf(project)?.name, a.hint].filter(Boolean).join(': ') : ''
    const n = new Notification(a.sound === 'offer' ? `${a.title} · offered` : a.title, { body: said || `${a.cap} asks`, tag: a.key, requireInteraction: a.sound === 'wait' })
    n.onclick = () => (window.focus(), openAsk(a), n.close())
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

  return { alerts, playSound, showShownAlert, showAskAlert, showAlert }
}
