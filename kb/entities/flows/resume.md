---
{
  "type": "flow",
  "name": "Resume",
  "summary": "A new session continues one of the conversations an earlier session saved; which session resumes which is derived from Claude's session_id, never stored.",
  "in": "tower",
  "reviewed": "2026-10-08",
  "involves": ["operator", "tower-server", "host-daemon", "claude-code", "system-root", "log-reductions"],
  "refs": ["hub/src/shared/launch.ts#resumeRequest", "hub/src/tower/server.ts#resume", "hub/src/bridge/conversation.ts#conversationsAfter", "hub/src/bridge/chains.ts#resumes", "hub/src/bridge/chains.ts#resumedBy", "hub/src/bridge/chains.ts#continues", "hub/src/bridge/chains.ts#lineage", "hub/src/bridge/chains.ts#resumeName", "hub/src/worktrees.ts#briefFor"]
}
---
```mermaid
sequenceDiagram
  participant O as [[operator]]
  participant T as [[tower-server]]
  participant F as [[log-reductions]]
  participant H as [[host-daemon]]
  participant C as [[claude-code]]
  participant R as [[system-root]]
  O->>T: GET /conversations/<id>
  T->>F: briefOf(session): every saved conversation of its worker's sessions, latest prompt and answer, last turns
  O->>T: resume {id, conversation}
  T->>T: refuse unless the session saved that conversation, and as lost if its worktree is gone
  T->>H: spawn {new id, same project, same cwd, args: --name <worker's callsign> --resume <conversation>}
  H->>C: new PTY
  H->>R: new sessions/<id>.jsonl
  C->>H: SessionStart {source: resume, session_id: <conversation>}
  H->>R: h event
  R-->>F: the new session holds the conversation as resumed: chain derived
```

- **A session is a worker; a conversation is Claude's.** A session holds one or more [[conversation]]s, a
  new one after each `/clear`. Only a saved one (it got a prompt, or was itself resumed) can be resumed.
- **Same directory.** Claude files conversations by directory, so the resume runs in the source's `cwd`
  under the same project ([`resumeRequest`](ref:hub/src/shared/launch.ts#resumeRequest)). In a [[worktree]] the
  directories follow from `cwd` and the worktree line of the system prompt is composed again, with the branch read
  from git then ([`briefFor`](ref:hub/src/worktrees.ts#briefFor)). If any of its folders is gone, the resume is
  refused as `lost` until the worktree is recut. A fork resumes in the same `cwd`, so it shares its parent's worktree.
- **The chain is derived.** [`resumes`](ref:hub/src/bridge/chains.ts#resumes) links a resumed conversation
  to the nearest earlier session that saved it; [`resumedBy`](ref:hub/src/bridge/chains.ts#resumedBy) to the
  nearest later one that resumed it. A conversation resumed twice from one session forks; each link is to the
  nearest session in time, and names it with its worker's callsign (`{id, callsign}`, a `SessionRef`) on the board
  and in the brief, so no reader looks the session up.
- **What carries over.** A resumed session that has no prompt or answer yet shows its source's. A worker's brief
  holds the conversations of every session it ran as, the earlier ones folded ([[brief-turns]]), and `card.lineage`
  lists those sessions.
- **Same worker, or a fork.** A session whose first conversation resumes its source's latest saved one
  [`continues`](ref:hub/src/bridge/chains.ts#continues) it: the board gives it the source's [[callsign]] and
  showings ([[agent-show]]), and the source's card names it `continuedBy` (`{id, callsign}`). A resume of an earlier conversation
  (one before a `/clear`) forks a new worker. The resume runs Claude under the name that follows
  ([`resumeName`](ref:hub/src/bridge/chains.ts#resumeName)), so its peer name stays the callsign.
- **Mid-turn cut-offs** resume idle: the user says "continue". `tower resume <id>` resumes the latest saved
  conversation.
