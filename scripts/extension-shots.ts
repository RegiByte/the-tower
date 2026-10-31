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
 *     "workers": 1,                              sandbox workers on the `lab` floor, as $WORKER_1 … (default 1)
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
 * `{"key": chord}` and `{"type": text}` as `npm run drive` takes them; `{"eval": js}`, awaited; `{"wait": ms}`. Wait for
 * what the picture needs with `until`, not with `wait`: a machine running many sessions is slow.
 *
 * Seed made-up content only: no real names, paths or numbers, since the pictures are published with the extension.
 * Pictures are taken at scale 2 (crisp on a retina display) and cropped, so they stay small.
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { type Page, sleep, withPage } from './drive.ts'

const REPO = path.join(import.meta.dirname, '..')

type Target = { text?: string; ms?: number }
type Step =
  | ({ click: string } & Target)
  | ({ hover: string } & Target)
  | ({ until: string } & Target)
  | { key: string }
  | { type: string }
  | { eval: string }
  | { wait: number }
type Scene = { name: string; open?: string; steps?: Step[]; crop: string | string[]; pad?: number; size?: string; schemes?: string[] }
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

async function until<T>(what: string, probe: () => Promise<T | undefined>, ms = 15000): Promise<T> {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(200)) {
    const found = await probe()
    if (found !== undefined) return found
  }
  throw new Error(`gave up waiting for ${what}`)
}

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

async function spawnWorkers(n: number): Promise<string[]> {
  const ids: string[] = []
  for (let i = 0; i < n; i++) {
    const reply = (await post('spawn', { project: 'lab', cwd: path.join(ROOT, 'lab') })) as { t: string; id?: string; message?: string }
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

const expand = (s: string, vars: Record<string, string>) => s.replace(/\$([A-Z_][A-Z0-9_]*)/g, (m, name) => vars[name] ?? m)

/** The element a step names: the first the selector matches whose text holds `text`, when given. */
const find = (css: string, text: string | undefined) =>
  `[...document.querySelectorAll(${JSON.stringify(css)})].find((e) => ${JSON.stringify(text ?? '')} === '' || e.textContent.includes(${JSON.stringify(text ?? '')}))`

const STEP_MS = 30000
const named = (css: string, { text }: Target) => `${css}${text ? ` holding "${text}"` : ''}`

/**
 * Moves the pointer to the middle of the element a step names, once it has settled: the same node in the same place on
 * two looks 250 ms apart, so a press doesn't land on a node the page is about to draw again.
 */
async function centre(page: Page, css: string, target: Target) {
  const box = `(async () => {
    const look = () => { const e = ${find(css, target.text)}; return e && [e, e.getBoundingClientRect()] }
    const first = look()
    if (!first) return null
    await new Promise((r) => setTimeout(r, 250))
    const second = look()
    if (!second || second[0] !== first[0] || ['x', 'y', 'width', 'height'].some((k) => second[1][k] !== first[1][k])) return null
    return [second[1].x + second[1].width / 2, second[1].y + second[1].height / 2]
  })()`
  const at = await until(named(css, target), async () => ((await page.eval(box)) as [number, number] | null) ?? undefined, target.ms ?? STEP_MS)
  await page.mouse(...at)
}

async function run(page: Page, step: Step) {
  if ('click' in step) {
    await centre(page, step.click, step)
    await page.press('left', true)
    await page.press('left', false)
  } else if ('hover' in step) await centre(page, step.hover, step)
  else if ('until' in step) await until(named(step.until, step), async () => ((await page.eval(`!!${find(step.until, step.text)}`)) ? true : undefined), step.ms ?? STEP_MS)
  else if ('key' in step) await page.key(step.key)
  else if ('type' in step) await page.type(step.type)
  else if ('eval' in step) await page.eval(step.eval)
  else await sleep(step.wait)
}

/** The union of the selectors' boxes, padded and kept inside the page. */
async function region(page: Page, crop: string[], pad: number, width: number, height: number) {
  const boxes = (await page.eval(`${JSON.stringify(crop)}.map((css) => { const e = document.querySelector(css); if (!e) return css; const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom] })`)) as ([number, number, number, number] | string)[]
  const missing = boxes.filter((b) => typeof b === 'string')
  if (missing.length) throw new Error(`nothing to crop to: no element matches ${missing.join(', ')}`)
  const sides = boxes as [number, number, number, number][]
  const x = Math.max(0, Math.min(...sides.map((b) => b[0])) - pad)
  const y = Math.max(0, Math.min(...sides.map((b) => b[1])) - pad)
  const right = Math.min(width, Math.max(...sides.map((b) => b[2])) + pad)
  const bottom = Math.min(height, Math.max(...sides.map((b) => b[3])) + pad)
  return { x, y, width: right - x, height: bottom - y }
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
  for (const scene of shots.scenes) {
    const [width, height] = (scene.size ?? '1280x800').split('x').map(Number)
    for (const scheme of scene.schemes ?? ['light', 'dark']) {
      await withPage(`${tower()}/${expand(scene.open ?? '', vars)}`, { width, height, scale: 2, scheme }, async (page) => {
        for (const step of scene.steps ?? []) {
          await run(page, step).catch(async (err: Error) => {
            const seen = path.join(os.tmpdir(), `extension-shots-${id}-${scene.name}-${scheme}.png`)
            await page.shot(seen)
            throw new Error(`${scene.name} (${scheme}): ${err.message}. The page as it failed: ${seen}`)
          })
        }
        const file = path.join(out, `${scene.name}-${scheme}.png`)
        await page.clip(file, await region(page, [scene.crop].flat(), scene.pad ?? 8, width, height))
        if (page.errors.length) throw new Error(`${scene.name} (${scheme}): the page reported errors, above`)
        console.log(`${id}: shots/${scene.name}-${scheme}.png`)
      })
    }
  }
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
