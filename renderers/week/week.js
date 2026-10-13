/**
 * The Week: a week of the tower as a yearbook. A week is seven days ending at a reset of the weekly quota
 * (`budget.resetsAt`), or ending now while the tower has read no quota; `#<YYYY-MM-DD>` names a week by the local day
 * it ends on. Everything drawn is read from the board, `/stats` over the week by hour, and each floor's archive.
 */
import { usd, hours, duration } from '/panels.js'
import { markdownHtml, markdownCss } from '/markdown.js'

const DAY = 86400_000
const WEEK = 7 * DAY
const PHOTO_ROWS = 24

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
const count = (v) => Math.round(v).toLocaleString('en-US')
const localDate = (at) => {
  const d = new Date(at)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const dayName = (at) => new Date(at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
const dayShort = (at) => `${new Date(at).toLocaleDateString('en-US', { weekday: 'short' })} ${new Date(at).getDate()}`
const clock = (at) => new Date(at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })

/** The week `back` weeks before the latest: `end` its last moment, `to` what has happened of it by `now`. */
function weekOf(resetsAt, now, back) {
  const end = (resetsAt ?? now) - back * WEEK
  return { from: end - WEEK, end, to: Math.min(end, now), back }
}

/** How many weeks before the latest the week ending on local day `date` is. */
const backOf = (resetsAt, now, date) => Math.max(0, Math.round(((resetsAt ?? now) - new Date(`${date}T00:00`).getTime()) / WEEK))

/** A worker's last moment the logs heard of. */
const lastSeen = (card) => Math.max(card.startedAt, card.heardAt ?? 0, card.enteredAt ?? 0)

/** The conversation a worker spoke last in. */
const latestSaid = (card) =>
  [...card.conversations].filter((c) => c.answer).sort((a, b) => b.startedAt - a.startedAt)[0]

/** Markdown to one plain line, for a caption. */
const plain = (md) =>
  md.split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('```'))
    ?.replace(/^#+\s*|^[-*]\s+/, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '') ?? ''

const caption = (text) => {
  const sentence = /^(.{20,140}?[.!?])(\s|$)/.exec(text)?.[1]
  return sentence ?? (text.length > 120 ? `${text.slice(0, 118).trimEnd()}…` : text)
}

/**
 * Every worker on duty within the week, one per floor and callsign: its sessions, their turns, worker-hours and spend
 * within the week (`/stats`'s share of each session), and its latest card.
 */
function workersOf(cards, { from, to }, shares) {
  const byName = new Map()
  for (const card of cards) {
    if (card.startedAt >= to || lastSeen(card) < from) continue
    const key = `${card.project}\n${card.callsign}`
    const had = byName.get(key)
    const share = shares[card.id]
    byName.set(key, {
      project: card.project, callsign: card.callsign,
      sessions: (had?.sessions ?? 0) + 1,
      turns: (had?.turns ?? 0) + (share?.turns ?? 0),
      agentHours: (had?.agentHours ?? 0) + (share?.agentHours ?? 0),
      spend: (had?.spend ?? 0) + (share?.spend ?? 0),
      latest: had && lastSeen(had.latest) > lastSeen(card) ? had.latest : card,
    })
  }
  return [...byName.values()]
}

/** The card whose session's share holds the longest of `pick` in the week, with that length. */
function holderOf(shares, cards, pick) {
  return Object.entries(shares)
    .map(([id, share]) => ({ card: cards.find((c) => c.id === id), lasted: pick(share) }))
    .filter(({ card, lasted }) => card && lasted)
    .sort((a, b) => b.lasted.seconds - a.lasted.seconds)[0]
}

/** What a worker did, in one line: its latest answer's first sentence, else what it was asked. */
function didLine(worker) {
  const said = latestSaid(worker.latest)
  if (said) return caption(plain(said.answer))
  const asked = [...worker.latest.conversations].sort((a, b) => b.startedAt - a.startedAt).find((c) => c.prompt)
  return asked ? `Asked: ${caption(plain(asked.prompt))}` : ''
}

/** The hourly series as local days, each with its 24 hours' turns (`null` outside the week) and its totals. */
function daysOf(stats) {
  const days = new Map()
  stats.buckets.forEach((at, i) => {
    const date = localDate(at)
    const day = days.get(date) ?? { date, at, hours: Array(24).fill(null), spend: 0, turns: 0, commits: 0, added: 0, removed: 0 }
    const s = stats.all.series
    day.hours[new Date(at).getHours()] = s.turns[i]
    day.spend += s.spend[i]; day.turns += s.turns[i]; day.commits += s.commits[i]; day.added += s.added[i]; day.removed += s.removed[i]
    days.set(date, day)
  })
  return [...days.values()]
}

/** How late into the night a local hour is: 06:00 the earliest, 05:00 the latest. */
const lateness = (hour) => (hour + 18) % 24

function superlatives(stats, floors, days, workers, cards) {
  const { summary, peak } = stats.all
  const said = []
  const landed = Object.entries(stats.projects).filter(([, p]) => p.summary.git.commits > 0)
    .sort(([, a], [, b]) => b.summary.git.commits - a.summary.git.commits)[0]
  if (landed) {
    const [id, p] = landed
    const floor = floors.find((f) => f.id === id)
    said.push({ title: 'Most commits landed', who: floor?.name ?? id, color: floor?.color,
      value: `${count(p.summary.git.commits)} commits`, more: `+${count(p.summary.git.added)} −${count(p.summary.git.removed)} lines` })
  }
  const busiest = days.filter((d) => d.turns > 0).sort((a, b) => b.spend - a.spend)[0]
  if (busiest) said.push({ title: 'Busiest day', who: dayName(busiest.at), value: usd(busiest.spend), more: `${count(busiest.turns)} turns, ${count(busiest.commits)} commits` })
  const longest = (title, pick, median) => {
    const held = holderOf(stats.sessions, cards, pick)
    if (!held) return
    const floor = floors.find((f) => f.id === held.card.project)
    said.push({ title, who: `${held.card.callsign}, ${floor?.name ?? held.card.project}`, color: floor?.color,
      value: duration(held.lasted.seconds), more: `${dayName(held.lasted.at)}, ${clock(held.lasted.at)}; ${median}` })
  }
  longest('Longest single turn', (s) => s.longestTurn, `the median turn took ${duration(summary.turnSeconds.p50)}`)
  longest('Longest wait on you', (s) => s.longestWait, `the median wait was ${duration(summary.waits.p50)}`)
  const hardest = [...workers].sort((a, b) => b.agentHours - a.agentHours)[0]
  if (hardest?.agentHours > 0) {
    const floor = floors.find((f) => f.id === hardest.project)
    said.push({ title: 'Most worker-hours', who: `${hardest.callsign}, ${floor?.name ?? hardest.project}`, color: floor?.color,
      value: hours(hardest.agentHours), more: `${count(hardest.turns)} turns, ${usd(hardest.spend)} spent` })
  }
  const owl = stats.buckets.map((at, i) => ({ at, turns: stats.all.series.turns[i], hour: new Date(at).getHours() }))
    .filter((b) => b.turns > 0 && lateness(b.hour) >= 16)
    .sort((a, b) => lateness(b.hour) - lateness(a.hour) || b.at - a.at)[0]
  if (owl) said.push({ title: 'Night owl', who: dayName(owl.at), value: `${clock(owl.at)}`, more: `the latest hour of the night a turn ran, ${count(owl.turns)} of them` })
  if (peak.turns > 1) said.push({ title: 'Most at once', who: peak.at ? `${dayName(peak.at)}, ${clock(peak.at)}` : undefined, value: `${peak.turns} workers`, more: 'running turns at the same moment' })
  return said
}

/**
 * The quote of the week: the latest answer short enough to read (its first paragraph, 24 to 280 characters, and no
 * lead-in ending in a colon) from the floor that landed most commits, else from the next floor down.
 */
function quoteOf(workers, stats) {
  const commits = (project) => stats.projects[project]?.summary.git.commits ?? 0
  return workers
    .map((w) => ({ w, said: latestSaid(w.latest) }))
    .filter(({ said }) => said)
    .map(({ w, said }) => ({ w, at: said.startedAt, text: said.answer.trim().split(/\n\s*\n/)[0].trim() }))
    .filter(({ text }) => text.length >= 24 && text.length <= 280 && !text.startsWith('```') && !/:\W*$/.test(text))
    .sort((a, b) => commits(b.w.project) - commits(a.w.project) || b.at - a.at)[0]
}

const textOn = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55 ? '#1d1a14' : '#fffaf0'
}
const floorStyle = (color) => (color ? `--floor:${color};--on-floor:${textOn(color)}` : '')

