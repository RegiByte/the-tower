/**
 * Contrast: every colour pair the renderers draw from the design tokens (`src/shared/design.ts`), measured as WCAG 2.x
 * contrast in both schemes against what AA asks: 4.5:1 for text, 3:1 for large text (24px, or 18.66px bold) and for
 * what identifies a control (a field's edge, a focus ring). Each pair is data below, named for where it is drawn: a
 * new use of a token as text, or a new surface under text, adds its pair here.
 *
 *   npm run tool:contrast            every pair in both schemes, failures marked; exits 1 on any failure
 *   npm run tool:contrast -- --fails only the failures
 *
 * A colour is a token of the scheme's palette, a `#rrggbb`, or a mix as `color-mix(in oklab, a p%, b)` draws it.
 * Project colours come from the config, so the project tones are measured on sample colours: the terminal's ANSI hues,
 * the kind of colour a config picks.
 */
import { mixOklab, palettes, terminalTheme, type Scheme } from '../src/shared/design.ts'

type Palette = (typeof palettes)[Scheme]
type Token = { [K in keyof Palette]: Palette[K] extends string ? K : never }[keyof Palette]
type Colour = Token | `#${string}` | { mix: [Colour, number | Token, Colour] }
type Need = 'text' | 'large' | 'ui'
type Pair = { fg: Colour; bg: Colour; need: Need; where: string }

const MINIMUM: Record<Need, number> = { text: 4.5, large: 3, ui: 3 }
const PROJECT_SAMPLES = (['red', 'green', 'yellow', 'blue', 'magenta', 'cyan'] as const).map((hue) => terminalTheme('dark')[hue])

const mix = (a: Colour, percent: number | Token, b: Colour): Colour => ({ mix: [a, percent, b] })
const on = (fgs: Colour[], bgs: Colour[], need: Need, where: string): Pair[] => fgs.flatMap((fg) => bgs.map((bg) => ({ fg, bg, need, where })))

const ATTENTION = ['needs', 'ready', 'working', 'broken'] as const
const PAPER: Colour[] = ['wall', 'panel', 'panel2']

const PAIRS: Pair[] = [
  ...on(['ink', 'muted', 'faint'], PAPER, 'text', 'the three text tiers'),
  ...on(['muted'], ['sunk'], 'text', 'the settings segmented control'),
  ...on(['ink'], ['sunk'], 'text', 'inline code and table heads in rendered words'),
  ...on(['ink', 'muted'], [mix('accent', 12, 'panel')], 'text', 'a prompt in the brief'),
  ...on(['ink', 'muted'], [mix('ink', 6, 'panel')], 'text', 'a worker’s message in the brief'),
  ...on(['muted'], ['addedWash', 'removedWash'], 'text', "a diff line's +/- sign"),
  ...on(['muted'], ['addedGutter', 'removedGutter', mix('accent', 10, 'panel')], 'text', 'diff line numbers, hunk headers'),
  ...on(['accent'], ['panel', 'panel2'], 'text', 'links, a note’s re'),
  ...ATTENTION.flatMap((a) => on([`${a}Text`], ['panel', 'panel2', mix(a, 8, 'panel')], 'text', `${a} as text: a status, a waiting row`)),
  ...on(['needsText'], [mix('needs', 11, 'panel')], 'text', 'the ask bar'),
  ...on(['added', 'removed'], ['panel', 'panel2'], 'text', '+N / −N counts'),
  ...on(['panel'], ['added', 'removed'], 'text', "a changed file's mark"),
  ...(['needs', 'ready', 'working', 'quiet', 'broken'] as const).flatMap((a) =>
    on([`on${a[0].toUpperCase()}${a.slice(1)}` as Token], [a], 'text', `a ${a} pill, chip or tag`),
  ),
  ...on(['synKeyword', 'synString', 'synNumber', 'synComment', 'synTitle', 'synType', 'synAttr', 'synRegexp'], ['panel', 'addedWash', 'removedWash'], 'text', 'code syntax'),
  ...on(['lineStrong'], ['panel', 'panel2'], 'ui', "a form field's edge"),
  ...on(['accent'], ['panel', 'panel2'], 'ui', 'the focus ring'),
  ...on(['brokenText'], ['panel2'], 'ui', 'an invalid field'),
  ...on(PROJECT_SAMPLES.map((p) => mix(p as Colour, 'pEdgeMix', 'ink')), ['panel2'], 'ui', 'a project’s focus ring and selected edge'),
]

const resolve = (p: Palette, c: Colour): string =>
  typeof c === 'object' ? mixOklab(resolve(p, c.mix[0]), percent(p, c.mix[1]), resolve(p, c.mix[2])) : c.startsWith('#') ? c : p[c as Token]

const percent = (p: Palette, k: number | Token) => (typeof k === 'number' ? k : parseFloat(p[k]))

const name = (c: Colour): string => (typeof c === 'object' ? `${name(c.mix[0])} ${c.mix[1]}% ${name(c.mix[2])}` : c)

const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => linear(parseInt(hex.slice(i, i + 2), 16) / 255))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const measured = (Object.keys(palettes) as Scheme[]).flatMap((scheme) =>
  PAIRS.map((pair) => {
    const ratio = contrast(resolve(palettes[scheme], pair.fg), resolve(palettes[scheme], pair.bg))
    return { scheme, ...pair, ratio, ok: ratio >= MINIMUM[pair.need] }
  }),
)

const shown = process.argv.includes('--fails') ? measured.filter((m) => !m.ok) : measured
for (const m of shown) {
  const pair = `${name(m.fg)} on ${name(m.bg)}`
  console.log(`${m.ok ? ' ' : '✗'} ${m.scheme.padEnd(5)} ${m.ratio.toFixed(2).padStart(5)} ≥ ${MINIMUM[m.need]}  ${pair.padEnd(44)} ${m.where}`)
}
const failed = measured.filter((m) => !m.ok).length
console.log(`${measured.length - failed} of ${measured.length} pairs reach AA${failed ? `, ${failed} fail` : ''}`)
process.exitCode = failed ? 1 : 0
