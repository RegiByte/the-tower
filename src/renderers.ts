/** The renderers the tower serves at `/r/<name>/`: the built-ins, then the extensions', then the config's, which add to them or override their fields. */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { hiddenBelow } from './shelf.ts'
import { chordProblem } from './shared/keymap.ts'
import { BUILT_IN_RENDERERS, ConfigError, type Config, type ContributedRenderer, type Renderer, type RendererConfig } from './shared/model.ts'
import { capabilityOf, type Manifest } from './shared/extensions.ts'
import { CORE_VIEWS } from './shared/views.ts'
import type { OfferedTheme } from './bridge/extensions.ts'
import { MENU_LINE_IDS } from './shared/subject-menu.ts'
import { addsLinesOn, BUDGETS, HOLDS, KIT_MEMBERS, OVERFLOWS, overflowOf, REGION_ID, SCALES, type Declared, type Hold, type Layout, type LayoutEntry, type LayoutProblem, type Overflow, type Region, type RendererRegions } from './shared/regions.ts'

/** The default of `renderer` in the config. */
export const DEFAULT_RENDERER = 'page'

const RENDERERS_DIR = path.join(import.meta.dirname, '..', 'renderers')

/** The renderers the core declares: the tower page, the week as a yearbook, and Tower 3D once `npm run tower3d` has built `out/`. */
const BUILT_INS: Record<(typeof BUILT_IN_RENDERERS)[number], RendererConfig> = {
  page: { root: path.join(RENDERERS_DIR, 'page') },
  week: { root: path.join(RENDERERS_DIR, 'week') },
  tower3d: { root: path.join(RENDERERS_DIR, 'tower3d', 'out') },
}

/** A name that is one path segment of `/r/<name>/`: a word, or two joined by a dot, as an extension's `<provides>.<name>`. */
export const RENDERER_NAME = /^[\w-]+(\.[\w-]+)?$/

/** The renderers extensions contribute, by name: none unless the caller read them from the accepted extensions. */
export type Contributed = Record<string, ContributedRenderer>

/**
 * Each renderer's name and its config, the config's fields over the extension's over the built-in's: the built-ins in
 * their order, then the extensions', then the config's own. A config entry with no root over nothing, such as the
 * settings of an extension's renderer while that extension isn't accepted, is no renderer (`unrooted`).
 */
const configsOf = (config: Config, contributed: Contributed): [string, RendererConfig & { from?: string }][] => {
  const declared = config.renderers ?? {}
  const builtIn: Record<string, RendererConfig> = BUILT_INS
  const serveNothing = unrooted(config, contributed)
  return [...new Set([...Object.keys(BUILT_INS), ...Object.keys(contributed), ...Object.keys(declared)])]
    .filter((name) => !serveNothing.includes(name))
    .map((name) => [name, { ...builtIn[name], ...contributed[name], ...declared[name] }])
}

/** The config's renderers that set no root and override no built-in's or accepted extension's: they serve nothing. */
export const unrooted = (config: Config, contributed: Contributed): string[] =>
  Object.entries(config.renderers ?? {})
    .filter(([name, r]) => !r?.root && !Object.hasOwn(BUILT_INS, name) && !Object.hasOwn(contributed, name))
    .map(([name]) => name)

/**
 * The regions each renderer declares in its `renderer.json`: what no extension lays out, the config's renderers
 * included. Read apart from `renderersOf`, so a config's bad layout doesn't hide them; a renderer given no root declares none.
 */
export const rendererRegions = (config: Config, contributed: Contributed): RendererRegions =>
  configsOf(config, contributed).map(([name, { root, entry = 'index.html' }]) => {
    const declared = root ? declaredAt(root, entry) : undefined
    return { name, regions: declared && 'regions' in declared ? declared.regions.map((r) => r.id) : [] }
  })

