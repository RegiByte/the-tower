/**
 * The policies extension (decision `policies`): a floor's `policies` items parsed and hashed, its `runs` and `approvals`
 * streams folded, each policy's view, offers and slots on the floor, the run a card is, and the verbs that append the
 * facts. At each slot the core's loop fires, it decides what the slot gets from the board alone (`decide`), runs the
 * check the policy asks for, then runs or passes the slot through its own verbs, as any other runner would.
 */
import type { Board, Card, Floor } from '../../src/bridge/board.ts'
import { apiError, isApiError, type ApiError, type Replies, type RouteInput } from '../../src/shared/api.ts'
import type { Ask, CallCtx, Part, Reduce, Slot, Start, StreamFact } from '../../src/shared/extensions.ts'
import { ruleWords, slotsBetween, slotWords } from '../../src/shared/slots.ts'
import { tagOf } from '../../src/shared/tags.ts'
import { runCheck } from './check.ts'
import { policiesLines, runsLines } from './cli.ts'
import { checkFound, checkKey, decide, ON_TIME_MS, onTimeSlot, standingWords, type Action } from './client/policies.ts'
import {
  cardRun,
  currentCard,
  liveRuns,
  offersOf,
  policyViews,
  runsRead,
  shortHash,
  slotName,
  slotSeen,
  type ApprovalFact,
  type CardRun,
  type CheckResult,
  type FloorPolicies,
  type Parsed,
  type PassFact,
  type PolicyFacts,
  type PolicyFile,
  type RunFact,
  type RunStart,
} from './policies.ts'
import { hashOf, parsePolicy } from './policy-file.ts'

export const POLICIES = 'policies'
export const RUNS = 'runs'
export const APPROVALS = 'approvals'

/** How long a verb waits for the tower to hold a fact it appended, or a worker it started. */
const TRACK_MS = 5000

/** How often a slot whose run or pass was refused is decided again while it is on time: the tower's loop's tick. */
const RETRY_MS = 30_000

type Runs = { runs: PolicyFacts['runs']; passes: PolicyFacts['passes'] }
type Approvals = { approvals: PolicyFacts['approvals'] }
type OwnStreams = { runs: Runs; approvals: Approvals }

const RUNS_REDUCE: Reduce = {
  init: { runs: [], passes: [] } satisfies Runs,
  step: (state: Runs, [at, code, fact]: StreamFact): Runs =>
    code === 'r' ? { ...state, runs: [...state.runs, [at, fact as RunFact]] } : code === 's' ? { ...state, passes: [...state.passes, [at, fact as PassFact]] } : state,
}

const APPROVALS_REDUCE: Reduce = {
  init: { approvals: [] } satisfies Approvals,
  step: (state: Approvals, [at, code, fact]: StreamFact): Approvals => (code === 'a' ? { approvals: [...state.approvals, [at, fact as ApprovalFact]] } : state),
}

/** A run's input: `slot` with `auto` and `offer`, none `hand`. */
type RunInput = { project: string; policy: string; start: RunStart; slot?: number; by?: string; check?: CheckResult }

const factsOf = ({ runs, approvals }: OwnStreams): PolicyFacts => ({ runs: runs.runs, passes: runs.passes, approvals: approvals.approvals })

/** A policy item's parse: the hash of its bytes, and the file read as a policy. */
type Kept = { hash: string; parsed: Parsed }

const filesOf = (items: { id: string; parsed: unknown }[]): PolicyFile[] => items.map(({ id, parsed }) => ({ id, ...(parsed as Kept) }))

/** What a run knows of itself: its policy, its slot, how it started, and what its check found; `tower whoami` prints it. */
const runLines = (run: CardRun, tz: string | undefined, now: number): string[] => {
  const slot = run.slot === null ? 'with no slot' : `for its slot ${slotWords(run.slot, tz, now)}`
  const found = checkFound(run.check)
  return [
    `You are run ${run.n} of policy "${run.title ?? run.tag}" (${run.tag}), ${slot}, started ${run.start === 'auto' ? 'on its own' : run.start === 'hand' ? 'by hand' : 'from an offer'}.`,
    `\`tower runs\` lists its earlier runs and what each left; \`tower read ${run.tag}\` is the policy. When the policy says nobody watches, end with \`tower home <your callsign>\`.`,
    ...(found ? [`Its check found: ${found}`] : []),
  ]
}

