/**
 * The Policies panel: a floor's policies, the slots offered now and what needs the user, with Run now, Approve and
 * Accept. Bundled into `/panels.js`.
 */
import type { Board, Floor } from '../../../src/bridge/board.ts'
import { shortHash, type Offer, type PolicyReplies, type PolicyView, type ValidPolicyView } from '../policies.ts'
import { DISMISS_OFFER_TITLE, callOf, esc } from '../../../src/shared/cards.ts'
import { floorPolicies, heldWords, offerAskKey, POLICIES, slotWords, standingWords, type Problem } from './policies.ts'
import { ICON } from '../../../src/shared/icons.ts'
import { fileButtonsHtml } from '../../../src/shared/file-acts.ts'

/** A floor's policies as the panel draws them, at `now`, and the asks this viewer dismissed (`DISMISSED_KEY`): an offer's is `offerAskKey`. */
export type PoliciesView = { board: Board; floor: Floor; now: number; dismissed: ReadonlySet<string> }

/** A worker by its session id, as a link the renderer wires (`data-worker`). */
const workerHtml = (board: Board, id: string) => {
  const c = board.floors.flatMap((f) => f.cards).find((c) => c.id === id)
  return `<button class="worker" data-worker="${esc(id)}" data-tip="go to it">${esc(c?.callsign ?? id)}</button>`
}

const tzOf = (p: PolicyView) => p.header?.when.tz

/** The zone a policy's slots are said in (`slotWords`): its `when.tz`; none for a policy deleted or invalid since, read in the viewer's. */
export const policyZone = (board: Board, project: string, policy: string) => {
  const p = floorPolicies(board.floors.find((f) => f.id === project)).policies.find((p) => p.id === policy)
  return p && tzOf(p)
}

/** A slot offered, in words: `today 15:00 offered, open until Fri 15:00`. */
export const offerWords = (board: Board, offer: Pick<Offer, 'project' | 'policy' | 'slot' | 'until'>, now: number) => {
  const tz = policyZone(board, offer.project, offer.policy)
  return `${slotWords(offer.slot, tz, now)} offered, open until ${slotWords(offer.until, tz, now)}`
}

/** Whether the policy may start on its own, and whose approval lets it. */
const approvalHtml = (board: Board, p: ValidPolicyView) => {
  if (p.header.start === 'ask') return `<span data-tip="every slot is offered: start: &quot;ask&quot;">asks at each slot</span>`
  if (p.approved) return `<span>auto · approved ${esc(shortHash(p.hash))} by ${p.approved.by ? workerHtml(board, p.approved.by) : esc(board.user.name)}</span>`
  if (p.needs?.kind === 'reapprove') return `<span class="unapproved">auto · not approved: edited since ${esc(shortHash(p.needs.approved))}</span>`
  return `<span class="unapproved" data-tip="its slots are offered until its words are approved">auto · not approved</span>`
}

/** The policy's latest run: its number, its slot or by hand, and its worker. */
const lastHtml = (board: Board, p: PolicyView, now: number) =>
  p.last ? `<span>last: run ${p.last.n}, ${p.last.slot === null ? `by hand ${esc(slotWords(p.last.at, undefined, now))}` : esc(slotWords(p.last.slot, tzOf(p), now))}, ${workerHtml(board, p.last.id)}</span>` : '<span>never run</span>'

/** Why Run now is off: what the bridge read when it left the call out. */
const runHeld = (p: ValidPolicyView) =>
  p.header.runner !== undefined ? `left to the runner "${p.header.runner}"` : p.live.length >= p.header.live ? `live is full: ${p.live.length} of ${p.header.live} run` : 'the host is down'

/** A press of one of the policies' calls: `policies/run` or `policies/approve`, and its input. */
export type PolicyCall = [verb: string, input: object]

const callHtml = (call: PolicyCall, label: string, tip: string, cls = '') =>
  `<button class="${cls}" data-policy-call="${esc(JSON.stringify(call))}" data-tip="${esc(tip)}">${label}</button>`

const approveHtml = (p: PolicyView) => {
  const call = callOf(p, 'approve')
  return call ? callHtml(call, 'Approve', `approve these words (${shortHash(p.hash)}): ${p.header?.start === 'auto' ? 'its slots then start on their own, until it is edited' : 'they start on their own once start is "auto"'}`) : ''
}

const problemsHtml = (problems: Problem[]) =>
  `<ul class="problems">${problems.map((x) => `<li><code>${esc(x.path)}</code> ${esc(x.message)}</li>`).join('')}</ul>`

const policyHeadHtml = (v: PoliciesView, p: PolicyView, acts: string) => {
  const dir = v.floor.collections.find((c) => c.id === POLICIES)!.dir
  return `<header><button class="title" data-policy-open="${esc(p.id)}" data-tip="open its file">${esc(p.title ?? p.id)}</button>
    <button class="tag" data-copy="${esc(p.tag)}" data-tip="copy its tag">${esc(p.tag)}</button>${fileButtonsHtml(`${dir}/${p.id}`)}<span class="acts">${acts}</span></header>`
}

