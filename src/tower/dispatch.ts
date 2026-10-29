/**
 * The verbs: every command's handler, each composed over the config, the live system and the board, and the state
 * verbs keep while they run (hires and resumes taken in turn, workers departing). `mux/*` belong to the HTTP server.
 * Every verb is called through `call`, the one dispatch, by its qualified name (`tower/spawn`, `chime/ring`), with its
 * caller: the core's here, an extension's through `calls.ts`. A composite that does what another verb does calls it
 * through `call` too, with its own verb in the caller's `within`, so whatever guards a verb sees every act of it.
 */
import { defineResource, type StartedResource } from 'braided'
import { z } from 'zod'
import { existsSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { archiveLog, archiveStream } from '../archive.ts'
import { occupantsOf, type TidyPlan } from '../bridge/board.ts'
import { carriesOn, continues, heldBy, heldCallsigns, lineage, resumeName, runsAs } from '../bridge/chains.ts'
import { HIRED, KEYED_BY, KILLED_BY, leavesNow, LET_GO, PROMPTED_BY, type Session } from '../bridge/facts.ts'
import { coreFacts, fieldFacts, forkFacts, mergeParts, placeable, takenEnv, takenFlags, type Contribution, type Merged } from '../bridge/launch.ts'
import type { Prune } from '../bridge/prunable.ts'
import type { Resource } from '../bridge/resources.ts'
import { collectionOn, ownedRefusal, sessionFacts, type FloorCollectionType } from '../bridge/stores.ts'
import { createItem, deleteItem, itemPath, itemVersion, restoreItem, writeItem } from '../collections.ts'
import { hostRequest, reap, revealInFinder, runEditor, submitText, termsRequest } from '../machine.ts'
import { apiError, isApiError, ROUTES, VERBS, type ApiError, type Replies, type Route, type RouteInput } from '../shared/api.ts'
import { callsignRefused, freshId, nameIn, typedCallsign } from '../shared/callsign.ts'
import { callOf, can, hireRefusal, workerNamed } from '../shared/cards.ts'
import { newSessionId, resumeRequest, spawnRequest, worktreeBrief, type Launch, type SpawnLaunch } from '../shared/launch.ts'
import { LEGACY_VERBS, legacyNamed, legacyReviewer, type Launched } from '../bridge/legacy.ts'
import { nestedIn, qualifiedOf, tooDeep, type Caller, type LaunchRequest, type SessionFact } from '../shared/extensions.ts'
import {
  callsignsOf,
  ConfigError,
  configuredUser,
  editorArgv,
  outsideProject,
  projectCollections,
  projectDirs,
  projectPlugins,
  sessionDirs,
  worktreeName,
  worktreePath,
  worktreesConfig,
  type Config,
  type EditorAction,
  type ModEvent,
  type Project,
  type Runtime,
} from '../shared/model.ts'
import { projectCollectionsPath } from '../shared/paths.ts'
import { sessionKeys, type FromHost, type ToHost } from '../shared/protocol.ts'
import { REVIEWS } from '../shared/reviews.ts'
import { SHELL_SIZE, type FromTerms, type ToTerms } from '../shared/terms.ts'
import { briefFor, cut, deleteBranch, discard, discardable, fork, linkedSources, nameIsFree, pruneWorktree, recutBranch, recutWorktree, removeWorktree, rollback, tidyable, WorktreeError } from '../worktrees.ts'
import { errorOf, OK, type Answer } from './answers.ts'
import { extensionCalls } from './calls.ts'
import { chainCalls } from './chains.ts'
import { UnsettledError, type ExtensionsResource } from './extensions.ts'
import { PUBLISH_DEBOUNCE_MS, type PublisherResource } from './publisher.ts'
import type { ConfigResource, SystemResource } from './spine.ts'

/** How long a spawn waits for the host to write its session's header; the host opens the log as it answers. */
const TRACK_TIMEOUT_MS = 5000

/** The verbs a dispatch handles: all but the mux's, which hold HTTP connections. */
export type Verb = Exclude<Route, 'mux/watch' | 'mux/unwatch'>

/** Whether the config declares the collection for the project. */
export const isDeclaredIn = (config: Config, project: string, collection: string): boolean =>
  Object.hasOwn(config.projects, project) && Object.hasOwn(projectCollections(config, project), collection)


type Deps = {
  'core:config': ConfigResource
  'core:system': SystemResource
  'core:publisher': PublisherResource
  'core:extensions': ExtensionsResource
}

const isVerb = (name: string): name is Verb => Object.hasOwn(VERBS, name)

/** What a spawn's launch must pass just before it starts, given what its contributors exempted it from: a hire's limits. */
type Gate = (launched: Launched) => Promise<ApiError | undefined>

/** A spawn's extension fields by capability, the facts they are logged as, and its gate. */
type Spawn = { fields: Map<string, Record<string, unknown>>; facts: ModEvent[]; gate: Gate }

export const dispatch = defineResource({
  dependencies: ['core:config', 'core:system', 'core:publisher', 'core:extensions'],
  start: ({ 'core:config': { paths, read: readConfig }, 'core:system': system, 'core:publisher': { board: boardOf, everyCard }, 'core:extensions': holder }: Deps) => {


    /** The branches a verb kept, each with why, when it kept any. */
    const keptOf = (kept: string[]) => (kept.length ? { kept } : {})

    /** A daemon that answers no refuses, or says what it doesn't know; one that doesn't answer is unavailable. */
    async function daemon(ask: () => Promise<FromHost | FromTerms>): Promise<Answer> {
      try {
        const reply = await ask()
        return reply.t === 'error' ? apiError('code' in reply && reply.code ? reply.code : 'refused', reply.message) : reply
      } catch (err) {
        return apiError('unavailable', (err as Error).message)
      }
    }

    /**
     * A host older than `SPAWN_FACTS_PROTOCOL` reads past a spawn's `facts`: the session would start without them. A
     * spawn answers once the system tracks its session, so whoever it answers reads the session by its id.
     */
    async function host(msg: ToHost): Promise<Answer> {
      const refused = msg.t === 'spawn' && msg.facts?.length ? olderHost(SPAWN_FACTS_PROTOCOL, 'start a worker with its facts') : undefined
      if (refused) return refused
      const answer = await daemon(() => hostRequest(paths, msg))
      void system.refreshLive()
      if (msg.t === 'spawn' && answer.t === 'spawned') await system.tracked(msg.id, TRACK_TIMEOUT_MS)
      return answer
    }

    async function terms(msg: ToTerms): Promise<Answer> {
      const answer = await daemon(() => termsRequest(paths, msg))
      void system.refreshShells()
      return answer
    }

    const withSession = (id: string, act: () => Answer | Promise<Answer>) =>
      system.session(id) ? act() : apiError('not_found', `No session "${id}"`)

    /** The host protocol that first takes `fact`. */
    const FACT_PROTOCOL = 2

    /** The host protocol that first logs a spawn's `facts`. */
    const SPAWN_FACTS_PROTOCOL = 3

    /** Why the running host, older than protocol `needs`, can't do something, so a verb that needs it refuses before it does anything. */
    const olderHost = (needs: number, doing: string): ApiError | undefined => {
      const live = system.live()
      if (!live) return undefined
      const protocol = live.protocol ?? 0
      return protocol < needs
        ? apiError('unavailable', `The running host is too old to ${doing} (protocol ${protocol}, this tower needs ${needs}): restart it with tower down host, then tower up (its running sessions stop, each resumable)`)
        : undefined
    }

    /** Why the running host can't append a `tower.*` fact. */
    const factRefused = (doing: string) => olderHost(FACT_PROTOCOL, doing)

    /** Only a card that offers `let-go` is let go: stranded, on duty, its latest conversation not yet resumed. */
    const letGo = (id: string) =>
      withSession(id, () => {
        const refused = factRefused('let a worker go')
        if (refused) return refused
        return boardOf().floors.some((f) => f.cards.some((c) => c.id === id && can(c, 'let-go')))
          ? host({ t: 'fact', id, fact: { hook_event_name: LET_GO } })
          : apiError('refused', `Session "${id}" is not stranded on duty: only a stranded worker (stopped, killed or lost), waiting to be resumed, is let go`)
      })

    /** A fact a running worker logs about its own session, as `tower.<name>`: what it put in front of the user, kept, or that it leaves. */
    const logFact = (fact: RouteInput['fact'], caller: Caller) => {
      const id = caller.t === 'worker' ? caller.id : undefined
      if (!id || !system.live()?.ids.has(id)) return apiError('refused', 'A fact is about the caller\'s own session: only a running worker logs one')
      return factRefused('log a fact') ?? host({ t: 'fact', id, fact: { hook_event_name: `tower.${fact.name}`, ...('value' in fact && fact.value) } })
    }

    /** A worker's act on a session is named in the session's log before it lands: the user's acts are the rest. */
    const actedBy = (id: string, act: string, by: string) => host({ t: 'fact', id, fact: { hook_event_name: act, by } })

    const PROMPT_FROM_WORKER = 'name the worker a prompt comes from'

    const fromWorker = (by: string | undefined, act: () => Answer | Promise<Answer>) =>
      by === undefined || system.session(by) ? act() : apiError('not_found', `No session "${by}"`)

    /** `act` runs once `fact` names `by` in the session's log, when `by` is given. */
    const namedFirst = (id: string, fact: string, by: string | undefined, doing: string, act: () => Answer | Promise<Answer>) =>
      fromWorker(by, async () => {
        const named = by ? (factRefused(doing) ?? (await actedBy(id, fact, by))) : OK
        return named.t === 'error' ? named : act()
      })

    const submit = (id: string, text: string, by: string | undefined) =>
      withSession(id, () => namedFirst(id, PROMPTED_BY, by, PROMPT_FROM_WORKER, () => daemon(() => submitText(paths, id, text))))

    /** Only a running session's kill is named: the host refuses the rest. */
    const kill = (id: string, by: string | undefined) =>
      withSession(id, () =>
        namedFirst(id, KILLED_BY, system.live()?.ids.has(id) ? by : undefined, 'name the worker that kills a session', () => host({ t: 'kill', id })),
      )

    /** The workers being sent home because they asked to, by session id: each is sent once while it is leaving. */
    const departing = new Set<string>()

    /**
     * A leaving worker whose turn has completed goes home through its card's `send-home`, each kill named as its own
     * act: everyone under it that runs, then itself.
     */
    const sendLeaversHome = () => {
      const live = system.live()?.ids
      if (!departing.size && !system.sessions().some((s) => live?.has(s.header.id) && leavesNow(s.facts))) return
      const cards = everyCard(Date.now())
      for (const id of departing) if (!cards.some((c) => c.id === id && c.leaving)) departing.delete(id)
      for (const c of cards.filter((c) => c.leaving && !departing.has(c.id) && leavesNow(system.session(c.id)!.facts))) {
        departing.add(c.id)
        const calls = callOf(c, 'send-home')
        if (!calls) {
          console.error(`${c.callsign} asked to go home, and its card offers no send-home`)
          continue
        }
        void (async () => {
          for (const [verb, body] of calls) {
            const answer = await call(`tower/${verb}`, { ...body, by: c.id }, { t: 'worker', id: c.id, via: 'loop', within: [] })
            if (answer.t === 'error') console.error(`${c.callsign} asked to go home, and killing ${body.id} failed: ${(answer as ApiError).message}`)
          }
        })()
      }
    }

    /** A worker's keys are named once per burst: again when another worker typed last, or after a minute. */
    const KEYS_BURST_MS = 60_000

    const inBurst = ({ header, facts }: Session, by: string, now: number) =>
      facts.keyedBy !== undefined && facts.keyedBy[1] === by && now - (header.startedAt + facts.keyedBy[0] * 1000) < KEYS_BURST_MS

    /** The fact is folded before the keys are typed, so the next request of the burst reads it. */
    const keyedBy = async (id: string, by: string) => {
      const before = system.session(id)!.facts.keyedBy
      const named = await actedBy(id, KEYED_BY, by)
      if (named.t !== 'error') await system.until(() => system.session(id)!.facts.keyedBy !== before, TRACK_TIMEOUT_MS)
      return named
    }

    const keys = (id: string, data: string, by: string | undefined) =>
      withSession(id, () =>
        fromWorker(by, async () => {
          const typed = sessionKeys(data)
          if (!typed) return OK
          const named = by && !inBurst(system.session(id)!, by, Date.now()) ? (factRefused('name the worker that types keys') ?? (await keyedBy(id, by))) : OK
          return named.t === 'error' ? named : host({ t: 'write', id, data: typed })
        }),
      )

    /** A worker spawned on a prompt by another: its first prompt is that worker's. */
    const spawnedBy = (spawning: () => Answer | Promise<Answer>, prompt: string | undefined, by: string | undefined) =>
      fromWorker(by, async () => {
        const refused = prompt && by ? factRefused(PROMPT_FROM_WORKER) : undefined
        if (refused) return refused
        const answer = await spawning()
        if (answer.t !== 'spawned' || !prompt || !by) return answer
        const named = await actedBy((answer as Replies['spawn']).id, PROMPTED_BY, by)
        return named.t === 'error' ? named : answer
      })

    /**
     * A worker's hires are taken one at a time, by its callsign (the name its hires are counted under, across resumes), each
     * until the system counts it, so the next one is weighed against it.
     */
    const hiring = new Map<string, Promise<unknown>>()

    const inTurn = (key: string, act: () => Promise<Answer>): Promise<Answer> => {
      const run = (hiring.get(key) ?? Promise.resolve()).then(act)
      const settled = run.catch(() => undefined)
      hiring.set(key, settled)
      void settled.then(() => hiring.get(key) === settled && hiring.delete(key))
      return run
    }

    const HIRE_FACT = 'log a hire'

    /** A hire counts once the system holds its log, its hirer's log names it and the host runs it: what `liveHires` reads. */
    const counted = (by: string, id: string) =>
      system.session(id) !== undefined && (system.session(by)?.facts.hired.includes(id) ?? false) && (system.live()?.ids.has(id) ?? false)

    /**
     * A session `by` hires: refused past its floor's `hiring` limits unless a launch contributor exempts it, which its
     * contributors decide just before it starts (or its prompt starts a reviewer the way they started before reviews
     * logged its facts, `legacyReviewer`), then logged in the hirer's log. A hire that can't
     * be logged is killed, so every hire that runs is counted.
     */
    const hired = (projectId: string, by: string, prompt: string | undefined, spawning: (gate: Gate) => Answer | Promise<Answer>) =>
      fromWorker(by, () =>
        withProject(projectId, () => {
          const hirer = everyCard(Date.now()).find((c) => c.id === by)!
          return inTurn(hirer.callsign, async () => {
            const refused = factRefused(HIRE_FACT)
            if (refused) return refused
            const answer = await spawning(async (launched) => {
              const exempt = legacyReviewer(launched, prompt)?.exempt ?? launched.exempt
              if (exempt.some((e) => e.from === 'hiring')) return undefined
              await system.refreshLive()
              const cards = everyCard(Date.now())
              const limit = hireRefusal(cards, boardOf().floors.find((f) => f.id === projectId)!, cards.find((c) => c.id === by)!)
              return limit ? apiError('limited', `${limit} (the limits are \`hiring\` in the tower's config)`) : undefined
            })
            if (answer.t !== 'spawned') return answer
            const { id } = answer as Replies['spawn']
            const logged = await host({ t: 'fact', id: by, fact: { hook_event_name: HIRED, id } })
            if (logged.t === 'error') {
              await host({ t: 'kill', id })
              return { ...(logged as ApiError), message: `Session ${id} started but its hire couldn't be logged, so it was killed (it can be resumed): ${(logged as ApiError).message}` }
            }
            await system.refreshLive()
            await system.until(() => counted(by, id), TRACK_TIMEOUT_MS)
            return answer
          })
        }),
      )

    /** A worktree with a folder gone, in any repo, can't be worked in until it is recut. */
    const lostWorktree = (project: Project, cwd: string): ApiError | undefined => {
      const name = worktreeName(project, cwd)
      const gone = name === undefined ? undefined : sessionDirs(project, cwd).find((dir) => !existsSync(dir))
      return gone ? apiError('lost', `The worktree ${gone} is gone: recut "${name}" from its floor, then try again`) : undefined
    }

    /**
     * A resume continues one of the conversations Claude saved in the source session, in the directory it ran in, unless a
     * running session is already in it. Resumes run one at a time, each until the system holds the session it started, so
     * the next one reads it.
     */
    let resuming: Promise<unknown> = Promise.resolve()
    const resume = (id: string, conversation: string, prompt: string | undefined): Promise<Answer> => {
      const run = resuming.then(() => resumeOnce(id, conversation, prompt))
      resuming = run.catch(() => undefined)
      return run
    }

    const resumeOnce = (id: string, conversation: string, prompt: string | undefined) =>
      withSession(id, async () => {
        const source = system.session(id)!
        const held = source.facts.conversations.find((c) => c.id === conversation)
        if (!held) return apiError('not_found', `Session "${id}" holds no conversation "${conversation}"`)
        if (!held.saved) return apiError('refused', `Claude hasn't saved conversation "${conversation}" yet`)
        await system.refreshLive()
        const inIt = heldBy(conversation, system.sessions(), system.live()?.ids ?? new Set())
        if (inIt) return apiError('refused', `${runsAs(inIt)} (session ${inIt.header.id}) is already in conversation "${conversation}": go to it`)
        const config = readConfig()
        const project = config.projects[source.header.project]
        if (!project) return apiError('not_found', `No project "${source.header.project}" in the config`)
        const lost = lostWorktree(project, source.header.cwd)
        if (lost) return lost
        const kind = carriesOn(source, conversation) ? 'resume' : 'fork'
        const heir = kind === 'resume' ? newSessionId() : (await workerIds(config))()
        const brief = await briefFor(project, worktreesConfig(config, source.header.project).links, source.header.cwd)
        const { project: projectId, cwd } = source.header
        const runtime = source.header.runtime ?? 'claude'
        const worker = lineage(source, (s) => continues(s, system.sessions()))
        const merged = await contribute(kind, runtime, { project: projectId, cwd }, new Map(), (cap) => sessionFacts(cap, worker))
        if (merged.t === 'error') return merged
        const answer = await host(
          resumeRequest({
            kind,
            runtime,
            id: heir,
            name: resumeName(source, conversation, heir, system.sessions(), callsignsOf(config)),
            project: projectId,
            cwd,
            dirs: sessionDirs(project, cwd),
            user: configuredUser(config),
            worktree: brief,
            kept: projectCollectionsPath(paths, projectId),
            plugins: [...projectPlugins(config, projectId), ...holder.plugins(projectId, runtime)],
            contributed: merged.contributed,
            facts: kind === 'fork' ? forkFacts(worker) : [],
            conversation,
            prompt,
          }),
        )
        return answer
      })

    const withProject = (projectId: string, act: (project: Project, config: Config) => Answer | Promise<Answer>) => {
      const config = readConfig()
      const project = config.projects[projectId]
      return project ? act(project, config) : apiError('not_found', `No project "${projectId}"`)
    }

    /** A git refusal answers as its API error; the board reads git again after anything that may have changed it. */
    async function worktreeVerb(act: () => Promise<Answer>): Promise<Answer> {
      try {
        return await act()
      } catch (err) {
        if (err instanceof WorktreeError) return apiError(err.code, err.message)
        throw err
      } finally {
        void system.refreshRepos()
      }
    }

    /** Who is in a worktree right now: a running session or shell keeps it from removal. */
    const occupants = () => occupantsOf(cardsNow(), system.shells())
    const cardsNow = () => boardOf().floors.flatMap((f) => f.cards)

    /** The callsigns of the workers on duty, or just spawned and not on the board yet. */
    const heldNow = async (config: Config): Promise<string[]> => {
      await system.refreshLive()
      const onDuty = cardsNow().flatMap((c) => (c.onDuty ? [c.id] : []))
      return heldCallsigns(system.sessions(), new Set([...onDuty, ...(system.live()?.ids ?? [])]), callsignsOf(config))
    }

    /** Draws new workers' session ids, each callsign's name held by no worker on duty (`freshId`, `heldNow`). */
    const workerIds = async (config: Config): Promise<() => string> => {
      const held = new Set((await heldNow(config)).map(nameIn))
      return () => freshId(newSessionId, callsignsOf(config), held)
    }

    /** A new worker's session id and callsign: the callsign typed, if it can be had (`callsignRefused`), else its id's, drawn. */
    const newWorker = async (config: Config, typed: string | undefined): Promise<{ id: string; callsign: string } | ApiError> => {
      if (typed === undefined) {
        const id = (await workerIds(config))()
        return { id, callsign: callsignsOf(config)(id) }
      }
      const refused = callsignRefused(typed, await heldNow(config))
      if (refused) return apiError('refused', refused)
      const id = newSessionId()
      return { id, callsign: typedCallsign(typed, id) }
    }

    /**
     * The launch contributors of the floor's running extensions, in resolved order, merged for a launch of `kind`. One that
     * throws or returns what the runtime can't place refuses the launch when `fields` holds its capability's (the user
     * asked for what failed); otherwise its parts are dropped and it gets a `launch` problem. A conflict refuses the
     * launch, and is a problem of every extension it names. `factsOf`: a capability's facts over the worker's lineage.
     */
    const contribute = async (
      kind: LaunchRequest['kind'],
      runtime: Runtime,
      at: Pick<LaunchRequest, 'project' | 'cwd' | 'model' | 'effort'>,
      fields: Map<string, Record<string, unknown>>,
      factsOf: (cap: string) => SessionFact[],
    ): Promise<Merged | ApiError> => {
      const launchers = holder.launchers(at.project)
      const contributions: Contribution[] = []
      for (const { id, cap, launch } of launchers) {
        let failed: { code: 'threw' | 'shape'; message: string }
        try {
          const placed = placeable(await launch({ kind, runtime, ...at, ...(fields.has(cap) && { fields: fields.get(cap) }), facts: factsOf(cap) }))
          if (placed.ok) {
            contributions.push({ cap, parts: placed.parts })
            continue
          }
          failed = { code: 'shape', message: `returned a part ${runtime} can't place: ${placed.why}` }
        } catch (err) {
          failed = { code: 'threw', message: err instanceof UnsettledError ? `didn't settle within ${err.ms / 1000} s` : `threw: ${(err as Error).message}` }
        }
        if (fields.has(cap)) return apiError('internal', `${cap}'s launch contributor ${failed.message}`)
        holder.problem(id, { lane: 'launch', level: 'error', ...failed, message: `on a ${kind} on ${at.project}, ${failed.message}: its parts were dropped`, at: Date.now() })
      }
      const merged = mergeParts(kind, runtime, contributions, { flags: takenFlags(runtime, readConfig().argv), env: takenEnv(readConfig().env) })
      if (merged.t === 'merged') return merged
      for (const cap of merged.caps) holder.problem(launchers.find((l) => l.cap === cap)!.id, { lane: 'launch', level: 'error', code: 'conflict', message: merged.message, at: Date.now() })
      return apiError('refused', merged.message)
    }

    /**
     * A new worker's launch on the project's floor: where it starts and what its spawn asked for, with what the floor's
     * launch contributors add (a model or effort only where the spawn left it out). Refused as a contributor or `gate`
     * refuses it, or when its crew edge names no worker; its facts are its fields' and the core's.
     */
    const newLaunch = async (config: Config, projectId: string, at: Pick<SpawnLaunch, 'id' | 'name' | 'cwd' | 'dirs' | 'worktree'>, launch: Launch, spawn: Spawn): Promise<SpawnLaunch | ApiError> => {
      const runtime = 'claude'
      const now = Date.now()
      const factsOf = (cap: string) => Object.entries(spawn.fields.get(cap) ?? {}).map(([name, value]) => ({ name, value, at: now, session: at.id }))
      const merged = await contribute('spawn', runtime, { project: projectId, cwd: at.cwd, model: launch.model, effort: launch.effort }, spawn.fields, factsOf)
      if (merged.t === 'error') return merged
      const gated = await spawn.gate(merged)
      if (gated) return gated
      const lead = merged.reportsTo && workerNamed(cardsNow().filter((c) => !c.continuedBy), merged.reportsTo.callsign)
      if (merged.reportsTo && !lead) return apiError('not_found', `${merged.reportsTo.by} has the worker report to ${merged.reportsTo.callsign}, and no worker is called that`)
      return {
        kind: 'spawn',
        runtime,
        project: projectId,
        ...at,
        user: configuredUser(config),
        kept: projectCollectionsPath(paths, projectId),
        plugins: [...projectPlugins(config, projectId), ...holder.plugins(projectId, runtime)],
        contributed: merged.contributed,
        facts: [...spawn.facts, ...coreFacts(merged, lead?.id)],
        launch: { ...launch, model: launch.model ?? merged.defaults.model, effort: launch.effort ?? merged.defaults.effort },
      }
    }

    /**
     * A spawn's extension fields, each value parsed by its field's schema, and the facts they are logged as: refused as
     * `invalid` for a capability no extension provides, one off on the floor, or a field it doesn't declare.
     */
    const spawnFields = (project: string, x: Record<string, Record<string, unknown>>): Pick<Spawn, 'fields' | 'facts'> | ApiError => {
      const fields = new Map<string, Record<string, unknown>>()
      for (const [cap, values] of Object.entries(x)) {
        const live = holder.live(cap)
        if (live.t === 'none') return apiError('invalid', `x.${cap}: no extension provides ${cap}`)
        if (live.t !== 'up') return apiError('unavailable', `x.${cap}: ${cap} is ${live.why}, so its fields can't be logged`)
        if (live.a.off.includes(project)) return apiError('invalid', `x.${cap}: ${cap} is off on ${project}`)
        const parsed: Record<string, unknown> = {}
        for (const [name, value] of Object.entries(values)) {
          const field = live.a.fields.get(name)
          if (!field) return apiError('invalid', `x.${cap}.${name}: ${cap} declares no spawn field ${name}`)
          const ok = field.schema.safeParse(value)
          if (!ok.success) return apiError('invalid', `x.${cap}.${name}: ${z.prettifyError(ok.error)}`)
          parsed[name] = ok.data
        }
        fields.set(cap, parsed)
      }
      return { fields, facts: fieldFacts(Object.fromEntries(fields)) }
    }

    /** A session in `cwd`, or in the hub's main checkout when none is given. */
    const spawnIn = (projectId: string, given: string | undefined, typed: string | undefined, launch: Launch, spawn: Spawn) =>
      withProject(projectId, async (project, config) => {
        const cwd = given ?? project.hub
        const outside = outsideProject(project, cwd)
        if (outside) return apiError('refused', outside)
        const lost = lostWorktree(project, cwd)
        if (lost) return lost
        const worker = await newWorker(config, typed)
        if ('t' in worker) return worker
        const started = await newLaunch(config, projectId, { id: worker.id, name: worker.callsign, cwd, dirs: sessionDirs(project, cwd), worktree: await briefFor(project, worktreesConfig(config, projectId).links, cwd) }, launch, spawn)
        return 't' in started ? started : host(spawnRequest(started))
      })

    /** Callsigns until one names a worktree, default branch and recorded name the floor doesn't have: of a hundred per name, few are taken. */
    const MAX_NAME_TRIES = 50

    /** A new worker's session id, from `draw` (`workerIds`), whose callsign, lowercased, is a free worktree name. */
    async function freeName(project: Project, branchPrefix: string, draw: () => string, callsign: (id: string) => string): Promise<{ id: string; name: string }> {
      for (let i = 0; i < MAX_NAME_TRIES; i++) {
        const id = draw()
        const name = callsign(id).toLowerCase()
        if (await nameIsFree(projectDirs(project), name, `${branchPrefix}${name}`)) return { id, name }
      }
      throw new WorktreeError('exists', `No free worktree name after ${MAX_NAME_TRIES} callsigns: name it`)
    }

    /** A drawn worker's session id and its worktree's name: `named`, or its callsign's if free (`freeName`). */
    const drawnName = async (project: Project, branchPrefix: string, named: string | undefined, config: Config) => {
      const draw = await workerIds(config)
      return named ? { id: draw(), name: named } : freeName(project, branchPrefix, draw, callsignsOf(config))
    }

    /**
     * A new worktree in every dir of the project, cut from a base on origin or forked from a checkout, then a session in the
     * hub's. The worktree is named for the worker unless it was named: for a callsign typed (`typed`), its own, lowercased;
     * else a session id is drawn until its callsign is a free name, and its name one no worker on duty holds. Its launch
     * is composed, and a hire weighed, in the worktree's path before the cut, so a refused spawn cuts nothing; a spawn
     * the host fails rolls the cut back.
     */
    const spawnCut = (projectId: string, request: { name?: string; branch?: string; base?: string; from?: string }, typed: string | undefined, launch: Launch, spawn: Spawn) =>
      withProject(projectId, (project, config) =>
        worktreeVerb(async () => {
          const { branchPrefix, links } = worktreesConfig(config, projectId)
          const chosen = typed === undefined ? undefined : await newWorker(config, typed)
          if (chosen && 't' in chosen) return chosen
          const { id, name } = chosen
            ? { id: chosen.id, name: request.name ?? chosen.callsign.toLowerCase() }
            : await drawnName(project, branchPrefix, request.name, config)
          const callsign = chosen?.callsign ?? callsignsOf(config)(id)
          const branch = request.branch ?? `${branchPrefix}${name}`
          const cwd = worktreePath(project.hub, name)
          const started = await newLaunch(config, projectId, { id, name: callsign, cwd, dirs: sessionDirs(project, cwd), worktree: worktreeBrief(project, cwd, branch, linkedSources(project, links)) }, launch, spawn)
          if ('t' in started) return started
          const made = await (request.from !== undefined ? fork(project, links, { name, branch, from: request.from }) : cut(project, links, { name, branch, base: request.base }))
          const answer = await host(spawnRequest(started))
          if (answer.t === 'error') {
            await rollback(made.made)
            return apiError('worktree_failed', `The session didn't start in ${cwd}, so the cut was rolled back: ${(answer as ApiError).message}`)
          }
          return { ...answer, cut: { name: made.name, branch: made.branch, bases: made.bases } }
        }),
      )

    const onWorktrees = (projectId: string, act: (project: Project, config: Config) => Promise<Answer>) =>
      withProject(projectId, (project, config) => worktreeVerb(() => act(project, config)))

    /** Ends what the session left running and `picks`, read from the machine as it is now. */
    const reapIn = (id: string, picks: (r: Resource) => boolean, nothing: string) =>
      withSession(id, async () => {
        const release = await system.observe()
        try {
          const doomed = system.running().filter((r) => r.session === id && picks(r))
          if (!doomed.length) return apiError('refused', nothing)
          reap(doomed)
          void system.refreshRunning()
          return OK
        } finally {
          release()
        }
      })

    const reapSession = (id: string) => reapIn(id, () => true, `Session "${id}" left nothing running`)

    const reapProcess = (id: string, pid: number) => reapIn(id, (r) => r.pid === pid, `Session "${id}" left no process ${pid} running`)

    /** Does `action` in the user's editor: a command the tower can't find is a config error. */
    async function inEditor(action: EditorAction, values: Record<string, string>): Promise<void> {
      const config = readConfig()
      const argv = editorArgv(config, action, values)
      try {
        await runEditor(argv)
      } catch (err) {
        const from = config.editor ? `editor.${action} in the config` : 'the default editor: set editor in the config'
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw new ConfigError(`"${argv[0]}" (${from}) is not on the tower's PATH`)
        throw err
      }
    }

    /** A project's main checkout or one of its worktrees. */
    async function openDir(dir: string): Promise<Answer> {
      const projects = Object.values(readConfig().projects)
      if (!projects.some((p) => projectDirs(p).includes(dir) || worktreeName(p, dir) !== undefined)) return apiError('not_found', `"${dir}" is not a project directory or a worktree of one`)
      if (!existsSync(dir)) return apiError('lost', `"${dir}" is gone`)
      await inEditor('window', { dir })
      return OK
    }

    const isWithin = (dir: string, target: string): boolean => {
      const rel = path.relative(dir, target)
      return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel))
    }

    /** A path with its links followed, so `/tmp/x` and `/private/tmp/x` are one: a missing path's nearest existing folder's. */
    const real = (p: string): string => (existsSync(p) || p === path.dirname(p) ? realpathSync(p) : path.join(real(path.dirname(p)), path.basename(p)))

    /** Why the system doesn't name `target`, if it doesn't: it names its projects' dirs, its root and the files workers showed. */
    const unnamed = (target: string): string | undefined => {
      const file = real(target)
      const named =
        Object.values(readConfig().projects).some((p) => projectDirs(p).some((dir) => isWithin(real(dir), file))) ||
        isWithin(real(path.dirname(paths.config)), file) ||
        system.sessions().some((s) => s.facts.shown.some((shown) => shown.kind === 'file' && real(shown.target) === file))
      return named ? undefined : `"${target}" is inside no project directory nor the system root, and no worker showed it`
    }

    /** A path the system names, as it is on disk: refused when the system doesn't name it, `lost` when it is gone. */
    async function onPath(target: string, act: (file: string) => Promise<void>): Promise<Answer> {
      const file = path.resolve(target)
      const refusal = unnamed(file)
      if (refusal) return apiError('not_found', refusal)
      if (!existsSync(file)) return apiError('lost', `"${file}" is gone`)
      await act(file)
      return OK
    }

    /** Acts only on a collection the floor keeps, declared by the config or by an extension on there. */
    const onFloor = (project: string, collection: string, act: (on: FloorCollectionType) => Answer) => {
      const on = collectionOn(readConfig(), project, collection, holder.registry().stores)
      return on ? act(on) : apiError('not_found', `"${project}" has no collection "${collection}"`)
    }

    /** A generic write: only to a collection no extension owns. */
    const inCollection = (project: string, collection: string, change: () => Answer) =>
      onFloor(project, collection, (on) => {
        const refused = ownedRefusal(collection, on)
        return refused ? apiError('refused', refused) : change()
      })

    const toItem = (project: string, collection: string, id: string, change: (file: string) => Answer) =>
      inCollection(project, collection, () => {
        const file = itemPath(paths, project, collection, id)
        return existsSync(file) ? change(file) : apiError('not_found', `${project}/${collection} holds no item "${id}"`)
      })

    /**
     * A worktree whose work never landed, thrown away as the board showed it, in order: its tips read, the floor's recovery
     * record made by the answers to `tower/discard.record`, then each repo's worktree removed with force and its branch
     * deleted, then `tower/discard.done` raised. No answer to the record, or a failed one, stops it before anything is
     * removed; a failed answer to the done is reported.
     */
    const discardWorktree = ({ project, name, author, held }: RouteInput['worktree/discard'], caller: Caller) =>
      onWorktrees(project, async (p) => {
        const tips = await discardable(p, project, name, occupants(), held)
        const within = nestedIn(caller, 'tower/worktree/discard')
        const answers = await chains.raise('tower/discard.record', { project, name, author, tips }, within)
        if (!answers.length) return apiError('refused', `Nothing on "${project}" records what a discard throws away (tower/discard.record has no answer there), so "${name}" was kept`)
        const failed = answers.find((a) => !a.ok)
        if (failed && !failed.ok) return apiError('refused', `${failed.cap} couldn't record the discard of "${name}", so nothing was removed: ${failed.message}`)
        const kept = await discard(name, tips)
        type Recorded = NonNullable<Replies['worktree/discard']['x']>[string]
        const x = Object.fromEntries(answers.flatMap((a) => (a.ok ? [[a.cap, a.answer as Recorded]] : [])))
        const doneAnswers = await chains.raise('tower/discard.done', { project, name, author, tips, kept }, within)
        const done = Object.fromEntries(doneAnswers.map((a) => [a.cap, a.ok ? (a.answer as Recorded) : { code: a.code, message: a.message }]))
        const filed = done[REVIEWS]
        const thread = filed && 'item' in filed ? filed.item?.id : undefined
        return { t: 'discarded', tips: tips.map(({ dir, branch, tip }) => ({ dir, branch, tip })), ...(thread && { thread }), ...keptOf(kept), x, ...(doneAnswers.length && { done }) }
      })

    const pruneKey = (p: Prune) => (p.t === 'reap' ? `reap ${p.id} ${p.pid}` : `kill ${p.id}`)

    /** What of the listed plan the floor's Tidy no longer lists: the processes, workers, logs and stream months, as read now. `callsign`: a session id's. */
    const movedOn = (plan: Omit<TidyPlan, 'threads'>, now: TidyPlan, callsign: (id: string) => string): string[] => {
      const prunes = new Set(now.prune.map(pruneKey))
      return [
        ...plan.prune.filter((p) => !prunes.has(pruneKey(p))).map((p) => (p.t === 'reap' ? `process ${p.pid}` : `worker ${callsign(p.id)}`)),
        ...plan.logs.filter((l) => !now.logs.some((n) => n.id === l.id)).map((l) => `log ${l.id}`),
        ...plan.streams.filter((m) => !now.streams.some((n) => n.file === m.file)).map((m) => `stream ${m.file}`),
      ]
    }

    /** Each extension's tidy entry in `x` that the floor's adds no longer list, as read now. */
    const addedMovedOn = (x: Record<string, string[]>, projectId: string): string[] => {
      const listed = boardOf().adds[`floor:${projectId}`]?.tidy ?? []
      return Object.entries(x).flatMap(([cap, keys]) => keys.filter((key) => !listed.some((e) => e.cap === cap && e.key === key)).map((key) => `${cap}'s ${key}`))
    }

    /**
     * Every floor's Tidy lists the system's stream months, so two can press for the same one: they are archived one at a
     * time, and a month another Tidy archived meanwhile is not there to archive. `false` for that month.
     */
    let streamArchiving: Promise<unknown> = Promise.resolve()
    const archiveMonth = (file: string): Promise<boolean> => {
      const archived = streamArchiving.then(async () => {
        if (!existsSync(path.join(paths.streams, file))) return false
        await archiveStream(paths, file)
        return true
      })
      streamArchiving = archived.catch(() => {})
      return archived
    }

    /**
     * Tidy as listed, or nothing when the list moved on: git's part checked after its fetch, then each entry applied, in
     * order: worktrees removed and kept branches deleted, the leftover processes ended, the idle workers killed and the old logs and stream months archived; then each extension's entries in `plan.x`, applied
     * by its answer to `tower/tidy.apply`, a failed one reported in the reply's `x`. What another verb does is done
     * through it, for the caller, so what wraps that verb sees it. A worker is checked again just before its kill, since
     * the fetch takes seconds; an entry no longer listed, or whose verb refuses, is skipped and named, and the rest goes on.
     */
    const tidyProject = (projectId: string, { threads, ...listed }: RouteInput['tidy']['plan'], caller: Caller) =>
      onWorktrees(projectId, async (project) => {
        const release = await system.observe()
        try {
          const plan = threads.length ? { ...listed, x: { ...listed.x, [REVIEWS]: [...new Set([...(listed.x?.[REVIEWS] ?? []), ...threads])] } } : listed
          const callsign = callsignsOf(readConfig())
          const gone = [...movedOn(plan, boardOf().floors.find((f) => f.id === projectId)!.tidy, callsign), ...addedMovedOn(plan.x ?? {}, projectId)]
          if (gone.length) return apiError('refused', `Tidy's list moved on: ${gone.join(', ')} no longer qualif${gone.length === 1 ? 'ies' : 'y'}`)
          if (plan.worktrees.length || plan.branches.length) await tidyable(project, projectId, occupants(), plan)
          const within = nestedIn(caller, 'tower/tidy')
          const step = (verb: string, input: object) => call(`tower/${verb}`, input, within)
          const skipped: string[] = []
          /** Each entry whose verb answered, its branches kept named in `skipped`; each refused, named with why. */
          const applied = async <T>(entries: T[], verb: string, input: (entry: T) => object, what: (entry: T) => string): Promise<T[]> => {
            const done: T[] = []
            for (const entry of entries) {
              const answer = await step(verb, input(entry))
              if (answer.t === 'error') skipped.push(`${what(entry)}: ${(answer as ApiError).message}`)
              else done.push(entry)
              skipped.push(...((answer as { kept?: string[] }).kept ?? []).map((why) => `branch ${why}`))
            }
            return done
          }
          const removed = await applied(plan.worktrees, 'worktree/remove', (name) => ({ project: projectId, name }), (name) => `worktree ${name}`)
          const deleted = await applied(plan.branches, 'branch/delete', (name) => ({ project: projectId, name }), (name) => `branch ${name}`)
          const reaps = plan.prune.flatMap((p) => (p.t === 'reap' ? [p] : []))
          const reaped = await applied(reaps, 'reap/process', ({ id, pid }) => ({ id, pid }), ({ pid }) => `process ${pid}`)
          const killed: string[] = []
          for (const p of plan.prune) {
            if (p.t !== 'kill') continue
            if (movedOn({ ...plan, prune: [p], logs: [], streams: [] }, boardOf().floors.find((f) => f.id === projectId)!.tidy, callsign).length) {
              skipped.push(`worker ${callsign(p.id)}: no longer done with its purpose`)
              continue
            }
            killed.push(...(await applied([p.id], 'kill', (id) => ({ id }), (id) => `worker ${callsign(id)}`)))
          }
          for (const { id } of plan.logs) await archiveLog(paths, id)
          const streams: string[] = []
          for (const { file } of plan.streams) {
            if (await archiveMonth(file)) streams.push(file)
            else skipped.push(`stream ${file}: archived by another floor's Tidy meanwhile`)
          }
          const x: Replies['tidy']['x'] = {}
          for (const [cap, keys] of Object.entries(plan.x ?? {})) {
            const [answer] = await chains.raiseTo('tower/tidy.apply', cap, { project: projectId, keys }, within)
            x[cap] = !answer
              ? { code: 'refused', message: `${cap} is off on ${projectId}` }
              : answer.ok
                ? (answer.answer as { done: string[]; skipped: string[] })
                : { code: answer.code, message: answer.cap === cap ? answer.message : `${answer.cap}'s link around tower/tidy.apply refused: ${answer.message}` }
          }
          const filed = x[REVIEWS]
          return { t: 'tidied', removed, deleted, threads: filed && 'done' in filed ? filed.done : [], reaped: reaped.map((r) => r.pid), killed, skipped, archived: plan.logs.map((l) => l.id), streams, ...(plan.x && { x }) }
        } finally {
          release()
        }
      })

    /**
     * A core verb that moved into an extension (`LEGACY`): its input as the new verb takes it, called through the one
     * dispatch as a step of the old, and the reply as the old one answered.
     */
    const legacy =
      (old: string) =>
      async (input: unknown, caller: Caller): Promise<Answer> => {
        const { input: mapped, reply } = LEGACY_VERBS[old]
        const now = mapped(input)
        if (isApiError(now)) return now
        const answer = await call(legacyNamed('verb', old)!.now, now, nestedIn(caller, `tower/${old}`))
        return isApiError(answer) ? answer : (reply(answer) as Answer)
      }

    const HANDLERS: { [R in Verb]: (input: RouteInput[R], caller: Caller) => Answer | Promise<Answer> } = {
      spawn: ({ project, cwd, cut, callsign, model, effort, prompt, x, by, hire }) => {
        const fields = spawnFields(project, x ?? {})
        if ('t' in fields) return fields
        const launch = { model, effort, prompt }
        const spawning = (gate: Gate) =>
          spawnedBy(() => (cut ? spawnCut(project, cut, callsign, launch, { ...fields, gate }) : spawnIn(project, cwd, callsign, launch, { ...fields, gate })), prompt, by)
        return hire ? hired(project, by!, prompt, spawning) : spawning(async () => undefined)
      },
      resume: ({ id, conversation, prompt }) => resume(id, conversation, prompt),
      keys: ({ id, data, by }) => keys(id, data, by),
      submit: ({ id, text, by }) => submit(id, text, by),
      resize: ({ id, cols, rows }) => withSession(id, () => host({ t: 'resize', id, cols, rows })),
      kill: ({ id, by }) => kill(id, by),
      'let-go': ({ id }) => letGo(id),
      fact: logFact,
      'probe/run': legacy('probe/run'),
      'extension/restart': async ({ id }) => {
        const view = await holder.restart(id)
        return view ? { t: 'restarted', state: view.state } : apiError('not_found', `No extension "${id}": \`tower extensions\` lists them`)
      },
      reap: ({ id }) => reapSession(id),
      'reap/process': ({ id, pid }) => reapProcess(id, pid),
      open: ({ dir }) => openDir(dir),
      reveal: ({ path: target }) => onPath(target, revealInFinder),
      edit: ({ path: target, line }) =>
        onPath(target, (file) => (line === undefined ? inEditor('open', { path: file }) : inEditor('goto', { path: file, line: String(line) }))),
      'shell/spawn': ({ project, cwd }) => terms({ t: 'spawn', project, cwd, ...SHELL_SIZE }),
      'shell/keys': ({ id, data }) => terms({ t: 'write', id, data }),
      'shell/resize': ({ id, cols, rows }) => terms({ t: 'resize', id, cols, rows }),
      'shell/kill': ({ id }) => terms({ t: 'kill', id }),
      'collection/create': ({ project, collection, name, ext, content }) =>
        inCollection(project, collection, () => ({ t: 'created', ...createItem(paths, project, collection, name, ext, content) })),
      'collection/write': ({ project, collection, id, content, modifiedAt }) =>
        toItem(project, collection, id, (file) =>
          itemVersion(file) === modifiedAt
            ? { t: 'written', modifiedAt: writeItem(paths, project, collection, id, content) }
            : apiError('refused', `${project}/${collection}/${id} changed since version ${modifiedAt}`),
        ),
      'collection/restore': ({ project, collection, id, content }) =>
        inCollection(project, collection, () => {
          const modifiedAt = restoreItem(paths, project, collection, id, content)
          return modifiedAt === undefined ? apiError('refused', `${project}/${collection} already holds an item "${id}"`) : { t: 'created', id, modifiedAt }
        }),
      'collection/delete': ({ project, collection, id }) => toItem(project, collection, id, () => (deleteItem(paths, project, collection, id), OK)),
      'worktree/recut': ({ project, name }) =>
        onWorktrees(project, async (p, config) => (await recutWorktree(p, project, worktreesConfig(config, project).links, name, occupants()), OK)),
      'worktree/prune': ({ project, name }) => onWorktrees(project, async (p) => ({ ...OK, ...keptOf(await pruneWorktree(p, project, name, occupants())) })),
      'worktree/remove': ({ project, name }) => onWorktrees(project, async (p) => ({ ...OK, ...keptOf(await removeWorktree(p, project, name, occupants())) })),
      'worktree/discard': discardWorktree,
      'branch/recut': ({ project, name }) =>
        onWorktrees(project, async (p, config) => (await recutBranch(p, project, worktreesConfig(config, project).links, name), OK)),
      'branch/delete': ({ project, name }) => onWorktrees(project, async (p) => ({ ...OK, ...keptOf(await deleteBranch(p, project, name)) })),
      tidy: ({ project, plan }, caller) => tidyProject(project, plan, caller),
      'review/append': legacy('review/append'),
      'policy/run': legacy('policy/run'),
      'policy/pass': legacy('policy/pass'),
      'policy/approve': legacy('policy/approve'),
    }

    /** A core verb: its input parsed by its schema, handled with its caller, and its reply checked against its schema. */
    const callCore = async (verb: string, input: unknown, caller: Caller): Promise<Answer> => {
      if (!isVerb(verb)) return apiError('not_found', `No verb "${verb}"`)
      const parsed = ROUTES[verb].input.safeParse(input)
      if (!parsed.success) return apiError('invalid', z.prettifyError(parsed.error))
      const answer = await (HANDLERS[verb] as (input: unknown, caller: Caller) => Answer | Promise<Answer>)(parsed.data, caller)
      return answer.t === 'error' ? answer : ROUTES[verb].reply.parse(answer)
    }

    const extension = extensionCalls(holder, readConfig)
    const chains = chainCalls(holder, readConfig)

    /** A verb by its qualified name, through the chain around it: the core's, or a running extension's. */
    const wrapped = async (name: string, q: { cap: string; name: string }, input: unknown, caller: Caller): Promise<Answer> => {
      if (q.cap === 'tower') {
        if (!isVerb(q.name)) return apiError('not_found', `No verb "${q.name}"`)
        return (await chains.wrap(name, ROUTES[q.name], input, caller, (value) => callCore(q.name, value, caller))).reply as Answer
      }
      const verb = extension.verbOf(q.cap, q.name)
      if ('t' in verb) return verb
      return (await chains.wrap(name, verb, input, caller, (value) => extension.verb(q.cap, q.name, value, caller))).reply as Answer
    }

    /**
     * The one dispatch: a verb by its qualified name, the core's as `tower/<verb>`, called for `caller` through the chain
     * around it, refused when it would be nested more than `MAX_DEPTH` deep. Every failure answers as an `ApiError`, a
     * throw as `internal`.
     */
    async function call(name: string, input: unknown, caller: Caller): Promise<Answer> {
      const q = qualifiedOf(name)
      if (!q) return apiError('not_found', `No verb "${name}": a verb is named <capability>/<verb>, the core's tower/<verb>`)
      const deep = tooDeep(caller, name)
      if (deep) return apiError('refused', deep)
      try {
        return await wrapped(name, q, input, caller)
      } catch (err) {
        console.error(`${name}:`, err)
        return errorOf(err)
      }
    }

    /** An extension's read by its qualified name, for `caller`, refused as a call is when nested too deep. */
    const read = async (cap: string, name: string, params: Record<string, string>, query: Record<string, string>, caller: Caller): Promise<unknown> => {
      const deep = tooDeep(caller, `${cap}/${name}`)
      return deep ? apiError('refused', deep) : extension.read(cap, name, params, query, caller)
    }

    let leaveTimer: NodeJS.Timeout | undefined
    const scheduleLeaves = () => {
      leaveTimer ??= setTimeout(() => {
        leaveTimer = undefined
        sendLeaversHome()
      }, PUBLISH_DEBOUNCE_MS)
    }

    const unsubscribe = system.onChange(scheduleLeaves)
    scheduleLeaves()

    /** No more departures sent: the system's changes no longer heard. */
    const stop = () => {
      unsubscribe()
      clearTimeout(leaveTimer)
    }

    return { call, read, raise: chains.raise, readAt: extension.readAt, deprecationOf: extension.deprecationOf, stop }
  },
  halt: ({ stop }) => stop(),
})
export type DispatchResource = StartedResource<typeof dispatch>