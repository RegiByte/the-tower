import { badgesOf, cardSubject, linesOf, floorSubject, heededAsks, projectOfKey, ATTENTION_NAME, WAITING_NAME, awayHiresOf, crewFold, crewTree, goneHome, goneHomeLine, hiresOf, loudest, lampOf, DISMISS_OFFER_TITLE, heededWaits, addedTidyOf, tidyLine, tidyRows, editedRows, carriedLine, LIMITS_STALE_MS, EXTENSION_ATTENTION, extensionLine, extensionTitle, extraUsageLine, limitsFromTitle, WORKTREE_STATE_NAME, WORKTREE_VERB_NAME, base, branchLine, callOf, can, dutyOrder, esc, pastCount, renderersHtml, shelfKind, shelfSource, risky, gistLine, goneBases, keptBranchLines, paceLine, pairLineOf, resetLine, span, statusName, statusWord, weekElapsed, worktreeBranch, worktreeRisk, strandedOf, workersIn, noun, plural, statusTitle, satellitesOf, subagentTitle, SUBAGENT_FADE_MS, tidyRowAsk } from '/cards.js'
import { PROBE_ATTENTION, probeLine, probeTitle, quotaOf } from '/x/quota/quota.js'
import { ICON, SHELF_ICON, originIcon, withIcons } from '/icons.js'
import { REVIEWS, landedThreads, reviewerOf } from '/x/reviews/reviews.js'
import { floorThreadsOf } from '/x/reviews/panel.js'
import { collectionPeekHtml, keptKey } from '/items.js'
import { offerWords, policyZone } from '/x/policies/panel.js'
import { floorPolicies, offerAskKey, POLICIES, runOf, slotWords } from '/x/policies/policies.js'
import { onDuty, lineOf, $, fillOf, keyedTip, told } from './kit.js'
import { keyshortcuts } from '/keymap.js'
import { placeOnOpen } from '/tips.js'
import { draftsOf } from '/x/drafts/drafts.js'
import { verbLabel } from '/verb-words.js'
import { addsHtml, asksHtml, badgesHtml } from './added.js'

/**
 * @import { Board, Card, Floor, FloorCollection, FloorItem, Unresumable } from '../../src/bridge/board.ts'
 * @import { Attention } from '../../src/bridge/life.ts'
 * @import { CardRun } from '../../extensions/policies/policies.ts'
 * @import { FloorBranch, FloorWorktree } from '../../src/bridge/worktrees.ts'
 * @import { RateLimit } from '../../src/bridge/facts.ts'
 * @import { EditedRow, Heed, TidyRow, DaemonVerb } from '../../src/shared/cards.ts'
 * @import { Viewer } from '../../src/shared/viewer.ts'
 * @import { MainView } from './view.js'
 * @import { Draft } from '../../extensions/drafts/client/drafts.ts'
 * @import { ShelfEntry } from '../../src/shared/model.ts'
 * @import { Titled } from '../../src/shared/titles.ts'
 */

/**
 * @typedef {{
 *   render: () => void,
 *   selected: () => string | undefined,
 *   callsign: (id: string) => string,
 *   heldWhy: (verb: DaemonVerb) => string | undefined,
 *   heldHtml: (verb: DaemonVerb, label: string, inner: string, cls?: string) => string,
 *   letGoHtml: (c: Card, label: string) => string,
 *   unresumableHtml: (why: Unresumable) => string,
 *   board: () => Board,
 *   pageNow: () => number,
 *   floorOf: (project: string) => Floor | undefined,
 *   paint: (projectId: string | undefined) => string,
 *   viewer: () => Viewer,
 *   keepViewer: <K extends keyof Viewer>(field: K, value: Viewer[K]) => void,
 *   findCard: (id: string | undefined) => Card | undefined,
 *   isOpenItem: (project: string, collection: string, id: string) => boolean,
 *   viewing: <T extends MainView['t']>(t: T) => Extract<MainView, { t: T }> | undefined,
 *   draftTitle: (project: string, item: Titled) => string,
 *   drafting: () => Draft | undefined,
 *   newDraftHtml: (f: Floor) => string,
 *   keptTitle: (project: string, collection: string, item: FloorItem) => string,
 *   heed: () => Heed,
 *   withKeys: (what: string, id: string) => string,
 * }} SidebarDeps
 */

