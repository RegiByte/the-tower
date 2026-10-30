import type { Board, CardShown } from '../bridge/board.ts'
import { esc, shownTitle } from '../shared/cards.ts'
import { documentCss } from '../shared/design.ts'
import type { Tower } from '../shared/shelf-page.ts'
import type { Mount } from '../shared/views.ts'

/**
 * `tower/link`, the view of an address a worker showed (`text/uri-list`): a url framed as it is, a link as a page whose
 * one click opens it, as a browser opens no tab by itself.
 */

const ID = 'tower/link'

const CSS = `:where([data-view="${ID}"]) {
  & > iframe { flex: 1; min-height: 0; width: 100%; border: 0; background: #fff; }
  & > iframe.doc { background: var(--panel); }
}`

const DOC_CSS = `article { max-width: 980px; margin: 0; padding: var(--sp-xl) var(--sp-3xl) 48px; }`

type Address = CardShown & { card: string; project: string }

/** The link page, a document frame: the design's tokens and `article`, its link opening a tab of its own. */
const linkPage = (tower: Tower, callsign: string, s: Address) =>
  `<!doctype html><html ${tower.prefs.attributes()}><meta charset="utf-8"><base target="_blank"><link rel="stylesheet" href="/design.css"><style>${documentCss}${DOC_CSS}</style><article><h4>${esc(callsign)} asks you to open</h4><h2>${esc(shownTitle(s))}</h2><p><code>${esc(s.target)}</code></p>
    <p><a href="${esc(s.target)}" rel="noreferrer"><b>Open ↗</b></a></p></article>`

/** The callsign of the worker that showed `s`, as the board holds it. */
const callsignOf = (board: Board, s: Address) => board.floors.flatMap((f) => f.cards).find((c) => c.id === s.card)?.callsign ?? s.card

export const mount: Mount = (host, { tower, board: first, subject }) => {
  let board = first
  const s = subject.value as Address
  host.innerHTML =
    s.kind === 'url'
      ? `<style>${CSS}</style><iframe title="${esc(shownTitle(s))}" src="${esc(s.target)}" allow="clipboard-read; clipboard-write"></iframe>`
      : `<style>${CSS}</style><iframe class="doc" title="${esc(shownTitle(s))}" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"></iframe>`
  const frame = host.querySelector('iframe')!
  const draw = () => s.kind === 'link' && (frame.srcdoc = linkPage(tower, callsignOf(board, s), s))
  draw()
  const offs = [tower.onScheme(draw), tower.prefs.on(draw)]
  return {
    update(next) {
      board = next
    },
    close: () => offs.forEach((off) => off()),
  }
}
