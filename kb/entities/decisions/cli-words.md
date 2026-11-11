---
{
  "type": "decision",
  "name": "Extension words: verbs and reads typed like commands under tower x",
  "summary": "Every extension verb is a word under tower x by its name, and a read is one when its cli names it. Flags come from the input schema with no declaration, stdin is text, the caller and its floor are filled through one path, and no extension code runs in the command.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-11-05",
  "reviewed": "2026-11-11",
  "refs": ["hub/src/shared/cli-words.ts#wordsOf", "hub/src/shared/cli-words.ts#parseWord", "hub/src/shared/cli-words.ts#missingLine", "hub/src/shared/cli-words.ts#jsonDeprecatedLine", "hub/src/shared/extensions.ts#Manifest", "hub/src/bridge/extensions.ts#cliProblems", "hub/src/bridge/extensions.ts#contractNames", "hub/src/directory.ts#runWord", "hub/src/directory.ts#withCallerFloor", "hub/src/directory.ts#textOnStdin", "hub/src/cli-verbs.ts#ALIASES", "hub/src/cli-verbs.ts#movedLine", "hub/test/cli-words.test.ts"]
}
---
**Problem.** `tower x` took one JSON argument. A worker had to write a whole object by hand to do what a core word does
with a few flags and a heredoc, so extensions' commands were worse to type than the core's, and seven core words
still named bundled extensions to make up for it.

**Why.** Workers should learn one way in for every extension's commands, and a user's extension should get words on
the same terms as a bundled one ([[extensions]], [[agents-have-every-capability]]). A word under `x` can't conflict
with a core word by construction, so there is nothing to reserve.

**How.**
- **A word is a verb, typed at like a command.** Every verb is a word by its name, with nothing declared. A read is a
  word when its `cli.word` names one, since reads are paths. Any read stays reachable by its path, the path settling
  its params.
- **Flags come from the schema.** One per top-level field ([`takesOf`](ref:hub/src/shared/cli-words.ts#takesOf)): a
  string as typed, a number or boolean converted or refused, an array repeated, and JSON only as the value of a
  structured field. A verb names its stdin field, positional fields, printed reply field, usage line and another word
  through `cli`, five keys, each checked at load ([`cliProblems`](ref:hub/src/bridge/extensions.ts#cliProblems),
  problem `cli`).
- **The words are derived data.** [`wordsOf`](ref:hub/src/shared/cli-words.ts#wordsOf) reads them from the manifest,
  and `GET /extensions` serves them. They stay off the board, since nothing but a client typing one reads them, so the
  board stays small. Everything in `src/shared/cli-words.ts` is pure, so each text an agent acts on is held by a test.
- **The command fills the caller, through one path.** [`runWord`](ref:hub/src/directory.ts#runWord) is the one way a
  word reaches the tower, and [`withCallerFloor`](ref:hub/src/directory.ts#withCallerFloor) gives a project-scoped word
  the worker's floor unless `--project` names one. Defaults that depend on who calls are the verb's: it knows the
  caller and reads the board.
- **Stdin is text only from a pipe or a file.** [`textOnStdin`](ref:hub/src/directory.ts#textOnStdin) reads the
  `cli.stdin` field, and `keep`'s and `hire`'s text, only when stdin is a FIFO or a regular file: a heredoc, `|` or
  `<`. A terminal, `/dev/null` or a socket gives none, so a word whose text is optional runs without it and one that
  needs it says so. A socket may never end: Claude Code's Bash tool holds one open as stdin whenever the command
  contains `<<`, and a word reading it to its end waited forever. The cost falls on a program that spawns the command
  and writes to its stdin (Node's `spawn`, whose stdin is a socket): it passes the text as the flag, a file or a pipe.
- **Help and errors say what to do next.** `tower x` lists capabilities, `tower x <cap>` words before raw calls; a
  missing input names it with an example, a wrong value names its type, and an unknown word or flag names the nearest.
- **A door's `--value` is required.** A bare door word is the missing-flag error, so it clears nothing by accident.
  `--value ""` reaches the door as an empty string, and clearing is that value on purpose, for a fact that reads a blank
  as cleared. `null` stays at the API; a null in a JSON argument on a string door is typed `--value ""`, on a door that
  takes JSON `--value null`, and on any other door has no typed form, so a door that needs one offers a verb.
- **A word's shape is its verb's.** A word wanting friendlier input is a verb of its own over the same function, never
  a mode on one verb. A word's name and shape are `contract.json` names, so a replacement must offer them.
- **The JSON argument goes at 2.0.** Until then it works, is filled the same way, and says what to type instead,
  rendered from the JSON it was given. `ALIASES` holds the old core words as they move: `policies`, `runs` and
  `probes`, each saying on stderr the command it runs, so the line can be typed.
- **A moved word is an error that names its fix, never an alias.** An unknown top-level word that is a capability's
  name or an extension's word exits non-zero, runs nothing and names every form it has under `tower x`, read from
  `GET /extensions` with no table, an owner not running with its state. It already teaches words that never had an
  alias (`tower limits`), and takes over the `ALIASES` words when their table goes at 2.0. It matches exactly and
  echoes none of the arguments, since an old word's grammar may not be its new one's.
- **Words want guidance.** An extension with a `cli` and no guidance gets the warning `cli`, since a word nothing names
  reaches nobody; one with no `cli` doesn't, as a verb is a word whether or not a worker is meant to type it.

**Alternatives considered.** Extension code run in the command (a `cli.ts` the command imports): full freedom, but a
second runtime for extension code, with the library resolved there and version skew against the running extension. A
declared grammar of keywords and patterns per word: reproduces old syntax exactly, but it is a little language each
author learns, while flags from the schema need no declaration. Top-level extension words with a reserved list: keeps
words short, but every new core word becomes a potential conflict. Keeping the core words as thin clients: no new
mechanism, but the core keeps naming bundled extensions past 2.0, and removing a word every worker uses is then a
breaking change outside a major.

**Impact.** Any extension's verbs and reads are typed like commands, the user's as much as the bundled ones. The manifest
gains `cli` on verbs and reads, `/extensions` gains `words`, and `tower x` alone lists capabilities, not every call.
The cost is the longer word, `tower x reviews note` over `tower note`.
Reviews' words depart from the first sketch twice. `thread` is a read of its own, `thread/<project>`, because `cli` on
`said/<project>` would have frozen that read's `reader`, `sender` and `hirer` as flags, as policies' `list/<project>`
found. `review` is a verb of its own over `hire`'s function, because `contract.json` had frozen `hire` as a word and
naming it `review` would have been a removal. A typed word that needs a shape of its own gets a verb of its own.
