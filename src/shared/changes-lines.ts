/**
 * The lines of a worker's Changes: each file's rows, unified and side by side, which files are viewed, lines picked,
 * and where lines named by repo, path and number stand among them. Bundled into `/panels.js`.
 */
import type { RepoChanges } from '../changes.ts'
import type { DiffFile, Hunk } from '../bridge/diff.ts'
import { langOf, repoName } from './repos.ts'
import type { ChangesRead, Viewed } from './changes-reads.ts'

/**
 * Picked rows of one file's diff, `from` where the pick started and `to` where it ends, either way round, within one
 * hunk, at the version of the file's diff `hash` names: rows count only in that version.
 */
export type LinePick = { key: string; hash: string; from: number; to: number }

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

/** A repo's marks with `f`'s flipped, keeping only files still changed: what to store under its `viewedKey`. */
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

/**
 * Lines of a worker's changes by repo, path and number: `repo` named as the Changes name it (`repoName`), `from`–`to`
 * the file's lines from 1, `quote` the lines as they read, a `diff` with git's marks when they hold a removal.
 */
export type NamedLines = { repo: string; path: string; from: number; to: number; quote: { lang: string; lines: string[] } }

/** The picked rows as lines: the file's lines now, or a `diff` with their marks when the rows hold a removal. @since 1.114 */
export function pickedLines(repos: RepoChanges[], pick: LinePick): NamedLines {
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

/**
 * Where lines' first line is in the Changes: its file, and the row holding the line now (else on the old side; -1 when
 * the diff doesn't show it). Undefined when its file has no changes now. @since 1.114
 */
export function linesSpot(repos: RepoChanges[], lines: Pick<NamedLines, 'repo' | 'path' | 'from'>) {
  const found = changedFiles(repos).find(([repo, f]) => repoName(repo.dir) === lines.repo && f.path === lines.path)
  if (!found) return undefined
  const [repo, file] = found
  const rows = fileRows(file)
  const at = rows.findIndex((r) => !r.hunk && r.now === lines.from)
  return { repo, file, key: fileKey(repo, file), row: at === -1 ? rows.findIndex((r) => !r.hunk && r.old === lines.from) : at }
}

/** The element a spot scrolls to: its line number, else its file. */
export const spotSelector = (spot: { key: string; row: number }) =>
  spot.row === -1 ? `[data-file="${CSS.escape(spot.key)}"]` : `[data-pick="${CSS.escape(`${spot.key}|${spot.row}`)}"]`
