<script setup lang="ts">
import { computed } from 'vue'

import { useModal } from '../composables/useModal'
import { useSync } from '../composables/useSync'
import { failureLabels, summarizeReport, triggerLabels } from '../lib/sync-text'
import { formatTime } from '../lib/time'
import { findProfile } from '../profiles'

const { closeModal } = useModal()
const { lastActivity } = useSync()

const heading = computed(() => {
  const entry = lastActivity.value
  if (!entry) return ''
  const profile = findProfile(entry.profileId)?.name ?? entry.profileId
  return `${triggerLabels[entry.trigger]} · ${profile}`
})

const summary = computed(() => {
  const entry = lastActivity.value
  if (!entry) return ''
  const result = entry.report ? summarizeReport(entry.report) : entry.error
  return `${formatTime(entry.at)} · ${result}`
})

const fileGroups = computed(() => {
  const report = lastActivity.value?.report
  if (!report) return []
  return [
    { label: '已写入', icon: 'i-lucide-file-pen', files: report.written },
    { label: '已删除', icon: 'i-lucide-file-x', files: report.removed },
    { label: '无变化', icon: 'i-lucide-file-check', files: report.unchanged },
  ].filter((group) => group.files.length > 0)
})
</script>

<template>
  <div>
    <UEmpty
      v-if="!lastActivity"
      icon="i-lucide-history"
      title="暂无同步记录"
      size="sm"
    />
    <template v-else>
      <p class="text-sm font-medium text-highlighted">{{ heading }}</p>
      <p class="mt-0.5 text-xs text-muted">{{ summary }}</p>

      <UAlert
        v-if="lastActivity.error"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-x"
        title="同步失败"
        :description="lastActivity.error"
        class="mt-4"
      />

      <div v-if="lastActivity.report?.failed.length" class="mt-4">
        <p class="text-xs font-medium text-highlighted">失败的账号</p>
        <ul class="mt-1.5 space-y-1">
          <li
            v-for="failure in lastActivity.report.failed"
            :key="failure.id"
            class="flex items-start gap-2 text-xs"
          >
            <UIcon
              name="i-lucide-circle-alert"
              class="mt-0.5 size-3.5 shrink-0 text-warning"
            />
            <span class="min-w-0">
              <span class="font-medium text-highlighted">{{ failure.id }}</span>
              <span class="text-muted">：{{ failureLabels[failure.reason] }}</span>
              <span class="block truncate text-dimmed select-text">{{
                failure.detail
              }}</span>
            </span>
          </li>
        </ul>
      </div>

      <div v-for="group in fileGroups" :key="group.label" class="mt-4">
        <p class="text-xs font-medium text-highlighted">
          {{ group.label }}（{{ group.files.length }}）
        </p>
        <ul class="mt-1.5 space-y-1">
          <li
            v-for="file in group.files"
            :key="file"
            class="flex items-center gap-2 text-xs text-muted"
          >
            <UIcon :name="group.icon" class="size-3.5 shrink-0" />
            <span class="truncate select-text">{{ file }}</span>
          </li>
        </ul>
      </div>
    </template>

    <div class="mt-5 flex justify-end">
      <UButton
        label="关闭"
        color="neutral"
        variant="ghost"
        size="sm"
        @click="closeModal"
      />
    </div>
  </div>
</template>
