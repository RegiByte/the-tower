import { SOUNDS } from '/cards.js'
import { ICON } from '/icons.js'
import { $ } from './kit.js'
import { alertsSection, changesSection, tipsSection, faceInstalled, markdownSection, prefSections, settingsHtml, soundSection, wirePrefs } from '/settings.js'
import { placeOnOpen } from '/tips.js'

/**
 * @import { Ring, Sound } from '../../src/shared/cards.ts'
 * @import { Viewer } from '../../src/shared/viewer.ts'
 * @import { Loop } from '../../src/shared/loop.ts'
 * @import { PageState, PageEvent } from './page.js'
 */

/**
 * @typedef {{
 *   page: Loop<PageState, PageEvent>,
 *   viewer: () => Viewer,
 *   playSound: ({ notes, wave, step }: (typeof SOUNDS)[Sound]) => void,
 * }} SettingsPaneDeps
 */

/**
 * The settings popover (`/settings.js`): alerts, how often a wait rings and its sounds, the viewer's appearance and
 * how the brief draws markdown, drawn again while open whenever what it shows may have changed.
 * @param {SettingsPaneDeps} deps
 */
export function settingsPane(deps) {
  const { page, viewer, playSound } = deps
  /** @param {Ring} next */
  function chooseRing(next) {
    page.dispatch({ type: 'ring', ring: next })
    drawSettings()
  }

  /** The settings popover, drawn again whenever what it shows may have changed: only while open. @type {string | undefined} */
  let settingsDrawn

  const drawSettings = () => $('settings').matches(':popover-open') && paintSettings()

  function paintSettings() {
    const html = settingsHtml([alertsSection(Notification.permission), soundSection(page.state().attending.ring), ...prefSections(tower.prefs.get(), faceInstalled), markdownSection(viewer().briefMarkdown), changesSection(viewer().changesTree), tipsSection(viewer().tips, viewer().tipsDismissed.length)])
    if (html === settingsDrawn) return
    const focused = document.activeElement?.closest('#settings [data-ring-choice], #settings [data-sound-play], #settings [data-brief-markdown], #settings [data-changes-files], #settings [data-tips], #settings [data-pref]')
    const again = focused && [...focused.attributes].filter((a) => a.name.startsWith('data-') && a.name !== 'data-tip').map((a) => `[${a.name}="${CSS.escape(a.value)}"]`).join('')
    $('settings').innerHTML = settingsDrawn = html
    if (again) $('settings').querySelector(again)?.focus()
  }

  $('settings-open').innerHTML = ICON.settings

  placeOnOpen($('settings'), () => $('settings-open'))

  $('settings').addEventListener('beforetoggle', (e) => e.newState === 'open' && paintSettings())

  $('settings').addEventListener('click', async (e) => {
    const el = /** @type {Element} */ (e.target).closest('[data-alerts-ask], [data-ring-choice], [data-sound-play]')
    if (!el) return
    if (el.matches('[data-alerts-ask]')) return (await Notification.requestPermission(), drawSettings())
    if (el.dataset.ringChoice) return chooseRing(/** @type {Ring} */ (el.dataset.ringChoice))
    playSound(SOUNDS[/** @type {Sound} */ (el.dataset.soundPlay)])
  })

  wirePrefs($('settings'), tower.prefs.set)

  return { drawSettings }
}
