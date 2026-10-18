/** The report of a `scripts/claude-check.ts` run, in markdown, and whether the release reads clean: pure over what the run kept. */
import { usageAnswer } from '../src/bridge/probes.ts'
import type { SessionLog } from '../src/shared/model.ts'
import {
  changelogOf, comparedForm, FULLSCREEN_MODES, heldBack, modesEnabled, shapeChanges, shapesOf, statusesOf, usageChanges, versionPosted,
  type Baseline, type ShapeChange,
} from './claude-check.read.ts'
import { SCENARIOS, UNRECORDED } from './claude-check.scenarios.ts'

/** What a scenario's run kept beside its recordings: why it stopped short, and what it read of the live system. */
export type ScenarioRun = {
  name: string
  error?: string
  recordings: { name: string; id: string }[]
  /** Each session's registration in `~/.claude/sessions/<pid>.json` as it was killed: whether it has `pid` and `name`. */
  registry: Record<string, boolean>
  resumed: { id: string; from: string }[]
  /** Whether `GET /conversations/<id>` of each resumed session names the session it resumes. */
  chain?: boolean
  /** What differed on each earlier attempt, when it was run again (`--retries`). */
  retried?: string[][]
}

export type Run = { claude: string; startedAt: number; minutes: number; scenarios: ScenarioRun[]; usage: { answer: unknown } | { error: string } }

export type ReportInput = {
  run: Run
  recordings: Record<string, SessionLog>
  baseline: Baseline
  fixture: (name: string) => SessionLog
  usageFixture: string
  changelog?: string
  debugLog?: string
  range: { lowest: string; highest: string; reads: string }
}

type Check = { surface: string; ok: boolean; says: string }

const started = (log: SessionLog) => log.events.some((e) => e[1] === 'h' && e[2].hook_event_name === 'SessionStart')

/** What each scenario's own recordings read: their replays against their fixtures, and the per-session surface checks. */
const readings = ({ run, recordings, fixture }: Pick<ReportInput, 'recordings' | 'fixture'> & { run: Pick<Run, 'claude' | 'scenarios'> }) => {
  const declared = new Map(SCENARIOS.flatMap((s) => Object.entries(s.recordings).map(([name, r]) => [name, { ...r, ignore: s.fresh ? (r.ignore ?? []) : ['trust' as const, ...(r.ignore ?? [])] }] as const)))
  const replays = Object.entries(recordings).flatMap(([name, log]) => {
    const { fixture: of, ignore = [] } = declared.get(name) ?? {}
    if (!of) return []
    const is = comparedForm(statusesOf(log), ignore)
    const was = comparedForm(statusesOf(fixture(of)), ignore)
    return [{ name, of, ignore, is, was, same: is.join() === was.join() }]
  })
  const recorded = Object.entries(recordings).filter(([, log]) => started(log))
  return {
    replays,
    recorded,
    registry: run.scenarios.flatMap((s) => Object.entries(s.registry)),
    versions: recorded.map(([name, log]) => [name, versionPosted(log)] as const),
    unmoded: recorded.filter(([, log]) => modesEnabled(log).length < FULLSCREEN_MODES.length).map(([name]) => name),
    chains: run.scenarios.filter((s) => s.resumed.length),
  }
}

/**
 * What reads differently in each scenario, from its own recordings alone, by scenario: what running it again can tell
 * from Haiku's timing. Shapes are read over the whole run, and stay out.
 */
export const scenarioDifferences = (input: Parameters<typeof readings>[0]): Map<string, string[]> => {
  const { run } = input
  const { replays, versions, unmoded } = readings(input)
  const scenarioOf = (recording: string) => run.scenarios.find((s) => s.recordings.some((r) => r.name === recording))!.name
  const differences: [string, string][] = [
    ...run.scenarios.filter((s) => s.error).map((s): [string, string] => [s.name, `stopped short: ${s.error}`]),
    ...replays.filter((r) => !r.same).map((r): [string, string] => [scenarioOf(r.name), `${r.name} replays differently from \`${r.of}\``]),
    ...run.scenarios.flatMap((s) => Object.entries(s.registry).filter(([, ok]) => !ok).map(([name]): [string, string] => [s.name, `${name} not registered with \`pid\` and \`name\``])),
    ...versions.filter(([, v]) => v !== run.claude).map(([name, v]): [string, string] => [scenarioOf(name), `${name} posted ${v}`]),
    ...unmoded.map((name): [string, string] => [scenarioOf(name), `no ${FULLSCREEN_MODES.join(' and ')} in ${name}`]),
    ...run.scenarios.filter((s) => s.resumed.length && !s.chain).map((s): [string, string] => [s.name, 'a resumed session does not name the one it resumes']),
  ]
  return differences.reduce((by, [name, why]) => by.set(name, [...(by.get(name) ?? []), why]), new Map<string, string[]>())
}

const changeLine = (c: ShapeChange) => `- \`${c.sign}\` \`${c.event}${c.key ? `\` key \`${c.key}` : ''}\`: ${c.sign === '-' ? 'was in' : 'in'} ${c.in.join(', ')}`

