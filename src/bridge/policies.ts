/**
 * Policies' facts, written only by the tower to each project's streams (`streams/projects/<project>/runs/` and
 * `approvals/`), and what the board derives from them and the floor's `policies` items: each policy's view, the open
 * offers, and the run a card is. Nothing about a policy is stored beside these facts (decision `policies`).
 */
import type { Call } from '../shared/api.ts'
import { nextSlot, ruleWords, type PolicyHeader, type Problem } from '../shared/policies.ts'
import { tagOf } from '../shared/tags.ts'
import type { Card } from './board.ts'
import type { StreamFact } from './streams.ts'

export const RUNS_STREAM = 'runs'
export const APPROVALS_STREAM = 'approvals'

/**
 * A check's run at a slot: its exit code (0, there is work; 1, none; absent when it timed out or never started, `error`
 * saying which), how long it took, its stdout when it found work (at most 2,048 characters) and the end of its stderr
 * when it failed (at most 500).
 */
export type CheckResult = { exit?: number; ms: number; out?: string; stderr?: string; error?: string }

/** Why the runner passed a slot: offered it, the check found no work, live was full, or the check failed. */
export type Outcome = 'offered' | 'no-work' | 'held' | 'check-failed'

/** How a run started: on its own at its slot, an offer accepted, or by hand with no slot. */
export type RunStart = 'auto' | 'offer' | 'hand'

/**
 * `r` in `runs/`: a worker started for a policy. `policy` is its item id; `hash` the file's as it ran; `slot` an ISO
 * instant, `null` by hand; `id` the worker's session; `by` the session that accepted or started it (absent: the user,
 * or the runner for `auto`); `check` the check that let it run.
 */
export type RunFact = { policy: string; hash: string; slot: string | null; id: string; start: RunStart; by?: string; check?: CheckResult }

/** `s` in `runs/`: a slot the runner saw and didn't start, and why. */
export type PassFact = { policy: string; hash: string; slot: string; outcome: Outcome; check?: CheckResult }

/** `a` in `approvals/`: a policy's hash approved for the runner to start on its own. `by`: the approving worker's session (absent: the user). */
export type ApprovalFact = { policy: string; hash: string; by?: string }

/** A project's policy facts, each at its moment (epoch ms), oldest first. */
export type PolicyFacts = { runs: [at: number, run: RunFact][]; passes: [at: number, pass: PassFact][]; approvals: [at: number, approval: ApprovalFact][] }

export const NO_POLICY_FACTS: PolicyFacts = { runs: [], passes: [], approvals: [] }

/** A project's policy facts from its streams' facts. */
export const policyFacts = (runs: StreamFact[], approvals: StreamFact[]): PolicyFacts => ({
  runs: runs.flatMap(([at, code, fact]) => (code === 'r' ? [[at, fact as RunFact]] : [])),
  passes: runs.flatMap(([at, code, fact]) => (code === 's' ? [[at, fact as PassFact]] : [])),
  approvals: approvals.flatMap(([at, code, fact]) => (code === 'a' ? [[at, fact as ApprovalFact]] : [])),
})

/** A slot as a fact names it: an ISO instant to the second. */
export const slotName = (slot: number): string => new Date(slot).toISOString().replace(/\.\d{3}Z$/, 'Z')

/** A file of the `policies` collection, parsed: a policy, or why it isn't one. */
export type Parsed = { ok: true; title: string; header: PolicyHeader; prompt: string } | { ok: false; title?: string; problems: Problem[] }

/** A policy item as the system holds it: the hash of its bytes, and its parse. */
export type PolicyFile = { project: string; id: string; modifiedAt: number; hash: string; parsed: Parsed }

/** The hash as people read it: its first 8 hex. */
export const shortHash = (hash: string) => hash.replace(/^sha256:/, '').slice(0, 8)

/**
 * A policy on its floor. Exactly one of `header` and `problems`. `rule`: its crons in words; `next`: its next slot
 * (epoch ms); `approved`: the approval of its current hash; `live`: the current cards of its runs that run; `last`: its
 * latest run, `n` its number; `passed`: its latest pass, for why; `seen`: the newest slot any of its facts names;
 * `offer`: its open offer; `needs`: an `auto` policy that lost the right to run on its own (edited since its approval,
 * or invalid once approved). `calls.run` runs it now, by hand; `calls.approve` approves its current hash.
 */
