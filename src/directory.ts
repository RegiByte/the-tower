/**
 * The tower's directory, the workers' verbs of the `tower` command (`src/cli.ts`): who this session is and who else
 * is on duty, read from the running tower's board, and the floor's collections. An agent reaches another through
 * Claude Code's own messaging, by the `peer` name listed here. The tower mod puts the command on every session's PATH
 * (`src/mod/bin/tower`). The verbs are the workers' of the command's table (`src/cli-verbs.ts`), each run by its
 * handler in `WORKER_RUNS`.
 *
 * `show`, `open`, `keep` and `home` naming oneself are facts about this session: they go through the tower's `fact`
 * verb, the host logs them (`tower.show`, `tower.keep`, `tower.leave`), and every renderer draws them from the board.
 * `hire` and `review` spawn with `hire`: the tower weighs the hire against the limits and logs `tower.hire` in this
 * session's log. An item is called by its tag, as every renderer shows it.
 * Agents edit kept items in their files and never delete them: throwing one away is the user's. Review threads are
 * written only through `tower note`, which appends.
 */
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import type { Board, Card, Floor, FloorCollection, FloorItem } from './bridge/board.ts'
import type { Brief } from './bridge/turns.ts'
import type { Shown } from './bridge/facts.ts'
import { callerHeaders, type Replies } from './shared/api.ts'
import type { Flow, OpenStage, Stage } from './shared/flows.ts'
import { POLICIES, shortHash, type CardRun, type InvalidPolicy, type OfferFields, type PolicyFields, type ValidPolicy } from './shared/policies-legacy.ts'
import { nextSlot, ruleWords, slotWords } from './shared/slots.ts'
import { capabilityOf, FACT_DOOR, matchRead, type Deprecated, type ExtensionView } from './shared/extensions.ts'
import { renderersOf } from './renderers.ts'
import type { BoardMsg, Reads } from './shared/shelf-page.ts'
// `reviewerOf` and `threadCheckoutOf` are the core's deprecated copies of the reviews client's: the CLI says them until extensions say their own CLI words.
import { ago, CLI_REGIONS, exemptionWords, landing, landingLine, linesOf, sizeOf, hiresBy, extensionLine, EXTENSION_STATE_NAME, problemLine, base, callOf, can, crewOf, crewTree, GIST_MARK, gistLine, hirerName, hiresOf, workerNamed, modelName, reviewerOf, spawnCall, spawnDefaults, shelfSource, statusName, threadCheckoutOf, UNRESUMABLE_TITLE, type SpawnForm } from './shared/cards.ts'
import { callsignsOf, checkoutDirs, towerUrl, type Renderer, type ShelfEntry } from './shared/model.ts'
import { langOf, repoName, REVIEWS, threadId, type Anchor } from './shared/reviews.ts'
import { tagOf } from './shared/tags.ts'
import { titled, titleIn } from './shared/titles.ts'
import { briefParts, sessionLabel, type BriefPart } from './shared/brief.ts'
import { configPath } from './shared/paths.ts'
import { readConfig } from './system.ts'
import { CliError } from './cli-error.ts'
import { checkFolder, freezeFolder } from './extension-check.ts'
import { plural } from './shared/format.ts'
import { usageLine, type Run, type VerbOf } from './cli-verbs.ts'
import { SHELF_KINDS } from './shelf.ts'

/** The running tower's URL, from the config's `port`. */
const towerAt = (): string => towerUrl(readConfig(configPath()))

const me = process.env.TOWER_SESSION_ID
const now = Date.now()

