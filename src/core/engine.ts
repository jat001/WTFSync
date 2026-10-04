import {
  loadAccountSourceWithRetry,
  toAccountFailure,
  type AccountFailure,
  type RetryOptions,
} from './accounts'
import {
  isDirectory,
  TEMP_SUFFIX,
  writeFileAtomic,
  type AtomicWriteOptions,
  type FileSystem,
} from './fs'
import { isInside, isSafeFileName, joinPath } from './paths'
import type { AddonProfile, ExistingOutput, RenderOutput } from './profile'
import { bytesEqual, decodeUtf8, encodeUtf8 } from './text'
import { addonDir, readClientInfo } from './wow'

export type SyncTrigger = 'manual' | 'watch' | 'startup'

export interface SyncTask {
  gameDir: string
  profile: AddonProfile
  /** Selected account ids. */
  accounts: readonly string[]
}

export interface SyncReport {
  gameDir: string
  profileId: string
  trigger: SyncTrigger
  /** Accounts whose current data went into the output. */
  synced: string[]
  failed: AccountFailure[]
  /** Output file names that were written, already up to date, or removed. */
  written: string[]
  unchanged: string[]
  removed: string[]
  startedAt: number
  finishedAt: number
}

export type SyncErrorCode =
  | 'game-dir-missing'
  | 'required-addon-missing'
  | 'client-version-unknown'
  | 'invalid-output'

/** A failure that stops the whole sync, as opposed to a single account. */
export class SyncError extends Error {
  readonly code: SyncErrorCode

  constructor(code: SyncErrorCode, message: string) {
    super(message)
    this.name = 'SyncError'
    this.code = code
  }
}

export interface SyncOptions {
  retry?: RetryOptions
  write?: AtomicWriteOptions
  now?: () => number
}

export function outputDirOf(gameDir: string, profile: AddonProfile): string {
  return joinPath(gameDir, profile.outputDir)
}

/** Contents of every file in an output directory, skipping temp files. */
async function readOutputDir(
  fs: FileSystem,
  dir: string,
): Promise<Map<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>()
  if (!(await isDirectory(fs, dir))) return files
  for (const entry of await fs.readDir(dir)) {
    if (entry.isFile && !entry.name.endsWith(TEMP_SUFFIX)) {
      files.set(entry.name, await fs.readFile(joinPath(dir, entry.name)))
    }
  }
  return files
}

/** Remove temp files left behind by an interrupted write. */
async function removeTempFiles(fs: FileSystem, dir: string): Promise<void> {
  if (!(await isDirectory(fs, dir))) return
  for (const entry of await fs.readDir(dir)) {
    if (entry.isFile && entry.name.endsWith(TEMP_SUFFIX)) {
      await fs.remove(joinPath(dir, entry.name)).catch(() => {})
    }
  }
}

/** Text view of output files; files that are not valid UTF-8 are omitted. */
function toExistingOutput(files: Map<string, Uint8Array>): ExistingOutput {
  const texts = new Map<string, string>()
  for (const [name, data] of files) {
    try {
      texts.set(name, decodeUtf8(data))
    } catch {
      // Not ours to interpret.
    }
  }
  return { files: texts }
}

/** The current output of a profile, or null when it has not been generated. */
export async function readExistingOutput(
  fs: FileSystem,
  gameDir: string,
  profile: AddonProfile,
): Promise<ExistingOutput | null> {
  const dir = outputDirOf(gameDir, profile)
  if (!(await isDirectory(fs, dir))) return null
  return toExistingOutput(await readOutputDir(fs, dir))
}

function validateOutput(outputDir: string, output: RenderOutput): void {
  const fail = (message: string) => new SyncError('invalid-output', message)
  const written = new Set<string>()
  for (const { name } of output.files) {
    if (written.has(name)) throw fail(`duplicate output file: ${name}`)
    written.add(name)
  }
  for (const name of [...written, ...output.remove]) {
    const valid =
      isSafeFileName(name) &&
      !name.endsWith(TEMP_SUFFIX) &&
      isInside(outputDir, joinPath(outputDir, name))
    if (!valid) throw fail(`invalid output file name: ${name}`)
  }
  for (const name of output.remove) {
    if (written.has(name)) throw fail(`file both written and removed: ${name}`)
  }
}

