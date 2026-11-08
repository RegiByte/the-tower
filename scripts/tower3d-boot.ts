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
 * build without `--external:/lib/*` would quietly bundle a copy of the library and import none of it.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { withPage } from './drive.ts'
import { withTower } from './tower-alone.ts'

const REPO = path.join(import.meta.dirname, '..')
const ENTRY = path.join(REPO, 'renderers', 'tower3d', 'out', 'tower3d.js')
const READY_MS = 90_000
const PAGES = ['tower3d', 'lab', 'dresser', 'editor']
const LIBRARY_IMPORT = /\bfrom\s*"\/lib\/[\w-]+\.js"/

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
  await withTower('tower3d-boot', () => ({ argv: ['claude'], projects: {}, extensions: { quota: { off: true } } }), async (url) => {
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
