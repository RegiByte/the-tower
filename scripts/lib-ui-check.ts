/**
 * The tower's elements (`/lib-ui/`) in a page that redraws them through the morph every 100 ms, as a renderer does, in
 * a real browser, drawn by `/lib/elements.js` as a view draws them: typing into `<tower-combobox>` and choosing from it, its Enter and ⌘↵ kept from the page while open and passed on while closed, one named by a label drawn apart (`labelledby`), `<tower-menu>` opened by a right-click on a
 * `<tower-menu-area>` and by Enter on a `<tower-menu-button>`, its submenu, its action and its focus coming back, each
 * checked as it happens. The page is served by this script on a free port, the modules as the tower serves them
 * (`servedModule`); a check failing fails the run. Run it on every bump of the UI SDK, in both engines:
 *
 *   npm run tool:lib-ui -- chrome [--shots <dir>]    headless Chrome (`scripts/drive.ts`)
 *   npm run tool:lib-ui -- webkit [--shots <dir>]    WebKit (`scripts/webkit.ts`, macOS only)
 *
 *   npm run tool:lib-ui -- serve                     only serve the page, to look at it, until stopped
 *
 * `--shots` saves a PNG of the open combobox, the menu with its submenu, and the menu a button opened, as
 * `<dir>/<engine>-<name>.png`. Geometry is fixed by the page's stylesheet, so a right-click lands on a row in either
 * engine without reading the page first.
 */
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { fontFile } from '../src/packages.ts'
import { designCss, fonts } from '../src/shared/design.ts'
import { servedModule } from '../src/tower/served.ts'
import { freePort, sleep, withPage } from './drive.ts'

const ENGINES = ['chrome', 'webkit'] as const
type Engine = (typeof ENGINES)[number]

/** One step of the run, as both drivers take it. */
type Step = { eval: string } | { rclick: [number, number] } | { key: string } | { wait: number } | { shot: string }

const SUBJECTS = [
  { id: 'floor:the-tower', name: 'the-tower', kind: 'floor' },
  { id: 'worker:AHAB-47', name: 'AHAB-47', kind: 'worker' },
  { id: 'worker:HOLMES-26', name: 'HOLMES-26', kind: 'worker' },
  { id: 'shown:AHAB-47/1', name: 'report.html', kind: 'tab' },
]

/** Where the rows sit, in CSS pixels: the page's stylesheet places them exactly here. */
const ROWS = { left: 24, top: 160, width: 360, height: 32 }
const rowPoint = (i: number): [number, number] => [ROWS.left + 120, ROWS.top + i * ROWS.height + ROWS.height / 2]

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>lib-ui check</title>
<link rel="stylesheet" href="/design.css">
<style>
  body { margin: 0; background: var(--wall); color: var(--ink); font: var(--fs-s) var(--ui); }
  #view { position: absolute; left: ${ROWS.left}px; top: 24px; width: ${ROWS.width}px; }
  #view .head { height: 20px; color: var(--muted); }
  #view tower-combobox { height: 100px; }
  #view .named { position: absolute; top: 320px; width: 100%; }
  #rows { position: absolute; top: ${ROWS.top - 24}px; left: 0; width: 100%; }
  tower-menu-area { display: flex; align-items: center; gap: var(--sp-m); box-sizing: border-box; height: ${ROWS.height}px; padding: 0 var(--sp-m); border-radius: var(--radius); }
  tower-menu-area:state(open) { background: var(--panel-2); box-shadow: var(--selected); }
  tower-menu-area .name { flex: 1; }
  tower-menu-area .age { color: var(--muted); font-variant-numeric: tabular-nums; }
</style>
</head>
<body>
<div id="view"></div>
<script type="module">
import { morph } from '/lib/morph.js'
import { comboboxHtml, subjectHtml, subjectMenuHtml } from '/lib/elements.js'
import '/lib-ui/menu.js'
import '/lib-ui/combobox.js'

const subjects = ${JSON.stringify(SUBJECTS)}
const fruits = ['Apple', 'Apricot', 'Banana', 'Cherry', 'Peach', 'Pear', 'Plum'].map((label) => ({ value: label.toLowerCase(), label }))

