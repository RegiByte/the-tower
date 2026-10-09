/**
 * The Changes and Reviews panels every renderer draws: pure views from plain data to html, the logic of picking lines
 * and finding an anchor's, and one stylesheet (`panelsCss`, beside `markdownCss`: a note's words are markdown). A renderer keeps the state (what it read, folds, the
 * pick, text being written), passes it in as a view model, puts the html in an element with `drawPanel` and wires the
 * attributes below. The tower serves it as `/panels.js`.
 *
 * The protocol a renderer wires, by the attribute on the element clicked (`closest`):
 *
 *   Changes
 *   data-changes-read          read the worker's Changes again
 *   data-changes-layout="<l>"  draw diffs unified or split side by side (`DIFF_LAYOUTS`), the viewer's, kept under `DIFF_LAYOUT_KEY`
 *   data-landing-of="<branch>" show what landing changed on the branch, of the worker's project (`tower.landing`)
 *   data-since="<ms>"          a time: the renderer writes how long ago it was, and keeps it current
 *   data-file="<key>"          a file's section, by `fileKey`
 *   data-fold="<key>"          fold or unfold a file, for this viewer only (the file header; its caret is the button a keyboard reaches)
 *   data-viewed="<key>"        mark the file's version viewed, or not: `marksToggled` gives the repo's marks to keep
 *   data-pick="<key>|<row>"    a line number: pick the line (`picked`, ⇧ to extend), or drag across lines (`watchPickDrag`,
 *                              `spanned`); also where an anchor scrolls to
 *   data-pick-text             the note being written under the picked lines (a textarea): ⌘⏎ adds, Esc cancels
 *   data-pick-add              add the note on the picked lines (`pickAnchor`) through `review/append`
 *   data-pick-cancel           drop the pick
 *
 *   Reviews
 *   data-thread-read           read the thread again, after a read that failed
 *   data-note="<n>"            a note, by number
 *   data-to-note="<n>"         the note this one answers: scroll to it
 *   data-anchor="<n>|<i>"      anchor `i` of note `n`: show its lines in Changes (`anchorSpot`)
 *   data-reply="<n>"           answer note `n` from the composer
 *   data-reply-clear           the composer's note answers none
 *   data-note-text             the composer (a textarea): ⌘⏎ adds
 *   data-note-add              add the composer's note through `review/append`
 *   data-send                  submit `sendText` into the send target
 *   data-send-pick             the send target's picker (a select): its value is the worker's id
 *   data-copy="<text>"         copy the text (the thread's tag)
 *   data-copy-code             copy a fence's code in a note (`/markdown.js`)
 *
 *   Files, wherever a panel names one (`fileButtonsHtml`, `fileSpansHtml`), and any renderer's own (`fileCall` gives the call)
 *   data-reveal="<path>"       show the file or folder in Finder through `reveal`
 *   data-edit="<path>"         open it in the user's editor through `edit`, at `data-line="<n>"` when the element has one
 *
 *   Stats
 *   data-stats-scope="<id>"    show a scope's tab: a project's id, or `STATS_ALL`
 *   data-stats-range="<r>"     read the stats again over another range (`statsQuery`)
 *   data-stats-read            read the stats again
 *   data-tip="<text>"          a bar's readout, shown by the renderer's tooltip (`watchTips`, src/shared/tips.ts)
 */
import type { RepoChanges } from '../changes.ts'
import type { CheckoutState } from '../bridge/reviews.ts'
import { bucketStart, type ScopeStats, type Spread, type Stats, type StatsQuery } from '../bridge/stats.ts'
import type { DiffFile, Hunk } from '../bridge/diff.ts'
import type { Call } from './api.ts'
import { esc, noun, paceWords, plural } from './cards.ts'
import { ICON } from './icons.ts'
import { checkoutDirs } from './model.ts'
import { highlightCss, highlightLines } from './highlight.ts'
import { markdownHtml } from './markdown.ts'
import { markRanges, wordRanges } from './words.ts'
import { anchorState, langOf, repoName, REVIEWS, threadId, unseenBy, type Anchor, type AnchorState, type Message, type Quote, type ReviewThread } from './reviews.ts'
import { identityOf } from './press.ts'

export { markRanges, wordRanges, WORDS_ALIKE, WORDS_LONGEST, type CharRange } from './words.ts'

/** The Finder and editor controls of a file, each opened by `open`, which names the element and its role. */
const fileActsHtml = (open: string, close: string, path: string, line?: number) => {
  const name = esc(path.replace(/\/$/, '').split('/').pop()!)
  return `<span class="file-acts">${open} class="file-act" data-reveal="${esc(path)}" aria-label="reveal ${name} in Finder" data-tip="reveal ${esc(path)} in Finder">${ICON.finder}${close}` +
    `${open} class="file-act" data-edit="${esc(path)}" ${line ? `data-line="${line}"` : ''} aria-label="open ${name} in your editor" data-tip="open ${esc(path)}${line ? `:${line}` : ''} in your editor">${ICON.editor}${close}</span>`
}

/** Quiet buttons that show a file or folder in Finder and open it in the user's editor, at `line` when given. */
export const fileButtonsHtml = (path: string, line?: number) => fileActsHtml('<button type="button"', '</button>', path, line)

/** `fileButtonsHtml` for a place inside another button, such as a tab, where a button may not sit: the same controls as spans. */
export const fileSpansHtml = (path: string) => fileActsHtml('<span role="button"', '</span>', path)

/** The call a click on a `data-reveal` or `data-edit` element makes: none when the click was elsewhere. */
export function fileCall(target: Element): Call<'reveal' | 'edit'> | undefined {
  const reveal = target.closest<HTMLElement>('[data-reveal]')?.dataset.reveal
  if (reveal) return ['reveal', { path: reveal }]
  const edit = target.closest<HTMLElement>('[data-edit]')
  if (!edit) return undefined
  const line = edit.dataset.line
  return ['edit', line ? { path: edit.dataset.edit!, line: Number(line) } : { path: edit.dataset.edit! }]
}

/** Each repo dir's marks: a file's path → the hash of the diff it was viewed at. */
export type Viewed = Record<string, Record<string, string>>
/** A worker's Changes as last read, at `at` (ms), with the viewer's marks. */
export type ChangesRead = { repos: RepoChanges[]; at: number; viewed: Viewed }
/**
 * Picked rows of one file's diff, `from` where the pick started and `to` where it ends, either way round, within one
 * hunk, at the version of the file's diff `hash` names: rows count only in that version.
 */
export type LinePick = { key: string; hash: string; from: number; to: number }

/**
 * The Changes panel: `folds` are the files folded or unfolded against what their viewed mark says, by `fileKey`;
 * `thread` is the thread whose anchors mark lines, `checkout` the one a note on picked lines is added to, `user` the
 * name it is signed with (`board.user.name`). `failed` is why the last read failed, drawn while nothing is read.
 * `picking` while the pick is being dragged: its lines show picked, and the note box waits for the drop. `state`: where
 * the worker's own checkout stands (`card.checkoutState`); `noting`: the worker offers `note`, so lines can be picked.
 * `layout`: each file's diff as one column of lines, or its old side and new side by side.
 */
export type ChangesView = {
  read: ChangesRead | undefined; failed: string | undefined; folds: ReadonlySet<string>; pick: LinePick | undefined; picking: boolean; thread: ReviewThread | undefined; checkout: string; user: string
  state: CheckoutState; noting: boolean; layout: DiffLayout
}

/** How the Changes panel draws a file's diff: one column of lines, or the old side and the new side by side. */
export type DiffLayout = 'unified' | 'split'
export const DIFF_LAYOUTS: DiffLayout[] = ['unified', 'split']
/** Where a viewer's layout is kept in `tower.store`; `unified` while none is. */
export const DIFF_LAYOUT_KEY = 'changes.layout'
export const DIFF_LAYOUT_LABEL: Record<DiffLayout, string> = { unified: 'Unified', split: 'Split' }
export const DIFF_LAYOUT_MEANS: Record<DiffLayout, string> = {
  unified: 'each diff as one column: removed lines above the lines added in their place',
  split: 'each diff side by side: the old file on the left, the new on the right',
}

/** A worker as the Reviews panel names it. */
type Worker = { id: string; callsign: string; checkout: string }

/**
 * The Reviews panel: `reader` is the worker whose notes new to it are marked while the work goes on; `changes` what its
 * anchors are looked for in; `targets` who Send may reach and `target` the one it does; `re` the note the composer answers; `user` the name
 * the composer signs with (`board.user.name`), its notes marked as the viewer's own. `failed` is why the last read
 * of the thread failed, drawn while none is read. `state`: where the checkout's work stands (`card.threadState`, or a
 * floor thread's `state`); `noting`: the card or floor thread offers `note`, so the composer, replies and Send are drawn.
 */
