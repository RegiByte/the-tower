import * as THREE from 'three'
import type { Deleted, Draft } from '../../../extensions/drafts/client/drafts.ts'
import type { Call, VerbAction } from '/lib/extension.js'
import { byKind, keepsThreads, reviewAction, type Act, type ActOf, type ByKind, type Verb } from './acts.ts'
import { briefKey, expandedSaid, openFolds, openTools, saidText, saidWhat, toolCallHtml, toolCallSettled, withWhole, withWholesRead, type BriefMarkdown } from '/lib/brief.js'
import { type StatsRange, STATS_ALL, statsHtml } from '/lib/stats.js'
import { fenceText } from '/lib/markdown.js'
import { keepShownTabs, drawPanel, keepingFocus, failedHtml, fileCall, pressing, itemKind, itemPath, keptOf, readsText } from '/lib/view.js'
import { readViewer, seenOf } from '/lib/viewer.js'
import { actionId, offeredIds, layoutKey, type Layout } from '/lib/layout.js'
import { type Lines, type Subject } from '/lib/board.js'
import { shelfFiles, shelfText, shelfUrl, type Board, type Brief, type Card, type Floor, type ShelfSelf, type Tower } from './api.ts'
import { can, runVerb, pictureOf, rendererUrl, renderersHtml, shelfKind, shelfPage, tidiedLine, ago, cardsOf, heededWaits, current, findCard, gistLine, wordsOf, sendTarget, sentHome, shownHref, workerIn, callOf, noLongerOffered, offeredCall, landedRow, letGoneLine, resumeStranded, shellWhere, strandedOf, WORKTREE_DONE, discardedLine, keptLine, landingHtml } from './cards.ts'
import type { ReadAnswer } from '../../../extensions/quota/client/quota.ts'
import { threadSubjectKey, type AppEvent, type TabTo } from './app.ts'
import type { DeskTab } from './ui.ts'
import { loop, timers, type Executors, type Handlers, type StateEffect, type TimerEffect } from '/lib/machine.js'
import { hueOf } from './avatar.ts'
import { type CatName } from './life.ts'
import { PET_IN, dropHearts, makeHearts, petProgress, petSpot, placeHearts } from './pet.ts'
import { sharing, startShare, stopShare } from './tv.ts'
import { bigScreens, cabinetOf, kioskOf, levelY } from './layout.ts'
import { isMarkdown, type Shown } from './showing.ts'
import { SHELL_SCROLLBACK } from '/lib/terminal.js'
import { activityHtml, keptFileHtml, keptHeadHtml, keptTextHtml, archiveListHtml, archiveSideHtml, askHtml, drawerSideHtml, logbookBriefHtml, logbookHeadHtml, logbookHtml, logbookTabsHtml, sessionsHtml, stampHtml, deskHeadHtml, detailsHtml, deskDismissHtml, deskTabsHtml, directoryHtml, shellPickHtml, docHeadHtml, statsHeadHtml, docHtml, relayedFrameHtml, draftHeadHtml, draftNoteHtml, floorHtml, gameHeadHtml, gameHtml, pictureHeadHtml, shellHeadHtml, shownHtml, shownTab, threadHeadHtml, type LogbookTab } from './ui.ts'
import { commandOf, panesOf } from '/lib/keys.js'
import type { Clock } from './clock.ts'
import { FIXTURE, readArchive, readConversations } from './fixtures.ts'
import { CHANGES, THREAD } from './hosting.ts'
import type { Archive } from './archive.ts'
import { GAMES, gameItem } from './games.ts'
import type { Titles } from './titles.ts'
import { s, type GamePanel, type Panel, type Threads } from './state.ts'
import { paintDirectory } from './world.ts'
import type { Music } from './music.ts'
import type { Term } from './term.ts'
import type { Events } from './events.ts'
import type { Toasts } from './toasts.ts'
import { $, onAppearance, show } from './dom.ts'
import { DRAWN_PANES, MOVE_OF } from './keymap-here.ts'
import { nowOf } from './now.ts'
import type { World } from './building.ts'
import type { Views } from './views.ts'
import type { Spawn } from './spawn.ts'
import type { Hud } from './hud.ts'
import type { Navigation } from './navigation.ts'
import type { Clients } from './clients.ts'
import type { Stage } from './stage.ts'
import type { Port } from './port.ts'

/** What the panels resource is started with. */
export type PanelsDeps = { clock: Clock; tower: Tower; clients: Clients; titles: Titles; archive: Archive; stage: Stage; music: Music; terminal: Term; port: Port; toasts: Toasts; events: Events; world: World; views: Views; spawn: Spawn; hud: Hud; navigation: Navigation }

export type Panels = ReturnType<typeof startPanels>

/**
 * What is drawn beside the world: every panel's enter, leave and draw, the verbs its buttons run, the logbooks and
 * briefs read for it, the draft editor, and the pet's hearts.
 */
