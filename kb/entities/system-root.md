---
{
  "type": "store",
  "name": "System root",
  "summary": "The directory holding config.json (intent), sessions/<id>.jsonl (facts) and collections/ (files kept for later): the only stored state of the system.",
  "in": "tower",
  "reviewed": "2026-10-09",
  "refs": ["hub/src/shared/paths.ts#systemPaths", "hub/src/checkpoints.ts#foldLog", "hub/src/shared/model.ts#Config", "hub/src/shared/model.ts#LogEvent", "hub/src/collections.ts"]
}
---
`~/.tower/` by default; `TOWER_CONFIG` points at another config, and its directory becomes the root
([`configPath`](ref:hub/src/shared/paths.ts#configPath)). Next to the config live:

- `sessions/<id>.jsonl`: one log per session. A header line ([[session]]'s `SessionHeader`), then
  `[t, code, data]` events, `t` in seconds since `startedAt`: `o` output, `i` input, `r` resize, `h` a hook
  or mod event (named by `hook_event_name`), `x` exit (`hostStopped` when the host's own stop ended it).
  `sessions/<id>.jsonl.gz`: a log Tidy archived, gzipped in place once its worker ended more than the config's
  `retention.days` ago, read the same as the plain log ([[log-retention]]).
- `collections/<project>/<collection>/<item>`: the files of each project's [[collections]], any format, written
  by the tower ([`src/collections.ts`](ref:hub/src/collections.ts)), by sessions or by hand. Dot files are the
  store's staging files and are never items. The `reviews` collection's threads are written only by the
  tower's `review/append` ([[review-threads]]).
- `control.sock`, `hooks.sock` ([[host-daemon]]) and `terms.sock` ([[terms-daemon]]).
- `host.log`, `terms.log`: what the daemons print when `tower up` starts them.
- `cache/`: what is computed from the stored state and kept to skip computing it again, never authoritative and
  safe to delete at any time: `cache/facts/<id>.v8`, each log's fold checkpoint ([[fold-checkpoints]]). Not a
  fourth kind of stored state: deleting it changes nothing but speed.
- `host.pid`, `terms.pid`: the pids `tower up` started, so `tower down` can stop them; gone once stopped. A fact
  about running processes, not about sessions.

The config is read fresh on every spawn and every tower request, so edits apply without restarts.
