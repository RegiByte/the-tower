import type { Board, Card, CardResource, Floor } from '../bridge/board.ts'
import {
  BLOCKED_TEXT, HOST_MEANS, LET_GO_MEANS, callOf, can, claudeFlagHtml, detailsOf, esc, gistLine, lampOf, letGoAsk, letGoneLine, modelName, noLongerOffered, offeredCall, reapAsk, resumesRow,
  sendHomeAsk, sentHome, statusName, statusTitle, when, whereLineOf, whyNot, type DaemonVerb,
} from '../shared/cards.ts'
import { ICON, withIcons } from '../shared/icons.ts'
import { pressing } from '../shared/press.ts'
import type { Subject } from '../shared/subjects.ts'
import { verbLabel } from '../shared/verb-words.ts'
import type { Mount } from '../shared/views.ts'
import { reviewerOf } from '../shared/checkouts.ts'
import { keyedTip, paintOnce } from './parts.ts'

/**
 * A worker: its head (who and where, a glance at its context, cost and leftovers, its details, what extensions add to
 * it in `card.head`, and Resume, Let go, Send home and the close) over its tabs, `card.panes`, which the renderer fills
 * with the views on the card and one per thing it showed. A worker that waits on you says so between them. The
 * `head` option, false, draws its tabs alone; at cell scale, inside another view, its head has no close.
 *
 * At cell scale the head is compact, and the view holding the card speaks to it through its options (`CardOptions`):
 * `acts`, its own controls at the end of the head, a press dispatching a bubbling `act` event; `pick`, the callsign as
 * a menu of other workers, a choice dispatching a bubbling `pick` event; and `omit`, the commands its head leaves out.
 * With no head, the cell's one row holds the lamp, the callsign, the tabs and the acts.
 */

/** A control of the view holding a card, at the end of the card's head: an `icon` from `/icons.js` draws in place of its label. */
export type CardAct = { id: string; label: string; tip?: string; icon?: keyof typeof ICON }

/** The callsign as a menu of other workers, by card id, each with a `note` beside it; `label` heads the menu. */
export type CardPick = { label: string; tip?: string; choices: { id: string; note?: string }[] }

/** `tower/card`'s options: `head`, false for its tabs alone; at cell scale, `acts`, `pick` and `omit` (`<cap>/<name>`). @since 1.113 */
export type CardOptions = { head?: boolean; acts?: CardAct[]; pick?: CardPick; omit?: string[] }

const ID = 'tower/card'

