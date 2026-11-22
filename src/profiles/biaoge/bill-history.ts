import { z } from 'zod'

import { raidBillSchema, type BillSnapshot, type RaidBill } from './bills'

const pendingBillSchema = z.object({
  archiveId: z.string(),
  bill: raidBillSchema,
  observedAt: z.number(),
  clearedAt: z.number().optional(),
})
const billHistorySchema = z.object({
  nextId: z.number().int().positive(),
  pending: z.record(z.string(), pendingBillSchema),
  archived: z.record(z.string(), raidBillSchema),
})

export const billHistoriesSchema = z.record(z.string(), billHistorySchema)
export type BillHistory = z.infer<typeof billHistorySchema>
type PendingBill = z.infer<typeof pendingBillSchema>

export const emptyBillHistory: BillHistory = { nextId: 1, pending: {}, archived: {} }

function toArchive(entry: PendingBill): RaidBill {
  return {
    ...entry.bill,
    id: entry.archiveId,
    kind: 'history',
    at: entry.bill.at ?? entry.observedAt,
  }
}

const billFields = Object.keys(raidBillSchema.shape) as (keyof RaidBill)[]

function sameBill(left: RaidBill, right: RaidBill): boolean {
  return billFields.every((key) =>
    key === 'groups'
      ? JSON.stringify(left.groups) === JSON.stringify(right.groups)
      : left[key] === right[key],
  )
}

/** Persist the latest nonempty observation and close that run after a recorded clear. */
export function recordBillSnapshots(
  previous: BillHistory,
  snapshots: readonly BillSnapshot[],
  observedAt = Date.now(),
): BillHistory {
  const pending = { ...previous.pending }
  const archived = { ...previous.archived }
  let nextId = previous.nextId
  let changed = false
  for (const { account, bills, clearedAt } of snapshots) {
    for (const [raid, time] of clearedAt) {
      const slot = JSON.stringify([account, raid])
      const entry = pending[slot]
      if (!entry || (entry.clearedAt !== undefined && time <= entry.clearedAt)) continue
      archived[entry.archiveId] = toArchive(entry)
      delete pending[slot]
      changed = true
    }
    for (const bill of bills) {
      if (bill.kind !== 'current') continue
      const existing = pending[bill.id]
      if (existing && sameBill(existing.bill, bill)) continue
      pending[bill.id] = {
        archiveId: existing?.archiveId ?? `wtfsync:${nextId++}`,
        observedAt,
        bill,
        clearedAt: existing?.clearedAt ?? clearedAt.get(bill.raid),
      }
      changed = true
    }
  }
  return changed ? { nextId, pending, archived } : previous
}

/** Saving the same run again updates its history entry instead of adding a duplicate. */
export function archiveCurrentBill(previous: BillHistory, bill: RaidBill): BillHistory {
  const entry = previous.pending[bill.id]
  if (!entry || !sameBill(entry.bill, bill)) throw new Error('The current bill has changed')
  const archive = toArchive(entry)
  const existing = previous.archived[archive.id]
  if (existing && sameBill(existing, archive)) return previous
  return { ...previous, archived: { ...previous.archived, [archive.id]: archive } }
}
