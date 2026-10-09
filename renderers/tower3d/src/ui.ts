import { documentCss } from '../../../src/shared/design.ts'
import { DRAFTS, draftItem, draftState, draftsOf, type Draft } from '../../../src/shared/drafts.ts'
import { collectionTrayHtml, deleteAsk, itemFile, itemKind, itemPath, itemsCss, itemTextHtml } from '../../../src/shared/items.ts'
import type { FloorCollection, FloorItem } from '../../../src/bridge/board.ts'
import { keptTitle } from './kept.ts'
import { REVIEWS } from '../../../src/shared/reviews.ts'
import { failedHtml, fileButtonsHtml, fileSpansHtml, usd } from '../../../src/shared/panels.ts'
import { documentHtml, markdownHtml } from '../../../src/shared/markdown.ts'
import { briefHtml as lineageBriefHtml, RESUMED_IDLE, resumedIdle, sessionLabel, sessionWhen, shownFrom, type BriefView } from '../../../src/shared/brief.ts'
import { drawerLabel, drawersAt, type ArchiveRead, type Drawer } from './archive.ts'
import { CAT_CARDS, catName, HELD, KEY, sentHome, type Act, type Carried, type CatNames, type Offer } from './acts.ts'
import type { Board, Brief, Card, Floor, KeptBy, SessionRef, Shell, Wait } from './api.ts'
import { ATTENTION_MEANS, ATTENTION_NAME, HOST_ATTENTION, HOST_MEANS, HOST_NAME, ON_DUTY_MEANS, hostState, BLOCKED_TEXT, DISMISS_TITLE, GIST_MARK, heededWaits, type Heed, claudeFlagHtml, LIMITS_STALE_MS, WORKTREE_STATE_NAME, WORKTREE_VERB_NAME, ago, base, can, cardsOf, current, detailsOf, goneBases, pastCount, pastCrews, pastMatching, pastSize, type PastCrew, resumesRow, pictureOf, rendererUrl, risky, shelfKind, shelfSource, keptBranchLines, commandName, esc, findCard, gistLine, gistOf, lampOf, leftoversOf, loudest, metaOf, modelName, neighbours, paceLine, plain, resetLine, resetWhen, shownTitle, span, statusName, statusTitle, threadCheckoutOf, tidyLine, tidyRows, type TidyRow, landedRow, KILL_COST, type DaemonVerb, weekElapsed, whereLine, worktreeBranch, worktreeRisk, UNRESUMABLE_NAME, UNRESUMABLE_TITLE, type Move, LET_GO_MEANS, CARRY_ON_MEANS, letGoAsk, resumeAllAsk, strandedOf, sendHomeAsk, reapAsk, killShellAsk, tidyRowAsk, tidyAllAsk, shellPlaces, type ShellPlace, WORKTREE_ASK, carriedLine, discardAsk, editedRows, type EditedRow } from './cards.ts'
import { chordLabel, keysLabel } from '../../../src/shared/keymap.ts'
import { ICON, SHELF_ICON, originIcon, withIcons } from '../../../src/shared/icons.ts'
import { wallNow } from './clock.ts'
import type { Level, Plan } from './layout.ts'
import { noteTitle } from './notes.ts'
import { gameTitle } from './arcade.ts'
import { gameItem, gamePath, gamesOf } from './games.ts'
import { isImage, isMarkdown, isVideo, shownHref, type Shown } from './showing.ts'
import { LOBBY_BAND } from './sign.ts'

/** The panels' contents as HTML, from the board and where you are. main.ts puts them on the page and wires them. */

const NO_BAND = '#d8e1f0'
const tint = (l: Level) => (l.kind === 'floor' ? (l.floor.color ?? NO_BAND) : LOBBY_BAND)
const levelKey = (l: Level) => (l.kind === 'roof' ? 'R' : String(l.index))

/** A project's lamp: its colour, never an attention. */
const swatch = (color: string) => `<span class="lamp" style="--c:${color}"></span>`
const pill = (c: Card) => `<span class="pill ${lampOf(c)}" data-tip="${esc(statusTitle(c))}"><span class="lamp"></span>${esc(statusName(c))} · ${ago(wallNow() - c.enteredAt)}</span>`
/** A floor sign: a plate tinted by the band on its edge, the key that rides there on a tile, the name in caps. */
const sign = (key: string, name: string, band: string, extra = '') =>
  `<div class="sign" style="--p:${band}"><span class="num">${esc(key)}</span><span class="name">${esc(name)}</span>${extra}</div>`
/** A project's floor sign, as the elevator and the HUD draw it. */
export const floorSignHtml = (p: Plan, project: string) => {
  const l = p.levels.find((l) => l.kind === 'floor' && l.floor.id === project)!
  return sign(levelKey(l), l.name, tint(l))
}
const toolHtml = (tool: string) => {
  const [name, ...target] = tool.split(' ')
  return `<b>${esc(name)}</b> ${esc(target.join(' '))}`
}
/** A meter's fill: ink, then working past 60%, needs past 85%. */
const fillOf = (pct: number) => (pct > 85 ? 'var(--needs)' : pct > 60 ? 'var(--working)' : 'var(--ink)')

/** A rate limit's window, short: `five_hour` reads 5h, `seven_day_opus` 7d opus. */
const limitName = (kind: string) => kind.replace('five_hour', '5h').replace('seven_day', '7d').replaceAll('_', ' ')

/** The strip at the bottom-left: where you are, who works and the rate limits, each piece only while it says something. */
export function hudHtml(board: Board, here: Level, { music, sharing, fresh, waits }: { music: boolean; sharing: boolean; fresh: number; waits: Wait[] }) {
  const duty = cardsOf(board).filter((c) => c.onDuty)
  const count = (a: Card['attention']) => duty.filter((c) => c.attention === a).length
  const state = hostState(board)
  const host = `<span class="hud-host ${HOST_ATTENTION[state]}" data-tip="${esc(HOST_MEANS[state])}"><span class="lamp"></span>${state === 'up' ? '' : HOST_NAME[state]}</span>`
  const tune = `<button class="icon-btn hud-music${music ? ' on' : ''}" data-music aria-label="music" aria-pressed="${music}" data-tip="music ${music ? 'on' : 'off'} (B)">${music ? ICON.music : ICON.silent}</button>`
  const gear = `<button class="icon-btn" popovertarget="settings" aria-label="settings" data-tip="settings: sound and theme">${ICON.settings}</button>`
  const tally = (['ready', 'working', 'quiet', 'broken'] as const).filter((a) => count(a))
    .map((a) => `<span class="${a}" data-tip="${esc(`${count(a)} ${ATTENTION_NAME[a]}: ${ATTENTION_MEANS[a]}\n\n${ON_DUTY_MEANS}`)}"><span class="lamp"></span><b>${count(a)}</b></span>`)
  const shells = board.shells.length ? [`<span data-tip="${board.shells.length} shells running"><b>${board.shells.length}</b> shells</span>`] : []
  const crew = [...tally, ...shells]
  const now = wallNow()
  const age = now - (board.rateLimitsAt ?? now)
  const stale = age > LIMITS_STALE_MS
  const limits = board.rateLimits.map((r) => {
    const elapsed = weekElapsed(r, now)
    const title = [`${r.kind.replaceAll('_', ' ')}: ${r.percentUsed}% used`, r.resetsAt && resetLine(r.resetsAt, now),
      elapsed !== undefined && paceLine(r.percentUsed, elapsed), `as of ${span(age)} ago`].filter(Boolean).join(' · ')
    const pace = elapsed === undefined ? '' : `<s style="left:${elapsed}%"></s>`
    const reset = r.resetsAt ? `<small>${resetWhen(r.resetsAt, now) ?? 'reset'}</small>` : ''
    return `<span data-tip="${esc(title)}">${esc(limitName(r.kind))}
      <span class="meter" style="--fill:${fillOf(r.percentUsed)}"><i style="width:${r.percentUsed}%"></i>${pace}</span><b>${r.percentUsed}%</b>${reset}</span>`
  })
  const asOf = stale ? [`<small data-tip="read during a session's turn: it refreshes only while one works">as of ${span(age)} ago</small>`] : []
  return `<span class="chip hud-group">${host}${tune}${gear}</span>${sign(levelKey(here), here.name, tint(here))}
    ${waits.length ? `<button class="chip ${loudest(waits.map((w) => findCard(board, w.id)!))} some" data-next data-tip="next waiting (N)"><span class="lamp"></span><b>${waits.length}</b> waiting <kbd>N</kbd></button>` : ''}
    ${crew.length ? `<span class="chip hud-group">${crew.join('')}</span>` : ''}
    ${limits.length ? `<span class="chip hud-group hud-limits${stale ? ' stale' : ''}">${[...limits, ...asOf].join('')}</span>` : ''}
    ${fresh ? `<button class="chip hud-shown" data-shown data-tip="look at the newest (V)"><b>${fresh}</b> new shown <kbd>V</kbd></button>` : ''}
    ${sharing ? '<button class="chip hud-share" data-stop-share data-tip="stop sharing the big screen">stop sharing</button>' : ''}`
}

