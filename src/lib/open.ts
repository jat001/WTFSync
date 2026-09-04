import { invoke } from '@tauri-apps/api/core'

import { isTauri } from './tauri'

/**
 * Open a directory in the system file manager.
 *
 * Backed by a custom Tauri command instead of plugin-opener's `open_path`:
 * that IPC command is gated by a static capability scope and cannot allow
 * directories chosen at runtime (e.g. watch paths). The custom command
 * only opens paths that exist and are directories.
 * Throws when the directory cannot be opened.
 */
export async function openDirectory(path: string): Promise<void> {
  if (!isTauri) return
  await invoke('open_directory', { path })
}
