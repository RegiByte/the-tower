import type { Board, BoardRuntime, Floor } from '../bridge/board.ts'
import type { Call, Replies, Verbs } from './api.ts'
import { callsignRefused } from './callsign.ts'
import { CLAUDE_EFFORTS, CLAUDE_MODELS } from './claude.ts'
import { comboboxHtml, type ComboboxOption } from './elements.ts'
import { base, esc, modelName } from './format.ts'
import type { SpawnOption, Words } from './extensions.ts'
import { domId } from './dom-id.ts'
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
 * the prefix, origin's default), an empty `model` or `effort` to the runtime. `x`: the extensions' spawn fields by
 * capability, named `x.<cap>.<field>` in the form; an empty one is left out.
 */
export type SpawnForm = {
  /** The runtime to start, by its id in `board.runtimes`: the floor's first, Claude, unless another is picked. @since 2.3 */
  runtime: string
  where: Where
  worktree: string
  checkout: string
  callsign: string
  name: string
  branch: string
  base: string
  model: string
  effort: string
  /** The `argv` command to start under, by name; empty is left to the floor's resolved default. */
  command: string
  prompt: string
  x: Record<string, Record<string, string>>
}

/** An extension's spawn field as the form draws it on a floor: its choices read from the extension's floor part, or typed. */
export type FormField = { cap: string; name: string; words: Words; options?: SpawnOption[] }

/** The value at a dotted path below `value`: `undefined` where it holds none. */
const at = (value: unknown, path: string[]): unknown => path.reduce<unknown>((v, key) => (v !== null && typeof v === 'object' ? (v as Record<string, unknown>)[key] : undefined), value)

/**
 * The spawn fields the form draws on `f`, in the board's order: each running extension's on a floor it is on, its
 * options read from `f`'s part at the path it names (`floor.x.roles.options`).
 */
export const formFields = (board: Board, f: Floor): FormField[] =>
  board.extensions
    .filter((e) => e.state === 'started' && !e.off?.includes(f.id))
    .flatMap((e) =>
      (e.spawn?.fields ?? []).map((field) => {
        const options = field.options === undefined ? undefined : at(f, field.options.split('.').slice(1))
        return { cap: e.provides, name: field.name, words: field.words, ...(field.options !== undefined && { options: Array.isArray(options) ? (options as SpawnOption[]) : [] }) }
      }),
    )

export const MODELS = CLAUDE_MODELS
export const EFFORTS = CLAUDE_EFFORTS

/**
 * Why `f` offers no cut, `undefined` while it does: the host is down, a dir's first read failed (what git said), its
 * git is still being read, or a dir is no git repo or has no origin.
 */
export const cutWhy = (f: Floor): string | undefined => {
  if (can(f, 'cut')) return undefined
  if (!can(f, 'spawn')) return 'the host is down'
  const failed = failedRead(f)
  if (failed) return failed
  if (f.reading) return 'its git is still being read'
  return f.git ? 'a directory has no origin' : 'a directory is not a git repo'
}

/** What git said of the first of `f`'s dirs whose first read failed, none when none did. */
const failedRead = (f: Floor): string | undefined => {
  const failed = f.reading?.find((r) => r.failed !== undefined)
  return failed && `git couldn't read ${base(failed.dir)}: ${failed.failed}`
}

/**
 * Why a hire left to the floor's default can't start now, `undefined` once it can: the floor cuts by default, but its
 * repos are still being read or a first read of one failed, so it offers no cut yet, and the hire would start in the
 * hub instead of a worktree of its own.
 */
export const hireBlocked = (f: Floor): string | undefined => {
  if (!f.cutByDefault || can(f, 'cut') || !f.reading) return undefined
  const failed = failedRead(f)
  return failed ? `${f.name}'s repos can't all be read, so no worktree can be cut: ${failed}` : `${f.name}'s repos are still being read: hire again in a moment`
}

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

/** The runtime a worker starts on unless another is picked: the first the config runs, Claude. */
export const defaultRuntime = (f: Floor): string => Object.keys(f.runtimes)[0]

