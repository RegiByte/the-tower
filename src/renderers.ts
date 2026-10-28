/** The renderers the tower serves at `/r/<name>/`: the built-ins, then the config's, which add to them or override them. */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { hiddenBelow } from './shelf.ts'
import { chordProblem } from './shared/keymap.ts'
import { ConfigError, type Config, type Renderer, type RendererConfig } from './shared/model.ts'
import { HOLDS, KIT_MEMBERS, SCALES, type Declared, type Layout, type Region } from './shared/regions.ts'

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

/** Every renderer: the built-ins in their order, then the config's own. A config renderer with no root to serve is a config error. */
export const renderersOf = (config: Config): Renderer[] => {
  const declared = config.renderers ?? {}
  const names = [...new Set([...Object.keys(BUILT_INS), ...Object.keys(declared)])]
  return names.map((name) => {
    if (!RENDERER_NAME.test(name)) throw new ConfigError(`renderers."${name}" in the config: a renderer's name is letters, digits, "_" and "-"`)
    const { root, entry = 'index.html', settings = {} } = { ...BUILT_INS[name], ...declared[name] }
    if (!root) throw new ConfigError(`renderers.${name} in the config has no "root": the directory its built files are in`)
    return { name, root, entry, available: existsSync(path.join(root, entry)), settings, ...declaredAt(root, entry) }
  })
}

/** The file a renderer declares its regions in, at its root. */
export const DECLARED_FILE = 'renderer.json'

const RegionSchema: z.ZodType<Region> = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9-]*(\.([a-z][a-z0-9-]*|\*))*\.[a-z][a-z0-9-]*$/, 'a subject kind and a place: card.head, item.row, reviews.thread.head'),
  subject: z.string().min(1),
  holds: z.array(z.enum(HOLDS)).min(1),
  scale: z.enum(SCALES).optional(),
  arity: z.enum(['one', 'tabs']).optional(),
  description: z.string().min(1).optional(),
})

const LayoutSchema: z.ZodType<Layout> = z.record(
  z.string(),
  z.strictObject({
    order: z.array(z.string()).optional(),
    hidden: z.array(z.string()).optional(),
    open: z.strictObject({ view: z.string(), subject: z.string().optional() }).optional(),
    options: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
  }),
)

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
 * that doesn't parse is a config error naming it.
 */
export const declaredAt = (root: string, entry: string): Declared | undefined => {
  const file = path.join(root, DECLARED_FILE)
  if (!existsSync(file)) return undefined
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'))
  } catch (e) {
    throw new ConfigError(`${file} is no JSON: ${(e as Error).message}`)
  }
  const parsed = DeclaredFile.safeParse(raw)
  if (!parsed.success) throw new ConfigError(`${file} doesn't parse: ${parsed.error.issues.map((i) => `${i.path.join('.') || '(top)'}: ${i.message}`).join('; ')}`)
  const { entry: declaredFor, ...declared } = parsed.data
  return declaredFor === entry ? declared : undefined
}

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
