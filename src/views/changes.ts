import type { Board, Card } from '../bridge/board.ts'
import type { DiffFile } from '../bridge/diff.ts'
import type { RepoChanges } from '../changes.ts'
import { addedActions, marksOf } from '../shared/adds.ts'
import { loop, timers } from '../shared/loop.ts'
import {
  CHANGES_TREE_KEY, DIFF_LAYOUT_KEY, changedFiles, changesFailure, changesHandlers, changesOf, changesPath, drawPanel, fileCall, fileKey, isFolded, keepingFileTop, keepingViewedFileTop,
  linesSpot, livePick, markedChangesHtml, marksToggled, noChanges, picked, pickedLines, readChanges, scopeOf, spanned, spotSelector, viewedCount, watchPickDrag,
  type ChangesEvent, type ChangesScope, type DiffLayout, type LinePick, type NamedLines,
} from '../shared/panels.ts'
import { panelsCss } from '../shared/panels-css.ts'
import { reading } from '../shared/reads.ts'
import { changedIn } from '../shared/checkouts.ts'
import { linesAt, linesSubject, type Lines } from '../shared/subjects.ts'
import { viewsOf, type Mount, type RegionHandle, type Tab } from '../shared/views.ts'

/**
 * What a worker changed in its repos, as git reads it (`/panels.js`): read while the view is seen, files viewed (marks
 * every renderer in this browser shares through `tower.store`) and folded, lines marked by what extensions add to its
 * card (`marks`), and lines picked with the mouse, a `lines` subject, under which the renderer draws what acts on them
 * (`lines.acts`). Handed lines (`show`), it unfolds their file and scrolls to them.
 */

const ID = 'tower/changes'

/** Lines of a worker's changes, any: what is offered on lines is offered on these. */
const anyLines = (c: Card) => linesSubject({ card: c.id, project: c.project, repo: '', path: '', from: 1, to: 1 })

/**
 * Whether anything acts on lines a worker's Changes pick: a view on them at `row` scale, `lines.acts`', on a floor its
 * extension is on, or a command offered on them. The renderer's layout and kit are its own, so a view they leave out
 * still counts here, and the region under the pick is then drawn hidden.
 */
const actsOnLines = (board: Board, c: Card) =>
  viewsOf(board).some((v) => v.on.includes('lines') && v.scales.includes('row') && !v.off?.includes(c.project)) || addedActions(board, anyLines(c)).length > 0

const CSS = `:where([data-view="${ID}"]) {
  position: absolute; inset: 0;
  & > .changes { position: absolute; inset: 0; overflow: auto; padding: 0 var(--sp-xl) 48px; background: var(--panel); color: var(--ink); scrollbar-gutter: stable; }
}`

