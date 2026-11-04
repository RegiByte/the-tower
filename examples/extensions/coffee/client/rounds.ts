/**
 * Coffee rounds: one append-only markdown file per round at a floor's coffee machine,
 * `collections/<project>/coffee/<moment>-coffee.md`, written only through the coffee extension's verbs. A round opens
 * when someone calls coffee time or a worker arrives at the machine with none open, and closes when someone closes it
 * or it has been quiet long enough. Each entry is a heading (who, local time, what they did) and a body.
 *
 *   # Coffee · 2026-11-04 10:58
 *
 *   ## Ana · 2026-11-04 10:58 · calls
 *   invited HOLMES-42, ODIN-07 · busy: VESPER-33
 *
 *   ## HOLMES-42 · 2026-11-04 10:59 · joins
 *   Fixing the Caps Lock bug in the terminal; stuck on WebKit's inline predictions.
 *
 *   ## ODIN-07 · 2026-11-04 11:01 · says
 *   HOLMES-42, the keypress is already sent by xterm: cancel it after.
 *
 *   ## ODIN-07 · 2026-11-04 11:03 · proposes p1 · One fixture per Caps Lock bug
 *   Record a session with Caps Lock on, so the bridge replays it.
 *
 *   ## Ana · 2026-11-04 11:10 · hires p1 · 20261104-111000-9f2c
 *
 *   ## the tower · 2026-11-04 11:30 · closes
 *   quiet for 20 minutes
 *
 * Nothing else is stored: who is present, what is open and which ideas wait on the user are read from the entries.
 * Pure over the text, shared by the server, the views and the tests; served at `/x/coffee/rounds.js`.
 */

export const COFFEE = 'coffee'

/** What an entry's heading says its author did. */
export type Act =
  | { t: 'calls' }
  | { t: 'joins' }
  | { t: 'says' }
  | { t: 'proposes'; n: number; title: string }
  | { t: 'hires'; n: number; session: string }
  | { t: 'drafts'; n: number; item: string }
  | { t: 'passes'; n: number }
  | { t: 'closes' }

export type Entry = { author: string; at: string; act: Act; body: string }

export type Round = { title: string; entries: Entry[] }

/** What the user did with a proposal: hired a worker on it (its session), kept it as a draft (its item), or let it go. */
export type Decision = ({ t: 'hire'; session: string } | { t: 'draft'; item: string } | { t: 'pass' }) & { by: string; at: string }

export type Proposal = { n: number; by: string; at: string; title: string; body: string; decision?: Decision }

/** A worker at the machine: its callsign, when it arrived and what it said it was on. */
export type Present = { callsign: string; at: string; doing: string }

/** A round as every surface reads it: the file's id and tag, when it opened and closed, who came, what was said and proposed. */
export type RoundView = {
  id: string
  tag: string
  title: string
  opened: string
  by: string
  closed?: string
  present: Present[]
  said: number
  proposals: Proposal[]
  /** Epoch ms of its last entry: what quiet is measured from. */
  lastAt: number
}

/** The coffee extension's part of a floor, `floor.x.coffee`. */
export type FloorCoffee = {
  /** The round open now, with its entries. */
  open?: RoundView & { entries: Entry[] }
  /** Every round, newest first, the open one among them. */
  rounds: RoundView[]
  /** Proposals no one has decided on, over every round. */
  pending: number
}

export const floorCoffee = (floor: { x?: Record<string, unknown> } | undefined): FloorCoffee => (floor?.x?.[COFFEE] as FloorCoffee | undefined) ?? { rounds: [], pending: 0 }

/** The local time an entry's heading carries, as the reviews' is. */
export const stamp = (date: Date): string => {
  const two = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}`
}

/** Epoch ms of a stamp, read in the machine's zone, as it was written. */
export const msOf = (at: string): number => {
  const [, y, mo, d, h, mi] = /^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d)$/.exec(at)!
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi)).getTime()
}

const HEADING = /^## (.+?) · (\d{4}-\d\d-\d\d \d\d:\d\d) · (calls|joins|says|closes|(?:proposes|hires|drafts|passes) p\d+(?: · .+?)?)\s*$/
const FENCE = /^(`{3,})(\S*)\s*$/

const closes = (line: string, ticks: string) => /^`{3,}\s*$/.test(line) && line.trim().length >= ticks.length

/** Where the entry headings are in `lines`: a heading-shaped line inside a code fence belongs to a body. */
const headingsOf = (lines: string[]): number[] => {
  const at: number[] = []
  let fence: string | undefined
  lines.forEach((line, i) => {
    if (fence) {
      if (closes(line, fence)) fence = undefined
      return
    }
    const opens = FENCE.exec(line)
    if (opens) fence = opens[1]
    else if (HEADING.test(line)) at.push(i)
  })
  return at
}

const actOf = (said: string): Act => {
  if (said === 'calls' || said === 'joins' || said === 'says' || said === 'closes') return { t: said }
  const [, verb, n, rest] = /^(proposes|hires|drafts|passes) p(\d+)(?: · (.+))?$/.exec(said)!
  const number = Number(n)
  if (verb === 'proposes') return { t: 'proposes', n: number, title: (rest ?? '').trim() }
  if (verb === 'hires') return { t: 'hires', n: number, session: (rest ?? '').trim() }
  if (verb === 'drafts') return { t: 'drafts', n: number, item: (rest ?? '').trim() }
  return { t: 'passes', n: number }
}

const parseEntry = (lines: string[]): Entry => {
  const [, author, at, said] = HEADING.exec(lines[0])!
  return { author, at, act: actOf(said), body: lines.slice(1).join('\n').trim() }
}

/** Total: anything before the first entry heading but the title is ignored, and a body takes whatever follows. */
export const parseRound = (text: string): Round => {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const title = lines.find((line) => line.startsWith('# '))
  const starts = headingsOf(lines)
  return { title: title ? title.slice(2).trim() : '', entries: starts.map((start, k) => parseEntry(lines.slice(start, starts[k + 1] ?? lines.length))) }
}

const headingOf = (act: Act): string =>
  act.t === 'proposes' ? `proposes p${act.n} · ${act.title}` : act.t === 'hires' ? `hires p${act.n} · ${act.session}` : act.t === 'drafts' ? `drafts p${act.n} · ${act.item}` : act.t === 'passes' ? `passes p${act.n}` : act.t

/** A new round's text: its title and its first entry. */
export const opened = (entry: Entry): string => `# Coffee · ${entry.at}\n\n${entryText(entry)}`

