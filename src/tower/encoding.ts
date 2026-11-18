/**
 * Answers compressed for the clients that take it: the event streams, flushed after each event so it arrives whole,
 * and the served modules. A page reached over a slow link (a phone on a relayed tailnet) gets the board, about five
 * times smaller gzipped, and its modules in a fraction of the bytes.
 */
import type http from 'node:http'
import type { Writable } from 'node:stream'
import { promisify } from 'node:util'
import zlib from 'node:zlib'

const gzip = promisify(zlib.gzip)

/** Below this a body goes as it is: gzip's frame and the work cost more than they save. */
const MIN_GZIP_BYTES = 1024

/** Whether the client takes a gzipped answer. */
export const takesGzip = (req: http.IncomingMessage) => /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''))

/** A whole answer, gzipped when the client takes it and it is large enough to gain. */
export async function sendBody(req: http.IncomingMessage, res: http.ServerResponse, status: number, headers: http.OutgoingHttpHeaders, body: string | Buffer) {
  if (!takesGzip(req) || Buffer.byteLength(body) < MIN_GZIP_BYTES) return void res.writeHead(status, { ...headers, vary: 'accept-encoding' }).end(body)
  const zipped = await gzip(body)
  res.writeHead(status, { ...headers, 'content-encoding': 'gzip', vary: 'accept-encoding' }).end(zipped)
}

/**
 * Opens `res` as an event stream and returns what its events are written to: `res` itself, or for a client that takes
 * gzip a gzip stream into it, flushed after each write, so one write is one event the client reads at once. Its
 * `writableLength` and `drain` say how far the client is behind either way; destroying either closes both.
 */
export function eventStream(req: http.IncomingMessage, res: http.ServerResponse): Writable {
  const headers = { 'content-type': 'text/event-stream', 'cache-control': 'no-store', vary: 'accept-encoding' }
  if (!takesGzip(req)) return res.writeHead(200, headers)
  res.writeHead(200, { ...headers, 'content-encoding': 'gzip' })
  const zipped = zlib.createGzip({ flush: zlib.constants.Z_SYNC_FLUSH })
  zipped.pipe(res)
  res.on('close', () => zipped.destroy())
  zipped.on('close', () => res.writableEnded || res.destroy())
  return zipped
}