const LEFT_SHOWN = 4

/** What a worker left running on the machine: each process, the ports it listens on, and whether it was orphaned. */
const leftHtml = (c: Card) => {
  if (!c.resources.length) return ''
  const rows = c.resources.slice(0, LEFT_SHOWN).map((r) =>
    `<code data-tip="${esc(r.command)}">${r.pid}${r.ports.length ? ` :${r.ports.join(' :')}` : ''}${r.orphan ? ' orphan' : ''} · ${esc(r.command)}</code>`).join('')
  const more = c.resources.length > LEFT_SHOWN ? `<span>and ${c.resources.length - LEFT_SHOWN} more</span>` : ''
  return `<div class="left"><span>left running</span>${rows}${more}</div>`
}

/** What you're looking at: its name and state. */
function aimedHead(act: Act, board: Board, cats: CatNames) {
  if (act.kind === 'desk' || act.kind === 'tile') {
    const c = findCard(board, act.id)
    if (!c) return ''
    return `<div class="head"><span class="call">${esc(c.callsign)}</span>${pill(c)}</div>
      <div class="meta">${esc(metaOf(c))}</div>${gistLine(c) ? `<div class="gist">${esc(gistLine(c))}</div>` : ''}${leftHtml(c)}`
  }
  if (act.kind === 'binder') {
    const c = findCard(board, act.id)
    if (!c) return ''
    const n = c.lineage.length
    return `<div class="head"><span class="call">${esc(c.callsign)}'s logbook</span></div>
      <div class="meta">${n} session${n === 1 ? '' : 's'} since ${esc(sessionWhen(c.lineage[0].startedAt))}</div>`
  }
  if (act.kind === 'drawer') {
    const d = drawersAt(act.project)?.[act.n]
    if (!d) return ''
    const names = d.folders.slice(0, 6).map((c) => c.callsign).join(', ')
    return `<div class="head"><span class="call">Archive · ${esc(drawerLabel(d))}</span></div>
      <div class="meta">${esc(names)}${d.folders.length > 6 ? ` and ${d.folders.length - 6} more` : ''}</div>`
  }
  if (act.kind === 'papers') {
    const c = findCard(board, act.id)
    if (!c?.unseen) return ''
    return `<div class="head"><span class="call">Review notes</span><span class="meta">${c.unseen} new to ${esc(c.callsign)}</span></div>
      <div class="meta">on the thread of ${esc(c.checkout)}</div>`
  }
  if (act.kind === 'thread') {
    const f = board.floors.find((f) => f.id === act.project)
    const t = f?.threads.find((t) => t.checkout === act.checkout)
    if (!f || !t) return ''
    const last = t.last ? ` · last ${esc(t.last.author)}, ${esc(t.last.at.slice(11))}` : ''
    return `<div class="head"><span class="call">${esc(t.checkout)}</span><span class="meta">${esc(t.tag)}</span></div>
      <div class="meta">${t.messages} note${t.messages === 1 ? '' : 's'}${last}${t.landed ? ' · landed: tidy files it' : ''}</div>`
  }
  if (act.kind === 'shown') {
    const c = findCard(board, act.id)
    const latest = c?.shown.at(-1)
    if (!c || !latest) return ''
    const more = c.shown.length > 1 ? ` · ${c.shown.length} shown in all` : ''
    return `<div class="head"><span class="call">${esc(shownTitle(latest))}</span></div>
      <div class="meta">${esc(c.callsign)} showed you this ${ago(wallNow() - latest.at)} ago${more}</div>`
  }
  if (act.kind === 'picture') {
    const picture = pictureOf(board, act.id, act.target)
    if (!picture) return ''
    const { worker, shown: sh, card: c } = picture
    const where = c?.onDuty ? 'on duty' : c ? statusName(c) : 'archived'
    return `<div class="head"><span class="call">${esc(shownTitle(sh))}</span></div>
      <div class="meta">${esc(worker.callsign)} (${esc(where)}) showed you this ${ago(wallNow() - sh.at)} ago</div>`
  }
  if (act.kind === 'leftover') {
    const c = findCard(board, act.id)
    const r = c?.resources.find((r) => r.pid === act.pid)
    if (!c || !r) return ''
    return `<div class="head"><span class="call">${r.pid}${r.ports.length ? ` :${r.ports.join(' :')}` : ''}</span><span class="meta">${r.orphan ? 'orphaned · ' : ''}left by ${esc(c.callsign)}</span></div>
      <div class="left"><code data-tip="${esc(r.command)}">${esc(r.command)}</code></div>`
  }
  if (act.kind === 'tidy') {
    const f = board.floors.find((f) => f.id === act.project)
    return f ? `<div class="head"><span class="call">${esc(tidyLine(f.tidy))}</span></div>${tidyListHtml(f)}` : ''
  }
  if (act.kind === 'landed') {
    const f = board.floors.find((f) => f.id === act.project)
    const row = f && landedRow(f, act.id, wallNow())
    return row ? `<div class="head"><span class="call">${esc(row.what)}</span><span class="meta">${esc(row.does)}</span></div><div class="meta">${esc(KILL_COST)}</div>` : ''
  }
  if (act.kind === 'shell') {
    const sh = board.shells.find((s) => s.id === act.id)
    return sh ? `<div class="head"><span class="call">shell · ${esc(base(sh.cwd))}</span></div><div class="meta">${esc(sh.activity)} · ${ago(wallNow() - sh.startedAt)}</div>` : ''
  }
  if (act.kind === 'floor') {
    const f = board.floors.find((f) => f.id === act.id)
    return f ? `<div class="head">${swatch(f.color ?? NO_BAND)}<span class="call">${esc(f.name)} console</span></div>` : ''
  }
  if (act.kind === 'shelf' || act.kind === 'book') {
    const entry = board.floors.find((f) => f.id === act.project)?.shelf?.[act.n]
    if (!entry) return ''
    const what = act.kind === 'book' ? base(act.file).replace(/\.md$/, '') : entry.label
    return `<div class="head"><span class="call">${esc(what)}</span></div>${act.kind === 'book' ? `<div class="meta">${esc(entry.label)}</div>` : ''}`
  }
  if (act.kind === 'station') {
    const f = board.floors.find((f) => f.id === act.project)
    if (!f) return ''
    return act.open
      ? `<div class="head"><span class="call">Open desk</span></div><div class="meta">a worker starts in ${esc(base(f.hub))} with the defaults</div>`
      : `<div class="head"><span class="call">Free desk</span></div><div class="meta">the floor's next worker sits at the lit one</div>`
  }
  if (act.kind === 'cork') {
    const f = board.floors.find((f) => f.id === act.project)
    const drafts = f && draftsOf(f)
    if (!drafts) return ''
    const n = drafts.items.length
    return `<div class="head">${swatch(f.color ?? NO_BAND)}<span class="call">${esc(drafts.label)}</span></div><div class="meta">${n} pinned · ${esc(drafts.description ?? 'prompts kept for later')}</div>`
  }
  if (act.kind === 'note') {
    const item = draftItem(board.floors, act.project, act.id)
    if (!item) return ''
    return `<div class="head"><span class="call">${esc(noteTitle(act.project, item))}</span></div><div class="meta">${esc(item.tag)}${keptByText(item.keptBy)} · changed ${ago(wallNow() - item.modifiedAt)} ago</div>`
  }
  if (act.kind === 'arcade') {
    const item = gameItem(board.floors, act.project, act.id)
    if (!item) return ''
    const about = gamesOf(board.floors.find((f) => f.id === act.project)!)?.description
    return `<div class="head"><span class="call">${esc(gameTitle(act.project, item))}</span></div><div class="meta">a game · ${esc(item.tag)}${keptByText(item.keptBy)} · changed ${ago(wallNow() - item.modifiedAt)} ago</div>${about ? `<div class="meta">${esc(about)}</div>` : ''}`
  }
  if (act.kind === 'guest') {
    const c = findCard(board, act.id)
    if (!c) return ''
    return `<div class="head"><span class="call">${esc(c.callsign)}</span><span class="meta">off duty · ${ago(wallNow() - c.enteredAt)}</span></div>
      ${gistLine(c) ? `<div class="gist">${esc(gistLine(c))}</div>` : ''}`
  }
  if (act.kind === 'cat') {
    const c = act.watching ? findCard(board, act.watching) : undefined
    return `<div class="head"><span class="call">${esc(catName(act.name, cats))} 🐈</span><span class="meta">${CAT_CARDS[act.name].coat}</span></div>
      <div class="meta">${c ? `keeping an eye on ${esc(c.callsign)}, waiting ${ago(wallNow() - c.enteredAt)}` : act.following ? 'following you' : 'roaming the tower'}</div>`
  }
  if (act.kind === 'tv') return `<div class="head"><span class="call">The big screen</span></div>`
  if (act.kind === 'directory') return `<div class="head"><span class="call">Building directory</span></div>`
  if (act.kind === 'stats') return `<div class="head"><span class="call">Stats</span><span class="meta">${usd(board.today.spend)} spent today</span></div>`
  if (act.kind === 'dj') return `<div class="head"><span class="call">The DJ</span></div>`
  if (act.kind === 'bar') return `<div class="head"><span class="call">Rooftop bar 🍺</span></div>`
  return `<div class="head"><span class="call">Elevator</span></div><div class="meta">or press a floor's number</div>`
}

