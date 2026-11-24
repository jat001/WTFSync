import { invoke } from '@tauri-apps/api/core'
import { computed, shallowRef, watch, type Ref } from 'vue'

import { BoundedCache } from '../core/bounded-cache'
import { dirname, joinPath, pathKey } from '../core/paths'
import { tauriFs } from '../core/tauri-fs'
import { catalogRequest, type ItemCatalog } from '../lib/item-catalog'
import { CatalogImageCache } from '../lib/item-catalog-cache'
import { catalogRecords, mergeCatalogTables } from '../lib/item-catalog-data'
import { isTauri } from '../lib/tauri'
import type { InventoryItem } from '../profiles/syndicator/inventory'

interface CachedRecord {
  tables: ItemCatalog['tables']
  incomplete: boolean
  expiresAt: number
}

const records = new BoundedCache<string, CachedRecord>(16_384, 32 * 1024 * 1024)
const images = new CatalogImageCache(16_384, 64 * 1024 * 1024)
const frameIds = [1, 2, 3, 4, 6, 7]
const pending = new Map<string, Promise<ItemCatalog>>()
const directoryPrefix = (dir: string) => pathKey(dir) + '\0'

async function clientStamp(dir: string) {
  const root = dirname(dir)
  const paths = [
    joinPath(dir, '.flavor.info'),
    joinPath(root, '.build.info'),
    joinPath(dir, 'Cache', 'ADB', 'zhCN', 'DBCache.bin'),
    joinPath(root, 'Data', 'data'),
  ]
  const stats = await Promise.all(paths.map((path) => tauriFs.stat(path)))
  if (stats.some((info) => info && info.modifiedAt === null)) return undefined
  return JSON.stringify(stats.map((info) => (info ? [info.modifiedAt, info.size] : null)))
}

async function loadCatalog(
  dir: string,
  key: string,
  request: ReturnType<typeof catalogRequest> & { icon_ids: number[] },
): Promise<ItemCatalog> {
  const read = (input: typeof request) =>
    invoke<ItemCatalog>('inventory_catalog', { gameDir: dir, request: input })
  const stamp = await clientStamp(dir).catch(() => undefined)
  if (stamp === undefined) return read(request)
  const scope = directoryPrefix(dir) + stamp + '\0'
  const id = scope + key
  const active = pending.get(id)
  if (active) return active

  const isCurrent = () => pending.get(id) === load
  const load: Promise<ItemCatalog> = (async () => {
    const catalog: ItemCatalog = { tables: {}, icons: {}, incomplete: false }
    const data = [
      { kind: 'item', ids: request.items },
      { kind: 'enchant', ids: request.enchants },
    ] as const
    const missing = data.map(({ kind, ids }) =>
      ids.filter((recordId) => {
        const record = records.get(scope + kind + ':' + recordId)
        if (!record || record.expiresAt <= Date.now()) return true
        mergeCatalogTables(catalog.tables, record.tables)
        catalog.incomplete ||= record.incomplete
        return false
      }),
    )
    const iconIds = () => {
      const ids = new Set(request.icon_ids)
      for (const entry of Object.values(catalog.tables.Item ?? {})) {
        if (typeof entry?.IconFileDataID === 'number' && entry.IconFileDataID > 0) {
          ids.add(entry.IconFileDataID)
        }
      }
      return [...ids]
    }
    const hasSockets = () =>
      Object.values(catalog.tables.ItemSparse ?? {}).some(
        (row) =>
          row?.Gem_properties || (Array.isArray(row?.SocketType) && row.SocketType.some(Boolean)),
      )

    const missingIcons = iconIds().filter(
      (iconId) => images.get(scope, 'icon', iconId) === undefined,
    )
    const socketArt =
      hasSockets() && frameIds.some((frameId) => images.get(scope, 'frame', frameId) === undefined)
    let response: ItemCatalog | undefined
    let knownIcons: ItemCatalog['icons'] = {}
    let knownFrames: ItemCatalog['icons'] = {}
    if (missing.some((ids) => ids.length) || missingIcons.length || socketArt) {
      knownIcons = images.known(scope, 'icon')
      knownFrames = images.known(scope, 'frame')
      const input = {
        items: missing[0],
        enchants: missing[1],
        icon_ids: missingIcons,
        known_icons: Object.keys(knownIcons).map(Number),
        known_socket_frames: Object.keys(knownFrames).map(Number),
        socket_art: socketArt,
      }
      response = await read(input).catch((error: unknown) => {
        if (!Object.keys(catalog.tables.ItemSparse ?? {}).length) throw error
        catalog.incomplete = true
        return undefined
      })
    }
    if (response) {
      // Do not combine old images with rows from a client patched during the read.
      if ((await clientStamp(dir).catch(() => undefined)) !== stamp) return read(request)

      const split = catalogRecords(response.tables)
      for (const [index, { kind }] of data.entries()) {
        for (const recordId of missing[index]) {
          const tables = split(kind, recordId)
          const incomplete =
            response.incomplete ||
            !(kind === 'item'
              ? tables.ItemSparse?.[recordId]
              : tables.SpellItemEnchantment?.[recordId])
          catalog.incomplete ||= incomplete
          mergeCatalogTables(catalog.tables, tables)
          if (isCurrent()) {
            const recordKey = scope + kind + ':' + recordId
            const size = 2 * (recordKey.length + JSON.stringify(tables).length)
            records.set(
              recordKey,
              { tables, incomplete, expiresAt: incomplete ? Date.now() + 30_000 : Infinity },
              size,
            )
          }
        }
      }
    }
    for (const iconId of iconIds()) {
      let url = response?.icons[iconId] ?? knownIcons[iconId] ?? images.get(scope, 'icon', iconId)
      if (response && knownIcons[iconId] === undefined && isCurrent()) {
        url = images.set(scope, 'icon', iconId, url ?? '')
      }
      if (url) catalog.icons[iconId] = url
    }
    if (hasSockets()) {
      catalog.socketFrames = {}
      for (const frameId of frameIds) {
        let url =
          response?.socketFrames?.[frameId] ??
          knownFrames[frameId] ??
          images.get(scope, 'frame', frameId)
        if (response && knownFrames[frameId] === undefined && isCurrent()) {
          url = images.set(scope, 'frame', frameId, url ?? '')
        }
        if (url) catalog.socketFrames[frameId] = url
      }
    }
    return catalog
  })()
  pending.set(id, load)
  try {
    return await load
  } finally {
    if (pending.get(id) === load) pending.delete(id)
  }
}

