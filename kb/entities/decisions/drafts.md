---
{
  "type": "decision",
  "name": "Drafts: unsent prompts are the third stored state",
  "summary": "A draft is a prompt not yet sent, one markdown file per draft under drafts/<project>/ in the system root. Sending one starts or feeds a session and deletes the file; the session log then holds the prompt.",
  "in": "tower",
  "status": "rejected",
  "date": "2026-10-04",
  "reviewed": "2026-10-09",
  "refs": ["hub/src/shared/launch.ts#Launch"]
}
---
**Problem.** The user runs one code-writing session at a time. While it works, the next prompts live in their head,
and long ones need thinking through before they are sent.

**Why.** Keeping the next thing to say is useful and not a workflow. A queue would be: order, dispatch and
status are task management, which the tower does not impose.

**How.**
- A draft is `drafts/<project>/<name>.md` beside the config: editable in any editor, never inside a repo.
- Floors on the board carry their drafts; a floor offers `draft`, a draft offers send, edit and discard.
- Send to an empty desk is a spawn with [`Launch.prompt`](ref:hub/src/shared/launch.ts#Launch); send to an idle
  worker is a bracketed paste and Enter. Either way the file is deleted: what was sent is a fact in the log.
- This amends [[logs-are-facts]]: the stored state is the config (intent), the logs (facts) and the drafts
  (unsent words).

**Alternatives considered.**
- A per-project queue in the config: long multi-line prompts in hand-edited JSON, mixed with structure.
- A folder in the project's hub: versioned, but writes into repos the tower does not own.
- Agent-office's queue (stored status, a dispatcher seating up to three workers, PR linking): the depth of task
  management the tower avoids.

**Impact.** A new watched directory in the live system, draft verbs on the API, a wall of notes in Tower 3D
with carrying, and a sidebar list in the tower page. Agents can later pin follow-up drafts through the tower:handbook skill.

**Outcome.** Never built: [[collections]] keeps the files, and drafts became a renderer's feature over them.
