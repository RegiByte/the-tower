---
{
  "type": "store",
  "name": "System root",
  "summary": "The directory holding config.json (intent), the logs (facts: sessions/<id>.jsonl by the host, streams/ by the tower) and collections/ (files kept for later): the only stored state of the system.",
  "in": "tower",
  "reviewed": "2026-10-27",
  "refs": ["hub/src/shared/paths.ts#systemPaths", "hub/src/shared/paths.ts#systemStreamsPath", "hub/src/checkpoints.ts#foldLog", "hub/src/shared/model.ts#Config", "hub/src/shared/model.ts#LogEvent", "hub/src/collections.ts", "hub/src/shared/paths.ts#configPath"]
}
---
`~/.tower/` by default; `TOWER_CONFIG` names another config, and its directory becomes the root
([`configPath`](ref:hub/src/shared/paths.ts#configPath)). Next to the config live:

- `sessions/<id>.jsonl`: one log per session, written by the host. A header line ([[session]]'s `SessionHeader`,
  its `runtime` absent from an older host's logs, which are Claude's), then `[t, code, data]` events, `t` in seconds
  since `startedAt`: `o` output, `i` input, `r` resize, `h` a hook or mod event (named by `hook_event_name`), `x` exit
  (`signal` when one it didn't catch ended it, `hostStopped` when the host's own stop did).
  `<id>.jsonl.gz` is a log Tidy archived, read as the plain log ([[log-retention]]).
- `streams/system/<stream>/YYYY-MM.jsonl` and `streams/projects/<project>/<stream>/YYYY-MM.jsonl`: facts the tower
  observes that belong to no session, one file per UTC month, written only by the tower
  ([`systemStreamsPath`](ref:hub/src/shared/paths.ts#systemStreamsPath)): the quota probe's reads
  (`probe.quota`, [[probes]]), a project's policies' `runs` and `approvals` ([[policies]]), and an extension's
  streams, `<cap>.<name>`, appended only through its ctx ([[extensions]]). Logs like the session logs, not a fourth
  kind of state ([[logs-are-facts]]).
- `collections/<project>/<collection>/<item>`: each project's [[collections]], any format, written by the tower
  ([`src/collections.ts`](ref:hub/src/collections.ts)), by sessions or by hand. Dot files are staging files, never
  items. A `reviews` thread is written only by the tower's `review/append` ([[review-threads]]); a collection an
  extension owns, only by that extension ([[extensions]]).
- `cache/`: computed and kept to skip computing it again, never authoritative, safe to delete:
  `cache/facts/<id>.v8`, each log's fold checkpoint ([[fold-checkpoints]]).
- `control.sock`, `hooks.sock` ([[host-daemon]]) and `terms.sock` ([[terms-daemon]]).
- `host.log`, `terms.log`, `tower.log` and `host.pid`, `terms.pid`, `tower.pid`: what the daemons print and their
  pids, written when `tower up` starts them; `tower down` removes the pids.

The config is read fresh by the host on every spawn and by the tower on every read of it, so edits apply without
restarts.
