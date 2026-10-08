/**
 * Markdown as html, two ways. `markdownHtml` is for words nobody vetted (Claude's answers, prompts, what workers
 * write): raw HTML shows as text, links go only where `safeHref` lets them, images come only from the tower. Its html
 * is safe in any element, drawn inside an element of class `md` (`markdownCss`). Each fence in it is a
 * `<figure class="code">`, its syntax marked, with a button a renderer wires to copy the code:
 *
 *   data-copy-code    copy the fence's code as written (`fenceText`)
 *
 * `documentHtml` is for a file a worker showed or a shelf keeps: raw HTML stays, its own links and scripts included,
 * so its html belongs in a frame without scripts; only its markdown links obey `safeHref`.
 */
import { Marked, type Tokens } from 'marked'
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
.md th, .md td { border: 1px solid var(--line); padding: 3px 9px; text-align: left; } .md th { background: var(--sunk); }
.md code { font: .88em var(--mono); background: var(--sunk); padding: .1em .35em; border-radius: 4px; overflow-wrap: anywhere; }
.md figure.code { position: relative; margin-inline: 0; }
.md figure.code pre { margin: 0; padding: 9px 12px; padding-right: 52px; overflow-x: auto; background: var(--panel); color: var(--ink); border: 1px solid var(--line); border-radius: var(--radius);
  font: 12.5px/1.5 var(--mono); font-variant-ligatures: none; }
.md figure.code pre code { background: none; padding: 0; font: inherit; overflow-wrap: normal; }
.md figure.code > button { position: absolute; top: 5px; right: 5px; padding: 1px 7px; font: 600 11px/1.5 var(--ui); color: var(--muted); background: var(--panel-2);
  border: 1px solid var(--line); border-radius: 4px; cursor: pointer; opacity: .6; }
.md figure.code:hover > button, .md figure.code > button:focus-visible { opacity: 1; }
${highlightCss('.md')}`
