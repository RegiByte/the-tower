import assert from 'node:assert/strict'
import { test } from 'node:test'
import { factsOf, type Session } from '../src/bridge/facts.ts'
import { coreFacts, forkFacts, mergeParts, placeable, takenFlags, type Merged } from '../src/bridge/launch.ts'
import { CORE_FLAGS } from '../src/shared/launch.ts'
import type { LogEvent, SessionHeader } from '../src/shared/model.ts'

const TAKEN = takenFlags('claude', ['claude', '--dangerously-skip-permissions', '--verbose=1'])

const merged = (result: ReturnType<typeof mergeParts>): Merged => {
  assert.equal(result.t, 'merged', result.t === 'conflict' ? result.message : '')
  return result as Merged
}

test("the core's flags are read from what it composes: a spawn's and a resume's, the host's --plugin-dir among them", () => {
  assert.deepEqual([...CORE_FLAGS.claude].sort(), ['--', '--add-dir', '--append-system-prompt', '--effort', '--model', '--name', '--plugin-dir', '--resume', '--settings'])
})

test('parts merge in fold order: text concatenated, flags kept in order, env scrubbed of a parent session, defaults and exemptions by capability', () => {
  const m = merged(
    mergeParts('spawn', 'claude', [
      { cap: 'roles', parts: { systemPrompt: ['a builder'], prompt: ['then test'], args: { claude: ['--debug'] }, env: { ROLE: 'builder', TOWER_SESSION_ID: 'x' }, defaults: { model: 'opus' }, exempt: ['hiring', 'hiring'] } },
      { cap: 'focus', parts: { systemPrompt: ['stay focused'], args: { claude: ['--strict-mcp-config=1'] }, defaults: { effort: 'high' }, reportsTo: 'ODIN-07' } },
    ], TAKEN),
  )
  assert.deepEqual(m.contributed, { systemPrompt: ['a builder', 'stay focused'], prompt: ['then test'], env: { ROLE: 'builder' }, args: ['--debug', '--strict-mcp-config=1'] })
  assert.deepEqual(m.defaults, { model: 'opus', effort: 'high' })
  assert.deepEqual(m.exempt, [{ from: 'hiring', by: 'roles' }])
  assert.deepEqual(m.reportsTo, { callsign: 'ODIN-07', by: 'focus' })
  assert.deepEqual(coreFacts(m, '20261004-210927-2c96'), [
    { hook_event_name: 'tower.exempt', from: 'hiring', by: 'roles' },
    { hook_event_name: 'tower.reports-to', callsign: 'ODIN-07', session: '20261004-210927-2c96', by: 'focus' },
  ])
})

test("a resume or a fork takes no prompt, defaults, exemption or crew edge: those are a spawn's", () => {
  const m = merged(mergeParts('fork', 'claude', [{ cap: 'roles', parts: { systemPrompt: ['a builder'], prompt: ['p'], defaults: { model: 'opus' }, exempt: ['hiring'], reportsTo: 'ODIN-07' } }], TAKEN))
  assert.deepEqual(m, { t: 'merged', contributed: { systemPrompt: ['a builder'], prompt: [], env: {}, args: [] }, defaults: {}, exempt: [] })
})

test('a flag, env key, defaults member or crew edge given twice refuses, naming both; so does a flag the core or the config passes', () => {
  const conflict = (a: object, b: object) => mergeParts('spawn', 'claude', [{ cap: 'roles', parts: a }, { cap: 'focus', parts: b }], TAKEN)
  assert.deepEqual(conflict({ args: { claude: ['--foo'] } }, { args: { claude: ['--foo=1'] } }), { t: 'conflict', message: 'roles and focus both pass --foo', caps: ['roles', 'focus'] })
  assert.match((conflict({ env: { A: '1' } }, { env: { A: '2' } }) as { message: string }).message, /^roles and focus both set A in env$/)
  assert.match((conflict({ defaults: { model: 'a' } }, { defaults: { model: 'b' } }) as { message: string }).message, /^roles and focus both give defaults\.model$/)
  assert.match((conflict({ reportsTo: 'A-1' }, { reportsTo: 'B-2' }) as { message: string }).message, /^roles and focus both give reportsTo$/)
  assert.deepEqual(conflict({ args: { claude: ['--model=opus'] } }, {}), { t: 'conflict', message: 'roles passes --model, which the tower passes', caps: ['roles'] })
  assert.match((conflict({}, { args: { claude: ['--verbose'] } }) as { message: string }).message, /^focus passes --verbose, which the config's argv\[2\] \(--verbose=1\) passes$/)
})

test('a part the runtime cannot place is no part: a positional among the flags, a runtime it does not know, a key it does not read', () => {
  assert.equal(placeable({ args: { claude: ['--ok', 'positional'] } }).ok, false)
  assert.equal(placeable({ args: { codex: ['--ok'] } }).ok, false)
  assert.equal(placeable({ settings: {} }).ok, false)
  assert.deepEqual(placeable(undefined), { ok: true, parts: {} })
})

test("a fork carries a copy of each extension fact of the lineage it forks, each session's once, and not its exemption or crew edge", () => {
  const session = (id: string, startedAt: number, events: LogEvent[]): Session => {
    const header: SessionHeader = { id, project: 'lab', cwd: '/lab', argv: ['claude'], startedAt, cols: 80, rows: 24 }
    return { header, facts: factsOf({ header, events }) }
  }
  const first = session('a', 1000, [
    [0, 'h', { hook_event_name: 'tower.x.roles.role', value: 'builder' }],
    [0, 'h', { hook_event_name: 'tower.exempt', from: 'hiring', by: 'roles' }],
    [0, 'h', { hook_event_name: 'tower.reports-to', callsign: 'ODIN-07', session: 'o', by: 'roles' }],
  ])
  const second = session('b', 2000, [[1, 'h', { hook_event_name: 'tower.x.pulse.beat', value: 1 }]])
  assert.deepEqual(first.facts.exempt, [{ from: 'hiring', by: 'roles' }])
  assert.deepEqual(first.facts.reportsTo, { callsign: 'ODIN-07', session: 'o', by: 'roles' })
  assert.deepEqual(forkFacts([first, second, second]), [
    { hook_event_name: 'tower.x.roles.role', value: 'builder' },
    { hook_event_name: 'tower.x.pulse.beat', value: 1 },
  ])
})
