import type { Card } from '../bridge/board.ts'
import type { DiffFile } from '../bridge/diff.ts'
import type { RepoChanges } from '../changes.ts'
import type { Replies } from '../shared/api.ts'
import { noLongerOffered } from '../shared/cards.ts'
import { commandOf } from '../shared/keymap.ts'
import { loop, timers } from '../shared/loop.ts'
import {
  CHANGES_TREE_KEY, DIFF_LAYOUT_KEY, anchorOf, anchorSpot, changedFiles, changesFailure, changesHandlers, changesHtml, changesOf, changesPath, cardThread, drawPanel, fileCall, fileKey, heldThread,
  isFolded, keepingFileTop, keepingViewedFileTop, livePick, marksToggled, noChanges, pickAnchor, picked, readChanges, readThread, scopeOf, spanned, spotSelector, threadWant, viewedCount,
  watchPickDrag, type ChangesEvent, type ChangesScope, type DiffLayout, type LinePick,
} from '../shared/panels.ts'
import { panelsCss } from '../shared/panels-css.ts'
import { pressing } from '../shared/press.ts'
import { heldHandlers, noReads, reading } from '../shared/reads.ts'
import type { Anchor, ReviewThread } from '../shared/reviews.ts'
import type { Lines } from '../shared/subjects.ts'
import type { Mount } from '../shared/views.ts'
import { REVIEWS } from '../shared/reviews.ts'

/**
 * What a worker changed in its repos, as git reads it (`/panels.js`): read while the view is seen, files viewed (marks
 * every renderer in this browser shares through `tower.store`) and folded, lines picked with the mouse and noted on its
 * checkout's review thread, whose notes mark the lines they are about. Handed lines (`show`), it unfolds their file and
 * scrolls to them.
 */

const ID = 'tower/changes'

/** The call that adds a note to a thread: its verb and the input the renderer adds the author and what it says to. */
type NoteCall = [string, Record<string, unknown>]

/**
 * The reviews extension's part of a card, where it is on: the checkout its thread is about, and the call that notes on
 * it while its work is live. Read from the board, so the Changes need none of its code.
 */
const reviewsOf = (c: Card) => c.x?.[REVIEWS] as { thread: string; note?: NoteCall } | undefined
const threadCheckout = (c: Card) => reviewsOf(c)?.thread ?? c.checkout
const noteCallOf = (c: Card) => reviewsOf(c)?.note

const CSS = `:where([data-view="${ID}"]) {
  position: absolute; inset: 0;
  & > .changes { position: absolute; inset: 0; overflow: auto; padding: 0 var(--sp-xl) 48px; background: var(--panel); color: var(--ink); scrollbar-gutter: stable; }
}`

/** Files the viewer folded or unfolded against what their viewed mark says, and the file tree's folded folders: this page's, every worker's. */
const folds = new Set<string>()
const treeFolds = new Set<string>()