export type PolicyView = {
  id: string
  tag: string
  title?: string
  hash: string
  header?: PolicyHeader
  problems?: Problem[]
  rule?: string
  next?: number
  approved?: { at: number; by?: string }
  live: string[]
  last?: { n: number; at: number; slot: number | null; id: string; callsign?: string }
  passed?: { at: number; slot: number; outcome: Outcome; check?: CheckResult }
  seen?: number
  offer?: { slot: number; since: number; until: number }
  needs?: { kind: 'reapprove'; approved: string } | { kind: 'invalid' }
  calls: { run?: Call<'policy/run'>; approve?: Call<'policy/approve'> }
}

/** A slot offered and not yet taken, open until the policy's next slot. `key`: `policy@slot`. */
export type Offer = { key: string; project: string; policy: string; tag: string; title?: string; slot: number; since: number; until: number; calls: { accept: Call<'policy/run'> } }

/** The run a worker is, through every resume: its policy, number, slot (`null` by hand), how it started and its check. */
export type CardRun = { policy: string; tag: string; title?: string; n: number; slot: number | null; start: RunStart; by?: string; check?: CheckResult }

const slotOf = (slot: string) => Date.parse(slot)

/** A run's slot as a moment: `null` by hand. */
const runSlot = (slot: string | null) => (slot === null ? null : slotOf(slot))

/** A session's card as it runs now: the card of the session that carries it on, through every resume. */
const currentCard = (byId: Map<string, Card>, id: string): Card | undefined => {
  const c = byId.get(id)
  return c?.continuedBy ? currentCard(byId, c.continuedBy.id) : c
}

/** The current cards of a policy's runs that run: a run follows its worker through its resumes. `cards`: every card. */
export const liveRuns = (policy: string, facts: PolicyFacts, cards: Card[]): Card[] => {
  const byId = new Map(cards.map((c) => [c.id, c]))
  const current = facts.runs.filter(([, r]) => r.policy === policy).map(([, r]) => currentCard(byId, r.id))
  return [...new Set(current.filter((c): c is Card => c?.live === true))]
}

/** Whether a slot of a policy has a fact: a run, or a pass. */
export const slotSeen = (policy: string, slot: number, facts: PolicyFacts): boolean => {
  const name = slotName(slot)
  return facts.runs.some(([, r]) => r.policy === policy && r.slot === name) || facts.passes.some(([, p]) => p.policy === policy && p.slot === name)
}

/** The open offer of a policy's facts: its latest offered slot, before the next slot and with no run. */
const openOffer = (header: PolicyHeader, runs: RunFact[], passes: [number, PassFact][], now: number): PolicyView['offer'] => {
  const offered = passes.findLast(([, p]) => p.outcome === 'offered')
  if (!offered) return undefined
  const slot = slotOf(offered[1].slot)
  const until = nextSlot(header.when, slot)
  if (until === undefined || now >= until || runs.some((r) => r.slot === offered[1].slot)) return undefined
  return { slot, since: offered[0], until }
}

/**
 * The views of a floor's policies. `cards`: every card, archived ones too, which a run's worker is looked up among.
 * `canSpawn`: the host runs, so a run can start.
 */
