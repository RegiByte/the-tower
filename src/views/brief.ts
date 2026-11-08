import { can, type Card, conversationSubject, saidSubject, type Subject } from '/lib/board.js'
import { type Brief, briefCss, briefHtml, briefKey, type BriefMarkdown, expandedSaid, openFolds, openTools, saidText, saidWhat, toolCallHtml, toolCallSettled, withWhole, withWholesRead } from '/lib/brief.js'
import { addedActions } from '/lib/layout.js'
import { fenceText, markdownCss, markdownHtml } from '/lib/markdown.js'
import { drawPanel, type Mount, type Tab } from '/lib/view.js'
import { esc } from '/lib/words.js'
import { VIEWER_KEYS } from '/lib/viewer.js'
import { saidOf } from '../shared/brief.ts'

/**
 * A worker's brief: its earlier sessions folded, then its session's conversations, each turn's prompt, Claude's steps
 * and its answer, the latest at the bottom, in the viewer's markdown. Read again as its conversations change and, while
 * it works, as it calls each tool; kept at the end while the viewer reads there. A tool call opened is read once it
 * ended, and again on each draw while it runs, drawn as last read meanwhile; a conversation's earlier turns are read
 * whole when asked for, and joined to each read's last turns of it. Each conversation's heading holds what extensions add to it (`conversation.head`). Each prompt
 * and answer drawn is a viewer subject on the page's bus (`said`), and holds the commands offered on it beside its copy
 * (`said.acts`). Its foot, under the scroll, holds the view that writes to the worker (`card.composer`), at its natural
 * height up to a cap, then scrolling; with no view there it takes no room.
 */

const ID = 'tower/brief'

const CSS = `:where([data-view="${ID}"]) {
  position: absolute; inset: 0;
  & > .brief-frame { position: absolute; inset: 0; display: flex; flex-direction: column; background: var(--panel); }
  & .brief { flex: 1 1 0; min-height: 0; overflow: auto; padding: 0 var(--sp-xl) 40px; background: var(--panel); color: var(--ink);
    scrollbar-width: thin; scrollbar-color: var(--line) transparent; scrollbar-gutter: stable; }
  & .brief-view { max-width: 980px; margin: 0 auto; }
  & .brief-foot { flex: 0 0 auto; max-height: min(40%, 320px); overflow: auto; border-top: 1px solid var(--line); padding: var(--sp-m) var(--sp-xl);
    scrollbar-width: thin; scrollbar-color: var(--line) transparent; scrollbar-gutter: stable; }
  & .brief-foot > .view-root { max-width: 980px; margin: 0 auto; }
}`

/** How near its end, in pixels, the viewer reads for a redraw to keep the brief there. */
const AT_END = 48

/** A running worker has a Brief tab, and so does one with conversations to read. */
export const tab: Tab = (_board, subject) => (can(subject.value as Card, 'brief') ? {} : undefined)

