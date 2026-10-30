import type { Board, Floor } from '../bridge/board.ts'
import { documentCss } from '../shared/design.ts'
import { base, esc, onDisk, rendererUrl, shelfKind, shelfPage, shelfPaths, shelfSource, tagOf } from '../shared/cards.ts'
import { fileButtonsHtml, fileCall } from '../shared/file-acts.ts'
import { ICON } from '../shared/icons.ts'
import { documentHtml } from '../shared/markdown.ts'
import type { ShelfEntry } from '../shared/model.ts'
import { failedHtml } from '../shared/panel-kit.ts'
import type { RelayedUi } from '../shared/shelf-page.ts'
import type { Mount } from '../shared/views.ts'
import { followLink } from './frame.ts'
import { closeHtml, viewCss } from './parts.ts'

/**
 * `tower/shelf`, a shelf entry's view, by its kind: a page framed with the relay at an origin of its own (an `html`
 * entry's, a declared renderer's), a url framed when something answers there, or a markdown collection's files listed
 * and drawn in a document frame where nothing runs. Its location's `args` name the file of the collection shown.
 */

const ID = 'tower/shelf'

const STYLE = viewCss(
  ID,
  `&[data-view] :is(button, a) { max-width: 100%; padding: var(--sp-2xs) var(--sp-m); font-size: var(--fs-xs); font-weight: 700; border-radius: var(--radius-pill); background: var(--pw); color: var(--pt);
    border: 1px solid transparent; text-decoration: none; line-height: 1.45; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  &[data-view] :is(button, a):hover { border-color: color-mix(in oklab, var(--pt) 40%, transparent); }
  & .shelf-files { flex: none; width: 260px; overflow-y: auto; padding: var(--sp-m) 0; border-right: 1px solid var(--line); background: var(--panel-2); font-size: var(--fs-m);
    scrollbar-width: thin; scrollbar-color: var(--line) transparent; scrollbar-gutter: stable; }
  & .shelf-files button { display: block; width: 100%; padding: var(--sp-xs) var(--sp-xl); border: none; border-radius: 0; background: none; color: var(--muted); font-weight: 400; text-align: left;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  & .shelf-files button:hover { color: var(--ink); }
  & .shelf-files button:focus-visible { outline-offset: -2px; }
  & .shelf-file { display: flex; align-items: center; padding-right: var(--sp-s); }
  & .shelf-file > button { flex: 1; min-width: 0; }
  & .shelf-files .file-act { display: grid; place-items: center; width: var(--control); padding: 0; }
  & .shelf-files button.sel { color: var(--ink); font-weight: 700; box-shadow: inset 3px 0 0 var(--p, var(--ink)); background: var(--panel); }`,
)

/** A kept item by its tag, as every renderer calls it; any other file by its name. */
const fileName = (entry: ShelfEntry, file: string) => ('item' in entry ? tagOf(file) : base(file).replace(/\.md$/, ''))

