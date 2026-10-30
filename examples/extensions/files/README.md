# Files

An example extension: a **Files** tab on every worker, its checkout as a tree beside a file opened from it. The tree
is the worker's own checkout, its worktree in each of the floor's repos (or the floor's main checkouts for a worker
working there), each repo a root. What git ignores is dimmed and what git sees changed is marked: `M` modified, `A`
added, `D` deleted, `R` renamed, `U` untracked, `C` in conflict, and a dot on a folder holding any. The tab's tally
is how many files the worker changed. A file opens read-only beside the tree, with buttons that reveal it in Finder
and open it in your editor. Code is highlighted as VS Code draws it, by [Shiki](https://shiki.style) with VS Code's
TextMate grammars and its Light+ and Dark+ themes, following your scheme. Markdown, images, video and html pages are
drawn by the tower's own views by type, or by any view of yours that takes their type over.

## Add it

It runs in place, from the tower's checkout, so `tower update` brings it with the tower it works with:

```json
"extensions": {
  "files": { "path": "<the tower's checkout>/examples/extensions/files" }
}
```

`realpath $(which tower)` is `<the tower's checkout>/src/mod/bin/tower`. `tower extensions check <that folder>`
reads it as the tower would. A copy elsewhere needs the checkout beside it: its server imports the tower's own
helpers, and its client imports Shiki from the tower's `node_modules`.

## How it works

- **A view on `card`, `files/explorer`**, a tab in the worker's tabs (`card.panes`) and in a grid's cell. In a room
  under 40rem wide (a cell) the tree and the file take turns, `‹ Files` going back to the tree.
- **Reads, each confined to the worker's checkout**, which the server finds on the board (`checkoutDirs` of the card's
  floor and checkout): `files/repos/<project>/<id>` its repos, `files/tree/<project>/<id>?repo&path` one folder (2000
  entries at most), `files/status/<project>/<id>` git's marks and a stamp that changes with them,
  `files/stat/<project>/<id>?repo&path` one file's size, change time and media type (a file of an unknown kind with no
  NUL byte in its first 8 KB is `text/plain`), and `files/raw/<project>/<id>/<repo>/<file...>` the file itself, a read
  that serves a file (`"serves": "file"`), sandboxed as a file a worker shows. A path is resolved through its links and
  refused (`refused`) when it is absolute, inside `.git`, or ends up outside the repo it names: `..`, or a link out
  (the links a worktree's cut makes into the main checkout included). The tree lists a link out as a row that says it
  points outside the checkout, never opened: following the floor's configured link targets is a known limit, for a
  later version. Files over 50 MB are not served.
- **A file opened is a `file` subject**, `file:<card>/<repo>/<path>`, handed to `file.open`, a region the explorer
  declares. The view its type picks draws it. The region's default layout (`regions.file.open.layout`) puts
  `files/code` first for code; a config line takes it back, or puts a view of yours there:

  ```json
  "renderers": { "page": { "layout": { "file.open": { "order": ["mine/code"] } } } }
  ```

- **`files/code`**, a view on `file` for code and plain text: the first 1 MB of the file, highlighted up to 5000
  lines, plain past them. Each grammar is a module of its own under `client/langs/`, imported the first time a file of
  its language opens; the highlighter, its JavaScript regex engine and the two themes are about 350 KB as served, and
  a grammar from 3 KB (JSON) to 180 KB (TypeScript). Add a language with a file `client/langs/<id>.ts` re-exporting
  `shiki/langs/<id>.mjs` and a line in `code.ts`'s maps.
- **Live while seen.** While the tab is visible it reads the status every 2 s, one read at a time, and waits four
  times as long as a read took when git is slow (30 s at most): one `git status` per repo of the checkout and one
  `stat` of the open file per round. A changed status lists the open folders again; a changed file is drawn again.
  A hidden tab reads nothing.
- **View state** (the folders open and the file open, per worker) is the view's own (`ctx.state`), so the tab opens
  as it was left.

Editing is out on purpose: a worker owns its checkout.