/**
 * Each verb on its key, the one a click runs marked; held verbs show a ring that fills while held, and a verb held
 * back fades with why.
 */
const offersHtml = (offers: Offer[], marked: number) =>
  offers.map((o, i) => `<div class="offer${i === marked ? ' on' : ''}${o.whyNot ? ' held-back' : ''}" data-verb="${o.verb}">
    <kbd${HELD.has(o.verb) ? ' class="held"' : ''}>${KEY[o.verb]}</kbd><span>${HELD.has(o.verb) ? 'hold · ' : ''}${esc(o.label)}${o.whyNot ? `<small>${esc(o.whyNot)}</small>` : ''}</span></div>`).join('')

/** The aimed thing and what it offers, each verb on its own key. Empty for a thing gone from the board. */
export function promptHtml(act: Act, board: Board, offers: Offer[], marked: number, cats: CatNames) {
  const head = aimedHead(act, board, cats)
  return head && `${head}${offers.length ? `<div class="offers">${offersHtml(offers, marked)}</div>` : ''}`
}

export function elevatorHtml(p: Plan, here: number, riding: boolean) {
  const rows = [...p.levels].reverse().map((l) => {
    const waits = l.kind === 'floor' ? l.desks.filter((d) => d.card.waiting).map((d) => d.card) : []
    return `<button class="lift-row${l.index === here ? ' here' : ''}" style="--p:${tint(l)}" data-ride="${l.index}" ${riding ? 'disabled' : ''}>
      <span class="num">${levelKey(l)}</span><span class="name">${esc(l.name)}</span>${waits.length ? `<span class="chip ${loudest(waits)} some"><span class="lamp"></span><b>${waits.length}</b></span>` : ''}</button>`
  }).join('')
  return `<h3 class="eyebrow">Elevator${riding ? ' · riding' : ''}</h3>${rows}`
}

/** The keys that ride to a level from inside the car: its index, R for the roof. */
export const levelForKey = (p: Plan, code: string) => {
  if (code === 'KeyR') return p.levels.at(-1)!.index
  const digit = /^(Digit|Numpad)(\d)$/.exec(code)?.[2]
  return digit !== undefined && Number(digit) < p.levels.length - 1 ? Number(digit) : undefined
}

/** Why a daemon verb is held back now, `undefined` while it can run (`heldWhy`). */
export type HeldWhy = (verb: DaemonVerb) => string | undefined

/** A button for a daemon verb held back: drawn, inert, its tip saying why. */
const heldButton = (why: string, cls: string, label: string, inner: string) =>
  `<button class="held ${cls}" aria-disabled="true" aria-label="${esc(label)}" data-tip="${esc(why)}">${inner}</button>`

/**
 * A button that asks before it acts: its first press arms it, showing "sure?" with the question as its tip, and a
 * second press within a few seconds acts. A shelf page may not open `confirm()`.
 */
const askingButton = (armed: boolean, attrs: string, label: string, tip: string, ask: string) =>
  `<button ${attrs} data-tip="${esc(armed ? ask : tip)}">${armed ? 'sure?' : label}</button>`

/** A panel's close: back to walking, or the panel beside the world shut. */
const closeButton = `<button class="icon-btn x" data-act="close" aria-label="close" data-tip="close">${ICON.close}</button>`

/** A worker's desk head: who and where, a glance at its context and cost, and what can be done with it. */
export function deskHeadHtml(c: Card, floor: Floor | undefined, armed: (key: string) => boolean, held: HeldWhy, framed: boolean) {
  const ctx = c.context
  const stats = [
    ctx !== undefined && `<span class="meter" data-tip="context window: ${ctx}% · ${esc(modelName(c.model))}" style="--fill:${ctx > 80 ? 'var(--needs)' : 'var(--working)'}"><i style="width:${ctx}%"></i></span><b>${ctx}%</b>`,
    c.costUsd != null && `<b>$${c.costUsd.toFixed(2)}</b>`,
    claudeFlagHtml(c),
  ].filter(Boolean).join('')
  const acts = [
    `<button class="icon-btn" popovertarget="desk-details" aria-label="details" data-tip="everything else about ${esc(c.callsign)}">${ICON.info}</button>`,
    can(c, 'carry-on') && (held('carry-on') ? heldButton(held('carry-on')!, 'primary', 'Carry on', `${ICON.resume} Carry on`) : `<button class="primary" data-act="carry-on" data-tip="${esc(`${c.callsign} was cut off mid-turn: ${CARRY_ON_MEANS}`)}">${ICON.resume} Carry on</button>`),
    can(c, 'resume') && (held('resume') ? heldButton(held('resume')!, can(c, 'carry-on') ? '' : 'primary', 'Resume', `${ICON.resume} Resume`) : `<button class="${can(c, 'carry-on') ? '' : 'primary'}" data-act="resume">${ICON.resume} Resume</button>`),
    can(c, 'let-go') && (held('let-go') ? heldButton(held('let-go')!, '', 'Let go', 'Let go') : askingButton(armed(`let-go ${c.id}`), `data-act="let-go" data-of="${esc(c.id)}"`, 'Let go', `let ${c.callsign} go: ${LET_GO_MEANS}`, letGoAsk(c))),
    can(c, 'reap') && askingButton(armed(`reap ${c.id}`), `data-act="reap" data-of="${esc(c.id)}"`, `reap ${c.resources.length}`, c.resources.map((r) => `${r.pid} ${r.command}`).join('\n'), reapAsk(c)),
    framed && `<button data-act="tower" data-tip="open in the tower's own view">${ICON.remote} tower</button>`,
    (can(c, 'send-home') || can(c, 'kill')) && askingButton(armed(`kill ${c.id}`), `data-act="kill" data-of="${esc(c.id)}" class="danger"`, 'Send home', `ends ${sentHome(floor!.cards, c).map((h) => h.callsign).join(', ')}`, sendHomeAsk(c, sentHome(floor!.cards, c))),
    `<button class="icon-btn" data-act="close" aria-label="back to walking" data-tip="back to walking (or click the world)">${ICON.close}</button>`,
  ].filter(Boolean).join('')
  return `<span class="call">${esc(c.callsign)}</span>${pill(c)}<span class="meta" data-tip="${esc(c.cwd)}">${esc(whereLine(c, floor))}</span>
    <span class="stats">${stats}</span><span class="acts">${acts}</span>`
}

