<script setup lang="ts">
import { open } from '@tauri-apps/plugin-dialog'
import { ref } from 'vue'

import { useModal } from '../composables/useModal'
import { useSettings } from '../composables/useSettings'
import { allowFsDirectories } from '../lib/fs'
import { openDirectory } from '../lib/open'
import { isTauri } from '../lib/tauri'

const { closeModal } = useModal()
const { settings } = useSettings()
const toast = useToast()

// Work on a local draft copy so "取消" discards changes; commit on "保存".
// The modal is recreated each time it opens (v-if), so this starts fresh.
const paths = ref<string[]>([...settings.watchPaths])
const draft = ref('')

function addPath() {
  const p = draft.value.trim()
  if (!p) return
  if (!paths.value.includes(p)) paths.value.push(p)
  draft.value = ''
}

function removePath(p: string) {
  paths.value = paths.value.filter((x) => x !== p)
}

async function openInExplorer(p: string) {
  if (!isTauri) {
    toast.add({
      title: '浏览器预览中不可用',
      description: '请在桌面应用中打开目录',
      icon: 'i-lucide-info',
      color: 'warning',
    })
    return
  }
  try {
    await openDirectory(p)
  } catch {
    toast.add({
      title: '无法打开目录',
      description: '请确认路径是否存在',
      icon: 'i-lucide-circle-alert',
      color: 'error',
    })
  }
}

async function browse() {
  if (!isTauri) {
    toast.add({
      title: '浏览器预览中不可用',
      description: '请在桌面应用中选择文件夹',
      icon: 'i-lucide-info',
      color: 'warning',
    })
    return
  }
  const selected = await open({ directory: true, title: '选择监视目录' })
  if (typeof selected === 'string') draft.value = selected
}

async function save() {
  // Commit the draft to settings; the settings watcher persists it.
  settings.watchPaths = [...paths.value]

  // Authorize fs access to the newly configured directories at runtime.
  // Persisted paths are also granted on launch, but granting here covers the
  // current session immediately (and any path just added).
  if (isTauri) {
    const failed = await allowFsDirectories(paths.value)
    if (failed.length > 0) {
      toast.add({
        title: '部分目录无法授权访问',
        description: failed.join('、'),
        icon: 'i-lucide-circle-alert',
        color: 'error',
      })
    }
  }

  toast.add({
    title: '监视目录已保存',
    description: `共 ${paths.value.length} 个目录`,
    icon: 'i-lucide-circle-check',
    color: 'success',
  })
  closeModal()
}
</script>

<template>
  <div>
    <p class="text-sm font-medium text-highlighted">监视目录</p>
    <p class="mt-0.5 text-xs text-muted">这些目录内的文件变更会触发同步</p>

    <ul v-if="paths.length" class="mt-4 space-y-2">
      <li
        v-for="p in paths"
        :key="p"
        class="flex items-center justify-between gap-2 rounded-md border border-default bg-muted px-3 py-2"
      >
        <span class="min-w-0 flex-1 truncate select-text text-sm">{{ p }}</span>
        <div class="flex shrink-0 items-center">
          <UButton
            icon="i-lucide-folder-open"
            color="neutral"
            variant="ghost"
            size="xs"
            aria-label="在资源管理器中打开"
            @click="openInExplorer(p)"
          />
          <UButton
            icon="i-lucide-trash-2"
            color="error"
            variant="ghost"
            size="xs"
            aria-label="移除"
            @click="removePath(p)"
          />
        </div>
      </li>
    </ul>
    <UEmpty
      v-else
      icon="i-lucide-folder-x"
      title="暂无监视目录"
      description="添加一个目录以开始同步"
      size="sm"
      class="mt-4"
    />

    <div class="mt-3 flex gap-2">
      <UInput
        v-model="draft"
        placeholder="输入目录路径，回车添加"
        size="sm"
        class="select-text"
        @keydown.enter="addPath"
      >
        <template #trailing>
          <UButton
            icon="i-lucide-folder-open"
            color="neutral"
            variant="ghost"
            size="xs"
            aria-label="浏览文件夹"
            @click="browse"
          />
        </template>
      </UInput>
      <UButton
        label="添加"
        icon="i-lucide-plus"
        size="sm"
        :disabled="!draft.trim()"
        @click="addPath"
      />
    </div>

    <div class="mt-4 flex justify-end gap-2">
      <UButton
        label="取消"
        color="neutral"
        variant="ghost"
        size="sm"
        @click="closeModal"
      />
      <UButton label="保存" icon="i-lucide-check" size="sm" @click="save" />
    </div>
  </div>
</template>
