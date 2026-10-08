/**
 * Markdown as html, two ways. `markdownHtml` is for words nobody vetted (Claude's answers, prompts, what workers
 * write): raw HTML shows as text, links go only where `safeHref` lets them, images come only from the tower. Its html
 * is safe in any element. `documentHtml` is for a file a worker showed or a shelf keeps: raw HTML stays, so its html
 * belongs in a frame without scripts; its links obey `safeHref` too.
 */
import { Marked, type Tokens } from 'marked'
import { esc } from './cards.ts'

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

/** A link as written, or its words alone when `safeHref` refuses it. The href is escaped as checked, so an entity can't turn into a scheme. */
const linkHtml = ({ href, title }: Tokens.Link, inner: string) =>
  safeHref(href) ? `<a href="${esc(href)}"${titled(title)}>${inner}</a>` : inner

const imageHtml = ({ href, title, text }: Tokens.Image) => `<img src="${esc(href)}" alt="${esc(text)}"${titled(title)}>`

const words = new Marked({
  renderer: {
    html: ({ text, block }) => (block ? `<p>${esc(text.trim())}</p>\n` : esc(text)),
    link(token) {
      return linkHtml(token, this.parser.parseInline(token.tokens))
    },
    image(token) {
      if (towerImage(token.href)) return imageHtml(token)
      const said = esc(token.text || token.href)
      return safeHref(token.href) ? `<a href="${esc(token.href)}"${titled(token.title)}>${said}</a>` : said
    },
  },
})

const documents = new Marked({
  renderer: {
    link(token) {
      return linkHtml(token, this.parser.parseInline(token.tokens))
    },
    image: imageHtml,
  },
})

/** Words nobody vetted as html safe in any element: raw HTML escaped, links `safeHref`, remote images as links to them. */
export const markdownHtml = (text: string) => words.parse(text, { async: false })

/** A markdown file served at `url` as html for a frame without scripts: raw HTML kept, links `safeHref`, relative images read beside it. */
export function documentHtml(text: string, url: string) {
  const tokens = documents.lexer(text)
  documents.walkTokens(tokens, (t) => void (t.type === 'image' && (t.href = imagePath(t.href, url) ?? t.href)))
  return documents.parser(tokens)
}