/** What a worker does now, on one line: a tool by its name in bold, said words after their mark. */
export function activityHtml(c: Card) {
  const gist = gistOf(c)
  if (!gist) return '<i>no prompt yet</i>'
  if (gist.kind === 'asks' || gist.kind === 'runs') return toolHtml(gist.text)
  return `<span class="said">${GIST_MARK[gist.kind]}</span> ${esc(gist.text)}`
}

/** The rest of what is known about a worker, opened from its desk head: what it does now in full, and every detail. */
export function detailsHtml(board: Board, c: Card) {
  const when = (ms: number) => new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  const rows = [
    ['now', gistLine(c)],
    ...detailsOf(c),
    resumesRow(c, when),
    ['started', when(c.startedAt)],
  ].filter(([, value]) => value)
  return `<h3>${esc(c.callsign)}</h3><dl>${rows.map(([label, value]) => `<dt>${label}</dt><dd>${esc(value)}</dd>`).join('')}</dl>`
}

const MOVE_TITLE: Record<Move, string> = { prev: 'previous on duty', next: 'next on duty', waiting: 'next waiting on you' }
const MOVE_COMMAND: Record<Move, string> = { prev: 'prev-worker', next: 'next-worker', waiting: 'next-waiting' }

/** The workers each move key goes to from `c`, named before you go, and a close for `c`'s own wait while you heed it. */
export function movesHtml(board: Board, c: Card, heed: Heed) {
  const to = neighbours(board, c.id, heed)
  const wait = heededWaits(board, heed).find((w) => w.id === c.id)
  const dismiss = wait ? `<button class="icon-btn dismiss" data-dismiss="${esc(wait.key)}" aria-label="${DISMISS_TITLE}" data-tip="${DISMISS_TITLE}">${ICON.close}</button>` : ''
  return dismiss + (['prev', 'next', 'waiting'] as const).map((m) => {
    const card = to[m]
    if (!card || card.id === c.id) return ''
    return `<button class="move ${m}" data-move="${m}" aria-label="${MOVE_TITLE[m]}: ${esc(card.callsign)}, ${statusName(card)}" data-tip="${MOVE_TITLE[m]}${keysLabel(board.keys, MOVE_COMMAND[m]) && ` (${keysLabel(board.keys, MOVE_COMMAND[m])})`}"><small>${board.keys[MOVE_COMMAND[m]].length ? chordLabel(board.keys[MOVE_COMMAND[m]][0]) : ''}</small><span class="lamp ${lampOf(card)}"></span><span class="call">${esc(card.callsign)}</span></button>`
  }).join('')
}

/**
 * The desk panel's views of a worker: its terminal, its logbook (its sessions and their conversations), what changed in its repos,
 * its review thread on a floor keeping threads, and each thing it showed you.
 */
export type DeskTab = 'screen' | 'brief' | 'changes' | 'reviews' | `shown:${string}`
export const shownTab = (s: Shown): DeskTab => `shown:${s.target}`

/** A showing's tab: a dot while you have yet to open it, an outward arrow on the open one to take it to a browser tab. */
const shownTabHtml = (c: Card, s: Card['shown'][number], on: boolean, fresh: boolean) => {
  const from = shownFrom(c.lineage, s)
  return `<button class="shown-tab${on ? ' on' : ''}" data-tab="${esc(shownTab(s))}" data-tip="${esc(`${c.callsign} showed ${s.target} · ${ago(wallNow() - s.at)} ago${from ? ` · in ${from.label}` : ''}`)}">` +
    `<span class="shown-name">${fresh ? '<span class="fresh"></span>' : ''}${s.kind === 'link' ? `${ICON.remote} ` : ''}${esc(shownTitle(s))}</span>${from ? `<small>${from.mark}</small>` : ''}` +
    `${on && s.kind !== 'link' ? `<span class="icon-btn" data-out="${esc(shownHref(s))}" aria-hidden="true" data-tip="open in a browser tab">${ICON.remote}</span>` : ''}${on && s.kind === 'file' ? fileSpansHtml(s.target) : ''}</button>`
}

const TAB_NAME = { screen: 'Terminal', brief: 'Logbook', changes: 'Changes', reviews: 'Reviews' } as const

/** The reader's views of a worker with no desk: a session's last screen, replayed, and its logbook. */
export type LogbookTab = 'screen' | 'brief'
const LOGBOOK_TAB_NAME: Record<LogbookTab, string> = { screen: 'Screen', brief: 'Logbook' }

export const logbookTabsHtml = (tab: LogbookTab) =>
  (['screen', 'brief'] as const).map((t) => `<button data-tab="${t}"${t === tab ? ' class="on"' : ''}>${LOGBOOK_TAB_NAME[t]}</button>`).join('')

/** The Reviews tab's tally: the notes new to the worker, else how many its thread holds. */
const reviewsTally = (c: Card, f: Floor) => {
  const notes = f.threads.find((t) => t.checkout === threadCheckoutOf(c))?.messages
  return c.unseen ? ` <small class="unseen">${c.unseen} new</small>` : notes ? ` <small>${notes}</small>` : ''
}

export function deskTabsHtml(c: Card, f: Floor, tab: DeskTab, fresh: (s: Shown) => boolean) {
  const own = (['screen', 'brief', 'changes', ...(keepsReviews(f) ? ['reviews'] as const : [])] as const)
    .map((t) => `<button data-tab="${t}"${t === tab ? ' class="on"' : ''}>${TAB_NAME[t]}${t === 'reviews' ? reviewsTally(c, f) : ''}</button>`).join('')
  return own + c.shown.map((s) => shownTabHtml(c, s, shownTab(s) === tab, fresh(s))).join('')
}

const keepsReviews = (f: Floor) => f.collections.some((col) => col.id === REVIEWS)

/** A thread read away from any desk: nobody works in its checkout now. */
export const statsHeadHtml = () =>
  `<span class="call">Stats</span><span class="meta">every floor, from the logs</span><span class="acts">${closeButton}</span>`

export const threadHeadHtml = (f: Floor, checkout: string) =>
  `${swatch(f.color ?? NO_BAND)}<span class="call">Thread</span><span class="meta">${esc(f.name)} · ${esc(checkout)} · nobody works there now</span>
    <span class="acts">${closeButton}</span>`

/**
 * A showing in the desk panel: a file framed from the tower, sandboxed; a web page framed at its address; markdown
 * set in the scheme, once its text is read; a link as one button, since a browser opens no tab without a click.
 */
export function shownHtml(callsign: string, s: Shown, root: string, md?: string) {
  if (s.kind === 'url') return `<iframe class="doc-frame" src="${esc(s.target)}" allow="clipboard-read; clipboard-write"></iframe>`
  if (s.kind === 'link') {
    return `<div class="shown-link"><small>${esc(callsign)} asks you to open</small><h2>${esc(shownTitle(s))}</h2>
      <code>${esc(s.target)}</code><button class="primary" data-out="${esc(s.target)}">${ICON.remote} Open</button></div>`
  }
  if (isImage(s)) return `<img class="doc-image" src="${esc(shownHref(s))}" alt="${esc(shownTitle(s))}">`
  if (isVideo(s)) return `<video class="doc-video" controls autoplay src="${esc(shownHref(s))}"></video>`
  if (isMarkdown(s)) return md === undefined ? '' : `<iframe class="doc-frame" sandbox="allow-popups allow-popups-to-escape-sandbox" srcdoc="${esc(mdPage(md, shownHref(s), root))}"></iframe>`
  return `<iframe class="doc-frame" sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" allow="clipboard-write" src="${esc(shownHref(s))}"></iframe>`
}

/** Above the terminal while the worker asks you something, or a screen holds it: who, and what it asks. */
export const askHtml = (c: Card) =>
  c.blocked ? `<span class="call">${esc(c.callsign)}</span> ${esc(BLOCKED_TEXT[c.blocked])}`
    : c.status === 'needs_input' ? `<span class="call">${esc(c.callsign)}</span> ${c.tool ? `asks to ${toolHtml(c.tool)}` : 'needs you'}` : ''

