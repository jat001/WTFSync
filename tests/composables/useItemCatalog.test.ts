import { expect, it, vi } from 'vite-plus/test'
import { effectScope, shallowRef } from 'vue'
import { itemIcon, type ItemCatalog } from '../../src/lib/item-catalog'
import { MemoryFileSystem } from '../helpers/memory-fs'

const fs = new MemoryFileSystem()
const native = vi.fn()
const records = new Map<string, Record<string, unknown>>()
const images = new Map<string, ItemCatalog['icons']>()
const invoke = vi.fn((command, { request, ...args }) => {
  if (command === 'inventory_catalog') return native({ request, ...args })
  if (request.write) {
    const { scopes, data } = request.write
    records.set(scopes.records, { ...records.get(scopes.records), ...data.records })
    images.set(scopes.images, { ...images.get(scopes.images), ...data.icons })
    return Promise.resolve({})
  }
  const { scopes, items, enchants, icon_ids } = request.read
  const rows = records.get(scopes.records) ?? {}
  const icons = images.get(scopes.images) ?? {}
  const keys = [
    ...items.map((id: number) => 'item:' + id),
    ...enchants.map((id: number) => 'enchant:' + id),
  ]
  const selected = Object.fromEntries(
    keys.filter((key) => rows[key]).map((key) => [key, rows[key]]),
  )
  const ids = [...icon_ids]
  for (const record of Object.values(selected) as Array<{ tables: ItemCatalog['tables'] }>) {
    for (const value of Object.values(record.tables.Item ?? {})) {
      ids.push(value?.IconFileDataID)
    }
  }
  return Promise.resolve({
    records: selected,
    icons: Object.fromEntries(
      ids.filter((id) => icons[id] !== undefined).map((id) => [id, icons[id]]),
    ),
    knownIcons: Object.keys(icons).map(Number),
    socketFrames: {},
  })
})

vi.mock('../../src/core/tauri-fs', () => ({ tauriFs: fs }))
vi.mock('../../src/lib/tauri', () => ({ isTauri: true }))
vi.mock('@tauri-apps/api/core', () => ({
  invoke,
  Channel: class {
    constructor(public message: (catalog: ItemCatalog) => void) {}
  },
}))

const icon = 'data:image/jpeg;base64,icon'
const ring = { id: 30, name: '月石指环', gems: [] }
const catalogFor = (name: string): ItemCatalog => ({
  tables: {
    ItemSparse: { 30: { Display_lang: name } },
    Item: { 30: { IconFileDataID: 123 } },
  },
  icons: { 123: icon },
  incomplete: false,
})

function client(root: string) {
  const path = root + '\\_classic_titan_'
  fs.setFile(root + '\\.build.info', 'build')
  fs.setFile(path + '\\.flavor.info', 'flavor')
  return shallowRef(path)
}

it('only fetches missing records, reuses disk hits on reload and isolates changed hotfixes', async () => {
  const { useItemCatalog } = await import('../../src/composables/useItemCatalog')
  const dir = client('C:\\WoW')
  const items = shallowRef([ring])
  const snapshot = shallowRef({})
  const hotfix = dir.value + '\\Cache\\ADB\\zhCN\\DBCache.bin'
  fs.setFile(hotfix, 'old')
  native.mockClear().mockResolvedValueOnce(catalogFor('旧名称'))
  const first = effectScope()
  const second = effectScope()
  try {
    const load = () => useItemCatalog(dir, items, snapshot)
    const initial = first.run(load)!
    await vi.waitFor(() => expect(initial.state.value).toBe('available'))
    expect(initial.catalog.value).toEqual(catalogFor('旧名称'))
    first.stop()

    const reopened = second.run(load)!
    await vi.waitFor(() => expect(reopened.state.value).toBe('available'))
    expect(reopened.catalog.value).toEqual(catalogFor('旧名称'))
    expect(native).toHaveBeenCalledTimes(1)

    native.mockResolvedValueOnce({
      tables: {
        ItemSparse: { 31: { Display_lang: '同图标' } },
        Item: { 31: { IconFileDataID: 123 } },
      },
      icons: {},
      incomplete: false,
    })
    items.value = [...items.value, { id: 31, name: '同图标', gems: [] }]
    await vi.waitFor(() => {
      expect(reopened.catalog.value?.tables.ItemSparse?.[31]).toEqual({ Display_lang: '同图标' })
      expect(reopened.catalog.value?.icons[123]).toBe(icon)
      expect(reopened.state.value).toBe('available')
    })
    expect(native).toHaveBeenLastCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({ items: [31], known_icons: [123] }),
      }),
    )

    items.value = [ring]
    await vi.waitFor(() => expect(reopened.catalog.value).toEqual(catalogFor('旧名称')))
    expect(native).toHaveBeenCalledTimes(2)
    fs.setFile(hotfix, 'new')
    native.mockResolvedValueOnce({ ...catalogFor('热修名称'), icons: {} })
    snapshot.value = {}
    await vi.waitFor(() => {
      expect(reopened.catalog.value).toEqual(catalogFor('热修名称'))
      expect(reopened.state.value).toBe('available')
    })
    expect(native).toHaveBeenCalledTimes(3)
    expect(native).toHaveBeenLastCalledWith(
      expect.objectContaining({ request: expect.objectContaining({ known_icons: [123] }) }),
    )

    const calls = invoke.mock.calls.length
    snapshot.value = {}
    await vi.waitFor(() => expect(invoke.mock.calls).toHaveLength(calls + 1))
    await vi.waitFor(() => expect(reopened.state.value).toBe('available'))
    expect(native).toHaveBeenCalledTimes(3)
  } finally {
    first.stop()
    second.stop()
  }
})

