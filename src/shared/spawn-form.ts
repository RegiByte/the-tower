import type { Board, Floor } from '../bridge/board.ts'
import type { Call, Replies, Verbs } from './api.ts'
import { callsignRefused } from './callsign.ts'
import { base, esc } from './format.ts'
import { can, offeredCall } from './offered.ts'
import { WORKTREE_STATE_NAME, worktreeBranch } from './worktree-words.ts'

/**
 * The new-worker form: its values, defaults and request, the html both renderers put in their dialog, and where a
 * shell can start.
 */

/**
 * Where a new worker starts: a new worktree of its own in every repo, a worktree the floor already has, or a main
 * checkout, shared with the user and every worker there.
 */
export type Where = 'new' | 'worktree' | 'main'

/**
 * The new-worker form's values, named as its fields are. `worktree`: an existing worktree's first folder; `checkout`:
 * a main checkout. An empty `callsign`, `name`, `branch` or `base` is left to the tower (drawn at random, the callsign,
 * the prefix, origin's default), an empty `model` or `effort` to Claude.
 */
export type SpawnForm = { where: Where; worktree: string; checkout: string; callsign: string; name: string; branch: string; base: string; model: string; effort: string; prompt: string }

export const MODELS = ['fable', 'opus', 'sonnet', 'haiku']
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']

/** Where a worker starts unless told: its own worktree when the floor cuts by default and can cut now, else the hub. */
export const defaultWhere = (f: Floor): Where => (f.cutByDefault && can(f, 'cut') ? 'new' : 'main')

/** The worktrees a worker can join: every one whose folders are still there. */
const joinable = (f: Floor) => f.worktrees.filter((w) => w.state !== 'lost')

/** A directory a shell can start in: a floor's hub or repo, or a repo of one of its worktrees. */
export type ShellPlace = { project: string; dir: string; name: string; worktree?: string }

/**
 * Where a new shell can start, floor by floor, `first`'s floor ahead of the rest (the one in view): each floor that
 * offers `shell`, its hub and repos, then each worktree's repos.
 */
export const shellPlaces = (floors: Floor[], first?: string): ShellPlace[] =>
  [...floors.filter((f) => f.id === first), ...floors.filter((f) => f.id !== first)]
    .filter((f) => can(f, 'shell'))
    .flatMap((f) => [
      ...[f.hub, ...f.repos].map((dir) => ({ project: f.id, dir, name: base(dir) })),
      ...joinable(f).flatMap((w) => w.repos.map((r) => ({ project: f.id, dir: r.path, name: base(r.dir), worktree: w.name }))),
    ])

/** The form as it opens, and as a quick hire sends it: everything left to its default. */
export const spawnDefaults = (f: Floor, prompt = ''): SpawnForm => ({
  where: defaultWhere(f), worktree: joinable(f)[0]?.repos[0].path ?? '', checkout: f.hub, callsign: '', name: '', branch: '', base: '', model: '', effort: '', prompt,
})

/** The form's values from its fields' entries (`new FormData(form)`), the defaults under them. */
export const spawnForm = (f: Floor, entries: Iterable<[string, FormDataEntryValue]>): SpawnForm => ({ ...spawnDefaults(f), ...Object.fromEntries(entries) })

/** The request a form sends: a cut, or a start in the directory picked. Throws once the floor no longer offers it (`offeredCall`). */
export const spawnCall = (f: Floor, v: SpawnForm): [Call<'spawn'>, Partial<Verbs['spawn']>] => {
  const given = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).filter(([, x]) => x.trim()).map(([k, x]) => [k, x.trim()]))
  const launch = given({ callsign: v.callsign, model: v.model, effort: v.effort, prompt: v.prompt })
  if (v.where === 'new') return [offeredCall(f, 'cut', f.name), { ...launch, cut: given({ name: v.name, branch: v.branch, base: v.base }) }]
  return [offeredCall(f, 'spawn', f.name), { ...launch, cwd: v.where === 'worktree' ? v.worktree : v.checkout }]
}

