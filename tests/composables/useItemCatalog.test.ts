import { expect, it, vi } from 'vite-plus/test'
import { effectScope, shallowRef } from 'vue'
import type { ItemCatalog } from '../../src/lib/item-catalog'
import { MemoryFileSystem } from '../helpers/memory-fs'

const fs = new MemoryFileSystem()
const invoke = vi.fn()
vi.mock('../../src/core/tauri-fs', () => ({ tauriFs: fs }))
vi.mock('../../src/lib/tauri', () => ({ isTauri: true }))
vi.mock('@tauri-apps/api/core', () => ({ invoke }))

it('shares client results across page mounts and rechecks hotfix metadata and manual reloads', async () => {
  const { useItemCatalog } = await import('../../src/composables/useItemCatalog')
  const dir = shallowRef('C:\\WoW\\_classic_titan_')
  const items = shallowRef([{ id: 30, name: '月石指环', gems: [] }])
  const snapshot = shallowRef({})
  const hotfix = dir.value + '\\Cache\\ADB\\zhCN\\DBCache.bin'
  const catalog = (name: string): ItemCatalog => ({
    tables: {
      ItemSparse: { 30: { Display_lang: name } },
      Item: { 30: { IconFileDataID: 123 } },
    },
    icons: { 123: 'data:image/jpeg;base64,' + name },
    incomplete: false,
  })
  fs.setFile(hotfix, 'old')
  invoke.mockResolvedValueOnce(catalog('旧名称'))
  const first = effectScope()
  const second = effectScope()
  try {
    const load = () => useItemCatalog(dir, items, snapshot)
    const initial = first.run(load)!
    await vi.waitFor(() => expect(initial.catalog.value).toEqual(catalog('旧名称')))
    first.stop()

    const reopened = second.run(load)!
    await vi.waitFor(() => expect(reopened.catalog.value).toEqual(catalog('旧名称')))
    expect(invoke).toHaveBeenCalledTimes(1)

    invoke.mockResolvedValueOnce({
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
      expect(reopened.catalog.value?.icons[123]).toBe(catalog('旧名称').icons[123])
    })
    expect(invoke).toHaveBeenLastCalledWith(
      'inventory_catalog',
      expect.objectContaining({
        request: expect.objectContaining({ items: [31], known_icons: [123] }),
      }),
    )

    items.value = items.value.slice(0, 1)
    await vi.waitFor(() => expect(reopened.catalog.value).toEqual(catalog('旧名称')))
    expect(invoke).toHaveBeenCalledTimes(2)
    fs.setFile(hotfix, 'new')
    invoke.mockResolvedValueOnce(catalog('热修名称'))
    snapshot.value = {}
    await vi.waitFor(() => expect(reopened.catalog.value).toEqual(catalog('热修名称')))
    expect(invoke).toHaveBeenCalledTimes(3)
    expect(invoke).toHaveBeenLastCalledWith(
      'inventory_catalog',
      expect.objectContaining({ request: expect.objectContaining({ known_icons: [] }) }),
    )

    invoke.mockResolvedValueOnce(catalog('手动刷新'))
    reopened.invalidate()
    snapshot.value = {}
    await vi.waitFor(() => expect(reopened.catalog.value).toEqual(catalog('手动刷新')))
    expect(invoke).toHaveBeenCalledTimes(4)
  } finally {
    first.stop()
    second.stop()
  }
})

it('loads empty equipment textures without item rows and reuses them for later item requests', async () => {
  const { useItemCatalog } = await import('../../src/composables/useItemCatalog')
  const dir = shallowRef('C:\\WoWArt\\_classic_titan_')
  const items = shallowRef<{ id: number; name: string; gems: number[] }[]>([])
  const textures = shallowRef([136525])
  const icon = 'data:image/png;base64,shirt'
  const scope = effectScope()
  try {
    invoke.mockResolvedValueOnce({ tables: {}, icons: { 136525: icon }, incomplete: false })
    const { catalog, state } = scope.run(() =>
      useItemCatalog(dir, items, shallowRef({}), textures),
    )!
    await vi.waitFor(() => expect(catalog.value?.icons).toEqual({ 136525: icon }))
    expect(state.value).toBe('available')
    expect(invoke).toHaveBeenLastCalledWith(
      'inventory_catalog',
      expect.objectContaining({
        request: expect.objectContaining({ items: [], icon_ids: [136525] }),
      }),
    )

    invoke.mockResolvedValueOnce({
      tables: { ItemSparse: { 30: { Display_lang: '月石指环' } } },
      icons: {},
      incomplete: false,
    })
    items.value = [{ id: 30, name: '月石指环', gems: [] }]
    await vi.waitFor(() => expect(catalog.value?.tables.ItemSparse?.[30]).toBeDefined())
    expect(catalog.value?.icons).toEqual({ 136525: icon })
    expect(invoke).toHaveBeenLastCalledWith(
      'inventory_catalog',
      expect.objectContaining({
        request: expect.objectContaining({ items: [30], icon_ids: [], known_icons: [136525] }),
      }),
    )
  } finally {
    scope.stop()
  }
})
