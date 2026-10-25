/**
 * What `tower policies` and `tower runs` print, said by the policies extension (its read `said/<project>`), so the
 * core's CLI prints the words of whoever provides `policies`.
 */
import type { Board, Card } from '../../src/bridge/board.ts'
import { statusName } from '../../src/shared/cards.ts'
import { slotWords } from '../../src/shared/slots.ts'
import { tagOf } from '../../src/shared/tags.ts'
import { checkFound, heldWords, standingWords } from './client/policies.ts'
import { shortHash, type PolicyView, type RunRead } from './policies.ts'

/** A session by its callsign, among every card: `the user` for none. */
const whoIs = (cards: Card[], id: string | undefined) => (id === undefined ? 'the user' : (cards.find((c) => c.id === id)?.callsign ?? id))

/** How a policy's approval stands, in words. */
const approvalWords = (p: PolicyView, cards: Card[]) =>
  p.approved
    ? `approved ${shortHash(p.hash)} by ${whoIs(cards, p.approved.by)}`
    : p.needs?.kind === 'reapprove'
      ? `NOT approved (edited since ${shortHash(p.needs.approved)})`
      : 'not approved: its slots are offered'

/** A policy's lines in `tower policies`. `cards`: every card of the floor, archived ones too. */
const policyLines = (board: Board, p: PolicyView, cards: Card[], width: number[], now: number): string[] => {
  const head = `${p.tag.padEnd(width[0])}  ${(p.title ?? '(untitled)').padEnd(width[1])}  `
  const indent = ' '.repeat(width[0] + 2)
  if (!p.header) return [`${head}${standingWords(p, board, now)}${p.needs ? ' (it used to run on its own)' : ''}`]
  const last = p.last && cards.find((c) => c.lineage.some((l) => l.id === p.last!.id) && !c.continuedBy)
  const facts = [
    p.header.runner !== undefined ? `runner "${p.header.runner}"` : p.header.start,
    ...(p.header.start === 'auto' ? [approvalWords(p, cards)] : []),
    `live ${p.live.length}/${p.header.live}`,
    ...(p.last ? [`last: run ${p.last.n}, ${p.last.slot === null ? 'by hand' : slotWords(p.last.slot, p.header.when.tz, now)}${last ? `, ${last.callsign} ${statusName(last)}` : ''}`] : []),
  ]
  return [`${head}${p.rule}`, `${indent}${facts.join(' · ')}`, `${indent}now: ${standingWords(p, board, now)}`, ...(p.needs?.kind === 'held' ? [`${indent}needs you: ${heldWords(p, p.needs, now)}`] : [])]
}

/** A floor's policies as `tower policies` lists them, each in its lines; none for a floor with no policies. */
export const policiesLines = (board: Board, policies: PolicyView[], cards: Card[], now: number): string[] => {
  const width = [Math.max(...policies.map((p) => p.tag.length)), Math.max(...policies.map((p) => (p.title ?? '(untitled)').length))]
  return policies.flatMap((p) => policyLines(board, p, cards, width, now))
}

/** A run's start in words. */
const startWords = (start: RunRead['start'], by: string | undefined) => (start === 'auto' ? 'auto' : start === 'hand' ? `by hand${by ? `, ${by}` : ''}` : `offer, ${by ?? 'the user'}`)

/** How many of an answer's lines and characters `tower runs` shows. */
const ANSWER_LINES = 15
const ANSWER_CHARS = 1500

const answerLines = (answer: string): string[] => {
  const cut = answer.length > ANSWER_CHARS ? answer.slice(0, ANSWER_CHARS) : answer
  const lines = cut.trimEnd().split('\n')
  const shown = lines.slice(0, ANSWER_LINES)
  return [...shown.map((l) => `        │ ${l}`), ...(shown.length < lines.length || cut !== answer ? ['        │ … (cut: `tower agent <CALLSIGN>` reads it whole)'] : [])]
}

const runReadLines = (run: RunRead, tz: string | undefined, now: number): string[] => [
  [
    `run ${run.n}`.padEnd(7),
    (run.slot === null ? 'by hand' : slotWords(run.slot, tz, now)).padEnd(13),
    startWords(run.start, run.by?.callsign).padEnd(16),
    run.worker.callsign,
    run.worker.live ? 'on duty' : run.worker.status,
    ...(run.worker.cost !== undefined ? [`$${run.worker.cost.toFixed(2)}`] : []),
    ...(run.current ? [] : [`older version ${shortHash(run.hash)}`]),
  ].join('  '),
  ...run.worker.shown.map((s) => `        showed ${s}`),
  ...[checkFound(run.check)].flatMap((found) => (found ? [`        its check found: ${found.split('\n').join(' ')}`] : [])),
  ...(run.worker.answer ? answerLines(run.worker.answer) : []),
]

/**
 * A policy's runs as `tower runs` prints them: its name and rule, then each run, newest first. `policy`: its view, none
 * once its file is gone.
 */
export const runsLines = (id: string, policy: PolicyView | undefined, runs: RunRead[], now: number): string[] => {
  const head = `${policy?.title ?? id} (${policy?.tag ?? tagOf(id)})${policy?.header ? ` · ${policy.rule}` : ''}`
  if (!runs.length) return [`${head} · no runs yet`]
  const tz = policy?.header?.when.tz
  return [`${head} · runs ${runs[0].n} to ${runs.at(-1)!.n} of ${runs[0].n}`, ...runs.flatMap((r) => runReadLines(r, tz, now)), "`tower agent <CALLSIGN>` reads a run's whole brief."]
}
