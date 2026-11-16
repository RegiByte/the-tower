import { defineResource } from 'braided'
import { startAssets } from './loads.ts'
import { startClients } from './clients.ts'
import { startInput } from './input.ts'
import { startMusic } from './music.ts'
import { startLighting } from './light/setting.ts'
import { stage as stageShown } from './loading.ts'
import { bindShell, type Shell } from './shell.ts'
import { startStage } from './stage.ts'
import { startTerminal } from './term.ts'

/**
 * Tower 3D as a system of braided resources, each started once its dependencies have (decision `tower3d-system`).
 * The only module that knows where each is implemented:
 *
 *   lighting  whether the page draws the light rig, read before anything draws (light/setting.ts)
 *   clients   the extension clients whose words the page draws (clients.ts)
 *   stage     the renderer, scene, camera and the city outside, on the page's canvas (stage.ts)
 *   input     the keys held and the mouse's travel under the pointer lock (input.ts)
 *   music     the band, made on the first play (music.ts)
 *   terminal  the desk's terminal, mounted in the panel (term.ts)
 *   assets    the models, the kit and the faces, loading; the page draws once they are in (loads.ts)
 *   shell     the page itself: main.ts, imported once the resources it reads are bound (shell.ts)
 */

const lighting = defineResource({ start: startLighting, halt: () => {} })

const clients = defineResource({ start: startClients, halt: () => {} })

const stage = defineResource({
  dependencies: ['lighting'],
  start: ({ lighting }: Pick<Shell, 'lighting'>) => startStage(lighting.lit),
  halt: (started) => started.stop(),
})

const input = defineResource({
  dependencies: ['stage'],
  start: ({ stage }: Pick<Shell, 'stage'>) => startInput(stage.canvas),
  halt: (started) => started.stop(),
})

const music = defineResource({ start: startMusic, halt: (started) => started.stop() })

const terminal = defineResource({ start: startTerminal, halt: (started) => started.stop() })

const assets = defineResource({ start: startAssets, halt: () => {} })

const shell = defineResource({
  dependencies: ['clients', 'lighting', 'stage', 'input', 'music', 'terminal', 'assets'],
  start: async (started: Shell) => {
    stageShown('models')
    bindShell(started)
    await import('./main.ts')
  },
  halt: () => {},
})

export const tower3d = { lighting, clients, stage, input, music, terminal, assets, shell }
