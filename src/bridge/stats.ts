/**
 * Stats over sessions: a pure reduction of their facts over a window of time, per project and for all of them, in
 * the local time of the process (the tower's, which is the viewer's).
 */
import { addTokens, type LimitReading, type Session, type Tokens } from './facts.ts'
import { extensionOf, type RepoLanded } from './landed.ts'
import type { LimitFacts, Rise } from './rate-limits.ts'
import { STUCK_MS } from './prunable.ts'

export type Bucket = 'hour' | 'day'

/** A window, epoch ms from `from` (inclusive) to `to` (exclusive), cut into local hours or days. */
export type StatsQuery = { from: number; to: number; bucket: Bucket }

/** How a set of numbers spreads; every field 0 when it is empty. Percentiles are the value at that rank. */
export type Spread = { n: number; min: number; p50: number; avg: number; p90: number; max: number }

/**
 * `sessions`: started in the window, `resumes` of them continuing a conversation. `worked`: sessions that started a
 * turn in the window, whenever they started. Turns, agent-hours and active time count the main loop's turns that
 * started in the window; waits, the ones answered in it. Waits and turns in seconds, active time in minutes.
 * `busyHours`: the wall time in the window that any session ran a turn; `atOnce`: how many ran at once on average
 * over it, the turns' time within the window over `busyHours`.
 */
export type Summary = {
  sessions: number
  worked: number
  resumes: number
  spend: number
  tokens: Record<string, Tokens>
  agentHours: number
  busyHours: number
  atOnce: number
  turns: number
  prompts: Record<string, number>
  subagents: number
  asks: number
  failures: number
  waits: Spread
  turnSeconds: Spread
  activeMinutes: Spread
  git: GitSummary
}

/**
 * One value per bucket, in the order of `Stats.buckets`. `commits`, `added` and `removed`: what landed, by committer
 * time. `busyHours`, `atOnce` and `peak`: the summary's `busyHours` and `atOnce` within each bucket, and the most
 * turns running at once in it.
 */
export type Series = {
  spend: number[]; agentHours: number[]; turns: number[]; sessions: number[]; commits: number[]; added: number[]; removed: number[]
  busyHours: number[]; atOnce: number[]; peak: number[]
}

/** Lines a set of commits added and removed. */
export type Churn = { added: number; removed: number }

/**
 * What landed on the default branches of a scope's repos in the window: the commits that reached them (a merge brings
 * several) and the merges among the landings, the lines they changed, by file extension too, and each repo's branch
 * (none when origin/HEAD isn't set).
 */
export type GitSummary = Churn & { commits: number; merges: number; byExtension: Record<string, Churn>; repos: { dir: string; branch?: string }[] }

/** The most turns running at once in the window, and when that first happened (epoch ms). */
export type Peak = { turns: number; at?: number }

export type ScopeStats = {
  summary: Summary
  series: Series
  /** Spend and turns by the local hour of the day they happened in, 0 to 23. */
  byHour: { spend: number[]; turns: number[] }
  peak: Peak
}

/**
 * The weekly limit as a budget: over the window it is in now, from its first reading (`since`) to the latest where
 * its percent moved, what was spent and how far the percent climbed for it, so what 1% buys and what the percent left
 * buys at that rate. The rate is unknown until the percent has climbed for the tower's spend.
 */
export type WeeklyBudget = {
  percentUsed: number
  resetsAt: string
  since: number
  spent: number
  /** Points of the week used outside the tower (claude.ai, the desktop app, another machine): `outsideUse`. */
  outside: number
  /** What 1% buys, from the climb less `outside`. */
  usdPerPercent?: number
  usdLeft?: number
  pace?: Pace
}

/**
 * Whether the day's spending lasts: `perDay`, the even daily spend that spends what is left exactly at the reset (all of
 * it in the reset's last day), and
 * `runsOutAt` (epoch ms), when what is left runs out at today's rate, only when that is before the reset.
 */
export type Pace = { perDay: number; runsOutAt?: number }

const DAY = 86400_000
const HOUR = 3600_000
const MIN_RATE_WINDOW = HOUR

/** Something that lasted `seconds` from `at` (epoch ms). */
export type Lasted = { at: number; seconds: number }

