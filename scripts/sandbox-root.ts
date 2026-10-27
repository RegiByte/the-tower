/**
 * Where the sandbox (`scripts/sandbox.ts`) lives, and the tower its config serves: what the agent tools read. Its root is
 * `TOWER_SANDBOX`, else a tower worker's own `/tmp/tower-<callsign>` (lowercase), else `/tmp/tower-sandbox`.
 */
import { existsSync } from 'node:fs'
import path from 'node:path'
import { callerHeaders } from '../src/shared/api.ts'
import { towerUrl } from '../src/shared/model.ts'
import type { BoardMsg } from '../src/shared/shelf-page.ts'
import { readConfig } from '../src/system.ts'

/** A Claude the tower started: its session, and the hooks socket next to the config of the tower that runs it. */
const worker = process.env.TOWER_SESSION_ID && process.env.TOWER_HOOKS_SOCKET ? { session: process.env.TOWER_SESSION_ID, hooks: process.env.TOWER_HOOKS_SOCKET } : undefined

/** The worker's callsign, from the first board of the tower that started it. */
const callsignOf = async ({ session, hooks }: { session: string; hooks: string }): Promise<string> => {
  const tower = towerUrl(readConfig(path.join(path.dirname(hooks), 'config.json')))
  const res = await fetch(`${tower}/board`, { headers: callerHeaders(session) }).catch((err: Error) => {
    throw new Error(`No tower answers at ${tower} to name this worker's sandbox (${err.message}): set TOWER_SANDBOX`)
  })
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader()
  let text = ''
  while (!text.includes('\n\n')) {
    const { value, done } = await reader.read()
    if (done) throw new Error(`The tower at ${tower} closed the board stream before sending a board`)
    text += value
  }
  await reader.cancel()
  const msg: BoardMsg = JSON.parse(text.split('\n').find((line) => line.startsWith('data:'))!.slice('data:'.length))
  if ('error' in msg) throw new Error(`The tower at ${tower} can't build the board: ${msg.error.message}`)
  const card = msg.board.floors.flatMap((f) => f.cards).find((c) => c.id === session)
  if (!card) throw new Error(`The tower at ${tower} has no session ${session}: set TOWER_SANDBOX`)
  return card.callsign
}

/** The sandbox of a person running it by hand, on port 4399. */
export const SHARED_SANDBOX = '/tmp/tower-sandbox'
export const SANDBOX_ROOT = process.env.TOWER_SANDBOX ?? (worker ? `/tmp/tower-${(await callsignOf(worker)).toLowerCase()}` : SHARED_SANDBOX)
export const SANDBOX_CONFIG = path.join(SANDBOX_ROOT, 'config.json')

/** The URL of the sandbox's tower, from the port in its config. */
export const sandboxUrl = (): string => {
  if (!existsSync(SANDBOX_CONFIG)) throw new Error(`no sandbox at ${SANDBOX_ROOT}: npm run sandbox -- up`)
  return towerUrl(readConfig(SANDBOX_CONFIG))
}
