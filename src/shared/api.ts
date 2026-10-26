/**
 * The renderer API's commands, declared once as schemas: POST `/<verb>` with a body its `input` parses, answered by
 * its `reply` or by an `ApiError`. The tower parses every request with them and serves them as JSON Schema at
 * `/schema`; the types renderers use are inferred from them. Only the tower runs zod: renderers import types alone.
 */
import { z } from 'zod'
import { AUTHOR, WORKTREE_NAME } from './model.ts'
import type { CheckResult, Outcome, RunStart } from './policies-legacy.ts'

/**
 * `<major>.<minor>`. The minor moves when the API adds something an older renderer reads past: a board field, a verb,
 * a read, a stream. The major moves, and the minor returns to 0, when a change breaks a renderer: a rename, a removal, a
 * changed meaning; CHANGELOG.md says why.
 */
export const API_VERSION = '1.96'

const id = z.string().min(1)
const absolute = z.string().regex(/^\//, 'an absolute path')
const size = { cols: z.int().positive(), rows: z.int().positive() }

/** An item's file name: no directories, no dot files. */
export const ITEM_ID = /^[^./\\][^/\\]*$/
export const ITEM_EXT = /^[a-z0-9]+$/i

const item = { project: id, collection: id }

const ok = z.object({ t: z.literal('ok') })

/** `ok`, naming each branch the verb didn't delete, with why: it moved since the read, so its new commits stay. */
const okKept = ok.extend({ kept: z.array(z.string()).optional().describe("Each branch kept instead of deleted, with why (`<branch> in <dir>: kept, …`).") })
const spawned = z.object({ t: z.literal('spawned'), id: z.string() })
/** An item's version: its modification time in whole milliseconds, as the board shows it. */
const modifiedAt = z.int().nonnegative()
const created = z.object({ t: z.literal('created'), id: z.string(), modifiedAt })
const written = z.object({ t: z.literal('written'), modifiedAt })

const worktreeName = z.string().regex(WORKTREE_NAME)
const worktree = { project: id, name: worktreeName }
const discardedTip = z.object({ dir: z.string(), branch: z.string().optional(), tip: z.string() })
const tidyApplied = z.object({ done: z.array(z.string()).describe('The keys applied.'), skipped: z.array(z.string()).describe('The keys left, each with why.') })
const recordedTip = discardedTip.extend({
  base: z.string().optional().describe('The base the tower cut its branch from; none when the tower didn\'t cut it.'),
  head: z.string().describe('Its HEAD as the board showed it.'),
  dirty: z.int().nonnegative().describe('Its uncommitted files, committed on top of `head` as `tip`.'),
  unpushed: z.array(z.string()).describe('Its commits on no remote, each `<short hash> <subject>`, newest first.'),
})
const discardRecorded = z.object({
  note: z.string().optional().describe('What the answerer recorded, in words.'),
  item: z.object({ collection: z.string(), id: z.string() }).optional().describe('The collection item the record is in, as it stands after the answer. @since 1.94'),
})
const launch = { model: z.string().optional(), effort: z.string().optional(), prompt: z.string().optional() }
const actor = (what: string) =>
  id.optional().describe(`The worker that makes the request, by session id: ${what} Left out, the user makes it.`)
const by = actor("the prompt it types is counted as that worker's, not the user's.")
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

/** A spawn's fields, before the rules between them: a policy's `hire` picks from them. */
export const SPAWN_FIELDS = z.strictObject({
  project: id,
  cwd: id.optional().describe("One of the project's directories or one of their worktrees; the hub's main checkout when left out."),
  cut: cut.optional(),
  callsign: z
    .string()
    .optional()
    .describe(
      "The new worker's callsign, `NAME` or `NAME-NN`, upper-cased: refused when its name is a worker's on duty. Drawn at random when left out; a cut's worktree is named for it, lowercased, unless `cut.name` names it.",
    ),
  ...launch,
  x: z
    .record(z.string(), z.record(z.string(), z.unknown()))
    .optional()
    .describe(
      "Extensions' spawn fields, by capability then field (`{roles: {role: 'builder'}}`): each value parsed by its field's schema and logged as `tower.x.<cap>.<field>` before the worker starts. A field no extension on the floor declares is `invalid`.",
    ),
  by,
  hire: z
    .literal(true)
    .optional()
    .describe(
      "The session is `by`'s hire: logged as `tower.hire` in `by`'s log, and refused with `limited` past the floor's `hiring` limits unless its prompt starts a reviewer or a launch contributor exempts it. Hires of one worker are taken one at a time, each counted before the next is weighed.",
    ),
})

/** A policy's item id in its project's `policies` collection. */
const policy = z.string().regex(ITEM_ID).describe("The policy: its item's id in the project's `policies` collection.")

/** What a policy's check did at a slot (decision `policies`). */
const checkMs = z.int().nonnegative()
const checkStderr = z.string().max(500).optional().describe('The end of its stderr when it failed, at most 500 characters.')

const checkResult = z.union([
  z.strictObject({
    exit: z.int().describe('Its exit code: 0, there is work; 1, none.'),
    ms: checkMs,
    out: z.string().max(2048).optional().describe('Its stdout when it found work, at most 2,048 characters.'),
    stderr: checkStderr,
  }),
  z.strictObject({
    error: z.string().describe('Why it has no exit code: it timed out, or could not start.'),
    ms: checkMs,
    stderr: checkStderr,
  }),
]) satisfies z.ZodType<CheckResult>

const OUTCOMES = ['offered', 'no-work', 'held', 'check-failed'] as const satisfies Outcome[]
const SLOTTED_STARTS = ['auto', 'offer'] as const satisfies RunStart[]

const slot = z.int().nonnegative().describe("One of the policy's slots, epoch ms, at or before now.")

const policyRunBase = {
  project: id,
  policy,
  by: actor('named on the run fact as the session that accepted or started it.'),
  check: checkResult.optional().describe('The check that let it run.'),
}

export const VERBS = {
  spawn: {
    input: SPAWN_FIELDS
      .refine((s) => s.cwd === undefined || s.cut === undefined, { message: 'A spawn takes `cwd` or `cut`, not both', path: ['cut'] })
      .refine((s) => !s.hire || s.by !== undefined, { message: 'A hire names its hirer: `by`', path: ['by'] })
      .meta({ not: { required: ['cwd', 'cut'] } })
      .describe(
        "Start a session in one of the project's directories or one of their worktrees (`cwd`, the hub when left out), or in a new worktree (`cut`); whatever else is left out is Claude's own default.",
      ),
    reply: spawned.extend({ cut: cutReply.optional() }),
  },
  resume: {
    input: z
      .object({ id, conversation: id, prompt: z.string().optional().describe("Claude's first prompt in the new session, as it starts: a card's `carry-on` passes one.") })
      .describe('Continue a conversation Claude saved in the session, as a new session.'),
    reply: spawned,
  },
  keys: {
    input: z
      .object({ id, data: z.string(), by: actor('named in the session\'s log as `tower.keys`, once per burst (again when another worker typed last, or after a minute).') })
      .describe('Keys reach a session in order, one request at a time, each chunk the terminal produced its own write. Ctrl+Z is dropped: a session has no shell to continue it.'),
    reply: ok,
  },
  submit: {
    input: z.object({ id, text: z.string(), by }).describe("Type a prompt into the session's composer, after whatever it holds, and submit it, as the user would."),
    reply: ok,
  },
  resize: { input: z.object({ id, ...size }).describe("Resize the session's PTY; whoever resizes it owns its size."), reply: ok },
  kill: { input: z.object({ id, by: actor("named in the session's log as `tower.kill` before it ends.") }).describe('End the session.'), reply: ok },
  'let-go': {
    input: z.object({ id }).describe("Take a stranded worker (stopped, killed or lost, waiting to be resumed) off duty: a fact in its log, appended by the host. Its conversation stays resumable from the floor's archive."),
    reply: ok,
  },
  'probe/run': {
    input: z.object({ name: id }).describe(
      "Read the probe now, whatever its stream says, its read appended to its stream as any read is. Refused while it is off, while a read is in flight, or within 60 s of the last read's start.",
    ),
    reply: z.object({
      t: z.literal('probed'),
      at: z.int().describe('When the read started, epoch ms.'),
      ms: z.int().nonnegative(),
      ok: z.boolean(),
      error: z.string().optional().describe('Why the read has no answer.'),
    }),
  },
  'extension/restart': {
    input: z.object({ id }).describe(
      "Read the extension's folder again and restart it, with every extension that depends on it: its code is imported afresh, each module of its folder. Meanwhile calls to it answer `unavailable`.",
    ),
    reply: z.object({
      t: z.literal('restarted'),
      state: z.enum(['started', 'refused', 'failed', 'skipped', 'off', 'restarting']).describe('Its state once the restart ended: `GET /extensions` says why it is not `started`.'),
    }),
  },
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
  'collection/restore': {
    input: z
      .object({ ...item, id: z.string().regex(ITEM_ID), content: z.string() })
      .describe("Put a deleted item back under its id, with the content it held: undoing a delete. Refused while an item holds the id."),
    reply: created,
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
    reply: okKept,
  },
  'worktree/remove': {
    input: z
      .object(worktree)
      .describe(
        'Remove a worktree in every repo, and delete its branch where it is absorbed into its base or carried there as copies (`landing` shows what landing changed); refused when work would be lost.',
      ),
    reply: okKept,
  },
  'worktree/discard': {
    input: z
      .object({
        ...worktree,
        author: z.string().regex(AUTHOR).describe("Who discards, signing the note: the user's name (`board.user.name`), or a worker's callsign."),
        held: z
          .array(z.object({ dir: absolute, head: z.string().min(1), dirty: z.int().nonnegative() }))
          .describe("Each repo's worktree as the board showed it: its HEAD and its count of uncommitted files. Refused when any moved."),
      })
      .describe(
        "Throw away a worktree whose work never landed (`at-risk`), in every repo: first the floor's recovery record (reviews, when on) names each repo's branch and tip (uncommitted files committed on top, on no branch), recoverable with `git branch <name> <tip>` until git collects it, by the answers to `tower/discard.record`; then each worktree is removed with force and its branch deleted, and `tower/discard.done` is raised (reviews files the thread). Refused on a floor where nothing answers `tower/discard.record`, since nothing would record what is thrown away.",
      ),
    reply: z.object({
      t: z.literal('discarded'),
      tips: z.array(discardedTip).describe('What each repo held, now on no branch.'),
      thread: z.string().optional().describe("The filed thread, its note naming the tips. @deprecated since 1.94: the reviews extension's `done.reviews.item`, copied here until 2.0."),
      kept: z.array(z.string()).optional().describe("Each branch kept instead of deleted, with why (`<branch> in <dir>: kept, …`)."),
      x: z.record(z.string(), discardRecorded).optional().describe("Each extension's answer to `tower/discard.record`, by capability."),
      done: z
        .record(z.string(), z.union([discardRecorded, z.object({ code: z.string(), message: z.string() }).describe('Why its answer failed: the discard is done regardless.')]))
        .optional()
        .describe("Each extension's answer to `tower/discard.done`, by capability, once the worktree is gone. @since 1.94"),
    }),
  },
  'branch/recut': {
    input: z.object({ project: id, name: z.string().min(1) }).describe(
      'Check a kept branch out again as a worktree in every repo, under the name it was cut under, so its workers resume; a repo that no longer has the branch gets it afresh from origin\'s default.',
    ),
    reply: ok,
  },
  'branch/delete': {
    input: z.object({ project: id, name: z.string().min(1) }).describe('Delete a kept branch in every repo where it is absorbed into its base, or carried there as copies.'),
    reply: okKept,
  },
  tidy: {
    input: z
      .object({
        project: id,
        plan: z
          .object({
            worktrees: z.array(z.string()),
            branches: z.array(z.string()),
            threads: z
              .array(z.string())
              .default([])
              .describe("@deprecated since 1.94: the reviews extension's tidy entries, `x.reviews`, which these are added to until 2.0."),
            prune: z.array(
              z.discriminatedUnion('t', [
                z.object({ t: z.literal('reap'), id, pid: z.int().positive() }),
                z.object({ t: z.literal('kill'), id, since: z.int().nonnegative() }),
              ]),
            ),
            logs: z.array(z.object({ id, bytes: z.int().nonnegative() })),
            streams: z
              .array(z.object({ file: z.string().min(1), bytes: z.int().nonnegative() }))
              .default([])
              .describe("Stream month files, by path under the system root's `streams/`."),
            x: z
              .record(z.string(), z.array(z.string()))
              .optional()
              .describe("The floor's tidy entries an extension contributes (`board.adds['floor:<project>'].tidy`), by key under its capability: each capability's answer to `tower/tidy.apply` applies them."),
          })
          .describe("The floor's `tidy` as the board listed it, and the extensions' tidy entries it lists in `board.adds`, or any part of them: refused when anything in it no longer qualifies."),
      })
      .describe(
        "Apply the project's Tidy as listed: remove its removable worktrees, delete its absorbed kept branches, end the processes left by sessions no longer running, kill the hired workers done with their purpose, their work landed (resumable), and archive the logs of workers ended more than the config's `retention.days` ago and the stream months closed that long, the system's and the project's, the extensions' streams among them: each gzipped in place as `<file>.gz`, read the same as before. Then each extension applies its entries of `plan.x`, by its answer to the hook `tower/tidy.apply`.",
      ),
    reply: z.object({
      t: z.literal('tidied'),
      removed: z.array(z.string()),
      deleted: z.array(z.string()),
      threads: z.array(z.string()).describe("@deprecated since 1.94: the keys the reviews extension's answer applied, `x.reviews.done`, copied here until 2.0."),
      reaped: z.array(z.int()),
      killed: z.array(z.string()),
      skipped: z.array(z.string()).describe('Branches kept instead of deleted, workers left alive (no longer idle when their turn came, or their kill failed) and stream months another floor\'s Tidy archived meanwhile, each with why.'),
      archived: z.array(z.string()).describe('The sessions whose logs were archived.'),
      streams: z.array(z.string()).describe('The stream month files archived, by path under `streams/`.'),
      x: z
        .record(z.string(), z.union([tidyApplied, z.object({ code: z.string(), message: z.string() }).describe('Why its answer failed: nothing of it was applied, as far as the tower knows.')]))
        .optional()
        .describe("Each capability's answer to `tower/tidy.apply` for its keys of `plan.x`."),
    }),
  },
  'policy/run': {
    input: z
      .discriminatedUnion('start', [
        z.strictObject({ ...policyRunBase, start: z.literal('hand').describe('Now, with no slot.') }),
        z.strictObject({
          ...policyRunBase,
          start: z.enum(SLOTTED_STARTS).describe('`auto`, a runner at its slot; `offer`, an open offer accepted.'),
          slot: slot.describe("The slot it runs for, epoch ms: one of the policy's, at or before now."),
        }),
      ])
      .describe(
        "Start a run of a policy: its file parsed now, a worker spawned on its prose with its `hire`, and a run fact appended to the project's `runs` stream (a worker whose fact can't be appended is killed). It needs no approval (the caller consents), except `auto`, refused unless the file's words as read now are approved. Refused for an invalid policy, another runner's, a slot already run, or the host down; `limited` while as many of its runs run as its `live`. A policy's runs, passes and approvals are taken one at a time.",
      ),
    reply: z.object({ t: z.literal('ran'), id: z.string().describe("The worker's session."), n: z.int().describe("The run's number among the policy's runs."), hash: z.string() }),
  },
  'policy/pass': {
    input: z
      .strictObject({ project: id, policy, slot, outcome: z.enum(OUTCOMES), check: checkResult.optional().describe('The check, when one ran.') })
      .describe("Record a slot of a policy the runner saw and didn't start, and why: `offered`, `no-work`, `held` (live was full), `check-failed`. Refused once the slot has a fact."),
    reply: ok,
  },
  'policy/approve': {
    input: z
      .strictObject({
        project: id,
        policy,
        hash: z.string().regex(/^sha256:[0-9a-f]{64}$/).describe("The hash of the policy's file as the approver read it, `sha256:<hex>`."),
        by: actor('named on the approval fact.'),
      })
      .describe("Approve a policy's current words for the runner to start on its own (`start: auto`): refused unless `hash` is the file's hash now. Any edit needs a new approval."),
    reply: ok,
  },
}

/**
 * The reads that take a query, GET `/<read>?<query>`: each query parsed by its schema, served at `/schema` beside the
 * verbs. Times are epoch ms.
 */
export const QUERIES = {
  'changes/<id>': z
    .object({
      scope: z
        .union([z.enum(['all', 'uncommitted']), z.string().regex(/^[0-9a-f]{7,64}$/, 'a commit hash')])
        .default('all')
        .describe("`all`: everything since the branch's base; `uncommitted`: only what isn't committed (since `HEAD`); a commit of the repo's `commits`: that commit's own changes."),
    })
    .describe("What changed in each of the session's repos, as git reads it now, with the commits since each repo's base."),
  stats: z
    .object({
      from: z.coerce.number().int().optional().describe("The window's start; the local day's start six days before `to` when left out."),
      to: z.coerce.number().int().optional().describe("The window's end, exclusive; now when left out."),
      bucket: z.enum(['hour', 'day']).default('day').describe('The series cut the window into local hours or days.'),
      project: id.optional().describe("Only this project's sessions."),
    })
    .describe("Stats over every session's log and what landed on each project's default branches: summaries, series, hours of the day and the weekly budget, per project and for all."),
  'probe/<name>': z
    .object({ last: z.coerce.number().int().positive().max(1000).default(20).describe('How many of its latest reads, newest first.') })
    .describe("One probe of the config's: its status as the board shows it, and its latest reads as its stream keeps them, each Claude's answer as it came or why there is none."),
  'runs/<project>': z
    .object({ policy, limit: z.coerce.number().int().positive().max(1000).default(20).describe('How many of its latest runs, newest first.') })
    .describe("A policy's runs, newest first: each run's number, slot, how it started and on which hash, its check, and its worker as it is now, its latest answer in full."),
  landing: z
    .object({ project: id, branch: z.string().min(1).describe('A branch of a worktree or a kept branch, `carried` on the board.') })
    .describe(
      "What landing changed: in each of the project's repos holding the branch, each of its commits that landed as an edited copy, with the copy and `git range-diff` between them.",
    ),
}

export type Query = keyof typeof QUERIES
export type Queries = { [Q in Query]: z.input<(typeof QUERIES)[Q]> }

/** The mux's own requests (GET `/mux`): parsed like verbs, but they carry streams, not commands. */
export const TRANSPORT = {
  'mux/watch': { input: z.object({ mux: id, key: id, path: id }), reply: ok },
  'mux/unwatch': { input: z.object({ mux: id, key: id }), reply: ok },
}

/**
 * `invalid`: the request is malformed. `not_found`: no such verb, read, session, shell, collection or item. `refused`: the
 * system won't do it now (the daemon said no, the thing isn't in a state for it). `unavailable`: a daemon doesn't
 * answer. Worktrees add `exists` (the name, path or branch is taken), `would_lose` (removing would lose uncommitted or
 * unpushed work), `lost` (the worktree's folder is gone: recut it), `offline` (origin couldn't be fetched) and
 * `worktree_failed` (git failed partway, and what was made is rolled back). `config`: the config can't be read, or holds a
 * value the tower can't take, until the user fixes it. `limited`: the config's limits refuse it now (a hire past the
 * floor's `hiring`), until something ends or the user raises them. `internal`: the tower failed where it didn't expect to (its log has
 * the stack). Renderers branch on the code; the message is for people.
 */
export const ERROR_CODES = ['invalid', 'not_found', 'refused', 'unavailable', 'exists', 'would_lose', 'lost', 'offline', 'worktree_failed', 'config', 'limited', 'internal'] as const
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
  limited: 409,
  internal: 500,
}

