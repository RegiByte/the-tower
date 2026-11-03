/**
 * The tower page boots: `/` opened in headless Chrome over a tower alone, its first board arrives and it draws the
 * sidebar's floor under its sign and the skyline's building under the welcome a system with no workers yet shows; a
 * click on the folded floor's sign unfolds it to its drafts tray, counting the one item kept. No page error, unhandled
 * rejection, console error or failed load on the way. CI runs it beside Tower 3D's boot.
 *
 * Then, over a second system holding one worker the host stopped mid-turn, its card opened on its Reviews tab: every
 * module loads once on the page. A served module and the file it re-exports are one instance (`pressing`, `drawPanel`);
 * a press through `/press.js` holds a request open, and a click on the Reviews tab's Add note, a control of the same
 * identity wired through the reviews client's own import, is ignored, sending nothing; and no file below `src/` or package is fetched twice, at its URL or at its hashed one.
 *
 *   npm run test:page-boot
 *
 * The tower runs alone (`scripts/tower-alone.ts`) over a throwaway system root holding one project, its hub an empty
 * directory, and one draft kept in its collection, with the quota probe off: no host, terms or sessions, so the board
 * says the host is down and the page draws that. The second root adds a session log, its hub a git repository.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { withPage } from './drive.ts'
import { withTower } from './tower-alone.ts'

const DRAWN_MS = 15_000

function seed(root: string) {
  const hub = path.join(root, 'lab')
  const drafts = path.join(root, 'collections', 'lab', 'drafts')
  mkdirSync(hub)
  mkdirSync(drafts, { recursive: true })
  writeFileSync(path.join(drafts, '20261004T150000Z-a-kept-prompt.md'), '# A kept prompt\n\nStarts a worker later.\n')
  return {
    argv: ['claude'],
    projects: { lab: { name: 'lab', hub, repos: [] } },
    collections: { drafts: { label: 'Drafts', description: 'Prompts kept for later.' } },
    extensions: { quota: { off: true } },
  }
}

/** In the page: waits up to DRAWN_MS for every selector to match. */
const until = (...css: string[]) => `(async () => {
  const drawn = () => ${JSON.stringify(css)}.every((s) => document.querySelector(s))
  for (const end = Date.now() + ${DRAWN_MS}; !drawn() && Date.now() < end;) await new Promise((r) => setTimeout(r, 50))
})()`

/** In the page: the middle of the floor's fold button. */
const FOLD = `(() => { const r = document.querySelector('#floors .floor [data-floor-fold]').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2] })()`

/** In the page: what it drew. */
const DRAWN = `({
  floors: document.querySelectorAll('#floors .floor').length,
  floor: document.querySelector('#floors .floor .sign .name')?.textContent ?? null,
  buildings: document.querySelectorAll('[data-view="tower/skyline"] .city .building').length,
  welcome: !!document.querySelector('[data-view="tower/skyline"] .welcome'),
})`

type Drawn = { floors: number; floor: string | null; buildings: number; welcome: boolean }

/** In the page: the drafts its floor's tray counts, once unfolded. */
const DRAFTS = `document.querySelector('#floors .floor [data-view="drafts/tray"] .tray')?.textContent.match(/(\\d+) in drafts/)?.[1] ?? null`

/** What a booted page fails to show, in words. */
const problems = (d: Drawn, drafts: string | null, errors: string[]) => [
  ...(d.floors === 1 && d.floor === 'lab' ? [] : [`the sidebar drew ${d.floors} floors${d.floor ? ` (first ${d.floor})` : ''}, not the floor lab`]),
  ...(drafts === '1' ? [] : [`the unfolded floor counts ${drafts ?? 'no'} drafts, not the one kept`]),
  ...(d.buildings === 1 ? [] : [`the skyline drew ${d.buildings} buildings, not one`]),
  ...(d.welcome ? [] : ['no welcome on the skyline']),
  ...errors,
]

const WORKER = '20261009-224645-4080'

/** The first system with one worker the host stopped mid-turn (a recorded log), in a hub with a review thread to write on. */
function seedWorker(root: string) {
  const config = seed(root)
  const hub = path.join(root, 'lab')
  execFileSync('git', ['init', '-q', '-b', 'main', hub])
  execFileSync('git', ['-C', hub, '-c', 'user.name=page-boot', '-c', 'user.email=page-boot@localhost', 'commit', '-q', '--allow-empty', '-m', 'first'])
  const [header, ...events] = readFileSync(path.join(import.meta.dirname, '..', 'test', 'fixtures', 'host-stopped-mid-turn.jsonl'), 'utf8').trim().split('\n')
  const opened = { ...JSON.parse(header!), id: WORKER, cwd: hub, startedAt: Date.now() - 1000 }
  writeFileSync(path.join(root, 'sessions', `${WORKER}.jsonl`), [JSON.stringify(opened), ...events].join('\n') + '\n')
  return config
}

