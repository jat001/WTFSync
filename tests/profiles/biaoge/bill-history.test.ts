import { describe, expect, it } from 'vite-plus/test'

import { parseSavedVariables } from '../../../src/core/lua/parser'
import { asTable } from '../../../src/core/lua/ast'
import {
  archiveCurrentBill,
  billHistoriesSchema,
  emptyBillHistory,
  recordBillSnapshots,
} from '../../../src/profiles/biaoge/bill-history'
import { readBills } from '../../../src/profiles/biaoge/bills'

function observed(account: string, amount?: number, clear?: number, bossTime?: number) {
  const saved = parseSavedVariables(`BiaoGe = {
    ULDtitan = {
      ${amount === undefined ? '' : `boss1 = { zhuangbei1 = "测试装备", jine1 = ${amount} },`}
      ${bossTime === undefined ? '' : `raidRoster = { time = ${bossTime} },`}
    },
    ${clear === undefined ? '' : `clearBiaoGeMoney = { ULDtitan = { time = ${clear} } },`}
  }`)
  return readBills(asTable(saved.globals.get('BiaoGe'))!, account, '_classic_titan_')
}

describe('local raid bill history', () => {
  it('archives only the last observed bill when its account and raid clear advances', () => {
    let state = recordBillSnapshots(emptyBillHistory, [observed('101#1', 100), observed('102#1', 300)], 10)
    state = recordBillSnapshots(state, [observed('101#1', 200, undefined, 1500)], 20)
    expect(Object.values(state.archived)).toHaveLength(0)

    const reset = observed('101#1', undefined, 1800)
    state = recordBillSnapshots(state, [reset], 30)
    expect(Object.values(state.archived)).toMatchObject([
      { account: '101#1', kind: 'history', income: 200, at: 1_500_000 },
    ])
    expect(Object.values(state.pending)).toMatchObject([{ bill: { account: '102#1', income: 300 } }])
    expect(recordBillSnapshots(state, [reset], 40)).toBe(state)
  })

  it('restores a pending run across restart and reuses its ID after a manual save', () => {
    const first = observed('101#1', 120, 1800)
    const state = recordBillSnapshots(emptyBillHistory, [first], 100)
    const manual = archiveCurrentBill(state, first.bills[0])
    const [archived] = Object.values(manual.archived)
    expect(archived).toMatchObject({ income: 120, at: 100 })
    expect(archiveCurrentBill(manual, first.bills[0])).toBe(manual)

    const restored = billHistoriesSchema.parse(JSON.parse(JSON.stringify({ install: manual }))).install
    expect(recordBillSnapshots(restored, [first], 200)).toBe(restored)
    const latest = recordBillSnapshots(restored, [observed('101#1', 180, 1800)], 300)
    const clearedAndReused = recordBillSnapshots(latest, [observed('101#1', 240, 1900)], 400)
    expect(Object.values(clearedAndReused.archived)).toMatchObject([
      { id: archived.id, income: 180, at: 300 },
    ])
    expect(Object.values(clearedAndReused.pending)).toMatchObject([
      { bill: { income: 240 }, clearedAt: 1_900_000 },
    ])
    expect(Object.values(clearedAndReused.pending)[0].archiveId).not.toBe(archived.id)
  })
})
