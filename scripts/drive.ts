/**
 * A headless Chrome driven over CDP, for checking renderers: a fresh profile and a free debugging port per run (a
 * reused profile restores old tabs; a port still held attaches to an old browser), page errors printed as they
 * happen, audio muted. Steps run in order:
 *
 *   npm run drive -- <url> [--size 1280x800] [--scheme light|dark] [--motion reduce] step…
 *     --eval '<js>'   evaluate in the page, awaited; prints the result as JSON (fails the run on a throw)
 *     --shot <file>   save a PNG of the page, DOM panels included
 *     --wait <ms>     wait in real time
 *     --hover <css>   move the mouse to the middle of the first element the selector finds, as a real pointer would
 *     --wheel <dy>    turn the mouse wheel where the pointer is (after --hover), 100 a notch: --wheel=-100 scrolls up
 *     --key <chord>   press a key on the focused element as a real keyboard would: a key name with any of Meta+, Ctrl+,
 *                     Alt+, Shift+ before it (Meta+Backspace, Shift+Enter, Alt+ArrowLeft, Ctrl+c)
 *     --type <text>   type text into the focused element
 *
 *   npm run drive -- 'http://127.0.0.1:4399/r/tower3d/?board=busy&seed=1' \
 *     --eval 'tower3d.ready()' --eval 'tower3d.capture()' --eval 'tower3d.step(60).counts' --shot /tmp/busy.png
 *
 * Chrome is found at CHROME, else the macOS default install.
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const STEPS = ['eval', 'shot', 'wait', 'hover', 'wheel', 'key', 'type'] as const
type Step = { kind: (typeof STEPS)[number]; value: string }

function parse(argv: string[]) {
  const { values, tokens } = parseArgs({
    args: argv,
    allowPositionals: true,
    tokens: true,
    options: { size: { type: 'string', default: '1280x800' }, scheme: { type: 'string' }, motion: { type: 'string' }, ...Object.fromEntries(STEPS.map((s) => [s, { type: 'string', multiple: true }])) },
  })
  const url = tokens.find((t) => t.kind === 'positional')?.value
  if (!url) throw new Error('usage: npm run drive -- <url> [--size WxH] [--scheme light|dark] [--motion reduce] [--eval js | --shot file | --wait ms | --hover css | --wheel dy | --key chord | --type text]…')
  const steps: Step[] = tokens.flatMap((t) => (t.kind === 'option' && (STEPS as readonly string[]).includes(t.name) ? [{ kind: t.name as Step['kind'], value: t.value! }] : []))
  const [width, height] = values.size.split('x').map(Number)
  return { url, steps, width, height, scheme: values.scheme, motion: values.motion }
}

const freePort = () => new Promise<number>((resolve, reject) => {
  const server = createServer().listen(0, '127.0.0.1', () => {
    const { port } = server.address() as { port: number }
    server.close(() => resolve(port))
  }).on('error', reject)
})

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function pageSocket(port: number): Promise<string> {
  for (let i = 0; i < 100; i++) {
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json() as Promise<{ type: string; webSocketDebuggerUrl: string }[]>, () => [])
    const page = targets.find((t) => t.type === 'page')
    if (page) return page.webSocketDebuggerUrl
    await sleep(100)
  }
  throw new Error(`Chrome did not open a page on port ${port}`)
}

/** One CDP connection: `send` answers with the command's result; `on` hears events by method. */
function connect(url: string) {
  const ws = new WebSocket(url)
  let next = 0
  const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>()
  const listeners = new Map<string, ((params: any) => void)[]>()
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(String(e.data))
    if (msg.id === undefined) return listeners.get(msg.method)?.forEach((fn) => fn(msg.params))
    const p = pending.get(msg.id)!
    pending.delete(msg.id)
    if (msg.error) p.reject(new Error(`${msg.error.message}`))
    else p.resolve(msg.result)
  })
  const opened = new Promise<void>((resolve, reject) => (ws.addEventListener('open', () => resolve()), ws.addEventListener('error', () => reject(new Error(`no CDP at ${url}`)))))
  return {
    opened,
    send: (method: string, params: object = {}) => new Promise<any>((resolve, reject) => {
      const id = ++next
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
    }),
    on: (method: string, fn: (params: any) => void) => listeners.set(method, [...(listeners.get(method) ?? []), fn]),
    close: () => ws.close(),
  }
}

/** CDP's modifier bits, and the keys a chord can name beyond a single character: [code, keyCode, the text it types]. */
const MODIFIERS: Record<string, number> = { Alt: 1, Ctrl: 2, Meta: 4, Shift: 8 }
const KEYS: Record<string, [string, number, string?]> = {
  Enter: ['Enter', 13, '\r'], Backspace: ['Backspace', 8], Delete: ['Delete', 46], Tab: ['Tab', 9], Escape: ['Escape', 27],
  ArrowLeft: ['ArrowLeft', 37], ArrowRight: ['ArrowRight', 39], ArrowUp: ['ArrowUp', 38], ArrowDown: ['ArrowDown', 40],
}

