/**
 * The tower's visual language as data: one source for every renderer. The tower serves it as `/design.css`
 * (variables and fonts), and the library as `/lib/design.js`.
 *
 * Paper and ink for chrome; colour is attention. Each scheme fills the same roles: `ink` is text, `enamel` the dark
 * surfaces (terminals, buildings) in both. Text comes in three tiers, `ink`, `muted` and `faint`, each at least 4.5:1
 * on wall, panel and panel-2; `deco` is faint's tone for what is never read (carets, dividers, a missing project
 * colour). `line` divides; `lineStrong` edges a form field, 3:1 on panel; `pEdgeMix` is how much of a project's colour
 * (the rest ink) marks its focus ring and selected edge, 3:1 on panel-2. The five attention colours are named after the
 * board's `Attention`, so `palettes[scheme][card.attention]` is a card's colour, as a fill; its `<attention>Text` is the
 * same hue readable as text on paper, and its `on<Attention>` the text set on it. `added` and `removed` mark a diff's
 * lines: as text and marks on paper, and as a `wash` behind an added or removed line's code, a deeper `gutter` behind
 * its numbers and a deeper `word` behind the words an edited line changed. The `syn*` colours mark code's syntax, each
 * readable on paper, on both washes and on both words. `npm run
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
    offered: '#2f647c',
    ready: '#5aa872',
    working: '#e0921a',
    quiet: '#99a197',
    broken: '#7a3530',
    needsText: '#a9302d',
    readyText: '#356845',
    workingText: '#82530a',
    brokenText: '#7a3530',
    onNeeds: '#ffffff',
    onOffered: '#ffffff',
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
    addedWord: '#b4d79a',
    removedWord: '#ecbdad',
    synKeyword: '#7e2f83',
    synString: '#245c35',
    synNumber: '#853e06',
    synComment: '#585240',
    synTitle: '#17507a',
    synType: '#6a4e00',
    synAttr: '#20596c',
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
    offered: '#86b9cc',
    ready: '#6fbf8a',
    working: '#e9a13a',
    quiet: '#8e9891',
    broken: '#b65c54',
    needsText: '#f47672',
    readyText: '#6fbf8a',
    workingText: '#e9a13a',
    brokenText: '#d48880',
    onNeeds: '#131917',
    onOffered: '#131917',
    onReady: '#131917',
    onWorking: '#131917',
    onQuiet: '#131917',
    onBroken: '#ffffff',
    added: '#80b77c',
    removed: '#e28076',
    addedWash: '#233922',
    removedWash: '#492825',
    addedGutter: '#304f36',
    removedGutter: '#663a36',
    addedWord: '#135713',
    removedWord: '#842e29',
    synKeyword: '#ddaaea',
    synString: '#acd58f',
    synNumber: '#f2ad75',
    synComment: '#c1baa4',
    synTitle: '#8ec7ec',
    synType: '#e8c67f',
    synAttr: '#8fc3d6',
    synRegexp: '#fca2ba',
    shadow: '0 1px 0 #00000033, 0 6px 16px -10px #000000aa',
    shadowPop: '0 20px 50px -20px #000000cc',
    backdrop: '#0000008c',
  },
}

export type Scheme = keyof typeof palettes

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

/**
 * The type scale: every size of text the renderers draw, as `--fs-<step>`, in rem. The root's font size is the
 * browser's text size times the viewer's `scale` (`tower.prefs`, set as `--scale`), so every size follows both.
 * Terminals and Tower 3D's canvas keep sizes of their own. At the browser's default: 11, 12, 13, 14, 16, 20 and 26 px.
 */
export const size = { xs: '.6875rem', s: '.75rem', m: '.8125rem', l: '.875rem', xl: '1rem', '2xl': '1.25rem', '3xl': '1.625rem' }

/**
 * The spacing scale, on a 4 px grid with 2 and 6 for the tightest places, as `--sp-<step>`: every padding, margin and
 * gap. In px: text grows with the type scale and the space around it stays.
 */
export const space = { '2xs': '2px', xs: '4px', s: '6px', m: '8px', l: '12px', xl: '16px', '2xl': '24px', '3xl': '32px' }

/** Corners: `radius` for panels and controls, `radiusS` for small marks (a key, a window), `radiusPill` for pills. */
export const shape = { radius: '4px', radiusS: '2px', radiusPill: '999px' }

