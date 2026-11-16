/**
 * Frames: a before/after check that a Tower 3D change draws and behaves exactly as before. It walks two fixed scenarios
 * through the door on fixture boards, with the clock stepped, chance seeded and the wall clock pinned in UTC:
 *
 *   walk     `scripts/frames.scenario.js` on every fixture board: every stage's `state()` and scene PNG
 *   panels   `scripts/frames.panels.js` on the boards its routes need: each panel opened, worked and closed, every
 *            stage's `state()`, a hash of each panel shown (its normalized markup kept beside it as `<stage>.dom.txt`)
 *            and the events Tower 3D's loops handled since the stage before (`tower3d.events()`)
 *
 * Two recordings of the same code are identical byte for byte, so any difference is the change.
 *
 *   npm run sandbox -- up                         the tower it reads (the sandbox's: sandbox-root.ts)
 *   npm run tool:frames -- record before          builds the bundle, walks every board twice (a scenario that does
 *                                                 not repeat is refused, both walks kept under
 *                                                 TOWER_FRAMES/before-unsteady), keeps the walk under TOWER_FRAMES/before
 *   npm run tool:frames -- record before panels   the same for the scenarios named alone
 *   …change the code…
 *   npm run tool:frames -- record after
 *   npm run tool:frames -- compare before after   each stage's state fields, PNG, panels and events, of every scenario
 *                                                 both hold; exits 1 on any difference and prints the PNGs and panel
 *                                                 markup to look at
 *   npm run tool:frames -- list                   the recordings kept
 *
 * The sandbox it reads is the one this checkout's own `up` started (a worker's is `/tmp/tower-<callsign>`): with none,
 * it throws `no sandbox at …` before doing anything. TOWER_FRAMES defaults to /tmp/tower-frames. Use it for refactors
 * (nothing should change) and to show what a visual change changed (the differing stages and their PNGs). Fixture
 * boards never change after the first, so a change to what happens between boards (desks arriving, leaving) needs a
 * live sandbox run too.
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
const PAGE = (board: string) => `${TOWER}/r/tower3d/?board=${board}&seed=1&stepped&at=2026-10-04T15:00`
const source = (file: string) => readFileSync(path.join(import.meta.dirname, file), 'utf8')

/** A scenario, walked on each of its boards and kept under `dir` of a recording. */
type Scenario = { name: string; dir: string; source: string; boards: string[] }
const SCENARIOS: Scenario[] = [
  { name: 'walk', dir: '', source: source('frames.scenario.js'), boards: ['busy', 'empty', 'tall', 'party', 'review', 'attention', 'tidy', 'logbook', 'crews', 'growing', 'breakroom'] },
  /**
   * busy reaches every route but the filing cabinet's, which logbook has, and a review thread's slot, which review has;
   * leaving closes each panel whose subject can leave by taking the subject away.
   */
  { name: 'panels', dir: 'panels', source: source('frames.panels.js'), boards: ['busy', 'logbook', 'review', 'leaving'] },
]

/**
 * A stage as the page answers it: `png` is the scene as a data URL; `dom` each panel shown by a hash of its markup,
 * `texts` that markup; `events` the loops' events since the stage before.
 */
type Walked = { name: string; state?: Record<string, unknown>; png?: string; dom?: Record<string, string>; texts?: Record<string, string>; events?: string[]; error?: string }
/** A stage as kept: the PNG and the panels' markup as files beside the recording, the PNG's hash. */
type Stage = Omit<Walked, 'png' | 'texts'> & { png?: { file: string; sha: string }; texts?: string }

const sha = (data: Buffer) => createHash('sha256').update(data).digest('hex').slice(0, 16)
const pngOf = (dataUrl: string) => Buffer.from(dataUrl.split(',', 2)[1], 'base64')
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
/** The panels' markup as one file: each panel under its id. */
const textsFile = (texts: Record<string, string>) => Object.entries(texts).map(([id, text]) => `## ${id}\n${text}\n`).join('\n')

