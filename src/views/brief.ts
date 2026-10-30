import type { Card } from '../bridge/board.ts'
import type { Brief } from '../bridge/turns.ts'
import { addedActions } from '../shared/adds.ts'
import { BRIEF_MARKDOWN_KEY, briefCss, briefHtml, expandedSaid, openFolds, saidOf, saidText, type BriefMarkdown } from '../shared/brief.ts'
import { can, conversationSubject, esc } from '../shared/cards.ts'
import { fenceText, markdownCss, markdownHtml } from '../shared/markdown.ts'
import { drawPanel } from '../shared/panel-kit.ts'
import { saidSubject, type Subject } from '../shared/subjects.ts'
import type { Mount, Tab } from '../shared/views.ts'

/**
 * A worker's brief: its earlier sessions folded, then its session's conversations, each turn's prompt and answer, the
 * latest at the bottom, in the viewer's markdown. Read again as its conversations change; kept at the end while the
 * viewer reads there. Each conversation's heading holds what extensions add to it (`conversation.head`). Each prompt
 * and answer drawn is a viewer subject on the page's bus (`said`), and holds the commands offered on it beside its copy
 * (`said.acts`).
 */

const ID = 'tower/brief'

const CSS = `:where([data-view="${ID}"]) {
  position: absolute; inset: 0;
  & > .brief { position: absolute; inset: 0; overflow: auto; padding: 0 var(--sp-xl) 40px; background: var(--panel); color: var(--ink);
    scrollbar-width: thin; scrollbar-color: var(--line) transparent; scrollbar-gutter: stable; }
  & .brief-view { max-width: 980px; margin: 0 auto; }
}`

/** How near its end, in pixels, the viewer reads for a redraw to keep the brief there. */
const AT_END = 48

/** A worker has a Brief tab where it has a brief. */
export const tab: Tab = (_board, subject) => (can(subject.value as Card, 'brief') ? {} : undefined)

export const mount: Mount = (host, { tower, board: first, subject: at, kit }) => {
  let board = first
  let card = at.value as Card
  host.innerHTML = `<style>${CSS}${briefCss}${markdownCss}</style><div class="brief"></div>`
  const el = host.querySelector<HTMLElement>('.brief')!
  const body = el
  /** The conversations as last read, and the key of the card's state they were read at: read again when it moves. */
  let threads: Brief[] | undefined
  let readAt: string | undefined
  let markdown: BriefMarkdown = 'rendered'
  let regions: { update(subject: Subject): void; close(): void }[] = []
  /** The prompts and answers drawn, by key: published on the bus while drawn. */
  let said = new Map<string, Subject>()
  /** Whether anything is offered on a prompt or an answer: commands on `said` are offered by kind and type alone. */
  let saidActs = false
  let seen = true

  const actsOn = (b: typeof board) => addedActions(b, saidSubject({ session: '', conversation: '', startedAt: 0, side: 'prompt', card: card.id, project: card.project, body: '' })).length > 0

  const keyOf = (c: Card) => `${c.status === 'working'} ${JSON.stringify(c.conversations)} ${JSON.stringify(c.conversations.map((v) => board.adds[`conversation:${v.id}`]))}`

  /** Draws the brief read; `same`, a redraw of what is drawn, keeps its folds and opened answers. */
  function draw(same: boolean) {
    if (!threads) return
    const atEnd = !same || el.scrollHeight - el.scrollTop - el.clientHeight < AT_END
    const open = same ? openFolds(body) : new Set<string>()
    const expanded = same ? expandedSaid(body) : new Set<string>()
    regions.forEach((r) => r.close())
    for (const key of said.keys()) kit.bus.clear(key)
    said = new Map(saidOf(threads).map(({ key, text, ...s }) => [key, saidSubject({ ...s, card: card.id, project: card.project, body: text })]))
    for (const s of said.values()) kit.bus.publish(s, at.key)
    saidActs = actsOn(board)
    const acts = (key: string) => (saidActs ? `<span data-said-acts="${esc(key)}"></span>` : '')
    const promptBy = (id: string) => card.conversations.find((v) => v.id === id)?.promptBy
    const adds = (id: string) => {
      const added = board.adds[`conversation:${id}`]
      return added?.badges?.length || added?.actions?.length ? `<span data-conversation-head="${id}"></span>` : ''
    }
    drawPanel(body, briefHtml({ briefs: threads, said: markdownHtml, promptBy, open, expanded, markdown, working: card.status === 'working', adds, acts }), {})
    regions = [...body.querySelectorAll<HTMLElement>('[data-conversation-head]')].flatMap((slot) => {
      const conv = card.conversations.find((v) => v.id === slot.dataset.conversationHead)
      if (!conv) return []
      slot.style.display = 'contents'
      return [kit.region(slot, 'conversation.head', conversationSubject(card, conv))]
    }).concat([...body.querySelectorAll<HTMLElement>('[data-said-acts]')].map((slot) => {
      slot.style.display = 'contents'
      return kit.region(slot, 'said.acts', said.get(slot.dataset.saidActs!)!)
    }))
    if (atEnd) el.scrollTop = el.scrollHeight
  }

  /** Reads the conversations again when the card's moved since the last read, while the brief is seen. */
  function read() {
    const key = keyOf(card)
    if (!seen || key === readAt) return
    const first = readAt === undefined
    readAt = key
    void tower.conversations(card.id).then(
      (read) => readAt === key && ((threads = read), draw(!first)),
      (err: Error) => kit.toast(err.message),
    )
  }

  /** The viewer's markdown, as `tower.store` keeps it for every renderer of theirs; the brief drawn again when it changed. */
  async function chooseMarkdown() {
    const chosen = ((await tower.store.get(BRIEF_MARKDOWN_KEY)) as BriefMarkdown | undefined) ?? 'rendered'
    if (chosen === markdown) return
    markdown = chosen
    draw(true)
  }

  const copy = (text: string, what: string) => void navigator.clipboard.writeText(text).then(() => kit.toast(`Copied ${what}`), (err: Error) => kit.toast(err.message))

  host.addEventListener('click', (e) => {
    const target = e.target as Element
    if (target.closest('[data-region]') && host.contains(target.closest('[data-region]'))) return
    const said = target.closest<HTMLElement>('[data-copy-said]')?.dataset.copySaid
    if (said && threads) return copy(saidText(threads, said)!, said.endsWith(':prompt') ? 'the prompt' : 'the answer')
    const code = target.closest<HTMLElement>('[data-copy-code]')
    if (code) return copy(fenceText(code), 'the code')
    const choice = target.closest<HTMLElement>('[data-brief-markdown]')?.dataset.briefMarkdown as BriefMarkdown | undefined
    if (choice) return void (tower.store.set(BRIEF_MARKDOWN_KEY, choice), (markdown = choice), draw(true))
  })

  const offStore = tower.store.on(() => void chooseMarkdown())
  void chooseMarkdown()
  read()

  return {
    update(next, now) {
      board = next
      card = now.value as Card
      if (actsOn(next) !== saidActs) draw(true)
      read()
    },
    show(s) {
      if (s.kind === 'conversation') return true
      const bubble = s.kind === 'said' && [...body.querySelectorAll<HTMLElement>('[data-copy-said]')].find((b) => `said:${b.dataset.copySaid}` === s.key)?.closest('.bubble')
      if (!bubble) return false
      bubble.scrollIntoView({ block: 'center' })
      return true
    },
    visible(on) {
      seen = on
      read()
    },
    close() {
      offStore()
      regions.forEach((r) => r.close())
      for (const key of said.keys()) kit.bus.clear(key)
    },
  }
}
