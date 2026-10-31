import { archiveAtOf, galleryOf, onBoard, waitingOrder, withReports } from '../../../src/bridge/board.ts'
import { awaitsResume, lifeOf } from '../../../src/bridge/life.ts'
import { bucketStart } from '../../../src/bridge/stats.ts'
import { prunable, STUCK_MS } from '../../../src/bridge/prunable.ts'
import { CALLSIGNS, callsigns } from '../../../src/shared/callsign.ts'
import { tagOf } from '../../../src/shared/tags.ts'
import { DRAFTS } from '../../../extensions/drafts/client/drafts.ts'
import { DEFAULT_KEYS } from '../../../src/shared/keymap.ts'
import { REVIEWS, parseThread, resolvedIn, reviewPrompt, threadCheckoutOf, threadId, unseenBy } from '../../../extensions/reviews/client/reviews.ts'
import type { CardPart, FloorPart, NoteCall } from '../../../extensions/reviews/threads.ts'
import type { RepoChanges } from '../../../src/changes.ts'
import { cardOffers, conversationOffers, floorOffers, resourceOffers, worktreeOffers } from '../../../src/bridge/verbs.ts'
import { withSeats } from '../../../src/bridge/seats.ts'
import { shellActivity } from '../../../src/shared/terms.ts'
import { tower, type Board, type Brief, type Card, type Floor, type Status } from './api.ts'
import { GAMES } from './games.ts'
import { bytesOf, FILM_FILE } from './files.ts'
import { wallNow } from './clock.ts'
import type { ProbeStatus } from '../../../src/bridge/legacy.ts'

/**
 * Fabricated boards for `?board=<name>`: the states a renderer draws, with no host behind them and none of the real
 * system's text. A scenario states facts (status, waiting, what was said); what the bridge derives from them
 * (callsign, the worker's lifecycle and crew, verbs) comes from the bridge's own functions.
 */

const MIN = 60_000

/** Fixture workers are named from the names a config without `callsigns` uses. */
const callsign = callsigns(CALLSIGNS)

/** One worker's facts. `ago` is minutes since it started; `resumedBy` names the worker continuing its conversation. */
type Facts = {
  status: Status
  blocked?: Card['blocked']
  /** Holds an outcome nobody has typed to since: a screen or a question always waits. */
  waiting?: boolean
  ago?: number
  prompt?: string
  answer?: string
  tool?: string
  compacting?: boolean
  says?: string[]
  model?: string
  context?: number
  costUsd?: number
  /** Its subagents running now: `forks` of them forks of the worker, the rest general-purpose. */
  subagents?: number
  forks?: number
  turns?: number
  resumes?: string
  resumedBy?: string
  hostStopped?: boolean
  /** Stranded mid-turn. */
  cutOff?: boolean
  leftovers?: Omit<Card['resources'][number], 'verbs' | 'calls' | 'actions'>[]
  /** What it showed you, `ago` minutes since. */
  shown?: (Omit<Card['shown'][number], 'at' | 'session'> & { ago: number })[]
  /** The worktree it works in, by name; the main checkout without one. */
  worktree?: string
  /** The worker, by its place on the floor, whose work it reviews in a fork of its checkout. */
  reviews?: number
  /** Its latest prompt is the one its hirer hired it on: an unread answer to it waits on the hirer while that runs, not on you. */
  hirersPrompt?: boolean
  /** Working with no word from Claude for long. */
  stuck?: boolean
  /** The worker, by its place on the floor, that hired this one. */
  hiredBy?: number
  /** Its worktree, read from git: whether its work has landed (committed and absorbed into its base). */
  landed?: boolean
  /** How many sessions it ran as, this one the last: each earlier one started a day before the next. */
  sessions?: number
  /** Minutes since it entered its status (went off duty, or its answer came), a minute after it started unless given. */
  left?: number
  /** Why it can't be resumed where it ran. */
  unresumable?: Card['unresumable']
}

const idOf = (project: string, n: number) => `20261004-${String(90000 + n * 7).padStart(6, '0')}-${project.slice(0, 4).padEnd(4, 'x')}`

/** A worktree's name: a fixture's own, read as a tower cut names one. */
const checkoutOf = (f: Facts) => f.worktree ?? 'main'

const DAY = 24 * 60 * MIN

/** The sessions a worker ran as, oldest first, the last its own: an earlier one is named after it, `-s<n>`. */
const lineageOf = (id: string, startedAt: number, sessions: number): Card['lineage'] =>
  Array.from({ length: sessions }, (_, i) => (i === sessions - 1 ? { id, startedAt } : { id: `${id}-s${i + 1}`, startedAt: startedAt - (sessions - 1 - i) * DAY }))

/** The subagents a fixture worker runs, started a minute after it, the forks first. */
const runsOf = (id: string, startedAt: number, f: Facts): Card['subagentRuns'] =>
  Array.from({ length: f.subagents ?? 0 }, (_, i) => {
    const fork = i < (f.forks ?? 0)
    return {
      id: `${id}-agent-${i}`, type: fork ? 'fork' : 'general-purpose', description: fork ? 'Check the plan against the spec' : 'Search the codebase', background: true,
      model: f.model, startedAt: startedAt + MIN, tokens: { input: 12, output: 840, cacheRead: 40_000, cacheWrite: 6_000 }, running: true,
    }
  })

