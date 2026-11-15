/**
 * Morphs new html into an element's children, keeping every node the html still describes: a node that didn't change
 * is the same node after the morph, so what the browser holds in it (text typed, a caret, a selection, focus, scroll)
 * survives a redraw.
 *
 * Nodes are matched by id first, through the ids each subtree holds, then softly by tag, which among siblings without
 * ids is by position: a node that must stay itself while others are inserted, removed or reordered around it carries
 * an id. A node marked `data-owned`
 * belongs to someone other than the html (a mounted view, a framed document, a terminal, a custom element keeping its
 * own state): the morph leaves it whole, and with `data-owned="children"` it updates the node's attributes and leaves
 * its children. Ids below an owned node take no part in matching. An owned node is matched by its id, or, having none,
 * only by a new node marked owned too. A mark of any other value, in the old content or the new, is refused before
 * anything changes. An id repeated in either content is matched by position, as if it were absent.
 *
 * The algorithm is Datastar's morph (`library/src/plugins/watchers/patchElements.ts`, itself a port of idiomorph), with
 * idiomorph's focus and selection restore, its stop at the focused element when scanning for a match, and its
 * attribute copy by node.
 *
 * Datastar, https://github.com/starfederation/datastar:
 *
 *   Copyright © Star Federation
 *
 *   Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
 *   documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
 *   rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 *   permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 *   The above copyright notice and this permission notice shall be included in all copies or substantial portions of
 *   the Software.
 *
 *   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
 *   WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 *   COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
 *   OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 *
 * idiomorph, https://github.com/bigskysoftware/idiomorph, Zero-Clause BSD:
 *
 *   Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby
 *   granted.
 *
 *   THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL
 *   IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
 *   INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN
 *   AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
 *   PERFORMANCE OF THIS SOFTWARE.
 */

/** The attribute that marks a node as owned: empty for the node whole, `children` for its children only. */
const OWNED = 'data-owned'

/** One morph's working state: which ids persist from the old content into the new, and which subtrees hold them. */
type Morph = {
  doc: Document
  /** Each element holding persistent ids, old or new, to the ids in its subtree. */
  idMap: Map<Node, Set<string>>
  /** The old element of each persistent id. */
  idElements: Map<string, Element>
  /** The ids found once in the old content and once in the new, on elements of the same tag: a repeated id is matched by position. */
  persistentIds: Set<string>
  /** Where old nodes holding persistent ids wait, still in the document, until the new content claims them. */
  pantry: HTMLElement
  /** The element that has focus, if it is inside the morphed root. */
  active: Element | null
  move: (parent: Node, node: Node, before: Node | null) => void
}

/** A text box's focus and selection, kept across the morph by the box's id. */
type Focus = { box: HTMLInputElement | HTMLTextAreaElement; start: number; end: number }

/**
 * Makes `root`'s children what `html` describes, changing only what differs. `root` itself keeps its attributes, and is
 * morphed even when it is owned, since whoever morphs it is its owner.
 */
export function morph(root: Element | ShadowRoot, html: string): void {
  const doc = root.ownerDocument
  const template = doc.createElement('template')
  template.innerHTML = html
  const focus = focusOf(root)
  const ctx = morphOf(root, template.content)
  doc.body.insertAdjacentElement('afterend', ctx.pantry)
  try {
    morphChildren(ctx, root, template.content)
  } finally {
    ctx.pantry.remove()
  }
  restoreFocus(root, focus)
}

const elementId = (el: Element): string => el.getAttribute('id') ?? ''

const isElement = (node: Node): node is Element => node.nodeType === Node.ELEMENT_NODE

/** Whether `el` is owned: the node whole, its children only, or not at all. */
function ownershipOf(el: Element): 'whole' | 'children' | undefined {
  const mark = el.getAttribute(OWNED)
  if (mark === null) return undefined
  if (mark === '') return 'whole'
  if (mark === 'children') return 'children'
  throw new Error(`${OWNED}="${mark}" on <${el.localName}>: an owned node is marked ${OWNED} (the node whole) or ${OWNED}="children"`)
}