/** Every renderer: the built-ins in their order, then those the accepted extensions contribute, then the config's own. */
export const renderersOf = (config: Config, contributed: Contributed): Renderer[] =>
  configsOf(config, contributed).map(([name, renderer]) => {
    if (!RENDERER_NAME.test(name)) throw new ConfigError(`renderers."${name}" in the config: a renderer's name is letters, digits, "_" and "-", or two such words joined by "."`)
    const { root, entry = 'index.html', settings = {}, layout = {}, from } = renderer as RendererConfig & { root: string; from?: string }
    const configLayout = LayoutSchema.safeParse(layout)
    if (!configLayout.success) throw new ConfigError(`renderers.${name}.layout in the config: ${layoutIssues(configLayout.error)}`)
    return { name, ...(from && { from }), root, entry, available: existsSync(path.join(root, entry)), settings, configLayout: configLayout.data, ...declaredAt(root, entry) }
  })

/** The file a renderer declares its regions in, at its root. */
export const DECLARED_FILE = 'renderer.json'

const RegionSchema: z.ZodType<Region> = z.strictObject({
  id: z.string().regex(REGION_ID, 'a subject kind and a place: card.head, item.head, reviews.thread.head'),
  subject: z.string().min(1),
  holds: z.array(z.enum(HOLDS)),
  scale: z.enum(SCALES).optional(),
  arity: z.enum(['one', 'tabs', 'all']).optional(),
  description: z.string().min(1).optional(),
  overflows: z
    .array(z.enum(OVERFLOWS))
    .min(1)
    .refine((forms) => new Set(forms).size === forms.length, { message: 'each form once' })
    .optional(),
  label: z.string().min(1).optional(),
  opens: z.string().regex(REGION_ID).optional(),
  optIn: z.boolean().optional(),
})
  .refine((r) => r.holds.length > 0 || r.label !== undefined, { message: 'a region holds something, or is labelled: one that holds nothing draws the renderer\'s own buttons, and offers only the choice of showing them' })
  .refine((r) => r.opens === undefined || (r.holds.includes('views') && r.arity === 'all'), { message: 'opens: only a region of arity all that holds views draws its views as entries that open elsewhere' })

/** A layout's problems in a line, each at its path. */
const layoutIssues = (error: z.ZodError) => error.issues.map((i) => `${i.path.join('.') || '(top)'}: ${i.message}`).join('; ')

const Budget = z.number().int().min(0).optional()

/**
 * A layout: per region id, the order of its views, those hidden, the tab it opens on, each view's options, and the
 * user's pins, form and budgets for what extensions contribute there.
 */
export const LayoutSchema: z.ZodType<Layout> = z.record(
  z.string(),
  z.strictObject({
    order: z.array(z.string()).optional(),
    hidden: z.array(z.string()).optional(),
    open: z.strictObject({ view: z.string(), subject: z.string().optional() }).optional(),
    options: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
    pinned: z.array(z.string()).optional(),
    unpinned: z.array(z.string()).optional(),
    overflow: z.enum(OVERFLOWS).optional(),
    lines: Budget,
    badges: Budget,
    actions: Budget,
    views: Budget,
    onScreen: z.boolean().optional(),
    folded: z.array(z.string()).optional(),
  }),
)

/**
 * What a renderer's layout is checked against of the extensions that would start: the regions they declare, the ids a
 * pin can name, and every view's id, the core's among them (@since 2.32).
 */
export type LayoutReach = { regions: Region[]; offered: string[]; views: string[] }

/** What `manifests`, those of the extensions that would start, give a layout's checks: their regions, their verbs', commands' and lines' ids, and the views' ids with the core's. */
export const layoutReachOf = (manifests: Manifest[]): LayoutReach => ({
  views: [...CORE_VIEWS.map((v) => v.id), ...manifests.flatMap((m) => Object.keys(m.views ?? {}).map((name) => `${capabilityOf(m)}/${name}`))],
  regions: manifests.flatMap((m) => Object.entries(m.regions ?? {}).map(([id, { layout: _, ...region }]) => ({ id, ...region }))),
  offered: manifests.flatMap((m) => {
    const cap = capabilityOf(m)
    return [...Object.keys(m.verbs ?? {}), ...Object.keys(m.commands ?? {})].map((name) => `${cap}/${name}`).concat(addsLinesOn(m, 'card') ? [cap] : [])
  }),
})