function card(project: string, n: number, f: Facts, now: number, floor: Facts[]): Card {
  const id = idOf(project, n)
  const author = f.reviews === undefined ? undefined : floor[f.reviews]
  const startedAt = now - (f.ago ?? 30) * MIN
  const enteredAt = f.left === undefined ? startedAt + MIN : now - f.left * MIN
  const hiredBy = f.hiredBy === undefined ? undefined : { session: idOf(project, f.hiredBy), callsign: callsign(idOf(project, f.hiredBy)), project }
  const linkOf = (to: string) => ({ id: to, callsign: callsign(to), startedAt })
  const resumedBy = f.resumedBy === undefined ? undefined : linkOf(f.resumedBy)
  const life = lifeOf({
    state: f.status === 'blocked' ? { status: 'blocked', since: enteredAt, blocked: f.blocked! } : { status: f.status, since: enteredAt, compaction: f.compacting ? { trigger: 'auto' } : undefined },
    endedFrom: f.cutOff ? 'working' : f.status, hostStopped: f.hostStopped ?? false, killedOutside: false, killedByHost: f.status === 'exited', broken: false,
    typedAt: f.waiting ? undefined : now, heardAt: f.stuck ? now - STUCK_MS : undefined, leaveAsked: false,
    unresumableHere: f.unresumable, conversations: f.prompt === undefined ? [] : [{ resumedBy }],
  }, now)
  const conversations = f.prompt === undefined ? [] : [{
    id: `${id}-conversation`, startedAt, prompt: f.prompt, answer: f.answer, promptBy: f.hirersPrompt ? hiredBy?.callsign : undefined,
    resumes: f.resumes === undefined ? undefined : linkOf(f.resumes), resumedBy,
    ...conversationOffers(id, `${id}-conversation`, life.live, !life.unresumable, resumedBy),
  }]
  const resources = (f.leftovers ?? []).map((r) => ({ ...r, ...resourceOffers(id, r.pid) }))
  return {
    id, callsign: callsign(id), project, cwd: f.worktree ? `/work/${project}/.worktrees/${f.worktree}` : `/work/${project}`, checkout: checkoutOf(f),
    checkoutState: { is: 'live' },
    worktree: f.worktree ? { name: f.worktree, branch: `tower/${f.worktree}`, from: author && checkoutOf(author), gone: false } : undefined,
    ...(f.reviews !== undefined && {
      reviews: callsign(idOf(project, f.reviews)),
      crew: { callsign: callsign(idOf(project, f.reviews)), session: idOf(project, f.reviews), by: 'reviews' },
      exempt: [{ from: 'hiring', by: 'reviews' }],
      x: { reviews: { of: callsign(idOf(project, f.reviews)) } },
    }),
    ...life, hiredBy, enteredAt, startedAt, cols: 120, rows: 40,
    context: f.context, costUsd: f.costUsd, tool: f.tool, says: f.says ?? [], subagents: f.subagents ?? 0, subagentRuns: runsOf(id, startedAt, f), turns: f.turns ?? 0, lineage: lineageOf(id, startedAt, f.sessions ?? 1), model: f.model, effort: undefined, claudeUntested: false,
    resources, shown: (f.shown ?? []).map(({ ago, ...s }) => ({ ...s, at: now - ago * MIN, session: id })), pages: [], sent: [], conversations,
    ...cardOffers(id, life.status, !life.unresumable, conversations, resources.length, awaitsResume(life), life.cutOff),
  }
}

/** A game kept on a fixture floor: its file's text, and the worker that kept it, by its place on the floor. */
type GameFacts = { html: string; keptBy?: number }
/** `threads`: each checkout's review thread, by checkout, as its file reads. */
type FloorFacts = { id: string; name: string; color: string; workers: Facts[]; shelf?: Floor['shelf']; repos?: string[]; drafts?: string[]; threads?: Record<string, string>; games?: GameFacts[] }

/** A fixture draft's id: its place on the floor's board, as a created item would be named. */
const draftId = (n: number) => `20261004T15${String(n).padStart(2, '0')}00.000Z.md`

/** The drafts collection of a floor keeping drafts, a draft `n` minutes older than the next. */
const draftsCollection = (project: string, texts: string[], now: number): Floor['collections'] => [{
  id: DRAFTS, label: 'Drafts', by: DRAFTS, dir: `/system/collections/${project}/${DRAFTS}`,
  items: texts.map((text, n) => ({ id: draftId(n), tag: tagOf(draftId(n)), size: text.length, modifiedAt: now - (texts.length - n) * MIN })),
}]

/** A fixture game's id: its place on the floor, as a created item would be named. */
const gameId = (n: number) => `20261004T14${String(n).padStart(2, '0')}00.000Z.html`

/** The games collection of a floor keeping games, a game `n` hours older than the next, each with its keeper's card. */
const gamesCollection = (project: string, games: GameFacts[], cards: Card[], now: number): Floor['collections'] => [{
  id: GAMES, label: 'Games', dir: `/system/collections/${project}/${GAMES}`,
  items: games.map((g, n) => {
    const keeper = g.keptBy === undefined ? undefined : cards[g.keptBy]
    return { id: gameId(n), tag: tagOf(gameId(n)), size: g.html.length, modifiedAt: now - (games.length - n) * 60 * MIN, ...(keeper && { keptBy: { session: keeper.id, callsign: keeper.callsign } }) }
  }),
}]

/** The reviews collection of a floor keeping threads, a thread's file `n` minutes older than the next. */
const reviewsCollection = (project: string, threads: Record<string, string>, now: number): Floor['collections'] => [{
  id: REVIEWS, label: 'Reviews', dir: `/system/collections/${project}/${REVIEWS}`,
  items: Object.entries(threads).map(([checkout, text], n) => ({ id: threadId(checkout), tag: tagOf(threadId(checkout)), size: text.length, modifiedAt: now - n * MIN })),
}]

/**
 * A floor's threads as the reviews extension folds them, and each card's reviews part with what of its checkout's
 * thread is new to it; on a floor keeping threads, every checkout's work goes on, so each offers a note.
 */
function withThreads(f: FloorFacts, cards: Card[]): { x?: Floor['x']; cards: Card[] } {
  if (!f.threads) return { cards }
  const parsed = Object.entries(f.threads).map(([checkout, text]) => ({ checkout, thread: parseThread(text) }))
  const note = (checkout: string): NoteCall => ['reviews/append', { project: f.id, checkout }]
  const threads: FloorPart['threads'] = parsed.map(({ checkout, thread }) => ({
    key: `${f.id}/${checkout}`, checkout, id: threadId(checkout), tag: tagOf(threadId(checkout)), messages: thread.messages.length, landed: false, resolved: [...resolvedIn(thread).keys()], state: { is: 'live' as const },
    verbs: ['note'], calls: { note: note(checkout) }, actions: [{ verb: 'note', call: note(checkout) }],
    last: thread.messages.at(-1) && { author: thread.messages.at(-1)!.author, at: thread.messages.at(-1)!.at, n: thread.messages.at(-1)!.n },
  }))
  return {
    x: { [REVIEWS]: { threads } satisfies FloorPart },
    cards: cards.map((c) => {
      const checkout = threadCheckoutOf(c)
      const thread = parsed.find((t) => t.checkout === checkout)?.thread
      const part: CardPart = { thread: checkout, threadState: { is: 'live' }, ...(thread && { unseen: unseenBy(thread, c.callsign).length }), note: note(checkout) }
      return { ...c, x: { ...c.x, [REVIEWS]: part } }
    }),
  }
}