/** A cut's worktree in words, as a spawn's reply tells it. */
export const cutLine = (cut: NonNullable<Replies['spawn']['cut']>) => `worktree ${cut.name} on ${cut.branch}, from ${[...new Set(cut.bases.map((b) => b.base))].join(', ')}`

/** The branch a cut gets when its field is left empty; `name`: the cut's (`cutNameOf`). */
export const branchPlaceholder = (f: Floor, name: string) => `${f.branchPrefix}${name.trim() || '<callsign>'}`

/** The name a form's cut gets: the one typed, else the callsign typed, lowercased; empty when the tower draws it. */
export const cutNameOf = (v: SpawnForm) => v.name.trim() || formCallsign(v).toLowerCase()

/** Why the form's callsign can't be had (`callsignRefused`, against the workers on duty); empty when it can, or none is typed. */
export const callsignRefusal = (board: Board, v: SpawnForm): string =>
  (v.callsign.trim() && callsignRefused(v.callsign, board.floors.flatMap((f) => f.cards.flatMap((c) => (c.onDuty ? [c.callsign] : []))))) || ''

/** The callsign a form names, as the tower stamps it: a name typed without a number gets the new session id's, at Start. */
const formCallsign = (v: SpawnForm) => {
  const given = v.callsign.trim().toUpperCase()
  return !given || given.includes('-') ? given : `${given}-<nn>`
}

/** What starting the form as it stands does, as a line of facts. */
export function spawnSummaryHtml(f: Floor, v: SpawnForm): string {
  const repos = [f.hub, ...f.repos].map(base).join(' + ')
  const joined = joinable(f).find((w) => w.repos[0].path === v.worktree)
  const others = joined?.sessions.length ?? 0
  const name = cutNameOf(v)
  const callsign = formCallsign(v)
  const place =
    v.where === 'new'
      ? [name ? `new worktree <b>${esc(name)}</b>` : 'new worktree named for its callsign', `⎇ ${esc(v.branch.trim() || branchPlaceholder(f, name))}`, `from ${esc(v.base || f.bases[0])}`, `in ${esc(repos)}`]
      : v.where === 'worktree' && joined
        ? [`joins <b>${esc(joined.name)}</b>`, `⎇ ${esc(worktreeBranch(joined))}`, others ? `beside ${others} on duty in it` : 'nobody else in it']
        : [`main checkout of <b>${esc(base(v.checkout))}</b>`, 'shared with you and every worker there']
  const claude = [v.model || "Claude's model", v.effort ? `${v.effort} effort` : "Claude's effort", v.prompt.trim() ? 'starts on the prompt' : 'starts idle']
  return [...(callsign ? [`as <b>${esc(callsign)}</b>`] : []), ...place, ...claude.map(esc)].map((fact) => `<span>${fact}</span>`).join('')
}

/** A choice of where, with what picking it means; `aside`: a hint at its right, as "default". */
const choiceHtml = (where: Where, title: string, what: string, { checked = false, disabled = false, aside = '' } = {}) =>
  `<label class="choice"><input type="radio" name="where" value="${where}"${checked ? ' checked' : ''}${disabled ? ' disabled' : ''}>
    <b>${title}</b>${aside && `<span class="aside eyebrow">${aside}</span>`}<small>${what}</small></label>`

/** A field's label: its name, and when the tower or Claude fills it in if left empty, says so. */
const labelHtml = (name: string, optional = false) => `<span class="lbl eyebrow">${name}${optional ? '<i>optional</i>' : ''}</span>`

const optionsHtml = (values: string[], none: string) => [`<option value="">${esc(none)}</option>`, ...values.map((v) => `<option>${esc(v)}</option>`)].join('')

/**
 * The new-worker form both renderers put in their dialog: the first prompt beside where and how the worker starts,
 * and a line saying what Start will do. `sign`: the floor's sign as the renderer draws it; `draft`: the draft it was
 * opened on. Its buttons carry `data-close` (`cancel`, `start`) and submit nothing; `[data-summary]` is the line to
 * redraw from `spawnSummaryHtml` as the fields change, `[name=branch]`'s placeholder from `branchPlaceholder`, and
 * `[data-callsign-why]` and `[name=callsign]`'s validity from `callsignRefusal`.
 */
