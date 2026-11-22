import { expect, it, vi } from 'vite-plus/test'

import { joinPath } from '../../src/core/paths'
import { createGame, savedVariablesPath, TEST_ROOT } from '../helpers/game'
import { MemoryFileSystem } from '../helpers/memory-fs'

const fs = new MemoryFileSystem()
const realAccounts = ['200000001#1', '200000002#2']
const sampleAccounts = ['100000001#1', '100000002#2']

vi.mock('../../src/lib/tauri', () => ({ isTauri: true }))
vi.mock('../../src/lib/fs', () => ({ allowFsDirectories: async () => [] }))
vi.mock('../../src/core/tauri-fs', () => ({ tauriFs: fs }))
vi.mock('@tauri-apps/plugin-store', () => ({
  Store: {
    load: async () => ({
      get: async () => ({
        wowRoot: TEST_ROOT,
        flavor: '_classic_titan_',
        autoSync: false,
        selections: { '_classic_titan_/biaoge': [...realAccounts, ...sampleAccounts] },
      }),
      set: vi.fn(),
      save: vi.fn(),
    }),
  },
}))

it('migrates legacy choices and keeps selections separate for installations of the same flavor', async () => {
  const realGame = createGame(fs)
  const sampleGame = createGame(fs, { root: 'C:\\Review' })
  for (const [dir, ids] of [
    [realGame, realAccounts],
    [sampleGame, [...sampleAccounts, realAccounts[0]]],
  ] as const) {
    fs.setFile(joinPath(dir, 'Interface', 'AddOns', 'BGLite', 'BGLite.toc'), '')
    for (const id of ids) {
      fs.setFile(savedVariablesPath(dir, id, 'BGLite.lua'), 'BiaoGe = {}')
    }
  }

  const { accountSelectionKey, useSettings } = await import('../../src/composables/useSettings')
  const { useSync } = await import('../../src/composables/useSync')
  const { defaultProfile } = await import('../../src/profiles')
  const { settings } = useSettings()
  const state = useSync()
  const savedKey = accountSelectionKey(realGame, defaultProfile.id)

  await vi.waitFor(() => expect(state.selectedAccounts(defaultProfile)).toEqual(realAccounts))
  expect(settings.selections).toEqual({ [savedKey]: realAccounts })
  const [outcome] = await state.sync('manual', defaultProfile)
  expect(outcome?.report?.synced).toEqual(realAccounts)
  expect(outcome?.report?.failed).toEqual([])

  await state.chooseGameDirectory(sampleGame)
  expect(state.selectedAccounts(defaultProfile)).toEqual([])
  expect(await state.sync('manual', defaultProfile)).toEqual([])
  await vi.waitFor(() => {
    expect(state.statuses.value[defaultProfile.id]?.accounts).toHaveLength(3)
  })
  state.toggleAccount(defaultProfile, sampleAccounts[0], true)
  expect(state.selectedAccounts(defaultProfile)).toEqual([sampleAccounts[0]])

  await state.chooseGameDirectory(realGame)
  await vi.waitFor(() => expect(state.selectedAccounts(defaultProfile)).toEqual(realAccounts))
  for (const id of realAccounts) state.toggleAccount(defaultProfile, id, false)
  expect(state.canSyncProfile(defaultProfile)).toBe(true)
  const [cleared] = await state.sync('manual', defaultProfile)
  expect(cleared?.report?.removed).toEqual(realAccounts.map((id) => `${id}.lua`))

  await state.chooseGameDirectory(sampleGame)
  await vi.waitFor(() => {
    expect(state.selectedAccounts(defaultProfile)).toEqual([sampleAccounts[0]])
  })
})
