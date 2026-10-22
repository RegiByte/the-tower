import { documentCss } from '/design.js'
import { esc, span, plural } from '/cards.js'
import { ICON } from '/icons.js'
import { collectionTrayHtml, deleteAsk, itemFile, itemKind, itemPath, itemsCss, itemTextHtml, keptTitles, readsText } from '/items.js'
import { drawPanel, failedHtml, fileButtonsHtml, policiesHtml, policyDoneLine } from '/panels.js'
import { POLICIES } from '/policies.js'
import { HOME } from './view.js'
import { $, closeHomeHtml, repaint, toast, told } from './kit.js'
import { pressing } from '/press.js'
import { DRAFTS } from '/drafts.js'

/**
 * @import { Board, Floor, FloorCollection, FloorItem } from '../../src/bridge/board.ts'
 * @import { Call, Replies } from '../../src/shared/api.ts'
 * @import { Loop } from '../../src/shared/loop.ts'
 * @import { MainView } from './view.js'
 * @import { PageState, PageEvent } from './page.js'
 * @import { Titled } from '../../src/shared/titles.ts'
 */

/**
 * @typedef {{
 *   render: () => void,
 *   viewing: <T extends MainView['t']>(t: T) => Extract<MainView, { t: T }> | undefined,
 *   go: (view: MainView) => void,
 *   floorOf: (project: string) => Floor | undefined,
 *   goHome: () => void,
 *   draftTitle: (project: string, item: Titled) => string,
 *   newDraftHtml: (f: Floor) => string,
 *   board: () => Board,
 *   page: Loop<PageState, PageEvent>,
 *   selectArriving: (id: string) => void,
 *   view: () => MainView,
 *   ask: (text: string, verb: string) => Promise<boolean>,
 * }} KeptViewsDeps
 */

/**
 * What a floor keeps, in the main pane: a collection listed whole, a kept item drawn by its kind, and the floor's
 * policies with their Run now, Approve and Accept.
 * @param {KeptViewsDeps} deps
 */
