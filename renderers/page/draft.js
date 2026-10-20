import { can, offeredCall, esc, statusName } from '/cards.js'
import { ICON } from '/icons.js'
import { fileButtonsHtml } from '/panels.js'
import { HOME } from './view.js'
import { lineOf, $, byStart, CLOSE_HOME, toast, told } from './kit.js'
import { commandOf } from '/keymap.js'
import { discard, draftItem, restore as restoreDraft, draftPath, draftState, draftTitles, draftsOf, edit, follow, keepsApart, leave, newDraft, openDraft as loadDraft, save, sendable, settle, titleOf } from '/drafts.js'

/**
 * @import { Board, Card, Floor, FloorCollection } from '../../src/bridge/board.ts'
 * @import { DaemonVerb } from '../../src/shared/cards.ts'
 * @import { Loop } from '../../src/shared/loop.ts'
 * @import { MainView } from './view.js'
 * @import { Deleted, Draft } from '../../src/shared/drafts.ts'
 * @import { PageState, PageEvent } from './page.js'
 */

/**
 * @typedef {{
 *   render: () => void,
 *   cards: () => Card[],
 *   floorOf: (project: string) => Floor | undefined,
 *   board: () => Board,
 *   heldWhy: (verb: DaemonVerb) => string | undefined,
 *   heldHtml: (verb: DaemonVerb, label: string, inner: string, cls?: string) => string,
 *   go: (view: MainView) => void,
 *   goHome: () => void,
 *   page: Loop<PageState, PageEvent>,
 *   openSpawn: (project: string, sent?: { d: Draft; text: string; }) => void,
 *   floorsTopDown: () => Floor[],
 *   paint: (projectId: string | undefined) => string,
 *   callsign: (id: string) => string,
 *   findCard: (id: string | undefined) => Card | undefined,
 *   select: (id: string) => void,
 * }} DraftDeps
 */

/**
 * The draft open in the main pane (`/drafts.js`): its text saved as it is typed, followed as the board changes it,
 * sent to a new session or typed into a worker, and deleted with an undo.
 * @param {DraftDeps} deps
 */
