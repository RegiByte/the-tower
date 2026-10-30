/**
 * Markdown as html, two ways. `markdownHtml` is for words nobody vetted (Claude's answers, prompts, what workers
 * write): raw HTML shows as text, links go only where `safeHref` lets them, images come only from the tower. Its html
 * is safe in any element, drawn inside an element of class `md` (`markdownCss`). Each fence in it is a
 * `<figure class="code">`, its syntax marked, with a button a renderer wires to copy the code:
 *
 *   data-copy-code    copy the fence's code as written (`fenceText`)
 *
 * `documentHtml` is for a file a worker showed or a shelf keeps: raw HTML stays, its own links and scripts included,
 * so its html belongs in a frame without scripts; only its markdown links obey `safeHref`. `sectionsOf` splits a
 * document into its sections and `sectionsHtml` draws each one, both from one split, so every renderer splits a
 * document the same way.
 */
import { Marked, type Token, type Tokens, type TokensList } from 'marked'
import { esc } from './cards.ts'
import { fenceLang, highlightCss, highlightLines } from './highlight.ts'

/** Where a relative URL is resolved for checking: a path of the tower's, whatever origin the tower answers at. */
const TOWER = 'http://tower.invalid/'
const LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

/** Whether a link may be followed: an http(s) or mailto address, or a path relative to where it is read. */
export const safeHref = (href: string) => URL.canParse(href, TOWER) && LINK_PROTOCOLS.has(new URL(href, TOWER).protocol)

/** Whether an image is the tower's own: a path, read from the tower; an address elsewhere would be fetched from there. */
const towerImage = (href: string) => URL.canParse(href, TOWER) && new URL(href, TOWER).origin === new URL(TOWER).origin

