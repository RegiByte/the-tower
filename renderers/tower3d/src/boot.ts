import { prefetch } from './files.ts'
import { FIXTURE } from './fixture-name.ts'
import { startLighting } from './light/setting.ts'
import { drop, stage } from './loading.ts'
import type { Door } from './door.ts'

/** Tower 3D's entry: what must be known before the page's modules build anything, then the page. */
if (FIXTURE !== undefined) drop()
prefetch()
const started = startLighting().then(() => (stage('models'), import('./main.ts')))

/**
 * The door from the first script on, so an agent can await `tower3d.ready()` as soon as the page has loaded: the page's
 * modules import its extension clients before they build anything, which can settle after the load event, and then
 * replace this with the whole door.
 */
window.tower3d = { ready: () => started.then(() => window.tower3d.ready()) } as Door
