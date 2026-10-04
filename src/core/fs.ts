import { decodeUtf8 } from './text'

export interface DirEntry {
  name: string
  isDirectory: boolean
  isFile: boolean
}

export interface FileStat {
  isDirectory: boolean
  isFile: boolean
  size: number
  /** Unix time in milliseconds, when the platform reports it. */
  modifiedAt: number | null
}

/**
 * File system access used by the core layer. The app uses the Tauri fs
 * plugin implementation; tests use an in-memory one.
 */
export interface FileSystem {
  readFile(path: string): Promise<Uint8Array>
  writeFile(path: string, data: Uint8Array): Promise<void>
  /** Move `from` to `to`, replacing `to` when it exists. */
  rename(from: string, to: string): Promise<void>
  remove(path: string): Promise<void>
  /** Create a directory along with any missing parents. */
  mkdir(path: string): Promise<void>
  readDir(path: string): Promise<DirEntry[]>
  /** Resolves to null when nothing exists at `path`. */
  stat(path: string): Promise<FileStat | null>
  /**
   * Watch directories non-recursively. `onChange` receives the paths touched
   * by a debounced batch of events. Resolves to a function that stops it.
   */
  watch(
    dirs: string[],
    onChange: (paths: string[]) => void,
    delayMs: number,
  ): Promise<() => void>
}

/** Suffix of the temporary file written before an atomic rename. */
export const TEMP_SUFFIX = '.wtfsync-tmp'

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function isDirectory(fs: FileSystem, path: string) {
  return (await fs.stat(path))?.isDirectory ?? false
}

export async function isFile(fs: FileSystem, path: string) {
  return (await fs.stat(path))?.isFile ?? false
}

/** Read a UTF-8 text file; throws on invalid UTF-8. */
export async function readText(fs: FileSystem, path: string): Promise<string> {
  return decodeUtf8(await fs.readFile(path))
}

export interface AtomicWriteOptions {
  attempts?: number
  delayMs?: number
  sleep?: (ms: number) => Promise<void>
}

/**
 * Write `data` so readers never observe a partially written file: write a
 * sibling temp file, then rename it over the target. The rename is retried
 * briefly since it fails while another process (e.g. the game) holds the
 * target open.
 */
export async function writeFileAtomic(
  fs: FileSystem,
  path: string,
  data: Uint8Array,
  { attempts = 3, delayMs = 200, sleep: wait = sleep }: AtomicWriteOptions = {},
): Promise<void> {
  const temp = path + TEMP_SUFFIX
  await fs.writeFile(temp, data)
  for (let attempt = 1; ; attempt++) {
    try {
      await fs.rename(temp, path)
      return
    } catch (error) {
      if (attempt >= attempts) {
        await fs.remove(temp).catch(() => {})
        throw error
      }
      await wait(delayMs)
    }
  }
}
