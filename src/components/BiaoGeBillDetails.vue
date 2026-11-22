<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { computed } from 'vue'

import { formatGold } from '../lib/gold'
import type { RaidBill } from '../profiles/biaoge/bills'

const { bill } = defineProps<{ bill: RaidBill }>()
type Group = RaidBill['groups'][number]
type Line = RaidBill['groups'][number]['lines'][number]

const amountColumn: TableColumn<Line> = {
  accessorKey: 'amount',
  header: '金额',
  meta: { class: { th: 'text-right', td: 'text-right' } },
}
const incomeColumns: TableColumn<Line>[] = [
  { accessorKey: 'item', header: '装备／项目' },
  { accessorKey: 'buyer', header: '买家' },
  amountColumn,
]
const fineColumns: TableColumn<Line>[] = [
  { accessorKey: 'item', header: '事由' },
  { accessorKey: 'buyer', header: '罚款人' },
  amountColumn,
]
const expenseColumns: TableColumn<Line>[] = [
  { accessorKey: 'item', header: '支出项目' },
  amountColumn,
]
const tableUi = { th: 'px-3 py-1.5 text-xs', td: 'px-3 py-1.5 whitespace-normal text-xs' }

const incomeGroups = computed(() => bill.groups.filter(({ kind }) => kind !== 'expense'))
const expenses = computed(() =>
  bill.groups.filter(({ kind }) => kind === 'expense').flatMap(({ lines }) => lines),
)
const overview = computed(() => [
  { label: '总收入', value: bill.income },
  { label: '总支出', value: bill.expense },
  { label: '净收入', value: bill.net },
])

function groupTotal({ lines }: Group): number | undefined {
  if (!lines.some(({ amount }) => amount !== undefined)) return undefined
  return lines.reduce((total, { amount }) => total + (amount ?? 0), 0)
}
</script>

