import type { Clients } from './clients.ts'
import type { Lighting } from './light/setting.ts'
import type { Stage } from './stage.ts'

/**
 * The started resources the page's modules read: main.ts and every module it imports, loaded once they are bound.
 * Bound once, before main.ts is imported; a read before then is a module loaded too early, and says so.
 */
export type Shell = { clients: Clients; lighting: Lighting; stage: Stage }

let bound: Shell | undefined

export function bindShell(started: Shell) {
  bound = started
}

export function shell(): Shell {
  if (!bound) throw new Error('Tower 3D read its started resources before they were bound: only main.ts and the modules it imports read shell()')
  return bound
}
