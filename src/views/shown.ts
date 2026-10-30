import type { Board, CardShown } from '../bridge/board.ts'
import { esc, shownHref, shownTitle } from '../shared/cards.ts'
import { documentCss } from '../shared/design.ts'
import { documentHtml } from '../shared/markdown.ts'
import type { Tower } from '../shared/shelf-page.ts'
import type { Mount } from '../shared/views.ts'

/**
 * What a worker showed, drawn by its kind: a url framed as it is, a link as a page to open it from, a markdown file as
 * a document, an image or a video as itself, any other file framed where its scripts run at an origin of their own.
 * Mounted as a tab per showing, it stays drawn while hidden, so it is as it was left when shown again.
 */

const ID = 'tower/shown'

const CSS = `:where([data-view="${ID}"]) {
  position: absolute; inset: 0;
  & > :not(style) { position: absolute; inset: 0; width: 100%; height: 100%; }
  & iframe { border: 0; background: #fff; }
  & iframe.doc { background: var(--panel); }
  & img, & video { object-fit: contain; background: var(--enamel); }
}`

const DOC_CSS = `article { max-width: 980px; margin: 0; padding: var(--sp-xl) var(--sp-3xl) 48px; }`

type Showing = CardShown & { card: string; project: string }

/** A showing's element, by its kind. */
const shownHtml = (s: CardShown) =>
  s.kind === 'url' ? `<iframe src="${esc(s.target)}" allow="clipboard-read; clipboard-write"></iframe>` :
  s.kind === 'link' || s.target.endsWith('.md') ? `<iframe class="doc" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"></iframe>` :
  /\.(png|jpe?g|gif|webp|svg)$/i.test(s.target) ? `<img src="${esc(shownHref(s))}" alt="${esc(shownTitle(s))}">` :
  /\.(mp4|webm)$/i.test(s.target) ? `<video controls autoplay src="${esc(shownHref(s))}"></video>` :
  `<iframe sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" allow="clipboard-write" src="${esc(shownHref(s))}"></iframe>`

/** A document frame's page: the design's tokens and `article`, links opening a tab of their own. */
const docPage = (tower: Tower, article: string) =>
  `<!doctype html><html ${tower.prefs.attributes()}><meta charset="utf-8"><base target="_blank"><link rel="stylesheet" href="/design.css"><style>${documentCss}${DOC_CSS}</style><article>${article}</article>`

/** The callsign of the worker that showed `s`, as the board holds it. */
const callsignOf = (board: Board, s: Showing) => board.floors.flatMap((f) => f.cards).find((c) => c.id === s.card)?.callsign ?? s.card

export const mount: Mount = (host, { tower, board: first, subject, kit }) => {
  let board = first
  const s = subject.value as Showing
  host.innerHTML = `<style>${CSS}</style>${shownHtml(s)}`
  const el = host.lastElementChild as HTMLElement
  let closed = false

  /** A markdown file read and drawn as a document; a link as a page whose one click opens it, as a browser opens no tab by itself. */
  function draw() {
    if (!(el instanceof HTMLIFrameElement) || !el.classList.contains('doc')) return
    if (s.kind === 'link')
      el.srcdoc = docPage(tower, `<h4>${esc(callsignOf(board, s))} asks you to open</h4><h2>${esc(shownTitle(s))}</h2><p><code>${esc(s.target)}</code></p>
    <p><a href="${esc(s.target)}" rel="noreferrer"><b>Open ↗</b></a></p>`)
    else
      void tower.text(shownHref(s).slice(1)).then(
        (md) => closed || (el.srcdoc = docPage(tower, documentHtml(md, shownHref(s)))),
        (err: Error) => kit.toast(err.message),
      )
  }

  draw()
  const offs = [tower.onScheme(draw), tower.prefs.on(draw)]
  return {
    update(next) {
      board = next
    },
    visible(on) {
      if (!on && el instanceof HTMLVideoElement) el.pause()
    },
    close() {
      closed = true
      offs.forEach((off) => off())
    },
  }
}
