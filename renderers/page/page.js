import { documentCss, skyAt, terminalTheme } from '/design.js'
import { ATTENTION_MEANS, ATTENTION_NAME, HOST_ATTENTION, HOST_MEANS, HOST_NAME, ON_DUTY_MEANS, WAITING_MEANS, WAITING_NAME, hostState, statusLegendHtml, awayHiresOf, crewFold, crewTree, goneHome, goneHomeLine, hiresOf, loudest, lampOf, DISMISS_OFFER_TITLE, SOUNDS, attentionOrder, heededOffers, heededWaits, isOffer, nextAttended, claudeUntestedHtml, boardErrorTitle, whyNot, tidiedLine, tidyLine, tidyRows, editedRows, carriedLine, landingHtml, discardAsk, discardedLine, LIMITS_STALE_MS, PROBE_ATTENTION, extraUsageLine, probedLine, limitsFromTitle, probeLine, probeTitle, WORKTREE_STATE_NAME, WORKTREE_VERB_NAME, ago, base, branchLine, callOf, can, noLongerOffered, offeredCall, dutyOrder, esc, pastCount, rendererUrl, renderersHtml, shelfKind, shelfPage, shelfPaths, shelfSource, onDisk, risky, gistLine, goneBases, keptBranchLines, neighbours, paceLine, pairLine, resetLine, span, statusName, statusWord, weekElapsed, worktreeBranch, worktreeRisk, strandedOf, workersIn, noun, plural, tagOf, statusTitle, satellitesOf, subagentTitle, SUBAGENT_FADE_MS, letGoAsk, letGoneLine, resumeAllAsk, resumeStranded, reapAsk, killShellAsk, tidyRowAsk, tidyAllAsk, WORKTREE_ASK, WORKTREE_DONE, keptLine } from '/cards.js'
import { ICON, SHELF_ICON, originIcon, withIcons } from '/icons.js'
import { REVIEWS, landedThreads } from '/reviews.js'
import { collectionPeekHtml, itemKind, itemsCss, keptKey, keptOf, readsText } from '/items.js'
import { threadWant, panelsCss, STATS_ALL, failedHtml, fileButtonsHtml, fileCall, keepingFocus, cardThread, offerWords, policyZone } from '/panels.js'
import { POLICIES, slotWords } from '/policies.js'
import { loop, timers } from '/loop.js'
import { wireSpawn } from '/spawn.js'
import { attendStep, attending, eyeStep, watching } from '/attend.js'
import { HOME, hashOf, mainClass, sameRoom, viewOf } from './view.js'
import { worker } from './worker.js'
import { review } from './review.js'
import { shells } from './shells.js'
import { screen } from './screen.js'
import { stats } from './stats.js'
import { settingsPane } from './settings-pane.js'
import { alerting } from './alerts.js'
import { briefPane } from './brief-pane.js'
import { keptViews } from './kept.js'
import { draft } from './draft.js'
import { archive } from './archive.js'
import { boardKit } from './board.js'
import { onDuty, lineOf, $, byStart, signHtml, fillOf, CLOSE_HOME, copyText, topAnchorOf, sightAnchorOf, redrawHeld, paintOnce, repaint, announce, toast, told } from './kit.js'
import { briefCss } from '/brief.js'
import { documentHtml, fenceText, markdownCss, safeHref } from '/markdown.js'
import { DEFAULT_KEYS, chordLabel, commandOf, keymapSheetHtml, keyshortcuts } from '/keymap.js'
import { VIEWER_KEYS, readViewer } from '/viewer.js'
import { settingsCss } from '/settings.js'
import { loadTerminalFont } from '/terminal.js'
import { placeOnOpen, watchTips } from '/tips.js'
import { pressing } from '/press.js'
import { toastsCss } from '/toasts.js'
import { DRAFTS, draftsOf } from '/drafts.js'

/**
 * @import { SideView } from './stats.js'
 * @import { Board, Card, Floor, FloorCollection } from '../../src/bridge/board.ts'
 * @import { Attention } from '../../src/bridge/life.ts'
 * @import { CardRun } from '../../src/bridge/policies.ts'
 * @import { FloorBranch, FloorWorktree, LandingRead } from '../../src/bridge/worktrees.ts'
 * @import { RateLimit } from '../../src/bridge/facts.ts'
 * @import { Attended, EditedRow, Heed, Move, TidyRow } from '../../src/shared/cards.ts'
 * @import { BoardError, RelayedUi } from '../../src/shared/shelf-page.ts'
 * @import { BriefMarkdown } from '../../src/shared/brief.ts'
 * @import { Call, Replies } from '../../src/shared/api.ts'
 * @import { Viewer } from '../../src/shared/viewer.ts'
 * @import { DiffLayout, StatsRange } from '../../src/shared/panels.ts'
 * @import { Executors, Handlers, Loop, StateEffect, TimerEffect } from '../../src/shared/loop.ts'
 * @import { AttendEffect, AttendEvent, Attending, Eye, EyeEvent } from '../../src/shared/attend.ts'
 * @import { MainView, Pane } from './view.js'
 * @import { SpawnEvent, Spawning } from '../../src/shared/spawn.ts'
 * @import { Draft } from '../../src/shared/drafts.ts'
 * @import { ShelfEntry } from '../../src/shared/model.ts'
 */

document.head.append(Object.assign(document.createElement('style'), { textContent: panelsCss + settingsCss + itemsCss + briefCss + markdownCss + toastsCss }))
watchTips(document)

/** Windows a building shows: its most recent sessions, oldest at the bottom. */
const BUILDING_WINDOWS = 40
const BUILDING_MIN_WINDOWS = 16

/** The board drawn until the first arrives: one with nothing on it. */
const BLANK = /** @type {Board} */ (/** @type {unknown} */ ({ user: { name: 'user' }, keys: DEFAULT_KEYS, floors: [], waiting: [], offers: [], rateLimits: [], probes: [], hostUp: false, hostOutdated: false, claudeUntested: [], shells: [], termsUp: false }))
/** The board drawn, as the page's machine holds it. */
const board = () => page.state().board ?? BLANK
/** Whether a board has arrived. */
const opened = () => page.state().board !== undefined
/** When the tower stopped answering, while it doesn't: the page's times stand still there, as its board does. */
const lostAt = () => page.state().lostAt
const pageNow = () => lostAt() ?? Date.now()
/** The web page of each project directory's origin remote. @type {Record<string, string>} */
let origins = {}
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
const UNFOLDED_KEY = 'floors.unfolded'
/** The sections a viewer unfolded under a floor's workers, by `<section>:<project>`, kept in `tower.store`. @type {Set<string>} */
const unfolded = new Set(/** @type {string[] | undefined} */ (await tower.store.get(UNFOLDED_KEY)) ?? [])

/** @param {string} key */
function toggleSection(key) {
  if (!unfolded.delete(key)) unfolded.add(key)
  tower.store.set(UNFOLDED_KEY, [...unfolded])
  render()
}

/** @param {Card} c @param {Card} [over] */
const sessionHtml = (c, over) => {
  return `<div class="sess ${lampOf(c)} ${c.waiting ? 'waits' : ''} ${c.id === selected() ? 'sel' : ''} ${onDuty(c) ? '' : 'gone'}" data-id="${c.id}" data-hold="${c.id}">
    <div class="top"><span class="lamp"></span><a class="call" href="#${c.id}"${c.id === selected() ? ' aria-current="true"' : ''}>${callsign(c.id)}</a><span class="st${c.stuck ? ' stuck' : ''}" data-tip="${esc(statusTitle(c))}">${statusWord(c)}${c.stuck || c.stranded ? `<span class="sr-only">: ${esc(statusTitle(c))}</span>` : ''}</span><span class="ago" data-since="${c.enteredAt}"></span></div>
    ${c.worktree ? `<div class="branch" data-tip="worktree ${esc(c.worktree.name)}: ${esc(c.cwd)}">${withIcons(esc([branchLine(c), pairLine(c.hiredBy && c.hiredBy.callsign === over?.callsign ? { ...c, hiredBy: undefined } : c)].filter(Boolean).join(' · ')))}</div>` : ''}
    ${c.run ? `<div class="run" data-tip="${esc(runTitle(c.project, c.run))}">run ${c.run.n} · ${esc(c.run.title ?? c.run.tag)}</div>` : ''}
    <div class="line">${lineOf(c)}</div>
    ${satellitesHtml(c)}
    ${can(c, 'resume') ? `<div class="act resumes">${heldWhy('resume') ? heldHtml('resume', 'resume', `${ICON.resume} resume`) : `<button data-resume="${esc(JSON.stringify(callOf(c, 'resume')))}">${ICON.resume} resume</button>`}${letGoHtml(c, 'let go')}</div>` : c.unresumable ? `<div class="act">${unresumableHtml(c.unresumable)}</div>` : ''}
  </div>`
}

