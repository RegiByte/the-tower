import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import vm from 'node:vm'
import { API_VERSION } from '../src/shared/api.ts'
import { designCss } from '../src/shared/design.ts'
import { bundled, MODULES, towerClient } from '../src/tower/served.ts'

/**
 * Holds what the tower serves to `test/served-exports.json`: a removal without a major, or any other difference from the
 * list, fails. `npm run served:update` (`UPDATE_SERVED=1`) rewrites the list from what is served now; commit it.
 */

/** What renderers may build on, by URL, as of the API major it was written at. */
type Served = { major: number; served: Record<string, string[]> }

const LIST = path.join(import.meta.dirname, 'served-exports.json')
const UPDATE = 'npm run served:update'

/** `window.tower`'s members, a namespace's as `store.get`, read by running `/tower.js` in a page of its own at `/r/test/`. */
function towerMembers(): string[] {
  const listener = { addEventListener: () => {} }
  const page: Record<string, unknown> = {
    document: { currentScript: null, documentElement: { dataset: {}, style: { setProperty: () => {}, removeProperty: () => {} } } },
    location: { origin: 'http://127.0.0.1', pathname: '/r/test/', search: '' },
    matchMedia: () => ({ matches: false, ...listener }),
    localStorage: { getItem: () => null },
    ...listener,
  }
  page.window = page
  page.parent = page
  vm.runInNewContext(towerClient(), page)
  const tower = page.tower as Record<string, unknown>
  return Object.entries(tower).flatMap(([name, member]) =>
    typeof member === 'object' ? Object.keys(member as object).map((key) => `${name}.${key}`) : [name],
  )
}

/** A stylesheet's custom properties (`--ink`) and classes (`.needs`), the classes read from its selectors alone. */
function stylesheetNames(css: string): string[] {
  const selectors = css.replace(/\{[^{}]*\}/g, ' ')
  return [...new Set([...(css.match(/--[\w-]+(?=\s*:)/g) ?? []), ...(selectors.match(/\.[a-zA-Z][\w-]*/g) ?? [])])]
}

/** Every name served now: each module's exports, `/tower.js`'s members, `/design.css`'s custom properties and classes. */
function servedNow(): Record<string, string[]> {
  const served: Record<string, string[]> = {
    '/tower.js': towerMembers(),
    '/design.css': stylesheetNames(designCss()),
  }
  for (const url of Object.keys(MODULES)) served[url] = bundled(url).exports
  return Object.fromEntries(Object.entries(served).map(([url, names]) => [url, [...names].sort()]))
}

test('the served modules keep every export renderers may import, until the API major moves', () => {
  const listed: Served = JSON.parse(readFileSync(LIST, 'utf8'))
  const now = servedNow()
  const major = Number(API_VERSION.split('.')[0])
  const gone = Object.entries(listed.served).flatMap(([url, names]) => names.filter((n) => !now[url]?.includes(n)).map((n) => `  ${url}  ${n}`))
  if (gone.length && major === listed.major) {
    assert.fail(
      [
        `What the tower serves no longer has what renderers may build on (listed in ${path.relative(process.cwd(), LIST)}):`,
        ...gone,
        'A renderer kept outside this checkout breaks on each. Either keep the name (an alias of what replaces it, marked',
        '@deprecated, will do), or move the major of API_VERSION in src/shared/api.ts and add a CHANGELOG line saying what to',
        `use instead (decision renderer-api-contract). Then \`${UPDATE}\` writes the new list.`,
      ].join('\n'),
    )
  }
  const written = `${JSON.stringify({ major, served: now } satisfies Served, null, 2)}\n`
  if (process.env.UPDATE_SERVED) return writeFileSync(LIST, written)
  assert.equal(readFileSync(LIST, 'utf8'), written, `${path.relative(process.cwd(), LIST)} is stale: what the tower serves changed. Run \`${UPDATE}\` and commit it.`)
})
