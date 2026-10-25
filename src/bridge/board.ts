import type { Keys } from '../shared/keymap.ts'
import { MAIN_CHECKOUT, inProject, projectCollections, sessionDirs, projectDirs, worktreeName, worktreesConfig, hiringConfig, userName, configuredKeys, callsignsOf, type CollectionItem, type Config, type HiringConfig, type Project } from '../shared/model.ts'
import { launchPrompt } from '../shared/launch.ts'
import { reviewedIn, REVIEWS, stamp, threadId, unseenBy, type ReviewThread } from '../shared/reviews.ts'
import { tagOf } from '../shared/tags.ts'
import { crewOf, current, threadCheckoutOf, workerNamed } from '../shared/cards.ts'
import { HOST_PROTOCOL, type HostLive } from '../shared/protocol.ts'
import { claudeRange } from '../shared/claude.ts'
import type { SystemPaths } from '../shared/paths.ts'
import { shellActivity, type Shell } from '../shared/terms.ts'
import { claudeDefaults, type ClaudeDefaults } from './defaults.ts'
import { continuations, lineage, namer, threads, type SessionRef, type Thread } from './chains.ts'
import { cardRun, NO_POLICY_FACTS, offersOf, policyViews, type CardRun, type Offer, type PolicyFacts, type PolicyFile, type PolicyView } from './policies.ts'
import { POLICIES } from '../shared/policies.ts'
import { accountLimits, newestReading, NO_READS, probesOf, probeStatus, type LimitsFrom, type ExtraUsage, type ProbeFacts, type ProbeStatus } from './probes.ts'
import { killedOutside, type CrewEdge, type Exemption, type RateLimit, type Session, type Shown, type SubagentRun } from './facts.ts'
import type { Peer, Resource } from './resources.ts'
import { bucketStart, nextBucket, today, type Today } from './stats.ts'
import { withLiveness, type Status } from './status.ts'
import { awaitsResume, lifeOf, type Attention } from './life.ts'
import type { BlockedKind } from './blocked.ts'
import { prunable, type Prune } from './prunable.ts'
import { oldLogs, oldStreams, type LogFile, type OldLog, type OldStream, type StreamMonth } from './retention.ts'
import { withSeats, type Seat } from './seats.ts'
import {
  cardOffers,
  conversationOffers,
  floorOffers,
  noteActions,
  offered,
  probeOffers,
  resourceOffers,
  sendHomeActions,
  type CardAction,
  type CardCalls,
  type ProbeAction,
  type ProbeCalls,
  type ProbeVerb,
  type CardVerb,
  type ConversationAction,
  type ConversationCalls,
  type ConversationVerb,
  type FloorAction,
  type FloorCalls,
  type FloorVerb,
  type ResourceAction,
  type ResourceCalls,
  type ResourceVerb,
} from './verbs.ts'
import type { Adds, BoardAsk, Doors, ExtensionView } from '../shared/extensions.ts'
import { floorCollections, type ExtensionStores, type FloorCollectionType } from './stores.ts'
import { checkoutState, filedThreadOf, floorThreads, type CheckoutState, type FloorThread } from './reviews.ts'
import { deliveries, type Delivery } from './messages.ts'
import { commonBases, floorBranches, floorWorktrees, projectReads, treeAt, type FloorBranch, type FloorWorktree, type Occupant, type RepoRead } from './worktrees.ts'

/** Excerpts: the board goes to every viewer on every change; the full text is asked for per session. */
const EXCERPT_CHARS = 280

const excerpt = (text: string | undefined) => (text && text.length > EXCERPT_CHARS ? `${text.slice(0, EXCERPT_CHARS)}…` : text)

/** `promptBy`: the hirer whose prompt its latest is, while that is still the prompt the worker was hired on; else the prompt is the user's. */
export type CardConversation = Pick<Thread, 'id' | 'prompt' | 'answer' | 'resumes' | 'resumedBy'> & { promptBy?: string; startedAt: number; verbs: ConversationVerb[]; calls: ConversationCalls; actions: ConversationAction[] }

/** A process a session left running: `orphan` when re-parented to launchd. */
export type CardResource = { pid: number; command: string; ports: number[]; orphan: boolean; verbs: ResourceVerb[]; calls: ResourceCalls; actions: ResourceAction[] }

export type CardShown = Omit<Shown, 'at'> & { at: number; session: string }

/** A subagent the session started whose loop the tower follows (`SubagentRun` with an `id`), running while its loop is mid-turn in a live session. */
export type CardSubagent = SubagentRun & { id: string; running: boolean }

/** An html file the worker wrote, at its first write (epoch ms), and whether the worker showed it. */
export type CardPage = { path: string; at: number; shown: boolean }

/** A message the worker sent another Claude session, with the callsign of the worker that received it. */
export type CardSent = Delivery & { callsign?: string }

/**
 * Why a past worker can't be resumed where it ran: its cwd is no longer one of its floor's folders (`outside`: the
 * floor's dirs moved, or it left the config), or it is a worktree whose folder is gone (`gone`: removed, or deleted).
 */
export type Unresumable = 'outside' | 'gone'

