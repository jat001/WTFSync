import { describe, expect, it } from 'vitest'

import loaderTemplate from '../../../addons/BiaoGeAccounts/BiaoGeAccounts.lua?raw'
import tocTemplate from '../../../addons/BiaoGeAccounts/BiaoGeAccounts.toc?raw'
import { runSync } from '../../../src/core/engine'
import { parseSavedVariables } from '../../../src/core/lua/parser'
import { MemoryFileSystem } from '../../helpers/memory-fs'
import type { AccountSource } from '../../../src/core/profile'
import { toCrlf } from '../../../src/core/text'
import { createGame, savedVariablesPath } from '../../helpers/game'
import { biaoge, EXPORT_KEYS, parseLoaderKeys, renderToc } from '../../../src/profiles/biaoge/index'
import { expectedAccountFile, generateAccount } from '../../helpers/biaoge'

const CLIENT = { version: '3.80.2.12345', interfaceVersion: 38002 }

function accountSource(id: string, text: string): AccountSource {
  return {
    id,
    files: new Map([
      ['BiaoGe.lua', { chunk: parseSavedVariables(text), modifiedAt: null }],
    ]),
  }
}

/** The toc for the given account files, built straight from the template. */
function expectedToc(accountFiles: string[]): string {
  return toCrlf(tocTemplate)
    .replace('{{INTERFACE}}', String(CLIENT.interfaceVersion))
    .replace(
      /BiaoGeAccounts\.lua(?:\r\n)*$/,
      ['BiaoGeAccounts.lua', '', ...accountFiles].join('\r\n'),
    )
}

describe('EXPORT_KEYS', () => {
  it('follows the loader whitelist without accountName', () => {
    expect(parseLoaderKeys(loaderTemplate)).toContain('accountName')
    expect(EXPORT_KEYS).toEqual([
      'PlayerItemsLevel',
      'playerInfo',
      'FBCD',
      'Money',
      'QuestCD',
      'tradeSkillCooldown',
      'HistoryList',
      'History',
      'equip',
      'realmName',
      'bag',
      'RaidCD',
      'MONEY',
      'worldBossCD',
      'roleOverviewNote',
      'buffCD',
      'legendaryCloak',
    ])
  })
})

describe('biaoge profile', () => {
  it('writes account files in the BiaoGeUpdater format', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const account = generateAccount(`10000000${seed}#1`, seed)
      const data = biaoge.prepare(accountSource(account.id, account.source))
      expect(data, `seed ${seed}`).toBe(expectedAccountFile(account))
    }
  })

  it('rejects files without the BiaoGe table', () => {
    expect(() => biaoge.prepare(accountSource('1#1', 'Other = {}'))).toThrow(
      'does not define BiaoGe',
    )
  })

  it('summarizes characters', () => {
    const account = generateAccount('100000001#1', 7)
    expect(biaoge.summarize(accountSource(account.id, account.source))).toEqual(
      account.characters.map(({ realm, name, classFile, level, faction, itemLevel }) => ({
        realm,
        name,
        classFile,
        level,
        faction,
        itemLevel,
      })),
    )
  })

  it('fills the interface version into the toc', () => {
    const toc = renderToc(['1#1.lua', '2#1.lua'], CLIENT.interfaceVersion)
    expect(toc).toBe(expectedToc(['1#1.lua', '2#1.lua']))
    expect(toc).toContain('\r\n## Interface: 38002\r\n')
    expect(toc).not.toContain('{{')
  })

  it('keeps failed accounts that have a file and removes deselected ones', () => {
    const existing = {
      files: new Map([
        ['BiaoGeAccounts.toc', renderToc(['1#1.lua', '2#1.lua', '3#1.lua'], 1)],
        ['2#1.lua', 'old'],
        ['3#1.lua', 'old'],
      ]),
    }
    const output = biaoge.render({
      accounts: [{ id: '1#1', data: 'new' }],
      failed: ['2#1', '4#1'],
      existing,
      client: CLIENT,
    })
    expect(output.files.map((f) => f.name)).toEqual([
      '1#1.lua',
      'BiaoGeAccounts.lua',
      'BiaoGeAccounts.toc',
    ])
    expect(output.files[2]?.text).toBe(expectedToc(['1#1.lua', '2#1.lua']))
    expect(output.remove).toEqual(['3#1.lua'])
    expect(biaoge.syncedAccounts?.(existing)).toEqual(['1#1', '2#1', '3#1'])
  })

  it('syncs generated accounts end to end', async () => {
    const fs = new MemoryFileSystem()
    const gameDir = createGame(fs, { version: CLIENT.version })
    fs.setFile(`${gameDir}\\Interface\\AddOns\\BiaoGe\\BiaoGe.toc`, '')
    const accounts = [11, 12, 13].map((seed) => generateAccount(`2000000${seed}#1`, seed))
    for (const account of accounts) {
      fs.setFile(savedVariablesPath(gameDir, account.id, 'BiaoGe.lua'), account.source)
    }
    const ids = accounts.map((account) => account.id)
    const task = { gameDir, profile: biaoge, accounts: ids }

    const report = await runSync(fs, task, 'manual')
    expect(report.failed).toEqual([])
    const out = `${gameDir}\\Interface\\AddOns\\BiaoGeAccounts`
    for (const account of accounts) {
      expect(fs.getText(`${out}\\${account.id}.lua`)).toBe(expectedAccountFile(account))
    }
    expect(fs.getText(`${out}\\BiaoGeAccounts.lua`)).toBe(toCrlf(loaderTemplate))
    expect(fs.getText(`${out}\\BiaoGeAccounts.toc`)).toBe(
      expectedToc(ids.map((id) => `${id}.lua`)),
    )

    const again = await runSync(fs, task, 'manual')
    expect(again.written).toEqual([])
  })
})