export function keptViews(deps) {
  const { render, viewing, go, floorOf, goHome, draftTitle, newDraftHtml, board, page, selectArriving, view, ask } = deps
  /** Every other collection's items, titled from their text where their type names itself; a row opens the item in the main pane. */
  const { title: keptTitle, prune: pruneKeptTitles } = keptTitles((project, collection, id) => tower.text(itemPath(project, collection, id)), () => render())

  /** @param {string} project @param {string} collection @param {string} id */
  const isOpenItem = (project, collection, id) => viewing('item')?.project === project && viewing('item')?.collection === collection && viewing('item')?.id === id

  /** A floor's policies in the main pane (`policiesHtml`, /panels.js). @param {string} project */
  const openPolicies = (project) => go(floorOf(project) ? { t: 'policies', project } : HOME)

  /** A floor's collection listed whole in the main pane, newest first: its tray in the sidebar lists only the newest. @param {string} project @param {string} collection */
  const openCollection = (project, collection) => go(floorOf(project)?.collections.some((c) => c.id === collection) ? { t: 'collection', project, collection } : HOME)

  function drawCollection() {
    const open = /** @type {Extract<MainView, { t: 'collection' }>} */ (viewing('collection'))
    const f = floorOf(open.project)
    const c = f?.collections.find((c) => c.id === open.collection)
    if (!f || !c) return goHome()
    const drafts = c.id === DRAFTS
    repaint($('collection-head'), `<span class="label">${esc(c.label)}</span><span class="dim">${esc(f.name)}</span><span class="actions"><small class="dim">${plural(c.items.length, 'item')}</small>${closeHomeHtml(board().keys)}</span>`)
    repaint($('collection-list'), collectionTrayHtml(f.id, c, (item) => (drafts ? draftTitle(f.id, item) : keptTitle(f.id, c.id, item)), undefined, Date.now(), drafts ? newDraftHtml(f) : ''))
  }

  function drawPolicies() {
    const f = floorOf(/** @type {Extract<MainView, { t: 'policies' }>} */ (viewing('policies')).project)
    if (!f) return goHome()
    repaint($('policies-head'), `<span class="label">Policies</span><span class="dim">${esc(f.name)}</span><span class="actions">${closeHomeHtml(board().keys)}</span>`)
    drawPanel($('policies-body'), policiesHtml({ board: board(), floor: f, now: Date.now(), dismissed: page.state().attending.dismissed }), {})
  }

  /**
   * A policy's Run now or Approve, or an offer's Accept: a run started opens its worker once the board carries it.
   * @param {HTMLElement} button
   * @param {Call<'policy/run' | 'policy/approve'>} call
   */
  async function policyCall(button, call) {
    const policy = /** @type {string} */ (call[1].policy)
    const title = floorOf(/** @type {string} */ (call[1].project))?.policies.find((p) => p.id === policy)?.title ?? policy
    const reply = await told(pressing(button, () => /** @type {Promise<Replies['policy/run'] | Replies['policy/approve']>} */ (tower.run(call))))
    if (!reply) return
    toast(policyDoneLine(call, title, reply))
    if (call[0] === 'policy/run') selectArriving(/** @type {Replies['policy/run']} */ (reply).id)
  }

  /** The version of the kept item open that its body was drawn from. @type {number | undefined} */
  let itemDrawn

  function leaveItem() {
    itemDrawn = undefined
    $('item-body').innerHTML = ''
  }

  /** The item open is drawn again from its file on the next render. */
  const forgetItem = () => (itemDrawn = undefined)

  /** @typedef {{ project: string, collection: string, id: string }} ItemRef */
  /** @param {ItemRef} ref */
  const itemOf = ({ project, collection, id }) => {
    const c = floorOf(project)?.collections.find((c) => c.id === collection)
    return { c, item: c?.items.find((i) => i.id === id) }
  }

  /** @param {string} project @param {string} collection @param {string} id */
  function openItem(project, collection, id) {
    if (!itemOf({ project, collection, id }).item) return toast('That item is gone')
    go({ t: 'item', project, collection, id })
  }

  /** The head says what the item is and who kept it; the body is drawn again only when the item changes. Deleted elsewhere, it closes. */
  function drawItem() {
    const open = /** @type {Extract<MainView, { t: 'item' }>} */ (viewing('item'))
    const { c, item } = itemOf(open)
    if (!c || !item) return (goHome(), toast('The item was deleted'))
    const f = /** @type {Floor} */ (floorOf(open.project))
    const file = itemFile(c, item.id)
    const by = item.keptBy ? ` · kept by <a href="#${item.keptBy.session}" data-tip="go to the worker that kept it">${esc(item.keptBy.callsign)}</a>` : ''
    const back = c.id === POLICIES ? `<button class="icon-btn" data-policies="${esc(f.id)}" aria-label="back to the policies" data-tip="back to the floor's policies">${ICON.back}</button>` : ''
    repaint($('item-head'), `${back}<span class="label">${esc(c.label)}</span><button class="tag" data-copy="${esc(item.tag)}" data-tip="${esc(file)} · click to copy the tag">${esc(item.tag)}</button>${fileButtonsHtml(file)}
    <span class="dim">${esc(f.name)} · ${esc(keptTitle(f.id, c.id, item))}${by} · changed ${span(Date.now() - item.modifiedAt)} ago</span>
    <span class="actions"><a href="/${esc(itemPath(f.id, c.id, item.id))}" target="_blank" rel="noreferrer" data-tip="open it on its own">${ICON.remote} new tab</a>
      <button class="danger" data-item-act="delete">Delete</button>
      ${closeHomeHtml(board().keys)}</span>`)
    if (itemDrawn !== item.modifiedAt) showItemBody(c, item)
  }

  /**
   * Markdown and text are read and drawn in a frame where nothing runs; an html item runs framed at an origin of its own
   * with no API (the shelf's `item` entry grants that); an image is shown; any other file is left to Finder and the editor.
   */
  /** @param {FloorCollection} c @param {FloorItem} item */
  async function showItemBody(c, item) {
    const opened = /** @type {Extract<MainView, { t: 'item' }>} */ (viewing('item'))
    itemDrawn = item.modifiedAt
    const kind = itemKind(item.id)
    const url = `/${itemPath(opened.project, c.id, item.id)}`
    if (kind === 'html') return ($('item-body').innerHTML = `<iframe class="page" title="${esc(item.tag)}" sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-pointer-lock" allow="clipboard-write" src="${esc(url)}?v=${item.modifiedAt}"></iframe>`)
    if (kind === 'image') return ($('item-body').innerHTML = `<div class="item-image"><img src="${esc(url)}?v=${item.modifiedAt}" alt="${esc(item.tag)}"></div>`)
    if (!readsText(kind)) return ($('item-body').innerHTML = `<div class="shelf-empty">the tower shows no ${esc(item.id.split('.').pop())} file<br><br>reveal it in Finder or open it in your editor ${fileButtonsHtml(itemFile(c, item.id))}</div>`)
    const text = await tower.text(url.slice(1)).catch((err) => {
      if (view() === opened) $('item-body').innerHTML = failedHtml(item.tag, err.message, 'data-item-read')
    })
    if (text === undefined || view() !== opened || itemDrawn !== item.modifiedAt) return
    $('item-body').innerHTML = `<iframe id="item-doc" title="${esc(item.tag)}" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"></iframe>`
    $('item-doc').srcdoc = `<!doctype html><html ${tower.prefs.attributes()}><meta charset="utf-8"><base target="_blank"><link rel="stylesheet" href="/design.css"><style>${documentCss}${itemsCss}</style><article>${itemTextHtml(item.id, text)}</article>`
  }

  /** Deleting is the user's: asked first, and the view closes before the file goes. */
  async function deleteKept() {
    const open = /** @type {Extract<MainView, { t: 'item' }>} */ (viewing('item'))
    const { c, item } = /** @type {{ c: FloorCollection, item: FloorItem }} */ (itemOf(open))
    const { project, collection, id } = open
    if (!(await ask(deleteAsk(c, item, keptTitle(project, collection, item)), 'Delete'))) return
    goHome()
    if (await told(tower.call('collection/delete', { project, collection, id }))) toast(`Deleted ${item.tag} from ${c.label}`)
  }

  return { keptTitle, pruneKeptTitles, isOpenItem, openPolicies, openCollection, drawCollection, drawPolicies, policyCall, leaveItem, forgetItem, openItem, drawItem, deleteKept }
}
