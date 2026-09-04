<script setup lang="ts">
import pkg from '../../package.json'
import AppLogo from '../components/AppLogo.vue'
import { openLogDir } from '../lib/logs'
import { isTauri } from '../lib/tauri'

const toast = useToast()
const version = pkg.version

const infoRows = [
  { label: '构建日期', value: '2026-08-28' },
  { label: '界面引擎', value: 'Tauri 2 · Vue 3' },
  { label: '开源许可', value: '公共领域 (Unlicense)' },
]

function checkUpdate() {
  toast.add({
    title: '已是最新版本',
    description: `版本 ${version} 已通过更新检查`,
    icon: 'i-lucide-circle-check',
    color: 'success',
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
  <div class="flex min-h-full items-center justify-center bg-muted/50 p-6">
    <UCard class="w-full max-w-md" :ui="{ body: 'p-0' }">
      <!-- App info -->
      <div class="flex flex-col items-center px-10 pb-5 pt-8 text-center">
        <AppLogo size="lg" />
        <h1 class="mt-4 text-lg font-semibold text-highlighted">WTFSync</h1>
        <UBadge color="neutral" variant="subtle" size="sm" class="mt-1.5">
          版本 {{ version }}
        </UBadge>
        <p class="mt-3 text-sm text-muted">简单，可靠，始终同步。</p>
      </div>

      <UAlert
        color="success"
        variant="subtle"
        icon="i-lucide-circle-check"
        title="已是最新版本"
        description="跨设备同步服务运行正常"
        class="mx-6 w-auto"
      />

      <!-- Info list -->
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

      <!-- Actions -->
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

      <!-- Keyboard shortcuts -->
      <div
        class="flex flex-wrap items-center justify-center gap-1.5 px-6 pb-6 text-[11px] text-dimmed"
      >
        <span>快捷键</span>
        <UKbd size="sm">Ctrl</UKbd>
        <span>+</span>
        <UKbd size="sm">,</UKbd>
        <span>打开设置</span>
        <span class="mx-1">·</span>
        <UKbd size="sm">Ctrl</UKbd>
        <span>+</span>
        <UKbd size="sm">1~3</UKbd>
        <span>切换页面</span>
      </div>
    </UCard>
  </div>
</template>
