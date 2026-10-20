import { documentCss } from '/design.js'
import { base, esc, rendererUrl, shelfKind, shelfPage, shelfPaths, shelfSource, onDisk, tagOf } from '/cards.js'
import { ICON } from '/icons.js'
import { failedHtml, fileButtonsHtml } from '/panels.js'
import { HOME, sameRoom } from './view.js'
import { $, CLOSE_HOME, toast, told } from './kit.js'
import { documentHtml, safeHref } from '/markdown.js'

/**
 * @import { Floor } from '../../src/bridge/board.ts'
 * @import { RelayedUi } from '../../src/shared/shelf-page.ts'
 * @import { MainView } from './view.js'
 * @import { ShelfEntry } from '../../src/shared/model.ts'
 */

/**
 * @typedef {{
 *   viewing: <T extends MainView['t']>(t: T) => Extract<MainView, { t: T }> | undefined,
 *   go: (view: MainView) => void,
 *   floorOf: (project: string) => Floor | undefined,
 *   paint: (projectId: string | undefined) => string,
 *   rereadViewer: () => Promise<void>,
 *   render: () => void,
 *   select: (id: string) => void,
 *   goHome: () => void,
 *   view: () => MainView,
 * }} ShelfDeps
 */

/**
 * A floor's shelf entry in the main pane, by its kind: a page framed with the relay, a url framed when something
 * answers there, or a markdown collection's files listed and drawn where their scripts can't run.
 * @param {ShelfDeps} deps
 */
