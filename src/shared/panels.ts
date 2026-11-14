/**
 * The Changes and Stats panels every renderer draws: pure views from plain data to html, the logic of
 * picking lines, and one stylesheet (`panelsCss`). A renderer keeps the state (what it read, folds, the pick, text being
 * written), passes it in as a view model, puts the html in an element with `drawPanel` and wires the attributes below.
 * It gathers the modules `changes-reads.ts`, `changes-lines.ts` and
 * `changes-panel.ts`, `stats-panel.ts`, `file-acts.ts`, `panel-html.ts`, `panel-kit.ts` and `panels-css.ts`.
 *
 * The protocol a renderer wires, by the attribute on the element clicked (`closest`):
 *
 *   Changes
 *   data-changes-read          read the worker's Changes again
 *   data-changes-layout="<l>"  draw diffs unified or split side by side (`DIFF_LAYOUTS`), the viewer's, kept under `DIFF_LAYOUT_KEY`
 *   data-changes-tree          show or hide the changed files' tree beside the diffs, the viewer's, kept under `CHANGES_TREE_KEY`
 *   data-goto-file="<key>"     a file in the tree: scroll to its section (`spotSelector` with row -1)
 *   data-tree-fold="<key>"     a folder of the tree, or a repo's root: fold or unfold it, for this viewer only (`treeFolds`)
 *   data-changes-scope         what to compare (a select, drawn while the repos have commits since their base): its value
 *                              is a scope, `all`, `uncommitted` or a commit's hash; read again at `changesPath`
 *   data-landing-of="<branch>" show what landing changed on the branch, of the worker's project (`tower.landing`)
 *   data-since="<ms>"          a time: the renderer writes how long ago it was, and keeps it current; the element carries
 *                              translate="no", or a page translator fights the rewrite every second
 *   data-file="<key>"          a file's section, by `fileKey`
 *   data-fold="<key>"          fold or unfold a file, for this viewer only (the file header; its caret is the button a keyboard reaches)
 *   data-viewed="<key>"        mark the file's version viewed, or not: `marksToggled` gives the repo's marks to keep
 *                              (the redraw goes through `keepingViewedFileTop`, a fold's through `keepingFileTop`, so a reader deep in a
 *                              long file lands on the next)
 *   data-pick="<key>|<row>"    a line number: pick the line (`picked`, ⇧ to extend), or drag across lines (`watchPickDrag`,
 *                              `spanned`); also where an anchor scrolls to
 *   data-pick-acts             under the picked lines (`markedChangesHtml`): the element the renderer puts what acts on them
 *                              in, the `lines.acts` region on their `lines` subject (`pickedLines`)
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
export { markRanges, wordRanges, WORDS_ALIKE, WORDS_EDITS, WORDS_LONGEST, type CharRange } from './words.ts'
export { fileButtonsHtml, fileSpansHtml, fileCall } from './file-acts.ts'
export {
  changesPath, isCommitScope, liveScope, viewedKey, CHANGES_POLL_MS, noChanges, scopeOf, changesOf, changesFailure, changesHandlers, readChanges,
  type ChangesScope, type Viewed, type ChangesRead, type ChangesReads, type ChangesEvent, type ChangesEffect,
} from './changes-reads.ts'
export {
  fileKey, changedFiles, isViewed, isFolded, viewedCount, marksToggled, fileRows, splitRows, pickRange, picked, spanned, watchPickDrag, livePick,
  pickedLines, linesSpot, spotSelector, type LinePick, type NamedLines, type Row, type SplitRow,
} from './changes-lines.ts'
export {
  CHANGES_TREE_KEY, DIFF_LAYOUTS, DIFF_LAYOUT_KEY, DIFF_LAYOUT_LABEL, DIFF_LAYOUT_MEANS, markedChangesHtml, markedLines, keepingFileTop, keepingViewedFileTop,
  type MarkedChangesView,
} from './changes-panel.ts'
export { STATS_ALL, statsQuery, usd, hours, duration, statsHtml, type StatsProject, type StatsView } from './stats-panel.ts'
export { failedHtml } from './panel-html.ts'
export { drawPanel, keepingFocus, keepShownTabs, type TextBox } from './panel-kit.ts'
export { panelsCss } from './panels-css.ts'
