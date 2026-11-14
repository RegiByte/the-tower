import { highlightCss } from '/lib/view.js'

/** The Reviews panel's look, under `.reviews-panel`: its head, its notes with their anchors' quoted lines, and the composer. */
export const reviewsPanelCss = `
.reviews-panel .anchor .where .file-acts { margin-left: auto; }
.reviews-panel .add { color: var(--added); } .reviews-panel .del { color: var(--removed); }
.reviews-panel .none { margin: var(--sp-s) 0; color: var(--faint); font-style: italic; }
.reviews-panel .settled { margin: var(--sp-s) 0 var(--sp-m); padding: var(--sp-s) var(--sp-l); border-left: 3px solid var(--quiet); color: var(--muted); }
.reviews-panel .settled + .filed { margin: calc(-1 * var(--sp-m)) 0 var(--sp-m); padding: 0 var(--sp-l) var(--sp-s); border-left: 3px solid var(--quiet); color: var(--muted); }
.reviews-panel code { font: var(--fs-s) var(--mono); color: var(--ink); }
.reviews-panel .composer .re-chip { display: flex; align-items: center; gap: var(--sp-s); margin-bottom: var(--sp-s); color: var(--muted); font-size: var(--fs-s); }
.reviews-panel .composer textarea { display: block; width: 100%; min-height: 72px; resize: vertical; padding: var(--sp-s) var(--sp-m);
  border: 1px solid var(--line-strong); border-radius: var(--radius); background: var(--panel-2); color: var(--ink); font: var(--fs-m)/1.45 var(--ui); }
.reviews-panel .composer textarea::placeholder { color: var(--faint); }
.reviews-panel .composer .actions { display: flex; align-items: center; gap: var(--sp-s); margin-top: var(--sp-s); }
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
.reviews-panel .note > header button[data-reply] + button[data-resolve] { margin-left: 0; }
.reviews-panel .note > header button.resolved-mark { margin-left: 0; min-height: 0; padding: 0 var(--sp-s); border: 1px solid var(--line-strong); border-radius: var(--radius-pill); color: var(--muted); cursor: pointer; }
.reviews-panel .note.resolved { border-style: dashed; border-left-style: solid; }
.reviews-panel .note.resolved .body, .reviews-panel .note.resolved .anchor { color: var(--muted); }
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
${highlightCss('.reviews-panel')}
.reviews-panel .composer { max-width: 980px; margin-top: var(--sp-xl); }
`
