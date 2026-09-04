import { invoke } from '@tauri-apps/api/core'

import { isTauri } from './tauri'

/**
 * Grant the fs plugin runtime access to the given directories (recursive).
 *
 * The fs capability scope can only whitelist fixed paths, so watch paths
 * chosen by the user are authorized at runtime on the backend, where globs are
 * matched at access time — files and subdirectories created later are covered.
 * Returns the list of paths that failed to authorize (empty on full success).
 */
export async function allowFsDirectories(paths: string[]): Promise<string[]> {
  if (!isTauri || paths.length === 0) return []
  // Resolves with the list of paths that failed to authorize (empty = all ok).
  return invoke<string[]>('grant_fs_directories', { paths })
}
