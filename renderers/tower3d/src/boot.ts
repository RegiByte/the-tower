import { startSystem } from 'braided'
import { prefetch } from './files.ts'
import { drop, fail } from './loading.ts'
import type { Door } from './door.ts'

/**
 * Tower 3D's entry: its system started (system.ts), the page its last resource, from the live record or, on a fixture
 * board (`?board=<name>`), the fixture's, which shows no loading screen. A resource that fails, and every one that
 * needs it, is said on the loading screen by name.
 */
const board = new URLSearchParams(location.search).get('board')
if (board !== null) drop()
prefetch()
const started = import('./system.ts').then(({ liveTower3d, fixtureTower3d }) => startSystem(board === null ? liveTower3d : fixtureTower3d(board))).then(({ errors }) => {
  if (errors.size === 0) return
  const why = [...errors].map(([id, err]) => `${id}: ${err.message}`).join(' · ')
  fail(`start: ${why}`)
  throw new Error(`Tower 3D did not start: ${why}`)
})

/**
 * The door from the first script on, so an agent can await `tower3d.ready()` as soon as the page has loaded: the system
 * and every module it starts load after this is set (Chrome can fire the load event before a module that takes long to
 * evaluate has run), its resources can settle after the load event, and the page then replaces this with the whole
 * door.
 */
window.tower3d = { ready: () => started.then(() => window.tower3d.ready()) } as Door
