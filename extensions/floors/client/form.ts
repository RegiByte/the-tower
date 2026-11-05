import type { Board } from '/lib/board.js'
import { closeHtml, type Mount, paintOnce, viewCss } from '/lib/view.js'
import { esc } from '/lib/words.js'
import { browser, DIRS_CSS } from './dirs.ts'
import { callOf, derived, missing, SOURCES, type Fields, type Source } from './floor-form.ts'

/**
 * `floors/form`, the New floor form on the board: where the hub comes from (a folder on the machine, picked by browsing
 * `floors/dirs`, a repository cloned by URL, or a new project), the floor's name and id, the folder a clone or a new
 * project goes in, under a parent folder picked with the same browser, each derived until typed, and an existing folder's repos, each picked with the same browser. Sending calls the source's verb; the floor
 * is on the board once the tower reads the config it added.
 */

const ID = 'floors/form'

/** What the form says the hub is, wherever it comes from. */
const HUB_HINT = 'Where its sessions start by default; the new-worker form can start one elsewhere.'

const STYLE = viewCss(
  ID,
  `& .floor-form { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: var(--sp-xl); padding: var(--sp-xl) var(--sp-2xl);
    background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); scrollbar-width: thin; scrollbar-color: var(--line) transparent; }
  & fieldset { border: 0; padding: 0; margin: 0; min-width: 0; }
  & .sources { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--sp-m); }
  & .sources label { display: flex; flex-direction: column; gap: var(--sp-xs); padding: var(--sp-l); border: 1px solid var(--line-strong); border-radius: var(--radius); cursor: pointer; }
  & .sources label:has(input:checked) { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
  & .sources input { position: absolute; opacity: 0; pointer-events: none; }
  & .sources label:has(input:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }
  & .sources b { font-weight: 700; }
  & .sources span, & .hint, & .summary { color: var(--muted); font-size: var(--fs-s); }
  & .field { display: flex; flex-direction: column; gap: var(--sp-xs); }
  & .field > span { font-weight: 600; font-size: var(--fs-s); }
  & .field > span small { font-weight: 400; color: var(--muted); }
  & .row { display: grid; grid-template-columns: 2fr 1fr; gap: var(--sp-l); }
  & input[type=text] { padding: var(--sp-m) var(--sp-l); font: var(--fs-m)/1.3 var(--mono); color: var(--ink); background: var(--panel); border: 1px solid var(--line-strong); border-radius: var(--radius); }
  & input[type=text]:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
  ${DIRS_CSS}
  & .repos { display: flex; flex-direction: column; gap: var(--sp-xs); margin: 0; padding: 0; list-style: none; }
  & .repos li { display: flex; align-items: center; gap: var(--sp-m); font: var(--fs-s)/1.3 var(--mono); }
  & .repos li code { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  & .picker { display: flex; flex-direction: column; gap: var(--sp-s); padding: var(--sp-m); border: 1px dashed var(--line-strong); border-radius: var(--radius); }
  & .picker-actions { display: flex; align-items: center; gap: var(--sp-m); }
  & .picker-actions .hint { flex: 1; min-width: 0; }
  & .error { margin: 0; color: var(--broken); }
  & .error:empty { display: none; }
  & footer { display: flex; align-items: center; gap: var(--sp-l); margin-top: auto; }
  & footer .summary { flex: 1; min-width: 0; }
  & footer .primary { padding: var(--sp-m) var(--sp-xl); border: 0; border-radius: var(--radius); background: var(--ink); color: var(--panel); font-weight: 700; cursor: pointer; }
  & footer .primary:disabled { opacity: .5; cursor: default; }
  & [hidden] { display: none !important; }`,
)

const sourcesHtml = (source: Source) =>
  SOURCES.map(
    (s) => `<label><input type="radio" name="source" value="${s.id}"${s.id === source ? ' checked' : ''}><b>${esc(s.label)}</b><span>${esc(s.hint)}</span></label>`,
  ).join('')