export const mount: Mount = (host, { tower, board: first, subject: at, kit }) => {
  let board = first
  let subject = at
  let card = at.value as Card
  host.innerHTML = `<style>${CSS}${briefCss}${markdownCss}</style><div class="brief-frame"><div class="brief"></div><div class="brief-foot" hidden></div></div>`
  const el = host.querySelector<HTMLElement>('.brief')!
  const foot = host.querySelector<HTMLElement>('.brief-foot')!
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
  /** Whether the viewer reads at the end, kept as they scroll: a foot that grows keeps them there. */
  let readsAtEnd = true
  el.addEventListener('scroll', () => (readsAtEnd = el.scrollHeight - el.scrollTop - el.clientHeight < AT_END), { passive: true })
  const footSize = new ResizeObserver(() => readsAtEnd && (el.scrollTop = el.scrollHeight))
  footSize.observe(foot)

  /** The view writing to the worker (`card.composer`): the region picks it, and hides the foot while it has none. */
  const composer = kit.region(foot, 'card.composer', subject)

  const actsOn = (b: typeof board) => addedActions(b, saidSubject({ session: '', conversation: '', startedAt: 0, side: 'prompt', card: card.id, project: card.project, body: '' })).length > 0

  /** The tool calls read, by key, as last drawn; those that had ended are read no more. */
  const tools = new Map<string, string>()
  const settled = new Set<string>()
  /** The conversations read whole: drawn in place of their last turns, joined to each read's last turns of them. */
  let wholes: Brief[] = []

  /** Draws the brief read; `same`, a redraw of what is drawn, keeps its folds and opened answers. */
  function draw(same: boolean) {
    if (!threads) return
    const atEnd = !same || el.scrollHeight - el.scrollTop - el.clientHeight < AT_END
    const open = same ? openFolds(body) : new Set<string>()
    const expanded = same ? expandedSaid(body) : new Set<string>()
    const opened = same ? openTools(body) : new Set<string>()
    regions.forEach((r) => r.close())
    for (const s of said.values()) kit.bus.clear(s.key)
    said = new Map(saidOf(threads).map(({ key, text, what: _, ...s }) => [key, saidSubject({ ...s, card: card.id, project: card.project, body: text })]))
    for (const s of said.values()) kit.bus.publish(s, at.key)
    saidActs = actsOn(board)
    const acts = (key: string) => (saidActs ? `<span data-said-acts="${esc(key)}"></span>` : '')
    const promptBy = (id: string) => card.conversations.find((v) => v.id === id)?.promptBy
    const adds = (id: string) => {
      const added = board.adds[`conversation:${id}`]
      return added?.badges?.length || added?.actions?.length ? `<span data-conversation-head="${id}"></span>` : ''
    }
    drawPanel(body, briefHtml({ briefs: threads, said: markdownHtml, promptBy, open, expanded, markdown, working: card.status === 'working', adds, acts, openTools: opened, tools: (key) => tools.get(key) }), {})
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
    const key = briefKey(board, card)
    if (!seen || key === readAt) return
    const first = readAt === undefined
    readAt = key
    void tower.conversations(card.id)
      .then((read) => withWholesRead(read, () => wholes, (session, id) => tower.conversation(session, id)))
      .then((read) => {
        if (readAt !== key) return
        threads = read.briefs
        wholes = read.wholes
        for (const err of read.failed) kit.toast(err.message)
        draw(!first)
      }, (err: Error) => kit.toast(err.message))
  }

  /** The viewer's markdown, as `tower.store` keeps it for every renderer of theirs; the brief drawn again when it changed. */
  async function chooseMarkdown() {
    const chosen = ((await tower.store.get(VIEWER_KEYS.briefMarkdown)) as BriefMarkdown | undefined) ?? 'rendered'
    if (chosen === markdown) return
    markdown = chosen
    draw(true)
  }

  const copy = (text: string, what: string) => void navigator.clipboard.writeText(text).then(() => kit.toast(`Copied ${what}`), (err: Error) => kit.toast(err.message))

  host.addEventListener('click', (e) => {
    const target = e.target as Element
    if (target.closest('[data-region]') && host.contains(target.closest('[data-region]'))) return
    const said = target.closest<HTMLElement>('[data-copy-said]')?.dataset.copySaid
    if (said && threads) return copy(saidText(threads, said)!, saidWhat(threads, said)!)
    const earlier = target.closest<HTMLElement>('[data-brief-earlier]')?.dataset.briefEarlier
    if (earlier) return void readWhole(earlier)
    const code = target.closest<HTMLElement>('[data-copy-code]')
    if (code) return copy(fenceText(code), 'the code')
    const choice = target.closest<HTMLElement>('[data-brief-markdown]')?.dataset.briefMarkdown as BriefMarkdown | undefined
    if (choice) return void (tower.store.set(VIEWER_KEYS.briefMarkdown, choice), (markdown = choice), draw(true))
  })

  /** A conversation's turns read whole, drawn in place of its last ones. */
  function readWhole(key: string) {
    void tower.conversation(...(key.split(':') as [string, string])).then((whole) => {
      wholes = [...wholes, whole]
      if (threads) (threads = withWhole(threads, whole)), draw(true)
    }, (err: Error) => kit.toast(err.message))
  }

  /** A tool call opened: read, drawn in its body, and kept for every draw after, read no more once it ended. */
  function readTool(details: HTMLDetailsElement) {
    const key = details.dataset.tool!
    if (!details.open || settled.has(key)) return
    void tower.toolCall(...(key.split(':') as [string, string])).then((call) => {
      const html = toolCallHtml(call)
      tools.set(key, html)
      if (toolCallSettled(call)) settled.add(key)
      for (const drawn of body.querySelectorAll<HTMLElement>('details[data-tool]'))
        if (drawn.dataset.tool === key) drawn.querySelector('[data-tool-body]')!.innerHTML = html
    }, (err: Error) => kit.toast(err.message))
  }

  host.addEventListener('toggle', (e) => {
    const details = e.target as HTMLElement
    if (details instanceof HTMLDetailsElement && details.dataset.tool) readTool(details)
  }, true)

  const offStore = tower.store.on(() => void chooseMarkdown())
  void chooseMarkdown()
  read()

  return {
    update(next, now) {
      board = next
      subject = now
      card = now.value as Card
      if (actsOn(next) !== saidActs) draw(true)
      read()
      composer.update(subject)
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
      composer.visible?.(on)
    },
    close() {
      offStore()
      footSize.disconnect()
      composer.close()
      regions.forEach((r) => r.close())
      for (const s of said.values()) kit.bus.clear(s.key)
    },
  }
}