const CSS = `:where([data-view="${ID}"]) {
  gap: var(--sp-m);
  & .bar { flex: none; padding: var(--sp-m) var(--sp-xl); background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); }
  & .bar-top { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-s) var(--sp-l); }
  & .bar-top[hidden] { display: none; }
  & .part, & :is([data-holds="badges"], [data-holds="lines"], [data-holds="actions"]) { display: contents; }
  & .bar-info { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-xs) var(--sp-l); min-width: 0; flex: 1 1 20rem; white-space: nowrap; color: var(--muted); font-size: var(--fs-s); }
  & .bar-info .call { flex: none; font: 800 var(--fs-2xl)/1 var(--display); letter-spacing: .04em; color: var(--ink); }
  & .bar-info .pill { flex: none; font-variant-numeric: tabular-nums; }
  & .bar-info .where { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  & .bar-info .adds-line { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; color: var(--ink); }
  & .bar-info .stats { flex: none; margin-left: auto; display: flex; align-items: center; gap: var(--sp-l); }
  & .bar-info b { color: var(--ink); font-variant-numeric: tabular-nums; }
  & .bar-info .meter { width: 56px; --fill: var(--working); }
  & .bar-info .ports { color: var(--ink); cursor: pointer; font-family: var(--mono); font-size: var(--fs-xs); padding: 1px var(--sp-s); border: 0; border-radius: var(--radius); background: var(--panel-2); }
  & .bar-info .ports.orphan { color: var(--on-broken); background: var(--broken); }
  & .bar-info .dismiss { flex: none; min-height: 0; padding: 1px var(--sp-s); font-size: var(--fs-xs); font-weight: 400; color: var(--muted); background: none; }
  & .bar-actions { flex: none; display: flex; gap: var(--sp-s); margin-left: auto; }
  & .bar-actions .icon-btn { aspect-ratio: 1; }
  & .bar-line { gap: var(--sp-s); margin-top: var(--sp-m); color: var(--muted); font-size: var(--fs-m); white-space: nowrap; }
  & .bar-top[hidden] + .bar-line { margin-top: 0; }
  & .bar-line .shown-adds { display: flex; align-items: center; gap: var(--sp-s); }
  & .bar-details, & .bar-left { margin: 0; inset: 100px 20px auto auto; width: min(620px, 90vw); max-height: 70vh; overflow: auto; padding: var(--sp-l) var(--sp-xl) var(--sp-xl); background: var(--panel); color: var(--ink);
    border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow-pop); scrollbar-gutter: stable; }
  & .bar-details h3, & .bar-left h3 { margin: 0 0 var(--sp-l); font: 800 var(--fs-l)/1 var(--display); letter-spacing: .04em; }
  & .bar-left .proc { display: grid; grid-template-columns: auto auto minmax(0, 1fr) auto; align-items: center; gap: var(--sp-xs) var(--sp-l); padding: var(--sp-s) 0; border-top: 1px solid var(--line); font-size: var(--fs-s); }
  & .bar-left .proc code { font-family: var(--mono); }
  & .bar-left .proc .on { color: var(--muted); font-family: var(--mono); }
  & .bar-left .proc .on.orphan { color: var(--broken-text); }
  & .bar-left .proc .cmd { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--mono); color: var(--muted); }
  & .bar-left .all { display: flex; justify-content: flex-end; padding-top: var(--sp-l); border-top: 1px solid var(--line); }
  & .bar-details dl { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: var(--sp-xs) var(--sp-xl); margin: 0; font-size: var(--fs-s); }
  & .bar-details dt { color: var(--faint); }
  & .bar-details dd { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font-family: var(--mono); }
  & .ask { display: none; align-items: center; gap: var(--sp-l); flex: none; padding: var(--sp-m) var(--sp-l) var(--sp-m) var(--sp-xl); border-radius: var(--radius); font-size: var(--fs-l);
    background: color-mix(in oklab, var(--needs) 11%, var(--panel)); border: 1px solid var(--needs); }
  &.asking .ask { display: flex; }
  & .ask .what { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  & .ask .what b { color: var(--needs-text); }
  & .ask .call { font: 800 var(--fs-l)/1 var(--display); letter-spacing: .04em; }
  & .ask button { margin-left: auto; flex: none; }
  & .screen { position: relative; flex: 1; min-height: 0; overflow: hidden; background: var(--enamel); border-radius: var(--radius); }
  &.cell { gap: 0; }
  &.cell .bar { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; column-gap: var(--sp-m); padding: var(--sp-xs) var(--sp-m);
    border: 0; border-bottom: 1px solid var(--line); border-radius: 0; box-shadow: none; }
  &.cell .bar-top { grid-column: 1 / 3; flex-wrap: nowrap; gap: var(--sp-m); min-width: 0; }
  &.cell .bar-info { flex: 1 1 0; flex-wrap: nowrap; overflow: hidden; gap: var(--sp-m); }
  &.cell .bar-info .call { font-size: var(--fs-l); }
  &.cell .bar-actions { align-items: center; gap: var(--sp-2xs); }
  &.cell :is(.bar-actions, .acts) button { min-height: 0; padding: 3px var(--sp-s); font-size: var(--fs-s); }
  &.cell .bar-line { grid-column: 1 / -1; margin-top: var(--sp-xs); }
  &.cell .acts { grid-column: 3; grid-row: 1; display: flex; align-items: center; gap: var(--sp-2xs); padding-left: var(--sp-s); border-left: 1px solid var(--line); }
  &.cell .acts:empty { display: none; }
  &.cell .mini { display: none; }
  &.cell.bare .mini { display: flex; align-items: center; gap: var(--sp-xs); grid-column: 1; grid-row: 1; font: 800 var(--fs-m)/1 var(--display); letter-spacing: .04em; color: var(--ink); }
  &.cell.bare .bar-line { grid-column: 2; grid-row: 1; margin: 0; min-width: 0; overflow: hidden; }
  &.cell .pick { min-height: 0; padding: 0 2px; background: none; border: 0; color: var(--muted); }
  &.cell .pick svg { width: 12px; height: 12px; }
  &.cell .bar-pick { margin: 0; position: fixed; inset: auto; height: auto; width: max-content; min-width: 14rem; max-height: 60vh; overflow: auto; padding: var(--sp-xs) 0;
    background: var(--panel); color: var(--ink); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow-pop); font-size: var(--fs-s); }
  &.cell .bar-pick h3 { margin: 0; padding: var(--sp-xs) var(--sp-m); color: var(--faint); font-size: var(--fs-xs); font-weight: 600; text-transform: uppercase; letter-spacing: .06em; }
  &.cell .bar-pick button { display: flex; align-items: center; gap: var(--sp-s); width: 100%; min-height: 0; padding: var(--sp-xs) var(--sp-m); border: 0; border-radius: 0; background: none;
    color: var(--ink); font-weight: 400; text-align: left; }
  &.cell .bar-pick button:hover, &.cell .bar-pick button:focus-visible { background: var(--panel-2); }
  &.cell .bar-pick small { margin-left: auto; padding-left: var(--sp-l); color: var(--muted); }
  &.cell .bar-pick .none { padding: var(--sp-xs) var(--sp-m); color: var(--muted); }
  &.cell .screen { border-radius: 0; }
}`

