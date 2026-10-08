/**
 * The tower's directory, the workers' verbs of the `tower` command (`src/cli.ts`): who this session is and who else
 * is on duty, read from the running tower's board, and the floor's collections. An agent reaches another through
 * Claude Code's own messaging, by the `peer` name listed here. The tower mod puts the command on every session's PATH
 * (`src/mod/bin/tower`).
 *
 *   tower api [name]     the API's verbs and reads, one line each, or one in full as JSON Schema
 *   tower whoami         this session: callsign, peer name, floor and its dirs, its worktree and branch if it has one,
 *                        the floor's shelf and collections, and the config's path
 *   tower agents         the workers on duty on this session's floor
 *   tower agents --all   the workers on duty on every floor
 *   tower agent <CALLSIGN>  one worker: its latest prompt and answer in full, per conversation
 *   tower show <file|url> [title]   put a file this session wrote, or a web page, in front of the user beside this session
 *   tower open <url> [title]        ask the user to open a page in a browser tab (one that can't be shown in place)
 *   tower reveal <path>             show a file or folder to the user selected in a Finder window
 *   tower edit <path> [line]        open a file or folder in the user's editor, a file at `line` if given
 *   tower keep <collection> [file]  a new item in one of the floor's collections, from a file or stdin (markdown)
 *   tower kept [collection]         the floor's collections: each item's tag, title, age, size, keeper and file
 *   tower read <tag|id>             one item of the floor's collections, in full
 *   tower thread [checkout]         the review thread about this session's work (a reviewer's is its author's), or another, and what is new to you
 *   tower note [on <checkout>] [re n<k>] [repo:path:lines …]   a message on the thread, the body on stdin, each anchor's
 *                                   lines quoted from the checkout's files as they are now (from your own, when it is a
 *                                   fork of that checkout: the version you read)
 *   tower send <CALLSIGN>           submit into a worker a pointer to the notes on its checkout's thread new to it
 *   tower review <CALLSIGN> [tell]  hire a reviewer of a worker's work, in a fork of its checkout (its card's `review`);
 *                                   with `tell`, the reviewer sends its notes to that worker when done
 *   tower home <CALLSIGN>          send a worker home with everyone under it: each that runs is killed (its card's `send-home`)
 *   tower let-go <CALLSIGN>        take a stranded worker (stopped or lost with the host) off duty, still resumable (its card's `let-go`)
 *   tower hire [<tag|id>] [model <m>] [effort <e>] [name <n>] [base origin/<b>]   start a worker on this floor, placed
 *                                   as a quick hire in a renderer places it, on a prompt: the text of an item of the
 *                                   floor's collections, or stdin; refused past the floor's `hiring` limits
 *
 * `show`, `open`, `keep`, `hire` and `review` are facts about this session: they go to the host, which logs them
 * (`tower.show`, `tower.keep`, `tower.hire`), and every renderer draws them from the board. An item is called by its tag, as
 * every renderer shows it.
 * Agents edit kept items in their files and never delete them: throwing one away is the user's. Review threads are
 * written only through `tower note`, which appends.
 */
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import type { Board, Card, Floor, FloorCollection, FloorItem } from './bridge/board.ts'
import type { Brief } from './bridge/turns.ts'
import type { Shown } from './bridge/facts.ts'
import type { Replies } from './shared/api.ts'
import type { BoardMsg } from './shared/shelf-page.ts'
import { ago, base, crewOf, crewTree, GIST_MARK, gistLine, hireRefusal, hiresOf, workerNamed, modelName, spawnCall, spawnDefaults, shelfSource, statusName, threadCheckoutOf, UNRESUMABLE_TITLE, type SpawnForm } from './shared/cards.ts'
import { callsignsOf, checkoutDirs, towerUrl, type ShelfEntry } from './shared/model.ts'
import { langOf, parseThread, repoName, REVIEWS, reviewPrompt, sendText, threadId, unseenBy, type Anchor } from './shared/reviews.ts'
import { tagOf } from './shared/tags.ts'
import { titled, titleIn } from './shared/titles.ts'
import { briefParts, sessionLabel, type BriefPart } from './shared/brief.ts'
import { configPath } from './shared/paths.ts'
import { readConfig } from './system.ts'
import { CliError } from './cli-error.ts'
import { SHELF_KINDS } from './shelf.ts'

const TOWER = towerUrl(readConfig(configPath()))

