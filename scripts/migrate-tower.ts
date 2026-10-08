/**
 * Renames what session logs written before the rename call by the old names, once:
 *
 * - the facts the tower derives, from the `mc.*` namespace to `tower.*` (`mc.show` → `tower.show`, `mc.tool.result`
 *   → `tower.tool.result`, …): an `h` event whose `hook_event_name` starts with `mc.`;
 * - a reviewer's launch prompt, `/mc-sensor:review <CALLSIGN>` → `/tower:review <CALLSIGN>`: the header's argv after
 *   `--`, and the `prompt.submit` text and `UserPromptSubmit` prompt that carry it, which the board compares with the
 *   launch (`reviewedIn`, `promptBy`).
 *
 *   npx tsx scripts/migrate-tower.ts root <system root>   every log in <root>/sessions, then deletes <root>/cache/facts
 *   npx tsx scripts/migrate-tower.ts logs <file.jsonl…>   the given logs (the recorded fixtures)
 *
 * Run it on a system root only while its host is stopped: the host appends to the logs it rewrites. Every other line
 * is copied byte for byte, as is a half line after the last newline (a host killed mid-append), and each log keeps
 * its modification time. A renamed line must serialize back to its original bytes before renaming, or the log is
 * left untouched and the run fails. Checkpoints hold byte offsets into the old logs, so `root` deletes them
 * (`cache/facts`, a cache: they are recomputed on the next fold). Running it again changes nothing.
 */
import { readdirSync, readFileSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const OLD = 'mc.'
const NEW = 'tower.'
const OLD_REVIEW = '/mc-sensor:review '
const NEW_REVIEW = '/tower:review '
const PROMPT_FIELDS: Record<string, string> = { 'prompt.submit': 'text', UserPromptSubmit: 'prompt' }

type Renamed = Record<string, number>

const reviewPrompt = (text: unknown): string | undefined =>
  typeof text === 'string' && text.startsWith(OLD_REVIEW) ? NEW_REVIEW + text.slice(OLD_REVIEW.length) : undefined

/** The line with its renames applied, and what was renamed; `undefined` when nothing in it is renamed. */
const renamedLine = (line: string, header: boolean): { line: string; what: string } | undefined => {
  if (header) {
    if (!line.includes(OLD_REVIEW)) return undefined
    const head = JSON.parse(line)
    const prompt = head.argv?.at(-2) === '--' ? reviewPrompt(head.argv.at(-1)) : undefined
    if (prompt === undefined) return undefined
    return { line: JSON.stringify({ ...head, argv: [...head.argv.slice(0, -1), prompt] }), what: 'header argv /mc-sensor:review' }
  }
  if (!line.includes(`"hook_event_name":"${OLD}`) && !line.includes(OLD_REVIEW)) return undefined
  const event = JSON.parse(line)
  const data = event[1] === 'h' ? event[2] : undefined
  const name = data?.hook_event_name
  if (typeof name !== 'string') return undefined
  if (name.startsWith(OLD)) return { line: JSON.stringify([event[0], event[1], { ...data, hook_event_name: NEW + name.slice(OLD.length) }]), what: name }
  const field = PROMPT_FIELDS[name]
  const prompt = field ? reviewPrompt(data[field]) : undefined
  if (prompt === undefined) return undefined
  return { line: JSON.stringify([event[0], event[1], { ...data, [field]: prompt }]), what: `${name} /mc-sensor:review` }
}

const migrateLog = (file: string): Renamed => {
  const renamed: Renamed = {}
  const text = readFileSync(file, 'utf8')
  const lines = text.split('\n')
  const tail = lines.pop()!
  const next = [
    ...lines.map((line, i) => {
      const result = renamedLine(line, i === 0)
      if (!result) return line
      if (JSON.stringify(JSON.parse(line)) !== line) throw new Error(`${file}: a line to rename does not serialize back to its bytes, left untouched: ${line.slice(0, 200)}`)
      renamed[result.what] = (renamed[result.what] ?? 0) + 1
      return result.line
    }),
    tail,
  ].join('\n')
  if (next === text) return renamed
  const { atime, mtime } = statSync(file)
  const tmp = `${file}.migrating`
  writeFileSync(tmp, next, { mode: statSync(file).mode })
  utimesSync(tmp, atime, mtime)
  renameSync(tmp, file)
  return renamed
}

const migrateLogs = (files: string[]) => {
  const total: Renamed = {}
  let changed = 0
  for (const file of files) {
    const renamed = migrateLog(file)
    if (Object.keys(renamed).length) changed++
    for (const [name, n] of Object.entries(renamed)) total[name] = (total[name] ?? 0) + n
  }
  console.log(`${changed} of ${files.length} logs rewritten`)
  for (const [what, n] of Object.entries(total).sort()) console.log(`  ${what}: ${n}`)
}

const [mode, ...args] = process.argv.slice(2)

switch (mode) {
  case 'root': {
    const sessions = path.join(args[0], 'sessions')
    migrateLogs(readdirSync(sessions).filter((f) => f.endsWith('.jsonl')).map((f) => path.join(sessions, f)))
    rmSync(path.join(args[0], 'cache', 'facts'), { recursive: true, force: true })
    console.log(`deleted ${path.join(args[0], 'cache', 'facts')}`)
    break
  }
  case 'logs':
    migrateLogs(args)
    break
  default:
    throw new Error('Usage: migrate-tower.ts root <system root> | logs <file.jsonl…>')
}
