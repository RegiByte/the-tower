/**
 * The Stats panel: spend, work, waits and what landed over a range, a tab per scope, and the units it says them in.
 * Bundled into `/panels.js`.
 */
import { bucketStart, type ScopeStats, type Spread, type Stats, type StatsQuery } from '../bridge/stats.ts'
import { esc, paceWords, plural, tokenCount as tokens } from './cards.ts'
import { ICON } from './icons.ts'
import { failedHtml } from './panel-kit.ts'

/** The Stats panel's tab that covers every project. */
export const STATS_ALL = '*'

/** How far back the Stats panel reads: today by hour, or the last 7 or 30 local days by day. */
export type StatsRange = 'today' | 'week' | 'month'
const RANGES: [StatsRange, string][] = [['today', 'Today'], ['week', '7 days'], ['month', '30 days']]
const RANGE_DAYS: Record<StatsRange, number> = { today: 1, week: 7, month: 30 }

/** The `/stats` query of a range ending now: every project's, so the All tab can stack them. */
export function statsQuery(range: StatsRange, now: number): Partial<StatsQuery> {
  const day = new Date(bucketStart(now, 'day'))
  day.setDate(day.getDate() - (RANGE_DAYS[range] - 1))
  return { from: day.getTime(), bucket: range === 'today' ? 'hour' : 'day' }
}

/** A project as the Stats panel draws it: its bars wear its colour. */
export type StatsProject = { id: string; label: string; color?: string }

/**
 * The Stats panel: `projects` are the series the All tab stacks, every project's (one in the read but not here, such
 * as a project gone from the config, stacks in a neutral colour under its id); `tabs` the scopes the renderer
 * offers (a project's id, or `STATS_ALL`), `scope` the one shown; `stats` the last read over `range`, at `at` (ms);
 * `failed` why the last read failed, drawn while none is held.
 */
export type StatsView = {
  stats: Stats | undefined; failed: string | undefined; at: number | undefined; range: StatsRange
  projects: StatsProject[]; tabs: { id: string; label: string }[]; scope: string
}

