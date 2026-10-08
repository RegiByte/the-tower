// Writes raw bytes to a session: npx tsx spikes/mod/key.mts <id> '<JSON string>', e.g. '"\u001b"' for Esc.
import { connectHost } from '../../src/shared/client.ts'
import { configPath, systemPaths } from '../../src/shared/paths.ts'

const [id, data] = process.argv.slice(2)
const host = await connectHost(systemPaths(configPath()).control)
console.log(await host.request({ t: 'write', id, data: JSON.parse(data) }))
host.close()
