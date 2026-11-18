/**
 * The morph (`src/shared/morph.ts`) keeps what the DOM holds: the cases of `test/morph-cases.ts`, bundled into one page
 * served on a free port, run in a real browser, which posts back each case's outcome. A case failing, a page error or
 * no outcome at all fails the run. CI runs it in headless Chrome; WebKit, the engine Safari and Tower.app run, differs
 * where focus moves (it has no `moveBefore`, so a moved node is blurred and the morph gives focus back):
 *
 *   npm run test:morph            headless Chrome (`scripts/drive.ts`)
 *   npm run test:morph-webkit     WebKit (`scripts/webkit.ts`, macOS only)
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import path from 'node:path'
import { build } from 'esbuild'
import type { CaseResult } from '../test/morph-cases.ts'
import { freePort, withPage } from './drive.ts'

const REPO = path.join(import.meta.dirname, '..')
const BROWSERS = ['chrome', 'webkit'] as const
type Browser = (typeof BROWSERS)[number]
const RUN = 'morphRun()'

async function page() {
  const bundle = await build({ entryPoints: [path.join(REPO, 'test', 'morph-cases.ts')], bundle: true, format: 'esm', write: false, target: 'es2023' })
  const cases = bundle.outputFiles[0]!.text.replace(/<\/script/g, '<\\/script')
  return `<!doctype html><meta charset="utf-8"><title>morph</title><body><div id="work"></div>
<script type="module">
${cases}
window.morphRun = async () => {
  const results = await runCases(document.getElementById('work'))
  await fetch('/results', { method: 'POST', body: JSON.stringify(results) })
  return results.length
}
</script>`
}

/** Serves the page until the browser posts its results, which the promise holds. */
async function serve(html: string) {
  let resolve!: (results: CaseResult[]) => void
  const results = new Promise<CaseResult[]>((r) => (resolve = r))
  const server = createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/results') {
      let body = ''
      req.on('data', (chunk) => (body += chunk))
      req.on('end', () => (res.end(), resolve(JSON.parse(body))))
      return
    }
    if (req.url !== '/') return res.writeHead(404).end()
    res.writeHead(200, { 'content-type': 'text/html' }).end(html)
  })
  const port = await freePort()
  await new Promise<void>((r) => server.listen(port, '127.0.0.1', r))
  return { url: `http://127.0.0.1:${port}/`, results, close: () => server.close() }
}

/** Runs the page in `browser`, and the errors the page or the browser reported on the way. */
async function runIn(browser: Browser, url: string): Promise<string[]> {
  if (browser === 'chrome') {
    return withPage(url, {}, async (p) => {
      await p.eval(RUN)
      return p.errors
    })
  }
  const child = spawn(process.execPath, ['--import', 'tsx', path.join(REPO, 'scripts', 'webkit.ts'), url, '--eval', RUN], { stdio: 'inherit' })
  const code = await new Promise<number | null>((r) => child.once('exit', r))
  return code === 0 ? [] : [`the WebKit harness exited with ${code}`]
}

async function main() {
  const browser = process.argv[2] as Browser
  if (!BROWSERS.includes(browser)) throw new Error(`usage: tsx scripts/morph-check.ts ${BROWSERS.join('|')}`)
  const served = await serve(await page())
  try {
    const errors = await runIn(browser, served.url)
    const results = await Promise.race([served.results, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('the page posted no results')), 5_000))])
    for (const { name, error } of results) console.log(error ? `✖ ${name}\n    ${error}` : `✔ ${name}`)
    const failed = results.filter((r) => r.error).length
    console.log(`\n${browser}: ${results.length - failed} passed, ${failed} failed${errors.length ? `, ${errors.length} page errors` : ''}`)
    if (failed || errors.length) process.exitCode = 1
  } finally {
    served.close()
  }
}

await main().catch((err: Error) => {
  console.error(err.message)
  process.exitCode = 1
})
