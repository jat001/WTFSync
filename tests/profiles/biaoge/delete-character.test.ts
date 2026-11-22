import { describe, expect, it } from 'vite-plus/test'

import { TEMP_SUFFIX } from '../../../src/core/fs'
import { asString, valueOf } from '../../../src/core/lua/ast'
import { parseSavedVariables } from '../../../src/core/lua/parser'
import { dirname } from '../../../src/core/paths'
import { encodeUtf8, toCrlf } from '../../../src/core/text'
import { loadBiaoGeOverview } from '../../../src/profiles/biaoge'
import {
  BiaoGeSaveChangedError,
  deleteBiaoGeCharacter,
} from '../../../src/profiles/biaoge/delete-character'
import { savedVariablesPath } from '../../helpers/game'
import { MemoryFileSystem } from '../../helpers/memory-fs'

const gameDir = 'C:\\Games\\World of Warcraft\\_classic_titan_'
const target = { account: '123456#1', realmId: 123, name: '星光' }
const file = savedVariablesPath(gameDir, target.account, 'BGLite.lua')
const otherFile = savedVariablesPath(gameDir, '123456#2', 'BGLite.lua')
const original = toCrlf(`\uFEFFBiaoGe = {
  playerInfo = {
    [123] = {
      ["星光"] = { level = 80 } -- first entry
      , ["晴空"] = { level = 70 },
      ["星光"] = { level = 81 },
    },
    [124] = { ["星光"] = { level = 76 } },
  },
  MONEY = { [123] = { ["星光"] = { money = 25 } } },
  Hope = { [123] = { ["星光"] = {}, ["晴空"] = {} } },
  RoleOverviewSort = {
    [123] = { [1] = { player = "星光" }, [2] = { player = "晴空" }, [3] = { player = "细雨" } },
    [124] = { { player = "星光" } },
  },
  History = { ["星光"] = "account-wide history" },
}
Other = { note = "keep this assignment intact" }
`)

describe('delete BGLite character records', () => {
  it('backs up and edits only the selected account and realm, with a valid remaining sort order', async () => {
    const fs = new MemoryFileSystem()
    fs.setFile(file, original)
    fs.setFile(otherFile, original)

    const backup = await deleteBiaoGeCharacter(fs, gameDir, target)
    expect(backup).toContain('BGLite.lua.wtfsync-backup-')
    expect(fs.getBytes(backup!)).toEqual(encodeUtf8(original))
    expect(fs.getBytes(otherFile)).toEqual(encodeUtf8(original))

    const result = fs.getBytes(file)!
    expect([...result.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    expect(fs.getText(file)).toContain(
      toCrlf(`History = { ["星光"] = "account-wide history" },
}
Other = { note = "keep this assignment intact" }`),
    )
    const table = parseSavedVariables(result).globals.get('BiaoGe')
    const money = valueOf(valueOf(table, 'MONEY'), 123)
    const hope = valueOf(valueOf(table, 'Hope'), 123)
    expect(valueOf(money, '星光')).toBeUndefined()
    expect(valueOf(hope, '星光')).toBeUndefined()
    expect(valueOf(hope, '晴空')?.kind).toBe('table')
    const order = valueOf(valueOf(table, 'RoleOverviewSort'), 123)
    expect(asString(valueOf(valueOf(order, 1), 'player'))).toBe('晴空')
    expect(asString(valueOf(valueOf(order, 2), 'player'))).toBe('细雨')
    expect(valueOf(order, 3)).toBeUndefined()

    const overview = await loadBiaoGeOverview(fs, gameDir, target.account)
    expect(overview.characters.map(({ name, realmId }) => [name, realmId])).toEqual([
      ['晴空', 123],
      ['星光', 124],
    ])
    await expect(deleteBiaoGeCharacter(fs, gameDir, target)).resolves.toBeUndefined()
    expect((await fs.readDir(dirname(file))).map(({ name }) => name)).toHaveLength(2)
  })

  it('preserves a new game save written after the edit was staged', async () => {
    const fs = new MemoryFileSystem()
    fs.setFile(file, original)
    const latest = `${original}-- updated by the game\r\n`
    const writeFile = fs.writeFile.bind(fs)
    fs.writeFile = async (name, bytes) => {
      await writeFile(name, bytes)
      if (name === file + TEMP_SUFFIX) fs.setFile(file, latest)
    }

    await expect(deleteBiaoGeCharacter(fs, gameDir, target)).rejects.toBeInstanceOf(
      BiaoGeSaveChangedError,
    )
    expect(fs.getBytes(file)).toEqual(encodeUtf8(latest))
    expect((await fs.readDir(dirname(file))).map(({ name }) => name)).toEqual(['BGLite.lua'])
  })
})
