import { describe, expect, it } from 'vitest'

import { buildInfoText, createGame, TEST_ROOT } from '../testing/game'
import { MemoryFileSystem } from './memory-fs'
import {
  interfaceFromVersion,
  listFlavors,
  readBuildInfo,
  readClientInfo,
  resolveGameDir,
} from './wow'

describe('interfaceFromVersion', () => {
  it('packs major, minor and patch', () => {
    expect(interfaceFromVersion('3.80.2.12345')).toBe(38002)
    expect(interfaceFromVersion('12.1.0.10000')).toBe(120100)
    expect(interfaceFromVersion('1.15.9.10000')).toBe(11509)
    expect(interfaceFromVersion('5.5.4')).toBe(50504)
    expect(interfaceFromVersion('beta')).toBeNull()
  })
})

describe('client discovery', () => {
  it('reads installed versions from .build.info, preferring active rows', async () => {
    const fs = new MemoryFileSystem()
    fs.setFile(
      `${TEST_ROOT}\\.build.info`,
      buildInfoText([
        { product: 'wow', version: '12.0.0.1', active: false },
        { product: 'wow', version: '12.1.0.2' },
        { product: 'wow_classic_era', version: '1.15.9.3' },
      ]),
    )
    expect(await readBuildInfo(fs, TEST_ROOT)).toEqual(
      new Map([
        ['wow', '12.1.0.2'],
        ['wow_classic_era', '1.15.9.3'],
      ]),
    )
  })

  it('derives the interface version of a flavor', async () => {
    const fs = new MemoryFileSystem()
    const gameDir = createGame(fs)
    expect(await readClientInfo(fs, gameDir)).toEqual({
      version: '3.80.2.12345',
      interfaceVersion: 38002,
    })
  })

  it('falls back to the last run recorded in Config.wtf', async () => {
    const fs = new MemoryFileSystem()
    const gameDir = createGame(fs)
    fs.setFile(`${TEST_ROOT}\\.build.info`, '')
    expect(await readClientInfo(fs, gameDir)).toBeNull()

    fs.setFile(`${gameDir}\\WTF\\Config.wtf`, 'SET locale "zhCN"\r\nSET lastAddonVersion "38001"\r\n')
    expect(await readClientInfo(fs, gameDir)).toEqual({
      version: null,
      interfaceVersion: 38001,
    })
  })

  it('lists flavors with their versions and resolves picked directories', async () => {
    const fs = new MemoryFileSystem()
    const gameDir = createGame(fs)
    fs.setFile(`${TEST_ROOT}\\Data\\data.000`, '')
    expect(await listFlavors(fs, TEST_ROOT)).toEqual([
      {
        dir: '_classic_titan_',
        path: gameDir,
        id: 'wow_classic_titan',
        version: '3.80.2.12345',
      },
    ])
    expect(await resolveGameDir(fs, `${gameDir}\\`)).toEqual({
      root: TEST_ROOT,
      flavor: '_classic_titan_',
    })
    expect(await resolveGameDir(fs, TEST_ROOT)).toEqual({ root: TEST_ROOT, flavor: null })
  })
})
