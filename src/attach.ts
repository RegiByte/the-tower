/**
 * Sits this terminal at a session: draws its current screen from the log, then streams its output
 * as the host appends it, and sends keystrokes and size to the host. Ctrl-] detaches.
 */
import { snapshot } from './bridge/screen.ts'
import type { LogEvent } from './shared/model.ts'
import { connectHost } from './shared/client.ts'
import type { SystemPaths } from './shared/paths.ts'
import { sessionKeys, type FromHost } from './shared/protocol.ts'
import { logFileOf, readLog, screenEvents, tailLog } from './tail.ts'
import { CliError } from './cli-error.ts'

const DETACH_KEY = '\x1d'

/** Turns off every mode Claude enables on the terminal showing it, and leaves the alternate screen. */
const RESTORE_TERMINAL =
  '\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l\x1b[?1016l\x1b[?1004l\x1b[?2004l\x1b[?2031l\x1b[0m\x1b[?25h\x1b[?1049l'

const size = () => ({ cols: process.stdout.columns, rows: process.stdout.rows })

const ensureOk = (reply: FromHost) => {
  if (reply.t === 'error') throw new CliError(reply.message)
}

export async function attach(paths: SystemPaths, id: string): Promise<void> {
  if (!process.stdin.isTTY) throw new CliError('attach needs a real terminal: it puts stdin in raw mode.')
  const logPath = logFileOf(paths, id)
  const host = await connectHost(paths.control)
  ensureOk(await host.request({ t: 'resize', id, ...size() }))

  const { log, offset } = readLog(logPath, screenEvents)
  process.stdout.write(await snapshot(log))

  let detached = false

  const detach = (reason: string) => {
    if (detached) return
    detached = true
    stopTail()
    process.stdout.write(RESTORE_TERMINAL)
    process.stdin.setRawMode(false)
    host.close()
    console.log(`[${reason}]`)
    process.exit(0)
  }

  const onEvent = (event: LogEvent) => {
    if (event[1] === 'o') process.stdout.write(event[2])
    if (event[1] === 'x') detach(`session exited with ${event[2].exitCode}`)
  }

  const stopTail = tailLog(logPath, offset, screenEvents, onEvent)

  const send = (data: string) => {
    const keys = sessionKeys(data)
    if (keys) host.request({ t: 'write', id, data: keys }).then((reply) => reply.t === 'error' && detach(reply.message))
  }

  process.stdin.setRawMode(true)
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (keys: string) => {
    const at = keys.indexOf(DETACH_KEY)
    if (at < 0) return send(keys)
    if (at > 0) send(keys.slice(0, at))
    detach('detached')
  })
  process.stdout.on('resize', () => host.request({ t: 'resize', id, ...size() }).then(ensureOk))
}
