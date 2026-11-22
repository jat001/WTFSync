import { z } from 'zod'

import {
  asNumber,
  asString,
  asTable,
  tableEntries,
  valueOf,
  type LuaNode,
  type LuaTable,
} from '../../core/lua/ast'
import { billLayout } from './bill-layout'

const billLineSchema = z.object({
  slot: z.number(),
  item: z.string(),
  buyer: z.string().optional(),
  amount: z.number().optional(),
  amountText: z.string().optional(),
  debt: z.number().optional(),
})

const billGroupSchema = z.object({
  index: z.number(),
  kind: z.enum(['income', 'fine', 'expense', 'other']),
  name: z.string(),
  lines: z.array(billLineSchema),
})

export const raidBillSchema = z.object({
  id: z.string(),
  account: z.string(),
  raid: z.string(),
  name: z.string(),
  kind: z.enum(['current', 'history']),
  title: z.string().optional(),
  realm: z.string().optional(),
  at: z.number().optional(),
  income: z.number().optional(),
  expense: z.number().optional(),
  net: z.number().optional(),
  headcount: z.number().optional(),
  wage: z.number().optional(),
  debt: z.number(),
  groups: z.array(billGroupSchema),
})

type BillLine = z.infer<typeof billLineSchema>
type BillGroup = z.infer<typeof billGroupSchema>
export type RaidBill = z.infer<typeof raidBillSchema>

export interface BillSnapshot {
  account: string
  bills: RaidBill[]
  clearedAt: ReadonlyMap<string, number>
}

const summaryLabels = [
  ['总收入', '總收入', 'Total Income'],
  ['总支出', '總支出', 'Total Expenses'],
  ['净收入', '淨收入', 'Net Income'],
  ['分钱人数', '分錢人數', 'Profit Sharer Count'],
  ['人均工资', '人均薪水', 'Wages per capita'],
]

function displayText(node: LuaNode | undefined): string {
  return (asString(node) ?? '')
    .replace(/\|H[^|]*\|h([^|]*)\|h/g, '$1')
    .replace(/\|c[0-9a-f]{8}|\|cn[\w]+:|\|r/gi, '')
    .replace(/\|T[^|]*\|t|\|A[^|]*\|a/g, '')
    .trim()
}

function numeric(node: LuaNode | undefined): number | undefined {
  const literal = asString(node)?.trim()
  const value = asNumber(node) ?? (literal ? Number(literal) : NaN)
  return Number.isFinite(value) ? value : undefined
}

function epochTime(seconds: number | undefined): number | undefined {
  return seconds !== undefined && seconds > 0 && seconds < 253_402_300_800
    ? seconds * 1000
    : undefined
}

function historyTime(id: string): number | undefined {
  if (/^\d{10}$/.test(id)) return epochTime(Number(id))
  const parts = /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(id)
  if (!parts) return undefined
  const [year, month, day, hour, minute, second] = parts.slice(1).map(Number)
  const date = new Date(2000 + year, month - 1, day, hour, minute, second)
  return date.getMonth() === month - 1 && date.getDate() === day ? date.getTime() : undefined
}

function readLines(table: LuaTable, kind: BillGroup['kind']): BillLine[] {
  const slots = new Set<number>()
  for (const key of tableEntries(table).keys()) {
    if (typeof key !== 'string') continue
    const match = /^(?:zhuangbei|maijia|jine|qiankuan)([1-9]\d*)$/.exec(key)
    if (match) slots.add(Number(match[1]))
  }
  const lines: BillLine[] = []
  for (const slot of [...slots].sort((a, b) => a - b)) {
    const item = displayText(valueOf(table, `zhuangbei${slot}`))
    const buyer = displayText(valueOf(table, `maijia${slot}`))
    const amountNode = valueOf(table, `jine${slot}`)
    const amount = numeric(amountNode)
    const amountText = amount === undefined ? displayText(amountNode) : ''
    const debt = numeric(valueOf(table, `qiankuan${slot}`))
    const include = kind === 'expense'
      ? Boolean(amount)
      : Boolean(amount || debt || (item && (buyer || amount !== undefined || amountText)))
    if (!include) continue
    lines.push({
      slot,
      item: item.replace(/^\[(.+)\]$/, '$1') ||
        (kind === 'fine' ? '罚款' : kind === 'expense' ? '支出' : '未命名项目'),
      buyer: buyer || undefined,
      amount,
      amountText: amountText || undefined,
      debt: debt || undefined,
    })
  }
  return lines
}

