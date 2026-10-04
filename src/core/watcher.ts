import { isValidAccountName } from './accounts'
import type { SyncTask } from './engine'
import { isDirectory, type FileSystem } from './fs'
import { basename } from './paths'
import { savedVariablesDir } from './wow'

/** Game saves are short bursts of writes; wait for them to settle. */
export const WATCH_DELAY_MS = 2000

export interface SourceWatch {
  stop(): void
  /** SavedVariables directories being watched. */
  watchedDirs: string[]
  /** Selected accounts whose SavedVariables directory does not exist yet. */
  missingDirs: string[]
}

/**
 * Watch the SavedVariables directories of every task's accounts and call
 * `onChange` with the task whenever one of its source files changes.
 *
 * Directories are watched rather than files, because the game may save by
 * replacing the file, which would silently end a watch on the file itself.
 */
export async function watchSources(
  fs: FileSystem,
  tasks: readonly SyncTask[],
  onChange: (task: SyncTask) => void,
  delayMs = WATCH_DELAY_MS,
): Promise<SourceWatch> {
  const stops: (() => void)[] = []
  const watchedDirs: string[] = []
  const missingDirs: string[] = []
  const stop = () => {
    for (const unwatch of stops.splice(0)) unwatch()
  }

  try {
    for (const task of tasks) {
      const dirs: string[] = []
      for (const id of task.accounts) {
        if (!isValidAccountName(id)) continue
        const dir = savedVariablesDir(task.gameDir, id)
        if (await isDirectory(fs, dir)) {
          dirs.push(dir)
        } else {
          missingDirs.push(dir)
        }
      }
      if (dirs.length === 0) continue

      const names = new Set(
        task.profile.sourceFiles.map((name) => name.toLowerCase()),
      )
      const unwatch = await fs.watch(
        dirs,
        (paths) => {
          if (paths.some((path) => names.has(basename(path).toLowerCase()))) {
            onChange(task)
          }
        },
        delayMs,
      )
      stops.push(unwatch)
      watchedDirs.push(...dirs)
    }
  } catch (error) {
    stop()
    throw error
  }

  return { stop, watchedDirs, missingDirs }
}
