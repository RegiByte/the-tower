# Multiple Claude Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the config name more than one `argv` (e.g. a stock `claude` and a `claude-mom` that sets `CLAUDE_CONFIG_DIR`), give each project an optional preferred one, and let the New Worker form pick one per worker — while every config that still has a single `argv` keeps behaving exactly as it does today, with no new UI.

**Architecture:** `Config.argv` grows from `string[]` to `string[] | Record<string, string[]>`. The array shape is unchanged legacy behavior (one unnamed command, no picker). The object shape names commands by key; `Project.command` is an optional preferred key. Two small resolver functions in `src/shared/model.ts` turn "a name, or none, or a stale one" into "the argv to actually run" and "the names to offer," with the stated fallback (an unmatched or absent preference becomes the first key) living in exactly one place. The choice travels the same path model/effort already travel — `SpawnForm` → `Launch` → `HostSpawn` → `sessionArgv` — plus one new leg: the resolved name is stamped on `SessionHeader` at spawn so a resume or fork reruns under the same command even if the config changes later.

**Tech Stack:** TypeScript (strict), Node's built-in test runner (`node --test`), Zod for the wire schema, the existing hand-written HTML-string form templates (no client framework).

**Spec:** This file; there is no separate spec document. The spec is the architecture paragraph above plus the Global Constraints and Review Focus below, taken from the feature conversation with the repo's user.

## Global Constraints

