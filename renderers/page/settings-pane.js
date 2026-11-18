import { SOUNDS } from '/lib/cards.js'
import { placeOnOpen } from '/lib/chrome.js'
import { alertsSection, changesSection, faceInstalled, markdownSection, keepingTyped, prefSections, settingsHtml, soundSection, tipsSection, wirePrefs } from '/lib/settings.js'
import { ICON, morphPanel } from '/lib/view.js'
import { $ } from './kit.js'

/**
 * @import { Ring, Sound } from '/lib/cards.js'
 * @import { Loop } from '/lib/machine.js'
 * @import { Viewer } from '/lib/viewer.js'
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
 * The settings popover (`/lib/settings.js`): alerts, how often a wait rings and its sounds, the viewer's appearance and
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

  const drawSettings = () => $('settings').matches(':popover-open') && paintSettings()

  function paintSettings() {
    const html = settingsHtml([alertsSection(Notification.permission), soundSection(page.state().attending.ring), ...prefSections(tower.prefs.get(), faceInstalled), markdownSection(viewer().briefMarkdown), changesSection(viewer().changesTree), tipsSection(viewer().tips, viewer().tipsDismissed.length)])
    keepingTyped($('settings'), () => morphPanel($('settings'), html))
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