/** What started a policy's run, on hover: a run not started by hand has a slot. @param {string} project @param {CardRun} run */
const runTitle = (project, run) => `run ${run.n} of the policy ${run.title ?? run.tag} (${run.tag}): ${run.start === 'hand' ? 'started by hand' : `${slotWords(run.slot, policyZone(board(), project, run.policy), pageNow())} slot, ${run.start === 'auto' ? 'started on its own' : 'its offer accepted'}`}`

/**
 * The worker's subagents running now, a fork marked as its twin, and those that just ended fading out: the fade is an
 * animation started `left` ms in, so a redraw picks it up where it stands.
 * @param {Card} c
 */
const satellitesHtml = (c) => {
  const now = pageNow()
  const drawn = satellitesOf(c, now)
  if (!drawn.length) return ''
  return `<div class="subs" style="--fade:${SUBAGENT_FADE_MS}ms">${drawn.map(({ run, left }) => `<div class="sub${run.type === 'fork' ? ' fork' : ''}${left === undefined ? '' : ` ended${run.ended === 'aborted' ? ' stopped' : ''}`}"${left === undefined ? '' : ` style="animation-delay:-${left}ms"`} data-tip="${esc(subagentTitle(run))}">
    <span class="mark">${run.type === 'fork' ? ICON.branch : ''}</span><span class="what">${esc(run.description)}</span>${left === undefined ? `<span class="since" data-since="${run.startedAt}"></span>` : ''}</div>`).join('')}</div>`
}

/** A worker and everyone under it. @param {Card[]} cards @param {Card} c @param {Card} [over] @returns {string} */
const wholeCrewHtml = (cards, c, over) => {
  const hires = hiresOf(cards, c)
  return sessionHtml(c, over) + (hires.length ? `<div class="crew">${hires.map((h) => wholeCrewHtml(cards, h, c)).join('')}</div>` : '')
}

/** A hire working on another floor, as a link to its card there. @param {Card} h */
const awayHtml = (h) => {
  const f = /** @type {Floor} */ (floorOf(h.project))
  return `<button class="away ${lampOf(h)}" style="${paint(f.id)}" data-away="${h.id}" data-tip="${esc(`${callsign(h.id)} works on ${f.name}: go to its card there`)}"><span class="lamp"></span><span class="call">${callsign(h.id)}</span><span class="on">on ${esc(f.name)}</span><span class="st">${statusWord(h)}</span></button>`
}

/**
 * A worker, the crew under it not gone home, those gone home on one line that unfolds them (`crewFold`), and its hires
 * on other floors still on duty there, linked.
 * @param {Card[]} cards @param {Card} c @param {Card} [over] @returns {string}
 */
const crewHtml = (cards, c, over) => {
  const { drawn, home, folded } = crewFold(cards, c)
  const open = viewer().crewsUnfolded.includes(c.id)
  const fold = home.length
    ? `<button class="gone-home" data-crew-fold="${c.id}" data-hold="fold:${c.id}" aria-expanded="${open}">${ICON.caret} ${goneHomeLine(folded)}</button>${open ? home.map((h) => wholeCrewHtml(cards, h, c)).join('') : ''}`
    : ''
  const everyone = board().floors.flatMap((f) => f.cards)
  const away = awayHiresOf(everyone, c).filter((h) => !goneHome(everyone, h))
  const under = drawn.map((h) => crewHtml(cards, h, c)).join('') + away.map(awayHtml).join('') + fold
  return sessionHtml(c, over) + (under ? `<div class="crew">${under}</div>` : '')
}

/** @param {string} id */
function toggleCrewFold(id) {
  const unfolded = new Set(viewer().crewsUnfolded)
  if (!unfolded.delete(id)) unfolded.add(id)
  keepViewer('crewsUnfolded', [...unfolded].filter((h) => findCard(h)))
  render()
}

/** @param {Floor} f @param {string} dir @param {boolean} hub */
const dirHtml = (f, dir, hub) =>
  `<div class="dir"><span class="dname" data-tip="${esc(dir)}">${hub ? ICON.hub : ICON.repo} ${esc(base(dir))}</span>
    ${heldWhy('shell') ? heldHtml('shell', `new shell in ${base(dir)}`, ICON.shell, 'icon-btn') : can(f, 'shell') ? `<button class="icon-btn" data-shell-project="${esc(f.id)}" data-shell-dir="${esc(dir)}" aria-label="new shell in ${esc(base(dir))}" data-tip="new shell in ${esc(dir)}">${ICON.shell}</button>` : ''}
    ${can(f, 'editor') ? `<button class="icon-btn" data-open="${esc(dir)}" data-open-project="${esc(f.id)}" aria-label="open ${esc(base(dir))} in your editor" data-tip="open ${esc(dir)} in a new window of your editor">${ICON.editor}</button>` : ''}
    ${origins[dir] ? `<a class="icon-btn" href="${esc(origins[dir])}" target="_blank" rel="noreferrer" aria-label="${esc(base(dir))} on the web" data-tip="${esc(origins[dir])}">${originIcon(origins[dir])}</a>` : ''}
  </div>`

/**
 * A verb on a worktree or kept branch, its call on the button.
 * @param {string} name
 * @param {(FloorWorktree | FloorBranch)['actions'][number]} action
 */
const wtVerbHtml = (name, { verb, call }) => verb === 'discard'
  ? `<button class="danger" data-discard="${esc(JSON.stringify(call))}" data-wt-name="${esc(name)}" data-tip="throw its work away: each tip is noted on its review thread first">${WORKTREE_VERB_NAME[verb]}</button>`
  : `<button data-wt-call="${esc(JSON.stringify(call))}" data-wt-verb="${verb}" data-wt-name="${esc(name)}">${WORKTREE_VERB_NAME[verb]}</button>`

/** A button that opens what landing changed on a carried branch. @param {{ project: string, branch: string }} landing */
const landingButtonHtml = (landing) =>
  `<button class="icon-btn" data-landing="${esc(JSON.stringify(landing))}" aria-label="what landing changed on ${esc(landing.branch)}" data-tip="what landing changed: git range-diff of each edited commit and its copy">${ICON.diff}</button>`

/** @param {Floor} f @param {FloorWorktree} w */
const worktreeHtml = (f, w) => {
  const risk = worktreeRisk(w)
  const where = w.repos[0].path
  const title = [`${w.repos.map((r) => r.path).join('\n')}`, ...risk, ...goneBases(w.repos), w.state === 'carried' ? carriedLine(w.repos) : '', w.sessions.length ? `in use by ${w.sessions.join(', ')}` : ''].filter(Boolean).join('\n')
  const workers = workersIn(f, w.name)
  const resumable = workers.find((c) => can(c, 'resume'))
  return `<div class="wt ${w.state}" data-tip="${esc(title)}"><span class="n"><b>${esc(w.name)}</b> ${ICON.branch} ${esc(worktreeBranch(w))}</span>
    <span class="st">${WORKTREE_STATE_NAME[w.state]}</span>
    ${w.state === 'carried' ? landingButtonHtml({ project: f.id, branch: worktreeBranch(w) }) : ''}
    ${!resumable ? '' : heldWhy('resume') ? heldHtml('resume', `resume ${resumable.callsign}`, ICON.resume, 'icon-btn') : `<button class="icon-btn" data-resume="${esc(JSON.stringify(callOf(resumable, 'resume')))}" aria-label="resume ${resumable.callsign}" data-tip="resume ${resumable.callsign}, its last worker">${ICON.resume}</button>`}
    ${w.actions.map((a) => wtVerbHtml(w.name, a)).join('')}
    ${w.state === 'lost' ? '' : heldWhy('shell') ? heldHtml('shell', `new shell in ${w.name}`, ICON.shell, 'icon-btn') : can(f, 'shell') ? `<button class="icon-btn" data-shell-project="${esc(f.id)}" data-shell-dir="${esc(where)}" aria-label="new shell in ${esc(w.name)}" data-tip="new shell in ${esc(where)}">${ICON.shell}</button>` : ''}
    ${w.state !== 'lost' && can(f, 'editor') ? `<button class="icon-btn" data-open="${esc(where)}" data-open-project="${esc(f.id)}" aria-label="open ${esc(w.name)} in your editor" data-tip="open ${esc(where)} in a new window of your editor">${ICON.editor}</button>` : ''}
    ${workers.length ? `<span class="who-line">${workers.map((c) => `<a class="who" href="#${c.id}" data-tip="${esc(`${c.callsign} · ${statusName(c)}`)}">${c.callsign}</a> <span>${esc(statusName(c))}</span>`).join(' · ')}</span>` : ''}
  </div>`
}