export type Card = {
  id: string
  callsign: string
  /** The Claude session name its peers message it by (`SendMessage`'s `to`), while its Claude runs. */
  peer?: string
  project: string
  cwd: string
  /**
   * The worktree its cwd is, by name, the branch checked out there (none on a detached HEAD, or before git is read) and,
   * for a fork, the checkout it was forked from; `gone` once git no longer lists it with its folder in every repo of the
   * project (`checkoutGone`).
   */
  worktree?: { name: string; branch?: string; from?: string; gone: boolean }
  /** The callsign of the worker whose work this one reviews, named by its first prompt (`reviewPrompt`). */
  reviews?: string
  /** The worker that hired this one (`tower hire`, `tower review`); a worker started any other way has none. */
  hiredBy?: HiredBy
  /** The worker a launch contributor put this one in the crew of at its spawn (`tower.reports-to`), and the capability that did. @since 1.85 */
  crew?: CrewEdge
  /** What launch contributors exempted this worker from at its spawn (`tower.exempt`), each by its capability. @since 1.85 */
  exempt?: Exemption[]
  /**
   * The card of the worker this one reports to, as it runs now (its hirer or author carried on through resumes): the
   * author whose work it reviews, else the worker of its `crew` edge, else its hirer. Only a worker's current card
   * reports; nobody's when it reports to none.
   */
  reportsTo?: string
  /** The checkout it works in: its worktree's name, or `main`. */
  checkout: string
  /** Where the work in its checkout stands: what its Changes are. */
  checkoutState: CheckoutState
  /**
   * Where the work its review thread is about stands (`threadCheckoutOf`: a reviewer's is its author's), with the thread
   * Tidy filed once it landed. The card offers `note` while it is live.
   */
  threadState: CheckoutState
  /**
   * The messages of the review thread about its work (`threadCheckoutOf`: a reviewer's is its author's) it hasn't seen
   * (after its own last one); none without a thread, or once `threadState` is no longer live.
   */
  unseen?: number
  status: Status
  /** The screen a `blocked` worker shows: answered on its terminal. */
  blocked?: BlockedKind
  /** Its PTY is running: the screen is live and it takes keys. */
  live: boolean
  /**
   * Waiting on the user since `enteredAt`: held by a screen or a question, or an outcome nobody has typed to since,
   * unless that outcome is an answer its running hirer is to read (`waitsOn`).
   */
  waiting: boolean
  /**
   * It runs and asked to go home (`tower home` with its own callsign) with no prompt since: once its turn completes, the
   * tower runs its `send-home`. Its outcome waits on nobody; a screen or a question
   * still waits on the user, since the turn can't end until someone answers it.
   */
  leaving: boolean
  /** The worker whose prompt a hire's unread answer answers: its hirer as it runs now, while that runs. */
  waitsOn?: { id: string; callsign: string }
  attention: Attention
  /** Epoch ms the session entered `status`. */
  enteredAt: number
  /** Epoch ms someone last typed into the session. */
  typedAt?: number
  /** Epoch ms Claude last raised a hook or a mod event. */
  heardAt?: number
  /** Working with no word from Claude for `STUCK_MS`: a hung tool, or a long build. */
  stuck: boolean
  /**
   * Its log holds an event the tower can't fold (`Facts.broken`): the error, the event's code and its time (epoch ms).
   * Its facts stand as they were before it and are never folded on, so it waits on no one and is never stuck; whether
   * it runs is the host's word, so it can still be driven and killed, or resumed once it no longer runs.
   */
  broken?: { message: string; code: string; at: number }
  startedAt: number
  cols: number
  rows: number
  context?: number
  costUsd?: number
  tool?: string
  /** Claude is compacting the conversation, inside a turn or by `/compact`. */
  compacting: boolean
  /** What Claude told the user between tool calls in the current turn, oldest first. */
  says: string[]
  /** The subagents the session started, followed or not. */
  subagents: number
  /** The subagents the session started whose loops it follows, oldest first. */
  subagentRuns: CardSubagent[]
  /** The main loop's turns that ran to their Stop, across the sessions the worker ran as. */
  turns: number
  /** The sessions the worker ran as, oldest first, ending with this one. */
  lineage: LineageSession[]
  model?: string
  effort?: string
  /** The release of Claude Code the session runs, once the mod reported it. */
  claude?: string
  /** Its Claude is outside the releases the tower is tested on (`CLAUDE_TESTED`). */
  claudeUntested: boolean
  /** What the session left running, each with the verb that ends it alone. */
  resources: CardResource[]
  /** What the worker showed the user across the sessions it ran as, oldest first; `at` in epoch ms, `session` the one that showed it. */
  shown: CardShown[]
  /** The html files the worker wrote across the sessions it ran as, oldest first. */
  pages: CardPage[]
  /** The messages it sent other Claude sessions across the sessions it ran as, oldest first. */
  sent: CardSent[]
  /** Ended while nobody meant it to end: the host stopped or died, or a signal from outside the tower killed it. */
  stranded: boolean
  /**
   * Stranded mid-turn: it stopped or was lost while the main loop's turn ran (`isMidTurn`); a broken fold
   * doesn't know where the turn stood. Its `carry-on`
   * resumes it on a prompt telling Claude so (`CARRY_ON`).
   */
  cutOff: boolean
  /** When the user let it go, stranded (epoch ms): off duty, its conversation still resumable from the archive. */
  letGoAt?: number
  /** Not running, holding a conversation nobody resumed, which can't be resumed where it ran: why. */
  unresumable?: Unresumable
  /** The conversations Claude saved, in order: the last is the one a resume continues. */
  conversations: CardConversation[]
  /** The session that carries this worker on, holding its callsign and showings from then on. */
  continuedBy?: SessionRef
  /** Running, or stopped by the host or lost while its latest conversation waits to be resumed and can be, unless let go. */
  onDuty: boolean
  /** The run of a policy it is, through every resume: a run fact names the first session of its lineage. */
  run?: CardRun
  /** Where it sits on its floor, replayed from the floor's comings and goings (`withSeats`): every on-duty card has one. */
  seat?: Seat
  verbs: CardVerb[]
  calls: CardCalls
  /** What can be done with it now, each verb with its call when it has one: `verbs` and `calls` say the same, apart. */
  actions: CardAction[]
  /** Each extension's own part of it, by capability, as its card fold made it (decision `extensions`). @since 1.84 */
  x?: Record<string, unknown>
}

