<script setup lang="ts">
import { ref } from 'vue'
import { useModal } from '../ui/modal'

const { closeModal } = useModal()
const toast = useToast()

// 示例配置：监视目录列表（array[str]）
const paths = ref<string[]>(['D:/Documents', 'D:/Work'])
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

function save() {
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

    <ul class="mt-4 space-y-2">
      <li
        v-for="p in paths"
        :key="p"
        class="flex items-center justify-between rounded-md border border-default bg-muted px-3 py-2"
      >
        <span class="truncate select-text text-sm">{{ p }}</span>
        <UButton
          icon="i-lucide-trash-2"
          color="error"
          variant="ghost"
          size="xs"
          aria-label="移除"
          @click="removePath(p)"
        />
      </li>
    </ul>

    <div class="mt-3 flex gap-2">
      <UInput
        v-model="draft"
        placeholder="输入目录路径，回车添加"
        size="sm"
        class="select-text"
        @keydown.enter="addPath"
      />
      <UButton label="添加" icon="i-lucide-plus" size="sm" @click="addPath" />
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
