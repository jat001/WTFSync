import { Store } from '@tauri-apps/plugin-store'
import { reactive, watch } from 'vue'
import { z } from 'zod'

import { joinPath, pathKey } from '../core/paths'
import { allowFsDirectories } from '../lib/fs'
import { isTauri } from '../lib/tauri'

const inventorySelectionSchema = z.object({
  account: z.string(),
  characters: z.record(z.string(), z.string()).catch({}),
})

/**
 * Settings schema: every key carries a `.catch(default)` so that any
 * missing/invalid value in the persisted store transparently falls back
 * to its default, and unknown keys are stripped during parsing.
 * Stored values are English; Chinese labels live in the UI layer only.
 */
export const settingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).catch('system'),
  // WoW install root, e.g. "D:\Games\World of Warcraft". fs access is
  // granted to it at runtime.
  wowRoot: z.string().catch(''),
  // Flavor directory under the root, e.g. "_classic_titan_".
  flavor: z.string().catch(''),
  // Resync whenever a selected account's SavedVariables change.
  autoSync: z.boolean().catch(true),
  // Selected accounts keyed by the full game directory and profile ID.
  // A missing key lets the sync layer import a selection from existing output.
  selections: z.record(z.string(), z.array(z.string())).catch({}),
  // Last inventory account per game directory and last character per account.
  inventorySelections: z.record(z.string(), inventorySelectionSchema).catch({}),
})

export type Settings = z.infer<typeof settingsSchema>
export type ThemeMode = Settings['theme']

// Parsing an empty object produces the fully-populated default values.
export const defaultSettings: Settings = settingsSchema.parse({})

const STORE_FILE = 'settings.json'
const STORE_KEY = 'settings'
const STORAGE_KEY = 'wtfsync:settings'

// Reuse one Store handle; every load targets the same backing file.
let storePromise: Promise<Store> | null = null
function getStore(): Promise<Store> {
  storePromise ??= Store.load(STORE_FILE)
  return storePromise
}

export function accountSelectionKey(gameDir: string, profileId: string): string {
  return `${pathKey(gameDir)}/${profileId}`
}

/** Legacy selections had no install path. Assign them to the saved root. */
function migrateSelections(value: Settings): Settings {
  const selections = { ...value.selections }
  for (const [key, ids] of Object.entries(value.selections)) {
    const legacy = /^(_[^/]+_)\/([^/]+)$/.exec(key)
    if (!legacy) continue
    const [, flavor, profileId] = legacy
    if (value.wowRoot) {
      const gameDir = joinPath(value.wowRoot, flavor)
      selections[accountSelectionKey(gameDir, profileId)] ??= ids
    }
    delete selections[key]
  }
  return { ...value, selections }
}

/** Read & validate the persisted settings, falling back to defaults. */
async function readPersisted(): Promise<Settings> {
  let raw: unknown = null
  if (isTauri) {
    raw = await (await getStore()).get(STORE_KEY)
  } else {
    // Browser fallback for `pnpm dev` outside the Tauri webview.
    try {
      const value = localStorage.getItem(STORAGE_KEY)
      if (value) raw = JSON.parse(value)
    } catch {
      // Corrupted data is treated as absent.
    }
  }
  return migrateSelections(settingsSchema.parse(raw ?? {}))
}

async function writePersisted(value: Settings): Promise<void> {
  if (isTauri) {
    const store = await getStore()
    await store.set(STORE_KEY, value)
    await store.save()
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  }
}

// Module-level singleton so every page edits the same settings object.
// It starts from defaults and hydrates asynchronously from the store.
const settings = reactive<Settings>({ ...defaultSettings })
let hydrated = false

// Coalesce rapid edits (e.g. ticking several accounts) into one write.
let writeTimer: ReturnType<typeof setTimeout> | undefined
function schedulePersist() {
  if (!hydrated) return
  clearTimeout(writeTimer)
  writeTimer = setTimeout(() => {
    void writePersisted({ ...settings })
  }, 300)
}

// Persist automatically on any change once hydration is done.
watch(settings, schedulePersist, { deep: true })

/** Resolves once the persisted settings have been loaded and validated. */
export const settingsReady: Promise<void> = (async () => {
  Object.assign(settings, await readPersisted())
  hydrated = true
  // Grant fs access to the persisted game directory on launch. Globs are
  // matched at access time on the backend, so subdirectories and files
  // created later are covered without re-authorizing.
  if (isTauri && settings.wowRoot) {
    await allowFsDirectories([settings.wowRoot])
  }
})()

export function useSettings() {
  /** Restore defaults; the watcher persists them automatically. */
  function reset() {
    Object.assign(settings, defaultSettings)
  }

  return { settings, reset }
}
