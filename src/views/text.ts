import { esc } from '/lib/words.js'
import { textLines } from '../shared/source-lines.ts'
import { bodyText, type Body, type Drawn, frameDoc, typeView } from '../shared/view-item.ts'
import { frameSource, offsetIn, PASSAGE_RULES, pickPassages, type Picks } from '../shared/view-passages.ts'

/**
 * `tower/text`, the view of text drawn as written, in a document frame where nothing runs, from the design's tokens;
 * links open a tab of their own. Text picked in it is a `passage` of the subject drawn (`pickPassages`), its lines
 * the file's own, and its words keep their indentation: what the frame draws is the file as written.
 */

const RULES = `& .text-split { position: relative; flex: 1; min-width: 0; display: flex; }
  & .text-split > iframe { flex: 1; min-width: 0; }
  ${PASSAGE_RULES}`

async function draw(el: HTMLElement, at: Body): Promise<Drawn | undefined> {
  const text = await bodyText(el, at)
  if (text === undefined || at.stale()) return
  el.innerHTML = `<div class="text-split"><iframe title="${esc(at.title)}" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"></iframe></div>`
  const split = el.querySelector<HTMLElement>('.text-split')!
  const frame = split.querySelector('iframe')!
  let picks: Picks | undefined
  let closed = false
  let seen = true
  frame.addEventListener('load', function bind() {
    frame.removeEventListener('load', bind)
    const doc = frame.contentDocument
    if (closed || !doc) return
    const pre = doc.createElement('pre')
    pre.className = 'item-text'
    pre.textContent = text
    doc.querySelector('article')!.append(pre)
    picks = pickPassages(
      frame,
      split,
      at.kit,
      at.subject,
      frameSource(frame, (_, range) => {
        const [from, to] = [offsetIn(pre, range.startContainer, range.startOffset), offsetIn(pre, range.endContainer, range.endOffset)]
        const picked = text.slice(from, to)
        const [start, end] = [from + (picked.length - picked.replace(/^\n+/, '').length), to - (picked.length - picked.replace(/\s+$/, '').length)]
        return { quote: text.slice(start, end), ...textLines(text, start, end) }
      }),
    )
    if (!seen) picks.visible(false)
  })
  frame.srcdoc = frameDoc(at.tower, at.docCss, '<base target="_blank"><article></article>')
  return {
    update: () => picks?.update(),
    visible: (on) => ((seen = on), picks?.visible(on)),
    close: () => ((closed = true), picks?.close()),
  }
}

export const mount = typeView({ id: 'tower/text', rules: RULES, draw, restyled: true })
