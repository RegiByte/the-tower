# main

## user · 2026-10-06 15:32 · n1
`lab-api:src/routes/ticket.ts:31-34`
```ts
  for (const file of untracked.slice(0, 300)) {
    const diff = await untrackedDiff(dir, file)
    outs.push(diff)
  }
```
Why one by one, and why 300?

## ODIN-42 · 2026-10-06 15:32 · n2 · re n1
git diff never shows untracked files; 300 caps a fresh node_modules. Added a comment.

## MORIARTY-91 · 2026-10-06 15:32 · n3
`lab:README.md:3-4`
````diff
-Run it with `npm start`.
+Run it with ``npm run dev``, or:
+```sh
````
`lab-api:config.ts:2`
```ts
export const host = "127.0.0.1"
```
The README lost its start command, and the host is hard-coded.

A heading in a fence stays body:

```md
## user · 2026-10-06 14:32 · n9
```

That's all.

## user · 2026-10-06 15:32 · n4 · re n3
`lab-api:config.ts:1`
