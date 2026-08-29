<script setup lang="ts">
const toast = useToast()

const infoRows = [
  { label: '构建日期', value: '2026-08-28' },
  { label: '界面引擎', value: 'Tauri 2 · Vue 3' },
  { label: '开源许可', value: '公共领域 (Unlicense)' },
]

function checkUpdate() {
  toast.add({
    title: '已是最新版本',
    description: '版本 0.1.0 已通过更新检查',
    icon: 'i-lucide-circle-check',
    color: 'success',
  })
}

function openLogs() {
  toast.add({
    title: '日志目录',
    description: '%APPDATA%/WTFSync/logs',
    icon: 'i-lucide-folder-open',
    color: 'neutral',
  })
}
</script>

<template>
  <div class="flex min-h-full items-center justify-center bg-muted/50 p-6">
    <UCard class="w-full max-w-md" :ui="{ body: 'p-0' }">
      <!-- 应用信息 -->
      <div class="flex flex-col items-center px-10 pb-5 pt-8 text-center">
        <span
          class="flex size-14 items-center justify-center rounded-xl bg-primary text-2xl font-bold text-inverted"
          >W</span
        >
        <h1 class="mt-4 text-lg font-semibold text-highlighted">WTFSync</h1>
        <UBadge color="neutral" variant="subtle" size="sm" class="mt-1.5">
          版本 0.1.0
        </UBadge>
        <p class="mt-3 text-sm text-muted">简单，可靠，始终同步。</p>
      </div>

      <UAlert
        color="success"
        variant="subtle"
        icon="i-lucide-circle-check"
        title="已是最新版本"
        description="跨设备同步服务运行正常"
        class="mx-6"
      />

      <!-- 信息列表 -->
      <dl class="mx-6 my-5 divide-y divide-default">
        <div
          v-for="row in infoRows"
          :key="row.label"
          class="flex items-center justify-between gap-4 py-2.5"
        >
          <dt class="text-xs text-muted">{{ row.label }}</dt>
          <dd class="text-xs tabular-nums text-highlighted">{{ row.value }}</dd>
        </div>
      </dl>

      <!-- 操作 -->
      <div class="flex justify-center gap-2 border-t border-default px-6 py-5">
        <UButton
          label="检查更新"
          icon="i-lucide-rotate-cw"
          color="neutral"
          variant="outline"
          size="sm"
          @click="checkUpdate"
        />
        <UButton
          label="打开日志目录"
          icon="i-lucide-folder-open"
          color="neutral"
          variant="outline"
          size="sm"
          @click="openLogs"
        />
      </div>

      <!-- 快捷键提示 -->
      <div
        class="flex flex-wrap items-center justify-center gap-1.5 px-6 pb-6 text-[11px] text-dimmed"
      >
        <span>快捷键</span>
        <UKbd size="sm">Ctrl</UKbd>
        <span>+</span>
        <UKbd size="sm">,</UKbd>
        <span>打开设置</span>
      </div>
    </UCard>
  </div>
</template>
