import { highlightCss } from './highlight.ts'

/**
 * The panels' look, under `.changes-panel`, `.reviews-panel` and `.stats-panel`: the renderer places and sizes the element
 * they're painted in.
 *
 * Also a worker's `.tab-row`, on one line: its tabs (any of them in a `.tab-set`, which lays out as if absent), its
 * showings' tabs in a `.shown-tabs` strip that scrolls sideways, faded at an edge past which more hide, an `.activity`
 * line down to 8em and its `.moves`. A `.shown-tab` is never wider than the strip; its first child is its `.shown-name`,
 * capped at 16em, the selected one's never under 6em beside its controls.
 */
export const panelsCss = `
.tab-row { display: flex; align-items: center; }
.tab-row > *, .tab-row > .tab-set > *, .shown-tabs > * { flex: none; }
.tab-row > .tab-set { display: contents; }
.tab-row .shown-tabs { flex: 0 1 auto; min-width: 0; display: flex; gap: var(--sp-s); overflow-x: auto; overscroll-behavior-x: contain; scrollbar-width: none;
  padding-block: 2px; margin-block: -2px; --fade: 2.5em; scroll-padding-inline: var(--fade); }
.shown-tabs::-webkit-scrollbar { display: none; }
.shown-tabs > .shown-tab { max-width: 100%; }
.shown-tabs.more-after { mask-image: linear-gradient(to right, #000 calc(100% - var(--fade)), transparent); }
.shown-tabs.more-before { mask-image: linear-gradient(to left, #000 calc(100% - var(--fade)), transparent); }
.shown-tabs.more-before.more-after { mask-image: linear-gradient(to right, transparent, #000 var(--fade), #000 calc(100% - var(--fade)), transparent); }
.tab-row > .activity { flex: 1 1 0; min-width: 8em; }
.tab-row > .moves { display: flex; margin-left: auto; }
.shown-tab { display: inline-grid; grid-auto-flow: column; grid-template-columns: minmax(0, max-content); align-items: center; overflow: hidden; white-space: nowrap; }
.shown-tab.on { grid-template-columns: minmax(6em, max-content); }
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
.changes-head select.scope { max-width: 280px; margin-left: auto; font: var(--fs-s) var(--ui); background: var(--panel-2); color: var(--ink); border: 1px solid var(--line-strong); border-radius: var(--radius); }
.changes-head select.scope + .seg { margin-left: 0; }
/* The tree beside the diffs, stuck below the head and scrolling on its own: the renderer's element sizes it, as a size container.
   Its right padding keeps an overlay scrollbar (macOS) off the checks and the separators; the gutter does for a classic one. */
/* The renderer's bottom padding would cut the tree short of the element's edge: the diffs take it instead. */
:has(> .changes-panel.with-tree) { container-type: size; padding-bottom: 0 !important; }
.changes-panel.with-tree .changes-files { padding-bottom: var(--sp-xl); }
.changes-panel.with-tree { display: grid; grid-template-columns: minmax(10rem, 16rem) minmax(0, 1fr); column-gap: var(--sp-xl); }
.changes-panel.with-tree > :not(.changes-tree, .changes-files) { grid-column: 1 / -1; }
.changes-tree { position: sticky; top: var(--changes-head-h); align-self: start; max-height: calc(100cqb - var(--changes-head-h)); overflow: auto; overscroll-behavior: contain;
  padding: var(--sp-s) var(--sp-m) var(--sp-l) 0; box-sizing: border-box; font: var(--fs-s)/1.4 var(--mono); scrollbar-width: thin; scrollbar-gutter: stable; }
.changes-tree ul { margin: 0; padding: 0; list-style: none; }
.changes-tree .tree-dir, .changes-tree .tree-file, .changes-tree .tree-root { display: flex; align-items: center; gap: var(--sp-s); width: 100%; margin: 0; border: 0; border-radius: var(--radius); background: none;
  font: inherit; text-align: left; cursor: pointer; padding: var(--sp-2xs) var(--sp-s) var(--sp-2xs) calc(var(--sp-s) + var(--depth, 0) * 1.1em); }
.changes-tree :is(.tree-dir, .tree-file, .tree-root):hover { background: var(--panel-2); }
.changes-tree :is(.tree-dir, .tree-root) > .icon { flex: none; width: .9em; height: .9em; color: var(--faint); }
.changes-tree .folded > :is(.tree-dir, .tree-root) > .icon:first-child { rotate: -90deg; }
.changes-tree .tree-dir { color: var(--muted); }
.changes-tree .tree-dir .name { min-width: 0; overflow-wrap: anywhere; }
.changes-tree .tree-repo + .tree-repo { margin-top: var(--sp-m); padding-top: var(--sp-m); border-top: 1px solid var(--line); }
.changes-tree .tree-root { color: var(--ink); font: 700 var(--fs-m)/1.4 var(--ui); }
.changes-tree .tree-root > .icon + .icon { color: var(--muted); }
.changes-tree .tree-root .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.changes-tree .tree-root .n { color: var(--faint); font-weight: 400; font-variant-numeric: tabular-nums; }
.changes-tree .tree-file { color: var(--ink); }
.changes-tree .tree-file .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.changes-tree .tree-file.viewed { color: var(--muted); }
.changes-tree .tree-file .icon { flex: none; width: .9em; height: .9em; }
.changes-tree .mark { flex: none; font: 700 var(--fs-xs)/1 var(--mono); padding: var(--sp-2xs) var(--sp-xs); border-radius: var(--radius-s); color: var(--panel); background: var(--muted); }
.changes-tree .mark.added { background: var(--added); } .changes-tree .mark.deleted { background: var(--removed); }
.changes-head .tree-toggle { display: inline-flex; align-items: center; gap: var(--sp-xs); }
.changes-head .tree-toggle.on { color: var(--ink); border-color: var(--line-strong); background: var(--sunk); }
.changes-panel .repo-head { display: flex; align-items: baseline; gap: var(--sp-m); margin: var(--sp-xl) 0 var(--sp-s); font: var(--fs-s)/1.4 var(--ui); color: var(--muted); }
.changes-panel .repo-head b { color: var(--ink); }
.changes-panel .repo-head .subject { min-width: 0; overflow: hidden; color: var(--ink); text-overflow: ellipsis; white-space: nowrap; }
.changes-panel .file { margin: 0 0 var(--sp-m); border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel); scroll-margin-top: var(--changes-head-h); }
.changes-panel .file > header { position: sticky; top: var(--changes-head-h); z-index: 1; display: flex; align-items: center; gap: var(--sp-m); padding: var(--sp-s) var(--sp-l); cursor: pointer;
  background: var(--panel-2); border-radius: var(--radius) var(--radius) 0 0; font-size: var(--fs-m); }
.changes-panel .file.folded > header { border-radius: var(--radius); }
.changes-panel .file.folded > header .caret .icon { rotate: -90deg; }
.changes-panel .file > header .mark { font: 700 var(--fs-xs)/1 var(--mono); padding: var(--sp-2xs) var(--sp-xs); border-radius: var(--radius-s); color: var(--panel); background: var(--muted); }
.changes-panel .file > header .mark.added { background: var(--added); } .changes-panel .file > header .mark.deleted { background: var(--removed); }
.changes-panel .file > header .repo-chip { flex: none; display: inline-flex; align-items: center; gap: var(--sp-2xs); padding: var(--sp-2xs) var(--sp-s); border: 1px solid var(--line); border-radius: var(--radius-s);
  color: var(--muted); font: 700 var(--fs-xs)/1.2 var(--ui); }
.changes-panel .file > header .repo-chip .icon { width: .9em; height: .9em; }
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
.reviews-panel .note.new { border-color: var(--accent); border-left-color: var(--accent); }
.reviews-panel .note > header { display: flex; align-items: baseline; gap: var(--sp-m); margin-bottom: var(--sp-xs); font-size: var(--fs-s); color: var(--muted); }
.reviews-panel .note > header b { font: 800 var(--fs-m)/1 var(--display); letter-spacing: .04em; color: var(--ink); }
.reviews-panel .note > header .n { font: var(--fs-s) var(--mono); }
.reviews-panel .note > header .re { font: var(--fs-s) var(--mono); color: var(--accent); cursor: pointer; }
.reviews-panel .note > header button.re { margin-left: 0; padding: 0; border: none; background: none; }
.reviews-panel .reviews-head button.tag { border: none; font-weight: 400; }
.reviews-panel .note > header .new-mark { padding: 0 var(--sp-s); border-radius: var(--radius-pill); font-weight: 700; color: var(--panel); background: var(--accent); }
.reviews-panel .note > header button { margin-left: auto; min-height: var(--control); padding: 0 var(--sp-m); font-size: var(--fs-xs); font-weight: 400; background: none; }
.reviews-panel .note .body { font-size: var(--fs-l); line-height: 1.5; }
.reviews-panel .anchor { margin: var(--sp-s) 0; border: 1px solid var(--line); border-radius: var(--radius); }
.reviews-panel .anchor .where { display: flex; align-items: center; gap: var(--sp-m); padding: var(--sp-xs) var(--sp-m); background: var(--panel-2); border-radius: var(--radius) var(--radius) 0 0; }
.reviews-panel .anchor .where .go { display: flex; align-items: center; gap: var(--sp-m); min-width: 0; padding: 0; border: none; background: none; color: inherit; font: inherit; text-align: left; }
.reviews-panel .anchor .where .go:hover code { text-decoration: underline; }
.reviews-panel .anchor .state { padding: 0 var(--sp-s); border-radius: var(--radius-pill); font-size: var(--fs-xs); color: var(--panel); background: var(--muted); }
.reviews-panel .anchor.changed { border-color: var(--accent); } .reviews-panel .anchor.changed .state { background: var(--accent); }
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
.policies-panel { font: var(--fs-m)/1.45 var(--ui); color: var(--ink); }
.policies-panel section { margin: 0 0 var(--sp-xl); }
.policies-panel h3 { margin: var(--sp-l) 0 var(--sp-s); color: var(--muted); font: 700 var(--fs-xs)/1.3 var(--ui); letter-spacing: .08em; text-transform: uppercase; }
.policies-panel .none { margin: var(--sp-s) 0; color: var(--faint); font-style: italic; }
.policies-panel code { font: var(--fs-s) var(--mono); }
.policies-panel .policy, .policies-panel .need { margin: 0 0 var(--sp-m); padding: var(--sp-m) var(--sp-l); border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel); }
.policies-panel .need { border-left: 3px solid var(--accent); }
.policies-panel .policy.invalid { border-left: 3px solid var(--broken); }
.policies-panel header { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-s); }
.policies-panel button.title { padding: 0; border: 0; background: none; color: var(--ink); font: 700 var(--fs-l)/1.3 var(--ui); cursor: pointer; text-align: left; }
.policies-panel button.title:hover { text-decoration: underline; }
.policies-panel .tag { padding: 1px var(--sp-s); border: 0; border-radius: var(--radius-pill); background: var(--panel-2); color: var(--muted); font: var(--fs-xs) var(--mono); cursor: copy; }
.policies-panel .acts { display: flex; align-items: center; gap: var(--sp-s); margin-left: auto; }
.policies-panel p { margin: var(--sp-xs) 0 0; }
.policies-panel .rule { color: var(--ink); }
.policies-panel .now { color: var(--muted); }
.policies-panel .need p { color: var(--muted); }
.policies-panel .facts { display: flex; flex-wrap: wrap; gap: var(--sp-xs) var(--sp-l); color: var(--faint); font-size: var(--fs-s); }
.policies-panel .unapproved { color: var(--needs-text); }
.policies-panel .worker { padding: 0; border: 0; background: none; color: var(--accent); font: inherit; cursor: pointer; }
.policies-panel .worker:hover { text-decoration: underline; }
.policies-panel .problems { margin: var(--sp-s) 0 0; padding-left: var(--sp-xl); color: var(--broken-text); font-size: var(--fs-s); }
.policies-panel .problems code { color: var(--ink); }
.policies-panel .offer { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-s) var(--sp-m); margin: 0 0 var(--sp-s); padding: var(--sp-s) var(--sp-l); border: 1px solid var(--accent); border-radius: var(--radius); background: var(--panel); }
.policies-panel .offer.dismissed { border-color: var(--line); }
.policies-panel .offer .lamp { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); }
.policies-panel .offer .when { color: var(--muted); }
.policies-panel .offer small { color: var(--faint); font-size: var(--fs-xs); }
`
