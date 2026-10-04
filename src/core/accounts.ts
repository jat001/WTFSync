import { errorMessage } from './errors'
import { sleep, type FileSystem } from './fs'
import { LuaParseError } from './lua/ast'
import { parseSavedVariables } from './lua/parser'
import { joinPath } from './paths'
import {
  ProfileDataError,
  type AccountSource,
  type AddonProfile,
  type Character,
  type SourceFile,
} from './profile'
import { decodeUtf8 } from './text'
import { listAccounts, savedVariablesDir } from './wow'

export type AccountFailureReason =
  /** The directory name cannot be used as an output file name. */
  | 'invalid-name'
  /** A required SavedVariables file does not exist. */
  | 'missing-source'
  /** A source file ends early, most likely because the game is writing it. */
  | 'incomplete-source'
  /** A source file is not valid UTF-8 or not valid SavedVariables syntax. */
  | 'invalid-source'
  | 'read-error'
  /** The profile rejected the account's data. */
  | 'invalid-data'

export interface AccountFailure {
  id: string
  reason: AccountFailureReason
  /** Technical detail for logs and tooltips. */
  detail: string
}

export class AccountLoadError extends Error {
  readonly reason: AccountFailureReason

  constructor(reason: AccountFailureReason, detail: string) {
    super(detail)
    this.name = 'AccountLoadError'
    this.reason = reason
  }
}

/** Account directory names become output file names, so keep them plain. */
const ACCOUNT_NAME = /^[0-9A-Za-z#_-]+$/

export function isValidAccountName(id: string): boolean {
  return ACCOUNT_NAME.test(id)
}

export function toAccountFailure(id: string, error: unknown): AccountFailure {
  if (error instanceof AccountLoadError) {
    return { id, reason: error.reason, detail: error.message }
  }
  if (error instanceof ProfileDataError) {
    return { id, reason: 'invalid-data', detail: error.message }
  }
  return { id, reason: 'invalid-data', detail: errorMessage(error) }
}

/** Read and parse every source file a profile needs from one account. */
export async function loadAccountSource(
  fs: FileSystem,
  gameDir: string,
  profile: AddonProfile,
  id: string,
): Promise<AccountSource> {
  if (!isValidAccountName(id)) {
    throw new AccountLoadError('invalid-name', `invalid account name: ${id}`)
  }
  const dir = savedVariablesDir(gameDir, id)
  const files = new Map<string, SourceFile>()
  for (const name of profile.sourceFiles) {
    const path = joinPath(dir, name)
    const info = await fs.stat(path)
    if (!info?.isFile) {
      throw new AccountLoadError('missing-source', `${name} not found`)
    }

    let bytes: Uint8Array
    try {
      bytes = await fs.readFile(path)
    } catch (error) {
      throw new AccountLoadError('read-error', `${name}: ${errorMessage(error)}`)
    }

    try {
      decodeUtf8(bytes)
    } catch {
      throw new AccountLoadError('invalid-source', `${name}: invalid UTF-8`)
    }

    try {
      files.set(name, {
        chunk: parseSavedVariables(bytes),
        modifiedAt: info.modifiedAt,
      })
    } catch (error) {
      if (!(error instanceof LuaParseError)) throw error
      const reason = error.reason === 'eof' ? 'incomplete-source' : 'invalid-source'
      throw new AccountLoadError(reason, `${name}: ${error.message}`)
    }
  }
  return { id, files }
}

export interface RetryOptions {
  /** Extra attempts after the first one. */
  retries?: number
  delayMs?: number
  sleep?: (ms: number) => Promise<void>
}

/**
 * Like `loadAccountSource`, but waits and tries again while a source file
 * looks half-written, since the game may be saving it right now.
 */
export async function loadAccountSourceWithRetry(
  fs: FileSystem,
  gameDir: string,
  profile: AddonProfile,
  id: string,
  { retries = 3, delayMs = 2000, sleep: wait = sleep }: RetryOptions = {},
): Promise<AccountSource> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await loadAccountSource(fs, gameDir, profile, id)
    } catch (error) {
      const incomplete =
        error instanceof AccountLoadError &&
        error.reason === 'incomplete-source'
      if (!incomplete || attempt >= retries) throw error
      await wait(delayMs)
    }
  }
}

export interface AccountInfo {
  id: string
  /** Latest modification time of the source files. */
  modifiedAt: number | null
  characters: Character[]
  /** Why the account cannot be synced, or null when it can. */
  failure: AccountFailure | null
}

/** Every account of a game directory with its characters for a profile. */
export async function scanAccounts(
  fs: FileSystem,
  gameDir: string,
  profile: AddonProfile,
): Promise<AccountInfo[]> {
  const ids = await listAccounts(fs, gameDir)
  return Promise.all(
    ids.map(async (id): Promise<AccountInfo> => {
      try {
        const source = await loadAccountSource(fs, gameDir, profile, id)
        const times = [...source.files.values()]
          .map((file) => file.modifiedAt)
          .filter((time): time is number => time !== null)
        return {
          id,
          modifiedAt: times.length > 0 ? Math.max(...times) : null,
          characters: profile.summarize(source),
          failure: null,
        }
      } catch (error) {
        return {
          id,
          modifiedAt: null,
          characters: [],
          failure: toAccountFailure(id, error),
        }
      }
    }),
  )
}
