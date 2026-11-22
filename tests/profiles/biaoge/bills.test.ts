import { describe, expect, it } from 'vite-plus/test'

import { loadBiaoGeBills } from '../../../src/profiles/biaoge'
import { savedVariablesPath } from '../../helpers/game'
import { MemoryFileSystem } from '../../helpers/memory-fs'

const gameDir = 'C:\\Games\\World of Warcraft\\_classic_titan_'
const account = '123456#1'
const path = savedVariablesPath(gameDir, account, 'BGLite.lua')

describe('BGLite raid bills', () => {
  it('reads current raid tables and separates fines, expenses, totals and debt', async () => {
    const fs = new MemoryFileSystem()
    const original = `BiaoGe = {
      FB = "ULDtitan",
      options = { moLing = 1 },
      ULDtitan = {
        raidRoster = { realm = "测试服务器", time = 1780000000 },
        boss1 = {
          zhuangbei1 = "|cffa335ee|Hitem:999|h[测试铠甲]|h|r", maijia1 = "|cff00ff00测试玩家|r",
          jine1 = "1450", qiankuan1 = "250",
          zhuangbei2 = "|Hitem:998|h[尚未卖出的装备]|h",
          zhuangbei4 = "|Hitem:997|h[免费装备]|h", maijia4 = "另一个玩家", jine4 = "0",
        },
        boss15 = { zhuangbei1 = "材料", jine1 = 100 },
        boss16 = { maijia1 = "迟到玩家", jine1 = 50 },
        boss17 = { zhuangbei1 = "坦克补贴", jine1 = "201", zhuangbei2 = "治疗补贴" },
        boss18 = { zhuangbei1 = "总收入", zhuangbei4 = "分钱人数", jine4 = "25" },
        boss19 = { jine1 = 999999 },
      },
      SWtitan = {
        boss16 = { zhuangbei1 = "坦克补贴" },
        boss17 = { zhuangbei1 = "总收入", zhuangbei4 = "分钱人数", jine1 = 0, jine4 = 25 },
      },
    }`
    fs.setFile(path, original)
    const { bills } = await loadBiaoGeBills(fs, gameDir, account)
    expect(bills).toEqual([
      expect.objectContaining({
        account, kind: 'current', name: '奥杜尔', realm: '测试服务器', at: 1_780_000_000_000,
        income: 1600, expense: 201, net: 1399, headcount: 25, wage: 55, debt: 250,
        groups: [
          expect.objectContaining({
            index: 1, name: '烈焰巨兽', kind: 'income',
            lines: [
              expect.objectContaining({ slot: 1, item: '测试铠甲', buyer: '测试玩家', amount: 1450, debt: 250 }),
              expect.objectContaining({ slot: 4, item: '免费装备', amount: 0 }),
            ],
          }),
          expect.objectContaining({ index: 15, name: '杂项', kind: 'income' }),
          expect.objectContaining({ index: 16, name: '罚款', kind: 'fine' }),
          expect.objectContaining({
            index: 17, name: '支出', kind: 'expense',
            lines: [expect.objectContaining({ slot: 1, item: '坦克补贴', amount: 201 })],
          }),
        ],
      }),
    ])
    expect(fs.log).toEqual([])
    expect(fs.getText(path)).toBe(original)
  })

  it('joins archived details to their titles and respects saved summary positions and amounts', async () => {
    const fs = new MemoryFileSystem()
    fs.setFile(path, `BiaoGe = {
      HistoryList = { ULDtitan = { { 261122201530, "|cff123456公会金团|r" }, { 261122210000, "只有标题" } } },
      History = {
        ULDtitan = {
          ["261122201530"] = {
            boss1 = { zhuangbei1 = "交易物品", maijia1 = "买家", jine1 = "3600" },
            boss16 = { zhuangbei1 = "治疗补贴", jine1 = "125" },
            boss17 = { zhuangbei1 = "總收入", zhuangbei4 = "分錢人數",
                       jine1 = "3600", jine2 = "125", jine3 = "3475", jine4 = "24", jine5 = "144.79" },
          },
        },
        MC = {
          [1780000000] = { boss1 = { zhuangbei1 = "旧记录", jine1 = 200 } },
          [1780001000] = { boss15 = { jine1 = 0, jine2 = 0, jine4 = 25 } },
        },
      },
    }`)
    const { bills } = await loadBiaoGeBills(fs, gameDir, account)
    expect(bills).toHaveLength(3)
    expect(bills.find(({ raid }) => raid === 'ULDtitan')).toMatchObject({
      kind: 'history', title: '公会金团', at: new Date(2026, 10, 22, 20, 15, 30).getTime(),
      income: 3600, expense: 125, net: 3475, headcount: 24, wage: 144.79,
      groups: [{ index: 1, kind: 'income' }, { index: 16, kind: 'expense' }],
    })
    expect(bills.find(({ raid }) => raid === 'MC')).toMatchObject({
      kind: 'history', name: '熔火之心', at: 1_780_000_000_000, income: 200,
    })
    expect(bills.find(({ at }) => at === 1_780_001_000_000)).toMatchObject({
      kind: 'history', income: 0, expense: 0, groups: [],
    })
  })

  it('limits bill reads to the active BGLite save', async () => {
    const fs = new MemoryFileSystem()
    const archive = 'BiaoGe = { History = { ULDtitan = { [261122201530] = { boss1 = { jine1 = 200 } } } } }'
    fs.setFile(savedVariablesPath(gameDir, account, 'BiaoGe.lua'), archive)
    fs.setFile(path + '.bak', archive)

    await expect(loadBiaoGeBills(fs, gameDir, account)).rejects.toMatchObject({ reason: 'missing-source' })
    fs.setFile(path, 'BiaoGe = {}')
    await expect(loadBiaoGeBills(fs, gameDir, account)).resolves.toMatchObject({ bills: [] })
  })
})
