/**
 * The renderer API's commands, declared once as schemas: POST `/<verb>` with a body its `input` parses, answered by
 * its `reply` or by an `ApiError`. The tower parses every request with them and serves them as JSON Schema at
 * `/schema`; the types renderers use are inferred from them. Only the tower runs zod: renderers import types alone.
 */
import { z } from 'zod'
import { AUTHOR, WORKTREE_NAME } from './model.ts'

/**
 * `<major>.<minor>`. The minor moves when the API adds something an older renderer reads past: a board field, a verb,
 * a read, a stream. The major moves, and the minor returns to 0, when a change breaks a renderer: a rename, a removal, a
 * changed meaning; CHANGELOG.md says why.
 */
export const API_VERSION = '1.4'

const id = z.string().min(1)
const absolute = z.string().regex(/^\//, 'an absolute path')
const size = { cols: z.int().positive(), rows: z.int().positive() }

/** An item's file name: no directories, no dot files. */
export const ITEM_ID = /^[^./\\][^/\\]*$/
export const ITEM_EXT = /^[a-z0-9]+$/i

const item = { project: id, collection: id }

const ok = z.object({ t: z.literal('ok') })
const spawned = z.object({ t: z.literal('spawned'), id: z.string() })
/** An item's version: its modification time in whole milliseconds, as the board shows it. */
const modifiedAt = z.int().nonnegative()
const created = z.object({ t: z.literal('created'), id: z.string(), modifiedAt })
const written = z.object({ t: z.literal('written'), modifiedAt })

const worktreeName = z.string().regex(WORKTREE_NAME)
const worktree = { project: id, name: worktreeName }
const launch = { model: z.string().optional(), effort: z.string().optional(), prompt: z.string().optional() }
const cutName = {
  name: worktreeName.optional().describe("The worktrees' folder name; the new worker's callsign, lowercased, when left out."),
  branch: z.string().min(1).optional().describe("The new branch; the project's branch prefix and the name when left out."),
}
const cut = z
  .strictObject({
    ...cutName,
    base: z
      .string()
      .regex(/^origin\/./)
      .optional()
      .describe("A branch on origin to cut from, `origin/<branch>`, fetched first; origin's default branch when left out and no `from` is given."),
    from: id
      .optional()
      .describe(
        'A checkout to fork: a worktree name, or `main`. Each repo starts from a snapshot of it as it is now, uncommitted work included, and counts its work from the same base.',
      ),
  })
  .refine((c) => c.base === undefined || c.from === undefined, { message: 'A cut takes `base` or `from`, not both', path: ['from'] })
  .meta({ not: { required: ['base', 'from'] } })
  .describe('A new worktree in every directory of the project, under one name and on one new branch; the session starts in the hub\'s.')
/** What a cut made, and from what: each repo's base, and why it is that one. */
const cutReply = z.object({ name: z.string(), branch: z.string(), bases: z.array(z.object({ dir: z.string(), base: z.string(), why: z.string() })) })

export const VERBS = {
  spawn: {
    input: z
      .strictObject({
        project: id,
        cwd: id.optional().describe("One of the project's directories or one of their worktrees; the hub's main checkout when left out."),
        cut: cut.optional(),
        ...launch,
      })
      .refine((s) => s.cwd === undefined || s.cut === undefined, { message: 'A spawn takes `cwd` or `cut`, not both', path: ['cut'] })
      .meta({ not: { required: ['cwd', 'cut'] } })
      .describe(
        "Start a session in one of the project's directories or one of their worktrees (`cwd`, the hub when left out), or in a new worktree (`cut`); whatever else is left out is Claude's own default.",
      ),
    reply: spawned.extend({ cut: cutReply.optional() }),
  },
  resume: {
    input: z.object({ id, conversation: id }).describe('Continue a conversation Claude saved in the session, as a new session.'),
    reply: spawned,
  },
  keys: {
    input: z.object({ id, data: z.string() }).describe('Keys reach a session in order, one request at a time, each chunk the terminal produced its own write. Ctrl+Z is dropped: a session has no shell to continue it.'),
    reply: ok,
  },
  submit: {
    input: z.object({ id, text: z.string() }).describe("Type a prompt into the session's composer, after whatever it holds, and submit it, as the user would."),
    reply: ok,
  },
  resize: { input: z.object({ id, ...size }).describe("Resize the session's PTY; whoever resizes it owns its size."), reply: ok },
  kill: { input: z.object({ id }).describe('End the session.'), reply: ok },
  reap: { input: z.object({ id }).describe('End what the session left running.'), reply: ok },
  'reap/process': { input: z.object({ id, pid: z.int().positive() }).describe('End one process the session left running.'), reply: ok },
  open: { input: z.object({ dir: id }).describe("Open a project directory in a new window of the user's editor (the config's `editor.window`)."), reply: ok },
  reveal: {
    input: z.object({ path: absolute }).describe(
      "Show a file or folder the system names selected in a Finder window: anything inside a project's directories (their worktrees among them) or the system root, or a file a worker showed.",
    ),
    reply: ok,
  },
  edit: {
    input: z
      .object({ path: absolute, line: z.int().positive().optional().describe("The file's line to open at.") })
      .describe(
        "Open a file or folder the system names (as `reveal` takes them) in the user's editor: the config's `editor.open`, or `editor.goto` at `line`.",
      ),
    reply: ok,
  },
  'shell/spawn': { input: z.object({ project: id, cwd: id }).describe("Start a login shell in one of the project's directories."), reply: spawned },
  'shell/keys': { input: z.object({ id, data: z.string() }).describe('Keys reach a shell in order, one request at a time.'), reply: ok },
  'shell/resize': { input: z.object({ id, ...size }).describe("Resize the shell's PTY."), reply: ok },
  'shell/kill': { input: z.object({ id }).describe('End the shell.'), reply: ok },
  'collection/create': {
    input: z
      .object({
        ...item,
        name: z.string().optional().describe("Words the item's id carries after the moment, as a slug: `life-garden` from `Life Garden`."),
        ext: z.string().regex(ITEM_EXT),
        content: z.string(),
      })
      .describe("A new file in one of the project's collections, named by the moment it was made (to the second, UTC) and by `name`."),
    reply: created,
  },
  'collection/write': {
    input: z
      .object({ ...item, id: z.string().regex(ITEM_ID), content: z.string(), modifiedAt })
      .describe(
        "Replace an item's content, if it is still at the version `modifiedAt`; refused once it has moved on. An item that no longer exists stays gone.",
      ),
    reply: written,
  },
  'collection/delete': { input: z.object({ ...item, id: z.string().regex(ITEM_ID) }).describe('Delete an item.'), reply: ok },
  'review/append': {
    input: z
      .strictObject({
        project: id,
        checkout: worktreeName.describe('A worktree\'s name, or `main` for the main checkouts.'),
        author: z.string().regex(AUTHOR).describe('Who writes: the user\'s name (`board.user.name`), or a worker\'s callsign.'),
        re: z.int().positive().optional().describe('The number of the message this one answers.'),
        anchors: z
          .array(
            z.strictObject({
              repo: z.string().regex(/^[^`:\s]+$/).describe('The repo as the Changes pane names it: its main checkout\'s folder.'),
              path: z.string().regex(/^[^`\n]+$/),
              from: z.int().positive(),
              to: z.int().positive(),
              quote: z.strictObject({ lang: z.string().regex(/^\S*$/), lines: z.array(z.string().regex(/^[^\n]*$/)) }).optional(),
            }),
          )
          .default([])
          .describe('The lines the note is about, each quoted as it was.'),
        body: z.string(),
      })
      .describe("Append a message to the checkout's review thread, made on the first one; it is numbered one past the last."),
    reply: z.object({ t: z.literal('appended'), id: z.string(), n: z.int(), modifiedAt }),
  },
  'worktree/recut': {
    input: z.object(worktree).describe("Restore a lost worktree's folders from its branch, in every repo where they are gone; then resume its workers."),
    reply: ok,
  },
  'worktree/prune': {
    input: z.object(worktree).describe("Forget a lost worktree, and delete its branch where it is absorbed into its base."),
    reply: ok,
  },
  'worktree/remove': {
    input: z.object(worktree).describe('Remove a worktree in every repo, and delete its branch where it is absorbed into its base; refused when work would be lost.'),
    reply: ok,
  },
  'branch/recut': {
    input: z.object({ project: id, name: z.string().min(1) }).describe(
      'Check a kept branch out again as a worktree in every repo, under the name it was cut under, so its workers resume; a repo that no longer has the branch gets it afresh from origin\'s default.',
    ),
    reply: ok,
  },
  'branch/delete': {
    input: z.object({ project: id, name: z.string().min(1) }).describe('Delete a kept branch in every repo where it is absorbed into its base.'),
    reply: ok,
  },
  tidy: {
    input: z
      .object({
        project: id,
        plan: z
          .object({
            worktrees: z.array(z.string()),
            branches: z.array(z.string()),
            threads: z.array(z.string()),
            prune: z.array(
              z.discriminatedUnion('t', [
                z.object({ t: z.literal('reap'), id, pid: z.int().positive() }),
                z.object({ t: z.literal('kill'), id, since: z.int().nonnegative() }),
              ]),
            ),
            logs: z.array(z.object({ id, bytes: z.int().nonnegative() })),
          })
          .describe("The floor's `tidy` as the board listed it, or any part of it: refused when anything in it no longer qualifies."),
      })
      .describe(
        "Apply the project's Tidy as listed: remove its removable worktrees, delete its absorbed kept branches, file the review thread of each checkout whose work has landed as `<checkout>@<YYYY-MM-DD-HHMM>.md` (freeing the checkout's name for a new thread), end the processes left by sessions no longer running, kill the hired workers done with their purpose, their work landed (resumable), and archive the logs of workers ended more than the config's `retention.days` ago: each gzipped in place as `<id>.jsonl.gz`, read the same as before.",
      ),
    reply: z.object({
      t: z.literal('tidied'),
      removed: z.array(z.string()),
      deleted: z.array(z.string()),
      threads: z.array(z.string()),
      reaped: z.array(z.int()),
      killed: z.array(z.string()),
      skipped: z.array(z.string()).describe('Workers left alive: no longer idle when their turn came, or their kill failed, each with why.'),
      archived: z.array(z.string()).describe('The sessions whose logs were archived.'),
    }),
  },
}

/**
 * The reads that take a query, GET `/<read>?<query>`: each query parsed by its schema, served at `/schema` beside the
 * verbs. Times are epoch ms.
 */
export const QUERIES = {
  stats: z
    .object({
      from: z.coerce.number().int().optional().describe("The window's start; the local day's start six days before `to` when left out."),
      to: z.coerce.number().int().optional().describe("The window's end, exclusive; now when left out."),
      bucket: z.enum(['hour', 'day']).default('day').describe('The series cut the window into local hours or days.'),
      project: id.optional().describe("Only this project's sessions."),
    })
    .describe("Stats over every session's log and what landed on each project's default branches: summaries, series, hours of the day and the weekly budget, per project and for all."),
}

export type Query = keyof typeof QUERIES
export type Queries = { [Q in Query]: z.input<(typeof QUERIES)[Q]> }

/** The mux's own requests (GET `/mux`): parsed like verbs, but they carry streams, not commands. */
export const TRANSPORT = {
  'mux/watch': { input: z.object({ mux: id, key: id, path: id }), reply: ok },
  'mux/unwatch': { input: z.object({ mux: id, key: id }), reply: ok },
}

/**
 * `invalid`: the request is malformed. `not_found`: no such verb, read, session, collection or item. `refused`: the
 * system won't do it now (the daemon said no, the thing isn't in a state for it). `unavailable`: a daemon doesn't
 * answer. Worktrees add `exists` (the name, path or branch is taken), `would_lose` (removing would lose uncommitted or
 * unpushed work), `lost` (the worktree's folder is gone: recut it), `offline` (origin couldn't be fetched) and
 * `worktree_failed` (git failed partway, and what was made is rolled back). `config`: the config can't be read, or holds a
 * value the tower can't take, until the user fixes it. `internal`: the tower failed where it didn't expect to (its log has
 * the stack). Renderers branch on the code; the message is for people.
 */
export const ERROR_CODES = ['invalid', 'not_found', 'refused', 'unavailable', 'exists', 'would_lose', 'lost', 'offline', 'worktree_failed', 'config', 'internal'] as const
export const ApiError = z.object({ t: z.literal('error'), code: z.enum(ERROR_CODES), message: z.string() })

export type ErrorCode = (typeof ERROR_CODES)[number]
export type ApiError = z.infer<typeof ApiError>

export const ERROR_STATUS: Record<ErrorCode, number> = {
  invalid: 400,
  not_found: 404,
  refused: 409,
  unavailable: 502,
  exists: 409,
  would_lose: 409,
  lost: 410,
  offline: 504,
  worktree_failed: 500,
  config: 500,
  internal: 500,
}

export const apiError = (code: ErrorCode, message: string): ApiError => ({ t: 'error', code, message })

export type Verb = keyof typeof VERBS
export type Verbs = { [V in Verb]: z.input<(typeof VERBS)[V]['input']> }
export type Replies = { [V in Verb]: z.infer<(typeof VERBS)[V]['reply']> }

/** A request as the board offers it: the verb and every field the board knows; the renderer adds the user's. */
export type Call<V extends Verb = Verb> = { [K in V]: [K, Partial<Verbs[K]>] }[V]

type Routes = typeof VERBS & typeof TRANSPORT
export type Route = keyof Routes
export type RouteInput = { [R in Route]: z.infer<Routes[R]['input']> }
export type RouteReply = { [R in Route]: z.infer<Routes[R]['reply']> }
export const ROUTES: Routes = { ...VERBS, ...TRANSPORT }
