import { documentCss, skyAt, terminalTheme } from '/design.js'
import { ATTENTION_MEANS, ATTENTION_NAME, HOST_ATTENTION, HOST_MEANS, HOST_NAME, ON_DUTY_MEANS, WAITING_MEANS, WAITING_NAME, hostState, statusLegendHtml, awayHiresOf, crewOf, crewFold, crewTree, goneHome, goneHomeLine, hiresOf, CREWS_UNFOLDED_KEY, loudest, threadCheckoutOf, lampOf, BLOCKED_TEXT, DISMISS_TITLE, DISMISS_OFFER_TITLE, DISMISSED_KEY, REMIND_MS, RING_KEY, SOUNDS, attentionOrder, dismissing, heededOffers, heededWaits, isOffer, nextAttended, offerTransitions, offersBeganLine, ringingSound, transitions, GIST_MARK, waitsBeganLine, claudeUntestedHtml, claudeFlagHtml, boardErrorTitle, whyNot, tidiedLine, tidyLine, tidyRows, editedRows, carriedLine, landingHtml, discardAsk, discardedLine, LIMITS_STALE_MS, PROBE_ATTENTION, extraUsageLine, probedLine, limitsFromTitle, probeLine, probeTitle, WORKTREE_STATE_NAME, WORKTREE_VERB_NAME, ago, base, branchLine, branchPlaceholder, callsignRefusal, cutNameOf, can, detailsOf, dutyOrder, esc, archiveKey, pastCount, pastCrews, pastMatching, pastSize, rendererUrl, renderersHtml, shelfKind, shelfPage, shelfPaths, shelfSource, onDisk, risky, wordsOf, gistLine, gistOf, goneBases, keptBranchLines, modelName, neighbours, paceLine, pairLine, plain, resetLine, shownTitle, span, spawnCall, spawnForm, spawnFormHtml, sendTarget, spawnSummaryHtml, statusName, statusWord, workerIn, weekElapsed, whereLine, worktreeBranch, worktreeRisk, UNRESUMABLE_NAME, UNRESUMABLE_TITLE, LET_GO_MEANS, strandedOf, workersIn, noun, plural, resumesRow, tagOf, shellPlaces, statusTitle, satellitesOf, subagentTitle, SUBAGENT_FADE_MS, letGoAsk, letGoneLine, resumeAllAsk, resumeStranded, sendHomeAsk, reapAsk, shellWhere, killShellAsk, tidyRowAsk, tidyAllAsk, WORKTREE_ASK, WORKTREE_DONE, keptLine } from '/cards.js'
import { GIST_ICON, ICON, SHELF_ICON, originIcon, withIcons } from '/icons.js'
import { THE_USER, REVIEWS, landedThreads, parseThread, sendText, threadId, unseenBy } from '/reviews.js'
import { collectionPeekHtml, collectionTrayHtml, deleteAsk, itemFile, itemKind, itemPath, itemsCss, itemTextHtml, keptKey, keptOf, keptTitles, readsText } from '/items.js'
import { keepShownTabs, anchorOf, anchorSpot, changedFiles, changesHtml, changesPath, liveScope, viewedKey, DIFF_LAYOUT_KEY, fileKey, isFolded, keepingFileTop, marksToggled, drawPanel, panelsCss, livePick, pickAnchor, picked, spanned, watchPickDrag, reviewsHtml, spotSelector, viewedCount, STATS_ALL, statsHtml, statsQuery, failedHtml, fileButtonsHtml, fileSpansHtml, fileCall, keepingFocus, cardThread, threadViewOf, offerWords, policiesHtml, policyDoneLine, policyZone } from '/panels.js'
import { POLICIES, slotWords } from '/policies.js'
import { BRIEF_MARKDOWN_KEY, briefCss, briefHtml, expandedSaid, openFolds, saidText, shownFrom } from '/brief.js'
import { documentHtml, fenceText, markdownCss, markdownHtml, safeHref } from '/markdown.js'
import { terminalKeymap } from '/termkeys.js'
import { DEFAULT_KEYS, chordLabel, commandOf, keymapSheetHtml, keysLabel, keyshortcuts } from '/keymap.js'
import { alertsSection, faceInstalled, markdownSection, prefSections, settingsCss, settingsHtml, soundSection, wirePrefs } from '/settings.js'
import { fitSize, loadTerminalFont, reportWheel, terminalFont } from '/terminal.js'
import { placeOnOpen, watchTips } from '/tips.js'
import { pressing } from '/press.js'
import { toaster, toastsCss } from '/toasts.js'
import { DRAFTS, discard, draftItem, restore as restoreDraft, draftPath, draftState, draftTitles, draftsOf, edit, follow, keepUnsent, keepsApart, leave, newDraft, openDraft as loadDraft, save, sendable, settle, titleOf } from '/drafts.js'

/**
 * @import { Board, Card, CardConversation, CardResource, CardShown, Floor, FloorCollection, FloorItem, Unresumable, Wait } from '../../src/bridge/board.ts'
 * @import { Attention } from '../../src/bridge/life.ts'
 * @import { Brief } from '../../src/bridge/turns.ts'
 * @import { CardRun, Offer } from '../../src/bridge/policies.ts'
 * @import { DiffFile } from '../../src/bridge/diff.ts'
 * @import { FloorBranch, FloorWorktree, LandingRead } from '../../src/bridge/worktrees.ts'
 * @import { RateLimit } from '../../src/bridge/facts.ts'
 * @import { SessionLink } from '../../src/bridge/chains.ts'
 * @import { Anchor, ReviewThread } from '../../src/shared/reviews.ts'
 * @import { Attended, DaemonVerb, EditedRow, Heed, Move, PastCrew, Ring, Sound, TidyRow } from '../../src/shared/cards.ts'
 * @import { BoardError, RelayedUi, TerminalMsg } from '../../src/shared/shelf-page.ts'
 * @import { BriefMarkdown } from '../../src/shared/brief.ts'
 * @import { Call, Replies, Verbs } from '../../src/shared/api.ts'
 * @import { ChangesRead, ChangesScope, DiffLayout, LinePick, StatsRange, StatsView } from '../../src/shared/panels.ts'
 * @import { Deleted, Draft } from '../../src/shared/drafts.ts'
 * @import { ShelfEntry } from '../../src/shared/model.ts'
 * @import { ShellStream } from '../../src/shared/terms.ts'
 * @import { RepoChanges } from '../../src/changes.ts'
 * @import * as Fit from '@xterm/addon-fit'
 * @import * as Xterm from '@xterm/xterm'
 */
/**
 * The elements `$` finds whose type is not a plain `HTMLElement`, or that exist only while their view is drawn.
 * @typedef {{
 *   spawn: HTMLDialogElement, transfer: HTMLDialogElement, landing: HTMLDialogElement, keys: HTMLDialogElement,
 *   'draft-text': HTMLTextAreaElement, 'archive-filter': HTMLInputElement,
 *   'shelf-page': HTMLIFrameElement, 'shelf-doc': HTMLIFrameElement, 'item-doc': HTMLIFrameElement, 'shelf-url': HTMLIFrameElement | null,
 *   orb: HTMLElement | null, clock: HTMLElement | null,
 * }} PageElements
 */

document.head.append(Object.assign(document.createElement('style'), { textContent: panelsCss + settingsCss + itemsCss + briefCss + markdownCss + toastsCss }))
watchTips(document)

/** @param {Card} c */
const onDuty = (c) => c.onDuty
/** The card's gist as HTML: a tool's name in bold, said words after their mark. @param {Card} c */
const lineOf = (c) => {
  const gist = gistOf(c)
  if (!gist) return '<i>no prompt yet</i>'
  if (gist.kind === 'asks' || gist.kind === 'runs') return toolHtml(gist.text)
  return `<span class="said">${GIST_ICON[gist.kind]}</span> ${esc(gist.text)}`
}
/** `Bash npm test` → the tool's name in bold, then what it acts on. @param {string} tool */
const toolHtml = (tool) => {
  const [name, ...target] = tool.split(' ')
  return `<span class="tool"><b>${esc(name)}</b> ${esc(target.join(' '))}</span>`
}
/** Windows a building shows: its most recent sessions, oldest at the bottom. */
const BUILDING_WINDOWS = 40
const BUILDING_MIN_WINDOWS = 16
/** @param {string} id */
const callsign = (id) => /** @type {Card} */ (findCard(id)).callsign
/** @param {number} ms */
const when = (ms) => new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
/**
 * @template {string} K
 * @param {K} id
 * @returns {K extends keyof PageElements ? PageElements[K] : HTMLElement}
 */
const $ = (id) => /** @type {any} */ (document.getElementById(id))

/** Why there is no live board, until the next board. @type {BoardError | undefined} */
let boardError
/** When the tower stopped answering, while it doesn't: the page's times stand still there, as its board does. @type {number | undefined} */
let lostAt
const pageNow = () => lostAt ?? Date.now()
/** The board drawn: until the first arrives, one with nothing on it. */
let board = /** @type {Board} */ (/** @type {unknown} */ ({ user: { name: 'user' }, keys: DEFAULT_KEYS, floors: [], waiting: [], offers: [], rateLimits: [], probes: [], hostUp: false, hostOutdated: false, claudeUntested: [], shells: [], termsUp: false }))
/** The web page of each project directory's origin remote. @type {Record<string, string>} */
let origins = {}
/** @type {string | undefined} */
let selected
/** The sections a viewer unfolded under a floor's workers, by `<section>:<project>`, kept in `tower.store`. @type {Set<string>} */
const unfolded = new Set(/** @type {string[] | undefined} */ (await tower.store.get('floors.unfolded')) ?? [])

/** @param {string} key */
function toggleSection(key) {
  if (!unfolded.delete(key)) unfolded.add(key)
  tower.store.set('floors.unfolded', [...unfolded])
  render()
}

const cards = () => board.floors.flatMap((f) => f.cards)
/** The project's color as `--p`, for an element's styles to use. @param {string | undefined} projectId */
const paint = (projectId) => {
  const color = board.floors.find((f) => f.id === projectId)?.color
  return color ? `--p:${esc(color)}` : ''
}
/** A card by id: on the board, else in an archive this page has read. @param {string | undefined} id */
const findCard = (id) => cards().find((c) => c.id === id) ?? [...archives.values()].flatMap((a) => a.cards ?? []).find((c) => c.id === id)

/**
 * The floors' archives this page has read, by project: the `archiveKey` each was read at, its cards once read, and why
 * they couldn't be while none are.
 * @type {Map<string, { key: string, cards?: Card[], failed?: string }>}
 */
const archives = new Map()

/** Reads a floor's archive, keeping the cards read before until it lands; a read a later one overtook is dropped. @param {string} project */
function readArchive(project) {
  /** @type {{ key: string, cards?: Card[], failed?: string }} */
  const reading = { key: archiveKey(board, /** @type {Floor} */ (floorOf(project))), cards: archives.get(project)?.cards }
  archives.set(project, reading)
  return tower.archive(project).then(
    (cards) => archives.get(project) === reading && ((reading.cards = cards), render()),
    (err) => archives.get(project) === reading && (reading.cards ? toast(`The archive of ${project} can't be read: ${err.message}`) : ((reading.failed = err.message), render())),
  )
}

/** Reads again every archive held whose floor's archive moved since. */
const freshArchives = () => {
  for (const [project, { key }] of archives) {
    const f = floorOf(project)
    if (f && key !== archiveKey(board, f)) readArchive(project)
  }
}

/** A card by id, reading every floor's archive on a miss: for an id the board may have left out. @param {string} id */
async function lookUp(id) {
  if (!findCard(id)) await Promise.all(board.floors.filter((f) => f.archived && !archives.get(f.id)?.cards).map((f) => readArchive(f.id)))
  return findCard(id)
}
/** The workers waiting on you that you heed, in the order to go to them. */
const waitsOnYou = () => heededWaits(board, heed).map((w) => /** @type {Card} */ (findCard(w.id)))
/** Top floor first, like an elevator panel. */
const floorsTopDown = () => [...board.floors].reverse()
/** @param {{ startedAt: number }} a @param {{ startedAt: number }} b */
const byStart = (a, b) => a.startedAt - b.startedAt

/** @param {Card} c @param {Card} [over] */
const sessionHtml = (c, over) => {
  return `<div class="sess ${lampOf(c)} ${c.waiting ? 'waits' : ''} ${c.id === selected ? 'sel' : ''} ${onDuty(c) ? '' : 'gone'}" data-id="${c.id}" data-hold="${c.id}">
    <div class="top"><span class="lamp"></span><a class="call" href="#${c.id}"${c.id === selected ? ' aria-current="true"' : ''}>${callsign(c.id)}</a><span class="st${c.stuck ? ' stuck' : ''}" data-tip="${esc(statusTitle(c))}">${statusWord(c)}${c.stuck || c.stranded ? `<span class="sr-only">: ${esc(statusTitle(c))}</span>` : ''}</span><span class="ago" data-since="${c.enteredAt}"></span></div>
    ${c.worktree ? `<div class="branch" data-tip="worktree ${esc(c.worktree.name)}: ${esc(c.cwd)}">${withIcons(esc([branchLine(c), pairLine(c.hiredBy && c.hiredBy.callsign === over?.callsign ? { ...c, hiredBy: undefined } : c)].filter(Boolean).join(' · ')))}</div>` : ''}
    ${c.run ? `<div class="run" data-tip="${esc(runTitle(c.project, c.run))}">run ${c.run.n} · ${esc(c.run.title ?? c.run.tag)}</div>` : ''}
    <div class="line">${lineOf(c)}</div>
    ${satellitesHtml(c)}
    ${can(c, 'resume') ? `<div class="act resumes">${heldWhy('resume') ? heldHtml('resume', 'resume', `${ICON.resume} resume`) : `<button data-resume="${esc(JSON.stringify(c.calls.resume))}">${ICON.resume} resume</button>`}${letGoHtml(c, 'let go')}</div>` : c.unresumable ? `<div class="act">${unresumableHtml(c.unresumable)}</div>` : ''}
  </div>`
}

/** What started a policy's run, on hover: a run not started by hand has a slot. @param {string} project @param {CardRun} run */
const runTitle = (project, run) => `run ${run.n} of the policy ${run.title ?? run.tag} (${run.tag}): ${run.start === 'hand' ? 'started by hand' : `${slotWords(/** @type {number} */ (run.slot), policyZone(board, project, run.policy), pageNow())} slot, ${run.start === 'auto' ? 'started on its own' : 'its offer accepted'}`}`

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

/** Let a stranded worker go, asked first. @param {Card} c @param {string} label */
const letGoHtml = (c, label) => !can(c, 'let-go') ? '' : heldWhy('let-go') ? heldHtml('let-go', label, label) : `<button data-let-go="${c.id}" data-tip="${esc(`let ${callsign(c.id)} go: ${LET_GO_MEANS}`)}">${label}</button>`


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
  const open = crewsUnfolded.has(c.id)
  const fold = home.length
    ? `<button class="gone-home" data-crew-fold="${c.id}" data-hold="fold:${c.id}" aria-expanded="${open}">${ICON.caret} ${goneHomeLine(folded)}</button>${open ? home.map((h) => wholeCrewHtml(cards, h, c)).join('') : ''}`
    : ''
  const everyone = board.floors.flatMap((f) => f.cards)
  const away = awayHiresOf(everyone, c).filter((h) => !goneHome(everyone, h))
  const under = drawn.map((h) => crewHtml(cards, h, c)).join('') + away.map(awayHtml).join('') + fold
  return sessionHtml(c, over) + (under ? `<div class="crew">${under}</div>` : '')
}

/** The hirers whose gone-home crew this viewer unfolded, by card id, as `tower.store` keeps them. @type {Set<string>} */
let crewsUnfolded = new Set()
async function readCrewFolds() {
  crewsUnfolded = new Set(/** @type {string[] | undefined} */ (await tower.store.get(CREWS_UNFOLDED_KEY)) ?? [])
}
/** @param {string} id */
function toggleCrewFold(id) {
  if (!crewsUnfolded.delete(id)) crewsUnfolded.add(id)
  crewsUnfolded = new Set([...crewsUnfolded].filter((h) => findCard(h)))
  tower.store.set(CREWS_UNFOLDED_KEY, [...crewsUnfolded])
  render()
}

/** Why a past worker can't be resumed, quietly: it is history, not an alarm. @param {Unresumable} why */
const unresumableHtml = (why) => `<span class="unresumable" data-tip="${esc(UNRESUMABLE_TITLE[why])}">${UNRESUMABLE_NAME[why]}</span>`

/** Why a daemon verb can't run now: the tower lost (its board is stale), or a daemon it needs down (`whyNot`). @param {DaemonVerb} verb */
const heldWhy = (verb) => (lostAt ? HOST_MEANS.unknown : whyNot(board, verb))

/** A verb `heldWhy` holds back: drawn, inert, its tip saying why. @param {DaemonVerb} verb @param {string} label @param {string} inner */
const heldHtml = (verb, label, inner, cls = '') =>
  `<button class="held ${cls}" aria-disabled="true" aria-label="${esc(label)}" data-tip="${esc(heldWhy(verb))}">${inner}</button>`

/** @param {Card} c @param {CardConversation} conv */
const resumeHtml = (c, conv) => can(conv, 'resume')
  ? heldWhy('resume') ? heldHtml('resume', 'resume this conversation', ICON.resume, 'icon-btn') : `<button class="icon-btn" data-resume="${esc(JSON.stringify(conv.calls.resume))}" aria-label="resume this conversation" data-tip="resume this conversation">${ICON.resume}</button>`
  : can(conv, 'goto') ? `<span class="when">→ ${/** @type {SessionLink} */ (conv.resumedBy).callsign}</span>` : ''

/** @param {Card} c @param {CardConversation} conv */
const pastConversationHtml = (c, conv) =>
  `<div class="conv" data-tip="${esc(conv.prompt ? GIST_MARK.prompt + ' ' + conv.prompt : '')}${conv.answer ? '\n\n' + GIST_MARK.answer + ' ' + esc(conv.answer) : ''}">
    <span class="what">${conv.answer ? `<span class="said">${GIST_ICON.answer}</span> ` + esc(plain(conv.answer)) : conv.prompt ? `<span class="said">${GIST_ICON.prompt}</span> ` + esc(plain(conv.prompt)) : '<i>no prompt</i>'}</span>
    ${resumeHtml(c, conv)}</div>`

