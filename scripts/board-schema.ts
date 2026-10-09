/**
 * The JSON Schema of the board's stream message (`BoardMsg`, `src/shared/shelf-page.ts`), read from the TypeScript types
 * and their JSDoc, written to `src/shared/board.schema.json`, which `GET /schema` serves as the `board` stream.
 * `npm run schema:board` writes it; `test/board-schema.test.ts` fails when the file is stale.
 * ts-json-schema-generator reads the types with its own TypeScript 5, as the TypeScript 7 of the repo has no JS API.
 * A `Call<'verb'>` (a verb's input derived from its zod schema) is drawn as the tuple `[verb, input]`, the input
 * left open: `tower api <verb>` describes it.
 */
import { writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import {
  AnnotatedType,
  DEFAULT_CONFIG,
  LiteralType,
  ObjectType,
  SchemaGenerator,
  TupleType,
  createFormatter,
  createParser,
  createProgram,
  type BaseType,
  type Config,
  type SubNodeParser,
} from 'ts-json-schema-generator'

type TypeNode = { kind: number; typeName?: { text: string }; typeArguments?: { literal: { text: string } }[] }
const generatorTs = createRequire(createRequire(import.meta.url).resolve('ts-json-schema-generator'))('typescript') as { SyntaxKind: { TypeReference: number } }

const ROOT = path.join(import.meta.dirname, '..')
export const BOARD_SCHEMA_FILE = path.join(ROOT, 'src/shared/board.schema.json')

const callParser: SubNodeParser = {
  supportsNode: (node) => node.kind === generatorTs.SyntaxKind.TypeReference && (node as TypeNode).typeName?.text === 'Call',
  createType(node): BaseType {
    const [verb] = (node as TypeNode).typeArguments!
    const input = new AnnotatedType(new ObjectType('call-input', [], [], true), { description: "The verb's input, the fields the board knows: `tower api <verb>` describes it." }, false)
    return new TupleType([new LiteralType(verb.literal.text), input])
  },
}

export const boardSchemaText = (): string => {
  const config = { ...DEFAULT_CONFIG, path: path.join(ROOT, 'src/shared/shelf-page.ts'), tsconfig: path.join(ROOT, 'tsconfig.json'), type: 'BoardMsg', skipTypeCheck: true } as Config & typeof DEFAULT_CONFIG
  const program = createProgram(config)
  const parser = createParser(program, config, (mutable) => mutable.addNodeParser(callParser))
  const schema = new SchemaGenerator(program, parser, createFormatter(config), config).createSchema('BoardMsg')
  return JSON.stringify(schema, null, 2) + '\n'
}

if (process.argv[1] === import.meta.filename) {
  writeFileSync(BOARD_SCHEMA_FILE, boardSchemaText())
  console.log(`wrote ${path.relative(ROOT, BOARD_SCHEMA_FILE)}`)
}