/** Why a policy can't take a fact for `slot`: it isn't valid, another runner acts on it, or `slot` is none of its slots up to now. */
const slotRefusal = (policy: string, parsed: Parsed, slot: number | undefined): ApiError | undefined => {
  if (!parsed.ok) return apiError('refused', `The policy ${tagOf(policy)} is invalid: ${parsed.problems.map((p) => `${p.path}: ${p.message}`).join('; ')}`)
  if (parsed.header.runner !== undefined) return apiError('refused', `The policy ${tagOf(policy)} is left to the runner "${parsed.header.runner}"`)
  if (slot === undefined) return undefined
  if (slot > Date.now()) return apiError('refused', `${slotName(slot)} is still to come`)
  return slotsBetween(parsed.header.when, slot - 1, slot).includes(slot) ? undefined : apiError('invalid', `${slotName(slot)} is not one of the slots of ${tagOf(policy)} (${ruleWords(parsed.header.when)})`)
}

/** Resolves once `holds`, read every 25 ms, or once `ms` pass. */
const until = async (holds: () => boolean, ms: number) => {
  for (const deadline = Date.now() + ms; !holds() && Date.now() < deadline; ) await new Promise((done) => setTimeout(done, 25))
}

/** Resolves after `ms`, or as soon as `signal` aborts. */
const pause = (ms: number, signal: AbortSignal) =>
  new Promise<void>((done) => {
    const timer = setTimeout(done, ms)
    signal.addEventListener('abort', () => (clearTimeout(timer), done()), { once: true })
  })

const floorOf = (board: Board, project: string): Floor | undefined => board.floors.find((f) => f.id === project)

/** The policies extension's part of a floor, as the board holds it. */
export const policiesOf = (floor: Floor | undefined): FloorPolicies | undefined => floor?.x?.policies as FloorPolicies | undefined

