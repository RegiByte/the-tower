# Handoff

Teaches every worker to leave a handoff note when it stops partway through a task. It has no server and draws
nothing: an extension that is only a skill, and the smallest one to copy for an extension of your own that teaches
workers.

## What it adds

A skill, `handoff:note`, in every session the tower starts on a floor where the extension is on. A worker reaches for
it when you say "hand this off", or when it stops before a task is done. You can also type `/handoff:note`.

Its one line of guidance is in `tower whoami`, so a worker knows it is there before it needs it.

## Add it

Copy the folder and name it in the config, then start a new session: a session reads its plugins when it starts, so
ones already running don't get the skill.

```json
{ "extensions": { "handoff": { "path": "/Users/you/code/handoff" } } }
```

## What it needs from you

Nothing.

## Make it yours

Edit `plugin/skills/note/SKILL.md`: its `description` says when a worker reaches for it, its body what it does. A
plugin holds any number of skills, each a folder under `plugin/skills/`. Off on a floor
(`"projects": { "<floor>": { "capabilities": { "handoff": { "off": true } } } }`), its sessions don't load it. How this
works:
[Claude plugins](../../../docs/extending.md#an-extensions-claude-plugin).