export function spawnFormHtml(f: Floor, { sign, draft }: { sign: string; draft?: string }): string {
  const v = spawnDefaults(f)
  const worktrees = joinable(f)
  const repos = [f.hub, ...f.repos]
  const isDefault = (w: Where) => (w === v.where ? 'default' : '')
  const cutWhy = f.bases.length ? 'the host is down' : 'the hub is not a git repo with an origin'
  return `<form class="spawn-form"${f.color ? ` style="--p:${esc(f.color)}"` : ''}>
  <header>${sign}<h2>New worker</h2>${draft ? `<span class="draft">on the draft <b>${esc(draft)}</b>, deleted once it starts</span>` : ''}</header>
  <div class="cols">
    <label class="task">${labelHtml('First prompt', true)}
      <textarea name="prompt" spellcheck="false" placeholder="What should it work on? Left empty, Claude boots to an idle prompt.">${esc(v.prompt)}</textarea></label>
    <div class="setup">
      <fieldset class="where"><legend>${labelHtml('Where')}</legend>
        ${choiceHtml('new', 'New worktree', `its own branch, in ${esc(repos.map(base).join(' + '))}`, { checked: v.where === 'new', disabled: !can(f, 'cut'), aside: can(f, 'cut') ? isDefault('new') : esc(cutWhy) })}
        ${choiceHtml('worktree', 'Existing worktree', worktrees.length ? `join one of ${worktrees.length} on this floor` : 'none on this floor', { disabled: !worktrees.length })}
        ${choiceHtml('main', 'Main checkout', 'shared with you and every worker there', { checked: v.where === 'main', aside: isDefault('main') })}
      </fieldset>
      <div class="if-new fields">
        <label>${labelHtml('Worktree name', true)}<input name="name" autocomplete="off" spellcheck="false" pattern="[A-Za-z0-9][A-Za-z0-9._\\-]*" placeholder="the callsign, by default"></label>
        <label>${labelHtml('Branch', true)}<input name="branch" autocomplete="off" spellcheck="false" placeholder="${esc(branchPlaceholder(f, ''))}"></label>
        <label class="wide">${labelHtml('From')}<select name="base">${f.bases.map((b, i) => `<option value="${i ? esc(b) : ''}">${esc(b)}${i ? '' : " · origin's default"}</option>`).join('')}</select></label>
      </div>
      <fieldset class="if-worktree picks">${worktrees.map((w, i) => `<label class="pick"><input type="radio" name="worktree" value="${esc(w.repos[0].path)}"${i ? '' : ' checked'}>
        <b>${esc(w.name)}</b><span>⎇ ${esc(worktreeBranch(w))}</span><span class="st ${w.state}">${w.sessions.length ? `${w.sessions.length} on duty` : WORKTREE_STATE_NAME[w.state]}</span></label>`).join('')}</fieldset>
      <fieldset class="if-main picks">${repos.map((dir, i) => `<label class="pick"><input type="radio" name="checkout" value="${esc(dir)}"${i ? '' : ' checked'}>
        <b>${esc(base(dir))}</b><span>${i ? "its own CLAUDE.md, not the hub's" : 'the hub: its CLAUDE.md and skills'}</span></label>`).join('')}</fieldset>
      <div class="fields">
        <label class="wide">${labelHtml('Callsign', true)}<input name="callsign" autocomplete="off" spellcheck="false" placeholder="drawn at random"><small class="why" data-callsign-why></small></label>
        <label>${labelHtml('Model', true)}<select name="model">${optionsHtml(MODELS, "Claude's default")}</select></label>
        <label>${labelHtml('Effort', true)}<select name="effort">${optionsHtml(EFFORTS, "Claude's default")}</select></label>
      </div>
    </div>
  </div>
  <p class="spawn-error" role="alert" data-spawn-error></p>
  <footer><p class="summary" data-summary>${spawnSummaryHtml(f, v)}</p>
    <button type="button" data-close="cancel">Cancel</button><button type="button" class="primary" data-close="start">Start <kbd>⌘⏎</kbd></button></footer>
</form>`
}
