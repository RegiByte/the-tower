# Build workflow

Create the KB or document a new piece of the project. The truth rules in `SKILL.md` apply throughout.

## What the KB is for

The reader is a developer and their agent taking over a system they did not write. The KB gives
them a working theory: what each part is for, how parts connect, how one unit of work travels
through them, why things are the way they are, the words they cannot guess, and what breaks.
They should be able to read it before opening the code, and then use it to open the right code.

It is not a description of the code. Anything the code shows cheaply goes out: function-by-function
behaviour, module layouts, values that live in a database or config file. Point to where those live.

**Size rules**
- `summary`: one sentence, what it is and why it exists.
- Body: the few paragraphs a newcomer needs before opening the code. A body past ~40 lines is
  usually two entities, or it is describing code.
- Create an entity when a newcomer would ask about it by name, when it sits at one end of a seam, or
  when it has its own failure modes. Modules, classes and functions are not entities; they are refs.
- Copy a value only if it is stable and essential to understanding ("every 30 minutes"), and ref its
  source. Volatile values (weights, thresholds, credentials, quotas) get a pointer, never a copy.

## Session procedure

Document piece by piece: one scope per session, done well, beats breadth.

1. **Orient.** From the project root, run `node <skill-dir>/tool/kb.mjs tree`. If there is no `kb/`
   folder, no project entity, or no repos in `kb.config.json`, do the bootstrap below first.
2. **Scope.** Agree with the human on the piece for this session: a system, a flow, a page, an area.
3. **Read context** the human points to (CLAUDE.md, notes, READMEs, docs), plus the entities already
   in scope (`tree <id>`, then the files).
4. **Interview.** Ask in small batches. Skip what the context already answers: state what you
   understood and ask for corrections instead. Cover:
   - the purpose of this piece in a paragraph; who uses its output and what they do with it
   - the parts: what runs, where, and what triggers it
   - the journey of one unit of work end to end
   - the seams: what crosses between parts, and in what form
   - the words a newcomer cannot guess
   - the decisions a successor must not undo by accident, and why
   - what has broken before, what it looked like, where to look first

   Keep the owner's words where they are good.
5. **Propose the plan** before writing: a table of id, type, parent, one-line summary, and links.
   Wait for approval.
6. **Gather evidence.** For every entity and link, find the code that backs it: entry point, handler,
   scheduler, table DDL, config source. Prefer file refs with symbol anchors (`path#function_name`).
   Use directory refs only for claims about a whole package; they turn suspect on any change inside.
   Parallel subagents work well here, one per repo or part. Give them the truth rules from `SKILL.md`.
7. **Write** one file per entity under `kb/entities/<system-id>/` (project-level entities at the
   root of `entities/`). Set `reviewed` to today for everything you wrote and confirmed.
8. **Render.** Run `node <skill-dir>/tool/kb.mjs render` and fix every error. Warnings that remain must be explained.
9. **Report:** the entities created or updated, contradictions found, open questions, the suggested
   next piece, and the path to the HTML file.

## Bootstrap

- Create `kb/` at the project root with `kb/entities/`, `kb/views/`, `kb/.gitignore` containing
  `dist/`, and `kb/kb.config.json` with `{ "repos": {}, "types": [] }`.
- Fill the repos. Get `github` from `git remote get-url origin` and `branch` from
  `git symbolic-ref --short refs/remotes/origin/HEAD` (minus `origin/`). Every checked repo must be
  cloned next to the main checkout of the repo that holds `kb/`, in a folder named like the GitHub repo; if one is not,
  tell the human. Repos the team does not control or clone get `"checkout": false`.
- Write the project entity at `kb/entities/<project-id>.md`: what the project is, who it serves, its
  systems and how they relate, and where a newcomer should start reading.
- Suggest the CLAUDE.md snippet from the README of the repo that ships this skill, so later
  sessions keep the KB true.

## How to write each type

- **links**: store each link on the entity that acts. `carries` is concrete: name the table,
  endpoint, file or message. If you cannot say what crosses, you do not understand the seam yet.
- **flow**: a mermaid `sequenceDiagram` with participants named after the entities, then the rules
  that matter: what triggers it, what is idempotent, what happens on failure, where output lands.
  List every participant of the diagram in `involves`; the flow's map is built
  from it, and the flow appears on each involved entity's page. Every container belongs to at least
  one flow; when writing a system, plan its flows before its containers.
- **decision**: body sections **Context**, **Decision**, **Alternatives considered**, **Consequences**.
  Never delete one. To reverse it, write a new decision with `supersedes`.
- **runbook**: body sections **Symptom**, **Where to look first**, **Likely causes**, **Fix**.
- **term**: the summary is the definition. A body only if the term needs an example.
- **views**: prose plus `kb-list` tables, for pages that cut across the tree (a data dictionary,
  all runbooks, onboarding order).
