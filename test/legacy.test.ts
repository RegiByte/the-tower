import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { configNow, LEGACY_FIELDS, LEGACY_READS, LEGACY_VERBS, projectLegacy, respelled } from '../src/bridge/legacy.ts'
import type { Board } from '../src/bridge/board.ts'
import { configProblems } from '../src/config-check.ts'
import { LEGACY, Manifest, streamFolder } from '../src/shared/extensions.ts'
import { readingStreams } from '../src/bridge/rate-limits.ts'
import { VIEW_ALIASES } from '../src/shared/views.ts'
import { ConfigError, commandNames, resolveCommand, resolvedCommandName, projectPreferredCommand, type Config } from '../src/shared/model.ts'

const config = (over: Partial<Config> & Record<string, unknown>): Config => ({ argv: ['claude'], projects: {}, ...over }) as Config

test("the quota probe's old spelling is read where it is now, and both spellings of a field is an error naming both", () => {
  const old = config({ probes: { quota: { off: true, every: '1h' } } })
  assert.deepEqual(respelled(old).config.extensions, { quota: { off: true, settings: { every: '1h' } } })
  assert.deepEqual(
    respelled(old).old.map((o) => [o.key, o.use]),
    [
      ['probes.quota.off', '"extensions": { "quota": { "off": true } }'],
      ['probes.quota.every', '"extensions": { "quota": { "settings": { "every": "1h" } } }'],
    ],
  )
  const mixed = config({ probes: { quota: { every: '1h' } }, extensions: { quota: { off: false, settings: { every: '5m' } }, roles: { path: '/r' } } })
  assert.deepEqual(respelled(mixed).both, [{ key: 'probes.quota.every', now: 'extensions.quota.settings.every' }])
  assert.throws(() => configNow(mixed), (e) => e instanceof ConfigError && /probes\.quota\.every and extensions\.quota\.settings\.every are both set/.test(e.message))
  assert.deepEqual(configNow(config({ probes: { quota: { off: true } }, extensions: { roles: { path: '/r' } } })).extensions, { roles: { path: '/r' }, quota: { off: true } }, 'the other extensions are kept')
  const plain = config({ extensions: { quota: { off: true } } })
  assert.equal(configNow(plain), plain, 'a config with no old spelling is read as it is')
})

test('tower config check warns of the old spelling with the line to write, and fails what nothing reads', () => {
  const problems = (probes: unknown) => configProblems(config({ projects: { lab: { name: 'lab', hub: '/', repos: [] } }, probes } as never)).filter((p) => p.key.startsWith('probes'))
  assert.deepEqual(problems({ quota: { off: true } }), [{ level: 'warn', key: 'probes.quota.off', problem: 'the old spelling, honoured until 2.0: write "extensions": { "quota": { "off": true } }' }])
  assert.deepEqual(
    problems({ quota: { reads: 'claude.usage' }, mine: { every: '10m' } }).map((p) => [p.level, p.key]),
    [['fail', 'probes.quota.reads'], ['fail', 'probes.mine']],
  )
})

test('commandNames: undefined for the legacy array shape, every key in source order for the object shape', () => {
  assert.equal(commandNames(config({ argv: ['claude'] })), undefined)
  assert.deepEqual(commandNames(config({ argv: { mom: ['claude-mom'], main: ['claude'] } })), ['mom', 'main'])
})

test('resolveCommand: the legacy array always, a named key when it exists, the first key otherwise', () => {
  assert.deepEqual(resolveCommand(config({ argv: ['claude'] }), 'anything'), ['claude'])
  const multi = config({ argv: { a: ['claude'], b: ['claude-mom'] } })
  assert.deepEqual(resolveCommand(multi, 'b'), ['claude-mom'])
  assert.deepEqual(resolveCommand(multi, 'missing'), ['claude'])
  assert.deepEqual(resolveCommand(multi, undefined), ['claude'])
  assert.deepEqual(resolveCommand(multi, ''), ['claude'])
})

