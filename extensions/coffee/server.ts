/**
 * The coffee extension (decision `coffee-time`): one coffee machine per floor, where the workers available at that
 * moment say what they are on, help each other think and leave ideas for the user. A round is one append-only
 * markdown file in its owned `coffee` collection, written only here: `call` opens it and prompts every worker at its
 * prompt to join; `join`, `say` and `propose` append a worker's entries; `close` ends it, as the timer does after a
 * quiet spell; `hire`, `draft` and `pass` append the user's decision on a proposal. Each floor's part of the board is
 * the open round, every round summarized and the ideas waiting, each an ask with those three actions; a present
 * worker's card wears a badge; a floor whose settings name a schedule gets a slot that calls coffee time.
 */
import type { Board, Card, Floor } from '../../src/bridge/board.ts'
import { apiError, isApiError } from '../../src/shared/api.ts'
import type { Ask, CallCtx, Caller, FoldCtx, Part, Slot, Start } from '../../src/shared/extensions.ts'
import { callOf } from '../../src/shared/offered.ts'
import { cronProblem, type When } from '../../src/shared/slots.ts'
import { tagOf } from '../../src/shared/tags.ts'
import { appended, authorProblem, clockOf, COFFEE, gist, isOpen, msOf, nextProposal, opened, parseRound, presentIn, proposalProblem, proposalsOf, roundLines, roundView, stamp, type Entry, type FloorCoffee, type Round, type RoundView } from './client/rounds.ts'

const CAP = 'coffee'

type Settings = { lasts: number; when?: { cron: string[]; tz?: string } }

type Project = { project: string }
type Join = Project & { doing: string }
type Say = Project & { text: string }
type Propose = Project & { title: string; body: string }
type Decide = Project & { round: string; proposal: number }

/** A round's file, read now. */
type File = { id: string; text: string; round: Round }

/** The prompt `call` types into each worker at its prompt. */
export const callPrompt = (floor: Pick<Floor, 'id' | 'name'>): string =>
  `☕ Coffee time on ${floor.name}: the workers available now meet at the coffee machine. Join with \`tower x coffee join '{"project": "${floor.id}", "doing": "<one or two lines: what you are on, and where you are stuck>"}'\`: it prints what the others said. Answer them with \`tower x coffee say\`, leave an idea for the user with \`tower x coffee propose\` (\`tower x coffee\` says how), then go back to your work. A few minutes, no more.`

/** The prompt a worker hired on a proposal starts on. */
export const hirePrompt = (floor: Pick<Floor, 'name'>, view: RoundView, proposal: { by: string; title: string; body: string }): string =>
  `At coffee time on ${floor.name} (${view.opened}), ${proposal.by} proposed "${proposal.title}":\n\n${proposal.body.trim()}\n\nThe user took it up and started you on it. The round's transcript is the kept item ${view.tag} (\`tower read ${view.tag}\`): what the others were on and said. Do the work, and end your answer with what you did and what is left.`

/** A proposal kept as a draft: a prompt a worker starts on later, saying where it came from. */
export const draftText = (floor: Pick<Floor, 'name'>, view: RoundView, proposal: { by: string; title: string; body: string }): string =>
  `# ${proposal.title}\n\n${proposal.body.trim()}\n\n_Proposed by ${proposal.by} at coffee time on ${floor.name}, ${view.opened} (round ${view.tag})._\n`

const floorOf = (board: Board, project: string): Floor | undefined => board.floors.find((f) => f.id === project)

/** A floor's round files as the tower folds them, the ones it could parse, newest first: the first is the only one that can be open. */
const newestFirst = <I extends { id: string; parsed: unknown }>(items: I[]): I[] => items.filter((i) => i.parsed !== undefined).sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))

/** Why a worker on the floor can't be prompted to come, by its card; `undefined` when it can. */
const busyWhy = (card: Card): string | undefined =>
  !card.live ? 'not running' : callOf(card, 'prompt') ? undefined : card.status === 'working' ? 'working' : card.status === 'needs_input' || card.status === 'blocked' ? 'asking the user something' : 'holding text in its composer'

