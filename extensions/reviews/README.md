# Review threads

Talk about a worker's work before it lands, on one thread of notes per checkout, and hire a reviewer that reads the
diff and leaves its notes there.

## What it adds

### The tower page

**Review and a Reviews tab on every worker.** Review hires a reviewer of the worker's unlanded work. The Reviews tab
holds the thread of its checkout, its tally the notes the worker hasn't seen, else how many notes the thread holds.
Review isn't offered on a worker with no conversation yet, on a reviewer, or where the work has landed, its
checkout is gone, or a dir of its floor isn't a git repo.

| Light | Dark |
| --- | --- |
| ![A worker's head with Review and the Reviews tab](shots/card-light.png) | ![A worker's head with Review and the Reviews tab](shots/card-dark.png) |

**The thread, in the Reviews tab.** Each note with its author, time and number, the lines it quotes (each with
"changed since" or "no longer in the diff" once the worker's changes moved under it, nothing while it still reads
there), **reply** and **resolve**, the notes new to the worker marked "new" and resolved ones dimmed. **Send to** types
a pointer to the new notes into the worker you pick, and the box at the end adds a note on the checkout as a whole,
signed with your name (`user.name` in the config, else `user`).

| Light | Dark |
| --- | --- |
| ![The thread of main, four notes, one resolved](shots/thread-light.png) | ![The thread of main, four notes, one resolved](shots/thread-dark.png) |

**A note on lines in the Changes tab.** Click a line number (drag or ⇧-click for more, within a hunk) and write a note
under it; it is added to the thread quoting those lines. Lines a note is about are marked beside their numbers, "noted
in n4" on hover.

| Light | Dark |
| --- | --- |
| ![A note being written under line 6](shots/composer-light.png) | ![A note being written under line 6](shots/composer-dark.png) |

**In the sidebar**, a reviewer stands under the worker it reviews, "reviews" its author on its card, and a floor's
row of trays holds its threads: each open thread by its checkout, opened in its worker's Reviews tab while one works
there, else as the kept item, then the threads Tidy filed once their work landed, folded.

| Light | Dark |
| --- | --- |
| ![A worker, its reviewer under it, and the floor's threads](shots/sidebar-light.png) | ![A worker, its reviewer under it, and the floor's threads](shots/sidebar-dark.png) |

Review is also in the palette (⌘K) on the selected worker, and **Tidy** lists each landed thread as one to file.

### The workers

The tower command's `thread`, `note`, `send` and `review` are its words. `tower thread` prints the thread of the
worker's checkout (a reviewer's is its author's) and what is new to it:

````
## user · 2026-10-31 13:38 · n4
`lab:src/rates.js:1-3`
```js
export function convert(amount, rate) {
  return amount * rate
}
```
What should a negative rate do? Refuse it, I think.

(~/.tower/collections/lab/reviews/main.md) New to you since your last note: n3, n4.
````

The whole of it is in [`shots/thread.txt`](shots/thread.txt). A worker writes on its thread with

```sh
echo "Rounding now happens once, after the last conversion." | tower note re n1
echo "Refused below zero." | tower note lab:src/rates.js:1-3
tower note resolve n4
tower review GAGARIN-40 tell
```

`tower note` quotes each anchor's lines from the checkout's files as they are now; `tower review <CALLSIGN> tell` hires
a reviewer that sends its notes to that worker when done (without `tell` they wait on the thread for you). The mod's
`tower:review` skill is what a reviewer starts on, and the handbook (`tower:handbook`) teaches every worker the thread:
answer each note with `re n<k>`, then report to whoever hired it.

Tower 3D draws the threads too: a pigeonhole with a slot per thread and a sheet per note, a reviewer beside its author
with a notebook, notes new to a worker on its desk, and a Reviews tab in the desk panel. There is no picture of it
here. The Week draws none of it.

## Add it

It ships with the tower and is on by default. To turn it off everywhere:

```json
"extensions": { "reviews": { "off": true } }
```

