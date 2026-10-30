import { esc, fileSubject } from '/cards.js'
import { fileButtonsHtml, fileCall } from '/panels.js'

/**
 * `files/explorer`: a worker's checkout as a tree beside the file opened from it, in the worker's tabs. Each repo of
 * the checkout is a root; a folder is listed when it is first opened (`files/tree`), what git ignores dimmed, and
 * what git sees changed marked (`files/status`: M modified, A added, D deleted, R renamed, U untracked, C in conflict),
 * a folder holding any marked with a dot. The file opened is handed to the `file.open` region as a `file` subject,
 * so the view its type picks draws it: code by `files/code`, the rest by the tower's views by type. While the tab is
 * seen it polls: the status every `POLL_MS` (one read at a time, further apart when git is slow), the open folders
 * read again when it changed, and the open file drawn again when it changed on disk. The folders opened and the file
 * open are kept per worker (`ctx.state`), so the tab reopens as it was left. In a narrow room (a grid's cell) the tree
 * and the file share the space by turns.
 */

const ID = 'files/explorer'

/** How often the status is read while the tab is seen, at least. */
const POLL_MS = 2000
/** The longest wait between two reads, however slow git is. */
const MAX_POLL_MS = 30_000

const CSS = `:where([data-view="${ID}"]) {
  container-type: inline-size; position: relative;
  & .fx { position: absolute; inset: 0; display: grid; grid-template-columns: minmax(12rem, 18rem) minmax(0, 1fr); background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; }
  & .fx-tree { overflow: auto; padding: var(--sp-xs) 0 var(--sp-l); border-right: 1px solid var(--line); font-size: var(--fs-s); }
  & .fx-tree .note { padding: var(--sp-s) var(--sp-m); color: var(--muted); }
  & .row { display: flex; align-items: center; gap: var(--sp-xs); width: 100%; min-height: 0; padding: 1px var(--sp-m) 1px calc(var(--sp-m) + var(--depth, 0) * 0.9rem); border: 0; border-radius: 0; background: none;
    color: var(--ink); font: inherit; font-weight: 400; text-align: left; white-space: nowrap; cursor: pointer; }
  & .row:hover, & .row:focus-visible { background: var(--panel-2); }
  & .row[aria-current="true"] { background: color-mix(in oklab, var(--accent) 16%, var(--panel)); }
  & .row .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  & .row .twist { flex: none; width: 1ch; color: var(--faint); }
  & .row.root { margin-top: var(--sp-xs); font-weight: 700; text-transform: none; }
  & .row.ignored .name { color: var(--faint); }
  & .row .mark { flex: none; font: 700 var(--fs-xs)/1 var(--mono); }
  & .row .dot { flex: none; width: 6px; height: 6px; border-radius: 50%; background: var(--working); }
  & :is(.m-M, .m-R) { color: var(--working-text); } & :is(.m-A, .m-U) { color: var(--ready-text); } & :is(.m-D, .m-C) { color: var(--broken-text); }
  & .row.more { color: var(--muted); cursor: default; }
  & .row.outside { cursor: default; } & .row.outside:hover { background: none; } & .row.outside small { flex: none; color: var(--faint); font-size: var(--fs-xs); }
  & .fx-file { min-width: 0; min-height: 0; display: flex; flex-direction: column; }
  & .fx-head { flex: none; display: flex; align-items: center; gap: var(--sp-m); min-height: 2.2rem; padding: var(--sp-xs) var(--sp-m); border-bottom: 1px solid var(--line); font-size: var(--fs-s); color: var(--muted); }
  & .fx-head .path { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink); font-family: var(--mono); direction: rtl; text-align: left; }
  & .fx-head .meta { flex: none; margin-left: auto; }
  & .fx-head .back { display: none; flex: none; }
  & .fx-open { position: relative; flex: 1; min-height: 0; overflow: hidden; }
  & .fx-open > .view-root { position: absolute; inset: 0; }
  & .fx-open .empty { margin: auto; padding: var(--sp-3xl) var(--sp-xl); color: var(--muted); text-align: center; }
  @container (max-width: 40rem) {
    & .fx { grid-template-columns: minmax(0, 1fr); }
    & .fx-tree { border-right: 0; }
    & .fx.reading .fx-tree, & .fx:not(.reading) .fx-file { display: none; }
    & .fx-head .back { display: inline-flex; }
  }
}`