export function shellHeadHtml(sh: Shell, floor: Floor | undefined, armed: boolean) {
  return `${swatch(floor?.color ?? NO_BAND)}<span class="call">Shell</span>
    <span class="meta" data-tip="${esc(sh.activity)}">${esc(floor?.name ?? sh.project)}/${esc(base(sh.cwd))} · ${esc(sh.activity)}</span>
    <span class="acts">${askingButton(armed, `data-act="shell-kill" data-of="${esc(sh.id)}" class="danger"`, 'Kill', 'kill this shell', killShellAsk(floor, sh))}${closeButton}</span>`
}

/** What a viewer opened in a drawn logbook (`openFolds`, `expandedSaid`) and how they read its words. */
export type BriefLook = Pick<BriefView, 'open' | 'expanded' | 'markdown'>

/** The worker's conversations by session (`lineageBriefHtml`), their markdown safe in the panel. */
const briefHtml = (c: Card, threads: Brief[], look: BriefLook) =>
  lineageBriefHtml({ briefs: threads, said: markdownHtml, promptBy: (id) => c.conversations.find((conv) => conv.id === id)?.promptBy, working: c.status === 'working', ...look })

/**
 * A worker's sessions, oldest first, each a button that shows its screen (`data-replay`, its id); a running worker's
 * own session is "live" behind a ready lamp (an empty `data-replay`). `on`: the session whose screen is shown, undefined for the live one.
 * A resume given no prompt of its own says so once its conversations are read (`threads`): its screen repeats the last.
 */
export const sessionsHtml = (c: Card, on: string | undefined, threads: Brief[] | undefined) =>
  `<div class="logbook-sessions">${c.lineage.map((l, i) => {
    const live = c.live && l.id === c.id
    const idle = !live && threads !== undefined && resumedIdle(threads, l, i + 1)
    const label = live ? '<span class="lamp ready"></span> live' : esc(`s${i + 1} · ${sessionWhen(l.startedAt)}${idle ? ` · ${RESUMED_IDLE.mark}` : ''}`)
    const tip = live ? 'back to the live screen' : `the last screen of ${sessionLabel(i + 1, c.lineage.length, l.startedAt)}${idle ? `, ${RESUMED_IDLE.means}` : ''}`
    return `<button class="${[live && 'live', idle && 'idle', (live ? on === undefined : on === l.id) && 'on'].filter(Boolean).join(' ')}" data-replay="${live ? '' : esc(l.id)}" data-tip="${esc(tip)}">${label}</button>`
  }).join('')}</div>`

/** A worker's conversations by session; `threads` undefined while they are read. */
export const logbookBriefHtml = (c: Card, threads: Brief[] | undefined, look: BriefLook) =>
  threads ? briefHtml(c, threads, look) : '<p><i>reading the logbook…</i></p>'

/** The logbook: the worker's sessions to replay, over its conversations by session. */
export const logbookHtml = (c: Card, threads: Brief[] | undefined, look: BriefLook, on: string | undefined) =>
  sessionsHtml(c, on, threads) + logbookBriefHtml(c, threads, look)

/** "REPLAY · Oct 6, 21:40": a past session's screen, with the way back to the live one when there is one. */
export const stampHtml = (startedAt: number, back: boolean) =>
  `<span>Replay · ${esc(sessionWhen(startedAt))}</span>${back ? `<button data-replay=""><span class="lamp ready"></span> live <kbd>Esc</kbd></button>` : ''}`

/** A worker with no desk in the reader: its callsign, where and when it worked. */
export const logbookHeadHtml = (c: Card, f: Floor | undefined) =>
  `${swatch(f?.color ?? NO_BAND)}<span class="call">${esc(c.callsign)}</span><span class="meta">logbook · ${esc(f?.name ?? c.project)} · ${c.lineage.length} session${c.lineage.length === 1 ? '' : 's'} · ${esc(statusName(c))}</span>
    <span class="acts">${closeButton}</span>`

/** A pulled drawer beside the world: its day's workers, each a folder whose logbook opens in the reader. */
export const drawerSideHtml = (f: Floor, d: Drawer) =>
  `<div class="side-title"><h2>Archive</h2>${closeButton}</div>
    <div class="meta">${esc(f.name)} · ${esc(drawerLabel(d))} · ${d.folders.length} worker${d.folders.length === 1 ? '' : 's'}</div>
    <div class="drawer-list">${d.folders.map((c) => `<div class="past" data-logbook="${esc(c.id)}"><span class="call">${esc(c.callsign)}</span> · ${esc(sessionWhen(c.startedAt))}${c.lineage.length > 1 ? ` · ${c.lineage.length} sessions` : ''}
      ${gistLine(c) ? `<div class="conv"><span>${esc(plain(gistLine(c)))}</span></div>` : ''}</div>`).join('')}</div>`

/** A worker card: its attention on the left edge, the callsign, the status word and what it's up to. */
const workerCards = (cards: Card[]) =>
  cards.map((c) => `<div class="sess ${lampOf(c)}" data-desk="${esc(c.id)}"><div class="top"><span class="lamp"></span><span class="call">${esc(c.callsign)}</span>
    <span class="st">${esc(statusName(c))} · ${ago(wallNow() - c.enteredAt)}</span></div>${gistLine(c) ? `<div class="line">${esc(gistLine(c))}</div>` : ''}</div>`).join('')

/** Every process the floor's workers left running, each with its own reap. */
const runningHtml = (f: Floor) =>
  leftoversOf(f).map(({ card, resource: r }) => `<div class="proc"><span class="call">${esc(card.callsign)}</span><code data-tip="${esc(r.command)}">${r.pid}${
    r.ports.length ? ` :${r.ports.join(' :')}` : ''}${r.orphan ? ' orphan' : ''} · ${esc(commandName(r.command))}</code>${
    can(r, 'reap') ? `<button data-reap-pid="${esc(card.id)} ${r.pid}" data-tip="end ${r.pid}">end</button>` : ''}</div>`).join('')

/** One thing the floor's Tidy would do, with `button` after it. */
const tidyRowHtml = (r: Pick<TidyRow, 'what' | 'does' | 'title'>, button: string) =>
  `<div class="wt" data-tip="${esc(r.title)}"><span class="n"><b>${withIcons(esc(r.what))}</b></span><span class="st">${esc(r.does)}</span>${button}</div>`

/** Everything the floor's Tidy would do, a row each. */
const tidyListHtml = (f: Floor) => tidyRows(f, wallNow()).map((r) => tidyRowHtml(r, '')).join('')

/** Tidy's rows on the floor's panel, each with a button that does only that row, asked first. */
const tidyPanelHtml = (f: Floor, armed: (key: string) => boolean) =>
  tidyRows(f, wallNow()).map((r) => {
    const call = JSON.stringify(r.call)
    const sure = armed(`tidy ${call}`)
    return tidyRowHtml(r, askingButton(sure, `${sure ? '' : 'class="icon-btn" '}data-tidy-call="${esc(call)}" aria-label="${esc(`${r.does}: ${r.what}`)}"`, ICON.tidy, `only this: ${r.does}`, tidyRowAsk(r)))
  }).join('')

/** A shell started in `place`, a floor panel's icon; held back with why while the terms daemon can't start one. */
const shellButton = (place: ShellPlace | undefined, label: string, held: HeldWhy) =>
  held('shell') ? heldButton(held('shell')!, 'icon-btn', label, ICON.shell)
    : place ? `<button class="icon-btn" ${shellAttrs(place)} aria-label="${esc(label)}" data-tip="new shell in ${esc(place.dir)}">${ICON.shell}</button>` : ''

const shellAttrs = (place: ShellPlace) => `data-shell-project="${esc(place.project)}" data-shell-dir="${esc(place.dir)}"`

/**
 * Where a new shell can start (`shellPlaces`): every floor's hub, repos and worktrees under its sign, `first`'s floor
 * ahead of the rest. The shell stands at a kiosk on its floor.
 */