/** A past worker and the conversations it held, oldest first. @param {Card} c */
const pastHtml = (c) =>
  `<div class="past ${c.attention} ${c.id === selected ? 'sel' : ''}" data-id="${c.id}">
    <div class="head" data-tip="${statusName(c)}"><span class="lamp"></span><a class="call" href="#${c.id}"${c.id === selected ? ' aria-current="true"' : ''}>${callsign(c.id)}</a><span class="when">${c.unresumable ? `${unresumableHtml(c.unresumable)} · ` : ''}${when(c.startedAt)}</span></div>
    ${c.conversations.map((conv) => pastConversationHtml(c, conv)).join('') || '<div class="conv"><i class="what">no conversation</i></div>'}
  </div>`

/** @param {Floor} f @param {string} dir @param {boolean} hub */
const dirHtml = (f, dir, hub) =>
  `<div class="dir"><span class="dname" data-tip="${esc(dir)}">${hub ? ICON.hub : ICON.repo} ${esc(base(dir))}</span>
    ${heldWhy('shell') ? heldHtml('shell', `new shell in ${base(dir)}`, ICON.shell, 'icon-btn') : can(f, 'shell') ? `<button class="icon-btn" data-shell-project="${esc(f.id)}" data-shell-dir="${esc(dir)}" aria-label="new shell in ${esc(base(dir))}" data-tip="new shell in ${esc(dir)}">${ICON.shell}</button>` : ''}
    ${can(f, 'editor') ? `<button class="icon-btn" data-open="${esc(dir)}" data-open-project="${esc(f.id)}" aria-label="open ${esc(base(dir))} in your editor" data-tip="open ${esc(dir)} in a new window of your editor">${ICON.editor}</button>` : ''}
    ${origins[dir] ? `<a class="icon-btn" href="${esc(origins[dir])}" target="_blank" rel="noreferrer" aria-label="${esc(base(dir))} on the web" data-tip="${esc(origins[dir])}">${originIcon(origins[dir])}</a>` : ''}
  </div>`


/**
 * A verb on a worktree or kept branch, its call on the button.
 * @param {FloorWorktree | FloorBranch} thing
 * @param {(FloorWorktree | FloorBranch)['verbs'][number]} verb
 */
const wtVerbHtml = (thing, verb) => verb === 'discard'
  ? `<button class="danger" data-discard="${esc(JSON.stringify(/** @type {FloorWorktree} */ (thing).calls.discard))}" data-wt-name="${esc(thing.name)}" data-tip="throw its work away: each tip is noted on its review thread first">${WORKTREE_VERB_NAME[verb]}</button>`
  : `<button data-wt-call="${esc(JSON.stringify(/** @type {Record<string, Call>} */ (thing.calls)[verb]))}" data-wt-verb="${verb}" data-wt-name="${esc(thing.name)}">${WORKTREE_VERB_NAME[verb]}</button>`

/** A button that opens what landing changed on a carried branch. @param {{ project: string, branch: string }} landing */
const landingButtonHtml = (landing) =>
  `<button class="icon-btn" data-landing="${esc(JSON.stringify(landing))}" aria-label="what landing changed on ${esc(landing.branch)}" data-tip="what landing changed: git range-diff of each edited commit and its copy">${ICON.diff}</button>`

/** @param {Floor} f @param {FloorWorktree} w */
const worktreeHtml = (f, w) => {
  const risk = worktreeRisk(w)
  const where = w.repos[0].path
  const title = [`${w.repos.map((r) => r.path).join('\n')}`, ...risk, ...goneBases(w.repos), w.state === 'carried' ? carriedLine(w.repos) : '', w.sessions.length ? `in use by ${w.sessions.join(', ')}` : ''].filter(Boolean).join('\n')
  const workers = workersIn(f, w.name)
  const resumable = workers.find((c) => c.calls.resume)
  return `<div class="wt ${w.state}" data-tip="${esc(title)}"><span class="n"><b>${esc(w.name)}</b> ${ICON.branch} ${esc(worktreeBranch(w))}</span>
    <span class="st">${WORKTREE_STATE_NAME[w.state]}</span>
    ${w.state === 'carried' ? landingButtonHtml({ project: f.id, branch: worktreeBranch(w) }) : ''}
    ${!resumable ? '' : heldWhy('resume') ? heldHtml('resume', `resume ${resumable.callsign}`, ICON.resume, 'icon-btn') : `<button class="icon-btn" data-resume="${esc(JSON.stringify(resumable.calls.resume))}" aria-label="resume ${resumable.callsign}" data-tip="resume ${resumable.callsign}, its last worker">${ICON.resume}</button>`}
    ${w.verbs.map((v) => wtVerbHtml(w, v)).join('')}
    ${w.state === 'lost' ? '' : heldWhy('shell') ? heldHtml('shell', `new shell in ${w.name}`, ICON.shell, 'icon-btn') : can(f, 'shell') ? `<button class="icon-btn" data-shell-project="${esc(f.id)}" data-shell-dir="${esc(where)}" aria-label="new shell in ${esc(w.name)}" data-tip="new shell in ${esc(where)}">${ICON.shell}</button>` : ''}
    ${w.state !== 'lost' && can(f, 'editor') ? `<button class="icon-btn" data-open="${esc(where)}" data-open-project="${esc(f.id)}" aria-label="open ${esc(w.name)} in your editor" data-tip="open ${esc(where)} in a new window of your editor">${ICON.editor}</button>` : ''}
    ${workers.length ? `<span class="who-line">${workers.map((c) => `<a class="who" href="#${c.id}" data-tip="${esc(`${c.callsign} · ${statusName(c)}`)}">${c.callsign}</a> <span>${esc(statusName(c))}</span>`).join(' · ')}</span>` : ''}
  </div>`
}

/** @param {Floor} f @param {FloorBranch} b */
const keptBranchHtml = (f, b) =>
  `<div class="wt" data-tip="${esc(keptBranchLines(b).join('\n'))}">
    <span class="n">${ICON.branch} ${esc(b.name)}</span><span class="st">${b.absorbed ? 'merged' : b.carried ? 'landed, edited' : 'kept'}</span>${b.carried ? landingButtonHtml({ project: f.id, branch: b.name }) : ''}${b.verbs.map((v) => wtVerbHtml(b, v)).join('')}</div>`

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
  : `<button class="${shelfOpen?.project === f.id && shelfOpen.n === n ? 'sel' : ''}" data-shelf="${f.id}" data-n="${n}" data-tip="${esc(`${entry.label}\n${shelfSource(entry)}`)}">${SHELF_ICON[shelfKind(entry)]} ${esc(entry.label)}</button>`

/** @param {Floor} f */
const shelfHtml = (f) => !f.shelf?.length ? '' : `<div class="shelf">${f.shelf.map((entry, n) => shelfEntryHtml(f, entry, n)).join('')}</div>`

/** The drafts collection's reads and writes, over the page's routes. */
const draftIo = {
  call: tower.call,
  /** @param {string} project @param {string} id */
  read: (project, id) => tower.text(draftPath(project, id)),
  /** @param {Error} err */
  failed: (err) => toast(err.message),
}
const { title: draftTitle, prune: pruneDraftTitles } = draftTitles(draftIo.read, () => render())

/** @param {Floor} f */
const newDraftHtml = (f) => `<button data-new-draft="${f.id}" aria-label="new draft" data-tip="new draft">${ICON.plus}</button>`

/** Where a floor's tray leads past its newest items: the whole collection in the main pane. @param {Floor} f @param {FloorCollection} c */
const moreHtml = (f, c) => /** @param {number} rest */ (rest) =>
  `<button class="kept-more" data-collection="${esc(keptKey(f.id, c.id, ''))}" data-tip="all ${c.items.length} in ${esc(c.label.toLowerCase())}, in the main pane">+${rest} more</button>`

/** @param {Floor} f */
const draftsHtml = (f) => {
  const drafts = /** @type {FloorCollection} */ (draftsOf(f))
  return collectionPeekHtml(f.id, drafts, (item) => draftTitle(f.id, item), draftOpen?.project === f.id ? draftOpen.id : undefined, Date.now(), moreHtml(f, drafts), newDraftHtml(f))
}

/** Every other collection's items, titled from their text where their type names itself; a row opens the item in the main pane. */
const { title: keptTitle, prune: pruneKeptTitles } = keptTitles((project, collection, id) => tower.text(itemPath(project, collection, id)), () => render())
/** @param {string} project @param {string} collection @param {string} id */
const isOpenItem = (project, collection, id) => itemOpen?.project === project && itemOpen.collection === collection && itemOpen.id === id
/** @param {Floor} f @param {FloorCollection} c */
const keptHtml = (f, c) => collectionPeekHtml(f.id, c, (item) => keptTitle(f.id, c.id, item), itemOpen?.project === f.id && itemOpen.collection === c.id ? itemOpen.id : undefined, Date.now(), moreHtml(f, c))

/** The collections a floor shows as trays of their own: drafts and review threads have theirs. @param {Floor} f */
const keptCollections = (f) => f.collections.filter((c) => c.id !== DRAFTS && c.id !== REVIEWS && c.id !== POLICIES && c.items.length)

/** The floor's policies, folded to a count with what is offered and what needs you: the panel opens in the main pane. @param {Floor} f */
function policiesTrayHtml(f) {
  if (!f.policies.length) return ''
  const offered = board.offers.filter((o) => o.project === f.id).length
  const needs = f.policies.filter((p) => p.needs).length
  const invalid = f.policies.filter((p) => p.problems && !p.needs).length
  const on = policiesOpen?.project === f.id
  return `<button class="tray ${on ? 'on' : ''}" data-policies="${f.id}" aria-pressed="${on}" data-tip="standing work the tower runs at its slots: rules, standing, Run now and Approve, in the main pane">${ICON.resume} <b>${f.policies.length}</b> ${f.policies.length === 1 ? 'policy' : 'policies'}${offered ? `, ${offered} offered` : ''}${needs ? ` <i class="needs">${needs} need${needs === 1 ? 's' : ''} you</i>` : ''}${invalid ? ` <i>${invalid} invalid</i>` : ''}</button>`
}

/** The floor's offers this viewer heeds, in the attention order: Accept starts the run, ✕ dismisses it for this viewer. @param {Floor} f */
const offersHtml = (f) => {
  const offers = heededOffers(board, heed).filter((o) => o.project === f.id)
  return offers.length ? `<div class="offers">${offers.map((o) => `<div class="offer-row" data-hold="offer:${esc(o.key)}"><button class="what" data-policies="${f.id}" data-tip="${esc(`${o.title ?? o.tag}: ${offerWords(board, o, Date.now())}`)}"><b>${esc(o.title ?? o.tag)}</b> <span>offered · ${esc(slotWords(o.slot, policyZone(board, o.project, o.policy), Date.now()))}</span></button>
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
    past && `<button class="tray ${archiveOpen?.project === f.id ? 'on' : ''}" data-archive="${f.id}" aria-pressed="${archiveOpen?.project === f.id}" data-tip="past workers and their conversations, in the main pane">${ICON.archive} <b>${past}</b> archived</button>`,
    tidy && tray('tidy', `${ICON.tidy} ${esc(can(f, 'tidy') ? tidyLine(f.tidy) : 'Tidy')}${edited ? `, ${edited} landed edited` : ''}`, 'what Tidy would do: unfold it to see the list before you press'),
  ].filter(Boolean)
  if (!trays.length) return ''
  return `<div class="trays">${trays.join('')}</div>
    ${drafts?.items.length && unfolded.has(`drafts:${f.id}`) ? draftsHtml(f) : ''}${kept.filter((c) => unfolded.has(`kept-${c.id}:${f.id}`)).map((c) => keptHtml(f, c)).join('')}${trees && unfolded.has(`worktrees:${f.id}`) ? worktreesHtml(f) : ''}${(threads || landed) && unfolded.has(`threads:${f.id}`) ? threadsHtml(f) : ''}${tidy && unfolded.has(`tidy:${f.id}`) ? tidyHtml(f) : ''}`
}

/** A floor's sign: its number on the project's band, its name in caps, cut to the sign's width and whole in the tooltip. @param {number} n @param {string} name */
const signHtml = (n, name, extra = '') =>
  `<div class="sign"><span class="num">${String(n).padStart(2, '0')}</span><span class="name" role="heading" aria-level="2" data-tip="${esc(name)}">${esc(name)}</span>${extra}</div>`

/**
 * Whether each floor is open, as this viewer chose by its sign, kept in `tower.store` by project. A floor never chosen
 * is open while a worker on it needs you (a question, a permission or a screen), and folded otherwise.
 */
const FLOORS_OPEN_KEY = 'floors.open'
let floorsOpen = /** @type {Record<string, boolean>} */ ((await tower.store.get(FLOORS_OPEN_KEY)) ?? {})
/** The selected worker whose floor its sign folded: the selected worker's floor is open whatever was chosen until then. @type {string | undefined} */
let foldedOver

/** The waits and offers on a floor that this viewer heeds. @param {Floor} f */
const floorWaits = (f) => heededWaits(board, heed).filter((w) => f.cards.some((c) => c.id === w.id))
/** @param {Floor} f */
const floorOffers = (f) => heededOffers(board, heed).filter((o) => o.project === f.id)

/** @param {Floor} f */
const holdsSelected = (f) => selected !== undefined && selected !== foldedOver && findCard(selected)?.project === f.id
/** @param {Floor} f */
const needsYou = (f) => floorWaits(f).some((w) => /** @type {Card} */ (findCard(w.id)).attention === 'needs')
/** @param {Floor} f */
const isOpen = (f) => holdsSelected(f) || (floorsOpen[f.id] ?? needsYou(f))

