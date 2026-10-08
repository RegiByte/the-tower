#!/bin/sh
# Builds every model into ../assets/<name>.glb with Blender headless; with PREVIEW=<dir>, also renders <dir>/<name>.png.
set -e
cd "$(dirname "$0")"
BLENDER="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"
for script in ${@:-$(ls *.py | grep -v 'kit.py$')}; do
  name="${script%.py}"
  "$BLENDER" -b --factory-startup -P "$script" -- "../assets/$name.glb" ${PREVIEW:+"$PREVIEW/$name.png"} 2>&1 | grep -E 'Error|Traceback|Finished glTF' || true
done
