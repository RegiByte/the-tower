# Knowledge base schema

The knowledge base (KB) is a working theory of a software project: a set of **entities**, each
holding claims in prose, backed by **refs** into code, connected by **links**, and marked with the
date someone last **reviewed** them against reality. A fixed renderer turns it into one HTML file.

Agents edit files under `kb/`. Agents never edit the skill's `tool/`; if the schema cannot express
something, stop and tell the human.

```
kb/                   at the project root, inside a git repo
  kb.config.json      repos and custom types
  entities/**/<id>.md one entity per file; folders are free-form, only for humans
  views/<id>.md       custom pages
  .gitignore          contains dist/
  dist/               rendered output
```

Run from the project root (`<skill-dir>` is this skill's folder):

```
node <skill-dir>/tool/kb.mjs tree [id]   print the entity tree (id, type, name, summary)
node <skill-dir>/tool/kb.mjs verify      report repo freshness, errors and warnings
node <skill-dir>/tool/kb.mjs verify --since <rev>   the same, with only the suspects commits in <rev>..HEAD caused
node <skill-dir>/tool/kb.mjs verify --symbols   the same, with a suspect at path#symbol refs kept only for commits that changed one of those symbols' lines
node <skill-dir>/tool/kb.mjs render      build kb/dist/<project-id>.html (refuses on errors)
```

## kb.config.json

```json
{
  "repos": {
    "api": { "github": "org/acme-api", "branch": "main" },
    "worker": { "github": "org/acme-worker", "branch": "main", "checkout": false }
  },
  "types": []
}
```

- `repos.<alias>`: alias is kebab-case and is the first segment of every ref.
- `github`: `owner/name`. `branch`: the branch the KB describes; links point at it.
- **The repo holding `kb/`** is the alias whose `github` matches that repo's `origin` remote,
  wherever it is checked out (any folder name, any worktree). Its refs are checked at `HEAD`, so a
  branch that changes code and the entities describing it verifies as one unit. `HEAD` must
  contain `origin/<branch>`; otherwise `verify` fails and asks you to rebase, so a stale branch is
  never mistaken for the described code.
- **Every other repo** is cloned next to the main checkout of the repo that holds `kb/`, in a folder
  named like the GitHub repo (`org/acme-api` → `../acme-api`); a worktree finds them there too. Their
  refs are checked at `origin/<branch>`, never the working tree. A change spanning repos updates the
  KB in the PR that merges last, once the other repo's change is on its branch.
- Nothing is fetched: `git fetch` yourself when `verify` shows a stale repo.
- `"checkout": false`: a repo you only link to (not controlled, not cloned). Its refs are linked
  but not checked.
- `types`: custom entity types, see below.

## Entity files

The file name is the id: `entities/pricing/recommender.md` has id `recommender`. Ids are
kebab-case (`[a-z0-9]+(-[a-z0-9]+)*`) and unique across the whole KB.

A file is JSON frontmatter between `---` lines, then a Markdown body:

```md
---
{
  "type": "container",
  "name": "Recommender",
  "summary": "Turns the latest observed competitor prices into Acme price recommendations.",
  "in": "pricing",
  "reviewed": "2026-09-25",
  "refs": ["api/app/pricing/recommender.py#run_pipeline"],
  "links": [
    { "to": "snowflake", "verb": "writes", "carries": "one recommendation round per run" }
  ]
}
---
Runs when [[scrape-cron]] calls it after a scrape round. The cheapest-carrier rule is in
[the pipeline](ref:api/app/pricing/recommender.py#cheapest_carrier).
```

### Common fields

| field      | required            | meaning                                                                   |
|------------|---------------------|---------------------------------------------------------------------------|
| `type`     | yes                 | one of the types below                                                    |
| `name`     | yes                 | display name                                                              |
| `summary`  | yes                 | one sentence: what it is and why it exists                                |
| `in`       | yes, except project | parent entity id; its type must be allowed by this type's `parents`       |
| `reviewed` | yes                 | `YYYY-MM-DD` on which the claims were last confirmed against code or by the owner |
| `refs`     | no                  | array of refs: the evidence for this entity                               |
| `links`    | no                  | array of `{ "to", "verb", "carries" }`: what this entity sends or does to another |

Unknown fields are errors.

### Core types

| type        | parents                     | evidence | extra fields |
|-------------|-----------------------------|----------|--------------|
| `project`   | (root, exactly one)         |          |              |
| `system`    | project                     |          |              |
| `actor`     | project, system             |          |              |
| `external`  | project, system             |          |              |
| `container` | project, system, container  | yes      |              |
| `store`     | project, system             |          |              |
| `flow`      | project, system, container  | yes      | `involves` (ids, required): the parts the journey passes through |
| `runbook`   | project, system, container  | yes      |              |
| `decision`  | project, system, container  |          | `status` (`proposed`\|`accepted`\|`rejected`, required), `date` (required; `"unknown"` when the decision has no datable origin), `supersedes` (id) |
| `term`      | project, system, container  |          |              |

- **system**: a group of parts with its own goal, sharing the project's stakeholders.
- **actor**: a human role. **external**: a system the project uses but does not own.
- **container**: a deployable or scheduled unit (service, app, cron job, worker). Nest a
  container under another one when it is a separately understood part of it (a job inside a service).
- **store**: a database, bucket, queue or table group.
- **flow**: one journey end to end, usually a mermaid sequence diagram plus the rules that matter.
  `involves` names every part it passes through (containers, stores, tables, externals, actors, or
  another system); never a project, flow, runbook, decision or term. Flows are the unit of the map.
- **runbook**: a failure mode or operation: what it looks like, where to look first, what fixes it.
- **decision**: why something is the way it is. Decisions are never deleted. To reverse one,
  write a new decision with `supersedes`; the old one then shows as superseded automatically.
- **term**: a glossary entry. The summary is the definition.

"evidence: yes" means the entity is expected to have refs; verify warns when it has none.

## Refs

A ref is `alias/path[#anchor]`, where path is a file or directory in that repo:

- `api/app/pricing/` — a directory
- `api/app/pricing/recommender.py` — a file
- `api/app/pricing/recommender.py#run_pipeline` — a **symbol anchor**: the first line that defines
  `run_pipeline` (`def`, `class`, `function`, `const`, `CREATE TABLE`, `name =`, ...). A mere
  mention (a comment, an import, a log string) does not count, so a deleted or renamed symbol is an
  error. To point at something that is not a definition, use a line range. The line number is
  computed at render time, so links follow the code.
- In Clojure and EDN files (`.clj`, `.cljs`, `.cljc`, `.bb`, `.edn`) a symbol anchor matches any
  `(def…` form (`defn`, `defn-`, `defonce`, `defmulti`, `defrecord`, `s/def`, ...), past metadata such
  as `^:private`, and the symbol ends at whitespace or a bracket, so `#line` never matches `line!`.
  A **keyword anchor** (`src/app/server.clj#:app/server`) is the `defmethod` with that dispatch
  value, else the first line opening with that keyword as a map key (an Integrant key in an EDN
  config).
- `api/app/pricing/recommender.py#L40` or `#L40-L60` — a literal line range. Prefer symbol anchors;
  line numbers drift.

Anchors cannot contain spaces or `)`. An anchor that cannot be found is an error.

Refs appear in frontmatter `refs` and inline in the body as Markdown links: `[text](ref:alias/path#anchor)`.
Both count as evidence and both are checked.

## Links

`{ "to": "snowflake", "verb": "writes", "carries": "parsed price rows (PRICE_DATA)" }`

A link is a seam: something crosses from this entity to `to`. `verb` is a short present-tense
verb (`calls`, `reads`, `writes`, `triggers`, `uses`, `sends`). `carries` says what crosses; if
you cannot say what crosses, you do not understand the seam yet. Store each link once, on the
entity that acts. Incoming links are derived.

## Body

GitHub-flavoured Markdown, plus:

- `[[id]]` or `[[id|label]]` — link to an entity. Must exist.
- `[text](ref:alias/path#anchor)` — link to code, checked like any ref.
- ` ```mermaid ` fences — diagrams. Use for flows (sequence diagrams) and anything the derived
  map does not show. Inside a fence, `[[id]]` or `[[id|label]]` is an entity link, checked like any
  other: the renderer writes the entity's name (or the label), and a flowchart node whose label is the
  link, `A["[[id]]"]`, opens that entity's page when clicked. So `[[…]]` never means mermaid's
  subroutine shape here. Flowcharts are laid out with ELK. Draw by hand what teaches by what it leaves
  out (a system map, one unit of work across flows, a runbook's triage tree); let the derived maps and
  `kb-lineage` draw what the links already say.
- ` ```kb-list ` fences containing a JSON query — rendered as a table of matching entities:

  ```kb-list
  { "type": "decision", "under": "pricing", "status": "accepted" }
  ```

  `type` filters by type, `under` by ancestor, and any other key by equality with that field of the
  type. All keys are optional; values are strings.
- ` ```kb-lineage ` fences containing `{ "system": "<id>" }` — rendered as the data lineage of that
  system: every entity held in a store that the system's parts link to, plus the stored data those
  entities themselves link to (a view's table), with whatever writes it on its left and whatever reads
  it on its right (a `reads` link draws from the data to the reader; any other
  verb from the actor to the data). Entities outside the system are dashed.

## Views

`views/<id>.md` are custom pages listed in the navigation. Frontmatter is
`{ "title": "...", "order": 10 }` (lower order first). The body works like an entity body, so a view is
usually prose plus `kb-list` tables.

## Custom types

Add types in `kb.config.json` when the core types cannot express a recurring kind of thing:

```json
{
  "id": "table", "label": "Tables", "parents": ["store"], "evidence": false, "shape": "cylinder",
  "fields": { "owner": { "kind": "id" }, "grain": { "kind": "string", "required": true } }
}
```

- `parents`: type ids (core or custom) this type can live under. To let a core type contain the
  new type, the new type lists it; core types' own parents do not change.
- `shape` (for diagrams): `box`, `round`, `stadium`, `cylinder`, `parallelogram`, `subroutine`, `hexagon`.
- field kinds: `string`, `date` (add `"unknown": true` to also accept the value `"unknown"`), `enum` (with `"values": [...]`), `id`, `ids`. `id`/`ids` fields may
  set `"inverse": "label"`: the target then shows `label` and the entity pointing at it.

## Checks

**Errors** (verify fails, render refuses): bad frontmatter, unknown or missing fields, duplicate
ids, unknown `in`/link/wiki-link/id targets, parents of the wrong type, cycles, refs to unknown repos,
missing files or anchors, bad `kb-list` or `kb-lineage` queries.

**Warnings**:
- *suspect*: a ref's file changed on the described branch after the entity's `reviewed` date.
  Re-read the change, fix the claims if needed, then set `reviewed` to today. A commit that also
  changed the entity's own file counts as reviewed with it (the repo holding `kb/` only).
- *unanchored*: an evidence type with no refs.
- *container in no flow*: a container that no flow involves, directly, through an ancestor or through
  a descendant. Either a flow is missing or the container is not a part worth mapping.
- *nothing reads or writes it*: an entity held in a store that no link touches. Its writer and
  readers are missing from the links, so lineage cannot draw it.

## Derived, never stored

Children, incoming links, backlinks, "superseded by", line numbers, staleness, the flows each
entity takes part in, the navigation tree, and the maps.

**The navigation tree** has three fixed levels, whatever the depth of `in`: system → type → entity,
plus a *Shared* node for everything that belongs to no system. An entity belongs to its nearest
system ancestor. A system's type groups also list the entities outside every system that it
*uses*: one of its parts links to them or is linked from them, or one of its flows involves them
(a table under a project-level store appears under each system that reads or writes it). A link between
two systems is not a use: it shows in the Connections of both ends. The tree opens one path: the group
the reader clicked through, else the group where the entity lives. Each
system × type pair has its own page; for used entities it shows how the system touches them.

The maps:

- **A flow's map** draws every entity it involves and the stored links between them. A link whose
  end is a child of an involved entity is drawn on that entity (a link to a table lands on its
  store when only the store is involved); links to parts outside the flow are left out.
- **An entity with flows as children** (usually a system) draws no map: its flows each draw their own,
  and every involved entity lists the flows it takes part in.
- **Any other entity with linked children** gets a map of those children and what they exchange
  with their neighbours. Links deeper in the tree are rolled up to the level being viewed
  (C4-style zoom). A leaf entity with links gets a map of its own neighbours.
