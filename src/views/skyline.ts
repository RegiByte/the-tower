import type { Board, Card, Floor } from '../bridge/board.ts'
import { skyAt } from '../shared/design.ts'
import { can, esc, gistLine, heededWaits, HOST_MEANS, loudest, statusName, whyNot } from '../shared/cards.ts'
import { chordLabel } from '../shared/keymap.ts'
import { floorSubject } from '../shared/subjects.ts'
import { readViewer, VIEWER_KEYS } from '../shared/viewer.ts'
import type { Mount } from '../shared/views.ts'
import { paintOf, paintOnce } from './parts.ts'

/**
 * `tower/skyline`, the board's view: a building per floor with a window per recent worker, under a sky that follows
 * the viewer's clock, and what waits on them; the welcome on a tower no worker has run on.
 */

const ID = 'tower/skyline'

/** Windows a building shows: its most recent sessions, oldest at the bottom. */
const BUILDING_WINDOWS = 40
const BUILDING_MIN_WINDOWS = 16

const STYLE = `@keyframes beacon { 0%, 60%, 100% { opacity: .2; } 70%, 85% { opacity: 1; } }
:where([data-view="${ID}"]) {
  position: relative; overflow: hidden; border-radius: var(--radius);
  background: linear-gradient(180deg, var(--sky-top), var(--sky-mid) 60%, var(--sky-horizon));
  & .stars { position: absolute; inset: 0; pointer-events: none; opacity: var(--stars);
    background-image: radial-gradient(1px 1px at 12% 18%, #fff, transparent), radial-gradient(1px 1px at 72% 9%, #fffc, transparent),
      radial-gradient(1px 1px at 38% 32%, #fffa, transparent), radial-gradient(1.5px 1.5px at 88% 26%, #fff, transparent),
      radial-gradient(1px 1px at 55% 14%, #fff9, transparent), radial-gradient(1px 1px at 23% 41%, #fff8, transparent),
      radial-gradient(1px 1px at 64% 37%, #fff9, transparent), radial-gradient(1px 1px at 6% 52%, #fff8, transparent); }
  & .orb { position: absolute; width: 54px; height: 54px; border-radius: 50%; left: var(--orb-x); top: var(--orb-y); transform: translate(-50%, -50%); }
  & .orb.moon { background: #eef0f6; box-shadow: 0 0 40px 6px #e9eefb33, inset -12px -6px 0 #cfd5e3; }
  & .orb.sun { background: #fff6dc; box-shadow: 0 0 60px 18px #ffe9a866; }
  & .hello { position: relative; align-self: flex-start; margin: var(--sp-3xl) 0 0 var(--sp-3xl); padding: var(--sp-xl) var(--sp-2xl); background: var(--panel); border-radius: var(--radius);
    box-shadow: var(--shadow); }
  & .hello .big { font: 900 var(--fs-3xl)/1.1 var(--display); text-transform: uppercase; letter-spacing: .05em; }
  & .hello .sub { color: var(--muted); margin-top: var(--sp-s); }
  & .welcome { max-width: 34em; }
  & .welcome dl { display: grid; grid-template-columns: auto 1fr; gap: var(--sp-2xs) var(--sp-m); margin: var(--sp-l) 0 0; }
  & .welcome dt { font-weight: 700; }
  & .welcome dd { margin: 0; color: var(--muted); }
  & .welcome .starts { display: flex; flex-wrap: wrap; gap: var(--sp-s); margin-top: var(--sp-l); }
  & .welcome .starts button { min-height: var(--control); padding: 0 var(--sp-l); }
  & .welcome .sub { margin-top: var(--sp-m); }
  & .hello .clock { color: var(--faint); font-size: var(--fs-s); margin-top: var(--sp-2xs); font-variant-numeric: tabular-nums; }
  & .city { position: relative; margin-top: auto; display: flex; align-items: flex-end; justify-content: center; gap: min(34px, 2vw); padding: 0 var(--sp-2xl); }
  & .building { flex: 0 1 196px; min-width: 0; container-type: inline-size; display: flex; flex-direction: column; align-items: center; }
  & .building .sign { max-width: 100%; margin-bottom: var(--sp-m); padding: var(--sp-xs) min(var(--sp-l), 5cqi); gap: min(var(--sp-m), 3cqi); background: var(--enamel); border-color: var(--enamel); color: #fff;
    box-shadow: inset 5px 0 0 var(--pp), var(--shadow); }
  & .building .sign .num { min-width: 22px; min-height: 19px; font-size: var(--fs-s); }
  & .building .sign .name { font-size: var(--fs-s); }
  & .building .mast { width: 2px; height: 22px; background: var(--ink); position: relative; }
  & .building .mast.alarm::after { content: ""; position: absolute; left: -4px; top: -8px; width: 10px; height: 10px; border-radius: 50%;
    background: var(--c); box-shadow: 0 0 14px var(--c); animation: beacon 1.6s infinite; }
  & .building .mast.alarm:not(.needs)::after { animation: none; }
  & .building .body { display: flex; flex-wrap: wrap-reverse; gap: 4.1cqi; width: 100%; padding: 8.2cqi 6.1cqi; background: var(--enamel);
    border-top: 6px solid var(--p, var(--deco)); border-radius: var(--radius-s) var(--radius-s) 0 0; }
  & .w { display: block; width: 18.4cqi; height: 12.2cqi; padding: 0; border: 0; border-radius: var(--radius-s); background: var(--enamel-2); }
  & .w.lit { background: var(--c); cursor: pointer; }
  & .w.lit.needs { animation: blink 1.1s steps(2, jump-none) infinite; }
  & .w.past { background: color-mix(in oklab, var(--c) 30%, var(--enamel-2)); cursor: pointer; }
  & .w.past:hover, & .w.lit:hover { outline: 2px solid var(--panel); }
  & .street { height: 26px; background: var(--enamel); border-top: 3px solid var(--enamel-2); }
}`