/** @param {Floor} f @param {FloorBranch} b */
const keptBranchHtml = (f, b) =>
  `<div class="wt" data-tip="${esc(keptBranchLines(b).join('\n'))}">
    <span class="n">${ICON.branch} ${esc(b.name)}</span><span class="st">${b.absorbed ? 'merged' : b.carried ? 'landed, edited' : 'kept'}</span>${b.carried ? landingButtonHtml({ project: f.id, branch: b.name }) : ''}${b.actions.map((a) => wtVerbHtml(b.name, a)).join('')}</div>`

/** The floor's worktrees and the branches the tower kept. @param {Floor} f */
const worktreesHtml = (f) => `<div class="worktrees">
    <div class="drafts-head eyebrow">Worktrees</div>
    ${f.worktrees.map((w) => worktreeHtml(f, w)).join('')}${f.branches.map((b) => keptBranchHtml(f, b)).join('')}</div>`

/** A floor's review threads, each named by its checkout beside its tag, and the threads Tidy filed once their work landed, folded. @param {Floor} f */
const threadsHtml = (f) => {
  const rows = f.threads.map((t) => {
    const meta = [t.tag, plural(t.messages, 'note'), t.last && `last ${t.last.author}`, t.landed && 'landed'].filter(Boolean).join(' · ')
    return `<button class="draft thread" data-thread="${esc(f.id)}|${esc(t.checkout)}" data-tip="${esc(`${t.id}${t.last ? `\nn${t.last.n} by ${t.last.author}, ${t.last.at}` : ''}`)}">${ICON.thread}<span class="t">${esc(t.checkout)}</span><span class="meta">${esc(meta)}</span></button>`
  })
  const landed = landedOf(f)
  const fold = `landed:${f.id}`
  const filed = !landed.length ? '' : `<button class="kept-fold" data-section="${fold}" aria-expanded="${unfolded.has(fold)}" data-tip="threads Tidy filed once their work landed: read them here">${ICON.caret} ${landed.length} landed</button>
    ${unfolded.has(fold) ? landed.map((t) => `<button class="kept-row ${isOpenItem(f.id, REVIEWS, t.id) ? 'sel' : ''}" data-kept="${esc(keptKey(f.id, REVIEWS, t.id))}" data-tip="${esc(t.id)}"><span class="t">${esc(t.checkout)}</span><span class="meta">${esc(`${t.tag} · landed ${t.landed}`)}</span></button>`).join('') : ''}`
  return `<div class="drafts"><div class="drafts-head eyebrow">Review threads</div>${rows.join('') || '<div class="empty">none open</div>'}${filed}</div>`
}

/** The threads Tidy filed in the floor's reviews collection, the one filed last first. @param {Floor} f */
const landedOf = (f) => landedThreads(f.collections.find((c) => c.id === REVIEWS)?.items ?? [])

/**
 * Everything the floor's Tidy would do, listed before the press, which applies the list as shown; then what landed
 * edited, each removed by its own press only.
 * @param {Floor} f
 */
const tidyHtml = (f) => `<div class="worktrees">
    ${can(f, 'tidy') ? `<div class="drafts-head eyebrow">${esc(tidyLine(f.tidy))}<button class="tidy-all" data-tidy="${f.id}" data-tip="do all of it, as listed">Tidy all</button></div>
    ${tidyRows(f, Date.now()).map(tidyRowHtml).join('')}` : ''}
    ${editedRows(f).length ? `<div class="drafts-head eyebrow" data-tip="landed as copies, some edited on the way: not in Tidy all, look first and remove each on its own">landed edited</div>${editedRows(f).map(editedRowHtml).join('')}` : ''}</div>`

/** A worktree or kept branch that landed edited: what landing changed, and a press that removes only it. @param {EditedRow} r */
const editedRowHtml = (r) => `<div class="wt" data-tip="${esc(r.title)}"><span class="n"><b>${withIcons(esc(r.what))}</b></span><span class="st">${esc(r.does)}</span>
    ${landingButtonHtml(r.landing)}
    <button class="icon-btn" data-wt-call="${esc(JSON.stringify(r.call))}" data-wt-verb="${r.call[0] === 'branch/delete' ? 'delete' : 'remove'}" data-wt-name="${esc(r.what.replace(/^⎇ /, ''))}" aria-label="${esc(`remove ${r.what}`)}" data-tip="remove only this, after looking at what landing changed">${ICON.tidy}</button></div>`

/** One thing Tidy would do, with a button that does only it. @param {TidyRow} r */
const tidyRowHtml = (r) => `<div class="wt" data-tip="${esc(r.title)}"><span class="n"><b>${withIcons(esc(r.what))}</b></span><span class="st">${esc(r.does)}</span>
    <button class="icon-btn" data-tidy-call="${esc(JSON.stringify(r.call))}" data-tidy-ask="${esc(tidyRowAsk(r))}" aria-label="${esc(`${r.does}: ${r.what}`)}" data-tip="${esc(`only this: ${r.does}`)}">${ICON.tidy}</button></div>`

/** @param {Floor} f @param {ShelfEntry} entry @param {number} n */
const shelfEntryHtml = (f, entry, n) => shelfKind(entry) === 'link'
  ? `<a href="${esc(/** @type {{ link: string }} */ (entry).link)}" target="_blank" rel="noreferrer" data-tip="${esc(`${entry.label}\n${/** @type {{ link: string }} */ (entry).link}`)}">${SHELF_ICON.link} ${esc(entry.label)}</a>`
  : `<button class="${viewing('shelf')?.project === f.id && viewing('shelf')?.n === n ? 'sel' : ''}" data-shelf="${f.id}" data-n="${n}" data-tip="${esc(`${entry.label}\n${shelfSource(entry)}`)}">${SHELF_ICON[shelfKind(entry)]} ${esc(entry.label)}</button>`

/** @param {Floor} f */
const shelfHtml = (f) => !f.shelf?.length ? '' : `<div class="shelf">${f.shelf.map((entry, n) => shelfEntryHtml(f, entry, n)).join('')}</div>`

/** Where a floor's tray leads past its newest items: the whole collection in the main pane. @param {Floor} f @param {FloorCollection} c */
const moreHtml = (f, c) => /** @param {number} rest */ (rest) =>
  `<button class="kept-more" data-collection="${esc(keptKey(f.id, c.id, ''))}" data-tip="all ${c.items.length} in ${esc(c.label.toLowerCase())}, in the main pane">+${rest} more</button>`

/** @param {Floor} f */
const draftsHtml = (f) => {
  const drafts = /** @type {FloorCollection} */ (draftsOf(f))
  return collectionPeekHtml(f.id, drafts, (item) => draftTitle(f.id, item), drafting()?.project === f.id ? drafting()?.id : undefined, Date.now(), moreHtml(f, drafts), newDraftHtml(f))
}

/** @param {Floor} f @param {FloorCollection} c */
const keptHtml = (f, c) => collectionPeekHtml(f.id, c, (item) => keptTitle(f.id, c.id, item), viewing('item')?.project === f.id && viewing('item')?.collection === c.id ? viewing('item')?.id : undefined, Date.now(), moreHtml(f, c))

/** The collections a floor shows as trays of their own: drafts and review threads have theirs. @param {Floor} f */
const keptCollections = (f) => f.collections.filter((c) => c.id !== DRAFTS && c.id !== REVIEWS && c.id !== POLICIES && c.items.length)

/** The floor's policies, folded to a count with what is offered and what needs you: the panel opens in the main pane. @param {Floor} f */
function policiesTrayHtml(f) {
  if (!f.policies.length) return ''
  const offered = board().offers.filter((o) => o.project === f.id).length
  const needs = f.policies.filter((p) => p.needs).length
  const invalid = f.policies.filter((p) => !p.header && !p.needs).length
  const on = viewing('policies')?.project === f.id
  return `<button class="tray ${on ? 'on' : ''}" data-policies="${f.id}" aria-pressed="${on}" data-tip="standing work the tower runs at its slots: rules, standing, Run now and Approve, in the main pane">${ICON.resume} <b>${f.policies.length}</b> ${f.policies.length === 1 ? 'policy' : 'policies'}${offered ? `, ${offered} offered` : ''}${needs ? ` <i class="needs">${needs} need${needs === 1 ? 's' : ''} you</i>` : ''}${invalid ? ` <i>${invalid} invalid</i>` : ''}</button>`
}