/** @param {string} id */
function toggleFloor(id) {
  const f = /** @type {Floor} */ (floorOf(id))
  const open = !isOpen(f)
  if (holdsSelected(f)) foldedOver = selected
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

/** A meter's fill: ink, broken past `hot`. @param {number} pct @param {number} hot */
const fillOf = (pct, hot) => (pct > hot ? 'var(--broken)' : 'var(--ink)')

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
  board.probes.map((p) => `<small class="probe ${PROBE_ATTENTION[p.state]}" data-tip="${esc(probeTitle(p, now))}"><span class="lamp"></span>${esc(probeLine(p, now))}${
    p.calls.run ? `<button class="probe-run" data-probe-run="${esc(p.name)}" data-tip="read it now: at most once a minute">read now</button>` : ''}</small>`).join('')

/** Extra usage while it is on, as the probe last read it. @param {number} now */
const extraHtml = (now) => {
  const e = board.extraUsage
  return e?.enabled ? `<small class="extra${e.reached ? ' spent' : ''}" data-tip="credits spent past the plan's limits, read ${span(now - e.at)} ago">${esc(extraUsageLine(e))}</small>` : ''
}

/**
 * The rate limits as of their reading, dimmed once it is old enough to have moved, then extra usage and the probes that
 * read them. Rate limits on the board come with when they were read.
 * @param {number} now
 */
const limitsHtml = (now) => {
  if (!board.rateLimits.length) return `<small>no rate-limit reading yet</small>${extraHtml(now)}${probesHtml(now)}`
  const age = now - /** @type {number} */ (board.rateLimitsAt)
  return `${board.rateLimits.map((r) => limitHtml(r, now)).join('')}
    <small class="asof ${age > LIMITS_STALE_MS ? 'stale' : ''}" data-tip="${esc(limitsFromTitle(board))}">as of ${span(age)} ago</small>${extraHtml(now)}${probesHtml(now)}`
}

/** The limit closest to running out: the one with the most used. @param {RateLimit[]} limits */
const tightestLimit = (limits) => limits.reduce((a, r) => (r.percentUsed > a.percentUsed ? r : a))

/** A meter's tone as an attention class, by the thresholds `fillOf` colours it with. @param {number} pct */
const limitTone = (pct) => (pct > 85 ? 'broken' : 'quiet')

/** The limits folded into one chip: the tightest limit's name and percentage, loud once it is hot. @param {number} now */
const limitsPill = (now) => {
  if (!board.rateLimits.length) return { cls: 'chip quiet', html: '<span class="lamp"></span>no limits read', tip: 'no rate-limit reading yet: click for the probes' }
  const r = tightestLimit(board.rateLimits)
  const tone = limitTone(r.percentUsed)
  const name = r.kind.replace('five_hour', '5h').replace('seven_day', 'week').replaceAll('_', ' ')
  const age = now - /** @type {number} */ (board.rateLimitsAt)
  const stale = age > LIMITS_STALE_MS
  return { cls: `chip ${tone}${tone === 'broken' ? ' some' : ''}${stale ? ' stale' : ''}`, html: `<span class="lamp"></span>${esc(name)} <b>${r.percentUsed}%</b>`,
    tip: `${r.kind.replaceAll('_', ' ')}: ${r.percentUsed}% used, the tightest of ${plural(board.rateLimits.length, 'limit')}, as of ${span(age)} ago: click for all of them` }
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
  const waiting = heededWaits(board, heed).length
  const working = cards().filter((c) => c.status === 'working').length
  const big = waiting ? `<b>${waiting}</b> waiting on you` : working ? `${working} at work` : 'all quiet'
  return `<div class="stars"></div><div class="orb" id="orb"></div>
    <div class="hello"><div class="big">${big}</div><div class="sub">${waiting && board.keys['next-waiting'].length ? `press ${board.keys['next-waiting'].map(chordLabel).join(' or ')} to go to the next one` : !board.hostUp ? `click a window to read it · ${esc(whyNot(board, 'spawn'))}` : 'click a window, or + on a floor to start a session'}</div>
      <div class="clock" id="clock"></div></div>
    <div class="city">${board.floors.map(buildingHtml).join('')}</div><div class="street"></div>`
}

/** The selected worker's header: who and where, a glance at its context, cost and leftovers, and its views. @param {Card} c */
function barHtml(c) {
  const ports = c.resources.flatMap((r) => r.ports.map((p) => `:${p}`)).join(' ')
  const orphan = c.resources.some((r) => r.orphan)
  const ctx = c.context
  repaint($('bar-info'), `<span class="call" role="heading" aria-level="2">${callsign(c.id)}</span>
    <span class="pill ${lampOf(c)}${c.stuck ? ' stuck' : ''}"${c.stuck || c.broken ? ` data-tip="${esc(statusTitle(c))}"` : ''}><span class="lamp"></span>${statusName(c)} ·<span data-since="${c.enteredAt}"></span></span>${dismissHtml(c)}
    <span class="where" data-tip="${esc(c.cwd)}">${withIcons(esc(whereLine(c, /** @type {Floor} */ (floorOf(c.project)))))}</span>
    <span class="stats">
      ${ctx === undefined ? '' : `<span class="meter" data-tip="context window: ${ctx}% · ${esc(modelName(c.model))}" style="--fill:${fillOf(ctx, 80)}"><i style="width:${ctx}%"></i><span class="sr-only">context window, ${esc(modelName(c.model))}:</span></span><b>${ctx}%</b>`}
      ${c.costUsd != null ? `<b>$${c.costUsd.toFixed(2)}</b>` : ''}
      ${claudeFlagHtml(c) ?? ''}
      ${can(c, 'reap') ? `<button class="ports ${orphan ? 'orphan' : ''}" popovertarget="bar-left" data-tip="processes left running: click to see them and end them">${c.resources.length}▪ ${ports}</button>` : ''}
    </span>`)
  repaint($('bar-actions'), `<button class="icon-btn" popovertarget="bar-details" aria-label="details" data-tip="everything else about ${callsign(c.id)}">${ICON.info}</button>
    ${!can(c, 'resume') ? '' : heldWhy('resume') ? heldHtml('resume', 'Resume', `${ICON.resume} Resume`, 'primary') : `<button class="primary" data-resume="${esc(JSON.stringify(c.calls.resume))}">${ICON.resume} Resume</button>`}
    ${!can(c, 'review') ? '' : heldWhy('review') ? heldHtml('review', 'Review', 'Review') : `<button data-act="review" data-of="${c.id}" data-tip="hire a reviewer: it works in a fork of ${esc(c.checkout)} (uncommitted work included), reviews once against ${callsign(c.id)}'s goal and leaves notes on its thread">Review</button>`}
    ${letGoHtml(c, 'Let go')}
    ${can(c, 'send-home') ? `<button class="danger" data-act="send-home" data-of="${c.id}" data-tip="${esc(sendHomeTitle(c))}">Send home</button>` : ''}
    <button class="icon-btn" data-act="home" aria-label="back to the skyline" data-tip="back to the skyline (Esc outside the terminal)">${ICON.close}</button>`)
  $('bar-details').innerHTML = detailsHtml(c)
  $('bar-left').innerHTML = leftHtml(c)
  $('main').classList.toggle('asking', c.status === 'needs_input' || c.status === 'blocked')
  $('ask').innerHTML = `<span class="what"><span class="call">${callsign(c.id)}</span> ${c.blocked ? esc(BLOCKED_TEXT[c.blocked]) : c.tool ? `asks to ${toolHtml(c.tool)}` : 'needs you'}</span>
    ${can(c, 'drive') ? '<button class="primary" data-act="drive">Open terminal</button>' : ''}`
  repaint($('bar-line'), paneTabsHtml(c, paneOf(c)))
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
    <span class="cmd" data-tip="${esc(r.command)}">${esc(r.command)}</span><button data-reap-process="${esc(JSON.stringify(r.calls.reap))}" data-tip="end process ${r.pid}">End</button></div>`
  return `<h3>Left running by ${callsign(c.id)}</h3>${c.resources.map(row).join('')}
    <div class="all"><button class="danger" data-reap="${c.id}">End all ${c.resources.length}</button></div>`
}

/** @param {Card} c */
function detailsHtml(c) {
  const rows = [
    ['now', gistLine(c)],
    ...detailsOf(c),
    resumesRow(c, when),
    ['started', when(c.startedAt)],
    ['terminal', term && selected === c.id ? `${term.cols}×${term.rows} · ${isOwner() ? 'sized to this view, you type' : 'watching'}` : ''],
  ].filter(([, value]) => value)
  return `<h3>${callsign(c.id)}</h3><dl>${rows.map(([label, value]) => `<dt>${label}</dt><dd>${esc(value)}</dd>`).join('')}</dl>`
}

/** The keymap's command for each move (src/shared/keymap.ts). */
const MOVE_COMMAND = { prev: 'prev-worker', next: 'next-worker', waiting: 'next-waiting' }

/** What a control does with the chords of the command it shares, when it has any: `hide the sidebar (⌘B)`. */
/** The close of a view in the main pane: back to the skyline. */
const CLOSE_HOME = `<button class="icon-btn" data-act="home" aria-label="back to the skyline" data-tip="back to the skyline">${ICON.close}</button>`

/** @param {string} what @param {string} id */
const withKeys = (what, id) => (keysLabel(board.keys, id) ? `${what} (${keysLabel(board.keys, id)})` : what)

/** Dismiss, beside the status of `c` while it waits on you and you heed it. @param {Card} c */
function dismissHtml(c) {
  const wait = heededWaits(board, heed).find((w) => w.id === c.id)
  return wait ? `<button class="dismiss" data-dismiss="${esc(wait.key)}" data-tip="${DISMISS_TITLE}">dismiss</button>` : ''
}

/** A view of the selected worker in the main pane: a pane's name, or `shown:<target>` for what it showed. @typedef {'screen' | 'brief' | 'changes' | 'reviews' | `shown:${string}`} Pane */
/** The selected session's view in the main pane, as the viewer picked it since selecting the session. @type {Pane | undefined} */
let paneChoice
/** A running session opens on its terminal, a finished one on its brief; a shown thing closed since falls back. @param {Card} c @returns {Pane} */
const paneOf = (c) =>
  (paneChoice?.startsWith('shown:') && !shownOn(c, paneChoice) ? undefined : paneChoice) ?? (can(c, 'drive') || !can(c, 'brief') ? 'screen' : 'brief')

const PANE_PANEL = { screen: 'c-screen', brief: 'brief', changes: 'changes', reviews: 'reviews' }

/** The keymap's command for each pane of the selected worker. @type {Partial<Record<string, Pane>>} */
const PANE_COMMAND = { 'pane-terminal': 'screen', 'pane-brief': 'brief', 'pane-changes': 'changes', 'pane-reviews': 'reviews' }

/** A pane tab's chords as `aria-keyshortcuts`, for the panes the keymap names. @param {Pane} pane */
const paneKeys = (pane) => {
  const id = Object.keys(PANE_COMMAND).find((c) => PANE_COMMAND[c] === pane)
  return id && board.keys[id].length ? ` aria-keyshortcuts="${keyshortcuts(board.keys, id)}"` : ''
}

/** A pane's tab, as the ARIA tabs pattern has it: only the selected one is in the Tab order, arrows move along the row. @param {Pane} id @param {boolean} on */
const paneTabAttrs = (id, on) =>
  `role="tab" aria-selected="${on}" tabindex="${on ? 0 : -1}" aria-controls="${id.startsWith('shown:') ? 'shown' : PANE_PANEL[/** @type {keyof typeof PANE_PANEL} */ (id)]}"${paneKeys(id)} data-pane="${esc(id)}"`

/** @param {Card} c @param {Pane} pane */
const paneTabsHtml = (c, pane) => {
  const shown = visibleShown(c)
  return `<span class="tab-set" role="tablist" aria-label="views of ${callsign(c.id)}"><button class="pane-tab ${pane === 'screen' ? 'on' : ''}" ${paneTabAttrs('screen', pane === 'screen')}>Terminal</button>` +
    (can(c, 'brief') ? `<button class="pane-tab ${pane === 'brief' ? 'on' : ''}" ${paneTabAttrs('brief', pane === 'brief')} data-tip="the last prompts and answers of each conversation, in full">Brief</button>` : '') +
    `<button class="pane-tab ${pane === 'changes' ? 'on' : ''}" ${paneTabAttrs('changes', pane === 'changes')} data-tip="what changed in the worker's repos, as git reads it">Changes${changesTally(c)}</button>` +
    (keepsThreads(c) ? `<button class="pane-tab ${pane === 'reviews' ? 'on' : ''}" ${paneTabAttrs('reviews', pane === 'reviews')} data-tip="the review thread of checkout ${esc(threadCheckoutOf(c))}: notes from you, its workers and reviewers">Reviews${reviewsTally(c)}</button>` : '') +
    (shown.length ? `<span class="shown-tabs">${shown.map((s) => shownTabHtml(c, s, pane === shownPane(s))).join('')}</span>` : '') + '</span>'
}

/** What a worker showed, as a tab: a link opens in a browser tab, anything else also opens out of the tower. @param {Card} c @param {CardShown} s @param {boolean} on */
const shownTabHtml = (c, s, on) => {
  const from = shownFrom(c.lineage, s)
  return `<button class="pane-tab shown-tab ${on ? 'on' : ''}" ${paneTabAttrs(shownPane(s), on)} data-tip="${esc(`${callsign(c.id)} showed ${s.target} · ${ago(Date.now() - s.at)} ago${from ? ` · in ${from.label}` : ''}`)}">` +
  `<span class="shown-name">${s.kind === 'link' ? `${ICON.remote} ` : ''}${esc(shownTitle(s))}</span>${from ? `<small>${from.mark}</small>` : ''}` +
  (on && s.kind !== 'link' ? `<span class="icon-btn" data-out="${esc(shownHref(s))}" aria-hidden="true" data-tip="open in a browser tab">${ICON.remote}</span>` : '') +
  (on && s.kind === 'file' ? fileSpansHtml(s.target) : '') +
  `<span class="icon-btn" data-unshow="${esc(shownKey(s))}" aria-hidden="true" data-tip="close: it comes back if shown again">${ICON.close}</span></button>`
}

/** @param {CardShown} s @returns {Pane} */
const shownPane = (s) => `shown:${s.target}`
/** @param {Card} c @param {Pane} pane */
const shownOn = (c, pane) => visibleShown(c).find((s) => shownPane(s) === pane)
/** Each showing has its own key: closing one leaves the next showing of the same target open. @param {CardShown} s */
const shownKey = (s) => `${s.session}|${s.target}|${s.at}`
/** @param {CardShown} s */
const shownHref = (s) => (s.kind === 'file' ? `/shown/${s.session}${s.target.split('/').map(encodeURIComponent).join('/')}` : s.target)

/** The showings this viewer closed, by `session|target|at`, kept in `tower.store`. */
const unshown = new Set(/** @type {string[] | undefined} */ (await tower.store.get('shown.closed')) ?? [])
/** @param {Card} c */
const visibleShown = (c) => c.shown.filter((s) => !unshown.has(shownKey(s)))

/** @param {string} key */
function unshow(key) {
  unshown.add(key)
  tower.store.set('shown.closed', [...unshown].slice(-200))
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
  const reviewing = pane === 'changes' || pane === 'reviews'
  followChanges(reviewing ? c : undefined)
  if (reviewing && keepsThreads(c)) followThread(c)
  if (pane === 'changes') drawChanges()
  if (pane === 'reviews') drawReviews(c)
  const key = brief && `${c.id} ${c.status === 'working'} ${JSON.stringify(c.conversations)}`
  if (!key || key === briefKey) return
  briefKey = key
  told(tower.conversations(c.id)).then((threads) => threads && briefKey === key && showBrief(c, threads))
}

/** The showing the shown pane last drew: a new showing of the same target draws it again. @type {string | undefined} */
let shownDrawn

/** @param {Card} c @param {CardShown | undefined} s */
function renderShown(c, s) {
  $('main').classList.toggle('on-shown', Boolean(s))
  const key = s && shownKey(s)
  if (key === shownDrawn) return
  shownDrawn = key
  if (!s) return ($('shown').innerHTML = '')
  if (s.kind === 'url') return ($('shown').innerHTML = `<iframe src="${esc(s.target)}" allow="clipboard-read; clipboard-write"></iframe>`)
  if (s.kind === 'link') return ($('shown').innerHTML = `<iframe class="doc" sandbox="allow-popups allow-popups-to-escape-sandbox"></iframe>`, showLink(c, s))
  if (/\.(png|jpe?g|gif|webp|svg)$/i.test(s.target)) return ($('shown').innerHTML = `<img src="${esc(shownHref(s))}" alt="${esc(shownTitle(s))}">`)
  if (/\.(mp4|webm)$/i.test(s.target)) return ($('shown').innerHTML = `<video controls autoplay src="${esc(shownHref(s))}"></video>`)
  if (!s.target.endsWith('.md')) return ($('shown').innerHTML = `<iframe sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" allow="clipboard-write" src="${esc(shownHref(s))}"></iframe>`)
  $('shown').innerHTML = `<iframe class="doc" sandbox="allow-popups allow-popups-to-escape-sandbox"></iframe>`
  told(tower.text(shownHref(s).slice(1))).then((md) => {
    if (md === undefined || shownDrawn !== key) return
    const frame = /** @type {HTMLIFrameElement} */ ($('shown').firstChild)
    frame.srcdoc = `<!doctype html><html ${tower.prefs.attributes()}><meta charset="utf-8"><base target="_blank"><link rel="stylesheet" href="/design.css"><style>${documentCss}${DOC_CSS}</style><article>${documentHtml(md, shownHref(s))}</article>`
  })
}

/**
 * The changes of the selected session, read when its Changes pane opens, every `CHANGES_POLL_MS` while it stays open,
 * and when a turn ends. Claude edits through scripts as often as through its edit tools, so git is read on a timer.
 */
const CHANGES_POLL_MS = 30_000
/** The last read: `viewed` holds each repo's marks, a file's path → the hash of the diff it was viewed at. @type {ChangesRead & { id: string, scope: ChangesScope } | undefined} */
let changes
/** @type {{ id: string, status: Card['status'], timer: ReturnType<typeof setInterval> } | undefined} */
let changesPoll
/** Files the viewer folded or unfolded against what their viewed mark says, by `fileKey`; this page only. @type {Set<string>} */
const folds = new Set()

/** What the selected worker's Changes compare (`ChangesScope`), all since the base until the viewer picks another; a new worker starts on all. */
/** @type {{ id: string | undefined, scope: ChangesScope }} */
let changesScope = { id: undefined, scope: 'all' }
/** @param {string} id @returns {ChangesScope} */
const scopeOf = (id) => (changesScope.id === id ? changesScope.scope : 'all')

/** @param {string} id @param {ChangesScope} scope @returns {Promise<void>} */
function compare(id, scope) {
  changesScope = { id, scope }
  pick = undefined
  render()
  return readChanges(id)
}

/** A file of the Changes read, by `fileKey`: one drawn from that read. @param {string} key */
const fileAt = (key) => /** @type {readonly [RepoChanges, DiffFile]} */ (changedFiles(read().repos).find(([repo, f]) => fileKey(repo, f) === key))

/** The Changes read, while the pane draws one. */
const read = () => /** @type {NonNullable<typeof changes>} */ (changes)

/** @param {Card | undefined} c */
function followChanges(c) {
  if (changesPoll && changesPoll.id !== c?.id) changesPoll = (clearInterval(changesPoll.timer), undefined)
  if (!c) return
  if (!changesPoll) {
    changesPoll = { id: c.id, status: c.status, timer: setInterval(() => readChanges(c.id), CHANGES_POLL_MS) }
    return readChanges(c.id)
  }
  const turnEnded = changesPoll.status === 'working' && c.status !== 'working'
  changesPoll.status = c.status
  if (turnEnded) readChanges(c.id)
}

/** Why the last read of a worker's Changes failed, by its id, while none is held. @type {{ id: string, message: string } | undefined} */
let changesFailed

/** @param {string} id */
async function readChanges(id) {
  const scope = scopeOf(id)
  const repos = await tower.get(/** @type {'changes/<id>'} */ (changesPath(id, scope))).catch((err) => {
    if (changes?.id === id) return void (lostAt || toast(err.message))
    changesFailed = { id, message: err.message }
    render()
  })
  if (!repos || changesPoll?.id !== id || scopeOf(id) !== scope) return
  changesFailed = undefined
  if (liveScope(repos, scope) !== scope) return compare(id, 'all')
  /** The marks of a repo are shared by every renderer in this browser, through `tower.store`. */
  const marks = /** @type {(Record<string, string> | undefined)[]} */ (await Promise.all(repos.map((repo) => tower.store.get(viewedKey(repo)))))
  changes = { id, scope, repos, at: Date.now(), viewed: Object.fromEntries(repos.map((repo, i) => [repo.dir, marks[i] ?? {}])) }
  render()
}

/** Files viewed of files changed, once read. @param {Card} c */
const changesTally = (c) => {
  if (changes?.id !== c.id) return ''
  const { viewed, files } = viewedCount(changes)
  return files ? `<small>${viewed}/${files}</small>` : ''
}

/** @param {string} key */
function toggleViewed(key) {
  const [repo, f] = fileAt(key)
  read().viewed[repo.dir] = marksToggled(read().viewed, repo, f)
  tower.store.set(viewedKey(repo), read().viewed[repo.dir])
  folds.delete(key)
  keepingFileTop($('changes'), key, render)
}

/** @param {string} key */
function toggleFold(key) {
  if (!folds.delete(key)) folds.add(key)
  keepingFileTop($('changes'), key, drawChanges)
}

/**
 * Lines picked in the Changes pane (`picking` while they are dragged across), and the note being written under them;
 * `pickFresh` until the box first takes focus.
 * @type {LinePick | undefined}
 */
let pick
let picking = false
let pickText = ''
let pickFresh = false
const dropPick = () => ((pick = undefined), (pickText = ''))
/** How the Changes pane draws a diff, unified or split, kept in `tower.store` for every renderer. */
let diffLayout = /** @type {DiffLayout} */ ((await tower.store.get(DIFF_LAYOUT_KEY)) ?? 'unified')

function drawChanges() {
  const c = /** @type {Card} */ (findCard(selected))
  const scope = scopeOf(c.id)
  const shown = changes?.id === c.id && changes.scope === scope ? changes : undefined
  const live = shown && livePick(shown, pick)
  if (shown && pick && !live) toast('The file changed under your pick: pick its lines again, your note is kept')
  if (shown) pick = live
  const failed = shown || changesFailed?.id !== c.id ? undefined : changesFailed.message
  drawPanel($('changes'), changesHtml({ read: shown, failed, folds, pick, picking, thread: threadOf(c), checkout: threadCheckoutOf(c), user: board.user.name, state: c.checkoutState, noting: can(c, 'note'), layout: diffLayout, scope }), { 'pick-text': pickText })
  if (pickFresh) $('changes').querySelector('[data-pick-text]')?.focus()
  pickFresh = false
  if (jump && shown) jumpToAnchor()
}

/** @param {string} value @param {boolean} extend */
function pickLine(value, extend) {
  pick = picked(read(), pick, value, extend)
  pickFresh = true
  drawChanges()
}

watchPickDrag($('changes'), {
  drag: (from, to) => ((pick = spanned(read(), from, to)), (picking = true), drawChanges()),
  drop: () => ((picking = false), (pickFresh = true), drawChanges()),
})

/** @param {Floor | undefined} f */
const reviewsOf = (f) => f?.collections.find((col) => col.id === REVIEWS)
/** @param {Card} c */
const keepsThreads = (c) => Boolean(reviewsOf(floorOf(c.project)))
/** The thread the worker's Reviews show: the one Tidy filed once its work landed, else its checkout's. @param {Card} c */
const threadItem = (c) => reviewsOf(floorOf(c.project))?.items.find((i) => i.id === cardThread(c).id)

/**
 * The thread of the selected worker's checkout as last read: read again whenever its file's version moves on the board.
 * @type {{ key: string, project: string, checkout: string, item: string | undefined, thread: ReviewThread | undefined, failed?: string } | undefined}
 */
let review

/** @param {Card} c */
function followThread(c) {
  const checkout = threadCheckoutOf(c)
  const item = threadItem(c)
  const key = `${c.project}/${item?.id ?? checkout}@${item?.modifiedAt ?? 'none'}`
  if (review?.key === key) return
  const same = review?.project === c.project && review.checkout === checkout && review.item === item?.id
  review = { key, project: c.project, checkout, item: item?.id, thread: !item ? { checkout, messages: [] } : same ? /** @type {NonNullable<typeof review>} */ (review).thread : undefined }
  if (!item) return
  tower.text(`collection/${c.project}/${REVIEWS}/${encodeURIComponent(item.id)}`).then(
    (text) => review?.key === key && ((review.thread = parseThread(text)), (review.failed = undefined), render()),
    (err) => review?.key === key && (review.thread ? toast(err.message) : ((review.failed = err.message), render())),
  )
}

/** @param {Card} c */
const threadOf = (c) => (review?.project === c.project && review.checkout === threadCheckoutOf(c) && review.item === threadItem(c)?.id ? review.thread : undefined)

/** What the worker hasn't seen of its checkout's thread, else how many notes it holds. @param {Card} c */
const reviewsTally = (c) => {
  const notes = /** @type {Floor} */ (floorOf(c.project)).threads.find((t) => t.checkout === threadCheckoutOf(c))?.messages
  return c.unseen ? `<small class="unseen" data-tip="${plural(c.unseen, 'note')} ${callsign(c.id)} hasn't seen">${c.unseen} new</small>` : notes ? `<small>${notes}</small>` : ''
}

/** A note is added only on a worker that offers `note`. @param {HTMLElement} button @param {Card} c @param {Partial<Verbs['review/append']>} fields */
async function addNote(button, c, fields) {
  const reply = await told(pressing(button, () => tower.run(/** @type {Call<'review/append'>} */ (c.calls.note), { author: board.user.name, ...fields })))
  if (reply) toast(`n${reply.n} is on the thread of ${threadCheckoutOf(c)}`)
  return reply
}

/** @param {HTMLElement} button */
async function addPicked(button) {
  if (!(await addNote(button, /** @type {Card} */ (findCard(selected)), { anchors: [pickAnchor(read().repos, /** @type {LinePick} */ (pick))], body: pickText }))) return
  dropPick()
  drawChanges()
}

/** The reviews pane's composer: the note being written on each checkout, by `<project>/<checkout>`, and the note it answers. @type {Map<string, string>} */
const noteDrafts = new Map()
/** @param {Card} c */
const draftKey = (c) => `${c.project}/${threadCheckoutOf(c)}`
/** @type {number | undefined} */
let noteRe

/** @param {HTMLElement} button */
async function addWritten(button) {
  const c = /** @type {Card} */ (findCard(selected))
  if (!(await addNote(button, c, { re: noteRe, body: noteDrafts.get(draftKey(c)) ?? '' }))) return
  noteDrafts.delete(draftKey(c))
  noteRe = undefined
  render()
}

/** The worker the viewer picked to send each checkout's notes to, by `<project>/<checkout>`; this page only. @type {Map<string, string>} */
const sendPicks = new Map()
/** @param {Card} c */
const pickedFor = (c) => sendPicks.get(`${c.project}/${threadCheckoutOf(c)}`)

/** Send reaches a worker whenever it is drawn. @param {HTMLElement} button @param {Card} c */
function sendNotes(button, c) {
  const target = /** @type {Card} */ (sendTarget(/** @type {Floor} */ (floorOf(c.project)), threadCheckoutOf(c), pickedFor(c)))
  const thread = threadOf(c)
  const text = sendText(THE_USER, threadCheckoutOf(c), thread ? unseenBy(thread, target.callsign).map((m) => m.n) : [], target.hiredBy?.callsign)
  told(pressing(button, () => tower.run(/** @type {Call<'submit'>} */ (target.calls.submit), { text }))).then((r) => r && toast(`Sent ${target.callsign} to the thread of ${threadCheckoutOf(c)}`))
}

/** @param {Card} c */
const threadView = (c) => threadViewOf(board, cardThread(c), {
  thread: threadOf(c), failed: threadOf(c) ? undefined : review?.failed, changes: changes?.id === c.id && changes.scope === 'all' ? changes.repos : undefined, picked: pickedFor(c), re: noteRe,
})

/** @param {Card} c */
const drawReviews = (c) => drawPanel($('reviews'), reviewsHtml(threadView(c)), { 'note-text': noteDrafts.get(draftKey(c)) ?? '' })

/** @param {number} n */
function replyTo(n) {
  noteRe = n
  render()
  $('reviews').querySelector('[data-note-text]')?.focus()
}

/** An anchor's lines in the Changes pane: its file unfolded, scrolled to once drawn. @type {Anchor | undefined} */
let jump

/** An anchor is drawn on the thread of the selected worker. @param {string} value */
function showAnchor(value) {
  const id = /** @type {string} */ (selected)
  jump = anchorOf(/** @type {ReviewThread} */ (threadOf(/** @type {Card} */ (findCard(id)))), value)
  showPane('changes')
  if (scopeOf(id) !== 'all') compare(id, 'all')
}

function jumpToAnchor() {
  const a = /** @type {Anchor} */ (jump)
  jump = undefined
  const spot = anchorSpot(read().repos, a)
  if (!spot) return toast(`${a.repo}:${a.path} has no changes now`)
  if (isFolded(read(), folds, spot.repo, spot.file)) toggleFold(spot.key)
  $('changes').querySelector(spotSelector(spot))?.scrollIntoView({ block: spot.row === -1 ? 'start' : 'center' })
}

/** A thread opened from the sidebar, on the worker most recently in its checkout; read as a kept item when no worker has been there. @param {string} project @param {string} checkout */
function openThread(project, checkout) {
  const c = workerIn(/** @type {Floor} */ (floorOf(project)), checkout)
  if (!c) return openItem(project, REVIEWS, threadId(checkout))
  select(c.id)
  showPane('reviews')
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
  paneChoice = pane
  if (pane === 'brief') term?.blur()
  render()
}

const DOC_CSS = `article { max-width: 980px; margin: 0; padding: var(--sp-xl) var(--sp-3xl) 48px; }`

/** The brief drawn last, the worker's and its conversations as read: what a copy reads its text from. @type {{ id: string, threads: Brief[] } | undefined} */
let briefShown
/** Whether the brief draws prompts and answers rendered or raw: this viewer's, kept in `tower.store`. */
let briefMarkdown = /** @type {BriefMarkdown} */ ((await tower.store.get(BRIEF_MARKDOWN_KEY)) ?? 'rendered')

/**
 * The worker's earlier sessions folded, then its session's conversations, each turn's prompt and answer, the latest at
 * the bottom. Opening a worker's brief scrolls to its end, and a redraw stays at the end when the viewer was there.
 * @param {Card} c
 * @param {Brief[]} threads
 */
function showBrief(c, threads) {
  const el = $('brief')
  const same = briefShown?.id === c.id
  const atEnd = !same || el.scrollHeight - el.scrollTop - el.clientHeight < 48
  briefShown = { id: c.id, threads }
  drawBrief(same)
  if (atEnd) el.scrollTop = el.scrollHeight
}

/** Draws the brief shown. */
function drawBrief(same = true) {
  const el = $('brief')
  const shown = /** @type {NonNullable<typeof briefShown>} */ (briefShown)
  const c = findCard(shown.id)
  /** @param {string} id */
  const promptBy = (id) => c?.conversations.find((conv) => conv.id === id)?.promptBy
  const open = same ? openFolds(el) : new Set()
  const expanded = same ? expandedSaid(el) : new Set()
  drawPanel(el, briefHtml({ briefs: shown.threads, said: markdownHtml, promptBy, open, expanded, markdown: briefMarkdown, working: c?.status === 'working' }), {})
}

/** @param {BriefMarkdown} markdown */
function chooseBriefMarkdown(markdown) {
  briefMarkdown = markdown
  tower.store.set(BRIEF_MARKDOWN_KEY, markdown)
  if (briefShown) drawBrief()
  drawSettings()
}

/** @param {string} text @param {string} what */
const copyText = (text, what) => navigator.clipboard.writeText(text).then(() => toast(`Copied ${what}`), (err) => toast(err.message))

/**
 * The sidebar shows the floors or the stats, kept in `tower.store`. The stats open on the floor in view (the selected
 * worker's, the open shelf's, archive's or draft's, else the top floor), with every floor's beside it; read again
 * every minute while shown.
 */
/** @typedef {'floors' | 'stats'} SideView */
let sideView = /** @type {SideView} */ ((await tower.store.get('side.view')) ?? 'floors')
/** @type {Pick<StatsView, 'stats' | 'failed' | 'at' | 'range'> & { all: boolean, reading: number }} */
const statsView = { stats: undefined, failed: undefined, at: undefined, range: /** @type {StatsRange} */ ((await tower.store.get('stats.range')) ?? 'week'), all: false, reading: 0 }
const STATS_POLL_MS = 60_000
/** @type {ReturnType<typeof setInterval> | undefined} */
let statsPoll

const floorInView = () =>
  findCard(selected)?.project ?? shelfOpen?.project ?? archiveOpen?.project ?? draftOpen?.project ?? itemOpen?.project ?? floorsTopDown()[0]?.id

function drawSideView() {
  const side = /** @type {HTMLElement} */ (document.querySelector('.side'))
  side.classList.toggle('on-stats', sideView === 'stats')
  for (const b of document.querySelectorAll('[data-side-view]')) (b.classList.toggle('on', b.dataset.sideView === sideView), b.setAttribute('aria-pressed', String(b.dataset.sideView === sideView)))
  if (sideView !== 'stats') return
  const floor = board.floors.find((f) => f.id === floorInView())
  const tabs = [...(floor ? [{ id: floor.id, label: floor.name }] : []), { id: STATS_ALL, label: 'All floors' }]
  const projects = board.floors.map((f) => ({ id: f.id, label: f.name, color: f.color }))
  drawPanel($('stats'), statsHtml({ ...statsView, projects, tabs, scope: statsView.all || !floor ? STATS_ALL : floor.id }), {})
}

async function readStats() {
  const reading = ++statsView.reading
  const stats = await tower.stats(statsQuery(statsView.range, Date.now())).catch((err) => {
    if (reading !== statsView.reading) return
    if (statsView.stats) return void (lostAt || toast(err.message))
    statsView.failed = err.message
    drawSideView()
  })
  if (!stats || reading !== statsView.reading) return
  Object.assign(statsView, { stats, failed: undefined, at: Date.now() })
  drawSideView()
}

/** @param {SideView} view */
function showSideView(view) {
  sideView = view
  tower.store.set('side.view', view)
  clearInterval(statsPoll)
  if (view === 'stats') (readStats(), (statsPoll = setInterval(readStats, STATS_POLL_MS)))
  drawSideView()
}

/** The nearest element from `el` up that scrolls its content: the list itself, or in the short layout the sidebar around it. @param {HTMLElement | null} el */
const scrollerOf = (el) => {
  for (let e = el; e; e = e.parentElement) if (/auto|scroll/.test(getComputedStyle(e).overflowY)) return e
  return /** @type {Element} */ (document.scrollingElement)
}

/** The `[data-hold]` row at a scrolled list's top edge, the last to start at or above it, and its offset from the edge. @param {HTMLElement} list */
const topAnchorOf = (list) => {
  const top = scrollerOf(list).getBoundingClientRect().top
  const row = [...list.querySelectorAll('[data-hold]')].findLast((el) => el.getBoundingClientRect().top <= top) ?? list.querySelector('[data-hold]')
  return row && { key: /** @type {string} */ (row.dataset.hold), offset: row.getBoundingClientRect().top - top }
}

/** The `[data-hold="key"]` row and its offset from a scrolled list's top edge, while any of it is in sight. @param {HTMLElement} list @param {string | undefined} key */
const sightAnchorOf = (list, key) => {
  const row = key && list.querySelector(`[data-hold="${CSS.escape(key)}"]`)
  if (!row) return undefined
  const edges = scrollerOf(list).getBoundingClientRect()
  const { top, bottom } = row.getBoundingClientRect()
  return top < edges.bottom && bottom > edges.top ? { key, offset: top - edges.top } : undefined
}

/**
 * Replaces a scrolled list's content with the `anchor` row kept where it was: a browser's scroll anchoring holds a list
 * still while rows above change height, and loses its anchor when the rows are replaced.
 * @param {HTMLElement} list
 * @param {string} html
 * @param {{ key: string, offset: number } | null | undefined} anchor
 */
function redrawHeld(list, html, anchor) {
  list.innerHTML = html
  const row = anchor && list.querySelector(`[data-hold="${CSS.escape(anchor.key)}"]`)
  if (!row) return
  const scroller = scrollerOf(list)
  scroller.scrollTop += row.getBoundingClientRect().top - scroller.getBoundingClientRect().top - anchor.offset
}

/** Writes `html` into `el` only when it changed, so a focused or hovered control in it survives a render. @type {WeakMap<HTMLElement, string>} */
const painted = new WeakMap()
/** @param {HTMLElement} el @param {string} html */
const paintOnce = (el, html) => painted.get(el) === html || (painted.set(el, html), (el.innerHTML = html))
/** `paintOnce`, the control that had focus in `el` keeping it. */
/** @param {HTMLElement} el @param {string} html */
const repaint = (el, html) => keepingFocus(el, () => paintOnce(el, html))

function render() {
  const all = cards()
  const duty = all.filter(onDuty)
  /** @param {Attention} a */
  const count = (a) => duty.filter((c) => c.attention === a).length
  const waiting = heededWaits(board, heed).length
  const offered = heededOffers(board, heed).length
  document.title = waiting + offered ? `(${waiting + offered}) The Tower` : 'The Tower'
  paintOnce($('tally'), `<span class="chip waits ${loudest(waitsOnYou()) ?? 'quiet'} ${waiting ? 'some' : ''}" tabindex="0" data-tip="${esc(`${WAITING_NAME}: ${WAITING_MEANS}`)}"><span class="lamp"></span><b>${waiting}</b> ${WAITING_NAME}</span>` +
    (offered ? `<span class="chip offered some" tabindex="0" data-tip="policies' slots offered and not yet started, that you haven't dismissed: N goes to them after the workers waiting on you"><span class="lamp"></span><b>${offered}</b> offered</span>` : '') +
    /** @type {Attention[]} */ (['needs', 'ready', 'working', 'quiet', 'broken'])
      .map((a) => `<span class="chip ${a}" tabindex="0" data-tip="${esc(`${ATTENTION_NAME[a]}: ${ATTENTION_MEANS[a]}\n\n${ON_DUTY_MEANS}`)}"><span class="lamp"></span><b>${count(a)}</b> ${ATTENTION_NAME[a]}</span>`).join(''))
  const host = lostAt ? 'unknown' : hostState(board)
  paintOnce($('host'), `<span class="host-state ${HOST_ATTENTION[host]}" tabindex="0" data-tip="${esc(HOST_MEANS[host])}"><span class="lamp"></span>${HOST_NAME[host]}</span>`)
  $('notes').innerHTML = claudeUntestedHtml(board) ?? ''
  paintKeys()
  paintLimits()
  const floors = $('floors')
  // The selected worker's row stays where a move or a click left it while in sight, so a move key's target stays in view.
  keepingFocus(floors, () => redrawHeld(floors, floorsTopDown().map(floorHtml).join(''), sightAnchorOf(floors, selected) ?? topAnchorOf(floors)))
  drawSideView()
  repaint($('rail'), railHtml(waiting))
  $('side-foot').innerHTML = board.config ? `<span>config</span><code data-tip="${esc(board.config)}"><bdi>${esc(board.config)}</bdi></code>${fileButtonsHtml(board.config)}` : ''
  const c = selected && findCard(selected)
  if (c) barHtml(c)
  if (draftOpen) draftHeadHtml()
  if (itemOpen) drawItem()
  if (archiveOpen) drawArchive()
  if (policiesOpen) drawPolicies()
  if (collectionOpen) drawCollection()
  if (!selected) repaint($('sky'), skylineHtml())
  paintSky()
  renderDock()
  drawSettings()
  tick()
}

/** The collapsed sidebar: a way back, the waiting count, and a lamp per session on duty. */
/** @param {number} waiting */
const railHtml = (waiting) =>
  `<button class="icon-btn" data-side aria-label="show the sidebar" data-tip="${withKeys('show the sidebar', 'sidebar')}" aria-keyshortcuts="${keyshortcuts(board.keys, 'sidebar')}">${ICON.sidebar}</button>
  ${waiting ? `<span class="count" data-tip="waiting on you">${waiting}<span class="sr-only"> waiting on you</span></span>` : ''}
  ${dutyOrder(board).map((c) => {
    const title = esc(callsign(c.id) + ' · ' + statusName(c) + (gistLine(c) ? ' · ' + gistLine(c) : ''))
    return `<a class="lamp ${lampOf(c)} ${c.id === selected ? 'sel' : ''}" href="#${c.id}"${c.id === selected ? ' aria-current="true"' : ''} aria-label="${title}" data-tip="${title}"></a>`
  }).join('')}`

/** The header's buttons name the chords of the commands they share, as the config binds them. */
function paintKeys() {
  $('keys-open').dataset.tip = withKeys('shortcuts and what the statuses mean', 'help')
  $('keys-open').setAttribute('aria-keyshortcuts', keyshortcuts(board.keys, 'help'))
  $('side-hide').dataset.tip = withKeys('hide the sidebar', 'sidebar')
  $('side-hide').setAttribute('aria-keyshortcuts', keyshortcuts(board.keys, 'sidebar'))
}

/** Under this width the sidebar is a rail, and the sidebar key opens it over the main pane until something opens there. */
const narrow = matchMedia('(max-width: 900px)')

function closeDrawer() {
  document.body.classList.remove('drawer')
}

function toggleSide() {
  if (narrow.matches) return document.body.classList.toggle('drawer')
  document.body.classList.toggle('collapsed')
  tower.store.set('side.collapsed', document.body.classList.contains('collapsed'))
}
document.body.classList.toggle('collapsed', (await tower.store.get('side.collapsed')) === true)

function tick() {
  if (!selected && !shelfOpen) paintSky()
  paintLimits()
  for (const el of document.querySelectorAll('[data-since]')) el.textContent = ago(pageNow() - Number(el.dataset.since))
  if (!lostAt && ring === 'remind' && Date.now() - rungAt >= REMIND_MS) ringFor(attentionOrder(board, heed))
}

/**
 * What this viewer did about the waits (`Heed` in cards.ts): dismissed, kept in `tower.store` for every renderer of
 * theirs, and visited by N this round. `ring`: how often a wait rings, kept there too; `rungAt`: when one last rang.
 * @type {Heed}
 */
let heed = { dismissed: new Set(), visited: new Set() }
/** @type {Ring} */
let ring = 'once'
let rungAt = Date.now()
/** The board the last transitions were read against: none until the first, which is silent. @type {Board | undefined} */
let attended

/** The worker you are looking at: its waits notify and ring for nobody. @param {string} id */
const watching = (id) => document.hasFocus() && selected === id

/**
 * One notification per wait that begins, none for the waits already on the board when the page opened, for those
 * dismissed or for the worker being watched; each closes once its wait is over. The first of them rings.
 * @type {Map<string, Notification>}
 */
const alerts = new Map()
/** @param {Board} next */
function attend(next) {
  const { began, ended } = transitions(attended, next)
  const offers = offerTransitions(attended, next)
  attended = next
  for (const a of [...ended, ...offers.ended]) (alerts.get(a.key)?.close(), alerts.delete(a.key))
  /** @param {Attended} a */
  const heeded = (a) => !heed.dismissed.has(a.key)
  const said = [waitsBeganLine(began.filter(heeded), callsign), offersBeganLine(offers.began.filter(heeded))].filter(Boolean).join(' ')
  if (said) announce(said)
  const fresh = began.filter((w) => heeded(w) && !watching(w.id))
  const opened = offers.began.filter(heeded)
  if (Notification.permission === 'granted') {
    for (const w of fresh) alerts.set(w.key, showAlert(/** @type {Card} */ (findCard(w.id)), w))
    for (const o of opened) alerts.set(o.key, showOfferAlert(o))
  }
  ringFor([...fresh, ...opened])
}

/** Rings for the first of `attended` (waits, then offers) not of the worker being watched, unless rings are off. @param {Attended[]} attended */
function ringFor(attended) {
  const sound = ring === 'off' ? undefined : ringingSound(attended, document.hasFocus() ? selected : undefined)
  if (!sound) return
  rungAt = Date.now()
  playSound(SOUNDS[sound])
}

/** @type {AudioContext | undefined} */
let audio
/** @param {(typeof SOUNDS)[Sound]} sound */
function playSound({ notes, wave, step }) {
  const ctx = (audio ??= new AudioContext())
  const now = ctx.currentTime
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = wave
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0, now + i * step)
    gain.gain.linearRampToValueAtTime(0.12, now + i * step + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + i * step + 0.9)
    osc.connect(gain).connect(ctx.destination)
    osc.start(now + i * step)
    osc.stop(now + i * step + 1)
  })
}