it('shows preview art and item level while sharing an in-flight detail query', async () => {
  const { useItemCatalog } = await import('../../src/composables/useItemCatalog')
  const dir = client('C:\\WoWPreview')
  const items = shallowRef([ring])
  const snapshot = shallowRef({})
  const scope = effectScope()
  let complete: ((catalog: ItemCatalog) => void) | undefined
  const full = new Promise<ItemCatalog>((resolve) => {
    complete = resolve
  })
  native.mockClear().mockImplementationOnce(({ preview }) => {
    preview.message({
      ...catalogFor(''),
      tables: { Item: { 30: { IconFileDataID: 123 } }, ItemSparse: { 30: { ItemLevel: 80 } } },
    })
    return full
  })
  try {
    const [first, other] = scope.run(() => [
      useItemCatalog(dir, items, snapshot),
      useItemCatalog(dir, items, snapshot),
    ])!
    await vi.waitFor(() => expect(first.catalog.value?.tables.ItemSparse?.[30]?.ItemLevel).toBe(80))
    expect(first.catalog.value?.icons[123]).toBe(icon)
    expect(first.state.value).toBe('loading')
    expect(native).toHaveBeenCalledTimes(1)
    complete!(catalogFor('完整资料'))
    await vi.waitFor(() => {
      expect(first.catalog.value).toEqual(catalogFor('完整资料'))
      expect(other.catalog.value).toEqual(first.catalog.value)
      expect(other.state.value).toBe('available')
    })
    expect(native).toHaveBeenCalledTimes(1)
  } finally {
    scope.stop()
  }
})

it('loads and reopens empty-slot art with no item records', async () => {
  const { useItemCatalog } = await import('../../src/composables/useItemCatalog')
  const dir = client('C:\\WoWArt')
  const items = shallowRef<(typeof ring)[]>([])
  const textures = shallowRef([136525])
  const snapshot = shallowRef({})
  const payload = { tables: {}, icons: { 136525: icon }, incomplete: false }
  native.mockClear().mockResolvedValueOnce(payload)
  const scope = effectScope()
  try {
    const { catalog, state } = scope.run(() => useItemCatalog(dir, items, snapshot, textures))!
    await vi.waitFor(() => expect(state.value).toBe('available'))
    expect(catalog.value).toEqual(payload)
    expect(native).toHaveBeenLastCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({ items: [], icon_ids: [136525] }),
      }),
    )
    const calls = invoke.mock.calls.length
    snapshot.value = {}
    await vi.waitFor(() => expect(invoke.mock.calls).toHaveLength(calls + 1))
    expect(catalog.value).toEqual(payload)
    expect(native).toHaveBeenCalledTimes(1)
  } finally {
    scope.stop()
  }
})

it('uses the recorded instance texture when the client item has no default icon', async () => {
  const { useItemCatalog } = await import('../../src/composables/useItemCatalog')
  const dir = client('C:\\WoWArtifact')
  const artifact = { id: 128861, name: '泰坦之击', iconTexture: 1280945, gems: [] }
  const scope = effectScope()
  native.mockClear().mockResolvedValueOnce({
    tables: {
      Item: { 128861: { IconFileDataID: 0 } },
      ItemSparse: { 128861: { Display_lang: artifact.name } },
    },
    icons: { 1280945: icon },
    incomplete: false,
  })
  try {
    const { catalog, state } = scope.run(() =>
      useItemCatalog(dir, shallowRef([artifact]), shallowRef({}), shallowRef([1280945])),
    )!
    await vi.waitFor(() => expect(state.value).toBe('available'))
    expect(itemIcon(catalog.value, artifact.id, artifact.iconTexture)).toBe(icon)
    expect(native).toHaveBeenLastCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({ items: [128861], icon_ids: [1280945] }),
      }),
    )
    expect(itemIcon(catalogFor(ring.name), ring.id, 1280945)).toBe(icon)
  } finally {
    scope.stop()
  }
})
