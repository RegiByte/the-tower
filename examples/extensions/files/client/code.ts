/**
 * `files/code`: a text file read-only, highlighted as VS Code draws it, by Shiki with VS Code's TextMate grammars and
 * its Light+ and Dark+ themes, following the viewer's scheme. A grammar is a module of its own under `langs/`,
 * imported the first time a file of its language opens, so a page pays only for the languages it shows. The first
 * 1 MB is read; past `HIGHLIGHT_LINES` lines a file is drawn as plain text, numbered all the same.
 */
import { createHighlighterCore, type HighlighterCore, type LanguageRegistration } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import darkPlus from 'shiki/themes/dark-plus.mjs'
import lightPlus from 'shiki/themes/light-plus.mjs'

const ID = 'files/code'

/** The most bytes read of a file. */
const READ_BYTES = 1024 * 1024
/** The most lines highlighted: past them a file is plain text, which draws at once. */
const HIGHLIGHT_LINES = 5000

/** The grammar module (`langs/<id>.ts`) for a file name's extension. */
const BY_EXTENSION: Record<string, string> = {
  ts: 'typescript', mts: 'typescript', cts: 'typescript', tsx: 'tsx', js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'jsx',
  json: 'json', jsonl: 'json', map: 'json', jsonc: 'jsonc', css: 'css', scss: 'scss', less: 'less', py: 'python', rb: 'ruby', go: 'go', rs: 'rust',
  sh: 'shellscript', bash: 'shellscript', zsh: 'shellscript', sql: 'sql', yaml: 'yaml', yml: 'yaml', toml: 'toml', clj: 'clojure', cljs: 'clojure',
  cljc: 'clojure', edn: 'clojure', java: 'java', kt: 'kotlin', swift: 'swift', c: 'c', h: 'c', cc: 'cpp', cpp: 'cpp', hpp: 'cpp', cs: 'csharp',
  php: 'php', xml: 'xml', svg: 'xml', ini: 'ini', cfg: 'ini', diff: 'diff', patch: 'diff', lua: 'lua', ex: 'elixir', exs: 'elixir', hs: 'haskell',
  graphql: 'graphql', gql: 'graphql', vue: 'vue', svelte: 'svelte', nix: 'nix', zig: 'zig',
}

/** The grammar module for a whole file name. */
const BY_NAME: Record<string, string> = { dockerfile: 'dockerfile', makefile: 'make', gnumakefile: 'make', '.zshrc': 'shellscript', '.bashrc': 'shellscript', '.env': 'shellscript' }

const langOf = (name: string): string | undefined => {
  const base = name.slice(name.lastIndexOf('/') + 1).toLowerCase()
  const dot = base.lastIndexOf('.')
  return BY_NAME[base] ?? (dot > 0 ? BY_EXTENSION[base.slice(dot + 1)] : undefined)
}

const CSS = `:where([data-view="${ID}"]) {
  position: absolute; inset: 0; overflow: auto; background: var(--code-bg); color: var(--code-fg);
  --code-bg: #ffffff; --code-fg: #000000;
  &[data-scheme="dark"] { --code-bg: #1e1e1e; --code-fg: #d4d4d4; }
  & .note { position: sticky; top: 0; z-index: 1; padding: var(--sp-xs) var(--sp-l); font-size: var(--fs-s); color: var(--muted); background: var(--panel); border-bottom: 1px solid var(--line); }
  & pre { margin: 0; padding: var(--sp-m) 0; font: var(--fs-s)/1.55 var(--mono); tab-size: 4; counter-reset: line; background: none !important; }
  & code { display: block; min-width: max-content; }
  & .line { display: inline-block; min-width: 100%; padding-right: var(--sp-xl); }
  & .line::before { counter-increment: line; content: counter(line); display: inline-block; width: 5ch; margin-right: var(--sp-l); text-align: right; color: var(--faint); user-select: none; }
  & .line span { color: var(--shiki-light); font-style: var(--shiki-light-font-style); font-weight: var(--shiki-light-font-weight); }
  &[data-scheme="dark"] .line span { color: var(--shiki-dark); font-style: var(--shiki-dark-font-style); font-weight: var(--shiki-dark-font-weight); }
  & .failed { padding: var(--sp-xl); color: var(--muted); }
}`