/** Stdin read as a stream to its end: a pipe whose writer hasn't written yet is waited on. */
const readStdin = async (): Promise<string> => {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

const towerGet = (route: string): Promise<Response> =>
  fetch(`${towerAt()}${route}`, { headers: callerHeaders(me) }).catch((err) => {
    throw new CliError(`No tower answers at ${towerAt()} (${err.cause?.code ?? err.message})`, 'the user starts it with `tower up`')
  })

/** `/board` is a stream: its first event is the board now. */
const readBoard = async (): Promise<Board> => {
  const res = await towerGet('/board')
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader()
  let text = ''
  while (!text.includes('\n\n')) {
    const { value, done } = await reader.read()
    if (done) throw new CliError('The tower closed the board stream before sending a board')
    text += value
  }
  await reader.cancel()
  const data = text.split('\n').find((line) => line.startsWith('data:'))!
  const msg: BoardMsg = JSON.parse(data.slice('data:'.length))
  if ('error' in msg) throw new CliError(`The tower can't build the board: ${msg.error.message}`)
  return msg.board
}

const floorTitle = (floor: Floor) => `${floor.name} (floor "${floor.id}")`

const cardLines = (card: Card, me: string | undefined, now: number, depth = 0): string[] => {
  const indent = '    '.repeat(depth)
  const facts = [
    statusName(card),
    `for ${ago(now - card.enteredAt)}`,
    card.peer ? `message as "${card.peer}"` : 'not reachable: its Claude is not running',
    modelName(card.model),
  ].filter(Boolean)
  const gist = gistLine(card).replace(/\s+/g, ' ')
  return [
    `${indent}  ${depth ? '└ ' : ''}${card.callsign}${card.id === me ? ' (you)' : ''}  ·  ${facts.join('  ·  ')}${depth || hiredOff(card) ? `  ·  ${reportLine(card)}` : ''}`,
    `${indent}    in ${card.cwd}`,
    ...(gist ? [`${indent}    ${gist}`] : []),
  ]
}

/** Where work that landed is read once no worktree holds it. */
const landedFix = ({ checkoutState: s }: Card) => (s.is === 'landed' && !s.empty && s.on ? `its commits are on ${s.on}: \`git log ${s.on}\` in the floor's main checkout` : undefined)

const reportLine = (card: Card) =>
  reviewerOf(card) ? `reviews ${reviewerOf(card)}` : card.crew ? `in ${card.crew.callsign}'s crew, by ${card.crew.by}` : `hired by ${hirerName(card.hiredBy!, card.project)}`

/** A worker hired from another floor: it heads a crew on its own, and is linked under its hirer's there. */
const hiredOff = (card: Card) => card.hiredBy !== undefined && card.hiredBy.project !== card.project

/** A hire on another floor under its hirer's crew: one line pointing to its card there. */
const awayLine = (card: Card, depth: number) => `${'    '.repeat(depth)}  └ ${card.callsign}  ·  ${statusName(card)}  ·  on ${card.project}`

/** A floor's crews (`crewTree`), each worker followed by its hires on other floors, linked: each is drawn in full on its own. */
const crewRows = (floor: Floor, hiresEverywhere: (c: Card) => Card[]): { card: Card; depth: number; away?: true }[] =>
  crewTree(floor.cards).flatMap((row) => [
    row,
    ...hiresEverywhere(row.card).filter((h) => h.project !== row.card.project).map((card) => ({ card, depth: row.depth + 1, away: true as const })),
  ])

/** The floor's crews: each worker under the one it reports to, those that went home among them, and its hires on other floors. */
const floorLines = (floor: Floor, hiresEverywhere: (c: Card) => Card[], me: string | undefined, now: number): string[] => {
  const onDuty = floor.cards.filter((c) => c.onDuty)
  return [
    `${floorTitle(floor)}: ${onDuty.length} on duty`,
    ...crewRows(floor, hiresEverywhere).flatMap(({ card, depth, away }) => (away ? [awayLine(card, depth)] : cardLines(card, me, now, depth))),
  ]
}

const ownCard = (board: Board, me: string | undefined): Card => {
  if (!me) throw new CliError('TOWER_SESSION_ID is not set: this Claude was not started by the tower, so it has no place in it')
  const card = board.floors.flatMap((f) => f.cards).find((c) => c.id === me)
  if (!card) throw new CliError(`The tower has no session "${me}"`)
  return card
}

const whoami = (board: Board, me: string | undefined): string[] => {
  const card = ownCard(board, me)
  const floor = board.floors.find((f) => f.id === card.project)!
  return [
    `You are ${card.callsign}, session ${card.id}, a worker on ${floorTitle(floor)}.`,
    card.peer ? `Other Claude sessions message you as "${card.peer}".` : 'Your Claude session name is not known to the tower yet.',
    ...(card.hiredBy ? [`${hirerWords(card)} hired you: \`tower agent ${card.hiredBy.callsign}\` says how to reach it.`] : []),
    ...(card.crew ? [`You are in ${card.crew.callsign}'s crew, by ${card.crew.by}: \`tower agent ${card.crew.callsign}\` says how to reach it.`] : []),
    ...(card.exempt ?? []).map((e) => `You are ${exemptionWords(e)}.`),
    ...linesOf(board, card.id),
    ...(card.worktree ? worktreeLines(floor, card.worktree) : [`You work in ${card.cwd}.`]),
    `The floor's hub is ${floor.hub}${floor.repos?.length ? `, with repos ${floor.repos.map(base).join(', ')}` : ''}.`,
    `The tower answers at ${towerAt()}: the user's page, and the API (\`tower api\` lists it).`,
    shelfLine(floor),
    ...collectionsLines(floor),
    `The tower's config is ${board.config}: \`tower config check\` checks it.`,
  ]
}

/** A worker's hirer, with its floor when it hired from another: `PEDRINHO-33 (floor tower)`. */
const hirerWords = (card: Card) => `${card.hiredBy!.callsign}${hiredOff(card) ? ` (floor ${card.hiredBy!.project})` : ''}`

const shelfEntryName = (entry: ShelfEntry): string => `"${entry.label}" (${SHELF_KINDS.find((kind) => kind in entry)} ${shelfSource(entry)})`

const shelfLine = (floor: Floor): string =>
  floor.shelf?.length
    ? `The floor's shelf, the pages the user reads beside its sessions: ${floor.shelf.map(shelfEntryName).join(', ')}.`
    : `The floor's shelf is empty: pages the user reads beside its sessions go under projects.${floor.id}.shelf in the config.`

const collectionsLines = (floor: Floor): string[] =>
  floor.collections.length
    ? ["The floor's collections, files kept for later (`tower kept` counts them and shows the latest of each):", ...floor.collections.map(collectionLine)]
    : ['The floor keeps no collections.']

const worktreeLines = (floor: Floor, { name, branch, from }: NonNullable<Card['worktree']>): string[] => {
  const paths = floor.worktrees.find((w) => w.name === name)?.repos.map((r) => r.path) ?? []
  return [
    `You work in worktree ${name}, on ${branch ? `branch ${branch}` : 'a detached HEAD'}: ${paths.join(', ')}.`,
    ...(from ? [`It is a fork of checkout ${from}: it started as a snapshot of that checkout, uncommitted work included.`] : []),
    'Those are your copies of the floor\'s directories below, which belong to the user and other workers: edit only yours.',
  ]
}

const readArchive = async (project: string): Promise<Card[]> => {
  const res = await fetch(`${towerAt()}/archive/${project}`)
  if (!res.ok) throw new CliError(`The tower answered ${res.status} for ${project}'s archive: ${await res.text()}`)
  return res.json()
}

/** Every worker of every floor, those the board leaves out read from the floors' archives. */
const everyCard = async (board: Board): Promise<Card[]> => [
  ...board.floors.flatMap((f) => f.cards),
  ...(await Promise.all(board.floors.filter((f) => f.archived).map((f) => readArchive(f.id)))).flat(),
]

/** A callsign can come back: a worker on duty wins over past ones, and past ones by the latest start, archived or not. */
const cardNamed = async (board: Board, name: string): Promise<Card> => {
  const onBoard = workerNamed(board.floors.flatMap((f) => f.cards), name)
  const card = onBoard?.onDuty ? onBoard : workerNamed(await everyCard(board), name)
  if (!card) throw new CliError(`No worker is called "${name}". \`tower agents --all\` lists who is on duty.`)
  return card
}

const readThreads = async (id: string): Promise<Brief[]> => {
  const res = await fetch(`${towerAt()}/conversations/${id}`)
  if (!res.ok) throw new CliError(`The tower answered ${res.status} for ${id}'s conversations: ${await res.text()}`)
  return res.json()
}

const threadLines = (thread: Brief, promptBy: string | undefined): string[] => [
  `Conversation ${thread.id}${thread.resumedBy ? ` (continued by ${thread.resumedBy.callsign}, session ${thread.resumedBy.id})` : ''}`,
  ...(thread.turns.length
    ? thread.turns.toReversed().flatMap((turn, i, turns) => [
        `${GIST_MARK.prompt} ${i === 0 ? 'Latest prompt' : 'Earlier prompt'} from ${turn.from ? `${turn.from.callsign}, another worker` : promptBy && turn === turns.find((t) => !t.from) ? `${promptBy}, which hired it` : 'the user'}:`,
        turn.prompt,
        `${GIST_MARK.answer} ${i === 0 ? 'Latest answer' : 'Answer'}:`,
        turn.answer ?? '(working on it)',
      ])
    : ['(no prompt yet)']),
]

/** An earlier session of the worker, as one line: `tower agent` reads the current one in full. */
const earlierLine = (p: BriefPart) =>
  `  ${sessionLabel(p.n, p.of, p.session.startedAt)}, session ${p.session.id}: ${p.threads.length} conversation${p.threads.length === 1 ? '' : 's'}`

/** `cards`: the cards its hires are found among, every floor's, and its floor's archive's too for a worker the board leaves out. */
const agent = (board: Board, card: Card, cards: Card[], briefs: Brief[], now: number): string[] => {
  const floor = board.floors.find((f) => f.id === card.project)!
  const hires = hiresOf(cards, card)
  const [current, ...earlier] = briefParts(briefs)
  return [
    `${card.callsign}, session ${card.id}, on ${floorTitle(floor)}`,
    `  ${[statusName(card), `for ${ago(now - card.enteredAt)}`, card.peer ? `message as "${card.peer}"` : 'not reachable: its Claude is not running', modelName(card.model)].filter(Boolean).join('  ·  ')}`,
    `  in ${card.cwd}`,
    ...(card.unresumable ? [`  ${UNRESUMABLE_TITLE[card.unresumable]}`] : []),
    ...(reviewerOf(card) ? [`  reviews ${reviewerOf(card)}'s work`] : []),
    ...(card.hiredBy ? [`  hired by ${hirerName(card.hiredBy, card.project)}`] : []),
    ...(card.crew ? [`  in ${card.crew.callsign}'s crew, by ${card.crew.by}`] : []),
    ...(card.exempt ?? []).map((e) => `  ${exemptionWords(e)}`),
    ...(hires.length ? [`  under it: ${hires.map((h) => `${h.callsign} (${[statusName(h), ...(h.project === card.project ? [] : [`on ${h.project}`])].join(', ')})`).join(', ')}`] : []),
    ...(current ? current.threads.flatMap((t) => ['', ...threadLines(t, card.conversations.find((conv) => conv.id === t.id)?.promptBy)]) : ['', 'No saved conversation yet.']),
    ...(earlier.length ? ['', `Earlier sessions of ${card.callsign}, each read in full at /conversations/<session>:`, ...earlier.map(earlierLine)] : []),
  ]
}

/** What the quota extension says for `tower probes`. */
const quotaSaid = async (): Promise<{ line: string; last?: string }> => {
  const res = await towerGet('/quota/said')
  if (!res.ok) throw new CliError(`The tower answered ${res.status} for the quota probe: ${await res.text()}`, 'a quota extension started before tower 1.97 has no `said` read: `tower extensions restart quota`')
  return res.json()
}

/** An extension: its line, where it is off, whom it exempted, and each problem at its path. */
const extensionCliLines = (e: Reads['extensions']['extensions'][number]): string[] => [
  `${e.id}  ${extensionLine(e)}${e.provides === e.id ? '' : ` · provides ${e.provides}`}${e.bundled ? ' · bundled' : ''}`,
  ...(e.off?.length ? [`  off on ${e.off.join(', ')}`] : []),
  ...e.slots.map((s) => {
    const next = nextSlot(s.when, now)
    return `  slot ${s.name}  ${ruleWords(s.when)}${s.scope === 'project' ? ', on each floor' : ''}${next === undefined ? '' : ` · next ${slotWords(next, 'cron' in s.when ? s.when.tz : undefined, now)}`}`
  }),
  ...(e.exempted.length ? [`  exempted ${e.exempted.map((x) => `${x.callsign} from ${x.from}`).join(', ')}`] : []),
  ...e.problems.map((p) => `  ${{ error: 'error', warn: 'warn ', info: 'note ' }[p.level]}  ${problemLine(p)}`),
]

const deprecatedWords = (deprecated: Deprecated | undefined) => (deprecated ? ` · deprecated since ${deprecated.since}${deprecated.use ? `: use ${deprecated.use}` : ''}` : '')

/** An extension's doors, verbs and reads, each as `tower x` calls it, in its words. */
const extensionCallLines = (e: ExtensionView): string[] => [
  `${e.provides}  ${extensionLine(e)}`,
  ...doorsOf(e).map((f) => `  tower x ${e.provides} ${FACT_DOOR}${f.name}  ${f.description ?? `writes its fact ${f.name}`} (written by ${f.writable!.join(', ')}; input {"value": …})`),
  ...e.verbs.map((v) => {
    const words = v.words ? `${v.words.label}${v.words.hint ? `: ${v.words.hint}` : ''}` : (v.description ?? '')
    return `  tower x ${v.name.replace('/', ' ')}  ${words}${v.scope === 'project' ? ' (its input names the project)' : ''}${deprecatedWords(v.deprecated)}`
  }),
  ...e.reads.map((r) => `  tower x ${e.provides} ${r.path}  ${r.description ?? 'a read'}${r.scope === 'project' ? ' (it names the project)' : ''}${deprecatedWords(r.deprecated)}`),
]

/** An extension's writable facts: each a door, `facts/<name>`. */
const doorsOf = (e: ExtensionView) => e.facts.filter((f) => f.writable)

/**
 * What `tower x <capability> <name>` calls: a writable fact's door, `facts/<name>`; else a verb; else the read whose path
 * `name` matches. `undefined` when the capability offers none of them by that name.
 */
export const xTarget = (e: ExtensionView, name: string): { t: 'call'; verb: string } | { t: 'read'; path: string } | undefined => {
  if (name.startsWith(FACT_DOOR) && doorsOf(e).some((f) => `${FACT_DOOR}${f.name}` === name)) return { t: 'call', verb: `${e.provides}/${name}` }
  if (e.verbs.some((v) => v.name === `${e.provides}/${name}`)) return { t: 'call', verb: `${e.provides}/${name}` }
  if (e.reads.some((r) => matchRead(r.path, name))) return { t: 'read', path: `/${e.provides}/${name}` }
  return undefined
}

/** What an extension offers `tower x`, by kind, for a name it doesn't offer. */
const offeredLine = (e: ExtensionView): string => {
  const kinds = [
    ['doors', doorsOf(e).map((f) => `${FACT_DOOR}${f.name}`)],
    ['verbs', e.verbs.map((v) => v.name.slice(e.provides.length + 1))],
    ['reads', e.reads.map((r) => r.path)],
  ].filter(([, names]) => names.length)
  return kinds.length ? `it offers ${kinds.map(([kind, names]) => `${kind} ${(names as string[]).join(', ')}`).join('; ')}` : 'it offers no door, verb or read'
}

const isUrl = (target: string) => /^https?:\/\//.test(target)

const shownOf = (command: 'show' | 'open', target: string | undefined, title: string | undefined): Omit<Shown, 'at'> => {
  if (!target) throw new CliError(usageLine(command))
  if (command === 'open') {
    if (!isUrl(target)) throw new CliError(`"${target}" is no http(s) URL: \`tower show\` puts a file in front of the user`)
    return { kind: 'link', target, title }
  }
  if (isUrl(target)) return { kind: 'url', target, title }
  const file = path.resolve(target)
  if (!existsSync(file)) throw new CliError(`No file at ${file}`)
  return { kind: 'file', target: realpathSync(file), title }
}

type Failure = { t: 'error'; code: string; message: string }

/** POSTs are taken only from the tower's own origin. */
const ask = async <T>(verb: string, body: unknown): Promise<T | Failure> => {
  const res = await fetch(`${towerAt()}/${verb}`, { method: 'POST', headers: { origin: towerAt(), 'content-type': 'application/json', ...callerHeaders(me) }, body: JSON.stringify(body) })
  return (await res.json()) as T | Failure
}

const isFailure = (reply: unknown): reply is Failure => (reply as Failure).t === 'error'

const refusedLine = (verb: string, failure: Failure) => `The tower refused ${verb}: ${failure.message}`

const command = async <T>(verb: string, body: unknown): Promise<T> => {
  const reply = await ask<T>(verb, body)
  if (isFailure(reply)) throw new CliError(refusedLine(verb, reply))
  return reply
}

/** A call made by this session, when a session makes it. */
const withBy = <V extends string, I extends object>([verb, body]: [V, I]): [V, I & { by?: string }] => [verb, { ...body, ...(me && { by: me }) }]

const ownFloor = (board: Board, me: string | undefined): Floor => board.floors.find((f) => f.id === ownCard(board, me).project)!

const collectionOf = (floor: Floor, name: string): FloorCollection => {
  const collection = floor.collections.find((c) => c.id === name)
  if (!collection)
    throw new CliError(
      [`${floorTitle(floor)} keeps no collection "${name}".`, ...collectionsLines(floor)].join('\n'),
      `a collection is declared under projects.${floor.id}.collections (this floor) or collections (every floor) in the tower's config, the file \`tower whoami\` names; \`tower config check\` checks the edit`,
    )
  return collection
}

const readItem = async (floor: Floor, collection: string, id: string): Promise<string> => {
  const res = await fetch(`${towerAt()}/collection/${floor.id}/${collection}/${encodeURIComponent(id)}`)
  if (!res.ok) throw new CliError(`The tower answered ${res.status} for ${collection}/${id}: ${await res.text()}`)
  return res.text()
}

const itemLines = (collection: FloorCollection, item: FloorItem, title: string | undefined, now: number) => [
  `  ${item.tag}  ·  ${[title?.slice(0, 80) ?? '(untitled)', `edited ${ago(now - item.modifiedAt)} ago`, sizeOf(item.size), `kept by ${item.keptBy?.callsign ?? 'unknown'}`].join('  ·  ')}`,
  `    ${collection.dir}/${item.id}`,
]

/** A collection in a list of them: its id, label and what it is for. */
export const collectionLine = (collection: FloorCollection): string =>
  `  ${[collection.id, collection.label, collection.description ?? '(no description)'].join('  ·  ')}`

const LATEST_KEPT = 5

/** A collection's heading and the lines of `items`, the ones of it to show. */
const collectionLines = async (floor: Floor, collection: FloorCollection, items: FloorItem[], now: number): Promise<string[]> => {
  const titles = await Promise.all(items.map(async (i) => (titled(i.id) ? titleIn(i.id, await readItem(floor, collection.id, i.id)) : undefined)))
  return [
    `${collection.label} ("${collection.id}"): ${collection.items.length} item${collection.items.length === 1 ? '' : 's'}`,
    ...(collection.description ? [`  ${collection.description}`] : []),
    ...items.flatMap((item, n) => itemLines(collection, item, titles[n], now)),
  ]
}

const latestFirst = (items: FloorItem[]): FloorItem[] => [...items].sort((a, b) => b.modifiedAt - a.modifiedAt)

/** Every collection with its count and its latest items, and how to list the rest of one. */
const overviewLines = async (floor: Floor, now: number): Promise<string[]> => {
  const sections = await Promise.all(floor.collections.map((c) => collectionLines(floor, c, latestFirst(c.items).slice(0, LATEST_KEPT), now)))
  const more = floor.collections.filter((c) => c.items.length > LATEST_KEPT)
  return [
    sections.map((lines) => lines.join('\n')).join('\n\n'),
    ...(more.length ? ['', `The latest ${LATEST_KEPT} of each. \`tower kept <collection>\` lists every item of one: ${more.map((c) => `${c.id} has ${c.items.length}`).join(', ')}.`] : []),
  ]
}

/** An item by its tag or its id. A tag two items share names neither. */
const itemNamed = (floor: Floor, name: string): { collection: FloorCollection; item: FloorItem } => {
  const found = floor.collections.flatMap((collection) => collection.items.filter((i) => i.id === name || i.tag === name).map((item) => ({ collection, item })))
  if (!found.length) throw new CliError(`No item "${name}" on ${floorTitle(floor)}. \`tower kept\` lists them.`)
  if (found.length > 1) throw new CliError(`"${name}" is the tag of ${found.map((f) => `${f.collection.id}/${f.item.id}`).join(' and ')}: name one by its id`)
  return found[0]
}

const KEEP_USAGE = `${usageLine('keep')}, or the markdown on stdin`

/** `[file] [name <words>]`: the file to keep, stdin without one, and the words its id is named by. */
const keepArgs = (args: string[]): { file?: string; name?: string } => {
  const at = args.indexOf('name')
  const file = at === 0 ? undefined : args[0]
  if ((at === -1 && args.length > 1) || at > 1 || (at >= 0 && at === args.length - 1)) throw new CliError(KEEP_USAGE)
  return { file, name: at === -1 ? undefined : args.slice(at + 1).join(' ') }
}

/** What an item is made of. `name`: a file's base name, or the title of markdown on stdin. */
const keepContent = async (file: string | undefined): Promise<{ ext: string; content: string; name: string | undefined }> => {
  if (file) {
    const resolved = path.resolve(file)
    if (!existsSync(resolved)) throw new CliError(`No file at ${resolved}`)
    const ext = path.extname(resolved).slice(1)
    if (!ext) throw new CliError(`${resolved} has no extension: the item's type is its extension`)
    return { ext, content: readFileSync(resolved, 'utf8'), name: path.basename(resolved, `.${ext}`) }
  }
  if (process.stdin.isTTY) throw new CliError(KEEP_USAGE)
  const content = await readStdin()
  return { ext: 'md', content, name: titleIn('stdin.md', content) }
}

/**
 * What the reviews extension says of a checkout's thread read as `reader` (its read `said/<project>`): the file's text,
 * `undefined` while nobody wrote on it, the notes new to the reader, the lines `tower thread` prints after it (or in its
 * place), and with `sender`, the prompt Send types.
 */
type ThreadSaid = { text?: string; unseen: number[]; lines: string[]; send?: string }

const threadSaid = async (floor: Floor, query: { checkout: string; reader: string; sender?: string; hirer?: string }): Promise<ThreadSaid> => {
  collectionOf(floor, REVIEWS)
  const params = new URLSearchParams(Object.entries(query).filter((e): e is [string, string] => e[1] !== undefined))
  const res = await towerGet(`/reviews/said/${floor.id}?${params}`)
  if (!res.ok) throw new CliError(`The tower answered ${res.status} for the thread of ${query.checkout}: ${await res.text()}`)
  return (await res.json()) as ThreadSaid
}

const NOTE_USAGE = `${usageLine('note')}, the body on stdin`
const ANCHOR_ARG = /^([^:\s]+):(.+):(\d+)(?:-(\d+))?$/

type NoteArgs = { on?: string; re?: number; anchors: Omit<Anchor, 'quote'>[]; resolves?: number[] }

const NOTE_NUMBER = /^n?\d+$/

const noteArgs = (args: string[]): NoteArgs => {
  const note: NoteArgs = { anchors: [] }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === 'on' && args[i + 1]) note.on = args[++i]
    else if (args[i] === 're' && NOTE_NUMBER.test(args[i + 1] ?? '')) note.re = Number(args[++i].replace(/^n/, ''))
    else if (args[i] === 'resolve') {
      note.resolves = []
      while (NOTE_NUMBER.test(args[i + 1] ?? '')) note.resolves.push(Number(args[++i].replace(/^n/, '')))
      if (!note.resolves.length) throw new CliError(`resolve names the notes it resolves (resolve n3 n4). ${NOTE_USAGE}`)
    }
    else {
      const anchor = ANCHOR_ARG.exec(args[i])
      if (!anchor) throw new CliError(`"${args[i]}" is no anchor. ${NOTE_USAGE}`)
      const [, repo, path, from, to] = anchor
      note.anchors.push({ repo, path, from: Number(from), to: Number(to ?? from) })
    }
  }
  if (note.resolves && (note.re !== undefined || note.anchors.length)) throw new CliError(`A resolution answers no note and quotes no lines. ${NOTE_USAGE}`)
  return note
}