export function draft(deps) {
  const { render, cards, floorOf, board, heldWhy, heldHtml, go, goHome, page, openSpawn, floorsTopDown, paint, callsign, findCard, select } = deps
  /** The drafts collection's reads and writes, over the page's routes. */
  const draftIo = {
    call: tower.call,
    /** @param {string} project @param {string} id */
    read: (project, id) => tower.text(draftPath(project, id)),
    /** @param {Error} err */
    failed: (err) => toast(err.message),
  }

  const { title: draftTitle, prune: pruneDraftTitles } = draftTitles(draftIo.read, () => render())

  /** @param {Floor} f */
  const newDraftHtml = (f) => `<button data-new-draft="${f.id}" aria-label="new draft" data-tip="new draft">${ICON.plus}</button>`

  /** The draft open in the main pane (src/shared/drafts.ts), its textarea holding `text`. @type {Draft | undefined} */
  let draftOpen

  /** The draft open, if one is. */
  const drafting = () => draftOpen

  const targets = () => cards().filter((c) => can(c, 'submit'))

  const DRAFT_STATE = { conflict: 'changed on disk', new: 'new · saved once it has words', editing: 'editing', saved: 'saved' }

  /** The head of the draft open: an item is listed in its floor's drafts. */
  function draftHeadHtml() {
    const d = /** @type {Draft} */ (draftOpen)
    const f = /** @type {Floor} */ (floorOf(d.project))
    const item = d.id === undefined ? undefined : draftItem(board().floors, d.project, d.id)
    const keptBy = item?.keptBy
    const by = keptBy ? ` · kept by <a href="#${keptBy.session}" data-tip="go to the worker that kept it">${keptBy.callsign}</a>` : ''
    const tag = item ? `<button class="tag" data-copy="${esc(item.tag)}" data-tip="${esc(`${/** @type {FloorCollection} */ (draftsOf(f)).dir}/${item.id}`)} · click to copy the tag">${esc(item.tag)}</button>` : ''
    const file = item && fileButtonsHtml(`${/** @type {FloorCollection} */ (draftsOf(f)).dir}/${item.id}`)
    $('draft-head').innerHTML = `<span class="label">Draft</span>${tag}${file ?? ''}<span class="dim">${esc(f.name)} · ${DRAFT_STATE[draftState(d)]}${by}</span>
    <span class="actions"><small class="dim">⌘⏎ new session</small>
      ${heldWhy('spawn') ? heldHtml('spawn', 'Start session', 'Start session', 'primary') : can(f, 'spawn') ? '<button class="primary" data-draft-act="send" data-tip="start a new session on this prompt">Start session</button>' : ''}
      ${targets().length ? '<button data-draft-act="transfer" data-tip="type this prompt into a running worker">Send to worker…</button>' : ''}
      <button class="danger" data-draft-act="delete">Delete</button>
      ${CLOSE_HOME}</span>`
    $('draft-note').innerHTML = d.conflict !== undefined
      ? `<span>Someone else changed this draft while you were editing it.</span>
      <button data-draft-act="reload">Take theirs</button><button data-draft-act="keep">Keep mine</button>`
      : ''
  }

  /** A new draft, or an existing one once its text has arrived: the textarea stays read-only until then. @param {string} project @param {string} [id] */
  const openDraft = (project, id) => go(floorOf(project) ? { t: 'draft', project, id } : HOME)

  /** @param {Extract<MainView, { t: 'draft' }>} open */
  async function enterDraft({ project, id }) {
    const d = newDraft(project)
    draftOpen = d
    $('draft-text').value = ''
    $('draft-text').readOnly = Boolean(id)
    if (id) {
      const item = draftItem(board().floors, project, id)
      const loaded = item && (await loadDraft(draftIo, project, item).catch((err) => (toast(err.message), null)))
      if (draftOpen !== d) return
      if (loaded === null) return goHome()
      if (!loaded) return (goHome(), toast('That draft is gone'))
      draftOpen = loaded
      $('draft-text').value = loaded.text
      $('draft-text').readOnly = false
      render()
    }
    $('draft-text').focus()
  }

  /** Leaving keeps what was typed: its save is queued like any other. */
  function leaveDraft() {
    if (!draftOpen) return
    if (keepsApart(draftOpen)) toast('Your edits were kept as a new draft')
    leave(draftIo, draftOpen)
    closeDraft()
  }

  function closeDraft() {
    page.dispatch({ type: 'hold-draft' })
    draftOpen = undefined
  }

  /** Resolves to whether the draft's text is on disk; a first save gives it an id, which the URL then names. */
  function saveNow() {
    page.dispatch({ type: 'hold-draft' })
    const d = /** @type {Draft} */ (draftOpen)
    return save(draftIo, d).then((ok) => (draftOpen === d && page.dispatch({ type: 'saved', id: d.id }), ok))
  }

  $('draft-text').addEventListener('input', () => {
    edit(/** @type {Draft} */ (draftOpen), $('draft-text').value)
    page.dispatch({ type: 'typed' })
    draftHeadHtml()
  })

  $('draft-text').addEventListener('keydown', (e) => {
    const id = commandOf(board().keys, e, 'field')
    if (id === 'save-draft') (e.preventDefault(), saveNow())
    if (id === 'submit') (e.preventDefault(), sendDraft())
  })

  /** The board shows the open draft as it is now: deleted elsewhere closes it, a change elsewhere replaces or conflicts. */
  async function followDraft() {
    const d = draftOpen
    if (!d?.id) return
    const outcome = await follow(draftIo, d, draftItem(board().floors, d.project, d.id))
    if (draftOpen !== d) return
    if (outcome === 'gone') return (closeDraft(), goHome(), toast('The draft was deleted elsewhere'))
    if (outcome === 'replaced') $('draft-text').value = d.text
    draftHeadHtml()
  }

  /** @param {boolean} take */
  function settleConflict(take) {
    const d = /** @type {Draft} */ (draftOpen)
    settle(draftIo, d, take).then(() => draftOpen === d && render())
    if (take) $('draft-text').value = d.text
    draftHeadHtml()
  }

  /** Send and transfer save the draft first, then delete it once its words have reached a session. */
  async function savedDraft() {
    const d = /** @type {Draft} */ (draftOpen)
    if (!d.text.trim()) return toast('The draft is empty')
    page.dispatch({ type: 'hold-draft' })
    const text = await sendable(draftIo, d)
    if (text === undefined) return d.conflict !== undefined && toast('Settle the change made on disk first')
    return { d, text }
  }

  /** @param {Draft} d */
  const deleteSent = (d) => {
    if (draftOpen === d) closeDraft()
    return discard(draftIo, d)
  }

  async function sendDraft() {
    const f = /** @type {Floor} */ (floorOf(/** @type {Draft} */ (draftOpen).project))
    if (!can(f, 'spawn')) return
    const sent = await savedDraft()
    if (sent) openSpawn(f.id, sent)
  }

  /** This floor's workers first, then the rest top down. */
  function openTransfer() {
    const project = /** @type {Draft} */ (draftOpen).project
    const order = floorsTopDown().map((f) => f.id)
    /** @param {Card} c */
    const rank = (c) => (c.project === project ? -1 : order.indexOf(c.project))
    $('transfer-targets').innerHTML = targets().sort((a, b) => rank(a) - rank(b) || byStart(a, b)).map((c) => `<button value="${c.id}" style="${paint(c.project)}">
      <span class="call">${callsign(c.id)}</span><span class="where">${esc(/** @type {Floor} */ (floorOf(c.project)).name)} · ${statusName(c)}</span>
      <span class="line">${lineOf(c)}</span></button>`).join('')
    $('transfer').returnValue = ''
    $('transfer').showModal()
  }

  $('transfer').addEventListener('close', async () => {
    const id = $('transfer').returnValue
    if (!id || !draftOpen) return
    const sent = await savedDraft()
    if (!sent) return
    const card = /** @type {Card} */ (findCard(id))
    const reply = await told((async () => tower.run(offeredCall(card, 'submit', card.callsign), { text: sent.text }))())
    if (!reply) return
    await deleteSent(sent.d)
    select(id)
  })

  /** Deleting is the user's, and done at once: what was typed is saved first, and the toast's Undo puts the file back, under its id. */
  async function deleteDraft() {
    const d = /** @type {Draft} */ (draftOpen)
    closeDraft()
    goHome()
    save(draftIo, d)
    const gone = await discard(draftIo, d)
    if (gone) toast(`Deleted "${titleOf(gone.text)}" from Drafts`, { label: 'Undo', run: () => undoDelete(gone) })
  }

  /** @param {Deleted} gone */
  const undoDelete = (gone) => told(restoreDraft(draftIo, gone)).then((r) => r && toast(`"${titleOf(gone.text)}" is back in Drafts`))

  return { draftIo, draftTitle, pruneDraftTitles, newDraftHtml, drafting, draftHeadHtml, openDraft, enterDraft, leaveDraft, saveNow, followDraft, settleConflict, deleteSent, sendDraft, openTransfer, deleteDraft }
}