/** A session of a worker's lineage, and when it started (epoch ms). */
export type LineageSession = { id: string; startedAt: number }

/** A showing in a floor's gallery: what was shown, under the worker that carries it now. */
export type GalleryShowing = { worker: SessionRef; shown: CardShown }

export type { SessionRef }

/** A hirer: the session it hired from, its callsign, and the floor it works on, which a hire on another floor doesn't share. */
export type HiredBy = { session: string; callsign: string; project: string }

/** The worker that kept an item (`tower keep`), in the conversation it was in. An item made any other way has none. */
export type KeptBy = { session: string; callsign: string; conversation?: string }

/** `tag`: what the item is called on screen and by workers (`tagOf`). */
export type FloorItem = Pick<CollectionItem, 'id' | 'size' | 'modifiedAt'> & {
  tag: string
  keptBy?: KeptBy
  /** The part of the extension that declares its collection, as its item fold made it. @since 1.84 */
  x?: Record<string, unknown>
}

/**
 * One of a floor's collections, every project's and its own, with the files it holds in id order. `dir`: where they
 * are on disk, an item's file being `<dir>/<id>`. `description`: what it is for, as the config says.
 */
/**
 * A floor's collection. `owner`: the capability that alone writes it, an extension's (decision `extensions`): the
 * generic writes are refused there. `doors`: how others list, read, create, edit and delete its items, as its extension
 * declares them, each a verb or read, or why the domain has none.
 */
export type FloorCollection = { id: string; label: string; description?: string; owner?: string; doors?: Doors; dir: string; items: FloorItem[] }

/**
 * A project as a floor: its config, shelf included, its sessions' cards, its collections, and the tower's worktrees and
 * kept branches in its repos. `bases`: the origin branches a cut can start from, the default first; empty when a dir
 * isn't a git repo with an origin.
 */
export type Floor = Omit<Project, 'collections' | 'worktrees' | 'hiring' | 'brief' | 'extensions' | 'capabilities'> & {
  id: string
  /** The cards of its present (`onBoard`); the rest are its archive, read at `GET /archive/<project>`. */
  cards: Card[]
  /** How many cards its archive holds. */
  archived: number
  collections: FloorCollection[]
  worktrees: FloorWorktree[]
  branches: FloorBranch[]
  /** The review thread of each checkout that has one, when the floor keeps the `reviews` collection. */
  threads: FloorThread[]
  /** Its policies, in id order, when the floor keeps the `policies` collection (decision `policies`). */
  policies: PolicyView[]
  /** The floor's last showings, any worker's, on duty or not, newest first (`galleryOf`). */
  gallery: GalleryShowing[]
  bases: string[]
  /** What a cut's branch is named by default: this, then the worktree's name. */
  branchPrefix: string
  /** Whether a new worker starts in a worktree of its own unless told where, when the floor can cut one. */
  cutByDefault: boolean
  /** How far its workers hire workers through `tower hire`. */
  hiring: Required<HiringConfig>
  /** What its Tidy would do now, as its call applies it. */
  tidy: TidyPlan
  verbs: FloorVerb[]
  calls: FloorCalls
  actions: FloorAction[]
  /** Each extension's own part of it, by capability, as its floor fold made it. @since 1.84 */
  x?: Record<string, unknown>
}

/**
 * A floor's Tidy, as listed: the removable worktrees and absorbed kept branches by name, the review threads whose work
 * has landed by checkout, the processes and workers to end (`prunable`), and the logs to archive (`oldLogs`): the
 * floor's sessions', and the closed months (`oldStreams`) of the floor's own streams and of the system's, which every
 * floor's Tidy lists.
 */
export type TidyPlan = { worktrees: string[]; branches: string[]; threads: string[]; prune: Prune[]; logs: OldLog[]; streams: OldStream[] }

/**
 * Why a worker waits on you: `blocked` by a screen, `asks` a question, or holds an outcome nobody has typed to since,
 * `failed` or `done`.
 */
export type WaitReason = 'blocked' | 'asks' | 'failed' | 'done'

/**
 * One wait of one worker. `key` (`id@since`) names this wait alone: the worker's next wait has another, so a renderer
 * keys what it does about a wait (a notification, a dismissal, a visit) on it. `since`: epoch ms, the card's `enteredAt`.
 * `detail`: the screen that blocks it, or the tool it asks to run, when known.
 */
export type Wait = { id: string; key: string; reason: WaitReason; since: number; detail?: string }

