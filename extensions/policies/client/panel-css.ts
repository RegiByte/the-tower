/** The Policies panel's look, under `.policies-panel`: each policy, what needs the user, and its offers. */
export const policiesPanelCss = `
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