/** In the page: what says each module loaded once, with the card view and the Reviews tab mounted. */
const ONCE = `(async () => {
  const same = async (served, file, name) => (await import(served))[name] === (await import(file))[name]
  const identical = { pressing: await same('/press.js', '/shared/press.js', 'pressing'), drawPanel: await same('/panels.js', '/shared/panel-kit.js', 'drawPanel') }
  const add = document.querySelector('[data-view="reviews/thread"] [data-note-add]')
  const twin = add.cloneNode(true)
  twin.hidden = true
  document.body.append(twin)
  const { pressing } = await import('/press.js')
  let release
  const held = pressing(twin, () => new Promise((r) => (release = r)))
  const sent = () => performance.getEntriesByType('resource').filter((e) => new URL(e.name).pathname.endsWith('/append')).length
  const before = sent()
  add.click()
  await new Promise((r) => setTimeout(r, 1000))
  const busy = add.getAttribute('aria-busy') === 'true'
  const appends = sent() - before
  release()
  await held
  twin.remove()
  const fetched = performance.getEntriesByType('resource').map((e) => new URL(e.name).pathname).filter((p) => /^\\/(shared|src|vendor)\\//.test(p)).map((p) => p.replace(/\\.[0-9a-f]{10}\\.js$/, '.js'))
  return { identical, busy, appends, fetched: fetched.length, twice: [...new Set(fetched.filter((p, i) => fetched.indexOf(p) !== i))] }
})()`

type Once = { identical: Record<string, boolean>; busy: boolean; appends: number; fetched: number; twice: string[] }

/** What a page loading each module once fails to show, in words. */
const onceProblems = (o: Once, errors: string[]) => [
  ...Object.entries(o.identical).flatMap(([name, same]) => (same ? [] : [`${name} is two instances: the served module's is not its file's`])),
  ...(o.busy ? [] : ["the Reviews tab's Add note isn't busy while a control of its identity is pressed through /press.js"]),
  ...(o.appends === 0 ? [] : [`the Reviews tab's Add note sent ${o.appends} note(s) while a control of its identity was in flight`]),
  ...(o.fetched ? [] : ['the page fetched no /shared/, /src/ or /vendor/ module']),
  ...o.twice.map((url) => `${url} was fetched twice`),
  ...errors,
]

/** The second check: one worker's card on its Reviews tab, every module loaded once. */
async function once() {
  await withTower('page-once', seedWorker, async (url) => {
    const { result, errors } = await withPage(`${url}/#${WORKER}/reviews`, {}, async (page) => {
      await page.eval(until('[data-view="tower/card"]', '[data-view="reviews/thread"] [data-note-add]'))
      return { result: (await page.eval(ONCE)) as Once, errors: page.errors }
    })
    console.log(`loaded once: ${JSON.stringify(result)}`)
    const failed = onceProblems(result, errors)
    if (failed.length) throw new Error(`the tower page did not load each module once:\n  ${failed.join('\n  ')}`)
  })
}

async function main() {
  await withTower('page-boot', seed, async (url) => {
    const started = Date.now()
    const { drawn, drafts, errors } = await withPage(`${url}/`, {}, async (page) => {
      await page.eval(until('#floors .floor .sign', '[data-view="tower/skyline"] .city .building'))
      const drawn = (await page.eval(DRAWN)) as Drawn
      if (drawn.floors) {
        await page.mouse(...((await page.eval(FOLD)) as [number, number]))
        await page.press('left', true)
        await page.press('left', false)
        await page.eval(until('#floors .floor [data-view="drafts/tray"] .tray'))
      }
      return { drawn, drafts: (await page.eval(DRAFTS)) as string | null, errors: page.errors }
    })
    console.log(`drawn in ${Date.now() - started} ms: ${JSON.stringify({ ...drawn, drafts })}`)
    const failed = problems(drawn, drafts, errors)
    if (failed.length) throw new Error(`the tower page did not boot clean:\n  ${failed.join('\n  ')}`)
  })
}

await main().then(once).catch((err: Error) => {
  console.error(err.message)
  process.exitCode = 1
})
