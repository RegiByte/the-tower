/**
 * Tower 3D boots: the built `renderers/tower3d/out/` opened on a fixture board in headless Chrome, through its door
 * (`window.tower3d.ready()`), builds its first board and draws a scene, with no page error, unhandled rejection,
 * console error or failed load on the way. CI runs it after `npm run tower3d`.
 *
 *   npm run test:tower3d-boot
 *
 * The page is served by a tower alone (`scripts/tower-alone.ts`) over a throwaway system root with no projects and the
 * quota probe off: a fixture board needs no host, terms or sessions, only the tower's routes (`/tower.js`, the
 * design, `/renderers`, `/origins`). Chrome uses the GPU where it finds one and falls back to SwiftShader on a machine
 * with none, such as CI's Linux runner; the WebGL renderer it used is printed.
 *
 * First, each built page must import the library at run time: esbuild honours the tsconfig's `/lib/*.js` path, so a
 * build without `--external:/lib/*` would quietly bundle a copy of the library and import none of it. And no module of
 * `renderers/tower3d/src` may import itself through others: esbuild runs a bundled module's imports before its body
 * and can't hand out a binding that isn't made yet, so a cycle leaves one module reading another's before it exists,
 * and one with a top-level await on its path never finishes loading (decision `tower3d-system`).
 */
import { existsSync, readFileSync } from 'node:fs'
import { build } from 'esbuild'
import path from 'node:path'
import { withPage } from './drive.ts'
import { withTower } from './tower-alone.ts'

const REPO = path.join(import.meta.dirname, '..')
const ENTRY = path.join(REPO, 'renderers', 'tower3d', 'out', 'tower3d.js')
const READY_MS = 90_000
const PAGES = ['tower3d', 'lab', 'dresser', 'editor']
const SRC = 'renderers/tower3d/src/'
const LIBRARY_IMPORT = /\bfrom\s*"\/lib\/[\w-]+\.js"/

/** Each import cycle among Tower 3D's modules, as the modules on it, from what the pages' bundles import. */
async function importCycles() {
  const { metafile } = await build({
    absWorkingDir: REPO,
    entryPoints: PAGES.map((page) => `${SRC}${page === 'tower3d' ? 'boot' : page}.ts`),
    bundle: true,
    write: false,
    metafile: true,
    format: 'esm',
    outdir: 'out',
    logLevel: 'silent',
    external: ['/lib/*', '/x/*'],
    loader: { '.glb': 'empty', '.webm': 'empty', '.kaykit': 'empty' },
  })
  const ours = (file: string) => file.startsWith(SRC)
  const imports = new Map(Object.entries(metafile.inputs).filter(([file]) => ours(file)).map(([file, input]) => [file, input.imports.map((i) => i.path).filter(ours)]))
  // Tarjan's strongly connected components: one of more than one module, or a module importing itself, is a cycle.
  const order = new Map<string, number>()
  const low = new Map<string, number>()
  const stack: string[] = []
  const cycles: string[][] = []
  const visit = (file: string) => {
    order.set(file, order.size)
    low.set(file, order.get(file)!)
    stack.push(file)
    for (const next of imports.get(file) ?? []) {
      if (!order.has(next)) (visit(next), low.set(file, Math.min(low.get(file)!, low.get(next)!)))
      else if (stack.includes(next)) low.set(file, Math.min(low.get(file)!, order.get(next)!))
    }
    if (low.get(file) !== order.get(file)) return
    const component = stack.splice(stack.indexOf(file))
    if (component.length > 1 || imports.get(file)!.includes(file)) cycles.push(component.map((f) => f.slice(SRC.length)))
  }
  for (const file of imports.keys()) if (!order.has(file)) visit(file)
  return cycles
}

/** The built pages that hold their own copy of the library instead of importing it. */
const bundlingLibrary = () => PAGES.filter((page) => !LIBRARY_IMPORT.test(readFileSync(path.join(REPO, 'renderers', 'tower3d', 'out', `${page}.js`), 'utf8')))

/** In the page: the door ready within READY_MS, a few frames stepped, and what they built and drew. */
const BOOT = `(async () => {
  await Promise.race([tower3d.ready(), new Promise((_, reject) => setTimeout(() => reject(new Error('tower3d.ready() did not settle in ${READY_MS} ms')), ${READY_MS}))])
  const { counts, drawn } = tower3d.step(2)
  const gl = document.createElement('canvas').getContext('webgl2')
  const renderer = gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info')?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER)
  return { counts, drawn, renderer }
})()`

type Booted = { counts: Record<string, number>; drawn: { calls: number; triangles: number }; renderer: string }

/** What a booted page fails to show, in words. */
const problems = ({ counts, drawn }: Booted, errors: string[]) => [
  ...(counts.boards < 1 ? ['no board built'] : []),
  ...(['desks', 'stations', 'walls'] as const).filter((k) => !(counts[k] > 0)).map((k) => `no ${k} in the scene`),
  ...(drawn.calls > 0 ? [] : ['the last frame drew nothing']),
  ...errors,
]

async function main() {
  if (!existsSync(ENTRY)) throw new Error(`no ${path.relative(REPO, ENTRY)}: npm run tower3d`)
  const bundling = bundlingLibrary()
  if (bundling.length) throw new Error(`${bundling.map((p) => `${p}.js`).join(', ')} import nothing from /lib/: the build bundled the library, so pass --external:/lib/* to esbuild`)
  const cycles = await importCycles()
  if (cycles.length) throw new Error(`Tower 3D's modules import each other in a cycle, among each line's: move what they share into a module of its own, or hand it through the system (system.ts)\n  ${cycles.map((c) => c.join(', ')).join('\n  ')}`)
  await withTower('tower3d-boot', () => ({ runtimes: { claude: { argv: ['claude'] } }, projects: {}, extensions: { quota: { off: true } } }), async (url) => {
    const started = Date.now()
    const { booted, errors } = await withPage(`${url}/r/tower3d/?board=busy&seed=1&stepped&at=2026-10-04T15:00`, { timezone: 'UTC', flags: ['--enable-unsafe-swiftshader'] }, async (page) => ({ booted: (await page.eval(BOOT)) as Booted, errors: page.errors }))
    console.log(`booted in ${Date.now() - started} ms on ${booted.renderer}: ${JSON.stringify(booted.counts)}, ${booted.drawn.calls} draw calls`)
    const failed = problems(booted, errors)
    if (failed.length) throw new Error(`Tower 3D did not boot clean:\n  ${failed.join('\n  ')}`)
  })
}

await main().catch((err: Error) => {
  console.error(err.message)
  process.exitCode = 1
})
