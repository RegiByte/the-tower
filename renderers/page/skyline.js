import { skyAt } from '/design.js'
import { loudest, heededWaits, whyNot, esc, gistLine, statusName } from '/cards.js'
import { onDuty, $, byStart, signHtml } from './kit.js'
import { chordLabel } from '/keymap.js'

/**
 * @import { Board, Card, Floor } from '../../src/bridge/board.ts'
 * @import { Heed } from '../../src/shared/cards.ts'
 */

/**
 * @typedef {{
 *   callsign: (id: string) => string,
 *   paint: (projectId: string | undefined) => string,
 *   board: () => Board,
 *   heed: () => Heed,
 *   cards: () => Card[],
 * }} SkylineDeps
 */

/**
 * The skyline, the main pane while nothing is open: a building per floor with a window per recent worker, under a
 * sky that follows the viewer's clock.
 * @param {SkylineDeps} deps
 */
export function skyline(deps) {
  const { callsign, paint, board, heed, cards } = deps
  /** Windows a building shows: its most recent sessions, oldest at the bottom. */
  const BUILDING_WINDOWS = 40
  const BUILDING_MIN_WINDOWS = 16

  /** @param {Card} c */
  const windowHtml = (c) => {
    const title = `${callsign(c.id)} · ${statusName(c)}${gistLine(c) ? ' · ' + gistLine(c) : ''}`
    return `<a class="w ${onDuty(c) ? 'lit' : 'past'} ${c.attention}" href="#${c.id}" aria-label="${esc(title)}" data-tip="${esc(title)}"></a>`
  }

  /** @param {Floor} f @param {number} i */
  const buildingHtml = (f, i) => {
    const shown = [...f.cards].sort(byStart).slice(-BUILDING_WINDOWS)
    const dark = '<div class="w"></div>'.repeat(Math.max(0, BUILDING_MIN_WINDOWS - shown.length) + (4 - (Math.max(shown.length, BUILDING_MIN_WINDOWS) % 4)) % 4)
    return `<div class="building" style="${paint(f.id)}">${signHtml(i + 1, f.name)}<div class="mast ${loudest(f.cards.filter((c) => c.waiting)) ?? ''} ${f.cards.some((c) => c.waiting) ? 'alarm' : ''}"></div>
    <div class="body">${shown.map(windowHtml).join('')}${dark}</div></div>`
  }

  /** The skyline's sky follows the viewer's clock, as Tower 3D's does: the sun crosses by day, the moon hangs at night. */
  function paintSky() {
    const now = new Date()
    const hours = now.getHours() + now.getMinutes() / 60
    const sky = skyAt(hours)
    const day = Math.min(1, Math.max(0, (hours - 6) / 13))
    for (const [name, value] of Object.entries({ top: sky.top, mid: sky.mid, horizon: sky.horizon })) $('sky').style.setProperty(`--sky-${name}`, value)
    $('sky').style.setProperty('--stars', String(sky.stars))
    $('sky').style.setProperty('--orb-x', sky.stars > 0.5 ? '86%' : `${36 + day * 56}%`)
    $('sky').style.setProperty('--orb-y', sky.stars > 0.5 ? '14%' : `${46 - Math.sin(day * Math.PI) * 34}%`)
    $('orb')?.classList.toggle('moon', sky.stars > 0.5)
    $('orb')?.classList.toggle('sun', sky.stars <= 0.5)
    const clock = $('clock')
    if (clock) clock.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  function skylineHtml() {
    const waiting = heededWaits(board(), heed()).length
    const working = cards().filter((c) => c.status === 'working').length
    const big = waiting ? `<b>${waiting}</b> waiting on you` : working ? `${working} at work` : 'all quiet'
    return `<div class="stars"></div><div class="orb" id="orb"></div>
    <div class="hello"><div class="big">${big}</div><div class="sub">${waiting && board().keys['next-waiting'].length ? `press ${board().keys['next-waiting'].map(chordLabel).join(' or ')} to go to the next one` : !board().hostUp ? `click a window to read it · ${esc(whyNot(board(), 'spawn'))}` : 'click a window, or + on a floor to start a session'}</div>
      <div class="clock" id="clock"></div></div>
    <div class="city">${board().floors.map(buildingHtml).join('')}</div><div class="street"></div>`
  }

  return { paintSky, skylineHtml }
}
