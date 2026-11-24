import { ref, shallowRef, watch, type Ref } from 'vue'
import { errorMessage } from '../core/errors'
import { tauriFs } from '../core/tauri-fs'
import { watchSources, type SourceWatch } from '../core/watcher'
import { listAccounts } from '../core/wow'
import { isTauri } from '../lib/tauri'
import { syndicator } from '../profiles/syndicator/inventory'
import { createInventoryLoader } from '../profiles/syndicator/load'
import { settingsReady } from './useSettings'

const inventoryLoader = createInventoryLoader(tauriFs)

export function useInventory(dir: Readonly<Ref<string>>) {
  const revision = ref(0)
  const data = shallowRef<Awaited<ReturnType<typeof inventoryLoader.load>>>()
  const loading = ref(false)
  const error = ref('')
  const watchFailed = ref(false)
  watch(
    [dir, revision],
    async ([path, version], previous, onCleanup) => {
      let active = true
      let queued = false
      let reading = false
      let handle: SourceWatch | undefined
      const changedPaths = new Set<string>()
      let force = previous?.[1] !== undefined && version !== previous[1]
      onCleanup(() => {
        active = false
        handle?.stop()
      })
      if (path !== previous?.[0]) data.value = undefined
      error.value = ''
      watchFailed.value = false
      loading.value = Boolean(path && isTauri)
      if (!loading.value) return
      try {
        await settingsReady
        if (!active) return
        const accounts = await listAccounts(tauriFs, path)
        if (!active) return
        async function read(paths: readonly string[] = []) {
          if (!active) return
          for (const changed of paths) changedPaths.add(changed)
          queued = true
          if (reading) return
          reading = true
          loading.value = true
          try {
            while (active && queued) {
              queued = false
              if (force) {
                inventoryLoader.invalidateAccounts(path, accounts)
                force = false
              }
              inventoryLoader.invalidate(changedPaths)
              changedPaths.clear()
              const next = await inventoryLoader.load(path, accounts)
              if (active) {
                // Keep the last readable snapshot if an account is temporarily malformed.
                for (const failure of next.failures) {
                  const saved = data.value?.accounts.find((item) => item.account === failure.id)
                  if (saved) next.accounts.push(saved)
                }
                next.accounts.sort(
                  (a, b) =>
                    (b.modifiedAt ?? 0) - (a.modifiedAt ?? 0) || a.account.localeCompare(b.account),
                )
                data.value = next
              }
            }
          } finally {
            reading = false
            if (active) loading.value = false
          }
        }
        try {
          handle = await watchSources(
            tauriFs,
            [{ gameDir: path, accounts, profile: syndicator }],
            (_, paths) => void read(paths),
          )
        } catch {
          if (active) watchFailed.value = true
        }
        if (!active) {
          handle?.stop()
          return
        }
        await read()
      } catch (cause) {
        if (active) {
          error.value = errorMessage(cause)
          loading.value = false
        }
      }
    },
    { immediate: true },
  )
  return { data, loading, error, watchFailed, reload: () => revision.value++ }
}
