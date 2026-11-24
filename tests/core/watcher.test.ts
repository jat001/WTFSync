import { describe, expect, it } from 'vite-plus/test'

import type { SyncTask } from '../../src/core/engine'
import { MemoryFileSystem } from '../helpers/memory-fs'
import type { AddonProfile } from '../../src/core/profile'
import { watchSources } from '../../src/core/watcher'

const GAME = 'C:\\WoW\\_retail_'

const profile: AddonProfile = {
  id: 'echo',
  name: 'Echo',
  requiredAddon: 'Echo',
  sourceFiles: ['Echo.lua'],
  outputDir: 'Interface/AddOns/EchoAccounts',
  summarize: () => [],
  prepare: () => null,
  render: () => ({ files: [], remove: [] }),
}

describe('watchSources', () => {
  it('reports changes to source files of selected accounts', async () => {
    const fs = new MemoryFileSystem()
    const dir = (id: string) => `${GAME}\\WTF\\Account\\${id}\\SavedVariables`
    fs.setFile(`${dir('1#1')}\\Echo.lua`, '')
    fs.setFile(`${dir('2#1')}\\Echo.lua`, '')

    const task: SyncTask = { gameDir: GAME, profile, accounts: ['1#1', '3#1'] }
    const changed: { task: SyncTask; paths: readonly string[] }[] = []
    const watch = await watchSources(fs, [task], (t, paths) => changed.push({ task: t, paths }))
    expect(watch.watchedDirs).toEqual([dir('1#1')])
    expect(watch.missingDirs).toEqual([dir('3#1')])

    fs.touch(`${dir('1#1')}\\Echo.lua.bak`, `${dir('1#1')}\\Other.lua`)
    fs.touch(`${dir('2#1')}\\Echo.lua`)
    expect(changed).toEqual([])

    const file = `${dir('1#1')}\\echo.lua`
    fs.touch(file, `${dir('1#1')}\\Other.lua`)
    expect(changed).toEqual([{ task, paths: [file] }])

    watch.stop()
    expect(fs.watcherCount).toBe(0)
  })
})
