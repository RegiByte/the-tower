/**
 * The tower's visual language as data: one source for every renderer. The tower serves it as `/design.css`
 * (variables and fonts) and as the module `/design.js`; Tower 3D bundles it.
 *
 * Paper and ink for chrome; colour is attention. Each scheme fills the same roles: `ink` is text, `enamel` the dark
 * surfaces (terminals, buildings) in both. Text comes in three tiers, `ink`, `muted` and `faint`, each at least 4.5:1
 * on wall, panel and panel-2; `deco` is faint's tone for what is never read (carets, dividers, a missing project
 * colour). `line` divides; `lineStrong` edges a form field, 3:1 on panel; `pEdgeMix` is how much of a project's colour
 * (the rest ink) marks its focus ring and selected edge, 3:1 on panel-2. The five attention colours are named after the
 * board's `Attention`, so `palettes[scheme][card.attention]` is a card's colour, as a fill; its `<attention>Text` is the
 * same hue readable as text on paper, and its `on<Attention>` the text set on it. `added` and `removed` mark a diff's
 * lines: as text and marks on paper, and as a `wash` behind an added or removed line's code, a deeper `gutter` behind
 * its numbers. The `syn*` colours mark code's syntax, each readable on paper and on both washes. `npm run
 * tool:contrast` measures every pair the renderers draw.
 */
export const palettes = {
  light: {
    wall: '#d9d3bd',
    panel: '#e9e2cc',
    panel2: '#dfd7bf',
    sunk: '#d3c9ae',
    line: '#c4b89c',
    lineStrong: '#817966',
    pEdgeMix: '50%',
    ink: '#28322f',
    muted: '#4c483c',
    faint: '#615b49',
    deco: '#91886f',
    accent: '#2f647c',
    enamel: '#28322f',
    enamel2: '#36423e',
    needs: '#d4413b',
    ready: '#5aa872',
    working: '#e0921a',
    quiet: '#99a197',
    broken: '#7a3530',
    needsText: '#a9302d',
    readyText: '#356845',
    workingText: '#82530a',
    brokenText: '#7a3530',
    onNeeds: '#ffffff',
    onReady: '#28322f',
    onWorking: '#28322f',
    onQuiet: '#28322f',
    onBroken: '#ffffff',
    added: '#386938',
    removed: '#a03e35',
    addedWash: '#d2e6bf',
    removedWash: '#f3d2c6',
    addedGutter: '#b9d8a2',
    removedGutter: '#ebb9a9',
    synKeyword: '#7e2f83',
    synString: '#245c35',
    synNumber: '#8a420e',
    synComment: '#635d4b',
    synTitle: '#17507a',
    synType: '#6b4f00',
    synAttr: '#255d70',
    synRegexp: '#912a50',
    shadow: '0 1px 0 #0000000d, 0 6px 16px -10px #28322f66',
    shadowPop: '0 20px 50px -20px #1d262988',
    backdrop: '#1f262866',
  },
  dark: {
    wall: '#1b2321',
    panel: '#232d2a',
    panel2: '#2b3632',
    sunk: '#19201e',
    line: '#36423e',
    lineStrong: '#767e7b',
    pEdgeMix: '100%',
    ink: '#ebe3cd',
    muted: '#beb6a0',
    faint: '#a19b8a',
    deco: '#746f61',
    accent: '#86b9cc',
    enamel: '#131917',
    enamel2: '#28322f',
    needs: '#ee5a5a',
    ready: '#6fbf8a',
    working: '#e9a13a',
    quiet: '#8e9891',
    broken: '#b65c54',
    needsText: '#f47672',
    readyText: '#6fbf8a',
    workingText: '#e9a13a',
    brokenText: '#d48880',
    onNeeds: '#131917',
    onReady: '#131917',
    onWorking: '#131917',
    onQuiet: '#131917',
    onBroken: '#ffffff',
    added: '#80b77c',
    removed: '#e28076',
    addedWash: '#29432f',
    removedWash: '#4a2e2c',
    addedGutter: '#304f36',
    removedGutter: '#663a36',
    synKeyword: '#dba8e8',
    synString: '#acd58f',
    synNumber: '#f0ab73',
    synComment: '#aea792',
    synTitle: '#8ec7ec',
    synType: '#e8c67f',
    synAttr: '#8fc3d6',
    synRegexp: '#f39ab2',
    shadow: '0 1px 0 #00000033, 0 6px 16px -10px #000000aa',
    shadowPop: '0 20px 50px -20px #000000cc',
    backdrop: '#0000008c',
  },
}

