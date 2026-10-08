---
name: kb
description: Build, extend, verify and render the project knowledge base in kb/ — a data-driven working theory of how the system works (systems, containers, stores, seams, flows, decisions, glossary, runbooks), rendered to a single shareable HTML file. Use when the user wants to start the KB, document a system, flow or part of the project, verify or refresh the docs, update them after a change, or rebuild the artifact ("document the recommender", "verify the kb", "we removed Zyte, update the docs").
argument-hint: build | verify
---

# kb

The knowledge base is data in `kb/` at the project root. This skill holds the contract and the tool:

- `SCHEMA.md` (this folder) is the contract. Read it before writing anything.
- `tool/kb.mjs` is the CLI. Run it from the project root: `node <this-skill-dir>/tool/kb.mjs tree|verify|render`.
- `build.md`: the workflow for creating the KB or documenting a new piece.
- `verify.md`: the workflow for checking the KB against the code and fixing what drifted.

Pick the workflow from the request, read that file, and follow it. Adding knowledge means build.
Checking, refreshing or updating after a change means verify. When unsure, ask.

You edit `kb/entities/`, `kb/views/` and `kb/kb.config.json`. You never edit this skill's files.
If the schema cannot express something, stop and tell the human; propose a custom type in
`kb.config.json` if it is a recurring kind of thing.

## Truth rules (both workflows)

- Every claim comes from code you read (and ref) or from the owner. Never invent a ref; never fill a
  gap with a plausible guess. If you do not know, ask, or leave it out and list it as an open question.
- When the owner's account and the code disagree, do not pick one silently. List the contradiction.
- Existing docs and notes are leads, not truth. Old docs are where rot lives: confirm them against code.
- Present tense, current truth. History exists only as decisions.
- Code in the other repos is read at `origin/<branch>` (the branch the KB describes), never the
  working tree: those checkouts may be on feature branches. Use `git -C <checkout> show origin/<branch>:<path>`
  and `git -C <checkout> grep -n <pattern> origin/<branch> -- <dir>`. They sit next to the main checkout
  of the repo that holds `kb/`, named like the GitHub repo; from a worktree, that directory is two levels
  above `git rev-parse --path-format=absolute --git-common-dir`.
- Code in the repo that holds `kb/` is read at `HEAD`, which must contain `origin/<branch>` (rebase
  first): that is what lets one branch change code and its entities together. A change spanning repos
  updates the KB in the PR that merges last.
- `reviewed` is an attestation that someone confirmed the entity's claims against the code on that
  date. Set it only for claims you actually checked.
