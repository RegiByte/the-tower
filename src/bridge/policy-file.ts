/**
 * A policy's file read as a policy: a `# Title` line, then a fenced json block (the header), then the prose a run's
 * worker starts on. Parsing is total: a file that isn't a policy says why, each problem at its path.
 */
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { SPAWN_FIELDS } from '../shared/api.ts'
import type { PolicyHeader, Problem } from '../shared/policies.ts'
import { cronProblem, isZone } from '../shared/slots.ts'
import type { Parsed } from './policies.ts'

const Cron = z.string().superRefine((cron, ctx) => {
  const problem = cronProblem(cron)
  if (problem) ctx.addIssue({ code: 'custom', message: problem })
})

const When = z.strictObject({ cron: z.array(Cron).min(1), tz: z.string().refine(isZone, 'an IANA zone, like Europe/Lisbon').optional() })

const Hire = SPAWN_FIELDS.pick({ cwd: true, cut: true, model: true, effort: true })
  .strict()
  .refine((h) => h.cwd === undefined || h.cut === undefined, { message: 'takes `cwd` or `cut`, not both', path: ['cut'] })

/** Unknown keys make a policy invalid: a key this tower doesn't know is almost always a constraint it would drop. */
const PolicyHeaderSchema = z.strictObject({
  when: When,
  check: z.string().min(1).optional(),
  start: z.enum(['ask', 'auto']).default('ask'),
  live: z.int().min(1).default(1),
  hire: Hire.default({}),
  runner: z.string().min(1).optional(),
  x: z.record(z.string(), z.unknown()).optional(),
}) satisfies z.ZodType<PolicyHeader, unknown>

const UNKNOWN_TOP = "unknown key (this tower doesn't know it: update the tower, or put a runner's own data under x)"

/** A zod issue's path as `tower config check` prints one: `when.cron[1]`. */
const pathOf = (path: PropertyKey[]): string =>
  path.reduce<string>((at, key) => (typeof key === 'number' ? `${at}[${key}]` : at ? `${at}.${String(key)}` : String(key)), '')

const problemsOf = (error: z.ZodError): Problem[] =>
  error.issues.flatMap((issue): Problem[] =>
    issue.code === 'unrecognized_keys'
      ? issue.keys.map((key) => ({ path: pathOf([...issue.path, key]), message: issue.path.length ? 'unknown key' : UNKNOWN_TOP }))
      : [{ path: pathOf(issue.path) || 'header', message: issue.message }],
  )

const TITLE = /^#\s+(.+?)\s*$/
const FENCE_OPEN = /^```json\s*$/
const FENCE_CLOSE = /^```\s*$/

/** The file's sha256, as facts name it: `sha256:<hex>`. */
export const hashOf = (text: string): string => `sha256:${createHash('sha256').update(text).digest('hex')}`

/** A file as a policy, or why it isn't one: a parse never throws. */
export const parsePolicy = (text: string): Parsed => {
  const lines = text.split('\n')
  const first = lines.findIndex((l) => l.trim())
  const title = first === -1 ? undefined : TITLE.exec(lines[first])?.[1]
  if (title === undefined) return { ok: false, problems: [{ path: 'title', message: 'the first line is the title: `# <Title>`' }] }
  const open = lines.findIndex((l, i) => i > first && l.trim())
  if (open === -1 || !FENCE_OPEN.test(lines[open])) return { ok: false, title, problems: [{ path: 'header', message: 'after the title comes the header, a fenced ```json block' }] }
  const close = lines.findIndex((l, i) => i > open && FENCE_CLOSE.test(l))
  if (close === -1) return { ok: false, title, problems: [{ path: 'header', message: 'the ```json block has no closing ```' }] }
  let json: unknown
  try {
    json = JSON.parse(lines.slice(open + 1, close).join('\n'))
  } catch (err) {
    return { ok: false, title, problems: [{ path: 'header', message: `not JSON: ${(err as Error).message}` }] }
  }
  const header = PolicyHeaderSchema.safeParse(json)
  const prompt = lines.slice(close + 1).join('\n').trim()
  const problems = [...(header.success ? [] : problemsOf(header.error)), ...(prompt ? [] : [{ path: 'prose', message: 'a run starts on a prompt: write it after the header' }])]
  return problems.length || !header.success ? { ok: false, title, problems } : { ok: true, title, header: header.data, prompt }
}
