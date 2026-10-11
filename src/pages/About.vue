<script setup lang="ts">
import { openUrl } from '@tauri-apps/plugin-opener'
import { ref } from 'vue'

import pkg from '../../package.json'
import privacyPolicy from '../assets/privacy-policy.txt?raw'
import AppLogo from '../components/AppLogo.vue'
import { openLogDir } from '../lib/logs'
import { isTauri } from '../lib/tauri'
import { profiles } from '../profiles'

const toast = useToast()
const version = pkg.version
const privacyOpen = ref(false)
const supportedAddons = profiles.map((profile) => profile.name).join('、')

const infoRows = [
  { label: '界面引擎', value: 'Tauri 2 · Vue 3' },
  { label: '开源许可', value: '公共领域 (Unlicense)' },
]

async function openStore() {
  try {
    await openUrl('https://apps.microsoft.com/detail/9NTVMTNGV9SL')
  } catch {
    toast.add({
      title: '无法打开商店页面',
      description: '请稍后重试，或在 Microsoft Store 中搜索 WTFSync',
      icon: 'i-lucide-circle-alert',
      color: 'error',
    })
  }
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
        <p class="mt-3 text-sm text-muted">
          在多个魔兽世界账号之间同步插件数据。
        </p>
      </div>

      <UAlert
        color="neutral"
        variant="subtle"
        icon="i-lucide-puzzle"
        title="支持的插件"
        :description="supportedAddons"
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
      <div class="flex flex-wrap justify-center gap-2 border-t border-default px-6 py-5">
        <UButton
          label="Microsoft Store"
          icon="i-lucide-external-link"
          color="neutral"
          variant="outline"
          size="sm"
          @click="openStore"
        />
        <UButton
          label="隐私政策"
          icon="i-lucide-shield-check"
          color="neutral"
          variant="outline"
          size="sm"
          @click="privacyOpen = true"
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
    </UCard>
    <UModal v-model:open="privacyOpen" title="隐私政策" :ui="{ content: 'max-w-2xl' }">
      <template #body>
        <p class="whitespace-pre-wrap text-sm leading-relaxed text-default">{{ privacyPolicy }}</p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end">
          <UButton label="关闭" color="neutral" variant="outline" @click="privacyOpen = false" />
        </div>
      </template>
    </UModal>
  </div>
</template>