/** The files a worker's checkout changed, as the board counts them, until its Changes are read and tally files viewed of them. */
export const tab: Tab = (board, subject) => {
  const card = subject.value as Card
  const floor = board.floors.find((f) => f.id === card.project)
  const changed = floor && changedIn(floor, card.checkout)
  return changed ? { text: String(changed) } : {}
}

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

  const scope = () => scopeOf(changeReads.state(), card.id)
  const read = () => changesOf(changeReads.state(), card.id)

  /** The lines picked (`picking` while they are dragged across), and lines to scroll to once the Changes draw them, their file unfolded. */
  const desk: { pick: LinePick | undefined; picking: boolean; jump: Pick<NamedLines, 'repo' | 'path' | 'from' | 'to'> | undefined } = { pick: undefined, picking: false, jump: undefined }

  /**
   * What acts on the picked lines (`lines.acts`), drawn in `acts` under them: kept through every redraw, so what is
   * written there stays. Something there that is `done` with the lines lets the pick go.
   */
  const acts = document.createElement('div')
  acts.className = 'pick-acts'
  let picks: RegionHandle | undefined
  acts.addEventListener('done', (e) => (e.stopPropagation(), dropPick(), draw()))

  const dropPick = () => {
    desk.pick = undefined
    picks?.close()
    picks = undefined
  }

  /** The picked lines as a subject of the worker's card, for what acts on them. */
  const pickedSubject = () => {
    const lines: Lines = { card: card.id, project: card.project, ...pickedLines(read()!.repos, desk.pick!) }
    return linesSubject(lines)
  }

  /** The region under the pick, placed where the redraw left its row, then on the lines picked now: what it holds takes focus in the document. */
  function placeActs() {
    if (!desk.pick || desk.picking) return
    el.querySelector('[data-pick-acts]')?.replaceWith(acts)
    const subject = pickedSubject()
    if (picks) picks.update(subject)
    else picks = kit.region(acts, 'lines.acts', subject)
  }

  /** Follows the worker while the view is seen. */
  function follow() {
    changeReads.dispatch({ type: 'follow', card: seen ? card : undefined })
  }

  function draw() {
    const shown = read()
    const live = shown && livePick(shown, desk.pick)
    if (shown && desk.pick && !live) (kit.toast('The file changed under your pick: pick its lines again'), dropPick())
    const failed = shown ? undefined : changesFailure(changeReads.state(), card.id)
    const focused = acts.contains(document.activeElement) ? (document.activeElement as HTMLElement) : undefined
    drawPanel(
      el,
      markedChangesHtml({
        read: shown, failed, folds, pick: desk.pick, picking: desk.picking, marks: marksOf(board, card.id), checkout: card.checkout,
        state: card.checkoutState, pickable: card.checkoutState.is === 'live' && actsOnLines(board, card), layout, scope: scope(), tree, treeFolds,
      }),
      {},
    )
    placeActs()
    if (focused && document.activeElement !== focused) focused.focus({ preventScroll: true })
    retally()
    if (desk.jump && shown) jump()
  }

  /**
   * Files viewed of files changed, once read and while seen: the tab's tally. Unseen, its read is no longer kept up, and
   * the board's count (`tab`) speaks for the tab.
   */
  const tally = () => {
    const shown = seen ? read() : undefined
    if (!shown) return undefined
    const { viewed, files } = viewedCount(shown)
    return files ? { text: `${viewed}/${files}` } : undefined
  }
  let tallied: string | undefined
  /** Tells the region to draw the tab again once its tally changed. */
  function retally() {
    const counted = tally()?.text
    if (counted !== tallied) (tallied = counted), host.dispatchEvent(new Event('tab', { bubbles: true }))
  }

  function compare(to: ChangesScope) {
    dropPick()
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
    const spot = linesSpot(read()!.repos, a)
    if (!spot) return kit.toast(`${a.repo}:${a.path} has no changes now`)
    if (isFolded(read()!, folds, spot.repo, spot.file)) toggleFold(spot.key)
    el.querySelector(spotSelector(spot))?.scrollIntoView({ block: spot.row === -1 ? 'start' : 'center' })
  }

  /** Lines to show: their file unfolded and scrolled to once the Changes against the default branch draw them. */
  function goTo(lines: Pick<NamedLines, 'repo' | 'path' | 'from' | 'to'>) {
    desk.jump = lines
    if (scope() !== 'all') compare('all')
    else if (read()) jump()
  }

  /** Lines picked, or none: a click on the one line picked lets it go. */
  function pickLines(pick: LinePick | undefined) {
    if (pick) desk.pick = pick
    else dropPick()
    draw()
  }

  host.addEventListener('click', (e) => {
    const target = e.target as Element
    const file = fileCall(target)
    if (file) return void tower.run(file).catch((err: Error) => kit.toast(err.message))
    const pick = target.closest<HTMLElement>('[data-pick]')?.dataset.pick
    if (pick) return pickLines(picked(read()!, desk.pick, pick, (e as MouseEvent).shiftKey))
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

  watchPickDrag(el, {
    drag: (from, to) => ((desk.pick = spanned(read()!, from, to)), (desk.picking = true), draw()),
    drop: () => ((desk.picking = false), draw()),
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
      const lines = linesAt(s.key)
      if (!lines) return false
      goTo(lines)
      return true
    },
    visible(on) {
      seen = on
      follow()
      retally()
    },
    tab: tally,
    close() {
      offStore()
      picks?.close()
      changeReads.dispatch({ type: 'follow', card: undefined })
    },
  }
}