/** The holds a pin, an unpin or a hide of an action can name in a region. */
const PINNABLE: readonly Hold[] = ['verbs', 'commands', 'lines']

const FORM_VERB: Record<Overflow, string> = { menu: 'tucks into a menu', count: 'counts', wrap: 'wraps', scroll: 'scrolls' }

const BUDGET_NOUN: Record<keyof typeof BUDGETS, string> = { lines: 'line', badges: 'badge', actions: 'action', views: 'entry' }

/** Whether a region pins what it holds: actions or lines, or views it draws as entries that open elsewhere (`Region.opens`). */
const pinsIn = (region: Region) => region.holds.some((h) => PINNABLE.includes(h)) || region.opens !== undefined

/** Whether `key` budgets something `region` holds: views only where it draws them as entries. */
const budgets = (region: Region, key: keyof typeof BUDGETS) => BUDGETS[key].some((h) => region.holds.includes(h)) && (key !== 'views' || region.opens !== undefined)

/** `items` as words: `a, b or c`. */
const either = (items: readonly string[]) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} or ${items.at(-1)}` : items[0])

/**
 * The problems of the config's layout for `renderer` (decision `region-overflow`), checked against the regions it
 * declares and those the extensions that would start declare (`reach`): a form a region doesn't offer, a budget for
 * what it doesn't hold or doesn't read under its form, a pin where nothing pins or of nothing offered, an unpin of
 * nothing pinned below, and a region nobody declares. A fail means the renderer draws that region by its default.
 */
export const layoutProblems = (renderer: string, configLayout: Layout, declared: Pick<Declared, 'regions' | 'layout'>, reach: LayoutReach): LayoutProblem[] => {
  const regions = [...declared.regions, ...reach.regions]
  return Object.entries(configLayout).flatMap(([id, entry]): LayoutProblem[] => {
    const at = `renderers.${renderer}.layout.${id}`
    const region = regions.find((r) => r.id === id)
    if (!region) return [{ level: 'warn', key: at, problem: `neither ${renderer} nor any extension that would start declares region ${id}` }]
    return [...regionProblems(renderer, at, region, entry, declared.layout[id], region.opens === undefined ? reach.offered : reach.views), ...foldProblems(renderer, at, region, entry, reach.views)]
  })
}

/**
 * The problems of a region's `folded` and its sections' `onScreen` in the config's layout: only a region of arity
 * `all` draws its views folded, each named by a view's id, and its sections fold or hide rather than leave the screen.
 */
const foldProblems = (renderer: string, at: string, region: Region, entry: LayoutEntry, views: readonly string[]): LayoutProblem[] => [
  ...(region.arity === 'all' && entry.onScreen !== undefined ? [{ level: 'fail' as const, key: `${at}.onScreen`, problem: `${region.id}'s sections fold or hide, with folded and hidden: they never leave the screen for a menu` }] : []),
  ...(entry.folded === undefined
    ? []
    : region.arity !== 'all'
      ? [{ level: 'fail' as const, key: `${at}.folded`, problem: `${!region.holds.includes('views') ? `${region.id} holds no views` : `${renderer} draws ${region.id}'s views ${region.arity === 'tabs' ? 'as tabs' : 'one at a time'}`}: only a region of arity all folds them` }]
      : entry.folded.flatMap((id, n): LayoutProblem[] => (views.includes(id) ? [] : [{ level: 'warn', key: `${at}.folded[${n}]`, problem: `no view "${id}" in the core or an extension that would start` }]))),
]

/** The lines of its subject's own menu a region can pin: one holding commands, beside a subject whose menu has them. */
const ownLines = (region: Region): readonly string[] => (region.holds.includes('commands') ? (MENU_LINE_IDS[region.subject] ?? []) : [])

/**
 * The problems of one region's entry in the config's layout; `own`, the renderer's own entry for it, the layer below;
 * `offered`, the ids a pin there can name: views' in a region that opens them elsewhere, else actions' and lines'.
 */
const regionProblems = (renderer: string, at: string, region: Region, entry: LayoutEntry, own: LayoutEntry | undefined, offered: readonly string[]): LayoutProblem[] => {
  const fail = (key: string, problem: string): LayoutProblem => ({ level: 'fail', key: `${at}.${key}`, problem })
  const warn = (key: string, problem: string): LayoutProblem => ({ level: 'warn', key: `${at}.${key}`, problem })
  const pins = pinsIn(region)
  if (!region.overflows?.length && pins) {
    const unread = `${renderer} doesn't read ${region.id}'s pins, hides, form or budgets yet`
    return [
      ...(['overflow', 'pinned', 'unpinned', ...(Object.keys(BUDGETS) as (keyof typeof BUDGETS)[])] as const).filter((key) => entry[key] !== undefined).map((key) => fail(key, unread)),
      ...(region.opens === undefined ? (entry.hidden ?? []).flatMap((id, n) => (offered.includes(id) ? [fail(`hidden[${n}]`, unread)] : [])) : []),
    ]
  }
  const screen = entry.onScreen !== undefined && !region.label ? [fail('onScreen', `${renderer} offers no choice of keeping ${region.id}'s buttons off screen: it gives the region no label`)] : []
  if (!region.holds.length) return [...screen, ...(['overflow', 'pinned', 'unpinned', 'hidden', 'order', ...(Object.keys(BUDGETS) as (keyof typeof BUDGETS)[])] as const).filter((key) => entry[key] !== undefined).map((key) => fail(key, `${region.id} draws ${renderer}'s own buttons alone: only onScreen applies`))]
  const form = region.overflows?.length ? overflowOf(region as Region & { overflows: Overflow[] }, entry) : undefined
  const nothingToPin = `${region.id} holds no actions, lines or entries to pin${region.holds.includes('views') ? `: its ${region.arity === 'tabs' ? 'tabs' : 'views'} take order` : ''}`
  return [
    ...screen,
    ...(entry.overflow === undefined
      ? []
      : !region.overflows?.length
        ? [fail('overflow', `${renderer} offers no overflow choice in ${region.id}`)]
        : region.overflows.includes(entry.overflow)
          ? []
          : [fail('overflow', `${renderer} draws ${region.id} as ${either(region.overflows)}, not ${entry.overflow}`)]),
    ...(Object.keys(BUDGETS) as (keyof typeof BUDGETS)[]).flatMap((key): LayoutProblem[] => {
      if (entry[key] === undefined) return []
      if (!budgets(region, key)) return [fail(key, key === 'views' && region.holds.includes('views') ? `${region.id} mounts its views: only a region that opens them elsewhere draws them as entries to budget` : `${region.id} holds no ${key}`)]
      return form === 'wrap' || form === 'scroll' ? [warn(key, `${region.id} ${FORM_VERB[form]}, so it draws every ${BUDGET_NOUN[key]}: ${key} is unused`)] : []
    }),
    ...(entry.pinned === undefined
      ? []
      : !pins
        ? [fail('pinned', nothingToPin)]
        : entry.pinned.flatMap((id, n) =>
            offered.includes(id) || ownLines(region).includes(id)
              ? []
              : region.opens !== undefined
                ? [warn(`pinned[${n}]`, `no view "${id}" in the core or an extension that would start`)]
                : [warn(`pinned[${n}]`, `no extension that would start offers "${id}"${offered.length ? `: they offer ${offered.join(', ')}` : ''}${ownLines(region).length ? `, and ${region.subject}'s menu offers ${ownLines(region).join(', ')}` : ''}`)],
          )),
    ...(entry.unpinned === undefined
      ? []
      : !pins
        ? [fail('unpinned', nothingToPin)]
        : entry.unpinned.flatMap((id, n) =>
            entry.pinned?.includes(id)
              ? [fail(`unpinned[${n}]`, `"${id}" is pinned and unpinned here: keep one`)]
              : own?.pinned?.includes(id)
                ? []
                : [warn(`unpinned[${n}]`, `${renderer}'s own layout doesn't pin "${id}": unpinned drops only a lower layer's pin`)],
          )),
  ]
}

/** `renderer.json`: what the renderer whose page is `entry` declares, each key but `regions` empty when left out. */
const DeclaredFile = z.strictObject({
  entry: z.string().min(1).default('index.html'),
  regions: z
    .array(RegionSchema)
    .refine((regions) => new Set(regions.map((r) => r.id)).size === regions.length, { message: 'each region id once' })
    .refine((regions) => regions.every((r) => r.opens === undefined || regions.some((o) => o.id === r.opens && o.holds.includes('views') && o.arity !== 'all')), {
      message: 'opens names a region of the same renderer that holds views one at a time or as tabs',
    }),
  kit: z.array(z.enum(KIT_MEMBERS)).default([]),
  keeps: z
    .array(z.string())
    .superRefine((chords, ctx) => chords.forEach((chord, n) => chordProblem(chord) && ctx.addIssue({ code: 'custom', path: [n], message: chordProblem(chord)! })))
    .default([]),
  layout: LayoutSchema.default({}),
})

/**
 * What `root`'s `renderer.json` declares for the renderer whose page is `entry`: nothing when there is no file, or when
 * the file declares another entry, as for a second renderer served from one root (Tower 3D's Lab beside it). A file
 * that doesn't parse declares nothing and says why, as `problem`: the renderer serves all the same, and so do the rest.
 */
export const declaredAt = (root: string, entry: string): Declared | { problem: string } | undefined => {
  const file = path.join(root, DECLARED_FILE)
  if (!existsSync(file)) return undefined
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'))
  } catch (e) {
    return { problem: `${DECLARED_FILE} is no JSON: ${(e as Error).message}` }
  }
  const parsed = DeclaredFile.safeParse(raw)
  if (!parsed.success) return { problem: `${DECLARED_FILE} doesn't parse: ${parsed.error.issues.map((i) => `${i.path.join('.') || '(top)'}: ${i.message}`).join('; ')}` }
  const { entry: declaredFor, ...declared } = parsed.data
  return declaredFor === entry ? declared : undefined
}

/** What `renderer` declares, when its `renderer.json` declares anything for its entry. */
export const declaredOf = (renderer: Renderer): Declared | undefined => (renderer.regions ? (renderer as Declared & Renderer) : undefined)

/** `renderers` each with the problems of the config's layout for it, when it declares regions to check them against. */
export const withLayoutProblems = (renderers: Renderer[], reach: LayoutReach): Renderer[] =>
  renderers.map((r) => {
    const declared = declaredOf(r)
    return declared ? { ...r, layoutProblems: layoutProblems(r.name, r.configLayout, declared, reach) } : r
  })

/** The renderer `/` opens: the config's `renderer`, `page` unless set. Naming none of the renderers is a config error. */
export const defaultRenderer = (config: Config, renderers: Renderer[]): Renderer => {
  const name = config.renderer ?? DEFAULT_RENDERER
  const renderer = renderers.find((r) => r.name === name)
  if (!renderer) throw new ConfigError(`renderer "${name}" in the config is none of the renderers: ${renderers.map((r) => r.name).join(', ')}`)
  return renderer
}

/** The file `/r/<name>/<file>` serves: anything below the renderer's root and not hidden there, `undefined` for any other path. */
export const rendererFile = (renderer: Renderer, file: string): string | undefined => fileBelow(renderer.root, file)

/** `file` as a path below `root`, none of it hidden; `undefined` when it leaves `root` or passes through a hidden name. */
export const fileBelow = (root: string, file: string): string | undefined => {
  const full = path.join(root, file)
  const rel = path.relative(root, full)
  return rel.startsWith('..') || path.isAbsolute(rel) || hiddenBelow(root, full) ? undefined : full
}

/** Each renderer's themes, by name: the absolute paths of the stylesheets its pages load after their own, in order. */
export type Themes = Record<string, string[]>

/**
 * Each renderer's themes: the one its config's `renderers.<name>.theme` names among those the accepted extensions offer
 * (`offered`), then the config's `renderers.<name>.themes`, so the config's come last and win. An offered theme the
 * config doesn't name loads nothing, nor does a name nothing offers (`tower config check` says it). A `theme` that is no
 * string, or `themes` that are no list of absolute paths, is a config error.
 */
export const themesOf = (config: Config, offered: Record<string, OfferedTheme[]>): Themes =>
  Object.fromEntries(
    Object.entries(config.renderers ?? {}).flatMap(([name, r]): [string, string[]][] => {
      const files = [...activeTheme(name, r?.theme, offered[name] ?? []), ...tweaks(name, r?.themes)]
      return files.length ? [[name, files]] : []
    }),
  )

/** The stylesheet of the offered theme `theme` names, none when it names none or one nothing offers. */
const activeTheme = (renderer: string, theme: unknown, offered: OfferedTheme[]): string[] => {
  if (theme === undefined) return []
  if (typeof theme !== 'string') throw new ConfigError(`renderers.${renderer}.theme in the config: the id of a theme an extension offers, like harbor/harbor`)
  return offered.filter((t) => t.id === theme).map((t) => t.file)
}

/** The config's own stylesheets for a renderer, loaded after its active theme. */
const tweaks = (renderer: string, themes: unknown): string[] => {
  if (themes === undefined) return []
  if (!Array.isArray(themes) || !themes.every((t) => typeof t === 'string' && path.isAbsolute(t)))
    throw new ConfigError(`renderers.${renderer}.themes in the config: a list of the absolute paths of stylesheets`)
  return themes
}

/** Where theme `n` of `renderer` is served: its own name below a path of its own. */
export const themeUrl = (renderer: string, n: number, file: string): string =>
  `/renderers/${encodeURIComponent(renderer)}/themes/${n}/${encodeURIComponent(path.basename(file))}`

/** The URLs of each renderer's themes, in order: what the board carries, so a page follows a change of them live. */
export const themeUrls = (themes: Themes): Themes =>
  Object.fromEntries(Object.entries(themes).map(([name, files]) => [name, files.map((file, n) => themeUrl(name, n, file))]))

/**
 * The stylesheet a renderer's pages load its themes through, `/renderers/<name>/themes.css`: each theme imported into
 * a layer of its own inside `theme`, the last of a page's layers (`/design.css`), in order, so a later theme outweighs an
 * earlier one, and every theme the tower, whatever their selectors weigh. A theme names no layer.
 */
export const themeSheet = (urls: string[]): string => urls.map((url, n) => `@import url("${url}") layer(theme.t${n});`).join('\n')

/**
 * The file `/renderers/<name>/themes/<n>/<file>` serves: the renderer's theme `n` itself, when `file` is its name.
 * Nothing beside it is served, so a theme kept in a folder of other files shows none of them.
 */
export const themeFile = (themes: Themes, renderer: string, n: number, file: string): string | undefined => {
  const theme = themes[renderer]?.[n]
  return theme !== undefined && file === path.basename(theme) ? theme : undefined
}
