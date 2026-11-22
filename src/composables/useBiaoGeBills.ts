import { Store } from '@tauri-apps/plugin-store'
import { computed, ref, shallowRef, watch } from 'vue'

import { toAccountFailure, type AccountFailure } from '../core/accounts'
import { pathKey } from '../core/paths'
import { tauriFs } from '../core/tauri-fs'
import { watchSources } from '../core/watcher'
import { isTauri } from '../lib/tauri'
import { biaoge, loadBiaoGeBills } from '../profiles/biaoge'
import {
  archiveCurrentBill,
  billHistoriesSchema,
  emptyBillHistory,
  recordBillSnapshots,
  type BillHistory,
} from '../profiles/biaoge/bill-history'
import type { RaidBill } from '../profiles/biaoge/bills'
import { useSync } from './useSync'

const source = shallowRef<{ dir: string; bills: RaidBill[]; failures: AccountFailure[] }>()
const histories = shallowRef<Record<string, BillHistory>>({})
const loading = ref(false)
const watchFailed = ref(false)
const storageFailed = ref(false)

let started = false
let store: Store | undefined
let dirty = false
let queue = Promise.resolve()

function enqueue<T>(work: () => Promise<T>): Promise<T> {
  const result = queue.then(work)
  queue = result.then(
    () => {},
    () => {},
  )
  return result
}

async function loadStore(): Promise<Store> {
  if (store) return store
  const next = await Store.load('bill-history.json', { autoSave: false })
  histories.value = billHistoriesSchema.parse((await next.get('installations')) ?? {})
  store = next
  return next
}

async function updateHistory(
  dir: string,
  update: (previous: BillHistory) => BillHistory,
): Promise<void> {
  const target = await loadStore()
  const key = pathKey(dir)
  const previous = histories.value[key] ?? emptyBillHistory
  const next = update(previous)
  if (next !== previous) {
    histories.value = { ...histories.value, [key]: next }
    dirty = true
  }
  if (dirty) {
    try {
      await target.set('installations', histories.value)
      await target.save()
      dirty = false
    } catch (error) {
      storageFailed.value = true
      throw error
    }
  }
}

export function useBiaoGeBills() {
  const { gameDir, statuses } = useSync()
  const profileStatus = computed(() => statuses.value[biaoge.id])
  const accounts = computed(() => profileStatus.value?.accounts.map(({ id }) => id) ?? [])

  if (!started && isTauri) {
    started = true
    let latestCapture = 0

    function capture(dir: string, ids: readonly string[]) {
      const captureId = ++latestCapture
      loading.value = Boolean(dir && ids.length)
      if (!loading.value) {
        source.value = undefined
        return
      }
      void enqueue(async () => {
        if (gameDir.value !== dir) return
        try {
          const results = await Promise.all(
            ids.map(async (id) => {
              try {
                return { snapshot: await loadBiaoGeBills(tauriFs, dir, id) }
              } catch (error) {
                const failure = toAccountFailure(id, error)
                return { failure: failure.reason === 'missing-source' ? undefined : failure }
              }
            }),
          )
          const snapshots = results.flatMap(({ snapshot }) => (snapshot ? [snapshot] : []))
          if (dir === gameDir.value) {
            source.value = {
              dir,
              bills: snapshots.flatMap(({ bills }) => bills),
              failures: results.flatMap(({ failure }) => (failure ? [failure] : [])),
            }
          }
          try {
            await updateHistory(dir, (previous) => recordBillSnapshots(previous, snapshots))
            storageFailed.value = false
          } catch {
            storageFailed.value = true
          }
        } finally {
          if (captureId === latestCapture) loading.value = false
        }
      }).catch(() => {
        storageFailed.value = true
      })
    }

    // Load archived bills even when the selected installation has no source accounts.
    void enqueue(loadStore).catch(() => {
      storageFailed.value = true
    })
    watch([gameDir, profileStatus], ([dir]) => capture(dir, accounts.value), { immediate: true })
    watch(
      () => JSON.stringify([gameDir.value, accounts.value]),
      async (_, __, onCleanup) => {
        const dir = gameDir.value
        const ids = accounts.value
        let stopped = false
        let stop: (() => void) | undefined
        onCleanup(() => {
          stopped = true
          stop?.()
        })
        watchFailed.value = false
        if (!dir || !ids.length) return
        try {
          const handle = await watchSources(
            tauriFs,
            [{ gameDir: dir, profile: biaoge, accounts: ids }],
            () => {
              if (!stopped) capture(dir, ids)
            },
          )
          if (stopped) handle.stop()
          else {
            stop = () => handle.stop()
            // Reconcile any changes between the initial read and watch registration.
            capture(dir, ids)
          }
        } catch {
          if (!stopped) watchFailed.value = true
        }
      },
      { immediate: true },
    )
  }

  const current = computed(() => (source.value?.dir === gameDir.value ? source.value : undefined))
  const allBills = computed(() => [
    ...(current.value?.bills ?? []),
    ...Object.values(histories.value[pathKey(gameDir.value)]?.archived ?? {}),
  ])

  function saveBill(bill: RaidBill): Promise<void> {
    const dir = gameDir.value
    return enqueue(async () => {
      await updateHistory(dir, (previous) => archiveCurrentBill(previous, bill))
      storageFailed.value = false
    })
  }

  return { allBills, current, loading, watchFailed, storageFailed, saveBill }
}
