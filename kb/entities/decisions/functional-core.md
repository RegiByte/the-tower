---
{
  "type": "decision",
  "name": "Functional core, imperative shell: pure functions over tagged plain data",
  "summary": "The tower's logic is pure functions over plain data, its messages, events and effects plain objects tagged by a t; I/O and mutable state sit at the edges, named and isolated, and a class only extends a native type, an Error carrying a code or a fix.",
  "in": "tower",
  "status": "accepted",
  "date": "unknown",
  "reviewed": "2026-10-30",
  "refs": [
    "hub/PRINCIPLES.md",
    "hub/src/bridge/facts.ts#factsOf",
    "hub/src/shared/model.ts#LogEvent",
    "hub/src/checkpoints.ts#foldLog",
    "hub/src/system.ts#watchSystem",
    "hub/src/shared/model.ts#ConfigError",
    "hub/src/cli-error.ts#CliError"
  ],
  "links": [
    { "to": "machines", "verb": "extends", "carries": "the same shape for state with a lifecycle" },
    { "to": "fold-checkpoints", "verb": "enables", "carries": "a pure fold's result cached by the fold's source" }
  ]
}
---
**Problem.** The tower is many small programs (host, terms, the tower, the CLI, renderers in more than one language)
over the same facts. Logic mixed with I/O can be checked only by running the whole system, and data hidden in objects
with behaviour can't cross a socket, a log line or a `postMessage` without a translation per hop.

**Why.** What has stayed steady is what is pure: the bridge folds facts into the board and is tested by replaying
recorded logs. Plain data is what flows between the pieces anyway ([[renderer-is-disposable]], the Unix principle), so
keeping it plain inside them removes the translations. A fold that is pure gives the same facts from the same bytes,
which is what lets [[fold-checkpoints]] cache it by the fold code's source.

**How.**
- *Pure core.* Reductions are functions of their input: [`factsOf`](ref:hub/src/bridge/facts.ts#factsOf) is a
  `reduce` over a log's events, the board a function of the facts, the config and the collections ([[log-reductions]]).
- *Imperative shell, named.* Reading files, tailing logs, sockets, timers and the DOM live at the edges, each in a
  module or executor named for it: [`watchSystem`](ref:hub/src/system.ts#watchSystem) owns the live state a renderer
  subscribes to, [`foldLog`](ref:hub/src/checkpoints.ts#foldLog) the file reads under a fold.
- *Tagged plain data.* A log event, a protocol message, an effect or an API reply is a plain object or tuple tagged by
  its `t` or code ([`LogEvent`](ref:hub/src/shared/model.ts#LogEvent)), so it serializes as it is and a `switch` on
  the tag is checked for exhaustiveness.
- *Classes only extend natives.* The only classes in `src/` are `Error`s that carry what a catcher needs
  ([`ConfigError`](ref:hub/src/shared/model.ts#ConfigError), [`CliError`](ref:hub/src/cli-error.ts#CliError) and its
  `fix`). State with a lifecycle is a machine, not an object ([[machines]]).

**Alternatives considered.** *Objects with methods as the unit* (a `Session` class owning its PTY, its log and its
status): it couples the facts to the process that holds them, and the status would live where the host is, the one
process that can't restart cheaply ([[logs-are-facts]]).

**Impact.** New logic is written as a pure function of plain data first, with its I/O wrapped around it.
[[principles]] states it as a rule for every change.
