import { appLogDir } from '@tauri-apps/api/path'

import { openDirectory } from './open'
import { isTauri } from './tauri'

/**
 * Open the app log directory in the system file manager.
 * Returns the path so callers can show it in a toast.
 * Throws when the directory cannot be opened (e.g. not created yet).
 */
export async function openLogDir(): Promise<string> {
  if (!isTauri) return '%APPDATA%/WTFSync/logs'
  const dir = await appLogDir()
  await openDirectory(dir)
  return dir
}