export function useItemCatalog(
  gameDir: Readonly<Ref<string>>,
  items: Readonly<Ref<InventoryItem[]>>,
  inventoryData: Readonly<Ref<unknown>>,
  additionalIcons?: Readonly<Ref<number[]>>,
) {
  const catalog = shallowRef<ItemCatalog>()
  const state = shallowRef<'loading' | 'available' | 'unavailable' | 'idle'>('idle')
  const request = computed(() => ({
    ...catalogRequest(items.value),
    icon_ids: additionalIcons?.value ?? [],
  }))
  const key = computed(() => JSON.stringify(request.value))
  watch(
    [gameDir, key, inventoryData],
    async ([dir, id], previous, onCleanup) => {
      let active = true
      onCleanup(() => {
        active = false
      })
      if (dir !== previous?.[0] || id !== previous?.[1]) {
        catalog.value = undefined
        state.value = 'idle'
      }
      const input = request.value
      if (!dir || !isTauri || (!input.items.length && !input.icon_ids.length)) return
      if (!catalog.value) state.value = 'loading'
      try {
        const result = await loadCatalog(dir, id, input)
        if (active) {
          catalog.value = result
          state.value =
            !input.items.length || Object.keys(result.tables.ItemSparse ?? {}).length
              ? 'available'
              : 'unavailable'
        }
      } catch {
        if (active) {
          catalog.value = undefined
          state.value = 'unavailable'
        }
      }
    },
    { immediate: true },
  )
  function invalidate() {
    const prefix = directoryPrefix(gameDir.value)
    for (const key of records.keys()) if (key.startsWith(prefix)) records.delete(key)
    images.deletePrefix(prefix)
    for (const key of pending.keys()) if (key.startsWith(prefix)) pending.delete(key)
  }
  return { catalog, state, invalidate }
}
