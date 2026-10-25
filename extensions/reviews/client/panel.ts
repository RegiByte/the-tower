/**
 * The Reviews panel: a checkout's thread as a place opens it, read once per version of its file, and drawn with its
 * notes' quotes marked as the Changes find them; and where a card's and a floor's threads are on the board (the
 * extension's part, `x.reviews`). The reviews extension's client, served at `/x/reviews/panel.js`.
 */
import type { RepoChanges } from '../../../src/changes.ts'
import type { CheckoutState } from '../../../src/bridge/checkouts.ts'
import type { Board, Card, Floor } from '../../../src/bridge/board.ts'
import { esc, noun, sendTarget, sendTargets, workerIn } from '../../../src/shared/cards.ts'
import { ICON } from '../../../src/shared/icons.ts'
import { checkoutDirs } from '../../../src/shared/model.ts'
import { highlightLines } from '../../../src/shared/highlight.ts'
import { markdownHtml } from '../../../src/shared/markdown.ts'
import { failureOf, valueOf, type ReadEvent, type Reads } from '../../../src/shared/reads.ts'
import { anchorWhere } from '../../../src/shared/changes-lines.ts'
import { fileButtonsHtml } from '../../../src/shared/file-acts.ts'
import { failedHtml, settledHtml } from '../../../src/shared/panel-kit.ts'
import type { CardPart, FloorPart, FloorThread, NoteCall } from '../threads.ts'
import { anchorState, langOf, parseThread, repoName, resolvedIn, resolvesOf, REVIEWS, threadId, unseenBy, type Anchor, type AnchorState, type Message, type Quote, type ReviewThread } from './reviews.ts'

/** A card's reviews part: where its thread is, how its work stands, what of it is new to it, and its note while it is live. `undefined` where reviews is off. */
export const cardReviews = (c: Card): CardPart | undefined => c.x?.[REVIEWS] as CardPart | undefined

/** A floor's review threads, each checkout's that has one; none where reviews is off. */
export const floorThreadsOf = (f: Floor): FloorThread[] => (f.x?.[REVIEWS] as FloorPart | undefined)?.threads ?? []

/** Whether a floor keeps review threads: the reviews extension is on there. */
export const keepsThreads = (f: Floor): boolean => f.x?.[REVIEWS] !== undefined

/** The checkout whose review thread is about a worker's work: a reviewer's is its author's. */
export const threadCheckout = (c: Card): string => cardReviews(c)?.thread ?? c.checkout

/** The call a worker's view adds a note with, while its thread's work is live: the renderer adds the author and the note. */
export const noteCallOf = (c: Card): NoteCall | undefined => cardReviews(c)?.note

/** A worker as the Reviews panel names it. */
type Worker = { id: string; callsign: string; checkout: string }

/**
 * The Reviews panel: `reader` is the worker whose view it is, its notes new to it marked while the work goes on; `changes` what its
 * anchors are looked for in; `targets` who Send may reach and `target` the one it does; `re` the note the composer answers; `user` the name
 * the composer signs with (`board.user.name`), its notes marked as the viewer's own. `failed` is why the last read
 * of the thread failed, drawn while none is read. `state`: where the checkout's work stands (the card's `threadState`, or a
 * floor thread's `state`); `noting`: the card or floor thread offers its note, so the composer, replies and Send are drawn.
 */
export type ThreadView = {
  project: string; checkout: string; tag: string | undefined; thread: ReviewThread | undefined; failed: string | undefined; reader: Worker | undefined
  changes: RepoChanges[] | undefined; targets: Worker[]; target: Worker | undefined; re: number | undefined; user: string
  files: ThreadFiles; state: CheckoutState; noting: boolean
}

/** Where a checkout's thread is kept (none when its floor keeps no threads), and the dirs its anchors' repos are. */
export type ThreadFiles = { thread: string | undefined; dirs: string[] }

type ThreadFloor = { hub: string; repos: string[]; collections: { id: string; dir: string }[] }

/** The `ThreadFiles` of a checkout's thread kept as item `id` (its own file, or the one Tidy filed), from its floor on the board. */
export const threadItemFiles = (floor: ThreadFloor, checkout: string, id: string): ThreadFiles => {
  const reviews = floor.collections.find((c) => c.id === REVIEWS)
  return { thread: reviews && `${reviews.dir}/${id}`, dirs: checkoutDirs(floor, checkout) }
}

/** A checkout's `ThreadFiles`, from its floor on the board. */
export const threadFiles = (floor: ThreadFloor, checkout: string): ThreadFiles => threadItemFiles(floor, checkout, threadId(checkout))

/**
 * A thread as a place opens it: its checkout, its item `id`, where its work stands, the call its note is written with
 * while the work is live, and its `reader`, the worker whose view it is. A thread belongs to its author's checkout, but what is new in it depends
 * on whose view is open: an author and its reviewer each read the other's notes since their own last one as new.
 */
export type ThreadPlace = {
  project: string; checkout: string; id: string; state: CheckoutState; note: NoteCall | undefined; reader: Card | undefined
}

