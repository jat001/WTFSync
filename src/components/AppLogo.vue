<script setup lang="ts">
const { size = 'sm' } = defineProps<{ size?: 'sm' | 'lg' }>()
</script>

<template>
  <img
    src="/icon.png"
    alt="WTFSync"
    class="shrink-0"
    :class="size === 'lg' ? 'size-14' : 'size-7 rounded-md'"
  />
</template>