/** A reader that closed its end early (`tower read <tag> | head -1`) has all it asked for. */
process.stdout.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code !== 'EPIPE') throw err
  process.exit(0)
})

/** Stdin read as a stream to its end: a pipe whose writer hasn't written yet is waited on. */
const readStdin = async (): Promise<string> => {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

const towerGet = (route: string): Promise<Response> =>
  fetch(`${TOWER}${route}`).catch((err) => {
    throw new CliError(`No tower answers at ${TOWER} (${err.cause?.code ?? err.message})`, 'the user starts it with `tower up`')
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
    `${indent}  ${depth ? '└ ' : ''}${card.callsign}${card.id === me ? ' (you)' : ''}  ·  ${facts.join('  ·  ')}${depth ? `  ·  ${reportLine(card)}` : ''}`,
    `${indent}    in ${card.cwd}`,
    ...(gist ? [`${indent}    ${gist}`] : []),
  ]
}

/** Why a card offers no `review`, by what the card shows. */
const noReviewReason = (card: Card) =>
  !card.conversations.length
    ? 'it has no conversation yet'
    : card.reviews
      ? `it is a reviewer itself, of ${card.reviews}'s work`
      : card.worktree?.gone
        ? `its checkout ${card.checkout} is gone, so there is nothing to fork`
        : "a dir of its floor isn't a git repo"

const reportLine = (card: Card) => (card.reviews ? `reviews ${card.reviews}` : `hired by ${card.hiredBy!.callsign}`)

/** The floor's crews: each worker under the one it reports to, those that went home among them. */
const floorLines = (floor: Floor, me: string | undefined, now: number): string[] => {
  const onDuty = floor.cards.filter((c) => c.onDuty)
  return [`${floorTitle(floor)}: ${onDuty.length} on duty`, ...crewTree(floor.cards).flatMap(({ card, depth }) => cardLines(card, me, now, depth))]
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
    ...(card.hiredBy ? [`${card.hiredBy.callsign} hired you: \`tower agent ${card.hiredBy.callsign}\` says how to reach it.`] : []),
    ...(card.worktree ? worktreeLines(floor, card.worktree) : [`You work in ${card.cwd}.`]),
    `The floor's hub is ${floor.hub}${floor.repos?.length ? `, with repos ${floor.repos.map(base).join(', ')}` : ''}.`,
    `The tower answers at ${TOWER}: the user's page, and the API (\`tower api\` lists it).`,
    shelfLine(floor),
    ...collectionsLines(floor),
    `The tower's config is ${board.config}: \`tower config check\` checks it.`,
  ]
}

const shelfEntryName = (entry: ShelfEntry): string => `"${entry.label}" (${SHELF_KINDS.find((kind) => kind in entry)} ${shelfSource(entry)})`

const shelfLine = (floor: Floor): string =>
  floor.shelf?.length
    ? `The floor's shelf, the pages the user reads beside its sessions: ${floor.shelf.map(shelfEntryName).join(', ')}.`
    : `The floor's shelf is empty: pages the user reads beside its sessions go under projects.${floor.id}.shelf in the config.`

const collectionsLines = (floor: Floor): string[] =>
  floor.collections.length
    ? ["The floor's collections, files kept for later (`tower kept` lists their items):", ...floor.collections.map(collectionLine)]
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
  const res = await fetch(`${TOWER}/archive/${project}`)
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
  const res = await fetch(`${TOWER}/conversations/${id}`)
  if (!res.ok) throw new CliError(`The tower answered ${res.status} for ${id}'s conversations: ${await res.text()}`)
  return res.json()
}

const threadLines = (thread: Brief, promptBy: string | undefined): string[] => [
  `Conversation ${thread.id}${thread.resumedBy ? ` (continued by ${thread.resumedBy.callsign}, session ${thread.resumedBy.id})` : ''}`,
  ...(thread.turns.length
    ? thread.turns.toReversed().flatMap((turn, i) => [`${GIST_MARK.prompt} ${i === 0 ? 'Latest prompt' : 'Earlier prompt'} from ${i === 0 && promptBy ? `${promptBy}, which hired it` : 'the user'}:`, turn.prompt, `${GIST_MARK.answer} ${i === 0 ? 'Latest answer' : 'Answer'}:`, turn.answer ?? '(working on it)'])
    : ['(no prompt yet)']),
]

