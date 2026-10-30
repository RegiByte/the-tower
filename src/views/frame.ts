import { relativeHref, safeHref } from '../shared/markdown.ts'

/**
 * What every document frame a core view draws does alike: a frame where nothing runs, which the view reaches into and
 * hears nothing from, its links written where they go (decision `markdown-safe`). Bundled into each view's module that
 * draws one.
 */

/**
 * The sandbox of a document frame: nothing runs, the page reaches in, a web link opens a tab of its own outside the
 * sandbox, and a link pressed may take the page to one of its own locations.
 */
export const DOCUMENT_SANDBOX = 'allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation'

/** A heading's slug, as GitHub names it: lowercased, its punctuation dropped, its spaces dashes. */
const slugOf = (text: string) => text.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-')

/**
 * Gives each heading of `doc` without an id the slug GitHub names it by, a repeated slug numbered `-1`, `-2` as GitHub
 * numbers them, unless an element already holds that id: a `#fragment` link then lands on it as a browser follows one.
 */
const nameHeadings = (doc: Document) => {
  const counts = new Map<string, number>()
  for (const h of doc.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
    const slug = slugOf(h.textContent ?? '')
    const n = counts.get(slug) ?? 0
    counts.set(slug, n + 1)
    const id = n ? `${slug}-${n}` : slug
    if (!h.id && !doc.getElementById(id)) h.id = id
  }
}

/** Scrolls a document frame's document to the element `fragment` names. False when it names nothing there. */
export const scrollToFragment = (doc: Document, fragment: string) => {
  const to = doc.getElementById(fragment)
  to?.scrollIntoView({ block: 'start' })
  return to !== null
}

/** `text` decoded, or undefined when it holds a % that starts no escape, which decoding it throws on. */
export const decoded = (text: string) => {
  try {
    return decodeURIComponent(text)
  } catch (err) {
    if (err instanceof URIError) return undefined
    throw err
  }
}

/**
 * Where a link pressed in a document frame goes: a `#fragment` of its own document, by id; one of the page's
 * locations, by its hash; a tab of its own; or nowhere, said why.
 */
export type LinkTo = { t: 'fragment'; id: string } | { t: 'page'; hash: string } | { t: 'tab' } | { t: 'refused'; why: string }

/**
 * The rule every document frame shares for a link's `href`: a `#fragment` names an element of the document, else is
 * refused; `here` places a link the view opens itself (another file of a shelf entry or of a worker's checkout),
 * when it answers; a link `safeHref` allows opens a tab of its own, unless it is relative to the document, which only
 * `here` can place; any other is refused.
 */
export const linkTo = (doc: Document, href: string, here: (href: string) => LinkTo | undefined): LinkTo => {
  if (href.startsWith('#')) {
    const id = decoded(href.slice(1))
    if (id === undefined) return { t: 'refused', why: 'it holds a % that starts no escape' }
    return !id || doc.getElementById(id) ? { t: 'fragment', id } : { t: 'refused', why: `#${id} names no heading in this document` }
  }
  const placed = here(href)
  if (placed) return placed
  if (relativeHref(href)) return { t: 'refused', why: `a relative link is followed only in a file of a worker's checkout or of a shelf entry` }
  if (safeHref(href)) return { t: 'tab' }
  return { t: 'refused', why: `the tower follows web and mail links, its own paths, and #links to this document's headings` }
}

const XLINK = 'http://www.w3.org/1999/xlink'

/**
 * What in a document could hold a document of its own, or send the frame elsewhere: a nested frame, which takes the
 * frame's sandbox but none of its links' rule; a `<base>`, which would move where every link resolves; a meta refresh.
 */
const UNCONTAINED = 'iframe, frame, object, embed, base, meta[http-equiv]'

/**
 * Empties what `UNCONTAINED` names in `root`, a part of a document frame's document not yet in it, so nothing it holds
 * loads: a frame's `src` and `srcdoc`, an object's `data`, an embed's `src`, and the base and meta elements whole.
 */
export const contain = (root: ParentNode) => {
  for (const el of root.querySelectorAll(UNCONTAINED)) {
    if (el.localName === 'base' || el.localName === 'meta') el.remove()
    else for (const name of ['src', 'srcdoc', 'data']) el.removeAttribute(name)
  }
}

/**
 * Writes where every link of `doc`, a document frame's, goes (`linkTo`), so pressing one needs nothing heard in the
 * frame: a fragment stays in the frame (written whole: a srcdoc resolves a bare `#` against the page's address), a page location takes the page there (`target="_top"`, the page's own address
 * written whole), a web link opens a tab, and a refused link loses its href, its title saying why. An SVG link's
 * `xlink:href` is read and written as its `href`.
 */
export function writeLinks(doc: Document, here: (href: string) => LinkTo | undefined) {
  nameHeadings(doc)
  for (const a of doc.querySelectorAll<HTMLAnchorElement | HTMLAreaElement | SVGAElement>('a, area')) {
    const href = a.getAttribute('href') ?? a.getAttributeNS(XLINK, 'href')
    if (href === null) continue
    a.removeAttributeNS(XLINK, 'href')
    const to = linkTo(doc, href, here)
    if (to.t === 'refused') {
      a.removeAttribute('href')
      a.removeAttribute('target')
      a.setAttribute('title', `${href} isn't opened: ${to.why}`)
      continue
    }
    a.setAttribute('href', to.t === 'fragment' ? `${doc.URL}#${encodeURIComponent(to.id)}` : to.t === 'page' ? new URL(to.hash, location.href).href : href)
    a.setAttribute('target', to.t === 'fragment' ? '_self' : to.t === 'page' ? '_top' : '_blank')
    if (to.t === 'tab') a.setAttribute('rel', 'noopener noreferrer')
  }
}
