import luaparse from 'luaparse'
import type { Chunk, Expression, TableConstructorExpression } from 'luaparse'

import { encodeUtf8 } from '../text'
import {
  LuaParseError,
  type LuaChunk,
  type LuaField,
  type LuaKey,
  type LuaNode,
  type LuaTable,
} from './ast'

const OPTIONS = {
  ranges: true,
  comments: false,
  // WoW runs Lua 5.1.
  luaVersion: '5.1',
  // Bytes 0x80-0xFF are fed as U+F780-U+F7FF; see toCodeUnits.
  encodingMode: 'x-user-defined',
} as const

const lossyUtf8 = new TextDecoder()

/**
 * One UTF-16 code unit per byte, as WHATWG x-user-defined decodes: ASCII is
 * unchanged and 0x80-0xFF map to U+F780-U+F7FF. Lua source is bytes, so
 * luaparse then reports byte offsets, and string values come back in the
 * same mapping.
 */
function toCodeUnits(bytes: Uint8Array): string {
  const CHUNK = 0x8000
  let out = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const part = bytes.subarray(i, i + CHUNK)
    const units = new Uint16Array(part.length)
    for (let j = 0; j < part.length; j++) {
      const byte = part[j] ?? 0
      units[j] = byte < 0x80 ? byte : 0xf700 + byte
    }
    out += String.fromCharCode(...units)
  }
  return out
}

/** Decode a luaparse string value (x-user-defined bytes) as UTF-8. */
function decodeString(units: string): string {
  if (!/[-]/.test(units)) return units
  const bytes = new Uint8Array(units.length)
  for (let i = 0; i < units.length; i++) {
    const unit = units.charCodeAt(i)
    bytes[i] = unit >= 0xf780 ? unit - 0xf700 : unit
  }
  return lossyUtf8.decode(bytes)
}

function rangeOf(node: { range?: [number, number] }): [number, number] {
  if (!node.range) throw new Error('luaparse did not record node ranges')
  return node.range
}

/**
 * Turn a luaparse error into a LuaParseError. An error at or after the end
 * of the input, or inside a token that runs to the end, means the file was
 * cut off, most likely because the game is still writing it.
 */
function toParseError(error: unknown, code: string): unknown {
  if (!(error instanceof SyntaxError) || !('index' in error)) return error
  const index = Number(error.index)
  const incomplete = index >= code.length || !/\s/.test(code.slice(index))
  return new LuaParseError(incomplete ? 'eof' : 'syntax', index, error.message)
}

class Converter {
  private readonly code: string

  constructor(code: string) {
    this.code = code
  }

  chunk(ast: Chunk): Map<string, LuaNode> {
    const globals = new Map<string, LuaNode>()
    for (const statement of ast.body) {
      const [start] = rangeOf(statement)
      if (statement.type !== 'AssignmentStatement') {
        throw new LuaParseError('syntax', start, `unsupported ${statement.type}`)
      }
      statement.variables.forEach((variable, i) => {
        const init = statement.init[i]
        if (variable.type !== 'Identifier' || !init) {
          throw new LuaParseError('syntax', start, 'expected `Name = value`')
        }
        globals.set(variable.name, this.value(init))
      })
    }
    return globals
  }

  private value(node: Expression): LuaNode {
    const [start, end] = rangeOf(node)
    switch (node.type) {
      case 'TableConstructorExpression':
        return this.table(node)
      case 'StringLiteral':
        return { kind: 'string', value: decodeString(node.value), start, end }
      case 'NumericLiteral':
        return { kind: 'number', value: node.value, start, end }
      case 'BooleanLiteral':
        return { kind: 'boolean', value: node.value, start, end }
      case 'NilLiteral':
        return { kind: 'nil', start, end }
      case 'UnaryExpression':
        // WoW writes negative numbers as `-1`.
        if (node.operator === '-' && node.argument.type === 'NumericLiteral') {
          return { kind: 'number', value: -node.argument.value, start, end }
        }
        break
    }
    // Anything else is code, not data. Running to the end of the input means
    // a literal was cut off, e.g. `true` truncated to `tr`.
    const reason = end >= this.code.length ? 'eof' : 'syntax'
    throw new LuaParseError(reason, start, `unsupported ${node.type}`)
  }

  private table(node: TableConstructorExpression): LuaTable {
    const [start, end] = rangeOf(node)
    const fields: LuaField[] = []
    let positional = 0
    for (const field of node.fields) {
      const value = this.value(field.value)
      let key: LuaKey
      if (field.type === 'TableValue') {
        key = { kind: 'positional', index: ++positional }
      } else if (field.type === 'TableKeyString') {
        key = { kind: 'string', value: field.key.name }
      } else {
        key = this.key(this.value(field.key))
      }
      const [fieldStart, fieldEnd] = rangeOf(field)
      fields.push({
        key,
        value,
        start: fieldStart,
        end: this.throughSeparator(fieldEnd),
      })
    }
    return { kind: 'table', fields, start, end }
  }

  private key(node: LuaNode): LuaKey {
    switch (node.kind) {
      case 'string':
        return { kind: 'string', value: node.value }
      case 'boolean':
        return { kind: 'boolean', value: node.value }
      case 'number':
        if (!Number.isNaN(node.value)) return { kind: 'number', value: node.value }
        break
    }
    throw new LuaParseError('syntax', node.start, 'invalid table key')
  }

  /** Extend a field's end over the `,` or `;` that follows it, if any. */
  private throughSeparator(end: number): number {
    let pos = end
    while (/\s/.test(this.code[pos] ?? '')) pos++
    const next = this.code[pos]
    return next === ',' || next === ';' ? pos + 1 : end
  }
}

/**
 * Parse a SavedVariables file: `Name = value` assignments whose values are
 * table constructors and literals. Parsing is done by luaparse; anything
 * beyond plain data is reported as a syntax error rather than evaluated.
 *
 * Every node and field records its byte span, so callers can copy the
 * original text verbatim instead of re-serializing it.
 */
export function parseSavedVariables(input: Uint8Array | string): LuaChunk {
  const bytes = typeof input === 'string' ? encodeUtf8(input) : input
  let code = toCodeUnits(bytes)
  // Blank out a UTF-8 BOM instead of dropping it to keep byte offsets.
  if (code.startsWith('')) code = `   ${code.slice(3)}`

  let ast: Chunk
  try {
    ast = luaparse.parse(code, OPTIONS)
  } catch (error) {
    throw toParseError(error, code)
  }

  const globals = new Converter(code).chunk(ast)
  // WoW never writes an empty file on purpose; treat it as mid-write.
  if (globals.size === 0) {
    throw new LuaParseError('eof', bytes.length, 'no assignments')
  }
  return { bytes, globals }
}
