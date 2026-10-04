import type { DirEntry, FileStat, FileSystem } from './fs'
import { decodeUtf8, encodeUtf8 } from './text'

interface Watcher {
  dirs: Set<string>
  onChange: (paths: string[]) => void
}

/** Canonical key: forward slashes, no trailing slash. */
function key(path: string): string {
  return path.replace(/[\\/]+/g, '/').replace(/\/$/, '')
}

function parentKey(path: string): string {
  const index = path.lastIndexOf('/')
  return index <= 0 ? '' : path.slice(0, index)
}

/**
 * In-memory FileSystem for tests. Paths are compared after normalizing
 * separators; parents must exist before files are written, as on disk.
 */
export class MemoryFileSystem implements FileSystem {
  private files = new Map<string, { data: Uint8Array; modifiedAt: number }>()
  private dirs = new Set<string>()
  private watchers = new Set<Watcher>()
  /** Mutating operations in order, e.g. `write a/b.lua`. */
  readonly log: string[] = []
  /** Number of upcoming `rename` calls that should fail. */
  failRenames = 0
  clock = 1_000

  /** Create or replace a file, creating parent directories. */
  setFile(path: string, content: string | Uint8Array): void {
    const k = key(path)
    this.addDir(parentKey(k))
    const data = typeof content === 'string' ? encodeUtf8(content) : content
    this.files.set(k, { data, modifiedAt: ++this.clock })
  }

  /** Create a directory and its parents. */
  makeDir(path: string): void {
    this.addDir(key(path))
  }

  getText(path: string): string | undefined {
    const entry = this.files.get(key(path))
    return entry && decodeUtf8(entry.data)
  }

  getBytes(path: string): Uint8Array | undefined {
    return this.files.get(key(path))?.data
  }

  /** Simulate external changes: notify watchers of the paths' directories. */
  touch(...paths: string[]): void {
    for (const watcher of this.watchers) {
      const hits = paths.filter((p) => watcher.dirs.has(parentKey(key(p))))
      if (hits.length > 0) watcher.onChange(hits)
    }
  }

  get watcherCount(): number {
    return this.watchers.size
  }

  private addDir(k: string): void {
    for (let dir = k; dir !== '' && !this.dirs.has(dir); dir = parentKey(dir)) {
      this.dirs.add(dir)
    }
  }

  async readFile(path: string): Promise<Uint8Array> {
    const entry = this.files.get(key(path))
    if (!entry) throw new Error(`no such file: ${path}`)
    return entry.data
  }

  async writeFile(path: string, data: Uint8Array): Promise<void> {
    const k = key(path)
    if (!this.dirs.has(parentKey(k))) throw new Error(`no parent dir: ${path}`)
    this.files.set(k, { data, modifiedAt: ++this.clock })
    this.log.push(`write ${k}`)
  }

  async rename(from: string, to: string): Promise<void> {
    if (this.failRenames > 0) {
      this.failRenames--
      throw new Error('rename failed')
    }
    const entry = this.files.get(key(from))
    if (!entry) throw new Error(`no such file: ${from}`)
    this.files.delete(key(from))
    this.files.set(key(to), entry)
    this.log.push(`rename ${key(from)} -> ${key(to)}`)
  }

  async remove(path: string): Promise<void> {
    const k = key(path)
    if (this.files.delete(k)) {
      this.log.push(`remove ${k}`)
      return
    }
    throw new Error(`no such file: ${path}`)
  }

  async mkdir(path: string): Promise<void> {
    this.addDir(key(path))
  }

  async readDir(path: string): Promise<DirEntry[]> {
    const k = key(path)
    if (!this.dirs.has(k)) throw new Error(`no such directory: ${path}`)
    const entries: DirEntry[] = []
    for (const dir of this.dirs) {
      if (parentKey(dir) === k) {
        entries.push({
          name: dir.slice(k.length + 1),
          isDirectory: true,
          isFile: false,
        })
      }
    }
    for (const file of this.files.keys()) {
      if (parentKey(file) === k) {
        entries.push({
          name: file.slice(k.length + 1),
          isDirectory: false,
          isFile: true,
        })
      }
    }
    return entries
  }

  async stat(path: string): Promise<FileStat | null> {
    const k = key(path)
    const file = this.files.get(k)
    if (file) {
      return {
        isDirectory: false,
        isFile: true,
        size: file.data.length,
        modifiedAt: file.modifiedAt,
      }
    }
    if (this.dirs.has(k)) {
      return { isDirectory: true, isFile: false, size: 0, modifiedAt: null }
    }
    return null
  }

  async watch(
    dirs: string[],
    onChange: (paths: string[]) => void,
  ): Promise<() => void> {
    const watcher: Watcher = { dirs: new Set(dirs.map(key)), onChange }
    this.watchers.add(watcher)
    return () => this.watchers.delete(watcher)
  }
}