/** The viewer's dismissals and ring setting as `tower.store` keeps them: another renderer of theirs may have changed them. */
async function readHeed() {
  const [dismissed, stored] = await Promise.all([tower.store.get(DISMISSED_KEY), tower.store.get(RING_KEY)])
  heed = { ...heed, dismissed: new Set(/** @type {string[] | undefined} */ (dismissed) ?? []) }
  ring = /** @type {Ring | undefined} */ (stored) ?? 'once'
}

/** A wait's or an offer's key, dismissed for this viewer. @param {string} key */
function dismissWait(key) {
  const dismissed = dismissing(board, heed.dismissed, key)
  heed = { ...heed, dismissed: new Set(dismissed) }
  tower.store.set(DISMISSED_KEY, dismissed)
  alerts.get(key)?.close()
  render()
}

/** @param {Ring} next */
function chooseRing(next) {
  ring = next
  tower.store.set(RING_KEY, ring)
  drawSettings()
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
    if (selected === c.id) showPane(shownPane(s))
    if (!(document.hasFocus() && selected === c.id) && Notification.permission === 'granted') showShownAlert(c, s)
  }
  shownPrimed = true
}

/** @param {Card} c @param {CardShown} s */
function showShownAlert(c, s) {
  const n = new Notification(`${callsign(c.id)} ${s.kind === 'link' ? 'asks you to open' : 'shows you'} ${shownTitle(s)}`, { body: `${c.project}: ${s.target}`, tag: shownKey(s) })
  n.onclick = () => (window.focus(), select(c.id), showPane(shownPane(s)), n.close())
}

