const utf8Decoder = new TextDecoder('utf-8', { fatal: true })
const utf8Encoder = new TextEncoder()

/**
 * Decode UTF-8 strictly: invalid byte sequences throw instead of being
 * replaced with U+FFFD, so corrupted input is never silently written back
 * out. A leading BOM is stripped.
 */
export function decodeUtf8(bytes: Uint8Array): string {
  return utf8Decoder.decode(bytes)
}

export function encodeUtf8(text: string): Uint8Array {
  return utf8Encoder.encode(text)
}

/** Normalize every line ending (CRLF, LF or CR) to CRLF, as WoW files use. */
export function toCrlf(text: string): string {
  return text.replace(/\r\n|\r|\n/g, '\r\n')
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}
