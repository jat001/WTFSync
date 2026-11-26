import { Channel, invoke } from '@tauri-apps/api/core'
import { computed, shallowRef, watch, type Ref } from 'vue'
import { dirname, joinPath, pathKey } from '../core/paths'
import { tauriFs } from '../core/tauri-fs'
import { catalogRequest, type ItemCatalog } from '../lib/item-catalog'
import { catalogRecords, mergeCatalogTables } from '../lib/item-catalog-data'
import { isTauri } from '../lib/tauri'
import type { InventoryItem } from '../profiles/syndicator/inventory'

interface Scopes {
  records: string
  images: string
}

interface CacheData {
  records: Record<string, { tables: ItemCatalog['tables']; incomplete: boolean }>
  icons: ItemCatalog['icons']
  socketFrames: ItemCatalog['icons']
  knownIcons?: number[]
}

type CatalogRequest = ReturnType<typeof catalogRequest>
type ShowCatalog = (catalog: ItemCatalog) => void

const frameIds = [1, 2, 3, 4, 6, 7]
const pending = new Map<string, { promise: Promise<ItemCatalog>; listeners: Set<ShowCatalog> }>()
const emptyCache = (): CacheData => ({ records: {}, icons: {}, socketFrames: {} })
const emptyCatalog = (): ItemCatalog => ({ tables: {}, icons: {}, incomplete: false })

async function clientStamp(dir: string): Promise<Scopes | undefined> {
  const root = dirname(dir)
  const paths = [
    joinPath(dir, '.flavor.info'),
    joinPath(root, '.build.info'),
    joinPath(root, 'Data', 'data'),
    joinPath(dir, 'Cache', 'ADB', 'zhCN', 'DBCache.bin'),
  ]
  const stats = await Promise.all(paths.map((path) => tauriFs.stat(path)))
  if (!stats[0] || !stats[1] || stats.some((info) => info && info.modifiedAt === null)) {
    return undefined
  }
  const signatures = stats.map((info) => (info ? [info.modifiedAt, info.size] : null))
  const images = JSON.stringify([pathKey(dir), ...signatures.slice(0, 3)])
  return { images, records: JSON.stringify([images, signatures[3]]) }
}

function readCache(scopes: Scopes, request: CatalogRequest, frames = true) {
  return invoke<CacheData>('inventory_cache', {
    request: { read: { scopes, ...request, frames } },
  }).catch(emptyCache)
}

function iconIds(catalog: ItemCatalog, extra: number[]) {
  const ids = new Set(extra)
  for (const entry of Object.values(catalog.tables.Item ?? {})) {
    if (typeof entry?.IconFileDataID === 'number' && entry.IconFileDataID > 0) {
      ids.add(entry.IconFileDataID)
    }
  }
  return [...ids]
}

function hasSockets(catalog: ItemCatalog) {
  return Object.values(catalog.tables.ItemSparse ?? {}).some(
    (row) =>
      row?.Gem_properties || (Array.isArray(row?.SocketType) && row.SocketType.some(Boolean)),
  )
}

