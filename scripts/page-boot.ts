/**
 * The tower page boots: `/` opened in headless Chrome over a tower alone, its first board arrives and it draws the
 * sidebar's floor under its sign and the skyline's building under the welcome a system with no workers yet shows; a
 * click on the folded floor's sign unfolds it to its drafts tray, counting the one item kept. No page error, unhandled
 * rejection, console error or failed load on the way. CI runs it beside Tower 3D's boot.
 *
 *   npm run test:page-boot
 *
 * The tower runs alone (`scripts/tower-alone.ts`) over a throwaway system root holding one project, its hub an empty
 * directory, and one draft kept in its collection, with the quota probe off: no host, terms or sessions, so the board
 * says the host is down and the page draws that.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
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

await main().catch((err: Error) => {
  console.error(err.message)
  process.exitCode = 1
})
