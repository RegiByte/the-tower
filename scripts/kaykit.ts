/**
 * The KayKit playground's tools (renderers/kaykit): find models, check and render scenes, shoot one model. Rendering
 * drives the playground page itself in headless Chrome, so an agent's picture is the one a human flies through.
 *
 *   npm run tool:kaykit -- build --source <dir>       measure the KayKit Bits Bundle 1 folder <dir>
 *                                                     (https://kaylousberg.itch.io/) into renderers/kaykit/out
 *                                                     (catalog, meshes, atlases)
 *   npm run tool:kaykit -- bundle                     the page's script and scene list (render and serve do it too)
 *   npm run tool:kaykit -- find [words…] [--pack p,…] [--category c,…] [--mount m,…] [--parts] [--min w,h,d] [--max w,h,d] [--json]
 *                                                     catalog ids with their size, bounds and parts in Tower meters;
 *                                                     `*` leaves an axis of --min/--max open
 *   npm run tool:kaykit -- check <scene.json>         unknown ids and parts, sunk or crowded models, bare wall
 *                                                     corners, props at room scale; exits 1 on an error
 *   npm run tool:kaykit -- shot <id> [--view iso|front|back|left|right|top] [--camera <json>] [--ref person,desk]
 *                                    [--parts <json>] [--theme <json>] [--night] [--size 1200x900] [--out file.png]
 *                                                     one model on a 1 m grid, beside a 1.75 m person or a desk
 *   npm run tool:kaykit -- render <scene.json|gallery> [--camera <name|view|json>]… [--theme <json>] [--night]
 *                                    [--size 1600x1000] [--out dir]
 *                                                     a PNG per camera: those given, else every camera the scene names;
 *                                                     --theme and --night lay over the scene's own, as the page's panel does
 *   npm run tool:kaykit -- serve [--port 4398]         the page at http://127.0.0.1:<port>/ for a human, rebuilt on
 *                                                     every load; ?scene=scenes/<file>.json opens a scene
 *   npm run tool:kaykit -- schema                     the scene document's JSON Schema
 *
 * Shots land in --out, else in $TMPDIR/kaykit. Paths are printed, one per line.
 */
import { build as esbuild } from 'esbuild'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { z } from 'zod'
import { fit, type Catalog, type Mount, type Pack, type Vec3 } from '../renderers/kaykit/src/catalog.ts'
import { check } from '../renderers/kaykit/src/check.ts'
import { find, type Query } from '../renderers/kaykit/src/find.ts'
import { build } from '../renderers/kaykit/src/measure.ts'
import type { Category } from '../renderers/kaykit/src/rules.ts'
import { flatFile, readScene } from '../renderers/kaykit/src/files.ts'
import { Scene, flatten, VIEWS, type Camera, type Flat, type Theme } from '../renderers/kaykit/src/scene.ts'
import { designCss, fonts } from '../src/shared/design.ts'
import { fontFile } from '../src/packages.ts'
import { withPage } from './drive.ts'

const REPO = path.resolve(import.meta.dirname, '..')
const PAGE = path.join(REPO, 'renderers/kaykit')
const OUT = path.join(PAGE, 'out')

const catalog = () => {
  const file = path.join(OUT, 'catalog.json')
  if (!fs.existsSync(file)) throw new Error(`no ${path.relative(REPO, file)}: run \`npm run tool:kaykit -- build\` first`)
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Catalog
}

const list = (s: string | undefined) => s?.split(',').map((v) => v.trim()).filter(Boolean)
const vec = (s: string | undefined) => s?.split(',').map((v) => (v.trim() === '*' ? NaN : Number(v))) as Vec3 | undefined
const json = <T>(s: string | undefined, what: string): T | undefined => {
  if (s === undefined) return undefined
  try {
    return JSON.parse(s) as T
  } catch {
    throw new Error(`--${what} is not JSON: ${s}`)
  }
}
const size = (s: string) => {
  const [w, h] = s.split('x').map(Number)
  if (!w || !h) throw new Error(`--size wants WxH, got ${s}`)
  return { w, h }
}

async function bundle() {
  await esbuild({ entryPoints: { kaykit: path.join(PAGE, 'src/main.ts') }, bundle: true, format: 'iife', minify: true, sourcemap: true, target: 'es2023', outdir: OUT, logLevel: 'warning' })
  const scenes = fs.readdirSync(path.join(PAGE, 'scenes')).filter((f) => f.endsWith('.json')).sort()
  fs.writeFileSync(path.join(OUT, 'scenes.json'), JSON.stringify(scenes))
}

const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.bin': 'application/octet-stream', '.map': 'application/json', '.woff2': 'font/woff2' }

