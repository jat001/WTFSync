<script setup lang="ts">
import { computed, ref } from 'vue'

import { useGameDirectoryPicker } from '../composables/useGameDirectoryPicker'
import { useSettings } from '../composables/useSettings'
import { useSync } from '../composables/useSync'
import { openDirectory } from '../lib/open'
import { isTauri } from '../lib/tauri'

const toast = useToast()
const { settings, reset } = useSettings()
const { flavors } = useSync()
const { pickGameDirectory } = useGameDirectoryPicker()

const query = ref('')
const active = ref('general')
const isResetOpen = ref(false)

const categories = [
  { key: 'general', label: '通用', icon: 'i-lucide-settings-2' },
  { key: 'game', label: '游戏', icon: 'i-lucide-gamepad-2' },
  { key: 'advanced', label: '高级', icon: 'i-lucide-wrench' },
]

const visibleCategories = computed(() =>
  categories.filter((item) => item.label.includes(query.value.trim())),
)

const themeOptions = [
  { label: '跟随系统', value: 'system' },
  { label: '浅色', value: 'light' },
  { label: '深色', value: 'dark' },
]

const flavorItems = computed(() =>
  flavors.value.map((flavor) => {
    const detail = flavor.version ?? flavor.id
    return {
      label: detail ? `${flavor.dir}（${detail}）` : flavor.dir,
      value: flavor.dir,
    }
  }),
)

async function openGameDir() {
  if (!isTauri) return
  try {
    await openDirectory(settings.wowRoot)
  } catch {
    toast.add({
      title: '无法打开目录',
      description: '请确认目录是否存在',
      icon: 'i-lucide-circle-alert',
      color: 'error',
    })
  }
}

function onReset() {
  isResetOpen.value = false
  reset()
  toast.add({
    title: '已恢复默认设置',
    description: '所有选项已还原为初始值',
    icon: 'i-lucide-rotate-ccw',
    color: 'info',
  })
}
</script>

<template>
  <div class="flex min-h-full gap-4 p-4">
    <!-- Category navigation -->
    <aside class="w-48 shrink-0">
      <h1 class="px-2 pt-0.5 text-base font-semibold text-highlighted">设置</h1>
      <p class="px-2 pb-3 pt-0.5 text-[11px] text-muted">管理同步器的行为</p>
      <UInput
        v-model="query"
        placeholder="搜索设置…"
        icon="i-lucide-search"
        size="sm"
        class="mb-3 select-text"
      />
      <nav class="space-y-0.5">
        <UButton
          v-for="item in visibleCategories"
          :key="item.key"
          :label="item.label"
          :icon="item.icon"
          size="sm"
          :color="active === item.key ? 'primary' : 'neutral'"
          :variant="active === item.key ? 'soft' : 'ghost'"
          class="w-full justify-start"
          @click="active = item.key"
        />
      </nav>
    </aside>

    <!-- Settings panel -->
    <UCard class="min-w-0 flex-1 self-start" :ui="{ body: 'p-0' }">
      <template v-if="visibleCategories.length === 0">
        <div class="px-8 py-12">
          <UEmpty
            icon="i-lucide-search"
            title="未找到相关设置"
            description="换一个关键词试试"
            size="sm"
          />
        </div>
      </template>

      <!-- General -->
      <div v-else-if="active === 'general'" class="divide-y divide-default">
        <div class="flex items-center justify-between gap-6 px-5 py-4">
          <div>
            <p class="text-sm font-medium text-highlighted">外观</p>
            <p class="mt-0.5 text-xs text-muted">界面使用的颜色主题</p>
          </div>
          <USelect
            v-model="settings.theme"
            :items="themeOptions"
            value-key="value"
            size="sm"
            class="w-36"
          />
        </div>
        <div class="flex items-start justify-between gap-6 px-5 py-4">
          <div>
            <p class="text-sm font-medium text-highlighted">自动同步</p>
            <p class="mt-0.5 text-xs text-muted">
              所选账号的插件存档变化后自动重新生成，应用启动时也会同步一次
            </p>
          </div>
          <USwitch v-model="settings.autoSync" aria-label="自动同步" />
        </div>
      </div>

      <!-- Game -->
      <div v-else-if="active === 'game'" class="divide-y divide-default">
        <div class="px-5 py-4">
          <p class="text-sm font-medium text-highlighted">魔兽世界目录</p>
          <p class="mt-0.5 text-xs text-muted">
            可以选择安装目录，也可以直接选择其中的游戏版本目录
          </p>
          <div class="mt-3 flex gap-2">
            <UInput
              :model-value="settings.wowRoot"
              placeholder="尚未设置"
              readonly
              size="sm"
              class="min-w-0 flex-1 select-text"
            />
            <UButton
              label="浏览"
              icon="i-lucide-folder-search"
              color="neutral"
              variant="outline"
              size="sm"
              @click="pickGameDirectory"
            />
            <UTooltip text="在资源管理器中打开">
              <UButton
                icon="i-lucide-folder-open"
                color="neutral"
                variant="ghost"
                size="sm"
                aria-label="在资源管理器中打开"
                :disabled="!settings.wowRoot"
                @click="openGameDir"
              />
            </UTooltip>
          </div>
        </div>
        <div class="flex items-center justify-between gap-6 px-5 py-4">
          <div>
            <p class="text-sm font-medium text-highlighted">游戏版本</p>
            <p class="mt-0.5 text-xs text-muted">
              每个版本分别保存账号选择
            </p>
          </div>
          <USelect
            v-model="settings.flavor"
            :items="flavorItems"
            value-key="value"
            placeholder="请先选择目录"
            :disabled="flavorItems.length === 0"
            size="sm"
            class="w-64"
          />
        </div>
      </div>

      <!-- Advanced -->
      <div v-else-if="active === 'advanced'" class="divide-y divide-default">
        <div class="flex items-start justify-between gap-6 px-5 py-4">
          <div>
            <p class="text-sm font-medium text-highlighted">恢复默认设置</p>
            <p class="mt-0.5 text-xs text-muted">
              将游戏目录、账号选择等所有选项还原为初始值
            </p>
          </div>
          <UButton
            label="恢复默认"
            icon="i-lucide-rotate-ccw"
            color="error"
            variant="soft"
            size="xs"
            @click="isResetOpen = true"
          />
        </div>
      </div>

      <!-- Auto-save hint -->
      <div
        v-if="visibleCategories.length > 0"
        class="flex items-center justify-end gap-1.5 border-t border-default px-5 py-3 text-xs text-muted"
      >
        <UIcon name="i-lucide-check" class="size-3.5" />
        <span>更改会自动保存</span>
      </div>
    </UCard>

    <!-- Reset confirmation -->
    <UModal
      v-model:open="isResetOpen"
      title="恢复默认设置？"
      description="游戏目录、账号选择等所有选项将还原为初始值，已生成的同步模块不受影响。"
      :ui="{ footer: 'justify-end' }"
    >
      <template #footer>
        <UButton
          label="取消"
          color="neutral"
          variant="ghost"
          size="sm"
          @click="isResetOpen = false"
        />
        <UButton label="恢复默认" color="error" size="sm" @click="onReset" />
      </template>
    </UModal>
  </div>
</template>
