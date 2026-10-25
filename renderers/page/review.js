import { noLongerOffered, offeredCall, runVerb, sendTarget, workerIn, plural } from '/cards.js'
import { THE_USER, REVIEWS, sendText, threadId, unseenBy } from '/x/reviews/reviews.js'
import { cardReviews, cardThread, floorThreadsOf, heldThread, noteCallOf, readThread, resolveAction, reviewsHtml, threadCheckout, threadFailure, threadViewOf, threadWant } from '/x/reviews/panel.js'
import { anchorOf, anchorSpot, changedFiles, changesHtml, changesPath, changesFailure, changesHandlers, changesOf, noChanges, readChanges, scopeOf, fileKey, isFolded, keepingFileTop, keepingViewedFileTop, marksToggled, drawPanel, livePick, pickAnchor, picked, spanned, watchPickDrag, spotSelector, viewedCount } from '/panels.js'
import { loop, timers } from '/loop.js'
import { heldHandlers, noReads, reading } from '/reads.js'
import { $, toast, told } from './kit.js'
import { commandOf } from '/keymap.js'
import { pressing } from '/press.js'

/**
 * @import { Board, Card, Floor } from '../../src/bridge/board.ts'
 * @import { DiffFile } from '../../src/bridge/diff.ts'
 * @import { Anchor, ReviewThread } from '../../src/shared/reviews.ts'
 * @import { NoteCall } from '../../extensions/reviews/threads.ts'
 * @import { Replies, Verbs } from '../../src/shared/api.ts'
 * @import { Viewer } from '../../src/shared/viewer.ts'
 * @import { ChangesEvent, ChangesRead, ChangesReads, ChangesScope, LinePick } from '../../src/shared/panels.ts'
 * @import { Loop } from '../../src/shared/loop.ts'
 * @import { Pane } from './view.js'
 * @import { ReadEvent, Reads } from '../../src/shared/reads.ts'
 * @import { RepoChanges } from '../../src/changes.ts'
 */

/**
 * @typedef {{
 *   render: () => void,
 *   lostAt: () => number | undefined,
 *   paneOf: (c: Card) => Pane,
 *   selected: () => string | undefined,
 *   findCard: (id: string | undefined) => Card | undefined,
 *   board: () => Board,
 *   viewer: () => Viewer,
 *   floorOf: (project: string) => Floor | undefined,
 *   callsign: (id: string) => string,
 *   showPane: (pane: Pane) => void,
 *   openItem: (project: string, collection: string, id: string) => void,
 *   select: (id: string) => void,
 * }} ReviewDeps
 */

/**
 * The selected worker's Changes and Reviews (`/panels.js`): its Changes and its checkout's thread read while either
 * is open, files viewed and folded, lines picked and noted, notes written, answered and sent to a worker, and an
 * anchor followed to its lines.
 * @param {ReviewDeps} deps
 */