export const policyViews = (project: string, files: PolicyFile[], facts: PolicyFacts, cards: Card[], canSpawn: boolean, now: number): PolicyView[] => {
  const byId = new Map(cards.map((c) => [c.id, c]))
  return files.map(({ id, hash, parsed }): PolicyView => {
    const runs = facts.runs.filter(([, r]) => r.policy === id)
    const passes = facts.passes.filter(([, p]) => p.policy === id)
    const approvals = facts.approvals.filter(([, a]) => a.policy === id)
    const live = liveRuns(id, facts, cards).map((c) => c.id)
    const last = runs.at(-1)
    const passed = passes.at(-1)
    const approval = approvals.findLast(([, a]) => a.hash === hash)
    const slots = [...runs.flatMap(([, r]) => (r.slot ? [slotOf(r.slot)] : [])), ...passes.map(([, p]) => slotOf(p.slot))]
    const header = parsed.ok ? parsed.header : undefined
    const needs: PolicyView['needs'] =
      header && header.start === 'auto' && !approval && approvals.length
        ? { kind: 'reapprove', approved: approvals.at(-1)![1].hash }
        : !header && approvals.length
          ? { kind: 'invalid' }
          : undefined
    const runnable = header !== undefined && header.runner === undefined && canSpawn && live.length < header.live
    return {
      id,
      tag: tagOf(id),
      title: parsed.title,
      hash,
      ...(parsed.ok ? { header: parsed.header, rule: ruleWords(parsed.header.when), next: nextSlot(parsed.header.when, now) } : { problems: parsed.problems }),
      ...(approval && { approved: { at: approval[0], ...(approval[1].by && { by: approval[1].by }) } }),
      live,
      ...(last && { last: { n: runs.length, at: last[0], slot: runSlot(last[1].slot), id: last[1].id, callsign: byId.get(last[1].id)?.callsign } }),
      ...(passed && { passed: { at: passed[0], slot: slotOf(passed[1].slot), outcome: passed[1].outcome, ...(passed[1].check && { check: passed[1].check }) } }),
      ...(slots.length > 0 && { seen: Math.max(...slots) }),
      ...(header && { offer: openOffer(header, runs.map(([, r]) => r), passes, now) }),
      ...(needs && { needs }),
      calls: {
        ...(runnable && { run: ['policy/run', { project, policy: id, start: 'hand' }] }),
        ...(header && !approval && { approve: ['policy/approve', { project, policy: id, hash }] }),
      },
    }
  })
}

/** A floor's open offers, oldest first. */
export const offersOf = (project: string, views: PolicyView[]): Offer[] =>
  views
    .flatMap((v) =>
      v.offer
        ? [{ key: `${v.id}@${v.offer.slot}`, project, policy: v.id, tag: v.tag, title: v.title, ...v.offer, calls: { accept: ['policy/run', { project, policy: v.id, slot: v.offer.slot, start: 'offer' }] as Call<'policy/run'> } }]
        : [],
    )
    .sort((a, b) => a.since - b.since)

/** The run a worker is, by the first session of its lineage. */
export const cardRun = (first: string, files: PolicyFile[], facts: PolicyFacts): CardRun | undefined => {
  const at = facts.runs.findIndex(([, r]) => r.id === first)
  if (at === -1) return undefined
  const run = facts.runs[at][1]
  const n = facts.runs.slice(0, at + 1).filter(([, r]) => r.policy === run.policy).length
  const title = files.find((f) => f.id === run.policy)?.parsed.title
  return {
    policy: run.policy,
    tag: tagOf(run.policy),
    ...(title && { title }),
    n,
    slot: runSlot(run.slot),
    start: run.start,
    ...(run.by && { by: run.by }),
    ...(run.check && { check: run.check }),
  }
}

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

/**
 * A policy's runs, newest first, the latest `limit`. `cards`: every card, archived ones too. `answerOf`: a session's
 * latest answer in full.
 */
export const runsRead = (policy: string, hash: string | undefined, facts: PolicyFacts, cards: Card[], answerOf: (id: string) => string | undefined, limit: number): RunRead[] => {
  const byId = new Map(cards.map((c) => [c.id, c]))
  return facts.runs
    .filter(([, r]) => r.policy === policy)
    .map(([at, r], i): RunRead => {
      const worker = currentCard(byId, r.id)!
      return {
        n: i + 1,
        slot: runSlot(r.slot),
        at,
        hash: r.hash,
        current: r.hash === hash,
        start: r.start,
        ...(r.by && { by: { id: r.by, callsign: byId.get(r.by)?.callsign } }),
        ...(r.check && { check: r.check }),
        worker: {
          id: worker.id,
          callsign: worker.callsign,
          status: worker.status,
          live: worker.live,
          ...(!worker.live && { endedAt: worker.enteredAt }),
          ...(worker.costUsd !== undefined && { cost: worker.costUsd }),
          shown: worker.shown.map((s) => s.target),
          answer: answerOf(worker.id),
        },
      }
    })
    .reverse()
    .slice(0, limit)
}