/** The floor's offers this viewer heeds, in the attention order: Accept starts the run, ✕ dismisses it for this viewer. @param {Floor} f */
const offersHtml = (f) => {
  const offers = heededOffers(board(), heed()).filter((o) => o.project === f.id)
  return offers.length ? `<div class="offers">${offers.map((o) => `<div class="offer-row" data-hold="offer:${esc(o.key)}"><button class="what" data-policies="${f.id}" data-tip="${esc(`${o.title ?? o.tag}: ${offerWords(board(), o, Date.now())}`)}"><b>${esc(o.title ?? o.tag)}</b> <span>offered · ${esc(slotWords(o.slot, policyZone(board(), o.project, o.policy), Date.now()))}</span></button>
    <button class="primary" data-policy-call="${esc(JSON.stringify(o.calls.accept))}" data-tip="start the run this slot offers">Accept</button>
    <button class="icon-btn" data-offer-dismiss="${esc(o.key)}" aria-label="${DISMISS_OFFER_TITLE}" data-tip="${DISMISS_OFFER_TITLE}">${ICON.close}</button></div>`).join('')}</div>` : ''
}

/**
 * What a floor keeps beside its workers, folded to one row of counts so the workers stay in sight: drafts,
 * worktrees, threads and what Tidy would do unfold under it, the archive opens in the main pane. Worktrees that would lose work say so folded.
 * @param {Floor} f
 */
function traysHtml(f) {
  const drafts = draftsOf(f)
  const trees = f.worktrees.length + f.branches.length
  const atRisk = risky(f)
  const past = pastCount(f)
  const threads = f.threads.length
  const landed = landedOf(f).length
  const kept = keptCollections(f)
  const edited = editedRows(f).length
  const tidy = can(f, 'tidy') || edited > 0
  const stranded = strandedOf(f).length
  /** @param {string} key @param {string} label @param {string} title */
  const tray = (key, label, title) => `<button class="tray ${unfolded.has(`${key}:${f.id}`) ? 'on' : ''}" data-section="${key}:${f.id}" aria-expanded="${unfolded.has(`${key}:${f.id}`)}" data-tip="${title}">${label}</button>`
  const trays = [
    drafts?.items.length && tray('drafts', `${ICON.draft} <b>${drafts.items.length}</b> in ${esc(drafts.label.toLowerCase())}`, esc(`${drafts.label}: ${drafts.description ?? 'prompts kept for later'}`)),
    trees && tray('worktrees', `${ICON.branch} <b>${trees}</b> ${noun(trees, 'worktree')}${atRisk ? ` <i>${atRisk} at risk</i>` : ''}`, 'worktrees and the branches the tower kept'),
    (threads || landed) && tray('threads', `${ICON.thread} <b>${threads}</b> ${noun(threads, 'thread')}${landed ? `, ${landed} landed` : ''}`, 'review threads, one per checkout: notes from you, its workers and reviewers'),
    policiesTrayHtml(f),
    ...kept.map((c) => tray(`kept-${c.id}`, `${ICON.collection} <b>${c.items.length}</b> in ${esc(c.label.toLowerCase())}`, esc(`${c.label}: ${c.description ?? 'items kept for later'}`))),
    stranded && (heldWhy('resume') ? heldHtml('resume', `resume all ${stranded} stranded`, `${ICON.resume} resume all <b>${stranded}</b> stranded`, 'tray') : `<button class="tray" data-resume-all="${f.id}" data-tip="resume every worker the host stopped or lost: asked first, listing them">${ICON.resume} resume all <b>${stranded}</b> stranded</button>`),
    past && `<button class="tray ${viewing('archive')?.project === f.id ? 'on' : ''}" data-archive="${f.id}" aria-pressed="${viewing('archive')?.project === f.id}" data-tip="past workers and their conversations, in the main pane">${ICON.archive} <b>${past}</b> archived</button>`,
    tidy && tray('tidy', `${ICON.tidy} ${esc(can(f, 'tidy') ? tidyLine(f.tidy) : 'Tidy')}${edited ? `, ${edited} landed edited` : ''}`, 'what Tidy would do: unfold it to see the list before you press'),
  ].filter(Boolean)
  if (!trays.length) return ''
  return `<div class="trays">${trays.join('')}</div>
    ${drafts?.items.length && unfolded.has(`drafts:${f.id}`) ? draftsHtml(f) : ''}${kept.filter((c) => unfolded.has(`kept-${c.id}:${f.id}`)).map((c) => keptHtml(f, c)).join('')}${trees && unfolded.has(`worktrees:${f.id}`) ? worktreesHtml(f) : ''}${(threads || landed) && unfolded.has(`threads:${f.id}`) ? threadsHtml(f) : ''}${tidy && unfolded.has(`tidy:${f.id}`) ? tidyHtml(f) : ''}`
}

/**
 * Whether each floor is open, as this viewer chose by its sign, kept in `tower.store` by project. A floor never chosen
 * is open while a worker on it needs you (a question, a permission or a screen), and folded otherwise.
 */
const FLOORS_OPEN_KEY = 'floors.open'
let floorsOpen = /** @type {Record<string, boolean>} */ ((await tower.store.get(FLOORS_OPEN_KEY)) ?? {})
/** The selected worker whose floor its sign folded: the selected worker's floor is open whatever was chosen until then. @type {string | undefined} */
let foldedOver

/** The waits and offers on a floor that this viewer heeds. @param {Floor} f */
const floorWaits = (f) => heededWaits(board(), heed()).filter((w) => f.cards.some((c) => c.id === w.id))
/** @param {Floor} f */
const floorOffers = (f) => heededOffers(board(), heed()).filter((o) => o.project === f.id)

/** @param {Floor} f */
const holdsSelected = (f) => selected() !== undefined && selected() !== foldedOver && findCard(selected())?.project === f.id
/** @param {Floor} f */
const needsYou = (f) => floorWaits(f).some((w) => /** @type {Card} */ (findCard(w.id)).attention === 'needs')
/** @param {Floor} f */
const isOpen = (f) => holdsSelected(f) || (floorsOpen[f.id] ?? needsYou(f))

/** The selected worker's floor is open again, whatever its sign folded. */
const forgetFold = () => (foldedOver = undefined)

/** @param {string} id */
function toggleFloor(id) {
  const f = /** @type {Floor} */ (floorOf(id))
  const open = !isOpen(f)
  if (holdsSelected(f)) foldedOver = selected()
  floorsOpen = Object.fromEntries([...Object.entries(floorsOpen).filter(([p]) => p !== id && floorOf(p)), [id, open]])
  tower.store.set(FLOORS_OPEN_KEY, floorsOpen)
  render()
}

/** A folded floor's counts: its waits on you (ringed, lamp of the loudest), its offers, and its workers on duty by the loudest. @param {Floor} f */
const floorSummaryHtml = (f) => {
  const waits = floorWaits(f).map((w) => /** @type {Card} */ (f.cards.find((c) => c.id === w.id)))
  const offers = floorOffers(f).length
  const duty = f.cards.filter(onDuty)
  const tone = loudest(duty)
  /** @param {string} cls @param {number} n @param {string} words */
  const count = (cls, n, words) => `<span class="chip ${cls}" data-tip="${esc(words)}"><span class="lamp"></span><b>${n}</b><span class="sr-only"> ${esc(words)}</span></span>`
  return `<span class="summary">${[
    waits.length && count(`waits some ${loudest(waits)}`, waits.length, WAITING_NAME),
    offers && count('offered some', offers, 'offered'),
    duty.length && count(/** @type {Attention} */ (tone), duty.length, `${noun(duty.length, 'worker')} on duty, the loudest: ${ATTENTION_NAME[/** @type {Attention} */ (tone)]}`),
  ].filter(Boolean).join('')}</span>`
}