/** The repos a note's anchors on `checkout` name, as `tower note` takes them. */
const anchorLine = (floor: Floor, checkout: string): string =>
  `A note's anchors name one of the checkout's repos: ${checkoutDirs(floor, checkout).map((d) => `${repoName(d)}:<path>:<from>-<to>`).join(', ')}.`

/** An anchor with its lines, read from the checkout's copy of the repo. */
const quoted = (floor: Floor, checkout: string, anchor: Omit<Anchor, 'quote'>): Anchor => {
  const dirs = checkoutDirs(floor, checkout)
  const dir = dirs.find((d) => repoName(d) === anchor.repo)
  if (!dir) throw new CliError(`Checkout ${checkout} has no repo "${anchor.repo}": it has ${dirs.map(repoName).join(', ')}`)
  const file = path.join(dir, anchor.path)
  if (!existsSync(file)) throw new CliError(`No file at ${file}`)
  const text = readFileSync(file, 'utf8')
  const lines = (text.endsWith('\n') ? text.slice(0, -1) : text).split('\n')
  if (anchor.from > anchor.to || anchor.to > lines.length) throw new CliError(`${anchor.repo}:${anchor.path} has ${lines.length} lines: ${anchor.from}-${anchor.to} isn't a range of them`)
  return { ...anchor, quote: { lang: langOf(anchor.path), lines: lines.slice(anchor.from - 1, anchor.to) } }
}