- A config with `argv` as a plain array of strings (today's only shape) must keep working identically: same resolved command, `tower config check` still passes, and the New Worker form shows no command picker.
- The command picker appears only when the resolved list of names has more than one entry.
- A project's `command` that names a key absent from `argv` is never an error: it is silently treated as absent, and resolution falls back to `argv`'s first key (object insertion order, i.e. the order the keys were written in the JSON file).
- A resumed or forked session always reruns under the same resolved command its original session used, even if the config's `argv` has changed since (added, removed, or reordered keys) — never re-resolved from the project's current preference.
- Every new config key is documented in `docs/config.md`, per this repo's own rule ("Every key is documented in docs/config.md").

## Review Focus

- An empty string sent as `command` (a cleared `<select>`, or a hand-rolled API call) must resolve exactly like `undefined`, not like an unmatched name that happens to equal `""`.
- `argv` as an object with exactly one key must still hide the picker (count, not shape, decides visibility) — the plan must not special-case "exactly one key" inside the resolver itself, or the two decisions (resolve vs. show) can drift apart.
- Editing `argv` to drop a name a running session's `SessionHeader.command` points at must not break that session's next resume: `resolveCommand` must never throw and must always return a runnable argv array.
- JSON object key order from `JSON.parse` must actually be the write order for the string keys this feature uses (not reordered as if they were array indices) — pin this with a test using non-numeric names, since the whole fallback story depends on it.
- `tower config check` on every config already in this repo's own `~/.tower/config.json` (the single-array shape) must report zero new problems — the regression that would hit hardest, since it is this tool's own daily config.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/shared/model.ts` | `Config.argv`'s new type, `Project.command`, `SessionHeader.command`, `PROJECT_KEYS`, and the two resolvers: `commandNames`, `resolveCommand`, plus `projectPreferredCommand`. |
| `src/config-check.ts` | Validates the new `argv` shape and `project.command`'s type. |
| `docs/config.md` | Documents `argv`'s two shapes and `command`. |
| `src/shared/api.ts` | `command` added to the `launch` Zod fields, so `SPAWN_FIELDS` accepts it for free. |
| `src/shared/protocol.ts` | `ToHost`'s `spawn` variant gains `command?: string`. |
| `src/shared/launch.ts` | `Launch.command`; `hostSpawn`, `spawnRequest`, `resumeRequest` carry it into the `HostSpawn` they build. |
| `src/host/session.ts` | `sessionArgv` resolves the command instead of always using `config.argv`. |
| `src/host/main.ts` | `spawnSession` reads `command` off the incoming request and stamps the resolved name onto `SessionHeader`. |
| `src/bridge/board.ts` | `Floor.command` (a project's resolved preferred name) and `Board.commands` (every available name, `undefined` in single-command mode). |
| `src/tower/dispatch.ts` | Resume/fork carries `source.header.command` forward unchanged. |
| `src/shared/spawn-form.ts` | `SpawnForm.command`, the picker's HTML, and its line in the summary. |
| `src/shared/spawn.ts` | Threads `io.board().commands` into the `spawnFormHtml` call. |

## Task 1: Config schema, validation, docs

**Files:**
- Modify: `src/shared/model.ts:6-24` (`Project`), `src/shared/model.ts:276-312` (`Config`, `SessionHeader`, `PROJECT_KEYS`)
- Modify: `src/config-check.ts:264` (project shape array), `src/config-check.ts:297` (top-level `argv` check)
- Modify: `docs/config.md` (top-level table's `argv` row, Projects table)
- Test: `test/legacy.test.ts`

**Interfaces:**
- Produces: `commandNames(config: Config): string[] | undefined` — `undefined` for the legacy array shape; `Object.keys(config.argv)` (source order) for the object shape, whatever its length.
- Produces: `resolveCommand(config: Config, name: string | undefined): string[]` — legacy shape: `config.argv` regardless of `name`. Object shape: `config.argv[name]` when `name` is a non-empty key of it; otherwise `config.argv[Object.keys(config.argv)[0]]`.
- Produces: `projectPreferredCommand(config: Config, projectId: string): string | undefined` — `commandNames(config)` is `undefined` → `undefined`. Otherwise the project's `command` when it is one of those names, else the first name.
- Produces: `Project.command?: string`, `Config.argv: string[] | Record<string, string[]>`, `SessionHeader.command?: string`.

- [ ] **Step 1: Write the failing tests for the resolvers**

In `test/legacy.test.ts` (it already imports `configProblems` and builds `Config` values — follow its pattern), add:

```ts
import { commandNames, resolveCommand, projectPreferredCommand } from '../src/shared/model.ts'

test('commandNames: undefined for the legacy array shape, every key in source order for the object shape', () => {
  assert.equal(commandNames(config({ argv: ['claude'] })), undefined)
  assert.deepEqual(commandNames(config({ argv: { mom: ['claude-mom'], main: ['claude'] } })), ['mom', 'main'])
})

test('resolveCommand: the legacy array always, a named key when it exists, the first key otherwise', () => {
  assert.deepEqual(resolveCommand(config({ argv: ['claude'] }), 'anything'), ['claude'])
  const multi = config({ argv: { a: ['claude'], b: ['claude-mom'] } })
  assert.deepEqual(resolveCommand(multi, 'b'), ['claude-mom'])
  assert.deepEqual(resolveCommand(multi, 'missing'), ['claude'])
  assert.deepEqual(resolveCommand(multi, undefined), ['claude'])
  assert.deepEqual(resolveCommand(multi, ''), ['claude'])
})

test('projectPreferredCommand: undefined in single-command mode, the project\'s command when valid, the first key otherwise', () => {
  const single = config({ argv: ['claude'], projects: { p: { name: 'p', hub: '/h', repos: [] } } })
  assert.equal(projectPreferredCommand(single, 'p'), undefined)
  const multi = config({ argv: { a: ['claude'], b: ['claude-mom'] }, projects: { p: { name: 'p', hub: '/h', repos: [], command: 'b' }, q: { name: 'q', hub: '/h', repos: [], command: 'nope' } } })
  assert.equal(projectPreferredCommand(multi, 'p'), 'b')
  assert.equal(projectPreferredCommand(multi, 'q'), 'a')
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --import tsx --test test/legacy.test.ts`
Expected: FAIL — `commandNames`, `resolveCommand`, `projectPreferredCommand` are not exported from `src/shared/model.ts`.

- [ ] **Step 3: Widen the types and add the resolvers in `src/shared/model.ts`**

- `Project` (line 6): add `/** The `argv` command this project starts with by default; ignored, falling back to `argv`'s first, when it names none of them or `argv` is the legacy array. */ command?: string`.
- `Config.argv` (line 278): change the type to `string[] | Record<string, string[]>`; update its doc comment to mention both shapes.
- `SessionHeader` (around line 375): add `/** The `argv` command this session was started under, by name; absent for the legacy array shape. */ command?: string`.
- `PROJECT_KEYS` (line 324): add `'command'` to the list.
- Add the three functions above `hiringConfig` or beside it, each with a one-line doc comment restating what the Interfaces block says (no further body description needed — the function is the description).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --import tsx --test test/legacy.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing config-check tests**

In `test/legacy.test.ts`, add (the file's `config` helper already supplies a default `argv: ['claude']`, so override it per case):

```ts
test('configProblems: the legacy array argv is still accepted; the object shape is too; anything else fails', () => {
  assert.deepEqual(configProblems(config({ argv: ['claude'] })).filter((p) => p.key === 'argv'), [])
  assert.deepEqual(configProblems(config({ argv: { a: ['claude'] } })).filter((p) => p.key === 'argv'), [])
  assert.equal(configProblems(config({ argv: {} })).some((p) => p.key === 'argv'), true)
  assert.equal(configProblems(config({ argv: { a: [] } })).some((p) => p.key === 'argv'), true)
  assert.equal(configProblems(config({ argv: 'claude' as unknown as string[] })).some((p) => p.key === 'argv'), true)
})

test('configProblems: a project\'s command must be a string when given, and is never an unknown key', () => {
  const withCommand = config({ projects: { p: { name: 'p', hub: '/h', repos: [], command: 'mom' } } })
  assert.deepEqual(configProblems(withCommand).filter((p) => p.key.startsWith('projects.p')), [])
  const badCommand = config({ projects: { p: { name: 'p', hub: '/h', repos: [], command: 3 as unknown as string } } })
  assert.equal(configProblems(badCommand).some((p) => p.key === 'projects.p.command'), true)
})
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `node --import tsx --test test/legacy.test.ts`
Expected: FAIL — the object `argv` shape and an empty object/array are rejected by the current check; `project.command`'s type is unchecked (no failure raised for the bad case).

- [ ] **Step 7: Update the validator in `src/config-check.ts`**

Replace the `argv` line (297) with a check that accepts either shape: the legacy array (unchanged rule: non-empty, every element a string) or an object whose keys all map to a non-empty array of strings, itself non-empty (at least one key). One `fail('argv', ...)` message covering both shapes is fine — reuse the existing wording and extend it, e.g. `'takes the command sessions start with (["claude"]), or several named ones ({"claude": ["claude"], "mom": ["claude-mom"]})'`.

Add one line to the project's `shape` array (264, beside the `hub`/`repos` checks): `...(project.command === undefined || typeof project.command === 'string' ? [] : [fail(`${at}.command`, 'takes the name of one of argv\'s commands')])`.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `node --import tsx --test test/legacy.test.ts`
Expected: PASS

- [ ] **Step 9: Document the new shapes**

In `docs/config.md`: extend the top-level table's `argv` row to describe the object shape and name resolution in one or two sentences, pointing at the New Worker form's picker. Add a `command` row to the Projects table: "The `argv` command this project's workers start with unless told otherwise, by name; falls back to `argv`'s first when it names none of them or `argv` names only one." Keep the existing worked example (`"argv": ["claude"]`) and add a second small example showing the object shape with a `command` under one project.

- [ ] **Step 10: Run `tower config check` against the real config to confirm no regression**

Run: `cd /Users/lupi/AE/tower && npx tsx src/cli.ts config check`
Expected: Same output as before this task (5 projects, no new problems) — this repo's own `~/.tower/config.json` still uses the legacy array shape.

- [ ] **Step 11: Commit**

```bash
git add src/shared/model.ts src/config-check.ts docs/config.md test/legacy.test.ts
git commit -m "feat: allow argv to name several commands, with a per-project preferred one"
```

## Task 2: Wire protocol and host spawn plumbing

**Files:**
- Modify: `src/shared/api.ts:52` (`launch` Zod fields)
- Modify: `src/shared/protocol.ts:16` (`ToHost`'s spawn variant)
- Modify: `src/shared/launch.ts:5` (`Launch`), `:167-200` (`SpawnLaunch`/`ResumeLaunch`/`hostSpawn`/`spawnRequest`/`resumeRequest`)
- Modify: `src/host/session.ts:8-13` (`sessionArgv`)
- Modify: `src/host/main.ts:50-64` (`spawnSession`)
- Test: `test/launch.test.ts`

**Interfaces:**
- Consumes: `resolveCommand`, `Config` from Task 1.
- Produces: `sessionArgv(config: Config, args: string[], modDir: string, command?: string): string[]` (new 4th parameter; old 3-argument call sites must still compile, so give it a default of `undefined`).
- Produces: `HostSpawn`'s `command?: string` field, set by both `spawnRequest` and `resumeRequest`.
- Produces: `Launch = { model?: string; effort?: string; prompt?: string; command?: string }`.
- Produces: `ResumeLaunch` gains its own `command?: string` (not nested in a `launch` field, since resumes have none).

- [ ] **Step 1: Write the failing test for `sessionArgv`**

In a new block in `test/launch.test.ts` (or a sibling `test/session.test.ts` if `sessionArgv` has no existing coverage — check first with `grep -n sessionArgv test/*.test.ts`; if none exists, create `test/session.test.ts` importing from `../src/host/session.ts` the same way other host-side tests import from `../src/host/*.ts`):

```ts
test('sessionArgv: the legacy argv always, a named command when given, the first when not or when stale', () => {
  const legacy = { argv: ['claude'], projects: {} } as Config
  assert.deepEqual(sessionArgv(legacy, ['--x'], '/mods'), ['claude', '--plugin-dir', '/mods', '--x'])
  const multi = { argv: { a: ['claude'], b: ['claude-mom'] }, projects: {} } as Config
  assert.deepEqual(sessionArgv(multi, ['--x'], '/mods', 'b'), ['claude-mom', '--plugin-dir', '/mods', '--x'])
  assert.deepEqual(sessionArgv(multi, ['--x'], '/mods', 'missing'), ['claude', '--plugin-dir', '/mods', '--x'])
  assert.deepEqual(sessionArgv(multi, ['--x'], '/mods'), ['claude', '--plugin-dir', '/mods', '--x'])
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --import tsx --test test/launch.test.ts` (or the new test file)
Expected: FAIL — `sessionArgv` still always uses `config.argv` directly, and doesn't accept a 4th argument.

- [ ] **Step 3: Implement the plumbing**

- `src/shared/api.ts:52`: `const launch = { model: z.string().optional(), effort: z.string().optional(), prompt: z.string().optional(), command: z.string().optional() }`.
- `src/shared/protocol.ts:16`: add `command?: string` to the `{ t: 'spawn'; ... }` member.
- `src/shared/launch.ts`:
  - `Launch` (line 5): add `command?: string`.
  - `Start`-derived `ResumeLaunch` (line 173): add `command?: string` to its own definition (it is `Start & { kind: 'resume' | 'fork'; conversation: string; prompt: string | undefined; command?: string }`).
  - `hostSpawn` (line 187): change its signature to `(s: Start, args: string[], command: string | undefined)`, and include `...(command !== undefined && { command })` in the returned object.
  - `spawnRequest` (line 197): pass `s.launch.command` as the third argument to `hostSpawn`.
  - `resumeRequest` (line 200): pass `s.command` as the third argument to `hostSpawn`.
- `src/host/session.ts:8`: `sessionArgv = (config: Config, args: string[], modDir: string, command?: string): string[] => [...resolveCommand(config, command), '--plugin-dir', modDir, ...args]` (import `resolveCommand` from `../shared/model.ts`).
- `src/host/main.ts`:
  - `spawnSession`'s destructured parameter (line 50): add `command` to the picked fields from `Extract<ToHost, { t: 'spawn' }>`.
  - Line 62: `const argv = sessionArgv(config, args, MOD_DIR, command)`.
  - Line 63: add `command` to the constructed `SessionHeader` (`{ id, project: projectId, runtime: 'claude', cwd, argv, command, startedAt, cols, rows }`).

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --import tsx --test test/launch.test.ts` (or the new test file)
Expected: PASS

- [ ] **Step 5: Run the existing launch test suite for regressions**

Run: `node --import tsx --test test/launch.test.ts`
Expected: PASS — `CORE_FLAGS` and the other existing assertions in this file are unaffected, since `command` never becomes a Claude CLI flag.

- [ ] **Step 6: Commit**

```bash
git add src/shared/api.ts src/shared/protocol.ts src/shared/launch.ts src/host/session.ts src/host/main.ts test/launch.test.ts
git commit -m "feat: thread a chosen argv command from a spawn request to the host"
```

## Task 3: Board exposure and resume fidelity

**Files:**
- Modify: `src/bridge/board.ts:290` (`Floor` type), `:857-926` (`boardOf`), `:422` area (`Board` type, beside `claudeDefaults`)
- Modify: `src/tower/dispatch.ts:360-378` (the resume/fork call site)
- Test: `test/board.test.ts`

**Interfaces:**
- Consumes: `commandNames`, `projectPreferredCommand` from Task 1.
- Produces: `Floor.command?: string` (the floor's resolved preferred command name; absent in single-command mode).
- Produces: `Board.commands?: string[]` (every available command name, source order; absent in single-command mode).

- [ ] **Step 1: Write the failing test**

Find `test/board.test.ts`'s existing pattern for building a minimal `SystemView`/calling `boardOf` (follow whatever helper it already uses to construct a config with one project) and add:

```ts
test('boardOf: commands and each floor\'s preferred one are absent in single-command mode, present and resolved in multi', () => {
  const single = boardOf(viewWith({ argv: ['claude'] }), [])
  assert.equal(single.commands, undefined)
  assert.equal(single.floors[0].command, undefined)
  const multi = boardOf(viewWith({ argv: { a: ['claude'], b: ['claude-mom'] }, projects: { p: { name: 'p', hub: '/h', repos: [], command: 'b' } } }), [])
  assert.deepEqual(multi.commands, ['a', 'b'])
  assert.equal(multi.floors[0].command, 'b')
})
```

Adjust `viewWith`/the config-building helper's name to whatever `test/board.test.ts` already exposes for this — read the file first (`src/bridge/board.ts`'s own tests build a `SystemView`; reuse that helper rather than inventing a new one).

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --import tsx --test test/board.test.ts`
Expected: FAIL — `Board` has no `commands`, `Floor` has no `command`.

- [ ] **Step 3: Implement**

- `Floor` type (board.ts:290): add `'command'` to the `Omit<Project, ...>` list (so the raw, unresolved preference is excluded from the spread, exactly like `worktrees`/`hiring` already are), and add `command?: string` to the appended object type.
- `boardOf`'s per-floor destructure (line 870): add `command: _______` to the list of excluded raw project fields (one more underscore-named placeholder, following the file's existing convention for unused destructured names).
- Per-floor returned object (around line 902, beside `cutByDefault`): add `...(projectPreferredCommand(config, id) !== undefined && { command: projectPreferredCommand(config, id) }),`.
- `Board` type (near line 422, beside `claudeDefaults: ClaudeDefaults`): add `commands?: string[]`.
- `boardOf`'s returned object (near line 921, beside `claudeDefaults: claudeDefaults(sessions)`): add `...(commandNames(config) !== undefined && { commands: commandNames(config) }),`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --import tsx --test test/board.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing test for resume fidelity**

Find wherever `test/launch.test.ts` or `test/board.test.ts` already exercises `resumeRequest`/the dispatch resume path (search `heldBy`, `carriesOn`, or `resumeRequest(` in the test directory). If dispatch's resume branch has no existing unit coverage, add a narrow test that only checks the one line this task changes: construct a `Session`-shaped object with `header.command = 'b'`, call whatever function wraps the object literal at dispatch.ts:360-378 (if it isn't already an independently callable, tested function, skip straight to Step 3's code change and instead add an assertion-style test around `resumeRequest` directly: build a `ResumeLaunch` with `command: 'b'` and assert `resumeRequest(...).command === 'b'`, using the `EVERY_PART`-style fixture already in `test/launch.test.ts`).

```ts
test('resumeRequest: carries the command it is given straight through to the host request', () => {
  assert.equal(resumeRequest({ ...EVERY_PART, kind: 'resume', conversation: 'c', prompt: undefined, command: 'b' }).command, 'b')
  assert.equal(resumeRequest({ ...EVERY_PART, kind: 'resume', conversation: 'c', prompt: undefined }).command, undefined)
})
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `node --import tsx --test test/launch.test.ts`
Expected: FAIL (this pins Task 2's `resumeRequest` change, which already passes `s.command`; it fails only if `EVERY_PART` needs a `command` field added — add `command: undefined` to `EVERY_PART` if the type requires it, which should already make the first assertion pass and is not itself a behavior change).

- [ ] **Step 7: Wire the dispatch call site**

`src/tower/dispatch.ts`, in the object passed to `resumeRequest(...)` (line ~361-377): add `command: source.header.command,` alongside the other fields copied from `source.header` (`cwd`, `project`, `runtime`).

- [ ] **Step 8: Run the test to verify it passes**

Run: `node --import tsx --test test/launch.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/bridge/board.ts src/tower/dispatch.ts test/board.test.ts test/launch.test.ts
git commit -m "feat: expose available commands on the board, carry a resumed worker's command forward"
```

## Task 4: New Worker form

**Files:**
- Modify: `src/shared/spawn-form.ts` (`SpawnForm`, `spawnDefaults`, `spawnForm`, `spawnCall`, `spawnSummaryHtml`, `spawnFormHtml`)
- Modify: `src/shared/spawn.ts:150` (the `spawnFormHtml` call site)
- Test: a new `test/spawn-form.test.ts` if none exists for this file (check first: `grep -rl spawnFormHtml test/`); otherwise add to the existing one.

**Interfaces:**
- Consumes: `Floor.command`, `Board.commands` from Task 3.
- Produces: `SpawnForm.command: string` (empty string = "no override typed"; the dropdown, when shown, never actually submits empty since every `<option>` has a real name, but the type stays a plain string for consistency with `model`/`effort`).

- [ ] **Step 1: Write the failing tests**

```ts
import { spawnDefaults, spawnFormHtml, spawnCall } from '../src/shared/spawn-form.ts'

test('spawnDefaults: command defaults to the floor\'s resolved one, empty in single-command mode', () => {
  assert.equal(spawnDefaults({ ...FLOOR, command: 'b' }).command, 'b')
  assert.equal(spawnDefaults({ ...FLOOR, command: undefined }).command, '')
})

test('spawnFormHtml: the command picker is absent with one or no named commands, present with two or more, floor default selected', () => {
  assert.equal(spawnFormHtml(FLOOR, { sign: 's' }).includes('name="command"'), false)
  assert.equal(spawnFormHtml(FLOOR, { sign: 's', commands: ['a'] }).includes('name="command"'), false)
  const html = spawnFormHtml({ ...FLOOR, command: 'b' }, { sign: 's', commands: ['a', 'b'] })
  assert.equal(html.includes('name="command"'), true)
  assert.match(html, /<option value="b" selected>/)
})

test('spawnCall: a chosen command is sent, an empty one is left out', () => {
  const [, withCommand] = spawnCall(FLOOR, { ...spawnDefaults(FLOOR), command: 'b' })
  assert.equal(withCommand.command, 'b')
  const [, withoutCommand] = spawnCall(FLOOR, spawnDefaults(FLOOR))
  assert.equal('command' in withoutCommand, false)
})
```

Build `FLOOR` the way this test file's neighbors already build a minimal `Floor` fixture (reuse an existing one from `test/board.test.ts` or `test/spawn.test.ts` if one is exported; otherwise construct the smallest object the `Floor` type demands, matching the file's existing style).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --import tsx --test test/spawn-form.test.ts` (or wherever Step 1 landed)
Expected: FAIL — `SpawnForm` has no `command` field yet, `spawnFormHtml` takes no `commands` option.

- [ ] **Step 3: Implement**

`src/shared/spawn-form.ts`:
- `SpawnForm` type (line 27): add `command: string`.
- `spawnDefaults` (line 86): add `command: f.command ?? ''` to the returned object.
- `spawnCall` (line 108): add `command: v.command` into the object passed to `given({ callsign: ..., command: v.command, ... })`.
- `spawnFormHtml`'s signature (line 191): add `commands` to its options object type: `{ sign: string; draft?: string; defaults?: ClaudeDefaults; fields?: FormField[]; commands?: string[] }`.
- Inside `spawnFormHtml`, right after the Effort `<label>` (around line 220), add, only when `commands && commands.length > 1`:
  ```html
  <label>${labelHtml('Claude', true)}<select name="command">${commands.map((c) => `<option value="${esc(c)}"${c === f.command ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
  ```
- `spawnSummaryHtml` (line 145): add `v.command ? `with ${v.command}`` (filtered like the other `claude` lines) to the `claude` array, so the summary line mentions the chosen command when one was typed or defaulted onto the form.

`src/shared/spawn.ts:150`: add `commands: io.board().commands` to the options object passed to `spawnFormHtml`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --import tsx --test test/spawn-form.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full test suite for regressions**

Run: `cd /Users/lupi/AE/tower && npm test`
Expected: PASS — in particular `test/spawn.test.ts`'s existing `SpawnForm` literal (which lists every field by name) will fail to type-check without a `command: ''` added to it; add that one field to its existing fixture object.

- [ ] **Step 6: Typecheck**

Run: `cd /Users/lupi/AE/tower && npm run typecheck`
Expected: PASS

- [ ] **Step 7: Manual check in the browser**

Run: `tower up` (or it is already running), open the tower page, start a New Worker on a floor with a single-command config (should show no Claude picker) and, after adding a second `argv` entry to `~/.tower/config.json` by hand, on a floor with `command` set (should show the picker, pre-selected to that floor's command).

- [ ] **Step 8: Commit**

```bash
git add src/shared/spawn-form.ts src/shared/spawn.ts test/spawn.test.ts test/spawn-form.test.ts
git commit -m "feat: let the New Worker form pick which argv command to start"
```

---

## Self-Review

**Spec coverage:** Multiple named commands (Task 1), per-project preferred default with silent fallback to the first (Task 1's `projectPreferredCommand`), the picker appearing only when there's a real choice (Task 4, gated on `commands.length > 1`), the picker pre-selecting the floor's resolved default (Task 3 + Task 4), and backward compatibility for every existing single-array config (Task 1's dual-shape validator, pinned by a regression test against this repo's own config in Task 1 Step 10) are each covered by a task.

**Step scan:** Each code step names the exact file, line anchor, and signature; bodies are given only where the resolution algorithm itself is the thing being specified (which this plan treats as part of the "exact values the spec pins," since the fallback rule is the feature's whole point).

**Type consistency:** `resolveCommand`/`commandNames`/`projectPreferredCommand` (Task 1) are consumed with the same names and signatures in Tasks 2 and 3. `Launch.command`, `SessionHeader.command`, `HostSpawn`'s `command`, `Floor.command`, `Board.commands`, and `SpawnForm.command` are each introduced once and referenced by that exact name everywhere downstream.

**Review Focus:** all five lines have an owning test — empty-string handling (Task 1 Step 1's `resolveCommand(multi, '')` case), single-key object hiding the picker (Task 4 Step 1's `commands: ['a']` case), a stale `SessionHeader.command` resolving safely (Task 1 Step 1's `resolveCommand(multi, 'missing')` case, reused by resume through Task 3), JSON key order (Task 1 Step 1's `commandNames` assertion using non-numeric names `mom`/`main`), and the real config's validator regression (Task 1 Step 10).

**Proportion:** four tasks, each touching 2-6 files with one or two short code blocks; no task transcribes more than a few lines of implementation, and most steps name a signature and let the implementer write the body.

---

Plan complete and saved to `docs/superpowers/plans/2026-10-30-multi-claude-commands.md`. Please review the plan. Which execution approach would you prefer?

- **Subagent-driven** — a fresh subagent implements each task and a fresh reviewer checks it before the next one starts, then a whole-branch review at the end. Most thorough; costs a fresh context per task and per review.
- **Native** — I implement every task myself in this session, then one fresh reviewer on the most capable model checks the whole branch. Cheapest and fastest; no independent review until the end.

For this plan I recommend **native**: the four tasks are a strict dependency chain (schema → protocol → board → form), each is small, and a shipped mistake here is cheap to catch (it's a locally-run dev tool with a real test suite, not a production service) — the cost of four fresh subagent contexts isn't bought back by much. Does the plan capture what you want, and which approach should we use?