<template>
  <div class="@container/bill px-4 py-4 sm:px-5">
    <div
      class="grid items-start gap-4 @min-[600px]/bill:grid-cols-[minmax(0,1fr)_15.5rem] @min-[880px]/bill:grid-cols-[minmax(0,1fr)_17rem]"
    >
      <section class="@container/income min-w-0" aria-labelledby="bill-income-heading">
        <div class="mb-2.5 flex flex-wrap items-center justify-between gap-2">
          <h2
            id="bill-income-heading"
            class="flex items-center gap-2 text-sm font-semibold text-highlighted"
          >
            <UIcon name="i-lucide-coins" class="size-4 text-amber-700 dark:text-amber-400" />
            {{ incomeGroups.some(({ kind }) => kind === 'other') ? '账单明细' : '收入明细' }}
          </h2>
          <UBadge v-if="bill.debt" color="error" variant="subtle">
            欠款 {{ formatGold(bill.debt) }}
          </UBadge>
        </div>
        <div
          v-if="incomeGroups.length"
          class="grid items-start gap-2.5 @min-[620px]/income:grid-cols-2"
        >
          <UCard
            v-for="group in incomeGroups"
            :key="group.index"
            class="min-w-0 overflow-hidden"
            :ui="{ header: 'px-3 py-2 sm:px-3', body: 'p-0 sm:p-0' }"
          >
            <template #header>
              <div class="flex items-center justify-between gap-2 text-xs">
                <h3
                  class="font-semibold"
                  :class="group.kind === 'fine' ? 'text-error' : 'text-highlighted'"
                >
                  {{ group.name }}
                </h3>
                <span class="shrink-0 tabular-nums text-muted">{{
                  formatGold(groupTotal(group))
                }}</span>
              </div>
            </template>
            <UTable
              :data="group.lines"
              :columns="group.kind === 'fine' ? fineColumns : incomeColumns"
              :ui="tableUi"
            >
              <template #item-cell="{ row }">
                <span class="wrap-break-word text-highlighted select-text">{{
                  row.original.item
                }}</span>
              </template>
              <template #buyer-cell="{ row }">
                <span class="wrap-break-word select-text">{{ row.original.buyer || '—' }}</span>
              </template>
              <template #amount-cell="{ row }">
                <span class="whitespace-nowrap tabular-nums text-highlighted select-text">
                  {{ row.original.amountText || formatGold(row.original.amount) }}
                </span>
                <p
                  v-if="row.original.debt"
                  class="mt-0.5 whitespace-nowrap tabular-nums text-error"
                >
                  欠款 {{ formatGold(row.original.debt) }}
                </p>
              </template>
            </UTable>
          </UCard>
        </div>
        <UCard v-else variant="soft" :ui="{ body: 'p-3 sm:p-3' }">
          <p class="text-xs text-muted">暂无收入明细</p>
        </UCard>
      </section>

      <div class="min-w-0 space-y-3">
        <UCard class="overflow-hidden" :ui="{ header: 'px-3 py-2 sm:px-3', body: 'p-0 sm:p-0' }">
          <template #header>
            <h2 class="flex items-center gap-2 text-sm font-semibold text-highlighted">
              <UIcon name="i-lucide-receipt" class="size-4 text-muted" />
              支出
            </h2>
          </template>
          <UTable v-if="expenses.length" :data="expenses" :columns="expenseColumns" :ui="tableUi">
            <template #item-cell="{ row }">
              <span class="wrap-break-word text-highlighted select-text">{{
                row.original.item
              }}</span>
            </template>
            <template #amount-cell="{ row }">
              <span class="whitespace-nowrap tabular-nums select-text">
                {{ row.original.amountText || formatGold(row.original.amount) }}
              </span>
              <p v-if="row.original.debt" class="mt-0.5 whitespace-nowrap tabular-nums text-error">
                欠款 {{ formatGold(row.original.debt) }}
              </p>
            </template>
          </UTable>
          <p v-else class="px-3 py-2 text-xs text-muted">暂无支出明细</p>
        </UCard>

        <UCard :ui="{ header: 'px-3 py-2 sm:px-3', body: 'p-0 sm:p-0' }">
          <template #header>
            <h2 class="flex items-center gap-2 text-sm font-semibold text-highlighted">
              <UIcon name="i-lucide-calculator" class="size-4 text-muted" />
              总览
            </h2>
          </template>
          <dl class="text-xs">
            <div
              v-for="(entry, index) in overview"
              :key="entry.label"
              class="flex justify-between gap-2 px-3 py-2"
              :class="
                index === 2
                  ? 'border-t border-default bg-muted font-semibold text-highlighted'
                  : 'text-muted'
              "
            >
              <dt>{{ entry.label }}</dt>
              <dd class="text-right tabular-nums text-highlighted select-text">
                {{ formatGold(entry.value) }}
              </dd>
            </div>
          </dl>
        </UCard>

        <UCard :ui="{ header: 'px-3 py-2 sm:px-3', body: 'p-0 sm:p-0' }">
          <template #header>
            <h2 class="flex items-center gap-2 text-sm font-semibold text-highlighted">
              <UIcon name="i-lucide-wallet" class="size-4 text-muted" />
              分金
            </h2>
          </template>
          <dl class="text-xs">
            <div class="flex justify-between gap-2 px-3 py-2 text-muted">
              <dt>分金人数</dt>
              <dd class="tabular-nums text-highlighted">
                {{ bill.headcount === undefined ? '—' : `${bill.headcount} 人` }}
              </dd>
            </div>
            <div
              class="flex items-baseline justify-between gap-2 border-y border-default bg-muted px-3 py-2"
            >
              <dt class="font-semibold text-highlighted">人均工资</dt>
              <dd
                class="text-sm font-semibold tabular-nums text-amber-700 select-text dark:text-amber-400"
              >
                {{ formatGold(bill.wage) }}
              </dd>
            </div>
            <div
              v-if="bill.wage !== undefined"
              class="flex justify-between gap-2 px-3 py-2 text-muted"
            >
              <dt>小队工资（5 人）</dt>
              <dd class="tabular-nums text-highlighted select-text">
                {{ formatGold(bill.wage * 5) }}
              </dd>
            </div>
          </dl>
        </UCard>
      </div>
    </div>
  </div>
</template>