/** A floor's sign: its number on the project's band, its name in caps, whole in the tooltip. */
const signHtml = (n: number, name: string) =>
  `<div class="sign"><span class="num">${String(n).padStart(2, '0')}</span><span class="name" role="heading" aria-level="2" data-tip="${esc(name)}">${esc(name)}</span></div>`

const byStart = (a: Card, b: Card) => a.startedAt - b.startedAt

const windowHtml = (c: Card) => {
  const title = `${c.callsign} · ${statusName(c)}${gistLine(c) ? ' · ' + gistLine(c) : ''}`
  return `<button class="w ${c.onDuty ? 'lit' : 'past'} ${c.attention}" data-card="${esc(c.id)}" aria-label="${esc(title)}" data-tip="${esc(title)}"></button>`
}

const buildingHtml = (f: Floor, i: number) => {
  const shown = [...f.cards].sort(byStart).slice(-BUILDING_WINDOWS)
  const dark = '<div class="w"></div>'.repeat(Math.max(0, BUILDING_MIN_WINDOWS - shown.length) + ((4 - (Math.max(shown.length, BUILDING_MIN_WINDOWS) % 4)) % 4))
  return `<div class="building" style="${paintOf(f.color)}">${signHtml(i + 1, f.name)}<div class="mast ${loudest(f.cards.filter((c) => c.waiting)) ?? ''} ${f.cards.some((c) => c.waiting) ? 'alarm' : ''}"></div>
    <div class="body">${shown.map(windowHtml).join('')}${dark}</div></div>`
}

/** No worker has ever run on any floor: none on the board and none archived. */
const firstRun = (board: Board) => board.floors.every((f) => f.cards.length === 0 && f.archived === 0)