/** @param {Floor} f @param {number} i @param {Floor[]} all */
const floorHtml = (f, i, all) => {
  const heads = crewTree(f.cards).filter(({ depth }) => depth === 0).map(({ card }) => card)
  const open = isOpen(f)
  const n = String(all.length - i).padStart(2, '0')
  const spawn = heldWhy('spawn') ? heldHtml('spawn', `new session on ${f.name}`, ICON.plus) : can(f, 'spawn') ? `<button data-spawn="${f.id}" aria-label="new session on ${esc(f.name)}" data-tip="new session">${ICON.plus}</button>` : ''
  const draft = draftsOf(f) ? `<button class="new-draft" data-new-draft="${f.id}" aria-label="new draft on ${esc(f.name)}" data-tip="new draft: a prompt kept for later">${ICON.draft}</button>` : ''
  return `<section class="floor${open ? '' : ' folded'}" style="${paint(f.id)}" data-hold="floor:${esc(f.id)}">
    <div class="sign"><span class="fold" role="heading" aria-level="2"><button data-floor-fold="${esc(f.id)}" aria-expanded="${open}" data-tip="${esc(`${f.name}: ${open ? 'fold' : 'unfold'}`)}"><span class="num">${n}</span><span class="name">${esc(f.name)}</span>${ICON.caret}</button></span>${open ? draft : floorSummaryHtml(f)}${spawn}</div>
    ${open ? floorBodyHtml(f, heads) : ''}
  </section>`
}

/** @param {Floor} f @param {Card[]} heads */
const floorBodyHtml = (f, heads) => `
    <div class="dirs">${dirHtml(f, f.hub, true)}${f.repos.map((r) => dirHtml(f, r, false)).join('')}</div>
    ${shelfHtml(f)}
    ${offersHtml(f)}
    <div class="sessions">${heads.length ? heads.map((c) => crewHtml(f.cards, c)).join('') : '<div class="empty">lights off</div>'}</div>
    ${traysHtml(f)}`

/** A limit's meter, with a tick where an even pace through the week would be. @param {RateLimit} r @param {number} now */
const limitHtml = (r, now) => {
  const pct = r.percentUsed
  const elapsed = weekElapsed(r, now)
  const pace = elapsed === undefined ? '' : `<s style="left:${elapsed}%"></s>`
  return `<div${elapsed === undefined ? '' : ` data-tip="${paceLine(pct, elapsed)}"`}><div class="row">${esc(r.kind.replaceAll('_', ' '))} <b>${pct}%</b>
    <small>${r.resetsAt ? resetLine(r.resetsAt, now) : ''}</small></div>
    <div class="meter" style="--fill:${fillOf(pct, 85)}"><i style="width:${pct}%"></i>${pace}</div></div>`
}

/** Each probe under the limits: its line, its state's colour on the lamp, and in full on hover. @param {number} now */
const probesHtml = (now) =>
  board().probes.map((p) => `<small class="probe ${PROBE_ATTENTION[p.state]}" data-tip="${esc(probeTitle(p, now))}"><span class="lamp"></span>${esc(probeLine(p, now))}${
    can(p, 'run') ? `<button class="probe-run" data-probe-run="${esc(p.name)}" data-tip="read it now: at most once a minute">read now</button>` : ''}</small>`).join('')

/** Extra usage while it is on, as the probe last read it. @param {number} now */
const extraHtml = (now) => {
  const e = board().extraUsage
  return e?.enabled ? `<small class="extra${e.reached ? ' spent' : ''}" data-tip="credits spent past the plan's limits, read ${span(now - e.at)} ago">${esc(extraUsageLine(e))}</small>` : ''
}

/**
 * The rate limits as of their reading, dimmed once it is old enough to have moved, then extra usage and the probes that
 * read them. Rate limits on the board come with when they were read.
 * @param {number} now
 */
const limitsHtml = (now) => {
  if (!board().rateLimits.length) return `<small>no rate-limit reading yet</small>${extraHtml(now)}${probesHtml(now)}`
  const age = now - /** @type {number} */ (board().rateLimitsAt)
  return `${board().rateLimits.map((r) => limitHtml(r, now)).join('')}
    <small class="asof ${age > LIMITS_STALE_MS ? 'stale' : ''}" data-tip="${esc(limitsFromTitle(board()))}">as of ${span(age)} ago</small>${extraHtml(now)}${probesHtml(now)}`
}

/** The limit closest to running out: the one with the most used. @param {RateLimit[]} limits */
const tightestLimit = (limits) => limits.reduce((a, r) => (r.percentUsed > a.percentUsed ? r : a))

/** A meter's tone as an attention class, by the thresholds `fillOf` colours it with. @param {number} pct */
const limitTone = (pct) => (pct > 85 ? 'broken' : 'quiet')

/** The limits folded into one chip: the tightest limit's name and percentage, loud once it is hot. @param {number} now */
const limitsPill = (now) => {
  if (!board().rateLimits.length) return { cls: 'chip quiet', html: '<span class="lamp"></span>no limits read', tip: 'no rate-limit reading yet: click for the probes' }
  const r = tightestLimit(board().rateLimits)
  const tone = limitTone(r.percentUsed)
  const name = r.kind.replace('five_hour', '5h').replace('seven_day', 'week').replaceAll('_', ' ')
  const age = now - /** @type {number} */ (board().rateLimitsAt)
  const stale = age > LIMITS_STALE_MS
  return { cls: `chip ${tone}${tone === 'broken' ? ' some' : ''}${stale ? ' stale' : ''}`, html: `<span class="lamp"></span>${esc(name)} <b>${r.percentUsed}%</b>`,
    tip: `${r.kind.replaceAll('_', ' ')}: ${r.percentUsed}% used, the tightest of ${plural(board().rateLimits.length, 'limit')}, as of ${span(age)} ago: click for all of them` }
}

let limitsPainted = ''
function paintLimits() {
  const now = Date.now()
  const pill = limitsPill(now)
  const open = $('limits-open')
  open.className = pill.cls
  open.dataset.tip = pill.tip
  if (open.innerHTML !== pill.html) open.innerHTML = pill.html
  const html = limitsHtml(now)
  if (html !== limitsPainted) $('limits').innerHTML = limitsPainted = html
}
placeOnOpen($('limits'), () => $('limits-open'))

/** @param {Card} c */
const windowHtml = (c) => {
  const title = `${callsign(c.id)} · ${statusName(c)}${gistLine(c) ? ' · ' + gistLine(c) : ''}`
  return `<a class="w ${onDuty(c) ? 'lit' : 'past'} ${c.attention}" href="#${c.id}" aria-label="${esc(title)}" data-tip="${esc(title)}"></a>`
}

/** @param {Floor} f @param {number} i */
const buildingHtml = (f, i) => {
  const shown = [...f.cards].sort(byStart).slice(-BUILDING_WINDOWS)
  const dark = '<div class="w"></div>'.repeat(Math.max(0, BUILDING_MIN_WINDOWS - shown.length) + (4 - (Math.max(shown.length, BUILDING_MIN_WINDOWS) % 4)) % 4)
  return `<div class="building" style="${paint(f.id)}">${signHtml(i + 1, f.name)}<div class="mast ${loudest(f.cards.filter((c) => c.waiting)) ?? ''} ${f.cards.some((c) => c.waiting) ? 'alarm' : ''}"></div>
    <div class="body">${shown.map(windowHtml).join('')}${dark}</div></div>`
}

