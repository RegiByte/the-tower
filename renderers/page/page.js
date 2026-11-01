import { actionWords, addedActions, boardSubject, heededAsks, isAsk, isCommand, parentOf, projectOfKey, runCommandWith, runVerb, subjectAt, ATTENTION_MEANS, ATTENTION_NAME, HOST_ATTENTION, HOST_MEANS, HOST_NAME, ON_DUTY_MEANS, WAITING_MEANS, WAITING_NAME, hostState, loudest, SOUNDS, attentionOrder, heededWaits, isOffer, nextAttended, claudeUntestedHtml, boardErrorTitle, tidiedLine, discardAsk, discardedLine, ago, callOf, can, noLongerOffered, offeredCall, esc, neighbours, strandedOf, letGoAsk, letGoneLine, resumeAllAsk, resumeStranded, reapAsk, killShellAsk, addedTidyOf, tidyAllAsk, WORKTREE_ASK, WORKTREE_DONE, WORKTREE_VERB_NAME, keptLine, sentHome, sendHomeAsk, cardSubject, shownSubject, shownKey, DISMISS_TITLE, actionId, exemptionsOf, headRanked, isFresh, offeredIds, overflowOf, plural, rankedActions, rankedBadges, rankedLines } from '/cards.js'
import { probedLine } from '/x/quota/quota.js'
import { itemsCss } from '/items.js'
import { panelsCss, STATS_ALL, fileButtonsHtml, fileCall, keepingFocus } from '/panels.js'
import { floorPolicies, offerAskKey, POLICIES } from '/x/policies/policies.js'
import { loop, timers } from '/loop.js'
import { wireSpawn } from '/spawn.js'
import { attendNext, attending, watchedIn } from '/attend.js'
import { HOME, SKYLINE, cardIdOf, floorOfView, hashOf, isHome, located, mainClass, mainViewOf, sameRoom, viewOf } from './view.js'
import { regions } from './regions.js'
import { busOf, declaredLayout, displayed, fill, layoutOf, openable, viewOn, viewsOf } from '/views.js'
import { dialogs } from './dialogs.js'
import { sidebar } from './sidebar.js'
import { shells } from './shells.js'
import { tipStrip } from './tip.js'
import { screen } from './screen.js'
import { stats } from './stats.js'
import { settingsPane } from './settings-pane.js'
import { alerting } from './alerts.js'
import { draft } from './draft.js'
import { archive } from './archive.js'
import { boardKit } from './board.js'
import { onDuty, $, signHtml, copyText, topAnchorOf, sightAnchorOf, holdRow, paintOnce, repaint, announce, toast, notice, told } from './kit.js'
import { briefCss } from '/brief.js'
import { markdownCss } from '/markdown.js'
import { COMMANDS, DEFAULT_KEYS, MOVE_COMMAND, addedCommandOf, commandOf, frameCommandOf, isAddedId } from '/keymap.js'
import { VIEWER_KEYS, readViewer, sawAll, seenOf } from '/viewer.js'
import { settingsCss } from '/settings.js'
import { loadTerminalFont } from '/terminal.js'
import { watchTips } from '/tips.js'
import { pressing } from '/press.js'
import { toastsCss } from '/toasts.js'
import { DRAFTS, draftsOf, keepUnsent, titleOf } from '/x/drafts/drafts.js'
import { verbLabel } from '/verb-words.js'
import { CAPABILITIES } from '/capabilities.js'
import { palette } from './palette.js'
import { actionsHtml, asksHtml, badgeHtml } from './added.js'
import { menu } from './menu.js'
import { gapBeside, isCut, lineWidth, roomOf } from './fit.js'

/**
 * @import { SideView } from './stats.js'
 * @import { Board, Card, Floor } from '../../src/bridge/board.ts'
 * @import { Attention } from '../../src/bridge/life.ts'
 * @import { Attended, Heed, Move } from '../../src/shared/cards.ts'
 * @import { BoardError, FromPage } from '../../src/shared/shelf-page.ts'
 * @import { KeyPress } from '../../src/shared/keymap.ts'
 * @import { Action, Added, AddedLine, Badge } from '../../src/shared/extensions.ts'
 * @import { HeadItem, Ranked } from '../../src/shared/adds.ts'
 * @import { MenuEntry, MenuItem } from './menu.js'
 * @import { Subject } from '../../src/shared/subjects.ts'
 * @import { BriefMarkdown } from '../../src/shared/brief.ts'
 * @import { Call } from '../../src/shared/api.ts'
 * @import { Viewer } from '../../src/shared/viewer.ts'
 * @import { StatsRange } from '../../src/shared/panels.ts'
 * @import { Executors, Handlers, Loop, StateEffect, TimerEffect } from '../../src/shared/loop.ts'
 * @import { AttendEffect, AttendEvent, Attending } from '../../src/shared/attend.ts'
 * @import { MainView } from './view.js'
 * @import { SpawnEvent, Spawning } from '../../src/shared/spawn.ts'
 * @import { Draft } from '../../extensions/drafts/client/drafts.ts'
 * @import { Pick } from '../../src/shared/palette.ts'
 * @import { Capability } from '../../src/shared/capabilities.ts'
 * @import { Offer } from '../../extensions/policies/policies.ts'
 * @import { BoardAsk } from '../../src/shared/extensions.ts'
 * @import { CommandKit, Placing } from '../../src/shared/views.ts'
 * @import { Layout, LayoutProblem, Overflow, Region, KitMember } from '../../src/shared/regions.ts'
 * @import { Openable } from '../../src/shared/palette.ts'
 */

document.head.append(Object.assign(document.createElement('style'), { textContent: panelsCss + settingsCss + itemsCss + briefCss + markdownCss + toastsCss }))
watchTips(document)

/** The policy's offer an ask is, when the policies extension asks it. @param {BoardAsk} a */
const offerOf = (a) => (a.cap === POLICIES ? board().floors.flatMap((f) => floorPolicies(f).offers).find((o) => offerAskKey(o) === a.key) : undefined)

/** The board drawn until the first arrives: one with nothing on it. */
const BLANK = /** @type {Board} */ (/** @type {unknown} */ ({ user: { name: 'user' }, keys: DEFAULT_KEYS, floors: [], waiting: [], offers: [], asks: [], adds: {}, rateLimits: [], probes: [], extensions: [], viewers: {}, hostUp: false, hostOutdated: false, claudeUntested: [], shells: [], termsUp: false }))
/** The floor a worker on the board is on. @param {string} id @returns {string | undefined} */
const projectOfCard = (id) => board().floors.find((f) => f.cards.some((c) => c.id === id))?.id
/** The board drawn, as the page's machine holds it. */
const board = () => page.state().board ?? BLANK
/** Whether a board has arrived. */
const opened = () => page.state().board !== undefined
/** When the tower stopped answering, while it doesn't: the page's times stand still there, as its board does. */
const lostAt = () => page.state().lostAt
const pageNow = () => lostAt() ?? Date.now()
/** What the main pane shows (`./view.js`), as the page's machine holds it. */
const view = () => page.state().view
/** The worker the main pane is on. */
const selected = () => cardIdOf(view())
/** The main pane's view while it is a `t`. @template {MainView['t']} T @param {T} t */
const viewing = (t) => {
  const v = view()
  return v.t === t ? /** @type {Extract<MainView, { t: T }>} */ (v) : undefined
}
/** Where the view `id` stands while the main pane mounts it (`located`). @param {string} id */
const at = (id) => located(view(), id)
/** What this viewer keeps in `tower.store` for every renderer of theirs, as the page's machine holds it. */
const viewer = () => page.state().viewer

/** @template {keyof Viewer} K @param {K} field @param {Viewer[K]} value */
const keepViewer = (field, value) => page.dispatch(/** @type {PageEvent} */ ({ type: 'keep', field, value }))

function render() {
  // Reads started while the page boots can answer before it has finished declaring itself; the first board draws it.
  if (!opened()) return
  const all = cards()
  const duty = all.filter(onDuty)
  /** @param {Attention} a */
  const count = (a) => duty.filter((c) => c.attention === a).length
  const waiting = heededWaits(board(), heed()).length
  const offered = heededAsks(board(), heed()).length
  document.title = waiting + offered ? `(${waiting + offered}) The Tower` : 'The Tower'
  paintOnce($('tally'), `<span class="chip waits ${loudest(waitsOnYou()) ?? 'quiet'} ${waiting ? 'some' : ''}" tabindex="0" data-tip="${esc(`${WAITING_NAME}: ${WAITING_MEANS}`)}"><span class="lamp"></span><b>${waiting}</b> ${WAITING_NAME}</span>` +
    (offered ? `<span class="chip offered some" tabindex="0" data-tip="${esc(withKeys("policies' slots offered and not yet started, and what extensions ask of you, that you haven't dismissed: the next waiting goes to them after the workers waiting on you", 'next-waiting'))}"><span class="lamp"></span><b>${offered}</b> offered</span>` : '') +
    /** @type {Attention[]} */ (['needs', 'ready', 'working', 'quiet', 'broken'])
      .map((a) => `<span class="chip ${a}" tabindex="0" data-tip="${esc(`${ATTENTION_NAME[a]}: ${ATTENTION_MEANS[a]}\n\n${ON_DUTY_MEANS}`)}"><span class="lamp"></span><b>${count(a)}</b> ${ATTENTION_NAME[a]}</span>`).join(''))
  const host = lostAt() ? 'unknown' : hostState(board())
  paintOnce($('host'), `<span class="host-state ${HOST_ATTENTION[host]}" tabindex="0" data-tip="${esc(HOST_MEANS[host])}"><span class="lamp"></span>${HOST_NAME[host]}</span>`)
  paintStrip()
  $('notes').innerHTML = `${claudeUntestedHtml(board()) ?? ''}${layoutNoteHtml()}${asksHtml(board(), heededAsks(board(), heed()).filter((a) => !projectOfKey(board(), a.subject)), pageNow())}`
  paintKeys()
  paintLimits()
  const floors = $('floors')
  // The selected worker's row stays where a move or a click left it while in sight, so a move key's target stays in view.
  const anchor = sightAnchorOf(floors, selected()) ?? topAnchorOf(floors)
  keepingFocus(floors, () => {
    floors.innerHTML = floorsTopDown().map(floorHtml).join('')
    floorTrays.place(floors)
    holdRow(floors, anchor)
  })
  drawSideView()
  repaint($('rail'), railHtml(waiting))
  $('side-foot').innerHTML = board().config ? `<span>config</span><code data-tip="${esc(board().config)}"><bdi>${esc(board().config)}</bdi></code>${fileButtonsHtml(board().config)}` : ''
  mainRegion.update()
  renderDock()
  drawSettings()
  tick()
}

function tick() {
  paintTip()
  paintLimits()
  for (const el of document.querySelectorAll('[data-since]')) el.textContent = ago(pageNow() - Number(el.dataset.since))
}

