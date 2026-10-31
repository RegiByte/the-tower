/**
 * The board's publisher: the board derived from the config and the live system, and the clients of `GET /board`, each
 * sent the newest board whenever the system changes, and once a minute, since time alone moves the board. While anyone
 * listens (`onBoard`: the extensions' board triggers), each board that differs from the last is also handed to them, frozen.
 */
import type http from 'node:http'
import { defineResource, type StartedResource } from 'braided'
import { allCards, archiveOf, board, boardOf as boardFrom, callsignLookup, type Board, type Card, type SystemView, type Viewers } from '../bridge/board.ts'
import { foldBoard, SLOW_MS } from '../bridge/folds.ts'
import { projectLegacy } from '../bridge/legacy.ts'
import { API_VERSION, apiError, type ApiError } from '../shared/api.ts'
import type { BoardMsg } from '../shared/shelf-page.ts'
import type { Config } from '../shared/model.ts'
import { renderersOf } from '../renderers.ts'
import { frozen } from '../bridge/frozen.ts'
import { errorOf } from './answers.ts'
import type { ExtensionsResource } from './extensions.ts'
import type { ConfigResource, SystemResource } from './spine.ts'

export const PUBLISH_DEBOUNCE_MS = 150
/** Time alone moves the board: a worker goes quiet long enough to look stuck. */
const CLOCK_PUBLISH_MS = 60_000

type Deps = { 'core:config': ConfigResource; 'core:system': SystemResource; 'core:extensions': ExtensionsResource }

