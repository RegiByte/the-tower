---
{
  "type": "decision",
  "name": "Fail clearly: no fallbacks for unspecified cases, errors as data at boundaries",
  "summary": "Code handles the cases it knows and lets an unforeseen one fail where it is met, with no fallback or defensive check that hides it; at a boundary an error is data with a code a client branches on and a message that names the fix, and one broken input costs only what depends on it.",
  "in": "tower",
  "status": "accepted",
  "date": "unknown",
  "reviewed": "2026-10-31",
  "refs": [
    "hub/PRINCIPLES.md",
    "hub/src/shared/api.ts#ApiError",
    "hub/src/shared/api.ts#ERROR_CODES",
    "hub/src/bridge/facts.ts#Broken",
    "hub/src/shared/model.ts#ConfigError",
    "hub/src/cli-error.ts#CliError"
  ],
  "links": [
    { "to": "broken-logs", "verb": "applied-in", "carries": "one unreadable log breaks its own session" },
    { "to": "board-errors", "verb": "applied-in", "carries": "a board the tower can't build says why" },
    { "to": "renderer-api-contract", "verb": "applied-in", "carries": "every API failure as {t: 'error', code, message}" }
  ]
}
---
**Problem.** A guard written for a case nobody specified (`?? []`, a default config value, a catch that logs and goes
on) makes the code look safe while it hides the case: the bad input travels on and fails later, far from its cause, or
never fails and is silently wrong. Each guard also adds a path every reader has to hold in mind.

**Why.** An error that points at its fix beats a workaround that hides the problem. The tower's inputs are facts and a
hand-edited config: when one is wrong, the user or a worker can fix it once they are told which and where.

**How.**
- *No fallbacks or defensive checks for unspecified cases.* Handle the known, expected cases where they arise; let the
  rest throw where it is met. [[broken-logs]] is the worked case: a guard per payload field was rejected for one guard
  at the fold step that records the error as [`Broken`](ref:hub/src/bridge/facts.ts#Broken).
- *Errors at boundaries are data.* Every API failure answers [`{t: 'error', code, message}`](ref:hub/src/shared/api.ts#ApiError),
  a code from [`ERROR_CODES`](ref:hub/src/shared/api.ts#ERROR_CODES) a client branches on ([[renderer-api-contract]]);
  the board stream says why it can't build the board ([[board-errors]]); the CLI's
  [`CliError`](ref:hub/src/cli-error.ts#CliError) carries a `fix`; a [`ConfigError`](ref:hub/src/shared/model.ts#ConfigError)
  names the key path.
- *A failure costs only what depends on it.* One log breaks its own session, one extension its own capability
  ([[extensions]]), a config the tower can't take the board until it is fixed; never the tower process.
- *Higher-level facilities first.* Where a boundary already has a handler (the API's one dispatch, the board stream,
  the CLI's top level), errors are thrown to it, not caught and reworded on the way.

**Alternatives considered.** *Defaults that keep things drawing* (an empty board, a status of `unknown`): a view that
looks real while saying nothing, rejected in [[board-errors]] for that reason.

**Impact.** A review flags a guard for a case the change doesn't name. [[principles]] states it as a rule.
