/**
 * The Changes, Reviews, Stats and Policies panels every renderer draws: pure views from plain data to html, the logic of
 * picking lines and finding an anchor's, and one stylesheet (`panelsCss`, beside `markdownCss`: a note's words are
 * markdown). A renderer keeps the state (what it read, folds, the pick, text being written), passes it in as a view
 * model, puts the html in an element with `drawPanel` and wires the attributes below. The tower serves it as
 * `/panels.js`, bundled with the modules it gathers: `changes-reads.ts`, `changes-lines.ts` and `changes-panel.ts`,
 * `anchors-legacy.ts` (deprecated since 1.114, review notes' anchors and the note box, now the reviews extension's),
 * `reviews-panel.ts`, `stats-panel.ts`, `policies-panel.ts`, `file-acts.ts`, `panel-kit.ts` and `panels-css.ts`.
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
 *   data-resolve="<n>"         mark note `n` resolved: run the panel's `resolveAction` (/x/reviews/panel.js)
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
 *
 *   Policies
 *   data-policy-call="<json>"  run the call: a policy's Run now or Approve, an offer's Accept (`policyDoneLine` says what it did)
 *   data-policy-open="<id>"    open the policy's file, an item of the floor's `policies` collection
 *   data-offer-dismiss="<key>" dismiss the offer for this viewer, as a wait is (`dismissing`, `DISMISSED_KEY`)
 *   data-worker="<id>"         go to the worker: a run's
 *   data-copy="<text>"         copy the text (a policy's tag)
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
  type MarkedChangesView, type DiffLayout,
} from './changes-panel.ts'
export { pickAnchor, anchorWhere, notedLines, anchorSpot, anchorOf, changesHtml, type ChangesView } from './anchors-legacy.ts'
export {
  threadItemFiles, threadFiles, cardThread, floorThread, threadSlot, threadWant, heldThread, threadFailure, readThread, threadViewOf, reviewsHtml,
  type ThreadView, type ThreadFiles, type ThreadPlace, type ThreadAt, type ThreadViewer,
} from './reviews-panel.ts'
export { STATS_ALL, statsQuery, usd, hours, duration, statsHtml, type StatsRange, type StatsProject, type StatsView } from './stats-panel.ts'
export { policyZone, offerWords, policiesHtml, policyDoneLine, type PoliciesView } from './policies-panel.ts'
export { failedHtml, drawPanel, keepingFocus, keepShownTabs, type TextBox } from './panel-kit.ts'
export { panelsCss } from './panels-css.ts'
