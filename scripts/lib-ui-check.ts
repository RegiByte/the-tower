/**
 * The tower's elements (`/lib-ui/`) checked in a real browser, through the playground's scenes
 * (`renderers/playground/`), each drawn alone in one frame over the whole window: `<tower-combobox>` redrawn through
 * the morph every 100 ms as a view redraws it, typing into it and choosing from it, its Enter and ⌘↵ kept from the page
 * while open and passed on while closed, one named by a label drawn apart (`labelledby`), one taking text typed
 * (`custom`) by Enter alone; `<tower-menu>` opened by a right-click on a `<tower-menu-area>` and by Enter on a
 * `<tower-menu-button>`, its submenu, its action, its focus coming back and its subject said again on an opening for
 * the same one, each checked as it happens by the scene's own steps (`playground.act`); a check failing fails the run.
 * Run it on every bump of the UI SDK, in both engines:
 *
 *   npm run tool:lib-ui -- chrome [--shots <dir>]    headless Chrome (`scripts/drive.ts`)
 *   npm run tool:lib-ui -- webkit [--shots <dir>]    WebKit (`scripts/webkit.ts`, macOS only)
 *
 *   npm run tool:lib-ui -- serve                     only serve the playground, alone, to look at it, until stopped
 *
 * This script serves the playground itself, with no tower behind it (`?alone`): the scenes in the default look only,
 * which the page says. Every theme the page is offered is drawn on a tower, the sandbox's at `/r/playground/`.
 *
 * `--shots` saves a PNG of the open combobox, the menu with its submenu, and the menu a button opened, as
 * `<dir>/<engine>-<name>.png`. The menu scene places its rows exactly (`rowPoint`), and `?bare` puts its frame at the
 * window's top left, so a right-click lands on a row in either engine without reading the page first.
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { fontFile } from '../src/packages.ts'
import { designCss, fonts } from '../src/shared/design.ts'
import { servedModule } from '../src/tower/served.ts'
import { rowPoint, SUBJECTS } from '../renderers/playground/scenes/menu.js'
import { freePort, sleep, withPage } from './drive.ts'

const ENGINES = ['chrome', 'webkit'] as const
type Engine = (typeof ENGINES)[number]

/** One step of the run, as both drivers take it. */
type Step = { eval: string } | { rclick: [number, number] } | { key: string } | { wait: number } | { shot: string }

const PLAYGROUND = path.join(import.meta.dirname, '..', 'renderers', 'playground')

/** A scene drawn alone in the default look, its frame over the whole window. */
const sceneUrl = (base: string, scene: string) => `${base}?alone&bare&scene=${scene}&scheme=light`

/** A scene's step, in its one frame: what it returned. */
const act = (scene: string, step: string, ...args: unknown[]): Step => ({
  eval: `playground.act(${[scene, step, ...args].map((a) => JSON.stringify(a)).join(', ')}).then((r) => r[0].value)`,
})

const READY: Step = { eval: `new Promise((ready) => { const look = () => (window.playground ? ready(playground.ready()) : setTimeout(look, 50)); look() })` }

