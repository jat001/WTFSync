/** Quote `value` as a double-quoted Lua string literal. */
export function quoteLuaString(value: string): string {
  let out = '"'
  for (const ch of value) {
    switch (ch) {
      case '"':
        out += '\\"'
        break
      case '\\':
        out += '\\\\'
        break
      case '\n':
        out += '\\n'
        break
      case '\r':
        out += '\\r'
        break
      default: {
        const code = ch.codePointAt(0) ?? 0
        // Three digits so a following digit is never read as part of it.
        out +=
          code < 32 || code === 127
            ? `\\${String(code).padStart(3, '0')}`
            : ch
      }
    }
  }
  return `${out}"`
}
