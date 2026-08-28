<template>
  <div class="mx-auto flex min-h-full max-w-3xl flex-col px-5 py-4 sm:px-7">
    <header class="flex h-8 shrink-0 items-center gap-3">
      <UButton
        to="/"
        icon="i-lucide-arrow-left"
        color="neutral"
        variant="ghost"
        size="xs"
        aria-label="返回首页"
      /><span class="text-sm font-semibold">设置</span>
    </header>
    <section class="mt-7">
      <p class="text-xs font-medium text-gray-500">PREFERENCES</p>
      <h1 class="mt-1 text-2xl font-semibold tracking-tight">应用设置</h1>
      <p class="mt-1 text-sm text-gray-500">管理同步服务在这台设备上的行为。</p>
    </section>
    <div class="mt-5 grid gap-4 md:grid-cols-2">
      <UCard
        ><div class="flex items-center gap-2 border-b border-gray-100 pb-3">
          <UIcon name="i-lucide-settings-2" class="size-4 text-primary" />
          <h2 class="text-sm font-semibold">常规</h2>
        </div>
        <div class="divide-y divide-gray-100">
          <div class="flex items-center justify-between gap-4 py-4">
            <div>
              <p class="text-sm font-medium">开机自动启动</p>
              <p class="mt-1 text-xs text-gray-500">登录系统后自动运行</p>
            </div>
            <USwitch v-model="launchAtStartup" aria-label="开机自动启动" />
          </div>
          <div class="flex items-center justify-between gap-4 py-4">
            <div>
              <p class="text-sm font-medium">同步完成通知</p>
              <p class="mt-1 text-xs text-gray-500">任务完成后发送通知</p>
            </div>
            <USwitch v-model="notifications" aria-label="同步完成通知" />
          </div></div
      ></UCard>
      <UCard
        ><div class="flex items-center gap-2 border-b border-gray-100 pb-3">
          <UIcon name="i-lucide-refresh-cw" class="size-4 text-primary" />
          <h2 class="text-sm font-semibold">同步策略</h2>
        </div>
        <div class="py-4">
          <label class="text-sm font-medium" for="sync-frequency"
            >检查频率</label
          >
          <p class="mt-1 text-xs text-gray-500">文件变化的检查间隔</p>
          <USelect
            id="sync-frequency"
            v-model="frequency"
            :items="frequencies"
            class="mt-3 w-full"
          />
        </div>
        <div class="border-t border-gray-100 py-4">
          <p class="text-sm font-medium">冲突处理</p>
          <p class="mt-1 text-xs text-gray-500">发现重复修改时保留两个版本</p>
          <UBadge class="mt-3" color="neutral" variant="soft">保留双方</UBadge>
        </div></UCard
      >
    </div>
    <footer class="mt-auto flex justify-end gap-2 pt-5">
      <UButton to="/" color="neutral" variant="soft">取消</UButton
      ><UButton icon="i-lucide-check" @click="save">保存更改</UButton>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const launchAtStartup = ref(true)
const notifications = ref(true)
const frequency = ref('实时')
const frequencies = ['实时', '每 5 分钟', '每 30 分钟']

function save() {
  router.push('/')
}
</script>