/**
 * Chrome rasterizes a 2D canvas's text on the GPU, which now and then draws a glyph's edge a few pixels differently
 * from one load to the next: a label or a placard drawn the same way then differs between two walks. Drawn in software,
 * the canvases come out the same every time.
 */
const FLAGS = ['--disable-accelerated-2d-canvas']

const walk = (sc: Scenario, board: string) => withPage(PAGE(board), { timezone: 'UTC', flags: FLAGS }, (page) => page.eval(sc.source) as Promise<Walked[]>)

/** A stage as two walks are compared: its PNG by hash, its panels by their hashes alone. */
const comparable = ({ png, texts: _, ...stage }: Walked) => ({ ...stage, png: png && sha(pngOf(png)) })

/** The stages that differ between two walks, by name. */
const differing = (a: Walked[], b: Walked[]) => a.flatMap((x, i) => (b[i] && same(comparable(x), comparable(b[i])) ? [] : [x.name]))

/** Keeps both walks of a scenario that did not repeat, their differing stages' PNGs and panels and every stage, to diff. */
function keepUnsteady(label: string, sc: Scenario, board: string, unsteady: string[], ...walks: Walked[][]) {
  const dir = path.join(ROOT, `${label}-unsteady`, sc.dir, board)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  walks.forEach((walked, w) => {
    walked.forEach(({ png, texts, name }, i) => {
      if (!unsteady.includes(name)) return
      const stem = path.join(dir, `${w + 1}-${String(i).padStart(2, '0')}-${name}`)
      if (png) writeFileSync(`${stem}.png`, pngOf(png))
      if (texts) writeFileSync(`${stem}.dom.txt`, textsFile(texts))
    })
    writeFileSync(path.join(dir, `${w + 1}.json`), JSON.stringify(walked.map(comparable), null, 1))
  })
  return dir
}

async function record(label: string, scenarios: Scenario[]) {
  const answers = await fetch(`${TOWER}/origins`).then(() => true, () => false)
  if (!answers) throw new Error(`no tower at ${TOWER}: npm run sandbox -- up`)
  execFileSync('npm', ['run', '-s', 'tower3d'], { cwd: REPO, stdio: 'ignore' })
  rmSync(path.join(ROOT, label), { recursive: true, force: true })
  for (const sc of scenarios) {
    const dir = path.join(ROOT, label, sc.dir)
    for (const board of sc.boards) {
      const [first, second] = [await walk(sc, board), await walk(sc, board)]
      const unsteady = differing(first, second)
      if (unsteady.length) throw new Error(`${sc.name} on ${board}: the scenario does not repeat at ${unsteady.join(', ')}: something reaches a frame outside the clock, the seed or ?at; both walks are in ${keepUnsteady(label, sc, board, unsteady, first, second)}`)
      mkdirSync(path.join(dir, board), { recursive: true })
      const stages: Stage[] = first.map(({ png, texts, ...stage }, i) => {
        const stem = `${String(i).padStart(2, '0')}-${stage.name}`
        if (texts) writeFileSync(path.join(dir, board, `${stem}.dom.txt`), textsFile(texts))
        if (!png) return { ...stage, ...(texts && { texts: `${stem}.dom.txt` }) }
        const data = pngOf(png)
        writeFileSync(path.join(dir, board, `${stem}.png`), data)
        return { ...stage, png: { file: `${stem}.png`, sha: sha(data) }, ...(texts && { texts: `${stem}.dom.txt` }) }
      })
      writeFileSync(path.join(dir, `${board}.json`), JSON.stringify(stages, null, 1))
      const errors = stages.filter((s) => s.error).map((s) => `${s.name} (${s.error})`)
      console.log(`${sc.name} on ${board}: ${stages.length} stages${errors.length ? `, failed steps: ${errors.join('; ')}` : ''}`)
    }
  }
  console.log(`recorded ${path.join(ROOT, label)}`)
}