function coverHtml(week, stats) {
  const { summary } = stats.all
  const git = summary.git
  const used = stats.weekly && Date.parse(stats.weekly.resetsAt) === week.end ? `<div class="big"><b>${stats.weekly.percentUsed}%</b><span>of the weekly quota${week.to < week.end ? ' so far' : ''}${stats.outside ? `, ${stats.outside}% of it outside the tower` : ''}</span></div>` : ''
  return `<section class="cover">
    <p class="eyebrow">The tower's yearbook</p>
    <h1>The Week</h1>
    <p class="dates">${esc(dayName(week.from))} – ${esc(dayName(week.end))}${week.to < week.end ? ' <span class="pill">so far</span>' : ''}</p>
    <div class="bigs">
      ${used}
      <div class="big"><b>${usd(summary.spend)}</b><span>spent</span></div>
      <div class="big"><b>${count(summary.sessions)}</b><span>sessions</span></div>
      <div class="big"><b>${hours(summary.agentHours)}</b><span>worker-hours</span></div>
      <div class="big"><b>${count(git.commits)}</b><span>commits landed</span></div>
      <div class="big"><b><em class="add">+${count(git.added)}</em> <em class="del">−${count(git.removed)}</em></b><span>lines</span></div>
    </div>
  </section>`
}