/** The form on `runtime` with everything else left to its default. */
const defaultsOn = (f: Floor, runtime: string, prompt: string): SpawnForm => ({
  runtime, where: defaultWhere(f), worktree: joinable(f)[0]?.repos[0].path ?? '', checkout: f.hub, callsign: '', name: '', branch: '', base: '', model: '', effort: '', command: f.runtimes[runtime]?.command ?? '', prompt, x: {},
})

/** The form as it opens, and as a quick hire sends it: everything left to its default. */
export const spawnDefaults = (f: Floor, prompt = ''): SpawnForm => defaultsOn(f, defaultRuntime(f), prompt)

/** The name an extension's field has in the form. */
const fieldName = (cap: string, name: string) => `x.${cap}.${name}`

/**
 * The form's values from its fields' entries (`new FormData(form)`), the defaults under them; `x.<cap>.<field>` gathered
 * in `x`. A capability holds no dot and a field name may, so the capability ends at the first dot after `x.`.
 */
export const spawnForm = (f: Floor, entries: Iterable<[string, unknown]>): SpawnForm => {
  const all = [...entries].map(([k, v]): [string, string] => [k, String(v)])
  const x: SpawnForm['x'] = {}
  for (const [key, value] of all.filter(([k]) => k.startsWith('x.'))) {
    const [cap, ...name] = key.slice(2).split('.')
    x[cap] = { ...x[cap], [name.join('.')]: value }
  }
  const runtime = all.findLast(([k]) => k === 'runtime')?.[1] ?? defaultRuntime(f)
  return { ...defaultsOn(f, runtime, ''), ...Object.fromEntries(all.filter(([k]) => !k.startsWith('x.'))), x }
}

/**
 * Why `runtime` can't start a worker: the tower knows no such runtime, or the config doesn't run it. Empty when it
 * can. `known`: every runtime the tower knows (`RUNTIMES`).
 */
export const runtimeRefusal = (board: Board, runtime: string, known: readonly string[]): string => {
  if (board.runtimes[runtime]) return ''
  if (!known.includes(runtime)) return `The tower knows no runtime "${runtime}": it runs ${known.join(', ')}.`
  return `The config doesn't run ${runtime}: add "runtimes": {"${runtime}": {"argv": ["${runtime}"]}} to config.json (docs/config.md), then \`tower config check\`.`
}

/** The efforts a form offers on `model`: that model's when it is listed, else every listed model's. */
export const effortsOn = (runtime: BoardRuntime, model: string): string[] => {
  const listed = runtime.models.find((m) => m.id === model)
  return listed ? listed.efforts : [...new Set(runtime.models.flatMap((m) => m.efforts))]
}

/**
 * What a form says of `model` on a runtime whose list may miss models it runs (`modelList` absent): that the list is
 * empty, or that the model isn't in it. Empty for a listed model, or none typed.
 */
export const modelNote = (runtime: BoardRuntime, model: string): string => {
  const { label, models } = runtime
  if (!model.trim() || !runtime.absent.includes('modelList') || models.some((m) => m.id === model.trim())) return ''
  return models.length
    ? `Not in ${label}'s list. A model you defined yourself still runs; if it doesn't exist, ${label} runs its default.`
    : `${label} has listed no models yet: its first session reports them. If this one doesn't exist, ${label} runs its default.`
}

/** The request a form sends: a cut, or a start in the directory picked. Throws once the floor no longer offers it (`offeredCall`). */
export const spawnCall = (f: Floor, v: SpawnForm): [Call<'spawn'>, Partial<Verbs['spawn']>] => {
  const given = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).filter(([, x]) => x.trim()).map(([k, x]) => [k, x.trim()]))
  const x = Object.fromEntries(Object.entries(v.x).flatMap(([cap, fields]) => (Object.keys(given(fields)).length ? [[cap, given(fields)]] : [])))
  const launch = { ...given({ runtime: v.runtime, callsign: v.callsign, model: v.model, effort: v.effort, prompt: v.prompt, command: v.command }), ...(Object.keys(x).length && { x }) }
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