/**
 * The page's machine: the board drawn, why there is none live and since when the tower is lost, the viewer's record,
 * what the main pane shows, what the viewer is told about waits and offers (`/attend.js`, which also holds whether the
 * window has their eye and the worker the view is on, told by the `focus`, `visible` and `watch` events) and the waits
 * and offers N visited this round (`Heed` in cards.ts), and the workers it started that the board doesn't carry yet
 * (`started`), which it waits for as they arrive, and the viewer's own layout of this renderer's regions as `tower.store`
 * keeps it (`layout`). The view and the rings follow one selection because every handler that sets `view` does it
 * through `viewed`, which tells attention.
 * @typedef {{ board: Board | undefined, error: BoardError | undefined, lostAt: number | undefined, viewer: Viewer, layout: Layout | undefined, view: MainView, attending: Attending, visited: ReadonlySet<string>, started: ReadonlySet<string> }} PageState
 * @typedef {{ [K in keyof Viewer]: { type: 'keep', field: K, value: Viewer[K] } }[keyof Viewer]} ViewerKept
 * @typedef {AttendEvent | { type: 'stored', viewer: Viewer } | { type: 'laid-out', layout: Layout | undefined } | ViewerKept | { type: 'board-error', error: BoardError, at: number } | { type: 'next-waiting' }
 *   | { type: 'go', view: MainView } | { type: 'reopen', view: MainView } | { type: 'started', id: string } | { type: 'followed', location: import('../../src/shared/views.ts').Location }} PageEvent
 * @typedef {Exclude<AttendEffect, StateEffect<Attending>> | ViewerKept | StateEffect<PageState> | TimerEffect<PageEvent>
 *   | { type: 'leave', view: MainView } | { type: 'enter', view: MainView } | { type: 'hash', hash: string } | { type: 'draw' }
 *   | { type: 'attend-to', to: Attended } | { type: 'toast', message: string }} PageEffect
 */

/** The workers started here that `b` doesn't carry yet. @param {ReadonlySet<string>} started @param {Board} b */
const arrived = (started, b) => (started.size ? new Set([...started].filter((id) => !b.floors.some((f) => f.cards.some((c) => c.id === id)))) : started)

/** @param {PageState} s @returns {Heed} */
const heedOf = (s) => ({ dismissed: s.attending.dismissed, visited: s.visited })
const heed = () => heedOf(page.state())

/** @param {PageState} s */
const watchedOf = (s) => watchedIn(s.attending)

/** @param {PageState} s @returns {PageEffect} */
const into = (s) => ({ type: 'state', state: s })

/** Attention's step, what it keeps for the viewer kept in the viewer's record too. @param {PageState} s @param {AttendEvent} e @returns {PageEffect[]} */
const attend = (s, e) => {
  const [attending, effects] = attendNext(s.attending, e)
  const viewer = effects.reduce((v, f) => (f.type === 'keep' ? { ...v, [f.field]: f.value } : v), s.viewer)
  return [into({ ...s, attending, viewer }), ...effects]
}

/** Runs `steps` one after the other, each on the state the one before left, their effects in order. @param {PageState} s @param {((s: PageState) => PageEffect[])[]} steps @returns {PageEffect[]} */
const chain = (s, steps) => {
  let at = s
  /** @type {PageEffect[]} */
  const out = []
  for (const step of steps) for (const f of step(at)) f.type === 'state' ? (at = f.state) : out.push(f)
  return [into(at), ...out]
}

/** The tower lost or back: attention hears of it only as it changes. @param {PageState} s @param {boolean} lost @param {number} at @returns {PageEffect[]} */
const marked = (s, lost, at) => lost === (s.lostAt !== undefined) ? [into(s)] : attend({ ...s, lostAt: lost ? at : undefined }, { type: 'lost', lost })

/** Leaves the view open for `view` and enters it, its hash in the address bar. @param {PageState} s @param {MainView} view @returns {PageEffect[]} */
const moved = (s, view) => viewed(s, view, [{ type: 'leave', view: s.view }, { type: 'enter', view }, { type: 'hash', hash: hashOf(view, s.board ?? BLANK) }, { type: 'draw' }])

/** The one way a handler sets `view`: attention hears of the worker the view is on, then `effects` follow. @param {PageState} s @param {MainView} view @param {PageEffect[]} effects @returns {PageEffect[]} */
const viewed = (s, view, effects) =>
  chain({ ...s, view }, [(s) => attend(s, { type: 'watch', at: cardIdOf(s.view) }), () => effects])

/** @type {Handlers<PageState, PageEvent, PageEffect>} */
const pageHandlers = {
  board: (s, e) => chain({ ...s, board: e.board, error: undefined, started: arrived(s.started, e.board) }, [(s) => marked(s, false, 0), (s) => attend(s, e)]),
  'board-error': (s, { error, at }) => marked({ ...s, error }, error.code === 'disconnected', at),
  lost: attend,
  stored: (s, e) => attend({ ...s, viewer: { ...s.viewer, ...e.viewer } }, e),
  'laid-out': (s, { layout }) => [into({ ...s, layout })],
  keep: (s, e) => [into({ ...s, viewer: { ...s.viewer, [e.field]: e.value } }), e],
  started: (s, { id }) => [into({ ...s, started: new Set([...s.started, id]) })],
  'next-waiting': (s) => {
    const attended = attentionOrder(s.board ?? BLANK, heedOf(s))
    const step = nextAttended(attended, s.visited, { id: cardIdOf(s.view), policies: located(s.view, POLICIES_VIEW)?.project })
    return [into({ ...s, visited: step.visited }), step.to ? { type: 'attend-to', to: step.to } : { type: 'toast', message: attended.length ? 'Nobody else is waiting on you' : 'Nobody is waiting on you' }]
  },
  dismiss: attend,
  ring: attend,
  remind: attend,
  focus: attend,
  visible: attend,
  watch: attend,
  go: (s, { view }) => (sameRoom(s.view, view) ? viewed(s, view, [{ type: 'hash', hash: hashOf(view, s.board ?? BLANK) }, { type: 'draw' }]) : moved(s, view)),
  reopen: (s, { view }) => moved(s, view),
  followed: (s, { location }) => {
    if (s.view.t !== 'view') return []
    const view = /** @type {MainView} */ ({ t: 'view', location })
    return viewed(s, view, [{ type: 'hash', hash: hashOf(view, s.board ?? BLANK) }, { type: 'draw' }])
  },
}

/** @type {Loop<PageState, PageEvent>} */
const page = loop({
  state: { board: undefined, error: undefined, lostAt: undefined, viewer: await readViewer(tower.store.get), layout: undefined, view: HOME, attending: attending({ focused: document.hasFocus(), visible: document.visibilityState === 'visible' }), visited: new Set(), started: new Set() },
  handlers: pageHandlers,
  execute: {
    .../** @type {Executors<TimerEffect<PageEvent>, PageEvent>} */ (timers()),
    announce: ({ text }) => announce(text),
    notify: ({ attended: a }) => {
      if (Notification.permission === 'granted') alerts.set(a.key, isAsk(a) ? (offerOf(a) ? showOfferAlert(/** @type {Offer} */ (offerOf(a))) : showAskAlert(a)) : isOffer(a) ? showOfferAlert(a) : showAlert(/** @type {Card} */ (findCard(a.id)), a))
    },
    unnotify: ({ key }) => (alerts.get(key)?.close(), alerts.delete(key)),
    sound: ({ sound }) => playSound(SOUNDS[sound]),
    keep: ({ field, value }) => tower.store.set(VIEWER_KEYS[field], value),
    'attend-to': ({ to }) => (isOffer(to) ? openPolicies(to.project) : isAsk(to) ? (offerOf(to) ? openPolicies(/** @type {Offer} */ (offerOf(to)).project) : goToSubject(to.subject)) : moveTo(to.id)),
    toast: ({ message }) => toast(message),
    leave: ({ view: v }) => {
      $('main').classList.remove(mainClass(v))
      LEAVE[v.t]()
    },
    enter: ({ view: v }) => {
      closeDrawer()
      $('main').classList.add(mainClass(v))
      if (v.t === 'view') {
        $('view-host').style.cssText = floorPaint(v)
      }
      /** @type {(v: MainView) => void} */ (ENTER[v.t])(v)
    },
    hash: ({ hash }) => location.hash !== hash && history.replaceState(null, '', hash || location.pathname),
    draw: () => render(),
  },
})
/** The main pane goes to `view`: the view open is left, unless `view` is the same place, and `view` entered. @param {MainView} view */
const go = (view) => page.dispatch({ type: 'go', view })
/** The main pane opens `view` afresh, even where it already is. @param {MainView} view */
const reopen = (view) => page.dispatch({ type: 'reopen', view })

/** @param {string} id */
const select = (id) => go(cardView(id))

/** A worker's view on its default tab. @param {string} id @returns {MainView} */
const cardView = (id) => ({ t: 'view', location: { view: WORKER, subject: `card:${id}` } })

const goHome = () => go(HOME)

/**
 * A session the page started, opened once the board carries it: the host answers before the tower has read the new
 * log, and until then there is no card to draw and no screen to stream. Any other way the viewer goes cancels it.
 * @param {string} id
 */
const selectArriving = (id) => (page.dispatch({ type: 'started', id }), go(findCard(id) ? cardView(id) : { t: 'arriving', id }))

/** The worker view. */
const WORKER = 'tower/card'

/**
 * The viewer's appearance, kept by tower.js in this browser for every page of theirs, on the root that the stylesheet
 * reads; terminals, the framed documents, the open shelf page and the settings follow it whenever it changes.
 */
const scheme = tower.scheme

page.dispatch({ type: 'stored', viewer: viewer() })

const { callsign, cards, paint, waitsOnYou, floorsTopDown, letGoHtml, unresumableHtml, heldWhy, heldHtml, withKeys, floorOf } = boardKit({ findCard: (id) => findCard(id), board, heed, lostAt })

/** The colour of the floor `v` is on, for the element it draws in. @param {MainView} v @returns {string} */
const floorPaint = (v) => paint(floorOfView(v, projectOfCard))

const { findCard, freshArchives, lookUp, hold } = archive({ cards, board, floorOf, render })

/** The views the page opens by name: a floor's archive and policies, a shelf entry. */
const ARCHIVE_VIEW = 'tower/archive'
const POLICIES_VIEW = 'policies/policies'
const SHELF_VIEW = 'tower/shelf'

/** A floor's past workers in the main pane. @param {string} project */
const openArchive = (project) => goTo({ view: ARCHIVE_VIEW, subject: `floor:${project}` })
/** A floor's policies in the main pane. @param {string} project */
const openPolicies = (project) => goTo({ view: POLICIES_VIEW, subject: `floor:${project}` })
/** A floor's shelf entry in the main pane, on the file of it shown last while it stays open. @param {string} project @param {number} n */
const openShelf = (project, n) => {
  const open = at(SHELF_VIEW)
  const args = open && open.project === project && open.name === String(n) ? /** @type {Extract<MainView, { t: 'view' }>} */ (view()).location.args : undefined
  goTo({ view: SHELF_VIEW, subject: `shelf:${project}/${n}`, ...(args && { args }) })
}

let redrawPalette = () => {}

const { draftIo, draftTitle, pruneDraftTitles, openDraft, spawnOn, deleteSent } = draft({ render: () => (render(), redrawPalette()), board, goTo: (location) => goTo(location), openSpawn: (project, sent) => openSpawn(project, sent) })

const { showLanding, showKeys, ask } = dialogs({ board })



const { alerts, playSound, showShownAlert, showOfferAlert, showAskAlert, showAlert } = alerting({ callsign, select, openShown: (c, s) => display(shownSubject(c, s)), floorOf, board, openPolicies, goToSubject: (key) => goToSubject(key) })

const { drawSettings } = settingsPane({ page, viewer, playSound })

const { floorInView, drawSideView, sideView } = await stats({ view, findCard, floorsTopDown, board, viewer, lostAt })

const { showMode, termFont, applyTermFont, leaveTerminal } = screen({ board, refont: () => (mainRegion.refont(), refontShell()) })

const { shellFloor, renderDock, refontShell, reschemeShell, toggleShell, spawnShell, spawnShellAt, focusShell, focusedShell, openShellId, closeShell } = shells({ board, floorInView, paint, floorOf, termFont, scheme, run, showMode })
const { paintTip } = tipStrip({ viewer, keys: () => board().keys, now: pageNow })



/** The showings this viewer closed, by `session|target|at`, kept in `tower.store`. */
const UNSHOWN_KEY = 'shown.closed'
const unshown = new Set(/** @type {string[] | undefined} */ (await tower.store.get(UNSHOWN_KEY)) ?? [])