/** The worktrees git would read for the workers whose `landed` is stated, each in use by its worker. */
const worktreesOf = (f: FloorFacts): Floor['worktrees'] =>
  f.workers.flatMap((w, n) => {
    if (w.landed === undefined || w.worktree === undefined) return []
    const path = `/work/${f.id}/.worktrees/${w.worktree}`
    const repo = { dir: `/work/${f.id}`, path, branch: `tower/${w.worktree}`, present: true, dirty: 0, unpushed: w.landed ? 0 : 2, absorbed: w.landed, risk: [], atRisk: false }
    return [{ name: w.worktree, repos: [repo], sessions: [idOf(f.id, n)], state: 'live' as const, ...worktreeOffers(f.id, w.worktree, 'live', [repo], true) }]
  })

/** A floor's Tidy: what the bridge would prune from its cards and worktrees; fixture floors keep no branches and no old logs. */
const tidyOf = (cards: Card[], worktrees: Floor['worktrees']): Floor['tidy'] => ({ worktrees: [], branches: [], threads: [], prune: prunable(cards, worktrees, cards), logs: [], streams: [] })

function boardOf(floors: FloorFacts[], now: number, extra: Partial<Pick<Board, 'rateLimits' | 'rateLimitsAt' | 'extraUsage' | 'shells' | 'today'> & { quota: Omit<ProbeStatus, 'name' | 'reads'> }> = {}): Board {
  const threaded = floors.map((f) => withThreads(f, f.workers.map((w, n) => card(f.id, n, w, now, f.workers))))
  const reporting = withReports(threaded.flatMap((t) => t.cards))
  const built = floors.map((f, i) => {
    const { x } = threaded[i]
    const cards = reporting.filter((c) => c.project === f.id)
    const worktrees = worktreesOf(f)
    const tidy = tidyOf(cards, worktrees)
    return {
      id: f.id, name: f.name, color: f.color, hub: `/work/${f.id}`, repos: f.repos ?? [], shelf: f.shelf,
      collections: [
        ...(f.drafts ? draftsCollection(f.id, f.drafts, now) : []),
        ...(f.threads ? reviewsCollection(f.id, f.threads, now) : []),
        ...(f.games ? gamesCollection(f.id, f.games, cards, now) : []),
      ],
      worktrees, branches: [], git: true, bases: [], branchPrefix: 'tower/', cutByDefault: true, hiring: { depth: 2, live: 3 },
      tidy, threads: [], cards, policies: [], ...(x && { x }),
      ...floorOffers(f.id, true, true, false, tidy),
    }
  })
  const seated = withSeats(built.flatMap((f) => f.cards))
  const kept = onBoard(bucketStart(now, 'day'))
  const board: Board = {
    user: { name: 'user' },
    config: '/system/config.json',
    keys: DEFAULT_KEYS,
    floors: built.map((f) => {
      const cards = seated.filter((c) => c.project === f.id)
      const present = cards.filter(kept)
      return { ...f, cards: present, archived: cards.length - present.length, gallery: galleryOf(cards) }
    }),
    waiting: waitingOrder(seated),
    offers: [],
    archiveAt: archiveAtOf(seated, seated.filter((c) => !kept(c))),
    rateLimits: extra.rateLimits ?? [],
    rateLimitsAt: extra.rateLimitsAt,
    probes: [],
    ...(extra.quota && { x: { quota: extra.quota } }),
    extensions: [],
    viewers: {},
    adds: {},
    asks: [],
    ...(extra.extraUsage && { extraUsage: extra.extraUsage }),
    today: extra.today ?? { since: now - 15 * 60 * MIN, spend: 0, agentHours: 0, waits: { n: 0, p50: 0 } },
    hostUp: true,
    hostOutdated: false,
    claudeDefaults: {},
    claudeUntested: [],
    shells: extra.shells ?? [],
    termsUp: true,
  }
  archives.set(board, seated.filter((c) => !kept(c)).sort((a, b) => b.startedAt - a.startedAt))
  return board
}

/** Each fixture board's archived cards, newest first: what `GET /archive/<project>` would serve with it. */
const archives = new WeakMap<Board, Card[]>()

const ALPHA_DRAFTS = [
  'Add a retry budget to the scheduler\n\nCap retries per minute, not per job.',
  '# Review the migration plan\n\nRead kb/flows/migration.md and list what it leaves out.',
  'Profile the board build with 10,000 drafts and write down where the time goes, stage by stage, with numbers',
  'tidy the README',
]
const EMPTY_DRAFTS = ['Hire someone for the empty floor']
/** A game's file as a fixture keeps it: only its title is read. */
const gameHtml = (title: string) => `<!doctype html><title>${title}</title><p>${title}</p>`
const ALPHA_GAMES: GameFacts[] = [
  { html: gameHtml('Catch the Tower Cat'), keptBy: 3 },
  { html: gameHtml('Merge Conflict Tetris'), keptBy: 2 },
  { html: '<!doctype html><p>a game without a title</p>' },
]
/** Each fixture board's drafts, by floor. */
const DRAFT_TEXTS: Record<string, Record<string, string[]>> = { busy: { alpha: ALPHA_DRAFTS }, empty: { alpha: EMPTY_DRAFTS } }

const LONG = 'Refactor the ingestion pipeline so every stage is a pure function over plain records, then thread the retry policy through the scheduler without touching the public API; keep the old adapters until the migration lands and write down every decision in the knowledge base as you go, with refs into the code for each claim.'
const SHELL = (project: string, n: number, title: string, now: number) => {
  const shell = { id: `shell-${project}-${n}`, project, cwd: `/work/${project}`, startedAt: now - 20 * MIN, cols: 120, rows: 30, process: 'zsh', title }
  return { ...shell, activity: shellActivity(shell) }
}

/**
 * Every status and attention, 15 workers over three floors, long lines, leftovers, a resume chain and shells; alpha's
 * gallery full, an off-duty worker's showings among them. `later`, an idle worker has shown something new since, and
 * the oldest leaves the wall.
 */