export function shelf(deps) {
  const { viewing, go, floorOf, paint, rereadViewer, render, select, goHome, view } = deps
  /** The files of the `md` shelf entry open, once read. @type {string[]} */
  let shelfFiles = []

  /** @param {string} project @param {number} n @param {string} [file] */
  const shelfPath = (project, n, file) => `shelf/${project}/${n}${file ? '/' + file.split('/').map(encodeURIComponent).join('/') : ''}`
  /** @param {string} project @param {number} n @param {string} [file] */
  const shelfUrl = (project, n, file) => `/${shelfPath(project, n, file)}`
  /** @param {string} project @param {number} n @param {string} [file] */
  const openShelf = (project, n, file) => {
    const open = viewing('shelf')
    const shown = open?.project === project && open.n === n ? open.file : undefined
    go(floorOf(project)?.shelf?.[n] ? { t: 'shelf', project, n, file: file ?? shown } : HOME)
  }

  /** @param {Extract<MainView, { t: 'shelf' }>} open */
  function enterShelf({ project, n, file }) {
    const f = /** @type {Floor} */ (floorOf(project))
    const entry = /** @type {ShelfEntry} */ (f.shelf?.[n])
    /** The entry's fields its kind names. @type {ShelfEntry & { url?: string, renderer?: string }} */
    const named = entry
    shelfFiles = []
    $('shelf-view').style.cssText = paint(project)
    const own = /** @type {Record<string, string | undefined>} */ ({ html: `/run/${project}/${n}`, url: named.url, renderer: named.renderer && rendererUrl(named.renderer) })[shelfKind(entry)]
    const tab = own ? `<a href="${esc(own)}" target="_blank" rel="noreferrer">${ICON.remote} new tab</a>` : ''
    const paths = shelfPaths(f, entry)
    $('shelf-head').innerHTML = `<span class="label">${esc(entry.label)}</span><span class="dim">${esc(f.name)} · ${esc(shelfSource(entry))}</span>
    <span class="actions">${paths.file ? fileButtonsHtml(paths.file) : ''}${paths.folder ? fileButtonsHtml(paths.folder) : ''}${tab}${CLOSE_HOME}</span>`
    $('shelf-body').innerHTML = ''
    if (shelfKind(entry) === 'html') showPage(shelfUrl(project, n, shelfPage(entry)))
    if (shelfKind(entry) === 'renderer') showPage(rendererUrl(/** @type {string} */ (named.renderer)))
    if (shelfKind(entry) === 'url') showUrl(/** @type {string} */ (named.url))
    if (shelfKind(entry) === 'md') showCollection(entry, file)
  }

  /** A page framed with the relay, at an opaque origin: an `html` entry's, or a declared renderer's, of the shelf entry open. @param {string} url */
  function showPage(url) {
    const { project, n } = /** @type {Extract<MainView, { t: 'shelf' }>} */ (viewing('shelf'))
    $('shelf-body').innerHTML = `<iframe id="shelf-page" class="page" sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-pointer-lock" allow="clipboard-write"></iframe>`
    pageRelay = tower.relay($('shelf-page'), url, { self: { project, n }, ui: towerVerbs, stored: () => rereadViewer().then(render) })
  }

  function leaveShelf() {
    closeRelay()
    $('shelf-body').innerHTML = ''
  }

  /** The open `html` or `renderer` entry's page, given the board and the API by `tower.relay`. @type {{ close(): void } | undefined} */
  let pageRelay
  const closeRelay = () => (pageRelay?.close(), (pageRelay = undefined))
  /** A `url` page gets the viewer's scheme alone, the only message it gets, which carries nothing private. */
  const sendScheme = () => $('shelf-url')?.contentWindow?.postMessage({ t: 'scheme', scheme: tower.prefs.get().scheme }, '*')

  /** @type {RelayedUi} */
  const towerVerbs = {
    select: ({ id }) => select(id),
    home: () => goHome(),
    shelf: ({ project, n }) => openShelf(project, n),
  }

  /** A frame of a page nobody serves would show the browser's error: say so instead, with a way to look again. @param {string} url */
  async function showUrl(url) {
    const opened = view()
    const up = await fetch(url, { mode: 'no-cors', cache: 'no-store' }).then(() => true, () => false)
    if (!sameRoom(view(), opened)) return
    $('shelf-body').innerHTML = up
      ? `<iframe id="shelf-url" class="page" src="${esc(url)}" allow="clipboard-read; clipboard-write"></iframe>`
      : `<div class="shelf-empty">nothing answers at ${esc(url)}<br><br><button data-shelf-retry>look again</button></div>`
    $('shelf-url')?.addEventListener('load', sendScheme)
  }

  /** A kept item by its tag, as every renderer calls it; any other file by its name. @param {ShelfEntry} entry @param {string} file */
  const shelfFileName = (entry, file) => ('item' in entry ? tagOf(file) : base(file).replace(/\.md$/, ''))

  /** The files of the md entry open. @param {ShelfEntry} entry @param {string | undefined} file */
  async function showCollection(entry, file) {
    const opened = /** @type {Extract<MainView, { t: 'shelf' }>} */ (viewing('shelf'))
    const files = await tower.get(/** @type {'shelf/<project>/<n>'} */ (shelfPath(opened.project, opened.n))).catch((err) => {
      if (sameRoom(view(), opened)) $('shelf-body').innerHTML = failedHtml(shelfSource(entry), err.message, 'data-shelf-retry')
    })
    if (!files || !sameRoom(view(), opened)) return
    if (!files.length) return ($('shelf-body').innerHTML = `<div class="shelf-empty">no file matches ${esc(shelfSource(entry))}</div>`)
    shelfFiles = files
    const hub = /** @type {Floor} */ (floorOf(opened.project)).hub
    $('shelf-body').innerHTML = `<div class="shelf-files">${files.map((f) => `<div class="shelf-file"><button data-doc="${esc(f)}" data-tip="${esc(f)}">${esc(shelfFileName(entry, f))}</button>${fileButtonsHtml(onDisk(hub, f))}</div>`).join('')}</div>
    <iframe id="shelf-doc" sandbox="allow-same-origin"></iframe>`
    showDoc(files.includes(/** @type {string} */ (file)) ? /** @type {string} */ (file) : files[0])
  }

  /** The document renders in a frame where its scripts can't run; the tower still reads its clicks. @param {string} file */
  async function showDoc(file) {
    go({ .../** @type {Extract<MainView, { t: 'shelf' }>} */ (viewing('shelf')), file })
    const opened = /** @type {Extract<MainView, { t: 'shelf' }>} */ (viewing('shelf'))
    for (const el of document.querySelectorAll('[data-doc]')) {
      el.classList.toggle('sel', el.dataset.doc === file)
      if (el.dataset.doc === file) el.setAttribute('aria-current', 'true')
      else el.removeAttribute('aria-current')
    }
    const md = await told(tower.text(shelfPath(opened.project, opened.n, file)))
    if (md === undefined) return
    if (view() !== opened) return
    const doc = $('shelf-doc')
    doc.onload = () => /** @type {Document} */ (doc.contentDocument).addEventListener('click', followLink)
    doc.srcdoc = `<!doctype html><html ${tower.prefs.attributes()}><meta charset="utf-8"><link rel="stylesheet" href="/design.css"><style>${documentCss}</style><article>${documentHtml(md, `/${shelfPath(opened.project, opened.n, file)}`)}</article>`
  }

  /** A link to another file of the collection opens it here; a web or mail link opens in a new tab, any other is refused. @param {MouseEvent} e */
  function followLink(e) {
    const a = /** @type {Element} */ (e.target).closest('a[href]')
    const href = a?.getAttribute('href')
    if (!href || href.startsWith('#')) return
    e.preventDefault()
    const target = new URL(href, `http://shelf/${viewing('shelf')?.file}`)
    if (target.host !== 'shelf') return safeHref(href) ? window.open(target.href, '_blank', 'noreferrer') : toast(`${href} is not a link the tower opens`)
    const file = decodeURIComponent(target.pathname.slice(1))
    if (shelfFiles.includes(file)) return showDoc(file)
    toast(`${file} is not in this collection`)
  }

  return { openShelf, enterShelf, leaveShelf, sendScheme, showDoc }
}
