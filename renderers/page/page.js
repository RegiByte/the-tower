import { actionWords, heededAsks, isAsk, isCommand, projectOfKey, runCommand, runVerb, subjectAt, ATTENTION_MEANS, ATTENTION_NAME, HOST_ATTENTION, HOST_MEANS, HOST_NAME, ON_DUTY_MEANS, WAITING_MEANS, WAITING_NAME, hostState, loudest, SOUNDS, attentionOrder, heededOffers, heededWaits, isOffer, nextAttended, claudeUntestedHtml, boardErrorTitle, tidiedLine, discardAsk, discardedLine, probedLine, ago, callOf, can, noLongerOffered, offeredCall, esc, neighbours, strandedOf, letGoAsk, letGoneLine, resumeAllAsk, resumeStranded, reapAsk, killShellAsk, tidyAllAsk, WORKTREE_ASK, WORKTREE_DONE, WORKTREE_VERB_NAME, keptLine } from '/cards.js'
import { itemKind, itemsCss, keptOf, readsText } from '/items.js'
import { threadWant, panelsCss, STATS_ALL, fileButtonsHtml, fileCall, keepingFocus, cardThread } from '/panels.js'
import { POLICIES } from '/policies.js'
import { loop, timers } from '/loop.js'
import { wireSpawn } from '/spawn.js'
import { attendNext, attending, watchedIn } from '/attend.js'
import { HOME, hashOf, mainClass, sameRoom, viewOf } from './view.js'
import { dialogs } from './dialogs.js'
import { sidebar } from './sidebar.js'
import { skyline } from './skyline.js'
import { shelf } from './shelf.js'
import { worker } from './worker.js'
import { review } from './review.js'
import { shells } from './shells.js'
import { tipStrip } from './tip.js'
import { screen } from './screen.js'
import { stats } from './stats.js'
import { settingsPane } from './settings-pane.js'
import { alerting } from './alerts.js'
import { briefPane } from './brief-pane.js'
import { keptViews } from './kept.js'
import { draft } from './draft.js'
import { archive } from './archive.js'
import { boardKit } from './board.js'
import { onDuty, $, signHtml, copyText, topAnchorOf, sightAnchorOf, redrawHeld, paintOnce, repaint, announce, toast, told } from './kit.js'
import { briefCss } from '/brief.js'
import { fenceText, markdownCss } from '/markdown.js'
import { COMMANDS, DEFAULT_KEYS, MOVE_COMMAND, commandOf } from '/keymap.js'
import { VIEWER_KEYS, readViewer } from '/viewer.js'
import { settingsCss } from '/settings.js'
import { loadTerminalFont } from '/terminal.js'
import { watchTips } from '/tips.js'
import { pressing } from '/press.js'
import { toastsCss } from '/toasts.js'
import { AUTOSAVE_MS, DRAFTS } from '/drafts.js'
import { verbLabel } from '/verb-words.js'
import { CAPABILITIES } from '/capabilities.js'
import { palette } from './palette.js'
import { asksHtml } from './added.js'

/**
 * @import { SideView } from './stats.js'
 * @import { Board, Card, Floor } from '../../src/bridge/board.ts'
 * @import { Attention } from '../../src/bridge/life.ts'
 * @import { Attended, Heed, Move } from '../../src/shared/cards.ts'
 * @import { BoardError } from '../../src/shared/shelf-page.ts'
 * @import { Action, Added } from '../../src/shared/extensions.ts'
 * @import { Subject } from '../../src/shared/subjects.ts'
 * @import { BriefMarkdown } from '../../src/shared/brief.ts'
 * @import { Call, Replies } from '../../src/shared/api.ts'
 * @import { Viewer } from '../../src/shared/viewer.ts'
 * @import { DiffLayout, StatsRange } from '../../src/shared/panels.ts'
 * @import { Executors, Handlers, Loop, StateEffect, TimerEffect } from '../../src/shared/loop.ts'
 * @import { AttendEffect, AttendEvent, Attending } from '../../src/shared/attend.ts'
 * @import { MainView, Pane } from './view.js'
 * @import { SpawnEvent, Spawning } from '../../src/shared/spawn.ts'
 * @import { Draft } from '../../src/shared/drafts.ts'
 * @import { Pick } from '../../src/shared/palette.ts'
 * @import { Capability } from '../../src/shared/capabilities.ts'
 */

document.head.append(Object.assign(document.createElement('style'), { textContent: panelsCss + settingsCss + itemsCss + briefCss + markdownCss + toastsCss }))
watchTips(document)

