<script setup lang="ts">
import { computed, ref, type Component } from 'vue'

import About from './About.vue'
import WatchPathsModal from './components/WatchPathsModal.vue'
import Home from './Home.vue'
import Setting from './Setting.vue'
import { useModal } from './ui/modal'

type PageKey = 'home' | 'setting' | 'about'

const pages: Record<PageKey, Component> = {
  home: Home,
  setting: Setting,
  about: About,
}
const current = ref<PageKey>('home')
const syncing = ref(true)

const { currentModal, closeModal } = useModal()
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
        <!-- 侧边导航 -->
        <aside
          class="flex w-52 shrink-0 flex-col border-r border-default bg-muted"
        >
          <div
            class="flex items-center gap-2.5 border-b border-default px-4 py-3"
          >
            <span
              class="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-bold text-inverted"
              >W</span
            >
            <div class="min-w-0">
              <p class="truncate text-[13px] font-semibold text-highlighted">
                WTFSync
              </p>
              <p class="truncate text-[11px] text-dimmed">文件同步工具</p>
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
              <span class="text-muted">同步空间</span>
              <span class="font-medium tabular-nums text-highlighted">68%</span>
            </div>
            <UProgress :model-value="68" size="sm" class="mt-1.5" />
            <div class="mt-1.5 flex items-center justify-between">
              <span class="text-[11px] tabular-nums text-dimmed"
                >6.8 / 10 GB</span
              >
              <UTooltip :text="syncing ? '暂停同步' : '继续同步'">
                <UButton
                  :icon="syncing ? 'i-lucide-pause' : 'i-lucide-play'"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  aria-label="暂停同步"
                  @click="syncing = !syncing"
                />
              </UTooltip>
            </div>
          </div>

          <div
            class="flex items-center gap-2 border-t border-default px-4 py-2.5"
          >
            <span
              class="size-1.5 shrink-0 rounded-full"
              :class="syncing ? 'bg-success' : 'bg-warning'"
            />
            <span class="truncate text-[11px] text-muted">
              {{ syncing ? '已连接 · 同步中' : '同步已暂停' }}
            </span>
            <span class="ml-auto shrink-0 text-[11px] tabular-nums text-dimmed"
              >v0.1.0</span
            >
          </div>
        </aside>

        <!-- 内容区 -->
        <main class="min-h-0 min-w-0 flex-1 overflow-y-auto bg-default">
          <component :is="pages[current]" />
        </main>
      </div>

      <!-- 状态栏 -->
      <footer
        class="flex h-7 shrink-0 items-center gap-2 border-t border-default bg-muted px-3 text-[11px] text-muted"
      >
        <UIcon
          name="i-lucide-wifi"
          class="size-3.5 shrink-0"
          :class="syncing ? 'text-success' : 'text-warning'"
        />
        <span>{{ syncing ? '已连接 · 局域网' : '已暂停' }}</span>
        <span class="flex h-3 items-center">
          <USeparator orientation="vertical" />
        </span>
        <span>3 台设备在线</span>
        <span class="flex-1" />
        <span class="tabular-nums">↑ 1.2 MB/s</span>
        <span class="tabular-nums">↓ 3.4 KB/s</span>
        <span class="flex h-3 items-center">
          <USeparator orientation="vertical" />
        </span>
        <UBadge color="success" variant="subtle" size="sm">运行正常</UBadge>
      </footer>
    </div>

    <!-- 全局弹窗 -->
    <UModal v-model:open="modalOpen" title="示例配置">
      <template #body>
        <WatchPathsModal v-if="currentModal === 'watch-paths'" />
      </template>
    </UModal>
  </UApp>
</template>