function tileHtml(worker, color) {
  const line = didLine(worker)
  return `<li class="tile" style="${floorStyle(color)}">
    <span class="face" aria-hidden="true">${esc(worker.callsign.slice(0, 2))}</span>
    <span class="name">${esc(worker.callsign)}${worker.sessions > 1 ? ` <small>×${worker.sessions}</small>` : ''}</span>
    <span class="did" title="${esc(line)}">${esc(line) || '<i>no words saved</i>'}</span>
    <span class="tally">${worker.turns ? `${count(worker.turns)} ${worker.turns === 1 ? 'turn' : 'turns'} · ${usd(worker.spend)}` : 'no turns this week'}</span>
  </li>`
}

function photoHtml(workers, floors) {
  const groups = floors
    .map((f) => ({ f, ws: workers.filter((w) => w.project === f.id).sort((a, b) => b.turns - a.turns || a.callsign.localeCompare(b.callsign)) }))
    .filter(({ ws }) => ws.length)
  if (!groups.length) return `<section><h2>The class photo</h2><p class="note">Nobody worked this week.</p></section>`
  return `<section><h2>The class photo</h2>${groups.map(({ f, ws }) => `
    <div class="floor" style="${floorStyle(f.color)}">
      <h3><span class="swatch"></span>${esc(f.name)} <small>${ws.length} ${ws.length === 1 ? 'worker' : 'workers'}</small></h3>
      <ul class="tiles">${ws.slice(0, PHOTO_ROWS).map((w) => tileHtml(w, f.color)).join('')}</ul>
      ${ws.length > PHOTO_ROWS ? `<details><summary>and ${ws.length - PHOTO_ROWS} more</summary><ul class="tiles">${ws.slice(PHOTO_ROWS).map((w) => tileHtml(w, f.color)).join('')}</ul></details>` : ''}
    </div>`).join('')}</section>`
}

function rhythmHtml(days) {
  const most = Math.max(1, ...days.flatMap((d) => d.hours.map((t) => t ?? 0)))
  const spendMost = Math.max(0.01, ...days.map((d) => d.spend))
  const commitsMost = Math.max(1, ...days.map((d) => d.commits))
  const cell = (d, h, t) => t === null
    ? '<span class="cell out"></span>'
    : `<span class="cell" style="--v:${(t / most).toFixed(3)}" title="${esc(`${dayName(d.at)} ${String(h).padStart(2, '0')}:00 · ${t} turns`)}"></span>`
  return `<section><h2>The week's rhythm</h2>
    <p class="note">Turns started, by hour of the day.</p>
    <div class="heat" role="img" aria-label="Turns by day and hour">
      <span></span>${Array.from({ length: 24 }, (_, h) => `<span class="hour">${h % 6 === 0 ? h : ''}</span>`).join('')}
      ${days.map((d) => `<span class="day">${esc(dayShort(d.at))}</span>${d.hours.map((t, h) => cell(d, h, t)).join('')}`).join('')}
    </div>
    <div class="bars">
      <span></span><span class="legend spend">spend</span><span class="legend commits">commits</span>
      ${days.map((d) => `<span class="day">${esc(dayShort(d.at))}</span>
        <span class="bar spend" style="--v:${(d.spend / spendMost).toFixed(3)}"><b>${usd(d.spend)}</b></span>
        <span class="bar commits" style="--v:${(d.commits / commitsMost).toFixed(3)}"><b>${count(d.commits)}</b></span>`).join('')}
    </div>
  </section>`
}