test('resolvedCommandName: undefined in single-command mode, the name itself when valid, the first key when stale or absent', () => {
  assert.equal(resolvedCommandName(config({ argv: ['claude'] }), 'anything'), undefined)
  const multi = config({ argv: { a: ['claude'], b: ['claude-mom'] } })
  assert.equal(resolvedCommandName(multi, 'b'), 'b')
  assert.equal(resolvedCommandName(multi, 'missing'), 'a')
  assert.equal(resolvedCommandName(multi, undefined), 'a')
})

test("projectPreferredCommand: undefined in single-command mode, the project's command when valid, the first key otherwise", () => {
  const single = config({ argv: ['claude'], projects: { p: { name: 'p', hub: '/h', repos: [] } } })
  assert.equal(projectPreferredCommand(single, 'p'), undefined)
  const multi = config({ argv: { a: ['claude'], b: ['claude-mom'] }, projects: { p: { name: 'p', hub: '/h', repos: [], command: 'b' }, q: { name: 'q', hub: '/h', repos: [], command: 'nope' } } })
  assert.equal(projectPreferredCommand(multi, 'p'), 'b')
  assert.equal(projectPreferredCommand(multi, 'q'), 'a')
})

test('configProblems: the legacy array argv is still accepted; the object shape is too; anything else fails', () => {
  assert.deepEqual(configProblems(config({ argv: ['claude'] })).filter((p) => p.key === 'argv'), [])
  assert.deepEqual(configProblems(config({ argv: { a: ['claude'] } })).filter((p) => p.key === 'argv'), [])
  assert.equal(configProblems(config({ argv: {} })).some((p) => p.key === 'argv'), true)
  assert.equal(configProblems(config({ argv: { a: [] } })).some((p) => p.key === 'argv'), true)
  assert.equal(configProblems(config({ argv: 'claude' as unknown as string[] })).some((p) => p.key === 'argv'), true)
})

test("configProblems: a project's command must be a string naming one of argv's, and is never an unknown key", () => {
  const valid = config({ argv: { claude: ['claude'], mom: ['claude-mom'] }, projects: { p: { name: 'p', hub: '/', repos: [], command: 'mom' } } })
  assert.deepEqual(configProblems(valid).filter((p) => p.key.startsWith('projects.p')), [])
  const unknown = config({ argv: { claude: ['claude'], mom: ['claude-mom'] }, projects: { p: { name: 'p', hub: '/', repos: [], command: 'nope' } } })
  assert.deepEqual(configProblems(unknown).filter((p) => p.key === 'projects.p.command'), [{ level: 'fail', key: 'projects.p.command', problem: 'names no command of argv: they are claude, mom' }])
  const ignored = config({ projects: { p: { name: 'p', hub: '/', repos: [], command: 'mom' } } })
  assert.deepEqual(configProblems(ignored).filter((p) => p.key === 'projects.p.command'), [{ level: 'warn', key: 'projects.p.command', problem: 'argv names only one command: this is ignored' }])
  const badCommand = config({ projects: { p: { name: 'p', hub: '/', repos: [], command: 3 as unknown as string } } })
  assert.equal(configProblems(badCommand).some((p) => p.level === 'fail' && p.key === 'projects.p.command'), true)
})

test('LEGACY names what each applier reads, and every verb, read and board field has its code', () => {
  for (const e of LEGACY) {
    if (e.kind === 'verb') assert.ok(LEGACY_VERBS[e.old], e.old)
    if (e.kind === 'read') assert.ok(LEGACY_READS[e.old], e.old)
    if (e.kind === 'board') assert.ok(LEGACY_FIELDS[e.old], e.old)
    if (e.kind === 'view') assert.ok(VIEW_ALIASES[e.old], e.old)
  }
  assert.equal(streamFolder('quota.reads'), 'probe.quota', 'a moved stream keeps its old folder')
  assert.equal(streamFolder('pulse.beats'), 'pulse.beats')
  assert.deepEqual(LEGACY_VERBS['probe/run'].input({ name: 'quota' }), {})
  assert.equal((LEGACY_VERBS['probe/run'].input({ name: 'mine' }) as { code: string }).code, 'not_found')
  assert.deepEqual(LEGACY_VERBS['probe/run'].reply({ at: 1, ms: 2, ok: false, error: 'x' }), { t: 'probed', at: 1, ms: 2, ok: false, error: 'x' })
})

