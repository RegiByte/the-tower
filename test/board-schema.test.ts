import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { BOARD_SCHEMA_FILE, boardSchemaText } from '../scripts/board-schema.ts'

test('the committed board schema is the one the board types generate', () => {
  assert.equal(
    readFileSync(BOARD_SCHEMA_FILE, 'utf8'),
    boardSchemaText(),
    'src/shared/board.schema.json is stale: the board types changed. Run `npm run schema:board` and commit it.',
  )
})
