/** The patterns the checkout ships, `docs/patterns/<id>.md`, read as `GET /patterns` serves them. */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { parsePattern, type Pattern } from './shared/capabilities.ts'

const PATTERNS_DIR = path.join(import.meta.dirname, '..', 'docs', 'patterns')

/** Every pattern, by file name. A file that doesn't parse throws, naming it. */
export const readPatterns = (): Pattern[] =>
  readdirSync(PATTERNS_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => parsePattern(f.slice(0, -'.md'.length), readFileSync(path.join(PATTERNS_DIR, f), 'utf8')))