/** Whether an owned node between `el` and `root` keeps `el` out of the morph. */
function isBelowOwned(el: Element, root: Node): boolean {
  const owner = el.parentElement?.closest(`[${OWNED}]`)
  return !!owner && owner !== root && root.contains(owner)
}

const activeOf = (root: Element | ShadowRoot) => (root.getRootNode() as Document | ShadowRoot).activeElement

function focusOf(root: Element | ShadowRoot): Focus | undefined {
  const box = activeOf(root)
  if (!(box instanceof HTMLInputElement || box instanceof HTMLTextAreaElement) || !root.contains(box)) return undefined
  if (box.selectionStart === null || box.selectionEnd === null) return undefined
  return { box, start: box.selectionStart, end: box.selectionEnd }
}

/**
 * Gives focus back to a text box that lost it, found again by its id (a box that moved without `moveBefore` is
 * blurred), and its selection to a box that kept its id but lost it.
 */
function restoreFocus(root: Element | ShadowRoot, focus: Focus | undefined) {
  if (!focus) return
  const id = elementId(focus.box)
  let box: Element | null = focus.box
  const active = activeOf(root)
  if (id && (!active || elementId(active) !== id)) {
    box = root.querySelector(`[id="${CSS.escape(id)}"]`)
    if (box instanceof HTMLElement) box.focus({ preventScroll: true })
  }
  if (!(box instanceof HTMLInputElement || box instanceof HTMLTextAreaElement) || box.selectionStart === null) return
  if (!box.selectionEnd && focus.end) box.setSelectionRange(focus.start, focus.end)
}

/** The ids that persist from `root`'s content into `next`, and the subtrees that hold them. */
function morphOf(root: Element | ShadowRoot, next: DocumentFragment): Morph {
  const doc = root.ownerDocument
  const pantry = doc.createElement('div')
  pantry.hidden = true
  const active = activeOf(root)
  const moves = root.isConnected && 'moveBefore' in Element.prototype
  const ctx: Morph = {
    doc,
    idMap: new Map(),
    idElements: new Map(),
    persistentIds: new Set(),
    pantry,
    active: active && root.contains(active) ? active : null,
    move: moves
      ? (parent, node, before) => (parent as ParentNode & { moveBefore(node: Node, child: Node | null): void }).moveBefore(node, before)
      : (parent, node, before) => parent.insertBefore(node, before),
  }
  for (const el of readMarks(root)) ownershipOf(el)
  for (const el of readMarks(next)) ownershipOf(el)

  const oldIdElements = [...root.querySelectorAll('[id]')].filter((el) => !isBelowOwned(el, root))
  const newIdElements = [...next.querySelectorAll('[id]')].filter((el) => !isBelowOwned(el, next))
  const oldOnce = idsOnce(oldIdElements)
  for (const [id, el] of idsOnce(newIdElements)) {
    const old = oldOnce.get(id)
    if (!old || old.tagName !== el.tagName) continue
    ctx.persistentIds.add(id)
    ctx.idElements.set(id, old)
  }

  populateIdMap(ctx, root, oldIdElements)
  populateIdMap(ctx, next, newIdElements)
  return ctx
}

/** The owned marks the morph reads below `root`: those inside an owned node are its owner's. */
const readMarks = (root: Element | ShadowRoot | DocumentFragment) => [...root.querySelectorAll(`[${OWNED}]`)].filter((el) => !isBelowOwned(el, root))

/** Each id found on exactly one of `elements`, to its element: a repeated id is matched by position, never by id. */
function idsOnce(elements: Element[]): Map<string, Element> {
  const seen = new Map<string, Element | null>()
  for (const el of elements) {
    const id = elementId(el)
    if (id) seen.set(id, seen.has(id) ? null : el)
  }
  return new Map([...seen].filter((entry): entry is [string, Element] => entry[1] !== null))
}

/**
 * Adds each persistent id to the id set of every ancestor of its element, up to `root`. Ids that don't persist are
 * left out, since nothing in the other content can match them.
 */