/** @param {Offer} o */
function showOfferAlert(o) {
  const n = new Notification(`${o.title ?? o.tag} · offered`, { body: `${/** @type {Floor} */ (floorOf(o.project)).name}: ${offerWords(board, o, Date.now())}`, tag: o.key })
  n.onclick = () => (window.focus(), openPolicies(o.project), n.close())
  return n
}

/** @param {Card} c @param {Wait} w */
function showAlert(c, w) {
  const n = new Notification(`${callsign(c.id)} · ${statusName(c)}`, {
    body: `${c.project}: ${gistLine(c)}`, tag: c.id, requireInteraction: w.reason === 'blocked' || w.reason === 'asks',
  })
  n.onclick = () => (window.focus(), select(c.id), n.close())
  return n
}

/** The settings popover, drawn again whenever what it shows may have changed: only while open. @type {string | undefined} */
let settingsDrawn
const drawSettings = () => $('settings').matches(':popover-open') && paintSettings()
function paintSettings() {
  const html = settingsHtml([alertsSection(Notification.permission), soundSection(ring), ...prefSections(tower.prefs.get(), faceInstalled), markdownSection(briefMarkdown)])
  if (html === settingsDrawn) return
  const focused = document.activeElement?.closest('#settings [data-ring-choice], #settings [data-sound-play], #settings [data-brief-markdown], #settings [data-pref]')
  const again = focused && [...focused.attributes].filter((a) => a.name.startsWith('data-') && a.name !== 'data-tip').map((a) => `[${a.name}="${CSS.escape(a.value)}"]`).join('')
  $('settings').innerHTML = settingsDrawn = html
  if (again) $('settings').querySelector(again)?.focus()
}
$('settings-open').innerHTML = ICON.settings
$('keys-open').innerHTML = ICON.help
$('side-hide').innerHTML = ICON.sidebar
placeOnOpen($('settings'), () => $('settings-open'))
$('settings').addEventListener('beforetoggle', (e) => e.newState === 'open' && paintSettings())
$('settings').addEventListener('click', async (e) => {
  const el = /** @type {Element} */ (e.target).closest('[data-alerts-ask], [data-ring-choice], [data-sound-play]')
  if (!el) return
  if (el.matches('[data-alerts-ask]')) return (await Notification.requestPermission(), drawSettings())
  if (el.dataset.ringChoice) return chooseRing(/** @type {Ring} */ (el.dataset.ringChoice))
  playSound(SOUNDS[/** @type {Sound} */ (el.dataset.soundPlay)])
})
wirePrefs($('settings'), tower.prefs.set)