export function shellPickHtml(p: Plan, board: Board, first: string, held: HeldWhy) {
  const places = shellPlaces(board.floors, first)
  const why = held('shell')
  const floors = [...new Set(places.map((pl) => pl.project))].map((project) => {
    const l = p.levels.find((l) => l.kind === 'floor' && l.floor.id === project)!
    const hub = board.floors.find((f) => f.id === project)!.hub
    const rows = places.filter((pl) => pl.project === project).map((pl) => {
      const inner = `${pl.worktree ? ICON.branch : pl.dir === hub ? ICON.hub : ICON.repo} ${esc(pl.name)}${pl.worktree ? ` <small>${esc(pl.worktree)}</small>` : ''}`
      return why ? heldButton(why, 'pick', `new shell in ${pl.dir}`, inner) : `<button class="pick" ${shellAttrs(pl)} data-tip="${esc(pl.dir)}">${inner}</button>`
    })
    return sign(levelKey(l), l.name, tint(l)) + rows.join('')
  })
  return `<div class="side-title"><h2>New shell</h2>${closeButton}</div>${floors.join('') || '<div class="past">no floor starts shells now</div>'}`
}

/** A verb on a worktree or kept branch, its call on the button. */
const wtVerb = (thing: { name: string; calls: Record<string, unknown> }, verb: Exclude<keyof typeof WORKTREE_VERB_NAME, 'discard'>, armed: (key: string) => boolean) => {
  const call = JSON.stringify(thing.calls[verb])
  const attrs = `data-wt-call="${esc(call)}" data-wt-verb="${verb}" data-wt-name="${esc(thing.name)}"`
  const ask = WORKTREE_ASK[verb]
  return ask ? askingButton(armed(`wt ${call}`), attrs, WORKTREE_VERB_NAME[verb], `${WORKTREE_VERB_NAME[verb]} ${thing.name}`, ask(thing.name)) : `<button ${attrs}>${WORKTREE_VERB_NAME[verb]}</button>`
}

/** Throwing away an at-risk worktree's work, asked first with what it loses (`discardAsk`). */
const discardButton = (w: Floor['worktrees'][number], armed: (key: string) => boolean) => {
  const call = JSON.stringify(w.calls.discard)
  return askingButton(armed(`wt ${call}`), `class="danger" data-discard="${esc(call)}"`, WORKTREE_VERB_NAME.discard, 'throw its work away: each tip is noted on its review thread first', discardAsk(w))
}

/** Opens what landing changed on a carried branch: `git range-diff` of each edited commit and its copy. */
const landingButton = (landing: EditedRow['landing']) =>
  `<button class="icon-btn" data-landing="${esc(JSON.stringify(landing))}" aria-label="what landing changed on ${esc(landing.branch)}" data-tip="what landing changed: git range-diff of each edited commit and its copy">${ICON.diff}</button>`

/** A worktree or kept branch that landed edited: what landing changed, and a press that removes only it, asked first. */
const editedRowHtml = (r: EditedRow, armed: (key: string) => boolean) => {
  const call = JSON.stringify(r.call)
  const verb = r.call[0] === 'branch/delete' ? 'delete' : 'remove'
  const name = r.what.replace(/^⎇ /, '')
  const sure = armed(`wt ${call}`)
  return tidyRowHtml(r, landingButton(r.landing) + askingButton(sure, `${sure ? '' : 'class="icon-btn" '}data-wt-call="${esc(call)}" data-wt-verb="${verb}" data-wt-name="${esc(name)}" aria-label="${esc(`${verb} ${name}`)}"`, ICON.tidy, 'remove only this, after looking at what landing changed', WORKTREE_ASK[verb]!(name)))
}

/** The floor's worktrees and kept branches, each with the verbs the board offers on it. */
const worktreesHtml = (f: Floor, places: ShellPlace[], held: HeldWhy, armed: (key: string) => boolean) => [
  ...f.worktrees.map((w) => {
    const title = [...w.repos.map((r) => r.path), ...worktreeRisk(w), ...goneBases(w.repos), ...(w.state === 'carried' ? [carriedLine(w.repos)] : [])].join('\n')
    const where = w.repos[0].path
    return `<div class="wt ${w.state}" data-tip="${esc(title)}"><span class="n"><b>${esc(w.name)}</b> ${ICON.branch} ${esc(worktreeBranch(w))}</span>
      <span class="st">${WORKTREE_STATE_NAME[w.state]}</span>${w.state === 'carried' ? landingButton({ project: f.id, branch: worktreeBranch(w) }) : ''}${w.verbs.map((v) => (v === 'discard' ? discardButton(w, armed) : wtVerb(w, v, armed))).join('')}
      ${w.state === 'lost' ? '' : shellButton(places.find((pl) => pl.worktree === w.name), `new shell in ${w.name}`, held)}
      ${w.state !== 'lost' && can(f, 'editor') ? `<button class="icon-btn" data-open="${esc(where)}" aria-label="open ${esc(w.name)} in your editor" data-tip="open ${esc(where)} in a new window of your editor">${ICON.editor}</button>` : ''}</div>`
  }),
  ...f.branches.map((b) => `<div class="wt" data-tip="${esc(keptBranchLines(b).join('\n'))}"><span class="n">${ICON.branch} ${esc(b.name)}</span><span class="st">${b.absorbed ? 'merged' : b.carried ? 'landed, edited' : 'kept'}</span>${
    b.carried ? landingButton({ project: f.id, branch: b.name }) : ''}${b.verbs.map((v) => wtVerb(b, v, armed)).join('')}</div>`),
].join('')

/** A past worker and the conversations it held, each with the way to resume it or reach who did. */
const pastHtml = (board: Board, c: Card, held: HeldWhy) =>
  `<div class="past"><span class="call">${esc(c.callsign)}</span> · ${new Date(c.startedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
    ${c.unresumable ? `· <span class="unresumable" data-tip="${esc(UNRESUMABLE_TITLE[c.unresumable])}">${UNRESUMABLE_NAME[c.unresumable]}</span>` : ''}
    <button data-logbook="${esc(c.id)}" data-tip="its logbook and last screen">logbook</button>
    ${c.conversations.map((conv) => `<div class="conv"><span>${esc(plain(conv.answer ?? conv.prompt ?? conv.id))}</span>${
      can(conv, 'goto') ? `<button data-desk="${esc(conv.resumedBy!.id)}">→ ${esc(conv.resumedBy!.callsign)}</button>`
        : !can(conv, 'resume') ? ''
        : held('resume') ? heldButton(held('resume')!, 'icon-btn', 'resume this conversation', ICON.resume)
        : `<button class="icon-btn" data-resume="${esc(JSON.stringify(conv.calls.resume))}" aria-label="resume this conversation" data-tip="resume this conversation">${ICON.resume}</button>`}</div>`).join('')}</div>`

/** Resumes every worker the host stopped or lost on a floor, asked first with their names. */
const resumeAllButton = (f: Floor, armed: (key: string) => boolean, held: HeldWhy) => {
  const stranded = strandedOf(f)
  if (!stranded.length) return ''
  const label = `${ICON.resume} resume all <b>${stranded.length}</b> stranded`
  return held('resume') ? heldButton(held('resume')!, 'wide', `resume all ${stranded.length} stranded`, label)
    : askingButton(armed(`resume-all ${f.id}`), `class="wide" data-resume-all="${esc(f.id)}"`, label, 'resume every worker the host stopped or lost', resumeAllAsk(f, stranded))
}

/** A floor's + new session, held back with why while it can't run. */
const spawnButton = (f: Floor, held: HeldWhy) =>
  held('spawn') ? heldButton(held('spawn')!, 'wide', 'new session', `${ICON.plus} new session`) : can(f, 'spawn') ? `<button class="wide" data-spawn="${esc(f.id)}">${ICON.plus} new session</button>` : ''

/**
 * A floor's desk: its dirs, its shelf, who's on duty, what they left running, and what it keeps beside them folded to
 * one row of counts: the worktrees unfold here, the archive opens its own panel.
 */
