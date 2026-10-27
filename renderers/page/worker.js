import { documentCss } from '/design.js'
import { cardSubject, shownSubject, linesOf, sentHome, lampOf, BLOCKED_TEXT, DISMISS_TITLE, heededWaits, claudeFlagHtml, ago, callOf, can, noLongerOffered, detailsOf, esc, gistLine, modelName, shownTitle, statusName, whereLineOf, resumesRow, statusTitle, sendHomeAsk } from '/cards.js'
import { ICON, withIcons } from '/icons.js'
import { threadCheckout } from '/x/reviews/panel.js'
import { reviewerOf } from '/x/reviews/reviews.js'
import { keepShownTabs, fileSpansHtml } from '/panels.js'
import { toolHtml, when, $, fillOf, keyedTip, shownPane, shownKey, shownHref, DOC_CSS, repaint, toast, told } from './kit.js'
import { shownFrom } from '/brief.js'
import { documentHtml } from '/markdown.js'
import { pressing } from '/press.js'
import { verbLabel } from '/verb-words.js'
import { addedActionsHtml, addsHtml, badgesHtml } from './added.js'

/**
 * @import { Board, Card, CardResource, CardShown, Floor } from '../../src/bridge/board.ts'
 * @import { Heed, DaemonVerb } from '../../src/shared/cards.ts'
 * @import { Loop } from '../../src/shared/loop.ts'
 * @import { MainView, Pane } from './view.js'
 * @import { PageState, PageEvent } from './page.js'
 * @import * as Xterm from '@xterm/xterm'
 * @import { Brief } from '../../src/bridge/turns.ts'
 */

/**
 * @typedef {{
 *   callsign: (id: string) => string,
 *   floorOf: (project: string) => Floor | undefined,
 *   heldWhy: (verb: DaemonVerb) => string | undefined,
 *   heldHtml: (verb: DaemonVerb, label: string, inner: string, cls?: string) => string,
 *   letGoHtml: (c: Card, label: string) => string,
 *   terminal: () => Xterm.Terminal | undefined,
 *   selected: () => string | undefined,
 *   openTerm: () => Xterm.Terminal,
 *   isOwner: () => boolean,
 *   board: () => Board,
 *   heed: () => Heed,
 *   viewing: <T extends MainView['t']>(t: T) => Extract<MainView, { t: T }> | undefined,
 *   changesTally: (c: Card) => string,
 *   keepsThreads: (c: Card) => boolean,
 *   reviewsTally: (c: Card) => string,
 *   render: () => void,
 *   reviewing: (pane: Pane) => pane is 'changes' | 'reviews',
 *   followThread: (c: Card) => void,
 *   drawChanges: () => void,
 *   drawReviews: (c: Card) => void,
 *   showBrief: (c: Card, threads: Brief[]) => void,
 *   go: (view: MainView) => void,
 *   watchedOf: (s: PageState) => string | undefined,
 *   page: Loop<PageState, PageEvent>,
 *   showShownAlert: (c: Card, s: CardShown) => void,
 *   cards: () => Card[],
 *   selectArriving: (id: string) => void,
 *   ask: (text: string, verb: string) => Promise<boolean>,
 * }} WorkerDeps
 */

/**
 * The selected worker in the main pane: its header with its status, details and what it left running, its pane
 * tabs, what it showed drawn over the terminal, and Send home.
 * @param {WorkerDeps} deps
 */
