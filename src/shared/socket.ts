import { unlinkSync } from 'node:fs'
import net from 'node:net'

/** macOS caps a Unix socket path at 104 bytes, its terminating NUL included. */
const MAX_SOCKET_PATH = 103

/** Whether a process is listening on the socket. */
export const answers = (socketPath: string): Promise<boolean> =>
  new Promise((resolve) => {
    const probe = net.createConnection(socketPath)
    probe.on('connect', () => {
      probe.destroy()
      resolve(true)
    })
    probe.on('error', () => resolve(false))
  })

/** Takes over a socket path left by a process that died; refuses one a running process still answers on. */
export async function claimSocket(socketPath: string): Promise<void> {
  if (Buffer.byteLength(socketPath) > MAX_SOCKET_PATH) {
    throw new Error(`Socket path is ${Buffer.byteLength(socketPath)} bytes, over the ${MAX_SOCKET_PATH}-byte limit: ${socketPath}. Move the config to a shorter directory.`)
  }
  if (await answers(socketPath)) throw new Error(`Something already answers on ${socketPath}`)
  try {
    unlinkSync(socketPath)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
  }
}