const entryText = ({ author, at, act, body }: Entry): string => `## ${author} · ${at} · ${headingOf(act)}\n${body.trim() ? `${body.trim()}\n` : ''}`

/** The round's text with `entry` appended. */
export const appended = (text: string, entry: Entry): string => `${text.trimEnd()}\n\n${entryText(entry)}`

/** A proposal's title or body is one the heading can carry: no newline, no `·` in the title. */
export const proposalProblem = (title: string, body: string): string | undefined =>
  !title.trim() ? 'A proposal needs a title' : /[\n·]/.test(title) ? 'A title is one line, without ·' : !body.trim() ? 'A proposal needs a body: what, why, and what a worker would do first' : undefined

/** An author's name is one a heading can carry: no `·`, no newline. */
export const authorProblem = (author: string): string | undefined => (/[\n·]/.test(author) || !author.trim() ? `"${author}" can't sign a coffee entry: a name is one line without ·` : undefined)

export const closedAt = (round: Round): string | undefined => round.entries.find((e) => e.act.t === 'closes')?.at

export const isOpen = (round: Round): boolean => round.entries.length > 0 && closedAt(round) === undefined

/** Who is at the machine, in the order they arrived, each once, with what they said they were on. */
export const presentIn = (round: Round): Present[] => {
  const seen = new Map<string, Present>()
  for (const e of round.entries) if (e.act.t === 'joins' && !seen.has(e.author)) seen.set(e.author, { callsign: e.author, at: e.at, doing: e.body })
  return [...seen.values()]
}

export const proposalsOf = (round: Round): Proposal[] => {
  const proposals: Proposal[] = []
  for (const e of round.entries) {
    const act = e.act
    if (act.t === 'proposes') proposals.push({ n: act.n, by: e.author, at: e.at, title: act.title, body: e.body })
    else if (act.t === 'hires' || act.t === 'drafts' || act.t === 'passes') {
      const p = proposals.find((p) => p.n === act.n)
      if (p && !p.decision) p.decision = { ...(act.t === 'hires' ? { t: 'hire', session: act.session } : act.t === 'drafts' ? { t: 'draft', item: act.item } : { t: 'pass' }), by: e.author, at: e.at }
    }
  }
  return proposals
}

/** The number the next proposal takes: one past the last. */
export const nextProposal = (round: Round): number => Math.max(0, ...proposalsOf(round).map((p) => p.n)) + 1

export const roundView = (id: string, tag: string, round: Round): RoundView => {
  const first = round.entries[0]
  return {
    id,
    tag,
    title: round.title,
    opened: first?.at ?? '',
    by: first?.author ?? '',
    closed: closedAt(round),
    present: presentIn(round),
    said: round.entries.filter((e) => e.act.t === 'says').length,
    proposals: proposalsOf(round),
    lastAt: round.entries.length ? msOf(round.entries.at(-1)!.at) : 0,
  }
}

/** The clock of a stamp, `10:58`. */
export const clockOf = (at: string) => at.slice(11)

/** A proposal's first line, cut to `n` characters, for a hint. */
export const gist = (body: string, n = 120): string => {
  const line = body.split('\n').find((l) => l.trim()) ?? ''
  return line.length > n ? `${line.slice(0, n - 1)}…` : line
}

const decisionWords = (d: Decision | undefined, callsignOf: (session: string) => string | undefined): string =>
  !d ? 'waiting on the user' : d.t === 'hire' ? `hired ${callsignOf(d.session) ?? d.session} on it, ${d.by} at ${clockOf(d.at)}` : d.t === 'draft' ? `kept as a draft by ${d.by} at ${clockOf(d.at)}` : `passed by ${d.by} at ${clockOf(d.at)}`

/**
 * A round in words, as a worker reads it (`join`'s reply, `tower x coffee round/<project>`): where and since when,
 * who is here, then every entry in order, ideas with where they stand.
 */
export const roundLines = (view: RoundView, entries: Entry[], floorName: string, callsignOf: (session: string) => string | undefined): string[] => {
  const here = view.present.map((p) => p.callsign)
  const head = `${view.closed ? `Coffee on ${floorName} from ${view.opened} to ${clockOf(view.closed)}` : `Coffee on ${floorName} since ${clockOf(view.opened)}`} (round ${view.tag}, called by ${view.by}). ${here.length ? `Here: ${here.join(', ')}.` : 'Nobody has joined yet.'}`
  const lines = entries.flatMap((e) => {
    const act = e.act
    const what =
      act.t === 'proposes'
        ? `proposes p${act.n} "${act.title}" (${decisionWords(view.proposals.find((p) => p.n === act.n)?.decision, callsignOf)})`
        : act.t === 'hires' || act.t === 'drafts' || act.t === 'passes'
          ? undefined
          : act.t
    if (!what) return []
    const body = e.body.trim()
    return [`${e.author} (${clockOf(e.at)}, ${what})${body ? `: ${body.replace(/\s*\n\s*/g, ' ')}` : ''}`]
  })
  return [head, ...lines]
}
