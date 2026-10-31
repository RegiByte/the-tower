// Reads the sandbox's board once it holds what is asked, for shots.json:
//   node board.mjs callsign <session>   the callsign of the worker that session is
//   node board.mjs part                 the lab floor's autotidy part, once a worker is going home
const [what, session] = process.argv.slice(2)

async function board() {
  const res = await fetch(`${process.env.TOWER_URL}/board`)
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let text = ''
  while (!text.includes('\n\n')) text += (await reader.read()).value
  await reader.cancel()
  return JSON.parse(text.split('\n').find((l) => l.startsWith('data:')).slice(5)).board
}

const lab = (b) => b.floors.find((f) => f.id === 'lab')
const read = {
  callsign: (b) => lab(b).cards.find((c) => c.id === session)?.callsign,
  part: (b) => (lab(b).x.autotidy.going.length ? JSON.stringify({ x: { autotidy: lab(b).x.autotidy } }, null, 2) : undefined),
}[what]

for (const end = Date.now() + 30000; Date.now() < end; await new Promise((r) => setTimeout(r, 200))) {
  const found = read(await board())
  if (found) {
    console.log(found)
    process.exit(0)
  }
}
throw new Error(`the board never held ${what}`)
