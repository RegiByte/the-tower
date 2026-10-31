# Grid

Up to four workers side by side in the tower page's main pane, each with its own tabs, so you can watch and type into
several at once.

## What it adds

### The tower page

**Open Grid on each floor** in the sidebar, and in the palette. ⌘⇧G opens the grid of the floor you are on, or of
the worker you are looking at. Opened on the skyline, from the palette or with ⌘⇧G, the grid holds workers of every
floor.

| Light | Dark |
| --- | --- |
| ![Open Grid under a floor](shots/floor-light.png) | ![Open Grid under a floor](shots/floor-dark.png) |

**The grid in the main pane**: up to four of the floor's workers, two side by side, three as two over one, four as
four squares. Each cell is the worker's own view at cell size, its head over its tabs, its terminal typed into when
the cell has focus. **Open** opens the worker on its own; ✕ takes it out of the grid. A reload, a link or Back opens
the grid as it was.

| Light | Dark |
| --- | --- |
| ![Four workers in the grid](shots/grid-light.png) | ![Four workers in the grid](shots/grid-dark.png) |

**The callsign's menu swaps the worker in a cell** for another of the floor's workers on duty. One already in a cell
swaps places with it.

| Light | Dark |
| --- | --- |
| ![Swapping a cell's worker](shots/pick-light.png) | ![Swapping a cell's worker](shots/pick-dark.png) |

**Add worker**, while the grid has fewer than four cells, lists the floor's workers on duty that are in no cell: the
one picked takes a new cell.

| Light | Dark |
| --- | --- |
| ![The Add worker menu](shots/add-light.png) | ![The Add worker menu](shots/add-dark.png) |

**Hide heads** shrinks each cell's head to one row of its lamp, callsign and tabs, for more terminal; **Show heads**
brings them back. Each cell keeps its tab and scroll either way.

| Light | Dark |
| --- | --- |
| ![The grid with heads hidden](shots/headless-light.png) | ![The grid with heads hidden](shots/headless-dark.png) |

**Add to grid on every worker's head** (and in the palette) puts it in its floor's grid, opening the grid if it is
closed. With four cells already, it takes the place of the first.

| Light | Dark |
| --- | --- |
| ![Add to grid on a worker's head](shots/add-to-grid-light.png) | ![Add to grid on a worker's head](shots/add-to-grid-dark.png) |

Tower 3D, The Week, the CLI and the workers have none of it.

## Add it

Copy this folder anywhere outside the checkout (so `tower update` leaves your copy alone), then add it to the config
by its absolute path:

```json
"extensions": {
  "grid": { "path": "/abs/path/to/grid" }
}
```

The tower picks it up without a restart.

## What it needs from you

Nothing. Its chord is the config's to change: `"keys": { "grid/grid": ["Meta+Shift+K"] }`.

## How it works

Grid is client code only, a view, a region and a command. Each cell is the region `card.cell`, which the tower fills
with the worker's own view at `cell` scale; the grid draws nothing in a cell itself, but hands the worker's head its
Open and ✕ (`acts`) and the swap menu (`pick`). Which workers fill the cells, and whether heads show, are the view's
own state, kept in `tower.store`.

## Make it yours

In your copy, `client/grid.js` holds it all: `MAX` and `STYLE` for how many cells and how they sit, `ACTS` for what a
cell's head offers, `seed` for which workers a new grid opens with.

## Pictures

`npm run tool:extension-shots -- examples/extensions/grid` retakes them from [`shots.json`](shots.json).