function busyFloors(now: number, later = false): FloorFacts[] {
  const resumed = idOf('alpha', 0)
  return [
    {
      id: 'alpha', name: 'alpha', color: '#c792ea', repos: ['/work/alpha-api', '/work/alpha-web'],
      shelf: [{ label: 'Dashboard', html: 'dash/index.html' }, { label: 'Docs', link: 'https://example.com' }],
      drafts: ALPHA_DRAFTS,
      games: ALPHA_GAMES,
      workers: [
        { status: 'working', prompt: 'continue', tool: 'Bash', says: [
          'Let me find where the retry budget is read.',
          'Found it: the scheduler reads it once at boot, so a config change needs a restart. Checking whether anything else caches it.',
          'Running the scheduler tests before I touch it.',
        ], context: 41, costUsd: 1.2, turns: 9, model: 'opus', resumes: idOf('alpha', 6), ago: 10 },
        { status: 'needs_input', waiting: true, prompt: 'Run the migration on the staging copy', tool: 'Bash', context: 18, turns: 2, ago: 25 },
        { status: 'done', waiting: true, prompt: 'Summarize the failing tests', answer: 'Three tests fail on a timezone assumption: they build dates in local time and compare against UTC fixtures.', context: 33, turns: 4, ago: 40,
          shown: [{ kind: 'file', target: '/work/alpha/reports/failing-tests.md', ago: 30 }, { kind: 'file', target: '/work/alpha/reports/timezones.html', title: 'Where the clocks disagree', ago: 20 }, { kind: 'file', target: '/work/alpha/reports/failures-by-hour.png', title: 'Failures by hour', ago: 15 }] },
        { status: 'idle', prompt: 'hello', answer: 'Ready when you are.', ago: 5,
          shown: later ? [{ kind: 'file', target: '/work/alpha/reports/retry-budget.md', title: 'Retry budget: what I found', ago: 1 }, { kind: 'file', target: '/work/alpha/reports/retry.webm', title: 'The retry, recorded', ago: 0 }] : [] },
        { status: 'working', prompt: LONG, tool: 'mcp__knowledge_base__write_entity_with_a_very_long_tool_name', subagents: 2, forks: 1, context: 77, costUsd: 4.8, turns: 14, ago: 90,
          shown: [{ kind: 'file', target: '/work/alpha/notes/pipeline.md', ago: 70 }, { kind: 'url', target: 'http://localhost:5173/', title: 'The ingestion dashboard', ago: 50 }] },
        { status: 'blocked', blocked: 'trust', waiting: true, ago: 1 },
        { status: 'exited', prompt: 'Start the refactor', answer: 'Started; picked up in a resume.', resumedBy: resumed, ago: 120,
          shown: [
            { kind: 'file', target: '/work/alpha/plans/first-look.md', title: 'First look at the pipeline', ago: 119 },
            { kind: 'file', target: '/work/alpha/plans/refactor.md', title: 'Refactor plan', ago: 118 },
            { kind: 'file', target: '/work/alpha/diagrams/stages.svg', title: 'The stages, drawn', ago: 112 },
            { kind: 'link', target: 'https://github.com/example/alpha/pull/42', title: 'PR #42: pure stages', ago: 105 },
            { kind: 'file', target: '/work/alpha/reports/coverage.html', ago: 100 },
          ] },
      ],
    },
    {
      id: 'beta', name: 'beta-with-a-rather-long-project-name', color: '#7fb069',
      workers: [
        { status: 'failed', waiting: true, prompt: 'Deploy the preview', answer: undefined, ago: 15 },
        { status: 'lost', prompt: 'Long build', answer: undefined, hostStopped: true, cutOff: true, ago: 200 },
        { status: 'done', prompt: 'Rename the module', answer: LONG, turns: 6, ago: 50,
          leftovers: [{ pid: 4242, command: 'node server.js --port 5173', ports: [5173], orphan: true }, { pid: 4243, command: 'esbuild --watch', ports: [], orphan: false }] },
        { status: 'working', prompt: 'Profile the hot path', tool: 'Read', says: ['Reading the board build to see where the time goes.'], ago: 12,
          shown: [{ kind: 'link', target: 'https://example.com/flamegraphs/board-build', title: 'Flame graph of the board build', ago: 4 }] },
        { status: 'exited', prompt: 'Quick question', answer: 'Answered.', ago: 60 },
      ],
    },
    {
      id: 'gamma', name: 'gamma', color: '#e9a13a', drafts: [],
      workers: [
        { status: 'idle', prompt: 'Look around', answer: 'Looked.', ago: 8 },
        { status: 'needs_input', waiting: true, prompt: 'Delete the old branch?', tool: 'Bash', ago: 3 },
        { status: 'exited', prompt: 'Draft the release notes', answer: 'Drafted.', ago: 300 },
      ],
    },
  ]
}

/** Busy's floors, with what they keep running and the limits they spend. */
const busyBoard = (floors: FloorFacts[], now: number): Board =>
  boardOf(floors, now, {
    rateLimits: [
      { kind: 'five_hour', percentUsed: 64, resetsAt: new Date(now + 90 * MIN).toISOString() },
      { kind: 'seven_day', percentUsed: 27, resetsAt: new Date(now + 3 * 24 * 60 * MIN).toISOString() },
    ],
    rateLimitsAt: now - 3 * MIN,
    quota: { every: 10 * MIN, state: 'ok', lastAt: now - 52 * MIN, answeredAt: now - 52 * MIN, failsInRow: 0, wait: 10 * MIN, nextAt: now + 7 * MIN, held: true },
    today: {
      since: now - 15 * 60 * MIN, spend: 84.6, agentHours: 5.2, waits: { n: 23, p50: 260 },
      budget: { percentUsed: 27, resetsAt: new Date(now + 3 * 24 * 60 * MIN).toISOString(), since: now - 4 * 24 * 60 * MIN, spent: 310, outside: 0, usdPerPercent: 14.1, usdLeft: 1029.3, pace: { perDay: 343.1, runsOutAt: now + 40 * 60 * MIN } },
    },
    shells: [SHELL('alpha', 0, 'npm run dev', now), SHELL('alpha', 1, 'user@host:~/work/alpha', now), SHELL('gamma', 0, 'vim README.md', now)],
  })

/** Every worker that waited on you answered and back at work: nobody waits. */
const answered = (floors: FloorFacts[]): FloorFacts[] =>
  floors.map((f) => ({ ...f, workers: f.workers.map((w) => (w.waiting ? { ...w, status: 'working', waiting: false, tool: 'Edit' } : w)) }))

/** Two floors and nobody at work. */
const empty = (now: number) => boardOf([
  { id: 'alpha', name: 'alpha', color: '#c792ea', workers: [], drafts: EMPTY_DRAFTS },
  { id: 'beta', name: 'beta', color: '#7fb069', workers: [] },
], now)

/** Twelve floors, past the digit keys, one worker each; ids stay distinct in the four letters a fixture id keeps. */
const tall = (now: number) => boardOf(Array.from({ length: 12 }, (_, i) => ({
  id: `f${i + 1}`, name: `floor ${i + 1}`, color: `hsl(${(i * 47) % 360} 60% 60%)`,
  workers: [{ status: i % 3 === 0 ? 'needs_input' : 'working', waiting: i % 3 === 0, prompt: `task ${i + 1}`, tool: 'Edit' } satisfies Facts],
})), now)