export const publisher = defineResource({
  dependencies: ['core:config', 'core:system', 'core:extensions'],
  start: ({ 'core:config': { paths, read: readConfig }, 'core:system': system, 'core:extensions': extensions }: Deps) => {
    const boardClients = new Set<http.ServerResponse>()
    const boardListeners = new Set<(board: Board) => void>()
    /** The board every client and listener holds. */
    let published = ''

    /** The board as a message, and the board when the tower could build it; a failure of the tower's own also goes to its log. */
    const built = (): { text: string; board?: Board } => {
      try {
        const board = boardOf()
        return { text: JSON.stringify({ v: API_VERSION, board } satisfies BoardMsg), board }
      } catch (err) {
        const { code, message } = errorOf(err)
        if (code === 'internal') console.error('board:', err)
        return { text: JSON.stringify({ v: API_VERSION, error: { code, message } } satisfies BoardMsg) }
      }
    }

    const currentBoard = (): string => built().text

    /** The chords the renderers keep, read again only when the config's renderers change: their files are the checkout's and the config's roots'. */
    let kept: { renderers: string; keeps: string[] } | undefined
    const keepsOf = (config: Config): string[] => {
      const renderers = JSON.stringify(config.renderers ?? {})
      if (kept?.renderers !== renderers) kept = { renderers, keeps: renderersOf(config).flatMap((r) => r.keeps ?? []) }
      return kept.keeps
    }

    /** The viewer each open board stream belongs to, and the renderer it is a page of, when it named them. */
    const streamsOf = new Map<http.ServerResponse, { viewer: string; renderer?: string }>()
    /** When the user last acted on each viewer whose board stream is open (`viewer/active`): the tower's memory alone. */
    const actedAt = new Map<string, number>()

    /** The viewers as the board says them: the one the user acted on last, and each renderer's. */
    const viewersNow = (): Viewers => {
      const rendererOf = new Map([...streamsOf.values()].map((s) => [s.viewer, s.renderer]))
      const latest = [...actedAt].sort((a, b) => b[1] - a[1]).map(([viewer]) => viewer)
      const last: Record<string, string> = {}
      for (const viewer of latest) {
        const renderer = rendererOf.get(viewer)
        if (renderer !== undefined && !(renderer in last)) last[renderer] = viewer
      }
      return { ...(latest.length && { active: latest[0] }), ...(Object.keys(last).length && { last }) }
    }

    /** Runs `change` on the viewers, publishing the board when what it says of them moved. */
    const changingViewers = (change: () => void) => {
      const was = JSON.stringify(viewersNow())
      change()
      if (JSON.stringify(viewersNow()) !== was) schedulePublish()
    }

    /** The user acted on `viewer`: it is active from now until another acts after it or its last stream closes. */
    const viewerActive = (viewer: string): { t: 'ok' } | ApiError => {
      if (![...streamsOf.values()].some((s) => s.viewer === viewer)) return apiError('not_found', `No open board stream belongs to viewer ${viewer}: open GET /board?viewer=${viewer} first`)
      changingViewers(() => actedAt.set(viewer, Date.now()))
      return { t: 'ok' }
    }

    /** A board stream closed: its viewer is forgotten once no open stream belongs to it. */
    const viewerGone = (res: http.ServerResponse) => {
      const viewer = streamsOf.get(res)?.viewer
      streamsOf.delete(res)
      if (viewer === undefined || [...streamsOf.values()].some((s) => s.viewer === viewer)) return
      changingViewers(() => actedAt.delete(viewer))
    }

    const viewOf = (): SystemView => viewAt(readConfig())
    const viewAt = (config: Config): SystemView => ({
      config,
      sessions: system.sessions(),
      host: system.live(),
      processes: system.running(),
      peers: system.peers(),
      shells: system.shells(),
      items: system.items(),
      repos: system.repos(),
      logFiles: system.logs(),
      readings: extensions.readings(),
      streams: system.streamMonths(),
      extensions: extensions.registry().extensions,
      stores: extensions.registry().stores,
      paths,
      keeps: keepsOf(config),
      viewers: viewersNow(),
      now: Date.now(),
    })

    /** Set while extensions fold: a fold reads the board it is handed, never builds one. */
    let folding = false

    /**
     * The core's board, then every running extension's folds on it (`foldBoard`), and the extensions with what they
     * found, each moved part copied back to its old field (`projectLegacy`).
     */
    const boardOf = (): Board => {
      if (folding) throw new Error('ctx.board() was called inside a fold: a fold reads the board as its ctx.board')
      const view = viewOf()
      const core = board(view)
      folding = true
      try {
        const folded = foldBoard({ board: core, callsignOf: callsignLookup(view), folders: extensions.folders(), subjects: extensions.subjects(), now: view.now, clock: () => performance.now() })
        return projectLegacy({ ...folded.board, extensions: extensions.folded(folded.problems, view.now) })
      } finally {
        folding = false
      }
    }

    /** Every session's card, the ones the board leaves out included. */
    const everyCard = (now: number) => allCards({ ...viewOf(), now })

    /**
     * A floor's archived cards (`archiveOf`) as the board's own cards are: each running extension's card folds on them
     * and each moved part copied back to its old field. They are folded beside their floor's cards on the core's board,
     * every floor kept, by the card folds alone: what a fold contributes beside its part (badges, actions, lines) stays
     * the board's, and a fold's problem on an archived card goes to the tower's log, the board's problems being the board's,
     * an extension whose card folds take over `SLOW_MS` of the read logged as slowing the read.
     */
    const archivedCards = (project: string, now: number): Card[] => {
      if (folding) throw new Error('an archive was read inside a fold: a fold reads the board as its ctx.board')
      const view = { ...viewOf(), now }
      const cards = allCards(view)
      const archived = archiveOf(cards, project, now)
      const core = boardFrom(view, cards)
      const floors = core.floors.map((f) => (f.id === project ? { ...f, cards: [...f.cards, ...archived] } : f))
      const folders = extensions.folders().map((f) => ({ ...f, folds: Object.fromEntries(Object.entries(f.folds).filter(([kind]) => kind === 'card')) }))
      folding = true
      try {
        const folded = foldBoard({ board: { ...core, floors }, callsignOf: callsignLookup(view), folders, subjects: extensions.subjects(), now, clock: () => performance.now() })
        for (const { id, problem } of folded.problems.filter((p) => p.problem.code !== 'slow')) console.error(`${id}: ${problem.message} (${problem.path}${problem.subject ? `, ${problem.subject}` : ''}), folding ${project}'s archive`)
        for (const [id, ms] of folded.spent) if (ms > SLOW_MS) console.error(`${id}: its card folds took ${Math.round(ms)} ms of one read of ${project}'s archive, over ${SLOW_MS} ms: the read waits on them`)
        const ids = new Set(archived.map((c) => c.id))
        return projectLegacy(folded.board).floors.find((f) => f.id === project)!.cards.filter((c) => ids.has(c.id))
      } finally {
        folding = false
      }
    }

    const publish = () => {
      if (!boardClients.size && !boardListeners.size) return
      const next = built()
      if (next.text === published) return
      published = next.text
      for (const res of boardClients) sendBoard(res)
      if (!next.board) return
      const board = frozen(next.board)
      for (const listener of boardListeners) listener(board)
    }

    /** Board clients still reading a board sent earlier: each is sent the newest once it has, the ones between skipped. */
    const behind = new Set<http.ServerResponse>()

    const sendBoard = (res: http.ServerResponse) => {
      if (res.destroyed) return
      if (!res.writableNeedDrain) return void res.write(`data: ${published}\n\n`)
      if (behind.has(res)) return
      behind.add(res)
      res.once('drain', () => {
        behind.delete(res)
        sendBoard(res)
      })
    }

    let publishTimer: NodeJS.Timeout | undefined
    const schedulePublish = () => {
      publishTimer ??= setTimeout(() => {
        publishTimer = undefined
        publish()
      }, PUBLISH_DEBOUNCE_MS)
    }

    const unsubscribe = system.onChange(schedulePublish)
    const unheard = extensions.onChange(schedulePublish)
    const clock = setInterval(schedulePublish, CLOCK_PUBLISH_MS)

    /** A board client observes the machine while it holds the board, so its first board already says what runs. */
    async function streamBoard(req: http.IncomingMessage, res: http.ServerResponse, viewer: { viewer: string; renderer?: string } | undefined) {
      let gone = false
      const observing = system.observe()
      if (viewer !== undefined) streamsOf.set(res, viewer)
      req.on('close', () => {
        gone = true
        boardClients.delete(res)
        behind.delete(res)
        viewerGone(res)
        void observing.then((release) => release())
      })
      await observing
      if (gone) return
      const current = currentBoard()
      if (!boardClients.size && !boardListeners.size) published = current
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' })
      res.write(`data: ${current}\n\n`)
      boardClients.add(res)
    }

    /** No more boards: the clock and the debounce cleared, and every client's stream ended. */
    const stop = () => {
      unsubscribe()
      unheard()
      clearInterval(clock)
      clearTimeout(publishTimer)
      for (const res of boardClients) res.end()
      boardClients.clear()
      boardListeners.clear()
      streamsOf.clear()
      actedAt.clear()
    }

    /** Calls `listener` with the board now, then with each board built that differs from the last, until the returned function is called. */
    const onBoard = (listener: (board: Board) => void) => {
      const now = built()
      if (now.board) listener(frozen(now.board))
      boardListeners.add(listener)
      return () => void boardListeners.delete(listener)
    }

    return { board: boardOf, everyCard, archivedCards, streamBoard, onBoard, viewerActive, stop }
  },
  halt: ({ stop }) => stop(),
})
export type PublisherResource = StartedResource<typeof publisher>