/** The keyDown of a chord such as `Meta+Backspace`; a plain character types itself unless Meta or Ctrl is held. */
const keyDown = (chord: string) => {
  const parts = chord.split('+')
  const key = parts.pop()!
  const modifiers = parts.reduce((bits, m) => bits | MODIFIERS[m], 0)
  const [code, keyCode, typed] = KEYS[key] ?? [`Key${key.toUpperCase()}`, key.toUpperCase().charCodeAt(0), key]
  const text = modifiers & (MODIFIERS.Meta | MODIFIERS.Ctrl) ? undefined : typed
  return { type: text === undefined ? 'rawKeyDown' : 'keyDown', key, code, windowsVirtualKeyCode: keyCode, modifiers, ...(text && { text }) }
}

const describe = (details: any) => details.exception?.description ?? details.text

/** A page in headless Chrome: evaluate in it (awaited, by value), save a PNG of it with its DOM, or move the mouse to a point. */
export type Page = {
  eval(expression: string): Promise<unknown>
  shot(file: string): Promise<void>
  mouse(x: number, y: number): Promise<void>
  /** At the pointer, where `mouse` last moved it. */
  wheel(deltaY: number): Promise<void>
  key(chord: string): Promise<void>
  type(text: string): Promise<void>
}

/** Opens `url` in a fresh headless Chrome, runs `use` on it, and closes everything after. Page errors go to stderr. */
export async function withPage<T>(url: string, { width = 1280, height = 800, scheme, motion }: { width?: number; height?: number; scheme?: string; motion?: string }, use: (page: Page) => Promise<T>): Promise<T> {
  const port = await freePort()
  const profile = mkdtempSync(path.join(os.tmpdir(), 'tower-drive-'))
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${width},${height}`,
    '--no-first-run', '--no-default-browser-check', '--mute-audio', '--hide-scrollbars', 'about:blank',
  ], { stdio: 'ignore' })
  try {
    const cdp = connect(await pageSocket(port))
    await cdp.opened
    cdp.on('Runtime.exceptionThrown', (p) => console.error(`page error: ${describe(p.exceptionDetails)}`))
    cdp.on('Runtime.consoleAPICalled', (p) => p.type === 'error' && console.error(`page console: ${p.args.map((a: any) => a.value ?? a.description).join(' ')}`))
    await cdp.send('Runtime.enable')
    await cdp.send('Page.enable')
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
    const features = [scheme && { name: 'prefers-color-scheme', value: scheme }, motion && { name: 'prefers-reduced-motion', value: motion }].filter(Boolean)
    if (features.length) await cdp.send('Emulation.setEmulatedMedia', { features })
    const loaded = new Promise((resolve) => cdp.on('Page.loadEventFired', resolve))
    await cdp.send('Page.navigate', { url })
    await loaded
    let pointer = { x: 0, y: 0 }
    const result = await use({
      async eval(expression) {
        const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
        if (r.exceptionDetails) throw new Error(`${expression}\n  threw: ${describe(r.exceptionDetails)}`)
        return r.result.value ?? null
      },
      async shot(file) {
        const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' })
        writeFileSync(file, Buffer.from(data, 'base64'))
      },
      async mouse(x, y) {
        pointer = { x, y }
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
      },
      async wheel(deltaY) {
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', ...pointer, deltaX: 0, deltaY })
      },
      async key(chord) {
        const down = keyDown(chord)
        await cdp.send('Input.dispatchKeyEvent', down)
        await cdp.send('Input.dispatchKeyEvent', { ...down, type: 'keyUp', text: undefined })
      },
      async type(text) {
        await cdp.send('Input.insertText', { text })
      },
    })
    cdp.close()
    return result
  } finally {
    if (chrome.exitCode === null) await new Promise((resolve) => (chrome.once('exit', resolve), chrome.kill()))
    rmSync(profile, { recursive: true, force: true })
  }
}

async function main() {
  const { url, steps, width, height, scheme, motion } = parse(process.argv.slice(2))
  await withPage(url, { width, height, scheme, motion }, async (page) => {
    for (const step of steps) {
      if (step.kind === 'wait') await sleep(Number(step.value))
      if (step.kind === 'shot') (await page.shot(step.value), console.log(`shot: ${step.value}`))
      if (step.kind === 'eval') console.log(JSON.stringify(await page.eval(step.value)))
      if (step.kind === 'wheel') await page.wheel(Number(step.value))
      if (step.kind === 'key') await page.key(step.value)
      if (step.kind === 'type') await page.type(step.value)
      if (step.kind === 'hover') {
        const at = (await page.eval(`(() => { const r = document.querySelector(${JSON.stringify(step.value)}).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2] })()`)) as [number, number]
        await page.mouse(...at)
      }
    }
  })
}

if (import.meta.main) {
  await main().catch((err: Error) => {
    console.error(err.message)
    process.exitCode = 1
  })
}