export type Scheme = keyof typeof palettes

/** Text set on an attention colour in the light scheme, as a word. @deprecated read `palettes[scheme].on<Attention>`. */
export const onAttention = { needs: 'white', ready: 'enamel', working: 'enamel', quiet: 'enamel', broken: 'white' } as const

/**
 * A project's colour from config (picked for dark backgrounds) made readable on paper: `band` is the colour itself,
 * `text` and `wash` its mixes with ink and panel, in percent of the project colour. A floor sign is a plate of
 * `plate` on panel, edged in `plateEdge` on panel, its name in `plateText` on ink.
 */
export const projectMix = { text: 58, wash: 14, plate: 16, plateEdge: 45, plateText: 45 }

const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const gamma = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055)

const toOklab = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => linear(parseInt(hex.slice(i, i + 2), 16) / 255))
  const [l, m, s] = [
    0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b,
    0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b,
    0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b,
  ].map(Math.cbrt)
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
}

const fromOklab = ([L, A, B]: number[]) => {
  const [l, m, s] = [L + 0.3963377774 * A + 0.2158037573 * B, L - 0.1055613458 * A - 0.0638541728 * B, L - 0.0894841775 * A - 1.291485548 * B].map((v) => v ** 3)
  const rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s]
  return `#${rgb.map((c) => Math.round(Math.min(1, Math.max(0, gamma(c))) * 255).toString(16).padStart(2, '0')).join('')}`
}

/** `color-mix(in oklab, a percent%, b)` of two `#rrggbb` colours, for surfaces that can't take CSS (canvas, WebGL). */
export const mixOklab = (a: string, percent: number, b: string) => {
  const [p, q] = [toOklab(a), toOklab(b)]
  return fromOklab(p.map((v, i) => q[i] + (v - q[i]) * (percent / 100)))
}

/** A project's tones in a scheme from its `#rrggbb` colour, as `projectMix` gives them to pages through `color-mix`. */
export function projectTones(color: string, scheme: Scheme) {
  const { panel, ink } = palettes[scheme]
  return {
    band: color,
    text: mixOklab(color, projectMix.text, ink),
    wash: mixOklab(color, projectMix.wash, panel),
    plate: mixOklab(color, projectMix.plate, panel),
    plateEdge: mixOklab(color, projectMix.plateEdge, panel),
    plateText: mixOklab(color, projectMix.plateText, ink),
  }
}

export const type = {
  display: "'Overpass', system-ui, sans-serif",
  ui: "'Atkinson Hyperlegible', system-ui, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, Menlo, monospace",
}

export const shape = { radius: '4px' }

/** Overpass draws `·` with almost no advance, so it eats the space after it: the next face in the stack draws it. */
const OVERPASS_RANGE = 'U+0000-00B6, U+00B8-10FFFF'

/** Latin subsets of the @fontsource packages, served at `/fonts/<file>`. All three faces are SIL OFL. */
export const fonts: { family: string; weight: number; pkg: string; file: string; range?: string }[] = [
  { family: 'Overpass', weight: 800, pkg: 'overpass', file: 'overpass-latin-800-normal.woff2', range: OVERPASS_RANGE },
  { family: 'Overpass', weight: 900, pkg: 'overpass', file: 'overpass-latin-900-normal.woff2', range: OVERPASS_RANGE },
  { family: 'Atkinson Hyperlegible', weight: 400, pkg: 'atkinson-hyperlegible', file: 'atkinson-hyperlegible-latin-400-normal.woff2' },
  { family: 'Atkinson Hyperlegible', weight: 700, pkg: 'atkinson-hyperlegible', file: 'atkinson-hyperlegible-latin-700-normal.woff2' },
  { family: 'JetBrains Mono', weight: 400, pkg: 'jetbrains-mono', file: 'jetbrains-mono-latin-400-normal.woff2' },
  { family: 'JetBrains Mono', weight: 700, pkg: 'jetbrains-mono', file: 'jetbrains-mono-latin-700-normal.woff2' },
]

