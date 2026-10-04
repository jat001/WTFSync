import { quoteLuaString } from '../core/lua/string'

/**
 * Writes Lua values the way WoW serializes SavedVariables, to build test
 * fixtures: CRLF line breaks, no indentation, the array part first (with
 * `nil` holes), then `[key] = value,` entries, each on its own line.
 */

export type LuaKeyLiteral = string | number | boolean

/** A Lua value; `null` is nil. */
export type LuaValue = string | number | boolean | null | LuaTableValue

export interface LuaTableValue {
  /** Array part, written without keys. */
  items: LuaValue[]
  /** Hash part, in write order. */
  fields: [LuaKeyLiteral, LuaValue][]
}

const CRLF = '\r\n'

export function table(
  fields: [LuaKeyLiteral, LuaValue][] = [],
  items: LuaValue[] = [],
): LuaTableValue {
  return { items, fields }
}

function formatKey(key: LuaKeyLiteral): string {
  return typeof key === 'string' ? `[${quoteLuaString(key)}]` : `[${String(key)}]`
}

export function formatValue(value: LuaValue): string {
  if (value === null) return 'nil'
  if (typeof value === 'string') return quoteLuaString(value)
  if (typeof value !== 'object') return String(value)
  const lines = [
    ...value.items.map((item) => `${formatValue(item)},`),
    ...value.fields.map(([key, item]) => formatField(key, item)),
  ]
  return `{${CRLF}${lines.map((line) => line + CRLF).join('')}}`
}

/** One `[key] = value,` entry, exactly as it appears in the file. */
export function formatField(key: LuaKeyLiteral, value: LuaValue): string {
  return `${formatKey(key)} = ${formatValue(value)},`
}

/** A whole SavedVariables file: a blank first line, then one line per global. */
export function formatSavedVariables(globals: [string, LuaValue][]): string {
  return (
    CRLF +
    globals.map(([name, value]) => `${name} = ${formatValue(value)}${CRLF}`).join('')
  )
}
