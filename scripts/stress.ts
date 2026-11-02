/**
 * Stress: a crowd of extension contributions on a sandbox, and the pictures of how the page holds them, for checking
 * regions that fill up (actions, badges, lines and tabs on a card). A dev tool: it lives here and never ships as an
 * example extension. It runs only inside a sandbox, as `npm run -s sandbox -- run npm run -s tool:stress -- …`, and
 * refuses when `TOWER_SANDBOX` and `TOWER_URL` don't name one; nothing here reaches the real system.
 *
 *   tool:stress -- gen <dir> <actions> <badges> <lines> <tabs> [icons]
 *       Writes the `stress` extension into <dir> (relative to the sandbox's root, and inside it), adds it to the
 *       sandbox's config and waits for it to start. Every worker then has that many actions, badges, lines and
 *       extension tabs; `icons` gives each command a `words.icon`. Run it again with other counts to replace it.
 *
 *   tool:stress -- shots <set> <out>
 *       Takes these scenes in light and dark, at scale 1, as <out>/<set>-<scene>-<scheme>.png:
 *         full     the first worker's page, 1440x900
 *         narrow   the same at 1000x760
 *         grid4    the lab floor's grid of four workers, 1440x900
 *         grid3    the same with one cell taken out: two over one, the last cell the grid's full width
 *         grid3narrow  the grid of three at 1000x760
 *         grid2    the grid of four with two cells taken out
 *         gridnarrow  the grid of four at 1000x760
 *       It enables the grid example extension in the sandbox when its config has none, and needs four workers on the sandbox's `lab` floor (see below) and looks at no others.
 *
 * Four workers, as a script on stdin to `npm run -s sandbox -- run sh`:
 *
 *   for n in 1 2 3 4; do
 *     curl -s -XPOST $TOWER_URL/spawn -H "origin: $TOWER_URL" -H 'content-type: application/json' -d '{"project":"lab","cwd":"'$TOWER_SANDBOX'/lab"}'
 *   done
 *   npm run -s tool:stress -- gen stress 6 12 3 4 icons
 *   npm run -s tool:stress -- shots before /tmp/stress-shots
 *
 * The scenes are run by `scenes.ts`, which `tool:extension-shots` shares.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { type Scene, takeScene, until } from './scenes.ts'
import { type Counts, stressFiles } from './stress/extension.ts'

const ROOT = process.env.TOWER_SANDBOX
const URL = process.env.TOWER_URL
if (!ROOT || !URL) throw new Error('tool:stress runs only on a sandbox: start one (`npm run sandbox -- up`) and run it as `npm run -s sandbox -- run npm run -s tool:stress -- …`')
const CONFIG = path.join(ROOT, 'config.json')
if (!existsSync(CONFIG)) throw new Error(`TOWER_SANDBOX ${ROOT} has no config.json: it is not a sandbox`)
const port = (JSON.parse(readFileSync(CONFIG, 'utf8')) as { port: number }).port
if (URL !== `http://127.0.0.1:${port}`) throw new Error(`TOWER_URL ${URL} is not the sandbox's tower (http://127.0.0.1:${port}): run it inside \`npm run -s sandbox -- run\``)

const USAGE = 'usage: tool:stress -- gen <dir> <actions> <badges> <lines> <tabs> [icons]  |  tool:stress -- shots <set> <out>'
const [verb, ...args] = process.argv.slice(2)

const count = (name: string, v: string | undefined) => {
  const n = Number(v)
  if (!Number.isInteger(n) || n < 0) throw new Error(`${name} must be a whole number, got ${v ?? 'nothing'}. ${USAGE}`)
  return n
}

/**
 * Adds the extension in `folder` to the sandbox's config and waits for the tower to start it. One the config already
 * names at the same folder is restarted instead, since the tower reads a folder's code again only then; one named at
 * another folder gets the new path, which the tower starts it from.
 */
async function enable(id: string, folder: string) {
  const config = JSON.parse(readFileSync(CONFIG, 'utf8'))
  if (config.extensions?.[id]?.path === folder) await fetch(`${URL}/extension/restart`, { method: 'POST', headers: { origin: URL!, 'content-type': 'application/json' }, body: JSON.stringify({ id }) })
  else {
    config.extensions = { ...config.extensions, [id]: { path: folder } }
    writeFileSync(CONFIG, JSON.stringify(config, null, 2))
  }
  type Listed = { id: string; state: string; problems: { message: string }[] }
  const listed = async () => ((await fetch(`${URL}/extensions`).then((r) => r.json())) as { extensions: Listed[] }).extensions.find((e) => e.id === id)
  await until(`${id} to start`, async () => ((await listed())?.state === 'started' ? true : undefined)).catch(async (err: Error) => {
    const ext = await listed()
    throw new Error(`${err.message}: ${ext ? `${ext.state}, ${ext.problems.map((p) => p.message).join('; ') || 'no problems listed'}` : 'the tower lists no such extension'}`)
  })
}

