import { defineResource } from 'braided'
import { startAssets } from './loads.ts'
import { startClients } from './clients.ts'
import { startInput } from './input.ts'
import { startMusic } from './music.ts'
import { startLighting } from './light/setting.ts'
import { stage as stageShown } from './loading.ts'
import { startPort } from './port.ts'
import { bindShell, type Shell } from './shell.ts'
import type { Main } from './main.ts'
import type { WorldDeps } from './building.ts'
import { startStage } from './stage.ts'
import { startTerminal } from './term.ts'
import { startToasts } from './toasts.ts'

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
 *   port      where the reads that land send their events, the app attached once it is made (port.ts)
 *   toasts    what tells the user what happened, and the API calls whose failure it tells (toasts.ts)
 *   shell     what the leaf modules read as they load, bound before any page resource loads its module (shell.ts)
 *   events    what the page's loops handled, kept for the door (events.ts)
 *   world     the building in the scene: its plan, its layers, what can be seen and picked (building.ts)
 *   main      the page itself: main.ts, imported and started once the resources it reads have (main.ts)
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

const port = defineResource({ start: startPort, halt: () => {} })

const shell = defineResource({
  dependencies: ['clients', 'lighting', 'stage', 'input', 'port'],
  start: (started: Shell) => {
    bindShell(started)
    return started
  },
  halt: () => {},
})

const toasts = defineResource({ start: startToasts, halt: () => {} })

/**
 * A page resource imports its module as it starts, once `shell` is bound: the leaf modules it imports read the binding
 * as they load. Transitional, with the binding.
 */
const events = defineResource({
  dependencies: ['shell'],
  start: async () => (await import('./events.ts')).startEvents(),
  halt: () => {},
})

const world = defineResource({
  dependencies: ['shell', 'clients', 'stage', 'port', 'toasts'],
  start: async (started: WorldDeps & { shell: Shell }) => (await import('./building.ts')).startWorld(started),
  halt: () => {},
})

const main = defineResource({
  dependencies: ['shell', 'clients', 'lighting', 'stage', 'input', 'music', 'terminal', 'assets', 'port', 'toasts', 'events', 'world'],
  start: async (started: Main & { shell: Shell }) => {
    stageShown('models')
    ;(await import('./main.ts')).startMain(started)
  },
  halt: () => {},
})

export const tower3d = { lighting, clients, stage, input, music, terminal, assets, port, toasts, shell, events, world, main }
