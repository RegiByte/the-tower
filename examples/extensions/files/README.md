# Files

A worker's checkout as a tree in its tabs, what git sees changed marked, and any file of it opened beside the tree,
code highlighted as VS Code draws it.

## What it adds

### The tower page

**A Files tab on every worker**, its tally the number of files the worker changed.

| Light | Dark |
| --- | --- |
| ![The Files tab in a worker's tabs](shots/tab-light.png) | ![The Files tab in a worker's tabs](shots/tab-dark.png) |

**The tree and the file open from it.** The tree is the worker's own checkout: its worktree in each of the floor's
repos (or the floor's main checkouts, for a worker working there), each repo a root. What git ignores is dimmed, and
what git sees changed is marked: `M` modified, `A` added, `D` deleted, `R` renamed, `U` untracked, `C` in conflict,
and a dot on a folder holding any. A file opens read-only beside the tree, with buttons that show it in Finder and
open it in your editor. Code and plain text are highlighted by [Shiki](https://shiki.style) with VS Code's TextMate
grammars and its Light+ and Dark+ themes, following your scheme.

| Light | Dark |
| --- | --- |
| ![A changed TypeScript file open beside the tree](shots/code-light.png) | ![A changed TypeScript file open beside the tree](shots/code-dark.png) |

**Markdown, images, video and html pages** open in the tower's own views by type, or in any view of yours that takes
their type over. A relative link in a markdown file opens the file it names in the tree.

| Light | Dark |
| --- | --- |
| ![A README open beside the tree](shots/markdown-light.png) | ![A README open beside the tree](shots/markdown-dark.png) |

The tab follows the checkout while it is seen: a file the worker changes is drawn again, and the marks move. The file
open is in the page's address, so a reload, Back and a copied link land on it. In a [grid](../grid/README.md)'s cell,
the tree and the file take turns.

### The CLI

Every read is on the API, so a worker or a script reads a checkout as the tab does:

```
$ tower x files
files  Files 1.0 · running
  tower x files repos/<project>/<id>  The repos of the worker's checkout, each named as a review anchor names it. (it names the project)
  tower x files tree/<project>/<id>  One folder of a repo of the worker's checkout: folders first, each in name order, what git ignores marked, a link out marked outside; .git never listed. (it names the project)
  tower x files status/<project>/<id>  What git sees changed in each repo of the worker's checkout, a mark by path (M, A, D, R, U untracked, C in conflict; an untracked folder as its path and a slash), and a stamp that changes when any of it does. (it names the project)
  tower x files stat/<project>/<id>  One file of the worker's checkout: its size, when it last changed, its media type (a file of an unknown kind with no NUL in its first 8 KB is text/plain), and its absolute path, for the editor and Finder. (it names the project)
  tower x files raw/<project>/<id>/<repo>/<file...>  One file of the worker's checkout, as written, sandboxed: up to 50 MB. (it names the project)
```

Tower 3D, The Week and the workers' guidance have none of it: Tower 3D imports no client modules, and Files tells the
workers nothing. Editing is out on purpose: a worker owns its checkout.

## Add it

Run it in place, from the tower's checkout, so `tower update` brings it with the tower it works with:

```json
"extensions": {
  "files": { "path": "<the tower's checkout>/examples/extensions/files" }
}
```

`realpath $(which tower)` is `<the tower's checkout>/src/mod/bin/tower`. Or copy the folder anywhere outside the
checkout to make it your own, run `npm install` in the copy (its `package.json` names Shiki, which the code view
imports), and add it by the copy's absolute path. Its server imports the tower's helpers by name (`tower:media.js`,
`tower:repos.js`), so a copy needs nothing of the checkout. `tower extensions check <the folder>` reads it as the
tower would.

## What it needs from you

Nothing, to start. **Open in your editor** uses the config's `editor`, VS Code's `code` unless set (every key:
`docs/config.md`):

```json
"editor": { "window": ["cursor", "--new-window", "{dir}"], "open": ["cursor", "{path}"], "goto": ["cursor", "--goto", "{path}:{line}"] }
```

Which view opens code is the `file.open` region's layout, which the config can take back or hand to a view of yours
(the file subject, under [How it works](#how-it-works)).

## How it works

Files is two views, a region and five reads. It writes no facts and keeps nothing but its view state: every
mark and listing is read from the checkout when asked.

- **A view on `card`, `files/explorer`**, a tab in the worker's tabs (`card.panes`) and in a grid's cell. In a room
  under 40rem wide (a cell) the tree and the file take turns, `‹ Files` going back to the tree.
- **Reads, each confined to the worker's checkout**, which the server finds on the board (`checkoutDirs` of `tower:repos.js`, of the
  card's floor and checkout): `files/repos/<project>/<id>` its repos, `files/tree/<project>/<id>?repo&path` one folder (2000
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
  `files/code` first for code (the tower's views by type, on `file`, draw the rest); a config line takes it back, or
  puts a view of yours there:

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
  A hidden tab reads nothing, and tells the file's view it is hidden (a video pauses). A file over 1 MB that changes
  is not drawn again on its own: the head says it changed on disk, and Reload draws it, since each draw has the tower
  read and send the whole file.
- **Links between files.** A relative link in a markdown file opened here (`[the principles](PRINCIPLES.md)`,
  `../README.md#install`) opens the file it names in the tree, each folder on its way opened, scrolled to the link's
  fragment; a link to a folder opens it. A link that climbs out of the repo, or names what the repo doesn't hold, is
  refused in a toast. The explorer `shows` `file` subjects: any file of its worker displayed elsewhere opens here
  the same way, and a markdown view of yours gets the links by displaying `linkedFile(file, href)` (`/cards.js`).
- **The open file is in the address.** Each file it opens the explorer tells the page (`kit.showing`), and while it
  is the worker's tab in the main pane the location names it, the link's fragment beside it:
  `#v/tower/card/card%3A<id>;files/explorer/card%3A<id>/file%3A<id>%2F<repo>%2F<path>[/<fragment>]`. A reload, Back
  and Forward, a middle-click and a copied link land on that file, at that heading. A click in the tree replaces the
  address; a link followed in a document adds a step, so Back returns to the file you left.
- **The tree** indents as VS Code's does: 8px a level and a 16px chevron column, so a file lines up with the folders
  beside it.
- **View state** (the folders open and the file open, per worker) is the view's own (`ctx.state`), so the tab opens
  as it was left; a file the address names opens over the one kept.

## Make it yours

- **Another language**: a file `client/langs/<id>.ts` re-exporting `shiki/langs/<id>.mjs`, and a line in
  `client/code.ts`'s maps.
- **The themes**: the theme imports in `client/code.ts`.
- **Your own code view**: a view on `file` in an extension of yours, put first in `file.open`'s layout from the
  config.
- **How often it looks**: `POLL_MS`, `MAX_POLL_MS` and `FOLLOW_BYTES` in `client/explorer.js`.
- **What a read refuses or serves**: `server.ts`.

## Pictures

`npm run tool:extension-shots -- examples/extensions/files` retakes them from the scenes in [`shots.json`](shots.json),
on a made-up project that `shots/seed/seed.sh` commits into the sandbox, with a worker's changes on top.