function populateIdMap(ctx: Morph, root: Node, elements: Iterable<Element>) {
  for (const el of elements) {
    const id = elementId(el)
    if (!ctx.persistentIds.has(id)) continue
    for (let current: Element | null = el; current && current !== root; current = current.parentElement) {
      const ids = ctx.idMap.get(current) ?? new Set<string>()
      ctx.idMap.set(current, ids)
      ids.add(id)
    }
  }
}

/**
 * Matches `newParent`'s children against `oldParent`'s, greedily and in order: a match at or after the insertion point
 * is morphed there and the old nodes before it removed; a persistent id found elsewhere is moved here; anything else is
 * inserted. Old nodes left over are removed.
 */
function morphChildren(ctx: Morph, oldParent: Node, newParent: Node) {
  let insertionPoint = oldParent.firstChild

  for (const newChild of newParent.childNodes) {
    if (insertionPoint) {
      const bestMatch = findBestMatch(ctx, newChild, insertionPoint)
      if (bestMatch) {
        for (let cursor = insertionPoint; cursor !== bestMatch;) {
          const passed: Node = cursor
          cursor = cursor.nextSibling!
          removeNode(ctx, passed)
        }
        morphNode(ctx, bestMatch, newChild)
        insertionPoint = bestMatch.nextSibling
        continue
      }
    }

    const newChildId = isElement(newChild) ? elementId(newChild) : ''
    if (ctx.persistentIds.has(newChildId)) {
      const movedChild = ctx.idElements.get(newChildId)!
      // Its old ancestors no longer hold it: left holding the id, they would be kept in the pantry instead of removed.
      for (let current = movedChild.parentNode; current; current = current.parentNode) {
        const ids = ctx.idMap.get(current)
        if (!ids) continue
        ids.delete(newChildId)
        if (!ids.size) ctx.idMap.delete(current)
      }
      ctx.move(oldParent, movedChild, insertionPoint)
      morphNode(ctx, movedChild, newChild)
      insertionPoint = movedChild.nextSibling
      continue
    }

    if (ctx.idMap.has(newChild)) {
      // Holds persistent ids: an empty element of its kind is morphed into it, so the old nodes it holds move in.
      const newElement = newChild as Element
      const empty = ctx.doc.createElementNS(newElement.namespaceURI, newElement.localName)
      oldParent.insertBefore(empty, insertionPoint)
      morphNode(ctx, empty, newChild)
      insertionPoint = empty.nextSibling
    } else {
      const copy = ctx.doc.importNode(newChild, true)
      oldParent.insertBefore(copy, insertionPoint)
      insertionPoint = copy.nextSibling
    }
  }

  while (insertionPoint) {
    const left = insertionPoint
    insertionPoint = insertionPoint.nextSibling
    removeNode(ctx, left)
  }
}

/**
 * The old node from `startPoint` on that `node` should morph into: the first that shares a persistent id with it, else
 * the first soft match that holds no persistent id of its own. The scan stops once it would displace more persistent
 * ids than `node` holds, at the element holding focus (matching past it would move it to the pantry and blur it), and
 * gives up on a soft match once two of `node`'s next siblings soft match ahead of it, so content prepended doesn't
 * churn what follows.
 */
function findBestMatch(ctx: Morph, node: Node, startPoint: Node): Node | null {
  let bestMatch: Node | null | undefined = null
  let nextSibling = node.nextSibling
  let siblingSoftMatchCount = 0
  let displaceMatchCount = 0
  const newIds = ctx.idMap.get(node)
  const nodeMatchCount = newIds?.size ?? 0

  for (let cursor: Node | null = startPoint; cursor; cursor = cursor.nextSibling) {
    if (isSoftMatch(cursor, node)) {
      const oldIds = ctx.idMap.get(cursor)
      if (newIds && oldIds && [...oldIds].some((id) => newIds.has(id))) return cursor
      if (!bestMatch && !oldIds) {
        if (!nodeMatchCount) return cursor
        bestMatch = cursor
      }
    }

    displaceMatchCount += ctx.idMap.get(cursor)?.size ?? 0
    if (displaceMatchCount > nodeMatchCount) break

    if (bestMatch === null && nextSibling && isSoftMatch(cursor, nextSibling)) {
      siblingSoftMatchCount++
      nextSibling = nextSibling.nextSibling
      if (siblingSoftMatchCount >= 2) bestMatch = undefined
    }

    if (ctx.active && cursor.contains(ctx.active)) break
  }

  return bestMatch || null
}

