import { relativeHref, safeHref } from '../shared/markdown.ts'

/**
 * What every document frame a core view draws does alike: a frame where nothing runs, which the view reaches into
 * (decision `markdown-safe`). Bundled into each view's module that draws one.
 */
/** A heading's slug, as GitHub names it: lowercased, its punctuation dropped, its spaces dashes. */
const slugOf = (text: string) => text.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-')

/**
 * Scrolls a document frame's document to what a fragment names: the element of that id, else the heading whose slug it
 * is, a repeated slug numbered `-1`, `-2` as GitHub numbers them. False when it names nothing there.
 */
export const scrollToFragment = (doc: Document, fragment: string) => {
  const counts = new Map<string, number>()
  const heading = [...doc.querySelectorAll('h1, h2, h3, h4, h5, h6')].find((h) => {
    const slug = slugOf(h.textContent ?? '')
    const n = counts.get(slug) ?? 0
    counts.set(slug, n + 1)
    return (n ? `${slug}-${n}` : slug) === fragment
  })
  const to = doc.getElementById(fragment) ?? heading
  to?.scrollIntoView({ block: 'start' })
  return to !== undefined && to !== null
}

/**
 * The one listener a document frame delegates (decision `markdown-safe`): a link pressed in it. A `#fragment` scrolls
 * this document to what it names; `here` takes a link the view opens in place (another file of a shelf entry or of a
 * worker's checkout), when it answers true; a link `safeHref` allows opens in a tab of its own, unless it is relative
 * to the document, which only `here` can place; any other is refused, said in a toast.
 */
export const followLink =
  (doc: Document, { here, toast }: { here: (href: string) => boolean; toast: (text: string) => void }) =>
  (e: MouseEvent) => {
    const a = (e.target as Element).closest<HTMLAnchorElement | HTMLAreaElement>('a[href], area[href]')
    const href = a?.getAttribute('href')
    if (!a || !href) return
    e.preventDefault()
    if (href.startsWith('#')) {
      const fragment = decodeURIComponent(href.slice(1))
      return void (scrollToFragment(doc, fragment) || toast(`#${fragment} names no heading in this document`))
    }
    if (here(href)) return
    if (relativeHref(href)) return toast(`${href} isn't opened: a relative link is followed only in a file of a worker's checkout or of a shelf entry`)
    if (safeHref(href)) return void window.open(a.href, '_blank', 'noopener,noreferrer')
    toast(`${href} isn't opened: the tower follows web and mail links, its own paths, and #links to this document's headings`)
  }
