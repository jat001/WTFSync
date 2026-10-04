/**
 * Files listed in a toc, in order: every non-empty line that is neither
 * metadata (`## Key: value`) nor a comment (`# ...`).
 */
export function parseTocFiles(toc: string): string[] {
  return toc
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
}
