---
{
  "type": "system",
  "name": "Bridge",
  "summary": "Everything a renderer needs and nothing it draws: the data model, pure reductions over session logs, and a live store kept current as the host appends.",
  "in": "tower",
  "reviewed": "2026-10-08"
}
---
A renderer subscribes to [[live-system]], reads [[session]]s with their facts from it, and draws. The facts
come from [[log-reductions]], pure folds over the [[system-root]] logs. The types every part shares (config,
log events, the host and terms protocols, how a spawn is composed) are the [[data-model]].

Logic a next renderer would also need belongs here, never in a renderer ([[renderer-is-disposable]]).
The bridge holds no state of its own: restart it freely.
