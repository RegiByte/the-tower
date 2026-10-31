# Tab line

An example extension: a short line under a worker's card, like a named terminal tab. It is the manifest-only form of
the card line: one writable fact and a fold the manifest projects, with no server code. **Name tab** on a worker's
card writes it from the tower page, and a worker writes its own:

```sh
tower x tabline facts/line '{"value": "writing the migration"}'
```

## Add it

Copy this folder anywhere outside the checkout (so `tower update` leaves your copy alone), then add it to the config
by its absolute path:

```json
"extensions": {
  "tabline": { "path": "/abs/path/to/tabline" }
}
```

The tower picks it up without a restart. The line shows in the worker's row in the sidebar, its header, its panel at
its desk in Tower 3D and under it in `tower whoami`.

## What it shows

- `facts.line.writable`: the fact has a door, `POST /tabline/facts/line {session?, value}`. `user` lets a caller with
  no session write any worker's line (it names the `session`); `self` lets a worker write its own (it leaves `session`
  out). The value is checked by the fact's schema; a blank string or `null` clears the line. Each write is one fact
  in the worker's log, and nothing else is stored.
- `folds.card.project.lines`: the card's fold is the newest value of `line` over the worker's lineage, so a resumed
  worker keeps its line. No code runs for it.
- `client/tabline.js`: the one command, offered on every card. It asks for the line and calls the door with
  `tower.call`, as any renderer can; the line it shows is read from the board's `lines`.