const start: Start = (ctx) => {
  const facts = (project: string): PolicyFacts => factsOf({ runs: ctx.own.streams(RUNS, project) as Runs, approvals: ctx.own.streams(APPROVALS, project) as Approvals })

  /** A policy's file as it is now: its text's hash and its parse. */
  const fileOf = async (project: string, policy: string): Promise<Kept | ApiError> => {
    if (!ctx.collections.list(project, POLICIES).some((i) => i.id === policy)) return apiError('not_found', `${project}/${POLICIES} holds no policy "${policy}"`)
    const text = await ctx.collections.read(project, POLICIES, policy)
    return { hash: hashOf(text), parsed: parsePolicy(text) }
  }

  /** A policy's runs, passes and approvals are taken one at a time, each until the tower holds its fact. */
  const turns = new Map<string, Promise<unknown>>()
  const onPolicy = <T>(project: string, policy: string, act: () => Promise<T>): Promise<T> => {
    const key = `${project}/${policy}`
    const run = (turns.get(key) ?? Promise.resolve()).then(act)
    const settled = run.catch(() => undefined)
    turns.set(key, settled)
    void settled.then(() => turns.get(key) === settled && turns.delete(key))
    return run
  }

  /** `act`, when `by` names a session the tower knows, or none. */
  const fromWorker = <T>(by: string | undefined, act: () => Promise<T>): Promise<T | ApiError> => {
    if (by === undefined) return act()
    try {
      ctx.own.facts(by)
    } catch {
      return Promise.resolve(apiError('not_found', `No session "${by}"`))
    }
    return act()
  }

  /** Appends a fact to a project's stream of this extension's, and resolves once the tower folds it, so the next request reads it. */
  const append = async (project: string, stream: string, code: string, fact: object, held: (facts: PolicyFacts) => boolean) => {
    await ctx.streams.append(stream, { project }, code, fact)
    await until(() => held(facts(project)), TRACK_MS)
  }

  /**
   * A run of a policy: its file parsed now, a worker spawned on its prose with its `hire` through `tower/spawn`, and the
   * run fact appended. A worker whose fact can't be appended is killed, so no run goes uncounted; the run is taken once
   * the board holds its worker, so the next run counts it as live.
   */
  const run = (input: RunInput, call: CallCtx['call']) => {
    const { project, policy, by, check } = input
    if ((input.start === 'hand') !== (input.slot === undefined))
      return Promise.resolve(apiError('invalid', input.start === 'hand' ? 'slot: a run by hand takes no slot' : `slot: a run that starts ${input.start === 'auto' ? 'on its own' : 'from an offer'} names its slot`))
    const [slot, startFact] = input.start === 'hand' ? [undefined, { start: 'hand', slot: null } as const] : [input.slot!, { start: input.start, slot: slotName(input.slot!) } as const]
    return fromWorker(by, () =>
      onPolicy(project, policy, async (): Promise<Replies['policy/run'] | ApiError> => {
        const file = await fileOf(project, policy)
        if ('t' in file) return file
        const refused = slotRefusal(policy, file.parsed, slot)
        if (refused) return refused
        const { header, prompt } = file.parsed as Extract<Parsed, { ok: true }>
        if (input.start === 'auto' && !facts(project).approvals.some(([, a]) => a.policy === policy && a.hash === file.hash))
          return apiError('refused', `${tagOf(policy)} is not approved as it is now (${shortHash(file.hash)}): it starts on its own only on approved words`)
        if (slot !== undefined && facts(project).runs.some(([, r]) => r.policy === policy && r.slot === slotName(slot))) return apiError('refused', `${tagOf(policy)} already ran for ${slotName(slot)}`)
        const board = ctx.board()
        if (!board.hostUp) return apiError('unavailable', 'No host runs, so no worker can start: the user starts it with `tower up`')
        const live = liveRuns(policy, facts(project), floorOf(board, project)?.cards ?? [])
        if (live.length >= header.live) return apiError('limited', `${live.map((c) => c.callsign).join(', ')} still run${live.length === 1 ? 's' : ''}: ${tagOf(policy)} runs at most ${header.live} at once (its \`live\`)`)
        const answer = (await call('tower/spawn', { project, ...header.hire, prompt })) as Replies['spawn'] | ApiError
        if (isApiError(answer)) return answer
        const { id } = answer
        const fact: RunFact = { policy, hash: file.hash, id, ...(by && { by }), ...(check && { check }), ...startFact }
        try {
          await append(project, RUNS, 'r', fact, (held) => held.runs.some(([, r]) => r.id === id))
        } catch (err) {
          await call('tower/kill', { id })
          return apiError('internal', `Session ${id} started but its run couldn't be recorded, so it was killed (it can be resumed): ${(err as Error).message}`)
        }
        await until(() => floorOf(ctx.board(), project)?.cards.some((c) => c.id === id) ?? false, TRACK_MS)
        return { t: 'ran', id, n: facts(project).runs.filter(([, r]) => r.policy === policy).length, hash: file.hash }
      }),
    )
  }

  /** A slot the runner saw and didn't start, and why: refused once the slot has a fact. */
  const pass = ({ project, policy, slot, outcome, check }: RouteInput['policy/pass']) =>
    onPolicy(project, policy, async () => {
      const file = await fileOf(project, policy)
      if ('t' in file) return file
      const refused = slotRefusal(policy, file.parsed, slot)
      if (refused) return refused
      if (slotSeen(policy, slot, facts(project))) return apiError('refused', `${slotName(slot)} of ${tagOf(policy)} already has a fact`)
      const fact: PassFact = { policy, hash: file.hash, slot: slotName(slot), outcome, ...(check && { check }) }
      await append(project, RUNS, 's', fact, (held) => slotSeen(policy, slot, held))
      return { t: 'ok' }
    })

  /** An approval of the words the approver read: refused unless `hash` is the file's now. */
  const approve = ({ project, policy, hash, by }: RouteInput['policy/approve']) =>
    fromWorker(by, () =>
      onPolicy(project, policy, async () => {
        const file = await fileOf(project, policy)
        if ('t' in file) return file
        if (file.hash !== hash) return apiError('refused', `${tagOf(policy)} changed since it was read: its hash is ${shortHash(file.hash)} now, not ${shortHash(hash)}. Read it again, then approve what you read`)
        if (!file.parsed.ok) return apiError('refused', `The policy ${tagOf(policy)} is invalid: ${file.parsed.problems.map((p) => `${p.path}: ${p.message}`).join('; ')}`)
        const count = facts(project).approvals.length
        const fact: ApprovalFact = { policy, hash, ...(by && { by }) }
        await append(project, APPROVALS, 'a', fact, (held) => held.approvals.length > count)
        return { t: 'ok' }
      }),
    )

  /** A policy's runs, newest first, each worker as it is now, the floor's archive included, with its latest answer in full. */
  const runs = async (project: string, policy: string, limit: number) => {
    const held = facts(project)
    const hash = (ctx.own.collections(project, POLICIES).find((i) => i.id === policy)?.parsed as Kept | undefined)?.hash
    if (hash === undefined && !held.runs.some(([, r]) => r.policy === policy)) return apiError('not_found', `${project} has no policy "${policy}", and no runs of one`)
    const floor = floorOf(ctx.board(), project)
    const archived = floor?.archived ? ((await ctx.read('tower/archive/<project>', { project })) as Card[]) : []
    const cards = [...(floor?.cards ?? []), ...archived]
    const workers = held.runs.filter(([, r]) => r.policy === policy).slice(-limit).flatMap(([, r]) => currentCard(cards, r.id) ?? [])
    const answers = new Map(
      await Promise.all(
        workers.map(async (w) => {
          const briefs = (await ctx.read('tower/conversations/<id>', { id: w.id })) as { session: { id: string }; answer?: string }[]
          return [w.id, briefs.filter((b) => b.session.id === w.id).findLast((b) => b.answer !== undefined)?.answer] as const
        }),
      ),
    )
    return runsRead(policy, hash, held, cards, answers, limit)
  }

  /**
   * What the CLI prints of a floor's policies: `tower policies`' lines and where each policy stands, by id, and with
   * `policy`, `tower runs`' lines for its latest `runs`.
   */
  const said = async (project: string, policy: string | undefined, limit: number) => {
    const board = ctx.board()
    const floor = floorOf(board, project)
    const { policies } = policiesOf(floor) ?? { policies: [] }
    const archived = floor?.archived ? ((await ctx.read('tower/archive/<project>', { project })) as Card[]) : []
    const now = Date.now()
    const told = { lines: policiesLines(board, policies, [...(floor?.cards ?? []), ...archived], now), standing: Object.fromEntries(policies.map((p) => [p.id, standingWords(p, board, now)])) }
    if (policy === undefined) return told
    const read = await runs(project, policy, limit)
    return isApiError(read) ? read : { ...told, runs: runsLines(policy, policies.find((p) => p.id === policy), read, now) }
  }

  /** The checks run for each slot, by `policy@slot`, until their slots are past. */
  const checked = new Map<string, CheckResult>()
  const forgetPast = () => {
    for (const key of checked.keys()) if (Date.now() - Number(key.slice(key.lastIndexOf('@') + 1)) > ON_TIME_MS + RETRY_MS) checked.delete(key)
  }

  /** What a slot's decision does: a run or a pass through the verbs, each refusal in the tower's log. */
  const act = async (project: string, action: Exclude<Action, { t: 'check' }>, call: CallCtx['call']) => {
    const reply =
      action.t === 'run'
        ? await call('policies/run', { project, policy: action.policy, start: 'auto', slot: action.slot, ...(action.check && { check: action.check }) })
        : await call('policies/pass', { project, policy: action.policy, slot: action.slot, outcome: action.outcome, ...(action.check && { check: action.check }) })
    if (isApiError(reply)) ctx.log(`${project}/${action.policy} ${action.t} at ${new Date(action.slot).toISOString()}: ${reply.message}`)
    return !isApiError(reply)
  }

  /**
   * One decision of a policy's due slot on the board as it is: its check first, then what it decides once the check
   * ran. `true` once the slot is done with: decided to nothing, or its run or pass taken.
   */
  const decideOnce = async (project: string, policy: string, call: CallCtx['call']): Promise<boolean> => {
    const view = (board: Board) => policiesOf(floorOf(board, project))?.policies.filter((p) => p.id === policy) ?? []
    const first = decide({ policies: view(ctx.board()) }, checked, Date.now())
    const hub = floorOf(ctx.board(), project)?.hub
    for (const a of first) if (a.t === 'check' && hub) checked.set(checkKey(a.policy, a.slot), await runCheck(ctx.run, a.line, hub))
    const actions = decide({ policies: view(ctx.board()) }, checked, Date.now()).filter((a): a is Exclude<Action, { t: 'check' }> => a.t !== 'check')
    if (!actions.length) return true
    let done = true
    for (const a of actions) done = (await act(project, a, call)) && done
    return done
  }

  /**
   * A policy's slot, fired by the core's loop once: decided, and decided again every 30 s while a refusal leaves it
   * undone and it is on time, as the loop's own ticks did.
   */
  const slot = async ({ key, at, project }: Slot, { call }: CallCtx) => {
    if (key === undefined || project === undefined) return
    const whenOf = () => policiesOf(floorOf(ctx.board(), project))?.policies.find((p) => p.id === key)?.header?.when
    try {
      while (!ctx.signal.aborted && !(await decideOnce(project, key, call))) {
        await pause(RETRY_MS, ctx.signal)
        const when = whenOf()
        if (!when || onTimeSlot(when, Date.now()) !== at) return
      }
    } finally {
      forgetPast()
    }
  }

  return {
    parse: { [POLICIES]: (text: string): Kept => ({ hash: hashOf(text), parsed: parsePolicy(text) }) },
    reduce: { [RUNS]: RUNS_REDUCE, [APPROVALS]: APPROVALS_REDUCE },
    folds: {
      card: (card: Card, { now, own }): Part => {
        const files = filesOf(own.collections[POLICIES] ?? [])
        const run = cardRun(card.lineage[0].id, files, factsOf(own.streams as OwnStreams))
        if (!run) return {}
        const file = files.find((f) => f.id === run.policy)
        return { x: { run }, lines: runLines(run, file?.parsed.ok ? file.parsed.header.when.tz : undefined, now) }
      },
      floor: (floor: Floor, { now, board, own }): Part => {
        const views = policyViews(floor.id, filesOf(own.collections[POLICIES] ?? []), factsOf(own.streams as OwnStreams), floor.cards, board.hostUp, now)
        const offers = offersOf(floor.id, views)
        const asks = offers.map(
          (o): Ask => ({
            key: o.key,
            subject: `item.${POLICIES}:${floor.id}/${o.policy}`,
            title: o.title ?? o.tag,
            since: o.since,
            until: o.until,
            sound: 'offer',
            actions: [{ verb: o.calls.accept[0], call: o.calls.accept[1] }],
          }),
        )
        const slots = views.flatMap((v) => (v.header && v.header.runner === undefined ? [{ key: v.id, when: v.header.when }] : []))
        return { x: { policies: views, offers } satisfies FloorPolicies, ...(slots.length && { slots }), ...(asks.length && { asks }) }
      },
    },
    verbs: {
      run: (input: RunInput, { call }: CallCtx) => run(input, call),
      pass: (input: RouteInput['policy/pass']) => pass(input),
      approve: (input: RouteInput['policy/approve']) => approve(input),
    },
    reads: {
      'runs/<project>': ({ params, query }: { params: Record<string, string>; query: { policy: string; limit?: string } }) => runs(params.project, query.policy, query.limit === undefined ? 20 : Number(query.limit)),
      'said/<project>': ({ params, query }: { params: Record<string, string>; query: { policy?: string; runs?: string } }) => said(params.project, query.policy, query.runs === undefined ? 5 : Number(query.runs)),
    },
    slots: { '*': slot },
  }
}

export default start
