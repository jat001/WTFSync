<script setup lang="ts">
import { computed, ref, watch, type Component } from 'vue'

import pkg from '../package.json'
import AppLogo from './components/AppLogo.vue'
import SyncReportModal from './components/SyncReportModal.vue'
import { useModal, type ModalKind } from './composables/useModal'
import { useSettings, type ThemeMode } from './composables/useSettings'
import { useSync } from './composables/useSync'
import { useTheme } from './composables/useTheme'
import { summarizeReport, triggerLabels } from './lib/sync-text'
import { formatTime } from './lib/time'
import About from './pages/About.vue'
import Home from './pages/Home.vue'
import Setting from './pages/Setting.vue'

type PageKey = 'home' | 'setting' | 'about'

const pages: Record<PageKey, Component> = {
  home: Home,
  setting: Setting,
  about: About,
}
const current = ref<PageKey>('home')

const toast = useToast()
const { settings } = useSettings()
const { theme, cycleTheme } = useTheme()
const { running, lastActivity, watchedAccounts, gameDir } = useSync()
const { currentModal, openModal, closeModal } = useModal()

const lastSyncText = computed(() => {
  const last = lastActivity.value
  if (!last) return '本次启动后尚未同步'
  return `${formatTime(last.at)} · ${last.error ? '同步失败' : summarizeReport(last.report!)}`
})

const watchState = computed(() => {
  if (running.value) {
    return {
      dot: 'bg-primary',
      tone: 'text-primary',
      icon: 'i-lucide-refresh-cw',
      text: '正在同步…',
    }
  }
  if (!settings.autoSync) {
    return {
      dot: 'bg-warning',
      tone: 'text-warning',
      icon: 'i-lucide-pause',
      text: '自动同步已关闭',
    }
  }
  if (watchedAccounts.value === 0) {
    return {
      dot: 'bg-warning',
      tone: 'text-warning',
      icon: 'i-lucide-radar',
      text: '没有监听中的账号',
    }
  }
  return {
    dot: 'bg-success',
    tone: 'text-success',
    icon: 'i-lucide-radar',
    text: `监听 ${watchedAccounts.value} 个账号`,
  }
})

const health = computed(() => {
  const last = lastActivity.value
  if (running.value) return { color: 'primary' as const, label: '同步中' }
  if (last?.error) return { color: 'error' as const, label: '同步失败' }
  if (last?.report?.failed.length) {
    return { color: 'warning' as const, label: '部分失败' }
  }
  return { color: 'success' as const, label: '运行正常' }
})

// Manual syncs report through their own toast; surface background failures.
watch(lastActivity, (entry) => {
  if (!entry || entry.trigger === 'manual') return
  const failed = entry.report?.failed.length ?? 0
  if (entry.error === null && failed === 0) return
  toast.add({
    title: `${triggerLabels[entry.trigger]}${entry.error ? '失败' : '部分失败'}`,
    description: entry.error ?? summarizeReport(entry.report!),
    icon: 'i-lucide-circle-alert',
    color: entry.error ? 'error' : 'warning',
    actions: [
      {
        label: '查看详情',
        color: 'neutral',
        variant: 'outline',
        onClick: () => openModal('sync-report'),
      },
    ],
  })
})

const themeMeta: Record<ThemeMode, { icon: string; label: string }> = {
  light: { icon: 'i-lucide-sun', label: '浅色模式' },
  dark: { icon: 'i-lucide-moon', label: '深色模式' },
  system: { icon: 'i-lucide-monitor', label: '跟随系统' },
}
const themeIcon = computed(() => themeMeta[theme.value].icon)
const themeLabel = computed(() => themeMeta[theme.value].label)

const modalTitles: Record<ModalKind, string> = {
  'sync-report': '同步详情',
}

const modalOpen = computed({
  get: () => currentModal.value !== null,
  set: (v: boolean) => {
    if (!v) closeModal()
  },
})

const navItems = [
  {
    key: 'home' as PageKey,
    label: '工作台',
    icon: 'i-lucide-layout-dashboard',
  },
  { key: 'setting' as PageKey, label: '设置', icon: 'i-lucide-settings-2' },
  { key: 'about' as PageKey, label: '关于', icon: 'i-lucide-circle-help' },
]

