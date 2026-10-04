import { computed, ref, shallowRef, watch } from 'vue'

import { scanAccounts, type AccountInfo } from '../core/accounts'
import {
  createSyncQueue,
  outputDirOf,
  readExistingOutput,
  runSync,
  type SyncReport,
  type SyncTask,
  type SyncTrigger,
} from '../core/engine'
import { errorMessage } from '../core/errors'
import { isDirectory } from '../core/fs'
import { joinPath } from '../core/paths'
import type { AddonProfile } from '../core/profile'
import { tauriFs } from '../core/tauri-fs'
import { watchSources, type SourceWatch } from '../core/watcher'
import { addonDir, listFlavors, resolveGameDir, type Flavor } from '../core/wow'
import { allowFsDirectories } from '../lib/fs'
import { describeSyncError } from '../lib/sync-text'
import { isTauri } from '../lib/tauri'
import { profiles } from '../profiles'
import { settingsReady, useSettings } from './useSettings'

/** What is known about one profile in the current game directory. */
export interface ProfileStatus {
  accounts: AccountInfo[]
  /** Whether the addon the output depends on is installed. */
  requiredAddonInstalled: boolean
  /** Whether the output directory exists. */
  outputExists: boolean
  /** Accounts contained in the current output, whoever generated it. */
  syncedAccounts: string[]
}

export interface ActivityEntry {
  id: number
  profileId: string
  trigger: SyncTrigger
  at: number
  report: SyncReport | null
  /** User-facing message when the whole sync failed. */
  error: string | null
}

export interface SyncOutcome {
  profile: AddonProfile
  report: SyncReport | null
  error: string | null
}

const MAX_ACTIVITY = 50
/** Settle time before re-creating watches after settings change. */
const REWATCH_DELAY_MS = 300

const fs = tauriFs
const { settings } = useSettings()

// Module-level singletons shared by every component (as in useModal.ts).
const flavors = ref<Flavor[]>([])
const statuses = ref<Record<string, ProfileStatus>>({})
const scanning = ref(false)
const scanError = ref<string | null>(null)
const runningCount = ref(0)
const activity = ref<ActivityEntry[]>([])
const sourceWatch = shallowRef<SourceWatch | null>(null)
const watchError = ref<string | null>(null)

const gameDir = computed(() =>
  settings.wowRoot && settings.flavor
    ? joinPath(settings.wowRoot, settings.flavor)
    : '',
)

function selectionKey(profile: AddonProfile): string {
  return `${settings.flavor}/${profile.id}`
}

function selectedAccounts(profile: AddonProfile): string[] {
  return settings.selections[selectionKey(profile)] ?? []
}

function setSelectedAccounts(profile: AddonProfile, ids: string[]): void {
  settings.selections = {
    ...settings.selections,
    [selectionKey(profile)]: [...new Set(ids)].sort(),
  }
}

function toggleAccount(profile: AddonProfile, id: string, selected: boolean) {
  const ids = selectedAccounts(profile).filter((x) => x !== id)
  setSelectedAccounts(profile, selected ? [...ids, id] : ids)
}

/** Profiles with selected accounts, as tasks for the current game dir. */
const tasks = computed<SyncTask[]>(() => {
  if (!gameDir.value) return []
  return profiles
    .map((profile) => ({
      gameDir: gameDir.value,
      profile,
      accounts: selectedAccounts(profile),
    }))
    .filter((task) => task.accounts.length > 0)
})

let nextActivityId = 1
function record(entry: Omit<ActivityEntry, 'id'>): void {
  activity.value = [{ id: nextActivityId++, ...entry }, ...activity.value].slice(
    0,
    MAX_ACTIVITY,
  )
}

const queue = createSyncQueue(async (task, trigger) => {
  runningCount.value++
  try {
    const report = await runSync(fs, task, trigger)
    record({
      profileId: task.profile.id,
      trigger,
      at: report.finishedAt,
      report,
      error: null,
    })
    return report
  } catch (error) {
    record({
      profileId: task.profile.id,
      trigger,
      at: Date.now(),
      report: null,
      error: describeSyncError(error, task.profile),
    })
    throw error
  } finally {
    runningCount.value--
    // Sources may have changed (watch) and the output certainly did.
    void refresh()
  }
})

/**
 * Sync profiles of the current game directory. A manual sync also covers a
 * profile whose selection was emptied but whose output still lists
 * accounts, so deselecting everything clears the output too.
 */
async function sync(
  trigger: SyncTrigger,
  only?: AddonProfile,
): Promise<SyncOutcome[]> {
  if (!isTauri || !gameDir.value) return []
  const targets = profiles.filter((profile) => {
    if (only && profile.id !== only.id) return false
    if (selectedAccounts(profile).length > 0) return true
    return trigger === 'manual' && !!statuses.value[profile.id]?.syncedAccounts.length
  })
  return Promise.all(
    targets.map(async (profile): Promise<SyncOutcome> => {
      const task = {
        gameDir: gameDir.value,
        profile,
        accounts: selectedAccounts(profile),
      }
      try {
        return { profile, report: await queue(task, trigger), error: null }
      } catch (error) {
        return { profile, report: null, error: describeSyncError(error, profile) }
      }
    }),
  )
}

