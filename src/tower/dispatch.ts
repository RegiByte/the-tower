/**
 * The verbs: every command's handler, each composed over the config, the live system and the board, and the state
 * verbs keep while they run (hires and resumes taken in turn, workers departing). `mux/*` belong to the HTTP server.
 */
import { defineResource, type StartedResource } from 'braided'
import { existsSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { archiveLog, archiveStream } from '../archive.ts'
import { occupantsOf, type TidyPlan } from '../bridge/board.ts'
import { carriesOn, heldBy, heldCallsigns, resumeName, runsAs } from '../bridge/chains.ts'
import { HIRED, KEYED_BY, KILLED_BY, leavesNow, LET_GO, PROMPTED_BY, type Session } from '../bridge/facts.ts'
import { APPROVALS_STREAM, liveRuns, NO_POLICY_FACTS, RUNS_STREAM, shortHash, slotName, slotSeen, type ApprovalFact, type Parsed, type PassFact, type PolicyFacts, type RunFact } from '../bridge/policies.ts'
import { hashOf, parsePolicy } from '../bridge/policy-file.ts'
import type { Prune } from '../bridge/prunable.ts'
import type { Resource } from '../bridge/resources.ts'
import { discardNote } from '../bridge/worktrees.ts'
import { createItem, deleteItem, itemPath, itemVersion, putItem, readItem, renameItem, restoreItem, writeItem } from '../collections.ts'
import { hostRequest, reap, revealInFinder, runEditor, submitText, termsRequest } from '../machine.ts'
import { apiError, ROUTES, type ApiError, type Replies, type Route, type RouteInput } from '../shared/api.ts'
import { callsignRefused, freshId, nameIn, typedCallsign } from '../shared/callsign.ts'
import { callOf, can, hireRefusal } from '../shared/cards.ts'
import { newSessionId, resumeRequest, spawnRequest, worktreeBrief, type Launch } from '../shared/launch.ts'
import { callsignsOf, ConfigError, configuredUser, editorArgv, outsideProject, projectCollections, projectDirs, projectPlugins, sessionDirs, worktreeName, worktreesConfig, type Config, type EditorAction, type Project } from '../shared/model.ts'
import { projectCollectionsPath, projectStreamPath } from '../shared/paths.ts'
import { POLICIES, ruleWords, slotsBetween } from '../shared/policies.ts'
import { sessionKeys, type FromHost, type ToHost } from '../shared/protocol.ts'
import { appended, bodyProblem, landedThreadId, nextNumber, parseThread, reviewedIn, REVIEWS, stamp, threadId } from '../shared/reviews.ts'
import { tagOf } from '../shared/tags.ts'
import { SHELL_SIZE, type FromTerms, type ToTerms } from '../shared/terms.ts'
import { appendFact } from '../streams.ts'
import { briefFor, cut, deleteBranch, discard, discardable, fork, linkedSources, nameIsFree, pruneWorktree, recutBranch, recutWorktree, removeWorktree, rollback, tidy, WorktreeError } from '../worktrees.ts'
import { OK, type Answer } from './answers.ts'
import { PUBLISH_DEBOUNCE_MS, type PublisherResource } from './publisher.ts'
import type { ConfigResource, ProbesResource, SystemResource } from './spine.ts'

/** How long a resume waits for the host to write its session's header; the host opens the log as it answers. */
const TRACK_TIMEOUT_MS = 5000

/** The verbs a dispatch handles: all but the mux's, which hold HTTP connections. */
export type Verb = Exclude<Route, 'mux/watch' | 'mux/unwatch'>

/** Whether the config declares the collection for the project. */
export const isDeclaredIn = (config: Config, project: string, collection: string): boolean =>
  Object.hasOwn(config.projects, project) && Object.hasOwn(projectCollections(config, project), collection)

export const policyFactsIn = (live: SystemResource, project: string) => live.policyFacts().get(project) ?? NO_POLICY_FACTS

type Deps = {
  'core:config': ConfigResource
  'core:system': SystemResource
  'core:publisher': PublisherResource
  'core:probes': ProbesResource
}

export const dispatch = defineResource({
  dependencies: ['core:config', 'core:system', 'core:publisher', 'core:probes'],
  start: ({ 'core:config': { paths, read: readConfig }, 'core:system': system, 'core:publisher': { board: boardOf, everyCard }, 'core:probes': probeRunner }: Deps) => {
    const isDeclared = (project: string, collection: string) => isDeclaredIn(readConfig(), project, collection)

    const policyFactsOf = (project: string) => policyFactsIn(system, project)

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

    /** A host older than `SPAWN_FACTS_PROTOCOL` reads past a spawn's `facts`: the session would start without them. */
    async function host(msg: ToHost): Promise<Answer> {
      const refused = msg.t === 'spawn' && msg.facts?.length ? olderHost(SPAWN_FACTS_PROTOCOL, 'start a worker with its facts') : undefined
      if (refused) return refused
      const answer = await daemon(() => hostRequest(paths, msg))
      void system.refreshLive()
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
            const answer = await HANDLERS[verb](ROUTES[verb].input.parse({ ...body, by: c.id }))
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
     * A session `by` hires: refused past its floor's `hiring` limits unless it starts a reviewer, then logged in the hirer's
     * log. A hire that can't be logged is killed, so every hire that runs is counted.
     */
    const hired = (projectId: string, by: string, prompt: string | undefined, spawning: () => Answer | Promise<Answer>) =>
      fromWorker(by, () =>
        withProject(projectId, () => {
          const hirer = everyCard(Date.now()).find((c) => c.id === by)!
          return inTurn(hirer.callsign, async () => {
            const refused = factRefused(HIRE_FACT)
            if (refused) return refused
            if (reviewedIn(prompt) === undefined) {
              await system.refreshLive()
              const cards = everyCard(Date.now())
              const limit = hireRefusal(cards, boardOf().floors.find((f) => f.id === projectId)!, cards.find((c) => c.id === by)!)
              if (limit) return apiError('limited', `${limit} (the limits are \`hiring\` in the tower's config)`)
            }
            const answer = await spawning()
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
        const holder = heldBy(conversation, system.sessions(), system.live()?.ids ?? new Set())
        if (holder) return apiError('refused', `${runsAs(holder)} (session ${holder.header.id}) is already in conversation "${conversation}": go to it`)
        const config = readConfig()
        const project = config.projects[source.header.project]
        if (!project) return apiError('not_found', `No project "${source.header.project}" in the config`)
        const lost = lostWorktree(project, source.header.cwd)
        if (lost) return lost
        const heir = carriesOn(source, conversation) ? newSessionId() : (await workerIds(config))()
        const brief = await briefFor(project, worktreesConfig(config, source.header.project).links, source.header.cwd)
        const answer = await host(resumeRequest(source.header, conversation, prompt, heir, resumeName(source, conversation, heir, system.sessions(), callsignsOf(config)), sessionDirs(project, source.header.cwd), configuredUser(config), brief, projectCollectionsPath(paths, source.header.project), projectPlugins(config, source.header.project)))
        if (answer.t === 'spawned') await system.tracked(heir, TRACK_TIMEOUT_MS)
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

    /** A session in `cwd`, or in the hub's main checkout when none is given. */
    const spawnIn = (projectId: string, given: string | undefined, typed: string | undefined, launch: Launch) =>
      withProject(projectId, async (project, config) => {
        const cwd = given ?? project.hub
        const outside = outsideProject(project, cwd)
        if (outside) return apiError('refused', outside)
        const lost = lostWorktree(project, cwd)
        if (lost) return lost
        const worker = await newWorker(config, typed)
        if ('t' in worker) return worker
        return host(spawnRequest(worker.id, worker.callsign, projectId, cwd, sessionDirs(project, cwd), launch, configuredUser(config), await briefFor(project, worktreesConfig(config, projectId).links, cwd), projectCollectionsPath(paths, projectId), projectPlugins(config, projectId)))
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
     * else a session id is drawn until its callsign is a free name, and its name one no worker on duty holds. A failed spawn
     * rolls the cut back.
     */
    const spawnCut = (projectId: string, request: { name?: string; branch?: string; base?: string; from?: string }, typed: string | undefined, launch: Launch) =>
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
          const made = await (request.from !== undefined ? fork(project, links, { name, branch, from: request.from }) : cut(project, links, { name, branch, base: request.base }))
          const cwd = made.made[0].path
          const answer = await host(spawnRequest(id, callsign, projectId, cwd, sessionDirs(project, cwd), launch, configuredUser(config), worktreeBrief(project, cwd, made.branch, linkedSources(project, links)), projectCollectionsPath(paths, projectId), projectPlugins(config, projectId)))
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

    /** Changes only inside a collection the config declares for the project. */
    const inCollection = (project: string, collection: string, change: () => Answer) =>
      isDeclared(project, collection) ? change() : apiError('not_found', `"${project}" has no collection "${collection}"`)

    const toItem = (project: string, collection: string, id: string, change: (file: string) => Answer) =>
      inCollection(project, collection, () => {
        const file = itemPath(paths, project, collection, id)
        return existsSync(file) ? change(file) : apiError('not_found', `${project}/${collection} holds no item "${id}"`)
      })

    /**
     * A message on a checkout's thread, numbered one past the last. Read, numbered and written in one synchronous step,
     * so appends from the page and from every worker never interleave.
     */
    const appendReview = ({ project, checkout, author, re, anchors, body }: RouteInput['review/append']): Answer =>
      inCollection(project, REVIEWS, () => {
        if (!body.trim() && !anchors.length) return apiError('invalid', 'A note needs a body or an anchor')
        const problem = bodyProblem(body) ?? anchors.flatMap((a) => (a.from > a.to ? [`${a.repo}:${a.path}: line ${a.from} comes after ${a.to}`] : []))[0]
        if (problem) return apiError('invalid', problem)
        const id = threadId(checkout)
        const text = readItem(paths, project, REVIEWS, id)
        const thread = parseThread(text ?? '')
        if (re !== undefined && !thread.messages.some((m) => m.n === re)) return apiError('not_found', `The thread of ${checkout} holds no n${re}`)
        const n = nextNumber(thread)
        const modifiedAt = putItem(paths, project, REVIEWS, id, appended(text, checkout, { author, at: stamp(new Date()), n, re, anchors, body: body.trim() }))
        return { t: 'appended', id, n, modifiedAt }
      })

    /**
     * A worktree whose work never landed, thrown away as the board showed it: its tips noted on its thread before anything
     * goes, then each repo's worktree removed with force and its branch deleted, and the thread filed.
     */
    const discardWorktree = ({ project, name, author, held }: RouteInput['worktree/discard']) =>
      onWorktrees(project, async (p) => {
        if (!isDeclared(project, REVIEWS)) return apiError('refused', `"${project}" keeps no review threads, where a discard notes what it threw away`)
        const tips = await discardable(p, project, name, occupants(), held)
        const noted = appendReview({ project, checkout: name, author, anchors: [], body: discardNote(name, tips) })
        if (noted.t === 'error') return noted
        const kept = await discard(name, tips)
        const thread = landedThreadId(name, new Date())
        renameItem(paths, project, REVIEWS, threadId(name), thread)
        return { t: 'discarded', tips: tips.map(({ dir, branch, tip }) => ({ dir, branch, tip })), thread, ...keptOf(kept) }
      })

    const pruneKey = (p: Prune) => (p.t === 'reap' ? `reap ${p.id} ${p.pid}` : `kill ${p.id}`)

    /** What of the listed plan the floor's Tidy no longer lists: the processes, workers and landed threads, as read now. `callsign`: a session id's. */
    const movedOn = (plan: TidyPlan, now: TidyPlan, callsign: (id: string) => string): string[] => {
      const prunes = new Set(now.prune.map(pruneKey))
      return [
        ...plan.prune.filter((p) => !prunes.has(pruneKey(p))).map((p) => (p.t === 'reap' ? `process ${p.pid}` : `worker ${callsign(p.id)}`)),
        ...plan.threads.filter((t) => !now.threads.includes(t)).map((t) => `thread ${t}`),
        ...plan.logs.filter((l) => !now.logs.some((n) => n.id === l.id)).map((l) => `log ${l.id}`),
        ...plan.streams.filter((m) => !now.streams.some((n) => n.file === m.file)).map((m) => `stream ${m.file}`),
      ]
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
     * Tidy as listed, or nothing when the list moved on: git's part (checked after its fetch), then the landed threads
     * filed, the leftover processes ended, the idle workers killed and the old logs and stream months archived. A worker is checked again just before its kill,
     * since the fetch takes seconds: one no longer listed, or whose kill fails, is skipped and named, and the rest goes on.
     */
    const tidyProject = (projectId: string, plan: TidyPlan) =>
      onWorktrees(projectId, async (project) => {
        const release = await system.observe()
        try {
          const callsign = callsignsOf(readConfig())
          const gone = movedOn(plan, boardOf().floors.find((f) => f.id === projectId)!.tidy, callsign)
          if (gone.length) return apiError('refused', `Tidy's list moved on: ${gone.join(', ')} no longer qualif${gone.length === 1 ? 'ies' : 'y'}`)
          const git = plan.worktrees.length || plan.branches.length ? await tidy(project, projectId, occupants(), plan) : { removed: [], deleted: [], kept: [] }
          const now = new Date()
          for (const checkout of plan.threads) renameItem(paths, projectId, REVIEWS, threadId(checkout), landedThreadId(checkout, now))
          const reaps = plan.prune.flatMap((p) => (p.t === 'reap' ? [p] : []))
          const reaped = reap(system.running().filter((r) => reaps.some((p) => p.id === r.session && p.pid === r.pid)))
          void system.refreshRunning()
          const killed: string[] = []
          const skipped = git.kept.map((why) => `branch ${why}`)
          for (const p of plan.prune) {
            if (p.t !== 'kill') continue
            if (movedOn({ ...plan, threads: [], prune: [p], logs: [], streams: [] }, boardOf().floors.find((f) => f.id === projectId)!.tidy, callsign).length) {
              skipped.push(`worker ${callsign(p.id)}: no longer done with its purpose`)
              continue
            }
            const answer = await host({ t: 'kill', id: p.id })
            if (answer.t === 'error') skipped.push(`worker ${callsign(p.id)}: ${(answer as ApiError).message}`)
            else killed.push(p.id)
          }
          for (const { id } of plan.logs) await archiveLog(paths, id)
          const streams: string[] = []
          for (const { file } of plan.streams) {
            if (await archiveMonth(file)) streams.push(file)
            else skipped.push(`stream ${file}: archived by another floor's Tidy meanwhile`)
          }
          return { t: 'tidied', ...git, threads: plan.threads, reaped: reaped.map((r) => r.pid), killed, skipped, archived: plan.logs.map((l) => l.id), streams }
        } finally {
          release()
        }
      })

    /** A policy's file as it is now: its text's hash and its parse. */
    const policyFile = (project: string, policy: string): { hash: string; parsed: Parsed } | ApiError => {
      if (!isDeclared(project, POLICIES)) return apiError('not_found', `"${project}" keeps no policies: the \`${POLICIES}\` collection is declared in the config`)
      const text = readItem(paths, project, POLICIES, policy)
      if (text === undefined) return apiError('not_found', `${project}/${POLICIES} holds no policy "${policy}"`)
      return { hash: hashOf(text), parsed: parsePolicy(text) }
    }


    /** Why a policy can't take a fact for `slot`: it isn't valid, another runner acts on it, or `slot` is none of its slots up to now. */
    const slotRefusal = (policy: string, parsed: Parsed, slot: number | undefined): ApiError | undefined => {
      if (!parsed.ok) return apiError('refused', `The policy ${tagOf(policy)} is invalid: ${parsed.problems.map((p) => `${p.path}: ${p.message}`).join('; ')}`)
      if (parsed.header.runner !== undefined) return apiError('refused', `The policy ${tagOf(policy)} is left to the runner "${parsed.header.runner}"`)
      if (slot === undefined) return undefined
      if (slot > Date.now()) return apiError('refused', `${slotName(slot)} is still to come`)
      return slotsBetween(parsed.header.when, slot - 1, slot).includes(slot) ? undefined : apiError('invalid', `${slotName(slot)} is not one of the slots of ${tagOf(policy)} (${ruleWords(parsed.header.when)})`)
    }

    /** Appends a policy fact to its project's stream, and resolves once the system holds it, so the next request reads it. */
    const appendPolicyFact = async (project: string, stream: string, code: string, fact: object, held: (facts: PolicyFacts) => boolean) => {
      appendFact(projectStreamPath(paths, project, stream), stream, Date.now(), code, fact)
      await system.until(() => held(policyFactsOf(project)), TRACK_TIMEOUT_MS)
    }

    /** A policy's runs, passes and approvals are taken one at a time, each until the system holds its fact. */
    const onPolicy = (project: string, policy: string, act: () => Promise<Answer>) => inTurn(`policy ${project}/${policy}`, act)

    /**
     * A run of a policy: its file parsed now, a worker spawned on its prose with its `hire`, and the run fact appended. A
     * worker whose fact can't be appended is killed, so no run goes uncounted.
     */
    const runPolicy = (input: RouteInput['policy/run']) => {
      const { project, policy, by, check } = input
      const [slot, startFact] =
        input.start === 'hand' ? [undefined, { start: 'hand', slot: null } as const] : [input.slot, { start: input.start, slot: slotName(input.slot) } as const]
      return fromWorker(by, () =>
        onPolicy(project, policy, async () => {
          const file = policyFile(project, policy)
          if ('t' in file) return file
          const refused = slotRefusal(policy, file.parsed, slot)
          if (refused) return refused
          const { header, prompt } = file.parsed as Extract<Parsed, { ok: true }>
          if (input.start === 'auto' && !policyFactsOf(project).approvals.some(([, a]) => a.policy === policy && a.hash === file.hash)) return apiError('refused', `${tagOf(policy)} is not approved as it is now (${shortHash(file.hash)}): it starts on its own only on approved words`)
          if (slot !== undefined && policyFactsOf(project).runs.some(([, r]) => r.policy === policy && r.slot === slotName(slot))) return apiError('refused', `${tagOf(policy)} already ran for ${slotName(slot)}`)
          if (!system.live()) return apiError('unavailable', 'No host runs, so no worker can start: the user starts it with `tower up`')
          await system.refreshLive()
          const live = liveRuns(policy, policyFactsOf(project), everyCard(Date.now()))
          if (live.length >= header.live) return apiError('limited', `${live.map((c) => c.callsign).join(', ')} still run${live.length === 1 ? 's' : ''}: ${tagOf(policy)} runs at most ${header.live} at once (its \`live\`)`)
          const launch = { model: header.hire.model, effort: header.hire.effort, prompt }
          const answer = header.hire.cut ? await spawnCut(project, header.hire.cut, undefined, launch) : await spawnIn(project, header.hire.cwd, undefined, launch)
          if (answer.t !== 'spawned') return answer
          const { id } = answer as Replies['spawn']
          const fact: RunFact = { policy, hash: file.hash, id, ...(by && { by }), ...(check && { check }), ...startFact }
          try {
            await appendPolicyFact(project, RUNS_STREAM, 'r', fact, (facts) => facts.runs.some(([, r]) => r.id === id))
          } catch (err) {
            await host({ t: 'kill', id })
            return apiError('internal', `Session ${id} started but its run couldn't be recorded, so it was killed (it can be resumed): ${(err as Error).message}`)
          }
          await system.tracked(id, TRACK_TIMEOUT_MS)
          return { t: 'ran', id, n: policyFactsOf(project).runs.filter(([, r]) => r.policy === policy).length, hash: file.hash }
        }),
      )
    }

    /** A slot the runner saw and didn't start, and why: refused once the slot has a fact. */
    const passPolicy = ({ project, policy, slot, outcome, check }: RouteInput['policy/pass']) =>
      onPolicy(project, policy, async () => {
        const file = policyFile(project, policy)
        if ('t' in file) return file
        const refused = slotRefusal(policy, file.parsed, slot)
        if (refused) return refused
        if (slotSeen(policy, slot, policyFactsOf(project))) return apiError('refused', `${slotName(slot)} of ${tagOf(policy)} already has a fact`)
        const fact: PassFact = { policy, hash: file.hash, slot: slotName(slot), outcome, ...(check && { check }) }
        await appendPolicyFact(project, RUNS_STREAM, 's', fact, (facts) => slotSeen(policy, slot, facts))
        return OK
      })

    /** An approval of the words the approver read: refused unless `hash` is the file's now. */
    const approvePolicy = ({ project, policy, hash, by }: RouteInput['policy/approve']) =>
      fromWorker(by, () =>
        onPolicy(project, policy, async () => {
          const file = policyFile(project, policy)
          if ('t' in file) return file
          if (file.hash !== hash) return apiError('refused', `${tagOf(policy)} changed since it was read: its hash is ${shortHash(file.hash)} now, not ${shortHash(hash)}. Read it again, then approve what you read`)
          if (!file.parsed.ok) return apiError('refused', `The policy ${tagOf(policy)} is invalid: ${file.parsed.problems.map((p) => `${p.path}: ${p.message}`).join('; ')}`)
          const count = policyFactsOf(project).approvals.length
          const fact: ApprovalFact = { policy, hash, ...(by && { by }) }
          await appendPolicyFact(project, APPROVALS_STREAM, 'a', fact, (facts) => facts.approvals.length > count)
          return OK
        }),
      )

    const HANDLERS: { [R in Verb]: (input: RouteInput[R]) => Answer | Promise<Answer> } = {
      spawn: ({ project, cwd, cut, callsign, model, effort, prompt, by, hire }) => {
        const spawning = () => spawnedBy(() => (cut ? spawnCut(project, cut, callsign, { model, effort, prompt }) : spawnIn(project, cwd, callsign, { model, effort, prompt })), prompt, by)
        return hire ? hired(project, by!, prompt, spawning) : spawning()
      },
      resume: ({ id, conversation, prompt }) => resume(id, conversation, prompt),
      keys: ({ id, data, by }) => keys(id, data, by),
      submit: ({ id, text, by }) => submit(id, text, by),
      resize: ({ id, cols, rows }) => withSession(id, () => host({ t: 'resize', id, cols, rows })),
      kill: ({ id, by }) => kill(id, by),
      'let-go': ({ id }) => letGo(id),
      'probe/run': async ({ name }) => {
        const ran = await probeRunner.readNow(name)
        if ('t' in ran) return ran
        return { t: 'probed', at: ran.at, ms: ran.read.ms, ok: ran.read.ok, ...(!ran.read.ok && { error: ran.read.error }) }
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
      tidy: ({ project, plan }) => tidyProject(project, plan),
      'review/append': appendReview,
      'policy/run': runPolicy,
      'policy/pass': passPolicy,
      'policy/approve': approvePolicy,
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

    return { handlers: HANDLERS, stop }
  },
  halt: ({ stop }) => stop(),
})
export type DispatchResource = StartedResource<typeof dispatch>