/** Whether a recording holds a scenario: one recorded alone holds only it. */
const holds = (label: string, sc: Scenario) => existsSync(path.join(ROOT, label, sc.dir, `${sc.boards[0]}.json`))

const load = (label: string, sc: Scenario, board: string): Stage[] => {
  const file = path.join(ROOT, label, sc.dir, `${board}.json`)
  if (!existsSync(file)) throw new Error(`no recording ${label} of ${sc.name} on ${board}: npm run tool:frames -- record ${label}`)
  return JSON.parse(readFileSync(file, 'utf8'))
}

/** What differs between two recordings of one stage, a line each: state fields, panels, events, the error. */
function stageDiff(x: Stage, y: Stage, files: (label: 'a' | 'b', file: string | undefined) => string | undefined) {
  const keys = (p?: object, q?: object) => [...new Set([...Object.keys(p ?? {}), ...Object.keys(q ?? {})])]
  const fields = keys(x.state, y.state).filter((k) => !same(x.state?.[k], y.state?.[k]))
  const panels = keys(x.dom, y.dom).filter((k) => x.dom?.[k] !== y.dom?.[k])
  return [
    ...fields.map((k) => `${k}: ${JSON.stringify(x.state?.[k])} → ${JSON.stringify(y.state?.[k])}`),
    ...panels.map((k) => `panel ${k}: ${x.dom?.[k] ?? 'hidden'} → ${y.dom?.[k] ?? 'hidden'} (${files('a', x.texts) ?? '-'} vs ${files('b', y.texts) ?? '-'})`),
    ...(same(x.events, y.events) ? [] : [`events: ${JSON.stringify(x.events)} → ${JSON.stringify(y.events)}`]),
    ...(same(x.error, y.error) ? [] : [`error: ${x.error} → ${y.error}`]),
  ]
}

function compare(a: string, b: string) {
  let changed = 0
  for (const sc of SCENARIOS) {
    const held = [a, b].filter((label) => holds(label, sc))
    if (held.length < 2) {
      console.log(`${sc.name}: not compared, ${held.length ? `only ${held[0]}` : 'neither'} holds it`)
      continue
    }
    for (const board of sc.boards) {
      const [before, after] = [load(a, sc, board), load(b, sc, board)]
      const files = (label: 'a' | 'b', file: string | undefined) => file && path.join(ROOT, label === 'a' ? a : b, sc.dir, board, file)
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
        const what = stageDiff(x, y, files)
        const pictured = x.png?.sha !== y.png?.sha
        if (!what.length && !pictured) continue
        lines.push(`  ${x.name}${pictured ? `: picture differs (${files('a', x.png?.file)} vs ${files('b', y.png?.file)})` : ''}`)
        for (const w of what) lines.push(`    ${w}`)
      }
      changed += lines.length
      console.log(lines.length ? `${sc.name} on ${board}: differs\n${lines.join('\n')}` : `${sc.name} on ${board}: identical (${before.length} stages)`)
    }
  }
  if (changed) process.exitCode = 1
}

const scenario = (name: string) => {
  const sc = SCENARIOS.find((sc) => sc.name === name)
  if (!sc) throw new Error(`no scenario ${name}: ${SCENARIOS.map((sc) => sc.name).join(', ')}`)
  return sc
}

const list = () => (existsSync(ROOT) ? readdirSync(ROOT).forEach((label) => console.log(label)) : console.log(`nothing recorded in ${ROOT}`))

const [command, ...args] = process.argv.slice(2)
await (async () => {
  if (command === 'record' && args.length >= 1) return record(args[0], args.length > 1 ? args.slice(1).map(scenario) : SCENARIOS)
  if (command === 'compare' && args.length === 2) return compare(args[0], args[1])
  if (command === 'list') return list()
  throw new Error(`usage: npm run tool:frames -- record <label> [${SCENARIOS.map((sc) => sc.name).join('|')}]... | compare <a> <b> | list`)
})().catch((err: Error) => {
  console.error(err.message)
  process.exitCode = 1
})
