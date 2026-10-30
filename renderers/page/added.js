import { DISMISS_ASK_TITLE, actionWords, addedActions, badgesOf, esc, span } from '/cards.js'
import { ICON } from '/icons.js'

/**
 * What extensions add to a subject, as the page draws it beside the core's own: badges, and actions as buttons whose
 * press the page runs through `runAdded` (`/cards.js`); and the asks, as rows beside the offers.
 * @import { Board } from '../../src/bridge/board.ts'
 * @import { Action, Added, BoardAsk } from '../../src/shared/extensions.ts'
 * @import { Subject } from '../../src/shared/subjects.ts'
 */

/** A subject's badges: a link when one has `href`. @param {Board} board @param {Subject} subject */
export const badgesHtml = (board, subject) =>
  badgesOf(board, subject)
    .map((b) => {
      const attrs = `class="badge ${b.tone ?? 'quiet'}"${b.hint ? ` data-tip="${esc(b.hint)}"` : ''}`
      return b.href ? `<a ${attrs} href="${esc(b.href)}" target="_blank" rel="noreferrer">${esc(b.label)}</a>` : `<span ${attrs}>${esc(b.label)}</span>`
    })
    .join('')

/** One action as a button: what its press runs is on it, with the key of the subject it runs on. @param {Board} board @param {string} key @param {Added<Action>} action */
const actionHtml = (board, key, action) => {
  const words = actionWords(board, action)
  return `<button class="added${words.destructive ? ' danger' : ''}" data-added="${esc(JSON.stringify({ subject: key, action }))}"${words.hint ? ` data-tip="${esc(words.hint)}"` : ''}>${esc(words.label)}</button>`
}

/** Actions on a subject as buttons. @param {Board} board @param {Subject} subject @param {Added<Action>[]} actions */
export const actionsHtml = (board, subject, actions) => actions.map((a) => actionHtml(board, subject.key, a)).join('')

/** A subject's added actions as buttons. @param {Board} board @param {Subject} subject */
export const addedActionsHtml = (board, subject) => actionsHtml(board, subject, addedActions(board, subject))

/** A subject's badges, then its added actions. @param {Board} board @param {Subject} subject */
export const addsHtml = (board, subject) => `${badgesHtml(board, subject)}${addedActionsHtml(board, subject)}`

/** Asks as rows: what is asked and by whom, its actions on its subject, and ✕ to dismiss it. @param {Board} board @param {BoardAsk[]} asks @param {number} now */
export const asksHtml = (board, asks, now) =>
  asks.length
    ? `<div class="offers">${asks
        .map(
          (a) => `<div class="offer-row ask-row ${a.sound === 'wait' ? 'needs' : 'offered'}" data-hold="ask:${esc(a.key)}"><span class="what"><b>${esc(a.title)}</b> <span>${esc(a.cap)} asks · ${esc(span(now - a.since))} ago</span></span>
    ${a.actions.map((action) => actionHtml(board, a.subject, action)).join('')}
    <button class="icon-btn" data-dismiss="${esc(a.key)}" aria-label="${DISMISS_ASK_TITLE}" data-tip="${DISMISS_ASK_TITLE}">${ICON.close}</button></div>`,
        )
        .join('')}</div>`
    : ''
