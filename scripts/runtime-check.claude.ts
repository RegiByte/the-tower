/**
 * Claude Code's part of `scripts/runtime-check.ts`: its tested range, its launches as the config's flags, the trust
 * screen a directory's first session raises, the peer registry read as each session is killed, the quota probe's
 * `get_usage` asked once the system is down, and its report: the shared sections, the surfaces only Claude has
 * (`get_usage`, a long submit, the peer registry, `tower.claude`, the fullscreen TUI), what Claude's built-in
 * `sec-default` mod held back, and the release's changelog with the entries about the tower's surfaces marked.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { USAGE_ARGS, usageAnswer, usageRan, USAGE_REQUEST, USAGE_TIMEOUT_MS } from '../extensions/quota/usage.ts'
import { runProcess } from '../src/run.ts'
import { CLAUDE_TESTED, releaseRange } from '../src/shared/claude.ts'
import { resolveCommand, type SessionHeader, type SessionLog } from '../src/shared/model.ts'
import {
  changelogOf, FULLSCREEN_MODES, heldBack, modesEnabled, SEC_DEFAULT_KEEPS, statusesOf, unseatedBecause, usageChanges, versionPosted, withoutKept,
} from './runtime-check.read.ts'
import { LAUNCHES, SCENARIOS, UNRECORDED, type ClaudeLaunch } from './runtime-check.claude.scenarios.ts'
import { chainCheck, checkLines, headLines, replayLines, replaysOf, scenarioLines, shapeLines, shapesAgainst, unrecordedLines, type Check } from './runtime-check.report.ts'
import type { Difference, Run, Runtime } from './runtime-check.scenario.ts'

const REPO = path.join(import.meta.dirname, '..')

/** A Claude run keeps the quota probe's answer beside its scenarios. */
type ClaudeRun = Run & { usage: { answer: unknown } | { error: string } }

const started = (log: SessionLog) => log.events.some((e) => e[1] === 'h' && e[2].hook_event_name === 'SessionStart')

/** The callsign Claude registers the session under, from its argv. */
const callsignOf = (header: SessionHeader) => header.argv[header.argv.indexOf('--name') + 1]

const readJson = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8'))

/** Claude's registration of a running session, by the name the tower gave it. */
function registration(name: string): { pid: unknown; name: unknown } | undefined {
  const dir = path.join(os.homedir(), '.claude', 'sessions')
  return readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .flatMap((file) => {
      try {
        return [readJson<{ pid: unknown; name: unknown }>(path.join(dir, file))]
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
        throw err
      }
    })
    .find((entry) => entry.name === name)
}

/** What each recording that started reads of the surfaces only Claude has. */
const readings = (recordings: Record<string, SessionLog>) => {
  const recorded = Object.entries(recordings).filter(([, log]) => started(log))
  return {
    versions: recorded.map(([name, log]) => [name, versionPosted(log)] as const),
    unmoded: recorded.filter(([, log]) => modesEnabled(log).length < FULLSCREEN_MODES.length).map(([name]) => name),
  }
}

const differences = (run: Run, recordings: Record<string, SessionLog>): Difference[] => {
  const { versions, unmoded } = readings(recordings)
  return [
    ...run.scenarios.flatMap((s) => Object.entries(s.registry).filter(([, ok]) => !ok).map(([name]): Difference => [name, `${name} not registered with \`pid\` and \`name\``])),
    ...versions.filter(([, v]) => v !== run.release).map(([name, v]): Difference => [name, `${name} posted ${v}`]),
    ...unmoded.map((name): Difference => [name, `no ${FULLSCREEN_MODES.join(' and ')} in ${name}`]),
  ]
}