/** The board drawn until the first arrives: one with nothing on it. */
const BLANK = /** @type {Board} */ (/** @type {unknown} */ ({ user: { name: 'user' }, keys: DEFAULT_KEYS, floors: [], waiting: [], offers: [], asks: [], adds: {}, rateLimits: [], probes: [], extensions: [], hostUp: false, hostOutdated: false, claudeUntested: [], shells: [], termsUp: false }))
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
const selected = () => {
  const v = view()
  return v.t === 'worker' ? v.id : undefined
}
/** The main pane's view while it is a `t`. @template {MainView['t']} T @param {T} t */
const viewing = (t) => {
  const v = view()
  return v.t === t ? /** @type {Extract<MainView, { t: T }>} */ (v) : undefined
}
/** What this viewer keeps in `tower.store` for every renderer of theirs, as the page's machine holds it. */
const viewer = () => page.state().viewer

/** @template {keyof Viewer} K @param {K} field @param {Viewer[K]} value */
const keepViewer = (field, value) => page.dispatch(/** @type {PageEvent} */ ({ type: 'keep', field, value }))

function render() {
  const all = cards()
  const duty = all.filter(onDuty)
  /** @param {Attention} a */
  const count = (a) => duty.filter((c) => c.attention === a).length
  const waiting = heededWaits(board(), heed()).length
  const offered = heededOffers(board(), heed()).length + heededAsks(board(), heed()).length
  document.title = waiting + offered ? `(${waiting + offered}) The Tower` : 'The Tower'
  paintOnce($('tally'), `<span class="chip waits ${loudest(waitsOnYou()) ?? 'quiet'} ${waiting ? 'some' : ''}" tabindex="0" data-tip="${esc(`${WAITING_NAME}: ${WAITING_MEANS}`)}"><span class="lamp"></span><b>${waiting}</b> ${WAITING_NAME}</span>` +
    (offered ? `<span class="chip offered some" tabindex="0" data-tip="${esc(withKeys("policies' slots offered and not yet started, and what extensions ask of you, that you haven't dismissed: the next waiting goes to them after the workers waiting on you", 'next-waiting'))}"><span class="lamp"></span><b>${offered}</b> offered</span>` : '') +
    /** @type {Attention[]} */ (['needs', 'ready', 'working', 'quiet', 'broken'])
      .map((a) => `<span class="chip ${a}" tabindex="0" data-tip="${esc(`${ATTENTION_NAME[a]}: ${ATTENTION_MEANS[a]}\n\n${ON_DUTY_MEANS}`)}"><span class="lamp"></span><b>${count(a)}</b> ${ATTENTION_NAME[a]}</span>`).join(''))
  const host = lostAt() ? 'unknown' : hostState(board())
  paintOnce($('host'), `<span class="host-state ${HOST_ATTENTION[host]}" tabindex="0" data-tip="${esc(HOST_MEANS[host])}"><span class="lamp"></span>${HOST_NAME[host]}</span>`)
  $('notes').innerHTML = `${claudeUntestedHtml(board()) ?? ''}${asksHtml(board(), heededAsks(board(), heed()).filter((a) => !projectOfKey(board(), a.subject)), pageNow())}`
  paintKeys()
  paintLimits()
  const floors = $('floors')
  // The selected worker's row stays where a move or a click left it while in sight, so a move key's target stays in view.
  keepingFocus(floors, () => redrawHeld(floors, floorsTopDown().map(floorHtml).join(''), sightAnchorOf(floors, selected()) ?? topAnchorOf(floors)))
  drawSideView()
  repaint($('rail'), railHtml(waiting))
  $('side-foot').innerHTML = board().config ? `<span>config</span><code data-tip="${esc(board().config)}"><bdi>${esc(board().config)}</bdi></code>${fileButtonsHtml(board().config)}` : ''
  const c = selected() && findCard(selected())
  followChanges(c || undefined)
  if (c) barHtml(c)
  if (drafting()) draftHeadHtml()
  if (viewing('item')) drawItem()
  if (viewing('archive')) drawArchive()
  if (viewing('policies')) drawPolicies()
  if (viewing('collection')) drawCollection()
  if (!selected()) repaint($('sky'), skylineHtml())
  paintSky()
  renderDock()
  drawSettings()
  tick()
}

function tick() {
  paintTip()
  if (mainClass(view()) === 'home') paintSky()
  paintLimits()
  for (const el of document.querySelectorAll('[data-since]')) el.textContent = ago(pageNow() - Number(el.dataset.since))
}

