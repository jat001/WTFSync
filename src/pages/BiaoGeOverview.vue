<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'

import BiaoGeCharacterDetails from '../components/BiaoGeCharacterDetails.vue'
import { useGameDirectoryPicker } from '../composables/useGameDirectoryPicker'
import { useSettings } from '../composables/useSettings'
import { useSync } from '../composables/useSync'
import { toAccountFailure, type AccountFailure } from '../core/accounts'
import { dirname } from '../core/paths'
import { tauriFs } from '../core/tauri-fs'
import { openDirectory } from '../lib/open'
import { failureLabels } from '../lib/sync-text'
import { formatTime } from '../lib/time'
import { wowClasses } from '../lib/wow-classes'
import { gameVersionItems } from '../lib/wow-flavors'
import { biaoge, loadBiaoGeOverview } from '../profiles/biaoge'
import { BiaoGeSaveChangedError, deleteBiaoGeCharacter } from '../profiles/biaoge/delete-character'
import { activeRaidLocks, type OverviewCharacter, type RaidLock } from '../profiles/biaoge/overview'

type AccountOverview = { id: string } & Awaited<ReturnType<typeof loadBiaoGeOverview>>
interface RoleRow {
  character: OverviewCharacter
  locks: RaidLock[]
}

const { settings } = useSettings()
const { gameDir, flavors, statuses, scanning, scanError, refresh } = useSync()
const { pickGameDirectory } = useGameDirectoryPicker()
const toast = useToast()
const accounts = computed(() => statuses.value[biaoge.id]?.accounts ?? [])
const flavorItems = computed(() => gameVersionItems(flavors.value))

const ALL = '*'
const accountFilter = ref(ALL)
const realmFilter = ref(ALL)
const search = ref('')
const loading = ref(false)
const now = ref(Date.now())
const selectedKey = ref('')
const deleteOpen = ref(false)
const deleting = ref(false)
const snapshot = shallowRef<{
  gameDir: string
  overviews: AccountOverview[]
  failures: AccountFailure[]
}>()

let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => { timer = setInterval(() => { now.value = Date.now() }, 30_000) })
onUnmounted(() => { clearInterval(timer) })

watch(gameDir, () => {
  accountFilter.value = ALL
  realmFilter.value = ALL
  search.value = ''
  selectedKey.value = ''
  deleteOpen.value = false
})

watch([gameDir, accounts], async ([dir, found], _, onCleanup) => {
  let cancelled = false
  onCleanup(() => { cancelled = true })
  loading.value = Boolean(dir && found.length)
  if (!dir || !found.length) {
    snapshot.value = undefined
    return
  }
  const results = await Promise.all(found.map(async ({ id, failure }) => {
    if (failure) return { failure }
    try {
      return { overview: { id, ...await loadBiaoGeOverview(tauriFs, dir, id) } }
    } catch (error) {
      return { failure: toAccountFailure(id, error) }
    }
  }))
  if (cancelled) return
  snapshot.value = {
    gameDir: dir,
    overviews: results.flatMap(({ overview }) => overview ? [overview] : []),
    failures: results.flatMap(({ failure }) => failure ? [failure] : []),
  }
  now.value = Date.now()
  loading.value = false
}, { immediate: true })

