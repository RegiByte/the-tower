---
{
  "type": "decision",
  "name": "A prompt from outside the terminal is checked against the composer",
  "summary": "submit/at-prompt types a prompt only while the worker sits at its prompt with nothing in its composer, checked as the call arrives and again before Enter; submit, which queues while Claude works, refuses a worker asking something or held by a screen. What the composer may hold is folded from the log.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-11-01",
  "reviewed": "2026-11-11",
  "refs": [
    "hub/src/bridge/composer.ts",
    "hub/src/bridge/composer.ts#heldAfter",
    "hub/src/bridge/composer.ts#promptRefusal",
    "hub/src/bridge/composer.ts#isPlain",
    "hub/src/bridge/composer.ts#AT_PROMPT",
    "hub/src/bridge/composer.ts#AT_COMPOSER",
    "hub/src/bridge/facts.ts#factsAfter",
    "hub/src/tower/dispatch.ts#submitAtPrompt",
    "hub/src/tower/dispatch.ts#submit",
    "hub/src/tower/dispatch.ts#movedWhileTyped",
    "hub/src/machine.ts#typeText",
    "hub/src/machine.ts#pressSubmit",
    "hub/src/bridge/verbs.ts#cardVerbs",
    "hub/src/shared/api.ts#VERBS",
    "hub/src/shared/api.ts#ERROR_CODES",
    "hub/test/composer.test.ts",
    "hub/test/fixtures/composer-typed.jsonl",
    "hub/test/fixtures/escaped-prompt.jsonl",
    "hub/scripts/claude-check.scenarios.ts#SCENARIOS"
  ],
  "links": [
    { "to": "board-verbs", "verb": "refines", "carries": "the card verb prompt, offered while the worker takes one" },
    { "to": "log-reductions", "verb": "uses", "carries": "typed input, prompt.submit and command.run of the composer, an aborted turn.complete" },
    { "to": "worker-prompts", "verb": "uses", "carries": "a worker's prompt named in the target's log before it is typed" },
    { "to": "renderer-api-contract", "verb": "refines", "carries": "submit/at-prompt and the codes not_plain, not_at_prompt, composer_holds, moved" }
  ]
}
---
**Problem.** `submit` types into Claude's composer and presses Enter, checking nothing: it appends to text someone
half typed in the terminal, and while the worker asks a question or waits on one of Claude's screens the text answers
it. A composer drawn outside the terminal (the Brief's `card.composer`) puts that in front of people who never see the
terminal, so a wrong submit is unseen.

**Why.** [[renderer-is-disposable]]: whether a worker takes a prompt is a rule every composer needs, so the core
decides it, on the live fold, at the moment of the call. The text never submitting into a dialog matters more than it
always submitting.

**How.**
- The fold keeps `heldSince`, when the composer may have started holding text
  ([`heldAfter`](ref:hub/src/bridge/composer.ts#heldAfter)): typed input while the composer has focus
  ([`AT_COMPOSER`](ref:hub/src/bridge/composer.ts#AT_COMPOSER)), but not a bare Esc, Enter or Shift+Tab; and an Esc before Claude
  streamed anything, a main-loop `turn.complete` aborted with no answer and no step or call in the turn, which puts the
  prompt back in the composer ([recorded](ref:hub/test/fixtures/escaped-prompt.jsonl)). A `prompt.submit` or
  `command.run` from the composer, Ctrl+C typed at it ([recorded](ref:hub/test/fixtures/composer-typed.jsonl)), or a
  new conversation, empties it; a compaction keeps it. Keys answering a
  permission dialog or the trust screen are typed while the composer has no focus, and fill nothing.
- At its prompt is [`AT_PROMPT`](ref:hub/src/bridge/composer.ts#AT_PROMPT): idle, done, failed or watching.
  [`promptRefusal`](ref:hub/src/bridge/composer.ts#promptRefusal) says `not_at_prompt` outside it, `composer_holds`
  while `heldSince` is set. The card offers `prompt` when it says neither ([`cardVerbs`](ref:hub/src/bridge/verbs.ts#cardVerbs)).
- [`submitAtPrompt`](ref:hub/src/tower/dispatch.ts#submitAtPrompt) refuses on that, types the pastes ([`typeText`](ref:hub/src/machine.ts#typeText)), then waits for the fold to
  read every paste back from the log (the fold counts typed input, `typed`). Enter
  ([`pressSubmit`](ref:hub/src/machine.ts#pressSubmit)) is pressed only if the status and its `since` are unchanged and
  nobody else typed, a worker's prompt named in the log just before it ([[worker-prompts]]), so text left unsent
  names nobody; otherwise it answers `moved` ([`movedWhileTyped`](ref:hub/src/tower/dispatch.ts#movedWhileTyped))
  and the text waits, visible, in the composer, which then reads `composer_holds`.
- [`isPlain`](ref:hub/src/bridge/composer.ts#isPlain) is checked first, on the text alone: Claude's composer leaves
  plain-prompt mode on a leading `/` (a command, opening a panel that takes keys while no status moves) and `!` (the
  rest runs as a shell command, likewise unseen by the status, and the composer then reads `composer_holds`), even
  after whitespace. The verb refuses them `not_plain`, its message naming the worker's terminal as the place to run
  them. `#`, `@`, `?`, `&` and `\` submit as prompts: typed, `@` opens a file picker, but a paste does not (checked on
  Claude 2.1.316).
- [`submit`](ref:hub/src/tower/dispatch.ts#submit) keeps queueing while Claude works, and refuses `not_at_prompt`
  outside `AT_COMPOSER`. `tower submit` goes through the tower, so the CLI gets the same refusal.
- [Tests](ref:hub/test/composer.test.ts) replay the fixtures, and the claude-check scenarios `composer-typed` and
  `escaped-prompt` call the verb on each Claude release, once to submit and once to be refused (`not_plain` reads the text
  alone, so no scenario watches it; the leading characters were checked by hand on Claude 2.1.316, and a release that
  changes them is read from its changelog).

**Claude's idle overlays.** Some of Claude's screens take keys while the status reads idle or failed. The session
feedback survey ("How is Claude doing this session?", 1 Bad 2 Fine 3 Good 0 Dismiss) shares the composer: in Claude
2.1.316 it reads a rating only when the composer holds exactly one character, a digit, after a pause or on Enter. A
paste of more than one character is typed into the composer and submitted as a prompt, so only a one-character prompt
that is a rating digit can answer it; nothing refuses that. The usage-limit menu after a turn the limits stopped is a
list that takes focus; it was not raised on a throwaway system, so it is not matched. If it captures pastes, the
screen fold (`screen.ts`, as `blocked.ts` matches startup screens) is where a `dialog_open` refusal would read it.

**Alternatives considered.**
- *Change `submit`'s meaning to refuse while Claude works*: its queueing is a feature workers use (`tower x reviews send`, a
  hire's brief), so the safe verb is a second one sharing `submitText`'s core.
- *Clear the composer first (Ctrl-U)*: it destroys someone's typing and sends keys whose meaning depends on the
  screen.
- *Append, as `submit` does*: it merges two people's words into one prompt.
- *`typedAt < since`, the waits' rule*: a turn a background task starts moves `since` past text still in the
  composer, and keys answering a dialog would read as text.
- *Leave `watching` out of at its prompt*: it would block a composer for any worker running a monitor; the check
  before Enter covers a task waking it.

**Impact.** A composer outside the terminal calls `submit/at-prompt` and draws the card's `prompt` verb. Any key that
can put text in a worker's composer after its answer, an arrow key or a Backspace included, keeps the verb off until a
prompt is submitted there or Ctrl+C clears it: the cost of not reading the screen. `submit` and `tower submit` refuse a
worker that asks something or waits on a screen (API 1.134).