/** What starting the form as it stands does, as a line of facts. `runtime`: the board's entry for the runtime it starts; `fields`: the extensions' (`formFields`). */
export function spawnSummaryHtml(f: Floor, v: SpawnForm, runtime: BoardRuntime, fields: FormField[] = []): string {
  const { label, defaults } = runtime
  const repos = [f.hub, ...f.repos].map(base).join(' + ')
  const joined = joinable(f).find((w) => w.repos[0].path === v.worktree)
  const others = joined?.sessions.length ?? 0
  const name = cutNameOf(v)
  const callsign = formCallsign(v)
  const place =
    v.where === 'new'
      ? [name ? `new worktree <b>${esc(name)}</b>` : 'new worktree named for its callsign', `⎇ ${esc(v.branch.trim() || branchPlaceholder(f, name))}`, `from ${esc(v.base || f.defaultBase || 'each repo’s origin default')}`, `in ${esc(repos)}`]
      : v.where === 'worktree' && joined
        ? [`joins <b>${esc(joined.name)}</b>`, `⎇ ${esc(worktreeBranch(joined))}`, others ? `beside ${others} on duty in it` : 'nobody else in it']
        : [`main checkout of <b>${esc(base(v.checkout))}</b>`, 'shared with you and every worker there']
  const launch = [
    ...(v.runtime === defaultRuntime(f) ? [] : [`on ${label}`]),
    v.model || observed(`${label}'s model`, modelName(defaults.model)),
    v.effort ? `${v.effort} effort` : observed(`${label}'s effort`, defaults.effort),
    ...(v.command ? [`with command "${v.command}"`] : []),
    v.prompt.trim() ? 'starts on the prompt' : 'starts idle',
  ]
  const added = fields.flatMap((field) => {
    const value = v.x[field.cap]?.[field.name]?.trim()
    return value ? [`${field.words.label.toLowerCase()} <b>${esc(field.options?.find((o) => o.value === value)?.label ?? value)}</b>`] : []
  })
  return [...(callsign ? [`as <b>${esc(callsign)}</b>`] : []), ...place, ...launch.map(esc), ...added].map((fact) => `<span>${fact}</span>`).join('')
}

/** Words for what the runtime picks, with what it was seen to pick when known (`BoardRuntime.defaults`). */
const observed = (words: string, seen: string | undefined) => (seen ? `${words} (${seen})` : words)

/** What a field left to the runtime `label` says: what it was seen to pick first, as a narrow field clips the end. */
const defaultOption = (label: string, seen: string | undefined) => (seen ? `${seen} (default)` : `${label}'s default`)

/** A choice of where, with what picking it means; `aside`: a hint at its right, as "default". */
const choiceHtml = (where: Where, title: string, what: string, { checked = false, disabled = false, aside = '' } = {}) =>
  `<label class="choice"><input type="radio" name="where" value="${where}"${checked ? ' checked' : ''}${disabled ? ' disabled' : ''}>
    <b>${title}</b>${aside && `<span class="aside eyebrow">${aside}</span>`}<small>${what}</small></label>`

/** A label's words: the field's name, and when the tower or Claude fills it in if left empty, says so. `hint`: a tip on an info mark beside it. */
const labelWordsHtml = (name: string, optional: boolean, hint: string | undefined) =>
  `${name}${optional ? '<i>optional</i>' : ''}${hint ? `<span class="hint" tabindex="0" data-tip="${esc(hint)}">ⓘ</span>` : ''}`

/** A field's label, inside the `<label>` around its control. */
const labelHtml = (name: string, optional = false, hint?: string) => `<span class="lbl eyebrow">${labelWordsHtml(name, optional, hint)}</span>`

/**
 * A field chosen from `options` in a `<tower-combobox>` submitting `name`, `value` chosen as it opens: its label drawn
 * beside it and naming it by id (`labelledby`), since a `<label>` around it would take a press in its list for one on
 * the box. A field left to its default opens empty, `none` saying what the default is, and is emptied to go back to it.
 * `wide` spans the form.
 */
const choiceFieldHtml = (
  { name, label, optional = false, hint, wide = false }: { name: string; label: string; optional?: boolean; hint?: string; wide?: boolean },
  options: ComboboxOption[],
  chosen: { value: string } | { none: string },
) =>
  `<div class="field${wide ? ' wide' : ''}"><span class="lbl eyebrow" id="${esc(domId('spawn/label', name))}">${labelWordsHtml(label, optional, hint)}</span>` +
  `${comboboxHtml({ place: 'spawn', name, labelledby: domId('spawn/label', name), options, empty: 'Nothing matches', ...('value' in chosen ? { value: chosen.value } : { placeholder: chosen.none }) })}</div>`

