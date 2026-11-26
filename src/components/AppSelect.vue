<script setup lang="ts" generic="Value extends string">
import { computed } from 'vue'

const props = defineProps<{
  items: (Value | { label: string; value: Value })[]
  placeholder?: string
  disabled?: boolean
}>()

const selected = defineModel<Value>({ required: true })
const options = computed<{ label: string; value: string }[]>(() =>
  props.items.map((item) => (typeof item === 'string' ? { label: item, value: item } : item)),
)
</script>

<template>
  <USelect
    :model-value="selected"
    :items="options"
    :placeholder="placeholder"
    :disabled="disabled"
    size="sm"
    class="max-w-full shrink-0 text-left"
    @update:model-value="selected = $event as Value"
  >
    <template #default="{ item }">
      <!-- Hidden labels share one grid cell, so the widest one sets the trigger width. -->
      <span v-if="options.length" class="relative grid whitespace-nowrap">
        <span
          v-for="option in options"
          :key="option.value"
          aria-hidden="true"
          class="invisible col-start-1 row-start-1"
          >{{ option.label }}</span
        >
        <span class="absolute inset-0 truncate">{{ item?.label ?? placeholder }}</span>
      </span>
      <span v-else>{{ placeholder ?? '\u00a0' }}</span>
    </template>
  </USelect>
</template>