export const mount: Mount = (host, { tower, board: first, subject, kit }) => {
  let board = first
  let card = subject.value as Card
  host.innerHTML = `<style>${CSS}${panelsCss}</style><div class="changes"></div>`
  const el = host.querySelector<HTMLElement>('.changes')!
  let seen = true
  let layout: DiffLayout = 'unified'
  let tree = false

  const changeReads = loop({
    state: noChanges(),
    handlers: changesHandlers,
    execute: {
      ...timers<ChangesEvent>(),
      read: reading(
        readChanges({
          repos: (id, scope) => tower.get(changesPath(id, scope) as 'changes/<id>'),
          viewed: (key) => tower.store.get(key) as Promise<Record<string, string> | undefined>,
          now: Date.now,
        }),
      ),
      draw: () => draw(),
      toast: ({ message }) => kit.toast(message),
      keep: ({ key, marks }) => tower.store.set(key, marks),
    },
  })

  /** The worker's checkout's thread, read again whenever its file's version moves on the board: its notes mark their lines. */
  const threadReads = loop({
    state: noReads<ReviewThread>(),
    handlers: heldHandlers<ReviewThread>(),
    execute: { read: reading(readThread((path) => tower.text(path))), draw: () => draw(), toast: ({ message }) => kit.toast(message) },
  })

  const keepsThreads = () => reviewsOf(card) !== undefined
  const threadOf = () => heldThread(threadReads.state(), board.floors, cardThread(card))
  const scope = () => scopeOf(changeReads.state(), card.id)
  const read = () => changesOf(changeReads.state(), card.id)

  /**
   * The lines picked (`picking` while they are dragged across) and the note being written under them (`fresh` until
   * its box first takes focus), and lines to scroll to once the Changes draw them, their file unfolded.
   */
  const desk: { pick: LinePick | undefined; picking: boolean; text: string; fresh: boolean; jump: Pick<Anchor, 'repo' | 'path' | 'from' | 'to'> | undefined } = {
    pick: undefined, picking: false, text: '', fresh: false, jump: undefined,
  }
  const dropPick = () => ((desk.pick = undefined), (desk.text = ''))

  /** Follows the worker while the view is seen, and its thread where it keeps one. */
  function follow() {
    changeReads.dispatch({ type: 'follow', card: seen ? card : undefined })
    const want = seen && keepsThreads() && threadWant(board.floors, cardThread(card))
    if (want) threadReads.dispatch(want)
  }

  function draw() {
    const shown = read()
    const live = shown && livePick(shown, desk.pick)
    if (shown && desk.pick && !live) kit.toast('The file changed under your pick: pick its lines again, your note is kept')
    if (shown) desk.pick = live
    const failed = shown ? undefined : changesFailure(changeReads.state(), card.id)
    drawPanel(
      el,
      changesHtml({
        read: shown, failed, folds, pick: desk.pick, picking: desk.picking, thread: keepsThreads() ? threadOf() : undefined, checkout: threadCheckout(card), user: board.user.name,
        state: card.checkoutState, noting: noteCallOf(card) !== undefined, layout, scope: scope(), tree, treeFolds,
      }),
      { 'pick-text': desk.text },
    )
    const counted = tally()?.text
    if (counted !== tallied) (tallied = counted), host.dispatchEvent(new Event('tab', { bubbles: true }))
    if (desk.fresh) el.querySelector<HTMLElement>('[data-pick-text]')?.focus()
    desk.fresh = false
    if (desk.jump && shown) jump()
  }

  /** Files viewed of files changed, once read: the tab's tally. */
  const tally = () => {
    const shown = read()
    if (!shown) return undefined
    const { viewed, files } = viewedCount(shown)
    return files ? { text: `${viewed}/${files}` } : undefined
  }
  let tallied: string | undefined

  function compare(to: ChangesScope) {
    desk.pick = undefined
    changeReads.dispatch({ type: 'compare', id: card.id, scope: to })
    draw()
  }

  const fileAt = (key: string) => changedFiles(read()!.repos).find(([repo, f]) => fileKey(repo, f) === key) as readonly [RepoChanges, DiffFile]

  function toggleViewed(key: string) {
    const [repo, f] = fileAt(key)
    changeReads.dispatch({ type: 'mark', id: card.id, repo, marks: marksToggled(read()!.viewed, repo, f) })
    folds.delete(key)
    keepingViewedFileTop(el, key, draw)
  }

  function toggleFold(key: string) {
    if (!folds.delete(key)) folds.add(key)
    keepingFileTop(el, key, draw)
  }

  function jump() {
    const a = desk.jump!
    desk.jump = undefined
    const spot = anchorSpot(read()!.repos, a as Anchor)
    if (!spot) return kit.toast(`${a.repo}:${a.path} has no changes now`)
    if (isFolded(read()!, folds, spot.repo, spot.file)) toggleFold(spot.key)
    el.querySelector(spotSelector(spot))?.scrollIntoView({ block: spot.row === -1 ? 'start' : 'center' })
  }

  /** Lines to show: their file unfolded and scrolled to once the Changes against the default branch draw them. */
  function goTo(lines: Pick<Anchor, 'repo' | 'path' | 'from' | 'to'>) {
    desk.jump = lines
    if (scope() !== 'all') compare('all')
    else if (read()) jump()
  }

  /** The note under the lines picked, added to the thread while the worker offers one. */
  async function addPicked(button: HTMLElement) {
    const reply = await pressing(button, async () => {
      const call = noteCallOf(card)
      if (!call) throw new Error(noLongerOffered(card.callsign, 'note'))
      const [verb, input] = call
      return tower.call(verb as never, { ...input, author: board.user.name, anchors: [pickAnchor(read()!.repos, desk.pick!)], body: desk.text } as never) as Promise<Replies['review/append']>
    }).catch((err: Error) => void kit.toast(err.message))
    if (!reply) return
    kit.toast(`n${reply.n} is on the thread of ${threadCheckout(card)}`)
    dropPick()
    draw()
  }

  host.addEventListener('click', (e) => {
    const target = e.target as Element
    const file = fileCall(target)
    if (file) return void tower.run(file).catch((err: Error) => kit.toast(err.message))
    const pick = target.closest<HTMLElement>('[data-pick]')?.dataset.pick
    if (pick) return ((desk.pick = picked(read()!, desk.pick, pick, (e as MouseEvent).shiftKey)), (desk.fresh = true), draw())
    const add = target.closest<HTMLElement>('[data-pick-add]')
    if (add) return void addPicked(add)
    if (target.closest('[data-pick-cancel]')) return (dropPick(), draw())
    const anchored = target.closest<HTMLElement>('[data-anchor]')?.dataset.anchor
    const anchor = anchored && threadOf() ? anchorOf(threadOf()!, anchored) : undefined
    if (anchor) return goTo(anchor)
    const viewed = target.closest<HTMLElement>('[data-viewed]')?.dataset.viewed
    if (viewed) return toggleViewed(viewed)
    const fold = target.closest<HTMLElement>('[data-fold]')?.dataset.fold
    if (fold) return toggleFold(fold)
    const chosen = target.closest<HTMLElement>('[data-changes-layout]')?.dataset.changesLayout as DiffLayout | undefined
    if (chosen) return (tower.store.set(DIFF_LAYOUT_KEY, chosen), (layout = chosen), draw())
    if (target.closest('[data-changes-tree]')) return (tower.store.set(CHANGES_TREE_KEY, !tree), (tree = !tree), draw())
    const treeFold = target.closest<HTMLElement>('[data-tree-fold]')?.dataset.treeFold
    if (treeFold) return (treeFolds.delete(treeFold) || treeFolds.add(treeFold), draw())
    const goto = target.closest<HTMLElement>('[data-goto-file]')?.dataset.gotoFile
    if (goto) return el.querySelector(spotSelector({ key: goto, row: -1 }))?.scrollIntoView({ block: 'start' })
    if (target.closest('[data-changes-read]')) return (changeReads.dispatch({ type: 'retry', id: card.id }), draw())
  })

  host.addEventListener('change', (e) => {
    const to = (e.target as Element).closest<HTMLSelectElement>('[data-changes-scope]')?.value
    if (to) compare(to as ChangesScope)
  })

  host.addEventListener('input', (e) => {
    const box = e.target as HTMLTextAreaElement
    if (box.matches('[data-pick-text]')) desk.text = box.value
  })

  host.addEventListener('keydown', (e) => {
    const target = e.target as Element
    if (!target.matches('[data-pick-text]')) return
    const id = commandOf(board.keys, e, 'field')
    if (id === 'submit') return (e.preventDefault(), void addPicked(host.querySelector<HTMLElement>('[data-pick-add]')!))
    if (id === 'cancel-pick') return (e.preventDefault(), dropPick(), draw())
  })

  watchPickDrag(el, {
    drag: (from, to) => ((desk.pick = spanned(read()!, from, to)), (desk.picking = true), draw()),
    drop: () => ((desk.picking = false), (desk.fresh = true), draw()),
  })

  /** The viewer's diff layout and file tree, as `tower.store` keeps them for every renderer of theirs. */
  async function readPrefs() {
    const [l, t] = await Promise.all([tower.store.get(DIFF_LAYOUT_KEY), tower.store.get(CHANGES_TREE_KEY)])
    const next = { layout: (l as DiffLayout | undefined) ?? 'unified', tree: (t as boolean | undefined) ?? false }
    if (next.layout === layout && next.tree === tree) return
    ;({ layout, tree } = next)
    draw()
  }
  const offStore = tower.store.on(() => void readPrefs())
  void readPrefs()
  draw()
  follow()

  return {
    update(next, now) {
      board = next
      card = now.value as Card
      follow()
      draw()
    },
    show(s) {
      if (s.kind !== 'lines') return false
      goTo(s.value as Lines)
      return true
    },
    visible(on) {
      seen = on
      follow()
    },
    tab: tally,
    close() {
      offStore()
      changeReads.dispatch({ type: 'follow', card: undefined })
    },
  }
}