export type ThreadView = {
  checkout: string; tag: string | undefined; thread: ReviewThread | undefined; failed: string | undefined; reader: Worker | undefined
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

/** A row of a file's diff: a hunk's heading, or a line with its numbers on the old side and now. */
export type Row = { hunk: Hunk } | { cls: 'plus' | 'minus' | 'eof' | ''; old?: number; now?: number; line: string; hunk?: undefined }

export const fileKey = (repo: RepoChanges, f: DiffFile) => `${repo.dir}\n${f.path}`
export const changedFiles = (repos: RepoChanges[]) => repos.flatMap((repo) => repo.files.map((f) => [repo, f] as const))
export const isViewed = (viewed: Viewed, repo: RepoChanges, f: DiffFile) => viewed[repo.dir]?.[f.path] === f.hash
/** A file shows folded once viewed; a fold or unfold of the viewer's own turns that around. */
export const isFolded = (read: ChangesRead, folds: ReadonlySet<string>, repo: RepoChanges, f: DiffFile) =>
  isViewed(read.viewed, repo, f) !== folds.has(fileKey(repo, f))

/** Files viewed of files changed. */
export const viewedCount = (read: ChangesRead) => {
  const files = changedFiles(read.repos)
  return { viewed: files.filter(([repo, f]) => isViewed(read.viewed, repo, f)).length, files: files.length }
}

/** A repo's marks with `f`'s flipped, keeping only files still changed: what to store under `viewed:<dir>`. */
export function marksToggled(viewed: Viewed, repo: RepoChanges, f: DiffFile): Record<string, string> {
  const marks = { ...viewed[repo.dir] }
  if (isViewed(viewed, repo, f)) delete marks[f.path]
  else marks[f.path] = f.hash
  return Object.fromEntries(repo.files.filter((x) => Object.hasOwn(marks, x.path)).map((x) => [x.path, marks[x.path]]))
}

/**
 * Every row of a file's diff, hunk headings included, each line with its numbers counted from its hunk's start:
 * context counts on both sides, a removal on the old, an addition on the new.
 */
export function fileRows(f: DiffFile): Row[] {
  return (f.hunks ?? []).flatMap((h) => {
    let old = h.old
    let now = h.new
    return [{ hunk: h }, ...h.lines.map((line): Row => {
      if (line[0] === '+') return { cls: 'plus', now: now++, line }
      if (line[0] === '-') return { cls: 'minus', old: old++, line }
      if (line[0] === '\\') return { cls: 'eof', line }
      return { cls: '', old: old++, now: now++, line }
    })]
  })
}

/**
 * A file's rows side by side, as indexes into `fileRows`: a hunk's heading across both sides, a context line on both,
 * and each run of removed lines beside the run of added lines that follows it, the shorter run's side left empty. A
 * no-newline marker stays on the side of the line it follows.
 */
export type SplitRow = { hunk: number } | { old?: number; now?: number; hunk?: undefined }

export function splitRows(rows: Row[]): SplitRow[] {
  const out: SplitRow[] = []
  let olds: number[] = []
  let nows: number[] = []
  const flush = () => {
    for (let k = 0; k < Math.max(olds.length, nows.length); k++) out.push({ old: olds[k], now: nows[k] })
    olds = []
    nows = []
  }
  rows.forEach((r, i) => {
    const before = rows[i - 1]
    if (r.hunk) return flush(), void out.push({ hunk: i })
    if (r.cls === 'minus' || (r.cls === 'eof' && !before?.hunk && before?.cls === 'minus')) {
      if (nows.length) flush()
      olds.push(i)
    } else if (r.cls === 'plus' || (r.cls === 'eof' && !before?.hunk && before?.cls === 'plus')) nows.push(i)
    else flush(), out.push({ old: i, now: i })
  })
  flush()
  return out
}

export const pickRange = (pick: LinePick) => [Math.min(pick.from, pick.to), Math.max(pick.from, pick.to)] as const

const lineOf = (value: string) => {
  const at = value.lastIndexOf('|')
  return { key: value.slice(0, at), row: Number(value.slice(at + 1)) }
}

/** The rows from `from` toward `to` of a file's diff, stopped at the edge of `from`'s hunk. */
function spanOf(read: ChangesRead, key: string, from: number, to: number): LinePick {
  const [, f] = changedFiles(read.repos).find(([r, f]) => fileKey(r, f) === key)!
  const rows = fileRows(f)
  const first = rows.findLastIndex((r, i) => i <= from && r.hunk) + 1
  const next = rows.findIndex((r, i) => i > from && r.hunk)
  const last = next === -1 ? rows.length - 1 : next - 1
  return { key, hash: f.hash, from, to: Math.min(Math.max(to, first), last) }
}

/** The pick after a click on a line number (`data-pick`): extended within its hunk, dropped when its one line is clicked again. */
export function picked(read: ChangesRead, pick: LinePick | undefined, value: string, extend: boolean): LinePick | undefined {
  const { key, row } = lineOf(value)
  const now = livePick(read, pick)
  if (extend && now?.key === key) return spanOf(read, key, now.from, row)
  if (now?.key === key && now.from === row && now.to === row) return undefined
  return spanOf(read, key, row, row)
}

/** The pick of a drag from one line number (`data-pick`) to another of the same file, within the first line's hunk. */
export function spanned(read: ChangesRead, from: string, to: string): LinePick {
  const start = lineOf(from)
  return spanOf(read, start.key, start.row, lineOf(to).row)
}

/**
 * Wires a drag across the line numbers under `el`: `drag` is called with the line pressed and each other line of its
 * file the pointer moves onto, `drop` when the button is let go after one. A press that reaches no other line is left
 * to its click.
 */
export function watchPickDrag(el: HTMLElement, on: { drag: (from: string, to: string) => void; drop: () => void }) {
  let from: string | undefined
  let over: string | undefined
  let dragged = false
  el.addEventListener('pointerdown', (e) => {
    const line = (e.target as Element).closest<HTMLElement>('[data-pick]')?.dataset.pick
    if (!line || e.button !== 0 || e.shiftKey) return
    e.preventDefault()
    from = over = line
    dragged = false
  })
  /** Disarms the press; answers whether it had dragged, after calling `drop`. */
  const end = () => {
    const had = from !== undefined && dragged
    from = over = undefined
    if (had) on.drop()
    return had
  }
  el.addEventListener('pointermove', (e) => {
    if (from && !(e.buttons & 1)) return void end()
    const line = from && (e.target as Element).closest<HTMLElement>('[data-pick]')?.dataset.pick
    if (!line || line === over || lineOf(line).key !== lineOf(from!).key) return
    over = line
    dragged = true
    on.drag(from!, line)
  })
  window.addEventListener('pointercancel', end)
  window.addEventListener('pointerup', () => {
    if (!end()) return
    // The click that ends a drag is the drag's, whichever line it lands on.
    const swallow = (e: Event) => e.stopPropagation()
    window.addEventListener('click', swallow, { capture: true, once: true })
    setTimeout(() => window.removeEventListener('click', swallow, { capture: true }))
  })
}

/** The pick while its file's diff is still the version it was picked on; a read that changed the file drops it. */
export const livePick = (read: ChangesRead, pick: LinePick | undefined) =>
  pick && changedFiles(read.repos).some(([r, f]) => fileKey(r, f) === pick.key && f.hash === pick.hash) ? pick : undefined

/** The picked rows as an anchor: the file's lines now, or a `diff` with their marks when the rows hold a removal. */
export function pickAnchor(repos: RepoChanges[], pick: LinePick): Anchor {
  const [repo, f] = changedFiles(repos).find(([r, f]) => fileKey(r, f) === pick.key)!
  const [lo, hi] = pickRange(pick)
  const rows = fileRows(f).slice(lo, hi + 1).flatMap((r) => (r.hunk || r.cls === 'eof' ? [] : [r]))
  const removes = rows.some((r) => r.cls === 'minus')
  const now = rows.flatMap((r) => (r.now === undefined ? [] : [r.now]))
  const nums = now.length ? now : rows.map((r) => r.old!)
  return {
    repo: repoName(repo.dir), path: f.path, from: Math.min(...nums), to: Math.max(...nums),
    quote: removes ? { lang: 'diff', lines: rows.map((r) => r.line) } : { lang: langOf(f.path), lines: rows.map((r) => r.line.slice(1)) },
  }
}

export const anchorWhere = (a: Anchor) => `${a.repo}:${a.path}:${a.from === a.to ? a.from : `${a.from}-${a.to}`}`

/** The lines of a file notes anchor to, by line number now, each with the notes. A quote of removed lines marks none. */
export function notedLines(thread: ReviewThread | undefined, repo: RepoChanges, f: DiffFile) {
  const lines = new Map<number, number[]>()
  for (const m of thread?.messages ?? []) for (const a of m.anchors) {
    if (a.repo !== repoName(repo.dir) || a.path !== f.path || a.quote?.lang === 'diff') continue
    for (let n = a.from; n <= a.to; n++) lines.set(n, [...(lines.get(n) ?? []), m.n])
  }
  return lines
}

/**
 * Where an anchor's first line is in the Changes: its file, and the row holding the line now (else on the old side;
 * -1 when the diff doesn't show it). Undefined when its file has no changes now.
 */
export function anchorSpot(repos: RepoChanges[], a: Anchor) {
  const found = changedFiles(repos).find(([repo, f]) => repoName(repo.dir) === a.repo && f.path === a.path)
  if (!found) return undefined
  const [repo, file] = found
  const rows = fileRows(file)
  const at = rows.findIndex((r) => !r.hunk && r.now === a.from)
  return { repo, file, key: fileKey(repo, file), row: at === -1 ? rows.findIndex((r) => !r.hunk && r.old === a.from) : at }
}

/** The element an anchor's spot scrolls to: its line number, else its file. */
export const spotSelector = (spot: { key: string; row: number }) =>
  spot.row === -1 ? `[data-file="${CSS.escape(spot.key)}"]` : `[data-pick="${CSS.escape(`${spot.key}|${spot.row}`)}"]`

/** An anchor of a thread's note, by the `data-anchor` value its renderer was clicked on. */
export function anchorOf(thread: ReviewThread, value: string): Anchor | undefined {
  const [n, i] = value.split('|').map(Number)
  return thread.messages.find((m) => m.n === n)?.anchors[i]
}

/** The highlighted code of a file's rows, by its path and diff hash: a file is highlighted once per version of its diff. */
const highlighted = new Map<string, string[]>()
const HIGHLIGHTED_KEPT = 500

/**
 * Each row's code as html with its syntax marked, aligned with `fileRows` (a hunk heading's is empty). Each hunk is
 * highlighted as two texts, the old side and the new, so a line reads in the code it stood in. A removed line and the
 * added line `splitRows` sets beside it have the words they changed marked over the syntax (`wordRanges`).
 */
function rowCode(f: DiffFile): string[] {
  const id = `${f.path}\n${f.hash}`
  const kept = highlighted.get(id)
  if (kept) return kept
  const lang = langOf(f.path)
  const code = (f.hunks ?? []).flatMap((h) => {
    const side = (mark: string) => h.lines.filter((l) => l[0] === ' ' || l[0] === mark).map((l) => l.slice(1))
    const [old, now] = [highlightLines(side('-'), lang), highlightLines(side('+'), lang)]
    let o = 0
    let n = 0
    return ['', ...h.lines.map((l) => (l[0] === '+' ? now[n++] : l[0] === '-' ? old[o++] : l[0] === '\\' ? esc(l.slice(1)) : (o++, now[n++])))]
  })
  const rows = fileRows(f)
  for (const s of splitRows(rows)) {
    if (s.hunk !== undefined || s.old === undefined || s.now === undefined) continue
    const [was, is] = [rows[s.old], rows[s.now]] as Exclude<Row, { hunk: Hunk }>[]
    if (was.cls !== 'minus' || is.cls !== 'plus') continue
    const words = wordRanges(was.line.slice(1), is.line.slice(1))
    if (!words) continue
    code[s.old] = markRanges(code[s.old], words.old, 'word')
    code[s.now] = markRanges(code[s.now], words.now, 'word')
  }
  highlighted.set(id, code)
  if (highlighted.size > HIGHLIGHTED_KEPT) highlighted.delete(highlighted.keys().next().value!)
  return code
}

const CHANGE_MARK: Record<DiffFile['change'], string> = { added: 'A', deleted: 'D', modified: 'M', renamed: 'R' }
const countsHtml = (added: number, removed: number) => `<span class="add">+${added}</span> <span class="del">−${removed}</span>`

/**
 * A read that failed, in place of what it would have drawn: what couldn't be read and why, and the control that reads
 * it again (`again`, its data attribute). Any renderer's own reads draw it too.
 */
export const failedHtml = (what: string, message: string, again: string) =>
  `<div class="read-failed" role="alert"><p>couldn't read ${esc(what)}: ${esc(message)}</p><button ${again}>${ICON.resume} Read again</button></div>`

/** Where work that no longer goes on stands, said once at the top of a panel: nothing beside it takes a note. */
function settledHtml(state: CheckoutState, checkout: string) {
  if (state.is === 'live') return ''
  const said = state.is === 'gone'
    ? `<b>Worktree removed</b>: the folders of ${esc(checkout)} are gone, and nothing says its work landed.`
    : state.empty
      ? `<b>Nothing to land</b>: ${esc(checkout)} made no commits of its own${state.filed ? `, and its thread was filed ${esc(state.filed.at)}` : ''}.`
      : `<b>Landed${state.on ? ` on <code>${esc(state.on)}</code>` : ''}${state.edited ? `, ${state.edited} edited` : ''}</b>: the work of ${esc(checkout)} is in its base${state.edited ? `, ${state.edited === 1 ? 'one commit' : `${state.edited} commits`} changed on the way${state.branch ? ` (<button data-landing-of="${esc(state.branch)}">what landing changed</button>)` : ''}` : ''}${state.filed ? `, and its thread was filed ${esc(state.filed.at)}` : ''}.`
  return `<p class="settled" role="status">${said} Notes on it would reach nobody.</p>`
}

/** What changed in a worker's repos: each repo since what it counts from, each file with its diff, folded once viewed. */
export function changesHtml(v: ChangesView) {
  const read = v.read
  const settled = settledHtml(v.state, v.checkout)
  if (!read) return `<div class="changes-panel">${settled}${v.failed ? failedHtml('what changed', v.failed, 'data-changes-read') : '<p class="none">reading what changed…</p>'}</div>`
  const files = changedFiles(read.repos)
  if (settled && !files.length) return `<div class="changes-panel">${settled}</div>`
  const sum = (key: 'added' | 'removed') => files.reduce((n, [, f]) => n + f[key], 0)
  const layouts = `<div class="seg" role="group" aria-label="diff layout">${DIFF_LAYOUTS.map((l) =>
    `<button type="button" class="${l === v.layout ? 'on' : ''}" data-changes-layout="${l}" aria-pressed="${l === v.layout}" data-tip="${esc(DIFF_LAYOUT_MEANS[l])}">${DIFF_LAYOUT_LABEL[l]}</button>`).join('')}</div>`
  const head = `<div class="changes-head"><span><b>${viewedCount(read).viewed} / ${files.length}</b> files viewed</span><span>${countsHtml(sum('added'), sum('removed'))}</span>
      <span>read <span data-since="${read.at}"></span> ago</span>${layouts}<button data-changes-read>${ICON.resume} Read again</button></div>`
  return `<div class="changes-panel">${settled}${head}${read.repos.map((repo) => repoHtml({ ...v, read, pick: v.noting ? livePick(read, v.pick) : undefined }, repo)).join('') || '<p class="none">not in a git repository</p>'}</div>`
}

type ReadView = ChangesView & { read: ChangesRead }

const repoHtml = (v: ReadView, repo: RepoChanges) =>
  `<div class="repo-head"><b class="eyebrow">${esc(repoName(repo.dir))}</b><span>since</span><code>${esc(repo.against)}</code>${repo.against === 'HEAD' ? '' : `<code>${esc(repo.since.slice(0, 7))}</code>`}</div>` +
  (repo.files.map((f) => fileHtml(v, repo, f)).join('') || '<p class="none">no changes</p>') +
  (repo.more ? `<p class="none">${repo.more} more untracked files not shown</p>` : '')

function fileHtml(v: ReadView, repo: RepoChanges, f: DiffFile) {
  const key = esc(fileKey(repo, f))
  const viewed = isViewed(v.read.viewed, repo, f)
  const folded = isFolded(v.read, v.folds, repo, f)
  const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/') + 1) : ''
  return `<section class="file ${viewed ? 'viewed' : ''} ${folded ? 'folded' : ''}" data-file="${key}">
    <header data-fold="${key}"><button class="icon-btn caret" data-fold="${key}" aria-expanded="${!folded}" aria-label="${esc(f.path)}">${ICON.caret}</button><span class="mark ${f.change}">${CHANGE_MARK[f.change]}</span>
      <span class="path">${f.from ? `<i>${esc(f.from)} → </i>` : ''}<i>${esc(dir)}</i>${esc(f.path.slice(dir.length))}</span>
      ${f.change === 'deleted' ? '' : fileButtonsHtml(`${repo.dir}/${f.path}`)}
      <span class="n">${f.added + f.removed ? countsHtml(f.added, f.removed) : ''}</span>
      <button class="viewed-box" role="checkbox" aria-checked="${viewed}" data-viewed="${key}"><span class="box">${viewed ? ICON.check : ''}</span>Viewed</button></header>
    ${folded ? '' : `<div class="body">${fileBodyHtml(v, repo, f)}</div>`}</section>`
}

function fileBodyHtml(v: ReadView, repo: RepoChanges, f: DiffFile) {
  if (f.binary) return '<p class="none">binary file</p>'
  if (!f.hunks) return `<p class="none">${plural(f.added + f.removed, 'line')} changed: too many to show</p>`
  if (!f.hunks.length) return `<p class="none">${f.change === 'renamed' ? 'renamed, same content' : 'mode changed'}</p>`
  const key = fileKey(repo, f)
  const range = v.pick?.key === key ? pickRange(v.pick) : undefined
  const noted = notedLines(v.thread, repo, f)
  const code = rowCode(f)
  if (v.layout === 'split') return splitBodyHtml(v, key, f, range, noted, code)
  const rows = fileRows(f).map((r, i) => {
    if (r.hunk) return `<tr class="hunk"><td colspan="3">@@ −${r.hunk.old} +${r.hunk.new} @@ ${esc(r.hunk.heading)}</td></tr>`
    const on = range && i >= range[0] && i <= range[1]
    const marks = r.now === undefined ? undefined : noted.get(r.now)
    const tips = (notes: number[] | undefined) => [...(notes ? [`noted in ${notes.map((n) => `n${n}`).join(', ')}`] : []), ...(v.noting ? ['click to note on this line, drag or ⇧-click for more'] : [])].join('; ')
    const ln = (n: number | undefined, notes: number[] | undefined) => `<td class="ln ${notes ? 'noted' : ''}" ${r.cls === 'eof' || !v.noting ? '' : `data-pick="${esc(key)}|${i}"`} ${
      tips(notes) ? `data-tip="${tips(notes)}"` : ''}>${n ?? ''}</td>`
    const line = `<tr class="${r.cls} ${on ? 'picked' : ''}">${ln(r.old, undefined)}${ln(r.now, marks)}<td><span class="m">${esc(r.line[0])}</span>${code[i]}</td></tr>`
    return on && i === range[1] && !v.picking ? line + noteBoxHtml(v) : line
  })
  return `<table>${rows.join('')}</table>`
}

/** A file's diff side by side: each side's line numbers pick lines as the unified table's do, by the same rows. */
function splitBodyHtml(v: ReadView, key: string, f: DiffFile, range: readonly [number, number] | undefined, noted: Map<number, number[]>, code: string[]) {
  const rows = fileRows(f)
  const on = (i: number | undefined) => i !== undefined && !!range && i >= range[0] && i <= range[1]
  const side = (i: number | undefined, n: 'old' | 'now') => {
    if (i === undefined) return '<td class="ln empty"></td><td class="code empty"></td>'
    const r = rows[i] as Exclude<Row, { hunk: Hunk }>
    const notes = n === 'now' && r.now !== undefined ? noted.get(r.now) : undefined
    const tip = [...(notes ? [`noted in ${notes.map((x) => `n${x}`).join(', ')}`] : []), ...(v.noting ? ['click to note on this line, drag or ⇧-click for more'] : [])].join('; ')
    const cls = `${r.cls} ${on(i) ? 'picked' : ''}`
    return `<td class="ln ${cls} ${notes ? 'noted' : ''}" ${r.cls === 'eof' || !v.noting ? '' : `data-pick="${esc(key)}|${i}"`} ${tip ? `data-tip="${tip}"` : ''}>${r[n] ?? ''}</td>` +
      `<td class="code ${cls}"><span class="m">${esc(r.line[0])}</span>${code[i]}</td>`
  }
  const pairs = splitRows(rows)
  // The box goes under the last pair holding a picked line: a pick ending on an added line may hold removed lines below it.
  const boxAt = range ? pairs.findLastIndex((s) => s.hunk === undefined && (on(s.old) || on(s.now))) : -1
  const html = pairs.map((s, k) => {
    if (s.hunk !== undefined) {
      const h = (rows[s.hunk] as { hunk: Hunk }).hunk
      return `<tr class="hunk"><td colspan="4">@@ −${h.old} +${h.new} @@ ${esc(h.heading)}</td></tr>`
    }
    const line = `<tr>${side(s.old, 'old')}${side(s.now, 'now')}</tr>`
    return k === boxAt && !v.picking ? line + noteBoxHtml(v, 4) : line
  })
  return `<table class="split"><colgroup><col class="ln"><col><col class="ln"><col></colgroup>${html.join('')}</table>`
}

const noteBoxHtml = (v: ReadView, cols = 3) => `<tr class="note-row"><td colspan="${cols}"><div class="note-box">
    <div class="where"><code>${esc(anchorWhere(pickAnchor(v.read.repos, v.pick!)))}</code><span>on the thread of <b>${esc(v.checkout)}</b>, as ${esc(v.user)}</span></div>
    <textarea data-pick-text placeholder="a note on these lines (⌘⏎ adds it, Esc cancels)"></textarea>
    <div class="actions"><button class="primary" data-pick-add>Add note</button><button data-pick-cancel>Cancel</button><span class="hint">drag across line numbers or ⇧-click one to extend, within a hunk</span></div>
  </div></td></tr>`

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

const noteHtml = (v: ThreadView, m: Message, fresh: boolean) => `<article class="note ${fresh ? 'new' : ''} ${m.author === v.user ? 'mine' : ''}" data-note="${m.n}">
  <header><b>${esc(m.author)}</b><span>${esc(m.at)}</span><span class="n">n${m.n}</span>${m.re ? `<button class="re" data-to-note="${m.re}">re n${m.re}</button>` : ''}${
    fresh ? `<span class="new-mark" data-tip="${esc(v.reader!.callsign)} hasn't seen it">new</span>` : ''}${v.noting ? `<button data-reply="${m.n}">reply</button>` : ''}</header>
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
  return `<div class="reviews-panel">${settled}<div class="reviews-head"><span>Thread of <b>${esc(v.checkout)}</b></span>${v.tag ? `<button class="tag" data-copy="${esc(v.tag)}" data-tip="copy its tag">${esc(v.tag)}</button>` : ''}${
      v.files.thread && v.thread.messages.length ? fileButtonsHtml(v.files.thread) : ''}
      <span><b>${v.thread.messages.length}</b> ${noun(v.thread.messages.length, 'note')}${unseen.size ? ` · <b>${unseen.size}</b> new to ${esc(v.reader!.callsign)}` : ''}</span>${v.noting ? sendHtml(v) : ''}</div>` +
    (v.thread.messages.map((m) => noteHtml(v, m, unseen.has(m.n))).join('') || '<p class="none">no notes yet: pick lines in Changes, or write one below</p>') +
    (v.noting ? composerHtml(v) : '') + '</div>'
}

/** The Stats panel's tab that covers every project. */
export const STATS_ALL = '*'

/** How far back the Stats panel reads: today by hour, or the last 7 or 30 local days by day. */
export type StatsRange = 'today' | 'week' | 'month'
const RANGES: [StatsRange, string][] = [['today', 'Today'], ['week', '7 days'], ['month', '30 days']]
const RANGE_DAYS: Record<StatsRange, number> = { today: 1, week: 7, month: 30 }

/** The `/stats` query of a range ending now: every project's, so the All tab can stack them. */
export function statsQuery(range: StatsRange, now: number): Partial<StatsQuery> {
  const day = new Date(bucketStart(now, 'day'))
  day.setDate(day.getDate() - (RANGE_DAYS[range] - 1))
  return { from: day.getTime(), bucket: range === 'today' ? 'hour' : 'day' }
}

/** A project as the Stats panel draws it: its bars wear its colour. */
export type StatsProject = { id: string; label: string; color?: string }

/**
 * The Stats panel: `projects` are the series the All tab stacks, every project's (one in the read but not here, such
 * as a project gone from the config, stacks in a neutral colour under its id); `tabs` the scopes the renderer
 * offers (a project's id, or `STATS_ALL`), `scope` the one shown; `stats` the last read over `range`, at `at` (ms);
 * `failed` why the last read failed, drawn while none is held.
 */
export type StatsView = {
  stats: Stats | undefined; failed: string | undefined; at: number | undefined; range: StatsRange
  projects: StatsProject[]; tabs: { id: string; label: string }[]; scope: string
}

/** A day as a column names it: the weekday and the day of the month. */
const dayLabel = (at: number) => `${new Date(at).toLocaleDateString('en-US', { weekday: 'short' })} ${new Date(at).getDate()}`
const dayTitle = (at: number) => new Date(at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
const usdAxis = (v: number) => `$${v < 1 ? v.toFixed(2) : Math.round(v).toLocaleString('en-US')}`
const hoursAxis = (v: number) => `${v < 1 ? v.toFixed(2) : v < 10 ? v.toFixed(1) : Math.round(v)} h`
/** Dollars, cents below $100. */
export const usd = (v: number) => (v >= 100 ? `$${Math.round(v).toLocaleString('en-US')}` : `$${v.toFixed(2)}`)
export const hours = (v: number) => `${v < 10 ? v.toFixed(1) : Math.round(v)} h`
const count = (v: number) => (v >= 10_000 ? `${(v / 1000).toFixed(0)}k` : v.toLocaleString('en-US'))
const tokens = (v: number) => (v >= 1e9 ? `${(v / 1e9).toFixed(2)} B` : v >= 1e6 ? `${(v / 1e6).toFixed(1)} M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)} k` : String(v))
/** A duration in seconds, in the unit that reads best. */
export const duration = (s: number) => (s < 90 ? `${Math.round(s)} s` : s < 90 * 60 ? `${(s / 60).toFixed(s < 600 ? 1 : 0)} min` : `${(s / 3600).toFixed(1)} h`)
/** The same, as narrow as a table column wants it. */
const short = (s: number) => (s < 90 ? `${Math.round(s)}s` : s < 90 * 60 ? `${(s / 60).toFixed(s < 600 ? 1 : 0)}m` : `${(s / 3600).toFixed(1)}h`)

const EMPTY_SPREAD: Spread = { n: 0, min: 0, p50: 0, avg: 0, p90: 0, max: 0 }
const EMPTY_SCOPE = (buckets: number): ScopeStats => ({
  summary: {
    sessions: 0, worked: 0, resumes: 0, spend: 0, tokens: {}, agentHours: 0, busyHours: 0, atOnce: 0, turns: 0, prompts: {}, subagents: 0, asks: 0, failures: 0,
    waits: EMPTY_SPREAD, turnSeconds: EMPTY_SPREAD, activeMinutes: EMPTY_SPREAD,
    git: { commits: 0, merges: 0, added: 0, removed: 0, byExtension: {}, repos: [] },
  },
  series: Object.fromEntries(['spend', 'agentHours', 'turns', 'sessions', 'commits', 'added', 'removed', 'busyHours', 'atOnce', 'peak'].map((k) => [k, Array(buckets).fill(0)])) as ScopeStats['series'],
  byHour: { spend: Array(24).fill(0), turns: Array(24).fill(0) },
  peak: { turns: 0 },
})

/** One bar's segments, a value per series, in the order of the legend. */
type Column = { label: string; tip: string; values: number[] }

/** A round step up from `v`: 1, 2 or 5 times a power of ten. */
const niceMax = (v: number) => {
  if (v <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  return [1, 2, 5, 10].map((m) => m * p).find((m) => m >= v)!
}

const seriesColor = (s: StatsProject) => `color-mix(in oklab, ${s.color ?? 'var(--accent)'} 75%, var(--ink))`

/**
 * Columns of stacked bars over three gridlines, a label under every `every`th, each column's readout in `data-tip`.
 * A legend names the series when there are two or more.
 */
function barsHtml(title: string, series: StatsProject[], columns: Column[], axis: (v: number) => string, every: number) {
  const max = niceMax(Math.max(0, ...columns.map((c) => c.values.reduce((a, v) => a + v, 0))))
  const grid = [1, 0.5, 0].map((f) => `<div class="rule" style="bottom:${f * 100}%"><span>${f ? axis(max * f) : ''}</span></div>`).join('')
  const cols = columns.map((c, i) => {
    const segments = c.values.map((v, k) => (v > 0 ? `<i style="height:${(v / max) * 100}%;background:${seriesColor(series[k])}"></i>` : '')).join('')
    return `<div class="column" data-tip="${esc(c.tip)}"><div class="stack">${segments}</div><span class="tick">${i % every === 0 ? esc(c.label) : ''}</span></div>`
  })
  const legend = series.length > 1 ? `<div class="legend">${series.map((s) => `<span><i style="background:${seriesColor(s)}"></i>${esc(s.label)}</span>`).join('')}</div>` : ''
  return `<figure class="chart"><figcaption class="eyebrow">${esc(title)}</figcaption>${legend}<div class="plot">${grid}<div class="columns">${cols.join('')}</div></div></figure>`
}

/** Where a column stands: its label under the axis and its title in the readout. */
type Place = { label: string; title: string }

const ADDED = 'color-mix(in oklab, var(--added) 85%, var(--ink))'
const REMOVED = 'color-mix(in oklab, var(--removed) 85%, var(--ink))'

/**
 * Lines added above the axis and removed below it, a column per place over one scale, from `total`; each column's
 * readout names every series' share, read from `parts`.
 */
function churnHtml(title: string, places: Place[], total: ScopeStats, series: StatsProject[], parts: ScopeStats[], every: number) {
  const { added, removed } = total.series
  const max = niceMax(Math.max(0, ...added, ...removed))
  const churn = (a: number, r: number) => `+${count(a)} −${count(r)}`
  const grid = [[100, `+${count(max)}`], [50, '0'], [0, `−${count(max)}`]].map(([at, label]) => `<div class="rule" style="bottom:${at}%"><span>${label}</span></div>`).join('')
  const cols = places.map(({ label, title: when }, i) => {
    const rows = series.length > 1 ? parts.flatMap((s, k) => (s.series.added[i] + s.series.removed[i] ? [`${series[k].label} ${churn(s.series.added[i], s.series.removed[i])}`] : [])) : []
    const tip = [when, `${churn(added[i], removed[i])} lines`, ...rows].join('\n')
    const bar = (v: number, color: string) => (v > 0 ? `<i style="height:${(v / max) * 100}%;background:${color}"></i>` : '')
    return `<div class="column" data-tip="${esc(tip)}"><div class="up">${bar(added[i], ADDED)}</div><div class="down">${bar(removed[i], REMOVED)}</div>
      <span class="tick">${i % every === 0 ? esc(label) : ''}</span></div>`
  })
  const legend = `<div class="legend"><span><i style="background:${ADDED}"></i>added</span><span><i style="background:${REMOVED}"></i>removed</span></div>`
  return `<figure class="chart churn"><figcaption class="eyebrow">${esc(title)}</figcaption>${legend}<div class="plot">${grid}<div class="columns">${cols.join('')}</div></div></figure>`
}

/**
 * Bars of one measure per place, one segment each, from `total`: a project may share a repo with another, so the
 * total counts it once where the projects' sum would not. Each readout names every series' share, read from `parts`.
 */
function totalColumns(places: Place[], total: number[], series: StatsProject[], parts: ScopeStats[], pick: (s: ScopeStats) => number[], format: (v: number) => string): Column[] {
  return places.map(({ label, title }, i) => {
    const rows = series.length > 1 ? parts.flatMap((s, k) => (pick(s)[i] ? [`${series[k].label} ${format(pick(s)[i])}`] : [])) : []
    return { label, tip: [title, format(total[i]), ...rows].join('\n'), values: [total[i]] }
  })
}

/** Bars of one measure per place, a segment per series: `pick` reads the measure from a scope's stats. */
function measureColumns(places: Place[], series: StatsProject[], scopes: ScopeStats[], pick: (s: ScopeStats) => number[], format: (v: number) => string): Column[] {
  return places.map(({ label, title }, i) => {
    const values = scopes.map((s) => pick(s)[i])
    const total = values.reduce((a, v) => a + v, 0)
    const rows = series.length > 1 ? values.flatMap((v, k) => (v > 0 ? [`${series[k].label} ${format(v)}`] : [])) : []
    return { label, tip: [title, `${format(total)}${series.length > 1 ? ' in all' : ''}`, ...rows].join('\n'), values }
  })
}

/** Which branch the commits are read from: one name when every repo agrees, and the repos origin/HEAD isn't set in. */
const branchNote = (repos: { dir: string; branch?: string }[]) => {
  const branches = [...new Set(repos.flatMap((r) => (r.branch ? [r.branch] : [])))]
  const unset = repos.length - repos.filter((r) => r.branch).length
  return [branches.length === 1 ? `on ${esc(branches[0])}` : `${branches.length} branches`, ...(unset ? [`${plural(unset, 'repo')} without origin/HEAD`] : [])].join(' · ')
}

const tileHtml = (label: string, value: string, note = '') => `<div class="tile"><b>${value}</b><span>${esc(label)}</span>${note ? `<small>${note}</small>` : ''}</div>`

const spreadRow = (label: string, s: Spread, format: (v: number) => string) =>
  `<tr><th>${esc(label)}</th>${s.n ? [s.min, s.p50, s.avg, s.p90, s.max].map((v) => `<td>${format(v)}</td>`).join('') : '<td colspan="5" class="none">none yet</td>'}<td>${s.n}</td></tr>`

/** Stats over a range, with a tab per scope the renderer offers: tiles, charts and spreads. */
export function statsHtml(v: StatsView) {
  const tabs = v.tabs.map((t) => {
    const project = v.projects.find((p) => p.id === t.id)
    return `<button class="${t.id === v.scope ? 'on' : ''}" aria-pressed="${t.id === v.scope}" data-stats-scope="${esc(t.id)}">${project ? `<i style="background:${seriesColor(project)}"></i>` : ''}${esc(t.label)}</button>`
  }).join('')
  const ranges = RANGES.map(([r, label]) => `<button class="${r === v.range ? 'on' : ''}" aria-pressed="${r === v.range}" data-stats-range="${r}">${label}</button>`).join('')
  const head = `<div class="stats-head"><div class="scopes">${tabs}</div><div class="ranges">${ranges}<button class="icon-btn" data-stats-read aria-label="read again" data-tip="read again">${ICON.resume}</button></div></div>`
  if (!v.stats) return `<div class="stats-panel">${head}${v.failed ? failedHtml('the stats', v.failed, 'data-stats-read') : '<p class="none">reading the stats…</p>'}</div>`
  const st = v.stats
  const all = v.scope === STATS_ALL
  const unlisted = Object.keys(st.projects).filter((id) => !v.projects.some((p) => p.id === id)).map((id) => ({ id, label: id, color: 'var(--deco)' }))
  const series = all ? [...v.projects, ...unlisted] : v.projects.filter((p) => p.id === v.scope)
  const scopeOf = (id: string) => (id === STATS_ALL ? st.all : st.projects[id] ?? EMPTY_SCOPE(st.buckets.length))
  const parts = series.map((s) => scopeOf(s.id))
  const shown = scopeOf(v.scope)
  const sum = shown.summary
  const hourly = st.bucket === 'hour'
  const hourOf = (h: number) => `${String(h).padStart(2, '0')}:00`
  const places = st.buckets.map((b) => (hourly ? { label: hourOf(new Date(b).getHours()), title: `${dayTitle(b)}, ${hourOf(new Date(b).getHours())}` } : { label: dayLabel(b), title: dayTitle(b) }))
  const every = Math.max(1, Math.ceil(places.length / (hourly ? 6 : 7)))
  const budget = all && st.budget
  const prompts = (origin: string) => sum.prompts[origin] ?? 0
  const yours = prompts('composer') + prompts('bridge')
  const tiles = [
    tileHtml('spent', usd(sum.spend), sum.turns ? `${usd(sum.spend / sum.turns)} a turn` : ''),
    tileHtml('agent-hours', hours(sum.agentHours), `${plural(sum.turns, 'turn')} · ${hours(sum.busyHours)} with anyone working`),
    tileHtml('working at once', sum.atOnce ? sum.atOnce.toFixed(1) : '–', `on average while anyone works · peak ${shown.peak.turns}`),
    tileHtml('waiting on you', sum.waits.n ? duration(sum.waits.p50) : '–', sum.waits.n ? `median of ${sum.waits.n} · p90 ${duration(sum.waits.p90)}` : 'no answered waits'),
    tileHtml('sessions worked', `${sum.worked}`, `${sum.sessions} started · ${plural(sum.resumes, 'resume')}`),
    tileHtml('prompts from you', `${yours}`, [sum.git.commits ? `${(yours / sum.git.commits).toFixed(1)} a commit landed` : '', `${prompts('peer')} from workers`, plural(sum.subagents, 'subagent')].filter(Boolean).join(' · ')),
    tileHtml('asked permission', `${sum.asks}`, `${plural(sum.failures, 'tool failure')}`),
    tileHtml('commits landed', `${sum.git.commits}`, `${plural(sum.git.merges, 'merge')} · ${branchNote(sum.git.repos)}`),
    tileHtml('lines changed', `<span class="add">+${count(sum.git.added)}</span> <span class="del">−${count(sum.git.removed)}</span>`, 'on the default branches'),
    ...(budget ? [tileHtml('left this week', budget.usdLeft === undefined ? '–' : `≈ ${usd(budget.usdLeft)}`,
      `${budget.percentUsed}% used${budget.usdPerPercent === undefined ? '' : ` · ${usd(budget.usdPerPercent)} per 1%`}${budget.pace ? `<br>${paceWords(budget.pace, st.to).map(esc).join('<br>')}` : ''}`)] : []),
  ].join('')
  const per = hourly ? 'per hour' : 'per day'
  const hoursOfDay = Array.from({ length: 24 }, (_, h) => ({ label: hourOf(h), title: `${hourOf(h)} to ${hourOf((h + 1) % 24)}` }))
  const charts = [
    barsHtml(`Spend ${per}`, series, measureColumns(places, series, parts, (s) => s.series.spend, usd), usdAxis, every),
    barsHtml(`Agent-hours ${per}`, series, measureColumns(places, series, parts, (s) => s.series.agentHours, hours), hoursAxis, every),
    barsHtml(`Commits landed ${per}`, all ? [{ id: STATS_ALL, label: 'every floor' }] : series,
      totalColumns(places, shown.series.commits, series, parts, (s) => s.series.commits, (v) => plural(v, 'commit')), (v) => `${Math.round(v)}`, every),
    churnHtml(`Lines ${per}`, places, shown, series, parts, every),
    ...(hourly ? [] : [barsHtml('Spend by hour of day', series, measureColumns(hoursOfDay, series, parts, (s) => s.byHour.spend, usd), usdAxis, 6)]),
  ].join('')
  const spreads = `<table class="spreads"><tr><th></th><th>min</th><th>p50</th><th>avg</th><th>p90</th><th>max</th><th>n</th></tr>
    ${spreadRow('wait on you', sum.waits, short)}${spreadRow('turn', sum.turnSeconds, short)}${spreadRow('active / session', sum.activeMinutes, (m) => short(m * 60))}</table>`
  const extensions = Object.entries(sum.git.byExtension).sort((a, b) => b[1].added + b[1].removed - (a[1].added + a[1].removed)).slice(0, 6)
  const extensionRows = extensions.length
    ? `<table class="spreads"><tr><th>lines by kind</th><th>added</th><th>removed</th></tr>${extensions
        .map(([ext, c]) => `<tr><th>${esc(ext)}</th><td class="add">+${count(c.added)}</td><td class="del">−${count(c.removed)}</td></tr>`).join('')}</table>`
    : ''
  const models = Object.entries(sum.tokens).sort((a, b) => b[1].output - a[1].output)
  const tokenRows = models.length
    ? `<table class="spreads"><tr><th>tokens</th><th>out</th><th>in</th><th>cache read</th><th>cache write</th></tr>${models
        .map(([m, t]) => `<tr><th>${esc(m.replace(/^claude-/, ''))}</th>${[t.output, t.input, t.cacheRead, t.cacheWrite].map((n) => `<td>${tokens(n)}</td>`).join('')}</tr>`)
        .join('')}</table>`
    : ''
  return `<div class="stats-panel">${head}<div class="tiles">${tiles}</div><div class="charts">${charts}</div><div class="tables">${spreads}${tokenRows}${extensionRows}</div>
    <p class="as-of">read <span data-since="${v.at}"></span> ago · waits run from a turn's end to your next prompt</p></div>`
}

