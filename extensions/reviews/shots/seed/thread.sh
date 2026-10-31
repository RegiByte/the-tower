# A made-up review thread on the first worker's checkout (main): the user's notes on lines of a new file, the
# worker's answer, a resolution, and a reviewer hired on its work.
set -e
mkdir -p "$TOWER_SANDBOX/lab/src"
cp "$EXT/shots/seed/rates.js" "$TOWER_SANDBOX/lab/src/rates.js"
me=$(tower whoami | sed -n 's/^You are \([A-Z0-9-]*\),.*/\1/p')
tower x reviews append '{"project": "lab", "checkout": "main", "author": "user", "anchors": [{"repo": "lab", "path": "src/rates.js", "from": 5, "to": 7, "quote": {"lang": "js", "lines": ["export function round(value) {", "  return Math.round(value * 100) / 100", "}"]}}], "body": "Rounding after every conversion drifts by a cent over a chain. Round once, at the end?"}' >/dev/null
echo "Rounding now happens once, after the last conversion. A chain of three gives the expected total." | tower note re n1 >/dev/null
tower x reviews resolve '{"project": "lab", "checkout": "main", "author": "user", "notes": [1], "body": "Thanks."}' >/dev/null
tower x reviews append '{"project": "lab", "checkout": "main", "author": "user", "anchors": [{"repo": "lab", "path": "src/rates.js", "from": 1, "to": 3, "quote": {"lang": "js", "lines": ["export function convert(amount, rate) {", "  return amount * rate", "}"]}}], "body": "What should a negative rate do? Refuse it, I think."}' >/dev/null
tower review "$me" >/dev/null