export type Board = {
  /** The person running the tower: `name` signs the notes renderers write for them (`user.name` in the config). */
  user: { name: string }
  /** The config file's path: the system root, where the logs and collections are, is its directory. */
  config: string
  /** Every command's chords by id, the config's `keys` over the keymap's defaults (`/keymap.js`). */
  keys: Keys
  floors: Floor[]
  /** Who waits on you, in the order to go to them. */
  waiting: Wait[]
  /** Every floor's open offers, oldest first: a policy's slot waiting for someone to start it, until its next slot. */
  offers: Offer[]
  /**
   * The latest change to any archived card (epoch ms; 0 with none archived): a renderer holding a floor's archive reads
   * it again when this or the floor's `archived` moves.
   */
  archiveAt: number
  rateLimits: RateLimit[]
  /**
   * When the rate limits were read (epoch ms): a session's turn reads them, and the quota probe while no turn does,
   * so they age only while neither reads.
   */
  rateLimitsAt?: number
  /** Whose reading the rate limits are: a session's turn, or a probe's read. */
  rateLimitsFrom?: LimitsFrom
  /** Every probe the config runs, the core's first, as its stream says it stands (decision `probes`), and `run`, a read now. */
  probes: (ProbeStatus & { verbs: ProbeVerb[]; calls: ProbeCalls; actions: ProbeAction[] })[]
  /** The account's extra usage, as the probes' newest answer that had it said. */
  extraUsage?: ExtraUsage
  /** Every extension the tower found, bundled first, then by id, as it stands: started, or why not (decision `extensions`). */
  extensions: ExtensionView[]
  /**
   * What extensions' folds added to each subject, by its key (`card:<id>`, `floor:<project>`, `board`,
   * `conversation:<id>`, `item.<collection>:<project>/<id>`, `<cap>.<kind>:<key>`), each tagged with its capability:
   * `actionsOf` and `badgesOf` in `/cards.js` draw them beside the core's. @since 1.84
   */
  adds: Record<string, Adds>
  /** What extensions' folds ask of the user, oldest first: in the attention order beside `waiting`. @since 1.84 */
  asks: BoardAsk[]
  /** Each extension's own part of the board, by capability, as its board fold made it. @since 1.84 */
  x?: Record<string, unknown>
  /** Today so far, every project's: it moves with the facts the board moves with, so it is as of the last change. */
  today: Today
  hostUp: boolean
  /** The running host speaks another protocol than its clients: it predates their code, until it is restarted. */
  hostOutdated: boolean
  /** The model and effort Claude starts a new worker on when asked for neither, as the sessions showed them. */
  claudeDefaults: ClaudeDefaults
  /** The releases outside the tested range that live workers run, each once. */
  claudeUntested: string[]
  shells: (Shell & { activity: string })[]
  termsUp: boolean
}

const REASON_OF: Partial<Record<Status, WaitReason>> = { blocked: 'blocked', needs_input: 'asks', failed: 'failed', done: 'done' }

/** Nothing happens behind a screen or a question until you answer, so those come first, then failures, then answers. */
const REASON_RANK: WaitReason[] = ['blocked', 'asks', 'failed', 'done']

const waitOf = (c: Card): Wait => {
  const reason = REASON_OF[c.status]!
  const detail = reason === 'blocked' ? c.blocked : reason === 'asks' ? c.tool : undefined
  return { id: c.id, key: `${c.id}@${c.enteredAt}`, reason, since: c.enteredAt, ...(detail && { detail }) }
}

/** The waits in the order to go to them: by reason, then whoever has waited longest. */
export const waitingOrder = (cards: Card[]): Wait[] =>
  cards
    .filter((c) => c.waiting)
    .map(waitOf)
    .sort((a, b) => REASON_RANK.indexOf(a.reason) - REASON_RANK.indexOf(b.reason) || a.since - b.since)

/** Showing a target again, in any session of the worker, moves it last. */
const shownBy = (worker: Session[]): CardShown[] =>
  worker
    .flatMap(({ header, facts }) => facts.shown.map((s) => ({ ...s, at: header.startedAt + s.at * 1000, session: header.id })))
    .filter((s, i, all) => !all.slice(i + 1).some((later) => later.target === s.target))

/**
 * Whether the worktree `cwd` is in is gone, by what git reads of the floor's worktrees (`reads`, `undefined` until every
 * dir of it was read once, when nothing is gone yet). A project dir is taken to exist; a worktree, while git lists it
 * with its folder in every repo of the project, as a resume or a fork needs them all.
 */
export const checkoutGone = (project: Project, cwd: string, reads: RepoRead[] | undefined): boolean =>
  worktreeName(project, cwd) !== undefined && reads !== undefined && !sessionDirs(project, cwd).every((dir) => treeAt(reads, dir)?.present)

/** Why a session in `cwd` can't be resumed there, by the config and what git reads of the floor's worktrees. */
export const unresumableAt = (project: Project | undefined, cwd: string, reads: RepoRead[] | undefined): Unresumable | undefined => {
  if (project === undefined || !inProject(project, cwd)) return 'outside'
  return checkoutGone(project, cwd, reads) ? 'gone' : undefined
}

/** `projectRead`: the reads of the project's dirs, `undefined` until each was read once. */
const cardWorktree = (project: Project | undefined, cwd: string, reads: RepoRead[], projectRead: RepoRead[] | undefined): Card['worktree'] => {
  const name = project && worktreeName(project, cwd)
  const tree = treeAt(reads, cwd)
  return name === undefined ? undefined : { name, branch: tree?.branch, from: tree?.from, gone: checkoutGone(project!, cwd, projectRead) }
}

