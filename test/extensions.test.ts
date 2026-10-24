import assert from 'node:assert/strict'
import { test } from 'node:test'
import { registry, resolve, type Found, type Outcome, type Resolved } from '../src/bridge/extensions.ts'
import { matchRead, MAX_DEPTH, nestedIn, qualifiedOf, tooDeep, type Caller } from '../src/shared/extensions.ts'
import type { Config } from '../src/shared/model.ts'

const TOWER = '1.81'
const NOW = Date.parse('2026-10-24T12:00:00Z')

const config = (over: Partial<Config> = {}): Config => ({
  argv: ['claude'],
  projects: { app: { name: 'App', hub: '/app', repos: [] }, site: { name: 'Site', hub: '/site', repos: [] } },
  ...over,
})

type Fields = { provides?: string; version?: string; requires?: Record<string, string>; wants?: Record<string, string>; settings?: object } & Record<string, unknown>

/** An extension folder holding the manifest `fields` make, under `id`; `bundled` ones live in the checkout. */
const ext = (id: string, fields: Fields = {}, bundled = false): Found => ({
  id,
  bundled,
  dir: `/ext/${id}`,
  text: JSON.stringify({ id, version: '1.0', title: id, ...fields, requires: { tower: TOWER, ...fields.requires } }),
})

/** The config entries that add each user extension of `found` by its folder. */
const added = (found: Found[]): Config['extensions'] => Object.fromEntries(found.filter((f) => !f.bundled).map((f) => [f.id, { path: f.dir }]))

const resolved = (found: Found[], over: Partial<Config> = {}) => resolve(found, config({ ...over, extensions: { ...added(found), ...over.extensions } }), TOWER)

const codes = (r: Resolved, id: string) => r.refused.get(id)?.problems.map((p) => p.code)

test('a met graph starts in dependency order, ties by capability; wants order it too', () => {
  const r = resolved([ext('roles', { requires: { github: '1.0' } }), ext('github', { wants: { audit: '1.0' } }), ext('audit'), ext('zebra')])
  assert.deepEqual(r.order, ['audit', 'github', 'roles', 'zebra'])
  assert.equal(r.refused.size, 0)
  assert.deepEqual(r.accepted.get('github')!.wants, ['audit'])
})

