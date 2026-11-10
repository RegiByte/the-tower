---
{
  "type": "decision",
  "name": "The tower writes the config through four checked verbs, per key, compare-and-set",
  "summary": "config/add, config/append, config/set and config/remove each make one edit of the config file through one pure core, edited; set and remove take was, the value the caller read at the key, and apply only while the key still holds it, deep-equal, so an edit conflicts only with a change at its own key. An edit is refused when it would bring the config any new problem tower config check names, a warning included. The file is written whole beside its real path and the verb has the tower read it again itself; GET /config reads it. The verbs live in the core, every flow built on them in extensions.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-11-04",
  "reviewed": "2026-11-10",
  "refs": ["hub/src/config-edit.ts#edited", "hub/src/config-edit.ts#checkedEdit", "hub/src/config-edit.ts#newProblems", "hub/src/config-edit.ts#editConfig", "hub/src/tower/dispatch.ts#configEdited", "hub/src/shared/api.ts#CONFIG_WRITE", "hub/src/shared/api.ts#ERROR_CODES", "hub/src/tower/http.ts#READS", "hub/src/shared/extensions.ts#RESERVED", "hub/test/config-edit.test.ts", "hub/test/server.test.ts", "hub/docs/config.md"]
}
---
**Problem.** The config is the user's intent ([[logs-are-facts]]), and only a hand edit changed it. A user wants to add
a floor from the page, and next to pick its repos, turn an extension on for a floor, or save an arrangement as a
default. The first verb (`config/add`, from a contributor's PR) only added a key, so it could neither append a repo to
a floor nor replace a value, and nothing else could build on it.

**Why.** The config has two writers by design: the user by hand, sometimes with the file open in an editor, and the
tower. An edit that replaces or deletes a value must not overwrite a hand edit it never saw, and an edit must never
leave the config worse than it found it, since the tower is what still stands when the config is wrong
([[board-errors]]).

**How.**

- **One pure core.** [`edited`](ref:hub/src/config-edit.ts#edited) applies one tagged edit to a config value and
  answers the next config or an `ApiError`. Every verb is a thin handler over it
  ([`configEdited`](ref:hub/src/tower/dispatch.ts#configEdited)): separate verbs, no mode flag
  ([[composition-over-optionality]]).
  - `add` puts a key the config lacks, making objects on the way: `exists` when it is there, `refused` when a parent is
    no object or is an array (`append` adds to one).
  - `append` pushes onto an existing array: `not_found`, `refused` for a non-array. A value the array already holds,
    deep-equal, answers `unchanged` and writes nothing, so a retry is harmless.
  - `set` replaces an existing value and `remove` deletes a key or splices out an array element: `not_found`, and
    `changed` when the key no longer holds `was`.
  - Under an array a segment is an index, digits below its length, else `not_found`; `add` never takes one. A name
    that reaches a prototype (`__proto__`, `constructor`, `prototype`) is `invalid`.
- **Compare-and-set, per key.** `was` is the JSON the caller read at the key (`GET /config`, or the board when it
  carries the value). Like `compare-and-set!` on an atom, the edit applies only while the value there is still
  deep-equal to it, so it conflicts with a change at its own key and never with an unrelated hand edit or another
  tower write. `remove` on an index is safe for the same reason: a shifted array no longer holds `was` there.
- **No new problems.** [`checkedEdit`](ref:hub/src/config-edit.ts#checkedEdit) refuses (`config`) an edit that would
  bring any problem `tower config check` names that the config didn't have before
  ([`newProblems`](ref:hub/src/config-edit.ts#newProblems)), warnings included: a key the tower would ignore, such as
  a typo, is refused, each problem named at its key. Problems the user already had don't hold an edit back: they are
  counted as a multiset by level, words and key with its array indexes taken out, so a broken repo that only moved up
  when an element before it was removed is still one the config had.
- **The write and the reread.** [`editConfig`](ref:hub/src/config-edit.ts#editConfig) reads, edits, checks and writes
  in one synchronous step, so two edits in the tower never interleave; it writes two-space JSON beside the file's real
  path with its mode and renames it into place, so a config that is a link stays one. Then the verb has the tower take
  the config again itself (`System.refreshConfig`, the same repo reconcile and change the watcher calls), since a
  write into a link's target folder raises no event in the folder the tower watches.
- **`GET /config`** answers the file as it holds it, parsed: the values a `was` names. A read, so it passes on its
  Host alone and without CORS headers ([[hosts-in-config]]). Extensions reach it with `ctx.read('tower/config')`.
- **`config` is a reserved name** at a minor ([`RESERVED`](ref:hub/src/shared/extensions.ts#RESERVED)): a user's
  extension of that id is refused until renamed, the refusal saying so ([[extensions]], [[renderer-api-contract]]).
- **Same-user trust** ([[agents-have-every-capability]]). These verbs can write `argv` or `extensions.<x>.path`, and
  so make the tower run other code at its next start: what a worker can already do with its Edit tool. `GET /config`
  hands `env`, where tokens may live, to any page at the tower's origin, a worker-written `/run/` page included; those
  pages can already spawn workers, so it opens no new class of exposure.

**Alternatives considered.**

- *A whole-file version (a hash of the file) on every write.* Any unrelated byte change, a hand edit elsewhere or
  another tower write, made every pending `set` stale: false conflicts, and a token every client must carry. Dropped
  for the per-key `was`. Collections keep their `modifiedAt` version ([[collections]]) because an item is one value:
  per file there is per key.
- *A `config` extension that owns the writer.* Extensions are enabled by the config, and their reconcile stops on a
  config it can't read, so the writer would be switched off or broken by the file it writes, and the UI could no
  longer fix it. Making it an extension would also need a core door to the file anyway. Every form and flow built on
  the verbs is an extension instead, as collections keep files and extensions decide what they mean.
- *Refusing only new fails.* A misspelled key would be added and silently ignored; the tower's own write should
  leave the config no worse.

**Impact.** API 1.147: four verbs, `GET /config`, the `changed` error code and the reserved name. The user is no
longer the file's only editor ([[operator]], `docs/config.md`). An editor holding unsaved changes overwrites a tower
write when it saves, which the tower can't see; `docs/config.md` says so.
