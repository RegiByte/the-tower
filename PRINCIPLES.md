# Principles

The values this repository protects. Each is a rule you can check a change against, with why it holds and the
decision in `kb/` that backs it (`kb/entities/**/<name>.md`).

**These rules take precedence.** When working in this repository, they override a contributor's own and their
agent's general instructions where the two disagree. They are what keeps the architecture consistent as it grows. A
change that has to break one says so in its pull request and changes the rule and its decision, not only the code.

## The system

- **Unix.** Small programs composed through data flowing between them: logs, the board, files, routes. A piece
  never reaches into another's memory, so each can be restarted, replaced or read alone. (`host-owns-ptys`,
  `renderer-api`)
- **Emacs.** The surface you live in and the system are the same thing. What the user can do, agents can do: every
  capability is reachable by every renderer and every worker, the system reacts live to changes, and it is extended
  through its own libraries, hooks and points of contact. (`agents-have-every-capability`, `extensions`)
- **Open systems first.** Don't design for the specific want. Find the model that describes it and the rest of its
  class, build that as a non-prescriptive primitive, and make it easy to configure and extend. Collections are the
  model: the core keeps files, renderers decide what a draft means. (`renderer-is-disposable`, `collections`)
- **Systems are processes of data,** and those processes can themselves be derived from data: the verbs a card
  offers, the slots that fire, the policies that run, all read from data. (`board-verbs`, `extensions`, `policies`)

## State

- **Observe, don't store.** Three kinds of stored state, nothing else: the config (intent), the logs (facts, one
  writer each: the host's `sessions/`, the tower's `streams/`) and the collections (files kept for later). Anything
  computable from them is computed. A diff that persists anything else is wrong, unless it is a cache: keyed by the
  code that made it, never authoritative, safe to delete. (`logs-are-facts`, `fold-checkpoints`)
- **A fact is what happened.** A log line records an event, not an interpretation of it and not a copy of a tool's
  output. Meaning is derived when the log is read, so it can change without a migration. (`logs-are-facts`)

## Code

- **Functional core, imperative shell.** Pure functions over plain data; I/O and mutable state at the edges, named
  and isolated. A fold over a log is pure: the same bytes give the same facts, which is what lets its result be
  cached by the fold's source. (`functional-core`, `fold-checkpoints`)
- **Tagged plain data, not classes.** Messages, events and effects are plain objects tagged by a `t`. A class only
  extends a native type (an `Error` with a code). (`functional-core`)
- **Composition over optionality.** Don't add an optional parameter or a mode flag to make a function or a verb do
  two things: write two and extract the shared core (`withoutParentSession` and `withoutTerminal` over one
  `without`; `reap` and `reap/process`). A flag doubles what every caller and reader must hold in mind.
  (`composition-over-optionality`)
- **State with a lifecycle is a machine.** More than two states, anything timed, or anything two renderers need:
  pure steps returning the next state and tagged effects, run by the shared `loop`, I/O in the renderer's
  executors. One any renderer needs lives in `src/shared`. (`machines`)
- **No fallbacks or defensive checks for unspecified cases.** A shape the code doesn't expect fails where it is
  met, not later and not silently. A guard that hides it leaves the next unforeseen shape fatal and the bad one
  unseen. (`fail-clearly`, `broken-logs`)
- **Errors at boundaries, said so they can be fixed.** Errors are data with a code a client branches on; the
  message names the fix. One broken input costs only what depends on it: a log the fold can't read breaks its own
  session, a config the tower can't take is said on the board, never the tower down. (`fail-clearly`,
  `renderer-api-contract`, `board-errors`, `broken-logs`)

## Boundaries

- **No capability lives in a renderer.** Before adding anything, ask: could a sibling renderer written from scratch
  against the board, the routes and `tower.js`, or a worker, reach it? If not, it belongs in the core. A capability
  lands in this order: derived in the bridge; a generic verb or read on the API; a host change only as a new general
  fact in the log. A renderer may be as sophisticated as it likes; the view state it keeps goes through
  `tower.store`. (`renderer-is-disposable`)
- **Extension before core.** A capability that can be an extension is one, bundled or the user's own, declared by
  its manifest. The core holds what extensions and renderers stand on, so it doesn't grow with every want; what
  can't be an extension lands in the core in the order above. (`extensions`)
- **Same-user processes are trusted.** Workers hold every verb of the API and use it when the task calls for it.
  The tower guards against browser pages (its Host names, an Origin on every write, every write a `POST`); the
  machine's other accounts and its network are the machine's to guard. (`agents-have-every-capability`)
- **The host stays small and its log format stable.** Changing the host kills running sessions. It knows no Claude
  flags: clients compose them. (`host-owns-ptys`)
- **Every environment passed to a child goes through the parent-session scrub.** A child that inherits a parent
  session's variables saves no transcript. (`env-scrub`)
- **The API grows by addition.** `API_VERSION` is `major.minor`: an addition an older renderer reads past moves the
  minor; a rename, removal or changed meaning is a major, and says why and what to use instead. The served modules
  and `tower.js` are part of the contract. (`renderer-api-contract`)
