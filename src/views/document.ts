import { relativeHref } from '../shared/markdown.ts'
import { fileSubject, linkedFile, type CheckoutFile } from '../shared/subjects.ts'
import type { Kit } from '../shared/views.ts'
import { decoded, linkTo, NO_HREF, scrollToFragment, type LinkTo } from './frame.ts'
import { bodyText, typeView, type Body, type Drawn } from './item.ts'
import { drawSections, SECTIONS_RULES } from './sections.ts'

/**
 * `tower/document`, the markdown view, of a kept item or a showing: the document drawn by sections (`drawSections`),
 * each a viewer subject of the item or showing with its commands in a gutter beside the frame. A file of a worker's
 * checkout opens at its `fragment`, and its relative links go to what they name (`linkedFrom`).
 */

/**
 * Where a link relative to `from`, a file of a worker's checkout, goes: another file or folder of its repo, displayed
 * where the page puts a file of a card (a view that `shows` it, such as a Files tab) at the link's fragment, by the
 * hash `kit.href` gives it, refused where the renderer lends none; a fragment of `from` itself, in the frame; a path
 * climbing out of the repo, refused.
 */
const linkedFrom = (doc: Document, from: CheckoutFile, kit: Kit) => (href: string): LinkTo | undefined => {
  if (!relativeHref(href)) return undefined
  if (decoded(href) === undefined) return { t: 'refused', why: 'it holds a % that starts no escape' }
  const to = linkedFile(from, href)
  if (!to) return { t: 'refused', why: `it leads out of the repo ${from.repo}: a link in a worker's file opens only what its checkout holds` }
  if (to.path === from.path) return linkTo(doc, `#${href.split(/#(.*)/s)[1] ?? ''}`, () => undefined)
  if (!kit.href) return { t: 'refused', why: NO_HREF }
  return { t: 'page', hash: kit.href(fileSubject(to)) }
}

async function draw(el: HTMLElement, at: Body): Promise<Drawn | undefined> {
  const text = await bodyText(el, at)
  if (text === undefined || at.stale()) return
  const { tower, kit, subject, title, url, docCss } = at
  const file = subject.kind === 'file' ? (subject.value as CheckoutFile) : undefined
  return drawSections(el, {
    tower,
    kit,
    of: subject,
    text,
    url,
    title,
    docCss,
    links: (doc) => (file ? linkedFrom(doc, file, kit) : () => undefined),
    opened: (doc) => void (file?.fragment && !scrollToFragment(doc, file.fragment) && kit.toast(`#${file.fragment} names no heading in ${file.path}`)),
  })
}

export const mount = typeView({ id: 'tower/document', rules: SECTIONS_RULES, draw, restyled: true })
