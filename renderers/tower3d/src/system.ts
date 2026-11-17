import { defineResource } from 'braided'
import type { Tower } from './api.ts'
import type { Clients } from './clients.ts'
import { startAssets } from './loads.ts'
import { startClients } from './clients.ts'
import { startInput } from './input.ts'
import { startMusic } from './music.ts'
import { fixtureLighting, startLighting, type Lighting } from './light/setting.ts'
import { fixtureClock, startClock, type Clock } from './clock.ts'
import { stage as stageShown } from './loading.ts'
import { startPort } from './port.ts'
import { startWorld } from './building.ts'
import { startViews } from './views.ts'
import { startSpawn } from './spawn.ts'
import { startHud } from './hud.ts'
import { startNavigation } from './navigation.ts'
import { startPanels } from './panels.ts'
import { startAppLoop } from './app-loop.ts'
import { startControls, type ControlsDeps } from './controls.ts'
import { startFrames, type FramesDeps } from './frames.ts'
import { startFeed, startFixtureFeed, type FeedDeps, type FixtureFeedDeps } from './feed.ts'
import { startDoor } from './door.ts'
import { startKeeper, type KeeperDeps } from './keeper.ts'
import { startStage, type Stage } from './stage.ts'
import { startTerminal } from './term.ts'
import { screensOf } from './screens.ts'
import { picturesOf } from './showing.ts'
import { fixtureTower, startFixture, type Fixture } from './fixtures.ts'
import { startToasts } from './toasts.ts'
import { startTitles } from './titles.ts'
import { startArchive } from './archive.ts'
import { startEvents } from './events.ts'
import { startSim } from './sim.ts'
import { startWalker } from './walker.ts'

/**
 * Tower 3D as a system of braided resources, each started once its dependencies have (decision `tower3d-system`).
 * The only module that knows where each is implemented:
 *
 *   tower     the tower's API the page reads and writes through (`window.tower`, /lib/client.js)
 *   clock     the wall clock the page draws by, pinned by `?at=` (clock.ts)
 *   sim       the simulated clock animations read, which frames advance and `?stepped` starts stopped (sim.ts)
 *   walker    where you stand and look, which the frames move and walking, rides and cuts place (walker.ts)
 *   lighting  whether the page draws the light rig, read before anything draws (light/setting.ts)
 *   clients   the extension clients whose words the page draws (clients.ts)
 *   stage     the renderer, scene, camera and the city outside, on the page's canvas (stage.ts)
 *   input     the keys held and the mouse's travel under the pointer lock (input.ts)
 *   music     the band, made on the first play (music.ts)
 *   screens   the monitors' streams, each painted while it changes (screens.ts)
 *   pictures  what workers showed, painted: posters, pages, images and films (showing.ts)
 *   terminal  the desk's terminal, mounted in the panel (term.ts)
 *   assets    the models, the kit and the faces, loading; the page draws once they are in (loads.ts)
 *   port      where the reads that land send their events, the app attached once it is made (port.ts)
 *   toasts    what tells the user what happened, and the API calls whose failure it tells (toasts.ts)
 *   titles    the titles read from items' texts: notes, kept items, games (titles.ts)
 *   archive   every floor's archive as read, telling the port as each read lands (archive.ts)
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
 *   keeper    where you stand and what you have seen, kept by the tower for the next visit (keeper.ts)
 */

const tower = defineResource({ start: (): Tower => window.tower, halt: () => {} })

const clock = defineResource({ start: startClock, halt: () => {} })

const sim = defineResource({ start: startSim, halt: () => {} })

const walker = defineResource({ start: startWalker, halt: () => {} })

const lighting = defineResource({ dependencies: ['tower'], start: startLighting, halt: () => {} })

const clients = defineResource({ start: startClients, halt: () => {} })

const stage = defineResource({
  dependencies: ['clock', 'lighting'],
  start: ({ clock, lighting }: { clock: Clock; lighting: Lighting }) => startStage(lighting.lit, clock.now),
  halt: (started) => started.stop(),
})

const input = defineResource({
  dependencies: ['stage'],
  start: ({ stage }: { stage: Stage }) => startInput(stage.canvas),
  halt: (started) => started.stop(),
})

const music = defineResource({ start: startMusic, halt: (started) => started.stop() })

const screens = defineResource({ dependencies: ['tower'], start: ({ tower }: { tower: Tower }) => screensOf(tower.watch), halt: () => {} })

const pictures = defineResource({ dependencies: ['tower'], start: ({ tower }: { tower: Tower }) => picturesOf(tower), halt: () => {} })

const terminal = defineResource({ dependencies: ['tower'], start: startTerminal, halt: (started) => started.stop() })

const assets = defineResource({ dependencies: ['tower'], start: startAssets, halt: () => {} })

const port = defineResource({ start: startPort, halt: () => {} })

const toasts = defineResource({ dependencies: ['tower'], start: startToasts, halt: () => {} })

const titles = defineResource({ dependencies: ['tower', 'clients', 'port'], start: startTitles, halt: () => {} })

