# Grid

An example extension: a **view** in the tower page's main pane. **Open Grid** on a floor (its section in the sidebar,
or the palette) or ⌘⇧G draws up to four of that floor's workers side by side, each with its own tabs (Terminal,
Brief, Changes, Reviews, what it showed), its terminal typed into when focused. **Add to grid** on a worker puts it in its floor's grid. Opened from the palette on the skyline, the board's
grid takes workers of every floor. It is client code only, a view and a command and no server: copy the folder and
make it yours.

## Add it

Copy this folder anywhere outside the checkout, then add it to the config by its absolute path:

```json
"extensions": {
  "grid": { "path": "/abs/path/to/grid" }
}
```

`tower extensions check /abs/path/to/grid` reads it as the tower would.

## What it shows

- A view is a module's export, `mount(host, ctx)`, which draws into `host` and returns `{ update, show, close }`
  (`docs/extending.md`, Views). The tower page mounts it at a location, `#v/grid/grid/floor%3A<project>`, so a reload,
  a link and Back keep it.
- Each cell is a region the grid declares, `card.cell` (the manifest's `regions`), asked of the kit on its worker:
  `kit.region(el, 'card.cell', card, { 'tower/card': { head } })`. The tower mounts the worker's own view there at cell
  scale, its tabs and, unless `head` is false, its head; the grid updates the region on each board and closes it as
  the cell goes. Above it, the grid draws a strip of its own: whose cell it is, Open and ✕.
- Which workers fill the cells, and whether each cell shows its head, is the view's own state (`ctx.state`, kept in
  `tower.store`), so the grid reloads as it was.
- **Add to grid** is `kit.display(card, { view: 'grid/grid' })`: the open grid is handed the card (`show`), or its
  floor's grid opens and is then handed it.
- The ⌘⇧G chord is the manifest's `keys`; the config's `keys."grid/grid"` replaces it.
