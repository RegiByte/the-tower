---
{
  "type": "decision",
  "name": "Composition over optionality: two functions over one flag",
  "summary": "A function or a verb does one thing; when a second use differs, it becomes a second function or verb over an extracted shared core, never an optional parameter or a mode flag on the first.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-30",
  "reviewed": "2026-10-31",
  "refs": [
    "hub/PRINCIPLES.md",
    "hub/src/shared/env.ts#withoutParentSession",
    "hub/src/shared/env.ts#withoutTerminal",
    "hub/src/shared/api.ts#VERBS"
  ]
}
---
**Problem.** The cheapest way to make a function serve a second caller is a parameter that switches its behaviour.
Each one doubles the paths through it, every caller must know which mode it wants, and the function's name stops
saying what it does.

**Why.** The tower is composed from small pieces over data (the Unix principle). Pieces that each do one thing compose;
a piece with modes has to be configured before it composes, and its modes drift apart inside one body. The renderer
API is read by clients that never saw the code, so a verb whose meaning depends on a flag is harder to learn and to
version than two verbs.

**How.**
- *Two functions, one core.* [`withoutParentSession`](ref:hub/src/shared/env.ts#withoutParentSession) and
  [`withoutTerminal`](ref:hub/src/shared/env.ts#withoutTerminal) are two names over one private `without(env,
  drops)`, not one scrub with a `terminal?: boolean` ([[env-scrub]]).
- *Two verbs, one job each.* The API's [`VERBS`](ref:hub/src/shared/api.ts#VERBS) has `reap` and `reap/process`,
  `spawn` and `resume`, `collection/create` and `collection/write`, each with its own schema, not one verb with a
  `mode`.
- *Not a rule against parameters.* Data a function works on is a parameter; a parameter that picks which of two jobs
  it does is the smell.
- *Not collapsing unrelated code.* Sharing a core is for logic that is the same; two things that only look alike stay
  apart, since coupling them is the greater cost.

**Alternatives considered.** *Options objects with defaults*: they keep call sites short and hide the same branching.

**Impact.** A review flags a new optional parameter or flag that switches behaviour. [[principles]] states it as a
rule.
