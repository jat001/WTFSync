import type { LuaChunk } from './lua/ast'
import type { ClientInfo } from './wow'

/** One character shown in the account list. */
export interface Character {
  realm: string
  name: string
  /** Uppercase class token such as `PALADIN`. */
  classFile?: string
  level?: number
  faction?: string
  itemLevel?: number
}

export interface SourceFile {
  chunk: LuaChunk
  modifiedAt: number | null
}

/** The SavedVariables files of one account, keyed by file name. */
export interface AccountSource {
  id: string
  files: Map<string, SourceFile>
}

/** Text files currently in a profile's output directory, keyed by name. */
export interface ExistingOutput {
  files: Map<string, string>
}

export interface RenderInput<TPrepared> {
  /** Accounts prepared successfully this time, sorted by id. */
  accounts: { id: string; data: TPrepared }[]
  /** Selected accounts that could not be loaded or prepared this time. */
  failed: string[]
  existing: ExistingOutput
  /** The installed game client, e.g. for the toc's `## Interface`. */
  client: ClientInfo
}

export interface RenderOutput {
  /** Desired files, written in this order when their content changed. */
  files: { name: string; text: string }[]
  /** Stale files to delete. Files in neither list are left untouched. */
  remove: string[]
}

/**
 * Describes how one addon's data is synced across accounts.
 *
 * The core layer discovers accounts, reads and parses their SavedVariables,
 * watches them and writes the output atomically. A profile only decides what
 * to extract and which files to generate, so supporting another addon means
 * adding a profile, not touching the core.
 */
export interface AddonProfile<TPrepared = unknown> {
  /** Stable identifier used in settings, e.g. `biaoge`. */
  readonly id: string
  /** Name shown in the UI. */
  readonly name: string
  /** Folder under Interface/AddOns that must be installed for the output to work. */
  readonly requiredAddon: string
  /** Account-level SavedVariables files to read and watch. All are required. */
  readonly sourceFiles: readonly string[]
  /** Output directory relative to the game directory; all writes stay inside it. */
  readonly outputDir: string

  /** Characters of one account, for the account list. */
  summarize(source: AccountSource): Character[]
  /**
   * Extract what `render` needs from one account. Throwing marks only this
   * account as failed; the others are still synced.
   */
  prepare(source: AccountSource): TPrepared
  /** Build the complete output for the selected accounts. Must be pure. */
  render(input: RenderInput<TPrepared>): RenderOutput
  /**
   * Accounts contained in an existing output, possibly produced by another
   * tool. Used to show sync status and to import a previous selection.
   */
  syncedAccounts?(existing: ExistingOutput): string[]
}

/** Thrown by a profile when an account's data is unusable. */
export class ProfileDataError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProfileDataError'
  }
}
