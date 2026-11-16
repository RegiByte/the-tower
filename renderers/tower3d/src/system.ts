import { defineResource } from 'braided'
import { startClients } from './clients.ts'
import { startLighting } from './light/setting.ts'
import { stage as stageShown } from './loading.ts'
import { bindShell, type Shell } from './shell.ts'
import { startStage } from './stage.ts'

/**
 * Tower 3D as a system of braided resources, each started once its dependencies have (decision `tower3d-system`).
 * The only module that knows where each is implemented:
 *
 *   lighting  whether the page draws the light rig, read before anything draws (light/setting.ts)
 *   clients   the extension clients whose words the page draws (clients.ts)
 *   stage     the renderer, scene, camera and the city outside, on the page's canvas (stage.ts)
 *   shell     the page itself: main.ts, imported once the resources it reads are bound (shell.ts)
 */

const lighting = defineResource({ start: startLighting, halt: () => {} })

const clients = defineResource({ start: startClients, halt: () => {} })

const stage = defineResource({
  dependencies: ['lighting'],
  start: ({ lighting }: Pick<Shell, 'lighting'>) => startStage(lighting.lit),
  halt: (started) => started.stop(),
})

const shell = defineResource({
  dependencies: ['clients', 'lighting', 'stage'],
  start: async (started: Shell) => {
    stageShown('models')
    bindShell(started)
    await import('./main.ts')
  },
  halt: () => {},
})

export const tower3d = { lighting, clients, stage, shell }