/** Values that are their own words, as options. */
const plain = (values: string[]): ComboboxOption[] => values.map((v) => ({ value: v, label: v }))

/** An extension's field: a choice of its options, each found by its hint's words too, or typed; its hint as the placeholder or the empty choice. */
const formFieldHtml = ({ cap, name, words, options }: FormField) =>
  options
    ? choiceFieldHtml(
        { name: fieldName(cap, name), label: words.label, optional: true, wide: true },
        options.map((o) => ({ value: o.value, label: o.label, ...(o.hint && { keywords: [o.hint] }) })),
        { none: words.hint ?? 'none' },
      )
    : `<label class="wide">${labelHtml(words.label, true)}<input name="${esc(fieldName(cap, name))}" autocomplete="off" spellcheck="false"${words.hint ? ` placeholder="${esc(words.hint)}"` : ''}></label>`

/**
 * The form's part drawn from the runtime `id`'s declaration (`runtime`): its commands when there are several, then a
 * model and its effort, each saying the default seen beside it. A runtime whose list holds every model it runs picks
 * from it; one whose list may miss some (`modelList` absent) takes any id typed, the list offered as suggestions, with
 * `[data-model-note]` to fill from `modelNote` and `#spawn-efforts` from `effortsOn` as the model changes.
 */
export function providerHtml(f: Floor, id: string, runtime: BoardRuntime): string {
  const { label, defaults, commands, models } = runtime
  const command = f.runtimes[id]?.command ?? ''
  const commandHtml =
    commands && commands.length > 1
      ? choiceFieldHtml({ name: 'command', label: esc(label), optional: true, hint: `The command run in the terminal to start ${label}. Named commands are configured in config.json.`, wide: true }, plain(commands), { value: command })
      : ''
  const choose = runtime.absent.includes('modelList')
    ? `<label>${labelHtml('Model', true)}<input name="model" list="spawn-models" autocomplete="off" spellcheck="false" placeholder="${esc(models.length ? defaultOption(label, defaults.model) : 'provider/model, typed')}"><datalist id="spawn-models">${models.map((m) => `<option value="${esc(m.id)}"></option>`).join('')}</datalist></label>
        <label>${labelHtml('Effort', true)}<input name="effort" list="spawn-efforts" autocomplete="off" spellcheck="false" placeholder="${esc(defaultOption(label, defaults.effort))}"><datalist id="spawn-efforts">${effortOptions(runtime, '')}</datalist></label>
        <small class="note wide" data-model-note></small>`
    : choiceFieldHtml({ name: 'model', label: 'Model', optional: true }, plain(models.map((m) => m.id)), { none: defaultOption(label, modelName(defaults.model)) }) +
      choiceFieldHtml({ name: 'effort', label: 'Effort', optional: true }, plain(effortsOn(runtime, '')), { none: defaultOption(label, defaults.effort) })
  return `<div class="provider" data-provider="${esc(id)}">${commandHtml}${choose}</div>`
}

/** What the first prompt's field says while empty, for the runtime `label`. */
export const promptPlaceholder = (label: string) => `What should it work on? Left empty, ${label} boots to an idle prompt.`

/** The suggestions of `#spawn-efforts` on `model` (`effortsOn`). */
export const effortOptions = (runtime: BoardRuntime, model: string): string => effortsOn(runtime, model).map((e) => `<option value="${esc(e)}"></option>`).join('')

/**
 * The new-worker form both renderers put in their dialog: the first prompt beside where and how the worker starts,
 * and a line saying what Start will do. `sign`: the floor's sign as the renderer draws it; `draft`: the draft it was
 * opened on. Its buttons carry `data-close` (`cancel`, `start`) and submit nothing; `[data-summary]` is the line to
 * redraw from `spawnSummaryHtml` as the fields change, `[name=branch]`'s placeholder from `branchPlaceholder`, and
 * `[data-callsign-why]` and `[name=callsign]`'s validity from `callsignRefusal`. A choice of runtime is drawn when the
 * board has several, `[data-provider]` to redraw from `providerHtml` when it changes. `fields`: the extensions' spawn
 * fields on the floor (`formFields`), drawn below the runtime's.
 */