/**
 * The thread a worker's view (its card, tab or desk) shows, read as that worker: its work's, or the one Tidy filed once
 * it landed. Only on a floor keeping threads (`keepsThreads`).
 */
export const cardThread = (c: Card): ThreadPlace => {
  const { thread: checkout, threadState: state, note } = cardReviews(c)!
  const filed = state.is === 'landed' ? state.filed : undefined
  return { project: c.project, checkout, id: filed?.id ?? threadId(checkout), state, note, reader: c }
}

/** A floor's thread opened where no worker's view is (a list of the floor's threads), read as the worker on duty in its checkout. */
export const floorThread = (f: Floor, t: FloorThread): ThreadPlace => {
  const worker = workerIn(f, t.checkout)
  return { project: f.id, checkout: t.checkout, id: t.id, state: t.state, note: t.calls.note, reader: worker?.onDuty ? worker : undefined }
}

/** Where a thread is: its project and its item's id in the floor's `reviews`. */
export type ThreadAt = Pick<ThreadPlace, 'project' | 'checkout' | 'id'>

/** A thread's slot among the viewer's thread reads (`heldHandlers`), read at the `modifiedAt` of its file. */
export const threadSlot = (at: ThreadAt) => `${at.project}/${at.id}`
const threadFile = (floors: Floor[], at: ThreadAt) =>
  floors.find((f) => f.id === at.project)?.collections.find((c) => c.id === REVIEWS)?.items.find((i) => i.id === at.id)

/** The read a thread wants at the version of its file the board names; none while it has no file. */
export const threadWant = (floors: Floor[], at: ThreadAt): Extract<ReadEvent<ReviewThread>, { type: 'want' }> | undefined => {
  const item = threadFile(floors, at)
  return item && { type: 'want', slot: threadSlot(at), key: String(item.modifiedAt) }
}

/** A thread as held: empty while it has no file, `undefined` until its file is first read. */
export const heldThread = (reads: Reads<ReviewThread>, floors: Floor[], at: ThreadAt): ReviewThread | undefined =>
  threadFile(floors, at) ? valueOf(reads.held[threadSlot(at)]) : { checkout: at.checkout, messages: [] }

/** Why a thread couldn't be read, while none is held. */
export const threadFailure = (reads: Reads<ReviewThread>, at: ThreadAt) => failureOf(reads.held[threadSlot(at)])

/** Reads the thread a slot names, its file's text through `text` (`tower.text`). */
export const readThread = (text: (path: string) => Promise<string>) => (slot: string) => {
  const at = slot.indexOf('/')
  return text(`collection/${slot.slice(0, at)}/${REVIEWS}/${encodeURIComponent(slot.slice(at + 1))}`).then(parseThread)
}

/**
 * What the viewer holds of a thread: the thread as last read (`failed`, why that read failed), the reader's Changes,
 * the worker it picked to send to, and the note its composer answers.
 */
export type ThreadViewer = {
  thread: ReviewThread | undefined; failed: string | undefined; changes: RepoChanges[] | undefined; picked: string | undefined; re: number | undefined
}

/** The Reviews panel's view of a thread opened at `at`, from the board and what the viewer holds. */
export function threadViewOf(board: Board, at: ThreadPlace, viewer: ThreadViewer): ThreadView {
  const f = board.floors.find((f) => f.id === at.project)!
  return {
    project: at.project, checkout: at.checkout, tag: f.collections.find((c) => c.id === REVIEWS)?.items.find((i) => i.id === at.id)?.tag, thread: viewer.thread, failed: viewer.failed,
    reader: at.reader, changes: viewer.changes, targets: sendTargets(f, at.checkout), target: sendTarget(f, at.checkout, viewer.picked), re: viewer.re,
    user: board.user.name, files: threadItemFiles(f, at.checkout, at.id), state: at.state, noting: at.note !== undefined,
  }
}

const ANCHOR_STATE: Partial<Record<AnchorState, string>> = { changed: 'changed since', gone: 'no longer in the diff' }

const QUOTE_ROW: Record<string, string> = { '+': 'plus', '-': 'minus' }

/** A quote's lines with their syntax marked: a `diff` quote in its file's language, each line on its mark's row. */
function quoteHtml(path: string, quote: Quote) {
  if (quote.lang !== 'diff') return `<pre>${highlightLines(quote.lines, quote.lang).map((l) => `<span class="row">${l}</span>`).join('')}</pre>`
  const code = highlightLines(quote.lines.map((l) => l.slice(1)), langOf(path))
  return `<pre>${quote.lines.map((l, i) => `<span class="row ${QUOTE_ROW[l[0]] ?? ''}"><span class="m">${esc(l[0])}</span>${code[i]}</span>`).join('')}</pre>`
}

function anchorHtml(v: ThreadView, a: Anchor, i: number, n: number) {
  const state = v.changes && anchorState(a, v.changes)
  const dir = v.files.dirs.find((d) => repoName(d) === a.repo)
  return `<div class="anchor ${state ?? ''}"><div class="where"><button class="go" data-anchor="${n}|${i}" data-tip="show these lines in Changes"><code>${esc(anchorWhere(a))}</code>${
    state && ANCHOR_STATE[state] ? `<span class="state">${ANCHOR_STATE[state]}</span>` : ''}</button>${dir ? fileButtonsHtml(`${dir}/${a.path}`, a.from) : ''}</div>${a.quote ? quoteHtml(a.path, a.quote) : ''}</div>`
}