/** Why the folder the repo picker is at can't be added as a repo: none when it can. */
const repoWhy = (dir: string | undefined, hub: string, repos: string[]) => {
  if (!dir) return 'browse to a folder'
  if (dir === hub) return 'this is the hub'
  if (repos.includes(dir)) return 'a repo already'
  return undefined
}

export const mount: Mount = (host, { tower, board: first, kit }) => {
  let board: Board = first
  let fields: Fields = { source: 'add', repos: [] }
  let picking = false
  let sending = false

  host.innerHTML = `<style>${STYLE}</style>
  <div class="shelf-head"><span class="label">New floor</span><span class="dim">a floor for a project</span><span class="actions"></span></div>
  <form class="floor-form" novalidate>
    <fieldset class="sources" aria-label="where the project comes from">${sourcesHtml(fields.source)}</fieldset>
    <div class="field" data-for="add"><span>Hub</span>
      <small class="hint">${esc(HUB_HINT)}</small>
      <div data-browse="hub"></div>
      <input type="text" name="hub" autocomplete="off" spellcheck="false" placeholder="pick a folder above, or type its absolute path">
    </div>
    <label class="field" data-for="clone"><span>Repository URL</span>
      <small class="hint">No password or token in it: the jobs log keeps it. Use an SSH key or a credential helper.</small>
      <input type="text" name="url" autocomplete="off" spellcheck="false" placeholder="https://github.com/owner/repo.git or git@github.com:owner/repo.git"></label>
    <div class="row">
      <label class="field"><span>Name</span><input type="text" name="name" autocomplete="off" spellcheck="false"></label>
      <label class="field"><span>Id</span><input type="text" name="id" autocomplete="off" spellcheck="false" pattern="[A-Za-z0-9_\\-]+"></label>
    </div>
    <div class="field" data-for="clone new"><span>Hub</span>
      <small class="hint">${esc(HUB_HINT)} It goes under the folder picked here, named by the id, unless you type another; it must not exist yet, or be empty.</small>
      <div data-browse="parent"></div>
      <input type="text" name="into" autocomplete="off" spellcheck="false">
    </div>
    <div class="field" data-for="add"><span>Repos <small>optional</small></span>
      <small class="hint">Other folders its sessions also work in. A project in one repository leaves this empty.</small>
      <ul class="repos"></ul>
      <button type="button" data-pick>Add a repo…</button>
      <div class="picker" hidden>
        <div data-browse="repo"></div>
        <div class="picker-actions"><span class="hint"></span><button type="button" data-cancel>Cancel</button><button type="button" data-add-repo>Add this folder</button></div>
      </div>
    </div>
    <p class="error" role="alert"></p>
    <footer><p class="summary"></p><button type="submit" class="primary"></button></footer>
  </form>`
  const $ = <T extends Element>(sel: string) => host.querySelector<T>(sel)!
  const form = $<HTMLFormElement>('form')
  const input = (name: string) => form.elements.namedItem(name) as HTMLInputElement
  const error = $<HTMLElement>('.error')
  const failed = (message: string) => void (error.textContent = message)

  const hubs = browser($('[data-browse="hub"]'), tower, {
    went: (dir) => {
      fields = { ...fields, hub: dir }
      input('hub').value = dir
    },
    listed: () => draw(),
    failed,
  })
  const repoPicker = browser($('[data-browse="repo"]'), tower, { listed: () => draw(), failed })

  const parents = browser($('[data-browse="parent"]'), tower, { listed: () => draw(), failed })

  /** The folder a clone or a new project goes under: the one the parent browser is at. */
  const root = () => parents.listing()?.path ?? hubs.listing()?.root ?? ''

  const draw = () => {
    paintOnce($('.shelf-head .actions'), closeHtml(board.keys))
    const d = derived(fields, root())
    for (const el of host.querySelectorAll<HTMLElement>('[data-for]')) el.hidden = !el.dataset.for!.split(' ').includes(fields.source)
    for (const name of ['name', 'id', 'into'] as const) input(name).placeholder = d[name] || (name === 'name' ? 'shown on the floor' : name === 'id' ? 'from the name' : '')
    paintOnce(
      $('.repos'),
      d.repos.map((r) => `<li><code title="${esc(r)}">${esc(r)}</code><button type="button" data-unrepo="${esc(r)}" aria-label="remove ${esc(r)} from the repos">Remove</button></li>`).join(''),
    )
    $<HTMLElement>('[data-pick]').hidden = picking
    $<HTMLElement>('.picker').hidden = !picking
    const at = repoPicker.listing()?.path
    const why = repoWhy(at, d.hub, d.repos)
    $('.picker-actions .hint').textContent = why ?? (at ? `adds ${at}` : '')
    $<HTMLButtonElement>('[data-add-repo]').disabled = why !== undefined
    const blocked = missing(d)
    const source = SOURCES.find((s) => s.id === fields.source)!
    const button = $<HTMLButtonElement>('footer .primary')
    button.textContent = sending ? (fields.source === 'clone' ? 'Starting the clone…' : 'Adding…') : source.submit
    button.disabled = sending || blocked !== undefined
    const hub = d.source === 'add' ? d.hub : d.into
    const repos = d.source === 'add' && d.repos.length ? `, and ${d.repos.length === 1 ? 'one repo' : `${d.repos.length} repos`} beside it` : ''
    $('.summary').innerHTML = blocked
      ? esc(blocked)
      : d.source === 'clone'
        ? `Clones <code>${esc(d.url.trim())}</code> into <code>${esc(hub)}</code> as a job, then adds the floor <b>${esc(d.name.trim())}</b> (<code>${esc(d.id)}</code>) once it's done. A note at the top of the sidebar follows it.`
        : `Adds the floor <b>${esc(d.name.trim())}</b> (<code>${esc(d.id)}</code>), its sessions starting in <code>${esc(hub)}</code>${repos}${d.source === 'new' ? ', a new git repository' : ''}.`
  }

  form.addEventListener('input', (e) => {
    const el = e.target as HTMLInputElement
    if (el.name === 'source') fields = { ...fields, source: el.value as Source }
    else fields = { ...fields, [el.name]: el.value === '' ? undefined : el.value }
    error.textContent = ''
    draw()
  })
  input('hub').addEventListener('change', () => {
    const dir = input('hub').value.trim()
    if (dir.startsWith('/')) hubs.browse(dir)
  })

  host.addEventListener('click', (e) => {
    const target = e.target as Element
    if (target.closest('[data-home]')) return kit.display('board')
    if (target.closest('[data-pick]')) {
      picking = true
      draw()
      return void repoPicker.browse(fields.hub ? fields.hub.replace(/\/[^/]+\/?$/, '') || '/' : undefined)
    }
    if (target.closest('[data-cancel]')) {
      picking = false
      return draw()
    }
    if (target.closest('[data-add-repo]')) {
      const at = repoPicker.listing()?.path
      if (!at || repoWhy(at, derived(fields, root()).hub, fields.repos)) return
      fields = { ...fields, repos: [...fields.repos, at] }
      picking = false
      return draw()
    }
    const unrepo = target.closest<HTMLElement>('[data-unrepo]')?.dataset.unrepo
    if (unrepo !== undefined) {
      fields = { ...fields, repos: fields.repos.filter((r) => r !== unrepo) }
      return draw()
    }
  })

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const d = derived(fields, root())
    if (sending || missing(d)) return
    sending = true
    error.textContent = ''
    draw()
    const [verb, body] = callOf(d)
    try {
      const reply = (await tower.call(verb as never, body as never)) as unknown as { t: 'added'; hub: string } | { t: 'started'; job: string }
      kit.toast(reply.t === 'started' ? `Cloning ${d.url.trim()}: the floor ${d.name.trim()} is added once it's done` : `The floor ${d.name.trim()} is up, at ${reply.hub}`)
      kit.display('board')
    } catch (err) {
      error.textContent = (err as Error).message
    } finally {
      sending = false
      if (host.isConnected) draw()
    }
  })

  draw()
  hubs.browse()
  parents.browse()

  return {
    update(next: Board) {
      board = next
      draw()
    },
    close() {},
  }
}
