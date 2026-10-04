<script setup lang="ts">
import { computed, shallowRef } from 'vue'

import AccountRow from '../components/AccountRow.vue'
import { useGameDirectoryPicker } from '../composables/useGameDirectoryPicker'
import { useModal } from '../composables/useModal'
import { useSettings } from '../composables/useSettings'
import { useSync } from '../composables/useSync'
import type { AddonProfile } from '../core/profile'
import { openDirectory } from '../lib/open'
import { summarizeReport, triggerLabels } from '../lib/sync-text'
import { isTauri } from '../lib/tauri'
import { formatTime } from '../lib/time'
import { defaultProfile, findProfile } from '../profiles'

const toast = useToast()
const { settings } = useSettings()
const { openModal } = useModal()
const { pickGameDirectory } = useGameDirectoryPicker()
const {
  profiles,
  gameDir,
  flavors,
  statuses,
  scanning,
  scanError,
  running,
  activity,
  lastActivity,
  watchedAccounts,
  watchError,
  selectedAccounts,
  toggleAccount,
  refresh,
  sync,
  outputDir,
} = useSync()

// Profiles become tabs once there is more than one.
const profile = shallowRef<AddonProfile>(defaultProfile)
const profileTabs = computed(() =>
  profiles.map((p) => ({ label: p.name, value: p.id })),
)
const profileId = computed({
  get: () => profile.value.id,
  set: (id: string) => {
    profile.value = findProfile(id) ?? defaultProfile
  },
})

const flavorItems = computed(() =>
  flavors.value.map((flavor) => ({ label: flavor.dir, value: flavor.dir })),
)

const status = computed(() => statuses.value[profile.value.id])
const selected = computed(() => new Set(selectedAccounts(profile.value)))
const synced = computed(() => new Set(status.value?.syncedAccounts ?? []))

/** The selection differs from what the output currently contains. */
const outOfDate = computed(() => {
  if (!status.value) return false
  const a = selected.value
  const b = synced.value
  return a.size !== b.size || [...a].some((id) => !b.has(id))
})

const canSync = computed(
  () =>
    isTauri &&
    !!gameDir.value &&
    !running.value &&
    (selected.value.size > 0 || synced.value.size > 0),
)

const stats = computed(() => {
  const accounts = status.value?.accounts ?? []
  const last = lastActivity.value
  return [
    {
      label: '已选账号',
      value: `${selected.value.size} / ${accounts.length}`,
      icon: 'i-lucide-users',
      hint: '勾选的账号会参与同步',
    },
    {
      label: '同步模块',
      value: status.value?.outputExists ? '已生成' : '未生成',
      icon: 'i-lucide-package',
      hint: status.value?.outputExists
        ? `包含 ${synced.value.size} 个账号${outOfDate.value ? '，选择已变更' : ''}`
        : '同步后生成到插件目录',
    },
    {
      label: '上次同步',
      value: last ? formatTime(last.at) : '—',
      icon: 'i-lucide-history',
      hint: last
        ? (last.error ?? summarizeReport(last.report!))
        : '本次启动后尚未同步',
    },
    {
      label: '自动同步',
      value: settings.autoSync ? '已开启' : '已关闭',
      icon: 'i-lucide-radar',
      hint: settings.autoSync
        ? `监听 ${watchedAccounts.value} 个账号的存档`
        : '存档变化后需手动同步',
    },
  ]
})

const timeline = computed(() =>
  activity.value.slice(0, 8).map((entry) => {
    const failed = entry.error !== null
    const partial = !failed && (entry.report?.failed.length ?? 0) > 0
    return {
      date: formatTime(entry.at),
      title: `${triggerLabels[entry.trigger]}${failed ? '失败' : partial ? '部分失败' : '完成'}`,
      description: entry.error ?? summarizeReport(entry.report!),
      icon: failed
        ? 'i-lucide-circle-x'
        : partial
          ? 'i-lucide-circle-alert'
          : 'i-lucide-circle-check',
    }
  }),
)

async function onSync() {
  const outcomes = await sync('manual', profile.value)
  const outcome = outcomes[0]
  if (!outcome) {
    toast.add({
      title: '没有可同步的内容',
      description: '请先勾选要同步的账号',
      icon: 'i-lucide-info',
      color: 'warning',
    })
    return
  }
  if (outcome.error !== null || !outcome.report) {
    toast.add({
      title: '同步失败',
      description: outcome.error ?? undefined,
      icon: 'i-lucide-circle-x',
      color: 'error',
    })
  } else if (outcome.report.failed.length > 0) {
    toast.add({
      title: '部分账号同步失败',
      description: summarizeReport(outcome.report),
      icon: 'i-lucide-circle-alert',
      color: 'warning',
      actions: [
        {
          label: '查看详情',
          color: 'neutral',
          variant: 'outline',
          onClick: () => openModal('sync-report'),
        },
      ],
    })
  } else {
    toast.add({
      title: '同步完成',
      description: `${summarizeReport(outcome.report)}。请在游戏中输入 /reload 生效`,
      icon: 'i-lucide-circle-check',
      color: 'success',
    })
  }
}

async function openOutputDir() {
  try {
    await openDirectory(outputDir(profile.value))
  } catch {
    toast.add({
      title: '无法打开插件目录',
      description: '同步模块可能尚未生成',
      icon: 'i-lucide-circle-alert',
      color: 'error',
    })
  }
}
</script>