const card = (
  session: Session,
  sessions: Session[],
  continued: Map<Session, Session>,
  liveIds: Set<string>,
  running: Resource[],
  peers: Peer[],
  worktree: Card['worktree'],
  unresumableHere: Unresumable | undefined,
  threadOf: (checkout: string) => ReviewThread | undefined,
  forkable: boolean,
  hirers: Map<string, HiredBy>,
  delivered: Map<string, Delivery[]>,
  callsignOf: (id: string) => string,
  now: number,
  nameOf: (s: Session) => string,
  runOf: (first: string, project: string) => CardRun | undefined,
): Unplaced => {
  const { header, facts } = session
  const worker = lineage(session, (s) => continued.get(s))
  const callsign = nameOf(session)
  const launch = launchPrompt(worker[0].header.argv)
  const reviews = reviewedIn(launch)
  const hiredBy = hirers.get(worker[0].header.id)
  const checkout = worktree?.name ?? MAIN_CHECKOUT
  const thread = threadOf(threadCheckoutOf({ reviews, worktree, checkout }))
  const state = withLiveness(facts.state, header.id, liveIds)
  const held = threads(session, sessions, nameOf)
  const typedAt = facts.typedAt === undefined ? undefined : header.startedAt + facts.typedAt * 1000
  const heardAt = facts.heardAt === undefined ? undefined : header.startedAt + facts.heardAt * 1000
  const enteredAt = header.startedAt + state.since * 1000
  const life = lifeOf(
    {
      state: { ...state, since: enteredAt },
      endedFrom: facts.exitedFrom ?? facts.state.status,
      hostStopped: facts.hostStopped === true,
      killedOutside: killedOutside(facts.exitCode, facts.signal),
      broken: facts.broken !== undefined,
      typedAt,
      heardAt,
      leaveAsked: facts.leaveAt !== undefined,
      letGoAt: facts.letGoAt === undefined ? undefined : header.startedAt + facts.letGoAt * 1000,
      unresumableHere,
      conversations: held,
    },
    now,
  )
  const conversations = held.map(({ id, at, prompt, answer, resumes, resumedBy }) => ({
    id,
    startedAt: header.startedAt + at * 1000,
    prompt: excerpt(prompt),
    promptBy: hiredBy && prompt !== undefined && prompt === launch ? hiredBy.callsign : undefined,
    answer: excerpt(answer),
    resumes,
    resumedBy,
    ...conversationOffers(header.id, id, life.live, !life.unresumable, resumedBy),
  }))
  const shown = shownBy(worker)
  const continuedBy = [...continued].find(([, before]) => before === session)?.[0].header.id
  const resources = running
    .filter((r) => r.session === header.id)
    .map(({ pid, command, ports, orphan }) => ({ pid, command, ports, orphan, ...resourceOffers(header.id, pid) }))
  return {
    id: header.id,
    callsign,
    peer: peers.find((p) => p.session === header.id)?.name,
    project: header.project,
    cwd: header.cwd,
    worktree,
    reviews,
    hiredBy,
    crew: worker[0].facts.reportsTo,
    ...(worker[0].facts.exempt.length && { exempt: worker[0].facts.exempt }),
    checkout,
    unseen: thread && unseenBy(thread, callsign).length,
    ...life,
    enteredAt,
    typedAt,
    heardAt,
    broken: facts.broken && { ...facts.broken, at: header.startedAt + facts.broken.at * 1000 },
    startedAt: header.startedAt,
    cols: facts.cols,
    rows: facts.rows,
    context: facts.context,
    costUsd: facts.costUsd,
    tool: facts.tool,
    says: facts.says,
    subagents: facts.subagentRuns.length,
    subagentRuns: facts.subagentRuns.filter((run): run is SubagentRun & { id: string } => run.id !== undefined).map((run) => ({ ...run, running: life.live && run.endedAt === undefined })),
    turns: worker.reduce((sum, s) => sum + s.facts.turns, 0),
    lineage: worker.map((s) => ({ id: s.header.id, startedAt: s.header.startedAt })),
    model: facts.model,
    effort: facts.effort,
    claude: facts.claude,
    claudeUntested: facts.claude !== undefined && claudeRange(facts.claude) !== 'tested',
    resources,
    shown,
    pages: worker
      .flatMap((s) => s.facts.pages)
      .filter(([, path], i, all) => all.findIndex(([, p]) => p === path) === i)
      .map(([at, path]) => ({ path, at, shown: shown.some((s) => s.target === path) })),
    sent: worker.flatMap((s) => delivered.get(s.header.id) ?? []).map((d) => (d.session ? { ...d, callsign: callsignOf(d.session) } : d)),
    conversations,
    continuedBy: continuedBy === undefined ? undefined : { id: continuedBy, callsign },
    run: runOf(worker[0].header.id, header.project),
    ...cardOffers(header.id, life.status, !life.unresumable, conversations, resources.length, forkable && !reviews && !worktree?.gone ? { project: header.project, checkout, callsign } : undefined, awaitsResume(life), life.cutOff),
  }
}

/** A card before the worktrees are read for who is in them: what its checkouts' states are folded from. */
type Unplaced = Omit<Card, 'checkoutState' | 'threadState'>

/** How many of a floor's last showings its gallery holds. */
const GALLERY_SHOWINGS = 12

/**
 * A floor's last showings, any worker's, on duty or not, newest first. A worker carried on by a resume holds its
 * showings under the card that carries them now, so each is counted once.
 */
export const galleryOf = (cards: Card[]): GalleryShowing[] =>
  cards
    .filter((card) => !card.continuedBy)
    .flatMap((card) => card.shown.map((shown) => ({ worker: { id: card.id, callsign: card.callsign }, shown })))
    .sort((a, b) => b.shown.at - a.shown.at)
    .slice(0, GALLERY_SHOWINGS)

