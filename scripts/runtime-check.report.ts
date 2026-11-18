/**
 * What every runtime's report of a `scripts/runtime-check.ts` run holds, pure over what the run kept: each recording's
 * status replay against its fixture, what reads differently by scenario (what `--retries` runs again), the shapes
 * against the baseline, and the sections every report draws alike. A runtime's report adds its own surfaces.
 */
import type { SessionLog } from '../src/shared/model.ts'
import { comparedForm, shapeChanges, shapesOf, statusesOf, type Baseline, type ShapeChange } from './runtime-check.read.ts'
import type { Launch, Run, Runtime, Scenario } from './runtime-check.scenario.ts'

/** A surface the report checks beyond the fixtures: whether it holds, and what it read. */
export type Check = { surface: string; ok: boolean; says: string }

/** A scenario whose session starts held by a screen it names: its leading `blocked` is that screen, never the trust one. */
const heldAtStart = (s: Scenario) => s.steps.some((step) => step.do && 'spawn' in step.do && step.do.blocked)

/** Each recording a scenario declares a fixture for, through `timeline` against that fixture's, in its compared form. */
export const replaysOf = (scenarios: Scenario[], recordings: Record<string, SessionLog>, fixture: (name: string) => SessionLog) => {
  const declared = new Map(scenarios.flatMap((s) => Object.entries(s.recordings).map(([name, r]) => [name, { ...r, ignore: s.fresh || heldAtStart(s) ? (r.ignore ?? []) : ['trust' as const, ...(r.ignore ?? [])] }] as const)))
  return Object.entries(recordings).flatMap(([name, log]) => {
    const { fixture: of, ignore = [] } = declared.get(name) ?? {}
    if (!of) return []
    const is = comparedForm(statusesOf(log), ignore)
    const was = comparedForm(statusesOf(fixture(of)), ignore)
    return [{ name, of, ignore, is, was, same: is.join() === was.join() }]
  })
}

export type DifferencesInput = { run: Pick<Run, 'release' | 'scenarios'>; recordings: Record<string, SessionLog>; fixture: (name: string) => SessionLog }

/**
 * What reads differently in each scenario, from its own recordings alone, by scenario: what running it again can tell
 * from the model's timing. Shapes are read over the whole run, and stay out.
 */
export const scenarioDifferences = <L extends Launch>(runtime: Runtime<L>, { run, recordings, fixture }: DifferencesInput): Map<string, string[]> => {
  const scenarioOf = (recording: string) => run.scenarios.find((s) => s.recordings.some((r) => r.name === recording))!.name
  const differences: [string, string][] = [
    ...run.scenarios.filter((s) => s.error).map((s): [string, string] => [s.name, `stopped short: ${s.error}`]),
    ...replaysOf(runtime.scenarios, recordings, fixture).filter((r) => !r.same).map((r): [string, string] => [scenarioOf(r.name), `${r.name} replays differently from \`${r.of}\``]),
    ...runtime.differences(run as Run, recordings).map(([recording, why]): [string, string] => [scenarioOf(recording), why]),
    ...run.scenarios.filter((s) => s.resumed.length && !s.chain).map((s): [string, string] => [s.name, 'a resumed session does not name the one it resumes']),
  ]
  return differences.reduce((by, [name, why]) => by.set(name, [...(by.get(name) ?? []), why]), new Map<string, string[]>())
}

/** The run's shapes against the baseline, over every recording of a scenario that ran through. */
export const shapesAgainst = (run: Run, recordings: Record<string, SessionLog>, baseline: Baseline) => {
  const failedRecordings = new Set(run.scenarios.filter((s) => s.error).flatMap((s) => s.recordings.map((r) => r.name)))
  const compared = Object.fromEntries(Object.entries(recordings).filter(([name]) => !failedRecordings.has(name)).map(([name, log]) => [name, shapesOf(log)]))
  return { failedRecordings, unbased: Object.keys(compared).filter((name) => !(name in baseline.recordings)), changes: shapeChanges(baseline.recordings, compared) }
}

