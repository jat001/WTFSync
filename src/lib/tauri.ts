/**
 * True when running inside the Tauri webview.
 * False in a plain browser (e.g. `pnpm dev` without Tauri), where calls to
 * Tauri APIs would throw, so every invoke must be guarded by this flag.
 */
export const isTauri =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
