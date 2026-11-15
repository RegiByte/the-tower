import assert from 'node:assert/strict'
import { test } from 'node:test'
import { factsOf, type Session } from '../src/bridge/facts.ts'
import { coreFacts, forkFacts, mergeParts, placeable, takenEnv, takenFlags, type Merged } from '../src/bridge/launch.ts'
import { EVERY_PART, EVERY_PLACE, hostSpawn, type HostStart } from '../src/shared/launch.ts'
import { CORE_FLAGS, resumeRequest, spawnRequest } from '../src/shared/launches.ts'
import { sessionCommand, type Config, type LogEvent, type SessionHeader } from '../src/shared/model.ts'
import { UnsettledError, within } from '../src/tower/extensions.ts'

const TAKEN = { flags: takenFlags('claude', ['claude', '--dangerously-skip-permissions', '--verbose=1']), env: takenEnv({ HTTPS_PROXY: 'http://proxy' }) }

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

test("a resume or a fork takes no prompt, defaults, exemption, crew edge or fields: those are a spawn's", () => {
  const m = merged(mergeParts('fork', 'claude', [{ cap: 'roles', parts: { systemPrompt: ['a builder'], prompt: ['p'], defaults: { model: 'opus' }, exempt: ['hiring'], reportsTo: 'ODIN-07', fields: { role: 'worker' } } }], TAKEN))
  assert.deepEqual(m, { t: 'merged', contributed: { systemPrompt: ['a builder'], prompt: [], env: {}, args: [] }, defaults: {}, exempt: [], fields: new Map() })
})