export const mount: Mount = (host, { tower, board, subject, kit, args }) => {
  const { project, n } = subject.value as { project: string; n: number }
  const f = board.floors.find((f) => f.id === project) as Floor
  const entry = f.shelf![n]
  const named = entry as ShelfEntry & { url?: string; renderer?: string }
  const kind = shelfKind(entry)
  const path = (file?: string) => `shelf/${project}/${n}${file ? '/' + file.split('/').map(encodeURIComponent).join('/') : ''}`
  /** The files of an `md` entry, once read, and the one shown. */
  let files: string[] = []
  let shown = args?.[0]
  let closed = false
  const offs: (() => void)[] = []

  const own = ({ html: `/run/${project}/${n}`, url: named.url, renderer: named.renderer && rendererUrl(named.renderer) } as Record<string, string | undefined>)[kind]
  const tab = own ? `<a href="${esc(own)}" target="_blank" rel="noreferrer">${ICON.remote} new tab</a>` : ''
  const paths = shelfPaths(f, entry)
  host.innerHTML = `<style>${STYLE}</style><div class="shelf-head"><span class="label">${esc(entry.label)}</span><span class="dim">${esc(f.name)} · ${esc(shelfSource(entry))}</span>
    <span class="actions">${paths.file ? fileButtonsHtml(paths.file) : ''}${paths.folder ? fileButtonsHtml(paths.folder) : ''}${tab}${closeHtml(board.keys)}</span></div><div class="shelf-body"></div>`
  const body = host.querySelector<HTMLElement>('.shelf-body')!

  const ui: RelayedUi = {
    select: ({ id }) => kit.display(`card:${id}`),
    home: () => kit.display('board'),
    shelf: ({ project, n }) => kit.display(`shelf:${project}/${n}`),
    go: ({ location }) => kit.go(location),
    display: ({ subject, view }) => kit.display(subject, view === undefined ? {} : { view }),
  }

  /** A page framed with the relay, at an opaque origin: an `html` entry's, or a declared renderer's. */
  const showPage = (url: string) => {
    body.innerHTML = `<iframe class="page" sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-pointer-lock" allow="clipboard-write"></iframe>`
    const relay = tower.relay(body.querySelector('iframe')!, url, { self: { project, n }, ui, stored: () => {} })
    offs.push(() => relay.close())
  }

  /** A `url` page gets the viewer's scheme alone, the only message it gets, which carries nothing private. */
  const sendScheme = () => body.querySelector<HTMLIFrameElement>('iframe.url')?.contentWindow?.postMessage({ t: 'scheme', scheme: tower.prefs.get().scheme }, '*')

  /** A frame of a page nobody serves would show the browser's error: say so instead, with a way to look again. */
  const showUrl = async (url: string) => {
    const up = await fetch(url, { mode: 'no-cors', cache: 'no-store' }).then(() => true, () => false)
    if (closed) return
    body.innerHTML = up
      ? `<iframe class="page url" src="${esc(url)}" allow="clipboard-read; clipboard-write"></iframe>`
      : `<div class="shelf-empty">nothing answers at ${esc(url)}<br><br><button data-shelf-retry>look again</button></div>`
    body.querySelector('iframe')?.addEventListener('load', sendScheme)
  }

  /** The document renders in a frame where its scripts can't run; the view still reads its clicks. */
  const showDoc = async (file: string) => {
    shown = file
    kit.go({ view: ID, subject: subject.key, args: [file] })
    for (const el of body.querySelectorAll<HTMLElement>('[data-doc]')) {
      el.classList.toggle('sel', el.dataset.doc === file)
      if (el.dataset.doc === file) el.setAttribute('aria-current', 'true')
      else el.removeAttribute('aria-current')
    }
    const md = await tower.text(path(file)).catch((err: Error) => (kit.toast(err.message), undefined))
    const doc = body.querySelector<HTMLIFrameElement>('iframe.doc')
    if (md === undefined || closed || shown !== file || !doc) return
    doc.onload = () => {
      const at = doc.contentDocument!
      at.addEventListener('click', followLink(at, { here: openHere, toast: kit.toast }))
    }
    doc.srcdoc = `<!doctype html><html ${tower.prefs.attributes()}><meta charset="utf-8"><link rel="stylesheet" href="/design.css"><style>${documentCss}</style><article>${documentHtml(md, `/${path(file)}`)}</article>`
  }

  /** A link to another file of the collection opens it here; one to a file it doesn't hold is refused, said in a toast. */
  const openHere = (href: string) => {
    const target = new URL(href, `http://shelf/${shown}`)
    if (target.host !== 'shelf') return false
    const file = decodeURIComponent(target.pathname.slice(1))
    if (files.includes(file)) void showDoc(file)
    else kit.toast(`${file} is not in this collection`)
    return true
  }

  /** The files of an `md` entry, the one the location names shown, else the first. */
  const showCollection = async () => {
    const read = await tower.get(path() as 'shelf/<project>/<n>').catch((err: Error) => {
      if (!closed) body.innerHTML = failedHtml(shelfSource(entry), err.message, 'data-shelf-retry')
    })
    if (!read || closed) return
    if (!read.length) return void (body.innerHTML = `<div class="shelf-empty">no file matches ${esc(shelfSource(entry))}</div>`)
    files = read
    body.innerHTML = `<div class="shelf-files">${files.map((file) => `<div class="shelf-file"><button data-doc="${esc(file)}" data-tip="${esc(file)}">${esc(fileName(entry, file))}</button>${fileButtonsHtml(onDisk(f.hub, file))}</div>`).join('')}</div>
    <iframe class="doc" sandbox="allow-same-origin"></iframe>`
    void showDoc(shown !== undefined && files.includes(shown) ? shown : files[0])
  }

  const open = () => {
    body.innerHTML = ''
    if (kind === 'html') showPage(`/${path(shelfPage(entry))}`)
    if (kind === 'renderer') showPage(rendererUrl(named.renderer!))
    if (kind === 'url') void showUrl(named.url!)
    if (kind === 'md') void showCollection()
  }

  host.addEventListener('click', (e) => {
    const target = e.target as Element
    const file = fileCall(target)
    if (file) return void tower.run(file).catch((err: Error) => kit.toast(err.message))
    if (target.closest('[data-home]')) return kit.display('board')
    if (target.closest('[data-shelf-retry]')) return open()
    const doc = target.closest<HTMLElement>('[data-doc]')?.dataset.doc
    if (doc) void showDoc(doc)
  })

  /** The viewer's appearance changed: a drawn document is drawn again in it, a url page told its scheme. */
  const restyle = () => {
    if (kind === 'md' && shown !== undefined && files.includes(shown)) void showDoc(shown)
    sendScheme()
  }
  offs.push(tower.prefs.on(restyle), tower.onScheme(restyle))

  open()

  return {
    update(_: Board) {},
    close() {
      closed = true
      offs.forEach((off) => off())
    },
  }
}
