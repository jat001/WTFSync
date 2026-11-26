<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { computed, ref, watch } from 'vue'

import AppSelect from '../components/AppSelect.vue'
import BiaoGeBillDetails from '../components/BiaoGeBillDetails.vue'
import { useBiaoGeBills } from '../composables/useBiaoGeBills'
import { useGameDirectoryPicker } from '../composables/useGameDirectoryPicker'
import { useSettings } from '../composables/useSettings'
import { useSync } from '../composables/useSync'
import { formatGold } from '../lib/gold'
import { failureLabels } from '../lib/sync-text'
import { formatTime } from '../lib/time'
import { gameVersionItems } from '../lib/wow-flavors'
import { shortRealmName } from '../lib/wow-realms'
import type { RaidBill } from '../profiles/biaoge/bills'

const { settings } = useSettings()
const { gameDir, flavors, scanning, scanError, refresh } = useSync()
const { allBills, current, loading, watchFailed, storageFailed, saveBill } = useBiaoGeBills()
const { pickGameDirectory } = useGameDirectoryPicker()
const toast = useToast()
const flavorItems = computed(() => gameVersionItems(flavors.value))

const ALL = '*'
const PAGE_SIZE = 20
const search = ref('')
const accountFilter = ref(ALL)
const kindFilter = ref(ALL)
const page = ref(1)
const selectedId = ref('')
const saving = ref(false)

watch(gameDir, () => {
  search.value = ''
  accountFilter.value = ALL
  kindFilter.value = ALL
  selectedId.value = ''
})

const accountItems = computed(() => [
  { label: '全部账号', value: ALL },
  ...[...new Set(allBills.value.map(({ account }) => account))].map((account) => ({
    label: account,
    value: account,
  })),
])
const kindLabels = { current: '当前表格', history: '历史账单' }
const kindItems = [
  { label: '全部账单', value: ALL },
  { label: kindLabels.current, value: 'current' },
  { label: kindLabels.history, value: 'history' },
]
const hasHistory = computed(() => allBills.value.some(({ kind }) => kind === 'history'))
watch(hasHistory, (exists) => {
  if (!exists) kindFilter.value = ALL
})
watch(accountItems, (items) => {
  if (!items.some(({ value }) => value === accountFilter.value)) accountFilter.value = ALL
})
watch([search, accountFilter, kindFilter], () => {
  page.value = 1
})

const filtered = computed(() => {
  const term = search.value.trim().toLowerCase()
  return allBills.value
    .filter((bill) => {
      if (accountFilter.value !== ALL && accountFilter.value !== bill.account) return false
      if (kindFilter.value !== ALL && kindFilter.value !== bill.kind) return false
      if (
        !term ||
        [bill.name, bill.title, bill.realm].some((text) => text?.toLowerCase().includes(term))
      )
        return true
      return bill.groups.some(({ lines }) =>
        lines.some(
          ({ item, buyer }) =>
            item.toLowerCase().includes(term) || buyer?.toLowerCase().includes(term),
        ),
      )
    })
    .sort(
      (a, b) =>
        Number(a.kind === 'history') - Number(b.kind === 'history') ||
        (b.at ?? 0) - (a.at ?? 0) ||
        a.name.localeCompare(b.name, 'zh-CN'),
    )
})
watch(
  () => filtered.value.length,
  (count) => {
    page.value = Math.min(page.value, Math.max(1, Math.ceil(count / PAGE_SIZE)))
  },
)
const rows = computed(() =>
  filtered.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE),
)
const columns: TableColumn<RaidBill>[] = [
  { accessorKey: 'name', header: '账单' },
  { accessorKey: 'income', header: '收入' },
  { accessorKey: 'expense', header: '支出' },
  { accessorKey: 'wage', header: '人均工资' },
]

function billContext(bill: RaidBill): string {
  const time = bill.at === undefined ? undefined : formatTime(bill.at)
  const realm = bill.realm && shortRealmName(bill.realm)
  return [kindLabels[bill.kind], bill.account, realm, time].filter(Boolean).join(' · ')
}

const selected = computed(() => allBills.value.find(({ id }) => id === selectedId.value))
const detailsOpen = computed({
  get: () => selected.value !== undefined,
  set: (open: boolean) => {
    if (!open) selectedId.value = ''
  },
})