/** A showing closed by this viewer: its tab goes, and comes back if shown again. @param {string} key */
function unshow(key) {
  unshown.add(key)
  tower.store.set(UNSHOWN_KEY, [...unshown].slice(-200))
  render()
}

/** Every showing the page has seen: a new one opens its tab on the worker open, and alerts when you aren't looking at it. @type {Set<string>} */
const seenShown = new Set()
let shownPrimed = false

/** @param {Card[]} all */
function noticeShown(all) {
  for (const c of all) for (const s of c.shown.filter((s) => !unshown.has(shownKey(s)))) {
    const key = shownKey(s)
    if (seenShown.has(key)) continue
    seenShown.add(key)
    if (!shownPrimed) continue
    if (selected() === c.id) display(shownSubject(c, s))
    if (watchedOf(page.state()) !== c.id && Notification.permission === 'granted') showShownAlert(c, s)
  }
  shownPrimed = true
}

const { toggleSection, toggleCrewFold, forgetFold, toggleFloor, floorHtml, paintLimits, railHtml, paintKeys, closeDrawer, toggleSide } = await sidebar({ render, selected, callsign, heldWhy, heldHtml, letGoHtml, unresumableHtml, board, pageNow, floorOf, paint, viewer, keepViewer, findCard, at, trayRowsHtml: (f) => trayRowsHtml(f), heed, withKeys, opensHtml: (subject) => opensHtml(subject), holdsOf: (region) => placing().regions.find((r) => r.id === region)?.holds ?? [], regionLayout: (region) => { const p = placing(); return { region: p.regions.find((r) => r.id === region), entry: p.layout[region] } } })


/** A floor in the sidebar: shown, unfolded and scrolled to, its name focused. @param {string} project */
function goToFloor(project) {
  if (document.body.classList.contains('collapsed')) toggleSide()
  const fold = () => /** @type {HTMLElement | null} */ ($('floors').querySelector(`[data-floor-fold="${CSS.escape(project)}"]`))
  if (fold()?.getAttribute('aria-expanded') === 'false') toggleFloor(project)
  fold()?.scrollIntoView({ block: 'start' })
  fold()?.focus()
}

/**
 * Runs what a palette entry does (`/palette.js`) through the handlers its buttons and keys run; `row` is the entry's
 * row, busy while a request it makes is in flight.
 * @param {Pick} does @param {HTMLElement} row
 */
function doPick(does, row) {
  if (does.t === 'command') return void run(does.id, { repeat: false })
  if (does.t === 'patterns') return void showPatterns()
  if (does.t === 'learn') return learnPick(does.id)
  if (does.t === 'added') return void runAddedAt(row, does)
  if (does.t === 'open') return display(does.subject, { view: does.view })
  if (does.t === 'go') {
    const to = does.target
    if (to.t === 'worker') return moveTo(to.id)
    if (to.t === 'floor') return goToFloor(to.project)
    if (to.t === 'draft') return void openDraft(to.project, to.id)
    const entry = /** @type {Floor} */ (floorOf(to.project)).shelf?.[to.n]
    return entry && 'link' in entry ? void window.open(entry.link, '_blank', 'noreferrer') : openShelf(to.project, to.n)
  }
  if (does.subject === 'floor') {
    const f = /** @type {Floor} */ (floorOf(does.project))
    if (does.verb === 'spawn' || does.verb === 'cut') return openSpawn(f.id)
    if (does.verb === 'shell') return void spawnShellAt(f.id, f.hub)
    if (does.verb === 'editor') return void openInEditor(row, f, f.hub)
    return void tidyAll(row, f)
  }
  const c = findCard(does.id)
  if (!c) return toast('That worker is no longer on the board')
  if (does.subject === 'resource') {
    const r = c.resources.find((r) => r.pid === does.pid)
    const call = r && callOf(r, 'reap')
    return call ? void told(pressing(row, () => tower.run(call))) : toast(noLongerOffered(`process ${does.pid}`, 'reap'))
  }
  if (does.subject === 'conversation') {
    const conv = c.conversations.find((v) => v.id === does.conversation)
    const call = conv && callOf(conv, 'resume')
    if (does.verb === 'goto' && conv?.resumedBy) return moveTo(conv.resumedBy.id)
    return call ? void resume(row, call) : toast(noLongerOffered(c.callsign, does.verb))
  }
  const verb = does.verb
  if (verb === 'resume' || verb === 'carry-on') {
    const call = callOf(c, verb)
    return call ? void resume(row, call) : toast(noLongerOffered(c.callsign, verb))
  }
  if (verb === 'goto') {
    const to = c.conversations.at(-1)?.resumedBy
    return to ? moveTo(to.id) : toast(noLongerOffered(c.callsign, verb))
  }
  if (verb === 'reap') return void reapAll(row, c)
  if (verb === 'let-go') return void letGo(row, c)
  if (verb === 'send-home') return void sendHome(row, c)
}