/** Where a markdown page served at `url` reads a relative image from, a path of the tower's; none for an absolute or remote one. */
export const imagePath = (href: string, url: string) =>
  /^([a-z][a-z\d+.-]*:|\/|#)/i.test(href) ? undefined : new URL(href, new URL(url, TOWER)).pathname

const titled = (title: string | null | undefined) => (title ? ` title="${esc(title)}"` : '')

/**
 * A link as written, or its words alone when `safeHref` refuses it. The href is escaped as checked, so an entity can't
 * turn into a scheme. `attrs` are the anchor's others.
 */
const linkHtml = ({ href, title }: Tokens.Link | Tokens.Image, inner: string, attrs: string) =>
  safeHref(href) ? `<a href="${esc(href)}"${titled(title)}${attrs}>${inner}</a>` : inner

/** Words drawn inside a page open their links in a tab of their own. */
const AWAY = ' target="_blank" rel="noopener noreferrer"'

const imageHtml = ({ href, title, text }: Tokens.Image) => `<img src="${esc(href)}" alt="${esc(text)}"${titled(title)}>`

const fenceHtml = ({ text, lang }: Tokens.Code) =>
  `<figure class="code"><button type="button" data-copy-code aria-label="copy the code">copy</button><pre><code>${highlightLines(text.split('\n'), fenceLang(lang)).join('\n')}</code></pre></figure>\n`

const words = new Marked({
  breaks: true,
  renderer: {
    html: ({ text, block }) => (block ? `<p>${esc(text.trim())}</p>\n` : esc(text)),
    code: fenceHtml,
    link(token) {
      return linkHtml(token, this.parser.parseInline(token.tokens), AWAY)
    },
    image(token) {
      return towerImage(token.href) ? imageHtml(token) : linkHtml(token, esc(token.text || token.href), AWAY)
    },
  },
})

const documents = new Marked({
  renderer: {
    link(token) {
      return linkHtml(token, this.parser.parseInline(token.tokens), '')
    },
    image: imageHtml,
  },
})

/** Words nobody vetted as html safe in any element: raw HTML escaped, links `safeHref` opening a tab of their own, remote images as links to them. */
export const markdownHtml = (text: string) => words.parse(text, { async: false })

/** A markdown file served at `url` as html for a frame without scripts: raw HTML kept as written, markdown links `safeHref`, relative images read beside it. */
export function documentHtml(text: string, url: string) {
  const tokens = documents.lexer(text)
  documents.walkTokens(tokens, (t) => void (t.type === 'image' && (t.href = imagePath(t.href, url) ?? t.href)))
  return documents.parser(tokens)
}

/**
 * One section of a document: `n`, its place (0 the text before the first heading it is split at); `heading`, that
 * heading's words as plain text, none for section 0; `body`, its markdown as written. @since 1.117
 */
export type Section = { n: number; heading?: string; body: string }

/** A heading's words as plain text: its inline marks dropped. */
const plain = (tokens: Token[] | undefined): string =>
  (tokens ?? []).map((t) => ('tokens' in t && t.tokens?.length ? plain(t.tokens) : 'text' in t ? (t.text as string) : '')).join('')

/**
 * A document's top-level tokens, lexed once, split before each heading of the shallowest level that occurs more than
 * once: a document under one `#` title splits at its `##`s. The first chunk is section 0, left out when it holds
 * nothing but blank lines; a document with no level repeated is one section.
 */
const split = (lexed: TokensList): { n: number; heading?: Tokens.Heading; tokens: Token[] }[] => {
  const headings = lexed.filter((t): t is Tokens.Heading => t.type === 'heading')
  const counts = new Map<number, number>()
  for (const h of headings) counts.set(h.depth, (counts.get(h.depth) ?? 0) + 1)
  const depth = Math.min(...[...counts].filter(([, n]) => n > 1).map(([d]) => d))
  const chunks: { n: number; heading?: Tokens.Heading; tokens: Token[] }[] = [{ n: 0, tokens: [] }]
  for (const t of lexed) {
    if (t.type === 'heading' && (t as Tokens.Heading).depth === depth) chunks.push({ n: chunks.length, heading: t as Tokens.Heading, tokens: [] })
    chunks.at(-1)!.tokens.push(t)
  }
  return chunks[0].tokens.every((t) => t.type === 'space' || t.type === 'def') && chunks.length > 1 ? chunks.slice(1) : chunks
}

/** A document's sections, as `split` cuts it: each one's place, heading and markdown. @since 1.117 */
export const sectionsOf = (text: string): Section[] =>
  split(documents.lexer(text)).map(({ n, heading, tokens }) => ({ n, ...(heading && { heading: plain(heading.tokens) }), body: tokens.map((t) => t.raw).join('') }))

/**
 * Each section of a markdown file served at `url` as html for a frame without scripts, as `documentHtml` draws the
 * whole, in `sectionsOf`'s order. Every section reads the document's link definitions, so a reference link resolves
 * wherever its definition is. An HTML block left open across a section's end is closed there. @since 1.117
 */
export function sectionsHtml(text: string, url: string): string[] {
  const lexed = documents.lexer(text)
  documents.walkTokens(lexed, (t) => void (t.type === 'image' && (t.href = imagePath(t.href, url) ?? t.href)))
  return split(lexed).map(({ tokens }) => documents.parser(Object.assign(tokens, { links: lexed.links })))
}

/**
 * What each section's row in a gutter reads, naming exactly one section: its heading; section 0's "Before the first
 * heading", or "The whole document" when it is the only one. In source order, a label an earlier row already reads is
 * numbered with the smallest ` · n` (from 2) no earlier row reads: "Notes", "Notes · 2". @since 1.117
 */
export function sectionLabels(sections: Section[]): string[] {
  const read = new Set<string>()
  return sections.map((s) => {
    const label = s.heading ?? (sections.length === 1 ? 'The whole document' : 'Before the first heading')
    let unique = label
    for (let n = 2; read.has(unique); n++) unique = `${label} · ${n}`
    read.add(unique)
    return unique
  })
}

/** The code of the fence a `data-copy-code` button sits in, as written. */
export const fenceText = (button: Element) => button.closest('figure.code')?.querySelector('code')?.textContent ?? ''

/** `markdownHtml` drawn inside an element of class `md`, at any width; reads the design's tokens from `/design.css`. */
export const markdownCss = `.md { overflow-wrap: anywhere; }
.md > :first-child { margin-top: 0; } .md > :last-child { margin-bottom: 0; }
.md p, .md ul, .md ol, .md blockquote, .md table, .md figure { margin: .6em 0; }
.md :is(h1, h2, h3, h4, h5, h6) { margin: 1em 0 .4em; font: 800 1.05em/1.3 var(--display); }
.md h1 { font-size: 1.3em; } .md h2 { font-size: 1.15em; }
.md ul, .md ol { padding-left: 1.4em; } .md li { margin: .15em 0; }
.md a { color: var(--accent); }
.md img { max-width: 100%; height: auto; }
.md hr { border: 0; border-top: 1px solid var(--line); margin: 1em 0; }
.md blockquote { padding: 0 1em; border-left: 3px solid var(--line); color: var(--muted); }
.md table { display: block; max-width: 100%; overflow-x: auto; border-collapse: collapse; }
.md th, .md td { border: 1px solid var(--line); padding: var(--sp-xs) var(--sp-m); text-align: left; } .md th { background: var(--sunk); }
.md code { font: .88em var(--mono); background: var(--sunk); padding: .1em .35em; border-radius: var(--radius); overflow-wrap: anywhere; }
.md figure.code { position: relative; margin-inline: 0; }
.md figure.code pre { margin: 0; padding: var(--sp-m) var(--sp-l); padding-right: 52px; overflow-x: auto; background: var(--panel); color: var(--ink); border: 1px solid var(--line); border-radius: var(--radius);
  font: var(--fs-m)/1.5 var(--mono); font-variant-ligatures: none; }
.md figure.code pre code { background: none; padding: 0; font: inherit; overflow-wrap: normal; }
.md figure.code > button { position: absolute; top: 5px; right: 5px; padding: 1px var(--sp-m); font: 700 var(--fs-xs)/1.5 var(--ui); color: var(--muted); background: var(--panel-2);
  border: 1px solid var(--line); border-radius: var(--radius); cursor: pointer; opacity: .6; }
.md figure.code:hover > button, .md figure.code > button:focus-visible { opacity: 1; }
${highlightCss('.md')}`
