import { DISMISS_ASK_TITLE } from '/lib/cards.js'
import { actionWords, badgesOf, glyphOf } from '/lib/layout.js'
import { ICON } from '/lib/view.js'
import { esc, plural, span } from '/lib/words.js'

/**
 * What extensions add to a subject, as the page draws it beside the core's own: badges, and actions as buttons whose
 * press the page runs through `runAdded`; and the asks, as rows beside the offers.
 * @import { Board, Subject } from '/lib/board.js'
 * @import { Action, Added, Badge, BoardAsk } from '/lib/extension.js'
 * @import { Glyph } from '/lib/layout.js'
 */

/** One badge: a link when it has `href`. @param {Added<Badge>} b */
export const badgeHtml = (b) => {
  const attrs = `class="badge ${b.tone ?? 'quiet'}"${b.hint ? ` data-tip="${esc(b.hint)}"` : ''}`
  return b.href ? `<a ${attrs} href="${esc(b.href)}" target="_blank" rel="noreferrer">${esc(b.label)}</a>` : `<span ${attrs}>${esc(b.label)}</span>`
}

/** A subject's badges: a link when one has `href`. @param {Board} board @param {Subject} subject */
export const badgesHtml = (board, subject) => badgesOf(board, subject).map(badgeHtml).join('')

/**
 * Draws a region's ranked items in the `count` form: the pinned and the first `k` of the rest, in rank, and the others
 * counted. Pinned items are not counted against `k`, `k` of `0` draws the pinned alone, and nothing left out is "+0".
 * `what` names the items (`noun`) and says each in words (`say`), so the ones left out can be listed; `pinned` says
 * which ones the layout pins. A region holding several kinds of item draws each through its own call and shows the
 * results together with `moreOf`.
 * @template T
 * @param {T[]} items ranked
 * @param {number} k
 * @param {{ noun: string, say: (item: T) => string, pinned: (item: T) => boolean }} what
 * @returns {{ drawn: T[], left: number, rest: string }} `rest`: what was left out in words, "3 lines: a, b, c"; empty when nothing was
 */
export const drawCount = (items, k, what) => {
  const room = items.filter((item) => !what.pinned(item)).slice(0, k)
  const drawn = items.filter((item) => what.pinned(item) || room.includes(item))
  const left = items.filter((item) => !drawn.includes(item))
  return { drawn, left: left.length, rest: left.length ? `${plural(left.length, what.noun)}: ${left.map(what.say).join(', ')}` : '' }
}

/**
 * The "+n" of one or more `drawCount` results, as the region shows it: `mark` is the "+n" as plain text, not focusable and
 * hidden from assistive tech, its tip listing what was left out; `note` is the same list as text hidden from browsing with the `id`
 * given, which the focusable thing of the row names in its `aria-describedby` (`by`). All three are empty when nothing
 * was left out.
 * @param {string} id
 * @param {{ left: number, rest: string }[]} counts
 */
export const moreOf = (id, counts) => {
  const left = counts.reduce((n, c) => n + c.left, 0)
  if (!left) return { mark: '', note: '', by: '' }
  const rests = counts.map((c) => c.rest).filter(Boolean)
  return {
    mark: `<span class="more" aria-hidden="true" data-tip="${esc(['also:', ...rests].join('\n'))}">+${left}</span>`,
    note: `<span hidden id="${esc(id)}">${esc(`also: ${rests.join('; ')}`)}</span>`,
    by: ` aria-describedby="${esc(id)}"`,
  }
}

/** One action as a button: what its press runs is on it, with the key of the subject it runs on. @param {Board} board @param {string} key @param {Added<Action>} action */
const actionHtml = (board, key, action) => {
  const words = actionWords(board, action)
  return `<button class="added${words.destructive ? ' danger' : ''}" data-added="${esc(JSON.stringify({ subject: key, action }))}"${words.hint ? ` data-tip="${esc(words.hint)}"` : ''}>${esc(words.label)}</button>`
}

/** Actions on a subject as buttons. @param {Board} board @param {Subject} subject @param {Added<Action>[]} actions */
export const actionsHtml = (board, subject, actions) => actions.map((a) => actionHtml(board, subject.key, a)).join('')

/** A glyph as the page draws it: a core icon inline, an extension's SVG as a mask in the ink around it. @param {Glyph} glyph */
const glyphHtml = (glyph) => (glyph.t === 'core' ? ICON[glyph.name] : `<span class="icon glyph" style="--glyph: url(&quot;${esc(glyph.href)}&quot;)"></span>`)

/** An action drawn as its glyph alone: its attributes, its label as the tip with its hint, and what it shows. @param {Board} board @param {Subject} subject @param {Added<Action>} a */
const iconOf = (board, subject, a) => {
  const words = actionWords(board, a)
  const glyph = glyphOf(board, a)
  return {
    words,
    attrs: `class="icon-btn added${words.destructive ? ' danger' : ''}" data-added="${esc(JSON.stringify({ subject: subject.key, action: a }))}" data-tip="${esc(words.hint ? `${words.label} · ${words.hint}` : words.label)}"`,
    face: glyph ? glyphHtml(glyph) : `<small>${esc(words.label)}</small>`,
  }
}

/**
 * Actions inside a control that is itself pressed (a tab): each its glyph alone, its label when it names none, its
 * words the tip; hidden from assistive tech as the control's own icons are, the palette running each by keyboard.
 * @param {Board} board @param {Subject} subject @param {Added<Action>[]} actions
 */
export const iconActionsHtml = (board, subject, actions) =>
  actions
    .map((a) => {
      const { attrs, face } = iconOf(board, subject, a)
      return `<span ${attrs} aria-hidden="true">${face}</span>`
    })
    .join('')

/** Actions as buttons showing their glyph alone, their label when they name none, labelled by it for assistive tech. @param {Board} board @param {Subject} subject @param {Added<Action>[]} actions */
export const iconButtonsHtml = (board, subject, actions) =>
  actions
    .map((a) => {
      const { words, attrs, face } = iconOf(board, subject, a)
      return `<button ${attrs} aria-label="${esc(words.label)}">${face}</button>`
    })
    .join('')

/**
 * Asks as rows: what is asked and by whom, which opens its subject and says its hint on hover, its actions on its
 * subject, and ✕ to dismiss it.
 * @param {Board} board @param {BoardAsk[]} asks @param {number} now
 */
export const asksHtml = (board, asks, now) =>
  asks.length
    ? `<div class="offers">${asks
        .map(
          (a) => `<div class="offer-row ask-row ${a.sound === 'wait' ? 'needs' : 'offered'}" data-hold="ask:${esc(a.key)}"><button class="what" data-open-view="${esc(JSON.stringify({ subject: a.subject }))}"${a.hint ? ` data-tip="${esc(a.hint)}"` : ''}><b>${esc(a.title)}</b> <span>${esc(a.cap)} asks · ${esc(span(now - a.since))} ago</span></button>
    <span class="acts">${a.actions.map((action) => actionHtml(board, a.subject, action)).join('')}</span>
    <button class="icon-btn" data-dismiss="${esc(a.key)}" aria-label="${DISMISS_ASK_TITLE}" data-tip="${DISMISS_ASK_TITLE}">${ICON.close}</button></div>`,
        )
        .join('')}</div>`
    : ''
