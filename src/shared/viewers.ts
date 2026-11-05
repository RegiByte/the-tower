import type net from 'node:net'
import type { Terminal } from '../bridge/screen.ts'
import { frame } from './protocol.ts'

/** Takes each message of a PTY's stream: a snapshot, then its output, resizes and end as they happen. */
export type Viewer<M> = (msg: M) => void

/** A PTY's screen mirrored in a headless terminal, and whoever watches it. */
export type Screened<M> = { screen: Terminal; snapshot: () => string; viewers: Set<Viewer<M>> }

export const broadcast = <M>(s: Screened<M>, msg: M) => {
  for (const viewer of s.viewers) viewer(msg)
}

/** Writes each message to the connection; the PTY's end (`x`) or an error ends it. */
export const socketViewer = <M extends { t: string }>(sock: net.Socket): Viewer<M> => (msg) => {
  sock.write(frame(msg))
  if (msg.t === 'x' || msg.t === 'error') sock.end()
}

/**
 * Joins `viewer` to the screen's stream: it joins before the snapshot is taken, and the snapshot waits for the screen
 * to parse everything written before it, so output that arrives meanwhile is held back and sent after the snapshot,
 * none lost or repeated. Once the snapshot is sent it keeps watching while `running` holds and `sock` is open; resolves
 * then.
 */
export const joinViewer = <M>(s: Screened<M>, viewer: Viewer<M>, sock: net.Socket, snapshot: (data: string) => M, running: () => boolean): Promise<void> =>
  new Promise((resolve) => {
    const held: M[] = []
    const hold: Viewer<M> = (msg) => held.push(msg)
    s.viewers.add(hold)
    s.screen.write('', () => {
      s.viewers.delete(hold)
      viewer(snapshot(s.snapshot()))
      held.forEach(viewer)
      if (running() && !sock.destroyed) s.viewers.add(viewer)
      resolve()
    })
    sock.on('close', () => s.viewers.delete(viewer))
  })