/** The worker a key moved to, its sidebar row scrolled into view when it is out of sight. @param {string} id */
function moveTo(id) {
  select(id)
  $('floors').querySelector(`.sess[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest' })
}

/** To the worker a move key names, in the order every renderer moves in (src/shared/cards.ts). @param {Move | 'waiting'} move */
function go(move) {
  if (move !== 'waiting') {
    const to = neighbours(board, selected, heed)[move]
    return to ? moveTo(to.id) : toast('Nobody is on duty')
  }
  const attended = attentionOrder(board, heed)
  const step = nextAttended(attended, heed.visited, { id: selected, policies: policiesOpen?.project })
  heed = { ...heed, visited: step.visited }
  if (step.to) return isOffer(step.to) ? openPolicies(step.to.project) : moveTo(step.to.id)
  toast(attended.length ? 'Nobody else is waiting on you' : 'Nobody is waiting on you')
}

/** Those `send-home` ends: the worker and everyone under it that runs, each a card. A worker offering `send-home` has its calls. @param {Card} c */
const sentHome = (c) => [c, ...crewOf(cards(), c)].filter((h) => sendHomeCalls(c).some(([, { id }]) => id === h.id))
/** @param {Card} c */
const sendHomeCalls = (c) => /** @type {Call<'kill'>[]} */ (c.calls['send-home'])

/** @param {Card} c */
const sendHomeTitle = (c) => sentHome(c).length === 1 ? `end ${callsign(c.id)}; it can be resumed` : `end ${sentHome(c).map((h) => h.callsign).join(', ')}: ${callsign(c.id)} and everyone under it that runs; each can be resumed`

/** Ends a worker with everyone under it that runs, the deepest first; the toast offers the resume of one sent home alone. @param {HTMLElement} button @param {Card} c */
async function sendHome(button, c) {
  const sent = sentHome(c)
  if (!confirm(sendHomeAsk(c, sent))) return
  const ended = await pressing(button, async () => {
    for (const call of sendHomeCalls(c)) if (!(await told(tower.run(call)))) return false
    return true
  })
  if (ended) toast(`Sent ${sent.map((h) => h.callsign).join(', ')} home`, sent.length === 1 ? { label: 'Resume', run: () => resumeSentHome(c) } : undefined)
}

/** Says `msg` to a screen reader, through the polite live region: a new node each time, so the same words are said again. @param {string} msg */
const announce = (msg) => $('announce').replaceChildren(Object.assign(document.createElement('p'), { textContent: msg }))

/** Tells what just happened, with an action that follows it up when given (`/toasts.js`, a live region of its own). */
const toast = toaster($('toasts'))

/**
 * A request whose failure is told in a toast, answering `undefined`.
 * @template T
 * @param {Promise<T>} request
 * @returns {Promise<T | undefined>}
 */
const told = (request) => request.catch((err) => (toast(err.message), undefined))

/** @param {string} project */
const floorOf = (project) => board.floors.find((f) => f.id === project)

/** @type {Xterm.Terminal | undefined} */
let term
/** @type {Fit.FitAddon | undefined} */
let fit
/** @type {(() => void) | undefined} */
let stopScreen
const REFIT_DEBOUNCE_MS = 120

/**
 * The PTY has one size: whoever types owns it. Opening the terminal claims it when no other terminal is open on the
 * session, fitting the PTY to this pane; a resize from anyone else hands it back, and the view follows the PTY at a
 * font scaled to fit.
 * @type {{ cols: number, rows: number } | undefined}
 */
let claimed

/** The terminals' face and the size the viewer drives at, from their appearance. */
const termFont = () => terminalFont(tower.prefs.get())
/** @param {number} cols @param {number} rows */
const fitFont = (cols, rows) => fitSize($('c-screen'), cols, rows, termFont())

const leaveHint = () => (keysLabel(board.keys, 'leave-terminal') ? ` · ${keysLabel(board.keys, 'leave-terminal')} leaves` : '')

/** Says how the open terminal is held. */
function showMode(text = isOwner() ? `in control · ${openTerm().cols}×${openTerm().rows}` : `watching · type to take control${leaveHint()}`) {
  $('c-mode').className = isOwner() ? 'owner' : ''
  $('c-mode').textContent = text
}

/** The terminal open on the selected worker, and its fit, while one is. */
const openTerm = () => /** @type {Xterm.Terminal} */ (term)

function claim() {
  openTerm().options.fontSize = termFont().size
  const fitting = /** @type {Fit.FitAddon} */ (fit)
  fitting.fit()
  claimed = { cols: openTerm().cols, rows: openTerm().rows }
  told(tower.call('resize', { id: /** @type {string} */ (selected), ...claimed }))
  showMode()
}

const isOwner = () => Boolean(claimed && term && claimed.cols === term.cols && claimed.rows === term.rows)

const sendKeys = tower.keys
const sendShellKeys = tower.shellKeys

/** @param {number} cols @param {number} rows */
function followPty(cols, rows) {
  if (openTerm().cols === cols && openTerm().rows === rows) return
  openTerm().resize(cols, rows)
  if (!isOwner()) openTerm().options.fontSize = fitFont(cols, rows)
  showMode()
}

/** @param {string} data */
const typed = (data) => {
  if (document.activeElement !== openTerm().textarea) return
  if (!isOwner()) claim()
  sendKeys(/** @type {string} */ (selected), data)
}

/** @param {Extract<TerminalMsg, { t: 'snapshot' }>} snapshot */
function openTerminal({ cols, rows, data, exited, terminals }) {
  term?.dispose()
  term = new Terminal({ cols, rows, fontSize: fitFont(cols, rows), fontFamily: termFont().family, cursorBlink: false, scrollback: 0, theme: terminalTheme(scheme()) })
  fit = new FitAddon.FitAddon()
  term.loadAddon(fit)
  term.open($('c-screen'))
  term.write(data)
  if (exited) return (term.attachCustomKeyEventHandler(terminalKeymap(() => board.keys, run, () => {})), showMode(`past session · read-only${leaveHint()}`))
  term.attachCustomKeyEventHandler(terminalKeymap(() => board.keys, run, typed))
  term.onData(typed)
  reportWheel(term, typed)
  if (terminals === 0) claim()
  else showMode()
  term.focus()
}

function closeTerminal() {
  claimed = undefined
  stopScreen?.()
  term?.dispose()
  term = undefined
  $('c-screen').innerHTML = ''
  $('c-mode').textContent = ''
}

/** The selected session is kept in the URL hash, so a reload reopens it. @param {string} id */
function select(id) {
  closeDrawer()
  leaveItem()
  leaveShelf()
  leaveDraft()
  leaveArchive()
  leavePolicies()
  leaveCollection()
  closeTerminal()
  arriving = undefined
  selected = id
  foldedOver = undefined
  paneChoice = undefined
  dropPick()
  noteRe = undefined
  history.replaceState(null, '', `#${id}`)
  $('main').classList.remove('home')
  render()
  stopScreen = tower.watch(`terminal/${id}`, (streamed) => {
    const msg = /** @type {TerminalMsg} */ (streamed)
    if (msg.t === 'snapshot') openTerminal(msg)
    if (msg.t === 'o') openTerm().write(msg.data)
    if (msg.t === 'r') followPty(.../** @type {[number, number]} */ (msg.size.split('x').map(Number)))
    if (msg.t === 'x') select(id)
  })
}

function goHome() {
  closeDrawer()
  followChanges(undefined)
  leaveItem()
  leaveShelf()
  leaveDraft()
  leaveArchive()
  leavePolicies()
  leaveCollection()
  closeTerminal()
  arriving = undefined
  selected = undefined
  history.replaceState(null, '', location.pathname)
  $('main').classList.add('home')
  render()
}

/** @type {ReturnType<typeof setTimeout> | undefined} */
let refitTimer
new ResizeObserver(() => {
  clearTimeout(refitTimer)
  refitTimer = setTimeout(() => {
    if (!term) return
    if (isOwner()) claim()
    else term.options.fontSize = fitFont(term.cols, term.rows)
  }, REFIT_DEBOUNCE_MS)
}).observe($('screen'))

/** The shelf entry open in the main pane; for a collection, its files and the one shown. @type {{ project: string, n: number, file?: string, files?: string[] } | undefined} */
let shelfOpen

/** @param {string} project @param {number} n @param {string} [file] */
const shelfPath = (project, n, file) => `shelf/${project}/${n}${file ? '/' + file.split('/').map(encodeURIComponent).join('/') : ''}`
/** @param {string} project @param {number} n @param {string} [file] */
const shelfUrl = (project, n, file) => `/${shelfPath(project, n, file)}`
/** @param {{ project: string, n: number, file?: string }} open */
const shelfHash = ({ project, n, file }) => `#shelf/${project}/${n}${file ? '/' + encodeURIComponent(file) : ''}`


/** @param {string} project @param {number} n @param {string} [file] */
function openShelf(project, n, file) {
  closeDrawer()
  const f = board.floors.find((f) => f.id === project)
  const entry = f?.shelf?.[n]
  if (!f || !entry) return goHome()
  /** The entry's fields its kind names. @type {ShelfEntry & { url?: string, renderer?: string }} */
  const named = entry
  leaveItem()
  leaveDraft()
  leaveArchive()
  leavePolicies()
  leaveCollection()
  closeTerminal()
  arriving = undefined
  closeRelay()
  selected = undefined
  shelfOpen = { project, n, file }
  history.replaceState(null, '', shelfHash(shelfOpen))
  $('main').classList.remove('home')
  $('main').classList.add('shelf')
  $('shelf-view').style.cssText = paint(project)
  const own = /** @type {Record<string, string | undefined>} */ ({ html: `/run/${project}/${n}`, url: named.url, renderer: named.renderer && rendererUrl(named.renderer) })[shelfKind(entry)]
  const tab = own ? `<a href="${esc(own)}" target="_blank" rel="noreferrer">${ICON.remote} new tab</a>` : ''
  const paths = shelfPaths(f, entry)
  $('shelf-head').innerHTML = `<span class="label">${esc(entry.label)}</span><span class="dim">${esc(f.name)} · ${esc(shelfSource(entry))}</span>
    <span class="actions">${paths.file ? fileButtonsHtml(paths.file) : ''}${paths.folder ? fileButtonsHtml(paths.folder) : ''}${tab}${CLOSE_HOME}</span>`
  $('shelf-body').innerHTML = ''
  render()
  if (shelfKind(entry) === 'html') showPage(shelfUrl(project, n, shelfPage(entry)))
  if (shelfKind(entry) === 'renderer') showPage(rendererUrl(/** @type {string} */ (named.renderer)))
  if (shelfKind(entry) === 'url') showUrl(/** @type {string} */ (named.url))
  if (shelfKind(entry) === 'md') showCollection(entry, file)
}

/** A page framed with the relay, at an opaque origin: an `html` entry's, or a declared renderer's, of the shelf entry open. @param {string} url */
function showPage(url) {
  const { project, n } = /** @type {NonNullable<typeof shelfOpen>} */ (shelfOpen)
  $('shelf-body').innerHTML = `<iframe id="shelf-page" class="page" sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-pointer-lock" allow="clipboard-write"></iframe>`
  pageRelay = tower.relay($('shelf-page'), url, { self: { project, n }, ui: towerVerbs, stored: () => Promise.all([readHeed(), readCrewFolds()]).then(render) })
}

function leaveShelf() {
  closeRelay()
  shelfOpen = undefined
  $('main').classList.remove('shelf')
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
  const opened = shelfOpen
  const up = await fetch(url, { mode: 'no-cors', cache: 'no-store' }).then(() => true, () => false)
  if (shelfOpen !== opened) return
  $('shelf-body').innerHTML = up
    ? `<iframe id="shelf-url" class="page" src="${esc(url)}" allow="clipboard-read; clipboard-write"></iframe>`
    : `<div class="shelf-empty">nothing answers at ${esc(url)}<br><br><button data-shelf-retry>look again</button></div>`
  $('shelf-url')?.addEventListener('load', sendScheme)
}

/** A kept item by its tag, as every renderer calls it; any other file by its name. @param {ShelfEntry} entry @param {string} file */
const shelfFileName = (entry, file) => ('item' in entry ? tagOf(file) : base(file).replace(/\.md$/, ''))

/** The files of the md entry open. @param {ShelfEntry} entry @param {string | undefined} file */
async function showCollection(entry, file) {
  const opened = /** @type {NonNullable<typeof shelfOpen>} */ (shelfOpen)
  const files = await tower.get(/** @type {'shelf/<project>/<n>'} */ (shelfPath(opened.project, opened.n))).catch((err) => {
    if (shelfOpen === opened) $('shelf-body').innerHTML = failedHtml(shelfSource(entry), err.message, 'data-shelf-retry')
  })
  if (!files || shelfOpen !== opened) return
  if (!files.length) return ($('shelf-body').innerHTML = `<div class="shelf-empty">no file matches ${esc(shelfSource(entry))}</div>`)
  opened.files = files
  const hub = /** @type {Floor} */ (floorOf(opened.project)).hub
  $('shelf-body').innerHTML = `<div class="shelf-files">${files.map((f) => `<div class="shelf-file"><button data-doc="${esc(f)}" data-tip="${esc(f)}">${esc(shelfFileName(entry, f))}</button>${fileButtonsHtml(onDisk(hub, f))}</div>`).join('')}</div>
    <iframe id="shelf-doc" sandbox="allow-same-origin"></iframe>`
  showDoc(files.includes(/** @type {string} */ (file)) ? /** @type {string} */ (file) : files[0])
}

/** The document renders in a frame where its scripts can't run; the tower still reads its clicks. @param {string} file */
async function showDoc(file) {
  const opened = /** @type {NonNullable<typeof shelfOpen>} */ (shelfOpen)
  opened.file = file
  history.replaceState(null, '', shelfHash(opened))
  for (const el of document.querySelectorAll('[data-doc]')) {
    el.classList.toggle('sel', el.dataset.doc === file)
    if (el.dataset.doc === file) el.setAttribute('aria-current', 'true')
    else el.removeAttribute('aria-current')
  }
  const md = await told(tower.text(shelfPath(opened.project, opened.n, file)))
  if (md === undefined) return
  if (shelfOpen !== opened || opened.file !== file) return
  const doc = $('shelf-doc')
  doc.onload = () => /** @type {Document} */ (doc.contentDocument).addEventListener('click', followLink)
  doc.srcdoc = `<!doctype html><html ${tower.prefs.attributes()}><meta charset="utf-8"><link rel="stylesheet" href="/design.css"><style>${documentCss}</style><article>${documentHtml(md, `/${shelfPath(opened.project, opened.n, file)}`)}</article>`
}

/** A link to another file of the collection opens it here; a web or mail link opens in a new tab, any other is refused. @param {MouseEvent} e */
function followLink(e) {
  const opened = /** @type {Required<NonNullable<typeof shelfOpen>>} */ (shelfOpen)
  const a = /** @type {Element} */ (e.target).closest('a[href]')
  const href = a?.getAttribute('href')
  if (!href || href.startsWith('#')) return
  e.preventDefault()
  const target = new URL(href, `http://shelf/${opened.file}`)
  if (target.host !== 'shelf') return safeHref(href) ? window.open(target.href, '_blank', 'noreferrer') : toast(`${href} is not a link the tower opens`)
  const file = decodeURIComponent(target.pathname.slice(1))
  if (opened.files.includes(file)) return showDoc(file)
  toast(`${file} is not in this collection`)
}

/** The floor whose past workers fill the main pane, and the words they are filtered by. @type {{ project: string, words: string[] } | undefined} */
let archiveOpen

/** @param {string} project */
function openArchive(project) {
  closeDrawer()
  const f = floorOf(project)
  if (!f) return goHome()
  followChanges(undefined)
  leaveItem()
  leaveShelf()
  leaveDraft()
  leavePolicies()
  leaveCollection()
  closeTerminal()
  arriving = undefined
  selected = undefined
  archiveOpen = { project, words: [] }
  history.replaceState(null, '', `#archive/${project}`)
  $('main').classList.remove('home')
  $('main').classList.add('archived')
  $('archive-view').style.cssText = paint(project)
  $('archive-head').innerHTML = `<span class="label">Archive</span><span class="dim">${esc(f.name)}</span>
    <input id="archive-filter" type="search" placeholder="filter by callsign, prompt or answer" autocomplete="off">
    <span class="actions"><small class="dim" id="archive-count"></small>${CLOSE_HOME}</span>`
  render()
  $('archive-filter').focus()
}

function leaveArchive() {
  archiveOpen = undefined
  $('main').classList.remove('archived')
}

let archiveDrawn = ''
/** Past workers by crew (`pastCrews`), each worker with its crew under it. @param {PastCrew[]} crews @returns {string} */
const pastCrewsHtml = (crews) =>
  crews.map(({ card, crew }) => pastHtml(card) + (crew.length ? `<div class="crew">${pastCrewsHtml(crew)}</div>` : '')).join('')

/** By crew, each worker with every conversation it held and the way to resume or reach it. */
function drawArchive() {
  const open = /** @type {NonNullable<typeof archiveOpen>} */ (archiveOpen)
  const f = /** @type {Floor} */ (floorOf(open.project))
  if (!archives.has(f.id)) readArchive(f.id)
  const { cards: archive, failed } = /** @type {{ cards?: Card[], failed?: string }} */ (archives.get(f.id))
  if (!archive) {
    $('archive-count').textContent = plural(pastCount(f), 'worker')
    const html = failed ? failedHtml('the archive', failed, 'data-archive-read') : '<div class="empty">reading the archive…</div>'
    if (html !== archiveDrawn) $('archive-list').innerHTML = archiveDrawn = html
    return
  }
  const past = pastCrews(f, archive)
  const shown = pastMatching(past, open.words)
  const [all, matching] = [pastSize(past), pastSize(shown)]
  $('archive-count').textContent = matching === all ? plural(all, 'worker') : `${matching} of ${all}`
  const html = pastCrewsHtml(shown) || '<div class="empty">no past worker matches</div>'
  if (html !== archiveDrawn) $('archive-list').innerHTML = archiveDrawn = html
}

$('archive-view').addEventListener('input', (e) => {
  const input = /** @type {HTMLInputElement} */ (e.target)
  const open = /** @type {NonNullable<typeof archiveOpen>} */ (archiveOpen)
  if (input.id !== 'archive-filter') return
  open.words = wordsOf(input.value)
  drawArchive()
})

/** The floor whose policies fill the main pane (`policiesHtml`, /panels.js). @type {{ project: string } | undefined} */
let policiesOpen

/** @param {string} project */
function openPolicies(project) {
  closeDrawer()
  const f = floorOf(project)
  if (!f) return goHome()
  followChanges(undefined)
  leaveItem()
  leaveShelf()
  leaveDraft()
  leaveArchive()
  leaveCollection()
  closeTerminal()
  arriving = undefined
  selected = undefined
  policiesOpen = { project }
  history.replaceState(null, '', `#policies/${project}`)
  $('main').classList.remove('home')
  $('main').classList.add('policing')
  $('policies-view').style.cssText = paint(project)
  render()
}

function leavePolicies() {
  policiesOpen = undefined
  $('main').classList.remove('policing')
}

/** A floor's collection listed whole in the main pane, newest first: its tray in the sidebar lists only the newest. @type {{ project: string, collection: string } | undefined} */
let collectionOpen

/** @param {string} project @param {string} collection */
function openCollection(project, collection) {
  closeDrawer()
  if (!floorOf(project)?.collections.some((c) => c.id === collection)) return goHome()
  followChanges(undefined)
  leaveItem()
  leaveShelf()
  leaveDraft()
  leaveArchive()
  leavePolicies()
  closeTerminal()
  arriving = undefined
  selected = undefined
  collectionOpen = { project, collection }
  history.replaceState(null, '', `#kept/${project}/${collection}`)
  $('main').classList.remove('home')
  $('main').classList.add('listing')
  $('collection-view').style.cssText = paint(project)
  render()
}

function leaveCollection() {
  collectionOpen = undefined
  $('main').classList.remove('listing')
}

function drawCollection() {
  const open = /** @type {NonNullable<typeof collectionOpen>} */ (collectionOpen)
  const f = floorOf(open.project)
  const c = f?.collections.find((c) => c.id === open.collection)
  if (!f || !c) return goHome()
  const drafts = c.id === DRAFTS
  repaint($('collection-head'), `<span class="label">${esc(c.label)}</span><span class="dim">${esc(f.name)}</span><span class="actions"><small class="dim">${plural(c.items.length, 'item')}</small>${CLOSE_HOME}</span>`)
  repaint($('collection-list'), collectionTrayHtml(f.id, c, (item) => (drafts ? draftTitle(f.id, item) : keptTitle(f.id, c.id, item)), undefined, Date.now(), drafts ? newDraftHtml(f) : ''))
}

function drawPolicies() {
  const f = floorOf(/** @type {NonNullable<typeof policiesOpen>} */ (policiesOpen).project)
  if (!f) return goHome()
  repaint($('policies-head'), `<span class="label">Policies</span><span class="dim">${esc(f.name)}</span><span class="actions">${CLOSE_HOME}</span>`)
  drawPanel($('policies-body'), policiesHtml({ board, floor: f, now: Date.now(), dismissed: heed.dismissed }), {})
}

/**
 * A policy's Run now or Approve, or an offer's Accept: a run started opens its worker once the board carries it.
 * @param {HTMLElement} button
 * @param {Call<'policy/run' | 'policy/approve'>} call
 */
async function policyCall(button, call) {
  const policy = /** @type {string} */ (call[1].policy)
  const title = floorOf(/** @type {string} */ (call[1].project))?.policies.find((p) => p.id === policy)?.title ?? policy
  const reply = await told(pressing(button, () => /** @type {Promise<Replies['policy/run'] | Replies['policy/approve']>} */ (tower.run(call))))
  if (!reply) return
  toast(policyDoneLine(call, title, reply))
  if (call[0] === 'policy/run') selectArriving(/** @type {Replies['policy/run']} */ (reply).id)
}

/** The draft open in the main pane (src/shared/drafts.ts), its textarea holding `text`. @type {Draft | undefined} */
let draftOpen
/** @type {ReturnType<typeof setTimeout> | undefined} */
let saveTimer
const AUTOSAVE_MS = 800

/** @param {{ project: string, id?: string }} draft */
const draftHash = ({ project, id }) => `#draft/${project}${id ? '/' + encodeURIComponent(id) : ''}`
const targets = () => cards().filter((c) => can(c, 'submit'))
const DRAFT_STATE = { conflict: 'changed on disk', new: 'new · saved once it has words', editing: 'editing', saved: 'saved' }

/** The head of the draft open: an item is listed in its floor's drafts. */
function draftHeadHtml() {
  const d = /** @type {Draft} */ (draftOpen)
  const f = /** @type {Floor} */ (floorOf(d.project))
  const item = d.id === undefined ? undefined : draftItem(board.floors, d.project, d.id)
  const keptBy = item?.keptBy
  const by = keptBy ? ` · kept by <a href="#${keptBy.session}" data-tip="go to the worker that kept it">${keptBy.callsign}</a>` : ''
  const tag = item ? `<button class="tag" data-copy="${esc(item.tag)}" data-tip="${esc(`${/** @type {FloorCollection} */ (draftsOf(f)).dir}/${item.id}`)} · click to copy the tag">${esc(item.tag)}</button>` : ''
  const file = item && fileButtonsHtml(`${/** @type {FloorCollection} */ (draftsOf(f)).dir}/${item.id}`)
  $('draft-head').innerHTML = `<span class="label">Draft</span>${tag}${file ?? ''}<span class="dim">${esc(f.name)} · ${DRAFT_STATE[draftState(d)]}${by}</span>
    <span class="actions"><small class="dim">⌘⏎ new session</small>
      ${heldWhy('spawn') ? heldHtml('spawn', 'Start session', 'Start session', 'primary') : can(f, 'spawn') ? '<button class="primary" data-draft-act="send" data-tip="start a new session on this prompt">Start session</button>' : ''}
      ${targets().length ? '<button data-draft-act="transfer" data-tip="type this prompt into a running worker">Send to worker…</button>' : ''}
      <button class="danger" data-draft-act="delete">Delete</button>
      ${CLOSE_HOME}</span>`
  $('draft-note').innerHTML = d.conflict !== undefined
    ? `<span>Someone else changed this draft while you were editing it.</span>
      <button data-draft-act="reload">Take theirs</button><button data-draft-act="keep">Keep mine</button>`
    : ''
}

/** A new draft, or an existing one once its text has arrived: the textarea stays read-only until then. @param {string} project @param {string} [id] */
async function openDraft(project, id) {
  closeDrawer()
  leaveItem()
  leaveShelf()
  leaveDraft()
  leaveArchive()
  leavePolicies()
  leaveCollection()
  closeTerminal()
  selected = undefined
  arriving = undefined
  const d = newDraft(project)
  draftOpen = d
  history.replaceState(null, '', draftHash({ project, id }))
  $('main').classList.remove('home')
  $('main').classList.add('drafting')
  $('draft-view').style.cssText = paint(project)
  $('draft-text').value = ''
  $('draft-text').readOnly = Boolean(id)
  render()
  if (id) {
    const item = draftItem(board.floors, project, id)
    const loaded = item && (await loadDraft(draftIo, project, item).catch((err) => (toast(err.message), null)))
    if (draftOpen !== d) return
    if (loaded === null) return goHome()
    if (!loaded) return (goHome(), toast('That draft is gone'))
    draftOpen = loaded
    $('draft-text').value = loaded.text
    $('draft-text').readOnly = false
    render()
  }
  $('draft-text').focus()
}

/** Leaving keeps what was typed: its save is queued like any other. */
function leaveDraft() {
  if (!draftOpen) return
  clearTimeout(saveTimer)
  if (keepsApart(draftOpen)) toast('Your edits were kept as a new draft')
  leave(draftIo, draftOpen)
  closeDraft()
}

function closeDraft() {
  clearTimeout(saveTimer)
  draftOpen = undefined
  $('main').classList.remove('drafting')
}

/** Resolves to whether the draft's text is on disk; a first save gives it an id, which the URL then names. */
function saveNow() {
  clearTimeout(saveTimer)
  const d = /** @type {Draft} */ (draftOpen)
  return save(draftIo, d).then((ok) => (draftOpen === d && (history.replaceState(null, '', draftHash(d)), render()), ok))
}

$('draft-text').addEventListener('input', () => {
  edit(/** @type {Draft} */ (draftOpen), $('draft-text').value)
  clearTimeout(saveTimer)
  saveTimer = setTimeout(saveNow, AUTOSAVE_MS)
  draftHeadHtml()
})
$('draft-text').addEventListener('keydown', (e) => {
  const id = commandOf(board.keys, e, 'field')
  if (id === 'save-draft') (e.preventDefault(), saveNow())
  if (id === 'submit') (e.preventDefault(), sendDraft())
})

/** The board shows the open draft as it is now: deleted elsewhere closes it, a change elsewhere replaces or conflicts. */
async function followDraft() {
  const d = draftOpen
  if (!d?.id) return
  const outcome = await follow(draftIo, d, draftItem(board.floors, d.project, d.id))
  if (draftOpen !== d) return
  if (outcome === 'gone') return (closeDraft(), goHome(), toast('The draft was deleted elsewhere'))
  if (outcome === 'replaced') $('draft-text').value = d.text
  draftHeadHtml()
}

/** @param {boolean} take */
function settleConflict(take) {
  const d = /** @type {Draft} */ (draftOpen)
  settle(draftIo, d, take).then(() => draftOpen === d && render())
  if (take) $('draft-text').value = d.text
  draftHeadHtml()
}

/** Send and transfer save the draft first, then delete it once its words have reached a session. */
async function savedDraft() {
  const d = /** @type {Draft} */ (draftOpen)
  if (!d.text.trim()) return toast('The draft is empty')
  clearTimeout(saveTimer)
  const text = await sendable(draftIo, d)
  if (text === undefined) return d.conflict !== undefined && toast('Settle the change made on disk first')
  return { d, text }
}

/** @param {Draft} d */
const deleteSent = (d) => {
  if (draftOpen === d) closeDraft()
  return discard(draftIo, d)
}

async function sendDraft() {
  const f = /** @type {Floor} */ (floorOf(/** @type {Draft} */ (draftOpen).project))
  if (!can(f, 'spawn')) return
  const sent = await savedDraft()
  if (sent) openSpawn(f.id, sent)
}

/** This floor's workers first, then the rest top down. */
function openTransfer() {
  const project = /** @type {Draft} */ (draftOpen).project
  const order = floorsTopDown().map((f) => f.id)
  /** @param {Card} c */
  const rank = (c) => (c.project === project ? -1 : order.indexOf(c.project))
  $('transfer-targets').innerHTML = targets().sort((a, b) => rank(a) - rank(b) || byStart(a, b)).map((c) => `<button value="${c.id}" style="${paint(c.project)}">
      <span class="call">${callsign(c.id)}</span><span class="where">${esc(/** @type {Floor} */ (floorOf(c.project)).name)} · ${statusName(c)}</span>
      <span class="line">${lineOf(c)}</span></button>`).join('')
  $('transfer').returnValue = ''
  $('transfer').showModal()
}

$('transfer').addEventListener('close', async () => {
  const id = $('transfer').returnValue
  if (!id || !draftOpen) return
  const sent = await savedDraft()
  if (!sent) return
  const reply = await told(tower.run(/** @type {Call<'submit'>} */ (/** @type {Card} */ (findCard(id)).calls.submit), { text: sent.text }))
  if (!reply) return
  await deleteSent(sent.d)
  select(id)
})

/** Deleting is the user's, and done at once: what was typed is saved first, and the toast's Undo puts the file back, under its id. */
async function deleteDraft() {
  const d = /** @type {Draft} */ (draftOpen)
  closeDraft()
  goHome()
  save(draftIo, d)
  const gone = await discard(draftIo, d)
  if (gone) toast(`Deleted "${titleOf(gone.text)}" from Drafts`, { label: 'Undo', run: () => undoDelete(gone) })
}

/** @param {Deleted} gone */
const undoDelete = (gone) => told(restoreDraft(draftIo, gone)).then((r) => r && toast(`"${titleOf(gone.text)}" is back in Drafts`))

/** The kept item open in the main pane, and the version of it its body was drawn from. @type {{ project: string, collection: string, id: string, drawn: number | undefined } | undefined} */
let itemOpen

/** @typedef {{ project: string, collection: string, id: string }} ItemRef */
/** @param {ItemRef} ref */
const itemHash = ({ project, collection, id }) => `#kept/${project}/${collection}/${encodeURIComponent(id)}`
/** @param {ItemRef} ref */
const itemOf = ({ project, collection, id }) => {
  const c = floorOf(project)?.collections.find((c) => c.id === collection)
  return { c, item: c?.items.find((i) => i.id === id) }
}

/** @param {string} project @param {string} collection @param {string} id */
function openItem(project, collection, id) {
  closeDrawer()
  if (!itemOf({ project, collection, id }).item) return toast('That item is gone')
  followChanges(undefined)
  leaveItem()
  leaveShelf()
  leaveDraft()
  leaveArchive()
  leavePolicies()
  leaveCollection()
  closeTerminal()
  arriving = undefined
  selected = undefined
  itemOpen = { project, collection, id, drawn: undefined }
  history.replaceState(null, '', itemHash(itemOpen))
  $('main').classList.remove('home')
  $('main').classList.add('kept')
  $('item-view').style.cssText = paint(project)
  render()
}

function leaveItem() {
  if (!itemOpen) return
  itemOpen = undefined
  $('main').classList.remove('kept')
  $('item-body').innerHTML = ''
}

/** The head says what the item is and who kept it; the body is drawn again only when the item changes. Deleted elsewhere, it closes. */
function drawItem() {
  const open = /** @type {NonNullable<typeof itemOpen>} */ (itemOpen)
  const { c, item } = itemOf(open)
  if (!c || !item) return (goHome(), toast('The item was deleted'))
  const f = /** @type {Floor} */ (floorOf(open.project))
  const file = itemFile(c, item.id)
  const by = item.keptBy ? ` · kept by <a href="#${item.keptBy.session}" data-tip="go to the worker that kept it">${esc(item.keptBy.callsign)}</a>` : ''
  const back = c.id === POLICIES ? `<button class="icon-btn" data-policies="${esc(f.id)}" aria-label="back to the policies" data-tip="back to the floor's policies">${ICON.back}</button>` : ''
  repaint($('item-head'), `${back}<span class="label">${esc(c.label)}</span><button class="tag" data-copy="${esc(item.tag)}" data-tip="${esc(file)} · click to copy the tag">${esc(item.tag)}</button>${fileButtonsHtml(file)}
    <span class="dim">${esc(f.name)} · ${esc(keptTitle(f.id, c.id, item))}${by} · changed ${span(Date.now() - item.modifiedAt)} ago</span>
    <span class="actions"><a href="/${esc(itemPath(f.id, c.id, item.id))}" target="_blank" rel="noreferrer" data-tip="open it on its own">${ICON.remote} new tab</a>
      <button class="danger" data-item-act="delete">Delete</button>
      ${CLOSE_HOME}</span>`)
  if (open.drawn !== item.modifiedAt) showItemBody(c, item)
}

/**
 * Markdown and text are read and drawn in a frame where nothing runs; an html item runs framed at an origin of its own
 * with no API (the shelf's `item` entry grants that); an image is shown; any other file is left to Finder and the editor.
 */
/** @param {FloorCollection} c @param {FloorItem} item */
async function showItemBody(c, item) {
  const opened = /** @type {NonNullable<typeof itemOpen>} */ (itemOpen)
  opened.drawn = item.modifiedAt
  const kind = itemKind(item.id)
  const url = `/${itemPath(opened.project, c.id, item.id)}`
  if (kind === 'html') return ($('item-body').innerHTML = `<iframe class="page" title="${esc(item.tag)}" sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-pointer-lock" allow="clipboard-write" src="${esc(url)}?v=${item.modifiedAt}"></iframe>`)
  if (kind === 'image') return ($('item-body').innerHTML = `<div class="item-image"><img src="${esc(url)}?v=${item.modifiedAt}" alt="${esc(item.tag)}"></div>`)
  if (!readsText(kind)) return ($('item-body').innerHTML = `<div class="shelf-empty">the tower shows no ${esc(item.id.split('.').pop())} file<br><br>reveal it in Finder or open it in your editor ${fileButtonsHtml(itemFile(c, item.id))}</div>`)
  const text = await tower.text(url.slice(1)).catch((err) => {
    if (itemOpen === opened) $('item-body').innerHTML = failedHtml(item.tag, err.message, 'data-item-read')
  })
  if (text === undefined || itemOpen !== opened || opened.drawn !== item.modifiedAt) return
  $('item-body').innerHTML = `<iframe id="item-doc" title="${esc(item.tag)}" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"></iframe>`
  $('item-doc').srcdoc = `<!doctype html><html ${tower.prefs.attributes()}><meta charset="utf-8"><base target="_blank"><link rel="stylesheet" href="/design.css"><style>${documentCss}${itemsCss}</style><article>${itemTextHtml(item.id, text)}</article>`
}

/** Deleting is the user's: asked first, and the view closes before the file goes. */
async function deleteKept() {
  const open = /** @type {NonNullable<typeof itemOpen>} */ (itemOpen)
  const { c, item } = /** @type {{ c: FloorCollection, item: FloorItem }} */ (itemOf(open))
  const { project, collection, id } = open
  if (!confirm(deleteAsk(c, item, keptTitle(project, collection, item)))) return
  goHome()
  if (await told(tower.call('collection/delete', { project, collection, id }))) toast(`Deleted ${item.tag} from ${c.label}`)
}

/**
 * A session the page started, to open once the board carries it: the host answers before the tower has read the
 * new log, and until then there is no card to draw and no screen to stream. Any other way the viewer goes cancels it.
 * @type {string | undefined}
 */
let arriving

/** @param {string} id */
function selectArriving(id) {
  if (findCard(id)) return select(id)
  goHome()
  arriving = id
}

/**
 * The shell open in the dock: its id and stream, and its terminal once the snapshot has arrived.
 * @typedef {{ id: string, stop: () => void }} ShellView
 * @typedef {ShellView & { term: Xterm.Terminal, fit: Fit.FitAddon, size: { cols: number, rows: number } }} MountedShell
 * @type {(ShellView & { term?: undefined }) | MountedShell | undefined}
 */
let shell
const SHELL_SCROLLBACK = 2000
/** The shell open, with its terminal. */
const mounted = () => /** @type {MountedShell} */ (shell)

/** @param {Board['shells'][number]} sh */
const shellFloor = (sh) => board.floors.find((f) => f.id === sh.project)

const shellAddHtml = () => shellPlaces(board.floors).length ? `<button class="tab-add" popovertarget="shell-pick" aria-label="new shell" data-tip="new shell: pick a directory">${ICON.plus}</button>` : ''

/** The directories a new shell can start in, the floor in view first, each floor under its name. */
function shellPickHtml() {
  const places = shellPlaces(board.floors, floorInView())
  return [...new Set(places.map((p) => p.project))].map((project) => `<div class="pick-floor eyebrow" style="${paint(project)}">${esc(/** @type {Floor} */ (floorOf(project)).name)}</div>` +
    places.filter((p) => p.project === project).map((p) => `<button data-shell-project="${esc(p.project)}" data-shell-dir="${esc(p.dir)}" data-tip="${esc(p.dir)}">${esc(p.name)}${p.worktree ? ` <small>${ICON.branch} ${esc(p.worktree)}</small>` : ''}</button>`).join('')).join('')
}
$('shell-pick').addEventListener('toggle', (e) => e.newState === 'open' && ($('shell-pick').innerHTML = shellPickHtml()))
placeOnOpen($('shell-pick'), () => /** @type {HTMLElement} */ ($('tabs').querySelector('.tab-add')))

function renderDock() {
  if (!board.termsUp) return ($('tabs').innerHTML = `<span>shells: ${esc(whyNot(board, 'shell'))}</span>`)
  if (!board.shells.length) return ($('tabs').innerHTML = `${shellAddHtml()}<span>no shells · ${ICON.plus} starts one in a floor's directory</span>`)
  $('tabs').innerHTML = shellAddHtml() + [...board.shells].sort(byStart).map((sh) =>
    `<button class="tab ${sh.id === shell?.id ? 'open' : ''}" style="${paint(sh.project)}" data-shell="${sh.id}" data-tip="${esc(sh.cwd)}">
      <span class="where">${esc(shellWhere(shellFloor(sh), sh))}</span><span class="what">${esc(sh.activity)}</span>
      <span class="icon-btn" data-kill-shell="${sh.id}" aria-hidden="true" data-tip="kill this shell">${ICON.close}</span></button>`).join('')
}

/** @param {string} id */
function openShell(id) {
  closeShell()
  const opening = /** @type {ShellView} */ ({ id })
  shell = opening
  $('shell-pane').style.cssText = paint(board.shells.find((sh) => sh.id === id)?.project)
  $('main').classList.add('shell-open')
  opening.stop = tower.watch(`shell/${id}`, (streamed) => {
    const msg = /** @type {ShellStream} */ (streamed)
    if (msg.t === 'snapshot') mountShell(msg)
    if (msg.t === 'o') mounted().term.write(msg.data)
    if (msg.t === 'error') (toast(msg.message), closeShell())
    if (msg.t === 'x') closeShell()
  })
  renderDock()
}

/** The stream sends a snapshot again each time it reconnects, as after a tower restart: it replaces the terminal. @param {Extract<ShellStream, { t: 'snapshot' }>} snapshot */
function mountShell({ data, cols, rows }) {
  const open = /** @type {NonNullable<typeof shell>} */ (shell)
  open.term?.dispose()
  const id = open.id
  const term = new Terminal({ cols, rows, fontSize: termFont().size, fontFamily: termFont().family, cursorBlink: false, scrollback: SHELL_SCROLLBACK, theme: terminalTheme(scheme()) })
  const fit = new FitAddon.FitAddon()
  term.loadAddon(fit)
  term.open($('s-screen'))
  term.write(data)
  /** @param {string} d */
  const typed = (d) => document.activeElement === term.textarea && sendShellKeys(id, d)
  term.attachCustomKeyEventHandler(terminalKeymap(() => board.keys, run, typed))
  term.onData(typed)
  Object.assign(open, { term, fit, size: { cols, rows } })
  fitShell()
  term.focus()
}

/** The open shell takes the size of its pane. */
function fitShell() {
  if (!shell?.term) return
  shell.fit.fit()
  const { cols, rows } = shell.term
  if (cols === shell.size.cols && rows === shell.size.rows) return
  shell.size = { cols, rows }
  told(tower.call('shell/resize', { id: shell.id, cols, rows }))
}

/** Closes the view only: the shell keeps running until it is killed. */
function closeShell() {
  shell?.stop()
  shell?.term?.dispose()
  shell = undefined
  $('s-screen').innerHTML = ''
  $('main').classList.remove('shell-open')
  renderDock()
}

/** A shell starts on a floor that offers `shell`. @param {HTMLElement} button @param {string} project @param {string} cwd */
async function spawnShell(button, project, cwd) {
  const reply = await told(pressing(button, () => tower.run(/** @type {Call<'shell/spawn'>} */ (/** @type {Floor} */ (floorOf(project)).calls.shell), { cwd })))
  if (reply) openShell(reply.id)
}

/** @type {ReturnType<typeof setTimeout> | undefined} */
let shellRefitTimer
new ResizeObserver(() => {
  clearTimeout(shellRefitTimer)
  shellRefitTimer = setTimeout(fitShell, REFIT_DEBOUNCE_MS)
}).observe($('s-screen'))

/** The grip's reading of the shells' height, which stays between 120px and all but 160px of the window. */
/** @param {number} h */
const markGrip = (h) => {
  $('grip').setAttribute('aria-valuenow', String(h))
  $('grip').setAttribute('aria-valuemax', String(innerHeight - 160))
}
/** @param {number} px */
const resizeShells = (px) => {
  const h = Math.round(Math.max(120, Math.min(innerHeight - 160, px)))
  $('main').style.setProperty('--shell-h', `${h}px`)
  markGrip(h)
}
const SHELLS_STEP_PX = 24

$('grip').addEventListener('pointerdown', (e) => {
  $('grip').setPointerCapture(e.pointerId)
  const bottom = $('shell-pane').getBoundingClientRect().bottom
  const tabs = $('tabs').offsetHeight
  $('grip').onpointermove = (ev) => resizeShells(bottom - tabs - ev.clientY)
  $('grip').onpointerup = () => ($('grip').onpointermove = null)
})
$('grip').addEventListener('focus', () => markGrip($('shell-pane').offsetHeight))
$('grip').addEventListener('keydown', (e) => {
  const step = { ArrowUp: SHELLS_STEP_PX, ArrowDown: -SHELLS_STEP_PX }[e.key]
  if (!step || e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return
  e.preventDefault()
  e.stopPropagation()
  resizeShells($('shell-pane').offsetHeight + step)
})

/** The draft the spawn dialog was opened with, deleted once its session starts. @type {Draft | undefined} */
let spawnDraft

/** The spawn form's own fields, by name. @param {string} name */
const spawnField = (name) => /** @type {HTMLInputElement | HTMLTextAreaElement} */ ($('spawn').querySelector(`[name=${name}]`))
/** The spawn form's other parts, by selector. @param {string} selector */
const spawnPart = (selector) => /** @type {HTMLElement} */ ($('spawn').querySelector(selector))

/** @param {string} projectId @param {{ d: Draft, text: string }} [sent] */
function openSpawn(projectId, sent) {
  const f = /** @type {Floor} */ (floorOf(projectId))
  const top = floorsTopDown()
  spawnDraft = sent?.d
  $('spawn').dataset.project = projectId
  $('spawn').innerHTML = spawnFormHtml(f, { sign: signHtml(top.length - top.indexOf(f), f.name), draft: sent && titleOf(sent.text) })
  spawnField('prompt').value = sent?.text ?? ''
  syncSpawn()
  $('spawn').returnValue = ''
  $('spawn').showModal()
  spawnField('prompt').focus()
}

/** The form's values as they stand, its branch placeholder, callsign's refusal and summary redrawn from them. */
function syncSpawn() {
  const f = /** @type {Floor} */ (floorOf(/** @type {string} */ ($('spawn').dataset.project)))
  const form = /** @type {HTMLFormElement} */ ($('spawn').querySelector('form'))
  const v = spawnForm(f, /** @type {Iterable<[string, FormDataEntryValue]>} */ (new FormData(form)))
  const refused = callsignRefusal(board, v)
  spawnField('branch').placeholder = branchPlaceholder(f, cutNameOf(v))
  spawnField('callsign').setCustomValidity(refused)
  spawnPart('[data-callsign-why]').textContent = refused
  spawnPart('[data-summary]').innerHTML = spawnSummaryHtml(f, v)
  return v
}
$('spawn').addEventListener('input', syncSpawn)
$('spawn').addEventListener('click', (e) => {
  const close = /** @type {Element} */ (e.target).closest('[data-close]')
  if (!close || spawnStarting()) return
  if (close.dataset.close === 'cancel') return $('spawn').close('cancel')
  if (/** @type {HTMLFormElement} */ ($('spawn').querySelector('form')).reportValidity()) startSpawn(close)
})
/** While Start waits on its reply the form stays: closing it would keep as a draft a prompt the worker may already have. */
$('spawn').addEventListener('cancel', (e) => spawnStarting() && e.preventDefault())
const spawnStarting = () => $('spawn').querySelector('[data-close=start]')?.getAttribute('aria-busy') === 'true'

/** Start stays busy until the tower answers: the form closes on a new worker and says why when there is none. */
/** @param {HTMLElement} button */
async function startSpawn(button) {
  const f = /** @type {Floor} */ (floorOf(/** @type {string} */ ($('spawn').dataset.project)))
  const error = spawnPart('[data-spawn-error]')
  error.textContent = ''
  const reply = await pressing(button, () => tower.run(...spawnCall(f, syncSpawn()))).catch((err) => ((error.textContent = err.message), undefined))
  if (!reply) return
  $('spawn').close('start')
  if (reply.cut) toast(`worktree ${reply.cut.name} on ${reply.cut.branch}, from ${[...new Set(reply.cut.bases.map((b) => b.base))].join(', ')}`)
  if (spawnDraft) await deleteSent(spawnDraft)
  selectArriving(reply.id)
}
$('spawn').addEventListener('keydown', (e) => {
  if (commandOf(board.keys, e, 'field') === 'submit') spawnPart('[data-close=start]').click()
})

$('spawn').addEventListener('close', () => $('spawn').returnValue !== 'start' && keepSpawnPrompt())

/** A prompt typed into a form closed without starting is kept in the floor's drafts, or in the draft it was opened on. */
async function keepSpawnPrompt() {
  const f = floorOf(/** @type {string} */ ($('spawn').dataset.project))
  const text = spawnField('prompt').value
  if (!f || !draftsOf(f)) return
  const kept = await keepUnsent(draftIo, f.id, spawnDraft, text)
  if (kept && draftOpen === kept) $('draft-text').value = kept.text
  if (kept) toast(`${spawnDraft ? 'Your edits were kept in the draft' : 'Your prompt was kept as a draft'}: ${titleOf(kept.text)} (${tagOf(/** @type {string} */ (kept.id))})`)
}

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

/** A worker offering `let-go` has its call. @param {HTMLElement} button @param {Card} c */
async function letGo(button, c) {
  if (!confirm(letGoAsk(c))) return
  if (await told(pressing(button, () => tower.run(/** @type {Call<'let-go'>} */ (c.calls['let-go']))))) toast(letGoneLine(c))
}

/** Killing asks first; once killed, the toast offers the worker's resume, read from the board or its floor's archive. */
/** @param {Card} c */
async function resumeSentHome(c) {
  const dead = cards().find((d) => d.id === c.id) ?? (await told(tower.archive(c.project)))?.find((d) => d.id === c.id)
  if (!dead?.calls.resume) return toast(`${callsign(c.id)} can't be resumed now`)
  const reply = await told(tower.run(dead.calls.resume))
  if (reply?.t === 'spawned') selectArriving(reply.id)
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
  if (target.closest('[data-item-read]')) return ((/** @type {NonNullable<typeof itemOpen>} */ (itemOpen).drawn = undefined), render())
  const copy = target.closest('[data-copy]')?.dataset.copy
  if (copy) return copyText(copy, copy)
  const said = target.closest('[data-copy-said]')?.dataset.copySaid
  if (said) return copyText(/** @type {string} */ (saidText(/** @type {NonNullable<typeof briefShown>} */ (briefShown).threads, said)), said.endsWith(':prompt') ? 'the prompt' : 'the answer')
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
  if (landingOf) return told(pressing(landingOf, () => tower.landing({ project: /** @type {Card} */ (findCard(selected)).project, branch: /** @type {string} */ (landingOf.dataset.landingOf) }))).then((l) => l && showLanding(l))
  const landing = target.closest('[data-landing]')
  if (landing) return told(pressing(landing, () => tower.landing(JSON.parse(/** @type {string} */ (landing.dataset.landing))))).then((l) => l && showLanding(l))
  const discarding = target.closest('[data-discard]')
  if (discarding) {
    const w = board.floors.flatMap((f) => f.worktrees).find((w) => JSON.stringify(w.calls.discard) === discarding.dataset.discard)
    if (!w || !confirm(discardAsk(w))) return
    return told(pressing(discarding, () => tower.run(/** @type {Call<'worktree/discard'>} */ (w.calls.discard), { author: board.user.name }))).then((r) => r && toast(discardedLine(r)))
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
    const probe = /** @type {Board['probes'][number]} */ (board.probes.find((p) => p.name === probeRun.dataset.probeRun))
    return told(pressing(probeRun, () => tower.run(/** @type {Call<'probe/run'>} */ (probe.calls.run)))).then((r) => r && toast(probedLine(probe.name, r)))
  }
  const tidyCall = target.closest('[data-tidy-call]')
  if (tidyCall) return confirm(tidyCall.dataset.tidyAsk) && told(pressing(tidyCall, () => tower.run(/** @type {Call<'tidy'>} */ (JSON.parse(/** @type {string} */ (tidyCall.dataset.tidyCall)))))).then((r) => r && toast(tidiedLine(r)))
  const tidy = target.closest('[data-tidy]')
  if (tidy) {
    const f = /** @type {Floor} */ (floorOf(/** @type {string} */ (tidy.dataset.tidy)))
    return confirm(tidyAllAsk(f, Date.now())) && told(pressing(tidy, () => tower.run(/** @type {Call<'tidy'>} */ (f.calls.tidy)))).then((r) => r && toast(tidiedLine(r)))
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
  if (target.closest('[data-reply-clear]')) return ((noteRe = undefined), render())
  const toNote = target.closest('[data-to-note]')?.dataset.toNote
  if (toNote) return $('reviews').querySelector(`[data-note="${toNote}"]`)?.scrollIntoView({ block: 'center' })
  const anchored = target.closest('[data-anchor]')?.dataset.anchor
  if (anchored) return showAnchor(anchored)
  const send = target.closest('[data-send]')
  if (send) return sendNotes(send, /** @type {Card} */ (findCard(selected)))
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
  if (sideTo) return showSideView(sideTo)
  const scope = target.closest('[data-stats-scope]')?.dataset.statsScope
  if (scope) return ((statsView.all = scope === STATS_ALL), drawSideView())
  const range = /** @type {StatsRange | undefined} */ (target.closest('[data-stats-range]')?.dataset.statsRange)
  if (range) return (Object.assign(statsView, { range, stats: undefined }), tower.store.set('stats.range', range), drawSideView(), readStats())
  if (target.closest('[data-stats-read]')) return ((statsView.failed = undefined), drawSideView(), readStats())
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
  if (policyFile) return openItem(/** @type {NonNullable<typeof policiesOpen>} */ (policiesOpen).project, POLICIES, policyFile)
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
  if (layout) return ((diffLayout = layout), tower.store.set(DIFF_LAYOUT_KEY, layout), drawChanges())
  if (target.closest('[data-changes-read]')) return ((changesFailed = undefined), render(), readChanges(/** @type {string} */ (selected)))
  const open = target.closest('[data-open]')
  if (open) return told(pressing(open, () => tower.run(/** @type {Call<'open'>} */ (/** @type {Floor} */ (floorOf(/** @type {string} */ (open.dataset.openProject))).calls.editor), { dir: open.dataset.open })))
  const shelved = target.closest('[data-shelf]')
  if (shelved) return openShelf(/** @type {string} */ (shelved.dataset.shelf), Number(shelved.dataset.n))
  const doc = target.closest('[data-doc]')
  if (doc) return showDoc(/** @type {string} */ (doc.dataset.doc))
  if (target.closest('[data-archive-read]')) return (readArchive(/** @type {NonNullable<typeof archiveOpen>} */ (archiveOpen).project), render())
  if (target.closest('[data-thread-read]')) return ((review = undefined), render())
  if (target.closest('[data-shelf-retry]')) {
    const { project, n } = /** @type {NonNullable<typeof shelfOpen>} */ (shelfOpen)
    return openShelf(project, n)
  }
  const newShell = target.closest('[data-shell-dir]')
  if (newShell) {
    if ($('shell-pick').matches(':popover-open')) $('shell-pick').hidePopover()
    return spawnShell(newShell, /** @type {string} */ (newShell.dataset.shellProject), /** @type {string} */ (newShell.dataset.shellDir))
  }
  const killShell = target.closest('[data-kill-shell]')?.dataset.killShell
  if (killShell) {
    const sh = /** @type {Board['shells'][number]} */ (board.shells.find((sh) => sh.id === killShell))
    return confirm(killShellAsk(shellFloor(sh), sh)) && told(pressing(/** @type {HTMLElement} */ (target.closest('[data-kill-shell]')), () => tower.call('shell/kill', { id: killShell })))
  }
  const tab = target.closest('[data-shell]')?.dataset.shell
  if (tab) return tab === shell?.id ? closeShell() : openShell(tab)
  const archive = target.closest('[data-archive]')?.dataset.archive
  if (archive) return archiveOpen?.project === archive ? goHome() : openArchive(archive)
  const section = target.closest('[data-section]')?.dataset.section
  if (section) return toggleSection(section)
  const floorFold = target.closest('[data-floor-fold]')?.dataset.floorFold
  if (floorFold) return toggleFloor(floorFold)
  const reapOne = target.closest('[data-reap-process]')
  if (reapOne) return told(pressing(reapOne, () => tower.run(JSON.parse(/** @type {string} */ (reapOne.dataset.reapProcess)))))
  const reapable = target.closest('[data-reap]')
  if (reapable) {
    const c = /** @type {Card} */ (findCard(reapable.dataset.reap))
    if (confirm(reapAsk(c))) told(pressing(reapable, () => tower.run(/** @type {Call<'reap'>} */ (c.calls.reap))))
    return
  }
  const actor = target.closest('[data-act]')
  const act = actor?.dataset.act
  if (act === 'send-home') return sendHome(/** @type {HTMLElement} */ (actor), /** @type {Card} */ (findCard(selected)))
  if (act === 'review') {
    const author = /** @type {Card} */ (findCard(selected))
    return told(pressing(/** @type {HTMLElement} */ (actor), () => tower.run(/** @type {Call<'spawn'>} */ (author.calls.review)))).then((r) => r && toast(`A reviewer of ${callsign(author.id)} starts in ${/** @type {NonNullable<Replies['spawn']['cut']>} */ (r.cut).name}, a fork of ${author.checkout}`))
  }
  if (act === 'home') return goHome()
  if (act === 'drive') {
    showPane('screen')
    return term?.focus()
  }
  const crewFolded = target.closest('[data-crew-fold]')?.dataset.crewFold
  if (crewFolded) return toggleCrewFold(crewFolded)
  const away = target.closest('[data-away]')?.dataset.away
  if (away) return moveTo(away)
  const card = target.closest('[data-id]')
  if (card) select(/** @type {string} */ (card.dataset.id))
})
$('home').onclick = goHome

document.addEventListener('change', (e) => {
  const target = /** @type {Element} */ (e.target)
  const scope = /** @type {HTMLSelectElement | null} */ (target.closest('[data-changes-scope]'))?.value
  if (scope) return compare(/** @type {string} */ (selected), scope)
  const picker = /** @type {HTMLSelectElement | null} */ (target.closest('[data-send-pick]'))
  if (!picker) return
  const c = /** @type {Card} */ (findCard(selected))
  sendPicks.set(`${c.project}/${threadCheckoutOf(c)}`, picker.value)
  render()
})

$('screen').addEventListener('input', (e) => {
  const box = /** @type {HTMLTextAreaElement} */ (e.target)
  if (box.matches('[data-note-text]')) noteDrafts.set(draftKey(/** @type {Card} */ (findCard(selected))), box.value)
  if (box.matches('[data-pick-text]')) pickText = box.value
})

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

$('screen').addEventListener('keydown', (e) => {
  const target = /** @type {Element} */ (e.target)
  const id = commandOf(board.keys, e, 'field')
  if (target.matches('[data-note-text]') && id === 'submit') return (e.preventDefault(), addWritten(/** @type {HTMLElement} */ ($('screen').querySelector('[data-note-add]'))))
  if (target.matches('[data-pick-text]') && id === 'submit') return (e.preventDefault(), addPicked(/** @type {HTMLElement} */ ($('screen').querySelector('[data-pick-add]'))))
  if (target.matches('[data-pick-text]') && id === 'cancel-pick') return (e.preventDefault(), dropPick(), drawChanges())
})

/**
 * The viewer's appearance, kept by tower.js in this browser for every page of theirs, on the root that the stylesheet
 * reads; terminals, the framed documents, the open shelf page and the settings follow it whenever it changes.
 */
const scheme = tower.scheme

function redrawDocs() {
  shownDrawn = undefined
  if (shelfOpen?.file) showDoc(shelfOpen.file)
  if (itemOpen && readsText(itemKind(itemOpen.id))) itemOpen.drawn = undefined
  render()
}

function applyScheme() {
  for (const t of [term, shell?.term]) if (t) t.options.theme = terminalTheme(scheme())
  redrawDocs()
}

/**
 * A new face or size reaches every open terminal once the face has loaded. A terminal the viewer drives fits again,
 * resizing the PTY: a bigger font gives the session fewer columns and rows. A watched one fits the PTY it follows.
 */
let fontShown = termFont()
async function applyTermFont() {
  const font = termFont()
  if (font.family === fontShown.family && font.size === fontShown.size) return
  fontShown = font
  await loadTerminalFont(font)
  if (fontShown !== font) return
  if (term) {
    term.options.fontFamily = font.family
    if (isOwner()) claim()
    else term.options.fontSize = fitFont(term.cols, term.rows)
  }
  if (shell?.term) {
    Object.assign(shell.term.options, { fontFamily: font.family, fontSize: font.size })
    fitShell()
  }
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
  $('keys-list').innerHTML = keymapSheetHtml(board.keys)
  $('keys-legend').innerHTML = statusLegendHtml()
  $('keys').showModal()
  $('keys').scrollTop = 0
}

/** The control focus was on before it went into a terminal, where leaving the terminal brings it back. @type {HTMLElement | undefined} */
let beforeTerminal
document.addEventListener('focusin', (e) => {
  const target = /** @type {HTMLElement} */ (e.target)
  if (!target.closest('.xterm')) beforeTerminal = target
})

/** Focus leaves the terminal for the control it came from, the selected pane's tab, or the page itself. */
function leaveTerminal() {
  const tab = $('bar-line').querySelector('[role=tab][aria-selected=true]')
  const to = [beforeTerminal, tab].find((el) => el?.isConnected && el.checkVisibility() && !el.closest('[inert]'))
  if (to) to.focus()
  else /** @type {HTMLElement} */ (document.activeElement).blur()
}

/** Shows a pane the selected worker has, with focus in its terminal or on its tab, from where Tab enters it. */
/** @param {Pane} pane */
function toPane(pane) {
  if (!selected || !$('bar-line').querySelector(`[data-pane=${pane}]`)) return false
  showPane(pane)
  if (pane === 'screen') term?.focus()
  else /** @type {HTMLElement} */ ($('bar-line').querySelector(`[data-pane=${pane}]`)).focus()
  return true
}

/** Runs the keymap's command `id` for the keydown `e`. Returns whether it did something. @param {string} id @param {KeyboardEvent} e */
function run(id, e) {
  const pane = PANE_COMMAND[id]
  if (pane) return toPane(pane)
  const move = /** @type {(keyof typeof MOVE_COMMAND)[]} */ (Object.keys(MOVE_COMMAND)).find((m) => MOVE_COMMAND[m] === id)
  if (move) return (e.repeat || go(move), true)
  if (id === 'sidebar') return (toggleSide(), true)
  if (id === 'help') return (showKeys(), true)
  if (id === 'leave-terminal') return (leaveTerminal(), true)
  if (id === 'home' && (selected || shelfOpen || draftOpen || archiveOpen)) return (goHome(), true)
  return false
}

/** A terminal's own key handler already ran the keys typed into it; a field's listener, the field's. */
document.addEventListener('keydown', (e) => {
  if (e.defaultPrevented) return
  const id = commandOf(board.keys, e, isTyping() ? 'field' : 'page')
  if (id && run(id, e)) e.preventDefault()
})

/** xterm measures its cells when it opens: the terminal face must be loaded by then. */
await loadTerminalFont(termFont())

told(tower.get('origins')).then((o) => o && ((origins = o), render()))

/** Every renderer of the same system: this one, the others to open, and those not built yet. */
told(tower.get('renderers')).then((r) => r && ($('renderers').innerHTML = renderersHtml(r.renderers, location.pathname.split('/')[2], tower.framed)))

let opened = false
/** The board's failure stays on screen over the last board drawn, until the tower sends a board again. */
const showBoardError = () =>
  ($('board-error').innerHTML = !boardError ? '' : `<b>${boardErrorTitle(boardError.code)}</b>${esc(boardError.message)}${
    lostAt ? `<small>what you see is how it stood at ${new Date(lostAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>` : ''}`)

/** A lost tower leaves its board on screen, dimmed and with its times stopped, until it answers again. */
/** @param {boolean} lost */
function markLost(lost) {
  if (lost === (lostAt !== undefined)) return
  lostAt = lost ? Date.now() : undefined
  document.body.classList.toggle('lost', lost)
}

tower.onBoardError((err) => {
  boardError = err
  markLost(err.code === 'disconnected')
  showBoardError()
  if (opened) render()
})

tower.subscribe(async (next) => {
  await Promise.all([readHeed(), readCrewFolds()])
  board = next
  boardError = undefined
  markLost(false)
  showBoardError()
  attend(next)
  noticeShown(cards())
  freshArchives()
  pruneDraftTitles(board.floors)
  pruneKeptTitles(board.floors)
  void followDraft()
  if (arriving && findCard(arriving)) return select(arriving)
  const wanted = !opened && location.hash.slice(1)
  opened = true
  if (!wanted || !(await route(wanted))) render()
})

/** Opens what a hash names: a shelf entry, a draft, a floor's archive or a worker. Resolves to whether it named one. */
/** @param {string} wanted */
async function route(wanted) {
  if (wanted.startsWith('shelf/')) {
    const [, project, n, file] = wanted.split('/')
    return (openShelf(project, Number(n), file && decodeURIComponent(file)), true)
  }
  if (wanted.startsWith('draft/')) {
    const [, project, id] = wanted.split('/')
    const drafts = board.floors.find((f) => f.id === project)?.collections.find((c) => c.id === DRAFTS)
    if (drafts && (!id || drafts.items.some((i) => i.id === decodeURIComponent(id)))) return (openDraft(project, id && decodeURIComponent(id)), true)
  }
  if (wanted.startsWith('archive/')) return (openArchive(wanted.slice('archive/'.length)), true)
  if (wanted.startsWith('policies/') && floorOf(wanted.slice('policies/'.length))) return (openPolicies(wanted.slice('policies/'.length)), true)
  if (wanted.startsWith('kept/')) {
    const [, project, collection, id] = wanted.split('/')
    if (!id) return floorOf(project)?.collections.some((c) => c.id === collection) ? (openCollection(project, collection), true) : false
    const named = { project, collection, id: decodeURIComponent(id) }
    if (itemOf(named).item) return (openItem(named.project, named.collection, named.id), true)
  }
  if (await lookUp(wanted)) return (select(wanted), true)
  return false
}

/** Every view writes its own hash in place, so the hash changes only by a link, the history or the address bar. */
addEventListener('hashchange', async () => {
  const wanted = location.hash.slice(1)
  if (!opened || wanted === selected) return
  if (!wanted || !(await route(wanted))) goHome()
})
setInterval(tick, 1000)
showSideView(sideView)