/**
 * Controls: `control`, the least height and width of a small control, the 24 px target WCAG 2.5.8 asks for; a row of
 * controls shares it. `selected`, the ring inside an ink border that marks the selected card or tab, wherever it is.
 */
export const controls = { control: '24px', selected: 'inset 0 0 0 1px var(--ink)' }

/**
 * Colour roles, each a palette token by name, emitted as `--<role>: var(--<token>)`, so a role follows the scheme and
 * contrast its token does, and a theme re-points the role without touching the palette: `primary` fills the one
 * emphasized action, `onPrimary` is its text, `hover` fills what is under the pointer (rows, menu items).
 */
export const roles = { primary: 'ink', onPrimary: 'panel', hover: 'panel2' } as const satisfies Record<string, keyof (typeof palettes)[Scheme]>

/**
 * Character: the shape and type every renderer draws its parts in, for a theme to set. `radiusCard` rounds cards,
 * panels, popovers and dialogs, `radiusControl` buttons, fields, tabs and rows, `radiusPrimary` the one emphasized
 * action; `buttonPad` pads a button its place doesn't pad otherwise. A worker card is `cardSurface`, `cardHover` under
 * the pointer; `shadowCard` is a card's resting elevation, `shadowLift` raises one under the pointer and `shadowHead`
 * the heads of views (a worker's head, a shelf's, the greeting). Type comes in three roles, all in the display face:
 * headings and signs, in `heading`'s colour at `displayWeight`, in `headingCase`, tracked `headingTracking`; names
 * (callsigns) at `nameWeight`, tracked `nameTracking`; and labels (eyebrows, group heads, chips and pills, these in the
 * body face, which draws `labelWeight` as the nearest weight it has) at `labelWeight`, small, in `labelCase`, tracked `labelTracking`. The brand and the greeting draw at
 * `brandWeight`. Body text is tracked `bodyTracking` with lines `bodyLeading` high.
 *
 * A floor sign is a plate of its project's colour on panel: `--p-plate-mix` of it fills the plate,
 * `--p-plate-edge-mix` edges it and `--p-plate-text-mix` colours its name (the rest `heading`), from `projectMix`. An
 * inset bar `signBar` wide marks its leading edge, and its number sits on a badge `signBadge` high.
 *
 * Emphasis is a glow on what is active: a worker card glows `cardGlow` wide in `cardGlowMix` of its status colour,
 * `cardGlowHover` and its mix under the pointer, `cardGlowActive` and its mix when it is the selected worker; the main
 * pane glows `mainGlow` wide in `mainGlowMix` of the accent, `mainGlowActive` and its mix while focus is in it. A glow
 * is a blur and a percent, not a colour, for the reason the status ring is. Unset states take the resting glow, and
 * the resting glows are none.
 *
 * Elevation is how a renderer's frame stands on the wall: `sideSurface` fills the sidebar, `sideRule` divides it from
 * the main pane, and the main pane is `mainSurface`, set in by `mainInset` on every side, rounded `mainRadius`, raised
 * `mainShadow`; its foot (the shells' strip and their pane) is `dockSurface`, rounded as the pane is. By default the
 * sidebar is a panel ruled off a bare main pane; a transparent sidebar and a panel main
 * pane, inset, rounded and raised, float the main pane over one ground. A worker card's status is a stroke
 * `statusEdge` wide on its leading side, its other sides the line with `statusRingMix` of the status colour mixed in:
 * `100%` with a thin edge draws a full status border.
 */
export const character = {
  radiusCard: 'var(--radius)',
  radiusControl: 'var(--radius)',
  shadowCard: 'none',
  displayWeight: '800',
  headingCase: 'uppercase',
  headingTracking: '.06em',
  nameTracking: '.04em',
  labelCase: 'uppercase',
  labelTracking: '.08em',
  sideSurface: 'var(--panel)',
  sideRule: 'var(--line)',
  mainSurface: 'transparent',
  mainInset: '0px',
  mainRadius: '0px',
  mainShadow: 'none',
  dockSurface: 'var(--panel)',
  statusEdge: '4px',
  statusRingMix: '0%',
  radiusPrimary: 'var(--radius-control)',
  buttonPad: 'var(--sp-xs) var(--sp-l)',
  cardSurface: 'var(--panel)',
  cardHover: 'var(--card-surface)',
  shadowLift: 'var(--shadow)',
  shadowHead: 'var(--shadow)',
  heading: 'var(--ink)',
  nameWeight: 'var(--display-weight)',
  labelWeight: 'var(--display-weight)',
  brandWeight: 'calc(var(--display-weight) + 100)',
  bodyTracking: 'normal',
  bodyLeading: '1.45',
  signBar: '5px',
  signBadge: '22px',
  cardGlow: '0px',
  cardGlowMix: '0%',
  cardGlowHover: 'var(--card-glow)',
  cardGlowHoverMix: 'var(--card-glow-mix)',
  cardGlowActive: 'var(--card-glow)',
  cardGlowActiveMix: 'var(--card-glow-mix)',
  mainGlow: '0px',
  mainGlowMix: '0%',
  mainGlowActive: 'var(--main-glow)',
  mainGlowActiveMix: 'var(--main-glow-mix)',
}

