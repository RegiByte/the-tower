/**
 * Policies: standing work a floor keeps in its `policies` collection, one markdown item each: a `# Title` line, a fenced
 * json header, then the prose a run's worker starts on (decision `policies`). What the CLI, every renderer and the
 * runner say and decide about them, pure over the board: where each policy stands, and what a runner does at a tick.
 * Their slots are `slots.ts`'s. Served as `/policies.js`.
 */
import type { Board } from '../../../src/bridge/board.ts'
import type { CheckResult, Outcome, PolicyView, ValidPolicyView } from '../policies.ts'
import { listed, nextSlot, onTimeSlot, ruleWords, slotWords, type CronWhen } from '../../../src/shared/slots.ts'

/** The rule and slot words renderers import from `/policies.js`. */
export { cronFields, cronProblem, nextSlot, ON_TIME_MS, onTimeSlot, ruleWords, slotsBetween, slotWords, zoneCity } from '../../../src/shared/slots.ts'

export const POLICIES = 'policies'

/** Where a run's worker starts and on what model: the spawn verb's own fields (`SPAWN_FIELDS`), which its schema picks. */
export type Hire = { cwd?: string; cut?: { name?: string; branch?: string; base?: string; from?: string }; model?: string; effort?: string }

/** A policy's header, its defaults filled in. */
export type PolicyHeader = {
  /** Its slots, as crons. */
  when: CronWhen
  /** A shell line run at the slot from the floor's hub: exit 0, there is work; 1, none; anything else, it failed. */
  check?: string
  /** `ask`: each slot is offered. `auto`: started while the file's current hash has an approval, offered otherwise. */
  start: 'ask' | 'auto'
  /** The most runs of this policy whose workers run at once; a slot due while full is held. */
  live: number
  hire: Hire
  /** The runner that acts on it; the tower's acts on the policies that name none. */
  runner?: string
  /** Each runner's own attributes, under its name. */
  x?: Record<string, unknown>
}

/** What makes a file no policy, at its path as `tower config check` prints one: `when.cron[1]`, `header`, `prose`. */
export type Problem = { path: string; message: string }

/** What the runner does with a slot of the policy as it stands: hold it (live is full), check first, run it, or offer it. */
export type Step = 'held' | 'check' | 'run' | 'offer'

/**
 * Where a policy stands at `now`: `invalid`; left to another runner; `due`, a slot on time with no fact yet, and the
 * step the runner takes at its next tick; `offered`, an open offer until the next slot; or `waits` for its next slot,
 * and the step that slot will take as things stand.
 */
export type Standing =
  | { t: 'invalid' }
  | { t: 'elsewhere'; runner: string }
  | { t: 'due'; slot: number; step: Step }
  | { t: 'offered'; slot: number; until: number }
  | { t: 'waits'; next?: number; step: Step }

const stepOf = (policy: ValidPolicyView): Step =>
  policy.live.length >= policy.header.live ? 'held' : policy.header.check ? 'check' : policy.header.start === 'auto' && policy.approved ? 'run' : 'offer'

export const standingOf = (policy: ValidPolicyView, now: number): Exclude<Standing, { t: 'invalid' }> => {
  if (policy.header.runner !== undefined) return { t: 'elsewhere', runner: policy.header.runner }
  const slot = onTimeSlot(policy.header.when, now)
  if (slot !== undefined && !(policy.seen !== undefined && policy.seen >= slot)) return { t: 'due', slot, step: stepOf(policy) }
  if (policy.offer && now < policy.offer.until) return { t: 'offered', slot: policy.offer.slot, until: policy.offer.until }
  return { t: 'waits', next: nextSlot(policy.header.when, now), step: stepOf(policy) }
}

export const standing = (policy: PolicyView, now: number): Standing => (policy.header ? standingOf(policy, now) : { t: 'invalid' })

/** A check's result keyed by the policy and slot it ran for. */
export const checkKey = (policy: string, slot: number) => `${policy}@${slot}`

/** What a runner does at a tick: run a check (and decide again once it ran), start a run, or record a pass. */
export type Action =
  | { t: 'check'; policy: string; slot: number; line: string }
  | { t: 'run'; policy: string; slot: number; check?: CheckResult }
  | { t: 'pass'; policy: string; slot: number; outcome: Outcome; check?: CheckResult }

/**
 * What the runner does at `now` for each policy of the floor it acts on (valid, naming no runner) whose slot is due:
 * held while live is full; a check first, from `checked` once it ran (exit 1: no work; another exit, a timeout or no
 * start: failed); then a run while `auto` and approved, else an offer. It reads the board, nothing else.
 */
