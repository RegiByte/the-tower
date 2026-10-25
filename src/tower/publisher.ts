/**
 * The board's publisher: the board derived from the config and the live system, and the clients of `GET /board`, each
 * sent the newest board whenever the system changes, and once a minute, since time alone moves the board. While anyone
 * listens (`onBoard`: the extensions' board triggers), each board that differs from the last is also handed to them, frozen.
 */
import type http from 'node:http'
import { defineResource, type StartedResource } from 'braided'
import { allCards, board, type Board, type Policies, type SystemView } from '../bridge/board.ts'
import { foldBoard } from '../bridge/folds.ts'
import { API_VERSION } from '../shared/api.ts'
import type { BoardMsg } from '../shared/shelf-page.ts'
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

    const policiesNow = (): Policies => ({ files: system.policies(), facts: system.policyFacts() })

    const viewOf = (): SystemView => ({
      config: readConfig(),
      sessions: system.sessions(),
      host: system.live(),
      processes: system.running(),
      peers: system.peers(),
      shells: system.shells(),
      items: system.items(),
      threads: system.threads(),
      repos: system.repos(),
      logFiles: system.logs(),
      probes: system.probes(),
      readings: extensions.readings(),
      streams: system.streamMonths(),
      policies: policiesNow(),
      extensions: extensions.registry().extensions,
      stores: extensions.registry().stores,
      paths,
      now: Date.now(),
    })

    /** Set while extensions fold: a fold reads the board it is handed, never builds one. */
    let folding = false

    /** The core's board, then every running extension's folds on it (`foldBoard`), and the extensions with what they found. */
    const boardOf = (): Board => {
      if (folding) throw new Error('ctx.board() was called inside a fold: a fold reads the board as its ctx.board')
      const view = viewOf()
      const core = board(view)
      folding = true
      try {
        const folded = foldBoard({ board: core, folders: extensions.folders(), subjects: extensions.subjects(), now: view.now, clock: () => performance.now() })
        return { ...folded.board, extensions: extensions.folded(folded.problems, view.now) }
      } finally {
        folding = false
      }
    }

    /** Every session's card, the ones the board leaves out included. */
    const everyCard = (now: number) => allCards({ ...viewOf(), now })

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
    async function streamBoard(req: http.IncomingMessage, res: http.ServerResponse) {
      let gone = false
      const observing = system.observe()
      req.on('close', () => {
        gone = true
        boardClients.delete(res)
        behind.delete(res)
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
    }

    /** Calls `listener` with the board now, then with each board built that differs from the last, until the returned function is called. */
    const onBoard = (listener: (board: Board) => void) => {
      const now = built()
      if (now.board) listener(frozen(now.board))
      boardListeners.add(listener)
      return () => void boardListeners.delete(listener)
    }

    return { board: boardOf, everyCard, streamBoard, onBoard, stop }
  },
  halt: ({ stop }) => stop(),
})
export type PublisherResource = StartedResource<typeof publisher>