/**
 * One session's part of the window, counted as the summary counts them: its main loop's turns that started in it and
 * their hours, its spend, its longest such turn and its longest wait on the user answered in it (from its `Stop`).
 */
export type SessionShare = { turns: number; agentHours: number; spend: number; longestTurn?: Lasted; longestWait?: Lasted }

/** The weekly limit as last read in the window: the percent used then, of the week that resets at `resetsAt`. */
export type WeeklyRead = { at: number; percentUsed: number; resetsAt: string }

export type Stats = StatsQuery & {
  /** Each bucket's start, epoch ms. */
  buckets: number[]
  all: ScopeStats
  projects: Record<string, ScopeStats>
  /** By session id, every session that ran a turn, spent or was answered in the window. */
  sessions: Record<string, SessionShare>
  budget?: WeeklyBudget
  weekly?: WeeklyRead
  /** Points of the weekly limit used outside the tower in the window (`outsideUse`), of any week it spans. */
  outside: number
}

export const WEEKLY = 'seven_day'

const sum = (xs: number[]) => xs.reduce((a, x) => a + x, 0)

const rank = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]

export const spread = (xs: number[]): Spread => {
  if (!xs.length) return { n: 0, min: 0, p50: 0, avg: 0, p90: 0, max: 0 }
  const sorted = [...xs].sort((a, b) => a - b)
  return { n: xs.length, min: sorted[0], p50: rank(sorted, 0.5), avg: sum(xs) / xs.length, p90: rank(sorted, 0.9), max: sorted.at(-1)! }
}

/** The local start of the hour or day `at` is in. */
export const bucketStart = (at: number, bucket: Bucket): number => {
  const d = new Date(at)
  if (bucket === 'day') d.setHours(0, 0, 0, 0)
  else d.setMinutes(0, 0, 0)
  return d.getTime()
}

export const nextBucket = (start: number, bucket: Bucket): number => {
  const d = new Date(start)
  if (bucket === 'day') d.setDate(d.getDate() + 1)
  else d.setHours(d.getHours() + 1)
  return d.getTime()
}

/** The start of every bucket the window touches. */
export const bucketsOf = ({ from, to, bucket }: StatsQuery): number[] => {
  const starts: number[] = []
  for (let at = bucketStart(from, bucket); at < to; at = nextBucket(at, bucket)) starts.push(at)
  return starts
}

const within = (q: Pick<StatsQuery, 'from' | 'to'>) => (at: number) => at >= q.from && at < q.to

const tally = (keys: string[]): Record<string, number> => keys.reduce<Record<string, number>>((a, k) => ((a[k] = (a[k] ?? 0) + 1), a), {})

/** Turns running at once over [from, to): the wall time any ran, their time, both in ms, and the most at once. */
type Overlap = { busy: number; running: number; peak: Peak }

/** Each span cut to [from, to), swept in time order: an end counts before a start at the same moment. */
export const overlap = (spans: [at: number, seconds: number][], from: number, to: number): Overlap => {
  const edges = spans
    .map(([at, seconds]) => [Math.max(at, from), Math.min(at + seconds * 1000, to)])
    .filter(([start, end]) => end > start)
    .flatMap(([start, end]): [number, number][] => [[start, 1], [end, -1]])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
  let running = 0
  let last = from
  const o: Overlap = { busy: 0, running: 0, peak: { turns: 0 } }
  for (const [at, step] of edges) {
    if (running) o.busy += at - last
    o.running += running * (at - last)
    running += step
    last = at
    if (running > o.peak.turns) o.peak = { turns: running, at }
  }
  return o
}

const atOnce = ({ busy, running }: Overlap) => (busy ? running / busy : 0)

/** Every repo once, by its top level: projects may share one, and a project's dirs may lie in one. */
const uniqueRepos = (repos: RepoLanded[]) => [...new Map(repos.map((r) => [r.dir, r])).values()]