const report: Runtime<ClaudeLaunch>['report'] = ({ run: plain, recordings, baseline, fixture, root }) => {
  const run = plain as ClaudeRun
  const changelogFile = path.join(os.homedir(), '.claude', 'cache', 'changelog.md')
  const debugFile = path.join(root, 'debug.log')
  const changelog = existsSync(changelogFile) ? readFileSync(changelogFile, 'utf8') : undefined
  const debugLog = existsSync(debugFile) ? readFileSync(debugFile, 'utf8') : undefined
  const usageFixture = readFileSync(path.join(REPO, 'test', 'fixtures', 'probe-usage.out'), 'utf8')
  const range = { ...CLAUDE_TESTED, reads: releaseRange(CLAUDE_TESTED, run.release) }

  const failed = run.scenarios.filter((s) => s.error)
  const shapes = shapesAgainst(run, recordings, baseline)
  const replays = replaysOf(SCENARIOS, recordings, fixture)
  const registry = run.scenarios.flatMap((s) => Object.entries(s.registry))
  const { versions, unmoded } = readings(recordings)
  const usage = 'error' in run.usage ? undefined : usageChanges((usageAnswer(usageFixture) as { answer: unknown }).answer, run.usage.answer)
  const ran = (name: string) => run.scenarios.find((s) => s.name === name)
  const checks: Check[] = [
    'error' in run.usage
      ? { surface: '`get_usage`', ok: false, says: run.usage.error }
      : {
          surface: '`get_usage`',
          ok: usage!.missing.length === 0,
          says: [
            usage!.missing.length ? `missing what the fold reads: ${usage!.missing.join(', ')}` : 'every key the fold reads is there',
            usage!.added.length ? `new beside \`probe-usage.out\`: ${usage!.added.join(', ')}` : '',
            usage!.removed.length ? `gone since \`probe-usage.out\`: ${usage!.removed.join(', ')}` : '',
          ].filter(Boolean).join('; '),
        },
    ...(ran('long-submit') ? [{ surface: 'long submit', ok: !ran('long-submit')!.error, says: ran('long-submit')!.error ?? 'landed whole as one prompt' }] : []),
    {
      surface: 'peer registry',
      ok: registry.length > 0 && registry.every(([, ok]) => ok),
      says: `${registry.filter(([, ok]) => ok).length} of ${registry.length} sessions registered with \`pid\` and \`name\`${registry.some(([, ok]) => !ok) ? `; not: ${registry.filter(([, ok]) => !ok).map(([n]) => n).join(', ')}` : ''}`,
    },
    {
      surface: '`tower.claude`',
      ok: versions.every(([, v]) => v === run.release),
      says: versions.every(([, v]) => v === run.release) ? `every session posted ${run.release}` : versions.filter(([, v]) => v !== run.release).map(([n, v]) => `${n} posted ${v}`).join(', '),
    },
    { surface: 'fullscreen TUI', ok: unmoded.length === 0, says: unmoded.length ? `no ${FULLSCREEN_MODES.join(' and ')} in ${unmoded.join(', ')}` : `every session enabled ${FULLSCREEN_MODES.join(' and ')}` },
    ...chainCheck(run),
  ]

  const dependsOnKept = Object.entries(recordings)
    .filter(([name]) => !shapes.failedRecordings.has(name))
    .map(([name, log]) => ({ name, is: statusesOf(withoutKept(log)), was: statusesOf(log) }))
    .filter((r) => r.is.join() !== r.was.join())

  const clean = failed.length === 0 && shapes.unbased.length === 0 && shapes.changes.length === 0 && replays.every((r) => r.same) && checks.every((c) => c.ok) && dependsOnKept.length === 0
  const entries = changelog && changelogOf(changelog, run.release)
  const held = debugLog ? heldBack(debugLog) : new Map()
  const unseated = debugLog && unseatedBecause(debugLog)

  const markdown = [
    ...headLines({ word: 'Claude', run, recordings, baseline, range, clean, highest: 'CLAUDE_TESTED.highest' }),
    ...scenarioLines(run),
    ...shapeLines(shapes),
    ...replayLines(replays),
    ...checkLines(checks),
    '## Held back by Claude',
    unseated
      ? `\`sec-default\` was not seated (${unseated}): recorded outside a Team or Enterprise organization, where nothing is kept from the tower's mod.`
      : held.size ? [...held].map(([what, n]) => `- \`${what}\`: ${n} times (\`--debug-file\`)`).join('\n') : 'The debug log names no event a built-in mod kept from the tower\'s.',
    '',
    `Each recording replayed without what \`sec-default\` keeps inside an organization (${SEC_DEFAULT_KEEPS.map((e) => `\`${e}\``).join(', ')}): ${dependsOnKept.length ? 'differs.' : 'every one folds to the same statuses.'}`,
    ...dependsOnKept.map((r) => `- **${r.name}** depends on it:\n  - with:    ${r.was.join(' ')}\n  - without: ${r.is.join(' ')}`),
    '',
    `## Changelog ${run.release}`,
    entries
      ? `Entries marked **⚑** name a surface the tower reads: read those.\n\n${entries.map((e) => `- ${e.watched ? '**⚑** ' : ''}${e.entry}`).join('\n')}`
      : `No section for ${run.release} in \`~/.claude/cache/changelog.md\`.`,
    '',
    ...unrecordedLines(SCENARIOS, UNRECORDED),
  ].join('\n')
  return { markdown, clean }
}

