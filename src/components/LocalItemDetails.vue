<script setup lang="ts">
import { computed } from 'vue'
import { itemIcon, itemLines, type ItemCatalog } from '../lib/item-catalog'
import { itemQualityColor, itemToneColors } from '../lib/item-colors'
import type { InventoryItem } from '../profiles/syndicator/inventory'

const props = defineProps<{
  item: InventoryItem
  catalog?: ItemCatalog
  equipped?: readonly InventoryItem[]
  heading?: boolean
}>()

const lines = computed(() => itemLines(props.catalog, props.item, props.equipped))
const icon = computed(() => itemIcon(props.catalog, props.item.id))
</script>

<template>
  <div class="min-w-0 space-y-2 text-sm leading-snug text-white">
    <div v-if="heading" class="flex items-center gap-2 font-semibold text-white">
      <img v-if="icon" :src="icon" alt="" class="size-7 shrink-0 rounded" />
      <span :style="{ color: itemQualityColor(item.quality) }">{{ item.name }}</span>
    </div>
    <ul v-if="lines.length" class="space-y-0.5">
      <li
        v-for="(line, index) in lines"
        :key="index"
        class="flex items-start gap-1.5 whitespace-pre-line"
        :style="{
          color: line.tone
            ? itemToneColors[line.tone]
            : line.quality === undefined
              ? undefined
              : itemQualityColor(line.quality),
        }"
      >
        <img v-if="line.icon" :src="line.icon" alt="" class="mt-0.5 size-4 shrink-0 rounded-sm" />
        <span>{{ line.text }}</span>
      </li>
    </ul>
  </div>
</template>