export async function worker(deps) {
  const { callsign, floorOf, heldWhy, heldHtml, letGoHtml, terminal, selected, openTerm, isOwner, board, heed, viewing, changesTally, keepsThreads, reviewsTally, render, reviewing, followThread, drawChanges, drawReviews, showBrief, go, watchedOf, page, showShownAlert, cards, selectArriving, ask } = deps
  /** The selected worker's header: who and where, a glance at its context, cost and leftovers, and its views. @param {Card} c */
  function barHtml(c) {
    const ports = c.resources.flatMap((r) => r.ports.map((p) => `:${p}`)).join(' ')
    const orphan = c.resources.some((r) => r.orphan)
    const ctx = c.context
    repaint($('bar-info'), `<span class="call" role="heading" aria-level="2">${callsign(c.id)}</span>
    <span class="pill ${lampOf(c)}${c.stuck ? ' stuck' : ''}"${c.stuck || c.broken ? ` data-tip="${esc(statusTitle(c))}"` : ''}><span class="lamp"></span>${statusName(c)} ·<span translate="no" data-since="${c.enteredAt}"></span></span>${dismissHtml(c)}${badgesHtml(board(), cardSubject(c))}
    <span class="where" data-tip="${esc(c.cwd)}">${withIcons(esc(whereLineOf(c, /** @type {Floor} */ (floorOf(c.project)), reviewerOf(c))))}</span>${linesOf(board(), c.id).map((l) => `<span class="adds-line" data-tip="${esc(l)}">${esc(l)}</span>`).join('')}
    <span class="stats">
      ${ctx === undefined ? '' : `<span class="meter" data-tip="context window: ${ctx}% · ${esc(modelName(c.model))}" style="--fill:${fillOf(ctx, 80)}"><i style="width:${ctx}%"></i><span class="sr-only">context window, ${esc(modelName(c.model))}:</span></span><b>${ctx}%</b>`}
      ${c.costUsd != null ? `<b>$${c.costUsd.toFixed(2)}</b>` : ''}
      ${claudeFlagHtml(c) ?? ''}
      ${can(c, 'reap') ? `<button class="ports ${orphan ? 'orphan' : ''}" popovertarget="bar-left" data-tip="processes left running: click to see them and end them">${c.resources.length}▪ ${ports}</button>` : ''}
    </span>`)
    repaint($('bar-actions'), `<button class="icon-btn" popovertarget="bar-details" aria-label="details" data-tip="everything else about ${callsign(c.id)}">${ICON.info}</button>
    ${addedActionsHtml(board(), cardSubject(c))}
    ${!can(c, 'resume') ? '' : heldWhy('resume') ? heldHtml('resume', verbLabel('card', 'resume'), `${ICON.resume} ${verbLabel('card', 'resume')}`, 'primary') : `<button class="primary" data-resume="${esc(JSON.stringify(callOf(c, 'resume')))}">${ICON.resume} ${verbLabel('card', 'resume')}</button>`}
    ${letGoHtml(c, verbLabel('card', 'let-go'))}
    ${can(c, 'send-home') ? `<button class="danger" data-act="send-home" data-of="${c.id}" data-tip="${esc(sendHomeTitle(c))}">${verbLabel('card', 'send-home')}</button>` : ''}
    <button class="icon-btn" data-act="home" aria-label="back to the skyline" ${keyedTip(board().keys, 'back to the skyline', 'home')}>${ICON.close}</button>`)
    $('bar-details').innerHTML = detailsHtml(c)
    $('bar-left').innerHTML = leftHtml(c)
    $('main').classList.toggle('asking', c.status === 'needs_input' || c.status === 'blocked')
    $('ask').innerHTML = `<span class="what"><span class="call">${callsign(c.id)}</span> ${c.blocked ? esc(BLOCKED_TEXT[c.blocked]) : c.tool ? `asks to ${toolHtml(c.tool)}` : 'needs you'}</span>
    ${can(c, 'drive') ? `<button class="primary" data-act="drive" ${keyedTip(board().keys, 'answer in its terminal', 'pane-terminal')}>${verbLabel('card', 'drive')}</button>` : ''}`
    repaint($('bar-line'), paneTabsHtml(c, paneOf(c)) + shownAddsHtml(c, paneOf(c)))
    keepShownTabs($('bar-line'), c.id)
    renderPane(c)
  }

  /** The details open over the top of the screen, clear of the header that opened them. */
  $('bar-details').addEventListener('beforetoggle', (e) => e.newState === 'open' && ($('bar-details').style.top = `${$('screen').getBoundingClientRect().top + 6}px`))

  /** The rest of what is known about a worker, opened from its header: what it does now in full, and every detail. */
  /** What the worker left running, each process ended on its own or all at once. @param {Card} c */
  function leftHtml(c) {
    if (!c.resources.length) return `<h3>${callsign(c.id)} left nothing running</h3>`
    /** @param {CardResource} r */
    const row = (r) => `<div class="proc"><code>${r.pid}</code><span class="on ${r.orphan ? 'orphan' : ''}">${[...r.ports.map((p) => `:${p}`), r.orphan ? 'orphan' : ''].filter(Boolean).join(' ')}</span>
    <span class="cmd" data-tip="${esc(r.command)}">${esc(r.command)}</span><button data-reap-process="${esc(JSON.stringify(callOf(r, 'reap')))}" data-tip="end process ${r.pid}">${verbLabel('resource', 'reap')}</button></div>`
    return `<h3>Left running by ${callsign(c.id)}</h3>${c.resources.map(row).join('')}
    <div class="all"><button class="danger" data-reap="${c.id}">${verbLabel('card', 'reap')} ${c.resources.length}</button></div>`
  }

  /** @param {Card} c */
  function detailsHtml(c) {
    const rows = [
      ['now', gistLine(c)],
      ...detailsOf(c),
      resumesRow(c, when),
      ['started', when(c.startedAt)],
      ['terminal', terminal() && selected() === c.id ? `${openTerm().cols}×${openTerm().rows} · ${isOwner() ? 'sized to this view, you type' : 'watching'}` : ''],
    ].filter(([, value]) => value)
    return `<h3>${callsign(c.id)}</h3><dl>${rows.map(([label, value]) => `<dt>${label}</dt><dd>${esc(value)}</dd>`).join('')}</dl>`
  }

  /** Dismiss, beside the status of `c` while it waits on you and you heed it. @param {Card} c */
  function dismissHtml(c) {
    const wait = heededWaits(board(), heed()).find((w) => w.id === c.id)
    return wait ? `<button class="dismiss" data-dismiss="${esc(wait.key)}" data-tip="${DISMISS_TITLE}">dismiss</button>` : ''
  }

  /** Whether `c` has a tab for `pane`: the panes the viewer can pick are the ones its tabs draw. @param {Card} c @param {Pane} pane */
  const hasPane = (c, pane) => (pane === 'brief' ? can(c, 'brief') : pane === 'reviews' ? keepsThreads(c) : pane.startsWith('shown:') ? !!shownOn(c, pane) : true)

  /** A running session opens on its terminal, a finished one on its brief; a pane it lacks (a thing shown and closed since, a thread or a brief it has none of) falls back. @param {Card} c @returns {Pane} */
  const paneOf = (c) => {
    const chosen = viewing('worker')?.pane
    return (chosen && hasPane(c, chosen) ? chosen : undefined) ?? (can(c, 'drive') || !can(c, 'brief') ? 'screen' : 'brief')
  }

  const PANE_PANEL = { screen: 'c-screen', brief: 'brief', changes: 'changes', reviews: 'reviews' }

  /** The keymap's command for each pane of the selected worker. @type {Partial<Record<string, Pane>>} */
  const PANE_COMMAND = { 'pane-terminal': 'screen', 'pane-brief': 'brief', 'pane-changes': 'changes', 'pane-reviews': 'reviews' }

  /**
   * A pane's tab, as the ARIA tabs pattern has it: only the selected one is in the Tab order, arrows move along the row.
   * Its tip is `what`, with the chords of the pane's command for the panes the keymap names.
   * @param {Pane} id @param {boolean} on @param {string} what
   */
  const paneTabAttrs = (id, on, what) => {
    const command = Object.keys(PANE_COMMAND).find((c) => PANE_COMMAND[c] === id)
    return `role="tab" aria-selected="${on}" tabindex="${on ? 0 : -1}" aria-controls="${id.startsWith('shown:') ? 'shown' : PANE_PANEL[/** @type {keyof typeof PANE_PANEL} */ (id)]}" ${command ? keyedTip(board().keys, what, command) : `data-tip="${esc(what)}"`} data-pane="${esc(id)}"`
  }

  /** @param {Card} c @param {Pane} pane */
  const paneTabsHtml = (c, pane) => {
    const shown = visibleShown(c)
    return `<span class="tab-set" role="tablist" aria-label="views of ${callsign(c.id)}"><button class="pane-tab ${pane === 'screen' ? 'on' : ''}" ${paneTabAttrs('screen', pane === 'screen', 'the session in its terminal')}>Terminal</button>` +
      (can(c, 'brief') ? `<button class="pane-tab ${pane === 'brief' ? 'on' : ''}" ${paneTabAttrs('brief', pane === 'brief', 'the last prompts and answers of each conversation, in full')}>Brief</button>` : '') +
      `<button class="pane-tab ${pane === 'changes' ? 'on' : ''}" ${paneTabAttrs('changes', pane === 'changes', "what changed in the worker's repos, as git reads it")}>Changes${changesTally(c)}</button>` +
      (keepsThreads(c) ? `<button class="pane-tab ${pane === 'reviews' ? 'on' : ''}" ${paneTabAttrs('reviews', pane === 'reviews', `the review thread of checkout ${threadCheckout(c)}: notes from you, its workers and reviewers`)}>Reviews${reviewsTally(c)}</button>` : '') +
      (shown.length ? `<span class="shown-tabs">${shown.map((s) => shownTabHtml(c, s, pane === shownPane(s))).join('')}</span>` : '') + '</span>'
  }

  /** What a worker showed, as a tab: a link opens in a browser tab, anything else also opens out of the tower. @param {Card} c @param {CardShown} s @param {boolean} on */
  const shownTabHtml = (c, s, on) => {
    const from = shownFrom(c.lineage, s)
    return `<button class="pane-tab shown-tab ${on ? 'on' : ''}" ${paneTabAttrs(shownPane(s), on, `${callsign(c.id)} showed ${s.target} · ${ago(Date.now() - s.at)} ago${from ? ` · in ${from.label}` : ''}`)}>` +
    `<span class="shown-name">${s.kind === 'link' ? `${ICON.remote} ` : ''}${esc(shownTitle(s))}</span>${from ? `<small>${from.mark}</small>` : ''}` +
    (on && s.kind !== 'link' ? `<span class="icon-btn" data-out="${esc(shownHref(s))}" aria-hidden="true" data-tip="open in a browser tab">${ICON.remote}</span>` : '') +
    (on && s.kind === 'file' ? fileSpansHtml(s.target) : '') +
    `<span class="icon-btn" data-unshow="${esc(shownKey(s))}" aria-hidden="true" data-tip="close: it comes back if shown again">${ICON.close}</span></button>`
  }

  /** What extensions add to the showing open in `pane`, beside its tab. @param {Card} c @param {Pane} pane */
  const shownAddsHtml = (c, pane) => {
    const s = pane.startsWith('shown:') ? shownOn(c, pane) : undefined
    const adds = s ? addsHtml(board(), shownSubject(c, s)) : ''
    return adds && `<span class="shown-adds" role="group" aria-label="on ${esc(shownTitle(/** @type {CardShown} */ (s)))}">${adds}</span>`
  }

  /** @param {Card} c @param {Pane} pane */
  const shownOn = (c, pane) => visibleShown(c).find((s) => shownPane(s) === pane)

  const UNSHOWN_KEY = 'shown.closed'
  /** The showings this viewer closed, by `session|target|at`, kept in `tower.store`. */
  const unshown = new Set(/** @type {string[] | undefined} */ (await tower.store.get(UNSHOWN_KEY)) ?? [])
  /** @param {Card} c */
  const visibleShown = (c) => c.shown.filter((s) => !unshown.has(shownKey(s)))

  /** @param {string} key */
  function unshow(key) {
    unshown.add(key)
    tower.store.set(UNSHOWN_KEY, [...unshown].slice(-200))
    render()
  }

  /** The selected session, whether it works, and its conversations as the brief last drew them: it asks again when they change. @type {string | undefined} */
  let briefKey

  /** The brief and what a worker showed lie over the terminal, which keeps its size: a hidden terminal would refit the PTY to nothing. @param {Card} c */
  function renderPane(c) {
    const pane = paneOf(c)
    renderShown(c, pane.startsWith('shown:') ? shownOn(c, pane) : undefined)
    const brief = pane === 'brief'
    $('c-screen').inert = pane !== 'screen'
    $('main').classList.toggle('on-brief', brief)
    $('main').classList.toggle('on-changes', pane === 'changes')
    $('main').classList.toggle('on-reviews', pane === 'reviews')
    if (reviewing(pane) && keepsThreads(c)) followThread(c)
    if (pane === 'changes') drawChanges()
    if (pane === 'reviews') drawReviews(c)
    const key = brief && `${c.id} ${c.status === 'working'} ${JSON.stringify(c.conversations)} ${JSON.stringify(c.conversations.map((v) => board().adds[`conversation:${v.id}`]))}`
    if (!key || key === briefKey) return
    briefKey = key
    told(tower.conversations(c.id)).then((threads) => threads && briefKey === key && showBrief(c, threads))
  }

  /** The showing the shown pane last drew: a new showing of the same target draws it again. @type {string | undefined} */
  let shownDrawn

  /** The shown pane is drawn again on the next render. */
  const forgetShown = () => (shownDrawn = undefined)

  /** @param {Card} c @param {CardShown | undefined} s */
  function renderShown(c, s) {
    $('main').classList.toggle('on-shown', Boolean(s))
    const key = s && shownKey(s)
    if (key === shownDrawn) return
    shownDrawn = key
    if (!s) return ($('shown').innerHTML = '')
    if (s.kind === 'url') return ($('shown').innerHTML = `<iframe src="${esc(s.target)}" allow="clipboard-read; clipboard-write"></iframe>`)
    if (s.kind === 'link') return ($('shown').innerHTML = `<iframe class="doc" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"></iframe>`, showLink(c, s))
    if (/\.(png|jpe?g|gif|webp|svg)$/i.test(s.target)) return ($('shown').innerHTML = `<img src="${esc(shownHref(s))}" alt="${esc(shownTitle(s))}">`)
    if (/\.(mp4|webm)$/i.test(s.target)) return ($('shown').innerHTML = `<video controls autoplay src="${esc(shownHref(s))}"></video>`)
    if (!s.target.endsWith('.md')) return ($('shown').innerHTML = `<iframe sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" allow="clipboard-write" src="${esc(shownHref(s))}"></iframe>`)
    $('shown').innerHTML = `<iframe class="doc" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"></iframe>`
    told(tower.text(shownHref(s).slice(1))).then((md) => {
      if (md === undefined || shownDrawn !== key) return
      const frame = /** @type {HTMLIFrameElement} */ ($('shown').firstChild)
      frame.srcdoc = `<!doctype html><html ${tower.prefs.attributes()}><meta charset="utf-8"><base target="_blank"><link rel="stylesheet" href="/design.css"><style>${documentCss}${DOC_CSS}</style><article>${documentHtml(md, shownHref(s))}</article>`
    })
  }

  /** A page that can't be shown in place: one click opens it, since a browser opens no tab by itself. @param {Card} c @param {CardShown} s */
  function showLink(c, s) {
    const frame = /** @type {HTMLIFrameElement} */ ($('shown').firstChild)
    frame.srcdoc = `<!doctype html><html ${tower.prefs.attributes()}><meta charset="utf-8"><base target="_blank"><link rel="stylesheet" href="/design.css"><style>${documentCss}${DOC_CSS}</style>
    <article><h4>${esc(callsign(c.id))} asks you to open</h4><h2>${esc(shownTitle(s))}</h2><p><code>${esc(s.target)}</code></p>
    <p><a href="${esc(s.target)}" rel="noreferrer"><b>Open ↗</b></a></p></article>`
  }

  /** @param {Pane} pane */
  function showPane(pane) {
    if (pane === 'brief') terminal()?.blur()
    go({ t: 'worker', id: /** @type {string} */ (selected()), pane })
  }

  /** Every showing the page has seen: a new one opens its tab on the selected session, and alerts when you aren't looking at it. @type {Set<string>} */
  const seenShown = new Set()
  let shownPrimed = false

  /** @param {Card[]} all */
  function noticeShown(all) {
    for (const c of all) for (const s of visibleShown(c)) {
      const key = shownKey(s)
      if (seenShown.has(key)) continue
      seenShown.add(key)
      if (!shownPrimed) continue
      if (selected() === c.id) showPane(shownPane(s))
      if (watchedOf(page.state()) !== c.id && Notification.permission === 'granted') showShownAlert(c, s)
    }
    shownPrimed = true
  }

  /** @param {Card} c */
  const sendHomeCalls = (c) => callOf(c, 'send-home') ?? []

  /** @param {Card} c */
  const sendHomeTitle = (c) => sentHome(cards(), c).length === 1 ? `end ${callsign(c.id)}; it can be resumed` : `end ${sentHome(cards(), c).map((h) => h.callsign).join(', ')}: ${callsign(c.id)} and everyone under it that runs; each can be resumed`

  /** Ends a worker with everyone under it that runs, the deepest first; the toast offers the resume of one sent home alone. @param {HTMLElement} button @param {Card} c */
  async function sendHome(button, c) {
    if (!can(c, 'send-home')) return toast(noLongerOffered(c.callsign, 'send-home'))
    const sent = sentHome(cards(), c)
    if (!(await ask(sendHomeAsk(c, sent), verbLabel('card', 'send-home')))) return
    const ended = await pressing(button, async () => {
      for (const call of sendHomeCalls(c)) if (!(await told(tower.run(call)))) return false
      return true
    })
    if (ended) toast(`Sent ${sent.map((h) => h.callsign).join(', ')} home`, sent.length === 1 ? { label: verbLabel('card', 'resume'), run: () => resumeSentHome(c) } : undefined)
  }

  /** Killing asks first; once killed, the toast offers the worker's resume, read from the board or its floor's archive. */
  /** @param {Card} c */
  async function resumeSentHome(c) {
    const dead = cards().find((d) => d.id === c.id) ?? (await told(tower.archive(c.project)))?.find((d) => d.id === c.id)
    const call = dead && callOf(dead, 'resume')
    if (!call) return toast(`${callsign(c.id)} can't be resumed now`)
    const reply = await told(tower.run(call))
    if (reply?.t === 'spawned') selectArriving(reply.id)
  }

  /** The pane tabs move as the ARIA tabs pattern has it: ← → Home End go along the row and show the pane they reach. */
  $('bar-line').addEventListener('keydown', (e) => {
    const tab = /** @type {Element} */ (e.target).closest('[role=tab]')
    if (!tab || e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return
    const tabs = [.../** @type {HTMLElement} */ (tab.closest('[role=tablist]')).querySelectorAll('[role=tab]')]
    const at = tabs.indexOf(tab)
    const to = tabs[/** @type {Record<string, number>} */ ({ ArrowLeft: (at - 1 + tabs.length) % tabs.length, ArrowRight: (at + 1) % tabs.length, Home: 0, End: tabs.length - 1 })[e.key]]
    if (!to) return
    e.preventDefault()
    to.focus()
    showPane(/** @type {Pane} */ (to.dataset.pane))
  })

  return { barHtml, paneOf, PANE_COMMAND, unshow, forgetShown, showPane, noticeShown, sendHome }
}
