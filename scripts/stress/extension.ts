/**
 * The files of a stress extension: a manifest with `actions` commands and `tabs` card views, and a server fold that adds
 * `badges` badges and `lines` lines to every card. Pure: `stress.ts` writes them.
 */
export type Counts = { actions: number; badges: number; lines: number; tabs: number }

const VERBS = ['Deploy', 'Open PR', 'Pin', 'Rerun tests', 'Lint', 'Snapshot', 'Bisect', 'Profile', 'Share', 'Archive', 'Export log', 'Tag']
const ICONS = ['play', 'resume', 'info', 'caret', 'close']
const TABS = ['Logs', 'Tests', 'Plan', 'Metrics', 'Notes', 'Trace', 'Deps', 'Coverage']

const range = <T>(n: number, f: (i: number) => T) => Array.from({ length: n }, (_, i) => f(i))

/** `icons` gives each command a `words.icon`, cycling through the glyphs a renderer draws. */
const manifest = ({ actions, tabs }: Counts, icons: boolean) => ({
  id: 'stress',
  version: '1.0',
  title: 'Stress',
  description: 'A crowd of actions, badges, lines and tabs on every card, for checking dense regions.',
  requires: { tower: '1.120' },
  server: 'server.ts',
  client: 'client',
  folds: { card: { x: { type: 'object' }, adds: ['badges', 'lines'] } },
  commands: Object.fromEntries(
    range(actions, (i) => [`a${i}`, { module: 'stress.js', export: 'act', on: ['card'], words: { label: VERBS[i % VERBS.length], hint: `stress action ${i}`, ...(icons && { icon: ICONS[i % ICONS.length] }) } }]),
  ),
  views: Object.fromEntries(
    range(tabs, (i) => [`t${i}`, { module: 'stress.js', export: 'mount', on: ['card'], scales: ['pane'], tab: 'tab', words: { label: TABS[i % TABS.length], hint: `stress tab ${i}` } }]),
  ),
})

const server = ({ badges, lines }: Counts) => `const B = ${badges}, L = ${lines}
const BADGES = ['on call', 'flaky', 'blocked by CI', 'v2', 'needs design', 'perf', 'security', 'hotfix']
const LINES = ['migrating the billing schema', 'waiting on review from ODIN-21', 'tests green, docs pending']
export default () => ({ folds: { card: () => ({ x: {},
  badges: Array.from({ length: B }, (_, i) => ({ label: BADGES[i % BADGES.length], tone: i % 3 ? 'quiet' : 'needs', hint: 'stress badge' })),
  lines: Array.from({ length: L }, (_, i) => LINES[i % LINES.length]) }) } })
`

const client = `export const act = ({ kit }) => kit.toast('pressed')
export const tab = () => ({ text: '3' })
export const mount = (host) => { host.textContent = 'stress tab'; return { update() {}, close() {} } }
`

/** The extension's files, by path from its folder. */
export const stressFiles = (counts: Counts, icons: boolean): Record<string, string> => ({
  'extension.json': JSON.stringify(manifest(counts, icons), null, 2),
  'server.ts': server(counts),
  'client/stress.js': client,
})