test('a flag, env key, defaults member or crew edge given twice refuses, naming both; so does a flag the core or the config passes, and an env key the config sets', () => {
  const conflict = (a: object, b: object) => mergeParts('spawn', 'claude', [{ cap: 'roles', parts: a }, { cap: 'focus', parts: b }], TAKEN)
  assert.deepEqual(conflict({ args: { claude: ['--foo'] } }, { args: { claude: ['--foo=1'] } }), { t: 'conflict', message: 'roles and focus both pass --foo', caps: ['roles', 'focus'] })
  assert.match((conflict({ env: { A: '1' } }, { env: { A: '2' } }) as { message: string }).message, /^roles and focus both set A in env$/)
  assert.match((conflict({ defaults: { model: 'a' } }, { defaults: { model: 'b' } }) as { message: string }).message, /^roles and focus both give defaults\.model$/)
  assert.match((conflict({ reportsTo: 'A-1' }, { reportsTo: 'B-2' }) as { message: string }).message, /^roles and focus both give reportsTo$/)
  assert.deepEqual(conflict({ args: { claude: ['--model=opus'] } }, {}), { t: 'conflict', message: 'roles passes --model, which the tower passes', caps: ['roles'] })
  assert.match((conflict({}, { args: { claude: ['--verbose'] } }) as { message: string }).message, /^focus passes --verbose, which the config's runtimes\.claude\.argv\[2\] \(--verbose=1\) passes$/)
  assert.deepEqual(conflict({ env: { HTTPS_PROXY: 'http://other' } }, {}), { t: 'conflict', message: "roles sets HTTPS_PROXY in env, which the config's env.HTTPS_PROXY sets", caps: ['roles'] })
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

test("a launch contributor is bound as start is: one that hasn't settled in time is refused as unsettled, and what it answers later goes to late", async () => {
  assert.equal(await within('launch', 50, Promise.resolve('parts'), () => assert.fail('settled in time')), 'parts')
  let late: unknown
  const slow = new Promise((done) => setTimeout(() => done('parts'), 30))
  await assert.rejects(within('launch', 5, slow, (value) => (late = value)), (err) => err instanceof UnsettledError && err.message === "launch didn't settle within 0.005 s" && err.ms === 5)
  await slow
  assert.equal(late, 'parts')
})

test('hostSpawn: the argv of the array shape always, a named command when given, the first when not or when stale, then the args; its env and name on the spawn', () => {
  const start: HostStart = { id: 'id', project: 'p', cwd: '/c', runtime: 'claude', args: ['--plugin-dir', '/mods', '--x'], env: {}, facts: [] }
  const spawn = (config: Config, name?: string) => hostSpawn(start, sessionCommand(config, 'claude', name))
  const arrayShape = { runtimes: { claude: { argv: ['claude'] } }, env: { A: '1' }, projects: {} } as Config
  assert.deepEqual(spawn(arrayShape), { t: 'spawn', id: 'id', project: 'p', cwd: '/c', runtime: 'claude', argv: ['claude', '--plugin-dir', '/mods', '--x'], env: { A: '1' }, cols: 120, rows: 40 })
  const multi = { runtimes: { claude: { argv: { a: ['claude'], b: ['claude-mom'] } } }, projects: {} } as Config
  assert.deepEqual([spawn(multi, 'b').argv, spawn(multi, 'b').command], [['claude-mom', '--plugin-dir', '/mods', '--x'], 'b'])
  assert.deepEqual([spawn(multi, 'missing').argv, spawn(multi, 'missing').command], [['claude', '--plugin-dir', '/mods', '--x'], 'a'])
  assert.deepEqual([spawn(multi).argv, spawn(multi).command, spawn(multi).env], [['claude', '--plugin-dir', '/mods', '--x'], 'a', {}])
})

test('resumeRequest: carries the command it is given straight through to the host request', () => {
  assert.equal(resumeRequest({ ...EVERY_PART, kind: 'resume', conversation: 'c', prompt: undefined, command: 'b', ran: {} }, EVERY_PLACE).command, 'b')
  assert.equal(resumeRequest({ ...EVERY_PART, kind: 'resume', conversation: 'c', prompt: undefined, ran: {} }, EVERY_PLACE).command, undefined)
})

test('opencode: its own server, the config, its callsign and a fresh state dir by env, the model with its effort as a variant, the user config dir left alone', () => {
  assert.deepEqual([...CORE_FLAGS.opencode].sort(), ['--prompt', '--standalone', '-s'])
  const part = { ...EVERY_PART, runtime: 'opencode' as const, contributed: { systemPrompt: ['more'], prompt: [], env: { A: '1' }, args: ['--auto'] } }
  const spawned = spawnRequest({ ...part, kind: 'spawn', launch: { model: 'openrouter/m', effort: 'high', prompt: 'go' } }, EVERY_PLACE)
  assert.deepEqual(spawned.args, ['--standalone', '--auto', '--prompt', 'go'])
  assert.deepEqual(Object.keys(spawned.env).sort(), ['A', 'OPENCODE_CONFIG_CONTENT', 'TOWER_CALLSIGN', 'XDG_STATE_HOME'])
  assert.deepEqual([spawned.env.XDG_STATE_HOME, spawned.env.TOWER_CALLSIGN], ['state', EVERY_PART.name])
  const config = JSON.parse(spawned.env.OPENCODE_CONFIG_CONTENT)
  assert.deepEqual([config.model, config.skills, config.plugins.map((p: { package?: string } | string) => (typeof p === 'string' ? p : p.package))], ['openrouter/m#high', ['mod/skills'], ['mod/opencode', 'plugin']])
  assert.match(config.plugins[0].options.brief, /tower whoami[\s\S]*Your directories are[\s\S]*more$/)
  const resumed = resumeRequest({ ...part, kind: 'resume', conversation: 'ses_1', prompt: undefined, ran: { model: 'openrouter/m' } }, EVERY_PLACE)
  assert.deepEqual([resumed.args, JSON.parse(resumed.env.OPENCODE_CONFIG_CONTENT).model, resumed.env.TOWER_CALLSIGN], [['--standalone', '--auto', '-s', 'ses_1'], 'openrouter/m', EVERY_PART.name])
})
