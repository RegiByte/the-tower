/** The renderers the tower serves at `/r/<name>/`: the built-ins, then the config's, which add to them or override them. */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { hiddenBelow } from './shelf.ts'
import { chordProblem } from './shared/keymap.ts'
import { ConfigError, type Config, type Renderer, type RendererConfig } from './shared/model.ts'
import { capabilityOf, type Manifest } from './shared/extensions.ts'
import { BUDGETS, HOLDS, KIT_MEMBERS, OVERFLOWS, overflowOf, REGION_ID, SCALES, type Declared, type Hold, type Layout, type LayoutEntry, type LayoutProblem, type Overflow, type Region, type RendererRegions } from './shared/regions.ts'

/** The default of `renderer` in the config. */
export const DEFAULT_RENDERER = 'page'

const RENDERERS_DIR = path.join(import.meta.dirname, '..', 'renderers')

/** The renderers the core declares: the tower page, the week as a yearbook, and Tower 3D once `npm run tower3d` has built `out/`. */
const BUILT_INS: Record<string, RendererConfig> = {
  page: { root: path.join(RENDERERS_DIR, 'page') },
  week: { root: path.join(RENDERERS_DIR, 'week') },
  tower3d: { root: path.join(RENDERERS_DIR, 'tower3d', 'out') },
}

/** A name that is one path segment of `/r/<name>/`. */
export const RENDERER_NAME = /^[\w-]+$/

/** Each renderer's name and its config, the built-in's fields under the config's: the built-ins in their order, then the config's own. */
const configsOf = (config: Config): [string, RendererConfig][] => {
  const declared = config.renderers ?? {}
  return [...new Set([...Object.keys(BUILT_INS), ...Object.keys(declared)])].map((name) => [name, { ...BUILT_INS[name], ...declared[name] }])
}

/**
 * The regions each renderer declares in its `renderer.json`: what no extension lays out, the config's renderers
 * included. Read apart from `renderersOf`, so a config's bad layout doesn't hide them; a renderer given no root declares none.
 */
export const rendererRegions = (config: Config): RendererRegions =>
  configsOf(config).map(([name, { root, entry = 'index.html' }]) => {
    const declared = root ? declaredAt(root, entry) : undefined
    return { name, regions: declared && 'regions' in declared ? declared.regions.map((r) => r.id) : [] }
  })

/** Every renderer: the built-ins in their order, then the config's own. A config renderer with no root to serve is a config error. */
export const renderersOf = (config: Config): Renderer[] =>
  configsOf(config).map(([name, renderer]) => {
    if (!RENDERER_NAME.test(name)) throw new ConfigError(`renderers."${name}" in the config: a renderer's name is letters, digits, "_" and "-"`)
    const { root, entry = 'index.html', settings = {}, layout = {} } = renderer
    if (!root) throw new ConfigError(`renderers.${name} in the config has no "root": the directory its built files are in`)
    const configLayout = LayoutSchema.safeParse(layout)
    if (!configLayout.success) throw new ConfigError(`renderers.${name}.layout in the config: ${layoutIssues(configLayout.error)}`)
    return { name, root, entry, available: existsSync(path.join(root, entry)), settings, configLayout: configLayout.data, ...declaredAt(root, entry) }
  })

/** The file a renderer declares its regions in, at its root. */
export const DECLARED_FILE = 'renderer.json'

const RegionSchema: z.ZodType<Region> = z.strictObject({
  id: z.string().regex(REGION_ID, 'a subject kind and a place: card.head, item.row, reviews.thread.head'),
  subject: z.string().min(1),
  holds: z.array(z.enum(HOLDS)).min(1),
  scale: z.enum(SCALES).optional(),
  arity: z.enum(['one', 'tabs']).optional(),
  description: z.string().min(1).optional(),
  overflows: z
    .array(z.enum(OVERFLOWS))
    .min(1)
    .refine((forms) => new Set(forms).size === forms.length, { message: 'each form once' })
    .optional(),
})

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
  }),
)

/** What a renderer's layout is checked against of the extensions that would start: the regions they declare, and the ids a pin can name. */
export type LayoutReach = { regions: Region[]; offered: string[] }