/** `Bash npm test` → the tool's name in bold, then what it acts on. */
const toolHtml = (tool: string) => {
  const [name, ...target] = tool.split(' ')
  return `<span class="tool"><b>${esc(name)}</b> ${esc(target.join(' '))}</span>`
}

/** A meter's fill: ink, broken past `hot`. */
const fillOf = (pct: number, hot: number) => (pct > hot ? 'var(--broken)' : 'var(--ink)')

/** How many cards were mounted on this page: each one's popovers get ids of their own. */
let mounts = 0

export const mount: Mount = (host, { tower, board: first, subject, kit, options, scale }) => {
  let board = first
  let at = subject
  let card = subject.value as Card
  let opts = options as CardOptions
  let head = opts.head !== false
  const cell = scale === 'cell'
  const pop = `card-${++mounts}`
  host.innerHTML = `<style>${CSS}</style><div class="bar">
    ${cell ? '<span class="mini"></span>' : ''}<div class="bar-top"${head ? '' : ' hidden'}><div class="bar-info"><span class="part lead"></span><span data-holds="badges"></span><span class="part where-part"></span><span data-holds="lines"></span><span class="part stats-part"></span></div>
      <div class="bar-actions"><span class="part details-part"></span><span data-holds="actions"></span><span class="part own"></span></div></div>
    <div class="tab-row bar-line" data-holds="tabs"></div>${cell ? '<span class="acts"></span>' : ''}</div>
  <div class="bar-details" id="${pop}-details" popover></div><div class="bar-left" id="${pop}-left" popover></div>${cell ? `<div class="bar-pick" id="${pop}-pick" popover></div>` : ''}
  <div class="ask"></div>
  <div class="screen" data-holds="views"></div>`
  host.classList.toggle('cell', cell)
  const $ = <E extends HTMLElement = HTMLElement>(selector: string) => host.querySelector<E>(selector)!
  const top = $('.bar-top')
  const details = $('.bar-details')
  const left = $('.bar-left')
  /** What the head leaves out: nothing at pane scale. */
  const omitted = () => ({ omit: cell ? (opts.omit ?? []) : [] })
  let headRegion = head ? kit.region(top, 'card.head', subject, omitted()) : undefined
  const panes = kit.region(host, 'card.panes', subject)

  /** The menu opens under the callsign that opened it, the one drawn now. */
  const picker = cell ? $('.bar-pick') : undefined
  picker?.addEventListener('beforetoggle', (e) => {
    if ((e as ToggleEvent).newState !== 'open') return
    const pick = [...host.querySelectorAll<HTMLElement>('.pick')].find((b) => b.offsetParent)
    const at = pick?.getBoundingClientRect()
    if (at) Object.assign(picker.style, { top: `${at.bottom + 4}px`, left: `${pick!.previousElementSibling!.getBoundingClientRect().left}px` })
  })

  /** The details open over the top of the panes, clear of the head that opened them. */
  details.addEventListener('beforetoggle', (e) => (e as ToggleEvent).newState === 'open' && (details.style.top = `${$('.screen').getBoundingClientRect().top + 6}px`))

  const floor = () => board.floors.find((f) => f.id === card.project)

  /** Why a daemon verb can't run now: a daemon it needs is down. */
  const heldWhy = (verb: DaemonVerb) => whyNot(board, verb)
  const heldHtml = (verb: DaemonVerb, label: string, inner: string, cls = '') =>
    `<button class="held ${cls}" aria-disabled="true" aria-label="${esc(label)}" data-tip="${esc(heldWhy(verb) ?? HOST_MEANS.unknown)}">${inner}</button>`

  const letGoHtml = (c: Card, label: string) =>
    !can(c, 'let-go') ? '' : heldWhy('let-go') ? heldHtml('let-go', label, label) : `<button data-let-go data-tip="${esc(`let ${c.callsign} go: ${LET_GO_MEANS}`)}">${label}</button>`

  const sendHomeTitle = (c: Card) => {
    const sent = sentHome(cards(), c)
    return sent.length === 1 ? `end ${c.callsign}; it can be resumed` : `end ${sent.map((h) => h.callsign).join(', ')}: ${c.callsign} and everyone under it that runs; each can be resumed`
  }

  const cards = () => board.floors.flatMap((f) => f.cards)

  /** What the worker left running, each process ended on its own or all at once. */
  function leftHtml(c: Card) {
    if (!c.resources.length) return `<h3>${c.callsign} left nothing running</h3>`
    const row = (r: CardResource) => `<div class="proc"><code>${r.pid}</code><span class="on ${r.orphan ? 'orphan' : ''}">${[...r.ports.map((p) => `:${p}`), r.orphan ? 'orphan' : ''].filter(Boolean).join(' ')}</span>
    <span class="cmd" data-tip="${esc(r.command)}">${esc(r.command)}</span><button data-reap-process="${esc(JSON.stringify(callOf(r, 'reap')))}" data-tip="end process ${r.pid}">${verbLabel('resource', 'reap')}</button></div>`
    return `<h3>Left running by ${c.callsign}</h3>${c.resources.map(row).join('')}
    <div class="all"><button class="danger" data-reap>${verbLabel('card', 'reap')} ${c.resources.length}</button></div>`
  }

  /** The rest of what is known about the worker: what it does now in full, and every detail. */
  function detailsHtml(c: Card) {
    const rows = [['now', gistLine(c)], ...detailsOf(c), resumesRow(c, when), ['started', when(c.startedAt)]].filter(([, value]) => value)
    return `<h3>${c.callsign}</h3><dl>${rows.map(([label, value]) => `<dt>${label}</dt><dd>${esc(value)}</dd>`).join('')}</dl>`
  }

  /** The ▾ that opens the menu of workers to pick, where the view holding the card gives one. */
  const pickHtml = () => (opts.pick ? `<button class="pick" popovertarget="${pop}-pick" aria-label="${esc(opts.pick.label)}" data-tip="${esc(opts.pick.tip ?? opts.pick.label)}">${ICON.caret}</button>` : '')

  /** The menu of workers to pick: each by its lamp and callsign, with its note, else its status. */
  function pickMenuHtml(p: CardPick) {
    const all = cards()
    const rows = p.choices.flatMap(({ id, note }) => {
      const c = all.find((d) => d.id === id)
      return c ? [`<button data-pick="${esc(id)}"><span class="lamp ${lampOf(c)}"></span>${c.callsign}<small>${esc(note ?? statusName(c))}</small></button>`] : []
    })
    return `<h3>${esc(p.label)}</h3>${rows.join('') || '<div class="none">no other worker to pick</div>'}`
  }

  /** The cell's own row parts: the lamp and callsign while the head is hidden, and the acts of the view holding it. */
  function drawCell(c: Card) {
    paintOnce($('.mini'), `<span class="lamp ${lampOf(c)}" data-tip="${esc(statusName(c))}"></span><span role="heading" aria-level="2">${c.callsign}</span>${pickHtml()}`)
    paintOnce(
      $('.acts'),
      (opts.acts ?? [])
        .map((a) => `<button class="icon-btn" data-act="${esc(a.id)}"${a.icon ? ` aria-label="${esc(a.label)}"` : ''} data-tip="${esc(a.tip ?? a.label)}">${a.icon ? ICON[a.icon] : esc(a.label)}</button>`)
        .join(''),
    )
    if (opts.pick) paintOnce($('.bar-pick'), pickMenuHtml(opts.pick))
  }

  function draw() {
    const c = card
    const ports = c.resources.flatMap((r) => r.ports.map((p) => `:${p}`)).join(' ')
    const orphan = c.resources.some((r) => r.orphan)
    const ctx = c.context
    if (cell) drawCell(c)
    paintOnce(
      $('.lead'),
      `<span class="call" role="heading" aria-level="2">${c.callsign}</span>${cell ? pickHtml() : ''}
    <span class="pill ${lampOf(c)}${c.stuck ? ' stuck' : ''}"${c.stuck || c.broken ? ` data-tip="${esc(statusTitle(c))}"` : ''}><span class="lamp"></span>${statusName(c)} ·<span translate="no" data-since="${c.enteredAt}"></span></span>`,
    )
    paintOnce($('.where-part'), `<span class="where" data-tip="${esc(c.cwd)}">${withIcons(esc(whereLineOf(c, floor() as Floor, reviewerOf(c))))}</span>`)
    paintOnce(
      $('.stats-part'),
      `<span class="stats">
      ${ctx === undefined ? '' : `<span class="meter" data-tip="context window: ${ctx}% · ${esc(modelName(c.model))}" style="--fill:${fillOf(ctx, 80)}"><i style="width:${ctx}%"></i><span class="sr-only">context window, ${esc(modelName(c.model))}:</span></span><b>${ctx}%</b>`}
      ${c.costUsd != null ? `<b>$${c.costUsd.toFixed(2)}</b>` : ''}
      ${claudeFlagHtml(c) ?? ''}
      ${can(c, 'reap') ? `<button class="ports ${orphan ? 'orphan' : ''}" popovertarget="${pop}-left" data-tip="processes left running: click to see them and end them">${c.resources.length}▪ ${ports}</button>` : ''}
    </span>`,
    )
    paintOnce($('.details-part'), `<button class="icon-btn" popovertarget="${pop}-details" aria-label="details" data-tip="everything else about ${c.callsign}">${ICON.info}</button>`)
    paintOnce(
      $('.own'),
      `${!can(c, 'resume') ? '' : heldWhy('resume') ? heldHtml('resume', verbLabel('card', 'resume'), `${ICON.resume} ${verbLabel('card', 'resume')}`, 'primary') : `<button class="primary" data-resume>${ICON.resume} ${verbLabel('card', 'resume')}</button>`}
    ${letGoHtml(c, verbLabel('card', 'let-go'))}
    ${can(c, 'send-home') ? `<button class="danger" data-send-home data-tip="${esc(sendHomeTitle(c))}">${verbLabel('card', 'send-home')}</button>` : ''}
    ${scale !== 'cell' ? `<button class="icon-btn" data-home aria-label="back to the skyline" ${keyedTip(board.keys, 'back to the skyline', 'home')}>${ICON.close}</button>` : ''}`,
    )
    paintOnce(details, detailsHtml(c))
    paintOnce(left, leftHtml(c))
    host.classList.toggle('asking', head && (c.status === 'needs_input' || c.status === 'blocked'))
    paintOnce(
      $('.ask'),
      `<span class="what"><span class="call">${c.callsign}</span> ${c.blocked ? esc(BLOCKED_TEXT[c.blocked]) : c.tool ? `asks to ${toolHtml(c.tool)}` : 'needs you'}</span>
    ${can(c, 'drive') ? `<button class="primary" data-drive ${keyedTip(board.keys, 'answer in its terminal', 'pane-terminal')}>${verbLabel('card', 'drive')}</button>` : ''}`,
    )
  }

  const told = <T,>(request: Promise<T>) => request.catch((err: Error) => void kit.toast(err.message))

  /** A worker started from here opens once the board carries it. */
  const opened = (reply: { t: string; id?: string } | void) => reply?.t === 'spawned' && kit.display(`card:${reply.id}`)

  /** Ends the worker with everyone under it that runs, the deepest first; the toast offers the resume of one sent home alone. */
  async function sendHome(button: HTMLElement) {
    const c = card
    if (!can(c, 'send-home')) return kit.toast(noLongerOffered(c.callsign, 'send-home'))
    const sent = sentHome(cards(), c)
    if (!(await kit.confirm(sendHomeAsk(c, sent), verbLabel('card', 'send-home')))) return
    const ended = await told(
      pressing(button, async () => {
        for (const call of callOf(c, 'send-home') ?? []) if (!(await told(tower.run(call)))) return false
        return true
      }),
    )
    if (ended) kit.toast(`Sent ${sent.map((h) => h.callsign).join(', ')} home`, sent.length === 1 ? { label: verbLabel('card', 'resume'), run: () => void resumeSentHome(c) } : undefined)
  }

  /** The resume of a worker sent home, read from the board or its floor's archive. */
  async function resumeSentHome(c: Card) {
    const dead = cards().find((d) => d.id === c.id) ?? (await told(tower.archive(c.project)))?.find((d) => d.id === c.id)
    const call = dead && callOf(dead, 'resume')
    if (!call) return kit.toast(`${c.callsign} can't be resumed now`)
    opened(await told(tower.run(call)))
  }

  host.addEventListener('click', async (e) => {
    const target = e.target as Element
    const region = target.closest('[data-region]')
    if (region && host.contains(region)) return
    const button = target.closest<HTMLElement>('button')
    if (!button) return
    const c = card
    if (button.matches('[data-home]')) return kit.display('board')
    if (button.matches('[data-act]')) return void host.dispatchEvent(new CustomEvent('act', { bubbles: true, detail: { id: button.dataset.act } }))
    if (button.matches('[data-pick]')) {
      picker?.hidePopover()
      return void host.dispatchEvent(new CustomEvent('pick', { bubbles: true, detail: { id: button.dataset.pick } }))
    }
    if (button.matches('[data-drive]')) return void kit.run('pane-terminal', subject)
    if (button.matches('[data-resume]')) {
      const call = callOf(c, 'resume')
      return call ? opened(await told(pressing(button, () => tower.run(call)))) : kit.toast(noLongerOffered(c.callsign, 'resume'))
    }
    if (button.matches('[data-let-go]')) {
      if (!(await kit.confirm(letGoAsk(c), verbLabel('card', 'let-go')))) return
      if (await told(pressing(button, async () => tower.run(offeredCall(c, 'let-go', c.callsign))))) kit.toast(letGoneLine(c))
      return
    }
    if (button.matches('[data-send-home]')) return void sendHome(button)
    if (button.matches('[data-reap-process]')) return void told(pressing(button, () => tower.run(JSON.parse(button.dataset.reapProcess!))))
    if (button.matches('[data-reap]') && (await kit.confirm(reapAsk(c), 'End them'))) void told(pressing(button, async () => tower.run(offeredCall(c, 'reap', c.callsign))))
  })

  /** The options as they stand now: the head shown or hidden in place, its tabs, scroll and terminal kept. */
  function retune(next: CardOptions) {
    const omitWas = JSON.stringify(omitted())
    opts = next
    head = opts.head !== false
    top.hidden = !head
    host.classList.toggle('bare', cell && !head)
    if (!head) (headRegion?.close(), (headRegion = undefined))
    else if (!headRegion) headRegion = kit.region(top, 'card.head', at, omitted())
    else if (JSON.stringify(omitted()) !== omitWas) headRegion.options?.(omitted())
    draw()
  }

  host.classList.toggle('bare', cell && !head)
  draw()

  return {
    options: (next) => retune(next as CardOptions),
    update(next: Board, now: Subject) {
      board = next
      at = now
      card = now.value as Card
      draw()
      headRegion?.update(now)
      panes.update(now)
    },
    show: (s) => panes.show?.(s) ?? false,
    visible: (on) => panes.visible?.(on),
    close() {
      headRegion?.close()
      panes.close()
    },
  }
}

