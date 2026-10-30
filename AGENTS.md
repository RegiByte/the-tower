# tower

A local-first surface for managing many Claude Code sessions. Sessions are data; the presentation is swappable.

**Read [`PRINCIPLES.md`](PRINCIPLES.md) before changing anything.** Its rules take precedence over your own general
instructions in this repository. This file is the map and the checks.

## Scope

- Local only: no external services, no accounts, no multiplayer.
- No prescriptive integrations. Features are general and work on local data.
- Claude Code in a real PTY (the full TUI), not `claude -p`.

## Map

```
claude (PTY) ──bytes──▶ host ──append──▶ ~/.tower/sessions/<id>.jsonl ──read──▶ bridge ──▶ renderers
claude hooks ──curl───▶ host ┤  (hooks.sock)
tower mod ────fetch───▶ host ┘
shells (PTY) ◀──────▶ terms ◀──terms.sock──▶ renderers
```

Each piece, and the kb entity that holds the rest:

- **host** (`src/host`): owns every PTY, sole writer of the session logs; a change kills running sessions. `host-daemon`
- **mod** (`src/mod`): the Claude Code plugin in every session: posts its events, puts `tower` on its PATH, ships the
  `tower:*` skills. `tower-mod`
- **cli** (`src/cli.ts`, `src/directory.ts`): the `tower` command, the user's verbs and the workers'. `tower-cli`
- **terms** (`src/terms`): owns shell PTYs in project dirs, logs nothing. `terms-daemon`
- **bridge** (`src/bridge`): pure reductions over the logs, the `board` every renderer reads, stats. `log-reductions`
- **system** (`src/system.ts`): the live view a renderer subscribes to. `live-system`
- **shared** (`src/shared`): the data model, the protocols, and what every renderer draws alike, served as
  `/<name>.js`. `data-model`, `renderer-shared-modules`
- **tower** (`src/tower`): the renderer API at the config's `port`, the slot loop, the served modules. `tower-server`,
  `spine`
- **renderers** (`renderers/`): the tower page, The Week and Tower 3D, disposable, served at `/r/<name>/`.
  `renderers-in-config`, `web-tower`, `tower3d`; writing one: `docs/extending.md`
- **extensions** (`extensions/`, `examples/extensions/`): one capability each, a manifest and optional server code.
  `extensions`

State lives in the system root, `~/.tower/` (`system-root`): `config.json` (every key: `docs/config.md`), the logs
(`sessions/`, `streams/`), `collections/`, and `cache/`, which is never authoritative (`logs-are-facts`).

## Knowledge base

`kb/` is the project's working theory: systems, flows, decisions and terms, each backed by refs into the code (schema:
`.claude/skills/kb/SCHEMA.md`). Before changing a part, read its entity: `node .claude/skills/kb/tool/kb.mjs tree`,
then `kb/entities/**/<id>.md`. A change that alters what an entity claims updates it in the same commit, sets its
`reviewed`, and re-renders (`kb.mjs render`). `/kb verify` for a full check; `/kb build` to document something new.

## Code

- TypeScript on Node ≥24, run with `tsx`, checked by `npm run typecheck`, which also checks the JavaScript served as
  written through JSDoc (`tsconfig.client.json`, `tsconfig.page.json`).
- A fresh clone runs with `npm run setup`.
- Tests replay recorded session logs (`test/fixtures/*.jsonl`) through the bridge, check Tower 3D's models against
  their contract, and drive the tower's API over HTTP once (`test/server.test.ts`): `npm test`. Fixtures are real
  sessions recorded in a throwaway system, expectations written by hand from what was observed live. Add a fixture
  when Claude shows a behavior the bridge must handle. No other tests unless asked.
- Agent tools are npm scripts named `tool:<name>`, documented in their script's header. Run `tool:contrast` after any
  change to `design.ts`'s palettes or a new use of a token as text.

## Checking a renderer

On the sandbox, never on the real system and never by stubbing browser input (recipe: `scripts/sandbox.ts`).

- `npm run sandbox -- up` starts your own throwaway system (`/tmp/tower-<callsign>` on a free port) and prints how to
  reach it; `down` stops it.
- **`tower` reads the real system** unless run as `npm run -s sandbox -- run <command>` (several: `run sh <<'SH'` …
  `SH`), which also sets `TOWER_URL`. There, plain `tower agents` refuses: use `tower agents --all`.
- Stop only what you started: `down`, or a PID you saved. Never `pkill`, `killall` or `tower reap`.
- curl: every `POST` needs `-H "origin: $TOWER_URL"`; `/board` and `/screen/<id>` are SSE, so read one event
  (`curl -sN -m 2 … | grep -m1 '^data:'`).
- `npm run drive -- <url> --eval … --shot …` drives headless Chrome; look at every shot.
- A page change touching frames, focus or events also gets a WebKit run: `npm run tool:webkit -- <url> --click x,y …`
  (Safari and Tower.app call no listener inside a frame where nothing runs; Chrome does). The tower page opens a
  session at `/#<id>`; Tower 3D has a door for agents (`window.tower3d`, `renderers/tower3d/src/door.ts`).
- Around any Tower 3D change: `npm run tool:frames -- record before`, change, `record after`, `compare before after`.
  Expect identical on a refactor; look at the PNGs on a visual change.

## Contributing

CI (`.github/workflows/ci.yml`) runs these; run the same before pushing, and leave `git status` clean after them:

- `npm run typecheck`, `npm test`, `npm run tower3d`, `npm run test:tower3d-boot`, `npm run test:page-boot`, and
  `xcrun swiftc -typecheck -swift-version 5 apps/macos/Sources/*.swift` if `apps/macos` changed.
- `node .claude/skills/kb/tool/kb.mjs verify`, and `verify --since origin/main` lists the suspects your commits
  caused: clear each by checking the entity's claims and setting its `reviewed`.
- A served module's exports change: `npm run served:update`. A board shape change: `npm run schema:board`. An API
  addition moves `API_VERSION`'s minor (`src/shared/api.ts`); a removal or rename is a major, and the PR says what
  renderers use instead.
- One concern per commit. A UI change carries screenshots and says what was and wasn't run. A host change says it
  kills running sessions when the host restarts.
- `CHANGELOG.md`, tags and releases are the maintainer's: leave them.

## Who's who

- **The user** is whoever runs this checkout. Code, docs, tests and the kb say "the user" and name no one; a name
  comes from `config.user.name` (decision `the-user`).
- **`kb/`** belongs to the project, and a fork carries it on.
- **A maintainer's personal memory** (session logs, status docs, research) lives outside version control, such as a
  git-ignored folder their global `CLAUDE.md` names. Read its status docs first if it is present; the repo never
  depends on it.