export function floorHtml(board: Board, f: Floor, origins: Record<string, string>, framed: boolean, armed: (key: string) => boolean, held: HeldWhy, tray: string | undefined) {
  const places = shellPlaces([f])
  const edited = editedRows(f)
  const dirs = [f.hub, ...f.repos].map((dir, i) => `<div class="dir"><span data-tip="${esc(dir)}">${i ? ICON.repo : ICON.hub} ${esc(base(dir))}</span>
    ${shellButton(places.find((pl) => pl.dir === dir), `new shell in ${base(dir)}`, held)}
    ${can(f, 'editor') ? `<button class="icon-btn" data-open="${esc(dir)}" aria-label="open ${esc(base(dir))} in your editor" data-tip="open ${esc(dir)} in a new window of your editor">${ICON.editor}</button>` : ''}
    ${origins[dir] ? `<a class="icon-btn" href="${esc(origins[dir])}" target="_blank" rel="noreferrer" aria-label="${esc(base(dir))} on the web" data-tip="${esc(origins[dir])}">${originIcon(origins[dir])}</a>` : ''}</div>`).join('')
  const shelf = (f.shelf ?? []).map((entry, n) => {
    if ('link' in entry) return `<a href="${esc(entry.link)}" target="_blank" rel="noreferrer">${SHELF_ICON.link} ${esc(entry.label)}</a>`
    const glyph = SHELF_ICON[shelfKind(entry)]
    if (framed) return `<button data-shelf="${n}">${glyph} ${esc(entry.label)}</button>`
    if (shelfKind(entry) === 'html') return `<a href="/run/${esc(f.id)}/${n}">${glyph} ${esc(entry.label)}</a>`
    if ('renderer' in entry) return `<a href="${esc(rendererUrl(entry.renderer))}" target="_blank" rel="noreferrer">${glyph} ${esc(entry.label)}</a>`
    if ('url' in entry) return `<a href="${esc(entry.url)}" target="_blank" rel="noreferrer">${glyph} ${esc(entry.label)}</a>`
    return ''
  }).join('')
  const duty = f.cards.filter((c) => c.onDuty).sort((a, b) => a.startedAt - b.startedAt)
  const past = pastCount(f)
  const running = runningHtml(f)
  const level = board.floors.indexOf(f) + 1
  const trees = f.worktrees.length + f.branches.length
  const atRisk = risky(f)
  const kept = f.collections.filter((c) => c.items.length)
  const unfolded = kept.find((c) => c.id === tray)
  const trays = [
    trees && `<button class="tray${tray === 'worktrees' ? ' on' : ''}" data-tray="worktrees" aria-expanded="${tray === 'worktrees'}" data-tip="worktrees and the branches the tower kept">${ICON.branch} <b>${trees}</b> worktree${trees === 1 ? '' : 's'}${atRisk ? ` <i>${atRisk} at risk</i>` : ''}</button>`,
    ...kept.map((c) => `<button class="tray${tray === c.id ? ' on' : ''}" data-tray="${esc(c.id)}" aria-expanded="${tray === c.id}" data-tip="${esc(c.description ?? `items kept in ${c.label}`)}">${c.id === DRAFTS ? ICON.draft : ICON.collection} <b>${c.items.length}</b> in ${esc(c.label.toLowerCase())}</button>`),
    past && `<button class="tray" data-archive data-tip="past workers and their conversations">${ICON.archive} <b>${past}</b> archived</button>`,
  ].filter(Boolean).join('')
  return `${sign(String(level), f.name, f.color ?? NO_BAND, closeButton)}
    <div class="section eyebrow">Dirs</div>${dirs}
    ${shelf && `<div class="section eyebrow">Shelf</div><div class="shelf" style="--p:${f.color ?? NO_BAND}">${shelf}</div>`}
    <div class="section eyebrow">On duty</div><div class="cards">${workerCards(duty) || '<div class="past">lights off</div>'}</div>
    ${resumeAllButton(f, armed, held)}${spawnButton(f, held)}
    ${running && `<div class="section eyebrow">Running</div>${running}`}
    ${can(f, 'tidy') ? `<div class="section eyebrow">${esc(tidyLine(f.tidy))}</div>${tidyPanelHtml(f, armed)}${askingButton(armed(`tidy ${f.id}`), 'class="wide" data-tidy', 'tidy all', 'do all of it, as listed', tidyAllAsk(f, wallNow()))}` : ''}
    ${edited.length ? `<div class="section eyebrow" data-tip="landed as copies, some edited on the way: not in Tidy all, look first and remove each on its own">landed edited</div>${edited.map((r) => editedRowHtml(r, armed)).join('')}` : ''}
    ${trays && `<div class="trays">${trays}</div>`}
    ${tray === 'worktrees' && trees ? `<div class="section eyebrow">Worktrees</div>${worktreesHtml(f, places, held, armed)}` : ''}
    ${unfolded ? collectionTrayHtml(f.id, unfolded, (item) => (unfolded.id === DRAFTS ? noteTitle(f.id, item) : keptTitle(f.id, unfolded.id, item)), undefined, wallNow()) : ''}`
}

/** A floor's archive panel, drawn once as it opens: its list is drawn apart, so the filter keeps its focus. */
export const archiveSideHtml = (f: Floor) =>
  `<div class="side-title" data-archive-of="${esc(f.id)}"><button class="icon-btn back" data-floor aria-label="back to the floor" data-tip="back to the floor">${ICON.back}</button><h2>Archive</h2>${closeButton}</div>
    <div class="meta">${esc(f.name)} · <span id="archive-count"></span></div>
    <input id="archive-filter" type="search" placeholder="filter by callsign, prompt or answer" autocomplete="off">
    <div class="archive" id="archive-list"></div>`

/** Past workers by crew (`pastCrews`), each worker with its crew under it. */
const pastCrewsHtml = (board: Board, crews: PastCrew[], held: HeldWhy): string =>
  crews.map(({ card, crew }) => pastHtml(board, card, held) + (crew.length ? `<div class="crew">${pastCrewsHtml(board, crew, held)}</div>` : '')).join('')

/** A floor's past workers that match `words`, by crew, and how many of how many; `archive` once read. */
export function archiveListHtml(board: Board, f: Floor, read: ArchiveRead | undefined, words: string[], held: HeldWhy) {
  if (!read?.cards) return { count: `${pastCount(f)} workers`, html: read?.failed ? failedHtml('the archive', read.failed, 'data-archive-read') : '<div class="past"><i>reading the archive…</i></div>' }
  const past = pastCrews(f, read.cards)
  const shown = pastMatching(past, words)
  const [all, matching] = [pastSize(past), pastSize(shown)]
  return {
    count: matching === all ? `${all} workers` : `${matching} of ${all}`,
    html: pastCrewsHtml(board, shown, held) || '<div class="past"><i>no past worker matches</i></div>',
  }
}

/** Every floor and who's on it: a click takes you there. */
export function directoryHtml(p: Plan, held: HeldWhy) {
  const floors = p.levels.filter((l) => l.kind === 'floor').reverse()
  const body = floors.map((l) => {
    const waits = l.desks.filter((d) => d.card.waiting).length
    const count = `<small>${waits ? `<b class="waits">${waits} waiting</b> · ` : ''}${l.desks.length} on duty</small>`
    return `<div class="go" data-go="${l.index}">${sign(levelKey(l), l.name, tint(l), count)}</div>
      <div class="cards">${workerCards(l.desks.map((d) => d.card))}
      ${l.kiosks.map((k) => `<div class="sess" data-shell="${esc(k.shell.id)}"><div class="top">${swatch(tint(l))}<span class="call">shell · ${esc(base(k.shell.cwd))}</span>
        <span class="st">${esc(k.shell.activity)}</span></div></div>`).join('')}</div>
      ${spawnButton(l.floor, held)}`
  }).join('')
  const legend = (['needs', 'ready', 'working', 'quiet', 'broken'] as const).map((a) => `<span class="chip ${a}"><span class="lamp"></span>${a === 'needs' ? 'needs you' : a}</span>`).join('')
  const roof = p.levels.at(-1)!
  return `<div class="side-title"><h2>Directory</h2>${closeButton}</div>
    <div class="tally">${legend}</div>${body}
    <div class="go" data-go="0">${sign('0', 'Lobby', LOBBY_BAND)}</div>
    <div class="go" data-go="${roof.index}">${sign('R', 'Roof', LOBBY_BAND, '<small>rate limits</small>')}</div>`
}

type ShelfEntry = NonNullable<Floor['shelf']>[number]

const DRAFT_STATE = { conflict: 'changed on disk', new: 'new · saved once it has words', editing: 'editing', saved: 'saved' }

