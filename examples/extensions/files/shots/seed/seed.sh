#!/bin/sh
# Seeds the sandbox's lab checkout for the pictures: a made-up project committed, then a worker's changes on top.
set -e
lab="$TOWER_SANDBOX/lab"
cp -R "$EXT/shots/seed/lab/." "$lab/"
printf 'dist/\n' >> "$lab/.gitignore"
mkdir -p "$lab/dist" && printf 'built\n' > "$lab/dist/server.js"
git -C "$lab" add -A
git -C "$lab" -c user.name=lab -c user.email=lab@example.invalid commit -qm 'Field notes'
cp -R "$EXT/shots/seed/changes/." "$lab/"
git -C "$lab" add docs/search.md