const gitSummary = (repos: RepoLanded[]): GitSummary => {
  const commits = repos.flatMap((r) => r.commits)
  const files = commits.flatMap((c) => c.files)
  const byExtension = files.reduce<Record<string, Churn>>((a, [path, added, removed]) => {
    const ext = extensionOf(path)
    a[ext] = { added: (a[ext]?.added ?? 0) + added, removed: (a[ext]?.removed ?? 0) + removed }
    return a
  }, {})
  return {
    commits: sum(commits.map((c) => c.commits)),
    merges: commits.filter((c) => c.merge).length,
    added: sum(files.map(([, added]) => added)),
    removed: sum(files.map(([, , removed]) => removed)),
    byExtension,
    repos: repos.map(({ dir, branch }) => ({ dir, ...(branch && { branch }) })),
  }
}

const scopeStats = (sessions: Session[], landed: RepoLanded[], q: StatsQuery, buckets: number[]): ScopeStats => {
  const inWindow = within(q)
  const started = sessions.filter((s) => inWindow(s.header.startedAt))
  const spans = sessions.map((s) => s.facts.turnSpans.filter(([at]) => inWindow(at)))
  const turns = spans.flat()
  const spend = sessions.flatMap((s) => s.facts.spend.filter(([at]) => inWindow(at)))
  const index = (at: number) => buckets.findLastIndex((start) => start <= at)
  const perBucket = (points: [number, number][]) =>
    points.reduce((series, [at, value]) => ((series[index(at)] += value), series), buckets.map(() => 0))
  const perHour = (points: [number, number][]) =>
    points.reduce((hours, [at, value]) => ((hours[new Date(at).getHours()] += value), hours), Array<number>(24).fill(0))
  const worked = spans.filter((s) => s.length)
  const commits = landed.flatMap((r) => r.commits).filter((c) => inWindow(c.at))
  const lines = (pick: (f: [string, number, number]) => number) => commits.map((c): [number, number] => [c.at, sum(c.files.map(pick))])
  const everySpan = sessions.flatMap((s) => s.facts.turnSpans)
  const whole = overlap(everySpan, q.from, q.to)
  const perBucketOverlap = buckets.map((start, i) => overlap(everySpan, Math.max(start, q.from), Math.min(buckets[i + 1] ?? q.to, q.to)))
  return {
    summary: {
      sessions: started.length,
      worked: worked.length,
      resumes: started.filter((s) => s.facts.conversations[0]?.resumed).length,
      spend: sum(spend.map(([, usd]) => usd)),
      tokens: sessions
        .flatMap((s) => s.facts.tokens.filter(([at]) => inWindow(at)))
        .reduce<Record<string, Tokens>>((a, [, model, t]) => ((a[model] = a[model] ? addTokens(a[model], t) : t), a), {}),
      agentHours: sum(turns.map(([, seconds]) => seconds)) / 3600,
      busyHours: whole.busy / 3_600_000,
      atOnce: atOnce(whole),
      turns: turns.length,
      prompts: tally(sessions.flatMap((s) => s.facts.prompts.filter(([at]) => inWindow(at)).map(([, origin]) => origin))),
      subagents: sum(sessions.map((s) => s.facts.subagentRuns.filter((run) => inWindow(run.startedAt)).length)),
      asks: sum(sessions.map((s) => s.facts.asks.filter(inWindow).length)),
      failures: sum(sessions.map((s) => s.facts.failures.filter(inWindow).length)),
      waits: spread(sessions.flatMap((s) => s.facts.waits.filter(([at]) => inWindow(at)).map(([, seconds]) => seconds))),
      turnSeconds: spread(turns.map(([, seconds]) => seconds)),
      activeMinutes: spread(worked.map((s) => sum(s.map(([, seconds]) => seconds)) / 60)),
      git: gitSummary(landed.map((r) => ({ ...r, commits: r.commits.filter((c) => inWindow(c.at)) }))),
    },
    series: {
      spend: perBucket(spend),
      agentHours: perBucket(turns.map(([at, seconds]) => [at, seconds / 3600])),
      turns: perBucket(turns.map(([at]) => [at, 1])),
      sessions: perBucket(started.map((s) => [s.header.startedAt, 1])),
      commits: perBucket(commits.map((c) => [c.at, c.commits])),
      added: perBucket(lines(([, added]) => added)),
      removed: perBucket(lines(([, , removed]) => removed)),
      busyHours: perBucketOverlap.map((o) => o.busy / 3_600_000),
      atOnce: perBucketOverlap.map(atOnce),
      peak: perBucketOverlap.map((o) => o.peak.turns),
    },
    byHour: { spend: perHour(spend), turns: perHour(turns.map(([at]) => [at, 1])) },
    peak: whole.peak,
  }
}