export function spawnFormHtml(f: Floor, board: Board, { sign, draft, fields = [] }: { sign: string; draft?: string; fields?: FormField[] }): string {
  const v = spawnDefaults(f)
  const { label } = board.runtimes[v.runtime]
  const runtimes = Object.entries(board.runtimes)
  const worktrees = joinable(f)
  const repos = [f.hub, ...f.repos]
  const isDefault = (w: Where) => (w === v.where ? 'default' : '')
  return `<form class="spawn-form"${f.color ? ` style="--p:${esc(f.color)}"` : ''}>
  <header>${sign}<h2>New worker</h2>${draft ? `<span class="draft">on the draft <b>${esc(draft)}</b>, deleted once it starts</span>` : ''}</header>
  <div class="cols">
    <label class="task">${labelHtml('First prompt', true)}
      <textarea name="prompt" spellcheck="false" placeholder="${esc(promptPlaceholder(label))}">${esc(v.prompt)}</textarea></label>
    <div class="setup">
      <fieldset class="where"><legend>${labelHtml('Where')}</legend>
        ${choiceHtml('new', 'New worktree', `its own branch, in ${esc(repos.map(base).join(' + '))}`, { checked: v.where === 'new', disabled: !can(f, 'cut'), aside: esc(cutWhy(f) ?? isDefault('new')) })}
        ${choiceHtml('worktree', 'Existing worktree', worktrees.length ? `join one of ${worktrees.length} on this floor` : 'none on this floor', { disabled: !worktrees.length })}
        ${choiceHtml('main', 'Main checkout', 'shared with you and every worker there', { checked: v.where === 'main', aside: isDefault('main') })}
      </fieldset>
      <div class="if-new fields">
        <label>${labelHtml('Worktree name', true)}<input name="name" autocomplete="off" spellcheck="false" pattern="[A-Za-z0-9][A-Za-z0-9._\\-]*" placeholder="the callsign, by default"></label>
        <label>${labelHtml('Branch', true)}<input name="branch" autocomplete="off" spellcheck="false" placeholder="${esc(branchPlaceholder(f, ''))}"></label>
        ${choiceFieldHtml({ name: 'base', label: 'From', wide: true }, plain(f.bases.filter((b) => b !== f.defaultBase)), { none: f.defaultBase ? `${f.defaultBase} · origin's default` : "each repo's origin default" })}
      </div>
      <fieldset class="if-worktree picks">${worktrees.map((w, i) => `<label class="pick"><input type="radio" name="worktree" value="${esc(w.repos[0].path)}"${i ? '' : ' checked'}>
        <b>${esc(w.name)}</b><span>⎇ ${esc(worktreeBranch(w))}</span><span class="st ${w.state}">${w.sessions.length && w.state !== 'unread' ? `${w.sessions.length} on duty` : WORKTREE_STATE_NAME[w.state]}</span></label>`).join('')}</fieldset>
      <fieldset class="if-main picks">${repos.map((dir, i) => `<label class="pick"><input type="radio" name="checkout" value="${esc(dir)}"${i ? '' : ' checked'}>
        <b>${esc(base(dir))}</b><span>${i ? "its own CLAUDE.md, not the hub's" : 'the hub: its CLAUDE.md and skills'}</span></label>`).join('')}</fieldset>
      <div class="fields">
        <label class="wide">${labelHtml('Callsign', true)}<input name="callsign" autocomplete="off" spellcheck="false" placeholder="drawn at random"><small class="why" data-callsign-why></small></label>
        ${runtimes.length > 1 ? choiceFieldHtml({ name: 'runtime', label: 'Runtime', wide: true }, runtimes.map(([id, r]) => ({ value: id, label: r.label })), { value: v.runtime }) : ''}
        ${providerHtml(f, v.runtime, board.runtimes[v.runtime])}
        ${fields.map(formFieldHtml).join('')}
      </div>
    </div>
  </div>
  <p class="spawn-error" role="alert" data-spawn-error></p>
  <footer><p class="summary" data-summary>${spawnSummaryHtml(f, v, board.runtimes[v.runtime], fields)}</p>
    <button type="button" data-close="cancel">Cancel</button><button type="button" class="primary" data-close="start">Start <kbd>⌘⏎</kbd></button></footer>
</form>`
}
