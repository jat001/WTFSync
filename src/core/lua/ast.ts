/** Range `[start, end)` of byte offsets into the source file. */
export interface Span {
  start: number
  end: number
}

export interface LuaTable extends Span {
  kind: 'table'
  fields: LuaField[]
}

export interface LuaString extends Span {
  kind: 'string'
  value: string
}

export interface LuaNumber extends Span {
  kind: 'number'
  value: number
}

export interface LuaBoolean extends Span {
  kind: 'boolean'
  value: boolean
}

export interface LuaNil extends Span {
  kind: 'nil'
}

export type LuaNode = LuaTable | LuaString | LuaNumber | LuaBoolean | LuaNil

export type LuaKey =
  | { kind: 'string'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'boolean'; value: boolean }
  /** Array item written without a key; `index` is its 1-based position. */
  | { kind: 'positional'; index: number }

/**
 * A table field. Its span runs from the key (or the value, for positional
 * items) through the trailing `,` or `;` when there is one.
 */
export interface LuaField extends Span {
  key: LuaKey
  value: LuaNode
}

/** A parsed SavedVariables file. All spans are byte offsets into `bytes`. */
export interface LuaChunk {
  bytes: Uint8Array
  globals: Map<string, LuaNode>
}

const strictUtf8 = new TextDecoder('utf-8', { fatal: true })

/**
 * Original source text of a byte range, decoded as UTF-8. Spans start and
 * end on ASCII delimiters, so slices never split a multi-byte character.
 */
export function sourceText(chunk: LuaChunk, start: number, end: number): string {
  return strictUtf8.decode(chunk.bytes.subarray(start, end))
}

export type LuaParseFailure = 'eof' | 'syntax'

export class LuaParseError extends Error {
  /** `eof` means the input ended early, e.g. a file still being written. */
  readonly reason: LuaParseFailure
  readonly offset: number

  constructor(reason: LuaParseFailure, offset: number, message: string) {
    super(`${message} (offset ${offset})`)
    this.name = 'LuaParseError'
    this.reason = reason
    this.offset = offset
  }
}

export type LuaKeyValue = string | number | boolean

/** Plain value of a key; positional items yield their index, as in Lua. */
export function keyValue(key: LuaKey): LuaKeyValue {
  return key.kind === 'positional' ? key.index : key.value
}

function keyId(value: LuaKeyValue): string {
  return `${typeof value}:${value}`
}

const fieldIndexes = new WeakMap<LuaTable, Map<string, LuaField>>()

/**
 * Look up a field of a table by key. Positional items match their numeric
 * index; when a key repeats, the last field wins, as in Lua.
 */
export function fieldOf(
  table: LuaNode | undefined,
  key: LuaKeyValue,
): LuaField | undefined {
  if (table?.kind !== 'table') return undefined
  let index = fieldIndexes.get(table)
  if (!index) {
    index = new Map()
    for (const field of table.fields) {
      index.set(keyId(keyValue(field.key)), field)
    }
    fieldIndexes.set(table, index)
  }
  return index.get(keyId(key))
}

export function valueOf(
  table: LuaNode | undefined,
  key: LuaKeyValue,
): LuaNode | undefined {
  return fieldOf(table, key)?.value
}

export function asTable(node: LuaNode | undefined): LuaTable | undefined {
  return node?.kind === 'table' ? node : undefined
}

export function asString(node: LuaNode | undefined): string | undefined {
  return node?.kind === 'string' ? node.value : undefined
}

export function asNumber(node: LuaNode | undefined): number | undefined {
  return node?.kind === 'number' ? node.value : undefined
}