/** What a Resolve on note `n` of the view's thread calls, signed by the viewer. @since 1.94 */
export const resolveAction = (v: Pick<ThreadView, 'project' | 'checkout' | 'user'>, n: number) =>
  ({ verb: 'reviews/resolve', call: { project: v.project, checkout: v.checkout, author: v.user, notes: [n] } }) as const

/** `resolvedBy`: the note that resolved this one, when one did. A note can be resolved while the work goes on, unless it is a resolution. */
const noteHtml = (v: ThreadView, m: Message, fresh: boolean, resolvedBy: number | undefined) => `<article class="note ${fresh ? 'new' : ''} ${m.author === v.user ? 'mine' : ''} ${resolvedBy ? 'resolved' : ''}" data-note="${m.n}">
  <header><b>${esc(m.author)}</b><span>${esc(m.at)}</span><span class="n">n${m.n}</span>${m.re ? `<button class="re" data-to-note="${m.re}">re n${m.re}</button>` : ''}${
    resolvedBy ? `<button class="resolved-mark" data-to-note="${resolvedBy}" data-tip="resolved by n${resolvedBy}">resolved</button>` : ''}${
    fresh ? `<span class="new-mark" data-tip="${esc(v.reader!.callsign)} hasn't seen it">new</span>` : ''}${v.noting ? `<button data-reply="${m.n}">reply</button>` : ''}${
    v.noting && !resolvedBy && !resolvesOf(m).length ? `<button data-resolve="${m.n}" data-tip="mark n${m.n} resolved, with a note of its own">resolve</button>` : ''}</header>
  ${m.anchors.map((a, i) => anchorHtml(v, a, i, m.n)).join('')}${m.body ? `<div class="body md">${markdownHtml(m.body)}</div>` : ''}</article>`

function sendHtml(v: ThreadView) {
  const option = (t: Worker) => `<option value="${esc(t.id)}" ${t.id === v.target?.id ? 'selected' : ''}>${esc(t.callsign)} · ${esc(t.checkout)}</option>`
  return `<span class="send"><button class="primary" data-send ${v.target ? '' : 'disabled'} data-tip="type a pointer to the new notes into the worker's composer">Send to <b>${v.target ? esc(v.target.callsign) : '…'}</b></button>
    <select data-send-pick aria-label="send to another worker" data-tip="send to another worker">${v.target ? '' : '<option value="">pick a worker</option>'}${v.targets.map(option).join('')}</select></span>`
}

const composerHtml = (v: ThreadView) => `<div class="composer">${v.re ? `<div class="re-chip">answering <code>n${v.re}</code><button class="icon-btn" data-reply-clear aria-label="not an answer" data-tip="not an answer">${ICON.close}</button></div>` : ''}
      <textarea data-note-text placeholder="a note on ${esc(v.checkout)} as a whole, as ${esc(v.user)} (⌘⏎ adds it)"></textarea>
      <div class="actions"><button class="primary" data-note-add>Add note</button></div></div>`

/**
 * A checkout's thread: notes with their quotes marked as the Changes find them, and, while a note is offered, Send and a
 * composer for a note on the whole work. Once the work no longer goes on, the thread is read only, under a line saying why.
 */
export function reviewsHtml(v: ThreadView) {
  const settled = settledHtml(v.state, v.checkout)
  if (!v.thread) return `<div class="reviews-panel">${settled}${v.failed ? failedHtml('the thread', v.failed, 'data-thread-read') : '<p class="none">reading the thread…</p>'}</div>`
  if (settled && !v.thread.messages.length) return `<div class="reviews-panel">${settled}<p class="none">${esc(v.checkout)} has no review thread.</p></div>`
  const unseen = new Set(v.reader && !settled ? unseenBy(v.thread, v.reader.callsign).map((m) => m.n) : [])
  const resolved = resolvedIn(v.thread)
  return `<div class="reviews-panel">${settled}<div class="reviews-head"><span>Thread of <b>${esc(v.checkout)}</b></span>${v.tag ? `<button class="tag" data-copy="${esc(v.tag)}" data-tip="copy its tag">${esc(v.tag)}</button>` : ''}${
      v.files.thread && v.thread.messages.length ? fileButtonsHtml(v.files.thread) : ''}
      <span><b>${v.thread.messages.length}</b> ${noun(v.thread.messages.length, 'note')}${resolved.size ? ` · <b>${resolved.size}</b> resolved` : ''}${unseen.size ? ` · <b>${unseen.size}</b> new to ${esc(v.reader!.callsign)}` : ''}</span>${v.noting ? sendHtml(v) : ''}</div>` +
    (v.thread.messages.map((m) => noteHtml(v, m, unseen.has(m.n), resolved.get(m.n))).join('') || '<p class="none">no notes yet: pick lines in Changes, or write one below</p>') +
    (v.noting ? composerHtml(v) : '') + '</div>'
}
