# Start a worker

```json
{ "keywords": ["worker", "session", "spawn", "new", "claude", "callsign", "floor", "start"], "category": "Getting around", "order": 2 }
```

A **worker** is a Claude Code session the tower runs, with a callsign of its own (HOLMES-42). Every worker belongs to a **floor**, which is a project: the directory its workers start in, and the repos they work in.

Start one with **+** on a floor in the sidebar, or from the palette (⌘K, then "new worker"). The form asks for its first prompt and where it works: by default a git worktree of its own, so workers in parallel never touch each other's files.

Once it runs, you can:

- **type** into its terminal, as in any Claude Code session;
- read its **Brief** tab, its prompts and answers as a chat;
- see its **Changes**, what it changed in the floor's repos.

A worker that asks something, or finishes a turn you haven't answered, **waits on you**: `N` goes to the next one.

**Try it:** ask a worker "what can you do in this tower?"