function policyHtml(v: PoliciesView, p: PolicyView) {
  if (!p.header) return `<article class="policy invalid">${policyHeadHtml(v, p, '')}<p class="rule">invalid: it never runs until fixed</p>${problemsHtml(p.problems)}</article>`
  const call = callOf(p, 'run')
  const run = call ? callHtml(call, 'Run now', 'start a run now, by hand: no slot, the file as it is', 'primary') : `<button disabled data-tip="${esc(runHeld(p))}">Run now</button>`
  const next = p.next === undefined ? 'no slot ahead' : `next ${slotWords(p.next, tzOf(p), v.now)}`
  const live = `<span>live ${p.live.length}/${p.header.live}${p.live.length ? `: ${p.live.map((id) => workerHtml(v.board, id)).join(', ')}` : ''}</span>`
  return `<article class="policy">${policyHeadHtml(v, p, approveHtml(p) + run)}
    <p class="rule">${esc(p.rule)} · ${esc(next)}</p>
    <p class="now">${esc(standingWords(p, v.board, v.now))}</p>
    <p class="facts">${approvalHtml(v.board, p)}${live}${lastHtml(v.board, p, v.now)}</p></article>`
}

/** A policy that needs you: Approve for an auto policy edited since its approval, its problems for an invalid file, the holding runs for a slot held while live is full. Nothing rings for it. */
const needsHtml = (v: PoliciesView, p: PolicyView) =>
  !p.header
    ? `<div class="need">${policyHeadHtml(v, p, '')}<p>approved once, invalid now: it doesn't run until fixed</p>${problemsHtml(p.problems)}</div>`
    : p.needs!.kind === 'held'
    ? `<div class="need">${policyHeadHtml(v, p, '')}<p>${esc(heldWords(p, p.needs!, v.now))}${p.next === undefined ? '' : `: end a run for ${esc(slotWords(p.next, tzOf(p), v.now))} to start`}</p></div>`
    : `<div class="need">${policyHeadHtml(v, p, approveHtml(p))}<p>edited since its approval of ${esc(shortHash(p.needs!.approved))}: its slots are offered until you approve these words</p></div>`

const offerRowHtml = (v: PoliciesView, o: Offer) => {
  const dismissed = v.dismissed.has(offerAskKey(o))
  const dismiss = dismissed ? '<small>dismissed</small>' : `<button class="icon-btn" data-offer-dismiss="${esc(offerAskKey(o))}" aria-label="${DISMISS_OFFER_TITLE}" data-tip="${DISMISS_OFFER_TITLE}">${ICON.close}</button>`
  return `<div class="offer${dismissed ? ' dismissed' : ''}"><span class="lamp"></span><button class="title" data-policy-open="${esc(o.policy)}" data-tip="open its file">${esc(o.title ?? o.tag)}</button>
    <span class="when">${esc(offerWords(v.board, o, v.now))}</span><span class="acts">${callHtml(callOf(o, 'accept')!, 'Accept', 'start the run this slot offers, on the file as it is now', 'primary')}${dismiss}</span></div>`
}

/**
 * A floor's policies: those that need you (an auto policy edited since its approval, or turned invalid; a slot held by runs still on duty), the slots
 * offered now, then every policy with its rule and next slot in words, where it stands, its approval, live runs and
 * last run, and Run now and Approve.
 */
export function policiesHtml(v: PoliciesView) {
  const { policies, offers } = floorPolicies(v.floor)
  const needs = policies.filter((p) => p.needs)
  const section = (title: string, tip: string, body: string) => `<section><h3 data-tip="${esc(tip)}">${title}</h3>${body}</section>`
  return `<div class="policies-panel">
    ${needs.length ? section('Needs you', 'auto policies that lost the right to run on its own (their slots are offered meanwhile), and slots held by runs still on duty', needs.map((p) => needsHtml(v, p)).join('')) : ''}
    ${offers.length ? section('Offered', 'slots offered and not yet started: each stays open until its policy\'s next slot', offers.map((o) => offerRowHtml(v, o)).join('')) : ''}
    ${section(`${policies.length} ${policies.length === 1 ? 'policy' : 'policies'}`, 'standing work the tower runs at its slots, kept as files in the floor\'s policies collection',
      policies.map((p) => policyHtml(v, p)).join('') || '<p class="none">no policies: keep one with <code>tower keep policies</code></p>')}</div>`
}

/** What a press of `data-policy-call` did, as a toast says it. */
export const policyDoneLine = (call: PolicyCall, title: string, reply: PolicyReplies[keyof PolicyReplies]) =>
  call[0].endsWith('/approve') ? `Approved ${title}` : `Started run ${(reply as PolicyReplies['policies/run']).n} of ${title}`
