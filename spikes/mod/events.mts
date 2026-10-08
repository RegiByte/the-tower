// Prints a session log's hook events, one line each: npx tsx spikes/mod/events.mts <log path> [from seconds]
import { readFileSync } from 'node:fs'

const [path, from = '0'] = process.argv.slice(2)
const lines = readFileSync(path, 'utf8').split('\n').slice(1).filter(Boolean)
for (const line of lines) {
  const [t, code, data] = JSON.parse(line)
  if (code === 'x') console.log(t.toFixed(3).padStart(8), 'EXIT', JSON.stringify(data))
  if (code !== 'h' || t < Number(from)) continue
  const { hook_event_name: name, session_id, transcript_path, cwd, permission_mode, ...rest } = data
  console.log(t.toFixed(3).padStart(8), name.padEnd(28), JSON.stringify(rest).slice(0, 220))
}
