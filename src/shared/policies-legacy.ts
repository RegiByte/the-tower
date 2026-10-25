/**
 * Policies as the core carried them before they moved into the bundled policies extension (decision `policies`): the
 * shapes of `floor.policies`, `card.run`, `board.offers`, the old routes `policy/*` and `GET /runs/<project>`, which
 * `LEGACY` copies back to their old fields until 2.0, and the words the deprecated Policies panel of `/panels.js` says
 * them with. The extension builds on the same shapes; its own words are its client's, `/x/policies/policies.js`.
 */
import type { Board, Card } from '../bridge/board.ts'
import type { OfferAction, OfferCalls, PolicyAction, PolicyCalls } from '../bridge/verbs.ts'
import { listed, nextSlot, onTimeSlot, slotWords, type CronWhen } from './slots.ts'

export const POLICIES = 'policies'

/**
 * A check's run at a slot: its exit code (0, there is work; 1, none; absent when it timed out or never started, `error`
 * saying which), how long it took, its stdout when it found work (at most 2,048 characters) and the end of its stderr
 * when it failed (at most 500).
 */
export type CheckResult = { exit: number; ms: number; out?: string; stderr?: string } | { error: string; ms: number; stderr?: string }

/** Why the runner passed a slot: offered it, the check found no work, live was full, or the check failed. */
export type Outcome = 'offered' | 'no-work' | 'held' | 'check-failed'

/** How a run started: on its own at its slot, an offer accepted, or by hand with no slot. */
export type RunStart = 'auto' | 'offer' | 'hand'

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

/** The hash as people read it: its first 8 hex. */
export const shortHash = (hash: string) => hash.replace(/^sha256:/, '').slice(0, 8)

/** A run that holds a slot: its number, its worker (as it is now) and when it started (epoch ms). */
export type HeldBy = { n: number; id: string; callsign?: string; since: number }

export type ValidPolicy = { header: PolicyHeader; rule: string; next?: number; needs?: { kind: 'reapprove'; approved: string } | { kind: 'held'; slot: number; by: HeldBy[] } }

export type InvalidPolicy = { header?: undefined; problems: Problem[]; needs?: { kind: 'invalid' } }

/** What a policy's view says of it, its calls aside. */
export type PolicyFields = {
  id: string
  tag: string
  title?: string
  hash: string
  approved?: { at: number; by?: string }
  live: string[]
  last?: { n: number; at: number; slot: number | null; id: string; callsign?: string }
  passed?: { at: number; slot: number; outcome: Outcome; check?: CheckResult }
  seen?: number
  offer?: { slot: number; since: number; until: number; check?: CheckResult }
}

/**
 * A policy on its floor: valid, with its `header`, `rule` and `next`, or invalid, with its `problems`. `rule`: its crons in words; `next`: its next slot
 * (epoch ms); `approved`: the approval of its current hash; `live`: the current cards of its runs that run; `last`: its
 * latest run, `n` its number; `passed`: its latest pass, for why; `seen`: the newest slot any of its facts names;
 * `offer`: its open offer; `needs`: an `auto` policy that lost the right to run on its own (edited since its approval,
 * or invalid once approved), else a slot held while it is still open (`HeldBy`). `actions`: `run` it now, by hand, and
 * `approve` its current hash, each with its call; `calls` says the same.
 */
export type PolicyView = PolicyFields & { calls: PolicyCalls; actions: PolicyAction[] } & (ValidPolicy | InvalidPolicy)

export type ValidPolicyView = Extract<PolicyView, { header: PolicyHeader }>

/** What an offer says of its slot, its calls aside. */
export type OfferFields = { key: string; project: string; policy: string; tag: string; title?: string; slot: number; since: number; until: number; check?: CheckResult }

/**
 * A slot offered and not yet taken, open until the policy's next slot. `key`: `policy@slot`. `check`: what the check
 * found, which the run accepting it records.
 */
export type Offer = OfferFields & { calls: OfferCalls; actions: OfferAction[] }