async function saveSelectedBill() {
  const bill = selected.value
  if (bill?.kind !== 'current' || saving.value) return
  saving.value = true
  try {
    await saveBill(bill)
    toast.add({ title: '已保存到账单历史', color: 'success' })
  } catch {
    toast.add({ title: '保存账单失败', description: '请重新读取后再试。', color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="space-y-4 p-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <h1 class="text-base font-semibold text-highlighted">金团账单</h1>
      <div v-if="gameDir" class="flex items-center gap-2">
        <AppSelect
          v-if="flavorItems.length > 1"
          v-model="settings.flavor"
          :items="flavorItems"
          aria-label="游戏版本"
        />
        <UButton
          label="重新读取"
          icon="i-lucide-rotate-cw"
          color="neutral"
          variant="outline"
          size="sm"
          :loading="scanning || loading"
          @click="refresh"
        />
      </div>
    </div>

    <UCard v-if="!gameDir">
      <UEmpty
        icon="i-lucide-folder-search"
        title="尚未设置游戏目录"
        description="选择魔兽世界安装目录后即可查看本地账单"
        :actions="[{ label: '选择目录', icon: 'i-lucide-folder-open', onClick: pickGameDirectory }]"
        size="sm"
      />
    </UCard>
    <template v-else>
      <UAlert
        v-if="scanError"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        title="读取游戏目录失败"
        description="请确认游戏目录仍然可访问，然后重新读取。"
      />
      <UAlert
        v-if="current?.failures.length"
        color="warning"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="`${current.failures.length} 个账号的存档读取失败`"
        :description="
          current.failures.length === 1 ? failureLabels[current.failures[0].reason] : undefined
        "
      />
      <UAlert
        v-if="watchFailed"
        color="warning"
        variant="subtle"
        icon="i-lucide-circle-alert"
        title="无法自动监听账单变化"
        description="点击「重新读取」可检查账单和清空记录。"
      />
      <UAlert
        v-if="storageFailed"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        title="无法保存或读取本地账单历史"
        description="点击「重新读取」可以重试。"
      />

      <UCard v-if="allBills.length" :ui="{ body: 'p-0 sm:p-0' }">
        <div class="flex flex-wrap items-center gap-2 border-b border-default p-3">
          <UInput
            v-model="search"
            icon="i-lucide-search"
            placeholder="搜索副本、装备或玩家"
            aria-label="搜索账单"
            size="sm"
            class="min-w-40 flex-1"
          />
          <AppSelect
            v-if="hasHistory"
            v-model="kindFilter"
            :items="kindItems"
            aria-label="账单类型"
          />
          <AppSelect
            v-if="accountItems.length > 2"
            v-model="accountFilter"
            :items="accountItems"
            aria-label="筛选账号"
          />
        </div>
        <UTable
          v-if="rows.length"
          :data="rows"
          :columns="columns"
          :ui="{ th: 'px-3 py-2 text-xs', td: 'px-3 py-2 whitespace-normal' }"
        >
          <template #name-cell="{ row }">
            <UButton
              variant="link"
              color="neutral"
              size="sm"
              trailing-icon="i-lucide-chevron-right"
              class="gap-1 p-0 text-left font-semibold text-highlighted"
              @click="selectedId = row.original.id"
            >
              {{ row.original.name }}
            </UButton>
            <p class="mt-0.5 text-xs text-muted">{{ billContext(row.original) }}</p>
            <p
              v-if="row.original.title"
              class="line-clamp-1 text-xs text-muted"
              :title="row.original.title"
            >
              {{ row.original.title }}
            </p>
          </template>
          <template #income-cell="{ row }">
            <span class="whitespace-nowrap tabular-nums">{{
              formatGold(row.original.income)
            }}</span>
          </template>
          <template #expense-cell="{ row }">
            <span class="whitespace-nowrap tabular-nums">{{
              formatGold(row.original.expense)
            }}</span>
          </template>
          <template #wage-cell="{ row }">
            <span class="whitespace-nowrap tabular-nums">{{ formatGold(row.original.wage) }}</span>
          </template>
        </UTable>
        <UEmpty v-else icon="i-lucide-search-x" title="没有符合条件的账单" size="sm" />
        <div
          v-if="filtered.length > PAGE_SIZE"
          class="flex flex-wrap items-center justify-between gap-2 border-t border-default px-4 py-3"
        >
          <span class="text-xs text-muted">共 {{ filtered.length }} 笔账单</span>
          <UPagination
            v-model:page="page"
            :items-per-page="PAGE_SIZE"
            :total="filtered.length"
            size="xs"
          />
        </div>
      </UCard>
      <UCard v-else>
        <UEmpty
          :icon="scanning || loading ? 'i-lucide-loader-circle' : 'i-lucide-receipt-text'"
          :title="scanning || loading ? '正在读取账单…' : '暂无已保存的账单'"
          :description="
            scanning || loading
              ? undefined
              : '在游戏里记账后，退出游戏或重载界面以保存，再重新读取。'
          "
          size="sm"
        />
      </UCard>
    </template>

    <UModal
      v-model:open="detailsOpen"
      :title="selected?.name ?? '账单明细'"
      :description="selected ? billContext(selected) : undefined"
      :close="{ 'aria-label': '关闭账单明细' }"
      :ui="{
        content: 'max-w-6xl',
        header: 'min-h-0 px-4 py-3 sm:px-5',
        body: 'p-0 sm:p-0',
        footer: 'justify-end px-4 py-3 sm:px-5',
      }"
    >
      <template #body>
        <BiaoGeBillDetails v-if="selected" :bill="selected" />
      </template>
      <template v-if="selected?.kind === 'current'" #footer>
        <UButton
          label="保存到历史"
          icon="i-lucide-archive"
          variant="outline"
          size="sm"
          :loading="saving"
          @click="saveSelectedBill"
        />
      </template>
    </UModal>
  </div>
</template>
