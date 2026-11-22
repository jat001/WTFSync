import { describe, expect, it } from 'vite-plus/test'

import { loadBiaoGeOverview } from '../../../src/profiles/biaoge'
import { activeRaidLocks } from '../../../src/profiles/biaoge/overview'
import { savedVariablesPath } from '../../helpers/game'
import { MemoryFileSystem } from '../../helpers/memory-fs'

const gameDir = 'C:\\Games\\World of Warcraft\\_classic_titan_'
const account = '123456#1'
const now = 1_800_000_000_000

describe('BGLite character overview', () => {
  it('joins real RoleOverview field shapes by character and keeps stored gold in gold units', async () => {
    const fs = new MemoryFileSystem()
    fs.setFile(
      savedVariablesPath(gameDir, account, 'BGLite.lua'),
      `BiaoGe = {
      realmName = { [123] = "时光之穴", [124] = "永望镇" },
      playerInfo = {
        [123] = { ["星光"] = { class = "MAGE", level = 80, iLevel = 247.5, faction = "Horde" } },
        [124] = { ["星光"] = { class = "PRIEST", level = 70 } },
      },
      PlayerItemsLevel = { [124] = { ["星光"] = 147.5 } },
      MONEY = {
        [123] = { ["星光"] = {
          money = 230407, xp = { perNow = "120" },
          [3403] = { count = 12, weekCount = 20, weekMax = 40 },
        } },
        [124] = { ["星光"] = { money = 0 } },
      },
      RaidCD = { [123] = { ["星光"] = {
        { fbId = 603, diff = 15, num = 25, endtime = 1800007200, killNum = 1, bossSum = 2,
          killInfo = { { name = "烈焰巨兽", isKilled = true }, { name = "锋鳞", isKilled = false } } },
        { fbId = 533, endtime = 1799999999 },
        { fbId = 119, isWorldBoss = true, endtime = 1800010000 },
      } } },
      equip = { [123] = { ["星光"] = {
        ["16"] = { link = "|cffa335ee|Hitem:1234|h[星光之刃]|h|r", itemID = 1234, level = 252, quality = 4 },
      } } },
      bag = { [123] = { ["星光"] = {
        bag = { [1234] = 2 }, bank = { [1234] = 1 }, mail = {},
        faction = { [270] = { name = "赞达拉部族", standingID = 6, currentValue = 1, maxValue = 12000 } },
      } } },
      QuestCD = { [123] = { ["星光"] = { fish = { notFinish = true } } } },
      tradeSkillCooldown = { [123] = { ["星光"] = {
        alchemy_yanjiu = { endtime = 1800007200 }, alchemy_zhuanhua = { ready = true },
      } } },
      roleOverviewNote = { [123] = { ["星光"] = "|cffffffff主号|r" } },
    }`,
    )

    const { characters, modifiedAt } = await loadBiaoGeOverview(fs, gameDir, account)
    expect(modifiedAt).toBe(fs.clock)
    expect(fs.log).toEqual([])
    expect(characters).toHaveLength(2)
    const [main, alt] = characters
    expect(main).toMatchObject({
      account,
      realmId: 123,
      realm: '时光之穴',
      name: '星光',
      itemLevel: 247.5,
      gold: 230407,
      restedXp: 120,
      note: '主号',
      currencies: [{ name: '泰坦余烬', count: 12, weekly: '20 / 40' }],
      equipment: [
        {
          part: '主手',
          name: '星光之刃',
          level: 252,
          quality: 4,
          storage: { bags: 2, bank: 1 },
        },
      ],
      reputation: [{ name: '赞达拉部族', standing: '尊敬', progress: '1 / 12,000' }],
      quests: [{ name: '钓鱼日常', unfinished: true }],
      professions: [
        { name: '炼金研究', resetAt: 1_800_007_200_000, ready: false },
        { name: '炼金转化', ready: true },
      ],
    })
    expect(activeRaidLocks(main, now)).toMatchObject([
      {
        name: '奥杜尔',
        difficulty: '英雄',
        players: 25,
        progress: '1 / 2',
        resetAt: 1_800_007_200_000,
        bosses: [
          { name: '烈焰巨兽', killed: true },
          { name: '锋鳞', killed: false },
        ],
      },
      { name: '末日行者' },
    ])
    expect(alt).toMatchObject({ realmId: 124, name: '星光', itemLevel: 147.5, gold: 0 })
    expect(alt.raids).toBeUndefined()
  })

  it('reads legacy money and a saved empty raid status', async () => {
    const fs = new MemoryFileSystem()
    fs.setFile(
      savedVariablesPath(gameDir, account, 'BGLite.lua'),
      `BiaoGe = {
      playerInfo = { [123] = { Star = { level = 80 } } },
      Money = { [123] = { Star = { money = 340 } } },
      FBCD = { [123] = { Star = { { player = "Star" } } } },
    }`,
    )

    const { characters } = await loadBiaoGeOverview(fs, gameDir, account)
    expect(characters).toMatchObject([{ name: 'Star', gold: 340, raids: [] }])
  })

  it('reports a missing source for an account without a BGLite save', async () => {
    const fs = new MemoryFileSystem()
    await expect(loadBiaoGeOverview(fs, gameDir, account)).rejects.toMatchObject({
      reason: 'missing-source',
    })
  })
})