/** An earlier session of the worker, as one line: `tower agent` reads the current one in full. */
const earlierLine = (p: BriefPart) =>
  `  ${sessionLabel(p.n, p.of, p.session.startedAt)}, session ${p.session.id}: ${p.threads.length} conversation${p.threads.length === 1 ? '' : 's'}`

/** `cards`: the cards its hires are found among, the floor's archive's too for a worker the board leaves out. */
const agent = (board: Board, card: Card, cards: Card[], briefs: Brief[], now: number): string[] => {
  const floor = board.floors.find((f) => f.id === card.project)!
  const hires = hiresOf(cards, card)
  const [current, ...earlier] = briefParts(briefs)
  return [
    `${card.callsign}, session ${card.id}, on ${floorTitle(floor)}`,
    `  ${[statusName(card), `for ${ago(now - card.enteredAt)}`, card.peer ? `message as "${card.peer}"` : 'not reachable: its Claude is not running', modelName(card.model)].filter(Boolean).join('  ·  ')}`,
    `  in ${card.cwd}`,
    ...(card.unresumable ? [`  ${UNRESUMABLE_TITLE[card.unresumable]}`] : []),
    ...(card.reviews ? [`  reviews ${card.reviews}'s work`] : []),
    ...(card.hiredBy ? [`  hired by ${card.hiredBy.callsign}`] : []),
    ...(hires.length ? [`  under it: ${hires.map((h) => `${h.callsign} (${statusName(h)})`).join(', ')}`] : []),
    ...(current ? current.threads.flatMap((t) => ['', ...threadLines(t, card.conversations.find((conv) => conv.id === t.id)?.promptBy)]) : ['', 'No saved conversation yet.']),
    ...(earlier.length ? ['', `Earlier sessions of ${card.callsign}, each read in full at /conversations/<session>:`, ...earlier.map(earlierLine)] : []),
  ]
}

const isUrl = (target: string) => /^https?:\/\//.test(target)

