import type { Clients } from './clients.ts'
import type { Lighting } from './light/setting.ts'
import type { Input } from './input.ts'
import type { Port } from './port.ts'
import type { Stage } from './stage.ts'

/**
 * The started resources the leaf modules read as they load (`acts`, `arcade`, `archive`, `desk`, `door`, `kept`,
 * `notes`, `pigeonhole`, `state`, `world`, `ui`, `levels`). Bound once those have started, before any page resource
 * loads its module; a read before then is a module loaded too early, and says so. Transitional: once the leaves take
 * what they read as arguments, the binding goes (decision `tower3d-system`).
 */
export type Shell = { clients: Clients; lighting: Lighting; stage: Stage; input: Input; port: Port }

let bound: Shell | undefined

export function bindShell(started: Shell) {
  bound = started
}

export function shell(): Shell {
  if (!bound) throw new Error('Tower 3D read its started resources before they were bound: a module that reads shell() was loaded before the shell resource started')
  return bound
}