/**
 * The sidebar: each floor under its sign, folded or open, with its directories, shelf, offers, workers by crew and
 * trays of what it keeps; the counts and the limits above them, the rail it folds to, and the drawer it opens as on a
 * narrow window.
 * @param {SidebarDeps} deps
 */
export async function sidebar(deps) {
  const { render, selected, callsign, heldWhy, heldHtml, letGoHtml, unresumableHtml, board, pageNow, floorOf, paint, viewer, keepViewer, findCard, isOpenItem, viewing, draftTitle, drafting, newDraftHtml, keptTitle, heed, withKeys } = deps
  /** The web page of each project directory's origin remote. @type {Record<string, string>} */
  let origins = {}

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
    <div class="top"><span class="lamp"></span><a class="call" href="#${c.id}"${c.id === selected() ? ' aria-current="true"' : ''}>${callsign(c.id)}</a><span class="st${c.stuck ? ' stuck' : ''}" data-tip="${esc(statusTitle(c))}">${statusWord(c)}${c.stuck || c.stranded ? `<span class="sr-only">: ${esc(statusTitle(c))}</span>` : ''}</span><span class="ago" translate="no" data-since="${c.enteredAt}"></span></div>
    ${c.worktree ? `<div class="branch" data-tip="worktree ${esc(c.worktree.name)}: ${esc(c.cwd)}">${withIcons(esc([branchLine(c), pairLineOf(c.hiredBy && c.hiredBy.callsign === over?.callsign ? { ...c, hiredBy: undefined } : c, reviewerOf(c))].filter(Boolean).join(' · ')))}</div>` : ''}
    ${runHtml(c)}
    <div class="line">${lineOf(c)}</div>
    ${linesOf(board(), c.id).map((l) => `<div class="adds-line">${esc(l)}</div>`).join('')}
    ${badgesOf(board(), cardSubject(c)).length ? `<div class="badges">${badgesHtml(board(), cardSubject(c))}</div>` : ''}
    ${satellitesHtml(c)}
    ${can(c, 'resume') ? `<div class="act resumes">${heldWhy('resume') ? heldHtml('resume', verbLabel('card', 'resume').toLowerCase(), `${ICON.resume} ${verbLabel('card', 'resume').toLowerCase()}`) : `<button data-resume="${esc(JSON.stringify(callOf(c, 'resume')))}">${ICON.resume} ${verbLabel('card', 'resume').toLowerCase()}</button>`}${letGoHtml(c, verbLabel('card', 'let-go').toLowerCase())}</div>` : c.unresumable ? `<div class="act">${unresumableHtml(c.unresumable)}</div>` : ''}
  </div>`
  }

  /** The run of a policy a worker is, with what started it on hover. @param {Card} c */
  const runHtml = (c) => {
    const run = runOf(c)
    return run ? `<div class="run" data-tip="${esc(runTitle(c.project, run))}">run ${run.n} · ${esc(run.title ?? run.tag)}</div>` : ''
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
    <span class="mark">${run.type === 'fork' ? ICON.branch : ''}</span><span class="what">${esc(run.description)}</span>${left === undefined ? `<span class="since" translate="no" data-since="${run.startedAt}"></span>` : ''}</div>`).join('')}</div>`
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

  /** A new shell's button for `dir`; on the selected worker's directory it names the chords of `shell-here` too. @param {Floor} f @param {string} dir @param {string} name */
  const shellButtonHtml = (f, dir, name) => {
    if (heldWhy('shell')) return heldHtml('shell', `new shell in ${name}`, ICON.shell, 'icon-btn')
    if (!can(f, 'shell')) return ''
    const tip = findCard(selected())?.cwd === dir ? keyedTip(board().keys, `new shell in ${dir} · the selected worker's shell; the same key hides it`, 'shell-here') : `data-tip="${esc(`new shell in ${dir}`)}"`
    return `<button class="icon-btn" data-shell-project="${esc(f.id)}" data-shell-dir="${esc(dir)}" aria-label="new shell in ${esc(name)}" ${tip}>${ICON.shell}</button>`
  }

  /** @param {Floor} f @param {string} dir @param {boolean} hub */
  const dirHtml = (f, dir, hub) =>
    `<div class="dir"><span class="dname" data-tip="${esc(dir)}">${hub ? ICON.hub : ICON.repo} ${esc(base(dir))}</span>
    ${shellButtonHtml(f, dir, base(dir))}
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
    ${w.state === 'lost' ? '' : shellButtonHtml(f, where, w.name)}
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
    const rows = floorThreadsOf(f).map((t) => {
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
    ${can(f, 'tidy') ? `<div class="drafts-head eyebrow">${esc(tidyLine(f.tidy, addedTidyOf(board(), f)))}<button class="tidy-all" data-tidy="${f.id}" data-tip="do all of it, as listed">${verbLabel('floor', 'tidy')}</button></div>
    ${tidyRows(f, Date.now(), addedTidyOf(board(), f)).map(tidyRowHtml).join('')}` : ''}
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
  const keptCollections = (f) => f.collections.filter((c) => c !== draftsOf(f) && c.id !== REVIEWS && c.id !== POLICIES && c.items.length)

  /** The floor's policies, folded to a count with what is offered and what needs you: the panel opens in the main pane. @param {Floor} f */
  function policiesTrayHtml(f) {
    const { policies, offers } = floorPolicies(f)
    if (!policies.length) return ''
    const offered = offers.length
    const needs = policies.filter((p) => p.needs).length
    const invalid = policies.filter((p) => !p.header && !p.needs).length
    const on = viewing('policies')?.project === f.id
    return `<button class="tray ${on ? 'on' : ''}" data-policies="${f.id}" aria-pressed="${on}" data-tip="standing work the tower runs at its slots: rules, standing, Run now and Approve, in the main pane">${ICON.resume} <b>${policies.length}</b> ${policies.length === 1 ? 'policy' : 'policies'}${offered ? `, ${offered} offered` : ''}${needs ? ` <i class="needs">${needs} need${needs === 1 ? 's' : ''} you</i>` : ''}${invalid ? ` <i>${invalid} invalid</i>` : ''}</button>`
  }

  /** The floor's offers this viewer heeds, in the attention order: Accept starts the run, ✕ dismisses it for this viewer. @param {Floor} f */
  const offersHtml = (f) => {
    const offers = floorPolicies(f).offers.filter((o) => !heed().dismissed.has(offerAskKey(o)))
    return offers.length ? `<div class="offers">${offers.map((o) => `<div class="offer-row" data-hold="offer:${esc(o.key)}"><button class="what" data-policies="${f.id}" data-tip="${esc(`${o.title ?? o.tag}: ${offerWords(board(), o, Date.now())}`)}"><b>${esc(o.title ?? o.tag)}</b> <span>offered · ${esc(slotWords(o.slot, policyZone(board(), o.project, o.policy), Date.now()))}</span></button>
    <button class="primary" data-policy-call="${esc(JSON.stringify(o.calls.accept))}" data-tip="start the run this slot offers">Accept</button>
    <button class="icon-btn" data-offer-dismiss="${esc(offerAskKey(o))}" aria-label="${DISMISS_OFFER_TITLE}" data-tip="${DISMISS_OFFER_TITLE}">${ICON.close}</button></div>`).join('')}</div>` : ''
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
    const threads = floorThreadsOf(f).length
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
      stranded && (heldWhy('resume') ? heldHtml('resume', `resume all ${stranded} stranded`, `${ICON.resume} resume all <b>${stranded}</b> stranded`, 'tray') : `<button class="tray" data-resume-all="${f.id}" data-tip="resume every worker stopped, killed or lost before it was sent home: asked first, listing them">${ICON.resume} resume all <b>${stranded}</b> stranded</button>`),
      past && `<button class="tray ${viewing('archive')?.project === f.id ? 'on' : ''}" data-archive="${f.id}" aria-pressed="${viewing('archive')?.project === f.id}" data-tip="past workers and their conversations, in the main pane">${ICON.archive} <b>${past}</b> archived</button>`,
      tidy && tray('tidy', `${ICON.tidy} ${esc(can(f, 'tidy') ? tidyLine(f.tidy, addedTidyOf(board(), f)) : 'Tidy')}${edited ? `, ${edited} landed edited` : ''}`, 'what Tidy would do: unfold it to see the list before you press'),
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
  /** The asks about the floor or a subject on it that this viewer heeds. @param {Floor} f */
  const floorAsks = (f) => heededAsks(board(), heed()).filter((a) => projectOfKey(board(), a.subject) === f.id)

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
    const offers = floorAsks(f).length
    const duty = f.cards.filter(onDuty)
    const tone = loudest(duty)
    /** @param {string} cls @param {number} n @param {string} words */
    const count = (cls, n, words) => `<span class="chip ${cls}" data-tip="${esc(words)}"><span class="lamp"></span><b>${n}</b><span class="sr-only"> ${esc(words)}</span></span>`
    return `<span class="summary">${[
      waits.length && count(`waits some ${loudest(waits)}`, waits.length, WAITING_NAME),
      offers && count('offered some', offers, 'offered or asked'),
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

  /** What extensions add to the floor: its badges and actions in a row. @param {Floor} f */
  const floorAddsHtml = (f) => {
    const adds = addsHtml(board(), floorSubject(f))
    return adds ? `<div class="adds">${adds}</div>` : ''
  }

  /** @param {Floor} f @param {Card[]} heads */
  const floorBodyHtml = (f, heads) => `
    <div class="dirs">${dirHtml(f, f.hub, true)}${f.repos.map((r) => dirHtml(f, r, false)).join('')}</div>
    ${shelfHtml(f)}
    ${floorAddsHtml(f)}
    ${asksHtml(board(), floorAsks(f).filter((a) => a.cap !== POLICIES), pageNow())}
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

  /** The quota probe under the limits while it runs: its line, its state's colour on the lamp, and in full on hover. @param {number} now */
  const probesHtml = (now) => {
    const p = quotaOf(board())
    return p
      ? `<small class="probe ${PROBE_ATTENTION[p.state]}" data-tip="${esc(probeTitle(p, now))}"><span class="lamp"></span>${esc(probeLine(p, now))}<button class="probe-run" data-probe-run="quota" data-tip="read it now: at most once a minute">read now</button></small>`
      : ''
  }

  /** Each extension the tower found, after the probes: its line, its state's colour on the lamp, and in full on hover. */
  const extensionsHtml = () =>
    board().extensions.map((e) => `<small class="extension ${EXTENSION_ATTENTION[e.state]}" data-tip="${esc(extensionTitle(e))}"><span class="lamp"></span>${esc(extensionLine(e))}</small>`).join('')

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
    if (!board().rateLimits.length) return `<small>no rate-limit reading yet</small>${extraHtml(now)}${probesHtml(now)}${extensionsHtml()}`
    const age = now - /** @type {number} */ (board().rateLimitsAt)
    return `${board().rateLimits.map((r) => limitHtml(r, now)).join('')}
    <small class="asof ${age > LIMITS_STALE_MS ? 'stale' : ''}" data-tip="${esc(limitsFromTitle(board()))}">as of ${span(age)} ago</small>${extraHtml(now)}${probesHtml(now)}${extensionsHtml()}`
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

  /** The collapsed sidebar: a way back, the waiting count, and a lamp per session on duty. */
  /** @param {number} waiting */
  const railHtml = (waiting) =>
    `<button class="icon-btn" data-side aria-label="show the sidebar" ${keyedTip(board().keys, 'show the sidebar', 'sidebar')}>${ICON.sidebar}</button>
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

  $('keys-open').innerHTML = ICON.help
  $('side-hide').innerHTML = ICON.sidebar

  told(tower.get('origins')).then((o) => o && ((origins = o), render()))

  /** Every renderer of the same system: this one, the others to open, and those not built yet. */
  told(tower.get('renderers')).then((r) => r && ($('renderers').innerHTML = renderersHtml(r.renderers, location.pathname.split('/')[2], tower.framed)))

  return { toggleSection, toggleCrewFold, forgetFold, toggleFloor, floorHtml, paintLimits, railHtml, paintKeys, closeDrawer, toggleSide }
}