/** The page and its files, with the tower's design sheet and faces, on a free loopback port. */
async function serve(port: number, rebuild: boolean) {
  const server = http.createServer(async (req, res) => {
    const url = decodeURIComponent(new URL(req.url!, 'http://x').pathname)
    if (url === '/design.css') return res.writeHead(200, { 'content-type': 'text/css' }).end(designCss())
    const face = fonts.find((f) => url === `/fonts/${f.file}`)
    if (face) return res.writeHead(200, { 'content-type': 'font/woff2' }).end(fs.readFileSync(fontFile(face)))
    if (url === '/' && rebuild) await bundle().catch((e) => console.error(e.message))
    const file = path.join(PAGE, url === '/' ? 'index.html' : url)
    if (!file.startsWith(PAGE) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end()
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' })
    fs.createReadStream(file).pipe(res)
  })
  await new Promise<void>((r) => server.listen(port, '127.0.0.1', r))
  return { server, url: `http://127.0.0.1:${(server.address() as { port: number }).port}/` }
}

type Shot = { camera: Camera | string; file: string }

/** Draws `scene` in the playground in headless Chrome and saves a PNG per shot. */
async function shoot(scene: Flat | 'gallery', dress: { theme?: Theme; light?: 'night' }, shots: (cameras: string[]) => Shot[], { w, h }: { w: number; h: number }) {
  await bundle()
  const { server, url } = await serve(0, false)
  try {
    await withPage(url, { width: 640, height: 400 }, async (page) => {
      await page.eval('kaykit.ready()')
      const state = (await page.eval(`kaykit.show(${JSON.stringify(scene)}, ${JSON.stringify(scene === 'gallery' ? 'gallery' : scene.title ?? 'scene')})`)) as { items: number; triangles: number }
      if (dress.theme || dress.light) await page.eval(`kaykit.dress(${JSON.stringify(dress)})`)
      const cameras = ((await page.eval('kaykit.state()')) as { cameras: string[] }).cameras
      for (const s of shots(cameras)) {
        const data = (await page.eval(`kaykit.shot(${JSON.stringify({ camera: s.camera, w, h })})`)) as string
        fs.mkdirSync(path.dirname(s.file), { recursive: true })
        fs.writeFileSync(s.file, Buffer.from(data.split(',')[1], 'base64'))
        console.log(s.file)
      }
      const calls = ((await page.eval('kaykit.state()')) as { calls: number }).calls
      console.error(`${state.items} models · ${state.triangles.toLocaleString()} triangles · ${calls} draw calls`)
    })
  } finally {
    server.close()
  }
}

/** A camera argument: a camera the scene names, a framed view, or a JSON camera. */
const cameraArg = (s: string): Camera | string => (s.startsWith('{') ? json<Camera>(s, 'camera')! : (VIEWS as readonly string[]).includes(s) ? { view: s as (typeof VIEWS)[number] } : s)
const cameraName = (c: Camera | string) => (typeof c === 'string' ? c : 'view' in c ? c.view : 'camera')

/**
 * One model on a 1 m grid, its bounds resting on the floor, with references lined up beside it across the line of
 * sight: along X, or along Z when the view looks from the left or right.
 */
function inspect(id: string, opts: { refs: string[]; parts?: Record<string, Vec3>; theme?: Theme; night: boolean; view: string }): Scene {
  const models = catalog().models
  const model = models.find((m) => m.id === id)
  if (!model) throw new Error(`no model "${id}": try \`npm run tool:kaykit -- find ${id.split('/').at(-1)}\``)
  const f = fit(model)
  const across = opts.view === 'left' || opts.view === 'right' ? 2 : 0
  const at = (d: number, y = 0): Vec3 => (across ? [0, y, d] : [d, y, 0])
  const scene: Scene = { title: id, ground: 'grid', light: opts.night ? 'night' : 'day', theme: opts.theme, items: [{ model: id, at: [0, -f.min[1], 0], parts: opts.parts }], boxes: [], labels: [] }
  let next = f.max[across] + 0.5
  for (const ref of opts.refs) {
    if (ref === 'person') {
      scene.boxes!.push({ size: [0.45, 1.75, 0.28], at: at(next + 0.25), turn: across ? 90 : 0, color: '#e5484d' })
      scene.labels!.push({ text: '1.75 m', at: at(next + 0.25, 1.8), turn: across ? 90 : 0, height: 0.1 })
      next += 0.95
    } else if (ref === 'desk') {
      const desk = fit(models.find((m) => m.id === 'furniture/desk')!)
      const half = desk.size[across] / 2
      scene.items!.push({ model: 'furniture/desk', at: at(next + half), turn: across ? 90 : 0 })
      scene.labels!.push({ text: 'desk 0.75 m', at: at(next + half, 0.8), turn: across ? 90 : 0, height: 0.1 })
      next += desk.size[across] + 0.5
    } else throw new Error(`--ref is person or desk, not ${ref}`)
  }
  return scene
}

const outDir = (s: string | undefined) => path.resolve(s ?? path.join(os.tmpdir(), 'kaykit'))
const slug = (s: string) => s.replace(/[^a-z0-9_-]+/gi, '_')

async function main() {
  const [command, ...rest] = process.argv.slice(2)
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: {
      source: { type: 'string' }, pack: { type: 'string' }, category: { type: 'string' }, mount: { type: 'string' }, parts: { type: 'string' },
      min: { type: 'string' }, max: { type: 'string' }, json: { type: 'boolean' }, view: { type: 'string' }, camera: { type: 'string', multiple: true },
      ref: { type: 'string' }, theme: { type: 'string' }, night: { type: 'boolean' }, size: { type: 'string' }, out: { type: 'string' }, port: { type: 'string' },
    },
  })
  if (command === 'build') {
    if (!values.source) throw new Error('build --source <dir>: the KayKit Bits Bundle 1 folder, from https://kaylousberg.itch.io/')
    const source = path.resolve(values.source)
    if (!fs.existsSync(source)) throw new Error(`no KayKit folder at ${source}`)
    fs.mkdirSync(OUT, { recursive: true })
    const r = build(source, OUT)
    return console.log(`${r.models} models, ${(r.bytes / 1e6).toFixed(1)} MB of meshes → ${path.relative(REPO, OUT)}`)
  }
  if (command === 'bundle') return bundle()
  if (command === 'schema') return console.log(JSON.stringify(z.toJSONSchema(Scene), null, 1))
  if (command === 'find') {
    const q: Query = {
      text: positionals.join(' ') || undefined,
      pack: list(values.pack) as Pack[] | undefined,
      category: list(values.category) as Category[] | undefined,
      mount: list(values.mount) as Mount[] | undefined,
      parts: values.parts === undefined ? undefined : values.parts !== 'false',
      min: vec(values.min),
      max: vec(values.max),
    }
    const hits = find(catalog(), q)
    if (values.json) return console.log(JSON.stringify(hits, null, 1))
    for (const h of hits) console.log(`${h.id.padEnd(46)} ${h.category.padEnd(11)} ${h.mount.padEnd(7)} ${h.size.map((v) => v.toFixed(2)).join('×').padEnd(17)} y ${h.min[1]}..${h.max[1]}${h.parts.length ? `  parts: ${h.parts.join(', ')}` : ''}`)
    return console.error(`${hits.length} of ${catalog().models.length}`)
  }
  if (command === 'check') {
    const file = positionals[0] ?? fail('usage: check <scene.json>')
    const issues = check(await flatFile(file), catalog())
    for (const i of issues) console.log(`${i.level === 'error' ? 'ERROR' : 'warn '} ${i.at}: ${i.message}`)
    console.error(issues.length ? `${issues.length} issue${issues.length > 1 ? 's' : ''}` : 'no issues')
    if (issues.some((i) => i.level === 'error')) process.exitCode = 1
    return
  }
  if (command === 'shot') {
    const id = positionals[0] ?? fail('usage: shot <id>')
    const camera = values.camera?.[0] ? cameraArg(values.camera[0]) : { view: (values.view ?? 'iso') as (typeof VIEWS)[number] }
    const scene = inspect(id, { refs: list(values.ref) ?? [], parts: json(values.parts, 'parts'), theme: json(values.theme, 'theme'), night: !!values.night, view: cameraName(camera) })
    const file = values.out ? path.resolve(values.out) : path.join(outDir(undefined), `${slug(id)}-${cameraName(camera)}.png`)
    const flat = await flatten(scene, id, () => fail('a shot places no prefabs'))
    return shoot(flat, {}, () => [{ camera, file }], size(values.size ?? '1200x900'))
  }
  if (command === 'render') {
    const target = positionals[0] ?? fail('usage: render <scene.json|gallery>')
    const base = target === 'gallery' ? 'gallery' : path.basename(target, '.json')
    const scene = target === 'gallery' ? 'gallery' : await flatFile(target)
    const dress = { theme: json<Theme>(values.theme, 'theme'), light: values.night ? ('night' as const) : undefined }
    const asked = (values.camera ?? []).map(cameraArg)
    const dir = outDir(values.out)
    return shoot(scene, dress, (named) => (asked.length ? asked : named.length ? named : [{ view: 'iso' as const }]).map((c) => ({ camera: c, file: path.join(dir, `${slug(base)}-${slug(cameraName(c))}.png`) })), size(values.size ?? '1600x1000'))
  }
  if (command === 'serve') {
    await bundle()
    const { url } = await serve(Number(values.port ?? 4398), true)
    return console.log(`${url}  (gallery)\n${url}?scene=scenes/<file>.json`)
  }
  fail('usage: npm run tool:kaykit -- build | bundle | find | check | shot | render | serve | schema (see scripts/kaykit.ts)')
}

function fail(message: string): never {
  throw new Error(message)
}

main().catch((e: Error) => {
  console.error(e.message)
  process.exit(1)
})

