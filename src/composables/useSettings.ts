import { Store } from '@tauri-apps/plugin-store'
import { reactive, watch } from 'vue'
import { z } from 'zod'

import { allowFsDirectories } from '../lib/fs'
import { isTauri } from '../lib/tauri'

/**
 * Settings schema: every key carries a `.catch(default)` so that any
 * missing/invalid value in the persisted store transparently falls back
 * to its default, and unknown keys are stripped during parsing.
 * Stored values are English; Chinese labels live in the UI layer only.
 */
export const settingsSchema = z.object({
  // General
  theme: z.enum(['light', 'dark', 'system']).catch('system'),
  launchAtStartup: z.boolean().catch(true),
  minimizeToTray: z.boolean().catch(true),
  autoSync: z.boolean().catch(true),
  // Sync
  frequency: z.enum(['realtime', '5min', '30min', 'hourly']).catch('realtime'),
  conflict: z
    .enum(['keep-both', 'local-wins', 'remote-wins'])
    .catch('keep-both'),
  bandwidth: z.number().catch(20),
  // Network
  wifiOnly: z.boolean().catch(false),
  protocol: z.enum(['auto', 'encrypted', 'relay']).catch('auto'),
  proxy: z.string().catch(''),
  // Notification
  notifyDone: z.boolean().catch(true),
  notifyConflict: z.boolean().catch(true),
  notifyError: z.boolean().catch(true),
  sound: z.enum(['system', 'chime', 'none']).catch('system'),
  // Folders watched for sync; fs access is granted to them at runtime.
  watchPaths: z.array(z.string()).catch([]),
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
  return settingsSchema.parse(raw ?? {})
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

// Coalesce rapid edits (e.g. dragging the bandwidth slider) into one write.
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
  // Grant fs access to persisted watch directories on launch. Globs are
  // matched at access time on the backend, so subdirectories and files
  // created later are covered without re-authorizing.
  if (isTauri) {
    await allowFsDirectories([...settings.watchPaths])
  }
})()

export function useSettings() {
  /** Restore defaults; the watcher persists them automatically. */
  function reset() {
    Object.assign(settings, defaultSettings)
  }

  return { settings, reset }
}