const HIRE_USAGE = `${usageLine('hire')}, the prompt on stdin when no item names it`
const HIRE_FIELDS = ['model', 'effort', 'callsign', 'name', 'base'] as const

type HireArgs = { item?: string; floor?: string; fields: Partial<Pick<SpawnForm, (typeof HIRE_FIELDS)[number]>> }

const hireArgs = (args: string[]): HireArgs => {
  const hire: HireArgs = { fields: {} }
  for (let i = 0; i < args.length; i++) {
    const field = HIRE_FIELDS.find((f) => f === args[i])
    if (field && args[i + 1]) hire.fields[field] = args[++i]
    else if (args[i] === 'floor' && args[i + 1]) hire.floor = args[++i]
    else if (!hire.item) hire.item = args[i]
    else throw new CliError(`"${args[i]}" is a second item. ${HIRE_USAGE}`)
  }
  return hire
}

/** The floor a hire works on: the one named, else the hirer's own. */
const hireFloor = (board: Board, own: Floor, id: string | undefined): Floor => {
  if (id === undefined) return own
  const floor = board.floors.find((f) => f.id === id)
  if (!floor) throw new CliError(`No floor is called "${id}". The floors: ${board.floors.map(floorTitle).join(', ')}.`)
  return floor
}

/** A session's callsign as the tower names it: from the names in the config the board was read from. */
const callsignOn = (board: Board, id: string) => callsignsOf(readConfig(board.config))(id)

