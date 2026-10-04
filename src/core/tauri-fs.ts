import {
  exists,
  mkdir,
  readDir,
  readFile,
  remove,
  rename,
  stat,
  watch,
  writeFile,
} from '@tauri-apps/plugin-fs'

import type { FileSystem } from './fs'

/**
 * FileSystem backed by the Tauri fs plugin. Paths must be inside the fs
 * scope, which is granted at runtime for the game directory.
 */
export const tauriFs: FileSystem = {
  readFile: (path) => readFile(path),
  writeFile: (path, data) => writeFile(path, data),
  rename: (from, to) => rename(from, to),
  remove: (path) => remove(path),
  mkdir: (path) => mkdir(path, { recursive: true }),

  async readDir(path) {
    const entries = await readDir(path)
    return entries.map(({ name, isDirectory, isFile }) => ({
      name,
      isDirectory,
      isFile,
    }))
  },

  async stat(path) {
    if (!(await exists(path))) return null
    const info = await stat(path)
    return {
      isDirectory: info.isDirectory,
      isFile: info.isFile,
      size: info.size,
      modifiedAt: info.mtime?.getTime() ?? null,
    }
  },

  watch(dirs, onChange, delayMs) {
    return watch(
      dirs,
      (event) => {
        // Plain reads (including our own) must not trigger a sync.
        if (typeof event.type === 'object' && 'access' in event.type) return
        onChange(event.paths)
      },
      { recursive: false, delayMs },
    )
  },
}
