import net from 'node:net'
import { frame, onLines, type FromHost, type ToHost } from './protocol.ts'
import type { FromTerms, ShellStream, ToTerms } from './terms.ts'

export type Client<Request, Reply> = {
  request: (msg: Request) => Promise<Reply>
  close: () => void
}

export type HostClient = Client<ToHost, FromHost>

/** A line a server sent, read as JSON, or why it can't be. */
const parseLine = (line: string): { json: unknown } | { error: Error } => {
  try {
    return { json: JSON.parse(line) }
  } catch (err) {
    return { error: err as Error }
  }
}

const PREVIEW_LENGTH = 200

/** How long a daemon may take to answer one request. */
const REQUEST_TIMEOUT_MS = 30_000

/** A server whose handler returns nothing for a request it doesn't know answers `undefined`. */
const notJson = (server: string, socketPath: string, line: string, cause: Error, request?: string) =>
  new Error(`The ${server} on ${socketPath} answered${request ? ` "${request}"` : ''} with ${line.slice(0, PREVIEW_LENGTH)}, which isn't JSON: a ${server} older than this client answers so to a request it doesn't know`, { cause })

/**
 * The server replies to requests in the order they arrive, so the oldest pending request owns each reply; one that
 * isn't JSON fails that request, and the next reply is the next request's. A request unanswered after
 * REQUEST_TIMEOUT_MS fails, and the connection closes with the requests behind it: a late reply would be read as theirs.
 */
const connect = <Request extends { t: string }, Reply>(socketPath: string, server: string, start: string): Promise<Client<Request, Reply>> =>
  new Promise((resolve, reject) => {
    const sock = net.createConnection(socketPath)
    const pending: { t: string; settle: (reply: Reply) => void; fail: (err: Error) => void }[] = []
    sock.once('error', (err) => reject(new Error(`No ${server} on ${socketPath} (${err.message}). Start it with: ${start}`, { cause: err })))
    onLines(sock, (line) => {
      const request = pending.shift()
      if (!request) return
      const reply = parseLine(line)
      if ('json' in reply) request.settle(reply.json as Reply)
      else request.fail(notJson(server, socketPath, line, reply.error, request.t))
    })
    let lastError: Error | undefined
    sock.on('error', (err) => (lastError = err))
    /** A server that goes away mid-request reset the connection, whether or not the socket saw an error. */
    const reset = () => lastError ?? Object.assign(new Error('closed'), { code: 'ECONNRESET' })
    sock.once('close', () =>
      pending.splice(0).forEach(({ fail }) => fail(new Error(`The ${server} on ${socketPath} closed before replying`, { cause: reset() }))),
    )
    sock.once('connect', () =>
      resolve({
        request: (msg) =>
          new Promise((settle, fail) => {
            const timer = setTimeout(() => {
              pending.splice(pending.findIndex((p) => p.fail === failRequest), 1)
              fail(new Error(`The ${server} on ${socketPath} didn't answer "${msg.t}" within ${REQUEST_TIMEOUT_MS / 1000}s: it may be wedged`))
              sock.destroy()
            }, REQUEST_TIMEOUT_MS)
            const failRequest = (err: Error) => (clearTimeout(timer), fail(err))
            pending.push({ t: msg.t, settle: (reply) => (clearTimeout(timer), settle(reply)), fail: failRequest })
            sock.write(frame(msg))
          }),
        close: () => sock.end(),
      }),
    )
  })

export const connectHost = (socketPath: string): Promise<HostClient> =>
  connect<ToHost, FromHost>(socketPath, 'host', 'npm run host')

export const connectTerms = (socketPath: string): Promise<Client<ToTerms, FromTerms>> =>
  connect<ToTerms, FromTerms>(socketPath, 'terms daemon', 'npm run terms')

/** Streams a shell to `onMessage` until the returned function closes it. A failure arrives as an `error` message. */
export const attachShell = (socketPath: string, id: string, onMessage: (msg: ShellStream) => void): (() => void) => {
  const sock = net.createConnection(socketPath)
  sock.on('error', (err) => onMessage({ t: 'error', message: `No terms daemon on ${socketPath} (${err.message}). Start it with: npm run terms` }))
  sock.once('connect', () => sock.write(frame({ t: 'attach', id } satisfies ToTerms)))
  onLines(sock, (line) => {
    const msg = parseLine(line)
    if ('json' in msg) return onMessage(msg.json as ShellStream)
    onMessage({ t: 'error', message: notJson('terms daemon', socketPath, line, msg.error).message })
    sock.destroy()
  })
  return () => sock.destroy()
}