test('the projection copies the quota part back to board.probes, and leaves it empty while the extension does not run', () => {
  const part = { every: 600_000, state: 'ok', lastAt: 1, answeredAt: 1, failsInRow: 0, wait: 600_000, nextAt: 600_001, held: false }
  const board = { floors: [], probes: [], x: { quota: part } } as unknown as Board
  const [probe] = projectLegacy(board).probes
  assert.deepEqual(probe, { name: 'quota', reads: 'claude.usage', ...part, verbs: ['run'], calls: { run: ['probe/run', { name: 'quota' }] }, actions: [{ verb: 'run', call: ['probe/run', { name: 'quota' }] }] })
  assert.deepEqual(projectLegacy({ floors: [], probes: [] } as unknown as Board).probes, [])
})

test("the projection copies the reviews parts back to the old fields: a floor's threads calling review/append, a card's thread state, unseen notes and note before send-home", () => {
  const note = ['reviews/append', { project: 'lab', checkout: 'odin-1' }]
  const thread = { key: 'lab/odin-1', checkout: 'odin-1', id: 'odin-1.md', tag: 't', messages: 2, landed: false, state: { is: 'live' }, verbs: ['note'], calls: { note }, actions: [{ verb: 'note', call: note }] }
  const card = {
    project: 'lab', checkout: 'odin-1', checkoutState: { is: 'live' }, verbs: ['resume', 'send-home'], calls: {}, actions: [{ verb: 'resume' }, { verb: 'send-home' }],
    x: { reviews: { thread: 'odin-1', threadState: { is: 'live' }, unseen: 1, note } },
  }
  const floor = { id: 'lab', worktrees: [], branches: [], threads: [], cards: [card], x: { reviews: { threads: [thread] } } }
  const [projected] = projectLegacy({ floors: [floor], probes: [], offers: [], adds: {} } as unknown as Board).floors
  const old = ['review/append', { project: 'lab', checkout: 'odin-1' }]
  const { key: _, ...unkeyed } = thread
  assert.deepEqual(projected.threads, [{ ...unkeyed, calls: { note: old }, actions: [{ verb: 'note', call: old }] }])
  const [c] = projected.cards
  assert.deepEqual([c.threadState, c.unseen, c.verbs, c.calls, c.actions.map((a) => a.verb)], [{ is: 'live' }, 1, ['resume', 'note', 'send-home'], { note: old }, ['resume', 'note', 'send-home']])
})

test("the core folds the readings a manifest declares, and the old codes its stream's folder kept, from the manifest alone", () => {
  const manifest = Manifest.parse(JSON.parse(readFileSync(path.join(import.meta.dirname, '..', 'extensions', 'quota', 'extension.json'), 'utf8')))
  const [stream, ...more] = readingStreams([manifest, manifest])
  assert.deepEqual([stream.folder, more.length], ['probe.quota', 0], 'once per folder, the folder the stream kept')
  const limits = [{ kind: 'seven_day', percentUsed: 9 }]
  assert.deepEqual(stream.reading('u', { ms: 1, answer: {}, limits, unavailable: false }), { ms: 1, answer: {}, limits, unavailable: false })
  assert.equal(stream.reading('f', { ms: 1, error: 'x' }), undefined)
  assert.deepEqual(stream.reading('p', { reads: 'claude.usage', ms: 1, ok: true, answer: { rate_limits: { seven_day: { utilization: 9 } } } }), { limits })
  assert.deepEqual(readingStreams([{ ...manifest, streams: { reads: { ...manifest.streams!.reads, scope: 'project' } } }]), [], 'the account is read in a system stream')
})