export const apiError = (code: ErrorCode, message: string): ApiError => ({ t: 'error', code, message })

/** Whether a reply is an `ApiError`: what an extension's handler answers to refuse. */
export const isApiError = (reply: unknown): reply is ApiError => ApiError.safeParse(reply).success

/**
 * The headers the `tower` command claims its caller with: `tower-client: cli` on every request, and `tower-session`, its
 * `TOWER_SESSION_ID`, when a worker runs it. A request without them is the user's, over HTTP.
 */
export const CALLER_HEADERS = { client: 'tower-client', session: 'tower-session' } as const

/** The headers the `tower` command sends, run by the session `session` (its `TOWER_SESSION_ID`) or by the user. */
export const callerHeaders = (session: string | undefined): Record<string, string> => ({ [CALLER_HEADERS.client]: 'cli', ...(session && { [CALLER_HEADERS.session]: session }) })

export type Verb = keyof typeof VERBS
export type Verbs = { [V in Verb]: z.input<(typeof VERBS)[V]['input']> }
export type Replies = { [V in Verb]: z.infer<(typeof VERBS)[V]['reply']> }

/** A request as the board offers it: the verb and every field the board knows; the renderer adds the user's. */
export type Call<V extends Verb = Verb> = { [K in V]: [K, Partial<Verbs[K]>] }[V]