/** Only declared collections reach the board: a directory nobody declared is not one. */
const itemKey = (project: string, collection: string, id: string) => `${project}/${collection}/${id}`

const keepers = (sessions: Session[], nameOf: (s: Session) => string): Map<string, KeptBy> =>
  new Map(
    sessions.flatMap((session) =>
      session.facts.kept.map((k) => [itemKey(k.project, k.collection, k.id), { session: session.header.id, callsign: nameOf(session), conversation: k.conversation }] as const),
    ),
  )

/** A session's card as it runs now: the card of the session that carries it on, through every resume. */
export const carriedOn = (byId: Map<string, Card>, id: string): Card | undefined => {
  const c = byId.get(id)
  return c?.continuedBy ? carriedOn(byId, c.continuedBy.id) : c
}

/**
 * An answer is read by whoever asked: a hire's, to its hirer's prompt, by the hirer while it runs. A screen, a question
 * or a failure still waits on the user, as does the answer to a prompt the user gave.
 */
const answerWait = (c: Card, hirer: Card | undefined): Pick<Card, 'waiting' | 'waitsOn'> | undefined =>
  c.waiting && c.status === 'done' && current(c)?.promptBy && hirer?.live ? { waiting: false, waitsOn: { id: hirer.id, callsign: hirer.callsign } } : undefined

/** Each worker's current card with whom it reports to and whom its answer waits on. */
export const withReports = (cards: Card[]): Card[] => {
  const byId = new Map(cards.map((c) => [c.id, c]))
  return cards.map((c) => {
    if (c.continuedBy) return c
    const hirer = c.hiredBy && carriedOn(byId, c.hiredBy.session)
    const to = c.reviews ? workerNamed(cards.filter((a) => a.project === c.project && !a.continuedBy), c.reviews) : c.crew ? carriedOn(byId, c.crew.session) : hirer
    return { ...c, ...(to && { reportsTo: to.id }), ...answerWait(c, hirer) }
  })
}

/** Each worker's current card with whom it reports to and whom its answer waits on, and the floor's `send-home` on it. */
const withCrews = (cards: Card[]): Card[] => {
  const reporting = withReports(cards)
  return reporting.map((c) => {
    const home = sendHomeActions([c, ...crewOf(reporting, c)])
    return home.length ? { ...c, ...offered([...c.actions, ...home]) } : c
  })
}

/** Each hired session, by id, with the worker that hired it. */
const hirersOf = (sessions: Session[], nameOf: (s: Session) => string): Map<string, HiredBy> =>
  new Map(sessions.flatMap((session) => session.facts.hired.map((id) => [id, { session: session.header.id, callsign: nameOf(session), project: session.header.project }] as const)))

const collectionsOf = (collections: Record<string, FloorCollectionType>, projectId: string, root: string, items: CollectionItem[], keptBy: Map<string, KeptBy>): FloorCollection[] =>
  Object.entries(collections).map(([id, { label, description, owner, doors }]) => ({
    id,
    label,
    description,
    ...(owner && { owner }),
    ...(doors && { doors }),
    dir: `${root}/${projectId}/${id}`,
    items: items
      .filter((i) => i.project === projectId && i.collection === id)
      .map((i) => ({ id: i.id, tag: tagOf(i.id), size: i.size, modifiedAt: i.modifiedAt, keptBy: keptBy.get(itemKey(i.project, i.collection, i.id)) })),
  }))

/**
 * Who is in a worktree: the workers on duty, running or stranded until resumed or let go, and the shells. A stranded
 * worker resumes in its folder, so its worktree is held for it.
 */
export const occupantsOf = (cards: Pick<Card, 'id' | 'cwd' | 'onDuty'>[], shells: Shell[] | undefined): Occupant[] => [
  ...cards.filter((c) => c.onDuty).map(({ id, cwd }) => ({ id, cwd })),
  ...(shells ?? []).map(({ id, cwd }) => ({ id, cwd })),
]

/**
 * Whether a card is the floor's present, carried on the board: on duty, waiting, leaving something running, or started
 * since `dayStart` (epoch ms, the local day's start). Every other card is archived.
 */
export const onBoard = (dayStart: number) => (c: Card) => c.onDuty || c.waiting || c.resources.length > 0 || c.startedAt >= dayStart

/** A project's archived cards, newest first. */
export const archiveOf = (cards: Card[], project: string, now: number): Card[] => {
  const kept = onBoard(bucketStart(now, 'day'))
  return cards.filter((c) => c.project === project && !kept(c)).sort((a, b) => b.startedAt - a.startedAt)
}

/**
 * When an archived card last changed, as its facts tell: it ended, its day ended (it left the board), or a session
 * resumed one of its conversations.
 */
const changedAt = (c: Card, startedAtOf: (id: string) => number) =>
  Math.max(
    c.enteredAt,
    nextBucket(bucketStart(c.startedAt, 'day'), 'day'),
    ...c.conversations.flatMap((conv) => (conv.resumedBy ? [startedAtOf(conv.resumedBy.id)] : [])),
  )

/** The latest change to any of the `archived` cards (`changedAt`); 0 with none. `cards`: every card, the resumers among them. */
export const archiveAtOf = (cards: Card[], archived: Card[]) => {
  const startedAt = new Map(cards.map((c) => [c.id, c.startedAt]))
  return Math.max(0, ...archived.map((c) => changedAt(c, (id) => startedAt.get(id)!)))
}

