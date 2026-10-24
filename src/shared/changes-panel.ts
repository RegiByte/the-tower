/**
 * The Changes panel: what changed in a worker's repos, each file's diff highlighted, unified or split, the changed files
 * as a tree, and the note box under picked lines. Bundled into `/panels.js`.
 */
import type { RepoChanges } from '../changes.ts'
import type { CheckoutState } from '../bridge/reviews.ts'
import type { DiffFile, Hunk } from '../bridge/diff.ts'
import { esc, plural } from './cards.ts'
import { ICON } from './icons.ts'
import { highlightLines, highlightOpen } from './highlight.ts'
import { markRanges, wordRanges } from './words.ts'
import { langOf, repoName, type ReviewThread } from './reviews.ts'
import { VIEWER_KEYS } from './viewer.ts'
import { isCommitScope, type ChangesRead, type ChangesScope } from './changes-reads.ts'
import { anchorWhere, changedFiles, fileKey, fileRows, isFolded, isViewed, livePick, notedLines, pickAnchor, pickRange, splitRows, viewedCount, type LinePick, type Row } from './changes-lines.ts'
import { fileButtonsHtml } from './file-acts.ts'
import { failedHtml, settledHtml } from './panel-kit.ts'

/**
 * The Changes panel: `folds` are the files folded or unfolded against what their viewed mark says, by `fileKey`;
 * `thread` is the thread whose anchors mark lines, `checkout` the one a note on picked lines is added to, `user` the
 * name it is signed with (`board.user.name`). `failed` is why the last read failed, drawn while nothing is read.
 * `picking` while the pick is being dragged: its lines show picked, and the note box waits for the drop. `state`: where
 * the worker's own checkout stands (`card.checkoutState`); `noting`: the worker offers `note`, so lines can be picked.
 * `layout`: each file's diff as one column of lines, or its old side and new side by side. `scope`: what the read
 * compares, the picker's choice; on a commit no lines are picked or marked noted. `tree`: the changed files drawn as a
 * tree beside the diffs, each going to its file; `treeFolds` its folders folded, by the `data-tree-fold` they were clicked on.
 */
export type ChangesView = {
  read: ChangesRead | undefined; failed: string | undefined; folds: ReadonlySet<string>; pick: LinePick | undefined; picking: boolean; thread: ReviewThread | undefined; checkout: string; user: string
  state: CheckoutState; noting: boolean; layout: DiffLayout; scope: ChangesScope; tree: boolean; treeFolds: ReadonlySet<string>
}

/** Where a viewer's choice to show the file tree beside the diffs is kept in `tower.store`; hidden while none is. */
export const CHANGES_TREE_KEY = VIEWER_KEYS.changesTree

/** How the Changes panel draws a file's diff: one column of lines, or the old side and the new side by side. */
export type DiffLayout = 'unified' | 'split'
export const DIFF_LAYOUTS: DiffLayout[] = ['unified', 'split']
/** Where a viewer's layout is kept in `tower.store`; `unified` while none is. */
export const DIFF_LAYOUT_KEY = VIEWER_KEYS.diffLayout
export const DIFF_LAYOUT_LABEL: Record<DiffLayout, string> = { unified: 'Unified', split: 'Split' }
export const DIFF_LAYOUT_MEANS: Record<DiffLayout, string> = {
  unified: 'each diff as one column: removed lines above the lines added in their place',
  split: 'each diff side by side: the old file on the left, the new on the right',
}

/** The highlighted code of a file's rows, by its path, diff hash and whether it came with the lines before its hunks: a file is highlighted once per version of its diff. */
const highlighted = new Map<string, string[]>()
const HIGHLIGHTED_KEPT = 500

/**
 * Spans a hunk may take from the code above it: a comment, a string or a fenced block opened there. Others (Markdown's
 * emphasis on a stray `*`) are highlight.js reading past where the language stops them, at a paragraph it doesn't see.
 */
const CARRIES = /^hljs-(comment|doctag|string|subst|code|quote)\b/
/** Of those, the ones only an unmistakable mark closes (`*\/`, `-->`): highlight.js doesn't run away inside them. */
const COMMENT = /^hljs-(comment|doctag)\b/

