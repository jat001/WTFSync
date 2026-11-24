<script setup lang="ts">
import { computed } from 'vue'
import { itemIcon, type ItemCatalog } from '../lib/item-catalog'
import { itemQualityColor } from '../lib/item-colors'
import type { Container, InventorySlot, InventoryView } from '../profiles/syndicator/inventory'
import LocalItemDetails from './LocalItemDetails.vue'

const props = defineProps<{
  box: Container
  view: InventoryView
  search: string
  catalog?: ItemCatalog
}>()
const emit = defineEmits<{ inspect: [slot: InventorySlot] }>()
const occupied = computed(() => props.box.slots.filter((slot) => slot.item).length)
const term = computed(() => props.search.trim().toLocaleLowerCase())
function matches(slot: InventorySlot) {
  return (
    !term.value ||
    (!!slot.item &&
      (slot.item.name.toLocaleLowerCase().includes(term.value) ||
        String(slot.item.id ?? '') === term.value))
  )
}
</script>

<template>
  <section class="space-y-2 rounded-lg border border-default p-3">
    <header class="flex items-center justify-between gap-2">
      <h2 class="text-sm font-semibold text-highlighted">{{ box.name }}</h2>
      <span v-if="box.slots.length" class="text-xs text-muted tabular-nums"
        >{{ occupied }} / {{ box.slots.length }}</span
      >
    </header>
    <p v-if="box.restricted" class="text-xs text-muted">存档记录该分页不可查看</p>
    <p v-else-if="!box.slots.length" class="text-xs text-muted">
      {{ view === 'guild' ? '尚无该分页的格位记录' : '没有已记录的格位' }}
    </p>
    <div v-else class="overflow-x-auto pb-1">
      <div
        class="grid gap-1"
        :class="
          view === 'guild'
            ? 'grid-flow-col grid-rows-7 auto-cols-[3.25rem]'
            : 'grid-cols-[repeat(auto-fill,3.25rem)]'
        "
      >
        <template v-for="slot in box.slots" :key="slot.index">
          <UTooltip
            v-if="slot.item"
            :content="{ side: 'right', collisionPadding: 12 }"
            :ui="{
              content:
                'h-auto max-h-[70vh] w-72 max-w-[calc(100vw-24px)] items-start overflow-y-auto rounded-lg bg-slate-900 p-3 text-slate-100',
            }"
          >
            <template #content>
              <LocalItemDetails :item="slot.item" :catalog="catalog" heading />
            </template>
            <button
              type="button"
              class="relative grid size-13 place-items-center overflow-hidden rounded border border-(--item-border) bg-elevated hover:border-primary focus-visible:outline-primary"
              :class="!matches(slot) && 'opacity-35'"
              :style="{
                '--item-border':
                  slot.item.quality === undefined || slot.item.quality === 1
                    ? 'var(--ui-border)'
                    : itemQualityColor(slot.item.quality),
              }"
              :aria-label="`${slot.label}，${slot.item.name}，数量 ${slot.item.count ?? '未知'}`"
              @click="emit('inspect', slot)"
            >
              <img
                v-if="itemIcon(catalog, slot.item.id)"
                :src="itemIcon(catalog, slot.item.id)"
                alt=""
                class="absolute inset-0 size-full object-cover"
              />
              <UIcon v-else name="i-lucide-package" class="size-6 text-dimmed" />
              <span
                v-if="slot.item.count && slot.item.count > 1"
                aria-hidden="true"
                class="pointer-events-none absolute right-0 bottom-0 rounded-tl-sm bg-black/80 px-1 text-xs leading-4 font-semibold text-white tabular-nums"
                >{{ slot.item.count }}</span
              >
            </button>
          </UTooltip>
          <div
            v-else
            class="size-13 rounded border border-dashed border-default"
            :title="`${slot.label} · ${slot.recorded ? '空' : '未记录'}`"
          />
        </template>
      </div>
    </div>
  </section>
</template>