/**
 * Whether `oldNode` may take `newNode`'s place: the same kind of node and tag, and an id on the old element only when
 * the new one has the same. An anonymous new element can take an old one's place, since a new node holds no state to
 * lose. An owned element without an id is taken only by a new element marked owned too.
 */
function isSoftMatch(oldNode: Node, newNode: Node): boolean {
  if (oldNode.nodeType !== newNode.nodeType) return false
  if (!isElement(oldNode)) return true
  const newElement = newNode as Element
  if (oldNode.tagName !== newElement.tagName) return false
  const id = elementId(oldNode)
  if (id) return id === elementId(newElement)
  return !oldNode.hasAttribute(OWNED) || newElement.hasAttribute(OWNED)
}

/** Removes an old node, or keeps it in the pantry when it holds persistent ids the new content will claim. */
function removeNode(ctx: Morph, node: Node) {
  if (ctx.idMap.has(node)) ctx.move(ctx.pantry, node, null)
  else node.parentNode!.removeChild(node)
}

/** Brings `oldNode` to what `newNode` is: an element's form state, attributes and children, a text's or comment's text. */
function morphNode(ctx: Morph, oldNode: Node, newNode: Node) {
  if (isElement(oldNode)) {
    const newElement = newNode as Element
    const ownership = ownershipOf(oldNode)
    if (ownership === 'whole') return
    syncFormState(oldNode, newElement)
    syncAttributes(oldNode, newElement)
    if (ownership === 'children') return
    if (oldNode instanceof HTMLTemplateElement && newElement instanceof HTMLTemplateElement) {
      oldNode.innerHTML = newElement.innerHTML
    } else if (!oldNode.isEqualNode(newElement)) {
      morphChildren(ctx, oldNode, newElement)
    }
    return
  }
  if (oldNode.nodeValue !== newNode.nodeValue) oldNode.nodeValue = newNode.nodeValue
}

/**
 * Sets a form control's live state only where the rendered html changed: an input's value when its `value` attribute
 * did, a textarea's when its text did, a checked, disabled or selected flag when its attribute came or went. What the
 * viewer typed or ticked stays while the html says the same.
 */
function syncFormState(oldElement: Element, newElement: Element) {
  if (oldElement instanceof HTMLInputElement && newElement instanceof HTMLInputElement && newElement.type !== 'file') {
    const value = newElement.getAttribute('value')
    if (oldElement.getAttribute('value') !== value) oldElement.value = value ?? ''
    syncFlag(oldElement, newElement, 'checked')
    syncFlag(oldElement, newElement, 'disabled')
  } else if (oldElement instanceof HTMLTextAreaElement && newElement instanceof HTMLTextAreaElement) {
    if (oldElement.defaultValue !== newElement.value) oldElement.value = newElement.value
  } else if (oldElement instanceof HTMLOptionElement && newElement instanceof HTMLOptionElement) {
    syncFlag(oldElement, newElement, 'selected')
  }
}

function syncFlag<K extends 'checked' | 'disabled' | 'selected'>(oldElement: Element & Record<K, boolean>, newElement: Element, name: K) {
  const has = newElement.hasAttribute(name)
  if (oldElement.hasAttribute(name) !== has) (oldElement as Record<K, boolean>)[name] = has
}

/** Copies each attribute as a node, which keeps its namespace and takes names `setAttribute` rejects (`@click`). */
function syncAttributes(oldElement: Element, newElement: Element) {
  for (const attribute of newElement.attributes) {
    if (oldElement.getAttribute(attribute.name) !== attribute.value) oldElement.setAttributeNode(attribute.cloneNode() as Attr)
  }
  for (const attribute of [...oldElement.attributes]) {
    if (!newElement.hasAttribute(attribute.name)) oldElement.removeAttributeNode(attribute)
  }
}