const currentSnapshot = computed(() =>
  snapshot.value?.gameDir === gameDir.value ? snapshot.value : undefined,
)
const accountItems = computed(() => [
  { label: '全部账号', value: ALL },
  ...accounts.value
    .filter(({ failure }) => failure?.reason !== 'missing-source')
    .map(({ id }) => ({ label: id, value: id })),
])
const allCharacters = computed(() =>
  (currentSnapshot.value?.overviews ?? []).flatMap(({ characters }) => characters),
)
const realms = computed(() => {
  const names = new Map<number, string>()
  for (const { realmId, realm } of allCharacters.value) {
    if (!names.has(realmId) || realm !== String(realmId)) names.set(realmId, realm)
  }
  return names
})
const realmItems = computed(() => [
  { label: '全部服务器', value: ALL },
  ...[...realms.value]
    .map(([id, label]) => ({ label: label === String(id) ? `服务器 ${id}` : label, value: String(id) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'zh-CN')),
])

watch(accountItems, (items) => {
  if (!items.some(({ value }) => value === accountFilter.value)) accountFilter.value = ALL
})
watch(realmItems, (items) => {
  if (!items.some(({ value }) => value === realmFilter.value)) realmFilter.value = ALL
})

const rows = computed<RoleRow[]>(() => {
  const term = search.value.trim().toLowerCase()
  return allCharacters.value
    .filter((character) =>
      (accountFilter.value === ALL || character.account === accountFilter.value) &&
      (realmFilter.value === ALL || String(character.realmId) === realmFilter.value) &&
      character.name.toLowerCase().includes(term),
    )
    .sort((a, b) =>
      (b.itemLevel ?? -1) - (a.itemLevel ?? -1) ||
      (b.level ?? 0) - (a.level ?? 0) ||
      a.name.localeCompare(b.name, 'zh-CN'),
    )
    .map((character) => ({ character, locks: activeRaidLocks(character, now.value) }))
})
const goldTotal = computed(() => {
  const amounts = rows.value.flatMap(({ character }) => character.gold === undefined ? [] : [character.gold])
  return amounts.length ? amounts.reduce((sum, gold) => sum + gold, 0) : undefined
})
const latestSave = computed(() => {
  const times = (currentSnapshot.value?.overviews ?? [])
    .filter(({ id }) => accountFilter.value === ALL || id === accountFilter.value)
    .flatMap(({ modifiedAt }) => modifiedAt === null ? [] : [modifiedAt])
  return times.length ? Math.max(...times) : undefined
})
const failedAccounts = computed(() =>
  (currentSnapshot.value?.failures ?? []).filter(({ reason, id }) =>
    accountFilter.value === ALL ? reason !== 'missing-source' : id === accountFilter.value,
  ),
)
const hasRaidData = computed(() => rows.value.some(({ character }) => character.raids !== undefined))
const lockCount = computed(() => rows.value.reduce((sum, { locks }) => sum + locks.length, 0))
const columns: TableColumn<RoleRow>[] = [
  { id: 'character', header: '角色' },
  { id: 'itemLevel', header: '装等' },
  { id: 'gold', header: '金币' },
  { id: 'locks', header: '当前锁定' },
]

function characterKey({ account, realmId, name }: OverviewCharacter): string {
  return JSON.stringify([account, realmId, name])
}

function realmName({ realmId, realm }: OverviewCharacter): string {
  const name = realms.value.get(realmId) ?? realm
  return name === String(realmId) ? `服务器 ${realmId}` : name
}

const selected = computed(() => allCharacters.value.find((character) => characterKey(character) === selectedKey.value))
const detailsOpen = computed({
  get: () => selected.value !== undefined,
  set: (open: boolean) => { if (!open && !deleting.value) selectedKey.value = '' },
})

async function confirmDelete() {
  const character = selected.value
  const dir = gameDir.value
  if (!character || !dir || deleting.value) return

  deleting.value = true
  try {
    const backup = await deleteBiaoGeCharacter(tauriFs, dir, character)
    deleteOpen.value = false
    selectedKey.value = ''
    await refresh()
    if (!backup) {
      toast.add({ title: '该角色记录已不存在', color: 'neutral' })
      return
    }
    toast.add({
      title: '已删除角色记录',
      description: `${character.name} · 已保留删除前的备份`,
      color: 'success',
      actions: [{
        label: '打开备份目录',
        color: 'neutral',
        variant: 'outline',
        onClick: async () => {
          try {
            await openDirectory(dirname(backup))
          } catch {
            toast.add({ title: '无法打开备份目录', color: 'error' })
          }
        },
      }],
    })
  } catch (error) {
    toast.add({
      title: '删除角色记录失败',
      description: error instanceof BiaoGeSaveChangedError
        ? '存档正在更新，请退出游戏，重新读取后再试。'
        : '请确认游戏已退出，并且 BGLite 存档可以读写。',
      color: 'error',
    })
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div class="space-y-4 p-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-base font-semibold text-highlighted">角色总览</h1>
        <p v-if="latestSave !== undefined" class="mt-0.5 text-xs text-muted">
          最近存档 {{ formatTime(latestSave) }}
        </p>
      </div>
      <div v-if="gameDir" class="flex items-center gap-2">
        <USelect
          v-if="flavorItems.length > 1"
          v-model="settings.flavor"
          :items="flavorItems"
          aria-label="游戏版本"
          size="sm"
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
        description="选择魔兽世界安装目录后即可查看角色"
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
        v-if="failedAccounts.length"
        color="warning"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="failedAccounts.length === 1
          ? failureLabels[failedAccounts[0].reason]
          : `有 ${failedAccounts.length} 个账号的存档读取失败`"
      />

      <template v-if="allCharacters.length">
        <div class="grid grid-cols-3 gap-2">
          <UCard variant="soft" :ui="{ body: 'p-3 sm:p-3' }">
            <p class="text-xs text-muted">角色</p>
            <p class="mt-1 text-lg font-semibold tabular-nums text-highlighted">{{ rows.length }}</p>
          </UCard>
          <UCard variant="soft" :ui="{ body: 'p-3 sm:p-3' }">
            <p class="text-xs text-muted">金币合计</p>
            <p class="mt-1 text-lg font-semibold tabular-nums text-amber-700 dark:text-amber-400">
              {{ goldTotal?.toLocaleString('zh-CN') ?? '—' }}
            </p>
          </UCard>
          <UCard variant="soft" :ui="{ body: 'p-3 sm:p-3' }">
            <p class="text-xs text-muted">当前锁定</p>
            <p class="mt-1 text-lg font-semibold tabular-nums text-highlighted">{{ hasRaidData ? lockCount : '—' }}</p>
          </UCard>
        </div>

        <UCard :ui="{ body: 'p-0 sm:p-0' }">
          <div class="flex flex-wrap items-center gap-2 border-b border-default p-3">
            <UInput
              v-model="search"
              icon="i-lucide-search"
              placeholder="搜索角色"
              aria-label="搜索角色"
              size="sm"
              class="min-w-32 flex-1"
            />
            <USelect
              v-if="realmItems.length > 2"
              v-model="realmFilter"
              :items="realmItems"
              aria-label="筛选服务器"
              size="sm"
            />
            <USelect
              v-if="accountItems.length > 2"
              v-model="accountFilter"
              :items="accountItems"
              aria-label="筛选账号"
              size="sm"
            />
          </div>
          <UTable
            v-if="rows.length"
            :data="rows"
            :columns="columns"
            :ui="{ th: 'px-3 py-2 text-xs', td: 'px-3 py-2 whitespace-normal' }"
          >
            <template #character-cell="{ row }">
              <div class="min-w-28">
                <UButton
                  :aria-label="`查看 ${row.original.character.name} 的角色详情`"
                  variant="link"
                  color="neutral"
                  size="sm"
                  trailing-icon="i-lucide-chevron-right"
                  class="gap-1 p-0 font-semibold text-highlighted"
                  @click="selectedKey = characterKey(row.original.character)"
                >
                  <span
                    class="size-2 shrink-0 rounded-full ring-1 ring-default"
                    :class="wowClasses[row.original.character.classFile ?? '']?.dot ?? 'bg-muted'"
                  />
                  <span>{{ row.original.character.name }}</span>
                </UButton>
                <p class="mt-0.5 text-xs text-muted">
                  {{ realmName(row.original.character) }}
                  <template v-if="row.original.character.level !== undefined">
                    · {{ row.original.character.level }} 级
                  </template>
                </p>
              </div>
            </template>
            <template #itemLevel-cell="{ row }">
              <span class="tabular-nums">{{ row.original.character.itemLevel?.toFixed(1) ?? '—' }}</span>
            </template>
            <template #gold-cell="{ row }">
              <span
                class="whitespace-nowrap tabular-nums"
                :class="{ 'text-amber-700 dark:text-amber-400': row.original.character.gold !== undefined }"
              >
                {{ row.original.character.gold?.toLocaleString('zh-CN') ?? '—' }}
              </span>
            </template>
            <template #locks-cell="{ row }">
              <div v-if="row.original.locks.length" class="flex flex-wrap items-center gap-1">
                <UBadge
                  v-for="lock in row.original.locks.slice(0, 2)"
                  :key="lock.key"
                  color="info"
                  variant="subtle"
                  size="sm"
                  class="whitespace-nowrap"
                >
                  {{ lock.name }}<template v-if="lock.progress"> {{ lock.progress }}</template>
                </UBadge>
                <span v-if="row.original.locks.length > 2" class="text-xs text-muted">
                  +{{ row.original.locks.length - 2 }}
                </span>
              </div>
              <span v-else class="whitespace-nowrap text-xs text-muted">
                {{ row.original.character.raids === undefined ? '未记录' : '无锁定' }}
              </span>
            </template>
          </UTable>
          <UEmpty v-else icon="i-lucide-search-x" title="没有符合条件的角色" size="sm" />
        </UCard>
      </template>
      <UCard v-else>
        <UEmpty
          :icon="scanning || loading ? 'i-lucide-loader-circle' : 'i-lucide-users'"
          :title="scanning || loading ? '正在读取角色…' : '暂无角色数据'"
          :description="scanning || loading ? undefined : '在游戏中启用 BGLite 并登录角色，退出游戏后再重新读取。'"
          size="sm"
        />
      </UCard>
    </template>

    <USlideover
      v-model:open="detailsOpen"
      :title="selected?.name ?? '角色详情'"
      :description="selected ? `${realmName(selected)} · 账号 ${selected.account}` : undefined"
      :close="{ 'aria-label': '关闭角色详情' }"
      :dismissible="!deleting"
      :ui="{ content: 'max-w-xl' }"
    >
      <template #body>
        <BiaoGeCharacterDetails
          v-if="selected"
          :key="selectedKey"
          :character="selected"
          :now="now"
        />
      </template>
      <template #footer>
        <UModal
          v-if="selected"
          v-model:open="deleteOpen"
          title="删除角色记录？"
          :description="`将从账号 ${selected.account} 的 BGLite 存档中删除「${selected.name}」（${realmName(selected)}）的角色记录。`"
          :dismissible="!deleting"
          :close="deleting ? false : { 'aria-label': '关闭删除确认' }"
          :ui="{ footer: 'justify-end' }"
        >
          <UButton
            label="删除角色记录"
            icon="i-lucide-trash-2"
            color="error"
            variant="ghost"
            size="sm"
          />
          <template #body>
            <p class="text-sm text-muted">
              请先退出游戏，避免游戏把记录写回。删除前会自动备份原存档。
              已生成的同步模块会在下次同步时更新。
            </p>
          </template>
          <template #footer>
            <UButton label="取消" color="neutral" variant="outline" :disabled="deleting" @click="deleteOpen = false" />
            <UButton label="确认删除" color="error" :loading="deleting" @click="confirmDelete" />
          </template>
        </UModal>
      </template>
    </USlideover>
  </div>
</template>
