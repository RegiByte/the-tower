import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { clientModule, CORE_VIEWS_DIR, LIB_UI_PREFIX, libraryUrls, libUiUrls, moduleGraph, servedModule, sourceUrl, staticImports, urlSource } from '../src/tower/served.ts'
import { REPO } from './library.ts'

const SDK = `${LIB_UI_PREFIX}sdk.js`

/** A module's text as the tower serves it at `url`: a core view bundled as a client, any other as `servedModule` serves it. */
const textOf = async (url: string) => (url.startsWith('/x/tower/') ? clientModule(urlSource(url)!) : servedModule(url))

/** The URLs of every TypeScript file of a folder below `src/`, `.d.ts` aside. */
const urlsIn = (dir: string) =>
  readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'))
    .map((f) => sourceUrl(path.join(dir, f)))

test('lib-ui: nothing in the library, src/shared or a core view reaches the tower\'s elements', async () => {
  const entries = [...libraryUrls(), ...urlsIn(path.join(REPO, 'src', 'shared')), ...urlsIn(CORE_VIEWS_DIR)]
  const modules = await moduleGraph(entries, textOf)
  const reached = [...modules.keys()].filter((url) => url.startsWith(LIB_UI_PREFIX))
  assert.deepEqual(reached, [], "the core's modules import /lib-ui/: an element is drawn as a string (/lib/elements.js), and only a renderer or an extension's client imports its module")
})

test('lib-ui: an element module imports only the library and the SDK bundle, which imports nothing', async () => {
  const imports = await Promise.all(
    [...libUiUrls(), SDK].map(async (url) => (await staticImports(url, (await servedModule(url))!)).map((imported) => `${url} -> ${imported}`)),
  )
  const strays = imports.flat().filter((line) => {
    const [from, to] = line.split(' -> ') as [string, string]
    return from === SDK || !(to === SDK || libraryUrls().includes(to))
  })
  assert.deepEqual(strays, [], 'a /lib-ui/ module reaches past the library and /lib-ui/sdk.js: a package belongs in the SDK bundle, a helper in /lib/')
})
