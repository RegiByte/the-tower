import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { spawnProblems } from '/lib/extension.js'
import { libraryUrls, SERVER_ONLY } from '../src/tower/served.ts'
import { checkRuntime, libraryInCore, libraryShapes, modulesOf, namedTwice, reachesCore, reachNow, REPO, RUNTIMES, shapeOf, type Library } from './library.ts'

const REACH = path.join(import.meta.dirname, 'library-reach.json')
const listedLibrary = () => (JSON.parse(readFileSync(path.join(import.meta.dirname, 'served-exports.json'), 'utf8')) as { library: Library }).library

test('library: each file holds only named re-exports and deprecated aliases', () => {
  const problems = [...libraryShapes()].flatMap(([url, { problems }]) => problems.map((p) => `${url} ${p}`))
  assert.deepEqual(problems, [])
})

test('library: the shape check refuses what would make a helper API by accident', () => {
  const refused = [
    "export * from '../shared/format.ts'\n",
    "export * as words from '../shared/format.ts'\n",
    "export { default } from '../shared/format.ts'\nexport default 1\n",
    "export const esc = (s: string) => s\n",
    "export { esc as escape } from '../shared/format.ts'\n",
    "export type Own = { a: string }\n",
    "/** @deprecated use esc */\nexport const old = 1\n",
  ]
  for (const text of refused) assert.ok(shapeOf(text).problems.length, text)
})

test('library: the shape check reads every kind of line a file may hold', () => {
  const shape = shapeOf(`/** A header. */
export {
  esc,
  /** @provisional */ noun,
} from '../shared/format.ts'
export type {
  Card,
} from '../bridge/board.ts'
import { esc as escaped } from '../shared/format.ts'
/** @deprecated 2.7: use esc */ export const quoted = escaped
`)
  assert.deepEqual(shape.problems, [])
  assert.deepEqual(Object.fromEntries(shape.values), { esc: {}, noun: { stability: 'provisional' }, quoted: { deprecated: { since: '2.7', use: 'esc' } } })
  assert.deepEqual(Object.fromEntries(shape.types), { Card: {} })
})

test('library: a name stands in one module', () => {
  assert.deepEqual(namedTwice(libraryShapes()), [])
  const twice = new Map([
    ['/lib/a.js', { values: new Map([['esc', {}]]), types: new Map() }],
    ['/lib/b.js', { values: new Map([['esc', {}]]), types: new Map() }],
  ])
  assert.deepEqual(namedTwice(twice), ['esc in /lib/a.js and /lib/b.js'])
})

test('library: each module runs in one runtime, and SERVER_ONLY names the server ones', () => {
  assert.deepEqual(RUNTIMES.flatMap(modulesOf).sort(), libraryUrls())
  assert.deepEqual(modulesOf('server'), SERVER_ONLY)
})

for (const runtime of RUNTIMES) {
  test(`library: the ${runtime} modules typecheck in their runtime alone`, () => {
    const { errors, files } = checkRuntime(runtime)
    assert.equal(errors, '', `a ${runtime} module reaches outside its runtime:\n${errors}`)
    const dom = files.some((f) => f.endsWith('/lib.dom.d.ts'))
    const node = files.some((f) => f.includes('/@types/node/'))
    assert.equal(dom, runtime === 'browser', `the ${runtime} typecheck ${dom ? 'read' : "didn't read"} the DOM's types`)
    assert.equal(node, runtime === 'server', `the ${runtime} typecheck ${node ? 'read' : "didn't read"} node's types`)
  })
}

test('library: the node source of each module exports what the list says', async () => {
  const listed = listedLibrary()
  for (const url of libraryUrls()) {
    const held = Object.keys(await import(url)).sort()
    assert.deepEqual(held, Object.keys(listed[url]!.values).sort(), url)
  }
})

test('library: nothing outside the core reaches into it but the listed files, which only shrink', () => {
  const now = reachNow()
  if (process.env.UPDATE_REACH) return writeFileSync(REACH, `${JSON.stringify(now, null, 2)}\n`)
  const listed: string[] = JSON.parse(readFileSync(REACH, 'utf8'))
  assert.deepEqual(now.filter((line) => !listed.includes(line)), [], `new ways into the core: import from /lib/ instead, or add the name there (${path.relative(REPO, REACH)} only shrinks)`)
  assert.deepEqual(listed.filter((line) => !now.includes(line)), [], `gone: delete these lines from ${path.relative(REPO, REACH)}`)
})

test("library: docs/extending.md's table names each module and where it runs", () => {
  const docs = readFileSync(path.join(REPO, 'docs', 'extending.md'), 'utf8')
  for (const runtime of RUNTIMES) for (const url of modulesOf(runtime)) assert.ok(docs.includes(`| \`${url}\` | ${runtime} |`), `${url} (${runtime})`)
})

test('library: spawnProblems says what is wrong with spawn fields, each at its path, and nothing of fields a spawn would take', () => {
  assert.deepEqual(spawnProblems({ cwd: 'hub', model: 'opus' }), [])
  assert.deepEqual(spawnProblems({ nope: 1 }), [{ path: 'nope', message: 'unknown key' }])
  assert.deepEqual(spawnProblems({ cut: { name: 1 } }).map((p) => p.path), ['cut.name'])
})

test('library: the reach check counts every way in but the library', () => {
  const reaching = (specifier: string) => reachesCore('extensions/autotidy/server.ts', specifier)
  for (const specifier of ['../../src/shared/press.ts', '/cards.js', 'tower:media.js', '/shared/press.js', '/src/bridge/board.js', '/x/tower/parts.js', '/vendor/marked.js']) assert.ok(reaching(specifier), specifier)
  for (const specifier of ['/lib/words.js', '/tower.js', './own.ts', 'zod']) assert.ok(!reaching(specifier), specifier)
})

test('library: the core never imports it by path, and only a core view imports it by URL', () => {
  assert.deepEqual(libraryInCore(), [])
})
