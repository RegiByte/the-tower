/**
 * Tour: Tower 3D shot from a fixed set of spots on the busy fixture board, by day and by night, to judge how the
 * building looks after a visual change. Same seed, same stepped clock and same wall-clock date on every run, so two
 * tours of the same code are the same pictures.
 *
 *   npm run sandbox -- up                  the tower it reads (TOWER_SANDBOX's, at the port in its config)
 *   npm run tool:tour -- <label>           builds the bundle, writes <TOWER_TOUR>/<label>/<time>-<spot>.png
 *   npm run tool:tour -- <label> --only lobby,roof
 *
 * TOWER_TOUR defaults to /tmp/tower-tour. Spots are in the busy board's level coordinates: yaw 0 faces +z (the front glass),
 * π/2 faces +x.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { withPage } from './drive.ts'
import { sandboxUrl } from './sandbox-root.ts'

const REPO = path.join(import.meta.dirname, '..')
const ROOT = process.env.TOWER_TOUR ?? '/tmp/tower-tour'
const TOWER = sandboxUrl()
const TIMES = { day: '2026-10-04T15:00', night: '2026-10-04T22:30' }

type Spot = { name: string; level: number | 'roof'; x: number; z: number; yaw: number; pitch: number } | { name: string; key: string }

const SPOTS: Spot[] = [
  { name: 'f1-door', level: 1, x: 0, z: -5.4, yaw: 0, pitch: -0.12 },
  { name: 'f1-desks', level: 1, x: 18.4, z: 8.6, yaw: -2.25, pitch: -0.22 },
  { name: 'f1-front', level: 1, x: 2, z: 8.4, yaw: -1.75, pitch: -0.2 },
  { name: 'f1-right', level: 1, x: 2, z: 8.4, yaw: 1.75, pitch: -0.2 },
  { name: 'f1-back', level: 1, x: -6.2, z: 5.2, yaw: Math.PI + 0.5, pitch: -0.05 },
  { name: 'f1-lounge', level: 1, x: -8.4, z: 2.2, yaw: -0.8, pitch: -0.2 },
  { name: 'f1-coffee', level: 1, x: 13.6, z: -4.6, yaw: 1.0, pitch: -0.15 },
  { name: 'control-room', level: 1, x: -15.6, z: 1.2, yaw: Math.PI, pitch: 0.02 },
  { name: 'control-front', level: 1, x: -15.6, z: -3.4, yaw: 0, pitch: -0.12 },
  { name: 'shared-wall', level: 1, x: 10.3, z: -3.2, yaw: Math.PI, pitch: 0.08 },
  { name: 'f2-door', level: 2, x: 0, z: -5.4, yaw: 0, pitch: -0.12 },
  { name: 'f2-lounge', level: 2, x: -8.4, z: 2.2, yaw: -0.8, pitch: -0.2 },
  { name: 'f3-coffee', level: 3, x: 13.6, z: -4.6, yaw: 1.0, pitch: -0.15 },
  { name: 'lobby', level: 0, x: 0, z: 9.2, yaw: Math.PI, pitch: -0.08 },
  { name: 'lobby-side', level: 0, x: 17.5, z: -3, yaw: -1.1, pitch: -0.12 },
  { name: 'lobby-city', level: 0, x: -3.2, z: 8.6, yaw: -2.35, pitch: -0.32 },
  { name: 'roof', level: 'roof', x: 12, z: 9.4, yaw: -2.5, pitch: -0.15 },
  { name: 'roof-back', level: 'roof', x: 0, z: 1.5, yaw: Math.PI, pitch: -0.06 },
  { name: 'outside', key: 'KeyH' },
]

const { values, positionals } = parseArgs({ allowPositionals: true, options: { only: { type: 'string' } } })
const label = positionals[0]
if (!label) throw new Error('usage: npm run tool:tour -- <label> [--only spot,spot]')
const only = values.only?.split(',')
const spots = SPOTS.filter((s) => !only || only.includes(s.name))

const answers = await fetch(`${TOWER}/origins`).then(() => true, () => false)
if (!answers) throw new Error(`no tower at ${TOWER}: npm run sandbox -- up`)
execFileSync('npm', ['run', '-s', 'tower3d'], { cwd: REPO, stdio: 'ignore' })
const dir = path.join(ROOT, label)
if (!only) rmSync(dir, { recursive: true, force: true })
mkdirSync(dir, { recursive: true })

const walk = (spots: Spot[]) => `(async () => {
  const t = window.tower3d
  await t.ready()
  t.capture()
  t.step(2)
  const out = []
  for (const s of ${JSON.stringify(spots)}) {
    if (s.key) {
      t.key(s.key); t.step(150)
      await t.pictured()
      out.push([s.name, t.shot()])
      t.key(s.key); t.step(60)
      continue
    }
    const level = s.level === 'roof' ? (t.key('KeyR'), t.step(60), t.state().walker.level) : s.level
    t.teleport({ level, x: s.x, z: s.z, yaw: s.yaw, pitch: s.pitch })
    t.step(30)
    await t.pictured()
    out.push([s.name, t.shot()])
  }
  return out
})()`

for (const [time, at] of Object.entries(TIMES)) {
  const shots = await withPage(`${TOWER}/r/tower3d/?board=busy&seed=1&stepped&at=${at}`, {}, (page) => page.eval(walk(spots)) as Promise<[string, string][]>)
  for (const [name, png] of shots) writeFileSync(path.join(dir, `${time}-${name}.png`), Buffer.from(png.split(',', 2)[1], 'base64'))
}
console.log(`${dir}: ${spots.length * 2} shots`)