/** A capability shown: its words, with the verb it names on the selected worker's floor when that floor offers it. @param {string} id */
function learnPick(id) {
  const capability = /** @type {Capability} */ (CAPABILITIES.find((k) => k.id === id))
  const floor = capability.verb && floorOf(findCard(selected())?.project ?? '')
  const verb = capability.verb
  const action = floor && verb && can(floor, verb) ? { label: verbLabel('floor', verb), run: () => doPick({ t: 'action', subject: 'floor', verb, project: floor.id }, $('palette-input')) } : undefined
  toast(capability.text.replace(/`/g, ''), action)
}

const { openPalette, redraw, showPatterns } = await palette({ board, selected, draftTitle, heed, pick: doPick, opens: () => opensHere() })
redrawPalette = redraw

/** This renderer's name, from the path it is served at: `/r/<name>/`. */
const renderers = await tower.get('renderers')
/** This renderer's name: from the path it is served at, `/r/<name>/`, else the config's default, which `/` serves. */
const RENDERER = /^\/r\/([^/]+)\//.exec(location.pathname)?.[1] ?? renderers.default
/** What this renderer declares in its `renderer.json` and the config's layout for it, as `GET /renderers` serves them. */
const declared = /** @type {import('../../src/shared/model.ts').Renderer} */ (renderers.renderers.find((r) => r.name === RENDERER))
/** Where `tower.store` keeps the viewer's own layout of this renderer's regions. */
const LAYOUT_KEY = `layout.${RENDERER}`
/** What is wrong with the config's layout for this renderer, against the regions it and the extensions that would start declare. */
const LAYOUT_PROBLEMS = declared.layoutProblems ?? []
/** Whether `problem` is about the config's layout of region `id`: its key names one of that region's fields. @param {LayoutProblem} problem @param {string} id */
const problemOf = (problem, id) => {
  const at = `renderers.${RENDERER}.layout.${id}.`
  return problem.key.startsWith(at) && !problem.key.slice(at.length).includes('.')
}
/** The regions whose layout in the config fails its check: each is drawn by its default, as the check says. */
const LAYOUT_FAILED = Object.keys(declared.configLayout).filter((id) => LAYOUT_PROBLEMS.some((p) => p.level === 'fail' && problemOf(p, id)))
/** The config's layout for this renderer, less the regions whose layout fails its check. */
const CONFIG_LAYOUT = Object.fromEntries(Object.entries(declared.configLayout).filter(([id]) => !LAYOUT_FAILED.includes(id)))
/**
 * The config's layout problems for this renderer, on the board: the regions drawn by their default when any fails, else
 * how many warnings, each problem in the tip as `tower config check` lists it.
 */
const layoutNoteHtml = () => {
  if (!LAYOUT_PROBLEMS.length) return ''
  const line = LAYOUT_FAILED.length
    ? `${LAYOUT_FAILED.join(', ')} drawn by default: the config's layout of ${LAYOUT_FAILED.length === 1 ? 'it' : 'them'} fails its check`
    : `the config's layout for ${RENDERER}: ${plural(LAYOUT_PROBLEMS.length, 'warning')}`
  const tip = [...LAYOUT_PROBLEMS.map((p) => `${p.level} · ${p.key}: ${p.problem}`), 'tower config check lists the same'].join('\n')
  return `<span class="layout-problems" tabindex="0" data-tip="${esc(tip)}">${esc(line)}</span>`
}
/** The layout the page draws by: the renderer's own, under the config's, under the viewer's (`layoutOf`). */
const layout = () => layoutOf(declaredLayout(board(), declared.layout ?? {}), CONFIG_LAYOUT, page.state().layout)
const KIT = /** @type {readonly KitMember[]} */ (declared.kit ?? [])
const MAIN = /** @type {Region} */ ((declared.regions ?? []).find((r) => r.id === 'board.main'))

/** What display reads to place a subject: the board, every view, the regions this renderer and the views declare. @returns {Placing} */
const placing = () => ({
  board: board(),
  views: viewsOf(board()),
  regions: [...(declared.regions ?? []), ...board().extensions.filter((e) => e.state === 'started').flatMap((e) => e.regions)],
  layout: layout(),
  kit: KIT,
  main: MAIN,
})

/** The subject the main pane is on. @param {MainView} v @returns {string} */
const subjectKeyOf = (v) => (v.t === 'arriving' ? 'board' : v.location.subject ?? 'board')

/** The page's viewer subjects: what its views drew that the board never carries (decision `ui-model`). */
const bus = busOf()

/**
 * A subject by its key: the board's, else one the page's views published on its bus (a brief's prompt, a document's
 * section), else one of a read the page holds, a worker of an archive (decision `ui-model`: viewer and read subjects).
 * @param {string} key @returns {Subject | undefined}
 */
function subjectOf(key) {
  const onBoard = subjectAt(board(), key) ?? bus.at(key)
  if (onBoard || !key.startsWith('card:')) return onBoard
  const c = findCard(key.slice('card:'.length))
  return c && cardSubject(c)
}

/** Whether the page holds the subject `key` names. @param {string} key */
const has = (key) => subjectOf(key) !== undefined

/**
 * The subject in focus: that of the innermost region holding the document's focus, else the main pane's; the board
 * when what either names has left it.
 */
function focusedSubject() {
  const region = /** @type {HTMLElement | null | undefined} */ (document.activeElement?.closest('[data-region]'))
  const key = region?.dataset.subject ?? subjectKeyOf(view())
  return subjectOf(key) ?? boardSubject(board())
}

/**
 * Shows `target`, a subject or its key, where the layout puts it (`displayed`, `/views.js`): a view given stays when
 * it is the one mounted and takes it, on that subject when it is on its kind; a subject below the one the view at its
 * location is on is handed to that view (a worker's showing, conversation or lines open its tab). A worker handed whole
 * is held as a read; one the page doesn't hold is looked up in the floors' archives, or awaited when the page started it.
 * @param {Subject | string} target @param {{ view?: string }} [opts]
 */
function display(target, opts = {}) {
  if (typeof target !== 'string' && target.kind === 'card' && !subjectAt(board(), target.key)) hold(/** @type {Card} */ (target.value))
  const subject = typeof target === 'string' ? subjectOf(target) : target
  if (!subject && typeof target === 'string' && target.startsWith('card:')) return void awaitCard(target.slice('card:'.length))
  if (!subject) return toast(`${target} is no longer on the board`)
  const { view: given } = opts
  const mounted = viewing('view')?.location
  if (given && mounted?.view === given && mainRegion.show(subject)) {
    const view = /** @type {import('../../src/shared/views.ts').View} */ (viewsOf(board()).find((v) => v.id === given))
    if (subject.key !== (mounted.subject ?? 'board') && viewOn(view.on, subject)) page.dispatch({ type: 'followed', location: { view: given, subject: subject.key } })
    return
  }
  const at = displayed(placing(), subject, given)
  if (!at) return toast(given ? `${viewsOf(board()).find((v) => v.id === given)?.words.label ?? given} isn't offered on ${subject.key}` : `Nothing here shows ${subject.key}`)
  const next = mainViewOf(at, has)
  if (next.t === 'lookup') return toast(`${subject.key} is no longer on the board`)
  go(next)
  if (subject.key !== (at.subject ?? 'board') && !mainRegion.show(subject)) toast(`${subject.key} isn't there any more`)
}

/**
 * A worker the board doesn't carry: one this page started, opened once the board carries it; else one of an archive,
 * read first; else it is gone.
 * @param {string} id
 */
async function awaitCard(id) {
  if (page.state().started.has(id)) return go({ t: 'arriving', id })
  if (await lookUp(id)) return go(cardView(id))
  toast(`card:${id} is no longer on the board`)
}

/**
 * Runs an extension's command or view by its id, `<cap>/<name>`, on `subject`: a view displays it with that view; a
 * command runs on the nearest subject up its chain of a kind the command is on, the board for one on none. Returns
 * whether something ran.
 * @param {string} id @param {Subject} subject
 */
function runAddedId(id, subject) {
  if (viewsOf(board()).some((v) => v.id === id)) return (display(subject, { view: id }), true)
  const cap = id.slice(0, id.indexOf('/'))
  const name = id.slice(cap.length + 1)
  const command = board().extensions.find((e) => e.provides === cap && e.state === 'started')?.commands.find((c) => c.name === name)
  if (!command) return false
  /** @type {(s: Subject | undefined) => Subject | undefined} */
  const on = (s) => (!command.on ? boardSubject(board()) : !s ? undefined : command.on.includes(s.kind) || (s.kind.startsWith('item.') && command.on.includes('item.*')) ? s : on(subjectAt(board(), parentOf(s) ?? '')))
  const target = on(subject)
  if (!target) return (toast(`${command.words.label} isn't offered on ${subject.key}`), true)
  markSeen([id])
  void told(runCommandWith(board(), { command: name, cap }, target, commandKit))
  return true
}

/** What the page lends a command it runs, and the rest of what it lends a view. @type {CommandKit} */
const commandKit = {
  display: (subject, opts) => display(subject, opts),
  toast: (text, action) => toast(text, action),
  notice: (text, action) => notice(text, action),
  bus,
  confirm: (text, verb) => ask(text, verb),
  run: async (command, on) => (isAddedId(command) ? runAddedId(command, on ?? focusedSubject()) : command === 'spawn' ? spawnIn(on ?? focusedSubject()) : run(command, { repeat: false })),
}

/** The slot of `el` marked to hold `name` (`data-holds`), in the view `el` is in. @param {HTMLElement} el @param {string} name */
const slotIn = (el, name) => /** @type {HTMLElement | undefined} */ ([...el.querySelectorAll(`[data-holds~="${name}"]`)].find((s) => s.closest('[data-view]') === el.closest('[data-view]')))

/** Dismiss, beside a worker's status while it waits on you and you heed it. @param {string} key */
function dismissHtml(key) {
  const wait = key.startsWith('card:') && heededWaits(board(), heed()).find((w) => `card:${w.id}` === key)
  return wait ? `<button class="dismiss" data-dismiss="${esc(wait.key)}" data-tip="${DISMISS_TITLE}">dismiss</button>` : ''
}

/**
 * What the viewer has seen of what extensions offer: their record's `seen`, or all that is offered while nothing was
 * ever kept there (decision `region-overflow`).
 * @param {readonly string[]} offered
 */
const seenAmong = (offered) => seenOf(viewer().seen, offered)

/** The writes of `seen` this window has in flight, one after another. */
let seeing = Promise.resolve()

/**
 * The actions `ids` seen by the viewer, kept when any of them was new to them. `seen` is read from `tower.store` just
 * before it is written, since another window of theirs may have added to it since this one last read it.
 * @param {string[]} ids
 */
function markSeen(ids) {
  if (!ids.length) return
  seeing = seeing.then(async () => {
    const offered = offeredIds(board())
    const had = seenOf((await readViewer(tower.store.get)).seen, offered)
    const next = sawAll(had, ids.filter((id) => isFresh(offered, had, id)))
    if (next) keepViewer('seen', next)
  })
}

/** What a region draws among its badges and never tucks, marked so: a worker's Dismiss and its exemptions. @param {string} dismiss @param {Added<Badge>[]} exemptions */
const keptHtml = (dismiss, exemptions) => (dismiss || exemptions.length ? `<span class="region-keep" data-keep>${dismiss}${exemptions.map(badgeHtml).join('')}</span>` : '')

/** An extension's line on a worker. @param {AddedLine} line */
const lineHtml = (line) => `<span class="adds-line" data-tip="${esc(line.text)}">${esc(line.text)}</span>`

/** Whether `el` can be seen now, or the nearest element holding it that has a box can: a `display: contents` slot has none. @param {Element} el @returns {boolean} */
const isDrawn = (el) => (getComputedStyle(el).display === 'contents' && el.parentElement ? isDrawn(el.parentElement) : el.checkVisibility({ visibilityProperty: true }))

/**
 * A region of contributions as each frame reads it: `prepare` writes what must be drawn before it is measured, `read`
 * reads it and answers the write that follows, which answers the actions new to the viewer it drew in place while the
 * window has focus; `remeasure` forgets what it measured, its room or the type having changed, and reads it next frame.
 * @typedef {{ prepare(): void, read(): (focused: boolean) => string[], remeasure(): void }} PlacedRegion
 */

/** The regions of contributions mounted now. @type {Set<PlacedRegion>} */
const placedRegions = new Set()
/** The regions drawn since the last frame. @type {Set<PlacedRegion>} */
const unread = new Set()
let reading = 0

/** Reads `region` in the next frame, with every other region drawn meanwhile. @param {PlacedRegion} region */
const readNext = (region) => {
  unread.add(region)
  reading ||= requestAnimationFrame(readAll)
}

/**
 * One frame's pass over the regions drawn since the last: every region prepared, then read, then written, so many
 * regions cost two layouts at most. An action new to the viewer that a region draws in place while the window has focus
 * is seen (decision `region-overflow`).
 */
function readAll() {
  reading = 0
  const regions = [...unread]
  unread.clear()
  regions.forEach((r) => r.prepare())
  const writes = regions.map((r) => r.read())
  const focused = document.hasFocus()
  markSeen(writes.flatMap((write) => write(focused)))
}

/** The inline size each measured row was last seen at, so its own height changing as it tucks is no reason to fit again. @type {WeakMap<Element, number>} */
const widthSeen = new WeakMap()
/** The region each measured row is the row of. @type {WeakMap<Element, PlacedRegion>} */
const rowOf = new WeakMap()
/** A region measured by its row's width fits again in the next frame once that width changes: the room it has did. */
const resized = new ResizeObserver((entries) => {
  for (const { target, contentBoxSize } of entries) {
    const width = contentBoxSize[0].inlineSize
    if (widthSeen.get(target) === width) continue
    widthSeen.set(target, width)
    rowOf.get(target)?.remeasure()
  }
})

/** The px a region must have to spare before it draws one more item in place, so a region at its edge doesn't flicker. */
const FIT_MARGIN = 24

/** A subject by the name the page shows it by: a worker's callsign. @param {Subject} s */
const subjectName = (s) => (s.kind === 'card' ? /** @type {Card} */ (s.value).callsign : s.key)

/** Whether a badge is one that asks for attention. @param {Added<Badge>} b */
const isSevere = (b) => b.tone === 'broken' || b.tone === 'needs'

/** `label` with its first letter up, as a menu lists it. @param {string} label */
const capitalized = (label) => label.replace(/^./, (l) => l.toUpperCase())

/**
 * A form a region of contributions is drawn in (decision `region-overflow`): `actionsAt`, where its action buttons are;
 * `paint`, each hold's html in its place, written only where it changed; the frame's `prepare` and `read`, as for a
 * `PlacedRegion`, `read`'s write answering the action buttons drawn in place; `remeasure`; `close`, the form undone.
 * @typedef {{ name: Overflow, actionsAt: HTMLElement, paint(parts: { badges: string, lines: string, actions: string }): void, prepare(): void, read(): () => HTMLElement[], remeasure(): void, close(): void }} RegionForm
 */

/** Writes html into elements, each only when it differs from what this writer last wrote there. */
const writer = () => {
  /** @type {Map<Element, string>} */
  const wrote = new Map()
  return (/** @type {Element} */ to, /** @type {string} */ html) => wrote.get(to) !== html && (wrote.set(to, html), (to.innerHTML = html), true)
}

/**
 * One of the page's regions inside a view that holds what extensions add, on `subject`: drawn the page's way, its
 * badges, lines and actions as its holds say, each in the element marked to hold it (`data-holds="badges"`, `lines`,
 * `actions`) when `el` has one, else together in `el`; their presses run by the page's own clicks. Its badges come by
 * severity and its actions and lines in the layout's order (`rankedBadges`, `rankedActions`, `rankedLines`), less the
 * commands its options `omit` (`<cap>/<name>`). A worker's head holds the page's own Dismiss beside its badges, with
 * its exemptions, both kept (`data-keep`). An action new to the viewer carries a dot; once it has been drawn in place in
 * a focused window it is seen, and the region keeps its dot until its view is hidden or it closes. It is drawn in the
 * form its layout picks among those the region offers: `wrap` (`drawWrap`), else `menu` (`drawMenu`).
 * @param {HTMLElement} el @param {string} id @param {Subject} subject @param {{ omit?: string[] }} options
 * @returns {import('../../src/shared/views.ts').RegionHandle}
 */
function kitRegion(el, id, subject, options) {
  let at = subject
  let omit = options.omit ?? []
  const declared = () => placing().regions.find((r) => r.id === id)
  const holds = declared()?.holds ?? []
  const actions = holds.includes('verbs') || holds.includes('commands')
  const slots = { badges: slotIn(el, 'badges'), lines: slotIn(el, 'lines'), actions: slotIn(el, 'actions') }
  const marked = Object.values(slots).filter((s) => s !== undefined)
  /** The actions as the last draw ranked them, one button each in the form's `actionsAt`. @type {Ranked[]} */
  let ranked = []
  /** The badges as the last draw ranked them. @type {Added<Badge>[]} */
  let badges = []
  /** The actions this region drew with a dot that the viewer has seen since: their dot stays until the region is hidden. @type {Set<string>} */
  const dotted = new Set()
  /** @param {HTMLElement} at @param {Subject} s */
  const mark = (at, s) => ((at.dataset.region = id), (at.dataset.subject = s.key), regionSubjects.set(at, s))
  /** @param {Subject} s */
  const shownActions = (s) => addedActions(board(), s).filter((a) => !(isCommand(a) && omit.includes(`${a.cap}/${a.command}`)))
  /** The form the layout picks: the region's default when the viewer's pick is one it no longer offers, `wrap` where it offers none. @returns {Overflow} */
  const formName = () => {
    const r = declared()
    return r?.overflows?.length ? overflowOf(/** @type {Region & { overflows: Overflow[] }} */ (r), layout()[id]) : 'wrap'
  }
  /** The buttons of the ranked actions, in their order. */
  const actionEls = () => /** @type {HTMLElement[]} */ ([...form.actionsAt.querySelectorAll(':scope > [data-added]')])
  /** Whether the action ranked `r` carries the dot. @param {Ranked} r @param {readonly string[]} offered @param {readonly string[]} had */
  const dotOn = (r, offered, had) => dotted.has(r.id) || isFresh(offered, had, r.id)
  /** Each action's dot, on while it is new to the viewer or the region keeps it. */
  const dot = () => {
    const offered = offeredIds(board())
    const had = seenAmong(offered)
    actionEls().forEach((b, n) => {
      const on = dotOn(ranked[n], offered, had)
      b.classList.toggle('fresh', on)
      if (on) b.setAttribute('aria-description', 'new')
      else b.removeAttribute('aria-description')
    })
  }
  const hide = () => (dotted.clear(), dot())
  /** Each hold's html written in its place: `into` names the element a slot's html goes in. @param {(html: string, slot: HTMLElement, name: string) => void} into @param {{ badges: string, lines: string, actions: string }} parts */
  const paintParts = (into, parts) => {
    if (!marked.length) return into(`${parts.badges}${parts.actions}`, el, 'actions')
    for (const [name, slot] of Object.entries(slots)) if (slot) into(parts[/** @type {keyof typeof parts} */ (name)], slot, name)
  }

  /** The `wrap` form: every item drawn in place, the region growing as they wrap. @returns {RegionForm} */
  function drawWrap() {
    const write = writer()
    return {
      name: 'wrap',
      actionsAt: slots.actions ?? el,
      paint: (parts) => paintParts((html, slot) => write(slot, html), parts),
      prepare: () => {},
      read: () => {
        const shown = actionEls().filter((b) => b.checkVisibility({ visibilityProperty: true }))
        return () => shown
      },
      remeasure: () => {},
      close: () => {},
    }
  }

  /**
   * The `menu` form: the ranked items that fit drawn in place on one row, the rest tucked behind ⋯, a menu of them
   * (`/menu.js`). The row is the one the region's badges and actions share; everything on it the region didn't draw is
   * protected, and so is what it draws marked `data-keep`. The view's own controls marked `data-tuck` rank ahead of
   * every contribution, the highest rank first, so they leave last; once tucked, each is listed in the menu as a proxy
   * pressing the original. Each item's width is read while it is drawn and remembered while tucked; the region forgets
   * them all when its room or the type changes, draws everything once more and measures it again.
   * @returns {RegionForm}
   */
  function drawMenu() {
    const write = writer()
    const host = slots.actions ?? el
    const items = document.createElement('span')
    items.className = 'region-items'
    const more = document.createElement('button')
    more.className = 'region-more'
    more.hidden = true
    more.innerHTML = '<span aria-hidden="true">⋯</span><span class="n" aria-hidden="true"></span>'
    const count = /** @type {HTMLElement} */ (more.querySelector('.n'))
    host.replaceChildren(items, more)
    /** What each menu entry runs, by its key. @type {Map<string, (el: HTMLElement) => void>} */
    let runs = new Map()
    const listed = menu(more, { run: (item, from) => runs.get(item.key)?.(from) })
    const pop = /** @type {HTMLElement} */ (more.nextElementSibling)
    const held = [slots.badges, slots.actions].filter((s) => s !== undefined)
    /** The row the region's items share: the nearest element holding both its badges and its actions, else the region. */
    let row = /** @type {HTMLElement} */ (held[0]?.parentElement ?? el)
    while (row !== el && !held.every((s) => row.contains(s))) row = /** @type {HTMLElement} */ (row.parentElement)
    /** Each item's width on the row, its gap beside it included, read while it was drawn. @type {WeakMap<Element, number>} */
    let widths = new WeakMap()
    let stale = true
    /** How many items the last fit drew in place, and of which list. */
    let was = 0
    let sig = ''
    rowOf.set(row, placed)
    resized.observe(row)
    /** ⋯ is busy while something tucked, or an entry of its menu, is. */
    const showBusy = () => {
      if (el.querySelector('[data-tucked][aria-busy="true"], .region-menu [aria-busy="true"]')) more.setAttribute('aria-busy', 'true')
      else more.removeAttribute('aria-busy')
    }
    /**
     * A control busy or done: ⋯ says so at once, and the menu lists its proxy as the original is next frame. A control
     * marked busy again while it already is (`/press.js` marks them anew on every redraw in the page) changes nothing.
     */
    const busy = new MutationObserver((records) => {
      if (records.every((r) => r.target === more || r.oldValue === /** @type {Element} */ (r.target).getAttribute('aria-busy'))) return
      showBusy()
      readNext(placed)
    })
    busy.observe(el, { subtree: true, attributeFilter: ['aria-busy'], attributeOldValue: true })
    const badgesAt = () => slots.badges ?? items
    /** The view's controls the region may tuck, the highest rank first. */
    const tuckable = () => /** @type {HTMLElement[]} */ ([...row.querySelectorAll('[data-tuck]')]).sort((a, b) => Number(b.dataset.tuck) - Number(a.dataset.tuck))
    /**
     * What the region fills the row with, in rank order: the view's tuckable controls, then the badges and actions in
     * the head's order (`headRanked`), each with its element and the key the menu lists it by.
     * @returns {({ el: HTMLElement, key: string } & ({ t: 'core' } | HeadItem))[]}
     */
    const fillOrder = () => {
      const actionButtons = actionEls()
      const badgeEls = /** @type {HTMLElement[]} */ ([...badgesAt().children].filter((c) => !c.matches('[data-keep], [data-added]')))
      const seen = new Map()
      /** @param {Ranked} r */
      const keyOf = (r) => {
        const n = seen.get(r.id) ?? 0
        seen.set(r.id, n + 1)
        return `${at.key} ${r.id}#${n}`
      }
      return [
        ...tuckable().map((c) => ({ t: /** @type {const} */ ('core'), el: c, key: `${at.key} tuck:${c.dataset.tuck}` })),
        ...headRanked(badges, ranked).map((item) =>
          item.t === 'badge'
            ? { ...item, el: badgeEls[badges.indexOf(item.badge)], key: `${at.key} badge:${badges.indexOf(item.badge)}` }
            : { ...item, el: actionButtons[ranked.indexOf(item.ranked)], key: keyOf(item.ranked) },
        ),
      ]
    }
    /** The menu's entry for a tucked control of the view: pressing it presses the original. @param {HTMLElement} c @param {string} key @returns {MenuItem} */
    const proxy = (c, key) => {
      runs.set(key, () => c.click())
      return { t: 'item', key, label: capitalized(c.getAttribute('aria-label') ?? c.textContent ?? ''), hint: c.dataset.tip, danger: c.classList.contains('danger'), held: c.getAttribute('aria-disabled') === 'true', busy: c.getAttribute('aria-busy') === 'true' }
    }
    /** The menu's entry for a tucked action, run as its button runs it. @param {Ranked} r @param {string} key @param {readonly string[]} offered @param {readonly string[]} had @returns {MenuItem} */
    const actionItem = (r, key, offered, had) => {
      const words = actionWords(board(), r.action)
      runs.set(key, (from) => void runAddedAt(from, { subject: at.key, action: r.action }))
      return { t: 'item', key, label: words.label, hint: words.hint, danger: words.destructive, fresh: dotOn(r, offered, had) }
    }
    /**
     * The menu and ⋯ for what `tucked` holds: its badges and the text the view lets go (`texts`) in the header, the
     * view's controls first under the subject's name, the dangerous after a separator, then the actions in rank order.
     * @param {ReturnType<typeof fillOrder>} tucked @param {string[]} texts
     */
    const list = (tucked, texts) => {
      runs = new Map()
      const offered = offeredIds(board())
      const had = seenAmong(offered)
      const core = tucked.flatMap((t) => (t.t === 'core' ? [t] : [])).sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
      const safe = core.filter((c) => !c.el.classList.contains('danger'))
      const danger = core.filter((c) => c.el.classList.contains('danger'))
      const tuckedBadges = tucked.flatMap((t) => (t.t === 'badge' ? [t.badge] : []))
      const tuckedActions = tucked.flatMap((t) => (t.t === 'action' ? [{ r: t.ranked, key: t.key }] : []))
      /** @type {MenuEntry[]} */
      const coreEntries = [...safe.map((c) => proxy(c.el, c.key)), ...(safe.length && danger.length ? [/** @type {MenuEntry} */ ({ t: 'separator' })] : []), ...danger.map((c) => proxy(c.el, c.key))]
      listed.draw({
        header: `${tuckedBadges.length ? `<div class="menu-badges">${tuckedBadges.map(badgeHtml).join('')}</div>` : ''}${texts.map((t) => `<p>${esc(t)}</p>`).join('')}`,
        entries: [
          ...(core.length ? [/** @type {MenuEntry} */ ({ t: 'group', label: subjectName(at), entries: coreEntries })] : []),
          ...(core.length && tuckedActions.length ? [/** @type {MenuEntry} */ ({ t: 'separator' })] : []),
          ...tuckedActions.map(({ r, key }) => actionItem(r, key, offered, had)),
        ],
      })
      const severe = tuckedBadges.filter(isSevere).length
      const said = [
        core.length + tuckedActions.length ? plural(core.length + tuckedActions.length, 'action') : '',
        tuckedBadges.length ? plural(tuckedBadges.length, 'badge') : '',
        severe ? `${severe} ${severe === 1 ? 'needs' : 'need'} attention` : '',
      ].filter(Boolean)
      const label = `More on ${subjectName(at)}${said.length ? `: ${said.join(', ')}` : ''}`
      more.setAttribute('aria-label', label)
      more.dataset.tip = label
      count.textContent = String(tucked.length)
      const fresh = tuckedActions.some(({ r }) => dotOn(r, offered, had))
      if (severe || fresh) more.dataset.dot = severe ? 'severe' : 'new'
      else delete more.dataset.dot
      showBusy()
    }
    return {
      name: 'menu',
      actionsAt: items,
      paint: (parts) => paintParts((html, slot, name) => write(name === 'actions' ? items : slot, html), parts),
      prepare: () => {
        if (!stale) return
        for (const t of row.querySelectorAll('[data-tucked]')) t.removeAttribute('data-tucked')
        more.hidden = false
      },
      read: () => {
        const order = fillOrder()
        for (const item of order) if (!item.el.hasAttribute('data-tucked')) widths.set(item.el, lineWidth(item.el) + gapBeside(item.el))
        if (!more.hidden) widths.set(more, lineWidth(more) + gapBeside(more))
        const drawn = new Set(/** @type {Element[]} */ (order.map((i) => i.el)))
        const kept = lineWidth(row, (e) => drawn.has(e) || e === more || e === pop)
        const room = roomOf(row) - kept - 1
        const texts = /** @type {HTMLElement[]} */ ([...el.querySelectorAll('[data-tuck-text]')]).filter(isCut).map((t) => (t.textContent ?? '').trim())
        stale = false
        return () => {
          const keys = order.map((i) => i.key).join('\n')
          if (keys !== sig) was = order.length
          const fits = fill(order.map((i) => /** @type {number} */ (widths.get(i.el))), room, /** @type {number} */ (widths.get(more)), was, FIT_MARGIN)
          was = fits
          sig = keys
          const focused = document.activeElement
          order.forEach((item, n) => item.el.toggleAttribute('data-tucked', n >= fits))
          more.hidden = fits === order.length
          if (more.hidden) listed.close()
          if (focused && order.slice(fits).some((i) => i.el.contains(focused))) more.focus({ preventScroll: true })
          list(order.slice(fits), texts)
          return order.slice(0, fits).flatMap((i) => (i.t === 'action' ? [i.el] : []))
        }
      },
      remeasure: () => ((widths = new WeakMap()), (stale = true)),
      close: () => {
        listed.remove()
        resized.unobserve(row)
        rowOf.delete(row)
        widthSeen.delete(row)
        busy.disconnect()
        for (const t of row.querySelectorAll('[data-tucked]')) t.removeAttribute('data-tucked')
        host.replaceChildren()
      },
    }
  }

  /** @type {PlacedRegion} */
  const placed = {
    prepare: () => form.prepare(),
    read: () => {
      if (!isDrawn(el)) return () => (hide(), [])
      const placing = form.read()
      return (focused) => {
        const shown = placing()
        if (!focused) return []
        const offered = offeredIds(board())
        const had = seenAmong(offered)
        const buttons = actionEls()
        const seen = shown.flatMap((b) => {
          const r = ranked[buttons.indexOf(b)]
          return r && isFresh(offered, had, r.id) ? [r.id] : []
        })
        seen.forEach((i) => dotted.add(i))
        return seen
      }
    },
    remeasure: () => (form.remeasure(), readNext(placed)),
  }
  const FORMS = /** @type {Partial<Record<Overflow, () => RegionForm>>} */ ({ wrap: drawWrap, menu: drawMenu })
  /** @param {Overflow} name */
  const formOf = (name) => {
    const make = FORMS[name]
    if (!make) throw new Error(`the page draws ${id} as wrap or menu, not ${name}: its renderer.json offers a form the page doesn't draw`)
    return make()
  }
  let form = formOf(formName())
  const draw = (/** @type {Subject} */ s) => {
    at = s
    const entry = layout()[id]
    ranked = actions ? rankedActions(shownActions(s), entry) : []
    badges = holds.includes('badges') ? rankedBadges(board(), s) : []
    const parts = {
      badges: holds.includes('badges') ? `${keptHtml(id === 'card.head' ? dismissHtml(s.key) : '', exemptionsOf(board(), s))}${badges.map(badgeHtml).join('')}` : '',
      lines: holds.includes('lines') && s.kind === 'card' ? rankedLines(board(), /** @type {Card} */ (s.value).id, entry).map(lineHtml).join('') : '',
      actions: actionsHtml(board(), s, ranked.map((r) => r.action)),
    }
    const name = formName()
    if (form.name !== name) (form.close(), (form = formOf(name)))
    for (const slot of marked.length ? marked : [el]) mark(slot, s)
    form.paint(parts)
    dot()
    readNext(placed)
  }
  placedRegions.add(placed)
  draw(subject)
  const clear = (/** @type {HTMLElement} */ at) => (at.replaceChildren(), delete at.dataset.region, delete at.dataset.subject)
  return {
    update: draw,
    options: (next) => ((omit = /** @type {{ omit?: string[] }} */ (next).omit ?? []), draw(at)),
    visible: (on) => (on ? readNext(placed) : hide()),
    close: () => (form.close(), placedRegions.delete(placed), unread.delete(placed), (marked.length ? marked : [el]).forEach(clear)),
  }
}

/** The subject each region of contributions is drawn on: a viewer subject (picked lines) is in no read but its region's. @type {WeakMap<HTMLElement, Subject>} */
const regionSubjects = new WeakMap()

/** The viewer subject `key` names, as the region holding `el` was drawn on it. @param {HTMLElement} el @param {string} key */
const viewerSubjectAt = (el, key) => {
  const at = regionSubjects.get(/** @type {HTMLElement} */ (el.closest('[data-region]')))
  return at?.key === key ? at : undefined
}

/** The tower the page lends its views: a worker one starts is one the page started, awaited as it arrives. */
const viewTower = /** @type {typeof tower} */ (Object.assign(Object.create(tower), {
  /** @type {typeof tower.run} */
  run: (...args) => tower.run(...args).then(started),
  /** @type {typeof tower.call} */
  call: (...args) => tower.call(...args).then(started),
}))

/** A reply that started a worker: the page awaits it. @template T @param {T} reply @returns {T} */
function started(reply) {
  const r = /** @type {{ t?: string, id?: string } | undefined} */ (reply)
  if (r?.t === 'spawned' && r.id) page.dispatch({ type: 'started', id: r.id })
  return reply
}

const mainRegion = regions({
  board,
  views: () => viewsOf(board()),
  layout,
  declared: () => placing().regions,
  kit: KIT,
  termFont,
  scheme,
  run,
  commandKit: { ...commandKit, go: (location) => void goTo(location), href: (to) => ('view' in to ? hashOf({ t: 'view', location: to }, board()) || '#' : linkHash(to)), location: () => viewing('view')?.location },
  tower: viewTower,
  contributions: kitRegion,
  subjectOf,
  unshown: () => unshown,
  mainPane: () => viewing('view')?.location.pane,
  gone: () => goHome(),
  bus,
})
/** A floor's trays, a view per collection (`floor.trays`), mounted by the main pane's region code and placed in the sidebar's paint. */
const floorTrays = mainRegion.rows('floor.trays')

/** The strip at the top of the sidebar (`board.strip`): a view on the board, mounted for as long as the page is open. */
const boardStrip = mainRegion.rows('board.strip')

/** The strip's view in its place, when a view draws it: its focus kept across the paint, as the floors' is. */
const paintStrip = () => {
  const strip = $('strip')
  const subject = /** @type {Subject} */ (subjectAt(board(), 'board'))
  keepingFocus(strip, () => {
    strip.innerHTML = boardStrip.draws(subject) ? boardStrip.slotHtml(subject) : ''
    boardStrip.place(strip)
  })
}

/** Where each of a floor's collections goes in its row of trays, in the order the region places them. @param {Floor} f */
const trayRowsHtml = (f) =>
  floorTrays
    .ordered(f.collections.map((c) => /** @type {Subject} */ (subjectAt(board(), `collection:${f.id}/${c.id}`))))
    .map(floorTrays.slotHtml)
    .join('')

mainRegion.onPick((key, pane) => {
  const v = viewing('view')
  if (v && (v.location.subject ?? 'board') === key) go({ t: 'view', location: { ...v.location, pane } })
})

/**
 * The new-worker form, on the floor `on` is or is of; on a draft, on that draft, deleted once a worker starts on it.
 * Answers whether it opened.
 * @param {Subject} on
 */
function spawnIn(on) {
  const project = on.project
  if (project === undefined) return false
  if (on.kind === `item.${DRAFTS}`) return (void spawnOn(project, /** @type {{ id: string }} */ (on.value).id), true)
  return (openSpawn(project), true)
}

/** The views this page offers to open where the viewer stands: on the subject in focus, and on each floor and the board. @returns {Openable[]} */
function opensHere() {
  const p = placing()
  const subjects = [...new Map([focusedSubject(), boardSubject(board()), ...board().floors.map((f) => /** @type {Subject} */ (subjectAt(board(), `floor:${f.id}`)))].map((s) => [s.key, s])).values()]
  const groupOf = (/** @type {Subject} */ s) =>
    s.kind === 'board' ? 'Every floor' : s.kind === 'floor' ? /** @type {Floor} */ (s.value).name : s.kind === 'card' ? /** @type {Card} */ (s.value).callsign : s.key
  return subjects.flatMap((s) => openable(p, s, besideOn(s)).map((v) => ({ subject: s.key, view: v.id, words: v.words, group: groupOf(s), ...(s.project !== undefined && { project: s.project }) })))
}

/** The view on screen for `subject`: the one the main pane holds, when it is on that subject. @param {Subject} subject */
const besideOn = (subject) => {
  const at = viewing('view')?.location
  if (!at || (at.subject ?? 'board') !== subject.key) return []
  return [at.view, ...(mainRegion.tabsAt(null)?.tabs().views ?? [])]
}

/** "Open <label>" for each view a floor's section offers, less those its layout hides there. @param {Subject} subject */
const opensHtml = (subject) =>
  openable(placing(), subject, besideOn(subject))
    .filter((v) => !layout()['floor.section']?.hidden?.includes(v.id))
    .map((v) => `<button class="added" data-open-view="${esc(JSON.stringify({ subject: subject.key, view: v.id }))}"${v.words.hint ? ` data-tip="${esc(v.words.hint)}"` : ''}>Open ${esc(v.words.label)}</button>`)
    .join('')

/** What a view sets up as it opens, beside its class on the main pane and its colour; a worker awaited is drawn as the skyline. @type {{ [T in MainView['t']]: (v: Extract<MainView, { t: T }>) => void }} */
const ENTER = {
  arriving: () => mainRegion.enter(SKYLINE),
  view: (v) => (v.location.view === WORKER && forgetFold(), mainRegion.enter(v.location)),
}

/** What only the view open holds, let go as it closes. @type {{ [T in MainView['t']]: () => void }} */
const LEAVE = {
  arriving: () => mainRegion.leave(),
  view: () => mainRegion.leave(),
}

addEventListener('focus', () => (page.dispatch({ type: 'focus', focused: true }), placedRegions.forEach(readNext)))
// The window blurs as focus moves into one of the page's own frames, where the document still has it once focus settles.
addEventListener('blur', () => setTimeout(() => page.dispatch({ type: 'focus', focused: document.hasFocus() })))
document.addEventListener('visibilitychange', () => page.dispatch({ type: 'visible', visible: document.visibilityState === 'visible' }))

/** The viewer's record and their layout as `tower.store` keeps them now: another renderer or window of theirs may have changed them. */
async function rereadViewer() {
  const was = viewer()
  const [kept, laidOut] = await Promise.all([readViewer(tower.store.get), tower.store.get(LAYOUT_KEY)])
  page.dispatch({ type: 'stored', viewer: kept })
  page.dispatch({ type: 'laid-out', layout: /** @type {Layout | undefined} */ (laidOut ?? undefined) })
  if (viewer().statsRange !== was.statsRange) sideView.dispatch({ type: 'range', range: viewer().statsRange })
}

/** A wait's or an offer's key, dismissed for this viewer. @param {string} key */
function dismissWait(key) {
  page.dispatch({ type: 'dismiss', key })
  render()
}

/** What an ask is about: its worker, else its floor. @param {string} key */
function goToSubject(key) {
  if (key.startsWith('card:')) return moveTo(key.slice('card:'.length))
  const project = projectOfKey(board(), key)
  if (project) goToFloor(project)
}

/**
 * Runs an action an extension added, asked first when its words say it destroys: its verb called with its call, or its
 * command run on its subject as the board holds it now.
 * @param {HTMLElement} el @param {{ subject: string, action: Added<Action> }} added
 */
async function runAddedAt(el, { subject: key, action }) {
  const subject = isCommand(action) ? subjectOf(key) ?? viewerSubjectAt(el, key) : undefined
  if (isCommand(action) && !subject) return toast('That is no longer on the board')
  const words = actionWords(board(), action)
  if (words.destructive && !(await ask(`${words.label}?`, words.label))) return
  markSeen([actionId(action)])
  await told(pressing(el, () => (isCommand(action) ? runCommandWith(board(), action, /** @type {Subject} */ (subject), commandKit) : runVerb(action))))
}

/** The worker a key moved to, its sidebar row scrolled into view when it is out of sight. @param {string} id */
function moveTo(id) {
  select(id)
  $('floors').querySelector(`.sess[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest' })
}

/** To the worker a move key names, in the order every renderer moves in (src/shared/cards.ts). @param {Move | 'waiting'} move */
function goMove(move) {
  if (move !== 'waiting') {
    const to = neighbours(board(), selected(), heed())[move]
    return to ? moveTo(to.id) : toast('Nobody is on duty')
  }
  page.dispatch({ type: 'next-waiting' })
}

/**
 * The new-worker dialog (`wireSpawn`), opened on a floor, or on the draft open in the editor: a prompt it closes on is
 * kept in that draft, which is deleted once a worker starts on it.
 * @type {Loop<Spawning<Draft>, SpawnEvent<Draft>>}
 */
const spawning = wireSpawn(/** @type {HTMLDialogElement} */ ($('spawn')), {
  board,
  run: (call, body) => tower.run(call, body),
  sign: (f) => {
    const top = floorsTopDown()
    return signHtml(top.length - top.indexOf(f), f.name)
  },
  drafts: { draftsOf, keepUnsent, titleOf },
  draftIo,
  held: async (d) => d,
  kept: () => {},
  shown: () => {},
  started: async (id, d) => {
    selectArriving(id)
    if (d) await deleteSent(d)
  },
  toast,
})

/** @param {string} project @param {{ d: Draft, text: string }} [sent] */
const openSpawn = (project, sent) => spawning.dispatch({ type: 'open', project, on: sent?.d, text: sent?.text ?? '' })

/** @param {HTMLElement} button @param {Call<'resume'>} call */
async function resume(button, call) {
  const reply = await told(pressing(button, () => tower.run(call)))
  if (reply?.t === 'spawned') selectArriving(reply.id)
}

/** Every stranded worker of a floor resumed, one after another, asked first with the list. */
/** @param {HTMLElement} button @param {Floor} f */
async function resumeAll(button, f) {
  const stranded = strandedOf(f)
  if (!(await ask(resumeAllAsk(f, stranded), 'Resume all'))) return
  const line = await pressing(button, () => resumeStranded(stranded, tower.run))
  if (line) toast(line)
}

/** Ends everything a worker left running, asked first. @param {HTMLElement} button @param {Card} c */
async function reapAll(button, c) {
  if (await ask(reapAsk(c), 'End them')) told(pressing(button, async () => tower.run(offeredCall(c, 'reap', c.callsign))))
}

/** Does all a floor's Tidy lists, asked first with the list. @param {HTMLElement} button @param {Floor} f */
async function tidyAll(button, f) {
  if (await ask(tidyAllAsk(f, Date.now(), addedTidyOf(board(), f)), verbLabel('floor', 'tidy'))) told(pressing(button, async () => tower.run(offeredCall(f, 'tidy', f.name)))).then((r) => r && toast(tidiedLine(r)))
}

/** Opens one of a floor's dirs in the user's editor. @param {HTMLElement} button @param {Floor} f @param {string} dir */
const openInEditor = (button, f, dir) => told(pressing(button, async () => tower.run(offeredCall(f, 'editor', f.name), { dir })))

/** Ends a worker with everyone under it that runs, asked first; the toast offers the resume of one sent home alone. @param {HTMLElement} button @param {Card} c */
async function sendHome(button, c) {
  const sent = sentHome(cards(), c)
  if (!(await ask(sendHomeAsk(c, sent), verbLabel('card', 'send-home')))) return
  const ended = await pressing(button, async () => {
    for (const call of callOf(c, 'send-home') ?? []) if (!(await told(tower.run(call)))) return false
    return true
  })
  const resumeIt = async () => {
    const dead = cards().find((d) => d.id === c.id) ?? (await told(tower.archive(c.project)))?.find((d) => d.id === c.id)
    const call = dead && callOf(dead, 'resume')
    if (!call) return toast(`${c.callsign} can't be resumed now`)
    const reply = await told(tower.run(call))
    if (reply?.t === 'spawned') selectArriving(reply.id)
  }
  if (ended) toast(`Sent ${sent.map((h) => h.callsign).join(', ')} home`, sent.length === 1 ? { label: verbLabel('card', 'resume'), run: () => void resumeIt() } : undefined)
}

/** @param {HTMLElement} button @param {Card} c */
async function letGo(button, c) {
  if (!(await ask(letGoAsk(c), verbLabel('card', 'let-go')))) return
  if (await told(pressing(button, async () => tower.run(offeredCall(c, 'let-go', c.callsign))))) toast(letGoneLine(c))
}

/** Whether `el` is a view's own, drawn inside one and in no region the page fills there. @param {Element} el */
const inView = (el) => Boolean(el.closest('[data-view]')) && !el.closest('[data-view] [data-region]')

/** A file's Finder and editor buttons, wherever the page draws them, before any other click handling sees the click. */
document.addEventListener(
  'click',
  (e) => {
    const file = !inView(/** @type {Element} */ (e.target)) && fileCall(/** @type {Element} */ (e.target))
    if (!file) return
    e.stopPropagation()
    told(tower.run(file))
  },
  true,
)

/**
 * A link goes where its href says: a worker's `#<id>` reaches `route` as the hash changes. A view wires its own
 * presses: the page's are only those in a region it fills inside one (`kit.region`).
 */
document.addEventListener('click', async (e) => {
  const target = /** @type {Element} */ (e.target)
  if (target.closest('a[href]') || inView(target)) return
  const spawn = target.closest('[data-spawn]')
  if (spawn) return openSpawn(/** @type {string} */ (spawn.dataset.spawn))
  const copy = target.closest('[data-copy]')?.dataset.copy
  if (copy) return copyText(copy, copy)
  const markdown = /** @type {BriefMarkdown | undefined} */ (target.closest('[data-brief-markdown]')?.dataset.briefMarkdown)
  if (markdown) return (keepViewer('briefMarkdown', markdown), drawSettings())
  const files = target.closest('[data-changes-files]')?.dataset.changesFiles
  if (files) return (keepViewer('changesTree', files === 'shown'), render())
  const tips = target.closest('[data-tips]')?.dataset.tips
  if (tips) return (keepViewer('tips', tips === 'on'), render())
  if (target.closest('[data-tips-again]')) return (keepViewer('tipsDismissed', []), render())
  const dismissTip = target.closest('[data-tip-dismiss]')?.dataset.tipDismiss
  if (dismissTip) return (keepViewer('tipsDismissed', [...viewer().tipsDismissed, dismissTip]), render())
  const tipRun = target.closest('[data-tip-run]')?.dataset.tipRun
  if (tipRun) return run(tipRun, { repeat: false }) || toast(`Not from here: ${COMMANDS.find((c) => c.id === tipRun)?.does}`)
  const landingOf = target.closest('[data-landing-of]')
  if (landingOf) return told(pressing(landingOf, () => tower.landing({ project: /** @type {Card} */ (findCard(selected())).project, branch: /** @type {string} */ (landingOf.dataset.landingOf) }))).then((l) => l && showLanding(l))
  const landing = target.closest('[data-landing]')
  if (landing) return told(pressing(landing, () => tower.landing(JSON.parse(/** @type {string} */ (landing.dataset.landing))))).then((l) => l && showLanding(l))
  const discarding = target.closest('[data-discard]')
  if (discarding) {
    const w = board().floors.flatMap((f) => f.worktrees).find((w) => JSON.stringify(callOf(w, 'discard')) === discarding.dataset.discard)
    const call = w && callOf(w, 'discard')
    if (!w || !call) return toast(noLongerOffered(/** @type {string} */ (discarding.dataset.wtName), 'discard'))
    if (!(await ask(discardAsk(w), verbLabel('worktree', 'discard')))) return
    return told(pressing(discarding, () => tower.run(call, { author: board().user.name }))).then((r) => r && toast(discardedLine(r)))
  }
  const wtCall = target.closest('[data-wt-call]')
  if (wtCall) {
    const { wtVerb, wtName } = wtCall.dataset
    const verb = /** @type {keyof typeof WORKTREE_DONE} */ (wtVerb)
    const name = /** @type {string} */ (wtName)
    if (WORKTREE_ASK[verb] && !(await ask(WORKTREE_ASK[verb](name), WORKTREE_VERB_NAME[verb].replace(/^./, (l) => l.toUpperCase())))) return
    return told(pressing(wtCall, () => tower.run(JSON.parse(/** @type {string} */ (wtCall.dataset.wtCall))))).then((r) => r && toast(`${WORKTREE_DONE[verb]} ${name}${keptLine(r)}`))
  }
  const probeRun = target.closest('[data-probe-run]')
  if (probeRun) {
    return told(pressing(probeRun, () => runVerb({ verb: 'quota/read-now', call: {} }))).then((r) => r && toast(probedLine('quota', /** @type {{ ms: number, ok: boolean, error?: string }} */ (r))))
  }
  const tidyCall = target.closest('[data-tidy-call]')
  if (tidyCall) return (await ask(/** @type {string} */ (tidyCall.dataset.tidyAsk), 'Tidy')) && told(pressing(tidyCall, () => tower.run(/** @type {Call<'tidy'>} */ (JSON.parse(/** @type {string} */ (tidyCall.dataset.tidyCall)))))).then((r) => r && toast(tidiedLine(r)))
  const tidy = target.closest('[data-tidy]')
  if (tidy) return tidyAll(tidy, /** @type {Floor} */ (floorOf(/** @type {string} */ (tidy.dataset.tidy))))
  const resumeAllButton = target.closest('[data-resume-all]')
  if (resumeAllButton) return resumeAll(resumeAllButton, /** @type {Floor} */ (floorOf(/** @type {string} */ (resumeAllButton.dataset.resumeAll))))
  const letGoButton = target.closest('[data-let-go]')
  if (letGoButton) return letGo(letGoButton, /** @type {Card} */ (findCard(letGoButton.dataset.letGo)))
  const resumeButton = target.closest('[data-resume]')
  if (resumeButton) return resume(resumeButton, JSON.parse(/** @type {string} */ (resumeButton.dataset.resume)))
  if (target.closest('[data-side]')) return toggleSide()
  const sideTo = /** @type {SideView | undefined} */ (target.closest('[data-side-view]')?.dataset.sideView)
  if (sideTo) return sideView.dispatch({ type: 'side', side: sideTo })
  const scope = target.closest('[data-stats-scope]')?.dataset.statsScope
  if (scope) return sideView.dispatch({ type: 'scope', all: scope === STATS_ALL })
  const range = /** @type {StatsRange | undefined} */ (target.closest('[data-stats-range]')?.dataset.statsRange)
  if (range) return (keepViewer('statsRange', range), sideView.dispatch({ type: 'range', range }))
  if (target.closest('[data-stats-read]')) return sideView.dispatch({ type: 'retry' })
  if (target.closest('[data-keys]')) return showKeys()
  const added = target.closest('[data-added]')
  if (added) return runAddedAt(added, JSON.parse(/** @type {string} */ (added.dataset.added)))
  const opened = target.closest('[data-open-view]')?.dataset.openView
  if (opened) {
    const { subject, view } = JSON.parse(opened)
    return display(subject, { view })
  }
  const dismissed = target.closest('[data-dismiss]')?.dataset.dismiss
  if (dismissed) return dismissWait(dismissed)
  const worker = target.closest('[data-worker]')?.dataset.worker
  if (worker) return select(worker)
  const unshowKey = target.closest('[data-unshow]')?.dataset.unshow
  if (unshowKey) return unshow(unshowKey)
  const out = target.closest('[data-out]')?.dataset.out
  if (out) return window.open(out, '_blank', 'noreferrer')
  const open = target.closest('[data-open]')
  if (open) return openInEditor(open, /** @type {Floor} */ (floorOf(/** @type {string} */ (open.dataset.openProject))), /** @type {string} */ (open.dataset.open))
  const shelved = target.closest('[data-shelf]')
  if (shelved) return openShelf(/** @type {string} */ (shelved.dataset.shelf), Number(shelved.dataset.n))
  const newShell = target.closest('[data-shell-dir]')
  if (newShell) {
    if ($('shell-pick').matches(':popover-open')) $('shell-pick').hidePopover()
    return spawnShell(newShell, /** @type {string} */ (newShell.dataset.shellProject), /** @type {string} */ (newShell.dataset.shellDir))
  }
  const killShell = target.closest('[data-kill-shell]')?.dataset.killShell
  if (killShell) {
    const sh = /** @type {Board['shells'][number]} */ (board().shells.find((sh) => sh.id === killShell))
    return (await ask(killShellAsk(shellFloor(sh), sh), 'Kill')) && told(pressing(/** @type {HTMLElement} */ (target.closest('[data-kill-shell]')), () => tower.call('shell/kill', { id: killShell })))
  }
  const tab = target.closest('[data-shell]')?.dataset.shell
  if (tab) return toggleShell(tab)
  const archive = target.closest('[data-archive]')?.dataset.archive
  if (archive) return at(ARCHIVE_VIEW)?.project === archive ? goHome() : openArchive(archive)
  const section = target.closest('[data-section]')?.dataset.section
  if (section) return toggleSection(section)
  const floorFold = target.closest('[data-floor-fold]')?.dataset.floorFold
  if (floorFold) return toggleFloor(floorFold)
  const reapOne = target.closest('[data-reap-process]')
  if (reapOne) return told(pressing(reapOne, () => tower.run(JSON.parse(/** @type {string} */ (reapOne.dataset.reapProcess)))))
  const reapable = target.closest('[data-reap]')
  if (reapable) return reapAll(reapable, /** @type {Card} */ (findCard(reapable.dataset.reap)))
  const actor = target.closest('[data-act]')
  const act = actor?.dataset.act
  if (act === 'home') return goHome()
  const crewFolded = target.closest('[data-crew-fold]')?.dataset.crewFold
  if (crewFolded) return toggleCrewFold(crewFolded)
  const away = target.closest('[data-away]')?.dataset.away
  if (away) return moveTo(away)
  const card = target.closest('[data-id]')
  if (card) select(/** @type {string} */ (card.dataset.id))
})
$('home').onclick = goHome

function applyScheme() {
  mainRegion.rescheme()
  reschemeShell()
  render()
}

tower.onScheme(applyScheme)
tower.prefs.on(() => (applyTermFont(), placedRegions.forEach((r) => r.remeasure()), render(), drawSettings()))
document.fonts.addEventListener('loadingdone', () => placedRegions.forEach((r) => r.remeasure()))
// A view or a framed page set a key the viewer's record keeps, such as a dismissal.
tower.store.on(() => void rereadViewer().then(render))

const isTyping = () => ['INPUT', 'TEXTAREA', 'SELECT'].includes(/** @type {string} */ (document.activeElement?.tagName)) || $('confirm').open || $('spawn').open || $('keys').open || $('landing').open || $('palette').open || $('patterns').open || Boolean(document.querySelector('[data-view] dialog[open]'))

/** The keymap's command for each of the core's tabs of a worker, and the view each opens. */
const PANE_COMMAND = /** @type {Partial<Record<string, string>>} */ ({ 'pane-terminal': 'tower/terminal', 'pane-brief': 'tower/brief', 'pane-changes': 'tower/changes', 'pane-reviews': 'reviews/thread' })

/** Opens a tab of the worker focus is in, else the main pane's, with focus in its terminal or on its tab, from where Tab enters it. @param {string} view */
const toPane = (view) => mainRegion.tabsAt(document.activeElement)?.toPane(view) ?? false

/** From any shell, hides the dock's view of it and returns to the worker's terminal; else to the worker's shell, started when none runs there. */
function shellHere() {
  const c = selected() && findCard(selected())
  if (!c) return false
  if (focusedShell()) return (closeShell(), toPane('tower/terminal'))
  const there = board().shells.filter((sh) => sh.cwd === c.cwd)
  if (there.length) focusShell((there.find((sh) => sh.id === openShellId()) ?? there[0]).id)
  else void spawnShellAt(c.project, c.cwd)
  return true
}

/** Runs the keymap's command `id` for the keydown `e`. Returns whether it did something. @param {string} id @param {{ repeat: boolean }} e */
function run(id, e) {
  const pane = PANE_COMMAND[id]
  if (pane) return toPane(pane)
  const move = /** @type {(keyof typeof MOVE_COMMAND)[]} */ (Object.keys(MOVE_COMMAND)).find((m) => MOVE_COMMAND[m] === id)
  if (move) return (e.repeat || goMove(move), true)
  if (id === 'sidebar') return (toggleSide(), true)
  if (id === 'help') return (showKeys(), true)
  if (id === 'palette') return (openPalette(), true)
  if (id === 'leave-terminal') return (leaveTerminal(), true)
  if (id === 'shell-here') return e.repeat || shellHere()
  if (id === 'home' && !isHome(view())) return (goHome(), true)
  if (id === 'spawn') return spawnIn(focusedSubject())
  return false
}

/**
 * A terminal's own key handler already ran the keys typed into it; a field's listener, the field's. No shortcut runs
 * behind an ask: what it asks about was read as it opened.
 */
document.addEventListener('keydown', (e) => {
  if (e.defaultPrevented || $('confirm').open) return
  const focus = isTyping() ? 'field' : 'page'
  const id = commandOf(board().keys, e, focus)
  if (id && run(id, e)) return (e.preventDefault(), (enterGuard = undefined))
  const added = !e.repeat && addedCommandOf(board().keys, e, focus)
  if (added && runAddedId(added, focusedSubject())) (e.preventDefault(), (enterGuard = undefined))
})

/**
 * A key pressed in a frame the page drew runs the keymap's global commands (`frameCommandOf`), as a field's when its
 * target took typing, and none while a modal is open; then an extension's chord that `reaches` lets through, on the
 * subject in focus. Returns whether it ran one.
 * @param {KeyPress & { repeat: boolean }} press @param {boolean} editable @param {(id: string) => boolean} reaches
 */
function frameKey(press, editable, reaches) {
  if (document.querySelector(':modal')) return false
  const focus = editable ? 'field' : 'page'
  const id = frameCommandOf(board().keys, press, focus)
  if (id) return run(id, press)
  const added = !press.repeat && addedCommandOf(board().keys, press, focus)
  return Boolean(added && reaches(added) && runAddedId(added, focusedSubject()))
}

/** An extension's chord a script frame forwards runs only if it displays a view: a command's is code, and any script can claim a key. @param {string} id */
const isViewId = (id) => viewsOf(board()).some((v) => v.id === id)

/** @param {EventTarget | null} target an element of a framed document, of the frame's realm */
const editableIn = (target) => {
  const el = /** @type {HTMLElement | null} */ (target)
  return Boolean(el?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el?.tagName ?? ''))
}

/**
 * A document frame (a srcdoc the page wrote, where nothing runs) is the page's own: its keys are the browser's, heard on
 * its document at each load. A frame that navigated away from the srcdoc holds a document the page didn't write.
 * WebKit calls no listener in a document that can't run scripts, so there the keys pressed while focus is in a
 * document frame stay the frame's, and a click outside it gives the page its keys back (decision `markdown-safe`).
 */
document.addEventListener('load', (e) => {
  const frame = e.target
  if (!(frame instanceof HTMLIFrameElement) || frame.sandbox.contains('allow-scripts') || frame.contentDocument?.URL !== 'about:srcdoc') return
  frame.contentDocument.addEventListener('keydown', (k) => {
    if (!k.defaultPrevented && frameKey(k, editableIn(k.target), () => true)) k.preventDefault()
  })
}, true)

/**
 * A script frame's keys come from `/frame-keys.js` as a message anyone can send, so one counts only from the frame the
 * page drew with scripts that holds focus: never a url frame's, never a frame the user isn't in.
 */
addEventListener('message', (e) => {
  /** @type {FromPage | undefined} */
  const msg = e.data
  if (msg?.t !== 'key') return
  const frame = document.activeElement
  if (!(frame instanceof HTMLIFrameElement) || e.source !== frame.contentWindow || !frame.sandbox.contains('allow-scripts') || !document.hasFocus()) return
  const mods = new Set(msg.mods)
  const press = { key: msg.key, code: msg.code, altKey: mods.has('Alt'), ctrlKey: mods.has('Ctrl'), metaKey: mods.has('Meta'), shiftKey: mods.has('Shift'), repeat: false }
  if (!frameKey(press, msg.editable, isViewId)) return
  const opened = document.activeElement
  enterGuard = opened && typesText(opened) ? opened : 'pending'
})

/** @param {Element | null} el */
const typesText = (el) => el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA'].includes(el.tagName))

/**
 * The field or terminal a framed page's key opened, or `pending` until what it ran focuses one (a new shell's terminal
 * focuses late): the page could time its key so the user's next keystrokes land there, so the first Enter typed into
 * that surface is held back. Focus leaving it, a click, or a key the page ran itself ends the guard.
 * @type {Element | 'pending' | undefined}
 */
let enterGuard
addEventListener('focusin', (e) => {
  if (enterGuard === 'pending' && typesText(/** @type {Element} */ (e.target))) enterGuard = /** @type {Element} */ (e.target)
  else if (enterGuard !== 'pending' && e.target !== enterGuard) enterGuard = undefined
}, true)
addEventListener('keydown', (e) => {
  if (enterGuard === 'pending') enterGuard = undefined
  if (!enterGuard || e.key !== 'Enter' || e.target !== enterGuard) return
  enterGuard = undefined
  e.preventDefault()
  e.stopImmediatePropagation()
  toast('Opened by a key in a framed page: press Enter again to go on')
}, true)
addEventListener('pointerdown', () => (enterGuard = undefined), true)

/** xterm measures its cells when it opens: the terminal face must be loaded by then. */
await loadTerminalFont(termFont())

/** The board's failure stays on screen over the last board drawn, until the tower sends a board again. */
function showBoardError() {
  const { error, lostAt } = page.state()
  document.body.classList.toggle('lost', lostAt !== undefined)
  $('board-error').innerHTML = !error ? '' : `<b>${boardErrorTitle(error.code)}</b>${esc(error.message)}${
    lostAt ? `<small>what you see is how it stood at ${new Date(lostAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>` : ''}`
}

/** A lost tower leaves its board on screen, dimmed and with its times stopped, until it answers again. */
tower.onBoardError((error) => {
  page.dispatch({ type: 'board-error', error, at: Date.now() })
  showBoardError()
  if (opened()) render()
})

tower.subscribe(async (next) => {
  await rereadViewer()
  const first = !opened()
  page.dispatch({ type: 'board', board: next })
  if (first && viewer().seen === null) keepViewer('seen', seenOf(null, offeredIds(board())))
  showBoardError()
  noticeShown(cards())
  freshArchives()
  pruneDraftTitles(board().floors)
  const arriving = viewing('arriving')
  if (arriving && findCard(arriving.id)) return select(arriving.id)
  const wanted = first && location.hash.slice(1)
  if (first) reopen(HOME)
  if (wanted) return route(wanted)
  render()
})

/** Opens a location (`/views.js`), as a link to its hash would: a worker of an archive read first. @param {import('../../src/shared/views.ts').Location} location */
const goTo = (location) => opening(mainViewOf(location, has))

/**
 * Opens what a hash (without its `#`) names, a worker of an archive read first; the skyline when it names nothing. A
 * view reads its location's args once, so one named with other args (a shelf entry's other file) is opened afresh.
 * @param {string} wanted
 */
function route(wanted) {
  const named = viewOf(wanted, board(), has)
  const at = view()
  if (named.t === 'view' && at.t === 'view' && sameRoom(at, named) && String(named.location.args) !== String(at.location.args)) return reopen(named)
  void opening(named)
}

/**
 * The hash a link to `subject` takes the page to (the kit's `href`): the location `display` puts it at, which names it
 * as its subject, or as what a tab on a subject above it shows; `#` where nothing here shows it. @param {Subject} subject
 */
function linkHash(subject) {
  const at = displayed(placing(), subject)
  return at ? hashOf({ t: 'view', location: at }, board()) || '#' : '#'
}

/** Goes to `named`, a worker it names that the page doesn't hold looked up first. @param {MainView | import('./view.js').Lookup} named */
async function opening(named) {
  if (named.t !== 'lookup') return go(named)
  go((await lookUp(named.id)) ? { t: 'view', location: named.location } : HOME)
}

/** Every view writes its own hash in place, so the hash changes only by a link, the history or the address bar. */
addEventListener('hashchange', () => opened() && location.hash !== hashOf(view(), board()) && route(location.hash.slice(1)))
setInterval(tick, 1000)
sideView.dispatch({ type: 'side', side: sideView.state().side })
