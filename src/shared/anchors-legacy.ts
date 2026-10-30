/**
 * A review note's anchors among a worker's Changes, as `/panels.js` served them before 1.114: what a pick anchors, where
 * an anchor is, the lines notes mark, and the Changes panel drawing them with the note box under picked lines. Bundled
 * into `/panels.js`.
 * @deprecated since 1.114: the reviews extension's client (`/x/reviews/anchors.js`); Changes and reviews meet through
 * the `lines` subject, a card's `marks` and the `lines.acts` region. These copies go at 2.0.
 */
import type { RepoChanges } from '../changes.ts'
import type { DiffFile } from '../bridge/diff.ts'
import { esc } from './cards.ts'
import { linesSpot, pickedLines, type LinePick } from './changes-lines.ts'
import { changesPanelHtml, type PanelView, type ReadView } from './changes-panel.ts'
import { repoName } from './repos.ts'
import type { Anchor, ReviewThread } from './reviews.ts'

/** The picked rows as an anchor: the file's lines now, or a `diff` with their marks when the rows hold a removal. */
export const pickAnchor = (repos: RepoChanges[], pick: LinePick): Anchor => pickedLines(repos, pick)

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
export const anchorSpot = (repos: RepoChanges[], a: Anchor) => linesSpot(repos, a)

/** An anchor of a thread's note, by the `data-anchor` value its renderer was clicked on. */
export function anchorOf(thread: ReviewThread, value: string): Anchor | undefined {
  const [n, i] = value.split('|').map(Number)
  return thread.messages.find((m) => m.n === n)?.anchors[i]
}

/**
 * The Changes panel: `thread` is the thread whose anchors mark lines, `checkout` the one a note on picked lines is
 * added to, `user` the name it is signed with (`board.user.name`); `noting`: the worker offers `note`, so lines can be
 * picked. The rest as every Changes panel's.
 */
export type ChangesView = Omit<PanelView, 'marked' | 'pickable' | 'pickTip' | 'underPick'> & { thread: ReviewThread | undefined; user: string; noting: boolean }

const noteBoxHtml = (user: string) => (v: ReadView, cols: number) => `<tr class="note-row"><td colspan="${cols}"><div class="note-box">
    <div class="where"><code>${esc(anchorWhere(pickAnchor(v.read.repos, v.pick!)))}</code><span>on the thread of <b>${esc(v.checkout)}</b>, as ${esc(user)}</span></div>
    <textarea data-pick-text placeholder="a note on these lines (⌘⏎ adds it, Esc cancels)"></textarea>
    <div class="actions"><button class="primary" data-pick-add>Add note</button><button data-pick-cancel>Cancel</button><span class="hint">drag across line numbers or ⇧-click one to extend, within a hunk</span></div>
  </div></td></tr>`

/** What changed in a worker's repos, the lines its thread's notes anchor to marked, and the note box under picked lines. */
export const changesHtml = ({ thread, user, noting, ...v }: ChangesView) =>
  changesPanelHtml({
    ...v,
    marked: (repo, f) => new Map([...notedLines(thread, repo, f)].map(([n, notes]) => [n, [`noted in ${notes.map((k) => `n${k}`).join(', ')}`]])),
    pickable: noting,
    pickTip: 'click to note on this line, drag or ⇧-click for more',
    underPick: noteBoxHtml(user),
  })
