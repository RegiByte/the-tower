/**
 * The tower from a fresh clone, run by `npm run setup` once `npm ci` has installed it: a first config unless one
 * exists (its project from the directories given, this checkout when none are), the doctor's checks of the machine and
 * the config, then the host, the terms daemon and the tower, detached. A check that fails stops it before anything starts;
 * a daemon's place held by something else stops it too.
 *
 *   npm run setup                              the first project is this checkout
 *   npm run setup -- <hub> [repos...]          the first project is <hub>, beside [repos], relative to where npm ran
 *   npm run setup -- --tower3d [<hub> ...]     also build Tower 3D
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { readiness, verdictLines } from '../src/doctor.ts'
import { init } from '../src/init.ts'
import { bringAllUp, daemons } from '../src/machine.ts'
import { towerPort, towerUrl } from '../src/shared/model.ts'
import { configPath, systemPaths } from '../src/shared/paths.ts'
import { readConfig } from '../src/system.ts'

const REPO = path.join(import.meta.dirname, '..')
const { values, positionals } = parseArgs({ allowPositionals: true, options: { tower3d: { type: 'boolean' } } })
const paths = systemPaths(configPath())

if (existsSync(paths.config)) console.log(`config: ${paths.config} exists, kept as it is`)
else {
  const [hub = REPO, ...repos] = positionals.map((dir) => path.resolve(process.env.INIT_CWD ?? process.cwd(), dir))
  const config = await init(paths.config, hub, repos)
  console.log(`config: wrote ${paths.config}, project ${Object.keys(config.projects).join(', ')} in ${hub}`)
}

const verdicts = await readiness(paths)
console.log(`\n${verdictLines(verdicts).join('\n')}\n`)
if (verdicts.some((v) => v.level === 'fail')) {
  console.log('Fix what failed above, then run npm run setup again.')
  process.exit(1)
}

if (values.tower3d) execFileSync('npm', ['run', 'tower3d'], { cwd: REPO, stdio: 'inherit' })

const config = readConfig(paths.config)
for (const [daemon, answer] of await bringAllUp(daemons(paths, towerPort(config)))) console.log(`${daemon.name}: ${answer} · log ${daemon.log}`)

console.log(`
The tower: ${towerUrl(config)}

  npm link                 puts the tower command on your PATH (tower up, tower down, tower doctor, tower spawn …)
  ${values.tower3d ? `${towerUrl(config)}/r/tower3d/   Tower 3D` : 'npm run tower3d          builds Tower 3D, then open /r/tower3d/'}
  ${paths.config}   your config: projects, shelf, editor (README)`)