const start: Start = (ctx) => {
  /** The writes in flight, by floor: each reads the round as it is after the one before it. */
  const queues = new Map<string, Promise<unknown>>()
  const queued = <T>(project: string, work: () => Promise<T>): Promise<T> => {
    const run = (queues.get(project) ?? Promise.resolve()).then(work)
    queues.set(project, run.catch(() => undefined))
    return run
  }

  const settingsOf = (project: string) => ctx.settingsOf(project) as Settings

  /** The floor's round files, newest first, read now. */
  const files = async (project: string, limit?: number): Promise<File[]> => {
    const ids = ctx.collections.list(project, COFFEE).map((i) => i.id).sort().reverse().slice(0, limit)
    return Promise.all(
      ids.map(async (id) => {
        const text = await ctx.collections.read(project, COFFEE, id)
        return { id, text, round: parseRound(text) }
      }),
    )
  }

  /** The open round, read now: only the newest file can be, since a round opens only while none is. */
  const openRound = async (project: string): Promise<File | undefined> => {
    const [newest] = await files(project, 1)
    return newest && isOpen(newest.round) ? newest : undefined
  }

  const fileOf = async (project: string, id: string): Promise<File | undefined> => {
    if (!ctx.collections.list(project, COFFEE).some((i) => i.id === id)) return undefined
    const text = await ctx.collections.read(project, COFFEE, id)
    return { id, text, round: parseRound(text) }
  }

  /** The callsign of the worker that ran `session`, among `cards`: every card the system holds, archived ones too. */
  const callsignIn =
    (cards: Card[]) =>
    (session: string): string | undefined =>
      cards.find((c) => c.id === session || c.lineage.some((l) => l.id === session))?.callsign

  /** The card of the worker a call comes from, on `project`; an error for any other caller. */
  const workerOf = (caller: Caller, project: string, cards: Card[]): Card | ReturnType<typeof apiError> => {
    if (caller.t !== 'worker' || !caller.id) return apiError('refused', 'Only a worker joins or speaks at the coffee machine: the user calls coffee time, closes a round and decides on its ideas')
    const card = cards.find((c) => (c.id === caller.id || c.lineage.some((l) => l.id === caller.id)) && !c.continuedBy)
    if (!card) return apiError('not_found', `No worker on the board runs session ${caller.id}`)
    if (card.project !== project) return apiError('refused', `${card.callsign} works on ${card.project}, not ${project}: a worker drinks coffee on its own floor`)
    return card
  }

  /** Who signs an entry: a worker by its callsign, the user by name, the tower itself. */
  const authorOf = (caller: Caller, cards: Card[]): string => (caller.t === 'worker' && caller.id ? (callsignIn(cards)(caller.id) ?? caller.id) : caller.t === 'user' ? ctx.board().user.name : 'the tower')

  const append = async (project: string, file: File, entry: Entry): Promise<File> => {
    const text = appended(file.text, entry)
    await ctx.collections.put(project, COFFEE, file.id, text)
    return { id: file.id, text, round: parseRound(text) }
  }

  const open = async (project: string, entry: Entry): Promise<File> => {
    const text = opened(entry)
    const item = await ctx.collections.create(project, COFFEE, { name: 'coffee', ext: 'md', content: text })
    return { id: item.id, text, round: parseRound(text) }
  }

  const view = (file: File) => roundView(file.id, tagOf(file.id), file.round)

  /** The round's entries after the author's last one, in words: what is new to it. */
  const newsFor = (file: File, author: string, floor: Floor, cards: Card[]): string[] => {
    const last = file.round.entries.findLastIndex((e) => e.author === author)
    return roundLines(view(file), file.round.entries.slice(last + 1), floor.name, callsignIn(cards)).slice(1)
  }

  const call = async ({ project }: Project, { caller, call, cards }: CallCtx) =>
    queued(project, async () => {
      const floor = floorOf(ctx.board(), project)!
      const author = authorOf(caller, cards())
      const problem = authorProblem(author)
      if (problem) return apiError('invalid', problem)
      const was = await openRound(project)
      const self = caller.t === 'worker' && caller.id ? callsignIn(cards())(caller.id) : undefined
      const here = was ? presentIn(was.round).map((p) => p.callsign) : []
      const others = floor.cards.filter((c) => !c.continuedBy && c.callsign !== self && !here.includes(c.callsign))
      const invited: string[] = []
      const busy: string[] = []
      for (const card of others) {
        const why = busyWhy(card)
        if (why) {
          busy.push(`${card.callsign}: ${why}`)
          continue
        }
        const [verb, input] = callOf(card, 'prompt')! as [string, object]
        const reply = await call(`tower/${verb}`, { ...input, text: callPrompt(floor) })
        if (isApiError(reply)) busy.push(`${card.callsign}: ${reply.message}`)
        else invited.push(card.callsign)
      }
      const body = [invited.length ? `invited ${invited.join(', ')}` : 'nobody to invite', busy.length ? `busy: ${busy.join('; ')}` : ''].filter(Boolean).join(' · ')
      const entry: Entry = { author, at: stamp(new Date()), act: { t: 'calls' }, body }
      const file = was ? await append(project, was, entry) : await open(project, entry)
      return { t: 'called' as const, id: file.id, tag: tagOf(file.id), opened: !was, invited, busy }
    })

  const join = async ({ project, doing }: Join, { caller, cards }: CallCtx) =>
    queued(project, async () => {
      const card = workerOf(caller, project, cards())
      if (isApiError(card)) return card
      const floor = floorOf(ctx.board(), project)!
      const was = await openRound(project)
      if (was && presentIn(was.round).some((p) => p.callsign === card.callsign)) return apiError('refused', `${card.callsign} is already at the coffee machine: \`tower x coffee say\` speaks`)
      const entry: Entry = { author: card.callsign, at: stamp(new Date()), act: { t: 'joins' }, body: doing.trim() }
      const file = was ? await append(project, was, entry) : await open(project, entry)
      const v = view(file)
      return { t: 'joined' as const, id: file.id, tag: v.tag, opened: !was, here: v.present.map((p) => p.callsign), lines: roundLines(v, file.round.entries, floor.name, callsignIn(cards())) }
    })

  /** The open round a present worker speaks in, or why it can't. */
  const speakingIn = async (caller: Caller, project: string, cards: Card[]): Promise<{ card: Card; file: File } | ReturnType<typeof apiError>> => {
    const card = workerOf(caller, project, cards)
    if (isApiError(card)) return card
    const file = await openRound(project)
    if (!file) return apiError('refused', `No round is open at the coffee machine of ${project}: \`tower x coffee join\` opens one`)
    if (!presentIn(file.round).some((p) => p.callsign === card.callsign)) return apiError('refused', `${card.callsign} hasn't joined this round: \`tower x coffee join\` first, with what you are on`)
    return { card, file }
  }

  const say = async ({ project, text }: Say, { caller, cards }: CallCtx) =>
    queued(project, async () => {
      const in_ = await speakingIn(caller, project, cards())
      if (isApiError(in_)) return in_
      const floor = floorOf(ctx.board(), project)!
      const news = newsFor(in_.file, in_.card.callsign, floor, cards())
      const file = await append(project, in_.file, { author: in_.card.callsign, at: stamp(new Date()), act: { t: 'says' }, body: text.trim() })
      return { t: 'said' as const, id: file.id, news }
    })

  const propose = async ({ project, title, body }: Propose, { caller, cards }: CallCtx) =>
    queued(project, async () => {
      const problem = proposalProblem(title, body)
      if (problem) return apiError('invalid', problem)
      const in_ = await speakingIn(caller, project, cards())
      if (isApiError(in_)) return in_
      const floor = floorOf(ctx.board(), project)!
      const news = newsFor(in_.file, in_.card.callsign, floor, cards())
      const n = nextProposal(in_.file.round)
      const file = await append(project, in_.file, { author: in_.card.callsign, at: stamp(new Date()), act: { t: 'proposes', n, title: title.trim() }, body: body.trim() })
      return { t: 'proposed' as const, id: file.id, n, news }
    })

  const closeRound = async (project: string, author: string, body: string) => {
    const was = await openRound(project)
    if (!was) return apiError('refused', `No round is open at the coffee machine of ${project}`)
    const file = await append(project, was, { author, at: stamp(new Date()), act: { t: 'closes' }, body })
    const proposals = proposalsOf(file.round)
    return { t: 'closed' as const, id: file.id, tag: tagOf(file.id), proposals: proposals.length, pending: proposals.filter((p) => !p.decision).length }
  }

  const close = ({ project }: Project, { caller, cards }: CallCtx) =>
    queued(project, () => {
      const author = authorOf(caller, cards())
      const problem = authorProblem(author)
      return problem ? Promise.resolve(apiError('invalid', problem)) : closeRound(project, author, '')
    })

  /** The round and the undecided proposal a decision is about, or why not. */
  const deciding = async (project: string, id: string, n: number, cards: Card[]) => {
    const file = await fileOf(project, id)
    if (!file) return apiError('not_found', `${project} keeps no coffee round ${id}`)
    const proposal = proposalsOf(file.round).find((p) => p.n === n)
    if (!proposal) return apiError('not_found', `Round ${tagOf(id)} has no proposal p${n}`)
    if (proposal.decision) return apiError('refused', `p${n} "${proposal.title}" is decided: ${proposal.decision.t === 'hire' ? `${callsignIn(cards)(proposal.decision.session) ?? proposal.decision.session} was hired on it` : proposal.decision.t === 'draft' ? `kept as draft ${tagOf(proposal.decision.item)}` : 'passed'} by ${proposal.decision.by} at ${clockOf(proposal.decision.at)}`)
    return { file, proposal }
  }

  const hire = ({ project, round, proposal: n }: Decide, { caller, call, cards }: CallCtx) =>
    queued(project, async () => {
      const at = await deciding(project, round, n, cards())
      if (isApiError(at)) return at
      const floor = floorOf(ctx.board(), project)!
      const v = view(at.file)
      const spawned = await call('tower/spawn', { project, ...(floor.cutByDefault && floor.git && { cut: {} }), prompt: hirePrompt(floor, v, at.proposal) })
      if (isApiError(spawned)) return spawned
      const { id } = spawned as { id: string }
      await append(project, at.file, { author: authorOf(caller, cards()), at: stamp(new Date()), act: { t: 'hires', n, session: id }, body: '' })
      return spawned
    })

  const draft = ({ project, round, proposal: n }: Decide, { caller, call, cards }: CallCtx) =>
    queued(project, async () => {
      const at = await deciding(project, round, n, cards())
      if (isApiError(at)) return at
      const floor = floorOf(ctx.board(), project)!
      const created = await call('tower/collection/create', { project, collection: 'drafts', name: at.proposal.title, ext: 'md', content: draftText(floor, view(at.file), at.proposal) })
      if (isApiError(created)) return created
      const { id } = created as { id: string }
      await append(project, at.file, { author: authorOf(caller, cards()), at: stamp(new Date()), act: { t: 'drafts', n, item: id }, body: '' })
      return { t: 'drafted' as const, item: id, tag: tagOf(id) }
    })

  const pass = ({ project, round, proposal: n }: Decide, { caller, cards }: CallCtx) =>
    queued(project, async () => {
      const at = await deciding(project, round, n, cards())
      if (isApiError(at)) return at
      await append(project, at.file, { author: authorOf(caller, cards()), at: stamp(new Date()), act: { t: 'passes', n }, body: '' })
      return { t: 'passed' as const }
    })

  /** A round quiet for the floor's `lasts` minutes closes on its own, signed by the tower. */
  const closeQuiet = async () => {
    for (const floor of ctx.board().floors) {
      if (!ctx.on(floor.id)) continue
      const { lasts } = settingsOf(floor.id)
      const was = await openRound(floor.id)
      if (!was) continue
      const last = was.round.entries.at(-1)!
      if (Date.now() - msOf(last.at) < lasts * 60_000) continue
      await queued(floor.id, () => closeRound(floor.id, 'the tower', `quiet for ${lasts} minutes`))
      ctx.log(`closed the coffee round ${tagOf(was.id)} on ${floor.id}: quiet for ${lasts} minutes`)
    }
  }
  ctx.every(30_000, closeQuiet)

  /** The floor's schedule, when its settings name one the tower can say; a bad cron is said in the log and calls nothing. */
  const scheduleOf = (project: string, settings: Settings): When | undefined => {
    const when = settings.when
    if (!when) return undefined
    const problem = when.cron.map(cronProblem).find(Boolean)
    if (problem) {
      ctx.log(`${project}: coffee's when.cron is not one the tower can say, so coffee time is never called on its own: ${problem}`)
      return undefined
    }
    return when as When
  }

  const asksOf = (project: string, rounds: RoundView[]): Ask[] =>
    rounds.flatMap((r) =>
      r.proposals
        .filter((p) => !p.decision)
        .map(
          (p): Ask => ({
            key: `${r.id}#p${p.n}`,
            subject: `item.${COFFEE}:${project}/${r.id}`,
            title: `☕ ${p.title}`,
            hint: `${p.by} proposed it at coffee time, ${p.at} (round ${r.tag}): ${gist(p.body)}`,
            since: msOf(p.at),
            sound: 'offer',
            actions: [
              { verb: `${CAP}/hire`, call: { project, round: r.id, proposal: p.n }, words: { label: 'Hire', hint: 'start a worker on this idea' } },
              { verb: `${CAP}/draft`, call: { project, round: r.id, proposal: p.n }, words: { label: 'Draft', hint: 'keep it as a draft for later' } },
              { verb: `${CAP}/pass`, call: { project, round: r.id, proposal: p.n }, words: { label: 'Pass', hint: 'let it go' } },
            ],
          }),
        ),
    )

  return {
    parse: { [COFFEE]: (text: string): Round => parseRound(text) },
    folds: {
      floor: (floor: Floor, { own, settings }: FoldCtx): Part => {
        const items = newestFirst(own.collections[COFFEE] ?? [])
        const rounds = items.map((i) => roundView(i.id, i.tag, i.parsed as Round))
        const newest = items[0]
        const open = newest && isOpen(newest.parsed as Round) ? { ...rounds[0], entries: (newest.parsed as Round).entries } : undefined
        const asks = asksOf(floor.id, rounds)
        const when = scheduleOf(floor.id, settings as Settings)
        const x: FloorCoffee = { ...(open && { open }), rounds, pending: asks.length }
        return {
          x,
          actions: open
            ? [{ verb: `${CAP}/close`, call: { project: floor.id }, words: { label: 'Close coffee', hint: `close the round at the coffee machine, open since ${clockOf(open.opened)}` } }]
            : [{ verb: `${CAP}/call`, call: { project: floor.id }, words: { label: 'Coffee time', hint: "call the floor's available workers to the coffee machine" } }],
          ...(asks.length && { asks }),
          ...(when && { slots: [{ key: 'call', when }] }),
        }
      },
      card: (card: Card, { own }: FoldCtx): Part => {
        const newest = newestFirst(own.collections[COFFEE] ?? [])[0]
        const round = newest?.parsed as Round | undefined
        const here = round && isOpen(round) ? presentIn(round).find((p) => p.callsign === card.callsign) : undefined
        return here ? { badges: [{ label: '☕ coffee', tone: 'quiet', hint: `at the coffee machine since ${clockOf(here.at)}: ${gist(here.doing, 80)}` }] } : {}
      },
      'item.coffee': (item: { id: string; parsed?: unknown }): Part => {
        const round = item.parsed as Round | undefined
        if (!round) return {}
        const v = roundView(item.id, tagOf(item.id), round)
        const pending = v.proposals.filter((p) => !p.decision).length
        return {
          x: { opened: v.opened, ...(v.closed && { closed: v.closed }), present: v.present.length, proposals: v.proposals.length, pending },
          badges: [
            ...(v.closed ? [] : [{ label: 'open', tone: 'working' as const, hint: `coffee time since ${clockOf(v.opened)}` }]),
            ...(pending ? [{ label: `${pending} waiting`, tone: 'offered' as const, hint: `${pending === 1 ? 'an idea waits' : `${pending} ideas wait`} on you: hire, draft or pass` }] : []),
          ],
        }
      },
    },
    slots: {
      '*': async (slot: Slot) => {
        if (!slot.project) return
        const reply = await ctx.call(`${CAP}/call`, { project: slot.project })
        if (isApiError(reply)) ctx.log(`${slot.project}: coffee time at ${new Date(slot.at).toISOString()} wasn't called: ${reply.message}`)
      },
    },
    verbs: { call, join, say, propose, close, hire, draft, pass },
    reads: {
      'rounds/<project>': async ({ params, query }: { params: Record<string, string>; query: { limit?: string } }) => ({
        rounds: (await files(params.project, query.limit === undefined ? 20 : Number(query.limit))).map(view),
      }),
      'round/<project>': async ({ params }: { params: Record<string, string> }, { cards }: CallCtx) => {
        const [newest] = await files(params.project, 1)
        const floor = floorOf(ctx.board(), params.project)!
        if (!newest) return { open: false, lines: [`Nobody has had coffee on ${floor.name} yet: \`tower x coffee join\` opens the first round.`] }
        const v = view(newest)
        return { open: v.closed === undefined, id: newest.id, tag: v.tag, lines: roundLines(v, newest.round.entries, floor.name, callsignIn(cards())) }
      },
    },
  }
}

export default start