function isActive(key: PageKey) {
  return current.value === key
}
</script>

<template>
  <UApp>
    <div
      class="flex h-screen min-h-0 select-none flex-col overflow-hidden bg-default text-default"
    >
      <div class="flex min-h-0 min-w-0 flex-1">
        <!-- Sidebar navigation -->
        <aside
          class="flex w-52 shrink-0 flex-col border-r border-default bg-muted"
        >
          <div
            class="flex items-center gap-2.5 border-b border-default px-4 py-3"
          >
            <AppLogo />
            <div class="min-w-0">
              <p class="truncate text-[13px] font-semibold text-highlighted">
                WTFSync
              </p>
              <p class="truncate text-[11px] text-dimmed">插件数据同步</p>
            </div>
          </div>

          <nav class="min-h-0 flex-1 overflow-y-auto px-2 py-3">
            <p
              class="px-2 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-dimmed"
            >
              导航
            </p>
            <div class="space-y-0.5">
              <UButton
                v-for="item in navItems"
                :key="item.key"
                :label="item.label"
                :icon="item.icon"
                size="sm"
                :color="isActive(item.key) ? 'primary' : 'neutral'"
                :variant="isActive(item.key) ? 'soft' : 'ghost'"
                class="w-full justify-start"
                @click="current = item.key"
              />
            </div>
          </nav>

          <div class="border-t border-default px-3 py-3">
            <div class="flex items-center justify-between text-xs">
              <span class="text-muted">自动同步</span>
              <USwitch
                v-model="settings.autoSync"
                size="sm"
                aria-label="自动同步"
              />
            </div>
            <p class="mt-1.5 truncate text-[11px] text-dimmed" :title="lastSyncText">
              {{ lastSyncText }}
            </p>
          </div>

          <div
            class="flex items-center gap-2 border-t border-default px-4 py-2.5"
          >
            <span
              class="size-1.5 shrink-0 rounded-full"
              :class="watchState.dot"
            />
            <span class="truncate text-[11px] text-muted">
              {{ watchState.text }}
            </span>
            <span class="ml-auto flex shrink-0 items-center gap-0.5">
              <UTooltip :text="`主题：${themeLabel}`">
                <UButton
                  :icon="themeIcon"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :aria-label="`切换主题，当前为${themeLabel}`"
                  @click="cycleTheme"
                />
              </UTooltip>
              <span class="px-1 text-[11px] tabular-nums text-dimmed"
                >v{{ pkg.version }}</span
              >
            </span>
          </div>
        </aside>

        <!-- Content area -->
        <main class="min-h-0 min-w-0 flex-1 overflow-y-auto bg-default">
          <component :is="pages[current]" />
        </main>
      </div>

      <!-- Status bar -->
      <footer
        class="flex h-7 shrink-0 items-center gap-2 border-t border-default bg-muted px-3 text-[11px] text-muted"
      >
        <UIcon
          :name="watchState.icon"
          class="size-3.5 shrink-0"
          :class="watchState.tone"
        />
        <span class="shrink-0">{{ watchState.text }}</span>
        <span class="flex h-3 items-center">
          <USeparator orientation="vertical" />
        </span>
        <span class="min-w-0 truncate">上次同步：{{ lastSyncText }}</span>
        <span class="flex-1" />
        <span class="min-w-0 truncate" :title="gameDir">{{
          settings.flavor || '未设置游戏目录'
        }}</span>
        <span class="flex h-3 items-center">
          <USeparator orientation="vertical" />
        </span>
        <UBadge :color="health.color" variant="subtle" size="sm">{{
          health.label
        }}</UBadge>
      </footer>
    </div>

    <!-- Global modal -->
    <UModal
      v-model:open="modalOpen"
      :title="currentModal ? modalTitles[currentModal] : ''"
    >
      <template #body>
        <SyncReportModal v-if="currentModal === 'sync-report'" />
      </template>
    </UModal>
  </UApp>
</template>