export const renderReport = ({ run, recordings, baseline, fixture, usageFixture, changelog, debugLog, range }: ReportInput): { markdown: string; clean: boolean } => {
  const failed = run.scenarios.filter((s) => s.error)
  const failedRecordings = new Set(failed.flatMap((s) => s.recordings.map((r) => r.name)))
  const compared = Object.fromEntries(Object.entries(recordings).filter(([name]) => !failedRecordings.has(name)).map(([name, log]) => [name, shapesOf(log)]))
  const unbased = Object.keys(compared).filter((name) => !(name in baseline.recordings))
  const changes = shapeChanges(baseline.recordings, compared)

  const { replays, registry, versions, unmoded, chains } = readings({ run, recordings, fixture })
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
      ok: versions.every(([, v]) => v === run.claude),
      says: versions.every(([, v]) => v === run.claude) ? `every session posted ${run.claude}` : versions.filter(([, v]) => v !== run.claude).map(([n, v]) => `${n} posted ${v}`).join(', '),
    },
    { surface: 'fullscreen TUI', ok: unmoded.length === 0, says: unmoded.length ? `no ${FULLSCREEN_MODES.join(' and ')} in ${unmoded.join(', ')}` : `every session enabled ${FULLSCREEN_MODES.join(' and ')}` },
    ...(chains.length ? [{ surface: 'resume chain', ok: chains.every((s) => s.chain), says: chains.every((s) => s.chain) ? '`GET /conversations/<id>` names the session it resumes' : 'a resumed session does not name the one it resumes' }] : []),
  ]

  const retried = run.scenarios.filter((s) => s.retried?.length)
  const clean = failed.length === 0 && unbased.length === 0 && changes.length === 0 && replays.every((r) => r.same) && checks.every((c) => c.ok)
  const entries = changelog && changelogOf(changelog, run.claude)
  const held = debugLog ? heldBack(debugLog) : new Map()
  const fixtures = new Set(SCENARIOS.flatMap((s) => Object.values(s.recordings).flatMap((r) => (r.fixture ? [r.fixture] : []))))

  const markdown = [
    `# Claude ${run.claude} against the tower`,
    '',
    `${run.scenarios.length} scenarios, ${Object.keys(recordings).length} sessions, ${run.minutes} minutes, from ${new Date(run.startedAt).toISOString().slice(0, 16)}Z. Tested range ${range.lowest} to ${range.highest}: this release reads \`${range.reads}\`. Baseline taken on ${baseline.claude || 'no release yet'}.`,
    '',
    clean
      ? `**Clean.** No shape changed, every recording replays as its fixture, and every surface check holds: ${range.reads === 'above' ? `raise \`CLAUDE_TESTED.highest\` to ${run.claude}, and \`accept\` to move the baseline` : 'nothing to move'}.`
      : '**Needs reading.** Each difference is named below.',
    '',
    '## Scenarios',
    failed.length ? failed.map((s) => `- **${s.name}** stopped short: ${s.error}`).join('\n') : `All ${run.scenarios.length} ran to their last step.`,
    ...(retried.length
      ? ['', 'Run again before this report, only the last attempt read here:', ...retried.map((s) => `- **${s.name}**: ${s.retried!.map((why, i) => `attempt ${i + 1}: ${why.join('; ')}`).join('; ')}`)]
      : []),
    '',
    '## Shapes',
    'Event names and payload keys against the baseline, over every recording of a scenario that ran through.',
    '',
    [
      ...(unbased.length ? [`- no baseline for ${unbased.join(', ')}`] : []),
      ...changes.map(changeLine),
    ].join('\n') || 'No event or key added or removed.',
    '',
    '## Status replays',
    'Each recording through `timeline` (`test/replay.ts`) against its fixture.',
    '',
    replays.filter((r) => r.same).length ? `Same as their fixture: ${replays.filter((r) => r.same).map((r) => r.name).join(', ')}.` : '',
    ...replays.filter((r) => !r.same).map((r) => `- **${r.name}** differs from \`${r.of}\`${r.ignore.length ? ` (ignoring ${r.ignore.join(', ')})` : ''}:\n  - fixture:   ${r.was.join(' ')}\n  - recording: ${r.is.join(' ')}`),
    '',
    '## Surfaces no fixture covers',
    checks.map((c) => `- ${c.ok ? 'ok' : '**no**'} ${c.surface}: ${c.says}`).join('\n'),
    '',
    '## Held back by Claude',
    held.size ? [...held].map(([what, n]) => `- \`${what}\`: ${n} times (\`--debug-file\`)`).join('\n') : 'The debug log names no event a built-in mod kept from the tower\'s.',
    '',
    `## Changelog ${run.claude}`,
    entries
      ? `Entries marked **⚑** name a surface the tower reads: read those.\n\n${entries.map((e) => `- ${e.watched ? '**⚑** ' : ''}${e.entry}`).join('\n')}`
      : `No section for ${run.claude} in \`~/.claude/cache/changelog.md\`.`,
    '',
    '## Not recorded',
    Object.entries(UNRECORDED).filter(([name]) => !fixtures.has(name)).map(([name, why]) => `- ${name}: ${why}`).join('\n'),
    '',
  ].join('\n')
  return { markdown, clean }
}
