/**
 * The morph's contract as cases that run in a browser page (`scripts/morph-check.ts`): focus, carets and selections
 * exist only in a real one. Each case draws its starting html into the work area, acts as a viewer would, morphs, and
 * throws on what it finds otherwise.
 */
import { morph } from '../src/shared/morph.ts'

export type CaseResult = { name: string; error?: string }

type Case = { name: string; run: (work: HTMLElement) => void }

function check(holds: boolean, what: string): asserts holds {
  if (!holds) throw new Error(what)
}

const childrenOf = (el: Element) => [...el.children]

const one = <T extends Element>(work: HTMLElement, css: string) => {
  const found = work.querySelector<T>(css)
  check(!!found, `nothing matches ${css}`)
  return found
}

function selectionIs(box: HTMLInputElement | HTMLTextAreaElement, start: number, end: number) {
  check(document.activeElement === box, `focus is on ${document.activeElement?.outerHTML ?? 'nothing'}, not the box`)
  check(box.selectionStart === start && box.selectionEnd === end, `the selection is ${box.selectionStart}–${box.selectionEnd}, not ${start}–${end}`)
}

const CASES: Case[] = [
  {
    name: 'keeps the nodes that did not change',
    run(work) {
      work.innerHTML = '<p>a</p><p>b</p>'
      const [a, b] = childrenOf(work)
      morph(work, '<p>a</p><p>b</p><p>c</p>')
      const [a2, b2, c] = childrenOf(work)
      check(a2 === a && b2 === b, 'an unchanged paragraph was replaced')
      check(c?.textContent === 'c', 'the new paragraph is missing')
    },
  },
  {
    name: 'changes text in place',
    run(work) {
      work.innerHTML = '<p>one</p>'
      const p = one(work, 'p')
      const text = p.firstChild
      morph(work, '<p>two</p>')
      check(work.firstElementChild === p && p.firstChild === text, 'the paragraph or its text node was replaced')
      check(p.textContent === 'two', `the text is "${p.textContent}"`)
    },
  },
  {
    name: 'keeps the namespace of an attribute',
    run(work) {
      work.innerHTML = '<svg><use></use></svg>'
      morph(work, '<svg><use xlink:href="#a"></use></svg>')
      const href = one(work, 'use').getAttributeNS('http://www.w3.org/1999/xlink', 'href')
      check(href === '#a', `the use's xlink:href is ${href}`)
    },
  },
  {
    name: 'adds, changes and removes attributes in place',
    run(work) {
      work.innerHTML = '<a href="/x" class="a" title="t">x</a>'
      const a = one<HTMLAnchorElement>(work, 'a')
      morph(work, '<a href="/y" class="a" data-k="1">x</a>')
      check(work.firstElementChild === a, 'the link was replaced')
      check(a.getAttribute('href') === '/y' && a.dataset.k === '1' && !a.hasAttribute('title'), `the link is ${a.outerHTML}`)
    },
  },
  {
    name: 'takes attribute names setAttribute rejects',
    run(work) {
      work.innerHTML = '<button>go</button>'
      morph(work, '<button @click="go" :x="1">go</button>')
      const button = one(work, 'button')
      check(button.getAttribute('@click') === 'go' && button.getAttribute(':x') === '1', `the button is ${button.outerHTML}`)
    },
  },
  {
    name: 'keeps every node with an id when content is prepended',
    run(work) {
      work.innerHTML = '<ul><li id="a">a</li><li id="b">b</li><li id="c">c</li></ul>'
      const ul = one(work, 'ul')
      const was = childrenOf(ul)
      morph(work, '<ul><li id="new">new</li><li id="a">a</li><li id="b">b</li><li id="c">c</li></ul>')
      const now = childrenOf(ul)
      check(now.length === 4 && now[0]!.id === 'new', `the list is ${ul.outerHTML}`)
      check(now.slice(1).every((li, i) => li === was[i]), 'an item after the prepended one was replaced')
    },
  },
  {
    name: 'removes a node with an id from the middle',
    run(work) {
      work.innerHTML = '<p id="a">a</p><p id="b">b</p><p id="c">c</p>'
      const [a, , c] = childrenOf(work)
      morph(work, '<p id="a">a</p><p id="c">c</p>')
      const now = childrenOf(work)
      check(now.length === 2 && now[0] === a && now[1] === c, `the work area is ${work.innerHTML}`)
    },
  },
  {
    name: 'matches nodes without ids by position',
    run(work) {
      work.innerHTML = '<p>a</p><p>b</p><p>c</p>'
      const [first, second] = childrenOf(work)
      morph(work, '<p>a</p><p>c</p>')
      const now = childrenOf(work)
      check(now.length === 2 && now[0] === first && now[1] === second && second!.textContent === 'c', `the work area is ${work.innerHTML}`)
    },
  },
  {
    name: 'reorders nodes by id',
    run(work) {
      work.innerHTML = '<p id="a">a</p><p id="b">b</p><p id="c">c</p>'
      const [a, b, c] = childrenOf(work)
      morph(work, '<p id="c">c</p><p id="a">a</p><p id="b">b</p>')
      const now = childrenOf(work)
      check(now[0] === c && now[1] === a && now[2] === b, `the work area is ${work.innerHTML}`)
    },
  },
  {
    name: 'moves a node by id to another parent',
    run(work) {
      work.innerHTML = '<div id="l"><span id="s">x</span></div><div id="r"></div>'
      const span = one(work, '#s')
      morph(work, '<div id="l"></div><div id="r"><span id="s">x</span></div>')
      check(one(work, '#s') === span, 'the span was replaced')
      check(span.parentElement === one(work, '#r'), 'the span is not in its new parent')
    },
  },
  {
    name: 'moves a node by id into a parent that did not exist',
    run(work) {
      work.innerHTML = '<p><span id="s">x</span></p>'
      const span = one(work, '#s')
      morph(work, '<section><div><span id="s">x</span></div></section>')
      check(one(work, '#s') === span, 'the span was replaced')
      check(work.innerHTML === '<section><div><span id="s">x</span></div></section>', `the work area is ${work.innerHTML}`)
    },
  },
  {
    name: 'replaces an element whose id changed',
    run(work) {
      work.innerHTML = '<p id="a">x</p>'
      const a = one(work, 'p')
      morph(work, '<p id="b">x</p>')
      check(work.firstElementChild !== a && work.firstElementChild?.id === 'b', `the work area is ${work.innerHTML}`)
    },
  },
  {
    name: 'keeps text typed in an input until the html changes its value',
    run(work) {
      work.innerHTML = '<p>a</p><input value="x">'
      const input = one<HTMLInputElement>(work, 'input')
      input.value = 'typed'
      morph(work, '<p>b</p><input value="x">')
      const kept = input.value
      check(work.querySelector('input') === input && kept === 'typed', `the input holds "${kept}"`)
      morph(work, '<p>b</p><input value="y">')
      check(input.value === 'y', `the input holds "${input.value}" after its value changed`)
    },
  },
  {
    name: 'keeps text typed in a textarea until the html changes its text',
    run(work) {
      work.innerHTML = '<p>a</p><textarea>x</textarea>'
      const area = one<HTMLTextAreaElement>(work, 'textarea')
      area.value = 'typed'
      morph(work, '<p>b</p><textarea>x</textarea>')
      const kept = area.value
      check(work.querySelector('textarea') === area && kept === 'typed', `the textarea holds "${kept}"`)
      morph(work, '<p>b</p><textarea>y</textarea>')
      check(area.value === 'y', `the textarea holds "${area.value}" after its text changed`)
    },
  },
  {
    name: 'keeps a ticked checkbox until the html changes it',
    run(work) {
      work.innerHTML = '<input type="checkbox">'
      const box = one<HTMLInputElement>(work, 'input')
      box.click()
      morph(work, '<input type="checkbox">')
      check(box.checked, 'the tick was lost')
      morph(work, '<input type="checkbox" checked>')
      box.click()
      morph(work, '<input type="checkbox" checked>')
      check(!box.checked, 'an untick was undone by html that did not change')
      morph(work, '<input type="checkbox">')
      check(!box.checked, 'the html unticking it left it ticked')
    },
  },
  {
    name: 'keeps focus and caret in an input while its siblings change',
    run(work) {
      work.innerHTML = '<p>head</p><input id="q" value="hello">'
      const input = one<HTMLInputElement>(work, 'input')
      input.focus()
      input.setSelectionRange(1, 3)
      morph(work, '<p>head 2</p><p>new</p><input id="q" value="hello">')
      check(work.querySelector('input') === input, 'the input was replaced')
      selectionIs(input, 1, 3)
    },
  },
  {
    name: 'keeps focus and caret in a textarea without an id',
    run(work) {
      work.innerHTML = '<div class="a">x</div><textarea data-note-text></textarea>'
      const area = one<HTMLTextAreaElement>(work, 'textarea')
      area.focus()
      area.value = 'abcdef'
      area.setSelectionRange(2, 4)
      morph(work, '<div class="a">y</div><textarea data-note-text></textarea><p>after</p>')
      check(work.querySelector('textarea') === area && area.value === 'abcdef', `the textarea holds "${area.value}"`)
      selectionIs(area, 2, 4)
    },
  },
  {
    name: 'keeps focus when the focused input swaps places with a sibling',
    run(work) {
      work.innerHTML = '<input id="focused" value="abc"><input id="other">'
      const input = one<HTMLInputElement>(work, '#focused')
      input.focus()
      input.setSelectionRange(1, 2)
      morph(work, '<input id="other"><input id="focused" value="abc">')
      check(work.querySelector('#focused') === input && work.lastElementChild === input, `the work area is ${work.innerHTML}`)
      selectionIs(input, 1, 2)
    },
  },
  {
    name: 'keeps a focused box without an id in place while an id moves past it',
    run(work) {
      work.innerHTML = '<div><input value="abc"></div><p id="x">x</p>'
      const input = one<HTMLInputElement>(work, 'input')
      input.focus()
      input.setSelectionRange(0, 2)
      morph(work, '<p id="x">x</p><div><input value="abc"></div>')
      check(work.querySelector('input') === input && work.lastElementChild?.contains(input) === true, `the work area is ${work.innerHTML}`)
      selectionIs(input, 0, 2)
    },
  },
  {
    name: 'gives focus and caret back to an input moved to another parent',
    run(work) {
      work.innerHTML = '<div id="a"><input id="q" value="hello"></div><div id="b"></div>'
      const input = one<HTMLInputElement>(work, '#q')
      input.focus()
      input.setSelectionRange(2, 4)
      morph(work, '<div id="a"></div><div id="b"><input id="q" value="hello"></div>')
      check(one(work, '#b').firstElementChild === input, 'the input was replaced or not moved')
      selectionIs(input, 2, 4)
    },
  },
  {
    name: 'keeps a text selection in a paragraph that did not change',
    run(work) {
      work.innerHTML = '<p id="keep">select me</p><p>other</p>'
      const text = one(work, '#keep').firstChild!
      const selection = getSelection()!
      selection.setBaseAndExtent(text, 0, text, 6)
      morph(work, '<p id="keep">select me</p><p>other 2</p><p>more</p>')
      check(selection.anchorNode === text && selection.toString() === 'select', `the selection is "${selection.toString()}"`)
    },
  },
  {
    name: 'leaves an owned node whole',
    run(work) {
      work.innerHTML = '<div id="t" data-owned></div><p>x</p>'
      const owned = one(work, '#t')
      owned.innerHTML = '<span>mounted</span>'
      owned.className = 'live'
      const mounted = owned.firstChild
      morph(work, '<div id="t" data-owned class="drawn"></div><p>y</p>')
      check(work.firstElementChild === owned && owned.firstChild === mounted, 'the owned node or its children were replaced')
      check(owned.className === 'live', `the owned node's class is "${owned.className}"`)
      check(work.lastElementChild?.textContent === 'y', 'the sibling was not morphed')
    },
  },
  {
    name: "updates an owned node's attributes and leaves its children",
    run(work) {
      work.innerHTML = '<div id="t" data-owned="children"></div>'
      const owned = one(work, '#t')
      owned.innerHTML = '<span>mounted</span>'
      const mounted = owned.firstChild
      morph(work, '<div id="t" data-owned="children" class="drawn"><b>drawn</b></div>')
      check(owned.className === 'drawn', `the owned node's class is "${owned.className}"`)
      check(owned.childNodes.length === 1 && owned.firstChild === mounted, `the owned node holds ${owned.innerHTML}`)
    },
  },
  {
    name: 'keeps ids below an owned node out of matching',
    run(work) {
      work.innerHTML = '<div id="t" data-owned><span id="s">mine</span></div>'
      const mine = one(work, '#s')
      morph(work, '<div id="t" data-owned></div><span id="s">drawn</span>')
      check(mine.parentElement === one(work, '#t') && mine.textContent === 'mine', 'the owned span was taken out of its owner')
      check(work.lastElementChild !== mine && work.lastElementChild?.textContent === 'drawn', `the work area is ${work.innerHTML}`)
    },
  },
  {
    name: 'matches an owned node without an id only to a node marked owned',
    run(work) {
      work.innerHTML = '<div data-owned><span>mounted</span></div><div>text</div>'
      const [, text] = childrenOf(work)
      morph(work, '<div>text 2</div>')
      check(work.children.length === 1 && work.firstElementChild === text && text!.textContent === 'text 2', `the work area is ${work.innerHTML}`)

      work.innerHTML = '<div data-owned><span>mounted</span></div>'
      const owned = work.firstElementChild!
      const mounted = owned.firstChild
      morph(work, '<div>new</div><div data-owned></div>')
      check(work.lastElementChild === owned && owned.firstChild === mounted, `the owned node was not kept: ${work.innerHTML}`)
    },
  },
  {
    name: 'morphs a root it is given even when the root is owned',
    run(work) {
      work.setAttribute('data-owned', '')
      work.innerHTML = '<p>a</p>'
      const p = one(work, 'p')
      morph(work, '<p>b</p>')
      check(work.firstElementChild === p && p.textContent === 'b', `the work area is ${work.innerHTML}`)
    },
  },
  {
    name: 'refuses an owned mark it does not know',
    run(work) {
      work.innerHTML = '<div data-owned="mine">x</div>'
      let error: unknown
      try {
        morph(work, '<div data-owned="mine">y</div>')
      } catch (err) {
        error = err
      }
      check(error instanceof Error && error.message.includes('data-owned="children"'), `the morph threw ${String(error)}`)
    },
  },
  {
    name: 'morphs svg in place and creates svg in its namespace',
    run(work) {
      work.innerHTML = '<svg><circle r="1"></circle></svg>'
      const circle = one(work, 'circle')
      morph(work, '<svg><circle r="2"></circle><rect width="1"></rect></svg>')
      check(one(work, 'circle') === circle && circle.getAttribute('r') === '2', `the svg is ${work.innerHTML}`)
      check(one(work, 'rect').namespaceURI === 'http://www.w3.org/2000/svg', 'the new rect is not an svg element')
    },
  },
  {
    name: 'refuses an unknown owned mark in the html that introduces it',
    run(work) {
      let error: unknown
      try {
        morph(work, '<div data-owned="mine">y</div>')
      } catch (err) {
        error = err
      }
      check(error instanceof Error, `the morph accepted it: ${work.innerHTML}`)
    },
  },
  {
    name: 'leaves the content untouched when it refuses an owned mark',
    run(work) {
      work.innerHTML = '<p>a</p><div data-owned="mine">x</div>'
      try {
        morph(work, '<p>b</p><div data-owned="mine">y</div>')
      } catch {}
      check(work.innerHTML === '<p>a</p><div data-owned="mine">x</div>', `the work area was half morphed: ${work.innerHTML}`)
    },
  },
  {
    name: 'draws every element of html whose id repeats with another tag',
    run(work) {
      work.innerHTML = '<p id="x">p</p>'
      morph(work, '<div id="x">d</div><p id="x">p</p>')
      check(work.innerHTML === '<div id="x">d</div><p id="x">p</p>', `the work area is ${work.innerHTML}`)
    },
  },
]

/** Runs every case in `work`, each from an empty work area with nothing focused or selected. */
export function runCases(work: HTMLElement): CaseResult[] {
  return CASES.map(({ name, run }) => {
    work.replaceChildren()
    work.removeAttribute('data-owned')
    ;(document.activeElement as HTMLElement | null)?.blur()
    getSelection()!.removeAllRanges()
    try {
      run(work)
      return { name }
    } catch (err) {
      return { name, error: err instanceof Error ? err.message : String(err) }
    }
  })
}
