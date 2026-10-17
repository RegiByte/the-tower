import { prefetch } from './files.ts'
import { FIXTURE } from './fixtures.ts'
import { startLighting } from './light/setting.ts'
import { drop, stage } from './loading.ts'

/** Tower 3D's entry: what must be known before the page's modules build anything, then the page. */
if (FIXTURE !== undefined) drop()
prefetch()
startLighting().then(() => (stage('models'), import('./main.ts')))