const COMBOBOX = (shots: (name: string) => Step[]): Step[] => {
  const c = (step: string, ...args: unknown[]) => act('combobox', step, ...args)
  return [
    READY,
    c('start'),
    c('focus'),
    { key: 'p' },
    { wait: 300 },
    { key: 'e' },
    { wait: 1200 },
    { key: 'a' },
    { wait: 1200 },
    c('typing', 'pea', ['Peach', 'Pear']),
    ...shots('combobox'),
    { key: 'Enter' },
    { wait: 500 },
    c('picked', 'peach'),
    { key: 'Meta+Enter' },
    { wait: 300 },
    c('keys', { value: 'peach', open: false, out: 1 }),
    { key: 'z' },
    { key: 'z' },
    { wait: 500 },
    { key: 'Enter' },
    { key: 'Meta+Enter' },
    { wait: 300 },
    c('keys', { value: 'peach', text: 'Peachzz', open: true, out: 1 }),
    { key: 'Escape' },
    { wait: 500 },
    c('keys', { value: 'peach', text: 'Peach', open: false, out: 1 }),
    c('selectAll'),
    { key: 'p' },
    { key: 'l' },
    { key: 'u' },
    { wait: 500 },
    { key: 'Meta+Enter' },
    { wait: 500 },
    c('keys', { value: 'plum', text: 'Plum', open: false, out: 1 }),
    c('focusTyped'),
    ...[...'mine'].map((key) => ({ key })),
    { wait: 500 },
    { key: 'Enter' },
    { wait: 500 },
    c('typed', { value: 'mine', text: 'mine', open: false }),
    c('focusTyped'),
    ...[...'cla'].map((key) => ({ key })),
    { wait: 500 },
    { key: 'Enter' },
    { wait: 500 },
    c('typed', { value: 'cla', text: 'cla', open: false }),
    c('focusTyped'),
    ...[...'cla'].map((key) => ({ key })),
    { wait: 500 },
    { key: 'ArrowDown' },
    { key: 'Enter' },
    { wait: 500 },
    c('typed', { value: 'claude-a', text: 'claude-a', open: false }),
    c('focusTyped'),
    ...[...'claude-b'].map((key) => ({ key })),
    { wait: 500 },
    { key: 'Enter' },
    { wait: 500 },
    c('typed', { value: 'claude-b', text: 'claude-b', open: false }),
    { key: 'z' },
    { key: 'z' },
    { wait: 500 },
    { key: 'Escape' },
    { wait: 500 },
    c('typed', { value: 'claude-b', text: 'claude-b', open: false }),
    c('focusTyped'),
    ...[...'other'].map((key) => ({ key })),
    { wait: 500 },
    { key: 'Tab' },
    { wait: 500 },
    c('typed', { value: 'claude-b', text: 'claude-b', open: false }),
    c('labelled'),
    c('stop'),
    c('ownAttributes'),
    c('errors'),
  ]
}

const MENU = (shots: (name: string) => Step[]): Step[] => {
  const m = (step: string, ...args: unknown[]) => act('menu', step, ...args)
  return [
    READY,
    m('start'),
    { rclick: rowPoint(1) },
    { wait: 500 },
    m('menuAt', SUBJECTS[1]!.id, rowPoint(1), 'Open'),
    { key: 'ArrowDown' },
    { key: 'ArrowDown' },
    { key: 'ArrowDown' },
    { key: 'ArrowRight' },
    { wait: 500 },
    m('submenu', ['Drafts', 'Reviews']),
    ...shots('menu'),
    { key: 'Enter' },
    { wait: 500 },
    m('acted', `${SUBJECTS[1]!.id}/drafts`),
    m('focusButton', 0),
    { key: 'Enter' },
    { wait: 500 },
    m('menuAt', SUBJECTS[0]!.id, null, 'New worker'),
    m('anchored', 0),
    ...shots('button'),
    { key: 'Escape' },
    { wait: 500 },
    m('closedTo', 0),
    { key: 'Enter' },
    { wait: 500 },
    { key: 'End' },
    { key: 'Enter' },
    { wait: 500 },
    m('checked', `${SUBJECTS[0]!.id}/open`),
    { rclick: rowPoint(3) },
    { wait: 500 },
    m('menuAt', SUBJECTS[3]!.id, rowPoint(3), 'Open'),
    { rclick: rowPoint(2) },
    { wait: 500 },
    m('menuAt', SUBJECTS[2]!.id, rowPoint(2), 'Open'),
    m('openAt', 1),
    { wait: 500 },
    m('menuAt', SUBJECTS[1]!.id, null, 'Open'),
    { key: 'Escape' },
    { wait: 300 },
    m('said'),
    m('openAt', 1),
    { wait: 500 },
    m('saidAgain', SUBJECTS[1]!.id),
    { key: 'Escape' },
    { wait: 300 },
    m('stop'),
    m('ownAttributes'),
    m('errors'),
  ]
}