async function loadStatus(dir: string, profile: AddonProfile): Promise<ProfileStatus> {
  const [accounts, requiredAddonInstalled, existing] = await Promise.all([
    scanAccounts(fs, dir, profile),
    isDirectory(fs, addonDir(dir, profile.requiredAddon)),
    readExistingOutput(fs, dir, profile),
  ])
  return {
    accounts,
    requiredAddonInstalled,
    outputExists: existing !== null,
    syncedAccounts: existing ? (profile.syncedAccounts?.(existing) ?? []) : [],
  }
}

/**
 * Adopt the accounts an existing output contains (e.g. one generated by
 * BiaoGeUpdater) when the user has never chosen accounts for this profile.
 */
function importSelection(profile: AddonProfile, status: ProfileStatus): void {
  if (selectionKey(profile) in settings.selections) return
  const known = new Set(status.accounts.map((account) => account.id))
  const ids = status.syncedAccounts.filter((id) => known.has(id))
  if (ids.length > 0) setSelectedAccounts(profile, ids)
}

let refreshToken = 0
/** Re-read flavors, accounts and output status of the game directory. */
async function refresh(): Promise<void> {
  if (!isTauri) return
  const token = ++refreshToken
  scanning.value = true
  try {
    const dir = gameDir.value
    const nextFlavors = settings.wowRoot ? await listFlavors(fs, settings.wowRoot) : []
    const next: Record<string, ProfileStatus> = {}
    if (dir) {
      for (const profile of profiles) {
        next[profile.id] = await loadStatus(dir, profile)
      }
    }
    if (token !== refreshToken) return
    flavors.value = nextFlavors
    statuses.value = next
    scanError.value = null
    for (const profile of profiles) {
      const status = next[profile.id]
      if (status) importSelection(profile, status)
    }
  } catch (error) {
    if (token === refreshToken) scanError.value = errorMessage(error)
  } finally {
    if (token === refreshToken) scanning.value = false
  }
}

let watchToken = 0
/** Re-create source watches for the current tasks. */
async function rewatch(): Promise<void> {
  const token = ++watchToken
  sourceWatch.value?.stop()
  sourceWatch.value = null
  watchError.value = null
  if (!isTauri || !settings.autoSync || tasks.value.length === 0) return
  try {
    const handle = await watchSources(fs, tasks.value, (changed) => {
      // Use the current selection; the watch may predate a change.
      const task = tasks.value.find((t) => t.profile.id === changed.profile.id)
      if (task) void queue(task, 'watch').catch(() => {})
    })
    if (token === watchToken) {
      sourceWatch.value = handle
    } else {
      handle.stop()
    }
  } catch (error) {
    if (token === watchToken) watchError.value = errorMessage(error)
  }
}

/**
 * Use a directory picked by the user, either the WoW install root or one
 * flavor directory in it. Throws with a user-facing message when it is not
 * a WoW installation.
 */
async function chooseGameDirectory(path: string): Promise<void> {
  if (!isTauri) return
  const failed = await allowFsDirectories([path])
  if (failed.length > 0) throw new Error('无法访问所选目录')
  const { root, flavor } = await resolveGameDir(fs, path)
  if (root !== path && (await allowFsDirectories([root])).length > 0) {
    throw new Error('无法访问魔兽世界安装目录')
  }
  const found = await listFlavors(fs, root)
  if (found.length === 0) {
    throw new Error('所选目录中没有找到魔兽世界的游戏版本')
  }
  settings.wowRoot = root
  settings.flavor =
    flavor ?? found.find((f) => f.dir === settings.flavor)?.dir ?? found[0]?.dir ?? ''
}

let started = false
function start(): void {
  if (started) return
  started = true
  void (async () => {
    await settingsReady
    if (!isTauri) return
    await refresh()
    // Catch up on saves made while the app was not running.
    if (settings.autoSync) await sync('startup')

    watch(gameDir, () => void refresh())
    let timer: ReturnType<typeof setTimeout> | undefined
    watch(
      () => [
        settings.autoSync,
        tasks.value.map((t) => [t.gameDir, t.profile.id, ...t.accounts].join('\n')),
      ],
      () => {
        clearTimeout(timer)
        timer = setTimeout(() => void rewatch(), REWATCH_DELAY_MS)
      },
      { deep: true },
    )
    await rewatch()
  })()
}

export function useSync() {
  start()

  const running = computed(() => runningCount.value > 0)
  const lastActivity = computed(() => activity.value[0] ?? null)
  const watchedAccounts = computed(
    () => sourceWatch.value?.watchedDirs.length ?? 0,
  )

  function outputDir(profile: AddonProfile): string {
    return gameDir.value ? outputDirOf(gameDir.value, profile) : ''
  }

  return {
    profiles,
    gameDir,
    flavors,
    statuses,
    scanning,
    scanError,
    running,
    activity,
    lastActivity,
    sourceWatch,
    watchedAccounts,
    watchError,
    selectedAccounts,
    setSelectedAccounts,
    toggleAccount,
    chooseGameDirectory,
    refresh,
    sync,
    outputDir,
  }
}
