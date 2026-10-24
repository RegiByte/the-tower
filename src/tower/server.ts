/**
 * The tower process: the core's resources (src/tower/spine.ts) started in order, then the extensions beside them, and
 * all halted in reverse on SIGTERM (`tower down`) or SIGINT. A core resource that fails to start fails the tower: what
 * started is halted, and it exits. An extension that fails to start fails alone (src/tower/extensions.ts).
 */
import { haltSystem, startSystem, type StartedSystem, type SystemConfig } from 'braided'
import { runExtensions } from './extensions.ts'
import { tower } from './spine.ts'

const resources = tower()
const { system, errors } = await startSystem(resources)

const haltAll = async (all: SystemConfig, started: StartedSystem<SystemConfig>): Promise<number> => {
  const halted = await haltSystem(all, started)
  for (const [id, err] of halted.errors) console.error(`${id} didn't halt:`, err)
  return halted.errors.size ? 1 : 0
}

if (errors.size) {
  for (const [id, err] of errors) console.error(`${id} didn't start:`, err)
  await haltAll(resources, system)
  process.exit(1)
}

const running = await runExtensions(resources, system)

const halt = async (): Promise<number> => {
  const now = await running.stop()
  return haltAll(now.resources, now.system)
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => void halt().then((code) => process.exit(code)))

console.log(`tower up: http://127.0.0.1:${system['core:http'].port}  (${system['core:config'].paths.config})`)
