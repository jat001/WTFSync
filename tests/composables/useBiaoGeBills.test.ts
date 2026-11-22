import { expect, it, vi } from 'vite-plus/test'
import { effectScope } from 'vue'

import { pathKey } from '../../src/core/paths'
import type { BillHistory } from '../../src/profiles/biaoge/bill-history'
import { createGame, savedVariablesPath, TEST_ROOT } from '../helpers/game'
import { MemoryFileSystem } from '../helpers/memory-fs'

const fs = new MemoryFileSystem()
let stored: Record<string, BillHistory> = {}
let staged: Record<string, BillHistory> = {}

vi.mock('../../src/lib/tauri', () => ({ isTauri: true }))
vi.mock('../../src/lib/fs', () => ({ allowFsDirectories: async () => [] }))
vi.mock('../../src/core/tauri-fs', () => ({ tauriFs: fs }))
vi.mock('@tauri-apps/plugin-store', () => ({
  Store: {
    load: async (name: string) => name === 'bill-history.json'
      ? {
          get: async () => stored,
          set: async (_key: string, value: Record<string, BillHistory>) => { staged = value },
          save: async () => { stored = JSON.parse(JSON.stringify(staged)) },
        }
      : {
          get: async () => ({ wowRoot: TEST_ROOT, flavor: '_classic_titan_', autoSync: false }),
          set: async () => {},
          save: async () => {},
        },
  },
}))

it('records bills in the background with auto sync off and leaves the game save read-only', async () => {
  const game = createGame(fs)
  const path = savedVariablesPath(game, '100001#1', 'BGLite.lua')
  const key = pathKey(game)
  const current = (income: number) => `BiaoGe = { ULDtitan = { boss1 = { jine1 = ${income} } } }`
  fs.setFile(path, current(100))

  const { useBiaoGeBills } = await import('../../src/composables/useBiaoGeBills')
  const scope = effectScope()
  const state = scope.run(useBiaoGeBills)!
  try {
    await vi.waitFor(() => {
      expect(fs.watcherCount).toBe(1)
      expect(state.loading.value).toBe(false)
      expect(state.allBills.value).toMatchObject([{ kind: 'current', income: 100 }])
      expect(Object.values(stored[key].pending)).toMatchObject([{ bill: { income: 100 } }])
    })

    await state.saveBill(state.allBills.value[0])
    const [manual] = Object.values(stored[key].archived)
    expect(manual.income).toBe(100)
    fs.setFile(path, current(200))
    fs.touch(path)
    await vi.waitFor(() => {
      expect(Object.values(stored[key].pending)).toMatchObject([{ bill: { income: 200 } }])
    })

    const cleared = 'BiaoGe = { clearBiaoGeMoney = { ULDtitan = { time = 1780000000 } } }'
    fs.setFile(path, cleared)
    fs.touch(path)
    await vi.waitFor(() => {
      expect(stored[key].pending).toEqual({})
      expect(state.allBills.value).toMatchObject([{ id: manual.id, kind: 'history', income: 200 }])
    })
    expect(fs.getText(path)).toBe(cleared)
    expect(fs.log).toEqual([])
  } finally {
    scope.stop()
  }
})