const shownOf = (command: 'show' | 'open', target: string | undefined, title: string | undefined): Omit<Shown, 'at'> => {
  if (!target) throw new CliError(`Usage: tower ${command} ${command === 'show' ? '<file|url>' : '<url>'} [title]`)
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
const command = async <T>(verb: string, body: unknown): Promise<T> => {
  const res = await fetch(`${TOWER}/${verb}`, { method: 'POST', headers: { origin: TOWER, 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const reply = await res.json()
  if (!res.ok) throw new CliError(`The tower refused ${verb}: ${(reply as Failure).message}`)
  return reply as T
}

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
  const res = await fetch(`${TOWER}/collection/${floor.id}/${collection}/${encodeURIComponent(id)}`)
  if (!res.ok) throw new CliError(`The tower answered ${res.status} for ${collection}/${id}: ${await res.text()}`)
  return res.text()
}

const kb = (size: number) => (size < 1024 ? `${size} B` : `${(size / 1024).toFixed(1)} KB`)

const itemLines = (collection: FloorCollection, item: FloorItem, title: string | undefined, now: number) => [
  `  ${item.tag}  ·  ${[title?.slice(0, 80) ?? '(untitled)', `edited ${ago(now - item.modifiedAt)} ago`, kb(item.size), `kept by ${item.keptBy?.callsign ?? 'unknown'}`].join('  ·  ')}`,
  `    ${collection.dir}/${item.id}`,
]

/** A collection in a list of them: its id, label and what it is for. */
export const collectionLine = (collection: FloorCollection): string =>
  `  ${[collection.id, collection.label, collection.description ?? '(no description)'].join('  ·  ')}`

const collectionLines = async (floor: Floor, collection: FloorCollection, now: number): Promise<string[]> => {
  const titles = await Promise.all(collection.items.map(async (i) => (titled(i.id) ? titleIn(i.id, await readItem(floor, collection.id, i.id)) : undefined)))
  return [
    `${collection.label} ("${collection.id}"): ${collection.items.length} item${collection.items.length === 1 ? '' : 's'}`,
    ...(collection.description ? [`  ${collection.description}`] : []),
    ...collection.items.flatMap((item, n) => itemLines(collection, item, titles[n], now)),
  ]
}

/** An item by its tag or its id. A tag two items share names neither. */
const itemNamed = (floor: Floor, name: string): { collection: FloorCollection; item: FloorItem } => {
  const found = floor.collections.flatMap((collection) => collection.items.filter((i) => i.id === name || i.tag === name).map((item) => ({ collection, item })))
  if (!found.length) throw new CliError(`No item "${name}" on ${floorTitle(floor)}. \`tower kept\` lists them.`)
  if (found.length > 1) throw new CliError(`"${name}" is the tag of ${found.map((f) => `${f.collection.id}/${f.item.id}`).join(' and ')}: name one by its id`)
  return found[0]
}

const KEEP_USAGE = 'Usage: tower keep <collection> [file] [name <words>], or the markdown on stdin'

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

/** The host appends what it is posted to the session's log, as the mod's events. */
const postToHost = (me: string, event: Record<string, unknown>) =>
  new Promise<void>((resolve, reject) => {
    const req = http.request({ socketPath: process.env.TOWER_HOOKS_SOCKET, path: `/hooks/${me}`, method: 'POST', headers: { 'content-type': 'application/json' } }, (res) => {
      res.resume()
      if (res.statusCode === 204) resolve()
      else reject(new Error(`The host answered ${res.statusCode} to ${event.hook_event_name}`))
    })
    req.on('error', reject)
    req.end(JSON.stringify(event))
  })

/** A checkout's thread as the file holds it, `undefined` while nobody wrote on it. */
const readThread = async (floor: Floor, checkout: string): Promise<string | undefined> => {
  collectionOf(floor, REVIEWS)
  const res = await fetch(`${TOWER}/collection/${floor.id}/${REVIEWS}/${threadId(checkout)}`)
  if (res.status === 404) return undefined
  if (!res.ok) throw new CliError(`The tower answered ${res.status} for the thread of ${checkout}: ${await res.text()}`)
  return res.text()
}

const NOTE_USAGE = 'Usage: tower note [on <checkout>] [re n<k>] [repo:path:<line>[-<line>] …], the body on stdin'
const ANCHOR_ARG = /^([^:\s]+):(.+):(\d+)(?:-(\d+))?$/

type NoteArgs = { on?: string; re?: number; anchors: Omit<Anchor, 'quote'>[] }

const noteArgs = (args: string[]): NoteArgs => {
  const note: NoteArgs = { anchors: [] }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === 'on' && args[i + 1]) note.on = args[++i]
    else if (args[i] === 're' && /^n?\d+$/.test(args[i + 1] ?? '')) note.re = Number(args[++i].replace(/^n/, ''))
    else {
      const anchor = ANCHOR_ARG.exec(args[i])
      if (!anchor) throw new CliError(`"${args[i]}" is no anchor. ${NOTE_USAGE}`)
      const [, repo, path, from, to] = anchor
      note.anchors.push({ repo, path, from: Number(from), to: Number(to ?? from) })
    }
  }
  return note
}

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

const HIRE_USAGE = 'Usage: tower hire [<tag|id>] [model <m>] [effort <e>] [name <n>] [base origin/<b>], the prompt on stdin when no item names it'
const HIRE_FIELDS = ['model', 'effort', 'name', 'base'] as const

type HireArgs = { item?: string; fields: Partial<Pick<SpawnForm, (typeof HIRE_FIELDS)[number]>> }

const hireArgs = (args: string[]): HireArgs => {
  const hire: HireArgs = { fields: {} }
  for (let i = 0; i < args.length; i++) {
    const field = HIRE_FIELDS.find((f) => f === args[i])
    if (field && args[i + 1]) hire.fields[field] = args[++i]
    else if (!hire.item) hire.item = args[i]
    else throw new CliError(`"${args[i]}" is a second item. ${HIRE_USAGE}`)
  }
  return hire
}

/** A session's callsign as the tower names it: from the names in the config the board was read from. */
const callsignOn = (board: Board, id: string) => callsignsOf(JSON.parse(readFileSync(board.config, 'utf8')))(id)

const hiredLines = (board: Board, floor: Floor, reply: Replies['spawn'], form: SpawnForm): string[] => {
  const who = callsignOn(board, reply.id)
  const place = reply.cut
    ? `in worktree ${reply.cut.name}, on branch ${reply.cut.branch}, cut from ${[...new Set(reply.cut.bases.map((b) => b.base))].join(', ')}`
    : `in ${form.where === 'worktree' ? form.worktree : form.checkout}, beside whoever works there`
  return [
    `Hired ${who}, session ${reply.id}, on ${floorTitle(floor)}, ${place}.`,
    `\`tower agent ${who}\` follows its work; once its Claude is up, \`tower agents\` names how to message it.`,
  ]
}

type JsonSchema = { description?: string }
type ApiSchema = { v: string; verbs: Record<string, { input: JsonSchema; reply: JsonSchema }>; reads: Record<string, { query: JsonSchema }> }

const apiLines = (schema: ApiSchema): string[] => {
  const width = Math.max(...[...Object.keys(schema.verbs), ...Object.keys(schema.reads)].map((name) => name.length))
  const line = (name: string, { description }: JsonSchema) => `  ${name.padEnd(width)}  ${description ?? ''}`.trimEnd()
  return [
    `The tower's API ${schema.v}, at ${TOWER}. \`tower api <name>\` prints one verb's or read's JSON Schema.`,
    '',
    `Verbs: POST /<verb>, a JSON body, the header \`origin: ${TOWER}\`.`,
    ...Object.entries(schema.verbs).map(([name, { input }]) => line(name, input)),
    '',
    'Reads: GET /<read>?<query>.',
    ...Object.entries(schema.reads).map(([name, { query }]) => line(name, query)),
  ]
}

const [verb, flag, ...rest] = process.argv.slice(2)
const me = process.env.TOWER_SESSION_ID
const now = Date.now()

switch (verb) {
  case 'api': {
    const schema: ApiSchema = await (await towerGet('/schema')).json()
    if (!flag) {
      console.log(apiLines(schema).join('\n'))
      break
    }
    const one = schema.verbs[flag] ?? schema.reads[flag]
    if (!one) throw new CliError(`The API has no verb or read "${flag}"`, '`tower api` lists them')
    console.log(JSON.stringify(one, null, 2))
    break
  }
  case 'whoami':
    console.log(whoami(await readBoard(), me).join('\n'))
    break
  case 'agents': {
    const board = await readBoard()
    const floors = flag === '--all' ? board.floors.filter((f) => f.cards.some((c) => c.onDuty)) : [board.floors.find((f) => f.id === ownCard(board, me).project)!]
    console.log(floors.map((f) => floorLines(f, me, now).join('\n')).join('\n\n'))
    break
  }
  case 'agent': {
    if (!flag) throw new CliError('Usage: tower agent <CALLSIGN>')
    const board = await readBoard()
    const card = await cardNamed(board, flag)
    const floor = board.floors.find((f) => f.id === card.project)!
    const cards = floor.cards.includes(card) ? floor.cards : [...floor.cards, ...(await readArchive(floor.id))]
    console.log(agent(board, card, cards, await readThreads(card.id), now).join('\n'))
    break
  }
  case 'show':
  case 'open': {
    if (!me || !process.env.TOWER_HOOKS_SOCKET) throw new CliError('TOWER_SESSION_ID or TOWER_HOOKS_SOCKET is not set: this Claude was not started by the tower')
    const shown = shownOf(verb, flag, rest.join(' ') || undefined)
    await postToHost(me, { hook_event_name: 'tower.show', ...shown })
    console.log(verb === 'show' ? `Shown to the user beside this session: ${shown.target}` : `The user is asked to open ${shown.target}`)
    break
  }
  case 'reveal': {
    if (!flag) throw new CliError('Usage: tower reveal <path>')
    await command('reveal', { path: path.resolve(flag) })
    console.log(`Revealed in Finder: ${path.resolve(flag)}`)
    break
  }
  case 'edit': {
    if (!flag) throw new CliError('Usage: tower edit <path> [line]')
    const line = rest[0] === undefined ? undefined : Number(rest[0])
    if (line !== undefined && !(Number.isInteger(line) && line > 0)) throw new CliError(`"${rest[0]}" is no line number. Usage: tower edit <path> [line]`)
    await command('edit', { path: path.resolve(flag), line })
    console.log(`Opened in the user's editor: ${path.resolve(flag)}${line ? `:${line}` : ''}`)
    break
  }
  case 'keep': {
    if (!me || !process.env.TOWER_HOOKS_SOCKET) throw new CliError('TOWER_SESSION_ID or TOWER_HOOKS_SOCKET is not set: this Claude was not started by the tower')
    const floor = ownFloor(await readBoard(), me)
    if (!flag) {
      console.log([`${floorTitle(floor)} keeps ${floor.collections.length ? 'these collections:' : 'no collections.'}`, ...floor.collections.map(collectionLine), KEEP_USAGE].join('\n'))
      break
    }
    const collection = collectionOf(floor, flag)
    const args = keepArgs(rest)
    const { ext, content, name } = await keepContent(args.file)
    const { id } = await command<{ id: string }>('collection/create', { project: floor.id, collection: collection.id, name: args.name ?? name, ext, content })
    await postToHost(me, { hook_event_name: 'tower.keep', project: floor.id, collection: collection.id, id })
    const title = titleIn(id, content)
    console.log(`Kept ${title ? `"${title}" ` : ''}in ${collection.label} on ${floorTitle(floor)} as ${tagOf(id)}: ${collection.dir}/${id}`)
    break
  }
  case 'kept': {
    const floor = ownFloor(await readBoard(), me)
    const collections = flag ? [collectionOf(floor, flag)] : floor.collections
    if (!collections.length) throw new CliError(`${floorTitle(floor)} keeps no collections`)
    const sections = await Promise.all(collections.map((c) => collectionLines(floor, c, now)))
    console.log(sections.map((lines) => lines.join('\n')).join('\n\n'))
    break
  }
  case 'read': {
    if (!flag) throw new CliError('Usage: tower read <tag|id>')
    const floor = ownFloor(await readBoard(), me)
    const { collection, item } = itemNamed(floor, flag)
    process.stdout.write(await readItem(floor, collection.id, item.id))
    break
  }
  case 'thread': {
    const board = await readBoard()
    const card = ownCard(board, me)
    const floor = ownFloor(board, me)
    const checkout = flag ?? threadCheckoutOf(card)
    const text = await readThread(floor, checkout)
    if (text === undefined) {
      console.log(`No notes on checkout ${checkout} yet. \`tower note\` writes the first.`)
      break
    }
    const unseen = unseenBy(parseThread(text), card.callsign)
    process.stdout.write(text.endsWith('\n') ? text : `${text}\n`)
    console.log(`\n(${collectionOf(floor, REVIEWS).dir}/${threadId(checkout)}) ${unseen.length ? `New to you since your last note: ${unseen.map((m) => `n${m.n}`).join(', ')}.` : 'Nothing new to you since your last note.'}`)
    break
  }
  case 'note': {
    const note = noteArgs([flag, ...rest].filter((a) => a !== undefined))
    if (process.stdin.isTTY) throw new CliError(NOTE_USAGE)
    const body = await readStdin()
    const board = await readBoard()
    const card = ownCard(board, me)
    const floor = ownFloor(board, me)
    const checkout = note.on ?? threadCheckoutOf(card)
    const anchors = note.anchors.map((a) => quoted(floor, card.worktree?.from === checkout ? card.checkout : checkout, a))
    const { n } = await command<{ n: number }>('review/append', { project: floor.id, checkout, author: card.callsign, re: note.re, anchors, body })
    console.log(`Noted as n${n} on the thread of checkout ${checkout}${note.re ? `, answering n${note.re}` : ''}: ${collectionOf(floor, REVIEWS).dir}/${threadId(checkout)}`)
    break
  }
  case 'review': {
    if (!flag) throw new CliError('Usage: tower review <CALLSIGN> [tell]')
    if (!me || !process.env.TOWER_HOOKS_SOCKET) throw new CliError('TOWER_SESSION_ID or TOWER_HOOKS_SOCKET is not set: this Claude was not started by the tower')
    const board = await readBoard()
    const author = await cardNamed(board, flag)
    if (!author.calls.review) throw new CliError(`${author.callsign}'s card offers no review: ${noReviewReason(author)}`)
    const tell = rest[0] === 'tell'
    const [verbName, body] = author.calls.review
    const hired = await command<{ id: string; cut: { name: string } }>(verbName, { ...body, prompt: reviewPrompt(author.callsign, tell) })
    await postToHost(me, { hook_event_name: 'tower.hire', id: hired.id })
    console.log(`${callsignOn(board, hired.id)} reviews ${author.callsign}'s work in worktree ${hired.cut.name}, a fork of checkout ${author.checkout}. ${tell ? `It sends its notes to ${author.callsign} when done.` : 'Its notes wait on the thread for the user.'}`)
    break
  }
  case 'hire': {
    const hire = hireArgs([flag, ...rest].filter((a) => a !== undefined))
    if (!hire.item && process.stdin.isTTY) throw new CliError(HIRE_USAGE)
    if (!me || !process.env.TOWER_HOOKS_SOCKET) throw new CliError('TOWER_SESSION_ID or TOWER_HOOKS_SOCKET is not set: this Claude was not started by the tower')
    const board = await readBoard()
    const floor = ownFloor(board, me)
    const refusal = hireRefusal(await everyCard(board), floor, ownCard(board, me))
    if (refusal) throw new CliError(`${refusal}. Tell the user what you would hire and why (the limits are \`hiring\` in the tower's config.json). \`tower review\` is never limited.`)
    if (!floor.calls.spawn) throw new CliError('The tower offers no spawn: its host is down. The user starts it with `tower up`.')
    const named = hire.item ? itemNamed(floor, hire.item) : undefined
    const prompt = named ? await readItem(floor, named.collection.id, named.item.id) : await readStdin()
    if (!prompt.trim()) throw new CliError(`The prompt is empty: a hired worker starts on one. ${HIRE_USAGE}`)
    const form = { ...spawnDefaults(floor, prompt), ...hire.fields }
    const [[verbName, body], given] = spawnCall(floor, form)
    const reply = await command<Replies['spawn']>(verbName, { ...body, ...given })
    await postToHost(me, { hook_event_name: 'tower.hire', id: reply.id })
    console.log(hiredLines(board, floor, reply, form).join('\n'))
    break
  }
  case 'home': {
    if (!flag) throw new CliError('Usage: tower home <CALLSIGN>')
    const board = await readBoard()
    const card = await cardNamed(board, flag)
    const calls = card.calls['send-home']
    if (!calls) throw new CliError(`${card.callsign} has nobody to send home: it is in no crew, or nobody in its crew runs. \`tower agents\` shows the crews; a lone worker ends with \`kill\`.`)
    for (const [verbName, body] of calls) await command(verbName, body)
    const floor = board.floors.find((f) => f.id === card.project)!
    const sent = [card, ...crewOf(floor.cards, card)].filter((c) => calls.some(([, { id }]) => id === c.id))
    console.log(`Sent home ${sent.map((c) => c.callsign).join(', ')}: their sessions ended, and each can be resumed.`)
    break
  }
  case 'let-go': {
    if (!flag) throw new CliError('Usage: tower let-go <CALLSIGN>')
    const card = await cardNamed(await readBoard(), flag)
    const call = card.calls['let-go']
    if (!call) throw new CliError(`${card.callsign} is ${statusName(card)}: only a worker the host stopped or lost, on duty until it is resumed, is let go`)
    await command(...call)
    console.log(`Let ${card.callsign} go: it is off duty, and its conversation can still be resumed from the floor's archive.`)
    break
  }
  case 'send': {
    if (!flag) throw new CliError('Usage: tower send <CALLSIGN>')
    const board = await readBoard()
    const sender = ownCard(board, me)
    const target = await cardNamed(board, flag)
    if (!target.calls.submit) throw new CliError(`${target.callsign} isn't at its composer (${statusName(target)}): send once it is`)
    const text = await readThread(board.floors.find((f) => f.id === target.project)!, target.checkout)
    if (text === undefined) throw new CliError(`Checkout ${target.checkout} has no notes to send`)
    const notes = unseenBy(parseThread(text), target.callsign).map((m) => m.n)
    await command('submit', { id: target.id, text: sendText(sender.callsign, target.checkout, notes) })
    console.log(`Sent ${target.callsign} a pointer to ${notes.length ? notes.map((n) => `n${n}`).join(', ') : 'the thread'} on checkout ${target.checkout}.`)
    break
  }
  default:
    throw new CliError(
      `Unknown command "${verb ?? ''}". The user's: init, doctor, config check, up, down, update, spawn, resume, submit, kill, live, ls, ps, reap, screen, attach. A worker's: whoami, agents [--all], agent <CALLSIGN>, show <file|url> [title], open <url> [title], reveal <path>, edit <path> [line], keep [<collection> [file] [name <words>]], kept [collection], read <tag|id>, thread [checkout], note [on <checkout>] [re n<k>] [repo:path:lines …], send <CALLSIGN>, review <CALLSIGN> [tell], hire [<tag|id>] […], home <CALLSIGN>, let-go <CALLSIGN>, api [name]`,
      'the tower:handbook skill says what each is for',
    )
}