export function startPanels(started: PanelsDeps) {
  const { now: wallNow } = started.clock
  const { tower } = started
  const { port } = started
  const { AUTOSAVE_MS, DRAFTS, discard: discardDraft, discardItem, restore: restoreDraft, draftItem, draftsOf, edit, follow, keepsApart, leave, newDraft, openDraft, readDraft, save, sendable, settle, titleOf, THE_USER, floorThreadsOf, threadCheckout, probedLines } = started.clients
  const { camera, scene } = started.stage
  const { keptText, keptTitle } = started.titles
  const { archivedOf, archiveFailure, archiveOf, drawersAt, rereadArchive } = started.archive
  const reads = { ...started.clients, ...started.titles, drawersAt }
  const { pause } = started.music
  const { closeTerm, mountTerm } = started.terminal
  const { boardNow, selfNow, unlock, atDesk, panelNow, panelAs, go, patchPanel, viewNow, motionNow, deskTabNow, replayNow, heed } = nowOf(port)
  const { toast, call, tried, offered, copiedAs } = started.toasts
  const { events } = started
  const { directory, isFresh, planNow, lookQuaternion, flyTo, frameOn, frameCabinet, floorOf, carry, drop } = started.world
  const { desk, reader, deskNow } = started.views
  const { draftIo, hire, saving, handOver, hireOnNote, openSpawn, openSpawnOnNote } = started.spawn
  const { held, answered, startMusic, toggleMusic, renderHud, renderElevator, showPaused, lock, seenSince, keepViewer, dottedNow, sawActions, sawDesk, drawSettings } = started.hud
  const { see, lookAtNew, closeSide, sideClosed, unfocus, closePanels, goShown, goDesk, goShell, goLevel, goMove, nextWaiting, overview, offersNow, aimAt, openShown } = started.navigation

  /**
   * Places a subject a mounted view hands Tower 3D (the kit's `display`): a worker's lines show in its desk's Changes,
   * at the open desk or by going to the worker's; anything else is said in a toast, as the page says what it can't place.
   */
  function display(target: Subject | string) {
    const key = typeof target === 'string' ? target : target.key
    if (typeof target === 'string' || target.kind !== 'lines') return toast(`Nothing here shows ${key}`)
    const lines = target.value as Lines
    if (!findCard(boardNow()!, lines.card)) return toast(`${key} is no longer on the board`)
    if (atDesk() === lines.card) return openChanges(lines)
    port.dispatch({ type: 'pend', pending: { tab: { id: lines.card, tab: 'changes', lines } } })
    goDesk(lines.card)
  }

  function renderPanel() {
    const board = boardNow()
    const panel = panelNow()
    if (!board || !panel) return
    if (panel.kind === 'desk') {
      const c = findCard(board, panel.id)
      // The app closes a desk whose worker left once the building takes the board (`subjectLeft`): a draw before then draws nothing.
      if (!c) return
      $('desk-head').innerHTML = deskHeadHtml(board, c, cardsOf(board), board.floors.find((f) => f.id === c.project), deskNow(board), dottedNow(board), held, tower.framed, wallNow())
      sawDesk(board, c)
      $('desk-tabs').innerHTML = deskTabsHtml(c, board.floors.find((f) => f.id === c.project)!, deskTabNow(), (sh) => isFresh(c, sh), { changes: desk.tabOf(CHANGES, c), reviews: desk.tabOf(THREAD, c) }, reads, wallNow())
      keepShownTabs($('desk-tabs').parentElement!, c.id)
      $('desk-activity').innerHTML = activityHtml(c)
      $('desk-activity').dataset.tip = gistLine(c)
      $('desk-dismiss').innerHTML = deskDismissHtml(board, c, heed())
      $('desk-details').innerHTML = detailsHtml(board, c)
      $('desk-ask').innerHTML = askHtml(c)
      show('desk-ask', c.status === 'needs_input' || c.status === 'blocked')
    }
    if (panel.kind === 'shell') {
      const id = panel.id
      const sh = board.shells.find((sh) => sh.id === id)
      if (!sh) return
      show('desk-ask', false)
      for (const el of ['desk-tabs', 'desk-activity', 'desk-dismiss', 'desk-details']) $(el).innerHTML = ''
      $('desk-head').innerHTML = shellHeadHtml(sh, board.floors.find((f) => f.id === sh.project))
    }
    if (panel.kind === 'floor') {
      const id = panel.id
      const f = board.floors.find((f) => f.id === id)
      if (!f) return
      $('side').innerHTML = floorHtml(board, f, s.origins, tower.framed, held, panel.tray, reads, wallNow())
    }
    if (panel.kind === 'archive') {
      const f = board.floors.find((f) => f.id === panel.id)
      if (!f) return
      if (!$('side').querySelector(`[data-archive-of="${CSS.escape(f.id)}"]`)) $('side').innerHTML = archiveSideHtml(f)
      const { count, html } = archiveListHtml(board, f, archiveOf(f.id), archiveFailure(f.id), panel.words, held)
      $('archive-count').textContent = count
      if ($('archive-list').innerHTML !== html) $('archive-list').innerHTML = html
    }
    if (panel.kind === 'directory') $('side').innerHTML = directoryHtml(planNow(), held, heededWaits(board, heed()), wallNow())
    if (panel.kind === 'shell-pick') keepingFocus($('shell-pick'), () => ($('shell-pick').innerHTML = shellPickHtml(planNow(), board, panel.first, held)))
    if (panel.kind === 'drawer') {
      const f = board.floors.find((f) => f.id === panel.project)
      const d = drawersAt(panel.project)?.[panel.n]
      // The app closes a drawer its floor's archive no longer fills (`subjectLeft`).
      if (!f || !d) return
      $('side').innerHTML = drawerSideHtml(f, d)
    }
    if (panel.kind === 'logbook') {
      const c = findCard(board, panel.card.id) ?? panel.card
      $('doc-head').innerHTML = logbookHeadHtml(c, board.floors.find((f) => f.id === c.project))
      $('logbook-tabs').innerHTML = logbookTabsHtml(panel.tab)
      show('logbook-shot', panel.tab === 'screen')
      show('logbook-text', panel.tab === 'brief')
      $('logbook-sessions').innerHTML = sessionsHtml(c, panel.on, panel.threads)
      $('logbook-text').innerHTML = logbookBriefHtml(board, c, panel.threads, briefLook($('logbook-text')))
    }
    if (panel.kind === 'draft') {
      const d = s.draft!
      const f = board.floors.find((f) => f.id === d.project)
      // The app closes the editor on a floor no longer keeping drafts once the building takes the board (`subjectLeft`).
      if (!f || !draftsOf(f)) return
      $('draft-head').innerHTML = draftHeadHtml(f, d, held, Boolean(s.carrying), reads)
      $('draft-note').innerHTML = d.conflict !== undefined ? draftNoteHtml : ''
      show('draft-note', d.conflict !== undefined)
    }
    if (panel.kind === 'thread') {
      const f = board.floors.find((f) => f.id === panel.project)
      // The view is handed the board while its thread's subject is on it; the app closes it once the building takes a
      // board without it (`subjectLeft`).
      if (!f || !reader.update(board)) return
      const worker = workerIn(f!, panel.checkout)
      $('doc-head').innerHTML = threadHeadHtml(f!, panel.checkout, worker?.onDuty ? worker : undefined)
    }
    if (panel.kind === 'stats') {
      $('doc-head').innerHTML = statsHeadHtml()
      const projects = board.floors.map((f) => ({ id: f.id, label: f.name, color: f.color }))
      const tabs = [{ id: STATS_ALL, label: 'Overview' }, ...projects.map(({ id, label }) => ({ id, label }))]
      const { read: stats, failed, at, scope } = port.state().stats
      const range = s.viewer.statsRange
      drawPanel($('doc-body'), statsHtml({ stats, failed, at, range, projects, tabs, scope: tabs.some((t) => t.id === scope) ? scope : STATS_ALL }), {})
      showSince($('doc-body'))
    }
    if (panel.kind === 'picture') {
      const picture = pictureOf(planNow().galleries, board, panel.id, panel.target)
      // The app closes a picture its gallery no longer hangs once the building takes the board (`subjectLeft`).
      if (!picture) return
      $('doc-head').innerHTML = pictureHeadHtml(picture.worker, picture.card?.onDuty ?? false, picture.shown, `#${hueOf(panel.id).getHexString()}`, wallNow())
    }
    if (panel.kind === 'game') {
      const f = board.floors.find((f) => f.id === panel.project)
      // The app closes a game no longer kept once the building takes the board (`subjectLeft`).
      if (!f || !gameItem([f], panel.project, panel.id)) return
      $('game-head').innerHTML = gameHeadHtml(f, panel.project, panel.id, reads)
    }
    if (panel.kind === 'doc') {
      const f = board.floors.find((f) => f.id === panel.project)
      const entry = f?.shelf?.[panel.n]
      if (!f || !entry) return
      $('doc-head').innerHTML = docHeadHtml(f, entry, tower.framed)
    }
    if (panel.kind === 'kept') {
      const f = board.floors.find((f) => f.id === panel.project)
      const c = f?.collections.find((c) => c.id === panel.collection)
      const item = c?.items.find((i) => i.id === panel.id)
      if (!f || !c || !item) return
      $('doc-head').innerHTML = keptHeadHtml(f, c, item, keptTitle(f.id, c.id, item), wallNow())
    }
  }

  /**
   * Entering the side (a floor's panel, its archive, the directory): the shell picker closed, as it doesn't leave by
   * the app yet, the mouse let go.
   */
  function sideEntered() {
    sideClosed()
    show('side', true)
  }

  const sideLeft = () => show('side', false)

  /** The picker of where a new shell starts, `first`'s floor ahead, its first place focused for the keyboard. */
  const openShellPick = (first: string) => go({ kind: 'shell-pick', first })

  /** Entering the picker: the side closed. */
  function shellPickEntered() {
    sideClosed()
    show('shell-pick', true)
  }

  /** What leaving the focused room does: the terminal closes, and what the desk mounted and showed with it. */
  function focusLeft() {
    s.dotted.clear()
    closeTerm($('desk-screen'))
    show('desk', false)
    show('desk-brief', false)
    hideReviewing()
    closeShown()
    show('watch', false)
    showPaused()
  }

  function closeDoc() {
    const open = panelNow()
    if (open?.kind === 'doc' || open?.kind === 'kept' || open?.kind === 'picture' || open?.kind === 'thread' || open?.kind === 'stats' || open?.kind === 'logbook') go(undefined)
  }

  /** The reader closed as `open` leaves it, the logbook's screen among it. */
  function docClosed(open: Panel) {
    if (open.kind === 'logbook' && open.tab === 'screen') closeTerm($('logbook-screen'))
    show('doc', false)
    closeDocRelay()
    reader.close()
    $('doc-body').innerHTML = ''
    delete $('doc-body').dataset.stats
    delete $('doc-body').dataset.logbook
    statsPolling.dispatch({ type: 'stop' })
  }

  /**
   * The Stats panel is read again every minute while it is open: `start` arms the timer, each `poll` reads and arms the
   * next, `stop` cancels it.
   */
  const STATS_POLL_MS = 60_000

  type StatsPollEvent = { type: 'start' } | { type: 'poll' } | { type: 'stop' }

  type StatsPollEffect = StateEffect<null> | TimerEffect<StatsPollEvent> | { type: 'read' }

  const STATS_POLL: StatsPollEffect = { type: 'timer/start', id: 'poll', ms: STATS_POLL_MS, fire: { type: 'poll' } }

  const statsPollHandlers: Handlers<null, StatsPollEvent, StatsPollEffect> = {
    start: () => [STATS_POLL],
    poll: () => [{ type: 'read' }, STATS_POLL],
    stop: () => [{ type: 'timer/cancel', id: 'poll' }],
  }

  const statsPolling = loop({
    state: null,
    handlers: statsPollHandlers,
    execute: {
      ...(timers<StatsPollEvent>() as Executors<TimerEffect<StatsPollEvent>, StatsPollEvent>),
      read: () => port.dispatch({ type: 'stats/read' }),
    },
  })

  statsPolling.subscribe(events.listen('statsPolling'))

  /** Every floor's stats in the reader where you stand: the overview first, each floor a tab. */
  const openStats = () => go({ kind: 'stats' })

  /**
   * Entering the reader: the picker closed, as it doesn't leave by the app yet, the
   * mouse let go, the reader shown. Entered again from its own kind, which isn't left, the reader is closed first.
   */
  function readerEntered(panel: Panel, from: Panel | undefined) {
    sideClosed()
    if (from?.kind === panel.kind) docClosed(from)
    show('paused', false)
    show('doc', true)
  }

  const readerLeft = (panel: Panel) => docClosed(panel)

  /** Entering the Stats panel: read now, and again every minute while it is open. */
  function statsEntered(panel: Panel, from: Panel | undefined) {
    readerEntered(panel, from)
    $('doc-body').dataset.stats = ''
    port.dispatch({ type: 'stats/read' })
    statsPolling.dispatch({ type: 'start' })
  }

  /** The Stats panel over your range: a read over another, held or in flight, is dropped. */
  const rangeStats = () => port.dispatch({ type: 'stats/range' })

  /**
   * A game beside its cabinet: the camera faces the cabinet's screen in the left half of the view, the game fills the
   * right half in a sandboxed frame and takes the keys, and the music stops until it closes.
   */
  function openGame(project: string, id: string) {
    const at = cabinetOf(planNow(), project, id)
    if (at) go({ kind: 'game', project, id, x: at.cabinet.x })
  }

  /** Entering a game: the picker closed, as it doesn't leave by the app yet, the music paused, the game's frame given the keys, the camera on its cabinet. */
  function gameEntered({ project, id }: GamePanel) {
    sideClosed()
    pause()
    show('paused', false)
    show('game', true)
    $('game-body').innerHTML = gameHtml(project, id)
    const frame = $('game-body').querySelector('iframe')!
    frame.addEventListener('load', () => frame.focus())
    frame.focus()
    frameCabinet(cabinetOf(planNow(), project, id)!)
  }

  /** Leaving a game: its frame emptied, the music back. */
  function gameLeft() {
    show('game', false)
    $('game-body').innerHTML = ''
    startMusic()
  }

  function closeGame() {
    if (panelNow()?.kind === 'game') go(undefined)
  }

  /**
   * A shelf entry where you stand: markdown to read, a page in a frame, a link in a new tab. A url opens outside this
   * page: a frame in it inherits the shelf sandbox (an opaque origin, no forms, no storage), which breaks most web apps.
   * An `html` entry gets the board and the API through `tower.relay`; a renderer opens in the tower's own view when framed, else in a new tab.
   */
  function openShelf(project: string, n: number, file?: string) {
    const entry = boardNow()!.floors.find((f) => f.id === project)?.shelf?.[n]
    if (!entry) return
    if ('link' in entry) return (unlock(), open(entry.link, '_blank', 'noopener'))
    if ('url' in entry) return tower.framed ? tower.ui('shelf', { project, n }) : (unlock(), open(entry.url, '_blank', 'noopener'))
    if (selfNow()?.project === project && selfNow()?.n === n) return toast(`${entry.label} is where you are standing`)
    if ('renderer' in entry) return tower.framed ? tower.ui('shelf', { project, n }) : (unlock(), open(rendererUrl(entry.renderer), '_blank', 'noopener'))
    go({ kind: 'doc', project, n, file })
  }

  /** Entering a shelf entry in the reader: an `html` entry's page relayed, else its files listed and one read, the first unless `file` names one. */
  async function docEntered(panel: Extract<Panel, { kind: 'doc' }>, from: Panel | undefined) {
    readerEntered(panel, from)
    const { project, n, file } = panel
    const entry = boardNow()!.floors.find((f) => f.id === project)!.shelf![n]
    if (shelfKind(entry) === 'html') return relayDoc(shelfUrl(project, n, shelfPage(entry)), { project, n })
    const files = await shelfFiles(tower, project, n).catch((err: Error) => (toast(err.message), []))
    const shown = file ?? files[0]
    const text = shown ? await shelfText(tower, project, n, shown).catch((err: Error) => `*${err.message}*`) : ''
    const doc = panelAs('doc')
    if (doc?.project !== project || doc.n !== n) return
    patchPanel({ ...doc, file: shown })
    $('doc-body').innerHTML = docHtml({ files, file: shown, text, url: shelfUrl(project, n, shown ?? ''), hub: boardNow()!.floors.find((f) => f.id === project)!.hub }, tower.prefs.attributes())
  }

  /** The open `html` entry's page, given the board and the API. Tower 3D reads what it keeps in `tower.store` as it boots. */
  let docRelay: { close(): void } | undefined

  const closeDocRelay = () => (docRelay?.close(), (docRelay = undefined))

  function relayDoc(url: string, self: ShelfSelf) {
    $('doc-body').innerHTML = relayedFrameHtml
    docRelay = tower.relay($('doc-body').querySelector('iframe')!, url, {
      self,
      ui: { select: ({ id }) => goDesk(id), home: () => closePanels(), shelf: ({ project, n }) => openShelf(project, n) },
      stored: () => {},
    })
  }

  /** Opens a kept item where it lives: a draft in its editor, a game at its cabinet, anything else in the reader. */
  function openKept(k: { project: string; collection: string; id: string }) {
    if (k.collection === DRAFTS && boardNow() && draftItem(boardNow()!.floors, k.project, k.id)) return openNote(k.project, k.id)
    if (k.collection === GAMES) return openGame(k.project, k.id)
    const item = boardNow()!.floors.find((f) => f.id === k.project)?.collections.find((c) => c.id === k.collection)?.items.find((i) => i.id === k.id)
    if (!item) return toast('The item was deleted')
    go({ kind: 'kept', ...k, drawn: item.modifiedAt })
  }

  /**
   * Entering a kept item: its body read, a text read that fails said with Read again. Entered again from itself, as the
   * item changes or is read again, the reader stays open on the body it shows until the new one is read.
   */
  async function keptEntered(panel: Extract<Panel, { kind: 'kept' }>, from: Panel | undefined) {
    if (from?.kind !== 'kept') readerEntered(panel, from)
    const c = floorOf(panel.project).collections.find((c) => c.id === panel.collection)!
    const item = c.items.find((i) => i.id === panel.id)!
    if (!readsText(itemKind(item.id))) return ($('doc-body').innerHTML = keptFileHtml(c, item, `/${itemPath(panel.project, c.id, item.id)}`))
    const text = await keptText(panel.project, c.id, item.id).catch((err: Error) => {
      if (panelNow() === panel) $('doc-body').innerHTML = failedHtml(item.tag, err.message, 'data-kept-read')
    })
    if (text === undefined || panelNow() !== panel) return
    $('doc-body').innerHTML = keptTextHtml(item, text, tower.prefs.attributes())
  }

  /** The kept item open, read afresh. */
  function redrawKept() {
    const kept = panelAs('kept')
    if (kept) go(kept)
  }

  /** Deleting is the user's, asked on a second press: the reader closes before the file goes. */
  async function deleteKept(panel: Extract<Panel, { kind: 'kept' }>) {
    const c = floorOf(panel.project).collections.find((c) => c.id === panel.collection)!
    const item = c.items.find((i) => i.id === panel.id)
    if (!item) return toast(noLongerOffered('this item', 'Delete'))
    closeDoc()
    lock()
    if (await call('collection/delete', { project: panel.project, collection: panel.collection, id: panel.id })) toast(`Deleted ${item.tag} from ${c.label}`)
  }

  /** A gallery's picture in the reader where you stand, as its desk's tab shows it; it counts as seen once opened. */
  function openPicture(id: string, target: string) {
    if (!pictureOf(planNow().galleries, boardNow()!, id, target)) return
    go({ kind: 'picture', id, target })
  }

  /** Entering a picture: seen, and drawn in the reader, a markdown one once its text is read. */
  async function pictureEntered(panel: Extract<Panel, { kind: 'picture' }>, from: Panel | undefined) {
    readerEntered(panel, from)
    const { id, target } = panel
    const { worker, shown: sh } = pictureOf(planNow().galleries, boardNow()!, id, target)!
    see(sh)
    $('doc-body').innerHTML = shownHtml(worker.callsign, sh, tower.prefs.attributes())
    if (!isMarkdown(sh)) return
    const md = await tower.text(shownHref(sh).slice(1)).catch((err: Error) => `*${err.message}*`)
    const open = panelAs('picture')
    if (open?.id !== id || open.target !== target) return
    $('doc-body').innerHTML = shownHtml(worker.callsign, sh, tower.prefs.attributes(), md)
  }

  /** A panel of the side whose enter doesn't show it, opened over what is open: a drawer. */
  function openSide(next: Panel) {
    unfocus()
    closeDoc()
    closeDraftPanel()
    go(next)
    renderPanel()
    show('side', true)
  }

  /** At the worker's desk, its panel open on its screen, then on the tab pending for it. */
  function focusDesk(id: string) {
    if (!boardNow() || !findCard(boardNow()!, id)) return
    go({ kind: 'desk', id })
  }

  /**
   * Entering the desk: the picker closed, as it doesn't leave by the app yet, the
   * mouse let go, the desk's panel shown on its screen.
   */
  function deskEntered({ id }: { id: string }) {
    sideClosed()
    s.dotted.clear()
    show('paused', false)
    show('desk', true)
    show('desk-brief', false)
    hideReviewing()
    closeShown()
    mountDeskScreen(findCard(boardNow()!, id)!)
  }

  /**
   * The desk panel's screen: the worker's real terminal, or while a past session of its is replayed, that session's last
   * screen, read-only, sepia under its stamp.
   */
  function mountDeskScreen(c: Card) {
    const id = c.id
    const replaying = replayNow()
    const past = replaying?.id === id ? c.lineage.find((l) => l.id === replaying.session) : undefined
    $('desk-screen').classList.toggle('replay', Boolean(past))
    $('desk-stamp').innerHTML = past ? stampHtml(past.startedAt, true) : ''
    show('desk-stamp', Boolean(past))
    mountTerm($('desk-screen'), {
      path: past ? `screen/${past.id}` : `terminal/${id}`, id: past?.id ?? id, sendKeys: tower.keys, resizeVerb: 'resize', scrollback: 0, wheelReports: true, onError: (err) => toast(err.message), cwd: () => c.cwd,
      onMode: (text, owner) => (($('desk-mode').textContent = text), $('desk-mode').classList.toggle('owner', owner)),
      ...terminalKeys,
      onEnd: () => atDesk() === id && deskTabNow() === 'screen' && terminalEnded(id),
    })
  }

  /**
   * A worker's terminal that ended while you watched it gives way to its logbook, as the page's gives way to the Brief;
   * the Terminal tab still shows its last screen, and a worker with no logbook to read stays on it.
   */
  function terminalEnded(id: string) {
    const c = findCard(boardNow()!, id)
    if (c && can(c, 'brief')) openBrief()
  }

  /** A past session of a worker at a desk on its monitor, and on the desk panel's screen while it is open there. */
  const replay = (id: string, session: string | undefined) => port.dispatch({ type: 'replay', id, session })

  /** A past worker, on the board or in the archive read of the floor whose panel listed it. */
  const pastCard = (id: string) =>
    findCard(boardNow()!, id) ?? archivedOf(id)!

  function focusShell(id: string) {
    if (!kioskOf(planNow(), id)) return
    go({ kind: 'shell', id })
  }

  /** Entering a shell: the desk's panel over its terminal, the drawer and the picker closed as at a desk. */
  function shellEntered({ id }: { id: string }) {
    $('desk-screen').classList.remove('replay')
    show('desk-stamp', false)
    sideClosed()
    show('paused', false)
    show('desk', true)
    show('desk-brief', false)
    mountTerm($('desk-screen'), {
      path: `shell/${id}`, id, sendKeys: tower.shellKeys, resizeVerb: 'shell/resize', scrollback: SHELL_SCROLLBACK, wheelReports: false, onError: (err) => toast(err.message), cwd: () => boardNow()!.shells.find((sh) => sh.id === id)!.cwd,
      onMode: (text, owner) => (($('desk-mode').textContent = text), $('desk-mode').classList.toggle('owner', owner)),
      ...terminalKeys,
      onEnd: () => panelAs('shell')?.id === id && unfocus(),
    })
  }

  /** Up close to a big screen, filling the view. */
  const watch = (n: number) => go({ kind: 'tv', n })

  /** Entering a big screen: the picker closed, as it doesn't leave by the app yet, the screen filling the view. */
  function tvEntered({ n }: { n: number }) {
    const screen = bigScreens(planNow())[n]
    sideClosed()
    show('paused', false)
    show('watch', true)
    frameOn(new THREE.Vector3(screen.x, levelY(screen.level) + screen.y, screen.z), new THREE.Vector3(0, 0, 1), screen.w)
  }

  /** Where this page runs on its own: a declared renderer at its `/r/<name>/` path, a shelf's `html` entry at `/run/…`. */
  const ownUrl = () => (location.pathname.startsWith('/r/') ? location.pathname : `/run/${selfNow()!.project}/${selfNow()!.n}`)

  /**
   * A big screen: once something is shared, watch it; else share something. A page framed in the tower can't capture
   * (src/tv.ts), so there it opens this renderer in a tab of its own, at the lobby's screen.
   */
  function useScreen(n: number) {
    unlock()
    if (sharing()) return watch(n)
    if (tower.framed) return open(`${ownUrl()}#tv`, '_blank', 'noopener')
    startShare(renderHud).then(() => (renderHud(), watch(n)), (err: Error) => toast(`share: ${err.message}`))
  }

  function endShare() {
    stopShare()
    renderHud()
    if (panelNow()?.kind === 'tv') (unfocus(), lock())
  }

  /** A draft deleted, said with an Undo that puts its file back under its id. */
  function deleted(gone: Deleted | undefined) {
    if (gone) toast(`Deleted “${titleOf(gone.text)}” from Drafts`, { label: 'Undo', run: () => undoDelete(gone) })
  }

  const undoDelete = (gone: Deleted) => restoreDraft(draftIo, gone).then(() => toast(`“${titleOf(gone.text)}” is back in Drafts`), (err: Error) => toast(err.message))

  /** A draft pinned on its corkboard thrown away, what it held read first so Undo can put it back. */
  async function throwAway(project: string, id: string) {
    const text = await readDraft(draftIo, project, id).catch((err: Error) => (toast(err.message), undefined))
    if (text !== undefined && (await discardItem(draftIo, project, id))) deleted({ project, id, text })
  }

  /** Ends a worker with everyone under it that runs, the deepest first; the toast offers the resume of one sent home alone. */
  async function sendHome(c: Card) {
    const calls = callOf(c, 'send-home')
    if (!calls) return toast(noLongerOffered(c.callsign, 'send-home'))
    const crew = sentHome(cardsOf(boardNow()!), c)
    for (const call of calls) if (!(await offered(call))) return
    toast(`Sent ${crew.map((h) => h.callsign).join(', ')} home`, crew.length === 1 ? { label: 'Resume', run: () => resumeSentHome(c) } : undefined)
  }

  /** A stranded worker off duty, its conversation left in the floor's archive to resume. */
  async function letWorkerGo(c: Card) {
    if (await tried(() => tower.run(offeredCall(c, 'let-go', c.callsign)))) toast(letGoneLine(c))
  }

  /** Every stranded worker of a floor resumed, one after another. */
  const resumeAll = async (f: Floor) => toast(await resumeStranded(strandedOf(f), tower.run))

  /** A worker sent home, resumed from the board or its floor's archive, read again. */
  async function resumeSentHome(c: Card) {
    const dead = findCard(boardNow()!, c.id) ?? (await readArchive(boardNow()!, c.project).catch((err: Error) => (toast(err.message), [])))?.find((d) => d.id === c.id)
    const call = dead && callOf(dead, 'resume')
    if (!call) return toast(`${c.callsign} can't be resumed now`)
    resume(call)
  }

  /** A worker's verbs, wherever it stands: at its desk, on the wall, as a guest on the roof. */
  function runOnWorker(a: ActOf<'desk' | 'tile' | 'guest'>, verb: Verb) {
    const c = findCard(boardNow()!, a.id)
    if (!c) return
    if (verb === 'resume') return tried(() => resume(offeredCall(c, 'resume', c.callsign)))
    if (verb === 'goto') return goDesk(current(c)!.resumedBy!.id)
    if (verb === 'kill') return sendHome(c)
    if (verb === 'let-go') return letWorkerGo(c)
    if (verb === 'review') {
      const review = reviewAction(boardNow()!, c)
      return review ? tried(() => runVerb(review)) : toast(noLongerOffered(c.callsign, 'review'))
    }
    if (verb === 'reap') return tried(() => tower.run(offeredCall(c, 'reap', c.callsign)))
    if (verb === 'hand') return tried(() => handOver(offeredCall(c, 'submit', c.callsign)))
    if (verb !== 'brief' && verb !== 'thread') return
    if (a.kind === 'guest') return openLogbook(c)
    port.dispatch({ type: 'pend', pending: { tab: { id: c.id, tab: verb === 'brief' ? 'brief' : 'reviews' } } })
    byKind(RUN, a, 'use')
  }

  /** What a verb does to each kind of thing; `use` is the thing's own action. `run` takes the building's verbs first. */
  /** To a floor's panel. */
  const toFloor = (id: string): AppEvent => ({ type: 'go', to: { kind: 'floor', id, tray: undefined } })

  /** What each act's verb does: the event of a transition, which `run` dispatches, or what is done at once. */
  const RUN: ByKind<AppEvent | void, [Verb]> = {
    desk: (a, verb) => void (verb === 'use' ? goDesk(a.id) : runOnWorker(a, verb)),
    papers(a, verb) {
      const c = findCard(boardNow()!, a.id)
      if (!c) return
      if (verb === 'send') return void sendNotes(c.project, threadCheckout(c), c)
      if (verb === 'thread') port.dispatch({ type: 'pend', pending: { tab: { id: a.id, tab: 'reviews' } } })
      goDesk(a.id)
    },
    binder(a) {
      if (!s.desks.has(a.id)) return
      port.dispatch({ type: 'pend', pending: { tab: { id: a.id, tab: 'brief' } } })
      focusDesk(a.id)
    },
    drawer: (a) => openSide({ kind: 'drawer', project: a.project, n: a.n }),
    thread(a, verb) {
      const t = floorThreadsOf(floorOf(a.project)).find((t) => t.checkout === a.checkout)
      if (verb === 'send' && t) return void sendNotes(a.project, a.checkout, sendTarget(floorOf(a.project), a.checkout, undefined))
      openThread(a.project, a.checkout)
    },
    station(a, verb) {
      if (verb === 'use') return void hire(a.project)
      if (verb === 'hand') return void hireOnNote(a.project)
      return void (s.carrying ? openSpawnOnNote(a.project, s.carrying) : openSpawn(a.project))
    },
    shown(a) {
      const latest = findCard(boardNow()!, a.id)?.shown.at(-1)
      if (latest) goShown(a.id, latest.target)
    },
    picture: (a, verb) => (verb === 'use' ? openPicture(a.id, a.target) : goShown(a.id, a.target)),
    tile: (a, verb) => void (verb === 'use' ? focusDesk(a.id) : runOnWorker(a, verb)),
    guest: (a, verb) => void (verb !== 'use' && runOnWorker(a, verb)),
    tidy: (a, verb) => (verb === 'use' ? toFloor(a.project) : void tried(() => tidy(offeredCall(floorOf(a.project), 'tidy', floorOf(a.project).name)))),
    landed(a, verb) {
      if (verb === 'use') return toFloor(a.project)
      if (verb === 'goto') return goDesk(a.id)
      const row = landedRow(floorOf(a.project), a.id, wallNow())
      return void (row && tidy(row.call))
    },
    leftover(a, verb) {
      if (verb === 'goto') return goDesk(a.id)
      const r = findCard(boardNow()!, a.id)?.resources.find((r) => r.pid === a.pid)
      return void (r && tried(() => tower.run(offeredCall(r, 'reap', `process ${r.pid}`))))
    },
    shell: (a, verb) => void (verb === 'use' ? goShell(a.id) : killShell(boardNow()!.shells.find((sh) => sh.id === a.id)!)),
    floor(a, verb) {
      if (verb === 'use') return toFloor(a.id)
      const f = boardNow()!.floors.find((f) => f.id === a.id)!
      if (verb === 'spawn') return void openSpawn(f.id)
      if (verb === 'shell') return openShellPick(f.id)
      return void tried(() => tower.run(offeredCall(f, 'editor', f.name), { dir: f.hub }))
    },
    shelf: (a) => void openShelf(a.project, a.n),
    book: (a) => void openShelf(a.project, a.n, a.file),
    cork: (a) => (s.carrying ? drop() : openDraftPanel(newDraft(a.project))),
    note(a, verb) {
      if (verb === 'use') return void carry(a.project, a.id)
      if (verb === 'brief') return void openNote(a.project, a.id)
      return void throwAway(a.project, a.id)
    },
    arcade: (a) => openGame(a.project, a.id),
    cat: (a, verb) => void (verb === 'use' ? startPet(a.name) : a.watching && goDesk(a.watching)),
    tv: (a) => void useScreen(a.n),
    directory: () => ({ type: 'go', to: { kind: 'directory' } }),
    stats: () => openStats(),
    dj: () => toggleMusic(),
    bar: () => void (s.beer = !s.beer),
    elevator: () => ({ type: 'go', to: { kind: 'elevator' } }),
  }

  function run(a: Act, verb: Verb) {
    const held = offersNow().find((o) => o.verb === verb)?.whyNot
    if (held) return toast(held)
    if (verb === 'next') return nextWaiting()
    if (verb === 'overview') return overview()
    if (verb === 'stop') return endShare()
    const event = byKind(RUN, a, verb)
    if (event) port.dispatch(event)
  }

  /** What leaving a panel does, by its kind; the panels the app doesn't move yet close themselves. */
  const closesItself = () => {}

  const LEAVE: { [K in Panel['kind']]: (panel: Extract<Panel, { kind: K }>) => void } = {
    desk: focusLeft, shell: focusLeft, tv: focusLeft,
    floor: sideLeft, archive: sideLeft, directory: sideLeft,
    elevator: closesItself,
    'shell-pick': closesItself, drawer: sideLeft,
    game: gameLeft, draft: draftLeft,
    stats: readerLeft, logbook: readerLeft, doc: readerLeft, kept: readerLeft, picture: readerLeft, thread: readerLeft,
  }

  /** What entering a panel does, by its kind, `from` the one open before; the panels the app doesn't move yet open themselves. */
  const opensItself = () => {}

  const ENTER: { [K in Panel['kind']]: (panel: Extract<Panel, { kind: K }>, from: Panel | undefined) => void } = {
    desk: deskEntered, shell: shellEntered, 'shell-pick': shellPickEntered,
    floor: sideEntered, archive: sideEntered, directory: sideEntered,
    elevator: opensItself,
    drawer: opensItself,
    tv: tvEntered, game: gameEntered, draft: draftEntered,
    stats: statsEntered, thread: threadEntered, logbook: logbookEntered,
    doc: (panel, from) => void docEntered(panel, from),
    kept: (panel, from) => void keptEntered(panel, from),
    picture: (panel, from) => void pictureEntered(panel, from),
  }

  /** What leaving and entering a desk's tab does: each lies over the terminal, which keeps its size. */
  const TAB_LEAVE = (tab: DeskTab) => (tab === 'brief' ? show('desk-brief', false) : tab === 'changes' || tab === 'reviews' ? hideTabs() : tab !== 'screen' && closeShown())

  const TAB_ENTER: { [K in TabTo['tab']]: (id: string, to: Extract<TabTo, { tab: K }>) => void } = {
    screen: () => {},
    brief: (id) => briefEntered(id),
    reviews: (id) => deskViewEntered(THREAD, id),
    changes: (id, { lines }) => (deskViewEntered(CHANGES, id), lines && desk.showLines(lines)),
    shown: (id, { target }) => void shownEntered(id, findCard(boardNow()!, id)!.shown.find((sh) => sh.target === target)!),
  }

  /** The panels are drawn once, at the next frame, however many transitions asked for it; `drawPending` draws them now. */
  let drawAsked = false

  function drawPending() {
    if (!drawAsked) return
    drawAsked = false
    renderPanel()
  }

  /** The panels drawn at the next frame, once however often asked before it (the app's `draw`). */
  const askDraw = () => void (drawAsked || ((drawAsked = true), requestAnimationFrame(drawPending)))

  /** Your record as `tower.store` keeps it now: another renderer of yours may have changed it. */
  function rereadViewer() {
    if (FIXTURE !== undefined) return
    rereadLayout()
    readViewer(tower.store.get).then((read) => {
      const was = s.viewer
      const viewer = { ...read, seen: seenSince(read.seen, was.seen) }
      s.viewer = viewer
      if (viewer.seen === null && boardNow()) keepViewer('seen', seenOf(null, offeredIds(boardNow()!)))
      port.dispatch({ type: 'stored', viewer })
      if (viewer.statsRange !== was.statsRange) rangeStats()
      if (viewer.briefMarkdown !== was.briefMarkdown) redrawDeskBrief()
      renderHud()
      if (String(viewer.dismissed) !== String(was.dismissed)) drawWaits()
    })
  }

  /** Your layout as `tower.store` keeps it now, the desk drawn again when it changed. */
  function rereadLayout() {
    const name = s.declared?.name
    if (!name) return
    tower.store.get(layoutKey(name)).then((kept) => {
      const stored = (kept ?? undefined) as Layout | undefined
      if (JSON.stringify(stored) === JSON.stringify(s.storedLayout)) return
      s.storedLayout = stored
      renderPanel()
    })
  }

  function dismissWait(key: string) {
    port.dispatch({ type: 'dismiss', key })
    renderHud()
    drawWaits()
  }

  /** What counts the waits you heed, besides the HUD, drawn again: the panel, the elevator and the lobby's directory. */
  function drawWaits() {
    renderPanel()
    renderElevator()
    paintDirectory(directory, planNow(), heededWaits(boardNow()!, heed()))
  }

  /**
   * A pane of the open panel, by the keymap's names for the tower page's panes: a desk's tabs, the logbook reader's Screen
   * and Logbook. Answers whether the panel has that pane: a pane Tower 3D doesn't draw does nothing.
   */
  function toPane(pane: string) {
    if (!DRAWN_PANES.has(pane)) return false
    const panel = panelNow()
    if (panel?.kind === 'logbook') return pane === 'screen' || pane === 'brief' ? (logbookTab(pane), true) : false
    if (panel?.kind !== 'desk') return false
    const c = findCard(boardNow()!, panel.id)!
    if (pane === 'reviews' && !keepsThreads(boardNow()!, c.project, reads)) return false
    if (pane === 'screen') return (openScreen(), $('desk-screen').querySelector('textarea')?.focus(), true)
    const typingInto = document.activeElement as HTMLElement | null
    typingInto?.blur()
    if (pane === 'brief') openBrief()
    else if (pane === 'changes') openChanges(undefined)
    else openReviews()
    return true
  }

  /** The keymap's commands the building shares with every renderer, from anywhere: walking, at a desk, in its terminal. */
  function runCommand(id: string, e: KeyboardEvent) {
    if (MOVE_OF[id]) return (e.repeat || goMove(MOVE_OF[id]), true)
    const pane = panesOf(boardNow()!).find((p) => p.command === id)
    if (pane) return pane.name ? toPane(pane.name) : false
    if (id === 'leave-terminal') return ((document.activeElement as HTMLElement | null)?.blur(), true)
    return false
  }

  const terminalKeys = { keys: () => boardNow()!.keys, run: runCommand }

  /**
   * Pets the cat `name`: the camera flies low beside it, the right hand strokes its back while it leans in, purring and
   * raising hearts, and the camera flies home once it's done (`tickPet`).
   */
  function startPet(name: CatName) {
    const cat = s.cats.get(name)!
    const spot = petSpot(cat, camera.position)
    port.dispatch({ type: 'pet', pet: { name, start: s.simNow, tailward: spot.tailward } })
    aimAt(undefined)
    petHearts = makeHearts()
    scene.add(petHearts)
    flyTo(spot.from, lookQuaternion(spot.from, spot.at), PET_IN, { type: 'arrived', at: { kind: 'pet' } })
  }

  /** The hearts the cat being petted raises, in the world while the pet lasts. */
  let petHearts: THREE.Group | undefined

  /** A pet runs its strokes, then flies you home; anything else taking the view ends it where it is. */
  function tickPet() {
    const p = motionNow().pet
    if (!p) return
    const k = petProgress(p, s.simNow)
    if (viewNow() === 'pet' && k < 1) return placeHearts(petHearts!, p, s.cats.get(p.name)!, k)
    dropHearts(petHearts!)
    petHearts = undefined
    port.dispatch({ type: 'pet-done' })
  }

  /** A file's Finder and editor buttons work in every panel, before the panel's own click handling sees the click. */
  document.addEventListener(
    'click',
    (e) => {
      const file = fileCall(e.target as Element)
      if (!file) return
      e.stopPropagation()
      void offered(file)
    },
    true,
  )

  $('hud').addEventListener('click', (e) => {
    const el = e.target as HTMLElement
    if (el.closest('[data-next]')) nextWaiting()
    if (el.closest('[data-music]')) toggleMusic()
    if (el.closest('[data-stop-share]')) endShare()
    if (el.closest('[data-shown]')) lookAtNew()
    const probeRun = el.closest<HTMLElement>('[data-probe-run]')
    if (probeRun) void pressing(probeRun, () => tried(() => runVerb({ verb: 'quota/read-now', call: probeRun.dataset.probeCommand === undefined ? {} : { command: probeRun.dataset.probeCommand } }) as Promise<ReadAnswer>)).then((r) => r && toast(probedLines(r)))
  })

  $('watch').addEventListener('click', (e) => {
    const what = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act
    if (what === 'stop') return endShare()
    if (what === 'close') return (unfocus(), lock())
  })

  /**
   * The read each open logbook last started, by where it is open, as `<card> <briefKey>`: a read that lands after a later
   * one started is dropped, and a logbook is read again once its card moved since.
   */
  const logbookReads = { desk: '', reader: '' }

  const readKey = (c: Card) => `${c.id} ${briefKey(boardNow()!, c)}`

  /** How near its end, in pixels, you read a logbook for a new read to keep you there, as the page's Brief does. */
  const AT_END = 48

  const readsAtEnd = (el: HTMLElement) => el.scrollHeight - el.scrollTop - el.clientHeight < AT_END

  /**
   * Reads a logbook's conversations with its `wholes` joined to them (`withWholesRead`), handing them to `land` unless a
   * later read of that logbook started since. A failed read is said, and lands as none only where nothing was read before
   * (`held`); a conversation that fails to read whole again is said and drawn as its last turns.
   */
  function readLogbook(where: keyof typeof logbookReads, c: Card, held: boolean, wholes: () => Brief[], land: (threads: Threads, wholes: Brief[]) => void) {
    const key = readKey(c)
    logbookReads[where] = key
    readConversations(boardNow()!, c.id)
      .then((threads) => withWholesRead(threads, wholes, (session, id) => tower.conversation(session, id)))
      .then(
        (read) => {
          if (logbookReads[where] !== key) return
          for (const err of read.failed) toast(err.message)
          land(read.briefs, read.wholes)
        },
        (err: Error) => (toast(err.message), logbookReads[where] === key && !held && land([], [])),
      )
  }

  /** Each open logbook read again where its worker's card moved since it was read, as the page's Brief is. */
  function freshLogbooks(board: Board) {
    const desk = atDesk()
    const worker = desk && deskTabNow() === 'brief' ? findCard(board, desk) : undefined
    if (worker && logbookReads.desk !== readKey(worker)) readDeskBrief(worker)
    const open = panelAs('logbook')
    const read = open && findCard(board, open.card.id)
    if (read && logbookReads.reader !== readKey(read)) readReader(read)
  }

  const openBrief = () => port.dispatch({ type: 'tab', to: { tab: 'brief' } })

  /**
   * The brief lies over the terminal, which keeps its size: a hidden terminal would refit the PTY to nothing. A brief
   * read before for this worker shows at once, then is read again.
   */
  function briefEntered(id: string) {
    if (deskBrief?.id === id) (drawDeskBrief(true), show('desk-brief', true))
    readDeskBrief(findCard(boardNow()!, id)!)
  }

  /** The desk's logbook read now, drawn as it lands while the desk still shows it, and kept at its end while you read there. */
  function readDeskBrief(c: Card) {
    readLogbook('desk', c, deskBrief?.id === c.id, () => (deskBrief?.id === c.id ? deskBrief.wholes : []), (briefs, wholes) => {
      if (!findCard(boardNow()!, c.id) || atDesk() !== c.id || deskTabNow() !== 'brief') return
      const same = deskBrief?.id === c.id
      const atEnd = !same || readsAtEnd($('desk-brief'))
      deskBrief = { id: c.id, threads: briefs, wholes }
      drawDeskBrief(same)
      show('desk-brief', true)
      if (atEnd) $('desk-brief').scrollTop = $('desk-brief').scrollHeight
    })
  }

  /** The desk's brief as last read, with the conversations read whole in it: what it is drawn again from, and what a copy reads its text from. */
  let deskBrief: { id: string; threads: Threads; wholes: Brief[] } | undefined

  /** The tool calls read in a logbook, by key, as last drawn: one still running is read again when drawn open, drawn as last read meanwhile. */
  const toolsRead = new Map<string, string>()

  const toolsSettled = new Set<string>()

  const toolRead = (key: string) => toolsRead.get(key)

  /** What the viewer opened in a drawn logbook, and how they read its words. */
  const briefLook = (el: HTMLElement) => ({ open: openFolds(el), expanded: expandedSaid(el), openTools: openTools(el), tools: toolRead, markdown: s.viewer.briefMarkdown })

  function drawDeskBrief(same: boolean) {
    const c = findCard(boardNow()!, deskBrief!.id)!
    const look = same ? briefLook($('desk-brief')) : { open: new Set<string>(), expanded: new Set<string>(), tools: toolRead, markdown: s.viewer.briefMarkdown }
    $('desk-brief').innerHTML = logbookHtml(boardNow()!, c, deskBrief!.threads, look, replayNow()?.id === c.id ? replayNow()!.session : undefined)
  }

  /** The logbook again, if the desk shows it, in your `viewer.briefMarkdown`. */
  function redrawDeskBrief() {
    if (deskBrief && atDesk() === deskBrief.id && deskTabNow() === 'brief') drawDeskBrief(true)
  }

  function chooseBriefMarkdown(markdown: BriefMarkdown) {
    keepViewer('briefMarkdown', markdown)
    redrawDeskBrief()
    renderPanel()
    drawSettings()
  }

  /** A logbook's conversation read whole, drawn in place of its last turns where it was asked for. */
  function readWhole(key: string, atDeskBrief: boolean) {
    const [session, conversation] = key.split(':')
    tower.conversation(session, conversation).then((whole) => {
      if (atDeskBrief && deskBrief) return (deskBrief = { ...deskBrief, threads: withWhole(deskBrief.threads, whole), wholes: [...deskBrief.wholes, whole] }), drawDeskBrief(true)
      const open = panelAs('logbook')
      if (open?.threads) patchPanel({ ...open, threads: withWhole(open.threads, whole), wholes: [...open.wholes, whole] })
    }, (err: Error) => toast(err.message))
  }

  /** A logbook's tool call opened: read and drawn in its body, kept once it ended. */
  document.addEventListener('toggle', (e) => {
    const details = e.target
    if (!(details instanceof HTMLDetailsElement) || !details.dataset.tool || !details.open || toolsSettled.has(details.dataset.tool)) return
    const key = details.dataset.tool
    const [session, call] = key.split(':')
    tower.toolCall(session, call).then((read) => {
      const html = toolCallHtml(read)
      toolsRead.set(key, html)
      if (toolCallSettled(read)) toolsSettled.add(key)
      for (const drawn of document.querySelectorAll<HTMLElement>('details[data-tool]'))
        if (drawn.dataset.tool === key) drawn.querySelector('[data-tool-body]')!.innerHTML = html
    }, (err: Error) => toast(err.message))
  }, true)

  const openScreen = () => port.dispatch({ type: 'tab', to: { tab: 'screen' } })

  /** A showing lies over the terminal like the brief, and counts as seen once opened. */
  async function shownEntered(id: string, sh: Shown) {
    const c = findCard(boardNow()!, id)!
    see(sh)
    $('desk-shown').innerHTML = shownHtml(c.callsign, sh, tower.prefs.attributes())
    show('desk-shown', true)
    if (!isMarkdown(sh)) return
    const md = await tower.text(shownHref(sh).slice(1)).catch((err: Error) => `*${err.message}*`)
    if (atDesk() !== id || deskTabNow() !== shownTab(sh)) return
    $('desk-shown').innerHTML = shownHtml(c.callsign, sh, tower.prefs.attributes(), md)
  }

  function closeShown() {
    show('desk-shown', false)
    $('desk-shown').innerHTML = ''
  }

  /** A link or a showing's ↗ opens in a browser tab: a click is what lets a page open one. */
  function openOut(e: MouseEvent) {
    const out = (e.target as HTMLElement).closest<HTMLElement>('[data-out]')?.dataset.out
    if (!out) return false
    unlock()
    open(out, '_blank', 'noopener')
    return true
  }

  /** The details open over the top of the screen, clear of the head that opened them. */
  $('desk-details').addEventListener('beforetoggle', (e) => (e as ToggleEvent).newState === 'open' && ($('desk-details').style.top = `${$('desk-body').getBoundingClientRect().top + 6}px`))

  $('desk-dismiss').addEventListener('click', (e) => {
    const dismissed = (e.target as HTMLElement).closest<HTMLElement>('[data-dismiss]')?.dataset.dismiss
    if (dismissed) dismissWait(dismissed)
  })

  $('desk-tabs').addEventListener('click', (e) => {
    const tab = (e.target as HTMLElement).closest<HTMLElement>('[data-tab]')?.dataset.tab
    const desk = atDesk()
    if (!desk || openOut(e) || !tab) return
    const c = findCard(boardNow()!, desk)!
    const sh = c.shown.find((sh) => shownTab(sh) === tab)
    if (sh) return openShown(sh)
    if (tab === 'brief') openBrief()
    else if (tab === 'reviews') openReviews()
    else if (tab === 'changes') openChanges(undefined)
    else openScreen()
  })

  $('desk-shown').addEventListener('click', openOut)

  /** A session in the logbook, or the stamp's way back: the desk's screen replays it, or goes live again. */
  for (const el of ['desk-brief', 'desk-stamp']) {
    $(el).addEventListener('click', (e) => {
      const session = (e.target as HTMLElement).closest<HTMLElement>('[data-replay]')?.dataset.replay
      const desk = atDesk()
      if (desk && session !== undefined) replay(desk, session || undefined)
    })
  }

  /** The desk's Reviews and Changes hidden and kept, as another of its tabs opens. */
  function hideTabs() {
    desk.hide()
    show('desk-view', false)
  }

  /** The desk's Reviews and Changes closed, as the desk closes or another opens: what the desk mounted ends with it. */
  function hideReviewing() {
    desk.close()
    show('desk-view', false)
  }

  /** Each `data-since` time under `el`, as how long ago it was. */
  const showSince = (el: HTMLElement) => {
    for (const t of el.querySelectorAll<HTMLElement>('[data-since]')) t.textContent = ago(wallNow() - Number(t.dataset.since))
  }

  /** The worker's review thread, the page's `reviews/thread` mounted at its desk over the terminal, like the brief. */
  const openReviews = () => port.dispatch({ type: 'tab', to: { tab: 'reviews' } })

  /** What changed in the worker's repos, the page's `tower/changes` mounted at its desk; `lines`: lines to scroll to. */
  const openChanges = (lines: Lines | undefined) => port.dispatch({ type: 'tab', to: { tab: 'changes', lines } })

  /** The desk's tab `view` on the worker `id` seen, the desk's other views hidden and kept. */
  function deskViewEntered(view: typeof CHANGES | typeof THREAD, id: string) {
    show('desk-view', true)
    desk.open(view, $('desk-view'), findCard(boardNow()!, id)!)
  }

  /** A thread's slot: at the desk of whoever works in its checkout, else in the reader. */
  function openThread(project: string, checkout: string) {
    const worker = workerIn(floorOf(project), checkout)
    if (worker?.onDuty) {
      port.dispatch({ type: 'pend', pending: { tab: { id: worker.id, tab: 'reviews' } } })
      return goDesk(worker.id)
    }
    if (!floorThreadsOf(floorOf(project)).some((t) => t.checkout === checkout)) return
    go({ kind: 'thread', project, checkout })
  }

  /** Entering a review thread read away from any desk: its view mounted in the reader. */
  function threadEntered(panel: Extract<Panel, { kind: 'thread' }>, from: Panel | undefined) {
    readerEntered(panel, from)
    const { project, checkout } = panel
    const t = floorThreadsOf(floorOf(project)).find((t) => t.checkout === checkout)!
    reader.open($('doc-body'), threadSubjectKey(project, t.key))
  }

  /**
   * Types a pointer to the thread of `checkout` into `to`'s composer, naming the notes new to it: the prompt the reviews
   * extension's `said/<project>` read gives for Send, read as the user presses it.
   */
  async function sendNotes(project: string, checkout: string, to: Card | undefined) {
    if (!to) return toast(`Pick a worker to send the notes on ${checkout} to`)
    const query = new URLSearchParams({ checkout, reader: to.callsign, sender: THE_USER, ...(to.hiredBy && { hirer: to.hiredBy.callsign }) })
    const sent = await tried(async () => {
      const { send } = (await tower.get(`reviews/said/${project}?${query}` as never)) as { send?: string }
      if (send === undefined) throw new Error(`The thread of ${checkout} has no notes to send`)
      return tower.run(offeredCall(to, 'submit', to.callsign), { text: send })
    })
    if (sent) toast(`Sent ${to.callsign} to the thread of ${checkout}`)
  }

  /**
   * The logbook of a worker with no desk in the reader, opened on its conversations, read at once, the latest at the
   * bottom; the Screen tab replays its sessions' last screens, its own session's first.
   */
  const openLogbook = (c: Card) => go({ kind: 'logbook', card: c, threads: undefined, wholes: [], tab: 'brief', on: c.id })

  /** Entering a logbook: the reader laid out for its tabs, and its conversations read. */
  function logbookEntered(panel: Extract<Panel, { kind: 'logbook' }>, from: Panel | undefined) {
    readerEntered(panel, from)
    $('doc-body').dataset.logbook = ''
    $('doc-body').innerHTML = `<div class="desk-bar tab-row"><span class="desk-tabs tab-set" id="logbook-tabs"></span></div>
    <div class="logbook-shot" id="logbook-shot"><div id="logbook-sessions"></div><div class="logbook-frame"><div class="logbook-screen" id="logbook-screen"></div><div class="stamp" id="logbook-stamp"></div></div></div>
    <div class="logbook-text" id="logbook-text"></div>`
    readReader(panel.card)
  }

  /** The reader's logbook read now, drawn as it lands while it is open on that worker, and kept at its end while you read there. */
  function readReader(c: Card) {
    readLogbook('reader', c, panelAs('logbook')?.threads !== undefined, () => {
      const open = panelAs('logbook')
      return open?.card.id === c.id ? open.wholes : []
    }, (briefs, wholes) => {
      const open = panelAs('logbook')
      if (open?.card.id !== c.id) return
      const atEnd = open.threads === undefined || readsAtEnd($('logbook-text'))
      patchPanel({ ...open, threads: briefs, wholes })
      drawPending()
      if (atEnd) $('logbook-text').scrollTop = $('logbook-text').scrollHeight
    })
  }

  /** The reader's tab: the Screen tab's terminal runs only while it shows. */
  function logbookTab(tab: LogbookTab) {
    const panel = panelAs('logbook')
    if (!panel || panel.tab === tab) return
    patchPanel({ ...panel, tab })
    if (tab === 'screen') showLogbookScreen(panel.card, panel.on)
    else closeTerm($('logbook-screen'))
    drawPending()
    if (tab === 'brief') $('logbook-text').scrollTop = $('logbook-text').scrollHeight
  }

  /** The reader's screen: a session's last screen from its log, read-only, stamped. */
  function showLogbookScreen(c: Card, session: string) {
    mountTerm($('logbook-screen'), {
      path: `screen/${session}`, id: session, sendKeys: tower.keys, resizeVerb: 'resize', scrollback: 0, wheelReports: true, onError: (err) => toast(err.message), cwd: () => c.cwd,
      onMode: () => {}, ...terminalKeys, onEnd: () => {},
    })
    $('logbook-stamp').innerHTML = stampHtml(c.lineage.find((l) => l.id === session)!.startedAt, false)
  }

  async function resume(c: Call<'resume'>) {
    const reply = await offered(c)
    if (reply?.t === 'spawned') port.dispatch({ type: 'pend', pending: { desk: reply.id } })
  }

  $('desk-head').addEventListener('click', async (e) => {
    const button = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')
    // The panel as asked about: a desk may move under an open dialog, as a worker just spawned arrives.
    const panel = panelNow()
    const callsign = panel?.kind === 'desk' && boardNow() ? findCard(boardNow()!, panel.id)?.callsign : undefined
    if (!button || !panel || !(await answered(button))) return
    const what = button.dataset.act
    const board = boardNow()
    if (!what || !board) return
    if (what === 'close') return (unfocus(), lock())
    if (panel.kind === 'shell') {
      if (what !== 'shell-kill') return
      const sh = board.shells.find((sh) => sh.id === panel.id)
      return sh ? pressing(button, () => killShell(sh)) : toast(noLongerOffered('this shell', 'Kill'))
    }
    if (panel.kind !== 'desk') return
    const c = findCard(board, panel.id)
    if (!c) return toast(noLongerOffered(callsign ?? 'this worker', button.dataset.askVerb ?? what))
    if (what === 'tower') return tower.ui('select', { id: c.id })
    if (what === 'resume') return tried(() => resume(offeredCall(c, 'resume', c.callsign)))
    if (what === 'kill') return pressing(button, () => sendHome(c))
    if (what === 'let-go') return pressing(button, () => letWorkerGo(c))
    if (what === 'reap') return pressing(button, () => tried(() => tower.run(offeredCall(c, 'reap', c.callsign))))
    if (what === 'added') {
      const { action } = JSON.parse(button.dataset.added!) as { action: VerbAction & { cap: string } }
      sawActions(board, [actionId(action)])
      return pressing(button, () => tried(() => runVerb(action)))
    }
  })

  $('doc-head').addEventListener('click', async (e) => {
    const button = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')
    const kept = panelAs('kept')
    if (button && !(await answered(button))) return
    const what = button?.dataset.act
    if (what === 'close') return (closeDoc(), lock())
    const picture = panelAs('picture')
    if (picture) {
      if (openOut(e)) return
      if (what === 'desk') return goShown(picture.id, picture.target)
    }
    if (kept) {
      if (openOut(e)) return
      if (what === 'delete') return pressing(button!, () => deleteKept(kept))
    }
    const doc = panelAs('doc')
    if (doc && what === 'tower') return tower.ui('shelf', { project: doc.project, n: doc.n })
  })

  $('game-head').addEventListener('click', (e) => {
    if (openOut(e)) return
    if ((e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act === 'close') (closeGame(), lock())
  })

  $('doc-body').addEventListener('click', (e) => {
    if (panelNow()?.kind === 'picture') return openOut(e)
    if (panelNow()?.kind === 'kept' && (e.target as HTMLElement).closest('[data-kept-read]')) return redrawKept()
    const logbook = panelAs('logbook')
    if (logbook) {
      const tab = (e.target as HTMLElement).closest<HTMLElement>('[data-tab]')?.dataset.tab
      if (tab) return logbookTab(tab as LogbookTab)
      const session = (e.target as HTMLElement).closest<HTMLElement>('[data-replay]')?.dataset.replay
      if (!session) return
      patchPanel({ ...logbook, on: session })
      return showLogbookScreen(logbook.card, session)
    }
    if (panelNow()?.kind === 'stats') return onStatsClick(e.target as HTMLElement)
    const file = (e.target as HTMLElement).closest<HTMLElement>('[data-file]')?.dataset.file
    const doc = panelAs('doc')
    if (file && doc) openShelf(doc.project, doc.n, file)
  })

  function onStatsClick(el: HTMLElement) {
    const scope = el.closest<HTMLElement>('[data-stats-scope]')?.dataset.statsScope
    if (scope) return port.dispatch({ type: 'stats/scope', scope })
    const range = el.closest<HTMLElement>('[data-stats-range]')?.dataset.statsRange as StatsRange | undefined
    if (range) return (keepViewer('statsRange', range), rangeStats())
    if (el.closest('[data-stats-read]')) port.dispatch({ type: 'stats/again' })
  }

  $('side').addEventListener('click', async (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('button, [data-desk], [data-shell], [data-go], [data-logbook]')
    if (!el || !(await answered(el)) || !boardNow()) return
    const d = el.dataset
    if (d.act === 'close') return (closeSide(), lock())
    if (d.logbook) return openLogbook(pastCard(d.logbook))
    if (d.desk) return goDesk(d.desk)
    if (d.shell) return goShell(d.shell)
    if (d.go) return goLevel(Number(d.go))
    if (d.spawn) return openSpawn(d.spawn)
    const floor = panelAs('floor')
    const archive = panelAs('archive')
    if (d.open && floor) {
      const f = floorOf(floor.id)
      return tried(() => tower.run(offeredCall(f, 'editor', f.name), { dir: d.open }))
    }
    if (d.shelf && floor) return tower.ui('shelf', { project: floor.id, n: Number(d.shelf) })
    if (d.resume) return resume(JSON.parse(d.resume))
    if (d.resumeAll) return pressing(el, () => resumeAll(floorOf(d.resumeAll!)))
    if (d.reapPid) return pressing(el, () => reapProcess(d.reapPid!))
    if (d.shellDir) return pressing(el, () => tried(() => spawnShell(offeredCall(floorOf(d.shellProject!), 'shell', floorOf(d.shellProject!).name), d.shellDir!)))
    if (d.wtCall) {
      const verb = d.wtVerb as keyof typeof WORKTREE_DONE
      return pressing(el, () => worktreeVerb(JSON.parse(d.wtCall!), `${WORKTREE_DONE[verb]} ${d.wtName}`))
    }
    if (d.discard) {
      const call = boardNow()!.floors.flatMap((f) => f.worktrees).map((w) => callOf(w, 'discard')).find((call) => JSON.stringify(call) === d.discard)
      if (!call) return toast(noLongerOffered('this worktree', 'discard'))
      return pressing(el, () => discardWorktree(call))
    }
    if (d.landing) return pressing(el, () => showLanding(JSON.parse(d.landing!)))
    if (d.tidyCall) return pressing(el, () => tidy(JSON.parse(d.tidyCall!)))
    if (d.tidy !== undefined && floor) {
      const f = floorOf(floor.id)
      return pressing(el, () => tried(() => tidy(offeredCall(f, 'tidy', f.name))))
    }
    if (d.tray && floor) return patchPanel({ ...floor, tray: floor.tray === d.tray ? undefined : d.tray })
    if (d.kept && floor) return openKept(keptOf(d.kept))
    if (d.archive !== undefined && floor) return go({ kind: 'archive', id: floor.id, words: [] })
    if (d.floor !== undefined && archive) return go({ kind: 'floor', id: archive.id, tray: undefined })
    if (d.archiveRead !== undefined && archive) return (rereadArchive(boardNow()!, archive.id), renderPanel())
  })

  $('side').addEventListener('input', (e) => {
    const el = e.target as HTMLInputElement
    const archive = panelAs('archive')
    if (el.id !== 'archive-filter' || !archive) return
    patchPanel({ ...archive, words: wordsOf(el.value) })
  })

  async function worktreeVerb(c: Call<'worktree/recut' | 'worktree/prune' | 'worktree/remove' | 'branch/delete'>, done: string) {
    const reply = await offered(c)
    if (reply) toast(`${done}${keptLine(reply)}`)
  }

  /** An at-risk worktree's work thrown away, signed with the user's name on the review thread its tips are noted on. */
  async function discardWorktree(c: Call<'worktree/discard'>) {
    const reply = await offered(c, { author: boardNow()!.user.name })
    if (reply) toast(discardedLine(reply))
  }

  /** What landing changed on a carried branch, in a dialog over whatever is open. */
  async function showLanding(query: { project: string; branch: string }) {
    const read = await tower.landing(query).catch((err: Error) => (toast(err.message), undefined))
    if (!read) return
    $('landing-title').textContent = `What landing changed on ${read.branch}`
    $('landing-body').innerHTML = landingHtml(read)
    ;($('landing') as HTMLDialogElement).showModal()
    $('landing').scrollTop = 0
  }

  async function tidy(c: Call<'tidy'>) {
    const reply = await offered(c)
    if (reply) toast(tidiedLine(reply))
  }

  /** `"<session> <pid>"` from the floor panel, ended at once. */
  async function reapProcess(which: string) {
    const [id, pid] = which.split(' ')
    const r = findCard(boardNow()!, id)?.resources.find((r) => r.pid === Number(pid))
    if (r) await tried(() => tower.run(offeredCall(r, 'reap', `process ${r.pid}`)))
  }

  async function killShell(sh: Board['shells'][number]) {
    if (await call('shell/kill', { id: sh.id })) toast(`Killed the shell in ${shellWhere(floorOf(sh.project), sh)}`)
  }

  /** A new shell in `cwd`: you walk to its kiosk once the board shows it. Answers whether it started. */
  async function spawnShell(c: Call<'shell/spawn'>, cwd: string) {
    const reply = await offered(c, { cwd })
    if (reply?.t === 'spawned') port.dispatch({ type: 'pend', pending: { shell: reply.id } })
    return reply?.t === 'spawned'
  }

  $('shell-pick').addEventListener('click', async (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('button')
    if (!el) return
    if (el.dataset.act === 'close') return (closeSide(), lock())
    const { shellProject, shellDir } = el.dataset
    if (shellDir && (await pressing(el, () => tried(() => spawnShell(offeredCall(floorOf(shellProject!), 'shell', floorOf(shellProject!).name), shellDir))))) (closeSide(), lock())
  })

  /** Up and down move between the picker's places. */
  $('shell-pick').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const places = [...$('shell-pick').querySelectorAll<HTMLElement>('[data-shell-dir]')]
    const at = places.indexOf(document.activeElement as HTMLElement)
    places[(at + (e.key === 'ArrowDown' ? 1 : places.length - 1)) % places.length]?.focus()
  })

  /** The draft editor beside the world: saved as you type, on leaving, and before it is carried or sent. */
  let saveTimer: ReturnType<typeof setTimeout>

  const draftText = $('draft-text') as HTMLTextAreaElement

  /** The editor on `d`, the draft open before saved and closed first. */
  function openDraftPanel(d: Draft) {
    draftClosed()
    s.draft = d
    go({ kind: 'draft', project: d.project })
  }

  /** Entering the editor: the picker closed, as it doesn't leave by the app yet, the mouse let go, the draft's text in it. */
  function draftEntered() {
    sideClosed()
    show('paused', false)
    show('draft', true)
    draftText.value = s.draft!.text
  }

  /** Leaving the editor: the draft saved, unless its floor no longer keeps drafts, where it is let go unsaved. */
  function draftLeft({ project }: { project: string }) {
    const f = boardNow()!.floors.find((f) => f.id === project)
    if (f && draftsOf(f)) draftClosed()
    else draftDropped()
  }

  async function openNote(project: string, id: string) {
    const item = draftItem(boardNow()!.floors, project, id)
    const d = item && (await openDraft(draftIo, project, item).catch((err: Error) => (toast(err.message), null)))
    if (d === null) return
    if (!d) return toast('That draft is gone')
    openDraftPanel(d)
  }

  /** Closes the editor without saving: for a draft that is gone, deleted or sent. Its leave finds no draft to save. */
  function dropDraftPanel() {
    draftDropped()
    closeDraftPanel()
  }

  function draftDropped() {
    clearTimeout(saveTimer)
    s.draft = undefined
    show('draft', false)
  }

  /** Closes the editor, its text saved as it leaves. */
  function closeDraftPanel() {
    if (panelNow()?.kind === 'draft') go(undefined)
  }

  function draftClosed() {
    const d = s.draft
    if (d) {
      if (keepsApart(d)) toast('Your edits were kept as a new draft')
      saving.last = leave(draftIo, d)
    }
    draftDropped()
  }

  function saveDraft() {
    clearTimeout(saveTimer)
    const d = s.draft!
    saving.last = save(draftIo, d)
    saving.last.then(() => s.draft === d && renderPanel())
  }

  async function followDraft(d: Draft) {
    const outcome = await follow(draftIo, d, draftItem(boardNow()!.floors, d.project, d.id!))
    if (s.draft !== d) return
    if (outcome === 'gone') return (dropDraftPanel(), toast('The draft was deleted elsewhere'))
    if (outcome === 'replaced') draftText.value = d.text
    renderPanel()
  }

  draftText.addEventListener('input', () => {
    edit(s.draft!, draftText.value)
    clearTimeout(saveTimer)
    saveTimer = setTimeout(saveDraft, AUTOSAVE_MS)
    renderPanel()
  })

  draftText.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') return (closeDraftPanel(), lock())
    if (commandOf(boardNow()!.keys, e, 'field') === 'save-draft') (e.preventDefault(), saveDraft())
  })

  $('draft-head').addEventListener('click', async (e) => {
    const what = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act
    const d = s.draft
    if (!what || !d) return
    if (what === 'close') return (closeDraftPanel(), lock())
    if (what === 'carry') return d.conflict !== undefined ? toast('Settle the change made on disk first') : (closeDraftPanel(), carry(d.project, d.id!), lock())
    if (what === 'delete') return (dropDraftPanel(), lock(), save(draftIo, d), deleted(await discardDraft(draftIo, d)))
    if (what !== 'start') return
    clearTimeout(saveTimer)
    const text = await sendable(draftIo, d)
    if (text === undefined) return toast(d.conflict !== undefined ? 'Settle the change made on disk first' : 'The draft is empty')
    dropDraftPanel()
    openSpawn(d.project, { note: { project: d.project, id: d.id! }, text })
  })

  $('draft-note').addEventListener('click', (e) => {
    const what = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act
    const d = s.draft
    if (!d || (what !== 'take' && what !== 'keep')) return
    saving.last = settle(draftIo, d, what === 'take')
    if (what === 'take') draftText.value = d.text
    renderPanel()
  })

  Promise.all([tower.get('renderers'), tower.renderer()]).then(([{ renderers }, here]) =>
    ($('renderers').innerHTML = renderersHtml(renderers, here?.name, tower.framed)), (err: Error) => toast(`renderers: ${err.message}`))

  /**
   * The listeners on the window, the document and the viewer's record that read the app's db: added by the app as it
   * attaches, so none can run before it.
   */
  function listen() {
    onAppearance(tower, () => {
      const doc = panelAs('doc')
      if (doc?.file) openShelf(doc.project, doc.n, doc.file)
    })

    onAppearance(tower, () => redrawKept())

    onAppearance(tower, () => {
      const picture = panelAs('picture')
      if (picture) openPicture(picture.id, picture.target)
    })

    // A key this page set, or a shelf page it relays did, such as a dismissal: the first board reads the record anyway.
    tower.store.on(() => boardNow() && rereadViewer())

    /** A logbook's words and code, copied as written; its words rendered or raw, wherever the choice is offered. */
    document.addEventListener('click', (e) => {
      const el = e.target as Element
      const code = el.closest('[data-copy-code]')
      if (code) return copiedAs(fenceText(code), 'the code')
      const markdown = el.closest<HTMLElement>('[data-brief-markdown]')?.dataset.briefMarkdown
      if (markdown) return chooseBriefMarkdown(markdown as BriefMarkdown)
      const files = el.closest<HTMLElement>('[data-changes-files]')?.dataset.changesFiles
      if (files) return (keepViewer('changesTree', files === 'shown'), renderPanel(), drawSettings())
      const said = el.closest<HTMLElement>('[data-copy-said]')?.dataset.copySaid
      const atDesk = el.closest('#desk-brief')
      const threads = atDesk ? deskBrief?.threads : panelAs('logbook')?.threads
      const of = atDesk ? deskBrief && findCard(boardNow()!, deskBrief.id) : panelAs('logbook')?.card
      if (said && threads && of) return copiedAs(saidText(threads, said)!, saidWhat(threads, said, boardNow()!.runtimes[of.runtime].label)!)
      const earlier = el.closest<HTMLElement>('[data-brief-earlier]')?.dataset.briefEarlier
      if (earlier) readWhole(earlier, !!el.closest('#desk-brief'))
    })

    onAppearance(tower, () => {
      const desk = atDesk()
      if (!desk) return
      const sh = findCard(boardNow()!, desk)?.shown.find((sh) => shownTab(sh) === deskTabNow())
      if (sh && isMarkdown(sh)) openShown(sh)
    })

    setInterval(() => {
      if (panelNow()?.kind === 'desk' && deskTabNow() === 'changes') showSince($('desk-view'))
      if (panelNow()?.kind === 'stats') showSince($('doc-body'))
    }, 1000)

    /** The settled line's "what landing changed", in a desk's Changes and Reviews and in a thread read away from any desk. */
    document.addEventListener('click', (e) => {
      const of = (e.target as Element).closest<HTMLElement>('[data-landing-of]')
      const desk = atDesk()
      const project = desk ? findCard(boardNow()!, desk)?.project : panelAs('thread')?.project
      if (of && project) pressing(of, () => showLanding({ project, branch: of.dataset.landingOf! }))
    })
  }

  return { listen, display, renderPanel, focusDesk, mountDeskScreen, replay, focusShell, run, LEAVE, ENTER, TAB_LEAVE, TAB_ENTER, drawPending, rereadViewer, runCommand, tickPet, freshLogbooks, followDraft, askDraw }
}