/** `board`: read once the hire is counted, so it holds the hire's card and the callsign it runs under. */
const hiredLines = (board: Board, floor: Floor, reply: Replies['spawn'], form: SpawnForm): string[] => {
  const who = board.floors.flatMap((f) => f.cards).find((c) => c.id === reply.id)!.callsign
  const place = reply.cut
    ? `in worktree ${reply.cut.name}, on branch ${reply.cut.branch}, cut from ${[...new Set(reply.cut.bases.map((b) => b.base))].join(', ')}`
    : `in ${form.where === 'worktree' ? form.worktree : form.checkout}, beside whoever works there`
  return [
    `Hired ${who}, session ${reply.id}, on ${floorTitle(floor)}, ${place}.`,
    `\`tower agent ${who}\` follows its work; once its Claude is up, \`tower agents\` names how to message it.`,
  ]
}

type JsonSchema = { description?: string }
type ApiSchema = { v: string; flows: Flow[]; verbs: Record<string, { input: JsonSchema; reply: JsonSchema }>; reads: Record<string, { path: string; kind: 'json' | 'stream' | 'page' | 'schema' | 'file'; query?: JsonSchema }>; streams: Record<string, { description: string; read?: string; message?: object }> }

const apiLines = (schema: ApiSchema): string[] => {
  const width = Math.max(...[...Object.keys(schema.verbs), ...Object.keys(schema.reads), ...Object.keys(schema.streams)].map((name) => name.length))
  const line = (name: string, { description }: JsonSchema) => `  ${name.padEnd(width)}  ${description ?? ''}`.trimEnd()
  return [
    `The tower's API ${schema.v}, at ${towerAt()}. \`tower api <name>\` prints one verb's or read's JSON Schema.`,
    '',
    `Verbs: POST /<verb>, a JSON body, the header \`origin: ${towerAt()}\`.`,
    ...Object.entries(schema.verbs).map(([name, { input }]) => line(name, input)),
    '',
    'Reads: GET /<read>?<query>.',
    ...Object.entries(schema.reads).filter(([, { kind }]) => kind === 'json').map(([name, { path, query }]) => line(name, { description: [path, query?.description].filter(Boolean).join('  ') })),
    '',
    'Streams: GET, server-sent events. `tower api board` prints how to read the board and its message schema.',
    ...Object.entries(schema.streams).map(([name, { description }]) => line(name, { description })),
  ]
}

/** Who takes part where, as `GET /extensions` reads it, with the capabilities off on the floor asked about left out. */
type Takers = Pick<Reads['extensions'], 'chains' | 'answers' | 'launchers'> & { on: (cap: string) => boolean }

const takersOf = (read: Reads['extensions'], floor: string | undefined): Takers => {
  const off = new Set(read.extensions.filter((e) => floor !== undefined && e.off?.includes(floor)).map((e) => e.provides))
  return { chains: read.chains, answers: read.answers, launchers: read.launchers, on: (cap) => !off.has(cap) }
}

const ruleOf = (stage: OpenStage) => `${stage.combine}${stage.required ? ', required' : ''}`

/** Who answers an open stage: the core first when it answers there, then the extensions that do. */
const answerersOf = (stage: OpenStage, takers: Takers): string[] => {
  const extensions = stage.planned ? [] : stage.hook ? (takers.answers[stage.hook] ?? []) : takers.launchers
  return [...(stage.core ? [`tower (${stage.core})`] : []), ...extensions.filter(takers.on)]
}

/** A flow in one line: its verb, its words and its open stages. */
const flowLine = (flow: Flow, width: number): string => {
  const open = flow.stages.filter((s): s is OpenStage => s.kind === 'open').map((s) => `${s.name} ${ruleOf(s)}${s.planned ? ' (planned)' : ''}`)
  return `  ${flow.verb.padEnd(width)}  ${flow.words.label}${open.length ? ` · ${open.join(' · ')}` : ''}`
}