/**
 * Sync one profile: load the selected accounts, render the output and
 * write the files whose content changed. Accounts that fail to load are
 * reported individually; the rest are still synced.
 */
export async function runSync(
  fs: FileSystem,
  task: SyncTask,
  trigger: SyncTrigger,
  options: SyncOptions = {},
): Promise<SyncReport> {
  const { gameDir, profile } = task
  const now = options.now ?? Date.now
  const startedAt = now()

  if (!(await isDirectory(fs, gameDir))) {
    throw new SyncError('game-dir-missing', `game directory not found: ${gameDir}`)
  }
  if (!(await isDirectory(fs, addonDir(gameDir, profile.requiredAddon)))) {
    throw new SyncError(
      'required-addon-missing',
      `${profile.requiredAddon} is not installed`,
    )
  }
  const outputDir = outputDirOf(gameDir, profile)
  if (!isInside(gameDir, outputDir)) {
    throw new SyncError('invalid-output', `invalid output directory: ${outputDir}`)
  }
  // Generated addons declare the client's interface version in their toc.
  const client = await readClientInfo(fs, gameDir)
  if (!client) {
    throw new SyncError(
      'client-version-unknown',
      `cannot determine the client version of ${gameDir}`,
    )
  }

  const prepared: { id: string; data: unknown }[] = []
  const failed: AccountFailure[] = []
  for (const id of [...new Set(task.accounts)].sort()) {
    try {
      const source = await loadAccountSourceWithRetry(
        fs,
        gameDir,
        profile,
        id,
        options.retry,
      )
      prepared.push({ id, data: profile.prepare(source) })
    } catch (error) {
      failed.push(toAccountFailure(id, error))
    }
  }

  await removeTempFiles(fs, outputDir)
  const current = await readOutputDir(fs, outputDir)
  const output = profile.render({
    accounts: prepared,
    failed: failed.map((failure) => failure.id),
    existing: toExistingOutput(current),
    client,
  })
  validateOutput(outputDir, output)

  const written: string[] = []
  const unchanged: string[] = []
  const removed: string[] = []
  await fs.mkdir(outputDir)
  for (const file of output.files) {
    const data = encodeUtf8(file.text)
    const previous = current.get(file.name)
    if (previous && bytesEqual(previous, data)) {
      unchanged.push(file.name)
      continue
    }
    await writeFileAtomic(fs, joinPath(outputDir, file.name), data, options.write)
    written.push(file.name)
  }
  for (const name of output.remove) {
    if (!current.has(name)) continue
    await fs.remove(joinPath(outputDir, name))
    removed.push(name)
  }

  return {
    gameDir,
    profileId: profile.id,
    trigger,
    synced: prepared.map((account) => account.id),
    failed,
    written,
    unchanged,
    removed,
    startedAt,
    finishedAt: now(),
  }
}

export type SyncRunner = (
  task: SyncTask,
  trigger: SyncTrigger,
) => Promise<SyncReport>

/** A manual request outranks a startup one, which outranks a watch one. */
const TRIGGER_RANK: Record<SyncTrigger, number> = {
  watch: 0,
  startup: 1,
  manual: 2,
}

/**
 * Serialize sync runs so only one touches the disk at a time. A request for
 * a task that is still waiting (same game directory and profile) joins that
 * run instead of queueing another, and the run uses the newest selection.
 */
export function createSyncQueue(run: SyncRunner): SyncRunner {
  let tail: Promise<unknown> = Promise.resolve()
  const waiting = new Map<
    string,
    { request: { task: SyncTask; trigger: SyncTrigger }; promise: Promise<SyncReport> }
  >()

  return (task, trigger) => {
    const key = `${task.gameDir}\n${task.profile.id}`
    const queued = waiting.get(key)
    if (queued) {
      queued.request.task = task
      if (TRIGGER_RANK[trigger] > TRIGGER_RANK[queued.request.trigger]) {
        queued.request.trigger = trigger
      }
      return queued.promise
    }

    const request = { task, trigger }
    const promise = tail.then(() => {
      waiting.delete(key)
      return run(request.task, request.trigger)
    })
    tail = promise.catch(() => {})
    waiting.set(key, { request, promise })
    return promise
  }
}