const ANSI = {
  foreground: '#e6e4dc',
  cursor: '#e6e4dc',
  selectionBackground: '#35708a80',
  black: '#2c3537',
  red: '#e5676b',
  green: '#8fc79a',
  yellow: '#e8b45a',
  blue: '#6aa6c4',
  magenta: '#c08fc9',
  cyan: '#6fc1bb',
  white: '#d8d4c8',
  brightBlack: '#7d8682',
  brightRed: '#f08a8c',
  brightGreen: '#a9d9b2',
  brightYellow: '#f2c879',
  brightBlue: '#8cc0da',
  brightMagenta: '#d4a9dc',
  brightCyan: '#93d6cf',
  brightWhite: '#f6f3ea',
}

/** An xterm.js `ITheme`: the terminal is a block of the scheme's enamel, its ANSI colours warmed to sit beside paper. */
export const terminalTheme = (scheme: Scheme) => ({ ...ANSI, background: palettes[scheme].enamel, cursorAccent: palettes[scheme].enamel })

/**
 * The sky through the day, by the viewer's clock: the gradient top to horizon, the strength of the sun, how many
 * stars show and how many city windows are lit (0–1). Hours ascend from 0 to 24.
 */
const SKY = [
  { at: 0, top: '#04060d', mid: '#0c1430', horizon: '#2a2350', light: 1, stars: 1, windows: 0.5 },
  { at: 5.5, top: '#0b1230', mid: '#2a2f5c', horizon: '#7a4a6a', light: 1.1, stars: 0.7, windows: 0.45 },
  { at: 7, top: '#2e5c9a', mid: '#e6926a', horizon: '#ffc58a', light: 1.6, stars: 0, windows: 0.2 },
  { at: 12, top: '#3b7bd4', mid: '#7fb2ec', horizon: '#cfe3f5', light: 2, stars: 0, windows: 0.06 },
  { at: 17.5, top: '#355b9e', mid: '#d98a5b', horizon: '#ffb36b', light: 1.7, stars: 0, windows: 0.15 },
  { at: 19, top: '#1a2350', mid: '#5a3a6e', horizon: '#d0686a', light: 1.2, stars: 0.4, windows: 0.4 },
  { at: 20.5, top: '#04060d', mid: '#0c1430', horizon: '#2a2350', light: 1, stars: 1, windows: 0.5 },
  { at: 24, top: '#04060d', mid: '#0c1430', horizon: '#2a2350', light: 1, stars: 1, windows: 0.5 },
]

export type Sky = Omit<(typeof SKY)[number], 'at'>

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

const mixHex = (a: string, b: string, k: number) => {
  const to = channels(b)
  return `#${channels(a).map((c, i) => Math.round(c + (to[i] - c) * k).toString(16).padStart(2, '0')).join('')}`
}

/** The sky at `hours` (0 ≤ hours < 24), between the two keyframes around it. */
export function skyAt(hours: number): Sky {
  const i = SKY.findIndex((key) => key.at > hours) - 1
  const [a, b] = [SKY[i], SKY[i + 1]]
  const k = (hours - a.at) / (b.at - a.at)
  const num = (n: 'light' | 'stars' | 'windows') => a[n] + (b[n] - a[n]) * k
  return {
    top: mixHex(a.top, b.top, k),
    mid: mixHex(a.mid, b.mid, k),
    horizon: mixHex(a.horizon, b.horizon, k),
    light: num('light'),
    stars: num('stars'),
    windows: num('windows'),
  }
}

const kebab = (name: string) => name.replace(/[A-Z0-9]/g, (c) => `-${c.toLowerCase()}`)

const variables = (tokens: Record<string, string>) => Object.entries(tokens).map(([name, value]) => `--${kebab(name)}: ${value};`).join('\n  ')

