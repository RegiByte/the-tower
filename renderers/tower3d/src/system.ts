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
import type { ViewsDeps } from './views.ts'
import type { SpawnDeps } from './spawn.ts'
import type { HudDeps } from './hud.ts'
import type { NavigationDeps } from './navigation.ts'
import type { PanelsDeps } from './panels.ts'
import type { AppLoopDeps } from './app-loop.ts'
import type { ControlsDeps } from './controls.ts'
import type { FramesDeps } from './frames.ts'
import type { FeedDeps } from './feed.ts'
import type { DoorDeps } from './door.ts'
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
 *   views     the views the panels mount, and the layout they are drawn by (views.ts)
 *   spawn     hiring: the new-worker dialog, the hires in flight, the carried note handed over (spawn.ts)
 *   hud       what is drawn over the world outside the panels: the HUD, the pause card, the settings (hud.ts)
 *   navigation  getting about: travel, the overview, the elevator's ride, what the prompt offers (navigation.ts)
 *   panels    what is drawn beside the world: each panel's enter, leave and draw, its verbs (panels.ts)
 *   app       the page's app loop with its executors, attached to the port (app-loop.ts)
 *   controls  the pointer and the keys: what a click, a wheel or a key does (controls.ts)
 *   frames    each frame's update of what moves on its own, and its render (frames.ts)
 *   feed      the boards the page is fed, live or a fixture's, the first started once the models are in (feed.ts)
 *   door      what agents drive the page by, filled once what it drives has started (door.ts)
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

const views = defineResource({
  dependencies: ['shell', 'port', 'toasts'],
  start: async (started: ViewsDeps & { shell: Shell }) => (await import('./views.ts')).startViews(started),
  halt: () => {},
})

const spawn = defineResource({
  dependencies: ['shell', 'clients', 'port', 'toasts', 'events', 'world'],
  start: async (started: SpawnDeps & { shell: Shell }) => (await import('./spawn.ts')).startSpawn(started),
  halt: () => {},
})

const hud = defineResource({
  dependencies: ['shell', 'lighting', 'stage', 'music', 'port', 'toasts', 'world', 'views', 'spawn'],
  start: async (started: HudDeps & { shell: Shell }) => (await import('./hud.ts')).startHud(started),
  halt: () => {},
})

const navigation = defineResource({
  dependencies: ['shell', 'stage', 'port', 'toasts', 'world', 'hud'],
  start: async (started: NavigationDeps & { shell: Shell }) => (await import('./navigation.ts')).startNavigation(started),
  halt: () => {},
})

const panels = defineResource({
  dependencies: ['shell', 'clients', 'stage', 'music', 'terminal', 'port', 'toasts', 'events', 'world', 'views', 'spawn', 'hud', 'navigation'],
  start: async (started: PanelsDeps & { shell: Shell }) => (await import('./panels.ts')).startPanels(started),
  halt: () => {},
})

const app = defineResource({
  dependencies: ['shell', 'clients', 'stage', 'input', 'port', 'toasts', 'events', 'world', 'views', 'spawn', 'hud', 'navigation', 'panels'],
  start: async (started: AppLoopDeps & { shell: Shell }) => (await import('./app-loop.ts')).startAppLoop(started),
  halt: () => {},
})

/** After the app: its window blur and visibility listeners register after the app's own. */
const controls = defineResource({
  dependencies: ['shell', 'stage', 'port', 'world', 'hud', 'navigation', 'panels', 'app'],
  start: async (started: ControlsDeps & { shell: Shell; app: unknown }) => (await import('./controls.ts')).startControls(started),
  halt: () => {},
})

/** After the app and the controls: the frames it starts read the app's db, and the order is the page's. */
const frames = defineResource({
  dependencies: ['shell', 'lighting', 'stage', 'input', 'music', 'port', 'world', 'hud', 'navigation', 'panels', 'app', 'controls'],
  start: async (started: FramesDeps & { shell: Shell; app: unknown; controls: unknown }) => (await import('./frames.ts')).startFrames(started),
  halt: () => {},
})

const feed = defineResource({
  dependencies: ['shell', 'stage', 'assets', 'port', 'toasts', 'world', 'spawn', 'hud', 'panels', 'frames'],
  start: async (started: FeedDeps & { shell: Shell }) => {
    stageShown('models')
    return (await import('./feed.ts')).startFeed(started)
  },
  halt: () => {},
})

const door = defineResource({
  dependencies: ['shell', 'port', 'events', 'world', 'navigation', 'panels', 'app', 'controls', 'frames', 'feed'],
  start: async (started: DoorDeps & { shell: Shell }) => (await import('./door.ts')).startDoor(started),
  halt: () => {},
})

const main = defineResource({
  dependencies: ['shell', 'clients', 'lighting', 'stage', 'input', 'music', 'terminal', 'assets', 'port', 'toasts', 'events', 'world', 'views', 'spawn', 'hud', 'navigation', 'panels', 'app', 'controls', 'frames', 'feed'],
  start: async (started: Main & { shell: Shell }) => (await import('./main.ts')).startMain(started),
  halt: () => {},
})

export const tower3d = { lighting, clients, stage, input, music, terminal, assets, port, toasts, shell, events, world, views, spawn, hud, navigation, panels, app, controls, frames, feed, door, main }