const keepsThreads = (config: Config, projectId: string) => Object.hasOwn(config.projects, projectId) && Object.hasOwn(projectCollections(config, projectId), REVIEWS)

/**
 * Each card with where its checkout's work stands and where its thread's does (`checkoutState`): `review` only while the
 * former goes on, `note` and the notes new to it (`unseen`) only while the latter does, `note` on a floor keeping threads. Who is in a worktree is folded from the cards on duty and the shells, as
 * the board's floors fold it. `threadFiles`: the review thread files of floors keeping threads.
 */
const withCheckouts = (
  config: Config,
  cards: Unplaced[],
  shells: Shell[] | undefined,
  repos: Map<string, RepoRead>,
  threadFiles: { project: string; id: string }[],
): Card[] => {
  const occupants = occupantsOf(cards, shells)
  const floors = new Map(Object.entries(config.projects).map(([id, project]) => [id, floorGit(config, id, project, repos, occupants)]))
  return cards.map((c) => {
    const floor = floors.get(c.project)
    const stateOf = (checkout: string): CheckoutState => {
      if (!floor) return { is: 'gone' }
      const filed = filedThreadOf(threadFiles.filter((t) => t.project === c.project), checkout, stamp(new Date(c.startedAt)))
      return checkoutState(checkout, floor.read, floor.worktrees, floor.branches, filed)
    }
    const ownState = stateOf(c.checkout)
    const threadCheckout = threadCheckoutOf(c)
    const threadState = stateOf(threadCheckout)
    const threadLive = threadState.is === 'live'
    const note = noteActions(c.project, threadCheckout, keepsThreads(config, c.project) && threadLive)
    const reviewable = ownState.is === 'live'
    return {
      ...c,
      checkoutState: ownState,
      threadState,
      unseen: threadLive ? c.unseen : undefined,
      ...offered<CardVerb, CardCalls>([...c.actions.filter((a) => reviewable || a.verb !== 'review'), ...note]),
    }
  })
}

/** A floor's worktrees and kept branches as git reads them, `read` `undefined` until every dir of it was read once. */
const floorGit = (config: Config, projectId: string, project: Project, repos: Map<string, RepoRead>, occupants: Occupant[]) => {
  const read = projectReads(projectDirs(project), repos)
  return { read, worktrees: floorWorktrees(projectId, read ?? [], occupants, keepsThreads(config, projectId)), branches: floorBranches(projectId, read ?? []) }
}

/** Every policy item, parsed, and each project's policy facts, by project. */
export type Policies = { files: PolicyFile[]; facts: Map<string, PolicyFacts> }

export const NO_POLICIES: Policies = { files: [], facts: new Map() }

/**
 * Every session's card, archived or not, from the sessions, host, processes, peers, shells, threads, repos, policies and now of `view`: what the board and the archive are cut from. `repos`: what git says in each
 * project dir (`src/worktrees.ts`), by dir. `shells`: the terms daemon's, which hold a worktree in use as a session
 * does. `threads`: every review thread file, parsed. `now`: epoch ms.
 */
export const allCards = ({ config, sessions, host, processes, peers, shells, threads, repos, policies, now }: SystemView): Card[] => {
  const continued = continuations(sessions)
  const runOf = (first: string, project: string) => cardRun(first, policies.files.filter((f) => f.project === project), policies.facts.get(project) ?? NO_POLICY_FACTS)
  const reads = [...repos.values()]
  const threadFiles = threads.filter((t) => keepsThreads(config, t.project))
  const threadAt = (projectId: string) => (checkout: string) => threadFiles.find((t) => t.project === projectId && t.id === threadId(checkout))?.thread
  const forkable = (projectId: string) => {
    const project = config.projects[projectId]
    return project !== undefined && (projectReads(projectDirs(project), repos)?.every((r) => r.git) ?? false)
  }
  const nameOf = namer(continued, callsignsOf(config))
  const hirers = hirersOf(sessions, nameOf)
  const delivered = deliveries(sessions)
  const byId = new Map(sessions.map((s) => [s.header.id, s]))
  const callsignOf = (id: string) => nameOf(byId.get(id)!)
  const projectRead = (p: Project | undefined) => p && projectReads(projectDirs(p), repos)
  const unresumableOf = ({ project, cwd }: Session['header']) => unresumableAt(config.projects[project], cwd, projectRead(config.projects[project]))
  const placed = sessions.map((s) =>
    card(
      s,
      sessions,
      continued,
      host?.ids ?? new Set(),
      processes,
      peers,
      cardWorktree(config.projects[s.header.project], s.header.cwd, reads, projectRead(config.projects[s.header.project])),
      unresumableOf(s.header),
      threadAt(s.header.project),
      forkable(s.header.project),
      hirers,
      delivered,
      callsignOf,
      now,
      nameOf,
      runOf,
    ),
  )
  return withSeats(withCrews(withCheckouts(config, placed, shells, repos, threadFiles)))
}

/** The newest answer's extra usage among the probes'. */
const extraUsageOf = (probes: ProbeFacts[]): { extraUsage?: ExtraUsage } => {
  const newest = probes.reduce<ExtraUsage | undefined>((a, p) => (p.extraUsage && (!a || p.extraUsage.at > a.at) ? p.extraUsage : a), undefined)
  return newest ? { extraUsage: newest } : {}
}

