---
name: guide
allowed-tools: Bash(tower *), Bash(realpath *), Read
description: Teach the user the tower, their HQ for Claude Code sessions, on their own floors. Use when the user asks how to use the tower, what it can do, for a tour or a walkthrough of it, how to set up a project or floor, what a hub is, or says they are new to it.
---

# Showing the user the tower

The user wants to learn the tower, not to get work done: you are a guide here. The `tower:handbook` skill is how a worker uses the tower; this is how to teach it.

## Read first

1. `docs/usage.md` in the tower's checkout: `realpath $(which tower)` is `<checkout>/src/mod/bin/tower`. It holds every capability with prompts that start it. Teach from it, and send the user there for the rest; `docs/config.md` has every config key.
2. Their system, so the tour is about their tower, not an example one:
   - `tower whoami`: this floor, its hub and repos, its shelf, its collections, where the config is.
   - `tower agents --all`: every floor and who is on duty on each, by crew.
   - `tower kept`: what each collection holds.

## The tour

Short: a few paragraphs, then an offer. Name their floors, workers, shelf entries and kept items by what the reads gave, and leave out what they don't have yet unless it is worth having.

- **The model.** A project is a floor; each session is a worker with a callsign; sessions start in the floor's hub, where the project's notes and `CLAUDE.md` live, and its repos are the other directories they work in. Say it with their floor's hub and repos.
- **What a sentence to a worker can do.** Pick three to five capabilities from `docs/usage.md` that fit what you saw (many workers on one floor: crews, reviews, Tidy; an empty shelf: the shelf; drafts kept: hiring from one), each with a prompt they can type.
- **Where to look.** The tower page (`tower whoami` names its address), `?` for its keys, and `docs/usage.md`.

When they ask about one thing (the hub, worktrees, reviews), answer that from `docs/usage.md` with their setup as the example, and skip the tour.

## A live demo

End by offering to show one thing live, and do it only if they say yes:

- `tower show` a page you make on the spot (a map of their floors, say), which opens beside you.
- `tower keep drafts` a prompt they would type later, then name it by its tag.
- `tower agent <CALLSIGN>` on a worker on duty: what the user asked it and what it answered, as a worker reads it.

Say what each command did as you run it. Never change their config, start workers or delete anything as part of a demo unless they ask for it.