/**
 * Whether a hunk's lines, `from` to `to` in a side's text highlighted whole, read better than the hunk alone: the spans
 * open as it starts are ones it may take from above (`CARRIES`), and they are a comment, or one of them closes within
 * it. A string or a fence opened above that runs through the hunk is as likely highlight.js misreading the code (a
 * regex in a template's `${}`) as a long one: the hunk alone is what it read before.
 */
function readsWhole(open: string[][], from: number, to: number): boolean {
  const carried = open[from]
  if (!carried.length) return true
  if (!carried.every((c) => CARRIES.test(c))) return false
  return carried.every((c) => COMMENT.test(c)) || open.slice(from + 1, to + 1).some((o) => o.length < carried.length)
}

/**
 * Each row's code as html with its syntax marked, aligned with `fileRows` (a hunk heading's is empty). Each hunk is
 * highlighted as two texts, the old side and the new, so a line reads in the code it stood in. When a file came with
 * the lines before its hunks (`withBefore`), each side is also highlighted whole, and a hunk takes its lines from that
 * where it `readsWhole`: a comment or a string opened above it is read as one. A removed line and the added line
 * `splitRows` sets beside it have the words they changed marked over the syntax (`wordRanges`).
 */
function rowCode(f: DiffFile): string[] {
  // The same diff comes with or without the lines before its hunks, as the read's budget falls: each is its own.
  const id = `${f.path}\n${f.hash}\n${f.hunks?.[0]?.before ? 'before' : ''}`
  const kept = highlighted.get(id)
  if (kept) return kept
  const lang = langOf(f.path)
  const hunks = f.hunks ?? []
  const own = (h: Hunk, mark: string) => h.lines.filter((l) => l[0] === ' ' || l[0] === mark).map((l) => l.slice(1))
  const sides = (['-', '+'] as const).map((mark) => {
    const alone = hunks.map((h) => highlightLines(own(h, mark), lang))
    if (!hunks[0]?.before) return alone
    const whole = highlightOpen(hunks.flatMap((h) => [...h.before!, ...own(h, mark)]), lang)
    let at = 0
    return hunks.map((h, i) => {
      const from = at + h.before!.length
      at = from + alone[i].length
      return readsWhole(whole.open, from, at) ? whole.lines.slice(from, at) : alone[i]
    })
  })
  const code = hunks.flatMap((h, i) => {
    const [old, now] = [sides[0][i], sides[1][i]]
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
      <span>read <span translate="no" data-since="${read.at}"></span> ago</span>${scopeHtml(read.repos, v.scope)}${layouts}<button type="button" class="tree-toggle ${v.tree ? 'on' : ''}" data-changes-tree aria-pressed="${v.tree}" data-tip="${v.tree ? 'hide' : 'show'} the changed files as a tree beside the diffs">${ICON.sidebar} Files</button><button data-changes-read>${ICON.resume} Read again</button></div>`
  const noting = v.noting && !isCommitScope(v.scope)
  const repos = isCommitScope(v.scope) ? read.repos.filter((r) => r.commits.some((c) => c.sha === r.shows)) : read.repos
  const diffs = repos.map((repo) => repoHtml({ ...v, read, noting, manyRepos: repos.filter((r) => r.files.length).length > 1, thread: isCommitScope(v.scope) ? undefined : v.thread, pick: noting ? livePick(read, v.pick) : undefined }, repo)).join('') || '<p class="none">not in a git repository</p>'
  const drawn = v.tree && files.length ? treeHtml(read, repos, v.treeFolds) : ''
  return `<div class="changes-panel ${drawn ? 'with-tree' : ''}">${settled}${head}${drawn}<div class="changes-files">${diffs}</div></div>`
}

/**
 * A folder of a repo's changed files, `name` the path it adds to its parent's, `path` its own from the repo's root: one
 * holding a lone folder and no files joins it, as `a/b`.
 */
type Folder = { name: string; path: string; folders: Folder[]; files: DiffFile[] }

function folderOf(files: DiffFile[]): Folder {
  const root: Folder = { name: '', path: '', folders: [], files: [] }
  for (const f of files) {
    let at = root
    for (const name of f.path.split('/').slice(0, -1)) {
      let next = at.folders.find((d) => d.name === name)
      if (!next) at.folders.push((next = { name, path: `${at.path}${name}/`, folders: [], files: [] }))
      at = next
    }
    at.files.push(f)
  }
  const joined = (d: Folder): Folder => {
    const folders = d.folders.map(joined).sort((a, b) => a.name.localeCompare(b.name))
    const files = d.files.toSorted((a, b) => a.path.localeCompare(b.path))
    return d.name && folders.length === 1 && !files.length ? { ...folders[0], name: `${d.name}/${folders[0].name}` } : { ...d, folders, files }
  }
  return joined(root)
}

/** A folder of the tree as `treeFolds` holds it: its repo's dir and its path from the root, the root's empty. */
const treeFoldKey = (repo: RepoChanges, path: string) => `${repo.dir}\n${path}`

/**
 * The changed files of each repo as a tree, folders first: a file goes to its section, marked viewed as its header is;
 * a folder, and each repo's root while there are more than one, fold away what they hold.
 */
function treeHtml(read: ChangesRead, repos: RepoChanges[], folds: ReadonlySet<string>) {
  const fileHtml = (repo: RepoChanges, f: DiffFile, depth: number) => {
    const viewed = isViewed(read.viewed, repo, f)
    return `<li><button class="tree-file ${viewed ? 'viewed' : ''}" style="--depth:${depth}" data-goto-file="${esc(fileKey(repo, f))}" data-tip="${esc(f.path)}${viewed ? ' · viewed' : ''}">` +
      `<span class="mark ${f.change}">${CHANGE_MARK[f.change]}</span><span class="name">${esc(f.path.split('/').pop()!)}</span>${viewed ? ICON.check : ''}</button></li>`
  }
  const inside = (repo: RepoChanges, d: Folder, depth: number): string =>
    d.folders.map((sub) => folderHtml(repo, sub, depth)).join('') + d.files.map((f) => fileHtml(repo, f, depth)).join('')
  const folderHtml = (repo: RepoChanges, d: Folder, depth: number) => {
    const key = treeFoldKey(repo, d.path)
    const open = !folds.has(key)
    return `<li class="tree-folder ${open ? '' : 'folded'}"><button class="tree-dir" style="--depth:${depth}" data-tree-fold="${esc(key)}" aria-expanded="${open}" data-tip="${esc(d.path)}">` +
      `${ICON.caret}<span class="name">${esc(d.name)}/</span></button>${open ? `<ul>${inside(repo, d, depth + 1)}</ul>` : ''}</li>`
  }
  const shown = repos.filter((r) => r.files.length)
  const repoHtml = (repo: RepoChanges) => {
    const key = treeFoldKey(repo, '')
    const open = !folds.has(key)
    const n = repo.files.length
    return `<li class="tree-repo ${open ? '' : 'folded'}"><button class="tree-root" data-tree-fold="${esc(key)}" aria-expanded="${open}" data-tip="${esc(repo.dir)}">` +
      `${ICON.caret}${ICON.repo}<span class="name">${esc(repoName(repo.dir))}</span><span class="n">${n}</span></button>${open ? `<ul>${inside(repo, folderOf(repo.files), 1)}</ul>` : ''}</li>`
  }
  return `<nav class="changes-tree" aria-label="changed files" data-keep-scroll="tree"><ul>${shown.length > 1
    ? shown.map(repoHtml).join('')
    : shown.map((repo) => inside(repo, folderOf(repo.files), 0)).join('')}</ul></nav>`
}

/**
 * The picker of what to compare: all since the base, what isn't committed, or one of the commits since the base, newest
 * first (each under its repo's name when more than one repo has some). Drawn only while there are commits: without
 * them, all is what isn't committed.
 */
function scopeHtml(repos: RepoChanges[], scope: ChangesScope) {
  const withCommits = repos.filter((r) => r.commits.length)
  if (!withCommits.length) return ''
  const option = (value: string, label: string, tip?: string) =>
    `<option value="${esc(value)}" ${value === scope ? 'selected' : ''}${tip ? ` title="${esc(tip)}"` : ''}>${esc(label)}</option>`
  const commits = withCommits.map((r) => `<optgroup label="${esc(withCommits.length > 1 ? `${repoName(r.dir)}: commits` : 'commits')}">${
    r.commits.map((c) => option(c.sha, `${c.sha.slice(0, 7)} ${c.subject}`, c.at)).join('')}</optgroup>`).join('')
  return `<select class="scope" data-changes-scope aria-label="compare" data-tip="what to compare: all since the base, what isn't committed, or one commit">${
    option('all', 'All changes')}${option('uncommitted', 'Uncommitted')}${commits}</select>`
}

/** `manyRepos`: more than one repo has files, so each file's header names its repo. */
type ReadView = ChangesView & { read: ChangesRead; manyRepos: boolean }

/** What a repo's files are counted from, as its head says it. */
function repoSince(repo: RepoChanges) {
  if (repo.shows === 'uncommitted') return '<span>uncommitted, since</span><code>HEAD</code>'
  if (repo.shows === 'all') return `<span>since</span><code>${esc(repo.against)}</code>${repo.against === 'HEAD' ? '' : `<code>${esc(repo.since.slice(0, 7))}</code>`}`
  const commit = repo.commits.find((c) => c.sha === repo.shows)!
  return `<span>commit</span><code>${esc(commit.sha.slice(0, 7))}</code><span class="subject">${esc(commit.subject)}</span>`
}

const repoHtml = (v: ReadView, repo: RepoChanges) =>
  `<div class="repo-head"><b class="eyebrow">${esc(repoName(repo.dir))}</b>${repoSince(repo)}</div>` +
  (repo.files.map((f) => fileHtml(v, repo, f)).join('') || '<p class="none">no changes</p>') +
  (repo.more ? `<p class="none">${repo.more} more untracked files not shown</p>` : '')

function fileHtml(v: ReadView, repo: RepoChanges, f: DiffFile) {
  const key = esc(fileKey(repo, f))
  const viewed = isViewed(v.read.viewed, repo, f)
  const folded = isFolded(v.read, v.folds, repo, f)
  const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/') + 1) : ''
  return `<section class="file ${viewed ? 'viewed' : ''} ${folded ? 'folded' : ''}" data-file="${key}">
    <header data-fold="${key}"><button class="icon-btn caret" data-fold="${key}" aria-expanded="${!folded}" aria-label="${esc(f.path)}">${ICON.caret}</button><span class="mark ${f.change}">${CHANGE_MARK[f.change]}</span>
      ${v.manyRepos ? `<span class="repo-chip" data-tip="${esc(repo.dir)}">${ICON.repo}${esc(repoName(repo.dir))}</span>` : ''}<span class="path">${f.from ? `<i>${esc(f.from)} → </i>` : ''}<i>${esc(dir)}</i>${esc(f.path.slice(dir.length))}</span>
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

/** Whether the reader is inside a file's diff: its section scrolled above its header, which stays stuck to the top. */
const readingInside = (file: Element) =>
  file.getBoundingClientRect().top < file.querySelector('header')!.getBoundingClientRect().top - file.clientTop - 0.5

/** Runs `write`, then scrolls the file `key` in `el` back to its header when `back` said so of the file before it. */
function scrollingFileTop(el: HTMLElement, key: string, write: () => void, back: (file: Element) => boolean) {
  const at = `[data-file="${CSS.escape(key)}"]`
  const file = el.querySelector(at)
  const inside = file && back(file)
  write()
  if (inside) el.querySelector(at)?.scrollIntoView({ block: 'start' })
}

/**
 * Runs `write`, which folds or unfolds the file `key` in the Changes panel `el` (its caret), and, when the reader was
 * inside that file's diff, scrolls the file back to its header: the next file follows it, where the scroll alone would
 * leave the reader as far down as the fold took away. `viewed` is `keepingViewedFileTop`'s call, kept for renderers
 * written against API 1.77.
 */
export function keepingFileTop(el: HTMLElement, key: string, write: () => void, viewed = false) {
  if (viewed) return keepingViewedFileTop(el, key, write)
  scrollingFileTop(el, key, write, readingInside)
}

/**
 * `keepingFileTop` for a Viewed box ticked, which folds the file: while the file tree is drawn beside the diffs, the
 * file always comes to the top, the next one right after it.
 */
export const keepingViewedFileTop = (el: HTMLElement, key: string, write: () => void) =>
  scrollingFileTop(el, key, write, (file) => !!el.querySelector('.changes-tree') || readingInside(file))