/** The text boxes a panel holds, by their attribute: their text lives in the renderer, never in the html. */
export type TextBox = 'pick-text' | 'note-text'

/** What `drawPanel` last put in each element, and the panel's root it made: anything else writing the element replaces the root. */
const painted = new WeakMap<HTMLElement, { html: string; root: Element | null }>()

/**
 * Puts `html` in `el` when it differs from what `el` shows, then sets each text box to the renderer's text for it:
 * the box that had focus keeps it, and its caret, and a control that had focus keeps it (`keepingFocus`). A redraw that
 * changes nothing leaves every box as it is.
 */
export function drawPanel(el: HTMLElement, html: string, texts: Partial<Record<TextBox, string>>) {
  const had = document.activeElement
  const box = had instanceof HTMLTextAreaElement && el.contains(had) ? (Object.keys(texts) as TextBox[]).find((b) => had.hasAttribute(`data-${b}`)) : undefined
  const caret = box && [(had as HTMLTextAreaElement).selectionStart, (had as HTMLTextAreaElement).selectionEnd] as const
  keepingFocus(el, () => {
    const was = painted.get(el)
    if (was?.html !== html || was.root !== el.firstElementChild) {
      el.innerHTML = html
      painted.set(el, { html, root: el.firstElementChild })
    }
    for (const [b, text] of Object.entries(texts) as [TextBox, string][]) {
      const area = el.querySelector<HTMLTextAreaElement>(`[data-${b}]`)
      if (area && area.value !== text) area.value = text
    }
  })
  const again = box && el.querySelector<HTMLTextAreaElement>(`[data-${box}]`)
  if (!again || again === had) return
  again.focus()
  again.setSelectionRange(...caret!)
}