/** Nine projects with guests today, one past the roof's dance floors, a few at work, everyone else at the party; limits read 40 minutes ago, over pace on the week. */
const PARTY_GUESTS = [6, 5, 4, 3, 3, 2, 2, 1, 2]
const party = (now: number) => boardOf(PARTY_GUESTS.map((guests, i) => ({
  id: `p${i + 1}`, name: `project ${i + 1}`, color: `hsl(${(i * 61) % 360} 65% 60%)`,
  workers: [
    ...(i % 3 === 0 ? [{ status: 'working', prompt: `task ${i + 1}`, tool: 'Edit' } satisfies Facts] : []),
    ...Array.from({ length: guests }, (_, n) => ({ status: 'exited', prompt: `chore ${n + 1}`, answer: 'Done.', ago: 20 + n * 37 + i * 11 } satisfies Facts)),
  ],
})), now, {
  rateLimits: [
    { kind: 'five_hour', percentUsed: 40, resetsAt: new Date(now + 20 * MIN).toISOString() },
    { kind: 'seven_day', percentUsed: 71, resetsAt: new Date(now + 84 * 60 * MIN).toISOString() },
  ],
  rateLimitsAt: now - 40 * MIN,
  extraUsage: { at: now - 4 * MIN, enabled: true, used: 37, limit: 50, currency: 'USD', reached: false },
  quota: { every: 10 * MIN, state: 'backoff', lastAt: now - 4 * MIN, error: 'no answer within 30s', answeredAt: now - 40 * MIN, failsInRow: 4, wait: 20 * MIN, nextAt: now + 16 * MIN, held: false },
  today: {
    since: now - 15 * 60 * MIN, spend: 212.4, agentHours: 11.3, waits: { n: 41, p50: 340 },
    budget: { percentUsed: 71, resetsAt: new Date(now + 84 * 60 * MIN).toISOString(), since: now - 5 * 24 * 60 * MIN, spent: 1080, outside: 6, usdPerPercent: 15.2, usdLeft: 440.8 },
  },
})

/** The callsign of the fixture worker at `n` on `project`. */
const who = (project: string, n: number) => callsign(idOf(project, n))

/** The review floor's checkouts: an author with a reviewer beside it, an author answered, one whose worker went home. */
const REVIEWED = { author: 'retry-budget', answered: 'readme', gone: 'old-flags' }

/** The review floor's threads, written as `review/append` writes them. */
function reviewThreads(): Record<string, string> {
  const [author, reviewer, answered] = [who('lab', 0), who('lab', 1), who('lab', 2)]
  return {
    [REVIEWED.author]: `# ${REVIEWED.author}

## user · 2026-10-04 14:10 · n1
Keep the budget per minute, not per job: the scheduler restarts jobs.

## ${author} · 2026-10-04 14:22 · n2 · re n1
Done: the budget is a token bucket refilled every minute.

## ${reviewer} · 2026-10-04 14:51 · n3
\`lab-api:src/scheduler.ts:41-43\`
\`\`\`ts
  if (bucket.tokens <= 0) return defer(job)
  bucket.tokens -= 1
  return run(job)
\`\`\`
**bug** · correctness: a deferred job never refunds its token, so a burst of deferrals drains the bucket for the minute.

## ${reviewer} · 2026-10-04 14:53 · n4
\`lab-api:src/config.ts:7\`
\`\`\`ts
export const RETRY_BUDGET = 60
\`\`\`
**nit** · naming: say the unit, \`RETRIES_PER_MINUTE\`.

## ${reviewer} · 2026-10-04 14:55 · n5
**fix first**: n3 loses retries under load. Ran \`npm test\` in my fork: green, the burst case isn't covered.
`,
    [REVIEWED.answered]: `# ${REVIEWED.answered}

## user · 2026-10-04 13:02 · n1
\`lab:README.md:3\`
\`\`\`md
Run it with \`npm start\`.
\`\`\`
Say which port it listens on.

## ${answered} · 2026-10-04 13:20 · n2 · re n1
Added: it listens on 5173.
`,
    [REVIEWED.gone]: `# ${REVIEWED.gone}

## user · 2026-10-04 11:40 · n1
Before this lands: who still reads \`LEGACY_FLAGS\`?
`,
  }
}

/** What the author's Changes read gives: its quoted lines still there at the lines quoted, the config line since renamed. */
const AUTHOR_CHANGES: RepoChanges[] = [
  {
    dir: '/work/lab-api/.worktrees/retry-budget', against: 'origin/main', since: '3f2a9c1e', commits: [], shows: 'all', more: 0,
    files: [
      { path: 'src/scheduler.ts', change: 'modified', binary: false, added: 5, removed: 1, hash: 'a1', hunks: [
        { old: 1, new: 1, heading: '', lines: [" import { run } from './run.ts'", "+import { bucketFor } from './bucket.ts'", " import type { Job } from './job.ts'"] },
        { old: 38, new: 39, heading: "const defer = (job: Job) => queue.push(job)", lines: [
          ' export function schedule(job: Job) {', '-  return run(job)', '+  const bucket = bucketFor(job)', '+  if (bucket.tokens <= 0) return defer(job)', '+  bucket.tokens -= 1', '+  return run(job)', ' }',
        ] },
      ] },
      { path: 'src/config.ts', change: 'modified', binary: false, added: 1, removed: 1, hash: 'b2', hunks: [{ old: 7, new: 7, heading: '', lines: ['-export const RETRY_LIMIT = 5', '+export const RETRIES_PER_MINUTE = 60'] }] },
      { path: 'src/bucket.ts', change: 'added', binary: false, added: 15, removed: 0, hash: 'c3', hunks: [{ old: 0, new: 1, heading: '', lines: [
        "+import { RETRIES_PER_MINUTE } from './config.ts'", "+import type { Job } from './job.ts'", '+',
        '+/** A job kind\'s retries per minute: a bucket of tokens refilled every minute. */', '+export type Bucket = { tokens: number; refilledAt: number }', '+',
        '+const buckets = new Map<string, Bucket>()', '+', '+export function bucketFor(job: Job): Bucket {', '+  const now = Date.now()',
        '+  const b = buckets.get(job.kind) ?? { tokens: RETRIES_PER_MINUTE, refilledAt: now }',
        '+  if (now - b.refilledAt >= 60_000) Object.assign(b, { tokens: RETRIES_PER_MINUTE, refilledAt: now })', '+  buckets.set(job.kind, b)', '+  return b', '+}',
      ] }] },
      { path: 'test/scheduler.test.ts', change: 'modified', binary: false, added: 5, removed: 0, hash: 'd4', hunks: [{ old: 12, new: 12, heading: "describe('schedule', () => {", lines: [
        "   it('runs a job', () => {", "     expect(schedule(job())).toBe('ran')", '   })', '+', "+  it('defers a job once the bucket is empty', () => {", '+    bucketFor(job()).tokens = 0',
        "+    expect(schedule(job())).toBe('deferred')", '+  })', ' })',
      ] }] },
    ],
  },
  {
    dir: '/work/lab/.worktrees/retry-budget', against: 'origin/main', since: '9b0c44d2', commits: [], shows: 'all', more: 0,
    files: [{ path: 'README.md', change: 'modified', binary: false, added: 2, removed: 0, hash: 'e5', hunks: [{ old: 3, new: 3, heading: '', lines: [
      ' Run it with `npm start`.', '+', '+Retries are budgeted per minute: `RETRIES_PER_MINUTE` in `src/config.ts`.',
    ] }] }],
  },
]