export const mount: Mount = async (host, { tower, board: first, kit }) => {
  let board = first
  /** Why a verb is held back while the tower doesn't answer: its board is stale. */
  let lost = false
  let dismissed = new Set((await readViewer(tower.store.get)).dismissed)

  const heldWhy = (verb: 'spawn') => (lost ? HOST_MEANS.unknown : whyNot(board, verb))

  const firstWorkerHtml = (f: Floor) => {
    const label = `Start a worker on ${f.name}`
    const held = heldWhy('spawn')
    if (held) return `<button class="held primary" aria-disabled="true" aria-label="${esc(label)}" data-tip="${esc(held)}">${esc(label)}</button>`
    return can(f, 'spawn') ? `<button class="primary" data-spawn="${esc(f.id)}">${esc(label)}</button>` : ''
  }

  const welcomeHtml = () => `<div class="hello welcome"><div class="big">Welcome to the tower</div>
    <dl><dt>A floor</dt><dd>is a project: the directory its workers start in, and the repos they work in.</dd>
      <dt>A worker</dt><dd>is a Claude Code session the tower runs, with a callsign of its own.</dd></dl>
    <div class="starts">${board.floors.map(firstWorkerHtml).join('')}</div>
    <div class="sub">Then ask it “give me a tour of the tower”: it shows you the tower on your own floors.</div>
    <div class="clock"></div></div>`

  const helloHtml = () => {
    const waiting = heededWaits(board, { dismissed }).length
    const working = board.floors.flatMap((f) => f.cards).filter((c) => c.status === 'working').length
    const big = waiting ? `<b>${waiting}</b> waiting on you` : working ? `${working} at work` : 'all quiet'
    const next = board.keys['next-waiting']
    const sub = waiting && next?.length ? `press ${next.map(chordLabel).join(' or ')} to go to the next one` : !board.hostUp ? `click a window to read it · ${esc(whyNot(board, 'spawn') ?? '')}` : 'click a window, or + on a floor to start a session'
    return `<div class="hello"><div class="big">${big}</div><div class="sub">${sub}</div><div class="clock"></div></div>`
  }

  host.innerHTML = `<style>${STYLE}</style><div class="stars"></div><div class="orb"></div><div style="display: contents"></div><div style="display: contents"></div>`
  const [hello, city] = [...host.children].slice(-2) as HTMLElement[]

  /** The sky follows the viewer's clock, as Tower 3D's does: the sun crosses by day, the moon hangs at night. */
  const paintSky = () => {
    const now = new Date()
    const hours = now.getHours() + now.getMinutes() / 60
    const sky = skyAt(hours)
    const day = Math.min(1, Math.max(0, (hours - 6) / 13))
    for (const [name, value] of Object.entries({ top: sky.top, mid: sky.mid, horizon: sky.horizon })) host.style.setProperty(`--sky-${name}`, value)
    host.style.setProperty('--stars', String(sky.stars))
    host.style.setProperty('--orb-x', sky.stars > 0.5 ? '86%' : `${36 + day * 56}%`)
    host.style.setProperty('--orb-y', sky.stars > 0.5 ? '14%' : `${46 - Math.sin(day * Math.PI) * 34}%`)
    host.querySelector('.orb')!.className = `orb ${sky.stars > 0.5 ? 'moon' : 'sun'}`
    const clock = host.querySelector('.clock')
    if (clock) clock.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const draw = () => {
    paintOnce(hello, firstRun(board) ? welcomeHtml() : helloHtml())
    paintOnce(city, `<div class="city">${board.floors.map(buildingHtml).join('')}</div><div class="street"></div>`)
    paintSky()
  }

  host.addEventListener('click', (e) => {
    const target = e.target as Element
    const card = target.closest<HTMLElement>('[data-card]')?.dataset.card
    if (card) return kit.display(`card:${card}`)
    const spawn = target.closest<HTMLElement>('[data-spawn]')?.dataset.spawn
    const f = spawn === undefined ? undefined : board.floors.find((f) => f.id === spawn)
    if (f) void kit.run('spawn', floorSubject(f))
  })

  const offStore = tower.store.on(async (key) => {
    if (key !== VIEWER_KEYS.dismissed) return
    dismissed = new Set((await readViewer(tower.store.get)).dismissed)
    draw()
  })
  const offError = tower.onBoardError((err) => {
    lost = err.code === 'disconnected'
    draw()
  })
  const clock = setInterval(paintSky, 1000)
  draw()

  return {
    update(next) {
      board = next
      lost = false
      draw()
    },
    close() {
      clearInterval(clock)
      offStore()
      offError()
    },
  }
}