/**
 * Everything the board is derived from, read once: a snapshot of the system. `repos`: what git says in each project dir
 * (`src/worktrees.ts`), by dir; a floor shows no worktrees until all its dirs are read. `logFiles`: each session's log
 * file, by session id. `paths`: where the system keeps its config and its collections. `threads`: every review thread
 * file, parsed. `processes`: what sessions left running. `now`: epoch ms, the day `today` covers and the board keeps.
 */
export type SystemView = {
  config: Config
  sessions: Session[]
  host: HostLive | undefined
  processes: Resource[]
  peers: Peer[]
  shells: Shell[] | undefined
  items: CollectionItem[]
  threads: { project: string; id: string; thread: ReviewThread }[]
  repos: Map<string, RepoRead>
  logFiles: Map<string, LogFile>
  probes: Map<string, ProbeFacts>
  streams: StreamMonth[]
  policies: Policies
  /** Every extension as it stands (`src/bridge/extensions.ts`). */
  extensions: ExtensionView[]
  /** The stores of the extensions the tower accepted: their collections join the floors they are on. */
  stores: ExtensionStores[]
  paths: Pick<SystemPaths, 'config' | 'collections'>
  now: number
}

export const board = (view: SystemView): Board => {
  const { config, sessions, host, shells, items, threads, repos, logFiles, probes, streams, policies, extensions, stores, paths, now } = view
  const continued = continuations(sessions)
  const threadFiles = threads.filter((t) => keepsThreads(config, t.project))
  const cards = allCards(view)
  const policiesOf = (id: string): PolicyView[] =>
    Object.hasOwn(projectCollections(config, id), POLICIES)
      ? policyViews(id, policies.files.filter((f) => f.project === id), policies.facts.get(id) ?? NO_POLICY_FACTS, cards.filter((c) => c.project === id), host !== undefined, now)
      : []
  const floorPolicies = new Map(Object.keys(config.projects).map((id) => [id, policiesOf(id)]))
  const kept = onBoard(bucketStart(now, 'day'))
  const keptBy = keepers(sessions, namer(continued, callsignsOf(config)))
  const occupants = occupantsOf(cards, shells)
  const limits = accountLimits(sessions.map((s) => s.facts), [...probes.values()])
  const systemStreams = oldStreams(streams.filter((m) => m.file.startsWith('system/')), config.retention?.days, now)
  return {
    user: { name: userName(config) },
    keys: configuredKeys(config),
    config: paths.config,
    floors: Object.entries(config.projects).map(([id, { collections: _, worktrees: __, hiring: ___, brief: ____, extensions: _____, capabilities: ______, ...project }]) => {
      const { read, worktrees, branches } = floorGit(config, id, project, repos, occupants)
      const bases = commonBases(read ?? [])
      const floorCards = cards.filter((c) => c.project === id)
      const present = floorCards.filter(kept)
      const mainInUse = floorCards.some((c) => c.live && c.checkout === MAIN_CHECKOUT)
      const floorThreadsNow = floorThreads(id, threadFiles.filter((t) => t.project === id), read, worktrees, branches, mainInUse)
      const tidy: TidyPlan = {
        worktrees: worktrees.filter((w) => w.state === 'removable').map((w) => w.name),
        branches: branches.filter((b) => b.absorbed).map((b) => b.name),
        threads: floorThreadsNow.filter((t) => t.landed).map((t) => t.checkout),
        prune: prunable(floorCards, worktrees, cards),
        logs: oldLogs(floorCards, logFiles, config.retention?.days, now),
        streams: [...systemStreams, ...oldStreams(streams.filter((m) => m.file.startsWith(`projects/${id}/`)), config.retention?.days, now)],
      }
      return {
        id,
        ...project,
        cards: present,
        archived: floorCards.length - present.length,
        collections: collectionsOf(floorCollections(config, id, stores), id, paths.collections, items, keptBy),
        worktrees,
        branches,
        threads: floorThreadsNow,
        policies: floorPolicies.get(id)!,
        gallery: galleryOf(floorCards),
        bases,
        branchPrefix: worktreesConfig(config, id).branchPrefix,
        cutByDefault: worktreesConfig(config, id).cutByDefault,
        hiring: hiringConfig(config, id),
        tidy,
        ...floorOffers(id, host !== undefined, shells !== undefined, bases.length > 0, tidy),
      }
    }),
    waiting: waitingOrder(cards),
    offers: [...floorPolicies].flatMap(([id, views]) => offersOf(id, views)).sort((a, b) => a.since - b.since),
    archiveAt: archiveAtOf(cards, cards.filter((c) => !kept(c))),
    ...limits,
    ...extraUsageOf([...probes.values()]),
    probes: probesOf(config).map((p) => ({ ...probeStatus(p, probes.get(p.name) ?? NO_READS, newestReading(sessions.map((s) => s.facts.rateLimits))), ...probeOffers(p.name, p.off) })),
    extensions,
    adds: {},
    asks: [],
    today: today(sessions, [...probes.values()], now),
    hostUp: host !== undefined,
    hostOutdated: host !== undefined && host.protocol !== HOST_PROTOCOL,
    claudeDefaults: claudeDefaults(sessions),
    claudeUntested: [...new Set(cards.filter((c) => c.live && c.claudeUntested).map((c) => c.claude!))],
    shells: (shells ?? []).map((shell) => ({ ...shell, activity: shellActivity(shell) })),
    termsUp: shells !== undefined,
  }
}