/** Each fixture worker's Changes, by session id. */
export const FIXTURE_CHANGES: Record<string, RepoChanges[]> = { [idOf('lab', 0)]: AUTHOR_CHANGES }

/**
 * The review flow: an author at work with a reviewer beside it and notes it hasn't read, an author that answered its
 * notes, a worker in the main checkout, and a thread whose worker went home. On the next board the reviewer goes home, and on
 * the one after it comes back.
 */
const review = (now: number, reviewed = false) => boardOf([{
  id: 'lab', name: 'lab', color: '#5fb3b3', repos: ['/work/lab-api'], threads: reviewThreads(),
  workers: [
    { status: 'working', prompt: 'Add a retry budget to the scheduler', tool: 'Edit', worktree: REVIEWED.author, context: 38, turns: 7, ago: 40 },
    { status: reviewed ? 'exited' : 'working', prompt: reviewPrompt(who('lab', 0), false), tool: 'Bash', worktree: 'retry-budget-review', reviews: 0, subagents: 1, ago: 12 },
    { status: 'done', waiting: true, prompt: 'Document the port', answer: 'Added the port to the README.', worktree: REVIEWED.answered, turns: 3, ago: 30 },
    { status: 'idle', prompt: 'Look around', answer: 'Looked.', ago: 8 },
    { status: 'exited', prompt: 'Drop the old flags', answer: 'Dropped three.', worktree: REVIEWED.gone, ago: 180 },
  ],
}], now)

/**
 * Every attention side by side: what needs a hand (a question, a screen), answers ready (one for you, one a hire holds
 * for its hirer), failures unread and read, a worker lost, one at work and one dozing.
 */
const attention = (now: number) => boardOf([{
  id: 'ops', name: 'ops', color: '#f07178',
  workers: [
    { status: 'working', prompt: 'Split the deploy into stages', tool: 'Edit', turns: 5, ago: 30 },
    { status: 'done', hiredBy: 0, hirersPrompt: true, waiting: true, prompt: 'Find every env var the deploy reads', answer: 'Three: DEPLOY_ENV, REGION and the token path.', turns: 3, ago: 20 },
    { status: 'done', waiting: true, prompt: 'Bump the base image', answer: 'Bumped to the October image; the build is green.', turns: 4, ago: 25 },
    { status: 'needs_input', waiting: true, prompt: 'Roll back the canary', tool: 'Bash', ago: 6 },
    { status: 'blocked', blocked: 'trust', waiting: true, ago: 2 },
    { status: 'failed', waiting: true, prompt: 'Publish the chart', ago: 12 },
    { status: 'failed', prompt: 'Rotate the keys', ago: 70 },
    { status: 'idle', prompt: 'Look around', answer: 'Looked.', ago: 9 },
    { status: 'lost', prompt: 'Long soak test', hostStopped: true, ago: 240 },
  ],
}], now)

/**
 * What Tidy lists and what it leaves: processes left by workers gone, a hire whose work landed (its answer unread by
 * its hirer) beside one whose work hasn't, workers the user started (idle for hours, or done) that stay, a worker
 * stuck at work beside one working, and a live worker's processes, which stay.
 */
const tidyFloor = (now: number) => boardOf([{
  id: 'ops', name: 'ops', color: '#82aaff',
  workers: [
    { status: 'exited', prompt: 'Serve the docs', answer: 'Serving on :8080.', ago: 300,
      leftovers: [{ pid: 5101, command: 'python3 -m http.server 8080', ports: [8080], orphan: true }, { pid: 5102, command: 'tail -f build.log', ports: [], orphan: true }] },
    { status: 'lost', prompt: 'Watch the bundle', hostStopped: true, ago: 200,
      leftovers: [{ pid: 5201, command: 'esbuild --watch --outdir=out', ports: [], orphan: false }] },
    { status: 'idle', prompt: 'Look around', answer: 'Looked.', ago: 180 },
    { status: 'done', prompt: 'Count the routes', answer: 'Thirty-one.', turns: 2, ago: 10 },
    { status: 'working', stuck: true, prompt: 'Run the full soak test', tool: 'Bash', turns: 1, ago: 50 },
    { status: 'working', prompt: 'Split the deploy into stages', tool: 'Edit', turns: 5, ago: 30,
      leftovers: [{ pid: 5301, command: 'vite --port 5173', ports: [5173], orphan: false }] },
    { status: 'done', hiredBy: 5, hirersPrompt: true, waiting: true, worktree: 'stage-docs', landed: true, prompt: 'Document the stages', answer: 'Documented; merged as #88.', turns: 3, ago: 25 },
    { status: 'idle', hiredBy: 5, worktree: 'stage-bench', landed: false, prompt: 'Benchmark each stage', answer: 'Numbers committed, not merged yet.', turns: 2, ago: 20 },
  ],
}], now)

/**
 * Workers with long lineages, a binder each as thick as its sessions (one to nine), and an archive over five days:
 * three yesterday, the rest a day or more apart, some of them resumed many times.
 */
const logbook = (now: number) => boardOf([{
  id: 'logs', name: 'logbook', color: '#5fa8d3',
  workers: [
    { status: 'working', prompt: 'Wire the logbook into the desk panel', tool: 'Edit', ago: 20 },
    { status: 'done', waiting: true, prompt: 'Measure the replay of a long log', answer: 'A 40 MB log takes 1.9 s to rebuild its screen.', sessions: 3, ago: 35 },
    { status: 'idle', prompt: 'Keep the filing cabinet tidy', answer: 'Filed.', sessions: 9, turns: 3, ago: 50 },
    { status: 'needs_input', waiting: true, prompt: 'Archive the old drawers?', tool: 'Bash', sessions: 2, ago: 6 },
    ...[1000, 1060, 1300, 2500, 2610, 4000, 5500, 7000].map((ago, n) => ({
      status: 'exited', prompt: `Archived task ${n + 1}`, answer: `Done with task ${n + 1}.`, sessions: 1 + (n % 4), ago,
    } satisfies Facts)),
  ],
}], now)

