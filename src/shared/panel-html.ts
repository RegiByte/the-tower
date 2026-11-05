/** What every panel says as html: a read that failed, and where settled work stands. */
import type { CheckoutState } from '../bridge/checkouts.ts'
import { esc } from './format.ts'
import { ICON } from './icons.ts'

/**
 * A read that failed, in place of what it would have drawn: what couldn't be read and why, and the control that reads
 * it again (`again`, its data attribute). Any renderer's own reads draw it too.
 */
export const failedHtml = (what: string, message: string, again: string) =>
  `<div class="read-failed" role="alert"><p>couldn't read ${esc(what)}: ${esc(message)}</p><button ${again}>${ICON.resume} Read again</button></div>`

/** Where work that no longer goes on stands, said once at the top of a panel: nothing beside it takes a note. */
export function settledHtml(state: CheckoutState, checkout: string) {
  if (state.is === 'live') return ''
  const said = state.is === 'gone'
    ? `<b>Worktree removed</b>: the folders of ${esc(checkout)} are gone, and nothing says its work landed.`
    : state.empty
      ? `<b>Nothing to land</b>: ${esc(checkout)} made no commits of its own${state.filed ? `, and its thread was filed ${esc(state.filed.at)}` : ''}.`
      : `<b>Landed${state.on ? ` on <code>${esc(state.on)}</code>` : ''}${state.edited ? `, ${state.edited} edited` : ''}</b>: the work of ${esc(checkout)} is in its base${state.edited ? `, ${state.edited === 1 ? 'one commit' : `${state.edited} commits`} changed on the way${state.branch ? ` (<button data-landing-of="${esc(state.branch)}">what landing changed</button>)` : ''}` : ''}${state.filed ? `, and its thread was filed ${esc(state.filed.at)}` : ''}.`
  return `<p class="settled" role="status">${said} Notes on it would reach nobody.</p>`
}