/** A day as a column names it: the weekday and the day of the month. */
const dayLabel = (at: number) => `${new Date(at).toLocaleDateString('en-US', { weekday: 'short' })} ${new Date(at).getDate()}`
const dayTitle = (at: number) => new Date(at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
const usdAxis = (v: number) => `$${v < 1 ? v.toFixed(2) : Math.round(v).toLocaleString('en-US')}`
const hoursAxis = (v: number) => `${v < 1 ? v.toFixed(2) : v < 10 ? v.toFixed(1) : Math.round(v)} h`
/** Dollars, cents below $100. */
export const usd = (v: number) => (v >= 100 ? `$${Math.round(v).toLocaleString('en-US')}` : `$${v.toFixed(2)}`)
export const hours = (v: number) => `${v < 10 ? v.toFixed(1) : Math.round(v)} h`
const count = (v: number) => (v >= 10_000 ? `${(v / 1000).toFixed(0)}k` : v.toLocaleString('en-US'))
/** A duration in seconds, in the unit that reads best. */
export const duration = (s: number) => (s < 90 ? `${Math.round(s)} s` : s < 90 * 60 ? `${(s / 60).toFixed(s < 600 ? 1 : 0)} min` : `${(s / 3600).toFixed(1)} h`)
/** The same, as narrow as a table column wants it. */
const short = (s: number) => (s < 90 ? `${Math.round(s)}s` : s < 90 * 60 ? `${(s / 60).toFixed(s < 600 ? 1 : 0)}m` : `${(s / 3600).toFixed(1)}h`)

const EMPTY_SPREAD: Spread = { n: 0, min: 0, p50: 0, avg: 0, p90: 0, max: 0 }
const EMPTY_SCOPE = (buckets: number): ScopeStats => ({
  summary: {
    sessions: 0, worked: 0, resumes: 0, spend: 0, tokens: {}, agentHours: 0, busyHours: 0, atOnce: 0, turns: 0, prompts: {}, subagents: 0, asks: 0, failures: 0,
    waits: EMPTY_SPREAD, turnSeconds: EMPTY_SPREAD, activeMinutes: EMPTY_SPREAD,
    git: { commits: 0, merges: 0, added: 0, removed: 0, byExtension: {}, repos: [] },
  },
  series: Object.fromEntries(['spend', 'agentHours', 'turns', 'sessions', 'commits', 'added', 'removed', 'busyHours', 'atOnce', 'peak'].map((k) => [k, Array(buckets).fill(0)])) as ScopeStats['series'],
  byHour: { spend: Array(24).fill(0), turns: Array(24).fill(0) },
  peak: { turns: 0 },
})

/** One bar's segments, a value per series, in the order of the legend. */
type Column = { label: string; tip: string; values: number[] }

/** A round step up from `v`: 1, 2 or 5 times a power of ten. */
const niceMax = (v: number) => {
  if (v <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  return [1, 2, 5, 10].map((m) => m * p).find((m) => m >= v)!
}

const seriesColor = (s: StatsProject) => `color-mix(in oklab, ${s.color ?? 'var(--accent)'} 75%, var(--ink))`

/**
 * Columns of stacked bars over three gridlines, a label under every `every`th, each column's readout in `data-tip`.
 * A legend names the series when there are two or more.
 */
function barsHtml(title: string, series: StatsProject[], columns: Column[], axis: (v: number) => string, every: number) {
  const max = niceMax(Math.max(0, ...columns.map((c) => c.values.reduce((a, v) => a + v, 0))))
  const grid = [1, 0.5, 0].map((f) => `<div class="rule" style="bottom:${f * 100}%"><span>${f ? axis(max * f) : ''}</span></div>`).join('')
  const cols = columns.map((c, i) => {
    const segments = c.values.map((v, k) => (v > 0 ? `<i style="height:${(v / max) * 100}%;background:${seriesColor(series[k])}"></i>` : '')).join('')
    return `<div class="column" data-tip="${esc(c.tip)}"><div class="stack">${segments}</div><span class="tick">${i % every === 0 ? esc(c.label) : ''}</span></div>`
  })
  const legend = series.length > 1 ? `<div class="legend">${series.map((s) => `<span><i style="background:${seriesColor(s)}"></i>${esc(s.label)}</span>`).join('')}</div>` : ''
  return `<figure class="chart"><figcaption class="eyebrow">${esc(title)}</figcaption>${legend}<div class="plot">${grid}<div class="columns">${cols.join('')}</div></div></figure>`
}

/** Where a column stands: its label under the axis and its title in the readout. */
type Place = { label: string; title: string }

const ADDED = 'color-mix(in oklab, var(--added) 85%, var(--ink))'
const REMOVED = 'color-mix(in oklab, var(--removed) 85%, var(--ink))'

/**
 * Lines added above the axis and removed below it, a column per place over one scale, from `total`; each column's
 * readout names every series' share, read from `parts`.
 */
function churnHtml(title: string, places: Place[], total: ScopeStats, series: StatsProject[], parts: ScopeStats[], every: number) {
  const { added, removed } = total.series
  const max = niceMax(Math.max(0, ...added, ...removed))
  const churn = (a: number, r: number) => `+${count(a)} −${count(r)}`
  const grid = [[100, `+${count(max)}`], [50, '0'], [0, `−${count(max)}`]].map(([at, label]) => `<div class="rule" style="bottom:${at}%"><span>${label}</span></div>`).join('')
  const cols = places.map(({ label, title: when }, i) => {
    const rows = series.length > 1 ? parts.flatMap((s, k) => (s.series.added[i] + s.series.removed[i] ? [`${series[k].label} ${churn(s.series.added[i], s.series.removed[i])}`] : [])) : []
    const tip = [when, `${churn(added[i], removed[i])} lines`, ...rows].join('\n')
    const bar = (v: number, color: string) => (v > 0 ? `<i style="height:${(v / max) * 100}%;background:${color}"></i>` : '')
    return `<div class="column" data-tip="${esc(tip)}"><div class="up">${bar(added[i], ADDED)}</div><div class="down">${bar(removed[i], REMOVED)}</div>
      <span class="tick">${i % every === 0 ? esc(label) : ''}</span></div>`
  })
  const legend = `<div class="legend"><span><i style="background:${ADDED}"></i>added</span><span><i style="background:${REMOVED}"></i>removed</span></div>`
  return `<figure class="chart churn"><figcaption class="eyebrow">${esc(title)}</figcaption>${legend}<div class="plot">${grid}<div class="columns">${cols.join('')}</div></div></figure>`
}

/**
 * Bars of one measure per place, one segment each, from `total`: a project may share a repo with another, so the
 * total counts it once where the projects' sum would not. Each readout names every series' share, read from `parts`.
 */
function totalColumns(places: Place[], total: number[], series: StatsProject[], parts: ScopeStats[], pick: (s: ScopeStats) => number[], format: (v: number) => string): Column[] {
  return places.map(({ label, title }, i) => {
    const rows = series.length > 1 ? parts.flatMap((s, k) => (pick(s)[i] ? [`${series[k].label} ${format(pick(s)[i])}`] : [])) : []
    return { label, tip: [title, format(total[i]), ...rows].join('\n'), values: [total[i]] }
  })
}

/** Bars of one measure per place, a segment per series: `pick` reads the measure from a scope's stats. */
function measureColumns(places: Place[], series: StatsProject[], scopes: ScopeStats[], pick: (s: ScopeStats) => number[], format: (v: number) => string): Column[] {
  return places.map(({ label, title }, i) => {
    const values = scopes.map((s) => pick(s)[i])
    const total = values.reduce((a, v) => a + v, 0)
    const rows = series.length > 1 ? values.flatMap((v, k) => (v > 0 ? [`${series[k].label} ${format(v)}`] : [])) : []
    return { label, tip: [title, `${format(total)}${series.length > 1 ? ' in all' : ''}`, ...rows].join('\n'), values }
  })
}

/** Which branch the commits are read from: one name when every repo agrees, and the repos origin/HEAD isn't set in. */
const branchNote = (repos: { dir: string; branch?: string }[]) => {
  const branches = [...new Set(repos.flatMap((r) => (r.branch ? [r.branch] : [])))]
  const unset = repos.length - repos.filter((r) => r.branch).length
  return [branches.length === 1 ? `on ${esc(branches[0])}` : `${branches.length} branches`, ...(unset ? [`${plural(unset, 'repo')} without origin/HEAD`] : [])].join(' · ')
}

const tileHtml = (label: string, value: string, note = '') => `<div class="tile"><b>${value}</b><span>${esc(label)}</span>${note ? `<small>${note}</small>` : ''}</div>`

const spreadRow = (label: string, s: Spread, format: (v: number) => string) =>
  `<tr><th>${esc(label)}</th>${s.n ? [s.min, s.p50, s.avg, s.p90, s.max].map((v) => `<td>${format(v)}</td>`).join('') : '<td colspan="5" class="none">none yet</td>'}<td>${s.n}</td></tr>`

/** Stats over a range, with a tab per scope the renderer offers: tiles, charts and spreads. */
export function statsHtml(v: StatsView) {
  const tabs = v.tabs.map((t) => {
    const project = v.projects.find((p) => p.id === t.id)
    return `<button class="${t.id === v.scope ? 'on' : ''}" aria-pressed="${t.id === v.scope}" data-stats-scope="${esc(t.id)}">${project ? `<i style="background:${seriesColor(project)}"></i>` : ''}${esc(t.label)}</button>`
  }).join('')
  const ranges = RANGES.map(([r, label]) => `<button class="${r === v.range ? 'on' : ''}" aria-pressed="${r === v.range}" data-stats-range="${r}">${label}</button>`).join('')
  const head = `<div class="stats-head"><div class="scopes">${tabs}</div><div class="ranges">${ranges}<button class="icon-btn" data-stats-read aria-label="read again" data-tip="read again">${ICON.resume}</button></div></div>`
  if (!v.stats) return `<div class="stats-panel">${head}${v.failed ? failedHtml('the stats', v.failed, 'data-stats-read') : '<p class="none">reading the stats…</p>'}</div>`
  const st = v.stats
  const all = v.scope === STATS_ALL
  const unlisted = Object.keys(st.projects).filter((id) => !v.projects.some((p) => p.id === id)).map((id) => ({ id, label: id, color: 'var(--deco)' }))
  const series = all ? [...v.projects, ...unlisted] : v.projects.filter((p) => p.id === v.scope)
  const scopeOf = (id: string) => (id === STATS_ALL ? st.all : st.projects[id] ?? EMPTY_SCOPE(st.buckets.length))
  const parts = series.map((s) => scopeOf(s.id))
  const shown = scopeOf(v.scope)
  const sum = shown.summary
  const hourly = st.bucket === 'hour'
  const hourOf = (h: number) => `${String(h).padStart(2, '0')}:00`
  const places = st.buckets.map((b) => (hourly ? { label: hourOf(new Date(b).getHours()), title: `${dayTitle(b)}, ${hourOf(new Date(b).getHours())}` } : { label: dayLabel(b), title: dayTitle(b) }))
  const every = Math.max(1, Math.ceil(places.length / (hourly ? 6 : 7)))
  const budget = all && st.budget
  const prompts = (origin: string) => sum.prompts[origin] ?? 0
  const yours = prompts('composer') + prompts('bridge')
  const tiles = [
    tileHtml('spent', usd(sum.spend), sum.turns ? `${usd(sum.spend / sum.turns)} a turn` : ''),
    tileHtml('agent-hours', hours(sum.agentHours), `${plural(sum.turns, 'turn')} · ${hours(sum.busyHours)} with anyone working`),
    tileHtml('working at once', sum.atOnce ? sum.atOnce.toFixed(1) : '–', `on average while anyone works · peak ${shown.peak.turns}`),
    tileHtml('waiting on you', sum.waits.n ? duration(sum.waits.p50) : '–', sum.waits.n ? `median of ${sum.waits.n} · p90 ${duration(sum.waits.p90)}` : 'no answered waits'),
    tileHtml('sessions worked', `${sum.worked}`, `${sum.sessions} started · ${plural(sum.resumes, 'resume')}`),
    tileHtml('prompts from you', `${yours}`, [sum.git.commits ? `${(yours / sum.git.commits).toFixed(1)} a commit landed` : '', `${prompts('peer')} from workers`, plural(sum.subagents, 'subagent')].filter(Boolean).join(' · ')),
    tileHtml('asked permission', `${sum.asks}`, `${plural(sum.failures, 'tool failure')}`),
    tileHtml('commits landed', `${sum.git.commits}`, `${plural(sum.git.merges, 'merge')} · ${branchNote(sum.git.repos)}`),
    tileHtml('lines changed', `<span class="add">+${count(sum.git.added)}</span> <span class="del">−${count(sum.git.removed)}</span>`, 'on the default branches'),
    ...(budget ? [tileHtml('left this week', budget.usdLeft === undefined ? '–' : `≈ ${usd(budget.usdLeft)}`,
      `${budget.percentUsed}% used${budget.outside ? `, ${budget.outside}% outside the tower` : ''}${budget.usdPerPercent === undefined ? '' : ` · ${usd(budget.usdPerPercent)} per 1%`}${budget.pace ? `<br>${paceWords(budget.pace, st.to).map(esc).join('<br>')}` : ''}`)] : []),
  ].join('')
  const per = hourly ? 'per hour' : 'per day'
  const hoursOfDay = Array.from({ length: 24 }, (_, h) => ({ label: hourOf(h), title: `${hourOf(h)} to ${hourOf((h + 1) % 24)}` }))
  const charts = [
    barsHtml(`Spend ${per}`, series, measureColumns(places, series, parts, (s) => s.series.spend, usd), usdAxis, every),
    barsHtml(`Agent-hours ${per}`, series, measureColumns(places, series, parts, (s) => s.series.agentHours, hours), hoursAxis, every),
    barsHtml(`Commits landed ${per}`, all ? [{ id: STATS_ALL, label: 'every floor' }] : series,
      totalColumns(places, shown.series.commits, series, parts, (s) => s.series.commits, (v) => plural(v, 'commit')), (v) => `${Math.round(v)}`, every),
    churnHtml(`Lines ${per}`, places, shown, series, parts, every),
    ...(hourly ? [] : [barsHtml('Spend by hour of day', series, measureColumns(hoursOfDay, series, parts, (s) => s.byHour.spend, usd), usdAxis, 6)]),
  ].join('')
  const spreads = `<table class="spreads"><tr><th></th><th>min</th><th>p50</th><th>avg</th><th>p90</th><th>max</th><th>n</th></tr>
    ${spreadRow('wait on you', sum.waits, short)}${spreadRow('turn', sum.turnSeconds, short)}${spreadRow('active / session', sum.activeMinutes, (m) => short(m * 60))}</table>`
  const extensions = Object.entries(sum.git.byExtension).sort((a, b) => b[1].added + b[1].removed - (a[1].added + a[1].removed)).slice(0, 6)
  const extensionRows = extensions.length
    ? `<table class="spreads"><tr><th>lines by kind</th><th>added</th><th>removed</th></tr>${extensions
        .map(([ext, c]) => `<tr><th>${esc(ext)}</th><td class="add">+${count(c.added)}</td><td class="del">−${count(c.removed)}</td></tr>`).join('')}</table>`
    : ''
  const models = Object.entries(sum.tokens).sort((a, b) => b[1].output - a[1].output)
  const tokenRows = models.length
    ? `<table class="spreads"><tr><th>tokens</th><th>out</th><th>in</th><th>cache read</th><th>cache write</th></tr>${models
        .map(([m, t]) => `<tr><th>${esc(m.replace(/^claude-/, ''))}</th>${[t.output, t.input, t.cacheRead, t.cacheWrite].map((n) => `<td>${tokens(n)}</td>`).join('')}</tr>`)
        .join('')}</table>`
    : ''
  return `<div class="stats-panel">${head}<div class="tiles">${tiles}</div><div class="charts">${charts}</div><div class="tables">${spreads}${tokenRows}${extensionRows}</div>
    <p class="as-of">read <span translate="no" data-since="${v.at}"></span> ago · waits run from a turn's end to your next prompt</p></div>`
}