/** Icon sizes, as `--icon-<step>`, in rem so they follow the text: `s` beside words, `m` alone in a control. */
export const iconSize = { s: '.75rem', m: '1rem' }

/** Overpass draws `·` with almost no advance, so it eats the space after it: the next face in the stack draws it. */
const OVERPASS_RANGE = 'U+0000-00B6, U+00B8-10FFFF'

/**
 * Overpass's own ascent and descent (88% and 38% of the em) leave its capitals 0.1 em above the middle of a line, where
 * Atkinson's sit on it. The same total, split so ascent less descent is the cap height (70%), centres a line of
 * capitals in its box, as signs, labels and callsigns are drawn.
 */
const OVERPASS_METRICS = 'ascent-override: 98%; descent-override: 28%; line-gap-override: 0%;'

/** Latin subsets of the @fontsource packages, served at `/fonts/<file>`. All three faces are SIL OFL. */
export const fonts: { family: string; weight: number; style: 'normal' | 'italic'; pkg: string; file: string; range?: string; metrics?: string }[] = [
  { family: 'Overpass', weight: 800, style: 'normal', pkg: 'overpass', file: 'overpass-latin-800-normal.woff2', range: OVERPASS_RANGE, metrics: OVERPASS_METRICS },
  { family: 'Overpass', weight: 900, style: 'normal', pkg: 'overpass', file: 'overpass-latin-900-normal.woff2', range: OVERPASS_RANGE, metrics: OVERPASS_METRICS },
  { family: 'Atkinson Hyperlegible', weight: 400, style: 'normal', pkg: 'atkinson-hyperlegible', file: 'atkinson-hyperlegible-latin-400-normal.woff2' },
  { family: 'Atkinson Hyperlegible', weight: 700, style: 'normal', pkg: 'atkinson-hyperlegible', file: 'atkinson-hyperlegible-latin-700-normal.woff2' },
  { family: 'Atkinson Hyperlegible', weight: 400, style: 'italic', pkg: 'atkinson-hyperlegible', file: 'atkinson-hyperlegible-latin-400-italic.woff2' },
  { family: 'Atkinson Hyperlegible', weight: 700, style: 'italic', pkg: 'atkinson-hyperlegible', file: 'atkinson-hyperlegible-latin-700-italic.woff2' },
  { family: 'JetBrains Mono', weight: 400, style: 'normal', pkg: 'jetbrains-mono', file: 'jetbrains-mono-latin-400-normal.woff2' },
  { family: 'JetBrains Mono', weight: 700, style: 'normal', pkg: 'jetbrains-mono', file: 'jetbrains-mono-latin-700-normal.woff2' },
  { family: 'JetBrains Mono', weight: 400, style: 'italic', pkg: 'jetbrains-mono', file: 'jetbrains-mono-latin-400-italic.woff2' },
]

const TERM_FG = '#e6e4dc'
const SELECTION = '#35708a80'

/**
 * The terminal's sixteen ANSI colours, warmed to sit beside paper, emitted as `--ansi-<name>` (`--ansi-bright-black`):
 * a page's terminal reads them as the page computes them, so a theme that sets them recolours its terminals.
 */
