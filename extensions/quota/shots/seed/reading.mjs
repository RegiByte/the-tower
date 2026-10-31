/**
 * Seeds the sandbox with one made-up answered read of the quota probe. A sandbox's sessions are not Claude, so the
 * probe's own first read there fails (no answer within 30s): this waits for that failure, then appends an answer after
 * it, as `quota/read-now` would have written it, to the probe's stream under $TOWER_SANDBOX.
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const now = new Date()
const file = path.join(process.env.TOWER_SANDBOX, 'streams', 'system', 'probe.quota', `${now.toISOString().slice(0, 7)}.jsonl`)
const failed = () => existsSync(file) && readFileSync(file, 'utf8').includes('"f",')

for (const end = Date.now() + 150_000; !failed(); await new Promise((r) => setTimeout(r, 500))) {
  if (Date.now() > end) throw new Error(`the probe's first read never failed into ${file}`)
}

const at = Date.now()
const hours = (h) => new Date(Math.round((at + h * 3_600_000) / 1000) * 1000).toISOString()
const answer = {
  rate_limits_available: true,
  rate_limits: {
    five_hour: { utilization: 34, resets_at: hours(2.4) },
    seven_day: { utilization: 58, resets_at: hours(71) },
  },
}
const limits = [
  { kind: 'five_hour', percentUsed: 34, resetsAt: hours(2.4) },
  { kind: 'seven_day', percentUsed: 58, resetsAt: hours(71) },
]
const { startedAt } = JSON.parse(readFileSync(file, 'utf8').split('\n')[0])
appendFileSync(file, `${JSON.stringify([Math.round(at - startedAt) / 1000, 'u', { ms: 1400, answer, limits, unavailable: false }])}\n`)
