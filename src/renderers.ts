/** The renderers the tower serves at `/r/<name>/`: the built-ins, then the config's, which add to them or override them. */
import { existsSync } from 'node:fs'
import path from 'node:path'
import { ConfigError, type Config, type Renderer, type RendererConfig } from './shared/model.ts'

/** The default of `renderer` in the config. */
export const DEFAULT_RENDERER = 'page'

const RENDERERS_DIR = path.join(import.meta.dirname, '..', 'renderers')

/** The renderers the core declares: the tower page, and Tower 3D once `npm run tower3d` has built `out/`. */
const BUILT_INS: Record<string, RendererConfig> = {
  page: { root: path.join(RENDERERS_DIR, 'page') },
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
    return { name, root, entry, available: existsSync(path.join(root, entry)), settings }
  })
}

/** The renderer `/` opens: the config's `renderer`, `page` unless set. Naming none of the renderers is a config error. */
export const defaultRenderer = (config: Config, renderers: Renderer[]): Renderer => {
  const name = config.renderer ?? DEFAULT_RENDERER
  const renderer = renderers.find((r) => r.name === name)
  if (!renderer) throw new ConfigError(`renderer "${name}" in the config is none of the renderers: ${renderers.map((r) => r.name).join(', ')}`)
  return renderer
}

/** The file `/r/<name>/<file>` serves: anything below the renderer's root, `undefined` for a path that leaves it. */
export const rendererFile = (renderer: Renderer, file: string): string | undefined => {
  const full = path.join(renderer.root, file)
  const rel = path.relative(renderer.root, full)
  return rel.startsWith('..') || path.isAbsolute(rel) ? undefined : full
}
