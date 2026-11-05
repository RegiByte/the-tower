import type { Board } from '../../../src/bridge/board.ts'
import { esc } from '../../../src/shared/cards.ts'
import type { Mount } from '../../../src/shared/views.ts'
import { closeHtml, paintOnce, viewCss } from '../../../src/views/parts.ts'
import { callOf, derived, missing, SOURCES, type Fields, type Source } from './floor-form.ts'

/**
 * `floors/form`, the New floor form on the board: where the hub comes from (a folder on the machine, picked by browsing
 * `floors/dirs`, or a new project), the floor's name and id, and the folder a new project goes in, each derived until
 * typed. Sending calls the source's verb; the floor is on the board once the
 * tower reads the config it added.
 */

const ID = 'floors/form'

type Listing = { path: string; parent?: string; root: string; git: boolean; dirs: { name: string; git: boolean }[] }

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
  & .row { display: grid; grid-template-columns: 2fr 1fr; gap: var(--sp-l); }
  & input[type=text] { padding: var(--sp-m) var(--sp-l); font: var(--fs-m)/1.3 var(--mono); color: var(--ink); background: var(--panel); border: 1px solid var(--line-strong); border-radius: var(--radius); }
  & input[type=text]:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
  & .browse { display: flex; flex-direction: column; gap: var(--sp-s); }
  & .crumb { display: flex; align-items: center; gap: var(--sp-m); font: var(--fs-s)/1.3 var(--mono); color: var(--muted); }
  & .crumb code { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; direction: rtl; text-align: left; }
  & .dirs { max-height: 260px; overflow-y: auto; display: flex; flex-direction: column; border: 1px solid var(--line); border-radius: var(--radius); scrollbar-width: thin; }
  & .dirs button { display: flex; align-items: center; gap: var(--sp-m); padding: var(--sp-s) var(--sp-l); border: 0; border-bottom: 1px solid var(--line); border-radius: 0; background: none;
    color: var(--ink); text-align: left; font: var(--fs-m)/1.3 var(--mono); cursor: pointer; }
  & .dirs button:last-child { border-bottom: 0; }
  & .dirs button:hover, & .dirs button:focus-visible { background: var(--panel-2); }
  & .dirs .git { margin-left: auto; font: var(--fs-xs)/1 var(--mono); color: var(--muted); }
  & .dirs .empty { padding: var(--sp-m) var(--sp-l); color: var(--faint); }
  & .chosen { font-size: var(--fs-s); }
  & .chosen code { font-family: var(--mono); }
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

export const mount: Mount = (host, { tower, board: first, kit }) => {
  let board: Board = first
  let fields: Fields = { source: 'add' }
  let listing: Listing | undefined
  let sending = false

  host.innerHTML = `<style>${STYLE}</style>
  <div class="shelf-head"><span class="label">New floor</span><span class="dim">a floor for a project</span><span class="actions"></span></div>
  <form class="floor-form" novalidate>
    <fieldset class="sources" aria-label="where the project comes from">${sourcesHtml(fields.source)}</fieldset>
    <div class="field browse" data-for="add"><span>Folder</span>
      <div class="crumb"><button type="button" data-up aria-label="the folder above">↑ up</button><code></code></div>
      <div class="dirs" role="list"></div>
      <input type="text" name="hub" autocomplete="off" spellcheck="false" placeholder="pick a folder above, or type its absolute path">
    </div>
    <div class="row">
      <label class="field"><span>Name</span><input type="text" name="name" autocomplete="off" spellcheck="false"></label>
      <label class="field"><span>Id</span><input type="text" name="id" autocomplete="off" spellcheck="false" pattern="[A-Za-z0-9_\\-]+"></label>
    </div>
    <label class="field" data-for="new"><span>Into folder</span><input type="text" name="into" autocomplete="off" spellcheck="false">
      <small class="hint">made with its parents; it must not exist yet, or be empty</small></label>
    <p class="error" role="alert"></p>
    <footer><p class="summary"></p><button type="submit" class="primary"></button></footer>
  </form>`
  const $ = <T extends Element>(sel: string) => host.querySelector<T>(sel)!
  const form = $<HTMLFormElement>('form')
  const input = (name: string) => form.elements.namedItem(name) as HTMLInputElement
  const error = $<HTMLElement>('.error')

  const root = () => listing?.root ?? ''

  const draw = () => {
    paintOnce($('.shelf-head .actions'), closeHtml(board.keys))
    const d = derived(fields, root())
    for (const el of host.querySelectorAll<HTMLElement>('[data-for]')) el.hidden = !el.dataset.for!.split(' ').includes(fields.source)
    for (const name of ['name', 'id', 'into'] as const) input(name).placeholder = d[name] || (name === 'name' ? 'shown on the floor' : name === 'id' ? 'from the name' : '')
    if (listing) {
      paintOnce($('.crumb code'), `<bdi>${esc(listing.path)}</bdi>`)
      $<HTMLButtonElement>('[data-up]').disabled = !listing.parent
      paintOnce(
        $('.dirs'),
        listing.dirs.length
          ? listing.dirs.map((x) => `<button type="button" role="listitem" data-dir="${esc(x.name)}">📁 ${esc(x.name)}${x.git ? '<span class="git">git</span>' : ''}</button>`).join('')
          : '<div class="empty">no folders here</div>',
      )
    }
    const why = missing(d)
    const source = SOURCES.find((s) => s.id === fields.source)!
    const button = $<HTMLButtonElement>('footer .primary')
    button.textContent = sending ? 'Adding…' : source.submit
    button.disabled = sending || why !== undefined
    const hub = d.source === 'add' ? d.hub : d.into
    $('.summary').innerHTML = why
      ? esc(why)
      : `Adds the floor <b>${esc(d.name.trim())}</b> (<code>${esc(d.id)}</code>), its sessions starting in <code>${esc(hub)}</code>${d.source === 'new' ? ', a new git repository' : ''}.`
  }

  const browse = async (dir?: string) => {
    try {
      listing = (await tower.get(`floors/dirs${dir ? `?path=${encodeURIComponent(dir)}` : ''}` as never)) as unknown as Listing
      draw()
    } catch (err) {
      error.textContent = (err as Error).message
    }
  }

  /** The folder picked: listed, and the hub unless the user typed one. */
  const pick = async (dir: string) => {
    fields = { ...fields, hub: dir }
    input('hub').value = dir
    await browse(dir)
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
    if (dir.startsWith('/')) browse(dir)
  })

  host.addEventListener('click', (e) => {
    const target = e.target as Element
    if (target.closest('[data-home]')) return kit.display('board')
    if (target.closest('[data-up]') && listing?.parent) return void pick(listing.parent)
    const dir = target.closest<HTMLElement>('[data-dir]')?.dataset.dir
    if (dir && listing) return void pick(`${listing.path.replace(/\/$/, '')}/${dir}`)
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
      const reply = (await tower.call(verb as never, body as never)) as unknown as { project: string; hub: string }
      kit.toast(`The floor ${d.name.trim()} is up, at ${reply.hub}`)
      kit.display('board')
    } catch (err) {
      error.textContent = (err as Error).message
    } finally {
      sending = false
      if (host.isConnected) draw()
    }
  })

  draw()
  browse()

  return {
    update(next: Board) {
      board = next
      draw()
    },
    close() {},
  }
}
