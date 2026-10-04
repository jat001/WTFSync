/**
 * Message of an unknown thrown value. Tauri commands reject with plain
 * strings rather than Error objects, so both are handled.
 */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return typeof error === 'string' ? error : String(error)
}