/** A crew's hire on a fixture floor: at work, hired by the worker at `by`, `ago` minutes ago. */
const hire = (by: number, ago: number, prompt: string, more: Partial<Facts> = {}): Facts => ({ status: 'working', prompt, tool: 'Edit', hiredBy: by, ago, ...more })

/**
 * Crews in the meeting rooms. On `crew`, a coordinator and fourteen hires (one sent home, one a reviewer of the first)
 * fill Meeting · 8's table and its counter's laptops, and the last stand at the table's foot; a worker of its own sits at
 * its desk. On `pairs`,
 * the first crew to gather (three) takes Meeting · 8 at its smallest table, the next (five) Meeting · 4 and one seat
 * at its counter, and the last (three) finds both rooms taken and stays at its desks.
 */
const crews = (now: number) => boardOf([
  {
    id: 'crew', name: 'crew', color: '#ff9e64',
    workers: [
      { status: 'working', prompt: 'Coordinate the storage rewrite', tool: 'Bash', turns: 12, context: 52, ago: 90 },
      hire(0, 80, 'Split the storage layer into reads and writes', { worktree: 'storage-split' }),
      hire(0, 78, 'Write the migration'),
      hire(0, 76, 'Benchmark the new layer', { status: 'needs_input', waiting: true, tool: 'Bash' }),
      hire(0, 74, 'Port the readers'),
      hire(0, 72, 'Port the writers', { status: 'done', answer: 'Ported.' }),
      hire(0, 70, 'Update the docs', { status: 'exited', answer: 'Documented.' }),
      hire(1, 68, reviewPrompt(who('crew', 1), false), { worktree: 'storage-split-review', reviews: 1 }),
      hire(0, 66, 'Fix the flaky test'),
      hire(0, 64, 'Profile the cache'),
      hire(0, 62, 'Trim the indexes', { status: 'idle', answer: 'Trimmed.' }),
      hire(0, 60, 'Check the backups'),
      hire(0, 58, 'Rename the tables'),
      hire(0, 56, 'Read the old schema'),
      hire(0, 54, 'Count the rows', { status: 'done', answer: 'Forty million.' }),
      hire(0, 52, 'Draw the new schema'),
      { status: 'working', prompt: 'Something else entirely', tool: 'Read', ago: 50 },
    ],
  },
  {
    id: 'pairs', name: 'pairs', color: '#73daca',
    workers: [
      { status: 'working', prompt: 'Lead the API review', tool: 'Read', ago: 60 },
      hire(0, 50, 'Read the routes'),
      hire(0, 45, 'Read the schemas', { status: 'done', waiting: true, answer: 'The schemas agree.' }),
      { status: 'working', prompt: 'Lead the release', tool: 'Bash', ago: 55 },
      hire(3, 40, 'Write the notes'),
      hire(3, 35, 'Tag the build'),
      hire(3, 30, 'Check the installers', { status: 'idle', answer: 'Checked.' }),
      hire(3, 25, 'Bump the version'),
      { status: 'working', prompt: 'Lead the cleanup', tool: 'Edit', ago: 30 },
      hire(8, 20, 'Delete the dead code'),
      hire(8, 15, 'Drop the old flags'),
    ],
  },
], now)

/**
 * One crew's table changing state as it grows and shrinks, a board each: a lead and three hires at `seats_4`, a fourth
 * hire bringing `seats_6`, two more `seats_8`; then the second hire goes home, its seat left empty and the table kept,
 * and last the day's turn: that hire stays on the board with times from two days ago, which the replay and the party
 * read as gone (dropping it would renumber every later id), and the table is drawn for the six on duty.
 */
function growing(now: number): Board[] {
  const lead: Facts = { status: 'working', prompt: 'Coordinate the parser rewrite', tool: 'Bash', ago: 60 }
  const hires = [50, 45, 40, 5, 4, 3].map((ago, n) => hire(0, ago, `Rewrite parser stage ${n + 1}`))
  const home: Facts = { ...hires[1], status: 'exited', answer: 'Rewritten.', left: 1 }
  const yesterday: Facts = { ...home, ago: 3000, left: 2990 }
  const floor = (workers: Facts[]) => boardOf([{ id: 'grow', name: 'grow', color: '#c3e88d', workers }], now)
  const secondAs = (second: Facts) => [lead, hires[0], second, ...hires.slice(2)]
  return [floor([lead, ...hires.slice(0, 3)]), floor([lead, ...hires.slice(0, 4)]), floor([lead, ...hires]), floor(secondAs(home)), floor(secondAs(yesterday))]
}

/** A crew's hire whose answer waits on its hirer, at `by`, since `left` minutes ago. */
const waitingHire = (by: number, ago: number, left: number, prompt: string, answer: string): Facts =>
  hire(by, ago, prompt, { status: 'done', hirersPrompt: true, waiting: true, left, answer, tool: undefined })

/**
 * The break room. On `arcade`, a crew of six in Meeting · 8: three hires whose answers wait on their lead step out of it
 * for the game room, two playing at its cabinets and one standing, their chairs at the table kept; a fourth answered a
 * minute ago and stays at the table. A lead with one hire waiting on it sends that hire from its desk to stand in the
 * room; a done lead with no hirer waits on you at its desk. On `quiet`, keeping no games, a hire stands in the empty
 * game room beside its sign, and a reviewer whose verdict waits on its author stays beside it.
 */