const keptByText = (keptBy: KeptBy | undefined) => (keptBy ? ` · kept by ${keptBy.callsign}` : '')

/** The draft editor's head: whose draft and how it stands, and what can be done with it. */
export function draftHeadHtml(f: Floor, d: Draft, held: HeldWhy, carrying: boolean) {
  const acts = [
    d.id && !carrying && `<button data-act="carry" data-tip="take it in your hand: H hands it to a worker or the open desk">Carry</button>`,
    held('spawn') ? heldButton(held('spawn')!, 'primary', 'Start session', 'Start session') : can(f, 'spawn') && `<button class="primary" data-act="start" data-tip="start a new session on this prompt">Start session</button>`,
    `<button data-act="delete" class="danger" data-tip="delete it now: the toast offers Undo">Delete</button>`,
    `<button class="icon-btn" data-act="close" aria-label="back to walking" data-tip="back to walking (Esc)">${ICON.close}</button>`,
  ].filter(Boolean).join('')
  const item = d.id ? draftItem([f], f.id, d.id) : undefined
  return `${swatch(f.color ?? NO_BAND)}<span class="call">Draft</span><span class="meta">${item ? `${esc(item.tag)} · ` : ''}${esc(f.name)} · ${DRAFT_STATE[draftState(d)]}${keptByText(item?.keptBy)}</span>${
    item ? fileButtonsHtml(`${draftsOf(f)!.dir}/${item.id}`) : ''}<span class="acts">${acts}</span>`
}

/** A game's panel head: its title and keeper, a way to play it in a browser tab, and close, the way out while the game holds the keys. */
export function gameHeadHtml(f: Floor, project: string, id: string) {
  const item = gameItem([f], project, id)!
  const acts = [
    `<button class="icon-btn" data-out="/${esc(gamePath(project, id))}" aria-label="play it in a browser tab" data-tip="play it in a browser tab">${ICON.remote}</button>`,
    `<button class="icon-btn" data-act="close" aria-label="back to walking" data-tip="back to walking: the game holds the keys, so Esc stays with it">${ICON.close}</button>`,
  ].join('')
  return `${swatch(f.color ?? NO_BAND)}<span class="call">${esc(gameTitle(project, item))}</span>
    <span class="meta">${esc(item.tag)} · ${esc(f.name)}${keptByText(item.keptBy)}</span><span class="acts">${acts}</span>`
}

/** A game in a frame of its own: scripts and pointer lock, nothing else. */
export const gameHtml = (project: string, id: string) =>
  `<iframe class="game-frame" sandbox="allow-scripts allow-pointer-lock" src="/${esc(gamePath(project, id))}"></iframe>`

export const draftNoteHtml = `<span>Someone else changed this draft while you were editing it.</span>
  <button data-act="take">Take theirs</button><button data-act="keep">Keep mine</button>`

export function docHeadHtml(f: Floor, entry: ShelfEntry, framed: boolean) {
  const where = shelfSource(entry)
  const acts = [
    framed && `<button data-act="tower" data-tip="open in the tower's own view">${ICON.remote} tower</button>`,
    closeButton,
  ].filter(Boolean).join('')
  return `${swatch(f.color ?? NO_BAND)}<span class="call">${esc(entry.label)}</span>
    <span class="meta" data-tip="${esc(where)}">${esc(f.name)} · ${esc(where)}</span><span class="acts">${acts}</span>`
}

/** A kept item's head in the reader: its collection, tag, floor, title, keeper and age; a new tab, Delete, close. */
export function keptHeadHtml(f: Floor, c: FloorCollection, item: FloorItem, title: string, armed: boolean) {
  const acts = [
    `<button data-out="/${esc(itemPath(f.id, c.id, item.id))}" data-tip="open it on its own">${ICON.remote} new tab</button>`,
    askingButton(armed, `data-act="delete" data-of="${esc(item.id)}" class="danger"`, 'Delete', 'the file is deleted for good', deleteAsk(c, item, title)),
    closeButton,
  ].join('')
  return `${swatch(f.color ?? NO_BAND)}<span class="call">${esc(c.label)}</span>
    <span class="meta" data-tip="${esc(itemFile(c, item.id))}">${esc(item.tag)} · ${esc(f.name)} · ${esc(title)}${esc(keptByText(item.keptBy))} · changed ${ago(wallNow() - item.modifiedAt)} ago</span><span class="acts">${acts}</span>`
}

/**
 * A kept item whose text isn't read to show it: an html item framed at an origin of its own with no API, an image
 * shown, any other file left to Finder and the editor.
 */
export function keptFileHtml(c: FloorCollection, item: FloorItem, url: string) {
  const kind = itemKind(item.id)
  if (kind === 'html') return `<iframe class="doc-frame" title="${esc(item.tag)}" sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-pointer-lock" allow="clipboard-write" src="${esc(url)}?v=${item.modifiedAt}"></iframe>`
  if (kind === 'image') return `<div class="kept-image"><img src="${esc(url)}?v=${item.modifiedAt}" alt="${esc(item.tag)}"></div>`
  return `<div class="kept-none">the tower shows no ${esc(item.id.split('.').pop()!)} file: reveal it in Finder or open it in your editor ${fileButtonsHtml(itemFile(c, item.id))}</div>`
}

/** A markdown or text item, in a frame where nothing runs, its root's attributes `root` (`tower.prefs.attributes`). */
export const keptTextHtml = (item: FloorItem, text: string, root: string) =>
  `<iframe class="doc-frame" title="${esc(item.tag)}" sandbox="allow-popups allow-popups-to-escape-sandbox" srcdoc="${esc(`<!doctype html><html ${root}><meta charset="utf-8"><base target="_blank"><link rel="stylesheet" href="/design.css">
    <style>${documentCss}${itemsCss}</style><article>${itemTextHtml(item.id, text)}</article>`)}"></iframe>`

/** A gallery picture in the reader: who showed it and when, its way to the worker's desk while on duty, and to a browser tab. */
export function pictureHeadHtml(worker: SessionRef, onDuty: boolean, sh: Shown, color: string) {
  const acts = [
    onDuty && `<button data-act="desk" data-tip="to its desk, on this showing's tab">at ${esc(worker.callsign)}'s desk</button>`,
    sh.kind === 'file' && fileButtonsHtml(sh.target),
    sh.kind !== 'link' && `<button class="icon-btn" data-out="${esc(shownHref(sh))}" aria-label="open in a browser tab" data-tip="open in a browser tab">${ICON.remote}</button>`,
    closeButton,
  ].filter(Boolean).join('')
  const meta = `${worker.callsign} showed ${sh.target} · ${ago(wallNow() - sh.at)} ago`
  return `${swatch(color)}<span class="call">${esc(shownTitle(sh))}</span>
    <span class="meta" data-tip="${esc(meta)}">${esc(meta)}</span><span class="acts">${acts}</span>`
}

/** A shelf entry's body: a page in a frame, or a markdown collection's files beside the open one, rendered without scripts. */
export function docHtml(doc: { frame: string } | { files: string[]; file?: string; text: string; url: string }, root: string) {
  if ('frame' in doc) return `<iframe class="doc-frame" src="${esc(doc.frame)}" allow="clipboard-write"></iframe>`
  const list = doc.files.map((f) => `<button class="doc-file${f === doc.file ? ' on' : ''}" data-file="${esc(f)}"${f === doc.file ? ' aria-current="true"' : ''} data-tip="${esc(f)}">${esc(base(f).replace(/\.md$/, ''))}</button>`).join('')
  return `<div class="doc-files">${list || '<i>no files</i>'}</div><iframe class="doc-frame" sandbox="allow-popups allow-popups-to-escape-sandbox" srcdoc="${esc(mdPage(doc.text, doc.url, root))}"></iframe>`
}

/**
 * Markdown served at `url` as a page in the viewer's appearance, its root's attributes `root` (`tower.prefs.attributes`),
 * for a frame without scripts (`documentHtml` keeps raw HTML).
 */
const mdPage = (text: string, url: string, root: string) =>
  `<!doctype html><html ${root}><meta charset="utf-8"><base target="_blank"><link rel="stylesheet" href="/design.css">
    <style>${documentCss}</style><article>${documentHtml(text, url)}</article>`