let fruit = null
let tick = 0
const row = (s) => subjectHtml('row', s.id, \`\${s.name}: menu\`, \`<span class="name">\${s.name}</span><span class="age">\${tick % 60}s</span>\`)
const view = () => \`<div class="head">render \${tick}</div>
\${comboboxHtml({ place: 'check', name: 'fruit', label: 'Fruit', placeholder: 'Search fruits', empty: 'No fruit', value: fruit, options: fruits })}
<div id="rows">\${subjects.map(row).join('')}</div>
<div class="named"><span id="check/label:size">Size <small>optional</small></span>
\${comboboxHtml({ place: 'check', name: 'size', labelledby: 'check/label:size', options: [{ value: 's', label: 'Small' }, { value: 'l', label: 'Large' }] })}</div>
\${subjectMenuHtml()}\`

const root = document.getElementById('view')
const render = () => (tick++, morph(root, view()))
render()

const itemsOf = (id) => {
  const s = subjects.find((x) => x.id === id)
  const verbs = { floor: ['New worker', 'Tidy'], worker: ['Open', 'Message', 'Send home'], tab: ['Open', 'Close'] }[s.kind]
  return [
    { type: 'group', label: s.name, items: verbs.map((v) => ({ value: \`\${id}/\${v.toLowerCase()}\`, label: v })) },
    { type: 'separator' },
    { type: 'submenu', label: 'Kept', items: [{ value: \`\${id}/drafts\`, label: 'Drafts' }, { value: \`\${id}/reviews\`, label: 'Reviews' }] },
    { type: 'checkbox', value: \`\${id}/open\`, label: 'Open here', checked: true, closeOnSelect: true },
  ]
}

const menu = document.getElementById('subject-menu')
const combo = document.getElementById('check:fruit')
const log = []
root.addEventListener('payloadchange', (e) => { log.push(['payload', e.detail.value]); menu.items = itemsOf(e.detail.value) })
root.addEventListener('openchange', (e) => log.push([e.target.localName, 'open', e.detail.value, e.detail.reason]))
root.addEventListener('action', (e) => log.push(['action', e.detail.value]))
root.addEventListener('checkedchange', (e) => log.push(['checked', e.detail.value, e.detail.checked]))
root.addEventListener('keydown', (e) => e.key === 'Enter' && log.push(['enter-out', e.metaKey]))
root.addEventListener('valuechange', (e) => { log.push(['value', e.detail.value, e.detail.reason]); fruit = e.detail.value })

const fail = (what, seen) => { throw new Error(\`\${what}: \${JSON.stringify(seen)}\`) }
const near = (a, b) => Math.abs(a - b) <= 12
const content = () => menu.querySelector('[data-slot="menu-content"]:not([data-nested])')
const shown = (el) => !!el && el.getClientRects().length > 0
const labels = (el) => [...(el?.querySelectorAll('[role^="menuitem"]') ?? [])].filter((i) => i.closest('[data-slot="menu-content"]') === el).map((i) => i.textContent.trim())
const marked = () => [...document.querySelectorAll('tower-menu-area')].filter((a) => a.matches(':state(open)')).map((a) => a.getAttribute('payload'))
const area = (i) => document.querySelectorAll('tower-menu-area')[i]

window.check = {
  ready: async () => { await Promise.all(['tower-menu', 'tower-combobox', 'ui-menu', 'ui-combobox'].map((t) => customElements.whenDefined(t))); return true },
  start: () => { window.check.timer = setInterval(render, 100); return true },
  stop: () => { clearInterval(window.check.timer); return tick },
  focusCombobox: () => { combo.querySelector('input').focus(); return document.activeElement.localName },
  combobox: (text, options) => {
    const input = combo.querySelector('input')
    const seen = { text: input.value, caret: input.selectionStart, focused: document.activeElement === input, open: combo.open,
      options: [...combo.querySelectorAll('[role="option"]')].filter(shown).map((o) => o.textContent.trim()) }
    if (seen.text !== text || seen.caret !== text.length || !seen.focused || !seen.open || JSON.stringify(seen.options) !== JSON.stringify(options)) fail(\`the combobox lost what was typed (want "\${text}", \${options})\`, seen)
    return seen
  },
  picked: (value) => {
    const seen = { value: combo.value, attribute: combo.getAttribute('value'), open: combo.open, text: combo.querySelector('input').value, log: log.filter((l) => l[0] === 'value') }
    if (seen.value !== value || seen.attribute !== value || seen.open) fail(\`the combobox didn't keep "\${value}"\`, seen)
    if (seen.log.some((l) => l[2] !== 'item-press')) fail('the value written back fired an event', seen)
    return seen
  },
  keys: (want) => {
    const input = combo.querySelector('input')
    const seen = { value: combo.value, text: input.value, open: combo.open, out: log.filter((l) => l[0] === 'enter-out').length }
    if (Object.entries(want).some(([k, v]) => seen[k] !== v)) fail(\`the combobox's keys: want \${JSON.stringify(want)}\`, seen)
    return seen
  },
  labelled: () => {
    const named = document.getElementById('check:size')
    const seen = { labelledby: named.querySelector('input').getAttribute('aria-labelledby'), parts: named.querySelectorAll('ui-combobox-label').length }
    if (seen.labelledby !== 'check/label:size' || seen.parts) fail('a combobox with labelledby should draw no label and name its input by it', seen)
    return seen
  },
  blur: () => { document.activeElement?.blur(); return true },
  menuAt: (payload, point, first) => {
    const r = content()?.getBoundingClientRect()
    const seen = { open: menu.open, at: r && [Math.round(r.x), Math.round(r.y)], items: labels(content()), marked: marked(), payload: menu.api.getPayload() }
    if (!seen.open || seen.payload !== payload || seen.items[0] !== first) fail(\`the menu isn't open for \${payload}\`, seen)
    if (point && !(near(r.x, point[0]) && near(r.y, point[1]))) fail(\`the menu isn't at the pointer \${point}\`, seen)
    if (JSON.stringify(seen.marked) !== JSON.stringify([payload])) fail(\`only \${payload}'s area should show :state(open)\`, seen)
    return seen
  },
  submenu: (items) => {
    const sub = [...menu.querySelectorAll('[data-slot="menu-content"][data-nested]')].find(shown)
    const seen = { items: sub ? labels(sub) : null, active: document.activeElement?.textContent?.trim() }
    if (JSON.stringify(seen.items) !== JSON.stringify(items)) fail('the submenu is not open', seen)
    return seen
  },
  acted: (value) => {
    const seen = { open: menu.open, last: log.filter((l) => l[0] === 'action').at(-1), marked: marked() }
    if (seen.open || seen.last?.[1] !== value || seen.marked.length) fail(\`the menu didn't run \${value} and close\`, seen)
    return seen
  },
  checked: (value) => {
    const seen = { open: menu.open, last: log.filter((l) => l[0] === 'checked').at(-1) }
    if (seen.open || seen.last?.[1] !== value || seen.last?.[2] !== false) fail(\`the menu didn't fire checkedchange for \${value} and close\`, seen)
    return seen
  },
  openAt: (i) => (menu.openAt(subjects[i].id, area(i)), true),
  focusButton: (i) => { area(i).querySelector('tower-menu-button button').focus(); return document.activeElement.getAttribute('aria-label') },
  anchored: (i) => {
    const b = area(i).querySelector('tower-menu-button button').getBoundingClientRect()
    const r = content()?.getBoundingClientRect()
    const seen = { button: [Math.round(b.x), Math.round(b.bottom)], at: r && [Math.round(r.x), Math.round(r.y)], expanded: area(i).querySelector('button').getAttribute('aria-expanded') }
    if (!r || r.y < b.bottom - 1 || r.y > b.bottom + 16 || seen.expanded !== 'true') fail('the menu is not anchored below its button', seen)
    return seen
  },
  closedTo: (i) => {
    const button = area(i).querySelector('tower-menu-button button')
    const seen = { open: menu.open, focused: document.activeElement === button, marked: marked() }
    if (seen.open || !seen.focused || seen.marked.length) fail('Escape should close the menu and give focus back to its button', seen)
    return seen
  },
  ownAttributes: () => {
    const written = { 'tower-combobox': ['id', 'name', 'label', 'labelledby', 'placeholder', 'empty', 'value', 'options', 'data-owned'], 'tower-menu': ['id', 'data-owned'],
      'tower-menu-area': ['id', 'for', 'payload'], 'tower-menu-button': ['id', 'for', 'payload', 'label', 'data-owned'] }
    const extra = Object.entries(written).flatMap(([tag, names]) => [...document.querySelectorAll(tag)].flatMap((el) => [...el.attributes].map((a) => a.name).filter((n) => !names.includes(n)).map((n) => \`\${tag} \${n}\`)))
    if (extra.length) fail('an element wrote an attribute on itself', extra)
    return tick
  },
  errors: () => window.check.seen,
}
window.check.seen = []
addEventListener('error', (e) => window.check.seen.push(String(e.message)))
</script>
</body>
</html>`

const STEPS = (shots: (name: string) => Step[]): Step[] => [
  { eval: `new Promise((ready) => { const look = () => (window.check ? ready(window.check.ready()) : setTimeout(look, 50)); look() })` },
  { eval: 'check.start()' },
  { eval: 'check.focusCombobox()' },
  { key: 'p' },
  { wait: 300 },
  { key: 'e' },
  { wait: 1200 },
  { key: 'a' },
  { wait: 1200 },
  { eval: `check.combobox('pea', ['Peach', 'Pear'])` },
  ...shots('combobox'),
  { key: 'Enter' },
  { wait: 500 },
  { eval: `check.picked('peach')` },
  { key: 'Meta+Enter' },
  { wait: 300 },
  { eval: `check.keys({ value: 'peach', open: false, out: 1 })` },
  { key: 'z' },
  { key: 'z' },
  { wait: 500 },
  { key: 'Enter' },
  { key: 'Meta+Enter' },
  { wait: 300 },
  { eval: `check.keys({ value: 'peach', text: 'Peachzz', open: true, out: 1 })` },
  { key: 'Escape' },
  { wait: 500 },
  { eval: `check.keys({ value: 'peach', text: 'Peach', open: false, out: 1 })` },
  { eval: `document.getElementById('check:fruit').querySelector('input').select(), true` },
  { key: 'p' },
  { key: 'l' },
  { key: 'u' },
  { wait: 500 },
  { key: 'Meta+Enter' },
  { wait: 500 },
  { eval: `check.keys({ value: 'plum', text: 'Plum', open: false, out: 1 })` },
  { eval: 'check.labelled()' },
  { eval: 'check.blur()' },
  { rclick: rowPoint(1) },
  { wait: 500 },
  { eval: `check.menuAt('${SUBJECTS[1]!.id}', ${JSON.stringify(rowPoint(1))}, 'Open')` },
  { key: 'ArrowDown' },
  { key: 'ArrowDown' },
  { key: 'ArrowDown' },
  { key: 'ArrowRight' },
  { wait: 500 },
  { eval: `check.submenu(['Drafts', 'Reviews'])` },
  ...shots('menu'),
  { key: 'Enter' },
  { wait: 500 },
  { eval: `check.acted('${SUBJECTS[1]!.id}/drafts')` },
  { eval: 'check.focusButton(0)' },
  { key: 'Enter' },
  { wait: 500 },
  { eval: `check.menuAt('${SUBJECTS[0]!.id}', null, 'New worker')` },
  { eval: 'check.anchored(0)' },
  ...shots('button'),
  { key: 'Escape' },
  { wait: 500 },
  { eval: 'check.closedTo(0)' },
  { key: 'Enter' },
  { wait: 500 },
  { key: 'End' },
  { key: 'Enter' },
  { wait: 500 },
  { eval: `check.checked('${SUBJECTS[0]!.id}/open')` },
  { rclick: rowPoint(3) },
  { wait: 500 },
  { eval: `check.menuAt('${SUBJECTS[3]!.id}', ${JSON.stringify(rowPoint(3))}, 'Open')` },
  { rclick: rowPoint(2) },
  { wait: 500 },
  { eval: `check.menuAt('${SUBJECTS[2]!.id}', ${JSON.stringify(rowPoint(2))}, 'Open')` },
  { eval: 'check.openAt(1)' },
  { wait: 500 },
  { eval: `check.menuAt('${SUBJECTS[1]!.id}', null, 'Open')` },
  { key: 'Escape' },
  { wait: 300 },
  { eval: 'check.stop()' },
  { eval: 'check.ownAttributes()' },
  { eval: 'check.errors()' },
]

/** Serves the page, the design and every module it reaches. */
async function serve() {
  const server = createServer(async (req, res) => {
    const url = (req.url ?? '/').split('?')[0]!
    try {
      if (url === '/') return res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE)
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
  if (engine === 'serve') return console.log((await serve()).url)
  if (!ENGINES.includes(engine) || (flag && (flag !== '--shots' || !dir))) throw new Error(`usage: tsx scripts/lib-ui-check.ts ${ENGINES.join('|')} [--shots <dir>]`)
  const shots = (name: string): Step[] => (dir ? [{ shot: path.resolve(dir, `${engine}-${name}.png`) }] : [])
  const served = await serve()
  try {
    await (engine === 'chrome' ? inChrome : inWebKit)(served.url, STEPS(shots))
    console.log(`\n${engine}: every check passed`)
  } finally {
    served.close()
  }
}

await main().catch((err: Error) => {
  console.error(`✖ ${err.message}`)
  process.exitCode = 1
})
