/**
 * The board's publisher: the board derived from the config and the live system, and the clients of `GET /board`, each
 * sent the newest board whenever the system changes, and once a minute, since time alone moves the board.
 */
import type http from 'node:http'
import { defineResource, type StartedResource } from 'braided'
import { allCards, board, type Policies, type SystemView } from '../bridge/board.ts'
import { API_VERSION } from '../shared/api.ts'
import type { BoardMsg } from '../shared/shelf-page.ts'
import { errorOf } from './answers.ts'
import type { ConfigResource, SystemResource } from './spine.ts'

export const PUBLISH_DEBOUNCE_MS = 150
/** Time alone moves the board: a worker goes quiet long enough to look stuck. */
const CLOCK_PUBLISH_MS = 60_000

type Deps = { 'core:config': ConfigResource; 'core:system': SystemResource }

export const publisher = defineResource({
  dependencies: ['core:config', 'core:system'],
  start: ({ 'core:config': { paths, read: readConfig }, 'core:system': system }: Deps) => {
    const boardClients = new Set<http.ServerResponse>()
    /** The board every client holds. */
    let published = ''

    /** The board, or why the tower can't build it; a failure of the tower's own also goes to its log. */
    const currentBoard = (): string => {
      try {
        return JSON.stringify({ v: API_VERSION, board: boardOf() } satisfies BoardMsg)
      } catch (err) {
        const { code, message } = errorOf(err)
        if (code === 'internal') console.error('board:', err)
        return JSON.stringify({ v: API_VERSION, error: { code, message } } satisfies BoardMsg)
      }
    }

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
      streams: system.streamMonths(),
      policies: policiesNow(),
      paths,
      now: Date.now(),
    })

    const boardOf = () => board(viewOf())

    /** Every session's card, the ones the board leaves out included. */
    const everyCard = (now: number) => allCards({ ...viewOf(), now })

    const publish = () => {
      if (!boardClients.size) return
      const next = currentBoard()
      if (next === published) return
      published = next
      for (const res of boardClients) sendBoard(res)
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
      if (!boardClients.size) published = current
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' })
      res.write(`data: ${current}\n\n`)
      boardClients.add(res)
    }

    /** No more boards: the clock and the debounce cleared, and every client's stream ended. */
    const stop = () => {
      unsubscribe()
      clearInterval(clock)
      clearTimeout(publishTimer)
      for (const res of boardClients) res.end()
      boardClients.clear()
    }

    return { board: boardOf, everyCard, streamBoard, stop }
  },
  halt: ({ stop }) => stop(),
})
export type PublisherResource = StartedResource<typeof publisher>