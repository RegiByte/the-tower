import { defineResource } from 'braided'
import { startClients } from './clients.ts'
import { bindShell, type Shell } from './shell.ts'

/**
 * Tower 3D as a system of braided resources, each started once its dependencies have (decision `tower3d-system`).
 * The only module that knows where each is implemented:
 *
 *   clients   the extension clients whose words the page draws (clients.ts)
 *   shell     the page itself: main.ts, imported once the resources it reads are bound (shell.ts)
 */

const clients = defineResource({ start: startClients, halt: () => {} })

const shell = defineResource({
  dependencies: ['clients'],
  start: async (started: Shell) => {
    bindShell(started)
    await import('./main.ts')
  },
  halt: () => {},
})

export const tower3d = { clients, shell }