/**
 * The page's machine: the board drawn, why there is none live and since when the tower is lost, the viewer's record,
 * what the main pane shows, what the viewer is told about waits and offers (`/attend.js`, which also holds whether the
 * window has their eye and the worker the view is on, told by the `focus`, `visible` and `watch` events) and the waits
 * and offers N visited this round (`Heed` in cards.ts). The view and the rings follow one selection because every
 * handler that sets `view` does it through `viewed`, which tells attention.
 * @typedef {{ board: Board | undefined, error: BoardError | undefined, lostAt: number | undefined, viewer: Viewer, view: MainView, attending: Attending, visited: ReadonlySet<string> }} PageState
 * @typedef {{ [K in keyof Viewer]: { type: 'keep', field: K, value: Viewer[K] } }[keyof Viewer]} ViewerKept
 * @typedef {AttendEvent | { type: 'stored', viewer: Viewer } | ViewerKept | { type: 'board-error', error: BoardError, at: number } | { type: 'next-waiting' }
 *   | { type: 'go', view: MainView } | { type: 'reopen', view: MainView } | { type: 'saved', id: string | undefined }
 *   | { type: 'typed' } | { type: 'autosave' } | { type: 'hold-draft' }} PageEvent
 * @typedef {Exclude<AttendEffect, StateEffect<Attending>> | ViewerKept | StateEffect<PageState> | TimerEffect<PageEvent>
 *   | { type: 'leave', view: MainView } | { type: 'enter', view: MainView } | { type: 'hash', hash: string } | { type: 'draw' }
 *   | { type: 'attend-to', to: Attended } | { type: 'toast', message: string } | { type: 'save-draft' }} PageEffect
 */

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
const moved = (s, view) => viewed(s, view, [{ type: 'leave', view: s.view }, { type: 'enter', view }, { type: 'hash', hash: hashOf(view) }, { type: 'draw' }])

/** The one way a handler sets `view`: attention hears of the worker the view is on, then `effects` follow. @param {PageState} s @param {MainView} view @param {PageEffect[]} effects @returns {PageEffect[]} */
const viewed = (s, view, effects) =>
  chain({ ...s, view }, [(s) => attend(s, { type: 'watch', at: s.view.t === 'worker' ? s.view.id : undefined }), () => effects])

/** @type {Handlers<PageState, PageEvent, PageEffect>} */
const pageHandlers = {
  board: (s, e) => chain({ ...s, board: e.board, error: undefined }, [(s) => marked(s, false, 0), (s) => attend(s, e)]),
  'board-error': (s, { error, at }) => marked({ ...s, error }, error.code === 'disconnected', at),
  lost: attend,
  stored: (s, e) => attend({ ...s, viewer: { ...s.viewer, ...e.viewer } }, e),
  keep: (s, e) => [into({ ...s, viewer: { ...s.viewer, [e.field]: e.value } }), e],
  'next-waiting': (s) => {
    const attended = attentionOrder(s.board ?? BLANK, heedOf(s))
    const step = nextAttended(attended, s.visited, { id: s.view.t === 'worker' ? s.view.id : undefined, policies: s.view.t === 'policies' ? s.view.project : undefined })
    return [into({ ...s, visited: step.visited }), step.to ? { type: 'attend-to', to: step.to } : { type: 'toast', message: attended.length ? 'Nobody else is waiting on you' : 'Nobody is waiting on you' }]
  },
  typed: () => [{ type: 'timer/start', id: 'autosave', ms: AUTOSAVE_MS, fire: { type: 'autosave' } }],
  autosave: () => [{ type: 'save-draft' }],
  'hold-draft': () => [{ type: 'timer/cancel', id: 'autosave' }],
  dismiss: attend,
  ring: attend,
  remind: attend,
  focus: attend,
  visible: attend,
  watch: attend,
  go: (s, { view }) => (sameRoom(s.view, view) ? viewed(s, view, [{ type: 'hash', hash: hashOf(view) }, { type: 'draw' }]) : moved(s, view)),
  reopen: (s, { view }) => moved(s, view),
  saved: (s, { id }) => {
    if (s.view.t !== 'draft') return []
    const view = { ...s.view, id }
    return viewed(s, view, [{ type: 'hash', hash: hashOf(view) }, { type: 'draw' }])
  },
}

