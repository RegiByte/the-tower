/** Where the sandbox (`scripts/sandbox.ts`) lives, and the tower its config serves: what the agent tools read. */
import { existsSync } from 'node:fs'
import path from 'node:path'
import { towerUrl } from '../src/shared/model.ts'
import { readConfig } from '../src/system.ts'

export const SANDBOX_ROOT = process.env.TOWER_SANDBOX ?? '/tmp/tower-sandbox'
export const SANDBOX_CONFIG = path.join(SANDBOX_ROOT, 'config.json')

/** The URL of the sandbox's tower, from the port in its config. */
export const sandboxUrl = (): string => {
  if (!existsSync(SANDBOX_CONFIG)) throw new Error(`no sandbox at ${SANDBOX_ROOT}: npm run sandbox -- up`)
  return towerUrl(readConfig(SANDBOX_CONFIG))
}
