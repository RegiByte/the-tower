---
{
  "type": "decision",
  "name": "An attribute on a drawn node is drawn into its html, or its node is owned",
  "summary": "The morph makes a kept node's attributes what the new html says, so an attribute that script writes onto a node a view draws is lost on the next redraw: the view renders it into its html, or the node is marked data-owned and given an id. A writer that serves every renderer and can do neither, as pressing's aria-busy and a shown tip's aria-describedby, puts its attribute back after each redraw, only where it is missing.",
  "in": "tower-core",
  "status": "accepted",
  "date": "2026-11-18",
  "reviewed": "2026-11-18",
  "refs": [
    "hub/src/shared/morph.ts#morph",
    "hub/src/shared/press.ts#pressingAs",
    "hub/src/shared/tips.ts#watchTips",
    "hub/docs/extending.md"
  ]
}
---
**Problem.** A view that replaces its html makes new nodes on every redraw, so an attribute script wrote onto a drawn
node went away with the node and was written again on the new one, or didn't matter. The
[`morph`](ref:hub/src/shared/morph.ts#morph) keeps the node and makes its attributes what the new html says: one the
html lacks is removed. Every attribute script writes onto a node a view draws is lost on the next redraw, and nothing
says so: a busy button looks idle, a tucked verb comes back into the row, a shown tip stops being its control's
description.

**Why.** The morph exists to keep what the viewer holds, and it can only do so for a node whose state is in one
place. Html drawn by a pure function is one place; a node someone else fills is the other, and `data-owned` already
names it ([[renderer-shared-modules]]). An attribute written by a third party onto a node the html describes is in
neither, so the morph and the writer take turns overwriting each other. Extension authors draw for the same morph
(`docs/extending.md`), so the rule is theirs too.

**How.** For each attribute script writes on a node inside a morphed root:
- **Draw it.** When the writer also draws the html, it renders the state into the html: what is tucked, what is fresh,
  a slot's `display: contents` in its CSS.
- **Or own the node.** A node script marks or fills at mount is `data-owned` (whole, or `"children"` when the html
  still writes its attributes) and carries an id ([`domId`](ref:hub/src/shared/dom-id.ts#domId)): an owned node with
  no id matches only a new owned node, so a sibling coming or going would cost it its state.
- **A writer of every renderer re-asserts.** One that serves every renderer and knows no view's html can do neither,
  so it watches the attribute and puts it back after a redraw, only where it is missing, so its own write ends its next
  pass: [`pressingAs`](ref:hub/src/shared/press.ts#pressingAs) keeps `aria-busy` on every control a press marks, and
  [`watchTips`](ref:hub/src/shared/tips.ts#watchTips) keeps a shown tip's `aria-describedby` on its control.

Known cases, each fixed in the step that swaps its site onto the morph (the swap order of pass 3b): the tower page's
region writer sets `data-tucked` and the `fresh` class on its controls and `data-region` and `data-subject` on its
slots (`renderers/page/page.js`); the Brief view sets `display: contents` on its region slots (`src/views/brief.ts`);
the floors form sets `disabled` on `[data-unrepo]` (`extensions/floors/client/repos.ts`). The extensions popover's spot
class is already added again on every draw.

**Alternatives considered.**
- *A morph that keeps attributes it didn't draw*: it can't tell an attribute script wrote from one the html dropped
  on purpose, so a state the view stopped drawing would stay forever.
- *An allowlist of attributes the morph leaves alone*: every writer's attribute becomes the morph's knowledge, and an
  extension's own would need a way in. The writer knows its attribute; the morph shouldn't.
- *Every writer re-asserting*: right for the writers of every renderer, but a view that draws the html can say the
  state once, where it is read, instead of a second pass after every draw.

**Impact.** A view swapped onto the morph lists the attributes script writes on its nodes and draws or owns each
before the swap. `pressing` and the tooltip already hold through a morph, checked by `npm run test:morph` and
`test:morph-webkit`.