type Routes = typeof VERBS & typeof TRANSPORT
export type Route = keyof Routes
export type RouteInput = { [R in Route]: z.infer<Routes[R]['input']> }
export const ROUTES: Routes = { ...VERBS, ...TRANSPORT }

/**
 * The core's composites: each verb that does what other core verbs do, with the verbs it calls through the dispatch to
 * do it, its caller kept and itself in the caller's `within`, so what wraps one of them sees every act of it.
 */
export const COMPOSITES: Record<string, string[]> = {
  'tower/tidy': ['tower/worktree/remove', 'tower/branch/delete', 'tower/reap/process', 'tower/kill'],
}

/** A point inside a core verb where extensions take part: what it is raised with, what each answer is, and what a failed answer does. */
export type CoreHook = { payload: z.ZodType; answer: z.ZodType; failure: 'refuses' | 'reported'; description: string; since: string }

/** The core's hooks by name, each answered as `tower/<name>` by the extensions whose manifests list it in `answers`. */
export const HOOKS: Record<string, CoreHook> = {
  'tidy.apply': {
    payload: z.object({ project: id, keys: z.array(z.string()) }),
    answer: tidyApplied,
    failure: 'reported',
    description: "Raised by tidy after the core's own parts, once per capability in its plan's `x`, to that capability's answerer alone, with its keys: a failed answer is reported in the reply's `x.<cap>`.",
    since: '1.85',
  },
  'discard.record': {
    payload: z.object({ project: id, name: worktreeName, author: z.string(), tips: z.array(recordedTip) }),
    answer: discardRecorded,
    failure: 'refuses',
    description: "Raised by worktree/discard once each repo's tip is read, before anything is removed, for the floor's recovery record: an answer that fails refuses the discard, as does no answer at all.",
    since: '1.85',
  },
  'discard.done': {
    payload: z.object({ project: id, name: worktreeName, author: z.string(), tips: z.array(recordedTip), kept: z.array(z.string()).describe('Each branch kept instead of deleted, with why.') }),
    answer: discardRecorded,
    failure: 'reported',
    description: "Raised by worktree/discard once its worktrees are removed and its branches deleted: a failed answer is reported in the reply's `done.<cap>`.",
    since: '1.94',
  },
}