/** The scenes checked, each on a page of its own, with its steps. */
const RUNS = { combobox: COMBOBOX, menu: MENU }

/** Serves the playground, the design and every module it reaches. */
async function serve() {
  const server = createServer(async (req, res) => {
    const url = (req.url ?? '/').split('?')[0]!
    try {
      const own = path.join(PLAYGROUND, url === '/' ? 'index.html' : url)
      if (own.startsWith(PLAYGROUND + path.sep) && existsSync(own) && statSync(own).isFile())
        return res.writeHead(200, { 'content-type': own.endsWith('.html') ? 'text/html' : 'text/javascript' }).end(readFileSync(own))
      if (url === '/design.css') return res.writeHead(200, { 'content-type': 'text/css' }).end(designCss())
      const font = fonts.find((f) => url === `/fonts/${f.file}`)
      if (font) return res.writeHead(200, { 'content-type': 'font/woff2' }).end(readFileSync(fontFile(font)))
      const module = servedModule(url)
      if (!module) return res.writeHead(404).end()
      res.writeHead(200, { 'content-type': 'text/javascript' }).end(await module)
    } catch (err) {
      res.writeHead(500).end(String(err))
    }
  })
  const port = await freePort()
  await new Promise<void>((r) => server.listen(port, '127.0.0.1', r))
  return { url: `http://127.0.0.1:${port}/`, close: () => server.close() }
}

/** Runs the steps in headless Chrome, a failed check throwing. */
async function inChrome(url: string, steps: Step[]) {
  await withPage(url, { width: 900, height: 600, scale: 2 }, async (page) => {
    for (const step of steps) {
      if ('eval' in step) console.log(`✔ ${step.eval}  ${JSON.stringify(await page.eval(step.eval))}`)
      else if ('rclick' in step) {
        await page.mouse(...step.rclick)
        await page.press('right', true)
        await page.press('right', false)
      } else if ('key' in step) await page.key(step.key)
      else if ('wait' in step) await sleep(step.wait)
      else await page.shot(step.shot)
    }
    if (page.errors.length) throw new Error(`the page reported ${page.errors.length} errors`)
  })
}

/** Runs the steps in WebKit through `tool:webkit`, which fails at the first check that throws. */
async function inWebKit(url: string, steps: Step[]) {
  const args = steps.flatMap((step) =>
    'eval' in step ? ['--eval', step.eval]
    : 'rclick' in step ? ['--rclick', step.rclick.join(',')]
    : 'key' in step ? ['--key', step.key]
    : 'wait' in step ? ['--wait', String(step.wait)]
    : ['--shot', step.shot],
  )
  const child = spawn(process.execPath, ['--import', 'tsx', path.join(import.meta.dirname, 'webkit.ts'), url, '--size', '900x600', ...args], { stdio: 'inherit' })
  const code = await new Promise<number | null>((r) => child.once('exit', r))
  if (code !== 0) throw new Error(`the WebKit run exited with ${code}`)
}

async function main() {
  const [engine, flag, dir] = process.argv.slice(2) as [Engine | 'serve', string | undefined, string | undefined]
  if (engine === 'serve') return console.log(`${(await serve()).url}?alone`)
  if (!ENGINES.includes(engine) || (flag && (flag !== '--shots' || !dir))) throw new Error(`usage: tsx scripts/lib-ui-check.ts ${ENGINES.join('|')} [--shots <dir>]`)
  const shots = (name: string): Step[] => (dir ? [{ shot: path.resolve(dir, `${engine}-${name}.png`) }] : [])
  const served = await serve()
  try {
    for (const [scene, steps] of Object.entries(RUNS)) await (engine === 'chrome' ? inChrome : inWebKit)(sceneUrl(served.url, scene), steps(shots))
    console.log(`\n${engine}: every check passed`)
  } finally {
    served.close()
  }
}

await main().catch((err: Error) => {
  console.error(`✖ ${err.message}`)
  process.exitCode = 1
})
