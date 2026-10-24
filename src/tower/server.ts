/**
 * The tower process: the core's resources (src/tower/spine.ts) started in order, and halted in reverse on SIGTERM
 * (`tower down`) or SIGINT. A resource that fails to start fails the tower: what started is halted, and it exits.
 */
import { haltSystem, startSystem } from 'braided'
import { tower } from './spine.ts'

const resources = tower()
const { system, errors } = await startSystem(resources)

const halt = async (): Promise<number> => {
  const halted = await haltSystem(resources, system)
  for (const [id, err] of halted.errors) console.error(`${id} didn't halt:`, err)
  return halted.errors.size ? 1 : 0
}

if (errors.size) {
  for (const [id, err] of errors) console.error(`${id} didn't start:`, err)
  await halt()
  process.exit(1)
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => void halt().then((code) => process.exit(code)))

console.log(`tower up: http://127.0.0.1:${system['core:http'].port}  (${system['core:config'].paths.config})`)
