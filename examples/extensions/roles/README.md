# Roles

Give each worker a role: a default model and effort, a prompt saying what it is for, and whether it hires or is
consulted. A hire that names no role can take a default one.

## What it adds

### The tower page

**Role in every spawn form**, its choices the roles your settings list, each with its model and effort beside it. The
role's model and effort fill in only where the spawn names none: a model you pick still wins.

**The role as a badge on the worker's card**, in its row in the sidebar and in its header. Tower 3D draws it on the
worker's desk.

### The CLI

`tower x roles advisor` lists the consultable workers on duty on the floor now, oldest first:

```
SAGE-03 (advisor): message as "SAGE-03"
```

or says there is none.

### The workers

A worker in a role reads its role's prompt in its system prompt. Every worker's `tower whoami` carries the guidance:

```
  roles  ·  Name a role on each hire (`tower hire x.roles.role <name>`); `tower x roles advisor` says who to consult.
```

so a coordinator hires with `tower hire x.roles.role reviewer <<'EOF'` … `EOF`.

A worker whose role doesn't hire is refused at `tower hire`:

```
tower: The tower refused spawn: SAGE-03 is in the advisor role, which doesn't hire: propose the work to whoever hires on the floor (roles's gate)
```

The Week draws none of it.

## Add it

Copy this folder anywhere outside the checkout (so `tower update` leaves your copy alone), then add it to the config
by its absolute path, with your roles (below):

```json
"extensions": {
  "roles": { "path": "/abs/path/to/roles", "settings": { … } }
}
```

## What it needs from you

**The roles**, in `settings.roles`: each a name, with an optional `model` and `effort`, `hires` (true unless set) and
`consultable` (false unless set). A floor's `roles` replaces the system's whole.

```json
"settings": {
  "roles": {
    "coordinator": { "model": "opus" },
    "worker":      { "model": "sonnet" },
    "reviewer":    { "model": "sonnet" },
    "advisor":     { "model": "fable", "effort": "high", "hires": false, "consultable": true }
  },
  "hireDefault": "worker"
}
```

**`hireDefault`** is the role of a hire that names none. It is logged on the hire as if the hire had named it, so the
worker keeps it through resumes, and changing `hireDefault` later doesn't change the role of a worker already hired. Without `hireDefault`, a hire that names no role launches exactly as it would without this
extension: no role, and the model your `/model` last set. The user's own spawn never gets a default role: pick one in
the form, or the user's model applies.

If all you want is a sane model on hires and no role prompt, one role is enough:

```json
"settings": { "roles": { "general": { "model": "sonnet" } }, "hireDefault": "general" }
```

**The prompts**, optional: the floor's `roles.prompts` collection, one markdown file per role, named by it
(`advisor.md`). A role with no file runs with only its model and effort. This folder's [`prompts/`](prompts/) holds
starting ones for the four roles above. Copy them in and edit them to your project:

```sh
mkdir -p ~/.tower/collections/<floor>/roles.prompts
cp prompts/*.md ~/.tower/collections/<floor>/roles.prompts/
```

Keep them short: each joins the system prompt of every worker in its role. An edit reaches the next worker started or
resumed.

## How it works

[`server.ts`](server.ts) holds every piece, and each reads a worker's role the same way: its `role` fact.

- **The field**, `spawn.fields.role`, its choices from a floor fold of the settings, logged as `tower.x.roles.role`.
- **`launch`** gives the role's model and effort as `defaults` and its prompt file as `systemPrompt`. On a hire naming
  no role, it returns `fields: { role: hireDefault }`, which the tower logs as the spawn's own field. A role the
  settings don't list refuses a spawn that named it, naming the roles there are. On a hire that named none, a
  `hireDefault` the floor's `roles` doesn't list (a typo, or a floor's `roles` that dropped it) can't refuse: the hire
  starts unroled, on your `/model`, with a `launch` problem on the extension. So the floor carries a badge,
  `No role "<name>"`, for as long as its `hireDefault` names no role it lists. A resume whose logged role was later
  removed from the settings starts the same way, without its role's prompt.
- **The gate**, an answer to `tower/spawn.gate`, refuses a hire whose hirer's role sets `hires: false`. It reads flags,
  never names. It is guidance, not a wall: the gate fails open while roles is down, and a worker's plain `tower spawn`
  carries no hirer, so it isn't weighed.
- **The read** `advisor/<project>` lists the floor's on-duty workers whose role is `consultable`. No advisor's name goes
  in any system prompt, so replacing the advisor mid-day leaves nothing stale.
- **The card fold** puts the role on the card as `x.roles.role` and a badge.

Two extensions both giving `defaults.model` refuse every launch, so don't run roles beside another extension that
sets a default model.

## Make it yours

Your roles and `hireDefault` are settings, and the prompts are your floor's files: rename, drop or add roles freely.
In your copy, reword the gate's refusal in `server.ts`. Its server imports only types from
[the library](../../../docs/extending.md#the-library), and [`tower types .`](../../../docs/extending.md#types-outside-the-checkout)
in your copy types them.
