import { SOUNDS } from '/lib/cards.js'
import { placeOnOpen } from '/lib/chrome.js'
import { alertsSection, changesSection, faceInstalled, markdownSection, keepingTyped, prefSections, screenSection, settingsHtml, sidebarSection, soundSection, tipsSection, wirePrefs } from '/lib/settings.js'
import { ICON, morphPanel } from '/lib/view.js'
import { $ } from './kit.js'

/**
 * @import { Ring, Sound } from '/lib/cards.js'
 * @import { Loop } from '/lib/machine.js'
 * @import { ScreenGroup, SectionChoice, SectionState } from '/lib/settings.js'
 * @import { Viewer } from '/lib/viewer.js'
 * @import { PageState, PageEvent } from './page.js'
 */

/**
 * @typedef {{
 *   page: Loop<PageState, PageEvent>,
 *   viewer: () => Viewer,
 *   playSound: ({ notes, wave, step }: (typeof SOUNDS)[Sound]) => void,
 *   screens: () => ScreenGroup[],
 *   screen: (region: string, on: boolean) => void,
 *   sections: () => SectionChoice[],
 *   section: (view: string, state: SectionState) => void,
 * }} SettingsPaneDeps
 */

/**
 * The settings popover (`/lib/settings.js`): alerts, how often a wait rings and its sounds, the viewer's appearance,
 * how the brief draws markdown and the sidebar's sections, drawn again while open whenever what it shows may have changed.
 * @param {SettingsPaneDeps} deps
 */
export function settingsPane(deps) {
  const { page, viewer, playSound, screens, screen, sections, section } = deps
  /** @param {Ring} next */
  function chooseRing(next) {
    page.dispatch({ type: 'ring', ring: next })
    drawSettings()
  }

  const drawSettings = () => $('settings').matches(':popover-open') && paintSettings()

  function paintSettings() {
    const html = settingsHtml([alertsSection(Notification.permission), soundSection(page.state().attending.ring), ...prefSections(tower.prefs.get(), faceInstalled), markdownSection(viewer().briefMarkdown), changesSection(viewer().changesTree), sidebarSection(sections()), screenSection(screens()), tipsSection(viewer().tips, viewer().tipsDismissed.length)])
    keepingTyped($('settings'), () => morphPanel($('settings'), html))
  }

  $('settings-open').innerHTML = ICON.settings

  placeOnOpen($('settings'), () => $('settings-open'))

  $('settings').addEventListener('beforetoggle', (e) => e.newState === 'open' && paintSettings())

  $('settings').addEventListener('click', async (e) => {
    const el = /** @type {Element} */ (e.target).closest('[data-alerts-ask], [data-ring-choice], [data-sound-play], [data-on-screen], [data-section-state]')
    if (!el) return
    if (el instanceof HTMLElement && el.dataset.sectionState) return section(/** @type {string} */ (/** @type {HTMLElement} */ (el.closest('[data-section-view]')).dataset.sectionView), /** @type {SectionState} */ (el.dataset.sectionState))
    if (el instanceof HTMLElement && el.dataset.onScreen) return screen(/** @type {string} */ (/** @type {HTMLElement} */ (el.closest('[data-screen-region]')).dataset.screenRegion), el.dataset.onScreen === 'on')
    if (el.matches('[data-alerts-ask]')) return (await Notification.requestPermission(), drawSettings())
    if (el.dataset.ringChoice) return chooseRing(/** @type {Ring} */ (el.dataset.ringChoice))
    playSound(SOUNDS[/** @type {Sound} */ (el.dataset.soundPlay)])
  })

  wirePrefs($('settings'), tower.prefs.set)

  return { drawSettings }
}