async function queryCatalog(
  dir: string,
  input: CatalogRequest,
  scopes: Scopes | undefined,
  show: ShowCatalog,
  retry = true,
): Promise<ItemCatalog> {
  const cached = scopes ? await readCache(scopes, input) : emptyCache()
  const base = emptyCatalog()
  const missing = {
    items: input.items.filter((id) => !cached.records['item:' + id]),
    enchants: input.enchants.filter((id) => !cached.records['enchant:' + id]),
  }
  for (const record of Object.values(cached.records)) {
    mergeCatalogTables(base.tables, record.tables)
    base.incomplete ||= record.incomplete
  }
  const missingIcons = iconIds(base, input.icon_ids).filter((id) => cached.icons[id] === undefined)
  const knownIcons = new Set(cached.knownIcons)
  const socketArt =
    hasSockets(base) && frameIds.some((frameId) => cached.socketFrames[frameId] === undefined)

  async function assemble(response = emptyCatalog()) {
    const catalog = emptyCatalog()
    catalog.incomplete = base.incomplete || response.incomplete
    mergeCatalogTables(catalog.tables, base.tables)
    mergeCatalogTables(catalog.tables, response.tables)
    const ids = iconIds(catalog, input.icon_ids)
    const late = ids.filter((id) => knownIcons.has(id) && cached.icons[id] === undefined)
    if (scopes && late.length) {
      const read = await readCache(scopes, { items: [], enchants: [], icon_ids: late }, false)
      Object.assign(cached.icons, read.icons)
    }
    for (const id of ids) {
      const url = response.icons[id] ?? cached.icons[id]
      if (url) catalog.icons[id] = url
    }
    if (hasSockets(catalog)) {
      catalog.socketFrames = {}
      for (const id of frameIds) {
        const url = response.socketFrames?.[id] ?? cached.socketFrames[id]
        if (url) catalog.socketFrames[id] = url
      }
    }
    return catalog
  }

  if (!(missing.items.length || missing.enchants.length || missingIcons.length || socketArt)) {
    return assemble()
  }
  if (Object.keys(cached.records).length || Object.values(cached.icons).some(Boolean)) {
    show(await assemble())
  }

  let finished = false
  const current = () => clientStamp(dir).catch(() => undefined)
  const preview = new Channel<ItemCatalog>((data) => {
    void (async () => {
      if (finished || (scopes && (await current())?.records !== scopes.records)) return
      const catalog = await assemble(data)
      if (!finished) show(catalog)
    })()
  })
  let response: ItemCatalog
  try {
    response = await invoke<ItemCatalog>('inventory_catalog', {
      gameDir: dir,
      stamp: scopes?.records ?? null,
      preview,
      request: {
        ...missing,
        icon_ids: missingIcons,
        known_icons: [...knownIcons],
        known_socket_frames: Object.keys(cached.socketFrames).map(Number),
        socket_art: socketArt,
      },
    })
  } catch (error: unknown) {
    if (!Object.keys(base.tables.ItemSparse ?? {}).length) throw error
    return assemble({ ...emptyCatalog(), incomplete: true })
  } finally {
    finished = true
  }

  const latest = scopes ? await current() : undefined
  if (scopes && latest?.records !== scopes.records) {
    if (!retry) throw new Error('client files changed during catalog read')
    show(emptyCatalog())
    return queryCatalog(dir, input, latest, show, false)
  }

  const catalog = await assemble(response)
  if (scopes) {
    const data = emptyCache()
    const split = catalogRecords(response.tables)
    for (const [kind, ids] of [
      ['item', missing.items],
      ['enchant', missing.enchants],
    ] as const) {
      for (const id of ids) {
        const tables = split(kind, id)
        const incomplete =
          response.incomplete ||
          !(kind === 'item' ? tables.ItemSparse?.[id] : tables.SpellItemEnchantment?.[id])
        data.records[kind + ':' + id] = { tables, incomplete }
        catalog.incomplete ||= incomplete
      }
    }
    for (const id of iconIds(catalog, input.icon_ids)) {
      if (cached.icons[id] === undefined && (!knownIcons.has(id) || response.icons[id])) {
        data.icons[id] = response.icons[id] ?? ''
      }
    }
    if (hasSockets(catalog)) {
      for (const id of frameIds) {
        if (cached.socketFrames[id] === undefined) {
          data.socketFrames[id] = response.socketFrames?.[id] ?? ''
        }
      }
    }
    show(catalog)
    await invoke('inventory_cache', { request: { write: { scopes, data } } }).catch(() => undefined)
  }
  return catalog
}

async function loadCatalog(dir: string, key: string, input: CatalogRequest, show: ShowCatalog) {
  const scopes = await clientStamp(dir).catch(() => undefined)
  const id = JSON.stringify([pathKey(dir), scopes?.records, key])
  const active = pending.get(id)
  if (active) {
    active.listeners.add(show)
    return active.promise
  }
  const listeners = new Set([show])
  const promise = queryCatalog(dir, input, scopes, (catalog) => {
    for (const listener of listeners) listener(catalog)
  })
  pending.set(id, { promise, listeners })
  try {
    return await promise
  } finally {
    pending.delete(id)
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
  const request = computed(() => catalogRequest(items.value, additionalIcons?.value))
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
        const result = await loadCatalog(dir, id, input, (partial) => {
          if (active) catalog.value = partial
        })
        if (active) {
          catalog.value = result
          state.value =
            !input.items.length || Object.keys(result.tables.ItemSparse ?? {}).length
              ? 'available'
              : 'unavailable'
        }
      } catch {
        if (active) state.value = 'unavailable'
      }
    },
    { immediate: true },
  )
  return { catalog, state }
}