/** A folder's or a file's key in the tree: its repo (a folder's name, no slash in it) and its path there, the repo's top `''`. */
const keyOf = (repo, path) => `${repo}/${path}`

/** A key's repo and path. */
const partsOf = (key) => {
  const slash = key.indexOf('/')
  return [key.slice(0, slash), key.slice(slash + 1)]
}

const join = (path, name) => (path ? `${path}/${name}` : name)

/** A path as a URL's segments, each encoded. */
const urlPath = (path) => path.split('/').map(encodeURIComponent).join('/')

const sizeWords = (bytes) => (bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`)

/** How many files git sees changed in the worker's checkout, as the board reads it: its worktree's, or the floor's main checkouts'. */
const dirtyOf = (board, card) => {
  const floor = board.floors.find((f) => f.id === card.project)
  if (!floor) return undefined
  if (card.checkout === 'main') return floor.main?.dirty
  const tree = floor.worktrees.find((w) => w.name === card.checkout)
  return tree && tree.repos.reduce((n, r) => n + r.dirty, 0)
}

/** The tab on every worker: how many files it has changed, as its tally. */
export function tab(board, subject) {
  const dirty = dirtyOf(board, subject.value)
  return dirty ? { text: String(dirty), hint: `${dirty} file${dirty === 1 ? '' : 's'} changed in its checkout` } : {}
}

export async function mount(host, { tower, board: first, subject, kit, state }) {
  let card = subject.value
  let board = first
  const read = (name, query) => tower.get(`files/${name}/${encodeURIComponent(card.project)}/${encodeURIComponent(card.id)}${query ? `?${new URLSearchParams(query)}` : ''}`)
  const toast = (err) => kit.toast?.(err.message)

  host.innerHTML = `<style>${CSS}</style><div class="fx"><nav class="fx-tree" aria-label="files"><p class="note">Reading the checkout…</p></nav>
    <section class="fx-file"><div class="fx-head"><button class="back" data-back>‹ Files</button><span class="path"></span><span class="meta"></span><span class="acts"></span></div><div class="fx-open"><p class="empty">Pick a file to open it.</p></div></section></div>`
  const fx = host.querySelector('.fx')
  const tree = host.querySelector('.fx-tree')
  const headPath = host.querySelector('.fx-head .path')
  const headMeta = host.querySelector('.fx-head .meta')
  const headActs = host.querySelector('.fx-head .acts')
  const openEl = host.querySelector('.fx-open')

  /** @type {string[]} */
  let repos = []
  /** Each folder listed, by key. @type {Map<string, { entries: { name: string, kind: 'dir' | 'file', ignored?: true }[], more: number }>} */
  const listings = new Map()
  /** The folders open, by key. */
  const opened = new Set((await state.get(`open.${card.id}`)) ?? [])
  /** What git marks changed, by repo, and the status read last. */
  let marks = new Map()
  let stamp = ''
  /** The file open: its repo, path, what `files/stat` said of it, and the region drawing it. */
  let file = /** @type {{ repo: string, path: string, stat?: { size: number, mtime: number, type: string, file: string }, region?: { close(): void } } | undefined} */ (undefined)

  const keepOpened = () => state.set(`open.${card.id}`, [...opened])

  /** Whether `path` in `repo`, a folder, holds a marked path. */
  const holdsMark = (repo, path) => {
    const m = marks.get(repo)
    if (!m) return undefined
    const prefix = path ? `${path}/` : ''
    for (const [p, mark] of Object.entries(m)) if (p.startsWith(prefix) && p !== prefix) return mark
    return undefined
  }

  const markHtml = (mark) => (mark ? `<b class="mark m-${mark}" title="${esc(markTitle[mark] ?? mark)}">${mark}</b>` : '')
  const markTitle = { M: 'modified', A: 'added', D: 'deleted', R: 'renamed', U: 'untracked', C: 'in conflict' }

  function rowsOf(repo, path, depth) {
    const listing = listings.get(keyOf(repo, path))
    if (!listing) return `<div class="row more" style="--depth:${depth}">…</div>`
    const m = marks.get(repo) ?? {}
    const rows = listing.entries.map((e) => {
      const at = join(path, e.name)
      const cls = e.ignored ? ' ignored' : ''
      if (e.outside)
        return `<div class="row outside${cls}" style="--depth:${depth}" title="a link to outside the checkout: the explorer reads only the worker's own files"><span class="twist">↗</span><span class="name">${esc(e.name)}</span><small>outside the checkout</small>${markHtml(m[at])}</div>`
      if (e.kind === 'dir') {
        const key = keyOf(repo, at)
        const isOpen = opened.has(key)
        const own = m[`${at}/`] ?? m[at]
        const inner = own ? markHtml(own) : holdsMark(repo, at) ? '<i class="dot" title="holds changes"></i>' : ''
        return `<button class="row${cls}" data-dir="${esc(key)}" aria-expanded="${isOpen}" style="--depth:${depth}"><span class="twist">${isOpen ? '▾' : '▸'}</span><span class="name">${esc(e.name)}</span>${inner}</button>${isOpen ? rowsOf(repo, at, depth + 1) : ''}`
      }
      const current = file?.repo === repo && file.path === at
      return `<button class="row file${cls}" data-file="${esc(keyOf(repo, at))}" aria-current="${current}" style="--depth:${depth}"><span class="twist"></span><span class="name">${esc(e.name)}</span>${markHtml(m[at])}</button>`
    })
    if (listing.more) rows.push(`<div class="row more" style="--depth:${depth}"><span class="twist"></span><span class="name">${listing.more} more not listed: open it in your editor</span></div>`)
    if (!listing.entries.length) rows.push(`<div class="row more" style="--depth:${depth}"><span class="twist"></span><span class="name">empty</span></div>`)
    return rows.join('')
  }

  let painted = ''
  function paint() {
    const html = repos
      .map((repo) => {
        const key = keyOf(repo, '')
        const isOpen = opened.has(key)
        return `<button class="row root" data-dir="${esc(key)}" aria-expanded="${isOpen}"><span class="twist">${isOpen ? '▾' : '▸'}</span><span class="name">${esc(repo)}</span>${holdsMark(repo, '') ? '<i class="dot" title="holds changes"></i>' : ''}</button>${isOpen ? rowsOf(repo, '', 1) : ''}`
      })
      .join('')
    if (html === painted) return
    painted = html
    tree.innerHTML = html || '<p class="note">This worker has no checkout the explorer can read.</p>'
  }

  /** Lists folder `path` of `repo`. */
  const list = async (repo, path) => {
    const got = await read('tree', { repo, path })
    listings.set(keyOf(repo, path), { entries: got.entries, more: got.more })
  }

  /** The open folders, each listed again: those gone are closed. */
  const relist = () =>
    Promise.all(
      [...listings.keys()].map(async (key) => {
        const [repo, path] = partsOf(key)
        if (path && !opened.has(key)) return listings.delete(key)
        await list(repo, path).catch(() => (listings.delete(key), opened.delete(key)))
      }),
    )

  async function toggle(key) {
    const [repo, path] = partsOf(key)
    if (opened.has(key)) opened.delete(key)
    else {
      opened.add(key)
      if (!listings.has(key)) await list(repo, path).catch(toast)
    }
    keepOpened()
    paint()
  }

  function drawHead() {
    if (!file) return
    headPath.textContent = `${file.repo}/${file.path}`
    headPath.title = file.stat?.file ?? file.path
    const mark = marks.get(file.repo)?.[file.path]
    headMeta.innerHTML = file.stat ? `${markHtml(mark)} ${sizeWords(file.stat.size)}` : 'gone from disk'
    headActs.innerHTML = file.stat ? fileButtonsHtml(file.stat.file) : ''
  }

  /** The file open drawn again in `file.open`, by the view its type picks. */
  function drawFile() {
    file?.region?.close()
    if (!file?.stat) return void (openEl.innerHTML = `<p class="empty">${esc(file?.path ?? '')} is gone from disk.</p>`)
    const text = `files/raw/${encodeURIComponent(card.project)}/${encodeURIComponent(card.id)}/${encodeURIComponent(file.repo)}/${urlPath(file.path)}`
    const at = fileSubject({ card: card.id, project: card.project, repo: file.repo, path: file.path, text, type: file.stat.type })
    file.region = kit.region(openEl, 'file.open', at)
  }

  /** The file `path` of `repo` open, as `files/stat` describes it. */
  function show(repo, path, stat) {
    file?.region?.close()
    file = { repo, path, stat }
    state.set(`file.${card.id}`, { repo, path })
    fx.classList.add('reading')
    drawHead()
    drawFile()
    paint()
  }

  const openFile = (repo, path) =>
    read('stat', { repo, path }).then(
      (stat) => show(repo, path, stat),
      toast,
    )

  /** The status read, and when it changed, the open folders listed again; the open file drawn again when it changed on disk. */
  async function poll() {
    const status = await read('status')
    if (status.stamp !== stamp) {
      stamp = status.stamp
      marks = new Map(status.repos.map((r) => [r.repo, r.marks]))
      await relist()
      paint()
    }
    if (!file) return
    const now = await read('stat', { repo: file.repo, path: file.path }).catch(() => undefined)
    const changed = now?.mtime !== file.stat?.mtime || now?.size !== file.stat?.size
    file.stat = now
    drawHead()
    if (changed) drawFile()
  }

  let seen = true
  let closed = false
  let timer = 0
  let polling = false
  /** One poll at a time, while seen; the next after `POLL_MS`, or four times as long as this one took. */
  async function tick() {
    if (polling || !seen || closed) return
    polling = true
    const started = performance.now()
    await poll().catch(() => {})
    polling = false
    if (!seen || closed) return
    clearTimeout(timer)
    timer = setTimeout(tick, Math.min(MAX_POLL_MS, Math.max(POLL_MS, 4 * (performance.now() - started))))
  }

  host.addEventListener('click', (e) => {
    const target = /** @type {Element} */ (e.target)
    const call = fileCall(target)
    if (call) return void tower.run(call).catch(toast)
    if (target.closest('[data-back]')) return fx.classList.remove('reading')
    const dir = target.closest('[data-dir]')?.getAttribute('data-dir')
    if (dir) return void toggle(dir)
    const at = target.closest('[data-file]')?.getAttribute('data-file')
    if (at) {
      const [repo, path] = partsOf(at)
      return void openFile(repo, path)
    }
  })

  repos = (await read('repos').catch((err) => (toast(err), { repos: [] }))).repos
  if (!(await state.get(`open.${card.id}`))) repos.forEach((repo) => opened.add(keyOf(repo, '')))
  await Promise.all(repos.map((repo) => list(repo, '').catch(toast)))
  for (const key of opened) {
    const [repo, path] = partsOf(key)
    if (path && repos.includes(repo)) await list(repo, path).catch(() => opened.delete(key))
  }
  paint()
  const kept = await state.get(`file.${card.id}`)
  const keptStat = kept && repos.includes(kept.repo) ? await read('stat', kept).catch(() => undefined) : undefined
  if (keptStat) show(kept.repo, kept.path, keptStat)
  void tick()

  return {
    update(next, at) {
      board = next
      card = at.value
    },
    visible(on) {
      seen = on
      if (on) void tick()
      else clearTimeout(timer)
    },
    tab() {
      return tab(board, { value: card })
    },
    close() {
      closed = true
      clearTimeout(timer)
      file?.region?.close()
    },
  }
}