/** What `manifests`, those of the extensions that would start, give a layout's checks: their regions, and their verbs', commands' and lines' ids. */
export const layoutReachOf = (manifests: Manifest[]): LayoutReach => ({
  regions: manifests.flatMap((m) => Object.entries(m.regions ?? {}).map(([id, { layout: _, ...region }]) => ({ id, ...region }))),
  offered: manifests.flatMap((m) => {
    const cap = capabilityOf(m)
    const adds = m.folds?.card?.adds ?? []
    return [...Object.keys(m.verbs ?? {}), ...Object.keys(m.commands ?? {})].map((name) => `${cap}/${name}`).concat(adds.includes('lines') ? [cap] : [])
  }),
})

/** The holds a pin, an unpin or a hide of an action can name in a region. */
const PINNABLE: readonly Hold[] = ['verbs', 'commands', 'lines']

const FORM_VERB: Record<Overflow, string> = { menu: 'tucks into a menu', count: 'counts', wrap: 'wraps', scroll: 'scrolls' }

const BUDGET_NOUN: Record<keyof typeof BUDGETS, string> = { lines: 'line', badges: 'badge', actions: 'action' }

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
    return regionProblems(renderer, at, region, entry, declared.layout[id], reach.offered)
  })
}

/** The problems of one region's entry in the config's layout; `own`, the renderer's own entry for it, the layer below. */
const regionProblems = (renderer: string, at: string, region: Region, entry: LayoutEntry, own: LayoutEntry | undefined, offered: readonly string[]): LayoutProblem[] => {
  const fail = (key: string, problem: string): LayoutProblem => ({ level: 'fail', key: `${at}.${key}`, problem })
  const warn = (key: string, problem: string): LayoutProblem => ({ level: 'warn', key: `${at}.${key}`, problem })
  const pins = region.holds.some((h) => PINNABLE.includes(h))
  if (!region.overflows?.length && pins) {
    const unread = `${renderer} doesn't read ${region.id}'s pins, hides, form or budgets yet`
    return [
      ...(['overflow', 'pinned', 'unpinned', ...(Object.keys(BUDGETS) as (keyof typeof BUDGETS)[])] as const).filter((key) => entry[key] !== undefined).map((key) => fail(key, unread)),
      ...(entry.hidden ?? []).flatMap((id, n) => (offered.includes(id) ? [fail(`hidden[${n}]`, unread)] : [])),
    ]
  }
  const form = region.overflows?.length ? overflowOf(region as Region & { overflows: Overflow[] }, entry) : undefined
  const nothingToPin = `${region.id} holds no actions or lines to pin${region.holds.includes('views') ? `: its ${region.arity === 'tabs' ? 'tabs' : 'views'} take order` : ''}`
  return [
    ...(entry.overflow === undefined
      ? []
      : !region.overflows?.length
        ? [fail('overflow', `${renderer} offers no overflow choice in ${region.id}`)]
        : region.overflows.includes(entry.overflow)
          ? []
          : [fail('overflow', `${renderer} draws ${region.id} as ${either(region.overflows)}, not ${entry.overflow}`)]),
    ...(Object.keys(BUDGETS) as (keyof typeof BUDGETS)[]).flatMap((key): LayoutProblem[] => {
      if (entry[key] === undefined) return []
      if (!BUDGETS[key].some((h) => region.holds.includes(h))) return [fail(key, `${region.id} holds no ${key}`)]
      return form === 'wrap' || form === 'scroll' ? [warn(key, `${region.id} ${FORM_VERB[form]}, so it draws every ${BUDGET_NOUN[key]}: ${key} is unused`)] : []
    }),
    ...(entry.pinned === undefined
      ? []
      : !pins
        ? [fail('pinned', nothingToPin)]
        : entry.pinned.flatMap((id, n) =>
            offered.includes(id) ? [] : [warn(`pinned[${n}]`, `no extension that would start offers "${id}"${offered.length ? `: they offer ${offered.join(', ')}` : ''}`)],
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
  regions: z.array(RegionSchema).refine((regions) => new Set(regions.map((r) => r.id)).size === regions.length, { message: 'each region id once' }),
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