const longest = (spans: [number, number][]): Lasted | undefined =>
  spans.reduce<Lasted | undefined>((a, [at, seconds]) => (!a || seconds > a.seconds ? { at, seconds } : a), undefined)

const shareOf = (s: Session, q: StatsQuery): SessionShare | undefined => {
  const inWindow = within(q)
  const turns = s.facts.turnSpans.filter(([at]) => inWindow(at))
  const spend = s.facts.spend.filter(([at]) => inWindow(at))
  const waits = s.facts.waits.filter(([at]) => inWindow(at))
  if (!turns.length && !spend.length && !waits.length) return undefined
  return {
    turns: turns.length,
    agentHours: sum(turns.map(([, seconds]) => seconds)) / 3600,
    spend: sum(spend.map(([, usd]) => usd)),
    longestTurn: longest(turns),
    longestWait: longest(waits.map(([at, seconds]) => [at - seconds * 1000, seconds])),
  }
}

const weeklyReadings = (sessions: Session[], streams: LimitFacts[]) =>
  [...sessions.map((s) => s.facts), ...streams].flatMap((f) => f.limitReadings[WEEKLY] ?? [])

/** The latest reading of the weekly limit taken in the window, a session's or a stream's: the account's. */
export const weeklyRead = (sessions: Session[], streams: LimitFacts[], q: Pick<StatsQuery, 'from' | 'to'>): WeeklyRead | undefined => {
  const latest = weeklyReadings(sessions, streams).filter(([at]) => within(q)(at)).reduce<LimitReading | undefined>((a, r) => (!a || r[0] > a[0] ? r : a), undefined)
  return latest && { at: latest[0], percentUsed: latest[1], resetsAt: latest[2] }
}

/**
 * When a turn left open ends, as far as the API is concerned: at Claude's last event once the session exited (an exit
 * cuts a turn short without ending it), else at the stuck threshold after it, which a running turn passes only when it
 * is stuck, and a session lost with the host never logs its exit.
 */
const openTurnEnd = (facts: Session['facts'], startedAt: number) => startedAt + (facts.heardAt ?? 0) * 1000 + (facts.exitedFrom === undefined ? STUCK_MS : 0)

/** Whether a session used the API from `from` to `to` (epoch ms): a model step, a spend, or a main-loop turn over any of it. */
const towerActive = (sessions: Session[], from: number, to: number) =>
  sessions.some(({ header, facts }) => {
    const inSpan = ([at]: [number, ...unknown[]]) => at > from && at <= to
    const turn = facts.turnStartedAt === undefined ? [] : [[header.startedAt + facts.turnStartedAt * 1000, openTurnEnd(facts, header.startedAt)] as const]
    return facts.tokens.some(inSpan) || facts.spend.some(inSpan) || [...facts.turnSpans.map(([at, s]) => [at, at + s * 1000] as const), ...turn].some(([start, end]) => start < to && end > from)
  })

/**
 * Use of the weekly limit from outside the tower: each climb between two readings of a stream in a row while no session
 * used the API. Readings of one source round alike, and a session's and the quota probe's can differ by a point for the
 * same use, so only the streams' are compared with each other. Use outside the tower while it also works counts as the tower's.
 * Of the climbs `keep` picks.
 */
export const outsideUse = (sessions: Session[], streams: LimitFacts[], keep: (rise: Rise) => boolean): number =>
  sum(streams.flatMap((p) => p.rises[WEEKLY] ?? []).filter((r) => keep(r) && !towerActive(sessions, r[0], r[1])).map((r) => r[2]))

/** Use of the weekly limit from outside the tower in the window: the climbs that ended in it. */
export const outsideIn = (sessions: Session[], streams: LimitFacts[], q: Pick<StatsQuery, 'from' | 'to'>): number => outsideUse(sessions, streams, (r) => within(q)(r[1]))

/**
 * The weekly budget from every reading of the weekly limit, a session's or a stream's: the account's, whatever read
 * them. What 1% buys is read from the climb the tower's spend made, less use from outside it. None once the window of
 * the latest reading has reset by `now`.
 */
