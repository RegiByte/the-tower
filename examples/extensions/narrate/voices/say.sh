#!/bin/sh
# A narrate voice command through macOS's own `say`: free, offline, the system's voice.
# Reads the text on stdin, writes an .m4a to $TMPDIR and prints its path.
# Set SAY_VOICE to a voice `say -v '?'` lists to pick one.
set -eu
tmp="${TMPDIR:-/tmp}"
out="${tmp%/}/narrate-$$.m4a"
say ${SAY_VOICE:+-v "$SAY_VOICE"} --data-format=aac -o "$out" -f -
echo "$out"
