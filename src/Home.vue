<script setup lang="ts">
import { ref } from 'vue'

const toast = useToast()

const syncing = ref(true)
const isFolderModalOpen = ref(false)
const newFolderName = ref('')
const newFolderPath = ref('')

interface Transfer {
  name: string
  target: string
  size: string
  progress: number
  speed: string
  status: 'active' | 'queued' | 'done'
}

const transfers = ref<Transfer[]>([
  {
    name: '设计资源 / 图标库.fig',
    target: 'MacBook Pro',
    size: '184.2 MB',
    progress: 72,
    speed: '3.2 MB/s',
    status: 'active',
  },
  {
    name: '照片备份 / 2026-08',
    target: 'NAS · 客厅',
    size: '2.1 GB',
    progress: 46,
    speed: '5.8 MB/s',
    status: 'active',
  },
  {
    name: '项目文档 / 需求评审.pdf',
    target: '这台电脑',
    size: '12.6 MB',
    progress: 100,
    speed: '',
    status: 'done',
  },
  {
    name: '音乐 / 歌单导出.m3u8',
    target: 'iPhone 15',
    size: '8.4 KB',
    progress: 0,
    speed: '排队中',
    status: 'queued',
  },
])

const devices = [
  {
    name: '这台电脑',
    detail: 'ThinkPad X1',
    initial: '本',
    online: true,
    time: '刚刚',
  },
  {
    name: 'MacBook Pro',
    detail: '设计资源 · 在线编辑',
    initial: 'M',
    online: true,
    time: '12 分钟前',
  },
  {
    name: 'NAS · 客厅',
    detail: '照片备份',
    initial: 'N',
    online: false,
    time: '3 天前',
  },
]

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

const folders = ref([
  {
    label: '项目文档',
    icon: 'i-lucide-folder',
    defaultExpanded: true,
    children: [
      { label: '需求评审.pdf', icon: 'i-lucide-file-text' },
      { label: 'WTFSync 设计稿', icon: 'i-lucide-file-text' },
    ],
  },
  {
    label: '设计资源',
    icon: 'i-lucide-folder',
    defaultExpanded: true,
    children: [{ label: '图标库.fig', icon: 'i-lucide-file-text' }],
  },
  {
    label: '照片备份',
    icon: 'i-lucide-folder',
    children: [],
  },
])

function toggleSync() {
  syncing.value = !syncing.value
  toast.add({
    title: syncing.value ? '同步已恢复' : '同步已暂停',
    description: syncing.value ? '继续处理 3 个传输任务' : '所有传输任务已挂起',
    icon: syncing.value ? 'i-lucide-play' : 'i-lucide-pause',
    color: syncing.value ? 'success' : 'warning',
  })
}

function syncNow() {
  toast.add({
    title: '同步已开始',
    description: '正在扫描 3 个同步目录…',
    icon: 'i-lucide-refresh-cw',
    color: 'primary',
  })
}

function addFolder() {
  if (!newFolderName.value.trim()) return
  folders.value.push({
    label: newFolderName.value.trim(),
    icon: 'i-lucide-folder',
    defaultExpanded: true,
    children: [],
  })
  toast.add({
    title: `已添加「${newFolderName.value.trim()}」`,
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
    <!-- 工具栏 -->
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
          @click="toggleSync"
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

    <!-- 统计 -->
    <div class="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <UCard variant="soft" class="ring-0">
        <div class="flex items-center justify-between">
          <span class="text-xs text-muted">待同步</span>
          <UIcon name="i-lucide-clock-3" class="size-4 text-dimmed" />
        </div>
        <p class="mt-1.5 text-xl font-semibold tabular-nums text-highlighted">
          12
        </p>
        <p class="text-[11px] text-dimmed">3 个文件传输中</p>
      </UCard>
      <UCard variant="soft" class="ring-0">
        <div class="flex items-center justify-between">
          <span class="text-xs text-muted">已同步文件</span>
          <UIcon name="i-lucide-file-check-2" class="size-4 text-dimmed" />
        </div>
        <p class="mt-1.5 text-xl font-semibold tabular-nums text-highlighted">
          1,284
        </p>
        <p class="text-[11px] text-dimmed">本周新增 56 个</p>
      </UCard>
      <UCard variant="soft" class="ring-0">
        <div class="flex items-center justify-between">
          <span class="text-xs text-muted">在线设备</span>
          <UIcon name="i-lucide-monitor" class="size-4 text-dimmed" />
        </div>
        <p class="mt-1.5 text-xl font-semibold tabular-nums text-highlighted">
          2 / 3
        </p>
        <p class="text-[11px] text-dimmed">局域网直连</p>
      </UCard>
      <UCard variant="soft" class="ring-0">
        <div class="flex items-center justify-between">
          <span class="text-xs text-muted">存储占用</span>
          <UIcon name="i-lucide-hard-drive" class="size-4 text-dimmed" />
        </div>
        <p class="mt-1.5 text-xl font-semibold tabular-nums text-highlighted">
          6.8 GB
        </p>
        <p class="text-[11px] text-dimmed">剩余 3.2 GB</p>
      </UCard>
    </div>

    <!-- 主区域 -->
    <div class="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <!-- 左列 -->
      <div class="space-y-4">
        <!-- 传输队列 -->
        <UCard :ui="{ body: 'p-0' }">
          <div class="flex items-center justify-between gap-2 px-4 py-3">
            <div class="flex items-center gap-2">
              <h2 class="text-sm font-semibold text-highlighted">传输队列</h2>
              <UBadge color="primary" variant="subtle" size="sm"
                >2 进行中</UBadge
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

        <!-- 同步目录 -->
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

      <!-- 右列 -->
      <div class="space-y-4">
        <!-- 设备 -->
        <UCard :ui="{ body: 'p-0' }">
          <div class="flex items-center justify-between gap-2 px-4 py-3">
            <h2 class="text-sm font-semibold text-highlighted">设备</h2>
            <UBadge color="success" variant="subtle" size="sm">2 台在线</UBadge>
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

        <!-- 最近活动 -->
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

    <!-- 添加目录对话框 -->
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
          @click="addFolder"
        />
      </template>
    </UModal>
  </div>
</template>
