/**
 * Tower 3D boots: the built `renderers/tower3d/out/` opened on a fixture board in headless Chrome, through its door
 * (`window.tower3d.ready()`), builds its first board and draws a scene, with no page error, unhandled rejection,
 * console error or failed load on the way. CI runs it after `npm run tower3d`.
 *
 *   npm run test:tower3d-boot
 *
 * The page is served by a tower alone (`src/tower/server.ts`) over a throwaway system root with no projects and the
 * quota probe off: a fixture board needs no host, terms or sessions, only the tower's routes (`/tower.js`, the
 * design, `/renderers`, `/origins`). Chrome uses the GPU where it finds one (on CI, the macOS runner's paravirtual
 * Metal device) and falls back to SwiftShader on a machine with none; the WebGL renderer it used is printed.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { freePort, sleep, withPage } from './drive.ts'

const REPO = path.join(import.meta.dirname, '..')
const ENTRY = path.join(REPO, 'renderers', 'tower3d', 'out', 'tower3d.js')
const READY_MS = 90_000

async function answers(url: string) {
  for (let i = 0; i < 100; i++) {
    if (await fetch(`${url}/renderers`).then((r) => r.ok, () => false)) return
    await sleep(100)
  }
  throw new Error(`the tower did not answer at ${url}`)
}

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
  const root = mkdtempSync(path.join(os.tmpdir(), 'tower3d-boot-'))
  const port = await freePort()
  mkdirSync(path.join(root, 'sessions'))
  writeFileSync(path.join(root, 'config.json'), JSON.stringify({ port, projects: {}, probes: { quota: { off: true } } }))
  const tower = spawn(process.execPath, ['--import', 'tsx', 'src/tower/server.ts'], { cwd: REPO, stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, TOWER_CONFIG: path.join(root, 'config.json') } })
  try {
    const url = `http://127.0.0.1:${port}`
    await answers(url)
    const started = Date.now()
    const { booted, errors } = await withPage(`${url}/r/tower3d/?board=busy&seed=1&stepped&at=2026-10-04T15:00`, { flags: ['--enable-unsafe-swiftshader'] }, async (page) => ({ booted: (await page.eval(BOOT)) as Booted, errors: page.errors }))
    console.log(`booted in ${Date.now() - started} ms on ${booted.renderer}: ${JSON.stringify(booted.counts)}, ${booted.drawn.calls} draw calls`)
    const failed = problems(booted, errors)
    if (failed.length) throw new Error(`Tower 3D did not boot clean:\n  ${failed.join('\n  ')}`)
  } finally {
    if (tower.exitCode === null) await new Promise((resolve) => (tower.once('exit', resolve), tower.kill()))
    rmSync(root, { recursive: true, force: true })
  }
}

await main().catch((err: Error) => {
  console.error(err.message)
  process.exitCode = 1
})