<template>
  <div class="space-y-4 p-4">
    <!-- Toolbar -->
    <div class="flex items-center justify-between gap-3">
      <div class="min-w-0">
        <h1 class="truncate text-base font-semibold text-highlighted">
          工作台
        </h1>
        <p class="truncate text-[11px] text-muted select-text">
          {{ gameDir || '尚未设置游戏目录' }}
        </p>
      </div>
      <div v-if="gameDir" class="flex shrink-0 items-center gap-2">
        <USelect
          v-model="settings.flavor"
          :items="flavorItems"
          value-key="value"
          size="sm"
          class="w-40"
          aria-label="游戏版本"
        />
        <UButton
          icon="i-lucide-refresh-cw"
          label="立即同步"
          size="sm"
          :loading="running"
          :disabled="!canSync"
          @click="onSync"
        />
      </div>
    </div>

    <!-- First run -->
    <UCard v-if="!gameDir">
      <UEmpty
        icon="i-lucide-folder-search"
        title="尚未设置游戏目录"
        description="选择魔兽世界的安装目录（例如 World of Warcraft）或其中的游戏版本目录（例如 _classic_titan_）"
        :actions="[
          {
            label: '选择目录',
            icon: 'i-lucide-folder-open',
            onClick: pickGameDirectory,
          },
        ]"
        size="sm"
      />
    </UCard>

    <template v-else>
      <UTabs
        v-if="profiles.length > 1"
        v-model="profileId"
        :items="profileTabs"
        :content="false"
        size="sm"
      />

      <!-- Problems -->
      <UAlert
        v-if="scanError"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-x"
        title="读取游戏目录失败"
        :description="scanError"
      />
      <UAlert
        v-if="status && !status.requiredAddonInstalled"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        :title="`未安装 ${profile.requiredAddon} 插件`"
        description="同步模块依赖该插件，安装后才能在游戏中生效"
      />
      <UAlert
        v-if="watchError"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        title="无法监听存档变化"
        :description="watchError"
      />

      <!-- Stats -->
      <div class="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <UCard
          v-for="stat in stats"
          :key="stat.label"
          variant="soft"
          class="ring-0"
        >
          <div class="flex items-center justify-between">
            <span class="text-xs text-muted">{{ stat.label }}</span>
            <UIcon :name="stat.icon" class="size-4 text-dimmed" />
          </div>
          <p class="mt-1.5 text-xl font-semibold tabular-nums text-highlighted">
            {{ stat.value }}
          </p>
          <p class="truncate text-[11px] text-dimmed" :title="stat.hint">
            {{ stat.hint }}
          </p>
        </UCard>
      </div>

      <div class="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <!-- Accounts -->
        <UCard :ui="{ body: 'p-0' }">
          <div class="flex items-center justify-between gap-2 px-4 py-3">
            <div class="flex items-center gap-2">
              <h2 class="text-sm font-semibold text-highlighted">账号</h2>
              <UBadge color="primary" variant="subtle" size="sm">
                已选 {{ selected.size }}
              </UBadge>
            </div>
            <div class="flex items-center">
              <UTooltip text="打开插件目录">
                <UButton
                  icon="i-lucide-folder-open"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  aria-label="打开插件目录"
                  :disabled="!status?.outputExists"
                  @click="openOutputDir"
                />
              </UTooltip>
              <UTooltip text="重新读取账号">
                <UButton
                  icon="i-lucide-rotate-cw"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  aria-label="重新读取账号"
                  :loading="scanning"
                  @click="refresh"
                />
              </UTooltip>
            </div>
          </div>
          <div
            v-if="status?.accounts.length"
            class="divide-y divide-default border-t border-default"
          >
            <AccountRow
              v-for="account in status.accounts"
              :key="account.id"
              :account="account"
              :selected="selected.has(account.id)"
              :synced="synced.has(account.id)"
              @toggle="toggleAccount(profile, account.id, $event)"
            />
          </div>
          <div v-else class="border-t border-default px-4 py-8">
            <UEmpty
              icon="i-lucide-user-x"
              :title="scanning ? '正在读取账号…' : '没有找到账号'"
              description="账号目录位于 WTF/Account 下，用该账号登录一次游戏后才会出现"
              size="sm"
            />
          </div>
        </UCard>

        <!-- Activity -->
        <UCard :ui="{ body: 'p-0' }">
          <div class="flex items-center justify-between gap-2 px-4 py-3">
            <h2 class="text-sm font-semibold text-highlighted">最近活动</h2>
            <UButton
              v-if="lastActivity"
              label="查看详情"
              color="neutral"
              variant="link"
              size="xs"
              trailing-icon="i-lucide-arrow-up-right"
              @click="openModal('sync-report')"
            />
          </div>
          <div class="px-4 pb-4">
            <UTimeline
              v-if="timeline.length"
              :items="timeline"
              size="sm"
              color="primary"
            />
            <UEmpty
              v-else
              icon="i-lucide-history"
              title="暂无同步记录"
              description="同步后会在这里显示结果"
              size="sm"
            />
          </div>
        </UCard>
      </div>
    </template>
  </div>
</template>
