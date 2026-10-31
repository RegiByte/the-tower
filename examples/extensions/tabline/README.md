# Tab line

A few words under a worker's card saying what it is on, like a named terminal tab: written by you or by the worker.

## What it adds

### The tower page

**The line in the worker's row in the sidebar**, under its callsign and status.

| Light | Dark |
| --- | --- |
| ![A worker's row with its tab line](shots/row-light.png) | ![A worker's row with its tab line](shots/row-dark.png) |

**The line in the worker's head**, beside where it works, and **Name tab** among its buttons.

| Light | Dark |
| --- | --- |
| ![A worker's head with its tab line and Name tab](shots/head-light.png) | ![A worker's head with its tab line and Name tab](shots/head-dark.png) |

**Name tab** asks for the line in a small dialog, filled with the line as it is. Save writes it; an empty line clears
it. Name tab is also in the palette, on every worker.

| Light | Dark |
| --- | --- |
| ![The Name tab dialog](shots/name-tab-light.png) | ![The Name tab dialog](shots/name-tab-dark.png) |

### Tower 3D

The line in the head of a worker's desk panel. Tower 3D offers no Name tab: it imports no client modules.

![A desk panel with its tab line](shots/desk-dark.png)

### The workers

A worker's `tower whoami` carries its own line under who it is, and tab line's one-line guidance:

```
You are MARCO-06, session <id>, a worker on lab (floor "lab").
Your Claude session name is not known to the tower yet.
writing the migration
  tabline  ·  Set a short line under your card saying what you are on, when that changes.
```

`tower x tabline` prints the whole guidance: set the line when a task starts or changes, keep it short and plain,
clear it when idle, and leave a line the user set unless the task changed. A worker writes its own with

```sh
tower x tabline facts/line '{"value": "writing the migration"}'
```

and clears it with `'{"value": null}'`.

The Week and the CLI's other commands (`tower agents`, `tower sessions`) don't show the line. It is on each worker's
card (`adds["card:<id>"].lines`) for any renderer to draw.

## Add it

Copy this folder anywhere outside the checkout (so `tower update` leaves your copy alone), then add it to the config
by its absolute path:

```json
"extensions": {
  "tabline": { "path": "/abs/path/to/tabline" }
}
```

The tower picks it up without a restart. `tower extensions` lists it as started, and `tower extensions check
/abs/path/to/tabline` reads it as the tower would.

## What it needs from you

Nothing: it has no settings and runs no command. What workers are told about their line is tab line's guidance,
which you can change for your workers in the config, `extensions.tabline.guidance`: `brief` and `full` replace its
own, `also` adds to it ("set it only when the user asks").

## How it works

Tab line is the manifest-only form of a card line: one writable fact and a fold the manifest declares, with no
server code.

- `extension.json`
  - `facts.line`: the line, a string of at most 80 characters, checked by the fact's schema. `writable: ["user",
    "self"]` gives it a door, `POST /tabline/facts/line {session?, value}`: `user` lets a caller with no session write
    any worker's line (it names the `session`), as [Name tab](#the-tower-page) does; `self` lets a worker write its
    own (it leaves `session` out), as [`tower x tabline facts/line`](#the-workers) does. Each write is one fact in
    the worker's log, and nothing else is stored. A blank string or `null` clears the line.
  - `folds.card.project.lines`: the card's line is the newest value of `line` over the worker's lineage, so a
    resumed worker keeps its line. No code runs for it: the tower projects the fold from the manifest, and every
    surface above draws the card's `lines`.
  - `guidance`: what it tells the workers.
  - `commands.set`: Name tab, offered on every card.
- `client/tabline.js`: Name tab's code. It asks for the line in a `<dialog>` and writes it through the door with
  `tower.call`, as any renderer can.

## Make it yours

- **What workers write, and when**: `guidance` in `extension.json`, or the config's `extensions.tabline.guidance`.
- **How long a line can be**: `facts.line.schema`, and `maxlength` in `client/tabline.js`'s dialog.
- **Who can write it**: `facts.line.writable`: drop `self` for lines only you set, or `user` for lines only workers
  set.
- **The dialog**: `askLine` in `client/tabline.js`.

## Pictures

`npm run tool:extension-shots -- examples/extensions/tabline` retakes them from the scenes in
[`shots.json`](shots.json); the desk needs Tower 3D built first (`npm run tower3d`).
