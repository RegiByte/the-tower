import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chainOrder, registry, resolve, type Found, type Link, type Outcome, type Resolved } from '../src/bridge/extensions.ts'
import { matchRead, MAX_DEPTH, nestedIn, qualifiedOf, tooDeep, type Caller } from '../src/shared/extensions.ts'
import { extensionFactOf, type Session } from '../src/bridge/facts.ts'
import { floorCollections, ownedRefusal, sessionFacts } from '../src/bridge/stores.ts'
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
  const r = resolved([ext('future', { requires: { tower: '1.92' }, verbz: {} }), ext('next', { requires: { tower: '2.0' } }), ext('past', { requires: { tower: '0.9' } })])
  assert.deepEqual([codes(r, 'future'), codes(r, 'next'), codes(r, 'past')], [['too-new'], ['too-new'], ['too-old']])
  assert.match(r.refused.get('future')!.problems[0].message, /needs tower 1\.92; this is 1\.81: tower update/)
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

test('views are read in their 1.104 shape: the reserved shapes refused naming it, a view\'s regions its own, one region id one meaning', () => {
  const grid = { module: 'grid.js', export: 'mount', on: ['floor'], scales: ['pane'], regions: ['card.cell'], words: { label: 'Grid' } }
  const cell = { subject: 'card', holds: ['views'], scale: 'cell', arity: 'one' }
  const at = (found: Found[]) => resolve(found, config({ extensions: added(found) }), '1.104')
  const r = at([
    ext('grid', { requires: { tower: '1.104' }, views: { grid }, regions: { 'card.cell': cell } }),
    ext('later', { requires: { tower: '1.101' }, views: { grid }, regions: { 'card.cell': cell } }),
    ext('old', { views: { page: { 'worker.tabs': { module: 'tab.js', subject: 'card' } } } }),
    ext('stale', { regions: { 'x.place': { subject: 'card' } } }),
    ext('loose', { requires: { tower: '1.104' }, views: { grid } }),
  ])
  assert.deepEqual(r.accepted.get('grid')!.problems, [])
  assert.deepEqual(r.accepted.get('later')!.problems.filter((p) => p.code === 'under-declared').map((p) => p.path), ['views.grid.module'])
  assert.match(r.refused.get('old')!.problems[0].message, /since 1\.104 views are \{ "<name>": \{ module, export, on, scales, words/)
  assert.match(r.refused.get('stale')!.problems[0].message, /regions\.x\.place lacks holds/)
  assert.match(r.refused.get('loose')!.problems[0].message, /declares region card\.cell, which regions doesn't hold/)
  const clash = at([ext('one', { requires: { tower: '1.104' }, views: { grid }, regions: { 'card.cell': cell } }), ext('two', { requires: { tower: '1.104' }, views: { grid }, regions: { 'card.cell': { ...cell, scale: 'row' } } })])
  assert.deepEqual([codes(clash, 'one'), codes(clash, 'two')], [['conflict'], ['conflict']])
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
  assert.deepEqual(matchRead('raw/<id>/<file...>', 'raw/w1/src/a%20b.ts'), { id: 'w1', file: 'src/a b.ts' })
  assert.deepEqual(['raw/w1', 'raw/w1/', 'raw/w1/src//a.ts'].map((path) => matchRead('raw/<id>/<file...>', path)), [undefined, undefined, undefined])
})

const DOORS = { list: 'tower/board', read: 'tower/collection/<project>/<collection>/<item>', create: 'pulse/keep', edit: { none: 'a beat is never rewritten' }, delete: { none: 'beats are kept' } }

/** A verb `keep` for the doors to name, and a deprecated `stamp`. */
const KEEP = {
  keep: { input: { type: 'object' }, reply: { type: 'object' }, scope: 'system' },
  stamp: { input: { type: 'object' }, reply: { type: 'object' }, scope: 'system', deprecated: { since: '1.0', use: 'pulse/keep' } },
}

test("stores break their loader rules at their paths: a collection named apart from the capability, an owned one without doors, a door of another's, a code that is no letter", () => {
  const r = resolved([
    ext('named', { collections: { notes: { label: 'Notes', description: 'd' } } }),
    ext('doorless', { collections: { doorless: { label: 'D', description: 'd', owned: true } } }),
    ext('borrow', { collections: { borrow: { label: 'B', description: 'd', owned: true, doors: { ...DOORS, create: 'reviews/append' } } } }),
    ext('coded', { streams: { beats: { scope: 'system', facts: { bb: { schema: {} } } } } }),
  ])
  const problem = (id: string) => [r.refused.get(id)!.problems[0].path, r.refused.get(id)!.problems[0].message]
  assert.deepEqual(problem('named'), ['collections.notes', 'collection notes is named by the capability: named, or named.<name>'])
  assert.deepEqual(problem('doorless'), ['collections.doorless.doors', 'an owned collection declares its doors: list, read, create, edit, delete'])
  assert.deepEqual(problem('borrow'), ['collections.borrow.doors.create', "reviews/append is reviews's: a door names a verb or read of borrow or of the core (tower/…)"])
  assert.equal(problem('coded')[0], 'streams.beats.facts.bb')
})

test("a door that reads names a read of its owner's or the core's, a door that acts a verb of its owner's, neither deprecated", () => {
  const owned = (doors: object) => ({ verbs: KEEP, reads: { 'kept/<project>': { reply: { type: 'object' }, scope: 'project' } }, collections: { pulse: { label: 'B', description: 'd', owned: true, doors: { ...DOORS, ...doors } } } })
  const message = (doors: object) => {
    const r = resolved([ext('pulse', owned(doors))])
    return r.refused.get('pulse')?.problems.map((p) => [p.path, p.message])
  }
  assert.equal(message({}), undefined)
  assert.equal(message({ list: 'pulse/kept/<project>' }), undefined)
  assert.deepEqual(message({ create: 'pulse/make' }), [['collections.pulse.doors.create', "create is a door that acts, and pulse/make names no verb of pulse's manifest"]])
  assert.deepEqual(message({ edit: 'pulse/kept/<project>' }), [['collections.pulse.doors.edit', "edit is a door that acts, and pulse/kept/<project> names no verb of pulse's manifest"]])
  assert.deepEqual(message({ read: 'pulse/keep' }), [['collections.pulse.doors.read', "read is a door that reads, and pulse/keep names no read of pulse's manifest"]])
  assert.deepEqual(message({ create: 'tower/board' }), [['collections.pulse.doors.create', "create is a door that acts, and tower/board is the core's: it names a verb of pulse's, the one writer of the store"]])
  assert.deepEqual(message({ create: 'pulse/stamp' }), [['collections.pulse.doors.create', 'pulse/stamp is deprecated since 1.0: a door names what is current, pulse/keep']])
  assert.deepEqual(message({ list: 'tower/spawn' }), [['collections.pulse.doors.list', "tower/spawn is no read of the core's: a door names the core's generic reads (tower/board, tower/collection/<project>/<collection>/<item>)"]])
})

test('a manifest within the rules is accepted with its stores, each schema read as zod; requiring a tower before stores warns', () => {
  const r = resolved([
    ext('pulse', {
      verbs: KEEP,
      collections: { pulse: { label: 'Beats', description: 'd', owned: true, doors: DOORS }, 'pulse.notes': { label: 'Notes', description: 'd' } },
      streams: { beats: { scope: 'project', facts: { b: { schema: { type: 'object', properties: { n: { type: 'integer' } }, required: ['n'] } } } } },
      facts: { beat: { schema: { type: 'integer' } } },
    }),
  ])
  const pulse = r.accepted.get('pulse')!
  assert.deepEqual(pulse.problems.map((p) => [p.code, p.path]), [['under-declared', 'verbs'], ['under-declared', 'collections']])
  assert.equal(pulse.schemas.streams.get('beats')!.get('b')!.safeParse({ n: 'x' }).success, false)
  assert.equal(pulse.schemas.facts.get('beat')!.safeParse(3).success, true)
  assert.deepEqual(registry(r, new Map([['pulse', { at: NOW }]]), NOW).stores.map((s) => [s.provides, Object.keys(s.collections)]), [['pulse', ['pulse', 'pulse.notes']]])
})

test("a floor's collections: the config's, then an extension's where it is on, by it, the config's words over its own; off, only the config's stay, open", () => {
  const stores = [{ provides: 'pulse', chain: ['pulse'], answers: [], collections: { pulse: { label: 'Beats', description: 'Its beats', owned: true, doors: DOORS }, 'pulse.notes': { label: 'Notes', description: 'Its notes' } } }]
  const c = config({
    collections: { drafts: { label: 'Drafts' }, pulse: { label: 'Our beats' } },
    projects: { app: { name: 'App', hub: '/app', repos: [] }, site: { name: 'Site', hub: '/site', repos: [], capabilities: { pulse: { off: true } } } },
  })
  const app = floorCollections(c, 'app', stores)
  assert.deepEqual(Object.keys(app), ['drafts', 'pulse', 'pulse.notes'])
  assert.deepEqual(app.pulse, { label: 'Our beats', description: 'Its beats', by: 'pulse', owner: 'pulse', doors: DOORS })
  assert.deepEqual(app['pulse.notes'], { label: 'Notes', description: 'Its notes', by: 'pulse' })
  assert.deepEqual(floorCollections(c, 'site', stores), { drafts: { label: 'Drafts' }, pulse: { label: 'Our beats' } })
  assert.equal(ownedRefusal('pulse', app.pulse), 'pulse owns pulse: use pulse/keep')
  assert.equal(ownedRefusal('pulse', { ...app.pulse, doors: { ...DOORS, create: { none: 'beats come from its clock' } } }), 'pulse owns pulse: only pulse writes it (beats come from its clock)')
  assert.equal(ownedRefusal('pulse.notes', app['pulse.notes']), undefined)
})

test("a capability's session facts over a lineage: in order, each session once, its own only; tower.x.<cap>.<name> splits at the capability's end", () => {
  assert.deepEqual(extensionFactOf('tower.x.pulse.beat.count'), { cap: 'pulse', name: 'beat.count' })
  assert.equal(extensionFactOf('tower.show'), undefined)
  const session = (id: string, facts: Session['facts']['extensionFacts']) => ({ header: { id }, facts: { extensionFacts: facts } }) as unknown as Session
  const first = session('s1', [[1, 'pulse', 'beat', 1], [2, 'roles', 'role', 'fixer']])
  const then = session('s2', [[3, 'pulse', 'beat', 2]])
  assert.deepEqual(sessionFacts('pulse', [first, then, then]), [
    { name: 'beat', value: 1, at: 1, session: 's1' },
    { name: 'beat', value: 2, at: 3, session: 's2' },
  ])
})

const link = (cap: string, order: { before?: string[]; after?: string[] } = {}): Link => ({ cap, before: order.before ?? [], after: order.after ?? [] })

/** `a` depends on `b` when `b` is in `a`'s list, directly or through another's. */
const dependsIn = (deps: Record<string, string[]>) => {
  const reach = (a: string, b: string): boolean => (deps[a] ?? []).some((d) => d === b || reach(d, b))
  return reach
}

test('a chain runs a capability inside every capability that depends on it, directly or not, so the owner is innermost; ties go to the earlier name, outside', () => {
  const deps = dependsIn({ audit: ['reviews'], redact: ['audit'], lint: ['reviews'] })
  assert.deepEqual(chainOrder([link('reviews'), link('audit'), link('redact'), link('lint')], deps).order, ['lint', 'redact', 'audit', 'reviews'])
  assert.deepEqual(chainOrder([link('zeta'), link('alpha'), link('mid')], () => false).order, ['alpha', 'mid', 'zeta'])
})

test('declared before and after come first, over the dependency rule and the names', () => {
  const deps = dependsIn({ audit: ['reviews'], redact: ['reviews'] })
  assert.deepEqual(chainOrder([link('reviews'), link('audit', { after: ['redact'] }), link('redact')], deps).order, ['redact', 'audit', 'reviews'])
  assert.deepEqual(chainOrder([link('reviews', { before: ['audit'] }), link('audit')], deps).order, ['reviews', 'audit'])
  assert.deepEqual(chainOrder([link('b', { after: ['c'] }), link('a', { after: ['b'] }), link('c')], () => false).order, ['c', 'b', 'a'])
  assert.deepEqual(chainOrder([link('a', { before: ['gone'] }), link('b')], () => false).order, ['a', 'b'])
})

test('a cycle of before and after leaves out every link in it, named in order; the rest of the chain runs', () => {
  const { order, cycles } = chainOrder([link('a', { before: ['b'] }), link('b', { before: ['a'] }), link('c'), link('d', { before: ['d'] })], () => false)
  assert.deepEqual(order, ['c'])
  assert.deepEqual(cycles.sort(), ['a → b → a', 'd → d'])
})