test("a manifest is refused at its path: an unknown key, a reserved name, a bundled one's id, a copied folder, no tower requirement", () => {
  const r = resolved([ext('typo', { verbz: {} }), ext('spawn'), ext('quota'), { ...ext('copy'), text: ext('original').text }, { id: 'bare', bundled: false, dir: '/ext/bare', text: '{"id":"bare","version":"1.0","title":"b","requires":{}}' }])
  const problem = (id: string) => r.refused.get(id)!.problems[0]
  assert.equal(problem('typo').path, 'verbz')
  assert.match(problem('typo').message, /unknown key verbz: this tower is 1\.81/)
  assert.equal(problem('spawn').path, 'id')
  assert.match(problem('quota').message, /a bundled extension's id: give yours its own, with provides: "quota" to replace it/)
  assert.deepEqual([problem('copy').code, problem('copy').path], ['invalid', 'id'])
  assert.equal(problem('bare').path, 'requires.tower')
  assert.ok([...r.refused.values()].every((x) => x.state === 'refused'))
})

test("the config's entry: a new id takes an absolute path, and a folder without a manifest is refused", () => {
  const r = resolve([{ id: 'nowhere', bundled: false }, { id: 'relative', bundled: false }, { id: 'empty', bundled: false, dir: '/ext/empty' }], config({ extensions: { nowhere: {}, relative: { path: 'ext/relative' }, empty: { path: '/ext/empty' } } }), TOWER)
  assert.match(r.refused.get('nowhere')!.problems[0].message, /takes path/)
  assert.match(r.refused.get('relative')!.problems[0].message, /absolute folder/)
  assert.match(r.refused.get('empty')!.problems[0].message, /no extension\.json in \/ext\/empty/)
})

test('requires.tower is read before any other key: a newer tower is too-new, an older major too-old, whatever else the manifest holds', () => {
  const r = resolved([ext('future', { requires: { tower: '1.90' }, verbz: {} }), ext('next', { requires: { tower: '2.0' } }), ext('past', { requires: { tower: '0.9' } })])
  assert.deepEqual([codes(r, 'future'), codes(r, 'next'), codes(r, 'past')], [['too-new'], ['too-new'], ['too-old']])
  assert.match(r.refused.get('future')!.problems[0].message, /needs tower 1\.90; this is 1\.81: tower update/)
})

test('a requirement no extension provides, or out of its range, is unmet; a refused provider skips its dependents, until nothing changes', () => {
  const r = resolved([
    ext('roles', { requires: { github: '1.0' } }),
    ext('lonely', { requires: { reviews: '1.0' } }),
    ext('picky', { requires: { audit: '1.4' } }),
    ext('audit', { version: '1.2' }),
    ext('github', { requires: { tower: '9.0' } }),
    ext('deep', { requires: { roles: '1.0' } }),
  ])
  assert.deepEqual(codes(r, 'lonely'), ['unmet'])
  assert.match(r.refused.get('picky')!.problems[0].message, /requires audit 1\.4; audit provides 1\.2/)
  assert.deepEqual([r.refused.get('roles')!.state, r.refused.get('deep')!.state], ['skipped', 'skipped'])
  assert.match(r.refused.get('roles')!.problems[0].message, /github is not running/)
  assert.deepEqual(r.order, ['audit'])
})

test('an extension turned off is off, and a dependent says so', () => {
  const r = resolved([ext('reviews', {}, true), ext('notes', { requires: { reviews: '1.0' } })], { extensions: { reviews: { off: true } } })
  assert.equal(r.refused.get('reviews')!.state, 'off')
  assert.match(r.refused.get('notes')!.problems[0].message, /requires reviews, which no extension provides \(reviews, bundled, is off\)/)
})

test('a cycle among requires and wants refuses each member, and skips their dependents', () => {
  const r = resolved([ext('ant', { requires: { bee: '1.0' } }), ext('bee', { wants: { ant: '1.0' } }), ext('cat', { requires: { ant: '1.0' } }), ext('dog')])
  assert.deepEqual([codes(r, 'ant'), codes(r, 'bee'), r.refused.get('cat')!.state], [['cycle'], ['cycle'], 'skipped'])
  assert.match(r.refused.get('ant')!.problems[0].message, /in a cycle: ant → bee → ant/)
  assert.deepEqual(r.order, ['dog'])
})

test('two providers of a capability: a bundled one is kept and the user one refused; two users both refused', () => {
  const r = resolved([ext('reviews', {}, true), ext('my-reviews', { provides: 'reviews' }), ext('one', { provides: 'notes' }), ext('two', { provides: 'notes' })])
  assert.deepEqual(r.order, ['reviews'])
  assert.match(r.refused.get('my-reviews')!.problems[0].message, /my-reviews and reviews \(bundled\) all provide reviews: set extensions\.reviews\.off to replace it/)
  assert.deepEqual([codes(r, 'one'), codes(r, 'two')], [['conflict'], ['conflict']])
})

test('settings are parsed by the manifest schema with its defaults, and a config that breaks it refuses the extension', () => {
  const settings = { type: 'object', additionalProperties: false, properties: { every: { type: 'integer', default: 5 } } }
  const r = resolved([ext('ok', { settings }), ext('bad', { settings }), ext('none')], { extensions: { bad: { path: '/ext/bad', settings: { every: 'often' } }, none: { path: '/ext/none', settings: { x: 1 } } } })
  assert.deepEqual(r.accepted.get('ok')!.settings, { every: 5 })
  assert.match(r.refused.get('bad')!.problems[0].message, /^extensions\.bad\.settings\.every: /)
  assert.match(r.refused.get('none')!.problems[0].message, /takes no settings/)
})

test('views are validated and not read yet, and a key newer than the declared tower is under-declared: both warnings', () => {
  const r = resolved([ext('later', { requires: { tower: '1.80' }, views: { page: { 'worker.tabs': { module: 'tab.js', subject: 'card' } } } }), ext('wrong', { views: { page: { tabs: { subject: 'card' } } } })])
  const later = r.accepted.get('later')!.problems
  assert.deepEqual(later.filter((p) => p.code === 'not-yet').map((p) => [p.path, p.level]), [['views', 'warn']])
  assert.deepEqual(later.filter((p) => p.code === 'under-declared').map((p) => [p.path, p.level, p.message]), [['id', 'warn', 'uses id, version, title, requires, views, since 1.81, but requires tower 1.80: raise it to 1.81']])
  assert.deepEqual(codes(r, 'wrong'), ['invalid'])
})

test('a capability off on a floor turns off every extension that requires it there, derived, never restarted', () => {
  const r = resolved([ext('github'), ext('roles', { requires: { github: '1.0' } }), ext('other')], { projects: { ...config().projects, app: { name: 'App', hub: '/app', repos: [], capabilities: { github: { off: true } } } } })
  assert.deepEqual([r.accepted.get('github')!.off, r.accepted.get('roles')!.off, r.accepted.get('other')!.off], [['app'], ['app'], []])
})

test('the registry: bundled first then by id; a failed start fails it and skips what requires it; refusals keep their problems', () => {
  const r = resolved([ext('github'), ext('roles', { requires: { github: '1.0' } }), ext('zeta', {}, true), ext('typo', { verbz: 1 })])
  const outcomes = new Map<string, Outcome>([
    ['github', { at: NOW, error: { code: 'mismatch', message: 'start returned verbs, which its manifest doesn\'t declare' } }],
    ['roles', { at: NOW, error: { code: 'failed', message: 'Missing required dependencies' } }],
    ['zeta', { at: NOW }],
  ])
  const views = registry(r, outcomes, NOW).extensions
  assert.deepEqual(views.map((v) => [v.id, v.state]), [['zeta', 'started'], ['github', 'failed'], ['roles', 'skipped'], ['typo', 'refused']])
  assert.deepEqual(views[1].problems.map((p) => [p.lane, p.code]), [['start', 'mismatch']])
  assert.deepEqual(views[2].problems.map((p) => [p.code, p.message]), [['skipped', 'github is not running: its problems first']])
  assert.deepEqual(views[3].problems.map((p) => [p.lane, p.code, p.at, p.count]), [['load', 'invalid', NOW, 1]])
})

test("a qualified name splits at its first /: the core's is tower, and the provider's own name keeps its slashes", () => {
  assert.deepEqual(qualifiedOf('tower/collection/write'), { cap: 'tower', name: 'collection/write' })
  assert.deepEqual(qualifiedOf('my-reviews/history/<project>'), { cap: 'my-reviews', name: 'history/<project>' })
  assert.deepEqual(['spawn', '/spawn', 'pulse/', 'Pulse/ping', 'a/ping'].map(qualifiedOf), [undefined, undefined, undefined, undefined, undefined])
})

test("a call inside a handler keeps the handler's caller with its verb in within, and one past the depth is refused with its chain", () => {
  const worker: Caller = { t: 'worker', id: 'w1', via: 'cli', within: [] }
  assert.deepEqual(nestedIn(nestedIn(worker, 'pulse/ping'), 'chime/ring'), { t: 'worker', id: 'w1', via: 'cli', within: ['pulse/ping', 'chime/ring'] })
  const deepest = Array.from({ length: MAX_DEPTH - 1 }, () => 'pulse/ping').reduce(nestedIn, worker)
  assert.equal(tooDeep(deepest, 'pulse/ping'), undefined)
  assert.match(tooDeep(nestedIn(deepest, 'pulse/ping'), 'chime/ring')!, /nested more than 8 calls deep: pulse\/ping → .* → chime\/ring$/)
})

test("a read's path matches its words and takes each param decoded", () => {
  assert.deepEqual(matchRead('beats/<project>', 'beats/my%20lab'), { project: 'my lab' })
  assert.deepEqual(matchRead('history', 'history'), {})
  assert.deepEqual(['beats', 'beats/', 'beats/lab/more', 'beat/lab'].map((path) => matchRead('beats/<project>', path)), [undefined, undefined, undefined, undefined])
})