function readBill(
  data: LuaTable,
  raid: string,
  identity: Pick<RaidBill, 'id' | 'account' | 'kind' | 'title'>,
  flavor: string,
  truncateWages: boolean,
  archiveKey?: string,
): RaidBill | undefined {
  const layout = billLayout(raid, flavor)
  const indexedGroups: { index: number; table: LuaTable }[] = []
  for (const [key, value] of tableEntries(data)) {
    const match = typeof key === 'string' ? /^boss([1-9]\d*)$/.exec(key) : null
    if (match && value.kind === 'table') indexedGroups.push({ index: Number(match[1]), table: value })
  }
  indexedGroups.sort((a, b) => a.index - b.index)
  const markedSummary = [...indexedGroups].reverse().find(({ table }) =>
    summaryLabels.filter((labels, i) => labels.includes(displayText(valueOf(table, `zhuangbei${i + 1}`)))).length >= 2)
  const lastIncome = markedSummary ? markedSummary.index - 2 : layout?.lastIncome
  const summary = lastIncome === undefined ? undefined : indexedGroups.find(({ index }) => index === lastIncome + 2)?.table
  const groups: BillGroup[] = []
  for (const { index, table } of indexedGroups) {
    if (lastIncome !== undefined && index > lastIncome + 1) continue
    let kind: BillGroup['kind'] = 'other'
    let name = `第 ${index} 组明细`
    if (lastIncome !== undefined) {
      kind = 'income'
      name = layout?.bosses?.[index - 1] ?? `首领 ${index}`
      if (index === lastIncome - 1) name = '杂项'
      if (index === lastIncome) { kind = 'fine'; name = '罚款' }
      if (index === lastIncome + 1) { kind = 'expense'; name = '支出' }
    }
    const lines = readLines(table, kind)
    if (lines.length) groups.push({ index, kind, name, lines })
  }

  let income = numeric(valueOf(summary, 'jine1'))
  let expense = numeric(valueOf(summary, 'jine2'))
  if (lastIncome !== undefined) {
    let incomeTotal = 0
    let expenseTotal = 0
    for (const { kind, lines } of groups) {
      const total = lines.reduce((sum, line) => sum + (line.amount ?? 0), 0)
      if (kind === 'expense') expenseTotal += total
      else incomeTotal += total
    }
    income ??= incomeTotal
    expense ??= expenseTotal
  }
  const headcount = numeric(valueOf(summary, 'jine4'))
  const net = numeric(valueOf(summary, 'jine3')) ??
    (income !== undefined && expense !== undefined ? income - expense : undefined)
  let wage = numeric(valueOf(summary, 'jine5'))
  if (wage === undefined && net !== undefined && headcount && headcount > 0) {
    const share = net / headcount
    wage = truncateWages ? Math.trunc(share) : Number(share.toFixed(2))
  }
  if (identity.kind === 'current' && !groups.length && !income && !expense && !net && !wage) return undefined

  const roster = valueOf(data, 'raidRoster')
  return {
    ...identity,
    raid,
    name: layout?.name ?? '其他副本',
    realm: displayText(valueOf(roster, 'realm')) || undefined,
    at: epochTime(numeric(valueOf(roster, 'time'))) ?? (archiveKey ? historyTime(archiveKey) : undefined),
    income,
    expense,
    net,
    headcount,
    wage,
    debt: groups.reduce((sum, group) => sum + group.lines.reduce((total, line) => total + (line.debt ?? 0), 0), 0),
    groups,
  }
}

export function readBills(root: LuaTable, account: string, flavor: string): BillSnapshot {
  const bills: RaidBill[] = []
  const activeRaid = asString(valueOf(root, 'FB'))
  const truncateWages = numeric(valueOf(valueOf(root, 'options'), 'moLing')) === 1
  for (const [raid, data] of tableEntries(root)) {
    if (typeof raid !== 'string' || data.kind !== 'table') continue
    if (raid !== activeRaid && !billLayout(raid, flavor) && !asTable(valueOf(data, 'tradeTbl'))) continue
    const bill = readBill(data, raid, {
      id: JSON.stringify([account, raid]),
      account,
      kind: 'current',
    }, flavor, truncateWages)
    if (bill) bills.push(bill)
  }
  const historyList = valueOf(root, 'HistoryList')
  for (const [raid, history] of tableEntries(valueOf(root, 'History'))) {
    if (typeof raid !== 'string') continue
    const titles = new Map<string, string>()
    for (const item of tableEntries(valueOf(historyList, raid)).values()) {
      const key = valueOf(item, 1)
      const id = asString(key) ?? asNumber(key)
      const title = displayText(valueOf(item, 2))
      if (id !== undefined && title) titles.set(String(id), title)
    }
    for (const [key, data] of tableEntries(history)) {
      if (typeof key === 'boolean' || data.kind !== 'table') continue
      const archiveKey = String(key)
      const bill = readBill(data, raid, {
        id: JSON.stringify([account, raid, key]),
        account,
        kind: 'history',
        title: titles.get(archiveKey),
      }, flavor, truncateWages, archiveKey)
      if (bill) bills.push(bill)
    }
  }
  const clearedAt = new Map<string, number>()
  for (const [raid, entry] of tableEntries(valueOf(root, 'clearBiaoGeMoney'))) {
    const time = epochTime(numeric(valueOf(entry, 'time')))
    if (typeof raid === 'string' && time !== undefined) clearedAt.set(raid, time)
  }
  return { account, bills, clearedAt }
}
