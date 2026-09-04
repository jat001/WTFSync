<script setup lang="ts">
import { computed, ref } from 'vue'

import { useModal } from '../composables/useModal'
import { useSettings } from '../composables/useSettings'
import { openLogDir } from '../lib/logs'
import { isTauri } from '../lib/tauri'

const toast = useToast()
const { openModal } = useModal()
const { settings, reset } = useSettings()

const query = ref('')
const active = ref('general')
const isResetOpen = ref(false)
const rebuildOpen = ref(false)

const categories = [
  { key: 'general', label: '通用', icon: 'i-lucide-settings-2' },
  { key: 'sync', label: '同步', icon: 'i-lucide-refresh-cw' },
  { key: 'network', label: '网络', icon: 'i-lucide-wifi' },
  { key: 'notification', label: '通知', icon: 'i-lucide-bell' },
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

const frequencies = [
  { label: '实时', value: 'realtime' },
  { label: '每 5 分钟', value: '5min' },
  { label: '每 30 分钟', value: '30min' },
  { label: '每小时', value: 'hourly' },
]
const conflictOptions = [
  {
    value: 'keep-both',
    label: '保留双方',
    description: '将冲突文件重命名，同时保留两个版本',
  },
  {
    value: 'local-wins',
    label: '本地优先',
    description: '本机的修改覆盖其他设备',
  },
  {
    value: 'remote-wins',
    label: '远端优先',
    description: '其他设备的修改覆盖本机',
  },
]
const protocols = [
  { label: '自动（推荐）', value: 'auto' },
  { label: '强制加密', value: 'encrypted' },
  { label: '中继传输', value: 'relay' },
]
const sounds = [
  { label: '系统默认', value: 'system' },
  { label: '轻响', value: 'chime' },
  { label: '无', value: 'none' },
]

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

function rebuildIndex() {
  rebuildOpen.value = false
  toast.add({
    title: '开始重建索引',
    description: '正在扫描所有同步目录，请稍候…',
    icon: 'i-lucide-refresh-cw',
    color: 'primary',
  })
}

async function openLogs() {
  try {
    const dir = await openLogDir()
    toast.add({
      title: isTauri ? '已打开日志目录' : '日志目录',
      description: dir,
      icon: 'i-lucide-folder-open',
      color: 'neutral',
    })
  } catch {
    toast.add({
      title: '无法打开日志目录',
      description: '目录可能尚未创建',
      icon: 'i-lucide-circle-alert',
      color: 'error',
    })
  }
}
</script>

<template>
  <div class="flex min-h-full gap-4 p-4">
    <!-- Category navigation -->
    <aside class="w-48 shrink-0">
      <h1 class="px-2 pt-0.5 text-base font-semibold text-highlighted">设置</h1>
      <p class="px-2 pb-3 pt-0.5 text-[11px] text-muted">管理同步服务的行为</p>
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
            <p class="text-sm font-medium text-highlighted">开机自动启动</p>
            <p class="mt-0.5 text-xs text-muted">登录系统后在后台自动运行</p>
          </div>
          <USwitch
            v-model="settings.launchAtStartup"
            aria-label="开机自动启动"
          />
        </div>
        <div class="flex items-start justify-between gap-6 px-5 py-4">
          <div>
            <p class="text-sm font-medium text-highlighted">最小化到系统托盘</p>
            <p class="mt-0.5 text-xs text-muted">
              关闭窗口时继续在后台保持同步
            </p>
          </div>
          <USwitch
            v-model="settings.minimizeToTray"
            aria-label="最小化到系统托盘"
          />
        </div>
        <div class="flex items-start justify-between gap-6 px-5 py-4">
          <div>
            <p class="text-sm font-medium text-highlighted">文件变更自动同步</p>
            <p class="mt-0.5 text-xs text-muted">
              检测到本地文件变化时立即开始传输
            </p>
          </div>
          <USwitch v-model="settings.autoSync" aria-label="文件变更自动同步" />
        </div>
      </div>

      <!-- Sync -->
      <div v-else-if="active === 'sync'" class="divide-y divide-default">
        <div class="flex items-center justify-between gap-6 px-5 py-4">
          <div>
            <p class="text-sm font-medium text-highlighted">监视目录</p>
            <p class="mt-0.5 text-xs text-muted">
              目录内文件变更将触发同步，点击管理详细编辑
            </p>
          </div>
          <UButton
            label="管理"
            icon="i-lucide-folder-cog"
            color="neutral"
            variant="outline"
            size="xs"
            @click="openModal('watch-paths')"
          />
        </div>
        <div class="flex items-center justify-between gap-6 px-5 py-4">
          <div>
            <p class="text-sm font-medium text-highlighted">检查频率</p>
            <p class="mt-0.5 text-xs text-muted">自动扫描本地文件变更的间隔</p>
          </div>
          <USelect
            v-model="settings.frequency"
            :items="frequencies"
            value-key="value"
            size="sm"
            class="w-36"
          />
        </div>
        <div class="px-5 py-4">
          <p class="text-sm font-medium text-highlighted">冲突处理</p>
          <p class="mt-0.5 text-xs text-muted">
            同一文件被多处修改时采取的策略
          </p>
          <URadioGroup
            v-model="settings.conflict"
            :items="conflictOptions"
            color="primary"
            class="mt-3"
          />
        </div>
        <div class="px-5 py-4">
          <div class="flex items-center justify-between gap-6">
            <div>
              <p class="text-sm font-medium text-highlighted">上传带宽限制</p>
              <p class="mt-0.5 text-xs text-muted">限制同步占用的上行带宽</p>
            </div>
            <span class="text-sm font-medium tabular-nums text-highlighted">
              {{ settings.bandwidth }} MB/s
            </span>
          </div>
          <USlider
            v-model="settings.bandwidth"
            :min="0"
            :max="100"
            :step="5"
            class="mt-4"
          />
        </div>
      </div>

      <!-- Network -->
      <div v-else-if="active === 'network'" class="divide-y divide-default">
        <div class="flex items-start justify-between gap-6 px-5 py-4">
          <div>
            <p class="text-sm font-medium text-highlighted">
              仅在 Wi-Fi 下同步
            </p>
            <p class="mt-0.5 text-xs text-muted">
              使用移动热点时暂停传输以节省流量
            </p>
          </div>
          <USwitch v-model="settings.wifiOnly" aria-label="仅在 Wi-Fi 下同步" />
        </div>
        <div class="flex items-center justify-between gap-6 px-5 py-4">
          <div>
            <p class="text-sm font-medium text-highlighted">连接方式</p>
            <p class="mt-0.5 text-xs text-muted">设备之间的传输通道</p>
          </div>
          <USelect
            v-model="settings.protocol"
            :items="protocols"
            value-key="value"
            size="sm"
            class="w-36"
          />
        </div>
        <div class="flex items-center justify-between gap-6 px-5 py-4">
          <div>
            <p class="text-sm font-medium text-highlighted">代理服务器</p>
            <p class="mt-0.5 text-xs text-muted">用于中继传输的 SOCKS5 代理</p>
          </div>
          <UInput
            v-model="settings.proxy"
            placeholder="socks5://127.0.0.1:1080"
            size="sm"
            class="w-52 select-text"
          />
        </div>
      </div>

      <!-- Notification -->
      <div
        v-else-if="active === 'notification'"
        class="divide-y divide-default"
      >
        <div class="flex items-start justify-between gap-6 px-5 py-4">
          <div>
            <p class="text-sm font-medium text-highlighted">同步完成</p>
            <p class="mt-0.5 text-xs text-muted">任务完成后发送桌面通知</p>
          </div>
          <USwitch v-model="settings.notifyDone" aria-label="同步完成通知" />
        </div>
        <div class="flex items-start justify-between gap-6 px-5 py-4">
          <div>
            <p class="text-sm font-medium text-highlighted">检测到冲突</p>
            <p class="mt-0.5 text-xs text-muted">出现冲突文件时立即提醒</p>
          </div>
          <USwitch v-model="settings.notifyConflict" aria-label="冲突通知" />
        </div>
        <div class="flex items-start justify-between gap-6 px-5 py-4">
          <div>
            <p class="text-sm font-medium text-highlighted">同步失败</p>
            <p class="mt-0.5 text-xs text-muted">传输出错或设备离线时提醒</p>
          </div>
          <USwitch v-model="settings.notifyError" aria-label="失败通知" />
        </div>
        <div class="flex items-center justify-between gap-6 px-5 py-4">
          <div>
            <p class="text-sm font-medium text-highlighted">提示音</p>
            <p class="mt-0.5 text-xs text-muted">收到通知时播放的声音</p>
          </div>
          <USelect
            v-model="settings.sound"
            :items="sounds"
            value-key="value"
            size="sm"
            class="w-36"
          />
        </div>
      </div>

      <!-- Advanced -->
      <div v-else-if="active === 'advanced'" class="divide-y divide-default">
        <div class="px-5 py-4">
          <UCollapsible v-model:open="rebuildOpen">
            <div
              class="flex w-full cursor-pointer items-center justify-between gap-2"
            >
              <div>
                <p class="text-sm font-medium text-highlighted">重建同步索引</p>
                <p class="mt-0.5 text-xs text-muted">
                  重新扫描所有目录，用于修复文件状态异常
                </p>
              </div>
              <UIcon
                name="i-lucide-chevron-down"
                class="size-4 shrink-0 text-dimmed transition-transform"
                :class="rebuildOpen && 'rotate-180'"
              />
            </div>
            <template #content>
              <div class="pt-3">
                <p class="text-xs leading-5 text-muted">
                  重建索引不会删除或修改任何文件，只会重新生成本地的文件清单。索引较大时可能需要几分钟。
                </p>
                <UButton
                  label="开始重建"
                  icon="i-lucide-refresh-cw"
                  size="sm"
                  class="mt-3"
                  @click="rebuildIndex"
                />
              </div>
            </template>
          </UCollapsible>
        </div>
        <div class="flex items-start justify-between gap-6 px-5 py-4">
          <div>
            <p class="text-sm font-medium text-highlighted">日志文件</p>
            <p class="mt-0.5 text-xs text-muted">排查问题时的诊断记录</p>
          </div>
          <UButton
            label="打开日志目录"
            icon="i-lucide-folder-open"
            color="neutral"
            variant="outline"
            size="xs"
            @click="openLogs"
          />
        </div>
        <div class="flex items-start justify-between gap-6 px-5 py-4">
          <div>
            <p class="text-sm font-medium text-highlighted">恢复默认设置</p>
            <p class="mt-0.5 text-xs text-muted">将所有选项还原为初始值</p>
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
      description="所有自定义选项将还原为初始值，此操作无法撤销。"
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