/** The resume chain: whether each resumed session's conversations name the session it resumes. */
export const chainCheck = (run: Run): Check[] => {
  const chains = run.scenarios.filter((s) => s.resumed.length)
  return chains.length ? [{ surface: 'resume chain', ok: chains.every((s) => s.chain), says: chains.every((s) => s.chain) ? '`GET /conversations/<id>` names the session it resumes' : 'a resumed session does not name the one it resumes' }] : []
}

const changeLine = (c: ShapeChange) => `- \`${c.sign}\` \`${c.event}${c.key ? `\` key \`${c.key}` : ''}\`: ${c.sign === '-' ? 'was in' : 'in'} ${c.in.join(', ')}`

/** The title, the summary line and the verdict. `highest`: the constant a clean run above the range raises. */
export const headLines = (
  { word, run, recordings, baseline, range, clean, highest }: { word: string; run: Run; recordings: Record<string, SessionLog>; baseline: Baseline; range: { lowest: string; highest: string; reads: string }; clean: boolean; highest: string },
) => [
  `# ${word} ${run.release} against the tower`,
  '',
  `${run.scenarios.length} scenarios, ${Object.keys(recordings).length} sessions, ${run.minutes} minutes, from ${new Date(run.startedAt).toISOString().slice(0, 16)}Z. Tested range ${range.lowest} to ${range.highest}: this release reads \`${range.reads}\`. Baseline taken on ${baseline.release || 'no release yet'}.`,
  '',
  clean
    ? `**Clean.** No shape changed, every recording replays as its fixture, and every surface check holds: ${range.reads === 'above' ? `raise \`${highest}\` to ${run.release}, and \`accept\` to move the baseline` : 'nothing to move'}.`
    : '**Needs reading.** Each difference is named below.',
  '',
]

export const scenarioLines = (run: Run) => {
  const failed = run.scenarios.filter((s) => s.error)
  const retried = run.scenarios.filter((s) => s.retried?.length)
  return [
    '## Scenarios',
    failed.length ? failed.map((s) => `- **${s.name}** stopped short: ${s.error}`).join('\n') : `All ${run.scenarios.length} ran to their last step.`,
    ...(retried.length
      ? ['', 'Run again before this report, only the last attempt read here:', ...retried.map((s) => `- **${s.name}**: ${s.retried!.map((why, i) => `attempt ${i + 1}: ${why.join('; ')}`).join('; ')}`)]
      : []),
    '',
  ]
}

export const shapeLines = ({ unbased, changes }: { unbased: string[]; changes: ShapeChange[] }) => [
  '## Shapes',
  'Event names and payload keys against the baseline, over every recording of a scenario that ran through.',
  '',
  [...(unbased.length ? [`- no baseline for ${unbased.join(', ')}`] : []), ...changes.map(changeLine)].join('\n') || 'No event or key added or removed.',
  '',
]

export const replayLines = (replays: ReturnType<typeof replaysOf>) => [
  '## Status replays',
  'Each recording through `timeline` (`test/replay.ts`) against its fixture.',
  '',
  replays.filter((r) => r.same).length ? `Same as their fixture: ${replays.filter((r) => r.same).map((r) => r.name).join(', ')}.` : '',
  ...replays.filter((r) => !r.same).map((r) => `- **${r.name}** differs from \`${r.of}\`${r.ignore.length ? ` (ignoring ${r.ignore.join(', ')})` : ''}:\n  - fixture:   ${r.was.join(' ')}\n  - recording: ${r.is.join(' ')}`),
  '',
]

export const checkLines = (checks: Check[]) => ['## Surfaces no fixture covers', checks.map((c) => `- ${c.ok ? 'ok' : '**no**'} ${c.surface}: ${c.says}`).join('\n'), '']

export const unrecordedLines = (scenarios: Scenario[], unrecorded: Record<string, string>) => {
  const fixtures = new Set(scenarios.flatMap((s) => Object.values(s.recordings).flatMap((r) => (r.fixture ? [r.fixture] : []))))
  const left = Object.entries(unrecorded).filter(([name]) => !fixtures.has(name))
  return ['## Not recorded', left.length ? left.map(([name, why]) => `- ${name}: ${why}`).join('\n') : 'Every fixture has a scenario.', '']
}
