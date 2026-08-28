<script setup lang="ts">
import { computed, ref } from 'vue'

const toast = useToast()

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

// 通用
const launchAtStartup = ref(true)
const minimizeToTray = ref(true)
const autoSync = ref(true)

// 同步
const frequency = ref('实时')
const frequencies = ['实时', '每 5 分钟', '每 30 分钟', '每小时']
const conflict = ref('keep-both')
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
const bandwidth = ref(20)

// 网络
const wifiOnly = ref(false)
const protocol = ref('自动（推荐）')
const protocols = ['自动（推荐）', '强制加密', '中继传输']
const proxy = ref('')

// 通知
const notifyDone = ref(true)
const notifyConflict = ref(true)
const notifyError = ref(true)
const sound = ref('系统默认')
const sounds = ['系统默认', '轻响', '无']

function save() {
  toast.add({
    title: '设置已保存',
    description: '更改将在下一次同步时生效',
    icon: 'i-lucide-circle-check',
    color: 'success',
  })
}

function reset() {
  isResetOpen.value = false
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
    description: '正在扫描 3 个同步目录，请稍候…',
    icon: 'i-lucide-refresh-cw',
    color: 'primary',
  })
}
</script>

<template>
  <div class="flex min-h-full gap-4 p-4">
    <!-- 分类导航 -->
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

    <!-- 设置面板 -->
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

      <!-- 通用 -->
      <div v-else-if="active === 'general'" class="divide-y divide-default">
        <div class="flex items-start justify-between gap-6 px-5 py-4">
          <div>
            <p class="text-sm font-medium text-highlighted">开机自动启动</p>
            <p class="mt-0.5 text-xs text-muted">登录系统后在后台自动运行</p>
          </div>
          <USwitch v-model="launchAtStartup" aria-label="开机自动启动" />
        </div>
        <div class="flex items-start justify-between gap-6 px-5 py-4">
          <div>
            <p class="text-sm font-medium text-highlighted">最小化到系统托盘</p>
            <p class="mt-0.5 text-xs text-muted">
              关闭窗口时继续在后台保持同步
            </p>
          </div>
          <USwitch v-model="minimizeToTray" aria-label="最小化到系统托盘" />
        </div>
        <div class="flex items-start justify-between gap-6 px-5 py-4">
          <div>
            <p class="text-sm font-medium text-highlighted">文件变更自动同步</p>
            <p class="mt-0.5 text-xs text-muted">
              检测到本地文件变化时立即开始传输
            </p>
          </div>
          <USwitch v-model="autoSync" aria-label="文件变更自动同步" />
        </div>
      </div>

      <!-- 同步 -->
      <div v-else-if="active === 'sync'" class="divide-y divide-default">
        <div class="flex items-center justify-between gap-6 px-5 py-4">
          <div>
            <p class="text-sm font-medium text-highlighted">检查频率</p>
            <p class="mt-0.5 text-xs text-muted">自动扫描本地文件变更的间隔</p>
          </div>
          <USelect
            v-model="frequency"
            :items="frequencies"
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
            v-model="conflict"
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
              {{ bandwidth }} MB/s
            </span>
          </div>
          <USlider
            v-model="bandwidth"
            :min="0"
            :max="100"
            :step="5"
            class="mt-4"
          />
        </div>
      </div>

      <!-- 网络 -->
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
          <USwitch v-model="wifiOnly" aria-label="仅在 Wi-Fi 下同步" />
        </div>
        <div class="flex items-center justify-between gap-6 px-5 py-4">
          <div>
            <p class="text-sm font-medium text-highlighted">连接方式</p>
            <p class="mt-0.5 text-xs text-muted">设备之间的传输通道</p>
          </div>
          <USelect
            v-model="protocol"
            :items="protocols"
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
            v-model="proxy"
            placeholder="socks5://127.0.0.1:1080"
            size="sm"
            class="w-52 select-text"
          />
        </div>
      </div>

      <!-- 通知 -->
      <div
        v-else-if="active === 'notification'"
        class="divide-y divide-default"
      >
        <div class="flex items-start justify-between gap-6 px-5 py-4">
          <div>
            <p class="text-sm font-medium text-highlighted">同步完成</p>
            <p class="mt-0.5 text-xs text-muted">任务完成后发送桌面通知</p>
          </div>
          <USwitch v-model="notifyDone" aria-label="同步完成通知" />
        </div>
        <div class="flex items-start justify-between gap-6 px-5 py-4">
          <div>
            <p class="text-sm font-medium text-highlighted">检测到冲突</p>
            <p class="mt-0.5 text-xs text-muted">出现冲突文件时立即提醒</p>
          </div>
          <USwitch v-model="notifyConflict" aria-label="冲突通知" />
        </div>
        <div class="flex items-start justify-between gap-6 px-5 py-4">
          <div>
            <p class="text-sm font-medium text-highlighted">同步失败</p>
            <p class="mt-0.5 text-xs text-muted">传输出错或设备离线时提醒</p>
          </div>
          <USwitch v-model="notifyError" aria-label="失败通知" />
        </div>
        <div class="flex items-center justify-between gap-6 px-5 py-4">
          <div>
            <p class="text-sm font-medium text-highlighted">提示音</p>
            <p class="mt-0.5 text-xs text-muted">收到通知时播放的声音</p>
          </div>
          <USelect v-model="sound" :items="sounds" size="sm" class="w-36" />
        </div>
      </div>

      <!-- 高级 -->
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

      <!-- 页脚 -->
      <div class="flex justify-end gap-2 px-5 py-3.5">
        <UButton label="取消" color="neutral" variant="ghost" size="sm" />
        <UButton
          label="保存更改"
          icon="i-lucide-check"
          size="sm"
          @click="save"
        />
      </div>
    </UCard>

    <!-- 恢复默认确认 -->
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
        <UButton label="恢复默认" color="error" size="sm" @click="reset" />
      </template>
    </UModal>
  </div>
</template>
