/**
 * Frames: a before/after check that a Tower 3D change draws and behaves exactly as before. It walks a fixed scenario
 * (`scripts/frames.scenario.js`) through the door on each fixture board, with the clock stepped, chance seeded and the
 * wall clock pinned, and keeps every stage's `state()` and scene PNG. Two recordings of the same code are identical
 * byte for byte, so any difference is the change.
 *
 *   npm run sandbox -- up                         the tower it reads (TOWER_SANDBOX's, at the port in its config)
 *   npm run tool:frames -- record before          builds the bundle, walks every board twice (a scenario that does
 *                                                 not repeat is refused), keeps the walk under TOWER_FRAMES/before
 *   …change the code…
 *   npm run tool:frames -- record after
 *   npm run tool:frames -- compare before after   each stage's state fields and PNG; exits 1 on any difference and
 *                                                 prints the PNGs to look at
 *   npm run tool:frames -- list                   the recordings kept
 *
 * TOWER_FRAMES defaults to /tmp/tower-frames. Use it for refactors (nothing should change) and to show what a visual change
 * changed (the differing stages and their PNGs). Fixture boards never change after the first, so a change to what
 * happens between boards (desks arriving, leaving) needs a live sandbox run too.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { withPage } from './drive.ts'
import { sandboxUrl } from './sandbox-root.ts'

const REPO = path.join(import.meta.dirname, '..')
const ROOT = process.env.TOWER_FRAMES ?? '/tmp/tower-frames'
const TOWER = sandboxUrl()
const BOARDS = ['busy', 'empty', 'tall', 'party', 'review', 'attention', 'tidy', 'logbook']
const PAGE = (board: string) => `${TOWER}/r/tower3d/?board=${board}&seed=1&stepped&at=2026-10-04T15:00`
const SCENARIO = readFileSync(path.join(import.meta.dirname, 'frames.scenario.js'), 'utf8')

/** A stage as the page answers it: `png` is the scene as a data URL. */
type Walked = { name: string; state?: Record<string, unknown>; png?: string; error?: string }
/** A stage as kept: the PNG as a file beside the recording, and its hash. */
type Stage = Omit<Walked, 'png'> & { png?: { file: string; sha: string } }

const sha = (data: Buffer) => createHash('sha256').update(data).digest('hex').slice(0, 16)
const pngOf = (dataUrl: string) => Buffer.from(dataUrl.split(',', 2)[1], 'base64')
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

const walk = (board: string) => withPage(PAGE(board), {}, (page) => page.eval(SCENARIO) as Promise<Walked[]>)

/** The stages whose state or picture differ between two walks, by name. */
const differing = (a: Walked[], b: Walked[]) =>
  a.flatMap((x, i) => (same({ ...x, png: x.png && sha(pngOf(x.png)) }, { ...b[i], png: b[i]?.png && sha(pngOf(b[i].png!)) }) ? [] : [x.name]))

async function record(label: string) {
  const answers = await fetch(`${TOWER}/origins`).then(() => true, () => false)
  if (!answers) throw new Error(`no tower at ${TOWER}: npm run sandbox -- up`)
  execFileSync('npm', ['run', '-s', 'tower3d'], { cwd: REPO, stdio: 'ignore' })
  const dir = path.join(ROOT, label)
  rmSync(dir, { recursive: true, force: true })
  for (const board of BOARDS) {
    const [first, second] = [await walk(board), await walk(board)]
    const unsteady = differing(first, second)
    if (unsteady.length) throw new Error(`${board}: the scenario does not repeat at ${unsteady.join(', ')}: something reaches a frame outside the clock, the seed or ?at`)
    mkdirSync(path.join(dir, board), { recursive: true })
    const stages: Stage[] = first.map(({ png, ...stage }, i) => {
      if (!png) return stage
      const file = `${String(i).padStart(2, '0')}-${stage.name}.png`
      const data = pngOf(png)
      writeFileSync(path.join(dir, board, file), data)
      return { ...stage, png: { file, sha: sha(data) } }
    })
    writeFileSync(path.join(dir, `${board}.json`), JSON.stringify(stages, null, 1))
    const errors = stages.filter((s) => s.error).map((s) => `${s.name} (${s.error})`)
    console.log(`${board}: ${stages.length} stages${errors.length ? `, failed steps: ${errors.join('; ')}` : ''}`)
  }
  console.log(`recorded ${dir}`)
}

const load = (label: string, board: string): Stage[] => {
  const file = path.join(ROOT, label, `${board}.json`)
  if (!existsSync(file)) throw new Error(`no recording ${label} of ${board}: npm run tool:frames -- record ${label}`)
  return JSON.parse(readFileSync(file, 'utf8'))
}

function compare(a: string, b: string) {
  let changed = 0
  for (const board of BOARDS) {
    const [before, after] = [load(a, board), load(b, board)]
    const lines: string[] = []
    for (let i = 0; i < Math.max(before.length, after.length); i++) {
      const [x, y] = [before[i], after[i]]
      if (!x || !y) {
        lines.push(`  ${(x ?? y).name}: only in ${x ? a : b}`)
        continue
      }
      if (x.name !== y.name) {
        lines.push(`  stage ${i}: ${x.name} in ${a}, ${y.name} in ${b}: the scenario changed between them`)
        continue
      }
      const fields = [...new Set([...Object.keys(x.state ?? {}), ...Object.keys(y.state ?? {})])].filter((k) => !same(x.state?.[k], y.state?.[k]))
      const pictured = x.png?.sha !== y.png?.sha
      if (!fields.length && !pictured && same(x.error, y.error)) continue
      const what = [...fields.map((k) => `${k}: ${JSON.stringify(x.state?.[k])} → ${JSON.stringify(y.state?.[k])}`), ...(same(x.error, y.error) ? [] : [`error: ${x.error} → ${y.error}`])]
      lines.push(`  ${x.name}${pictured ? `: picture differs (${path.join(ROOT, a, board, x.png!.file)} vs ${path.join(ROOT, b, board, y.png!.file)})` : ''}`)
      for (const w of what) lines.push(`    ${w}`)
    }
    changed += lines.length
    console.log(lines.length ? `${board}: differs\n${lines.join('\n')}` : `${board}: identical (${before.length} stages)`)
  }
  if (changed) process.exitCode = 1
}

const list = () => (existsSync(ROOT) ? readdirSync(ROOT).forEach((label) => console.log(label)) : console.log(`nothing recorded in ${ROOT}`))

const [command, ...args] = process.argv.slice(2)
await (async () => {
  if (command === 'record' && args.length === 1) return record(args[0])
  if (command === 'compare' && args.length === 2) return compare(args[0], args[1])
  if (command === 'list') return list()
  throw new Error('usage: npm run tool:frames -- record <label> | compare <a> <b> | list')
})().catch((err: Error) => {
  console.error(err.message)
  process.exitCode = 1
})