/** The skyline's sky follows the viewer's clock, as Tower 3D's does: the sun crosses by day, the moon hangs at night. */
function paintSky() {
  const now = new Date()
  const hours = now.getHours() + now.getMinutes() / 60
  const sky = skyAt(hours)
  const day = Math.min(1, Math.max(0, (hours - 6) / 13))
  for (const [name, value] of Object.entries({ top: sky.top, mid: sky.mid, horizon: sky.horizon })) $('sky').style.setProperty(`--sky-${name}`, value)
  $('sky').style.setProperty('--stars', String(sky.stars))
  $('sky').style.setProperty('--orb-x', sky.stars > 0.5 ? '86%' : `${36 + day * 56}%`)
  $('sky').style.setProperty('--orb-y', sky.stars > 0.5 ? '14%' : `${46 - Math.sin(day * Math.PI) * 34}%`)
  $('orb')?.classList.toggle('moon', sky.stars > 0.5)
  $('orb')?.classList.toggle('sun', sky.stars <= 0.5)
  const clock = $('clock')
  if (clock) clock.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function skylineHtml() {
  const waiting = heededWaits(board(), heed()).length
  const working = cards().filter((c) => c.status === 'working').length
  const big = waiting ? `<b>${waiting}</b> waiting on you` : working ? `${working} at work` : 'all quiet'
  return `<div class="stars"></div><div class="orb" id="orb"></div>
    <div class="hello"><div class="big">${big}</div><div class="sub">${waiting && board().keys['next-waiting'].length ? `press ${board().keys['next-waiting'].map(chordLabel).join(' or ')} to go to the next one` : !board().hostUp ? `click a window to read it · ${esc(whyNot(board(), 'spawn'))}` : 'click a window, or + on a floor to start a session'}</div>
      <div class="clock" id="clock"></div></div>
    <div class="city">${board().floors.map(buildingHtml).join('')}</div><div class="street"></div>`
}

/** The keymap's command for each move (src/shared/keymap.ts). */
const MOVE_COMMAND = { prev: 'prev-worker', next: 'next-worker', waiting: 'next-waiting' }

function render() {
  const all = cards()
  const duty = all.filter(onDuty)
  /** @param {Attention} a */
  const count = (a) => duty.filter((c) => c.attention === a).length
  const waiting = heededWaits(board(), heed()).length
  const offered = heededOffers(board(), heed()).length
  document.title = waiting + offered ? `(${waiting + offered}) The Tower` : 'The Tower'
  paintOnce($('tally'), `<span class="chip waits ${loudest(waitsOnYou()) ?? 'quiet'} ${waiting ? 'some' : ''}" tabindex="0" data-tip="${esc(`${WAITING_NAME}: ${WAITING_MEANS}`)}"><span class="lamp"></span><b>${waiting}</b> ${WAITING_NAME}</span>` +
    (offered ? `<span class="chip offered some" tabindex="0" data-tip="policies' slots offered and not yet started, that you haven't dismissed: N goes to them after the workers waiting on you"><span class="lamp"></span><b>${offered}</b> offered</span>` : '') +
    /** @type {Attention[]} */ (['needs', 'ready', 'working', 'quiet', 'broken'])
      .map((a) => `<span class="chip ${a}" tabindex="0" data-tip="${esc(`${ATTENTION_NAME[a]}: ${ATTENTION_MEANS[a]}\n\n${ON_DUTY_MEANS}`)}"><span class="lamp"></span><b>${count(a)}</b> ${ATTENTION_NAME[a]}</span>`).join(''))
  const host = lostAt() ? 'unknown' : hostState(board())
  paintOnce($('host'), `<span class="host-state ${HOST_ATTENTION[host]}" tabindex="0" data-tip="${esc(HOST_MEANS[host])}"><span class="lamp"></span>${HOST_NAME[host]}</span>`)
  $('notes').innerHTML = claudeUntestedHtml(board()) ?? ''
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

/** The collapsed sidebar: a way back, the waiting count, and a lamp per session on duty. */
/** @param {number} waiting */
const railHtml = (waiting) =>
  `<button class="icon-btn" data-side aria-label="show the sidebar" data-tip="${withKeys('show the sidebar', 'sidebar')}" aria-keyshortcuts="${keyshortcuts(board().keys, 'sidebar')}">${ICON.sidebar}</button>
  ${waiting ? `<span class="count" data-tip="waiting on you">${waiting}<span class="sr-only"> waiting on you</span></span>` : ''}
  ${dutyOrder(board()).map((c) => {
    const title = esc(callsign(c.id) + ' · ' + statusName(c) + (gistLine(c) ? ' · ' + gistLine(c) : ''))
    return `<a class="lamp ${lampOf(c)} ${c.id === selected() ? 'sel' : ''}" href="#${c.id}"${c.id === selected() ? ' aria-current="true"' : ''} aria-label="${title}" data-tip="${title}"></a>`
  }).join('')}`

/** The header's buttons name the chords of the commands they share, as the config binds them. */
function paintKeys() {
  $('keys-open').dataset.tip = withKeys('shortcuts and what the statuses mean', 'help')
  $('keys-open').setAttribute('aria-keyshortcuts', keyshortcuts(board().keys, 'help'))
  $('side-hide').dataset.tip = withKeys('hide the sidebar', 'sidebar')
  $('side-hide').setAttribute('aria-keyshortcuts', keyshortcuts(board().keys, 'sidebar'))
}

/** Under this width the sidebar is a rail, and the sidebar key opens it over the main pane until something opens there. */
const narrow = matchMedia('(max-width: 900px)')

function closeDrawer() {
  document.body.classList.remove('drawer')
}

const COLLAPSED_KEY = 'side.collapsed'
function toggleSide() {
  if (narrow.matches) return document.body.classList.toggle('drawer')
  document.body.classList.toggle('collapsed')
  tower.store.set(COLLAPSED_KEY, document.body.classList.contains('collapsed'))
}
document.body.classList.toggle('collapsed', (await tower.store.get(COLLAPSED_KEY)) === true)

function tick() {
  if (mainClass(view()) === 'home') paintSky()
  paintLimits()
  for (const el of document.querySelectorAll('[data-since]')) el.textContent = ago(pageNow() - Number(el.dataset.since))
}

/**
 * The page's machine: the board drawn, why there is none live and since when the tower is lost, the viewer's record,
 * what the main pane shows, whether the window has the viewer's eye, what the viewer is told about waits and offers
 * (`/attend.js`) and the waits and offers N visited this round (`Heed` in cards.ts). The watched worker is read from
 * the view and the eye as each event is handled, so the pane and the rings follow one selection.
 * @typedef {{ board: Board | undefined, error: BoardError | undefined, lostAt: number | undefined, viewer: Viewer, view: MainView, eye: Eye, attending: Attending, visited: ReadonlySet<string> }} PageState
 * @typedef {{ [K in keyof Viewer]: { type: 'keep', field: K, value: Viewer[K] } }[keyof Viewer]} ViewerKept
 * @typedef {AttendEvent | { type: 'stored', viewer: Viewer } | EyeEvent | ViewerKept | { type: 'board-error', error: BoardError, at: number } | { type: 'next-waiting' }
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
const watchedOf = (s) => watching(s.eye, s.view.t === 'worker' ? s.view.id : undefined)

/** @param {PageState} s @returns {PageEffect} */
const into = (s) => ({ type: 'state', state: s })

/** Attention's step, what it keeps for the viewer kept in the viewer's record too. @param {PageState} s @param {AttendEvent} e @returns {PageEffect[]} */
const attend = (s, e) => {
  const [attending, effects] = attendStep(s.attending, e, watchedOf(s))
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

/** The draft open is saved this long after its last keystroke. */
const AUTOSAVE_MS = 800

/** @param {PageState} s @param {EyeEvent} e @returns {PageEffect[]} */
const see = (s, e) => [into({ ...s, eye: eyeStep(s.eye, e) })]

/** Leaves the view open for `view` and enters it, its hash in the address bar. @param {PageState} s @param {MainView} view @returns {PageEffect[]} */
const moved = (s, view) => [into({ ...s, view }), { type: 'leave', view: s.view }, { type: 'enter', view }, { type: 'hash', hash: hashOf(view) }, { type: 'draw' }]

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
  focus: see,
  visible: see,
  go: (s, { view }) => (sameRoom(s.view, view) ? [into({ ...s, view }), { type: 'hash', hash: hashOf(view) }, { type: 'draw' }] : moved(s, view)),
  reopen: (s, { view }) => moved(s, view),
  saved: (s, { id }) => {
    if (s.view.t !== 'draft') return []
    const view = { ...s.view, id }
    return [into({ ...s, view }), { type: 'hash', hash: hashOf(view) }, { type: 'draw' }]
  },
}

/** @type {Loop<PageState, PageEvent>} */
const page = loop({
  state: { board: undefined, error: undefined, lostAt: undefined, viewer: await readViewer(tower.store.get), view: HOME, eye: { focused: document.hasFocus(), visible: document.visibilityState === 'visible' }, attending: attending(), visited: new Set() },
  handlers: pageHandlers,
  execute: {
    .../** @type {Executors<TimerEffect<PageEvent>, PageEvent>} */ (timers()),
    announce: ({ text }) => announce(text),
    notify: ({ attended: a }) => {
      if (Notification.permission === 'granted') alerts.set(a.key, isOffer(a) ? showOfferAlert(a) : showAlert(/** @type {Card} */ (findCard(a.id)), a))
    },
    unnotify: ({ key }) => (alerts.get(key)?.close(), alerts.delete(key)),
    sound: ({ sound }) => playSound(SOUNDS[sound]),
    keep: ({ field, value }) => tower.store.set(VIEWER_KEYS[field], value),
    'attend-to': ({ to }) => (isOffer(to) ? openPolicies(to.project) : moveTo(to.id)),
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

const { keptTitle, pruneKeptTitles, isOpenItem, openPolicies, openCollection, drawCollection, drawPolicies, policyCall, leaveItem, forgetItem, openItem, drawItem, deleteKept } = keptViews({ render, viewing, go, floorOf, goHome, draftTitle, newDraftHtml, board, page, selectArriving, view })

const { showBrief, redrawBrief, copySaid, chooseBriefMarkdown } = briefPane({ findCard, viewer, keepViewer, drawSettings: () => drawSettings() })

const { alerts, playSound, showShownAlert, showOfferAlert, showAlert } = alerting({ callsign, select, showPane: (pane) => showPane(pane), floorOf, board, openPolicies })

const { drawSettings } = settingsPane({ page, viewer, playSound })

const { floorInView, drawSideView, sideView } = await stats({ view, findCard, floorsTopDown, board, viewer, lostAt })

const { REFIT_DEBOUNCE_MS, termFont, openTerm, terminal, isOwner, closeTerminal, enterWorker, applyTermFont, leaveTerminal } = screen({ board, selected, scheme, run, reopen, refontShell: (font) => refontShell(font) })

const { shellFloor, renderDock, refontShell, shellTerm, toggleShell, spawnShell } = shells({ board, floorInView, paint, floorOf, termFont, scheme, run, REFIT_DEBOUNCE_MS })

const { changeReads, reviewing, followChanges, changesTally, toggleViewed, toggleFold, dropPick, resetDesk, drawChanges, pickLine, keepsThreads, threadReads, followThread, reviewsTally, addPicked, addWritten, sendNotes, drawReviews, replyTo, showAnchor, clearReply, openThread } = review({ render, lostAt, paneOf: (c) => paneOf(c), selected, findCard, board, viewer, floorOf, callsign, showPane: (pane) => showPane(pane), openItem, select })

const { barHtml, paneOf, PANE_COMMAND, unshow, forgetShown, showPane, noticeShown, sendHome } = await worker({ callsign, floorOf, heldWhy, heldHtml, letGoHtml, terminal, selected, openTerm, isOwner, board, heed, viewing, changesTally, keepsThreads, reviewsTally, render, reviewing, followThread, drawChanges, drawReviews, showBrief, go, watchedOf, page, showShownAlert, cards, selectArriving })

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

$('keys-open').innerHTML = ICON.help
$('side-hide').innerHTML = ICON.sidebar

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

/** The files of the `md` shelf entry open, once read. @type {string[]} */
let shelfFiles = []

/** @param {string} project @param {number} n @param {string} [file] */
const shelfPath = (project, n, file) => `shelf/${project}/${n}${file ? '/' + file.split('/').map(encodeURIComponent).join('/') : ''}`
/** @param {string} project @param {number} n @param {string} [file] */
const shelfUrl = (project, n, file) => `/${shelfPath(project, n, file)}`
/** @param {string} project @param {number} n @param {string} [file] */
const openShelf = (project, n, file) => {
  const open = viewing('shelf')
  const shown = open?.project === project && open.n === n ? open.file : undefined
  go(floorOf(project)?.shelf?.[n] ? { t: 'shelf', project, n, file: file ?? shown } : HOME)
}

/** @param {Extract<MainView, { t: 'shelf' }>} open */
function enterShelf({ project, n, file }) {
  const f = /** @type {Floor} */ (floorOf(project))
  const entry = /** @type {ShelfEntry} */ (f.shelf?.[n])
  /** The entry's fields its kind names. @type {ShelfEntry & { url?: string, renderer?: string }} */
  const named = entry
  shelfFiles = []
  $('shelf-view').style.cssText = paint(project)
  const own = /** @type {Record<string, string | undefined>} */ ({ html: `/run/${project}/${n}`, url: named.url, renderer: named.renderer && rendererUrl(named.renderer) })[shelfKind(entry)]
  const tab = own ? `<a href="${esc(own)}" target="_blank" rel="noreferrer">${ICON.remote} new tab</a>` : ''
  const paths = shelfPaths(f, entry)
  $('shelf-head').innerHTML = `<span class="label">${esc(entry.label)}</span><span class="dim">${esc(f.name)} · ${esc(shelfSource(entry))}</span>
    <span class="actions">${paths.file ? fileButtonsHtml(paths.file) : ''}${paths.folder ? fileButtonsHtml(paths.folder) : ''}${tab}${CLOSE_HOME}</span>`
  $('shelf-body').innerHTML = ''
  if (shelfKind(entry) === 'html') showPage(shelfUrl(project, n, shelfPage(entry)))
  if (shelfKind(entry) === 'renderer') showPage(rendererUrl(/** @type {string} */ (named.renderer)))
  if (shelfKind(entry) === 'url') showUrl(/** @type {string} */ (named.url))
  if (shelfKind(entry) === 'md') showCollection(entry, file)
}

/** A page framed with the relay, at an opaque origin: an `html` entry's, or a declared renderer's, of the shelf entry open. @param {string} url */
function showPage(url) {
  const { project, n } = /** @type {Extract<MainView, { t: 'shelf' }>} */ (viewing('shelf'))
  $('shelf-body').innerHTML = `<iframe id="shelf-page" class="page" sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-pointer-lock" allow="clipboard-write"></iframe>`
  pageRelay = tower.relay($('shelf-page'), url, { self: { project, n }, ui: towerVerbs, stored: () => rereadViewer().then(render) })
}

function leaveShelf() {
  closeRelay()
  $('shelf-body').innerHTML = ''
}

/** The open `html` or `renderer` entry's page, given the board and the API by `tower.relay`. @type {{ close(): void } | undefined} */
let pageRelay
const closeRelay = () => (pageRelay?.close(), (pageRelay = undefined))
/** A `url` page gets the viewer's scheme alone, the only message it gets, which carries nothing private. */
const sendScheme = () => $('shelf-url')?.contentWindow?.postMessage({ t: 'scheme', scheme: tower.prefs.get().scheme }, '*')

/** @type {RelayedUi} */
const towerVerbs = {
  select: ({ id }) => select(id),
  home: () => goHome(),
  shelf: ({ project, n }) => openShelf(project, n),
}

/** A frame of a page nobody serves would show the browser's error: say so instead, with a way to look again. @param {string} url */
async function showUrl(url) {
  const opened = view()
  const up = await fetch(url, { mode: 'no-cors', cache: 'no-store' }).then(() => true, () => false)
  if (!sameRoom(view(), opened)) return
  $('shelf-body').innerHTML = up
    ? `<iframe id="shelf-url" class="page" src="${esc(url)}" allow="clipboard-read; clipboard-write"></iframe>`
    : `<div class="shelf-empty">nothing answers at ${esc(url)}<br><br><button data-shelf-retry>look again</button></div>`
  $('shelf-url')?.addEventListener('load', sendScheme)
}

/** A kept item by its tag, as every renderer calls it; any other file by its name. @param {ShelfEntry} entry @param {string} file */
const shelfFileName = (entry, file) => ('item' in entry ? tagOf(file) : base(file).replace(/\.md$/, ''))

/** The files of the md entry open. @param {ShelfEntry} entry @param {string | undefined} file */
async function showCollection(entry, file) {
  const opened = /** @type {Extract<MainView, { t: 'shelf' }>} */ (viewing('shelf'))
  const files = await tower.get(/** @type {'shelf/<project>/<n>'} */ (shelfPath(opened.project, opened.n))).catch((err) => {
    if (sameRoom(view(), opened)) $('shelf-body').innerHTML = failedHtml(shelfSource(entry), err.message, 'data-shelf-retry')
  })
  if (!files || !sameRoom(view(), opened)) return
  if (!files.length) return ($('shelf-body').innerHTML = `<div class="shelf-empty">no file matches ${esc(shelfSource(entry))}</div>`)
  shelfFiles = files
  const hub = /** @type {Floor} */ (floorOf(opened.project)).hub
  $('shelf-body').innerHTML = `<div class="shelf-files">${files.map((f) => `<div class="shelf-file"><button data-doc="${esc(f)}" data-tip="${esc(f)}">${esc(shelfFileName(entry, f))}</button>${fileButtonsHtml(onDisk(hub, f))}</div>`).join('')}</div>
    <iframe id="shelf-doc" sandbox="allow-same-origin"></iframe>`
  showDoc(files.includes(/** @type {string} */ (file)) ? /** @type {string} */ (file) : files[0])
}

/** The document renders in a frame where its scripts can't run; the tower still reads its clicks. @param {string} file */
async function showDoc(file) {
  go({ .../** @type {Extract<MainView, { t: 'shelf' }>} */ (viewing('shelf')), file })
  const opened = /** @type {Extract<MainView, { t: 'shelf' }>} */ (viewing('shelf'))
  for (const el of document.querySelectorAll('[data-doc]')) {
    el.classList.toggle('sel', el.dataset.doc === file)
    if (el.dataset.doc === file) el.setAttribute('aria-current', 'true')
    else el.removeAttribute('aria-current')
  }
  const md = await told(tower.text(shelfPath(opened.project, opened.n, file)))
  if (md === undefined) return
  if (view() !== opened) return
  const doc = $('shelf-doc')
  doc.onload = () => /** @type {Document} */ (doc.contentDocument).addEventListener('click', followLink)
  doc.srcdoc = `<!doctype html><html ${tower.prefs.attributes()}><meta charset="utf-8"><link rel="stylesheet" href="/design.css"><style>${documentCss}</style><article>${documentHtml(md, `/${shelfPath(opened.project, opened.n, file)}`)}</article>`
}

/** A link to another file of the collection opens it here; a web or mail link opens in a new tab, any other is refused. @param {MouseEvent} e */
function followLink(e) {
  const a = /** @type {Element} */ (e.target).closest('a[href]')
  const href = a?.getAttribute('href')
  if (!href || href.startsWith('#')) return
  e.preventDefault()
  const target = new URL(href, `http://shelf/${viewing('shelf')?.file}`)
  if (target.host !== 'shelf') return safeHref(href) ? window.open(target.href, '_blank', 'noreferrer') : toast(`${href} is not a link the tower opens`)
  const file = decodeURIComponent(target.pathname.slice(1))
  if (shelfFiles.includes(file)) return showDoc(file)
  toast(`${file} is not in this collection`)
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
  if (!confirm(resumeAllAsk(f, stranded))) return
  const line = await pressing(button, () => resumeStranded(stranded, tower.run))
  if (line) toast(line)
}

/** @param {HTMLElement} button @param {Card} c */
async function letGo(button, c) {
  if (!confirm(letGoAsk(c))) return
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
document.addEventListener('click', (e) => {
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
    if (!confirm(discardAsk(w))) return
    return told(pressing(discarding, () => tower.run(call, { author: board().user.name }))).then((r) => r && toast(discardedLine(r)))
  }
  const wtCall = target.closest('[data-wt-call]')
  if (wtCall) {
    const { wtVerb, wtName } = wtCall.dataset
    const verb = /** @type {keyof typeof WORKTREE_DONE} */ (wtVerb)
    const name = /** @type {string} */ (wtName)
    if (WORKTREE_ASK[verb] && !confirm(WORKTREE_ASK[verb](name))) return
    return told(pressing(wtCall, () => tower.run(JSON.parse(/** @type {string} */ (wtCall.dataset.wtCall))))).then((r) => r && toast(`${WORKTREE_DONE[verb]} ${name}${keptLine(r)}`))
  }
  const probeRun = target.closest('[data-probe-run]')
  if (probeRun) {
    const probe = /** @type {Board['probes'][number]} */ (board().probes.find((p) => p.name === probeRun.dataset.probeRun))
    return told(pressing(probeRun, async () => tower.run(offeredCall(probe, 'run', `probe ${probe.name}`)))).then((r) => r && toast(probedLine(probe.name, r)))
  }
  const tidyCall = target.closest('[data-tidy-call]')
  if (tidyCall) return confirm(tidyCall.dataset.tidyAsk) && told(pressing(tidyCall, () => tower.run(/** @type {Call<'tidy'>} */ (JSON.parse(/** @type {string} */ (tidyCall.dataset.tidyCall)))))).then((r) => r && toast(tidiedLine(r)))
  const tidy = target.closest('[data-tidy]')
  if (tidy) {
    const f = /** @type {Floor} */ (floorOf(/** @type {string} */ (tidy.dataset.tidy)))
    return confirm(tidyAllAsk(f, Date.now())) && told(pressing(tidy, async () => tower.run(offeredCall(f, 'tidy', f.name)))).then((r) => r && toast(tidiedLine(r)))
  }
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
  if (target.closest('[data-changes-read]')) return (changeReads.dispatch({ type: 'retry', id: /** @type {string} */ (selected()) }), render())
  const open = target.closest('[data-open]')
  if (open) {
    const f = /** @type {Floor} */ (floorOf(/** @type {string} */ (open.dataset.openProject)))
    return told(pressing(open, async () => tower.run(offeredCall(f, 'editor', f.name), { dir: open.dataset.open })))
  }
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
    return confirm(killShellAsk(shellFloor(sh), sh)) && told(pressing(/** @type {HTMLElement} */ (target.closest('[data-kill-shell]')), () => tower.call('shell/kill', { id: killShell })))
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
  if (reapable) {
    const c = /** @type {Card} */ (findCard(reapable.dataset.reap))
    if (confirm(reapAsk(c))) told(pressing(reapable, async () => tower.run(offeredCall(c, 'reap', c.callsign))))
    return
  }
  const actor = target.closest('[data-act]')
  const act = actor?.dataset.act
  if (act === 'send-home') return sendHome(/** @type {HTMLElement} */ (actor), /** @type {Card} */ (findCard(selected())))
  if (act === 'review') {
    const author = /** @type {Card} */ (findCard(selected()))
    return told(pressing(/** @type {HTMLElement} */ (actor), async () => tower.run(offeredCall(author, 'review', author.callsign)))).then((r) => r && toast(`A reviewer of ${callsign(author.id)} starts in ${/** @type {NonNullable<Replies['spawn']['cut']>} */ (r.cut).name}, a fork of ${author.checkout}`))
  }
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
  for (const t of [terminal(), shellTerm()]) if (t) t.options.theme = terminalTheme(scheme())
  redrawDocs()
}

tower.onScheme(applyScheme)
tower.prefs.on(() => (applyTermFont(), redrawDocs(), sendScheme(), drawSettings()))

const isTyping = () => ['INPUT', 'TEXTAREA', 'SELECT'].includes(/** @type {string} */ (document.activeElement?.tagName)) || $('spawn').open || $('transfer').open || $('keys').open || $('landing').open

/** @param {LandingRead} l */
function showLanding(l) {
  $('landing-title').textContent = `What landing changed on ${l.branch}`
  $('landing-body').innerHTML = landingHtml(l)
  $('landing').showModal()
  $('landing').scrollTop = 0
}

function showKeys() {
  $('keys-list').innerHTML = keymapSheetHtml(board().keys)
  $('keys-legend').innerHTML = statusLegendHtml()
  $('keys').showModal()
  $('keys').scrollTop = 0
}

/** Shows a pane the selected worker has, with focus in its terminal or on its tab, from where Tab enters it. */
/** @param {Pane} pane */
function toPane(pane) {
  if (!selected() || !$('bar-line').querySelector(`[data-pane=${pane}]`)) return false
  showPane(pane)
  if (pane === 'screen') terminal()?.focus()
  else /** @type {HTMLElement} */ ($('bar-line').querySelector(`[data-pane=${pane}]`)).focus()
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
  if (id === 'leave-terminal') return (leaveTerminal(), true)
  if (id === 'home' && view().t !== 'home') return (goHome(), true)
  return false
}

/** A terminal's own key handler already ran the keys typed into it; a field's listener, the field's. */
document.addEventListener('keydown', (e) => {
  if (e.defaultPrevented) return
  const id = commandOf(board().keys, e, isTyping() ? 'field' : 'page')
  if (id && run(id, e)) e.preventDefault()
})

/** xterm measures its cells when it opens: the terminal face must be loaded by then. */
await loadTerminalFont(termFont())

told(tower.get('origins')).then((o) => o && ((origins = o), render()))

/** Every renderer of the same system: this one, the others to open, and those not built yet. */
told(tower.get('renderers')).then((r) => r && ($('renderers').innerHTML = renderersHtml(r.renderers, location.pathname.split('/')[2], tower.framed)))

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
  go(await lookUp(named.id) ? { t: 'worker', id: named.id, pane: undefined } : HOME)
}

/** Every view writes its own hash in place, so the hash changes only by a link, the history or the address bar. */
addEventListener('hashchange', () => opened() && location.hash !== hashOf(view()) && route(location.hash.slice(1)))
setInterval(tick, 1000)
sideView.dispatch({ type: 'side', side: sideView.state().side })
