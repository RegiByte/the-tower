import { startSystem } from 'braided'
import { prefetch } from './files.ts'
import { FIXTURE } from './fixture-name.ts'
import { startLighting } from './light/setting.ts'
import { drop, fail, stage } from './loading.ts'
import { tower3d } from './system.ts'
import type { Door } from './door.ts'

/**
 * Tower 3D's entry: its system started (system.ts), the page its last resource. A resource that fails, and every one
 * that needs it, is said on the loading screen by name.
 */
if (FIXTURE !== undefined) drop()
prefetch()
const started = startLighting().then(() => (stage('models'), startSystem(tower3d))).then(({ errors }) => {
  if (errors.size === 0) return
  const why = [...errors].map(([id, err]) => `${id}: ${err.message}`).join(' · ')
  fail(`start: ${why}`)
  throw new Error(`Tower 3D did not start: ${why}`)
})

/**
 * The door from the first script on, so an agent can await `tower3d.ready()` as soon as the page has loaded: the page's
 * extension clients load before the page's modules build anything, which can settle after the load event, and the
 * page then replaces this with the whole door.
 */
window.tower3d = { ready: () => started.then(() => window.tower3d.ready()) } as Door