/**
 * Runs `write`, which may replace the html inside `el`, and gives focus back to the control that had it: the one element
 * of the same tag and the same attributes naming what it does (`data-` ones but a tip, a time or a hold, an `href`, a
 * `popovertarget`), so a keyboard keeps its place through a redraw. A control nothing names, or that two now match, loses focus.
 */
export function keepingFocus(el: HTMLElement, write: () => void) {
  const had = document.activeElement
  const id = had && had !== el && el.contains(had) ? identityOf(had) : undefined
  write()
  if (!id || id === had!.localName || el.contains(document.activeElement)) return
  const again = el.querySelectorAll<HTMLElement>(id)
  if (again.length === 1) again[0].focus({ preventScroll: true })
}

/**
 * The panels' look, under `.changes-panel`, `.reviews-panel` and `.stats-panel`: the renderer places and sizes the element
 * they're painted in.
 *
 * Also a worker's `.tab-row`: its tabs (any of them in a `.tab-set`, which lays out as if absent), an `.activity` line
 * and its `.moves`, on lines that wrap. Where the row breaks into lines, a shown tab counts as a 9em stub (room for the
 * selected one's controls, so selecting a tab with a longer title moves no break); on its line it grows toward its full
 * width, the selected one five times faster, and the activity line takes what is left. A short row first narrows the
 * shown tabs' titles, then moves the moves to a line of their own, then the shown tabs that don't fit: nothing passes
 * the row's edge. A `.shown-tab`'s first child is its `.shown-name`, capped at 16em and the only part of it that shrinks.
 */
