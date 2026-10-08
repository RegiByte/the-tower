/**
 * Stats over sessions: a pure reduction of their facts over a window of time, per project and for all of them, in
 * the local time of the process (the tower's, which is the viewer's).
 */
import type { Session, Tokens } from './facts.ts'
import { extensionOf, type RepoLanded } from './landed.ts'

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
 * its percent moved, what was spent and how far the percent climbed, so what 1% buys and what the percent left buys
 * at that rate. The rate is unknown until the percent has climbed.
 */
export type WeeklyBudget = { percentUsed: number; resetsAt: string; since: number; spent: number; usdPerPercent?: number; usdLeft?: number }

export type Stats = StatsQuery & {
  /** Each bucket's start, epoch ms. */
  buckets: number[]
  all: ScopeStats
  projects: Record<string, ScopeStats>
  budget?: WeeklyBudget
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

const within = (q: StatsQuery) => (at: number) => at >= q.from && at < q.to

const addTokens = (a: Tokens, b: Tokens): Tokens => ({
  input: a.input + b.input, output: a.output + b.output, cacheRead: a.cacheRead + b.cacheRead, cacheWrite: a.cacheWrite + b.cacheWrite,
})

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
      subagents: sum(sessions.map((s) => s.facts.spawns.filter(inWindow).length)),
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

/**
 * The weekly budget from every session's readings of the weekly limit: the account's, whatever project read them.
 * None once the window of the latest reading has reset by `now`.
 */
export const weeklyBudget = (sessions: Session[], now: number): WeeklyBudget | undefined => {
  const readings = sessions.flatMap((s) => s.facts.limitReadings[WEEKLY] ?? [])
  const latest = readings.reduce<(typeof readings)[number] | undefined>((a, r) => (!a || r[0] > a[0] ? r : a), undefined)
  if (!latest || Date.parse(latest[2]) <= now) return undefined
  const [at, percentUsed, resetsAt] = latest
  const first = readings.filter((r) => r[2] === resetsAt).reduce((a, r) => (r[0] < a[0] ? r : a))
  const spent = sum(sessions.flatMap((s) => s.facts.spend.filter(([t]) => t >= first[0] && t <= at).map(([, usd]) => usd)))
  const climbed = percentUsed - first[1]
  const usdPerPercent = climbed > 0 ? spent / climbed : undefined
  return { percentUsed, resetsAt, since: first[0], spent, usdPerPercent, usdLeft: usdPerPercent && (100 - percentUsed) * usdPerPercent }
}

/**
 * The sessions' stats over the window, with what landed on each project's repos (`landed`, by project). The weekly
 * budget is the account's, so it is read apart, from every session.
 */
export const stats = (sessions: Session[], landed: Record<string, RepoLanded[]>, q: StatsQuery): Omit<Stats, 'budget'> => {
  const buckets = bucketsOf(q)
  const projects = [...new Set([...sessions.map((s) => s.header.project), ...Object.keys(landed)])].sort()
  return {
    ...q,
    buckets,
    all: scopeStats(sessions, uniqueRepos(Object.values(landed).flat()), q, buckets),
    projects: Object.fromEntries(projects.map((p) => [p, scopeStats(sessions.filter((s) => s.header.project === p), uniqueRepos(landed[p] ?? []), q, buckets)])),
  }
}

/**
 * Today so far, as the board carries it: spend, agent-hours and the waits answered since `since`, the local day's
 * start (epoch ms), and the weekly budget.
 */
export type Today = { since: number; spend: number; agentHours: number; waits: Pick<Spread, 'n' | 'p50'>; budget?: WeeklyBudget }

export const today = (sessions: Session[], now: number): Today => {
  const from = bucketStart(now, 'day')
  const { summary } = scopeStats(sessions, [], { from, to: nextBucket(from, 'day'), bucket: 'day' }, [from])
  return { since: from, spend: summary.spend, agentHours: summary.agentHours, waits: { n: summary.waits.n, p50: summary.waits.p50 }, budget: weeklyBudget(sessions, now) }
}
