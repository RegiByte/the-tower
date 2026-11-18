/**
 * opencode's part of `scripts/runtime-check.ts`: its tested range, its config with opencode beside Claude, a session
 * started once the tower's plugin says so, the local services its scenarios reach (`runtime-check.opencode.fakes.ts`),
 * and its report: the shared sections and the surfaces only opencode's plugin shows: every session loads the plugin,
 * which posts the installed release, and the tower tells a worker it killed from one killed outside it.
 */
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { factsOf, killedByHost, killedOutside } from '../src/bridge/facts.ts'
import { releaseRange } from '../src/shared/claude.ts'
import type { SessionLog } from '../src/shared/model.ts'
import { OPENCODE_TESTED } from '../src/shared/opencode.ts'
import { fakes } from './runtime-check.opencode.fakes.ts'
import { LAUNCHES, MODEL, SCENARIOS, UNRECORDED, type OpencodeLaunch } from './runtime-check.opencode.scenarios.ts'
import { chainCheck, checkLines, headLines, replayLines, replaysOf, scenarioLines, shapeLines, shapesAgainst, unrecordedLines, type Check } from './runtime-check.report.ts'
import type { Difference, Run, Runtime } from './runtime-check.scenario.ts'

const REPO = path.join(import.meta.dirname, '..')

const hook = (log: SessionLog, name: string) => log.events.find((e) => e[1] === 'h' && e[2].hook_event_name === name)?.[2] as Record<string, unknown> | undefined

/** The release the tower's plugin posted as it loaded: absent when it never loaded. */
const pluginRelease = (log: SessionLog) => {
  const started = hook(log, 'plugin.started')
  return started && String((started.app as { version?: unknown } | undefined)?.version)
}

/** How each recording that ends by a kill should read: the tower's kill as its own, one from outside as stranded. */
const ENDINGS: Record<string, { says: string; reads: (log: SessionLog) => boolean }> = {
  'sent-home': { says: 'killed by the tower', reads: (log) => killedByHost(factsOf(log)) },
  'killed-outside': { says: 'killed from outside', reads: (log) => killedOutside(factsOf(log)) },
}

const readings = (run: Run, recordings: Record<string, SessionLog>) => ({
  versions: Object.entries(recordings).map(([name, log]) => [name, pluginRelease(log)] as const),
  endings: Object.entries(ENDINGS).flatMap(([name, ending]) => (recordings[name] ? [{ name, ...ending, ok: ending.reads(recordings[name]) }] : [])),
  release: run.release,
})

const differences = (run: Run, recordings: Record<string, SessionLog>): Difference[] => {
  const { versions, endings } = readings(run, recordings)
  return [
    ...versions.filter(([, v]) => v !== run.release).map(([name, v]): Difference => [name, v === undefined ? `${name} never loaded the tower's plugin` : `${name}'s plugin posted ${v}`]),
    ...endings.filter((e) => !e.ok).map((e): Difference => [e.name, `${e.name} does not read as ${e.says}`]),
  ]
}

const report: Runtime<OpencodeLaunch>['report'] = ({ run, recordings, baseline, fixture }) => {
  const range = { ...OPENCODE_TESTED, reads: releaseRange(OPENCODE_TESTED, run.release) }
  const failed = run.scenarios.filter((s) => s.error)
  const shapes = shapesAgainst(run, recordings, baseline)
  const replays = replaysOf(SCENARIOS, recordings, fixture)
  const { versions, endings } = readings(run, recordings)
  const unloaded = versions.filter(([, v]) => v === undefined).map(([n]) => n)
  const misposted = versions.filter(([, v]) => v !== undefined && v !== run.release)
  const checks: Check[] = [
    { surface: 'the tower plugin', ok: unloaded.length === 0, says: unloaded.length ? `never loaded in ${unloaded.join(', ')}` : `loaded in every session (\`plugin.started\`)` },
    { surface: '`plugin.started` app.version', ok: misposted.length === 0, says: misposted.length ? misposted.map(([n, v]) => `${n} posted ${v}`).join(', ') : `every session that loaded it posted ${run.release}` },
    ...endings.map((e) => ({ surface: `${e.name} ending`, ok: e.ok, says: e.ok ? `reads as ${e.says}` : `does not read as ${e.says}` })),
    ...chainCheck(run),
  ]
  const clean = failed.length === 0 && shapes.unbased.length === 0 && shapes.changes.length === 0 && replays.every((r) => r.same) && checks.every((c) => c.ok)
  const markdown = [
    ...headLines({ word: 'opencode', run, recordings, baseline, range, clean, highest: 'OPENCODE_TESTED.highest' }),
    ...scenarioLines(run),
    ...shapeLines(shapes),
    ...replayLines(replays),
    ...checkLines(checks),
    `## Changelog ${run.release}`,
    'opencode keeps no changelog on disk: read the release notes of every release since the tested one for the surfaces `OPENCODE_SURFACES` lists (`src/shared/opencode.ts`).',
    '',
    ...unrecordedLines(SCENARIOS, UNRECORDED),
  ].join('\n')
  return { markdown, clean }
}

/**
 * opencode, 12 sessions on Gemini 4 Argon through OpenRouter (and one on Hydrogen) and 4 on the local fake provider,
 * 5 at a time, ~5 minutes a run. The provider's key stays in opencode's own credentials: nothing here names one.
 */
export const OPENCODE: Runtime<OpencodeLaunch> = {
  id: 'opencode',
  word: 'opencode',
  tested: OPENCODE_TESTED,
  installed: () => execFileSync('opencode', ['--version'], { encoding: 'utf8' }).trim().split(/\s/).at(-1)!.replace(/^v/, ''),
  root: '/tmp/tower-opencode-check',
  port: 4397,
  model: MODEL,
  baseline: path.join(REPO, 'test', 'opencode-shapes.json'),
  plain: LAUNCHES.plain,
  launches: Object.values(LAUNCHES),
  scenarios: SCENARIOS,
  configOf: () => ({ runtimes: { claude: { argv: ['claude'] }, opencode: { argv: ['opencode'] } }, env: {} }),
  started: (live, _blocked, io) => io.waitForFirst(live.tail, [{ event: 'plugin.started' }], 0),
  subagent: (hook) => hook.parentID !== undefined,
  conversation: (events) => {
    const created = events.find((e) => e[1] === 'h' && e[2].hook_event_name === 'session.created' && (e[2] as { parentID?: unknown }).parentID === undefined)
    return created && (created[2] as unknown as { data: { sessionID: string } }).data.sessionID
  },
  services: fakes,
  differences,
  report,
}