export const panelsCss = `
.tab-row { display: flex; flex-wrap: wrap; align-items: center; }
.tab-row > *, .tab-row > .tab-set > * { flex: none; }
.tab-row > .tab-set { display: contents; }
.tab-row .shown-tab { flex: 1000 1 9em; min-width: 0; max-width: max-content; }
.tab-row .shown-tab.on { flex-grow: 5000; }
.tab-row > .activity { flex: 1 1 0; min-width: 0; }
.tab-row > .moves { display: flex; margin-left: auto; }
.shown-tab { display: inline-grid; grid-auto-flow: column; grid-template-columns: minmax(0, max-content); align-items: center; overflow: hidden; white-space: nowrap; }
.shown-tab > .shown-name { min-width: 0; max-width: 16em; overflow: hidden; text-overflow: ellipsis; }
.file-acts { display: inline-flex; gap: var(--sp-2xs); flex: none; }
.file-act { min-width: var(--control); min-height: var(--control); display: grid; place-items: center; border: 1px solid transparent; border-radius: var(--radius); padding: 0; background: none; color: var(--muted); cursor: pointer; }
.file-act:hover { color: var(--ink); border-color: var(--line); background: var(--panel); }
.reviews-panel .anchor .where .file-acts { margin-left: auto; }
.changes-panel .add, .reviews-panel .add { color: var(--added); } .changes-panel .del, .reviews-panel .del { color: var(--removed); }
.changes-panel .none, .reviews-panel .none { margin: var(--sp-s) 0; color: var(--faint); font-style: italic; }
.changes-panel .settled, .reviews-panel .settled { margin: var(--sp-s) 0 var(--sp-m); padding: var(--sp-s) var(--sp-l); border-left: 3px solid var(--quiet); color: var(--muted); }
.landing h3 { margin: var(--sp-l) 0 var(--sp-s); font-size: var(--fs-m); }
.landing h3 small, .landing p { color: var(--faint); font-weight: 400; }
.landing-edit { margin-bottom: var(--sp-l); }
.landing pre { margin: var(--sp-s) 0 0; padding: var(--sp-m); background: var(--panel-2); border: 1px solid var(--line); border-radius: var(--radius); overflow-x: auto; font: var(--fs-s)/1.45 var(--mono); }
.settled [data-landing-of] { padding: 0; border: 0; background: none; color: var(--ink); font: inherit; text-decoration: underline; cursor: pointer; }
.changes-panel code, .reviews-panel code { font: var(--fs-s) var(--mono); color: var(--ink); }
/* The head stays at the top while the diff scrolls under it, each file's header stuck just below it. */
.changes-panel { --changes-head-h: 3rem; }
.changes-head { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: var(--sp-l); height: var(--changes-head-h); box-sizing: border-box;
  padding: var(--sp-xs) 0 0; color: var(--muted); font-size: var(--fs-m); background: var(--panel); }
.changes-head b { color: var(--ink); font-variant-numeric: tabular-nums; }
.changes-head .seg { display: flex; gap: var(--sp-2xs); margin-left: auto; padding: var(--sp-2xs); border-radius: var(--radius); background: var(--sunk); }
.changes-head .seg button { margin: 0; padding: var(--sp-2xs) var(--sp-m); border: 0; border-radius: var(--radius); background: none; color: var(--muted); font: 700 var(--fs-s)/1.3 var(--ui); cursor: pointer; }
.changes-head .seg button:hover { color: var(--ink); }
.changes-head .seg button.on { background: var(--panel); color: var(--ink); box-shadow: 0 1px 2px #0003; }
.changes-head > button { margin-left: 0; }
.changes-panel .repo-head { display: flex; align-items: baseline; gap: var(--sp-m); margin: var(--sp-xl) 0 var(--sp-s); font: var(--fs-s)/1.4 var(--ui); color: var(--muted); }
.changes-panel .repo-head b { color: var(--ink); }
.changes-panel .file { margin: 0 0 var(--sp-m); border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel); scroll-margin-top: var(--changes-head-h); }
.changes-panel .file > header { position: sticky; top: var(--changes-head-h); z-index: 1; display: flex; align-items: center; gap: var(--sp-m); padding: var(--sp-s) var(--sp-l); cursor: pointer;
  background: var(--panel-2); border-radius: var(--radius) var(--radius) 0 0; font-size: var(--fs-m); }
.changes-panel .file.folded > header { border-radius: var(--radius); }
.changes-panel .file.folded > header .caret .icon { rotate: -90deg; }
.changes-panel .file > header .mark { font: 700 var(--fs-xs)/1 var(--mono); padding: var(--sp-2xs) var(--sp-xs); border-radius: var(--radius-s); color: var(--panel); background: var(--muted); }
.changes-panel .file > header .mark.added { background: var(--added); } .changes-panel .file > header .mark.deleted { background: var(--removed); }
.changes-panel .file > header .path { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--mono); font-size: var(--fs-s); }
.changes-panel .file > header .path i { color: var(--faint); font-style: normal; }
.changes-panel .file > header .n { font: var(--fs-s) var(--mono); white-space: nowrap; }
.changes-panel .file.viewed > header .path { color: var(--muted); }
.changes-panel .viewed-box { display: flex; align-items: center; gap: var(--sp-s); min-height: var(--control); padding: 0 var(--sp-m); font-size: var(--fs-s); background: none; }
.changes-panel .viewed-box .box { display: grid; place-items: center; width: 1.1em; height: 1.1em; border: 1.5px solid var(--muted); border-radius: var(--radius-s); }
.changes-panel .viewed-box .box .icon { width: .8em; height: .8em; }
.changes-panel .viewed-box[aria-checked="true"] .box { background: var(--ink); border-color: var(--ink); color: var(--panel); }
.changes-panel .file .body { overflow-x: auto; border-top: 1px solid var(--line); }
.changes-panel .file .body .none { padding: var(--sp-xs) var(--sp-l); }
.changes-panel .file table { border-collapse: collapse; width: 100%; font: var(--fs-s)/1.55 var(--mono); font-variant-ligatures: none; }
.changes-panel .file td .m { display: inline-block; width: 2ch; color: var(--muted); user-select: none; }
.changes-panel .file td { padding: 0 var(--sp-m); white-space: pre; vertical-align: top; }
.changes-panel .file td.ln { width: 1%; min-width: 3ch; text-align: right; color: var(--muted); user-select: none; }
.changes-panel .file tr.hunk td { padding: var(--sp-xs) var(--sp-m); color: var(--muted); background: color-mix(in oklab, var(--accent) 10%, var(--panel)); }
.changes-panel .file tr.plus td { background: var(--added-wash); } .changes-panel .file tr.minus td { background: var(--removed-wash); }
.changes-panel .file tr.plus td.ln { background: var(--added-gutter); } .changes-panel .file tr.minus td.ln { background: var(--removed-gutter); }
.changes-panel .file tr.plus td.ln, .changes-panel .file tr.minus td.ln, .changes-panel .file tr.plus td .m, .changes-panel .file tr.minus td .m { color: var(--ink); }
.changes-panel .file :is(tr.plus, td.plus) mark.word { background: var(--added-word); color: inherit; border-radius: 2px; }
.changes-panel .file :is(tr.minus, td.minus) mark.word { background: var(--removed-word); color: inherit; border-radius: 2px; }
.changes-panel .file tr.eof td { color: var(--faint); font-style: italic; }
.changes-panel .file td.ln[data-pick] { cursor: pointer; }
.changes-panel .file td.ln[data-pick]:hover { color: var(--ink); background: color-mix(in oklab, var(--accent) 22%, var(--panel)); }
.changes-panel .file td.ln.noted { color: var(--ink); font-weight: 700; box-shadow: inset 3px 0 var(--accent); }
.changes-panel .file tr.picked td { background: color-mix(in oklab, var(--accent) 20%, var(--panel)); }
.changes-panel .file tr.note-row td { padding: 0; white-space: normal; }
.changes-panel .file table.split { table-layout: fixed; }
.changes-panel .file table.split col.ln { width: 6ch; }
.changes-panel .file table.split td.code { white-space: pre-wrap; overflow-wrap: anywhere; padding-left: calc(2ch + var(--sp-m)); text-indent: -2ch; }
.changes-panel .file table.split td.ln { width: auto; min-width: 0; }
.changes-panel .file table.split td.ln + td.code + td.ln { border-left: 1px solid var(--line); }
.changes-panel .file table.split td.empty { background: var(--sunk); }
.changes-panel .file table.split td.plus { background: var(--added-wash); } .changes-panel .file table.split td.minus { background: var(--removed-wash); }
.changes-panel .file table.split td.ln.plus { background: var(--added-gutter); } .changes-panel .file table.split td.ln.minus { background: var(--removed-gutter); }
.changes-panel .file table.split td.ln.plus, .changes-panel .file table.split td.ln.minus, .changes-panel .file table.split td.plus .m, .changes-panel .file table.split td.minus .m { color: var(--ink); }
.changes-panel .file table.split td.eof { color: var(--faint); font-style: italic; }
.changes-panel .file table.split td.picked { background: color-mix(in oklab, var(--accent) 20%, var(--panel)); }
.changes-panel .file table.split td.ln[data-pick]:hover { color: var(--ink); background: color-mix(in oklab, var(--accent) 22%, var(--panel)); }
.changes-panel .note-box { margin: var(--sp-s) var(--sp-l) var(--sp-l); padding: var(--sp-m) var(--sp-l); border: 1px solid var(--accent); border-radius: var(--radius); background: var(--panel); font: var(--fs-m)/1.4 var(--ui); }
.changes-panel .note-box .where, .reviews-panel .composer .re-chip { display: flex; align-items: center; gap: var(--sp-s); margin-bottom: var(--sp-s); color: var(--muted); font-size: var(--fs-s); }
.changes-panel .note-box textarea, .reviews-panel .composer textarea { display: block; width: 100%; min-height: 72px; resize: vertical; padding: var(--sp-s) var(--sp-m);
  border: 1px solid var(--line-strong); border-radius: var(--radius); background: var(--panel-2); color: var(--ink); font: var(--fs-m)/1.45 var(--ui); }
.changes-panel .note-box textarea::placeholder, .reviews-panel .composer textarea::placeholder { color: var(--faint); }
.changes-panel .note-box .actions, .reviews-panel .composer .actions { display: flex; align-items: center; gap: var(--sp-s); margin-top: var(--sp-s); }
.changes-panel .note-box .actions .hint { margin-left: auto; color: var(--faint); font-size: var(--fs-xs); }
.reviews-panel .reviews-head { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; gap: var(--sp-l); padding: var(--sp-l) 0 var(--sp-m); color: var(--muted); font-size: var(--fs-m); background: var(--panel); }
.reviews-panel .reviews-head b { color: var(--ink); }
.reviews-panel .reviews-head .tag { font: var(--fs-xs) var(--mono); padding: 1px var(--sp-s); border-radius: var(--radius-pill); background: var(--panel-2); color: var(--muted); cursor: copy; }
.reviews-panel .reviews-head .send { margin-left: auto; display: flex; gap: var(--sp-xs); }
.reviews-panel .reviews-head .send b { color: inherit; }
.reviews-panel .reviews-head .send select { max-width: 200px; font: var(--fs-s) var(--ui); background: var(--panel-2); color: var(--ink); border: 1px solid var(--line-strong); border-radius: var(--radius); }
.reviews-panel .note { max-width: 980px; margin: 0 0 var(--sp-l); padding: var(--sp-m) var(--sp-l) var(--sp-l); border: 1px solid var(--line); border-left: 3px solid var(--line); border-radius: var(--radius); }
.reviews-panel .note.mine { border-left-color: var(--accent); }
.reviews-panel .note.new { border-color: var(--needs); border-left-color: var(--needs); }
.reviews-panel .note > header { display: flex; align-items: baseline; gap: var(--sp-m); margin-bottom: var(--sp-xs); font-size: var(--fs-s); color: var(--muted); }
.reviews-panel .note > header b { font: 800 var(--fs-m)/1 var(--display); letter-spacing: .04em; color: var(--ink); }
.reviews-panel .note > header .n { font: var(--fs-s) var(--mono); }
.reviews-panel .note > header .re { font: var(--fs-s) var(--mono); color: var(--accent); cursor: pointer; }
.reviews-panel .note > header button.re { margin-left: 0; padding: 0; border: none; background: none; }
.reviews-panel .reviews-head button.tag { border: none; font-weight: 400; }
.reviews-panel .note > header .new-mark { padding: 0 var(--sp-s); border-radius: var(--radius-pill); font-weight: 700; color: var(--on-needs); background: var(--needs); }
.reviews-panel .note > header button { margin-left: auto; min-height: var(--control); padding: 0 var(--sp-m); font-size: var(--fs-xs); font-weight: 400; background: none; }
.reviews-panel .note .body { font-size: var(--fs-l); line-height: 1.5; }
.reviews-panel .anchor { margin: var(--sp-s) 0; border: 1px solid var(--line); border-radius: var(--radius); }
.reviews-panel .anchor .where { display: flex; align-items: center; gap: var(--sp-m); padding: var(--sp-xs) var(--sp-m); background: var(--panel-2); border-radius: var(--radius) var(--radius) 0 0; }
.reviews-panel .anchor .where .go { display: flex; align-items: center; gap: var(--sp-m); min-width: 0; padding: 0; border: none; background: none; color: inherit; font: inherit; text-align: left; }
.reviews-panel .anchor .where .go:hover code { text-decoration: underline; }
.reviews-panel .anchor .state { padding: 0 var(--sp-s); border-radius: var(--radius-pill); font-size: var(--fs-xs); color: var(--panel); background: var(--muted); }
.reviews-panel .anchor.changed { border-color: var(--needs); } .reviews-panel .anchor.changed .state { background: var(--needs); color: var(--on-needs); }
.reviews-panel .anchor pre { display: grid; grid-template-columns: minmax(100%, max-content); margin: 0; padding: var(--sp-s) 0; overflow-x: auto; font: var(--fs-s)/1.55 var(--mono); font-variant-ligatures: none; }
.reviews-panel .anchor pre .row { min-height: 1lh; padding: 0 var(--sp-l); } .reviews-panel .anchor pre .m { display: inline-block; width: 2ch; color: var(--muted); user-select: none; }
.reviews-panel .anchor pre .plus { background: var(--added-wash); } .reviews-panel .anchor pre .minus { background: var(--removed-wash); }
.reviews-panel .anchor pre .plus .m, .reviews-panel .anchor pre .minus .m { color: var(--ink); }
${highlightCss(':is(.changes-panel, .reviews-panel)')}.reviews-panel .composer { max-width: 980px; margin-top: var(--sp-xl); }
.stats-panel { font: var(--fs-m)/1.4 var(--ui); color: var(--ink); }
.stats-panel .none { margin: var(--sp-s) 0; color: var(--faint); font-style: italic; }
.read-failed { margin: var(--sp-s) 0; padding: var(--sp-m) var(--sp-l); border-left: 3px solid var(--broken); display: flex; align-items: center; gap: var(--sp-l); flex-wrap: wrap; }
.read-failed p { margin: 0; flex: 1; min-width: 12em; }
.stats-head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-s) var(--sp-l); padding: var(--sp-l) 0 var(--sp-m); }
.stats-head .scopes, .stats-head .ranges { display: flex; flex-wrap: wrap; gap: var(--sp-xs); }
.stats-head .ranges { margin-left: auto; }
.stats-head button:not(.icon-btn) { display: inline-flex; align-items: center; gap: var(--sp-xs); padding: var(--sp-2xs) var(--sp-m); font: var(--fs-s) var(--ui); color: var(--muted); background: none;
  border: 1px solid var(--line); border-radius: var(--radius-pill); cursor: pointer; }
.stats-head button.on { color: var(--panel); background: var(--ink); border-color: var(--ink); }
.stats-head button i { width: 8px; height: 8px; border-radius: var(--radius-s); }
.stats-panel .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(128px, 1fr)); gap: var(--sp-s); margin: var(--sp-xs) 0 var(--sp-l); }
.stats-panel .tile { display: flex; flex-direction: column; padding: var(--sp-m) var(--sp-l); border-radius: var(--radius); background: var(--panel-2); }
.stats-panel .tile b { font: 700 var(--fs-2xl)/1.2 var(--ui); font-variant-numeric: tabular-nums; }
.stats-panel .tile > span { color: var(--muted); font-size: var(--fs-s); }
.stats-panel .tile small { color: var(--faint); font-size: var(--fs-xs); }
.stats-panel .charts, .stats-panel .tables { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr)); gap: 0 var(--sp-3xl); align-items: start; }
.stats-panel .chart { margin: var(--sp-xl) 0 var(--sp-s); }
.stats-panel .legend { display: flex; flex-wrap: wrap; gap: var(--sp-xs) var(--sp-l); margin: var(--sp-s) 0 0; font-size: var(--fs-s); color: var(--muted); }
.stats-panel .legend i { display: inline-block; width: 9px; height: 9px; margin-right: var(--sp-xs); border-radius: var(--radius-s); vertical-align: -1px; }
.stats-panel .plot { position: relative; height: 120px; margin: var(--sp-l) 0 var(--sp-3xl) 40px; }
.stats-panel .rule { position: absolute; left: 0; right: 0; border-top: 1px solid var(--line); }
.stats-panel .rule span { position: absolute; right: calc(100% + 6px); top: -7px; font: var(--fs-xs) var(--mono); color: var(--faint); white-space: nowrap; }
.stats-panel .columns { position: absolute; inset: 0; display: flex; gap: var(--sp-2xs); }
.stats-panel .column { position: relative; flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; }
.stats-panel .column:hover { background: color-mix(in oklab, var(--ink) 6%, transparent); }
.stats-panel .stack { display: flex; flex-direction: column-reverse; gap: var(--sp-2xs); width: 100%; max-width: 24px; height: 100%; justify-content: flex-start; }
.stats-panel .stack i { display: block; flex: none; min-height: 1px; }
.stats-panel .stack i:last-of-type { border-radius: var(--radius) var(--radius) 0 0; }
.stats-panel .churn .column { justify-content: stretch; }
.stats-panel .churn .up, .stats-panel .churn .down { display: flex; flex-direction: column; width: 100%; max-width: 24px; height: 50%; }
.stats-panel .churn .up { justify-content: flex-end; } .stats-panel .churn .down { justify-content: flex-start; }
.stats-panel .churn .up i { border-radius: var(--radius) var(--radius) 0 0; } .stats-panel .churn .down i { border-radius: 0 0 var(--radius) var(--radius); }
.stats-panel .churn .up i, .stats-panel .churn .down i { display: block; flex: none; min-height: 1px; }
.stats-panel .add { color: var(--added); } .stats-panel .del { color: var(--removed); }
.stats-panel .tick { position: absolute; top: calc(100% + 3px); font: var(--fs-xs) var(--mono); color: var(--faint); white-space: nowrap; }
.stats-panel .spreads { width: 100%; margin: var(--sp-l) 0 0; border-collapse: collapse; font-size: var(--fs-s); }
.stats-panel .spreads th, .stats-panel .spreads td { padding: var(--sp-xs); border-bottom: 1px solid var(--line); text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.stats-panel .spreads th { color: var(--muted); font-weight: 400; } .stats-panel .spreads tr > th:first-child { text-align: left; color: var(--ink); }
.stats-panel .spreads tr:first-child th { color: var(--faint); font-size: var(--fs-xs); }
.stats-panel .as-of { margin: var(--sp-l) 0 0; color: var(--faint); font-size: var(--fs-xs); }
`