const breakroom = (now: number) => boardOf([
  {
    id: 'arcade', name: 'arcade', color: '#e0af68', games: ALPHA_GAMES.slice(0, 2),
    workers: [
      { status: 'working', prompt: 'Coordinate the parser rewrite', tool: 'Bash', turns: 8, ago: 90 },
      waitingHire(0, 80, 12, 'Split the lexer out', 'Split; the tests pass.'),
      waitingHire(0, 75, 10, 'Port the error messages', 'Ported all forty.'),
      waitingHire(0, 70, 8, 'Measure the parse times', 'Twice as fast on the big files.'),
      waitingHire(0, 65, 1, 'Drop the old grammar', 'Dropped.'),
      hire(0, 60, 'Write the migration notes'),
      { status: 'done', waiting: true, prompt: 'Tidy the changelog', answer: 'Tidied.', ago: 50 },
      { status: 'working', prompt: 'Lead the docs pass', tool: 'Read', ago: 45 },
      waitingHire(7, 40, 6, 'Read the old docs', 'Read; three pages are stale.'),
    ],
  },
  {
    id: 'quiet', name: 'quiet', color: '#7dcfff',
    workers: [
      { status: 'working', prompt: 'Plan the release', tool: 'Read', ago: 40 },
      waitingHire(0, 30, 20, 'List the open issues', 'Seven, two of them blockers.'),
      { status: 'working', prompt: 'Rework the release script', tool: 'Edit', worktree: 'release-script', ago: 35 },
      hire(2, 25, reviewPrompt(who('quiet', 2), false), { status: 'done', hirersPrompt: true, waiting: true, left: 15, answer: 'Two notes left on the thread.', tool: undefined, worktree: 'release-script-review', reviews: 2 }),
    ],
  },
], now)

/** Each fixture's boards, in the order the door's `advance` delivers them. */
export const FIXTURES: Record<string, (now: number) => Board[]> = {
  busy: (now) => [busyBoard(busyFloors(now), now), busyBoard(busyFloors(now, true), now), busyBoard(answered(busyFloors(now, true)), now)],
  empty: (now) => [empty(now)],
  tall: (now) => [tall(now)],
  party: (now) => [party(now)],
  review: (now) => [review(now), review(now, true), review(now)],
  attention: (now) => [attention(now)],
  tidy: (now) => [tidyFloor(now)],
  logbook: (now) => [logbook(now)],
  crews: (now) => [crews(now)],
  growing,
  breakroom: (now) => [breakroom(now)],
}

/** The fixture named by `?board=`, if the page was opened with one. */
export const FIXTURE = new URLSearchParams(location.search).get('board') ?? undefined

/** The fixture board's review threads, by `<project>/<id>` (`threadSlot`): what their files read. */
export const FIXTURE_THREADS: Record<string, string> =
  FIXTURE === 'review' ? Object.fromEntries(Object.entries(reviewThreads()).map(([checkout, text]) => [`lab/${threadId(checkout)}`, text])) : {}

/** The fixture board's drafts' texts, by `<project>/<id>`: what its notes read. */
export const FIXTURE_DRAFTS: Record<string, string> = Object.fromEntries(
  Object.entries(DRAFT_TEXTS[FIXTURE ?? ''] ?? {}).flatMap(([project, texts]) => texts.map((text, n) => [`${project}/${draftId(n)}`, text])),
)

/** The fixture board's games' texts, by `<project>/<id>`: what their marquees read. */
export const FIXTURE_GAMES: Record<string, string> =
  FIXTURE === 'busy' ? Object.fromEntries(ALPHA_GAMES.map((g, n) => [`alpha/${gameId(n)}`, g.html]))
  : FIXTURE === 'breakroom' ? Object.fromEntries(ALPHA_GAMES.slice(0, 2).map((g, n) => [`arcade/${gameId(n)}`, g.html]))
  : {}

/** A fixture board has no host behind it: its streams are never opened, so monitors stay blank and desks stay open. */
export const watchStream: typeof tower.watch = FIXTURE === undefined ? (...a) => tower.watch(...a) : () => () => {}

/** The test pattern, fetched as the fixture page boots so it is at hand before any frame shows it. */
const film = FIXTURE === undefined ? undefined : bytesOf(FILM_FILE).then((bytes) => new Blob([bytes], { type: 'video/webm' }))

/** A fixture board's files are read from no host: every video it shows is the same test pattern, every image the same plot. */
export const readBlob: typeof tower.blob =
  FIXTURE === undefined ? (path) => tower.blob(path) : (path) => (path.endsWith('.webm') ? film! : fixturePlot())

/** A floor's archive (`GET /archive/<project>`), read beside `board`: a fixture board's own on a fixture. */
export const readArchive = (board: Board, project: string): Promise<Card[]> =>
  FIXTURE === undefined ? tower.archive(project) : Promise.resolve(archives.get(board)!.filter((c) => c.project === project))

/** A fixture worker's saved conversations: one per session it ran as, each resuming the one before, the latest first. */
function fixtureBriefs(c: Card): Brief[] {
  const conversation = c.conversations[0]
  const of = (i: number) => c.lineage[i] && { ...c.lineage[i], callsign: c.callsign }
  return c.lineage.map((session, i) => {
    const last = i === c.lineage.length - 1
    const prompt = last ? (conversation?.prompt ?? '') : `Session ${i + 1}: pick up where the last one stopped`
    const answer = last ? conversation?.answer : `Stopped after session ${i + 1}; saved for a resume.`
    return {
      id: `${session.id}-conversation`, at: 0, resumed: i > 0, saved: true, prompt, answer, resumes: of(i - 1), resumedBy: of(i + 1),
      turns: [{ startedAt: session.startedAt, prompt, answer }], session: { ...session, callsign: c.callsign },
    }
  }).reverse()
}

/** A worker's saved conversations (`GET /conversations/<id>`), read beside `board`: a fixture worker's own, from its card. */
export const readConversations = (board: Board, id: string): Promise<Brief[]> => {
  if (FIXTURE === undefined) return tower.conversations(id)
  const c = [...board.floors.flatMap((f) => f.cards), ...archives.get(board)!].find((c) => c.id === id)
  return c ? Promise.resolve(fixtureBriefs(c)) : Promise.reject(new Error(`No session "${id}"`))
}

function fixturePlot(): Promise<Blob> {
  const cv = Object.assign(document.createElement('canvas'), { width: 900, height: 700 })
  const g = cv.getContext('2d')!
  g.fillStyle = '#f7f4ee'
  g.fillRect(0, 0, cv.width, cv.height)
  g.fillStyle = '#2b2f3a'
  g.fillRect(80, 620, 760, 4)
  g.fillRect(80, 60, 4, 564)
  for (let i = 0; i < 12; i++) {
    const h = 80 + ((i * 5) % 7) * 70
    g.fillStyle = i % 4 === 3 ? '#e5484d' : '#4f7cff'
    g.fillRect(110 + i * 61, 620 - h, 44, h)
  }
  return new Promise((resolve) => cv.toBlob((blob) => resolve(blob!), 'image/png'))
}

export function fixtureBoards(): Board[] | undefined {
  if (FIXTURE === undefined) return undefined
  const build = FIXTURES[FIXTURE]
  if (!build) throw new Error(`no fixture board "${FIXTURE}": ${Object.keys(FIXTURES).join(', ')}`)
  return build(wallNow())
}
