#!/bin/sh
# An example of narrate's voice command contract, calling ElevenLabs' text-to-speech API with curl.
# Not an integration: copy it and adapt it, or write the same shape around any other voice.
#
# Reads the text on stdin, writes an .mp3 to $TMPDIR and prints its path; on any failure it
# exits non-zero with the reason on stderr, which narrate shows as a toast.
#
#   ELEVENLABS_API_KEY   your API key (required)
#   ELEVENLABS_VOICE_ID  the voice to speak in (required): its id from your voice library
#   ELEVENLABS_MODEL     the model (default eleven_multilingual_v2)
#   ELEVENLABS_API       the API's base URL (default https://api.elevenlabs.io)
#
# Keep the key in the environment the tower starts with (the command inherits it), never in the
# config, which every worker can read.
set -eu
: "${ELEVENLABS_API_KEY:?set ELEVENLABS_API_KEY to your ElevenLabs API key}"
: "${ELEVENLABS_VOICE_ID:?set ELEVENLABS_VOICE_ID to the id of the voice to speak in}"
api="${ELEVENLABS_API:-https://api.elevenlabs.io}"
tmp="${TMPDIR:-/tmp}"
out="${tmp%/}/narrate-$$.mp3"
body=$(node -e 'let t = ""; process.stdin.on("data", (d) => (t += d)).on("end", () => process.stdout.write(JSON.stringify({ text: t, model_id: process.argv[1] })))' "${ELEVENLABS_MODEL:-eleven_multilingual_v2}")
status=$(curl -sS -o "$out" -w '%{http_code}' -X POST "$api/v1/text-to-speech/$ELEVENLABS_VOICE_ID" \
  -H "xi-api-key: $ELEVENLABS_API_KEY" -H 'content-type: application/json' -H 'accept: audio/mpeg' \
  --data-binary "$body")
if [ "$status" != 200 ]; then
  echo "ElevenLabs answered $status: $(cat "$out")" >&2
  rm -f "$out"
  exit 1
fi
echo "$out"
