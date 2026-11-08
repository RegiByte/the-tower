---
{
  "type": "store",
  "name": "System root",
  "summary": "The directory holding config.json (intent), the logs (facts: sessions/<id>.jsonl by the host, jobs/ by the jobs daemon, streams/ by the tower) and collections/ (files kept for later): the only stored state of the system.",
  "in": "tower",
  "reviewed": "2026-11-08",
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
  ([`systemStreamsPath`](ref:hub/src/shared/paths.ts#systemStreamsPath)): an extension's streams, `<cap>.<name>`,
  appended only through its ctx ([[extensions]]). A built-in that moved into an extension keeps its old folder
  ([`streamFolder`](ref:hub/src/shared/extensions.ts#streamFolder)): the quota extension's reads are in `probe.quota`
  ([[probes]]), a project's policies' runs and approvals in `runs` and `approvals` ([[policies]]). Every stream is appended the same way
  ([`src/streams.ts`](ref:hub/src/streams.ts)) and read the same way ([`src/bridge/streams.ts`](ref:hub/src/bridge/streams.ts)).
  Logs like the session logs, not a fourth kind of state ([[logs-are-facts]]).
- `jobs/YYYY-MM.jsonl`: the jobs log, in the streams' format (stream `jobs`), written only by the [[jobs-daemon]]:
  each job's `started`, `cancelled` and `ended`, never its output or env ([[jobs-own-daemon]]).
- `collections/<project>/<collection>/<item>`: each project's [[collections]], any format, written by the tower
  ([`src/collections.ts`](ref:hub/src/collections.ts)), by sessions or by hand. Dot files are staging files, never
  items. A collection an extension owns is written only by that extension ([[extensions]]): a `reviews` thread only
  through the reviews extension's `reviews/append` ([[review-threads]]).
- `cache/`: computed and kept to skip computing it again, never authoritative, safe to delete:
  `cache/facts/<id>.v8`, each log's fold checkpoint ([[fold-checkpoints]]); `cache/types/<API_VERSION>-<hash>/`, the
  declarations `tower types` copies out, one version of the code at a time ([[library]]).
- `control.sock`, `hooks.sock` ([[host-daemon]]), `terms.sock` ([[terms-daemon]]) and `jobs.sock` ([[jobs-daemon]]).
- `host.log`, `terms.log`, `jobs.log`, `tower.log` and `host.pid`, `terms.pid`, `jobs.pid`, `tower.pid`: what the daemons print, each line dated by [`dated-log`](ref:hub/src/dated-log.ts) from the daemon's next start, and their
  pids, written when `tower up` starts them; `tower down` removes the pids.

The config is read fresh by the host on every spawn and by the tower on every read of it, so edits apply without
restarts.
