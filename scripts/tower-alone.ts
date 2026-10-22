/**
 * A tower alone (`src/tower/server.ts`) on a throwaway system root at a free port, for the boot checks: no host, terms
 * or sessions, only the tower's routes. The root is removed and the tower stopped after `use`, whatever it did.
 */
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { freePort, sleep } from './drive.ts'

const REPO = path.join(import.meta.dirname, '..')

async function answers(url: string) {
  for (let i = 0; i < 100; i++) {
    if (await fetch(`${url}/renderers`).then((r) => r.ok, () => false)) return
    await sleep(100)
  }
  throw new Error(`the tower did not answer at ${url}`)
}

/**
 * Runs `use` on the URL of a tower over a fresh root holding `sessions/` and the config `seed` returns, `port` set;
 * `seed` writes whatever else the root holds (hubs, collection items) before the tower starts.
 */
export async function withTower<T>(name: string, seed: (root: string) => object, use: (url: string) => Promise<T>): Promise<T> {
  const root = mkdtempSync(path.join(os.tmpdir(), `${name}-`))
  const port = await freePort()
  mkdirSync(path.join(root, 'sessions'))
  writeFileSync(path.join(root, 'config.json'), JSON.stringify({ ...seed(root), port }))
  const tower = spawn(process.execPath, ['--import', 'tsx', 'src/tower/server.ts'], { cwd: REPO, stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, TOWER_CONFIG: path.join(root, 'config.json') } })
  try {
    const url = `http://127.0.0.1:${port}`
    await answers(url)
    return await use(url)
  } finally {
    if (tower.exitCode === null) await new Promise((resolve) => (tower.once('exit', resolve), tower.kill()))
    rmSync(root, { recursive: true, force: true })
  }
}