export function review(deps) {
  const { render, lostAt, paneOf, selected, findCard, board, viewer, floorOf, callsign, showPane, openItem, select } = deps
  /**
   * The workers' Changes as last read, each under the scope the viewer compares it in, with each repo's viewed marks
   * (a file's path → the hash of the diff it was viewed at), which every renderer in this browser shares through
   * `tower.store`. The selected worker's are read while its Changes or Reviews are open (`changesHandlers`).
   * @type {Loop<ChangesReads, ChangesEvent>}
   */
  const changeReads = loop({
    state: noChanges(),
    handlers: changesHandlers,
    execute: {
      ...timers(),
      read: reading(readChanges({
        repos: (id, scope) => tower.get(/** @type {'changes/<id>'} */ (changesPath(id, scope))),
        viewed: (key) => /** @type {Promise<Record<string, string> | undefined>} */ (tower.store.get(key)),
        now: Date.now,
      })),
      draw: () => render(),
      toast: ({ message }) => void (lostAt() || toast(message)),
      keep: ({ key, marks }) => tower.store.set(key, marks),
    },
  })
  /** Files the viewer folded or unfolded against what their viewed mark says, by `fileKey`; this page only. @type {Set<string>} */
  const folds = new Set()
  /** The file tree's folders folded, by `data-tree-fold`; this page only. @type {Set<string>} */
  const treeFolds = new Set()

  /** @param {Pane} pane */
  const reviewing = (pane) => pane === 'changes' || pane === 'reviews'
  /** Changes are read for the selected worker while its Changes or Reviews are open. @param {Card | undefined} c */
  const followChanges = (c) => changeReads.dispatch({ type: 'follow', card: c && reviewing(paneOf(c)) ? c : undefined })

  /** @param {string} id */
  const scopeIn = (id) => scopeOf(changeReads.state(), id)
  /** @param {string} id */
  const changesIn = (id) => changesOf(changeReads.state(), id)

  /** @param {string} id @param {ChangesScope} scope */
  function compare(id, scope) {
    desk.pick = undefined
    changeReads.dispatch({ type: 'compare', id, scope })
    render()
  }

  /** A file of the Changes read, by `fileKey`: one drawn from that read. @param {string} key */
  const fileAt = (key) => /** @type {readonly [RepoChanges, DiffFile]} */ (changedFiles(read().repos).find(([repo, f]) => fileKey(repo, f) === key))

  /** The selected worker's Changes read, while the pane draws one. */
  const read = () => /** @type {ChangesRead} */ (changesIn(/** @type {string} */ (selected())))

  /** Files viewed of files changed, once read. @param {Card} c */
  const changesTally = (c) => {
    const shown = changesIn(c.id)
    if (!shown) return ''
    const { viewed, files } = viewedCount(shown)
    return files ? `<small>${viewed}/${files}</small>` : ''
  }

  /** @param {string} key */
  function toggleViewed(key) {
    const [repo, f] = fileAt(key)
    changeReads.dispatch({ type: 'mark', id: /** @type {string} */ (selected()), repo, marks: marksToggled(read().viewed, repo, f) })
    folds.delete(key)
    keepingViewedFileTop($('changes'), key, render)
  }

  /** @param {string} key */
  function toggleFold(key) {
    if (!folds.delete(key)) folds.add(key)
    keepingFileTop($('changes'), key, drawChanges)
  }

  /** A folder of the file tree, or a repo's root, folded or unfolded. @param {string} key */
  function toggleTreeFold(key) {
    if (!treeFolds.delete(key)) treeFolds.add(key)
    drawChanges()
  }

  /** A file of the tree: its section scrolled to. @param {string} key */
  const gotoFile = (key) => $('changes').querySelector(spotSelector({ key, row: -1 }))?.scrollIntoView({ block: 'start' })

  /**
   * The review desk of the worker open: the lines picked in the Changes pane (`picking` while they are dragged across)
   * and the note being written under them (`fresh` until its box first takes focus), the note the Reviews pane's
   * composer answers, and an anchor's lines to scroll to once Changes draws them, its file unfolded.
   * @type {{ pick: LinePick | undefined, picking: boolean, text: string, fresh: boolean, re: number | undefined, jump: Anchor | undefined }}
   */
  const desk = { pick: undefined, picking: false, text: '', fresh: false, re: undefined, jump: undefined }
  const dropPick = () => ((desk.pick = undefined), (desk.text = ''))
  /** A worker opened afresh starts with nothing picked and no note answered. */
  const resetDesk = () => (dropPick(), (desk.re = undefined))

  function drawChanges() {
    const c = /** @type {Card} */ (findCard(selected()))
    const shown = changesIn(c.id)
    const live = shown && livePick(shown, desk.pick)
    if (shown && desk.pick && !live) toast('The file changed under your pick: pick its lines again, your note is kept')
    if (shown) desk.pick = live
    const failed = shown ? undefined : changesFailure(changeReads.state(), c.id)
    drawPanel($('changes'), changesHtml({ read: shown, failed, folds, pick: desk.pick, picking: desk.picking, thread: keepsThreads(c) ? threadOf(c) : undefined, checkout: threadCheckout(c), user: board().user.name, state: c.checkoutState, noting: noteCallOf(c) !== undefined, layout: viewer().diffLayout, scope: scopeIn(c.id), tree: viewer().changesTree, treeFolds }), { 'pick-text': desk.text })
    if (desk.fresh) $('changes').querySelector('[data-pick-text]')?.focus()
    desk.fresh = false
    if (desk.jump && shown) jumpToAnchor()
  }

  /** @param {string} value @param {boolean} extend */
  function pickLine(value, extend) {
    desk.pick = picked(read(), desk.pick, value, extend)
    desk.fresh = true
    drawChanges()
  }

  watchPickDrag($('changes'), {
    drag: (from, to) => ((desk.pick = spanned(read(), from, to)), (desk.picking = true), drawChanges()),
    drop: () => ((desk.picking = false), (desk.fresh = true), drawChanges()),
  })

  /** A worker's view keeps a thread where reviews is on, on its floor. @param {Card} c */
  const keepsThreads = (c) => cardReviews(c) !== undefined

  /**
   * The workers' threads as last read, the one Tidy filed once a worker's work landed, else its checkout's: each read
   * again whenever its file's version moves on the board, held until then.
   * @type {Loop<Reads<ReviewThread>, ReadEvent<ReviewThread>>}
   */
  const threadReads = loop({
    state: noReads(),
    handlers: heldHandlers(),
    execute: { read: reading(readThread((path) => tower.text(path))), draw: () => render(), toast: ({ message }) => void toast(message) },
  })

  /** @param {Card} c */
  function followThread(c) {
    const want = threadWant(board().floors, cardThread(c))
    if (want) threadReads.dispatch(want)
  }

  /** @param {Card} c */
  const threadOf = (c) => heldThread(threadReads.state(), board().floors, cardThread(c))

  /** What the worker hasn't seen of its checkout's thread, else how many notes it holds. @param {Card} c */
  const reviewsTally = (c) => {
    const notes = floorThreadsOf(/** @type {Floor} */ (floorOf(c.project))).find((t) => t.checkout === threadCheckout(c))?.messages
    const unseen = cardReviews(c)?.unseen
    return unseen ? `<small class="unseen" data-tip="${plural(unseen, 'note')} ${callsign(c.id)} hasn't seen">${unseen} new</small>` : notes ? `<small>${notes}</small>` : ''
  }

  /** @param {NoteCall} call @param {Partial<Verbs['review/append']>} fields */
  const note = ([verb, input], fields) => /** @type {Promise<Replies['review/append']>} */ (tower.call(/** @type {never} */ (verb), /** @type {never} */ ({ ...input, ...fields })))

  /** A note is added only on a worker that offers one. @param {HTMLElement} button @param {Card} c @param {Partial<Verbs['review/append']>} fields */
  async function addNote(button, c, fields) {
    const reply = await told(pressing(button, async () => {
      const call = noteCallOf(c)
      if (!call) throw new Error(noLongerOffered(c.callsign, 'note'))
      return note(call, { author: board().user.name, ...fields })
    }))
    if (reply) toast(`n${reply.n} is on the thread of ${threadCheckout(c)}`)
    return reply
  }

  /** @param {HTMLElement} button */
  async function addPicked(button) {
    if (!(await addNote(button, /** @type {Card} */ (findCard(selected())), { anchors: [pickAnchor(read().repos, /** @type {LinePick} */ (desk.pick))], body: desk.text }))) return
    dropPick()
    drawChanges()
  }

  /** The reviews pane's composer: the note being written on each checkout, by `<project>/<checkout>`, and the note it answers. @type {Map<string, string>} */
  const noteDrafts = new Map()
  /** @param {Card} c */
  const draftKey = (c) => `${c.project}/${threadCheckout(c)}`

  /** @param {HTMLElement} button */
  async function addWritten(button) {
    const c = /** @type {Card} */ (findCard(selected()))
    if (!(await addNote(button, c, { re: desk.re, body: noteDrafts.get(draftKey(c)) ?? '' }))) return
    noteDrafts.delete(draftKey(c))
    desk.re = undefined
    render()
  }

  /** Marks a note of the selected worker's thread resolved, signed by the user. @param {HTMLElement} button @param {number} n */
  async function resolveNote(button, n) {
    const c = /** @type {Card} */ (findCard(selected()))
    const reply = await told(pressing(button, () => runVerb(resolveAction({ project: c.project, checkout: threadCheckout(c), user: board().user.name }, n))))
    if (reply) toast(`n${n} is resolved on the thread of ${threadCheckout(c)}`)
  }

  /** The worker the viewer picked to send each checkout's notes to, by `<project>/<checkout>`; this page only. @type {Map<string, string>} */
  const sendPicks = new Map()
  /** @param {Card} c */
  const pickedFor = (c) => sendPicks.get(`${c.project}/${threadCheckout(c)}`)

  /** Send reaches a worker whenever it is drawn. @param {HTMLElement} button @param {Card} c */
  function sendNotes(button, c) {
    const target = /** @type {Card} */ (sendTarget(/** @type {Floor} */ (floorOf(c.project)), threadCheckout(c), pickedFor(c)))
    const thread = threadOf(c)
    const text = sendText(THE_USER, threadCheckout(c), thread ? unseenBy(thread, target.callsign).map((m) => m.n) : [], target.hiredBy?.callsign)
    told(pressing(button, async () => tower.run(offeredCall(target, 'submit', target.callsign), { text }))).then((r) => r && toast(`Sent ${target.callsign} to the thread of ${threadCheckout(c)}`))
  }

  /** @param {Card} c */
  const threadView = (c) => threadViewOf(board(), cardThread(c), {
    thread: threadOf(c), failed: threadOf(c) ? undefined : threadFailure(threadReads.state(), cardThread(c)), changes: scopeIn(c.id) === 'all' ? changesIn(c.id)?.repos : undefined, picked: pickedFor(c), re: desk.re,
  })

  /** @param {Card} c */
  const drawReviews = (c) => drawPanel($('reviews'), reviewsHtml(threadView(c)), { 'note-text': noteDrafts.get(draftKey(c)) ?? '' })

  /** @param {number} n */
  function replyTo(n) {
    desk.re = n
    render()
    $('reviews').querySelector('[data-note-text]')?.focus()
  }

  /** An anchor is drawn on the thread of the selected worker. @param {string} value */
  function showAnchor(value) {
    const id = /** @type {string} */ (selected())
    desk.jump = anchorOf(/** @type {ReviewThread} */ (threadOf(/** @type {Card} */ (findCard(id)))), value)
    showPane('changes')
    if (scopeIn(id) !== 'all') compare(id, 'all')
  }

  function clearReply() {
    desk.re = undefined
    render()
  }

  function jumpToAnchor() {
    const a = /** @type {Anchor} */ (desk.jump)
    desk.jump = undefined
    const spot = anchorSpot(read().repos, a)
    if (!spot) return toast(`${a.repo}:${a.path} has no changes now`)
    if (isFolded(read(), folds, spot.repo, spot.file)) toggleFold(spot.key)
    $('changes').querySelector(spotSelector(spot))?.scrollIntoView({ block: spot.row === -1 ? 'start' : 'center' })
  }

  /** A thread opened from the sidebar, on the worker most recently in its checkout; read as a kept item when no worker has been there. @param {string} project @param {string} checkout */
  function openThread(project, checkout) {
    const c = workerIn(/** @type {Floor} */ (floorOf(project)), checkout)
    if (!c) return openItem(project, REVIEWS, threadId(checkout))
    select(c.id)
    showPane('reviews')
  }

  document.addEventListener('change', (e) => {
    const target = /** @type {Element} */ (e.target)
    const scope = /** @type {HTMLSelectElement | null} */ (target.closest('[data-changes-scope]'))?.value
    if (scope) return compare(/** @type {string} */ (selected()), scope)
    const picker = /** @type {HTMLSelectElement | null} */ (target.closest('[data-send-pick]'))
    if (!picker) return
    const c = /** @type {Card} */ (findCard(selected()))
    sendPicks.set(`${c.project}/${threadCheckout(c)}`, picker.value)
    render()
  })

  $('screen').addEventListener('input', (e) => {
    const box = /** @type {HTMLTextAreaElement} */ (e.target)
    if (box.matches('[data-note-text]')) noteDrafts.set(draftKey(/** @type {Card} */ (findCard(selected()))), box.value)
    if (box.matches('[data-pick-text]')) desk.text = box.value
  })

  $('screen').addEventListener('keydown', (e) => {
    const target = /** @type {Element} */ (e.target)
    const id = commandOf(board().keys, e, 'field')
    if (target.matches('[data-note-text]') && id === 'submit') return (e.preventDefault(), addWritten(/** @type {HTMLElement} */ ($('screen').querySelector('[data-note-add]'))))
    if (target.matches('[data-pick-text]') && id === 'submit') return (e.preventDefault(), addPicked(/** @type {HTMLElement} */ ($('screen').querySelector('[data-pick-add]'))))
    if (target.matches('[data-pick-text]') && id === 'cancel-pick') return (e.preventDefault(), dropPick(), drawChanges())
  })

  return { changeReads, reviewing, followChanges, changesTally, toggleViewed, toggleFold, toggleTreeFold, gotoFile, dropPick, resetDesk, drawChanges, pickLine, keepsThreads, threadReads, followThread, reviewsTally, addPicked, addWritten, resolveNote, sendNotes, drawReviews, replyTo, showAnchor, clearReply, openThread }
}