/** The run a worker is, through every resume: its policy, number, slot (`null` by hand), how it started and its check. */
export type CardRun = { policy: string; tag: string; title?: string; n: number; by?: string; check?: CheckResult } & ({ start: 'hand'; slot: null } | { start: 'auto' | 'offer'; slot: number })

/**
 * One run as `GET /runs/<project>` reads it: its number, slot, when it started, the hash it ran on and whether that is
 * the file's current one, how and by whom it started, its check, and its worker as it is now (its current card): its
 * status, whether it runs, when it ended, its cost, what it showed and its latest answer.
 */
export type RunRead = {
  n: number
  slot: number | null
  at: number
  hash: string
  current: boolean
  start: RunStart
  by?: { id: string; callsign?: string }
  check?: CheckResult
  worker: { id: string; callsign: string; status: Card['status']; live: boolean; endedAt?: number; cost?: number; shown: string[]; answer?: string }
}

/** A view whose calls name any verb: what words read, over the board's old fields or the extension's part. */
type AnyPolicyView = PolicyFields & (ValidPolicy | InvalidPolicy)
type AnyValidPolicyView = Extract<AnyPolicyView, { header: PolicyHeader }>

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

const stepOf = (policy: AnyValidPolicyView): Step =>
  policy.live.length >= policy.header.live ? 'held' : policy.header.check ? 'check' : policy.header.start === 'auto' && policy.approved ? 'run' : 'offer'

export const standingOf = (policy: AnyValidPolicyView, now: number): Exclude<Standing, { t: 'invalid' }> => {
  if (policy.header.runner !== undefined) return { t: 'elsewhere', runner: policy.header.runner }
  const slot = onTimeSlot(policy.header.when, now)
  if (slot !== undefined && !(policy.seen !== undefined && policy.seen >= slot)) return { t: 'due', slot, step: stepOf(policy) }
  if (policy.offer && now < policy.offer.until) return { t: 'offered', slot: policy.offer.slot, until: policy.offer.until }
  return { t: 'waits', next: nextSlot(policy.header.when, now), step: stepOf(policy) }
}

export const standing = (policy: AnyPolicyView, now: number): Standing => (policy.header ? standingOf(policy, now) : { t: 'invalid' })

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
const holders = (policy: AnyPolicyView, board: Board) => {
  const cards = board.floors.flatMap((f) => f.cards)
  const names = policy.live.map((id) => cards.find((c) => c.id === id)?.callsign ?? id)
  const last = policy.last && cards.find((c) => c.id === policy.live.at(-1))?.lineage[0].id === policy.last.id ? `run ${policy.last.n} (${names.at(-1)})` : undefined
  return policy.live.length === 1 && last ? `${last} still runs` : `${listed(names)} still run${names.length === 1 ? 's' : ''}`
}

/** What the runner will do with a slot: a slot due waits for its next tick, a next slot for its moment. */
const stepWords = (step: Step, policy: AnyValidPolicyView, board: Board) => {
  const after = policy.header.start === 'auto' && policy.approved ? 'start on its own' : 'be offered'
  return step === 'held' ? `will be held: ${holders(policy, board)}` : step === 'check' ? `will check for work, then ${after}` : `will ${after}`
}

const problemsWords = (problems: Problem[]) => problems.map((p) => `${p.path}: ${p.message}`).join(' · ')

/**
 * Where a policy stands, in words: the same reason the runner acts on. The latest slot that passed leads while it is
 * the policy's latest fact.
 */
export const standingWords = (policy: AnyPolicyView, board: Board, now: number): string => {
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
export const heldWords = (policy: AnyPolicyView, held: Extract<NonNullable<AnyPolicyView['needs']>, { kind: 'held' }>, now: number): string => {
  const tz = policy.header?.when.tz
  return `${slotWords(held.slot, tz, now)} held: ${listed(held.by.map((h) => `run ${h.n} (${h.callsign ?? h.id}) on duty since ${slotWords(h.since, tz, now)}`))}`
}
