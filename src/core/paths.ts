const SEPARATORS = /[\\/]+/

/** Whether a path follows Windows conventions (drive letter or backslashes). */
function isWindowsPath(path: string): boolean {
  return /^[a-zA-Z]:/.test(path) || path.includes('\\')
}

/**
 * Join path segments using the separator style of `base`. Segments may
 * themselves contain separators of either style; empty parts are dropped.
 */
export function joinPath(base: string, ...segments: string[]): string {
  const sep = isWindowsPath(base) ? '\\' : '/'
  let result = base.replace(/[\\/]+$/, '')
  for (const segment of segments) {
    for (const part of segment.split(SEPARATORS)) {
      if (part) result += sep + part
    }
  }
  return result
}

/** Last path component, ignoring trailing separators. */
export function basename(path: string): string {
  const parts = path.split(SEPARATORS).filter(Boolean)
  return parts[parts.length - 1] ?? ''
}

/** Parent directory, keeping the root separator for paths like `C:\x`. */
export function dirname(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '')
  const index = Math.max(trimmed.lastIndexOf('\\'), trimmed.lastIndexOf('/'))
  if (index < 0) return ''
  const parent = trimmed.slice(0, index)
  return parent === '' || /^[a-zA-Z]:$/.test(parent)
    ? trimmed.slice(0, index + 1)
    : parent
}

/** Comparable form: forward slashes, no trailing slash, case-folded on Windows. */
function comparable(path: string): string {
  const normalized = path.replace(/[\\/]+/g, '/').replace(/\/$/, '')
  return isWindowsPath(path) ? normalized.toLowerCase() : normalized
}

/**
 * Whether `child` lies strictly inside `parent`. Paths containing `.` or
 * `..` components are always rejected rather than resolved.
 */
export function isInside(parent: string, child: string): boolean {
  const parts = child.split(SEPARATORS)
  if (parts.some((part) => part === '.' || part === '..')) return false
  return comparable(child).startsWith(comparable(parent) + '/')
}

/** Whether `name` is usable as a single file name on Windows and Unix. */
export function isSafeFileName(name: string): boolean {
  return (
    name !== '' &&
    name !== '.' &&
    name !== '..' &&
    !/[<>:"/\\|?*\x00-\x1f]/.test(name) &&
    !/[. ]$/.test(name)
  )
}