type Text = { text: string; type?: string; path?: string; target?: string; id?: string }

let highlighter: Promise<HighlighterCore> | undefined
const highlighterOf = () => (highlighter ??= createHighlighterCore({ themes: [lightPlus, darkPlus], langs: [], engine: createJavaScriptRegexEngine() }))

/** A grammar's module as the tower serves it: imported by URL at run time, never bundled into this one. */
const langUrl = (id: string) => `/x/files/langs/${id}.js`

/** Each grammar, loaded into the highlighter once. */
const loading = new Map<string, Promise<void>>()
const loadLang = (h: HighlighterCore, id: string) => {
  if (!loading.has(id))
    loading.set(
      id,
      import(langUrl(id)).then((m: { default: LanguageRegistration[] }) => h.loadLanguage(...m.default)),
    )
  return loading.get(id)!
}

/** The first `READ_BYTES` of what `url` serves, and whether there was more. */
async function readHead(url: string): Promise<{ text: string; truncated: boolean }> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(((await res.json().catch(() => undefined)) as { message?: string } | undefined)?.message ?? `${res.status} ${res.statusText}`)
  const reader = res.body!.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  let truncated = false
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    size += value.length
    if (size >= READ_BYTES) {
      truncated = size > READ_BYTES || !(await reader.read()).done
      await reader.cancel()
      break
    }
  }
  const bytes = new Uint8Array(Math.min(size, READ_BYTES))
  let at = 0
  for (const chunk of chunks) {
    bytes.set(chunk.subarray(0, bytes.length - at), at)
    at += chunk.length
    if (at >= bytes.length) break
  }
  return { text: new TextDecoder().decode(bytes), truncated }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

const plainHtml = (text: string) => `<pre><code>${text.split('\n').map((line) => `<span class="line">${esc(line)}</span>`).join('\n')}</code></pre>`

type Tower = { scheme(): string; onScheme(fn: (scheme: string) => void): () => void }
type Ctx = { tower: Tower; subject: { value: unknown } }

export async function mount(host: HTMLElement, { tower, subject }: Ctx) {
  host.dataset.scheme = tower.scheme()
  const off = tower.onScheme((scheme) => (host.dataset.scheme = scheme))
  host.innerHTML = `<style>${CSS}</style><div class="body"></div>`
  const body = host.querySelector<HTMLElement>('.body')!
  let drawn = ''
  let draws = 0

  async function draw(value: Text) {
    drawn = value.text
    const n = ++draws
    const name = value.path ?? value.target ?? value.id ?? ''
    try {
      const { text, truncated } = await readHead(`/${value.text}`)
      const lines = text.split('\n').length
      const lang = langOf(name)
      const notes = [truncated && 'only its first 1 MB is shown: open it in your editor for the rest', lang && lines > HIGHLIGHT_LINES && `not highlighted past ${HIGHLIGHT_LINES.toLocaleString()} lines`].filter(Boolean)
      let html = plainHtml(text)
      if (lang && lines <= HIGHLIGHT_LINES) {
        const h = await highlighterOf()
        await loadLang(h, lang)
        html = h.codeToHtml(text, { lang: h.getLoadedLanguages().includes(lang) ? lang : 'text', themes: { light: 'light-plus', dark: 'dark-plus' }, defaultColor: false })
      }
      if (n === draws) body.innerHTML = `${notes.length ? `<div class="note">${esc(notes.join(' · '))}</div>` : ''}${html}`
    } catch (err) {
      if (n === draws) body.innerHTML = `<p class="failed">${esc(name)} couldn't be read: ${esc((err as Error).message)}</p>`
    }
  }

  void draw(subject.value as Text)
  return {
    update(_board: unknown, next: { value: unknown }) {
      if ((next.value as Text).text !== drawn) void draw(next.value as Text)
    },
    close() {
      off()
    },
  }
}
