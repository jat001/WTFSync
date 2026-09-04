<script setup lang="ts">
import { open } from '@tauri-apps/plugin-dialog'
import { computed, ref } from 'vue'

import {
    useSyncState,
    type Transfer,
} from '../composables/useSyncState'
import { isTauri } from '../lib/tauri'

const toast = useToast()

const {
  syncing,
  toggleSync,
  devices,
  onlineDevices,
  transfers,
  activeTransfers,
  folders,
  addFolder,
  storage,
} = useSyncState()

const isFolderModalOpen = ref(false)
const newFolderName = ref('')
const newFolderPath = ref('')

const stats = computed(() => [
  {
    label: '待同步',
    value: '12',
    icon: 'i-lucide-clock-3',
    hint: `${activeTransfers.value.length} 个文件传输中`,
  },
  {
    label: '已同步文件',
    value: '1,284',
    icon: 'i-lucide-file-check-2',
    hint: '本周新增 56 个',
  },
  {
    label: '在线设备',
    value: `${onlineDevices.value.length} / ${devices.value.length}`,
    icon: 'i-lucide-monitor',
    hint: '局域网直连',
  },
  {
    label: '存储占用',
    value: `${storage.used} GB`,
    icon: 'i-lucide-hard-drive',
    hint: `剩余 ${(storage.total - storage.used).toFixed(1)} GB`,
  },
])

const activity = [
  {
    date: '10:42',
    title: '完成同步「项目文档」',
    description: '上传 24 个文件 · 86.4 MB',
    icon: 'i-lucide-circle-check',
  },
  {
    date: '09:15',
    title: '开始同步「设计资源」',
    description: '发现 12 个新文件',
    icon: 'i-lucide-upload',
  },
  {
    date: '昨天',
    title: '设备「MacBook Pro」上线',
    description: '建立点对点加密连接',
    icon: 'i-lucide-laptop',
  },
]

function onToggleSync() {
  toggleSync()
  toast.add({
    title: syncing.value ? '同步已恢复' : '同步已暂停',
    description: syncing.value
      ? `继续处理 ${activeTransfers.value.length} 个传输任务`
      : '所有传输任务已挂起',
    icon: syncing.value ? 'i-lucide-play' : 'i-lucide-pause',
    color: syncing.value ? 'success' : 'warning',
  })
}

function syncNow() {
  toast.add({
    title: '同步已开始',
    description: `正在扫描 ${folders.value.length} 个同步目录…`,
    icon: 'i-lucide-refresh-cw',
    color: 'primary',
  })
}

async function pickFolder() {
  if (!isTauri) {
    toast.add({
      title: '浏览器预览中不可用',
      description: '请在桌面应用中选择文件夹',
      icon: 'i-lucide-info',
      color: 'warning',
    })
    return
  }
  const selected = await open({ directory: true, title: '选择同步文件夹' })
  if (typeof selected === 'string') newFolderPath.value = selected
}

function submitFolder() {
  const label = newFolderName.value.trim()
  if (!label) return
  addFolder(label)
  toast.add({
    title: `已添加「${label}」`,
    description: newFolderPath.value || '将开始首次索引',
    icon: 'i-lucide-folder-plus',
    color: 'success',
  })
  isFolderModalOpen.value = false
  newFolderName.value = ''
  newFolderPath.value = ''
}

function transferAction(action: string, transfer: Transfer) {
  toast.add({
    title: action === 'pause' ? '已暂停传输' : '已从队列移除',
    description: transfer.name,
    icon: action === 'pause' ? 'i-lucide-pause' : 'i-lucide-trash-2',
    color: 'neutral',
  })
}

interface TransferMenuItem {
  label: string
  icon: string
  color?: 'error' | 'neutral'
  onSelect?: () => void
}