/** Every stage of a flow, as `tower flows <verb>` prints it: ⟳ wrapped, ◆ open, · sealed. */
const flowLines = (flow: Flow, takers: Takers): string[] => {
  const width = Math.max(...flow.stages.map((s) => s.name.length))
  const links = (takers.chains[`tower/${flow.verb}`] ?? []).filter(takers.on)
  const stageLine = (stage: Stage): string[] => {
    const name = stage.name.padEnd(width)
    if (stage.kind === 'sealed') return [`  · ${name}  sealed: ${stage.why}`]
    if (stage.kind === 'wrapped') return [`  ⟳ ${name}  ${links.length ? `${links.join(', ')}${stage.name === 'around' ? ' (outermost first)' : ''}` : 'no links'}`]
    const answerers = answerersOf(stage, takers)
    const who = answerers.length ? answerers.join(', ') : stage.absent ? `${stage.absent.label}${stage.absent.hint ? `: ${stage.absent.hint}` : ''}` : 'nobody answers'
    return [
      `  ◆ ${name}  ${ruleOf(stage)}${stage.planned ? ', planned: not raised yet' : ''} · ${who}`,
      ...(stage.hook ? [`    ${' '.repeat(width)}  ${stage.planned ? 'will be raised as' : 'answered as'} ${stage.hook}${stage.deadline ? ` within ${stage.deadline} s` : ''}${stage.field ? `, named in the reply's ${stage.field}` : ''}`] : []),
      ...(stage.how ? [`    ${' '.repeat(width)}  ${stage.how}`] : []),
    ]
  }
  return [
    `${flow.verb} · ${flow.words.label}`,
    ...flow.stages.flatMap(stageLine),
    ...(flow.composes ? [`  calls ${flow.composes.join(', ')} through the dispatch, each wrapped on its own`] : []),
  ]
}

/** A call the policies extension offers on a policy or an offer: its verb, qualified, and its input. */
type Called = { calls: Partial<Record<string, [verb: string, input: object]>> }

/** The policies extension's part of a floor: each policy's view and the open offers, and the run a card is. */
type PoliciesPart = { policies: (PolicyFields & (ValidPolicy | InvalidPolicy) & Called)[]; offers: (OfferFields & Called)[] }

const policiesOf = (floor: Floor): PoliciesPart => (floor.x?.[POLICIES] as PoliciesPart | undefined) ?? { policies: [], offers: [] }

const runOf = (card: Card) => (card.x?.[POLICIES] as { run?: CardRun } | undefined)?.run

/**
 * What the policies extension says of a floor's policies (its read `said/<project>`): `tower policies`' lines and where
 * each stands, and `tower runs`' lines for `policy`'s latest `runs`.
 */
type Said = { lines: string[]; standing: Record<string, string>; runs?: string[] }

const said = async (project: string, runs?: { policy: string; limit: number }): Promise<Said> => {
  const res = await towerGet(`/policies/said/${project}${runs ? `?policy=${encodeURIComponent(runs.policy)}&runs=${runs.limit}` : ''}`)
  if (!res.ok) throw new CliError(`The tower answered ${res.status} for ${runs ? `the runs of ${runs.policy}` : `the policies of ${project}`}: ${await res.text()}`)
  return res.json()
}

/** A policy of the floor by its tag or its id. */
const policyNamed = (floor: Floor, name: string): PoliciesPart['policies'][number] => {
  const { policies } = policiesOf(floor)
  const policy = policies.find((p) => p.id === name || p.tag === name)
  if (!policy)
    throw new CliError(
      policies.length ? `No policy "${name}" on ${floorTitle(floor)}. \`tower policies\` lists them.` : `${floorTitle(floor)} has no policies.`,
      `a policy is a markdown item of the floor's \`policies\` collection: \`tower keep policies\`, and the handbook's "Policies and runs" says what it holds`,
    )
  return policy
}

const RUNS_SHOWN = 5
const RUNS_MOST = 20

const runsArgs = (args: string[]): { policy?: string; limit: number } => {
  const at = args.indexOf('--limit')
  const limit = at === -1 ? RUNS_SHOWN : Number(args[at + 1])
  if (at !== -1 && !(Number.isInteger(limit) && limit > 0)) throw new CliError(usageLine('runs'))
  if (limit > RUNS_MOST) throw new CliError(`tower runs shows at most ${RUNS_MOST} runs: \`tower agent <CALLSIGN>\` reads any run's worker in full`)
  const rest = at === -1 ? args : [...args.slice(0, at), ...args.slice(at + 2)]
  if (rest.length > 1) throw new CliError(usageLine('runs'))
  return { policy: rest[0], limit }
}

const showOrOpen =
  (verb: 'show' | 'open'): Run =>
  async ([target, ...title]) => {
    if (!me) throw new CliError('TOWER_SESSION_ID is not set: this Claude was not started by the tower')
    const shown = shownOf(verb, target, title.join(' ') || undefined)
    await command('fact', { name: 'show', value: shown })
    console.log(verb === 'show' ? `Shown to the user beside this session: ${shown.target}` : `The user is asked to open ${shown.target}`)
  }

export const WORKER_RUNS: Record<VerbOf<'worker'>, Run> = {
  api: async ([name]) => {
    const schema: ApiSchema = await (await towerGet('/schema')).json()
    if (!name) {
      console.log(apiLines(schema).join('\n'))
      return
    }
    const one = schema.verbs[name] ?? schema.streams[name] ?? schema.reads[name]
    if (!one) throw new CliError(`The API has no verb, read or stream "${name}"`, '`tower api` lists them')
    console.log(JSON.stringify(one, null, 2))
  },
  flows: async (args) => {
    const at = args.indexOf('--floor')
    const floor = at === -1 ? undefined : args[at + 1]
    const rest = at === -1 ? args : [...args.slice(0, at), ...args.slice(at + 2)]
    if ((at !== -1 && !floor) || rest.length > 1) throw new CliError(usageLine('flows'))
    if (floor && !Object.hasOwn(readConfig(configPath()).projects, floor)) throw new CliError(`No project "${floor}" in the config`)
    const [schema, read]: [ApiSchema, Reads['extensions']] = await Promise.all([(await towerGet('/schema')).json(), (await towerGet('/extensions')).json()])
    const takers = takersOf(read, floor)
    const [verb] = rest
    if (verb) {
      const flow = schema.flows.find((f) => f.verb === verb)
      if (!flow) throw new CliError(`The tower has no flow "${verb}"`, '`tower flows` lists them')
      console.log(flowLines(flow, takers).join('\n'))
      return
    }
    const width = Math.max(...schema.flows.map((f) => f.verb.length))
    console.log(
      [
        `Where extensions take part in each core verb${floor ? ` on ${floor}` : ''}: \`tower flows <verb>\` prints every stage and who takes part. Every verb is wrapped at both edges.`,
        ...schema.flows.map((f) => flowLine(f, width)),
      ].join('\n'),
    )
  },
  whoami: async () => {
    console.log(whoami(await readBoard(), me).join('\n'))
  },
  agents: async ([all]) => {
    const board = await readBoard()
    const floors = all === '--all' ? board.floors.filter((f) => f.cards.some((c) => c.onDuty)) : [board.floors.find((f) => f.id === ownCard(board, me).project)!]
    const hiresEverywhere = hiresBy(board.floors.flatMap((f) => f.cards))
    console.log(floors.map((f) => floorLines(f, hiresEverywhere, me, now).join('\n')).join('\n\n'))
  },
  agent: async ([callsign]) => {
    if (!callsign) throw new CliError(usageLine('agent'))
    const board = await readBoard()
    const card = await cardNamed(board, callsign)
    const floor = board.floors.find((f) => f.id === card.project)!
    const onBoard = board.floors.flatMap((f) => f.cards)
    const cards = floor.cards.includes(card) ? onBoard : [...onBoard, ...(await readArchive(floor.id))]
    console.log(agent(board, card, cards, await readThreads(card.id), now).join('\n'))
  },
  probes: async ([sub, name]) => {
    if (!sub) {
      console.log((await readBoard()).x?.quota ? (await quotaSaid()).line : 'quota probe · not running: tower extensions says why')
      return
    }
    if (sub !== 'run' || name !== 'quota') throw new CliError(usageLine('probes'))
    await command('quota/read-now', {})
    const said = await quotaSaid()
    if (!said.last) throw new CliError('The quota probe read, then stopped answering before it said what the read came to', '`tower extensions` says why')
    console.log(said.last)
  },
  extensions: async ([sub, arg, ...rest]) => {
    if (!sub) {
      const read: Reads['extensions'] = await (await towerGet('/extensions')).json()
      console.log(read.extensions.length ? read.extensions.flatMap(extensionCliLines).join('\n') : 'The tower runs no extensions: the config adds them under extensions (docs/config.md).')
      return
    }
    if (!['restart', 'check', 'freeze'].includes(sub) || !arg || rest.length) throw new CliError(usageLine('extensions'))
    if (sub === 'freeze') {
      const frozen = freezeFolder(path.resolve(arg))
      console.log(`Wrote ${frozen.file}: ${frozen.names} names of ${frozen.provides} at major ${frozen.major}.`)
      return
    }
    if (sub === 'check') {
      const views = await fetch(`${towerAt()}/extensions`).then(
        async (res): Promise<Reads['extensions']['extensions']> => ((await res.json()) as Reads['extensions']).extensions,
        () => undefined,
      )
      const config = readConfig(configPath())
      const { id, problems, manifest } = await checkFolder(path.resolve(arg), config, views)
      for (const p of problems) console.log(`${{ error: 'error', warn: 'warn ', info: 'note ' }[p.level]}  ${problemLine(p)}`)
      if (manifest) {
        const why = (r: Renderer) => (r.problem ? `its ${r.problem}` : r.available ? undefined : "isn't built: build it for its renderer.json to be read")
        const drawers = [...renderersOf(config).map((r) => ({ name: r.name, regions: r.regions, why: why(r), kit: r.kit })), { name: 'cli', regions: CLI_REGIONS }]
        for (const l of landing(drawers, { ...manifest, cap: capabilityOf(manifest) })) console.log(`lands  ${landingLine(l)}`)
      }
      if (!views) console.log(`note   not resolved against a running tower: none answers at ${towerAt()}`)
      const errors = problems.filter((p) => p.level === 'error').length
      if (errors) throw new CliError(`${id} would not load: ${plural(errors, 'error')}`)
      console.log(`${id} checks out.`)
      return
    }
    const { state } = await command<Replies['extension/restart']>('extension/restart', { id: arg })
    console.log(state === 'started' ? `${arg} restarted.` : `${arg} is ${EXTENSION_STATE_NAME[state]}: \`tower extensions\` says why.`)
  },
  x: async ([cap, verb, input, ...rest]) => {
    if (!cap) {
      const read: Reads['extensions'] = await (await towerGet('/extensions')).json()
      const calling = read.extensions.filter((e) => e.state === 'started' && (e.verbs.length || e.reads.length || doorsOf(e).length))
      console.log(calling.length ? calling.flatMap(extensionCallLines).join('\n') : 'No running extension has doors, verbs or reads: `tower extensions` lists every extension and its state.')
      return
    }
    if (!verb || rest.length) throw new CliError(usageLine('x'))
    let body: unknown
    try {
      body = input === undefined ? {} : JSON.parse(input)
    } catch {
      throw new CliError(`The input is no JSON: ${input}`, `${usageLine('x')}, the input one argument: '{"project": "app"}'`)
    }
    const read: Reads['extensions'] = await (await towerGet('/extensions')).json()
    const e = read.extensions.find((x) => x.provides === cap && x.state === 'started')
    const target = e && xTarget(e, verb)
    if (e && !target) throw new CliError(`${cap} offers no "${verb}": ${offeredLine(e)}`)
    if (!target || target.t === 'call') {
      console.log(JSON.stringify(await command(target?.verb ?? `${cap}/${verb}`, body), null, 2))
      return
    }
    if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new CliError(`A read's input is its query, an object: ${input}`, `${usageLine('x')}, the input one argument: '{"project": "app"}'`)
    const query = new URLSearchParams(Object.entries(body).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)])).toString()
    const res = await towerGet(`${target.path}${query ? `?${query}` : ''}`)
    if (!res.headers.get('content-type')?.includes('json')) {
      process.stdout.write(Buffer.from(await res.arrayBuffer()))
      return
    }
    const reply: unknown = await res.json()
    if (isFailure(reply)) throw new CliError(refusedLine(`${cap}/${verb}`, reply))
    console.log(JSON.stringify(reply, null, 2))
  },
  policies: async ([sub, tagOrId]) => {
    const board = await readBoard()
    const floor = ownFloor(board, me)
    if (!sub) {
      if (!policiesOf(floor).policies.length) {
        console.log(`${floorTitle(floor)} has no policies.`)
        return
      }
      console.log((await said(floor.id)).lines.join('\n'))
      return
    }
    if ((sub !== 'approve' && sub !== 'run') || !tagOrId) throw new CliError(usageLine('policies'))
    const policy = policyNamed(floor, tagOrId)
    const name = `"${policy.title ?? policy.tag}" (${policy.tag})`
    const standing = async () => (await said(floor.id)).standing[policy.id]
    if (sub === 'approve') {
      if (!policy.header) throw new CliError(`${name} is invalid: ${await standing()}`)
      const approve = policy.calls.approve
      if (!approve) throw new CliError(`${name} is approved as it is now (${shortHash(policy.hash)})`)
      await command(...withBy(approve))
      const words = policy.header.start === 'auto' ? 'It starts on its own at its slots while its file stays as it is now: any edit needs a new approval.' : 'It is `start: "ask"`: its slots stay offers until it says `"auto"`.'
      console.log(`Approved ${name} at ${shortHash(policy.hash)}: ${policy.rule}. ${words}`)
      return
    }
    if (!policy.header) throw new CliError(`${name} is invalid: ${await standing()}`)
    const offer = policiesOf(floor).offers.find((o) => o.policy === policy.id)
    const call = offer?.calls.accept ?? policy.calls.run
    if (!call) throw new CliError(`${name} can't be run now: ${await standing()}${policy.live.length >= policy.header.live ? ` (live ${policy.live.length}/${policy.header.live})` : ''}`)
    const ran = await command<Replies['policy/run']>(...withBy(call))
    console.log(`Started run ${ran.n} of ${name}${offer ? `, for its offered slot ${slotWords(offer.slot, policy.header.when.tz, now)}` : ', by hand'}: ${callsignOn(board, ran.id)}, session ${ran.id}. \`tower agent ${callsignOn(board, ran.id)}\` follows it.`)
  },
  runs: async (words) => {
    const args = runsArgs(words)
    const board = await readBoard()
    const floor = ownFloor(board, me)
    const own = runOf(ownCard(board, me))
    if (!args.policy && !own) throw new CliError(`You are no run of a policy: name one. ${usageLine('runs')}`)
    const id = args.policy ? policyNamed(floor, args.policy).id : own!.policy
    console.log((await said(floor.id, { policy: id, limit: args.limit })).runs!.join('\n'))
  },
  show: showOrOpen('show'),
  open: showOrOpen('open'),
  reveal: async ([target]) => {
    if (!target) throw new CliError(usageLine('reveal'))
    await command('reveal', { path: path.resolve(target) })
    console.log(`Revealed in Finder: ${path.resolve(target)}`)
  },
  edit: async ([target, lineWord]) => {
    if (!target) throw new CliError(usageLine('edit'))
    const line = lineWord === undefined ? undefined : Number(lineWord)
    if (line !== undefined && !(Number.isInteger(line) && line > 0)) throw new CliError(`"${lineWord}" is no line number. ${usageLine('edit')}`)
    await command('edit', { path: path.resolve(target), line })
    console.log(`Opened in the user's editor: ${path.resolve(target)}${line ? `:${line}` : ''}`)
  },
  keep: async ([collectionName, ...rest]) => {
    if (!me) throw new CliError('TOWER_SESSION_ID is not set: this Claude was not started by the tower')
    const floor = ownFloor(await readBoard(), me)
    if (!collectionName) {
      console.log([`${floorTitle(floor)} keeps ${floor.collections.length ? 'these collections:' : 'no collections.'}`, ...floor.collections.map(collectionLine), KEEP_USAGE].join('\n'))
      return
    }
    const collection = collectionOf(floor, collectionName)
    const args = keepArgs(rest)
    const { ext, content, name } = await keepContent(args.file)
    const { id } = await command<{ id: string }>('collection/create', { project: floor.id, collection: collection.id, name: args.name ?? name, ext, content })
    const announced = await ask('fact', { name: 'keep', value: { project: floor.id, collection: collection.id, id } })
    const title = titleIn(id, content)
    console.log(`Kept ${title ? `"${title}" ` : ''}in ${collection.label} on ${floorTitle(floor)} as ${tagOf(id)}: ${collection.dir}/${id}`)
    if (isFailure(announced)) throw new CliError(`The item is kept, but its card won't name you as its keeper: ${refusedLine('fact', announced)}`, 'it needs no second keep: `tower kept` lists it')
  },
  kept: async ([collectionName]) => {
    const floor = ownFloor(await readBoard(), me)
    if (!floor.collections.length) throw new CliError(`${floorTitle(floor)} keeps no collections`)
    if (collectionName) {
      const collection = collectionOf(floor, collectionName)
      console.log((await collectionLines(floor, collection, collection.items, now)).join('\n'))
    } else console.log((await overviewLines(floor, now)).join('\n'))
  },
  read: async ([tagOrId]) => {
    if (!tagOrId) throw new CliError(usageLine('read'))
    const floor = ownFloor(await readBoard(), me)
    const { collection, item } = itemNamed(floor, tagOrId)
    process.stdout.write(await readItem(floor, collection.id, item.id))
  },
  thread: async ([named]) => {
    const board = await readBoard()
    const card = ownCard(board, me)
    const floor = ownFloor(board, me)
    const checkout = named ?? threadCheckoutOf(card)
    const { text, lines } = await threadSaid(floor, { checkout, reader: card.callsign })
    if (text !== undefined) process.stdout.write(text.endsWith('\n') ? `${text}\n` : `${text}\n\n`)
    console.log(lines.join('\n'))
    console.log(anchorLine(floor, checkout))
  },
  note: async (args) => {
    const note = noteArgs(args)
    if (process.stdin.isTTY && !note.resolves) throw new CliError(NOTE_USAGE)
    const body = process.stdin.isTTY ? '' : await readStdin()
    const board = await readBoard()
    const card = ownCard(board, me)
    const floor = ownFloor(board, me)
    const checkout = note.on ?? threadCheckoutOf(card)
    if (note.resolves) {
      const { n } = await command<{ n: number }>('reviews/resolve', { project: floor.id, checkout, author: card.callsign, notes: note.resolves, body })
      return console.log(`Resolved ${note.resolves.map((k) => `n${k}`).join(', ')} with n${n} on the thread of checkout ${checkout}: ${collectionOf(floor, REVIEWS).dir}/${threadId(checkout)}`)
    }
    const anchors = note.anchors.map((a) => quoted(floor, card.worktree?.from === checkout ? card.checkout : checkout, a))
    const { n } = await command<{ n: number }>('reviews/append', { project: floor.id, checkout, author: card.callsign, re: note.re, anchors, body })
    console.log(`Noted as n${n} on the thread of checkout ${checkout}${note.re ? `, answering n${note.re}` : ''}: ${collectionOf(floor, REVIEWS).dir}/${threadId(checkout)}`)
  },
  review: async ([callsign, word]) => {
    if (!callsign) throw new CliError(usageLine('review'))
    if (!me) throw new CliError('TOWER_SESSION_ID is not set: this Claude was not started by the tower')
    const board = await readBoard()
    const author = await cardNamed(board, callsign)
    const tell = word === 'tell'
    const hired = await ask<{ id: string; cut: { name: string } }>('reviews/hire', { project: author.project, of: author.callsign, by: me, tell })
    if (isFailure(hired)) throw new CliError(hired.message, landedFix(author))
    console.log(`${callsignOn(board, hired.id)} reviews ${author.callsign}'s work in worktree ${hired.cut.name}, a fork of checkout ${author.checkout}. ${tell ? `It sends its notes to ${author.callsign} when done.` : 'Its notes wait on the thread for the user.'}`)
  },
  hire: async (args) => {
    const hire = hireArgs(args)
    if (!hire.item && process.stdin.isTTY) throw new CliError(HIRE_USAGE)
    if (!me) throw new CliError('TOWER_SESSION_ID is not set: this Claude was not started by the tower')
    const board = await readBoard()
    const own = ownFloor(board, me)
    const floor = hireFloor(board, own, hire.floor)
    if (!can(floor, 'spawn')) throw new CliError('The tower offers no spawn: its host is down. The user starts it with `tower up`.')
    const named = hire.item ? itemNamed(own, hire.item) : undefined
    const prompt = named ? await readItem(own, named.collection.id, named.item.id) : await readStdin()
    if (!prompt.trim()) throw new CliError(`The prompt is empty: a hired worker starts on one. ${HIRE_USAGE}`)
    const form = { ...spawnDefaults(floor, prompt), ...hire.fields }
    const [[verbName, body], given] = spawnCall(floor, form)
    const reply = await ask<Replies['spawn']>(verbName, { ...body, ...given, by: me, hire: true })
    if (isFailure(reply) && reply.code === 'limited') throw new CliError(`${reply.message}. Tell the user what you would hire and why. \`tower review\` is never limited.`)
    if (isFailure(reply)) throw new CliError(refusedLine(verbName, reply))
    console.log(hiredLines(await readBoard(), floor, reply, form).join('\n'))
  },
  home: async ([callsign]) => {
    if (!callsign) throw new CliError(usageLine('home'))
    const board = await readBoard()
    const card = await cardNamed(board, callsign)
    if (card.id === me) {
      await command('fact', { name: 'leave' })
      const crew = crewOf(board.floors.flatMap((f) => f.cards), card).filter((c) => c.live)
      console.log(`You go home when this turn ends${crew.length ? `, with ${crew.map((c) => c.callsign).join(', ')} under you` : ''}; your last answer is kept, and you can be resumed. A prompt before then keeps you on duty.`)
      return
    }
    const calls = callOf(card, 'send-home')
    if (!calls) throw new CliError(`${card.callsign} is ${statusName(card)}: only a worker whose session runs can be sent home. \`tower agents --all\` shows who is on duty.`)
    for (const [verbName, body] of calls) await command(verbName, { ...body, by: me })
    const sent = [card, ...crewOf(board.floors.flatMap((f) => f.cards), card)].filter((c) => calls.some(([, { id }]) => id === c.id))
    console.log(`Sent home ${sent.map((c) => c.callsign).join(', ')}: ${sent.length === 1 ? 'its session ended, and it can' : 'their sessions ended, and each can'} be resumed.`)
  },
  'let-go': async ([callsign]) => {
    if (!callsign) throw new CliError(usageLine('let-go'))
    const card = await cardNamed(await readBoard(), callsign)
    const call = callOf(card, 'let-go')
    if (!call) throw new CliError(`${card.callsign} is ${statusName(card)}: only a stranded worker (stopped, killed or lost), on duty until it is resumed, is let go`)
    await command(...call)
    console.log(`Let ${card.callsign} go: it is off duty, and its conversation can still be resumed from the floor's archive.`)
  },
  send: async ([callsign]) => {
    if (!callsign) throw new CliError(usageLine('send'))
    const board = await readBoard()
    const sender = ownCard(board, me)
    const target = await cardNamed(board, callsign)
    if (!can(target, 'submit')) throw new CliError(`${target.callsign} isn't at its composer (${statusName(target)}): send once it is`)
    const floor = board.floors.find((f) => f.id === target.project)!
    const { text, unseen: notes, send } = await threadSaid(floor, { checkout: target.checkout, reader: target.callsign, sender: sender.callsign, hirer: target.hiredBy?.callsign })
    if (text === undefined) throw new CliError(`Checkout ${target.checkout} has no notes to send`)
    await command('submit', { id: target.id, text: send!, by: me })
    console.log(`Sent ${target.callsign} a pointer to ${notes.length ? notes.map((n) => `n${n}`).join(', ') : 'the thread'} on checkout ${target.checkout}.`)
  },
}