/**
 * Claude, about 30 Haiku sessions, 5 at a time, ~6 minutes a run. The trust screen is answered when Claude shows it,
 * which it does only in a directory it has not trusted before, once its output goes quiet (down, then enter, as two
 * writes); `--debug-file` names each event Claude's built-in `sec-default` mod keeps from the tower's.
 */
export const CLAUDE: Runtime<ClaudeLaunch> = {
  id: 'claude',
  word: 'Claude',
  tested: CLAUDE_TESTED,
  installed: () => execFileSync('claude', ['--version'], { encoding: 'utf8' }).trim().split(/\s/)[0],
  root: '/tmp/tower-claude-check',
  port: 4396,
  model: 'haiku',
  baseline: path.join(REPO, 'test', 'claude-shapes.json'),
  plain: LAUNCHES.plain,
  launches: Object.values(LAUNCHES),
  scenarios: SCENARIOS,
  unrecorded: UNRECORDED,
  configOf: (launch) => ({ runtimes: { claude: { argv: ['claude', '--permission-mode', 'default', '--allowedTools', ...launch.tools, ...(launch.argv ?? [])] } }, env: launch.env ?? {} }),
  started: async (live, blocked, io) => {
    const at = await io.waitForFirst(live.tail, blocked ? [{ status: 'blocked' }] : [{ status: 'blocked' }, { event: 'SessionStart' }], 0)
    const screen = live.tail.entered.find((e) => e.at === at)?.blocked
    if (blocked ? screen !== blocked : screen && screen !== 'trust') throw new Error(`${live.name} showed the ${screen} screen, not the ${blocked ?? 'trust'} one`)
    if (screen === 'trust') {
      await io.quiet(live.tail)
      await io.keys(live.id, '\x1b[B')
      await io.sleep(500)
      await io.keys(live.id, '\r')
    }
    return at
  },
  subagent: (hook) => hook.agentId !== undefined,
  conversation: (events) => {
    const start = events.find((e) => e[1] === 'h' && e[2].hook_event_name === 'SessionStart')
    return start && (start[2] as { session_id: string }).session_id
  },
  registered: (log) => {
    if (!started(log)) return undefined
    const entry = registration(callsignOf(log.header))
    return entry ? typeof entry.pid === 'number' && typeof entry.name === 'string' : false
  },
  afterRun: async (config) => {
    const argv = resolveCommand(config, 'claude', undefined)
    return { usage: usageRan(await runProcess([...argv, ...USAGE_ARGS], { cwd: os.tmpdir(), timeoutMs: USAGE_TIMEOUT_MS, stdin: `${JSON.stringify(USAGE_REQUEST)}\n`, env: config.env })) }
  },
  differences,
  report,
}
