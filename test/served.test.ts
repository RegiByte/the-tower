import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import vm from 'node:vm'
import { API_VERSION, HOOKS } from '../src/shared/api.ts'
import { designCss } from '../src/shared/design.ts'
import { bundledClient, clientSource } from '../src/extensions.ts'
import { ADDS, BADGE_TONES, BUNDLED, CTX_SINCE, legacyOf, MANIFEST_SCHEMA, PROBLEM_CODES, RESERVED } from '../src/shared/extensions.ts'
import { bundled, bundledFile, MODULES, towerClient } from '../src/tower/served.ts'
import { FACT_KINDS } from '../src/shared/rate-limits.ts'
import { CLI_REGIONS, type Region } from '../src/shared/regions.ts'
import { declaredAt } from '../src/renderers.ts'

/**
 * Holds what the tower serves to `test/served-exports.json`, and what extensions build on beside it: a removal without a
 * major, or any other difference from the list, fails. `npm run served:update` (`UPDATE_SERVED=1`) rewrites the list from what is served now; commit it.
 */

/** What renderers may build on, by URL, as of the API major it was written at. */
type Served = { major: number; served: Record<string, string[]> }

const REPO = path.join(import.meta.dirname, '..')
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

type SchemaNode = { properties?: Record<string, SchemaNode>; additionalProperties?: SchemaNode | boolean; anyOf?: SchemaNode[] }

/** Every key path of a JSON Schema, `*` for any key of a record, each branch of an `anyOf` at its place: `views.*.*.module`. */
function keyPaths(node: SchemaNode, at: string[] = []): string[] {
  const own = Object.entries(node.properties ?? {}).flatMap(([key, child]) => [[...at, key].join('.'), ...keyPaths(child, [...at, key])])
  const any = typeof node.additionalProperties === 'object' ? keyPaths(node.additionalProperties, [...at, '*']) : []
  return [...new Set([...own, ...any, ...(node.anyOf ?? []).flatMap((branch) => keyPaths(branch, at))])]
}

/** The leaf paths of an object: `start.tower.version`. */
const leafPaths = (value: object, at: string[] = []): string[] =>
  Object.entries(value).flatMap(([key, inner]) => (typeof inner === 'object' ? leafPaths(inner, [...at, key]) : [[...at, key].join('.')]))

/**
 * Every name served now: each module's exports (a module moved into a bundled extension's client, at its old URL), `/tower.js`'s members, `/design.css`'s custom properties and classes,
 * and what extensions build on: the manifest's key paths, each lane's ctx members, and the core's problem codes, names,
 * adds, badge tones and hooks.
 */
function servedNow(): Record<string, string[]> {
  const served: Record<string, string[]> = {
    '/tower.js': towerMembers(),
    '/design.css': stylesheetNames(designCss()),
    'extension.json': keyPaths(MANIFEST_SCHEMA as SchemaNode),
    ctx: leafPaths(CTX_SINCE),
    core: [
      ...PROBLEM_CODES.map((code) => `problem.${code}`),
      ...RESERVED.map((name) => `reserved.${name}`),
      ...BUNDLED.map((name) => `bundled.${name}`),
      ...ADDS.map((add) => `adds.${add}`),
      ...BADGE_TONES.map((tone) => `tone.${tone}`),
      ...Object.keys(HOOKS).map((name) => `hook.tower/${name}`),
      ...FACT_KINDS.map((kind) => `kind.${kind}`),
    ],
  }
  for (const url of Object.keys(MODULES)) served[url] = bundled(url).exports
  for (const { old, now } of legacyOf('module')) {
    const { cap, file } = /^\/x\/(?<cap>[^/]+)\/(?<file>.+)$/.exec(now)!.groups!
    served[old] = bundledFile(clientSource(bundledClient(cap!)!, file!)!).exports
  }
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

/** The subject kinds the renderers table has a row for, in its order. */
const TABLE_KINDS = ['card', 'conversation', 'floor', 'shown', 'lines', 'item.*', 'collection', 'shelf', 'board']

/** A shipped renderer's regions, from its source's `renderer.json`. */
function regionsAt(dir: string): Region[] {
  const declared = declaredAt(path.join(REPO, dir), 'index.html')
  assert.ok(declared && 'regions' in declared, `${dir}/renderer.json declares nothing: ${declared && 'problem' in declared ? declared.problem : 'no file'}`)
  return declared.regions
}

/** Who the renderers table names, by column: the built-in renderers' declarations from their sources, and the `tower` command's. */
const TABLE_DRAWERS: [string, Region[]][] = [
  ['The tower page (`page`)', regionsAt('renderers/page')],
  ['Tower 3D (`tower3d`)', regionsAt('renderers/tower3d')],
  ['The Week (`week`)', regionsAt('renderers/week')],
  ['The `tower` command (`cli`)', CLI_REGIONS],
]

const DOCS = path.join(REPO, 'docs/extending.md')
const TABLE = /(<!-- regions: [^\n]*-->\n)[\s\S]*?(<!-- \/regions -->)/

/** docs/extending.md's table of where each renderer draws each subject kind, as their declarations say. */
const regionsTable = (): string => {
  const cell = (regions: Region[], kind: string) =>
    regions
      .filter((r) => r.subject === kind)
      .map((r) => `\`${r.id}\`${r.description ? `, ${r.description}` : ''}: ${r.holds.join(', ')}`)
      .join('<br>') || 'not drawn'
  return [
    `| Subject | ${TABLE_DRAWERS.map(([name]) => name).join(' | ')} |`,
    `|---|${TABLE_DRAWERS.map(() => '---|').join('')}`,
    ...TABLE_KINDS.map((kind) => `| \`${kind}\` | ${TABLE_DRAWERS.map(([, regions]) => cell(regions, kind)).join(' | ')} |`),
  ].join('\n')
}

test("docs/extending.md's renderers table is the renderers' declarations", () => {
  const docs = readFileSync(DOCS, 'utf8')
  assert.match(docs, TABLE, 'docs/extending.md has no <!-- regions: … --> … <!-- /regions --> block')
  const written = docs.replace(TABLE, (_, open: string, close: string) => `${open}${regionsTable()}\n${close}`)
  if (process.env.UPDATE_SERVED) return writeFileSync(DOCS, written)
  assert.equal(docs, written, `docs/extending.md's renderers table is stale: a renderer.json or cli.regions changed. Run \`${UPDATE}\` and commit it.`)
})