/** @type {Loop<PageState, PageEvent>} */
const page = loop({
  state: { board: undefined, error: undefined, lostAt: undefined, viewer: await readViewer(tower.store.get), view: HOME, attending: attending({ focused: document.hasFocus(), visible: document.visibilityState === 'visible' }), visited: new Set() },
  handlers: pageHandlers,
  execute: {
    .../** @type {Executors<TimerEffect<PageEvent>, PageEvent>} */ (timers()),
    announce: ({ text }) => announce(text),
    notify: ({ attended: a }) => {
      if (Notification.permission === 'granted') alerts.set(a.key, isOffer(a) ? showOfferAlert(a) : isAsk(a) ? showAskAlert(a) : showAlert(/** @type {Card} */ (findCard(a.id)), a))
    },
    unnotify: ({ key }) => (alerts.get(key)?.close(), alerts.delete(key)),
    sound: ({ sound }) => playSound(SOUNDS[sound]),
    keep: ({ field, value }) => tower.store.set(VIEWER_KEYS[field], value),
    'attend-to': ({ to }) => (isOffer(to) ? openPolicies(to.project) : isAsk(to) ? goToSubject(to.subject) : moveTo(to.id)),
    toast: ({ message }) => toast(message),
    'save-draft': () => void saveNow(),
    leave: ({ view: v }) => {
      $('main').classList.remove(mainClass(v))
      LEAVE[v.t]()
    },
    enter: ({ view: v }) => {
      closeDrawer()
      $('main').classList.add(mainClass(v))
      if ('project' in v) {
        const colour = paint(v.project)
        $(VIEW_ELEMENT[v.t]).style.cssText = colour
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
const select = (id) => go({ t: 'worker', id, pane: undefined })

const goHome = () => go(HOME)

/**
 * A session the page started, opened once the board carries it: the host answers before the tower has read the new
 * log, and until then there is no card to draw and no screen to stream. Any other way the viewer goes cancels it.
 * @param {string} id
 */
const selectArriving = (id) => go(findCard(id) ? { t: 'worker', id, pane: undefined } : { t: 'arriving', id })

/**
 * The viewer's appearance, kept by tower.js in this browser for every page of theirs, on the root that the stylesheet
 * reads; terminals, the framed documents, the open shelf page and the settings follow it whenever it changes.
 */
const scheme = tower.scheme

page.dispatch({ type: 'stored', viewer: viewer() })

const { callsign, cards, paint, waitsOnYou, floorsTopDown, letGoHtml, unresumableHtml, heldWhy, heldHtml, withKeys, floorOf } = boardKit({ findCard: (id) => findCard(id), board, heed, lostAt })

const { findCard, readArchive, freshArchives, lookUp, openArchive, enterArchive, drawArchive } = archive({ cards, board, floorOf, render, heldWhy, heldHtml, selected, callsign, unresumableHtml, go, paint, viewing })

const { draftIo, draftTitle, pruneDraftTitles, newDraftHtml, drafting, draftHeadHtml, openDraft, enterDraft, leaveDraft, saveNow, followDraft, settleConflict, deleteSent, sendDraft, openTransfer, deleteDraft } = draft({ render, cards, floorOf, board, heldWhy, heldHtml, go, goHome, page, openSpawn: (project, sent) => openSpawn(project, sent), floorsTopDown, paint, callsign, findCard, select })

const { showLanding, showKeys, ask } = dialogs({ board })
const { keptTitle, pruneKeptTitles, isOpenItem, openPolicies, openCollection, drawCollection, drawPolicies, policyCall, leaveItem, forgetItem, openItem, drawItem, deleteKept } = keptViews({ render, viewing, go, floorOf, goHome, draftTitle, newDraftHtml, board, page, selectArriving, view, ask })

const { showBrief, redrawBrief, copySaid, chooseBriefMarkdown } = briefPane({ findCard, viewer, keepViewer, drawSettings: () => drawSettings() })

const { alerts, playSound, showShownAlert, showOfferAlert, showAskAlert, showAlert } = alerting({ callsign, select, showPane: (pane) => showPane(pane), floorOf, board, openPolicies, goToSubject: (key) => goToSubject(key) })

const { drawSettings } = settingsPane({ page, viewer, playSound })

const { floorInView, drawSideView, sideView } = await stats({ view, findCard, floorsTopDown, board, viewer, lostAt })

const { showMode, termFont, openTerm, terminal, isOwner, closeTerminal, enterWorker, applyTermFont, leaveTerminal, rescheme } = screen({ board, scheme, run, reopen, refontShell: () => refontShell() })

const { shellFloor, renderDock, refontShell, reschemeShell, toggleShell, spawnShell, spawnShellAt, focusShell, focusedShell, openShellId, closeShell } = shells({ board, floorInView, paint, floorOf, termFont, scheme, run, showMode })
const { paintTip } = tipStrip({ viewer, keys: () => board().keys, now: pageNow })

const { changeReads, reviewing, followChanges, changesTally, toggleViewed, toggleFold, toggleTreeFold, gotoFile, dropPick, resetDesk, drawChanges, pickLine, keepsThreads, threadReads, followThread, reviewsTally, addPicked, addWritten, sendNotes, drawReviews, replyTo, showAnchor, clearReply, openThread } = review({ render, lostAt, paneOf: (c) => paneOf(c), selected, findCard, board, viewer, floorOf, callsign, showPane: (pane) => showPane(pane), openItem, select })

const { barHtml, paneOf, PANE_COMMAND, unshow, forgetShown, showPane, noticeShown, sendHome } = await worker({ callsign, floorOf, heldWhy, heldHtml, letGoHtml, terminal, selected, openTerm, isOwner, board, heed, viewing, changesTally, keepsThreads, reviewsTally, render, reviewing, followThread, drawChanges, drawReviews, showBrief, go, watchedOf, page, showShownAlert, cards, selectArriving, ask })

const { openShelf, enterShelf, leaveShelf, sendScheme, showDoc } = shelf({ viewing, go, floorOf, paint, rereadViewer, render, select, goHome, view, board })

const { paintSky, skylineHtml } = skyline({ callsign, paint, board, heed, cards, heldWhy, heldHtml })

const { toggleSection, toggleCrewFold, forgetFold, toggleFloor, floorHtml, paintLimits, railHtml, paintKeys, closeDrawer, toggleSide } = await sidebar({ render, selected, callsign, heldWhy, heldHtml, letGoHtml, unresumableHtml, board, pageNow, floorOf, paint, viewer, keepViewer, findCard, isOpenItem, viewing, draftTitle, drafting, newDraftHtml, keptTitle, heed, withKeys })


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
  if (does.t === 'command') return void run(does.id, new KeyboardEvent('keydown'))
  if (does.t === 'patterns') return void showPatterns()
  if (does.t === 'learn') return learnPick(does.id)
  if (does.t === 'added') return void runAddedAt(row, does)
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
  if (verb === 'review') return void hireReviewer(row, c)
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

const { openPalette, showPatterns } = await palette({ board, selected, draftTitle, heed, pick: doPick })

/** Where each view draws, painted in its floor's colour as it opens. */
const VIEW_ELEMENT = /** @type {const} */ ({ shelf: 'shelf-view', archive: 'archive-view', policies: 'policies-view', collection: 'collection-view', draft: 'draft-view', item: 'item-view' })

/** What a view sets up as it opens, beside its class on the main pane and its colour. @type {{ [T in MainView['t']]: (v: Extract<MainView, { t: T }>) => void }} */
const ENTER = {
  home: () => {},
  arriving: () => {},
  worker: (v) => (forgetFold(), resetDesk(), enterWorker(v.id)),
  shelf: enterShelf,
  archive: (v) => enterArchive(v.project),
  policies: () => {},
  collection: () => {},
  draft: (v) => void enterDraft(v),
  item: () => {},
}

/** What only the view open holds, let go as it closes. @type {{ [T in MainView['t']]: () => void }} */
const LEAVE = {
  home: () => {},
  arriving: () => {},
  worker: () => {
    closeTerminal()
    $('main').classList.remove('asking', 'on-brief', 'on-changes', 'on-reviews', 'on-shown')
  },
  shelf: leaveShelf,
  archive: () => {},
  policies: () => {},
  collection: () => {},
  draft: leaveDraft,
  item: leaveItem,
}

addEventListener('focus', () => page.dispatch({ type: 'focus', focused: true }))
// The window blurs as focus moves into one of the page's own frames, where the document still has it once focus settles.
addEventListener('blur', () => setTimeout(() => page.dispatch({ type: 'focus', focused: document.hasFocus() })))
document.addEventListener('visibilitychange', () => page.dispatch({ type: 'visible', visible: document.visibilityState === 'visible' }))

/** The viewer's record as `tower.store` keeps it now: another renderer of theirs may have changed it. */
async function rereadViewer() {
  const was = viewer()
  page.dispatch({ type: 'stored', viewer: await readViewer(tower.store.get) })
  if (viewer().statsRange !== was.statsRange) sideView.dispatch({ type: 'range', range: viewer().statsRange })
  if (viewer().briefMarkdown !== was.briefMarkdown) redrawBrief()
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
  const subject = isCommand(action) ? subjectAt(board(), key) : undefined
  if (isCommand(action) && !subject) return toast('That is no longer on the board')
  const words = actionWords(board(), action)
  if (words.destructive && !(await ask(`${words.label}?`, words.label))) return
  await told(pressing(el, () => (isCommand(action) ? runCommand(board(), action, /** @type {Subject} */ (subject)) : runVerb(action))))
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
  draftIo,
  held: async (d) => d,
  kept: (d) => void (drafting() === d && ($('draft-text').value = d.text)),
  shown: () => {},
  started: async (id, d) => {
    if (d) await deleteSent(d)
    selectArriving(id)
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

/** Hires a reviewer of `author`'s work in a fork of its checkout. @param {HTMLElement} button @param {Card} author */
async function hireReviewer(button, author) {
  const r = await told(pressing(button, async () => tower.run(offeredCall(author, 'review', author.callsign))))
  if (r) toast(`A reviewer of ${callsign(author.id)} starts in ${/** @type {NonNullable<Replies['spawn']['cut']>} */ (r.cut).name}, a fork of ${author.checkout}`)
}

/** Ends everything a worker left running, asked first. @param {HTMLElement} button @param {Card} c */
async function reapAll(button, c) {
  if (await ask(reapAsk(c), 'End them')) told(pressing(button, async () => tower.run(offeredCall(c, 'reap', c.callsign))))
}

/** Does all a floor's Tidy lists, asked first with the list. @param {HTMLElement} button @param {Floor} f */
async function tidyAll(button, f) {
  if (await ask(tidyAllAsk(f, Date.now()), verbLabel('floor', 'tidy'))) told(pressing(button, async () => tower.run(offeredCall(f, 'tidy', f.name)))).then((r) => r && toast(tidiedLine(r)))
}

/** Opens one of a floor's dirs in the user's editor. @param {HTMLElement} button @param {Floor} f @param {string} dir */
const openInEditor = (button, f, dir) => told(pressing(button, async () => tower.run(offeredCall(f, 'editor', f.name), { dir })))

/** @param {HTMLElement} button @param {Card} c */
async function letGo(button, c) {
  if (!(await ask(letGoAsk(c), verbLabel('card', 'let-go')))) return
  if (await told(pressing(button, async () => tower.run(offeredCall(c, 'let-go', c.callsign))))) toast(letGoneLine(c))
}

/** A file's Finder and editor buttons, wherever they are drawn, before any other click handling sees the click. */
document.addEventListener(
  'click',
  (e) => {
    const file = fileCall(/** @type {Element} */ (e.target))
    if (!file) return
    e.stopPropagation()
    told(tower.run(file))
  },
  true,
)

/** A link goes where its href says: a worker's `#<id>` reaches `route` as the hash changes. */
document.addEventListener('click', async (e) => {
  const target = /** @type {Element} */ (e.target)
  if (target.closest('a[href]')) return
  const spawn = target.closest('[data-spawn]')
  if (spawn) return openSpawn(/** @type {string} */ (spawn.dataset.spawn))
  const newDraft = target.closest('[data-new-draft]')
  if (newDraft) return openDraft(/** @type {string} */ (newDraft.dataset.newDraft))
  const kept = target.closest('[data-kept]')?.dataset.kept
  const listed = target.closest('[data-collection]')?.dataset.collection
  if (listed) {
    const { project, collection } = keptOf(listed)
    return openCollection(project, collection)
  }
  if (kept) {
    const { project, collection, id } = keptOf(kept)
    return collection === DRAFTS ? openDraft(project, id) : openItem(project, collection, id)
  }
  if (target.closest('[data-item-act=delete]')) return deleteKept()
  if (target.closest('[data-item-read]')) return (forgetItem(), render())
  const copy = target.closest('[data-copy]')?.dataset.copy
  if (copy) return copyText(copy, copy)
  const said = target.closest('[data-copy-said]')?.dataset.copySaid
  if (said) return copySaid(said)
  const code = target.closest('[data-copy-code]')
  if (code) return copyText(fenceText(code), 'the code')
  const markdown = /** @type {BriefMarkdown | undefined} */ (target.closest('[data-brief-markdown]')?.dataset.briefMarkdown)
  if (markdown) return chooseBriefMarkdown(markdown)
  const files = target.closest('[data-changes-files]')?.dataset.changesFiles
  if (files) return (keepViewer('changesTree', files === 'shown'), render())
  const tips = target.closest('[data-tips]')?.dataset.tips
  if (tips) return (keepViewer('tips', tips === 'on'), render())
  if (target.closest('[data-tips-again]')) return (keepViewer('tipsDismissed', []), render())
  const dismissTip = target.closest('[data-tip-dismiss]')?.dataset.tipDismiss
  if (dismissTip) return (keepViewer('tipsDismissed', [...viewer().tipsDismissed, dismissTip]), render())
  const tipRun = target.closest('[data-tip-run]')?.dataset.tipRun
  if (tipRun) return run(tipRun, new KeyboardEvent('keydown')) || toast(`Not from here: ${COMMANDS.find((c) => c.id === tipRun)?.does}`)
  const draftAct = target.closest('[data-draft-act]')?.dataset.draftAct
  if (draftAct === 'send') return sendDraft()
  if (draftAct === 'transfer') return openTransfer()
  if (draftAct === 'delete') return deleteDraft()
  if (draftAct === 'reload' || draftAct === 'keep') return settleConflict(draftAct === 'reload')
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
    const probe = /** @type {Board['probes'][number]} */ (board().probes.find((p) => p.name === probeRun.dataset.probeRun))
    return told(pressing(probeRun, async () => tower.run(offeredCall(probe, 'run', `probe ${probe.name}`)))).then((r) => r && toast(probedLine(probe.name, r)))
  }
  const tidyCall = target.closest('[data-tidy-call]')
  if (tidyCall) return (await ask(/** @type {string} */ (tidyCall.dataset.tidyAsk), 'Tidy')) && told(pressing(tidyCall, () => tower.run(/** @type {Call<'tidy'>} */ (JSON.parse(/** @type {string} */ (tidyCall.dataset.tidyCall)))))).then((r) => r && toast(tidiedLine(r)))
  const tidy = target.closest('[data-tidy]')
  if (tidy) return tidyAll(tidy, /** @type {Floor} */ (floorOf(/** @type {string} */ (tidy.dataset.tidy))))
  const picked = target.closest('[data-pick]')?.dataset.pick
  if (picked) return pickLine(picked, e.shiftKey)
  const pickAdd = target.closest('[data-pick-add]')
  if (pickAdd) return addPicked(pickAdd)
  if (target.closest('[data-pick-cancel]')) return (dropPick(), drawChanges())
  const noteAdd = target.closest('[data-note-add]')
  if (noteAdd) return addWritten(noteAdd)
  const reply = target.closest('[data-reply]')?.dataset.reply
  if (reply) return replyTo(Number(reply))
  if (target.closest('[data-reply-clear]')) return clearReply()
  const toNote = target.closest('[data-to-note]')?.dataset.toNote
  if (toNote) return $('reviews').querySelector(`[data-note="${toNote}"]`)?.scrollIntoView({ block: 'center' })
  const anchored = target.closest('[data-anchor]')?.dataset.anchor
  if (anchored) return showAnchor(anchored)
  const send = target.closest('[data-send]')
  if (send) return sendNotes(send, /** @type {Card} */ (findCard(selected())))
  const thread = target.closest('[data-thread]')?.dataset.thread
  if (thread) return openThread(.../** @type {[string, string]} */ (thread.split('|')))
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
  const dismissed = target.closest('[data-dismiss]')?.dataset.dismiss
  if (dismissed) return dismissWait(dismissed)
  const offerDismissed = target.closest('[data-offer-dismiss]')?.dataset.offerDismiss
  if (offerDismissed) return dismissWait(offerDismissed)
  const policies = target.closest('[data-policies]')?.dataset.policies
  if (policies) return openPolicies(policies)
  const policyButton = target.closest('[data-policy-call]')
  if (policyButton) return policyCall(policyButton, JSON.parse(/** @type {string} */ (policyButton.dataset.policyCall)))
  const policyFile = target.closest('[data-policy-open]')?.dataset.policyOpen
  if (policyFile) return openItem(/** @type {Extract<MainView, { t: 'policies' }>} */ (viewing('policies')).project, POLICIES, policyFile)
  const worker = target.closest('[data-worker]')?.dataset.worker
  if (worker) return select(worker)
  const unshowKey = target.closest('[data-unshow]')?.dataset.unshow
  if (unshowKey) return unshow(unshowKey)
  const out = target.closest('[data-out]')?.dataset.out
  if (out) return window.open(out, '_blank', 'noreferrer')
  const pane = /** @type {Pane | undefined} */ (target.closest('[data-pane]')?.dataset.pane)
  if (pane) return showPane(pane)
  const viewed = target.closest('[data-viewed]')?.dataset.viewed
  if (viewed) return toggleViewed(viewed)
  const fold = target.closest('[data-fold]')?.dataset.fold
  if (fold) return toggleFold(fold)
  const layout = /** @type {DiffLayout | undefined} */ (target.closest('[data-changes-layout]')?.dataset.changesLayout)
  if (layout) return (keepViewer('diffLayout', layout), drawChanges())
  if (target.closest('[data-changes-tree]')) return (keepViewer('changesTree', !viewer().changesTree), drawChanges())
  const treeFold = target.closest('[data-tree-fold]')?.dataset.treeFold
  if (treeFold) return toggleTreeFold(treeFold)
  const goto = target.closest('[data-goto-file]')?.dataset.gotoFile
  if (goto) return gotoFile(goto)
  if (target.closest('[data-changes-read]')) return (changeReads.dispatch({ type: 'retry', id: /** @type {string} */ (selected()) }), render())
  const open = target.closest('[data-open]')
  if (open) return openInEditor(open, /** @type {Floor} */ (floorOf(/** @type {string} */ (open.dataset.openProject))), /** @type {string} */ (open.dataset.open))
  const shelved = target.closest('[data-shelf]')
  if (shelved) return openShelf(/** @type {string} */ (shelved.dataset.shelf), Number(shelved.dataset.n))
  const doc = target.closest('[data-doc]')
  if (doc) return showDoc(/** @type {string} */ (doc.dataset.doc))
  if (target.closest('[data-archive-read]')) return (readArchive(/** @type {Extract<MainView, { t: 'archive' }>} */ (viewing('archive')).project), render())
  const reread = target.closest('[data-thread-read]') && threadWant(board().floors, cardThread(/** @type {Card} */ (findCard(selected()))))
  if (reread) return (threadReads.dispatch({ ...reread, type: 'refresh' }), render())
  if (target.closest('[data-shelf-retry]')) {
    const { project, n } = /** @type {Extract<MainView, { t: 'shelf' }>} */ (viewing('shelf'))
    return reopen({ t: 'shelf', project, n, file: undefined })
  }
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
  if (archive) return viewing('archive')?.project === archive ? goHome() : openArchive(archive)
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
  if (act === 'send-home') return sendHome(/** @type {HTMLElement} */ (actor), /** @type {Card} */ (findCard(selected())))
  if (act === 'review') return hireReviewer(/** @type {HTMLElement} */ (actor), /** @type {Card} */ (findCard(selected())))
  if (act === 'home') return goHome()
  if (act === 'drive') {
    showPane('screen')
    return terminal()?.focus()
  }
  const crewFolded = target.closest('[data-crew-fold]')?.dataset.crewFold
  if (crewFolded) return toggleCrewFold(crewFolded)
  const away = target.closest('[data-away]')?.dataset.away
  if (away) return moveTo(away)
  const card = target.closest('[data-id]')
  if (card) select(/** @type {string} */ (card.dataset.id))
})
$('home').onclick = goHome

function redrawDocs() {
  forgetShown()
  const file = viewing('shelf')?.file
  if (file) showDoc(file)
  const item = viewing('item')
  if (item && readsText(itemKind(item.id))) forgetItem()
  render()
}

function applyScheme() {
  rescheme()
  reschemeShell()
  redrawDocs()
}

tower.onScheme(applyScheme)
tower.prefs.on(() => (applyTermFont(), redrawDocs(), sendScheme(), drawSettings()))

const isTyping = () => ['INPUT', 'TEXTAREA', 'SELECT'].includes(/** @type {string} */ (document.activeElement?.tagName)) || $('confirm').open || $('spawn').open || $('transfer').open || $('keys').open || $('landing').open || $('palette').open || $('patterns').open

/** Shows a pane the selected worker has, with focus in its terminal or on its tab, from where Tab enters it. */
/** @param {Pane} pane */
function toPane(pane) {
  if (!selected() || !$('bar-line').querySelector(`[data-pane=${pane}]`)) return false
  showPane(pane)
  if (pane === 'screen') terminal()?.focus()
  else /** @type {HTMLElement} */ ($('bar-line').querySelector(`[data-pane=${pane}]`)).focus()
  return true
}

/** From any shell, hides the dock's view of it and returns to the worker's terminal; else to the worker's shell, started when none runs there. */
function shellHere() {
  const c = selected() && findCard(selected())
  if (!c) return false
  if (focusedShell()) return (closeShell(), toPane('screen'))
  const there = board().shells.filter((sh) => sh.cwd === c.cwd)
  if (there.length) focusShell((there.find((sh) => sh.id === openShellId()) ?? there[0]).id)
  else void spawnShellAt(c.project, c.cwd)
  return true
}

/** Runs the keymap's command `id` for the keydown `e`. Returns whether it did something. @param {string} id @param {KeyboardEvent} e */
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
  if (id === 'home' && view().t !== 'home') return (goHome(), true)
  return false
}

/**
 * A terminal's own key handler already ran the keys typed into it; a field's listener, the field's. No shortcut runs
 * behind an ask: what it asks about was read as it opened.
 */
document.addEventListener('keydown', (e) => {
  if (e.defaultPrevented || $('confirm').open) return
  const id = commandOf(board().keys, e, isTyping() ? 'field' : 'page')
  if (id && run(id, e)) e.preventDefault()
})

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
  showBoardError()
  noticeShown(cards())
  freshArchives()
  pruneDraftTitles(board().floors)
  pruneKeptTitles(board().floors)
  void followDraft()
  const arriving = viewing('arriving')
  if (arriving && findCard(arriving.id)) return select(arriving.id)
  const wanted = first && location.hash.slice(1)
  if (wanted) return route(wanted)
  render()
})

/** Opens what a hash (without its `#`) names, a worker of an archive read first; the skyline when it names nothing. @param {string} wanted */
async function route(wanted) {
  const named = viewOf(wanted, board())
  if (named.t !== 'lookup') return go(named)
  go(await lookUp(named.id) ? { t: 'worker', id: named.id, pane: named.pane } : HOME)
}

/** Every view writes its own hash in place, so the hash changes only by a link, the history or the address bar. */
addEventListener('hashchange', () => opened() && location.hash !== hashOf(view()) && route(location.hash.slice(1)))
setInterval(tick, 1000)
sideView.dispatch({ type: 'side', side: sideView.state().side })
