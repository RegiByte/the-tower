/**
 * Policies' facts, written only by the policies extension to each project's streams (`runs` and `approvals`, kept in
 * the folders `streams/projects/<project>/runs/` and `approvals/`), and what its folds derive from them and the floor's
 * `policies` items: each policy's view, the open offers, and the run a card is. Nothing about a policy is stored
 * beside these facts (decision `policies`).
 */
import type { Card } from '/lib/board.js'
import type { Replies, StreamFact, Verbs } from '/lib/extension.js'
import { nextSlot, ruleWords } from '/lib/time.js'
import { tagOf } from '/lib/words.js'

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

/** Where a run's worker starts and on what model: four of the spawn verb's fields, checked by `policy-file.ts`. */
export type Hire = { cwd?: string; cut?: { name?: string; branch?: string; base?: string; from?: string }; model?: string; effort?: string }

/** A policy's header, its defaults filled in. */
export type PolicyHeader = {
  /** Its slots, as crons. */
  when: { cron: string[]; tz?: string }
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

/** What an offer says of its slot, its calls aside. */
export type OfferFields = { key: string; project: string; policy: string; tag: string; title?: string; slot: number; since: number; until: number; check?: CheckResult }

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

/**
 * `r` in `runs`: a worker started for a policy. `policy` is its item id; `hash` the file's as it ran; `slot` an ISO
 * instant, `null` by hand; `id` the worker's session; `by` the session that accepted or started it (absent: the user,
 * or the runner for `auto`); `check` the check that let it run.
 */
export type RunFact = { policy: string; hash: string; id: string; by?: string; check?: CheckResult } & ({ start: 'hand'; slot: null } | { start: 'auto' | 'offer'; slot: string })

/** `s` in `runs`: a slot the runner saw and didn't start, and why. */
export type PassFact = { policy: string; hash: string; slot: string; outcome: Outcome; check?: CheckResult }

/** `a` in `approvals`: a policy's hash approved for the runner to start on its own. `by`: the approving worker's session (absent: the user). */
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

/** A policy item as its collection's parse holds it: the hash of its bytes, and its parse. */
export type PolicyFile = { id: string; hash: string; parsed: Parsed }

/** The verbs a policy's and an offer's calls name: the extension's own. */
export const VERB_NAMES = { run: 'policies/run', approve: 'policies/approve' } as const

/** A verb offered now, with its call. */
type Action<V extends string, C> = { [K in V]: K extends keyof C ? { verb: K; call: Exclude<C[K], undefined> } : { verb: K } }[V]

/** A policy's or an offer's `actions`, and the same as `calls` for the renderers that read those. */
const calledOffers = <V extends string, C>(actions: Action<V, C>[]) => ({
  calls: Object.fromEntries(actions.flatMap((a) => ('call' in a ? [[a.verb, a.call]] : []))) as C,
  actions,
})

/** `run` starts a run of a policy now, by hand, while it may (`runnable`); `approve` approves its current hash, until approved. */
export type PolicyVerb = 'run' | 'approve'
export type PolicyCalls = { run?: ['policies/run', Partial<Verbs['policy/run']>]; approve?: ['policies/approve', Partial<Verbs['policy/approve']>] }
export type PolicyAction = Action<PolicyVerb, PolicyCalls>

/** What the extension's verbs `policies/run` and `policies/approve` answer. */
export type PolicyReplies = { 'policies/run': Replies['policy/run']; 'policies/approve': Replies['policy/approve'] }

/** `accept` starts the run an open offer's slot offers. */
export type OfferVerb = 'accept'
export type OfferCalls = { accept: ['policies/run', Partial<Verbs['policy/run']>] }
export type OfferAction = Action<OfferVerb, OfferCalls>

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

/**
 * A slot offered and not yet taken, open until the policy's next slot. `key`: `policy@slot`. `check`: what the check
 * found, which the run accepting it records.
 */
export type Offer = OfferFields & { calls: OfferCalls; actions: OfferAction[] }

/** The policies extension's part of a floor: its policies, in id order, and its open offers, oldest first. */
export type FloorPolicies = { policies: PolicyView[]; offers: Offer[] }

const slotOf = (slot: string) => Date.parse(slot)

/** A run's slot as a moment: `null` by hand. */
const runSlot = (slot: string | null) => (slot === null ? null : slotOf(slot))

/** The card a session's worker runs as now, among `cards`: the one whose lineage holds it, carried on by none. */
export const currentCard = (cards: Card[], id: string): Card | undefined => cards.find((c) => !c.continuedBy && c.lineage.some((s) => s.id === id))

/** A session's callsign, among `cards`: its own card's, else the card of the worker it ran as. */
const callsignOf = (cards: Card[], id: string): string | undefined => (cards.find((c) => c.id === id) ?? cards.find((c) => c.lineage.some((s) => s.id === id)))?.callsign

/** The current cards of a policy's runs that run: a run follows its worker through its resumes. `cards`: those a live worker is among. */
export const liveRuns = (policy: string, facts: PolicyFacts, cards: Card[]): Card[] => {
  const current = facts.runs.filter(([, r]) => r.policy === policy).map(([, r]) => currentCard(cards, r.id))
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
  return { slot, since: offered[0], until, ...(offered[1].check && { check: offered[1].check }) }
}

/**
 * The slot a policy's latest pass held, while it is open (before the policy's next slot) and live is still full: that
 * slot and the runs that hold it. It clears when the slot passes or a holder ends.
 */
const heldSlot = (header: PolicyHeader, runs: [number, RunFact][], passes: [number, PassFact][], cards: Card[], live: string[], now: number): { kind: 'held'; slot: number; by: HeldBy[] } | undefined => {
  const passed = passes.at(-1)
  if (passed?.[1].outcome !== 'held') return undefined
  const slot = slotOf(passed[1].slot)
  const until = nextSlot(header.when, slot)
  if (until === undefined || now >= until) return undefined
  const by = runs.flatMap(([at, r], i): HeldBy[] => {
    const worker = currentCard(cards, r.id)
    return worker && live.includes(worker.id) ? [{ n: i + 1, id: worker.id, callsign: worker.callsign, since: at }] : []
  })
  return by.length >= header.live ? { kind: 'held', slot, by } : undefined
}

const validNeeds = (header: PolicyHeader, approval: [number, ApprovalFact] | undefined, approvals: [number, ApprovalFact][], runs: [number, RunFact][], passes: [number, PassFact][], cards: Card[], live: string[], now: number): ValidPolicy['needs'] =>
  header.start === 'auto' && !approval && approvals.length ? { kind: 'reapprove', approved: approvals.at(-1)![1].hash } : heldSlot(header, runs, passes, cards, live, now)

/**
 * The views of a floor's policies. `cards`: the floor's, which a run's live worker is looked up among. `callsignOf`: any session's worker's name. `canSpawn`: the host runs, so a run can start.
 */
export const policyViews = (project: string, files: PolicyFile[], facts: PolicyFacts, cards: Card[], callsignOf: (session: string) => string | undefined, canSpawn: boolean, now: number): PolicyView[] =>
  files.map(({ id, hash, parsed }): PolicyView => {
    const runs = facts.runs.filter(([, r]) => r.policy === id)
    const passes = facts.passes.filter(([, p]) => p.policy === id)
    const approvals = facts.approvals.filter(([, a]) => a.policy === id)
    const live = liveRuns(id, facts, cards).map((c) => c.id)
    const last = runs.at(-1)
    const passed = passes.at(-1)
    const approval = approvals.findLast(([, a]) => a.hash === hash)
    const slots = [...runs.flatMap(([, r]) => (r.slot ? [slotOf(r.slot)] : [])), ...passes.map(([, p]) => slotOf(p.slot))]
    const header = parsed.ok ? parsed.header : undefined
    const needs = parsed.ok ? validNeeds(parsed.header, approval, approvals, runs, passes, cards, live, now) : undefined
    const body: ValidPolicy | InvalidPolicy = parsed.ok
      ? { header: parsed.header, rule: ruleWords(parsed.header.when), next: nextSlot(parsed.header.when, now), ...(needs && { needs }) }
      : { problems: parsed.problems, ...(approvals.length && { needs: { kind: 'invalid' as const } }) }
    const runnable = header !== undefined && header.runner === undefined && canSpawn && live.length < header.live
    return {
      id,
      tag: tagOf(id),
      title: parsed.title,
      hash,
      ...body,
      ...(approval && { approved: { at: approval[0], ...(approval[1].by && { by: approval[1].by }) } }),
      live,
      ...(last && { last: { n: runs.length, at: last[0], slot: runSlot(last[1].slot), id: last[1].id, callsign: callsignOf(last[1].id) } }),
      ...(passed && { passed: { at: passed[0], slot: slotOf(passed[1].slot), outcome: passed[1].outcome, ...(passed[1].check && { check: passed[1].check }) } }),
      ...(slots.length > 0 && { seen: Math.max(...slots) }),
      ...(header && { offer: openOffer(header, runs.map(([, r]) => r), passes, now) }),
      ...calledOffers<PolicyVerb, PolicyCalls>([
        ...(runnable ? [{ verb: 'run' as const, call: [VERB_NAMES.run, { project, policy: id, start: 'hand' }] as NonNullable<PolicyCalls['run']> }] : []),
        ...(header && !approval ? [{ verb: 'approve' as const, call: [VERB_NAMES.approve, { project, policy: id, hash }] as NonNullable<PolicyCalls['approve']> }] : []),
      ]),
    }
  })

/** A floor's open offers, oldest first. */
export const offersOf = (project: string, views: PolicyView[]): Offer[] =>
  views
    .flatMap((v) =>
      v.offer
        ? [{ key: `${v.id}@${v.offer.slot}`, project, policy: v.id, tag: v.tag, title: v.title, ...v.offer, ...calledOffers<OfferVerb, OfferCalls>([{ verb: 'accept', call: [VERB_NAMES.run, { project, policy: v.id, slot: v.offer.slot, start: 'offer', ...(v.offer.check && { check: v.offer.check }) }] }]) }]
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
    ...(run.by && { by: run.by }),
    ...(run.check && { check: run.check }),
    ...(run.start === 'hand' ? { start: run.start, slot: null } : { start: run.start, slot: slotOf(run.slot) }),
  }
}

/**
 * A policy's runs, newest first, the latest `limit`. `cards`: every card, archived ones too. `answers`: each run's
 * worker's latest answer in full, by its current session.
 */
export const runsRead = (policy: string, hash: string | undefined, facts: PolicyFacts, cards: Card[], answers: Map<string, string | undefined>, limit: number): RunRead[] =>
  facts.runs
    .filter(([, r]) => r.policy === policy)
    .map(([at, r], i): RunRead => {
      const worker = currentCard(cards, r.id)!
      return {
        n: i + 1,
        slot: runSlot(r.slot),
        at,
        hash: r.hash,
        current: r.hash === hash,
        start: r.start,
        ...(r.by && { by: { id: r.by, callsign: callsignOf(cards, r.by) } }),
        ...(r.check && { check: r.check }),
        worker: {
          id: worker.id,
          callsign: worker.callsign,
          status: worker.status,
          live: worker.live,
          ...(!worker.live && { endedAt: worker.enteredAt }),
          ...(worker.costUsd !== undefined && { cost: worker.costUsd }),
          shown: worker.shown.map((s) => s.target),
          answer: answers.get(worker.id),
        },
      }
    })
    .reverse()
    .slice(0, limit)