/** A rendered markdown document in a frame of its own (a shelf's file, a brief): the page links `/design.css` too. */
export const documentCss = `html { scrollbar-width: thin; scrollbar-color: var(--line) transparent; }
body { margin: 0; background: var(--panel); color: var(--ink); font: 16px/1.65 var(--ui); -webkit-font-smoothing: antialiased; }
article { max-width: 860px; margin: 0 auto; padding: 28px 36px 80px; }
h1, h2, h3 { font-family: var(--display); font-weight: 800; line-height: 1.2; margin: 1.6em 0 .6em; } h1 { font-size: 1.8em; } h3 { font-size: 1.1em; }
h2 { font-size: 1.3em; border-bottom: 1px solid var(--line); padding-bottom: .3em; }
a { color: var(--accent); } li { margin: .2em 0; } article img { max-width: 100%; height: auto; } hr { border: 0; border-top: 1px solid var(--line); margin: 2em 0; }
code { font: .86em var(--mono); background: var(--panel-2); padding: .1em .35em; border-radius: 4px; }
pre { background: var(--enamel); color: var(--term-fg); border-radius: var(--radius); padding: 12px 14px; overflow: auto; } pre code { background: none; padding: 0; color: inherit; }
blockquote { margin: 0; padding: 0 1em; border-left: 3px solid var(--line); color: var(--muted); }
table { border-collapse: collapse; } th, td { border: 1px solid var(--line); padding: 4px 10px; } th { background: var(--panel-2); }`

/**
 * The components every renderer draws the same way, by class: an attention class (`needs`, `ready`, `working`,
 * `quiet`, `broken`) sets `--c`, the text colour on it, `--on`, and its tone as text on paper, `--c-text`; a lamp,
 * pill, chip and meter read them. A floor sign takes its project colour as `--p`. A meter's `s` is a tick on its track.
 * Only a needs lamp blinks, and a `watching` one breathes; with reduced motion, every animation runs once.
 */
