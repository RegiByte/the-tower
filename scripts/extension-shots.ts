/**
 * Extension shots: the pictures an extension's README shows, taken from a throwaway sandbox by the scenes in its
 * folder's `shots.json`, and written into its folder, so a copy of the folder carries its pictures and how to retake them.
 *
 *   npm run tool:extension-shots -- <extension folder>…     examples/extensions/narrate, extensions/drafts
 *
 * Each run starts a sandbox of its own (`/tmp/tower-shots-<pid>`, a free port), adds the extension to its config, seeds
 * it, takes every scene in light and dark, writes `<folder>/shots/<scene>-<scheme>.png` and `<folder>/shots/<text>.txt`
 * in place of the old ones once every scene is taken (`shots/seed/` kept; a failed run leaves the old ones as they were,
 * and a picture of the page as the step failed in the system's temp folder), then stops that sandbox and removes it, a
 * scene failing or not. Nothing here reaches the real system.
 *
 * `shots.json`, every key but `scenes` optional:
 *
 *   {
 *     "settings": { … },                         the extension's settings in the sandbox's config, $EXT expanded
 *     "workers": 1,                              sandbox workers on the `lab` floor, as $WORKER_1 … (default 1, at most 5),
 *                                                called HOLMES-42, MARPLE-17, POIROT-08, ODIN-21, VESPER-33 in that order
 *     "seed": ["tower keep drafts < $EXT/shots/seed/notes.md"],
 *                                                shell lines run in order against the sandbox (`sandbox run`): `tower`
 *                                                acts as $WORKER_1 (TOWER_SESSION_ID), $EXT is the extension's folder,
 *                                                and files they read are kept in `shots/seed/`
 *     "scenes": [{
 *       "name": "strip",                         the file's name: shots/strip-light.png, shots/strip-dark.png
 *       "open": "#$WORKER_1",                    the tower page's hash to open (default the skyline), $VARs expanded
 *       "steps": [ … ],                          what to do before the picture, in order (below)
 *       "crop": ".side-strip",                   the region kept: a selector, or several, their union, padded by
 *       "pad": 8,                                `pad` CSS pixels (default 8) and clamped to the page
 *       "size": "1280x800",                      the page's size (default 1280x800)
 *       "schemes": ["dark"]                      the schemes taken (default light and dark): one when the look is the same
 *     }],
 *     "text": [{ "name": "whoami", "run": "tower whoami | grep narrate" }]
 *                                                a shell line's output as shots/<name>.txt, for a README's text block;
 *                                                the sandbox's root reads as ~/.tower in it
 *   }
 *
 * Steps: `{"click": css}`, `{"hover": css}` and `{"until": css}` find the first element the selector matches whose text
 * holds `text`, when given (`{"click": "button", "text": "plan.md"}`), waiting for it up to `ms` (default 30000);
 * `{"key": chord}` and `{"type": text}` as `npm run drive` takes them; `{"eval": js}`, awaited; `{"wait": ms}`. `$VARs`
 * are expanded in every step as in `open`. A click or hover takes the first match that has a box. Wait for what the
 * picture needs with `until`, not with `wait`: a machine running many sessions is slow. A popover or tip is drawn only
 * once the page has placed it: a scene showing one waits for `{"until": "<its selector>[data-placed]"}` before the picture.
 *
 * Seed made-up content only: no real names, paths or numbers, since the pictures are published with the extension.
 * The scene runner is `scenes.ts`, shared with `stress.ts`. Pictures are taken at scale 2 (crisp on a retina display) and cropped, so they stay small.
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expand, type Scene, takeScene, until } from './scenes.ts'

const REPO = path.join(import.meta.dirname, '..')

type Shots = { settings?: unknown; workers?: number; seed?: string[]; scenes: Scene[]; text?: { name: string; run: string }[] }

const folders = process.argv.slice(2).map((f) => path.resolve(f))
if (!folders.length) throw new Error('usage: npm run tool:extension-shots -- <extension folder>…')
for (const folder of folders) {
  if (!existsSync(path.join(folder, 'shots.json'))) throw new Error(`${folder} has no shots.json: its header in scripts/extension-shots.ts says what it holds`)
}

const ROOT = `/tmp/tower-shots-${process.pid}`
/** The sandbox's environment for these scripts: its root named, and no worker's session, so nothing reaches the real tower. */
const { TOWER_SESSION_ID, TOWER_HOOKS_SOCKET, ...base } = process.env
const sandboxEnv = { ...base, TOWER_SANDBOX: ROOT }
const sandbox = (args: string[], env: NodeJS.ProcessEnv = sandboxEnv) => execFileSync('npm', ['run', '-s', 'sandbox', '--', ...args], { cwd: REPO, env, encoding: 'utf8' })

const tower = () => `http://127.0.0.1:${JSON.parse(readFileSync(path.join(ROOT, 'config.json'), 'utf8')).port}`

