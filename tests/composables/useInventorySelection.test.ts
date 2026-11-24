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
