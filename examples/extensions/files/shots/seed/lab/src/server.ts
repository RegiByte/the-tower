import { createServer } from 'node:http'
import { addNote, notesAt } from './notes.ts'

const PORT = Number(process.env.PORT ?? 8080)

const reply = (res, status: number, body: unknown) => {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
  if (url.pathname !== '/notes') return reply(res, 404, { error: 'not found' })
  if (req.method === 'GET') return reply(res, 200, notesAt(url.searchParams.get('site')))
  const body = JSON.parse(await new Response(req).text())
  return reply(res, 201, addNote(body.site, body.text))
}).listen(PORT)