const transferMenu = (transfer: Transfer): TransferMenuItem[][] => [
  [
    {
      label: '暂停传输',
      icon: 'i-lucide-pause',
      onSelect: () => transferAction('pause', transfer),
    },
    { label: '打开文件位置', icon: 'i-lucide-folder-open' },
  ],
  [
    {
      label: '从队列移除',
      icon: 'i-lucide-trash-2',
      color: 'error',
      onSelect: () => transferAction('remove', transfer),
    },
  ],
]
</script>

<template>
  <div class="space-y-4 p-4">
    <!-- Toolbar -->
    <div class="flex items-center justify-between gap-3">
      <div class="min-w-0">
        <h1 class="truncate text-base font-semibold text-highlighted">
          工作台
        </h1>
        <p class="text-[11px] text-muted">本地同步状态与传输任务</p>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <UButton
          :icon="syncing ? 'i-lucide-pause' : 'i-lucide-play'"
          :label="syncing ? '暂停' : '继续'"
          color="neutral"
          variant="outline"
          size="sm"
          @click="onToggleSync"
        />
        <UButton
          icon="i-lucide-refresh-cw"
          label="立即同步"
          size="sm"
          :disabled="!syncing"
          @click="syncNow"
        />
      </div>
    </div>

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
        <p class="text-[11px] text-dimmed">{{ stat.hint }}</p>
      </UCard>
    </div>

    <!-- Main area -->
    <div class="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <!-- Left column -->
      <div class="space-y-4">
        <!-- Transfer queue -->
        <UCard :ui="{ body: 'p-0' }">
          <div class="flex items-center justify-between gap-2 px-4 py-3">
            <div class="flex items-center gap-2">
              <h2 class="text-sm font-semibold text-highlighted">传输队列</h2>
              <UBadge color="primary" variant="subtle" size="sm"
                >{{ activeTransfers.length }} 进行中</UBadge
              >
            </div>
            <UTooltip text="刷新队列">
              <UButton
                icon="i-lucide-refresh-cw"
                color="neutral"
                variant="ghost"
                size="xs"
                aria-label="刷新队列"
              />
            </UTooltip>
          </div>
          <div class="divide-y divide-default">
            <div
              v-for="item in transfers"
              :key="item.name"
              class="flex items-center gap-3 px-4 py-2.5"
            >
              <UIcon
                :name="
                  item.status === 'active'
                    ? 'i-lucide-refresh-cw'
                    : item.status === 'done'
                      ? 'i-lucide-circle-check'
                      : 'i-lucide-clock-3'
                "
                class="size-4 shrink-0"
                :class="[
                  item.status === 'active' && 'animate-spin text-primary',
                  item.status === 'done' && 'text-success',
                  item.status === 'queued' && 'text-dimmed',
                ]"
              />
              <div class="min-w-0 flex-1">
                <div class="flex items-center justify-between gap-2">
                  <p class="truncate text-xs font-medium text-highlighted">
                    {{ item.name }}
                  </p>
                  <span class="shrink-0 text-[11px] tabular-nums text-dimmed">
                    {{ item.progress }}%
                  </span>
                </div>
                <UProgress
                  :model-value="item.progress"
                  size="sm"
                  class="mt-1.5"
                  :color="item.status === 'done' ? 'success' : 'primary'"
                />
                <div
                  class="mt-1 flex items-center justify-between text-[11px] text-dimmed"
                >
                  <span
                    >{{ item.status === 'done' ? '已完成' : item.speed }} ·
                    {{ item.size }}</span
                  >
                  <span class="truncate">→ {{ item.target }}</span>
                </div>
              </div>
              <UDropdownMenu :items="transferMenu(item)">
                <UButton
                  icon="i-lucide-ellipsis"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  aria-label="更多操作"
                />
              </UDropdownMenu>
            </div>
          </div>
          <div class="border-t border-default px-4 py-2.5">
            <UButton
              label="查看全部活动"
              color="neutral"
              variant="link"
              size="xs"
              trailing-icon="i-lucide-arrow-up-right"
            />
          </div>
        </UCard>

        <!-- Sync folders -->
        <UCard :ui="{ body: 'p-0' }">
          <div class="flex items-center justify-between gap-2 px-4 py-3">
            <h2 class="text-sm font-semibold text-highlighted">同步目录</h2>
            <UTooltip text="添加目录">
              <UButton
                icon="i-lucide-folder-plus"
                color="neutral"
                variant="ghost"
                size="xs"
                aria-label="添加目录"
                @click="isFolderModalOpen = true"
              />
            </UTooltip>
          </div>
          <div class="px-2 pb-3">
            <UTree :items="folders" size="sm" color="neutral" />
          </div>
        </UCard>
      </div>

      <!-- Right column -->
      <div class="space-y-4">
        <!-- Devices -->
        <UCard :ui="{ body: 'p-0' }">
          <div class="flex items-center justify-between gap-2 px-4 py-3">
            <h2 class="text-sm font-semibold text-highlighted">设备</h2>
            <UBadge color="success" variant="subtle" size="sm"
              >{{ onlineDevices.length }} 台在线</UBadge
            >
          </div>
          <div class="divide-y divide-default">
            <div
              v-for="device in devices"
              :key="device.name"
              class="flex items-center gap-3 px-4 py-2.5"
            >
              <UAvatar
                :text="device.initial"
                size="sm"
                color="neutral"
                :chip="{
                  color: device.online ? 'success' : 'neutral',
                  position: 'bottom-right',
                }"
              />
              <div class="min-w-0 flex-1">
                <p class="truncate text-xs font-medium text-highlighted">
                  {{ device.name }}
                </p>
                <p class="truncate text-[11px] text-dimmed">
                  {{ device.detail }} · {{ device.time }}
                </p>
              </div>
              <UBadge
                :color="device.online ? 'success' : 'neutral'"
                variant="soft"
                size="sm"
              >
                {{ device.online ? '在线' : '离线' }}
              </UBadge>
            </div>
          </div>
          <div class="border-t border-default px-4 py-2.5">
            <UButton
              label="管理设备"
              color="neutral"
              variant="link"
              size="xs"
              trailing-icon="i-lucide-arrow-up-right"
            />
          </div>
        </UCard>

        <!-- Recent activity -->
        <UCard :ui="{ body: 'p-0' }">
          <div class="flex items-center justify-between gap-2 px-4 py-3">
            <h2 class="text-sm font-semibold text-highlighted">最近活动</h2>
            <UBadge color="neutral" variant="subtle" size="sm">今天</UBadge>
          </div>
          <div class="px-4 pb-4">
            <UTimeline :items="activity" size="sm" color="primary" />
          </div>
        </UCard>
      </div>
    </div>

    <!-- Add folder modal -->
    <UModal
      v-model:open="isFolderModalOpen"
      title="添加同步目录"
      description="新目录将在这台设备与所有在线设备之间保持同步。"
    >
      <template #body>
        <div class="space-y-4">
          <UInput
            v-model="newFolderName"
            placeholder="目录名称，例如：项目文档"
            icon="i-lucide-folder"
            size="sm"
          />
          <UInput
            v-model="newFolderPath"
            placeholder="选择本地文件夹路径…"
            size="sm"
          >
            <template #trailing>
              <UButton
                icon="i-lucide-folder-open"
                color="neutral"
                variant="ghost"
                size="xs"
                aria-label="浏览文件夹"
                @click="pickFolder"
              />
            </template>
          </UInput>
        </div>
      </template>
      <template #footer>
        <UButton
          label="取消"
          color="neutral"
          variant="ghost"
          size="sm"
          @click="isFolderModalOpen = false"
        />
        <UButton
          label="添加"
          icon="i-lucide-plus"
          size="sm"
          :disabled="!newFolderName.trim()"
          @click="submitFolder"
        />
      </template>
    </UModal>
  </div>
</template>