export const weeklyBudget = (sessions: Session[], streams: LimitFacts[], now: number): WeeklyBudget | undefined => {
  const readings = weeklyReadings(sessions, streams)
  const latest = readings.reduce<(typeof readings)[number] | undefined>((a, r) => (!a || r[0] > a[0] ? r : a), undefined)
  if (!latest || Date.parse(latest[2]) <= now) return undefined
  const [at, percentUsed, resetsAt] = latest
  const first = readings.filter((r) => r[2] === resetsAt).reduce((a, r) => (r[0] < a[0] ? r : a))
  const spent = sum(sessions.flatMap((s) => s.facts.spend.filter(([t]) => t >= first[0] && t <= at).map(([, usd]) => usd)))
  const outside = outsideUse(sessions, streams, (r) => r[3] === resetsAt)
  const climbed = percentUsed - first[1] - outside
  const usdPerPercent = climbed > 0 ? spent / climbed : undefined
  const usdLeft = usdPerPercent && (100 - percentUsed) * usdPerPercent
  const from = bucketStart(now, 'day')
  const daySpend = sum(sessions.flatMap((s) => s.facts.spend.filter(([t]) => t >= from && t <= now).map(([, usd]) => usd)))
  const budget = { percentUsed, resetsAt, since: first[0], spent, outside, usdPerPercent, usdLeft }
  return { ...budget, pace: pace(budget, { since: from, spend: daySpend }, now) }
}

/**
 * The pace of the weekly budget at `now`, from today's spend since the day's start. Today's rate is measured over at
 * least an hour, so the first minutes of a day do not extrapolate. None while what is left is unknown.
 */
export const pace = (budget: Pick<WeeklyBudget, 'resetsAt' | 'usdLeft'>, day: { since: number; spend: number }, now: number): Pace | undefined => {
  if (budget.usdLeft === undefined) return undefined
  const resetsAt = Date.parse(budget.resetsAt)
  const perDay = budget.usdLeft / (Math.max(resetsAt - now, DAY) / DAY)
  const perMs = day.spend / Math.max(now - day.since, MIN_RATE_WINDOW)
  const runsOutAt = perMs > 0 ? now + budget.usdLeft / perMs : undefined
  return { perDay, runsOutAt: runsOutAt !== undefined && runsOutAt < resetsAt ? runsOutAt : undefined }
}

/**
 * The sessions' stats over the window, with what landed on each project's repos (`landed`, by project). The weekly
 * budget and outside use are the account's, so they are read apart, from every session and stream of readings.
 */
export const stats = (sessions: Session[], landed: Record<string, RepoLanded[]>, q: StatsQuery): Omit<Stats, 'budget' | 'weekly' | 'outside'> => {
  const buckets = bucketsOf(q)
  const projects = [...new Set([...sessions.map((s) => s.header.project), ...Object.keys(landed)])].sort()
  return {
    ...q,
    buckets,
    all: scopeStats(sessions, uniqueRepos(Object.values(landed).flat()), q, buckets),
    projects: Object.fromEntries(projects.map((p) => [p, scopeStats(sessions.filter((s) => s.header.project === p), uniqueRepos(landed[p] ?? []), q, buckets)])),
    sessions: Object.fromEntries(sessions.flatMap((s) => { const share = shareOf(s, q); return share ? [[s.header.id, share] as const] : [] })),
  }
}

/**
 * Today so far, as the board carries it: spend, agent-hours and the waits answered since `since`, the local day's
 * start (epoch ms), and the weekly budget.
 */
export type Today = { since: number; spend: number; agentHours: number; waits: Pick<Spread, 'n' | 'p50'>; budget?: WeeklyBudget }

export const today = (sessions: Session[], streams: LimitFacts[], now: number): Today => {
  const from = bucketStart(now, 'day')
  const { summary } = scopeStats(sessions, [], { from, to: nextBucket(from, 'day'), bucket: 'day' }, [from])
  return { since: from, spend: summary.spend, agentHours: summary.agentHours, waits: { n: summary.waits.n, p50: summary.waits.p50 }, budget: weeklyBudget(sessions, streams, now) }
}