const post = (verb: string, body: object) =>
  fetch(`${tower()}/${verb}`, { method: 'POST', headers: { origin: tower(), 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json())

/** Adds the extension to the sandbox's config, by its folder unless it ships in the checkout, and waits for it to start. */
async function enable(folder: string, settings: unknown): Promise<string> {
  const { id } = JSON.parse(readFileSync(path.join(folder, 'extension.json'), 'utf8')) as { id: string }
  const file = path.join(ROOT, 'config.json')
  const config = JSON.parse(readFileSync(file, 'utf8'))
  const bundled = path.dirname(folder) === path.join(REPO, 'extensions')
  config.extensions = { ...config.extensions, [id]: { ...(!bundled && { path: folder }), ...(settings !== undefined && { settings }) } }
  writeFileSync(file, JSON.stringify(config, null, 2))
  type Listed = { id: string; state: string; problems: { message: string }[] }
  const listed = async () => ((await fetch(`${tower()}/extensions`).then((r) => r.json())) as { extensions: Listed[] }).extensions.find((e) => e.id === id)
  await until(`${id} to start`, async () => ((await listed())?.state === 'started' ? true : undefined)).catch(async (err: Error) => {
    const ext = await listed()
    throw new Error(`${err.message}: ${ext ? `${ext.state}, ${ext.problems.map((p) => p.message).join('; ') || 'no problems listed'}` : 'the tower lists no such extension'} (\`tower extensions check ${folder}\` says more)`)
  })
  return id
}

/** The callsigns of a scene's workers, in order, so a retake draws every picture showing one the same. */
const CALLSIGNS = ['HOLMES-42', 'MARPLE-17', 'POIROT-08', 'ODIN-21', 'VESPER-33']

async function spawnWorkers(n: number): Promise<string[]> {
  if (n > CALLSIGNS.length) throw new Error(`shots.json asks for ${n} workers: CALLSIGNS in scripts/extension-shots.ts names ${CALLSIGNS.length}`)
  const ids: string[] = []
  for (let i = 0; i < n; i++) {
    const reply = (await post('spawn', { project: 'lab', cwd: path.join(ROOT, 'lab'), callsign: CALLSIGNS[i] })) as { t: string; id?: string; message?: string }
    if (reply.t !== 'spawned') throw new Error(`the sandbox refused a worker: ${reply.message}`)
    ids.push(reply.id!)
  }
  await until('the workers to report in', async () => {
    const res = await fetch(`${tower()}/board`)
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader()
    let text = ''
    while (!text.includes('\n\n')) text += (await reader.read()).value
    await reader.cancel()
    const board = JSON.parse(text.split('\n').find((l) => l.startsWith('data:'))!.slice(5)).board
    const answered = new Set(board.floors.flatMap((f: any) => f.cards).filter((c: any) => c.conversations.some((v: any) => v.answer)).map((c: any) => c.id))
    return ids.every((id) => answered.has(id)) || undefined
  })
  return ids
}

async function shoot(folder: string, shots: Shots) {
  const id = await enable(folder, shots.settings === undefined ? undefined : JSON.parse(expand(JSON.stringify(shots.settings), { EXT: folder })))
  const workers = await spawnWorkers(shots.workers ?? 1)
  const vars = { ...Object.fromEntries(workers.map((w, i) => [`WORKER_${i + 1}`, w])), EXT: folder }
  const seedEnv = { ...sandboxEnv, ...vars }
  /** `sandbox run` drops TOWER_SESSION_ID so a worker's own session can't leak in: the shell names the sandbox's worker itself. */
  const asWorker = (line: string) => sandbox(['run', 'sh', '-c', `export TOWER_SESSION_ID="$WORKER_1"\n${line}`], seedEnv)
  for (const line of shots.seed ?? []) asWorker(line)
  const out = path.join(folder, 'shots')
  const next = mkdtempSync(path.join(os.tmpdir(), `extension-shots-${id}-`))
  try {
    await take(id, shots, vars, asWorker, next)
    mkdirSync(out, { recursive: true })
    for (const old of readdirSync(out).filter(isShot)) rmSync(path.join(out, old))
    for (const shot of readdirSync(next)) copyFileSync(path.join(next, shot), path.join(out, shot))
  } finally {
    rmSync(next, { recursive: true, force: true })
  }
}

const isShot = (file: string) => /\.(png|txt)$/.test(file)

/** Every text block and scene of `shots`, written into `out`. */
async function take(id: string, shots: Shots, vars: Record<string, string>, asWorker: (line: string) => string, out: string) {
  for (const { name, run: line } of shots.text ?? []) {
    writeFileSync(path.join(out, `${name}.txt`), asWorker(line).replaceAll(`/private${ROOT}`, '~/.tower').replaceAll(ROOT, '~/.tower'))
    console.log(`${id}: shots/${name}.txt`)
  }
  for (const scene of shots.scenes) await takeScene(tower(), scene, vars, out, id)
}

try {
  for (const folder of folders) {
    rmSync(ROOT, { recursive: true, force: true })
    try {
      sandbox(['up'])
      await shoot(folder, JSON.parse(readFileSync(path.join(folder, 'shots.json'), 'utf8')) as Shots)
    } finally {
      /** A down that fails after a half-finished up must not hide why the run failed. */
      try {
        sandbox(['down'])
      } catch (err) {
        console.error(`the sandbox at ${ROOT} did not stop cleanly: ${(err as Error).message}`)
      }
    }
  }
} finally {
  rmSync(ROOT, { recursive: true, force: true })
}