export const decide = (floor: { policies: PolicyView[] }, checked: Map<string, CheckResult>, now: number): Action[] =>
  floor.policies.flatMap((policy): Action[] => {
    if (!policy.header) return []
    const stands = standingOf(policy, now)
    if (stands.t !== 'due') return []
    const { slot, step } = stands
    const auto = policy.header.start === 'auto' && policy.approved !== undefined
    if (step === 'held') return [{ t: 'pass', policy: policy.id, slot, outcome: 'held' }]
    if (step === 'run') return [{ t: 'run', policy: policy.id, slot }]
    if (step === 'offer') return [{ t: 'pass', policy: policy.id, slot, outcome: 'offered' }]
    const check = checked.get(checkKey(policy.id, slot))
    if (!check) return [{ t: 'check', policy: policy.id, slot, line: policy.header.check! }]
    if ('exit' in check && check.exit === 1) return [{ t: 'pass', policy: policy.id, slot, outcome: 'no-work', check }]
    if (!('exit' in check) || check.exit !== 0) return [{ t: 'pass', policy: policy.id, slot, outcome: 'check-failed', check }]
    return auto ? [{ t: 'run', policy: policy.id, slot, check }] : [{ t: 'pass', policy: policy.id, slot, outcome: 'offered', check }]
  })

/** What a check found, when it ran and there was work: its stdout. */
export const checkFound = (check: CheckResult | undefined) => (check && 'exit' in check ? check.out : undefined)

/** Why a check failed, in a line: `exit 127: sh: gh: command not found`, `timed out after 60s`. */
export const checkWhy = (check: CheckResult) => {
  const why = 'error' in check ? check.error : `exit ${check.exit}`
  const said = check.stderr?.trim().split('\n').at(-1)
  return said ? `${why}: ${said}` : why
}

const OUTCOME_WORDS: Record<Outcome, (check: CheckResult | undefined) => string> = {
  offered: () => 'offered, not taken',
  'no-work': () => 'no work',
  held: () => 'held: live was full',
  'check-failed': (check) => `check failed (${checkWhy(check!)})`,
}

/** Who holds a policy's live runs, by callsign: `run 6 (SADDIE-12)` when it is the last run. */
const holders = (policy: PolicyView, board: Board) => {
  const cards = board.floors.flatMap((f) => f.cards)
  const names = policy.live.map((id) => cards.find((c) => c.id === id)?.callsign ?? id)
  const last = policy.last && cards.find((c) => c.id === policy.live.at(-1))?.lineage[0].id === policy.last.id ? `run ${policy.last.n} (${names.at(-1)})` : undefined
  return policy.live.length === 1 && last ? `${last} still runs` : `${listed(names)} still run${names.length === 1 ? 's' : ''}`
}

/** What the runner will do with a slot: a slot due waits for its next tick, a next slot for its moment. */
const stepWords = (step: Step, policy: ValidPolicyView, board: Board) => {
  const after = policy.header.start === 'auto' && policy.approved ? 'start on its own' : 'be offered'
  return step === 'held' ? `will be held: ${holders(policy, board)}` : step === 'check' ? `will check for work, then ${after}` : `will ${after}`
}

const problemsWords = (problems: Problem[]) => problems.map((p) => `${p.path}: ${p.message}`).join(' · ')

/**
 * Where a policy stands, in words: the same reason the runner acts on. The latest slot that passed leads while it is
 * the policy's latest fact.
 */
export const standingWords = (policy: PolicyView, board: Board, now: number): string => {
  if (!policy.header) return `invalid · ${problemsWords(policy.problems)}`
  const stands = standingOf(policy, now)
  if (stands.t === 'elsewhere') return `left to the runner "${stands.runner}"`
  const tz = policy.header.when.tz
  if (stands.t === 'due') return `${slotWords(stands.slot, tz, now)} is due: ${stepWords(stands.step, policy, board)}`
  if (stands.t === 'offered') return `${slotWords(stands.slot, tz, now)} is offered, until ${slotWords(stands.until, tz, now)}`
  const passed = policy.passed && (!policy.last || policy.passed.at > policy.last.at) ? `${slotWords(policy.passed.slot, tz, now)} passed, ${OUTCOME_WORDS[policy.passed.outcome](policy.passed.check)}` : undefined
  const next = stands.next === undefined ? 'no slot ahead' : `${slotWords(stands.next, tz, now)} ${stepWords(stands.step, policy, board)}`
  return [passed, next].filter(Boolean).join(' · ')
}

/** A held slot, in words: `Fri 17:00 held: run 1 (PETER-85) on duty since Tue 18:52`. */
export const heldWords = (policy: PolicyView, held: Extract<NonNullable<PolicyView['needs']>, { kind: 'held' }>, now: number): string => {
  const tz = policy.header?.when.tz
  return `${slotWords(held.slot, tz, now)} held: ${listed(held.by.map((h) => `run ${h.n} (${h.callsign ?? h.id}) on duty since ${slotWords(h.since, tz, now)}`))}`
}

/** A policy in a line, as a tray lists it: its rule in words, or why it is invalid. */
export const policyLine = (policy: PolicyView): string =>
  policy.header ? ruleWords(policy.header.when) : `invalid · ${problemsWords(policy.problems)}`
