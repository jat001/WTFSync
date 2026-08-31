import { reactive } from 'vue'

export type ThemeMode = 'light' | 'dark' | 'system'

export interface Settings {
  // General
  theme: ThemeMode
  launchAtStartup: boolean
  minimizeToTray: boolean
  autoSync: boolean
  // Sync
  frequency: string
  conflict: 'keep-both' | 'local-wins' | 'remote-wins'
  bandwidth: number
  // Network
  wifiOnly: boolean
  protocol: string
  proxy: string
  // Notification
  notifyDone: boolean
  notifyConflict: boolean
  notifyError: boolean
  sound: string
}

export const defaultSettings: Settings = {
  theme: 'system',
  launchAtStartup: true,
  minimizeToTray: true,
  autoSync: true,
  frequency: '实时',
  conflict: 'keep-both',
  bandwidth: 20,
  wifiOnly: false,
  protocol: '自动（推荐）',
  proxy: '',
  notifyDone: true,
  notifyConflict: true,
  notifyError: true,
  sound: '系统默认',
}

const STORAGE_KEY = 'wtfsync:settings'

// Persisted in localStorage for now; the backend already registers
// tauri-plugin-store, so this can move to plugin-store once its JS
// package is added to package.json.
function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...defaultSettings, ...(JSON.parse(raw) as Settings) }
  } catch {
    // Ignore corrupted data and fall back to defaults.
  }
  return { ...defaultSettings }
}

// Module-level singleton so every page edits the same settings object.
const settings = reactive<Settings>(load())

export function useSettings() {
  /** Persist the current settings. */
  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  }

  /** Restore defaults and persist them. */
  function reset() {
    Object.assign(settings, defaultSettings)
    save()
  }

  /** Discard unsaved edits by reloading the last persisted values. */
  function revert() {
    Object.assign(settings, load())
  }

  return { settings, save, reset, revert }
}
