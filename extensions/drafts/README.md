# Drafts

Keep a prompt for later, edit it in the tower, then start a worker on it or type it into one that is running.

## What it adds

### The tower page

**A `drafts` tray in each floor's sidebar**, and a pencil on the floor's sign that opens a new draft. The tray
unfolds to the newest six by their first line, each with the worker that kept it and its age, and `+` for a new one.

| Light | Dark |
| --- | --- |
| ![The lab floor's sign with its pencil, and its drafts tray unfolded](shots/tray-light.png) | ![The lab floor's sign with its pencil, and its drafts tray unfolded](shots/tray-dark.png) |

**The draft editor in the main pane.** The first line names the draft. It saves as you stop typing (⌘S at once), and
a change made on disk while you edit asks you to take theirs or keep yours. **Start session** (⌘⏎) opens the
new-worker form on the draft, which is deleted once a worker starts on it. **Delete** has Undo on its toast.

| Light | Dark |
| --- | --- |
| ![A draft open in the editor](shots/editor-light.png) | ![A draft open in the editor](shots/editor-dark.png) |

**Send to worker…** lists every running worker, its floor first. A pick types the draft into that worker's prompt,
submits it, and deletes the draft.

| Light | Dark |
| --- | --- |
| ![The Send to a worker sheet](shots/send-light.png) | ![The Send to a worker sheet](shots/send-dark.png) |

**Drafts in the palette** (⌘K), found by their title.

| Light | Dark |
| --- | --- |
| ![The palette finding a draft](shots/palette-light.png) | ![The palette finding a draft](shots/palette-dark.png) |

A prompt typed into the new-worker form that closes without starting a worker, or whose start fails, is kept as a
draft.

### Tower 3D

Each floor's drafts are notes on a corkboard on its shared wall, edited in a panel beside the world.

### The workers

Every worker's `tower whoami` lists the collection:

```
  drafts  ·  Drafts  ·  Prompts kept for later: each starts a new session or is typed into a worker, then is deleted.
```

A worker keeps an idea off its goal, or a prompt for later, with `tower keep drafts` (markdown on stdin, its first
line the title). The Week draws none of it.

## Add it

It ships with the tower and is on by default on every floor. Off, the files under `collections/<project>/drafts/` stay
on disk, but nothing edits them.

## What it needs from you

Nothing. A `drafts` entry under the config's `collections` renames it:

```json
"collections": { "drafts": { "label": "Ideas", "description": "Prompts for a rainy day." } }
```

## How it works

Drafts has no server and writes no facts. Each draft is one markdown file, `collections/<project>/drafts/<id>.md`,
and who kept it is the core's `tower.keep` fact. It declares the collection and two views, `editor` (the main pane)
and `tray` (the sidebar row); `client/drafts.ts`, served as `/x/drafts/drafts.js`, is the autosave and conflict
handling over the core's collection verbs, which the tower page imports and Tower 3D bundles.

## Pictures

`npm run tool:extension-shots -- extensions/drafts` retakes them from [`shots.json`](shots.json).