const superlativesHtml = (said) => said.length ? `<section><h2>Superlatives</h2><ul class="awards">${said.map((s) => `
  <li class="award" style="${floorStyle(s.color)}">
    <span class="eyebrow">${esc(s.title)}</span>
    <b>${esc(s.value)}</b>
    ${s.who ? `<span class="who">${esc(s.who)}</span>` : ''}
    <span class="more">${esc(s.more)}</span>
  </li>`).join('')}</ul></section>` : ''

const quoteHtml = (quote, floors) => {
  if (!quote) return ''
  const floor = floors.find((f) => f.id === quote.w.project)
  return `<section class="quote" style="${floorStyle(floor?.color)}"><h2>Quote of the week</h2>
    <blockquote class="md">${markdownHtml(quote.text)}</blockquote>
    <p class="by">— ${esc(quote.w.callsign)}, ${esc(floor?.name ?? quote.w.project)}, ${esc(dayName(quote.at))}</p>
    <p class="note">The latest short answer from the floor that landed the most commits.</p>
  </section>`
}

const state = { board: undefined, cards: [], reading: 0 }
const book = document.getElementById('book')
document.head.append(Object.assign(document.createElement('style'), { textContent: markdownCss }))

const resetOf = (board) => {
  const { budget } = board.today
  return budget ? new Date(budget.resetsAt).getTime() : undefined
}

async function draw() {
  const now = Date.now()
  const resetsAt = resetOf(state.board)
  const date = location.hash.slice(1)
  const week = weekOf(resetsAt, now, /^\d{4}-\d{2}-\d{2}$/.test(date) ? backOf(resetsAt, now, date) : 0)
  document.getElementById('range').textContent = `${dayName(week.from)} – ${dayName(week.end)}`
  document.getElementById('later').disabled = week.back === 0
  document.title = `The Week · ${dayName(week.end)}`
  const reading = ++state.reading
  const stats = await tower.stats({ from: week.from, to: week.to, bucket: 'hour' })
  if (reading !== state.reading) return
  const floors = state.board.floors
  const cards = [...new Map([...state.cards, ...floors.flatMap((f) => f.cards)].map((c) => [c.id, c])).values()]
  const workers = workersOf(cards, week, stats.sessions)
  const days = daysOf(stats)
  book.innerHTML = [
    coverHtml(week, stats),
    resetsAt ? '' : '<p class="note">No weekly quota read yet: this is the last seven days.</p>',
    photoHtml(workers, floors),
    rhythmHtml(days),
    superlativesHtml(superlatives(stats, floors, days, workers, cards)),
    quoteHtml(quoteOf(workers, stats), floors),
  ].join('')
}

const step = (by) => {
  const resetsAt = resetOf(state.board)
  const date = location.hash.slice(1)
  const back = Math.max(0, (/^\d{4}-\d{2}-\d{2}$/.test(date) ? backOf(resetsAt, Date.now(), date) : 0) + by)
  location.hash = back === 0 ? '' : localDate(weekOf(resetsAt, Date.now(), back).end)
}
document.getElementById('earlier').addEventListener('click', () => step(1))
document.getElementById('later').addEventListener('click', () => step(-1))
addEventListener('hashchange', () => draw().catch(failed))

const failed = (err) => { book.innerHTML = `<p class="note broken">${esc(err.message)}</p>` }
tower.onBoardError((err) => { if (!state.board) failed(err) })

const first = new Promise((resolve) => tower.subscribe((board) => { state.board = board; resolve(board) }))
const board = await first
state.cards = (await Promise.all(board.floors.map((f) => tower.archive(f.id)))).flat()
draw().catch(failed)