async function gen([dir, a, b, l, t, icons, ...rest]: string[]) {
  if (!dir || rest.length || (icons !== undefined && icons !== 'icons')) throw new Error(USAGE)
  const counts: Counts = { actions: count('actions', a), badges: count('badges', b), lines: count('lines', l), tabs: count('tabs', t) }
  const folder = path.resolve(ROOT!, dir)
  if (path.relative(ROOT!, folder).startsWith('..') || folder === ROOT) throw new Error(`${dir} is outside the sandbox's root ${ROOT}: give a folder inside it`)
  rmSync(folder, { recursive: true, force: true })
  for (const [file, text] of Object.entries(stressFiles(counts, icons === 'icons'))) {
    mkdirSync(path.dirname(path.join(folder, file)), { recursive: true })
    writeFileSync(path.join(folder, file), text)
  }
  await enable('stress', folder)
  console.log(`stress: ${folder} started (${counts.actions} actions, ${counts.badges} badges, ${counts.lines} lines, ${counts.tabs} tabs${icons ? ', icons' : ''})`)
}

/** The sandbox's workers on its `lab` floor, in board order. */
async function labWorkers(): Promise<string[]> {
  const res = await fetch(`${URL}/board`)
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader()
  let text = ''
  while (!text.includes('\n\n')) text += (await reader.read()).value
  await reader.cancel()
  const board = JSON.parse(text.split('\n').find((l) => l.startsWith('data:'))!.slice(5)).board
  const lab = board.floors.find((f: { id: string }) => f.id === 'lab')
  const ids: string[] = lab?.cards.map((c: { id: string }) => c.id) ?? []
  if (ids.length < 4) throw new Error(`the sandbox's lab floor has ${ids.length} workers and the grid scenes need 4: spawn more (the header of scripts/stress.ts shows how)`)
  return ids
}

const GRID = 'floor%3Alab'
const WAIT_FOUR = "(async()=>{for(let i=0;i<100&&document.querySelectorAll('.grid-cell .bar-info .call').length<4;i++)await new Promise(r=>setTimeout(r,100));const n=document.querySelectorAll('.grid-cell').length;if(n<4)throw new Error('the grid drew '+n+' of 4 cells');return n})()"
/** Takes the last `k` cells out of the grid of four, one at a time. */
const takeOut = (k: number) =>
  `(async()=>{for(let k=0;k<${k};k++){document.querySelector('.grid-cell:last-child [aria-label="Take it out of the grid"]').click();await new Promise(r=>setTimeout(r,400))}const n=document.querySelectorAll('.grid-cell').length;if(n!==${4 - k})throw new Error('the grid has '+n+' cells after taking ${k} out');return n})()`

const scenes: Scene[] = [
  { name: 'full', open: '#$WORKER_1', size: '1440x900', steps: [{ wait: 2500 }] },
  { name: 'narrow', open: '#$WORKER_1', size: '1000x760', steps: [{ wait: 2500 }] },
  { name: 'grid4', open: `#v/grid/grid/${GRID}`, size: '1440x900', steps: [{ wait: 1500 }, { eval: WAIT_FOUR }, { wait: 800 }] },
  { name: 'grid3', open: `#v/grid/grid/${GRID}`, size: '1440x900', steps: [{ wait: 1500 }, { eval: WAIT_FOUR }, { eval: takeOut(1) }, { wait: 800 }] },
  { name: 'grid3narrow', open: `#v/grid/grid/${GRID}`, size: '1000x760', steps: [{ wait: 1500 }, { eval: WAIT_FOUR }, { eval: takeOut(1) }, { wait: 800 }] },
  { name: 'grid2', open: `#v/grid/grid/${GRID}`, size: '1440x900', steps: [{ wait: 1500 }, { eval: WAIT_FOUR }, { eval: takeOut(2) }, { wait: 800 }] },
  { name: 'gridnarrow', open: `#v/grid/grid/${GRID}`, size: '1000x760', steps: [{ wait: 1500 }, { eval: WAIT_FOUR }, { wait: 800 }] },
].map((s) => ({ ...s, scale: 1 }))

async function shots([set, out, ...rest]: string[]) {
  if (!set || !out || rest.length) throw new Error(USAGE)
  const config = JSON.parse(readFileSync(CONFIG, 'utf8'))
  if (!config.extensions?.grid) await enable('grid', path.join(import.meta.dirname, '..', 'examples', 'extensions', 'grid'))
  const vars = { WORKER_1: (await labWorkers())[0] }
  for (const scene of scenes) await takeScene(URL!, scene, vars, path.resolve(out), 'stress', `${set}-${scene.name}`)
}

if (verb === 'gen') await gen(args)
else if (verb === 'shots') await shots(args)
else throw new Error(USAGE)