const archive = defineResource({ dependencies: ['tower', 'clock', 'port'], start: startArchive, halt: () => {} })

const events = defineResource({
  dependencies: ['archive', 'sim'],
  start: startEvents,
  halt: () => {},
})

const world = defineResource({
  dependencies: ['walker', 'clock', 'sim', 'tower', 'assets', 'screens', 'pictures', 'clients', 'titles', 'archive', 'stage', 'port', 'toasts'],
  start: startWorld,
  halt: () => {},
})

const views = defineResource({
  dependencies: ['tower', 'clock', 'port', 'toasts', 'assets'],
  start: startViews,
  halt: () => {},
})

const spawn = defineResource({
  dependencies: ['tower', 'clients', 'titles', 'port', 'toasts', 'events', 'world'],
  start: startSpawn,
  halt: () => {},
})

const hud = defineResource({
  dependencies: ['walker', 'clock', 'tower', 'lighting', 'clients', 'stage', 'music', 'port', 'toasts', 'world', 'views', 'spawn'],
  start: startHud,
  halt: () => {},
})

const navigation = defineResource({
  dependencies: ['walker', 'clock', 'sim', 'tower', 'assets', 'clients', 'titles', 'archive', 'stage', 'port', 'toasts', 'world', 'hud'],
  start: startNavigation,
  halt: () => {},
})

const panels = defineResource({
  dependencies: ['clock', 'sim', 'tower', 'assets', 'clients', 'titles', 'archive', 'stage', 'music', 'terminal', 'port', 'toasts', 'events', 'world', 'views', 'spawn', 'hud', 'navigation', 'pictures'],
  start: startPanels,
  halt: () => {},
})

const app = defineResource({
  dependencies: ['walker', 'clock', 'sim', 'tower', 'clients', 'archive', 'stage', 'input', 'port', 'toasts', 'events', 'world', 'views', 'spawn', 'hud', 'navigation', 'panels'],
  start: startAppLoop,
  halt: () => {},
})

/** After the app: its window blur and visibility listeners register after the app's own. */
const controls = defineResource({
  dependencies: ['walker', 'stage', 'port', 'world', 'hud', 'navigation', 'panels', 'app'],
  start: (started: ControlsDeps & { app: unknown }) => startControls(started),
  halt: () => {},
})

/** After the app and the controls: the frames it starts read the app's db, and the order is the page's. */
const frames = defineResource({
  dependencies: ['walker', 'clock', 'sim', 'tower', 'screens', 'pictures', 'lighting', 'stage', 'input', 'music', 'port', 'world', 'hud', 'navigation', 'panels', 'app', 'controls'],
  start: (started: FramesDeps & { controls: unknown }) => startFrames(started),
  halt: () => {},
})

const FEEDS_ON = ['tower', 'archive', 'stage', 'assets', 'port', 'toasts', 'world', 'spawn', 'hud', 'panels', 'frames'] as const

const feed = defineResource({
  dependencies: FEEDS_ON,
  start: (started: FeedDeps) => {
    stageShown('models')
    return startFeed(started)
  },
  halt: () => {},
})

const door = defineResource({
  dependencies: ['walker', 'sim', 'pictures', 'stage', 'input', 'port', 'events', 'world', 'navigation', 'panels', 'app', 'controls', 'frames', 'feed'],
  start: startDoor,
  halt: () => {},
})

/** After the app: it reads the app's db every second. */
const keeper = defineResource({
  dependencies: ['walker', 'tower', 'port', 'app'],
  start: (started: KeeperDeps & { app: unknown }) => startKeeper(started),
  halt: () => {},
})

export const liveTower3d = { tower, clock, sim, walker, lighting, clients, stage, input, music, screens, pictures, terminal, assets, port, toasts, titles, archive, events, world, views, spawn, hud, navigation, panels, app, controls, frames, feed, door, keeper }

/**
 * A fixture page (`?board=<name>`): the live record with the resources that differ swapped, the page itself the same.
 * The fixture's file is a resource; the tower answers from it with the live one's interface, the clock stands at the
 * instant it was built at, the lighting is `?lighting=off`'s, and the feed delivers its boards, drawn from its start.
 */
export const fixtureTower3d = (name: string) => ({
  ...liveTower3d,
  fixture: defineResource({ start: () => startFixture(name), halt: () => {} }),
  tower: defineResource({
    dependencies: ['fixture', 'clients'],
    start: (started: { fixture: Fixture; clients: Clients }) => fixtureTower(started),
    halt: () => {},
  }),
  lighting: defineResource({ dependencies: ['tower'], start: fixtureLighting, halt: () => {} }),
  clock: defineResource({ dependencies: ['fixture'], start: ({ fixture }: { fixture: Fixture }) => fixtureClock({ name, at: fixture.file.at }), halt: () => {} }),
  feed: defineResource({
    dependencies: [...FEEDS_ON, 'fixture'],
    start: (started: FixtureFeedDeps) => {
      stageShown('models')
      return startFixtureFeed(started)
    },
    halt: () => {},
  }),
})
