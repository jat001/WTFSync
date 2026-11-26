import { expect, it, vi } from 'vite-plus/test'
import { shallowRef } from 'vue'
import type { InventoryAccount } from '../../src/profiles/syndicator/inventory'
import type { Settings } from '../../src/composables/useSettings'

const dir = 'C:\\WoW\\_classic_titan_'
const titan = 'c:/wow/_classic_titan_'
let stored: Partial<Settings> = {
  inventorySelections: {
    [titan]: { account: 'B', characters: { B: 'B2' } },
  },
}

vi.mock('../../src/lib/tauri', () => ({ isTauri: true }))
vi.mock('@tauri-apps/plugin-store', () => ({
  Store: {
    load: async () => ({
      get: async () => stored,
      set: async (_: string, value: Settings) => {
        stored = JSON.parse(JSON.stringify(value))
      },
      save: async () => {},
    }),
  },
}))

const account = (id: string): InventoryAccount => ({
  account: id,
  modifiedAt: null,
  guilds: [],
  characters: [1, 2].map((n) => ({
    key: id + n,
    label: id + n,
    equipped: [],
    bags: [],
    bank: [],
  })),
})

it('remembers selections by game directory and account through temporary fallbacks', async () => {
  const { useInventorySelection } = await import('../../src/composables/useInventorySelection')
  const { settingsReady } = await import('../../src/composables/useSettings')
  await settingsReady
  const gameDir = shallowRef(dir)
  const data = shallowRef<{ accounts: InventoryAccount[] }>()
  const { accountId, characterId } = useInventorySelection(gameDir, data)
  expect(accountId.value).toBe('')
  data.value = { accounts: [account('A')] }
  expect(accountId.value).toBe('A')
  expect(characterId.value).toBe('A1')
  data.value = { accounts: [account('A'), account('B')] }
  expect(accountId.value).toBe('B')
  expect(characterId.value).toBe('B2')

  accountId.value = 'A'
  characterId.value = 'A2'
  gameDir.value = 'C:\\WoW\\_retail_'
  expect(characterId.value).toBe('A1')
  accountId.value = 'B'
  gameDir.value = dir
  expect(characterId.value).toBe('A2')
  accountId.value = 'B'
  expect(characterId.value).toBe('B2')
  await vi.waitFor(() =>
    expect(stored.inventorySelections).toEqual({
      [titan]: { account: 'B', characters: { B: 'B2', A: 'A2' } },
      'c:/wow/_retail_': { account: 'B', characters: {} },
    }),
  )
})

it('filters characters by realm and groups renamed Time realms under their base name', async () => {
  const { useInventorySelection } = await import('../../src/composables/useInventorySelection')
  const { settingsReady } = await import('../../src/composables/useSettings')
  await settingsReady
  const gameDir = shallowRef('D:\\WoW\\_classic_titan_')
  const [first, second] = account('A').characters
  const data = shallowRef({
    accounts: [
      {
        ...account('A'),
        characters: [
          { ...first, name: '同名', realm: '时光II - 示例公会' },
          { ...second, name: '小号', realm: '时光II旧冠名' },
          { ...first, key: 'A3', name: '同名', realm: '时光III-示例公会' },
          { ...first, key: 'A4', name: '其他角色', realm: '时光之穴' },
          { ...first, key: 'A5', label: '旧角色' },
        ],
      },
    ],
  })
  const { selectedRealm, realmOptions, character, characterId, characterOptions } =
    useInventorySelection(gameDir, data)

  expect(realmOptions.value.map(({ label }) => label).sort()).toEqual([
    '时光II',
    '时光III',
    '时光之穴',
    '未知服务器',
  ])
  expect(selectedRealm.value).toBe('时光II')
  expect(characterOptions.value).toEqual([
    { value: 'A1', label: '同名' },
    { value: 'A2', label: '小号' },
  ])
  characterId.value = 'A2'
  expect(character.value?.realm).toBe('时光II旧冠名')

  selectedRealm.value = '时光III'
  expect(characterOptions.value).toEqual([{ value: 'A3', label: '同名' }])
  expect(characterId.value).toBe('A3')
  characterId.value = 'A1'
  expect(characterId.value).toBe('A3')
  expect(useInventorySelection(gameDir, data).selectedRealm.value).toBe('时光III')

  selectedRealm.value = '未知服务器'
  expect(characterOptions.value).toEqual([{ value: 'A5', label: '旧角色' }])
  expect(characterId.value).toBe('A5')
  await vi.waitFor(() =>
    expect(stored.inventorySelections?.['d:/wow/_classic_titan_']?.characters).toEqual({ A: 'A5' }),
  )
})
