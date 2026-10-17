/**
 * The prefab editor's tools (renderers/tower3d/editor.html): serve it to place a scene document's models, prefabs and
 * slots by hand and save it, and shoot a document headless through the same page, so an agent checks a placement from
 * a picture. The page draws over the KayKit playground's full catalog (`npm run tool:kaykit -- build` first).
 *
 *   npm run tool:editor -- serve [scene.json] [--port 4397]
 *                                                      the editor at http://127.0.0.1:<port>/editor.html, rebuilt on
 *                                                      every load (a build that fails, such as a model Tower 3D's
 *                                                      kit lacks, is drawn over the last build, which keeps serving),
 *                                                      opening the scene, else its list of scenes; it
 *                                                      lists (GET /docs), reads and writes any scene document under
 *                                                      the scene's folder of scenes, renderers/kaykit/scenes without
 *                                                      one (GET and PUT /doc?path=, each written checked by
 *                                                      parseScene, as formatScene lays it out)
 *   npm run tool:editor -- shot <scene.json> [--states a,b] [--select src] [--camera view|json] [--size 1600x1000] [--out file.png]
 *                                                      a PNG of the scene in its states as the editor draws it: slots
 *                                                      as ghost workers, guides (Tower 3D's own models where they
 *                                                      name one), and the selection (items/0) under
 *                                                      its gizmo; seen from where a worker sits unless --camera
 *
 * Shots land in --out, else in $TMPDIR/editor. Paths are printed, one per line.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { formatScene } from '../renderers/kaykit/src/format.ts'
import { readScene } from '../renderers/kaykit/src/files.ts'
import { listing, type Read } from '../renderers/kaykit/src/listing.ts'
import { parseScene, VIEWS, type Camera, type Scene } from '../renderers/kaykit/src/scene.ts'
import { DESK_DRESS } from '../renderers/tower3d/src/dress.ts'
import { PREFABS } from '../renderers/tower3d/src/zones.ts'
import { designCss, fonts } from '../src/shared/design.ts'
import { fontFile } from '../src/packages.ts'
import { withPage } from './drive.ts'

const REPO = path.resolve(import.meta.dirname, '..')
const OUT = path.join(REPO, 'renderers/tower3d/out')
const KAYKIT = path.join(REPO, 'renderers/kaykit/out')
const SCENES = path.join(REPO, 'renderers/kaykit/scenes')

const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.map': 'application/json', '.png': 'image/png', '.bin': 'application/octet-stream', '.woff2': 'font/woff2' }

const build = () => execFileSync('npm', ['run', '-s', 'tower3d'], { cwd: REPO, stdio: 'pipe' })

/** Why building Tower 3D failed, as the build said it, or nothing when it built: a failed build leaves the last one in out/. */
function buildFailure() {
  try {
    build()
  } catch (e) {
    return (e as { stderr: Buffer }).stderr.toString().trim()
  }
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** The built editor page with `failure` drawn over it. */
const withFailure = (html: string, failure: string) => html.replace('<body>', `<body>
<pre id="build-failed" style="position: fixed; top: 12px; left: 344px; right: 12px; z-index: 1; margin: 0; padding: 8px 12px; white-space: pre-wrap; font: 11px/1.4 var(--mono); color: var(--ink); background: var(--panel); border: 2px solid var(--broken); border-radius: var(--radius); box-shadow: var(--shadow);">Tower 3D did not build: this is its last build, and the saved scenes are not in it yet.\n\n${escapeHtml(failure)}</pre>`)

/** The folder of scenes a served scene may reach: the playground's, or the scene's own folder when it lives elsewhere. */
const rootOf = (file: string) => (file.startsWith(`${SCENES}${path.sep}`) ? SCENES : path.dirname(file))

/** A document's path as the page names it, repo-relative, checked to lie under `root`. */
function docPath(root: string, name: string | null) {
  if (!name) throw new Error('doc wants ?path=')
  const file = path.resolve(REPO, name)
  if (!file.startsWith(`${root}${path.sep}`) || !file.endsWith('.json')) throw new Error(`${name} is not a scene under ${path.relative(REPO, root)}`)
  return file
}


/**
 * Every scene JSON under `root`, repo-relative, listed with who places it and whether Tower 3D reads it: one that does
 * not read as a scene (half saved, not a scene at all) is listed with its error, so the rest stay openable.
 */
function docsUnder(root: string) {
  const files = fs.readdirSync(root, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.json')).sort()
  const docs = files.map((f): Read => {
    const at = path.relative(REPO, path.join(root, f))
    try {
      return { path: at, scene: readScene(path.join(root, f)) }
    } catch (e) {
      return { path: at, error: (e as Error).message }
    }
  })
  const tower3d = new Set([...PREFABS, DESK_DRESS].map((p) => path.relative(REPO, path.join(SCENES, p))))
  return listing(docs, tower3d, (ref, from) => path.relative(REPO, path.resolve(REPO, path.dirname(from), ref)))
}

function writeDoc(file: string, req: http.IncomingMessage, res: http.ServerResponse) {
  let body = ''
  req.setEncoding('utf8')
  req.on('data', (chunk: string) => (body += chunk))
  req.on('end', () => {
    try {
      const raw = JSON.parse(body) as Scene
      parseScene(raw, path.relative(REPO, file))
      fs.writeFileSync(file, formatScene(raw))
      console.log(`saved ${path.relative(REPO, file)}`)
      res.writeHead(200, { 'content-type': 'text/plain' }).end(path.relative(REPO, file))
    } catch (e) {
      res.writeHead(422, { 'content-type': 'text/plain' }).end((e as Error).message)
    }
  })
}

/** The built Tower 3D pages, the playground's catalog under /kaykit/, and the scenes under `root`, on a loopback port. */
async function serve(port: number, rebuild: boolean, start: string | undefined) {
  const root = start ? rootOf(start) : SCENES
  const server = http.createServer((req, res) => {
    const url = new URL(req.url!, 'http://x')
    const pathname = decodeURIComponent(url.pathname)
    try {
      if (pathname === '/start') return res.writeHead(200, { 'content-type': 'text/plain', 'cache-control': 'no-store' }).end(start ? path.relative(REPO, start) : '')
      if (pathname === '/docs') {
        const body = JSON.stringify(docsUnder(root))
        return res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(body)
      }
      if (pathname === '/doc' && req.method === 'GET') {
        const body = fs.readFileSync(docPath(root, url.searchParams.get('path')))
        return res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(body)
      }
      if (pathname === '/doc' && req.method === 'PUT') return writeDoc(docPath(root, url.searchParams.get('path')), req, res)
    } catch (e) {
      return res.writeHead(404, { 'content-type': 'text/plain' }).end((e as Error).message)
    }
    if (pathname === '/design.css') return res.writeHead(200, { 'content-type': 'text/css' }).end(designCss())
    const face = fonts.find((f) => pathname === `/fonts/${f.file}`)
    if (face) return res.writeHead(200, { 'content-type': 'font/woff2' }).end(fs.readFileSync(fontFile(face)))
    if (pathname === '/editor.html' && rebuild) {
      const failure = buildFailure()
      if (failure) {
        console.error(failure)
        const page = path.join(OUT, 'editor.html')
        if (!fs.existsSync(page)) return res.writeHead(500, { 'content-type': 'text/plain' }).end(failure)
        return res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' }).end(withFailure(fs.readFileSync(page, 'utf8'), failure))
      }
    }
    const [base, rel] = pathname.startsWith('/kaykit/') ? [KAYKIT, pathname.slice('/kaykit'.length)] : [OUT, pathname]
    const file = path.join(base, rel)
    if (!file.startsWith(base) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end()
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' })
    fs.createReadStream(file).pipe(res)
  })
  await new Promise<void>((r) => server.listen(port, '127.0.0.1', r))
  return { server, url: `http://127.0.0.1:${(server.address() as { port: number }).port}/editor.html` }
}

const size = (s: string) => {
  const [w, h] = s.split('x').map(Number)
  if (!w || !h) throw new Error(`--size wants WxH, got ${s}`)
  return { w, h }
}

const cameraArg = (s: string): Camera => (s.startsWith('{') ? (JSON.parse(s) as Camera) : { view: s as (typeof VIEWS)[number] })

async function shot(file: string, opts: { states?: string; select?: string; camera?: string; size?: string; out?: string }) {
  build()
  const { server, url } = await serve(0, false, file)
  try {
    await withPage(url, { width: 1200, height: 800 }, async (page) => {
      await page.eval('editor.ready()')
      const states = opts.states?.split(',').filter(Boolean) ?? []
      await page.eval(`editor.open(${JSON.stringify(path.relative(REPO, file))}, ${JSON.stringify(states)})`)
      if (opts.select) await page.eval(`editor.select(${JSON.stringify(opts.select)})`)
      const data = (await page.eval(`editor.shot(${JSON.stringify({ ...(opts.camera && { camera: cameraArg(opts.camera) }), ...size(opts.size ?? '1600x1000') })})`)) as string
      const name = `${path.basename(file, '.json')}${states.length ? `-${states.join('+')}` : ''}.png`
      const out = path.resolve(opts.out ?? path.join(os.tmpdir(), 'editor', name))
      fs.mkdirSync(path.dirname(out), { recursive: true })
      fs.writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'))
      console.log(out)
    })
  } finally {
    server.close()
  }
}

async function main() {
  const [command, ...rest] = process.argv.slice(2)
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: { port: { type: 'string' }, states: { type: 'string' }, select: { type: 'string' }, camera: { type: 'string' }, size: { type: 'string' }, out: { type: 'string' } },
  })
  if (!fs.existsSync(path.join(KAYKIT, 'catalog.json'))) throw new Error('no renderers/kaykit/out/catalog.json: run `npm run tool:kaykit -- build --source <bundle>` first')
  const file = positionals[0] && path.resolve(positionals[0])
  if (file) readScene(file)
  if (command === 'serve') {
    const { url } = await serve(Number(values.port ?? 4397), true, file)
    return console.log(`${url}\n${file ? `editing ${path.relative(REPO, file)}` : `the scenes under ${path.relative(REPO, SCENES)}`}`)
  }
  if (command === 'shot') return shot(file || fail('usage: shot <scene.json> (see scripts/editor.ts)'), values)
  fail('usage: npm run tool:editor -- serve | shot <scene.json> (see scripts/editor.ts)')
}

function fail(message: string): never {
  throw new Error(message)
}

main().catch((e: Error) => {
  console.error(e.message)
  process.exit(1)
})