or on one floor, in its project: `"capabilities": { "reviews": { "off": true } }`. Where it is off, the threads stay
where they are, a plain collection read in its tray, and nothing deletes them; but nobody can add to them (`tower
thread`, `note`, `send` and `review` say "reviews doesn't run"), workers lose Review and the Reviews tab, Tidy files
no landed thread, and discarding a worktree that never landed is refused, since nothing would record its tips.

## What it needs from you

**Nothing.** It has no settings. What it reads:

- `user.name` in the config signs the notes you write on the page (`"user": { "name": "Ada" }`); unset, they are
  signed `user`. Workers sign with their callsigns.
- A `reviews` entry in the config's collections overrides the collection's `label` and `description`, nothing else:

  ```json
  "collections": { "reviews": { "label": "Threads", "description": "Notes on unlanded work." } }
  ```

A reviewer works in a worktree of its own, so Review needs the floor's dirs to be git repos the tower can cut
worktrees in.

## How it works

A thread is one append-only markdown file per checkout, `collections/<project>/reviews/<checkout>.md`, its notes as
`## <author> · <time> · n<k>` headings, each anchor a `` `repo:path:from-to` `` line and its quote as a fenced block.
Only the extension writes it; every reader parses it.

- `extension.json`: the owned `reviews` collection, its doors (listed by `history/<project>`, created by `append`,
  edited only by `resolve`, never deleted). Three verbs: `append` (a note, numbered one past the last, made on the
  first), `resolve` (a note whose body opens `**Resolved:** n3, n4`, so resolving stays append-only) and `hire` (a
  spawn in a fork of the author's checkout, uncommitted work included, started on `/tower:review`). Three reads:
  `history/<project>` (every thread, live and filed), `said/<project>` (what the CLI prints of a thread to a reader)
  and `anchors/<project>` (where each quote stands among the worker's changes). Its `of` fact and spawn field,
  logged at a reviewer's spawn. Card and floor folds, and three views: `thread` (the Reviews tab), `composer` (a
  note on picked lines) and `tray` (the floor's threads).
- `server.ts`: the verbs, appends queued one after another so numbers never collide; the card fold puts `x.reviews`
  on each card (its thread's checkout, where that work stands, its unseen notes, the Review action, a mark per
  anchor), the floor fold `x.reviews.threads` and a Tidy entry per landed thread. Its launch contributor puts
  a reviewer in its author's crew (`tower.reports-to`) and out of the floor's hiring limits (`tower.exempt`). It
  answers three of the core's hooks: `tidy.apply` files a landed thread as `<checkout>@<time>.md`,
  `discard.record` notes a discarded worktree's branches and tips on its thread before anything goes, and
  `discard.done` files that thread once it is gone.
- `threads.ts` and `filing.ts`: the folds' pure parts, where a thread stands from the core's checkouts, and the Tidy
  entries and the discard note.
- `client/reviews.ts`: the thread's format, parsed and printed, shared by the server, the views, the CLI and Tower 3D
  (`/x/reviews/reviews.js`). `client/panel.ts` draws a thread, `client/thread.ts`, `composer.ts` and `tray.ts` are the
  views, `client/anchors.ts` the marks.

It writes no log facts of its own but `of`; everything about a thread is its file, and where its work stands is read
from the core's reading of git.

## Make it yours

- **How a reviewer reviews**: the `tower:review` skill, `src/mod/skills/review/SKILL.md`, and the prompt it starts on,
  `reviewPrompt` in `client/reviews.ts`.
- **How a thread is drawn**: `client/panel.ts`, and the tab's tally in `client/thread.ts`.
- **What Tidy says of a landed thread**: `tidyEntries` in `filing.ts`.
- **What the collection is called**: its `label` and `description` in the config's `collections.reviews`.

## Pictures

`npm run tool:extension-shots -- extensions/reviews` retakes them from the scenes in [`shots.json`](shots.json), on a
thread `shots/seed/thread.sh` writes.
