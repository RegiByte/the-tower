import net from 'node:net'
import { frame, onLines, type FromHost, type ToHost } from './protocol.ts'
import type { FromTerms, ShellStream, ToTerms } from './terms.ts'

export type Client<Request, Reply> = {
  request: (msg: Request) => Promise<Reply>
  close: () => void
}

export type HostClient = Client<ToHost, FromHost>

/** The server replies to requests in the order they arrive, so the oldest pending request owns each reply. */
const connect = <Request extends object, Reply>(socketPath: string, server: string, start: string): Promise<Client<Request, Reply>> =>
  new Promise((resolve, reject) => {
    const sock = net.createConnection(socketPath)
    const pending: { settle: (reply: Reply) => void; fail: (err: Error) => void }[] = []
    sock.once('error', (err) => reject(new Error(`No ${server} on ${socketPath} (${err.message}). Start it with: ${start}`, { cause: err })))
    onLines(sock, (line) => pending.shift()?.settle(JSON.parse(line)))
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
            pending.push({ settle, fail })
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
  onLines(sock, (line) => onMessage(JSON.parse(line)))
  return () => sock.destroy()
}