export const ansi = {
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

export type Ansi = Record<keyof typeof ansi, string>

/**
 * An xterm.js `ITheme` on a surface: the terminal is a block of `enamel` with its text in `termFg` and its sixteen
 * colours `ansi`. A page's terminal reads all three as the page computes `--enamel`, `--term-fg` and `--ansi-*`.
 */
export const terminalThemeOn = ({ enamel, termFg, ansi }: { enamel: string; termFg: string; ansi: Ansi }) => ({
  ...ansi,
  selectionBackground: SELECTION,
  foreground: termFg,
  cursor: termFg,
  background: enamel,
  cursorAccent: enamel,
})

/** The terminal's theme in a scheme as the design defines it, for surfaces that read no CSS (a canvas). */
export const terminalTheme = (scheme: Scheme) => terminalThemeOn({ enamel: palettes[scheme].enamel, termFg: TERM_FG, ansi })

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

/**
 * Rules for `selector` under reduced motion: the viewer's `data-motion` on the root (`tower.prefs`), or the system's
 * setting unless the viewer asked for full motion.
 */
export const reduced = (selector: string, rules: string) =>
  `:root[data-motion='reduce'] ${selector} { ${rules} }\n@media (prefers-reduced-motion: reduce) { :root:not([data-motion='full']) ${selector} { ${rules} } }`

/**
 * More contrast, asked by the viewer (`data-contrast` on the root) or the system: muted and faint text move toward
 * ink, what is never read takes faint's tone, and lines draw as strong as a field's edge.
 */
const moreContrast = (name: Scheme) => {
  const p = palettes[name]
  return { muted: mixOklab(p.muted, 40, p.ink), faint: mixOklab(p.faint, 40, p.ink), deco: p.faint, line: p.lineStrong }
}

const kebab = (name: string) => name.replace(/[A-Z0-9]/g, (c) => `-${c.toLowerCase()}`)

const variables = (tokens: Record<string, string>) => Object.entries(tokens).map(([name, value]) => `--${kebab(name)}: ${value};`).join('\n  ')

/**
 * How a document drawn in a frame looks like the page around it: `root`, its root element's attributes (the viewer's
 * appearance, `tower.prefs.attributes`), and `links`, the stylesheets it links: the design's tokens, then the renderer's
 * themes as this screen draws them (`tower.theme`), its choice of theme included. Drawn again on `onThemes`.
 */
export type FrameLook = { root: string; links: string }

/** The frame look of the page `tower` serves. */
export const frameLook = (tower: { prefs: { attributes(): string }; theme: { sheet(theme: string | null): string; get(): { drawn: string | null } } }): FrameLook => ({
  root: tower.prefs.attributes(),
  links: `<link rel="stylesheet" href="/design.css"><link rel="stylesheet" href="${tower.theme.sheet(tower.theme.get().drawn)}">`,
})

/** A rendered markdown document in a frame of its own (a shelf's file, a brief): the page links `/design.css` too. */
export const documentCss = `html { scrollbar-width: thin; scrollbar-color: var(--line) transparent; }
body { margin: 0; background: var(--panel); color: var(--ink); font: var(--fs-xl)/1.65 var(--ui); -webkit-font-smoothing: antialiased; }
article { max-width: 860px; margin: 0 auto; padding: var(--sp-3xl) 36px 80px; }
h1, h2, h3 { color: var(--heading); font-family: var(--display); font-weight: var(--display-weight); line-height: 1.2; margin: 1.6em 0 .6em; } h1 { font-size: 1.8em; } h3 { font-size: 1.1em; }
h2 { font-size: 1.3em; border-bottom: 1px solid var(--line); padding-bottom: .3em; }
a { color: var(--accent); } li { margin: .2em 0; } article img { max-width: 100%; height: auto; } hr { border: 0; border-top: 1px solid var(--line); margin: 2em 0; }
code { font: .86em var(--mono); background: var(--panel-2); padding: .1em .35em; border-radius: var(--radius); }
pre { background: var(--enamel); color: var(--term-fg); border-radius: var(--radius); padding: var(--sp-l) var(--sp-xl); overflow: auto; } pre code { background: none; padding: 0; color: inherit; }
blockquote { margin: 0; padding: 0 1em; border-left: 3px solid var(--line); color: var(--muted); }
table { border-collapse: collapse; } th, td { border: 1px solid var(--line); padding: var(--sp-xs) var(--sp-l); } th { background: var(--panel-2); }`

/**
 * The components every renderer draws the same way, by class: an attention class (`needs`, `ready`, `working`,
 * `quiet`, `broken`, and `offered`, a policy's slot waiting to be started, its text tone its own colour) sets `--c`, the text colour on it, `--on`, and its tone as text on paper, `--c-text`; a lamp,
 * pill, chip and meter read them; an unfilled chip is in ink, whatever it sits on. A floor sign takes its project colour as `--p`. A meter's `s` is a tick on its track.
 * Only `needs` fills or washes in red: a count of waits (`.chip.waits`) is ringed in ink, its lamp in the loudest wait's
 * attention; something new is drawn in `--accent`, a problem that waits on no one in `--broken-text`.
 * Only a needs lamp blinks, and a `watching` one breathes; with reduced motion (`reduced`), every animation runs once.
 * A button's states, whatever the renderer's own look: pressed (`:active`) it sinks a pixel, held (`disabled` or
 * `aria-disabled`, which keeps it focusable) it fades, and busy (`aria-busy`, while what it asks is in flight:
 * `pressing` in `press.ts`) a bar sweeps along its foot in its text colour, which stays at full contrast.
 * An `.icon` (icons.ts) sits on the text beside it; an `.icon-btn` is a control that is only an icon, every close
 * included: at least `--control` square, quiet until hovered, busy as a button is. A `.glyph` is an extension's SVG
 * (`--glyph: url(…)`) drawn as a mask in the ink around it, so it follows the palette as the core's icons do.
 */
const COMPONENTS = `
.icon { width: var(--icon-s); height: var(--icon-s); flex: none; vertical-align: -.125em; }
.icon-btn { display: inline-grid; place-items: center; min-width: var(--control); min-height: var(--control); padding: 0; border: 1px solid transparent; border-radius: var(--radius-control);
  background: none; color: var(--muted); cursor: pointer; }
.icon-btn .icon { width: var(--icon-m); height: var(--icon-m); }
.icon-btn:hover { color: var(--ink); border-color: var(--line); background: var(--panel); }
.icon-btn small { padding-inline: var(--sp-xs); font-size: var(--fs-xs); }
.glyph { display: inline-block; background: currentColor; mask: var(--glyph) center / contain no-repeat; }
.eyebrow { font: var(--label-weight) var(--fs-xs)/1 var(--display); letter-spacing: var(--label-tracking); text-transform: var(--label-case); color: var(--muted); }
.needs { --c: var(--needs); --on: var(--on-needs); --c-text: var(--needs-text); } .ready { --c: var(--ready); --on: var(--on-ready); --c-text: var(--ready-text); }
.working { --c: var(--working); --on: var(--on-working); --c-text: var(--working-text); }
.quiet { --c: var(--quiet); --on: var(--on-quiet); --c-text: var(--muted); } .offered { --c: var(--offered); --on: var(--on-offered); --c-text: var(--offered); } .broken { --c: var(--broken); --on: var(--on-broken); --c-text: var(--broken-text); }
.lamp { display: inline-block; width: 9px; height: 9px; border-radius: 50%; flex: none; background: var(--c); }
.needs .lamp, .lamp.needs { animation: blink 1.1s steps(2, jump-none) infinite; }
@keyframes blink { 50% { opacity: .25; } }
.watching .lamp, .lamp.watching { animation: breathe 2.8s ease-in-out infinite; }
@keyframes breathe { 50% { opacity: .35; } }
.pill { display: inline-flex; align-items: center; gap: var(--sp-s); padding: var(--sp-2xs) var(--sp-l) var(--sp-2xs) var(--sp-m); border-radius: var(--radius-pill); font-size: var(--fs-s); font-weight: var(--label-weight);
  white-space: nowrap; background: var(--c); color: var(--on); }
.pill .lamp { background: var(--on); }
.chip { display: inline-flex; align-items: center; gap: var(--sp-s); padding: var(--sp-2xs) var(--sp-m); border-radius: var(--radius-pill); font-size: var(--fs-s); font-weight: var(--label-weight);
  background: var(--panel-2); color: var(--ink); white-space: nowrap; }
.chip b { font-variant-numeric: tabular-nums; }
.chip.some { background: var(--c); color: var(--on); }
.chip.some .lamp { background: var(--on); }
.chip:not(.some) .lamp { animation: none; }
.chip.waits.some { background: var(--panel-2); color: var(--ink); box-shadow: inset 0 0 0 2px var(--ink); }
.chip.waits.some .lamp { background: var(--c); }
button:active:not(:disabled, [aria-disabled='true'], [aria-busy='true']) { translate: 0 1px; }
button:is(:disabled, [aria-disabled='true']) { opacity: .45; cursor: not-allowed; }
button[aria-busy='true'], .icon-btn[aria-busy='true'] { position: relative; cursor: progress; }
button[aria-busy='true']::after, .icon-btn[aria-busy='true']::after { content: ''; position: absolute; left: 3px; right: 3px; bottom: 2px; height: 2px; border-radius: 1px;
  background: linear-gradient(90deg, transparent, currentColor, transparent) 0 0 / 50% 100% no-repeat; animation: busy 1s ease-in-out infinite; }
@keyframes busy { from { background-position: -100% 0; } to { background-position: 200% 0; } }
${['*', '::before', '::after'].map((target) => reduced(target, 'animation-iteration-count: 1 !important;')).join('\n')}
${reduced("button[aria-busy='true']::after, .icon-btn[aria-busy='true']::after", 'animation: none; background-size: 100% 100%;')}
.meter { position: relative; height: 6px; border-radius: var(--radius-pill); background: var(--sunk); }
.meter i { display: block; max-width: 100%; height: 100%; border-radius: inherit; background: var(--fill, var(--ink)); }
.meter s { position: absolute; top: -3px; bottom: -3px; width: 2px; margin-left: -1px; border-radius: 1px; background: var(--ink); box-shadow: 0 0 0 1px var(--panel); }
.sign { --pp: var(--p, var(--deco)); display: flex; align-items: center; gap: var(--sp-m); padding: var(--sp-s) var(--sp-s) var(--sp-s) var(--sp-l); border-radius: var(--radius-card);
  background: color-mix(in oklab, var(--pp) var(--p-plate-mix), var(--panel)); border: 1px solid color-mix(in oklab, var(--pp) var(--p-plate-edge-mix), var(--panel));
  color: color-mix(in oklab, var(--pp) var(--p-plate-text-mix), var(--heading)); box-shadow: inset var(--sign-bar) 0 0 var(--pp); }
.sign .num { display: grid; place-items: center; min-width: calc(var(--sign-badge) + 4px); min-height: var(--sign-badge); padding: 0 var(--sp-xs); border-radius: var(--radius-s); background: var(--pp);
  color: var(--enamel); font: var(--fs-l)/1 var(--display); font-weight: calc(var(--display-weight) + 100); font-variant-numeric: tabular-nums; }
.sign .name { font: var(--display-weight) var(--fs-l)/1 var(--display); text-transform: var(--heading-case); letter-spacing: var(--heading-tracking); white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis; }
.spawn-form { --pp: var(--p, var(--accent)); --pe: color-mix(in oklab, var(--pp) var(--p-edge-mix), var(--ink)); display: grid; grid-template-rows: auto minmax(0, 1fr) auto auto; width: min(1000px, calc(100vw - 32px));
  min-height: min(680px, calc(100vh - 48px)); height: auto; max-height: calc(100vh - 48px); overflow: hidden; color: var(--ink); font: var(--fs-l)/1.45 var(--ui); }
.spawn-form header { display: flex; align-items: center; gap: var(--sp-xl); padding: var(--sp-xl) var(--sp-2xl); border-bottom: 1px solid var(--line); }
.spawn-form header .sign { flex: none; }
.spawn-form h2 { margin: 0; color: var(--heading); font: var(--display-weight) var(--fs-xl)/1 var(--display); text-transform: var(--heading-case); letter-spacing: var(--heading-tracking); }
.spawn-form .draft { margin-left: auto; color: var(--muted); font-size: var(--fs-s); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.spawn-form .draft b { color: var(--ink); }
.spawn-form .cols { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); min-height: 0; }
.spawn-form .task { display: flex; flex-direction: column; gap: var(--sp-m); padding: var(--sp-xl) var(--sp-2xl); border-right: 1px solid var(--line); min-height: 0; }
.spawn-form .setup { display: grid; align-content: start; gap: var(--sp-xl); padding: var(--sp-xl) var(--sp-2xl); overflow: auto; scrollbar-gutter: stable; }
.spawn-form fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }
.spawn-form legend { padding: 0; margin-bottom: var(--sp-m); }
.spawn-form .lbl { display: flex; align-items: baseline; gap: var(--sp-m); }
.spawn-form .lbl i { font: italic 400 var(--fs-xs)/1 var(--ui); letter-spacing: 0; text-transform: none; color: var(--faint); }
.spawn-form .lbl .hint { font: 400 var(--fs-s)/1 var(--ui); color: var(--faint); cursor: help; }
.spawn-form .lbl .hint:hover, .spawn-form .lbl .hint:focus-visible { color: var(--muted); }
.spawn-form input:not([type=radio]), .spawn-form select, .spawn-form textarea { width: 100%; font: inherit; color: var(--ink); background: var(--panel-2);
  border: 1px solid var(--line-strong); border-radius: var(--radius-control); padding: var(--sp-m); min-width: 0; }
.spawn-form :is(input:not([type=radio]), select, textarea):focus-visible { outline: 2px solid var(--pe); outline-offset: -1px; }
.spawn-form tower-combobox { --ui-ring: var(--pe); --ui-placeholder: var(--faint); }
.spawn-form input[type=radio]:focus-visible { outline: 2px solid var(--pe); outline-offset: 2px; border-radius: 50%; }
.spawn-form ::placeholder { color: var(--faint); font-style: italic; }
.spawn-form textarea { flex: 1; resize: none; font: var(--fs-l)/1.55 var(--ui); padding: var(--sp-l) var(--sp-xl); }
.spawn-form input:invalid { border-color: var(--broken-text); }
.spawn-form .where { display: grid; gap: var(--sp-s); }
.spawn-form .choice { display: grid; grid-template-columns: auto 1fr auto; column-gap: var(--sp-l); row-gap: var(--sp-2xs); align-items: baseline; padding: var(--sp-m) var(--sp-l);
  border: 1px solid var(--line); border-radius: var(--radius-control); background: var(--panel-2); cursor: pointer; transition: border-color .15s ease-out, background .15s ease-out; }
.spawn-form .choice:hover { border-color: var(--deco); }
.spawn-form .choice small { grid-column: 2 / -1; color: var(--muted); font-size: var(--fs-s); }
.spawn-form .choice:has(:checked) { border-color: var(--pe); background: color-mix(in oklab, var(--pp) 12%, var(--panel-2)); box-shadow: inset 4px 0 0 var(--pp); }
.spawn-form .choice:has(:disabled) { opacity: .55; cursor: default; }
.spawn-form .choice:has(:disabled) .aside { font: 400 var(--fs-xs)/1.3 var(--ui); text-transform: none; letter-spacing: 0; }
.spawn-form input[type=radio] { accent-color: var(--pp); margin: 0; translate: 0 2px; }
.spawn-form .fields { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-l); }
.spawn-form .fields > legend { grid-column: 1 / -1; }
.spawn-form .fields :is(label, .field) { display: grid; gap: var(--sp-s); }
.spawn-form .fields .wide { grid-column: 1 / -1; }
.spawn-form .fields .why { color: var(--broken-text); font-size: var(--fs-s); }
.spawn-form .fields .why:empty { display: none; }
.spawn-form .fields .provider { display: contents; }
.spawn-form .fields .note { color: var(--muted); font-size: var(--fs-s); margin-top: calc(-1 * var(--sp-s)); }
.spawn-form .fields .note:empty { display: none; }
.spawn-form .picks { display: grid; gap: var(--sp-xs); }
.spawn-form .pick { display: flex; align-items: baseline; gap: var(--sp-l); padding: var(--sp-s) var(--sp-l); border-radius: var(--radius-control); cursor: pointer; }
.spawn-form .pick:hover { background: var(--hover); }
.spawn-form .pick:has(:checked) { background: color-mix(in oklab, var(--pp) 12%, var(--panel-2)); }
.spawn-form .pick span { color: var(--muted); font-size: var(--fs-s); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.spawn-form .pick .st { margin-left: auto; }
.spawn-form .pick .st.at-risk, .spawn-form .pick .st.unread { color: var(--broken-text); }
.spawn-form .pick .st.live { color: var(--working-text); }
.spawn-form .if-new, .spawn-form .if-worktree, .spawn-form .if-main { display: none; margin-top: calc(-1 * var(--sp-s)); padding-left: var(--sp-xl); border-left: 2px solid color-mix(in oklab, var(--pp) 45%, transparent); }
.spawn-form:has([name=where][value=new]:checked) .if-new, .spawn-form:has([name=where][value=worktree]:checked) .if-worktree,
  .spawn-form:has([name=where][value=main]:checked) .if-main { display: grid; }
.spawn-form .spawn-error { margin: 0; padding: var(--sp-m) var(--sp-2xl); border-top: 1px solid var(--broken-text); color: var(--broken-text); font-size: var(--fs-s); }
.spawn-form .spawn-error:empty { display: none; }
.spawn-form footer { display: flex; align-items: center; gap: var(--sp-m); padding: var(--sp-l) var(--sp-2xl); border-top: 1px solid var(--line); background: color-mix(in oklab, var(--sunk) 40%, var(--panel)); }
.spawn-form .summary { display: flex; flex-wrap: wrap; gap: var(--sp-2xs) 0; margin: 0 auto 0 0; color: var(--muted); font-size: var(--fs-s); min-width: 0; }
.spawn-form .summary span + span::before { content: '·'; margin: 0 var(--sp-m); color: var(--deco); }
.spawn-form .summary b { color: var(--ink); }
.spawn-form footer button { flex: none; }
.spawn-form footer kbd { margin-left: var(--sp-m); padding: 0; min-width: 0; background: none; color: inherit; opacity: .6; font: 700 var(--fs-s)/1 var(--ui); }
@media (max-width: 760px) {
  .spawn-form { height: calc(100vh - 32px); }
  .spawn-form .cols { grid-template-columns: 1fr; grid-template-rows: minmax(160px, 1fr) auto; overflow: auto; }
  .spawn-form .task { border-right: 0; border-bottom: 1px solid var(--line); }
  .spawn-form .setup { overflow: visible; }
  .spawn-form footer { flex-wrap: wrap; }
  .spawn-form .summary { flex-basis: 100%; margin-bottom: var(--sp-xs); }
}
`

/**
 * The cascade layers of a tower page, lowest first, declared before any of its CSS: the UI SDK's parts, vendored sheets
 * (xterm's), the design, the tower's elements, the renderer's own sheet, views' styles, then themes. A later layer wins
 * over an earlier one whatever its selectors weigh, and an `!important` in an earlier one over any in a later one, so a
 * theme can't undo what the tower sets `!important`: reduced motion, and `[hidden]`, which hides whatever display any
 * later rule gives the element. CSS in no layer wins over every layer.
 */
const LAYERS = '@layer ui-sdk, tower.vendor, tower.design, tower.elements, tower.page, tower.views, theme;'

/**
 * The stylesheet every tower page links first: the order of its cascade layers, the faces, and in the design's layer
 * every token as a `--` variable and the shared components. The scheme follows the system's appearance unless the page
 * sets `data-scheme` on its root element, and contrast and motion the system's settings unless it sets `data-contrast`
 * or `data-motion` (tower.js sets all three from `tower.prefs`).
 */
export function designCss(): string {
  const faces = fonts.map(
    ({ family, weight, style, file, range, metrics }) =>
      `@font-face { font-family: '${family}'; font-weight: ${weight}; font-style: ${style}; font-display: block; src: url(fonts/${file}) format('woff2');${range ? ` unicode-range: ${range};` : ''}${metrics ? ` ${metrics}` : ''} }`,
  )
  const mixes = Object.fromEntries(Object.entries(projectMix).map(([name, percent]) => [`p${name[0].toUpperCase()}${name.slice(1)}Mix`, `${percent}%`]))
  const roleVars = Object.fromEntries(Object.entries(roles).map(([role, token]) => [role, `var(--${kebab(token)})`]))
  const ansiVars = Object.fromEntries(Object.entries(ansi).map(([name, colour]) => [`ansi${name[0].toUpperCase()}${name.slice(1)}`, colour]))
  const shared = { ...type, ...shape, ...controls, termFg: TERM_FG, ...ansiVars, ...mixes, ...roleVars, ...character }
  const scheme = (name: Scheme) => `color-scheme: ${name};\n  ${variables(palettes[name])}`
  const [more, moreDark] = [variables(moreContrast('light')), variables(moreContrast('dark'))]
  const steps = (prefix: string, scale: Record<string, string>) => Object.entries(scale).map(([step, value]) => `--${prefix}-${step}: ${value};`).join('\n  ')
  return `${LAYERS}
${faces.join('\n')}
@layer tower.design {
:root {
  font-size: calc(100% * var(--scale, 1));
  ${variables(shared)}
  ${steps('fs', size)}
  ${steps('sp', space)}
  ${steps('icon', iconSize)}
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
:root[data-contrast='more'] { ${more} }
@media (prefers-contrast: more) { :root { ${more} } }
@media (prefers-color-scheme: dark) { :root[data-contrast='more']:not([data-scheme='light']) { ${moreDark} } }
:root[data-contrast='more'][data-scheme='dark'] { ${moreDark} }
@media (prefers-contrast: more) and (prefers-color-scheme: dark) { :root:not([data-scheme='light']) { ${moreDark} } }
@media (prefers-contrast: more) { :root[data-scheme='dark'] { ${moreDark} } }
[hidden]:not([hidden='until-found']) { display: none !important; }
${COMPONENTS}
}`
}
