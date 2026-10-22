import { CAPABILITIES, tipAt, tipKey, tipsOf } from '/capabilities.js'
import { esc } from '/cards.js'
import { ICON } from '/icons.js'
import { COMMANDS, chordLabel, keysLabel } from '/keymap.js'
import { $, repaint } from './kit.js'

/**
 * @import { Keys } from '../../src/shared/keymap.ts'
 * @import { Pattern, Tip } from '../../src/shared/capabilities.ts'
 * @import { Viewer } from '../../src/shared/viewer.ts'
 */

/**
 * @typedef {{
 *   viewer: () => Viewer,
 *   keys: () => Keys,
 *   now: () => number,
 * }} TipDeps
 */

/**
 * One tip at a time in the free end of the shells strip: a capability or a pattern (`/capabilities.js`), the one
 * `tipAt` picks for the clock and this load's seed, so it moves on as the page draws. A tip naming a command shows its
 * chords and runs it on a click. Hidden while the viewer turned tips off, and while it would not fit beside the tabs.
 * @param {TipDeps} deps
 */
export function tipStrip(deps) {
  const { viewer, keys, now } = deps
  const seed = Math.floor(Math.random() * CAPABILITIES.length)
  /** @type {Pattern[]} */
  let patterns = []

  /** A capability's words, escaped, its backticked spans as code. @param {string} text */
  const wordsHtml = (text) => esc(text).replace(/`([^`]+)`/g, '<code>$1</code>')

  /** @param {Tip} tip */
  function tipHtml(tip) {
    const dismiss = `<button class="icon-btn" data-tip-dismiss="${esc(tipKey(tip))}" aria-label="dismiss this tip for good" data-tip="dismiss this tip for good: settings bring it back">${ICON.close}</button>`
    if (tip.kind === 'pattern')
      return `<span class="tip-body" tabindex="0" data-tip="${esc(`${tip.summary}\n\n${tip.story.replace(/(?<!\n)\n(?!\n)/g, ' ')}`)}"><span class="eyebrow">pattern</span><b>${esc(tip.title)}</b></span>${dismiss}`
    const chord = tip.command && keysLabel(keys(), tip.command)
    const caps = tip.command ? keys()[tip.command].map((t) => `<kbd>${esc(chordLabel(t))}</kbd>`).join('') : ''
    const text = `<span class="eyebrow">tip</span><span>${wordsHtml(tip.text)}</span>${caps}`
    const does = tip.command && COMMANDS.find((c) => c.id === tip.command)?.does
    return (chord ? `<button class="tip-body" data-tip-run="${tip.command}" data-tip="${esc(`${chord}: ${does}`)}">${text}</button>` : `<span class="tip-body">${text}</span>`) + dismiss
  }

  /** The tip showing now, or none. */
  function paintTip() {
    const v = viewer()
    const tip = v.tips ? tipAt(tipsOf(CAPABILITIES, patterns, v.tipsDismissed), seed, now()) : undefined
    repaint($('tip'), tip ? tipHtml(tip) : '')
    fit()
  }

  /** The tip shows only whole: it hides while the strip's free end is narrower than it. */
  const fit = () => $('tip').classList.toggle('cramped', $('tip').scrollWidth > $('tip').clientWidth)
  new ResizeObserver(fit).observe($('tip'))

  tower.get('patterns').then((read) => ((patterns = read), paintTip()))

  return { paintTip }
}