const COMPONENTS = `
.needs { --c: var(--needs); --on: var(--on-needs); --c-text: var(--needs-text); } .ready { --c: var(--ready); --on: var(--on-ready); --c-text: var(--ready-text); }
.working { --c: var(--working); --on: var(--on-working); --c-text: var(--working-text); }
.quiet { --c: var(--quiet); --on: var(--on-quiet); --c-text: var(--muted); } .broken { --c: var(--broken); --on: var(--on-broken); --c-text: var(--broken-text); }
.lamp { display: inline-block; width: 9px; height: 9px; border-radius: 50%; flex: none; background: var(--c); }
.needs .lamp, .lamp.needs { animation: blink 1.1s steps(2, jump-none) infinite; }
@keyframes blink { 50% { opacity: .25; } }
.watching .lamp, .lamp.watching { animation: breathe 2.8s ease-in-out infinite; }
@keyframes breathe { 50% { opacity: .35; } }
.pill { display: inline-flex; align-items: center; gap: 6px; padding: 2px 10px 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 700;
  white-space: nowrap; background: var(--c); color: var(--on); }
.pill .lamp { background: var(--on); }
.chip { display: inline-flex; align-items: center; gap: 6px; padding: 2px 9px 2px 7px; border-radius: 999px; font-size: 12px; font-weight: 700;
  background: var(--panel-2); white-space: nowrap; }
.chip b { font-variant-numeric: tabular-nums; }
.chip.some { background: var(--c); color: var(--on); }
.chip.some .lamp { background: var(--on); }
.chip:not(.some) .lamp { animation: none; }
@media (prefers-reduced-motion: reduce) { *, ::before, ::after { animation-iteration-count: 1 !important; } }
.meter { position: relative; height: 6px; border-radius: 999px; background: var(--sunk); }
.meter i { display: block; max-width: 100%; height: 100%; border-radius: inherit; background: var(--fill, var(--ink)); }
.meter s { position: absolute; top: -3px; bottom: -3px; width: 2px; margin-left: -1px; border-radius: 1px; background: var(--ink); box-shadow: 0 0 0 1px var(--panel); }
.sign { --pp: var(--p, var(--deco)); display: flex; align-items: center; gap: 9px; padding: 6px 6px 6px 13px; border-radius: var(--radius);
  background: color-mix(in oklab, var(--pp) var(--p-plate-mix), var(--panel)); border: 1px solid color-mix(in oklab, var(--pp) var(--p-plate-edge-mix), var(--panel));
  color: color-mix(in oklab, var(--pp) var(--p-plate-text-mix), var(--ink)); box-shadow: inset 5px 0 0 var(--pp); }
.sign .num { display: grid; place-items: center; min-width: 26px; height: 22px; padding: 0 4px; border-radius: 3px; background: var(--pp);
  color: var(--enamel); font: 900 14px/1 var(--display); font-variant-numeric: tabular-nums; }
.sign .name { font: 800 14px/1 var(--display); text-transform: uppercase; letter-spacing: .06em; padding-top: 2px; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis; }
.spawn-form { --pp: var(--p, var(--accent)); --pe: color-mix(in oklab, var(--pp) var(--p-edge-mix), var(--ink)); display: grid; grid-template-rows: auto minmax(0, 1fr) auto; width: min(1000px, calc(100vw - 32px));
  height: min(680px, calc(100vh - 48px)); color: var(--ink); font: 14px/1.45 var(--ui); }
.spawn-form header { display: flex; align-items: center; gap: 14px; padding: 14px 20px; border-bottom: 1px solid var(--line); }
.spawn-form header .sign { flex: none; }
.spawn-form h2 { margin: 0; font: 800 16px/1 var(--display); text-transform: uppercase; letter-spacing: .06em; padding-top: 2px; }
.spawn-form .draft { margin-left: auto; color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.spawn-form .draft b { color: var(--ink); }
.spawn-form .cols { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); min-height: 0; }
.spawn-form .task { display: flex; flex-direction: column; gap: 8px; padding: 18px 20px; border-right: 1px solid var(--line); min-height: 0; }
.spawn-form .setup { display: grid; align-content: start; gap: 18px; padding: 18px 20px; overflow: auto; }
.spawn-form fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }
.spawn-form legend { padding: 0; margin-bottom: 8px; }
.spawn-form .lbl { display: flex; align-items: baseline; gap: 8px; color: var(--muted); font: 800 11px/1 var(--display); letter-spacing: .1em; text-transform: uppercase; }
.spawn-form .lbl i { font: italic 500 11px/1 var(--ui); letter-spacing: 0; text-transform: none; color: var(--faint); }
.spawn-form input:not([type=radio]), .spawn-form select, .spawn-form textarea { width: 100%; font: inherit; color: var(--ink); background: var(--panel-2);
  border: 1px solid var(--line-strong); border-radius: var(--radius); padding: 7px 9px; min-width: 0; }
.spawn-form :is(input:not([type=radio]), select, textarea):focus-visible { outline: 2px solid var(--pe); outline-offset: -1px; }
.spawn-form input[type=radio]:focus-visible { outline: 2px solid var(--pe); outline-offset: 2px; border-radius: 50%; }
.spawn-form ::placeholder { color: var(--faint); font-style: italic; }
.spawn-form textarea { flex: 1; resize: none; font: 14px/1.55 var(--ui); padding: 12px 14px; }
.spawn-form input:invalid { border-color: var(--broken-text); }
.spawn-form .where { display: grid; gap: 6px; }
.spawn-form .choice { display: grid; grid-template-columns: auto 1fr auto; column-gap: 10px; row-gap: 2px; align-items: baseline; padding: 9px 12px;
  border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel-2); cursor: pointer; transition: border-color .15s ease-out, background .15s ease-out; }
.spawn-form .choice:hover { border-color: var(--deco); }
.spawn-form .choice small { grid-column: 2 / -1; color: var(--muted); font-size: 12px; }
.spawn-form .choice .aside { color: var(--faint); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; }
.spawn-form .choice:has(:checked) { border-color: var(--pe); background: color-mix(in oklab, var(--pp) 12%, var(--panel-2)); box-shadow: inset 4px 0 0 var(--pp); }
.spawn-form .choice:has(:disabled) { opacity: .55; cursor: default; }
.spawn-form .choice:has(:disabled) .aside { text-transform: none; letter-spacing: 0; font-weight: 500; }
.spawn-form input[type=radio] { accent-color: var(--pp); margin: 0; translate: 0 2px; }
.spawn-form .fields { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.spawn-form .fields > legend { grid-column: 1 / -1; }
.spawn-form .fields label { display: grid; gap: 6px; }
.spawn-form .fields .wide { grid-column: 1 / -1; }
.spawn-form .picks { display: grid; gap: 4px; max-height: 190px; overflow: auto; }
.spawn-form .pick { display: flex; align-items: baseline; gap: 10px; padding: 6px 10px; border-radius: var(--radius); cursor: pointer; }
.spawn-form .pick:hover { background: var(--panel-2); }
.spawn-form .pick:has(:checked) { background: color-mix(in oklab, var(--pp) 12%, var(--panel-2)); }
.spawn-form .pick span { color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.spawn-form .pick .st { margin-left: auto; }
.spawn-form .pick .st.at-risk { color: var(--needs-text); }
.spawn-form .pick .st.live { color: var(--working-text); }
.spawn-form .if-new, .spawn-form .if-worktree, .spawn-form .if-main { display: none; margin-top: -6px; padding-left: 14px; border-left: 2px solid color-mix(in oklab, var(--pp) 45%, transparent); }
.spawn-form:has([name=where][value=new]:checked) .if-new, .spawn-form:has([name=where][value=worktree]:checked) .if-worktree,
  .spawn-form:has([name=where][value=main]:checked) .if-main { display: grid; }
.spawn-form footer { display: flex; align-items: center; gap: 8px; padding: 12px 20px; border-top: 1px solid var(--line); background: color-mix(in oklab, var(--sunk) 40%, var(--panel)); }
.spawn-form .summary { display: flex; flex-wrap: wrap; gap: 2px 0; margin: 0 auto 0 0; color: var(--muted); font-size: 12px; min-width: 0; }
.spawn-form .summary span + span::before { content: '·'; margin: 0 7px; color: var(--deco); }
.spawn-form .summary b { color: var(--ink); }
.spawn-form footer button { flex: none; }
.spawn-form footer kbd { margin-left: 8px; padding: 0; min-width: 0; background: none; color: inherit; opacity: .6; font: 600 12px/1 var(--ui); }
@media (max-width: 760px) {
  .spawn-form { height: calc(100vh - 32px); }
  .spawn-form .cols { grid-template-columns: 1fr; grid-template-rows: minmax(160px, 1fr) auto; overflow: auto; }
  .spawn-form .task { border-right: 0; border-bottom: 1px solid var(--line); }
  .spawn-form .setup { overflow: visible; }
  .spawn-form footer { flex-wrap: wrap; }
  .spawn-form .summary { flex-basis: 100%; margin-bottom: 4px; }
}
`

/**
 * The stylesheet every tower page links: the faces, every token as a `--` variable, and the shared components. The
 * scheme follows the system's appearance unless the page sets `data-scheme` on its root element.
 */
export function designCss(): string {
  const faces = fonts.map(
    ({ family, weight, file, range }) =>
      `@font-face { font-family: '${family}'; font-weight: ${weight}; font-style: normal; font-display: block; src: url(fonts/${file}) format('woff2');${range ? ` unicode-range: ${range};` : ''} }`,
  )
  const mixes = Object.fromEntries(Object.entries(projectMix).map(([name, percent]) => [`p${name[0].toUpperCase()}${name.slice(1)}Mix`, `${percent}%`]))
  const shared = { ...type, ...shape, termFg: ANSI.foreground, ...mixes }
  const scheme = (name: Scheme) => `color-scheme: ${name};\n  ${variables(palettes[name])}`
  return `${faces.join('\n')}
:root {
  ${variables(shared)}
  ${scheme('light')}
}
@media (prefers-color-scheme: dark) {
  :root:not([data-scheme='light']) {
  ${scheme('dark')}
  }
}
:root[data-scheme='dark'] {
  ${scheme('dark')}
}
${COMPONENTS}`
}
