<script setup lang="ts">
import { computed, shallowReactive } from 'vue'

import {
  gemDetails,
  enchantDetails,
  itemIcon,
  itemLevel,
  itemSockets,
  type ItemCatalog,
} from '../lib/item-catalog'
import { equipmentSlotTextures } from '../lib/equipment-slots'
import { itemQualityColor, itemToneColors } from '../lib/item-colors'
import type { Container, InventoryItem, InventorySlot } from '../profiles/syndicator/inventory'
import LocalItemDetails from './LocalItemDetails.vue'

const props = defineProps<{
  box: Container
  catalog?: ItemCatalog
  equipped?: InventoryItem[]
  search: string
}>()
const emit = defineEmits<{ inspect: [slot: InventorySlot] }>()
// Keep weapon tooltips clear of the icon and the independently hoverable enhancements.
const weaponAnchors = shallowReactive<Partial<Record<number, Element>>>({})

const slotGroups = [
  { name: 'left', slots: [1, 2, 3, 15, 5, 4, 19, 9], tooltipSide: 'right' },
  { name: 'right', slots: [10, 6, 7, 8, 11, 12, 13, 14], tooltipSide: 'left' },
  { name: 'weapons', slots: [16, 17, 18], tooltipSide: 'top' },
] as const
const armoryQualityColors: Record<number, string> = { 3: '#0081ff', 4: '#c600ff' }
const lightQualityColors = [
  '#666666',
  'var(--ui-text-highlighted)',
  '#167300',
  '#005db9',
  '#8e00b5',
  '#a64c00',
  '#795d1e',
  '#006d85',
]
const popup = {
  content:
    'h-auto max-h-[70vh] w-72 max-w-[calc(100vw-24px)] items-start overflow-y-auto rounded-lg bg-slate-900 p-3 text-slate-100',
}
const emptyPopup = {
  content:
    'h-auto rounded-md border border-white/20 bg-neutral-950/95 px-3 py-2 text-sm text-white',
}
const term = computed(() => props.search.trim().toLocaleLowerCase())
const groups = computed(() => {
  const slots = new Map(props.box.slots.map((slot) => [slot.index, slot]))
  return slotGroups.map((group) => ({
    ...group,
    rows: group.slots.flatMap((index) => {
      const slot = slots.get(index)
      if (!slot) return []
      const { item } = slot
      const matches =
        !term.value ||
        (item &&
          (item.name.toLocaleLowerCase().includes(term.value) ||
            String(item.id ?? '') === term.value))
      return [
        {
          slot,
          matches,
          qualityColor:
            item && (armoryQualityColors[item.quality ?? 1] ?? itemQualityColor(item.quality)),
          lightQualityColor: lightQualityColors[item?.quality ?? 1] ?? lightQualityColors[1],
          level: item && itemLevel(props.catalog, item),
          icon: item && itemIcon(props.catalog, item.id, item.iconTexture),
          emptyIcon: !item ? props.catalog?.icons[equipmentSlotTextures[index - 1]] : undefined,
          emptyLabel: `${slot.label}（${slot.recorded ? '空栏位' : '未记录'}）`,
          enchant: enchantDetails(props.catalog, item?.enchant),
          sockets: item
            ? itemSockets(props.catalog, item).map((socket) => {
                const details = socket.gem
                  ? gemDetails(props.catalog, socket.gem, props.equipped)
                  : undefined
                const shine =
                  socket.match === true && (socket.type !== 1 || details?.active === true)
                return {
                  ...socket,
                  details,
                  shine,
                  frame: props.catalog?.socketFrames?.[socket.type],
                }
              })
            : [],
        },
      ]
    }),
  }))
})
const summary = computed(() => {
  const combatGear = groups.value
    .flatMap(({ rows }) => rows)
    .filter(({ slot }) => slot.item && slot.index !== 4 && slot.index !== 19)
  const levels = combatGear.map(({ level }) => level)
  const known = levels.length > 0 && levels.every((level) => level !== undefined && level > 0)
  return {
    average: known
      ? (levels.reduce<number>((total, level) => total + (level ?? 0), 0) / levels.length).toFixed(
          1,
        )
      : undefined,
    enchantCount: props.box.slots.filter(({ item }) => item?.enchant).length,
  }
})
</script>

<template>
  <section class="@container overflow-hidden rounded-xl border border-default bg-muted/35">
    <header class="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-default px-3 py-2.5">
      <h2 class="mr-auto text-sm font-semibold text-highlighted">装备栏</h2>
      <div
        v-if="summary.average"
        class="text-xs text-muted"
        title="按快照中的已穿战斗装备计算，缺少快照装等时使用客户端基础装等"
      >
        已穿装备平均装等
        <strong class="ml-1 text-sm text-highlighted tabular-nums">{{ summary.average }}</strong>
      </div>
      <div class="text-xs text-muted">
        已附魔 <strong class="text-highlighted tabular-nums">{{ summary.enchantCount }}</strong> 件
      </div>
    </header>
    <div class="equipment-layout">
      <ul
        v-for="group in groups"
        :key="group.name"
        class="equipment-group"
        :class="group.name === 'weapons' && 'border-t border-default pt-4'"
        :data-group="group.name"
        :aria-label="group.name === 'weapons' ? '武器栏' : undefined"
      >
        <li
          v-for="row in group.rows"
          :key="row.slot.index"
          :ref="
            group.name === 'weapons'
              ? (element) =>
                  (weaponAnchors[row.slot.index] = (element as Element | null) ?? undefined)
              : undefined
          "
          class="equipment-row relative min-w-0"
          :class="!row.matches && 'opacity-35'"
        >
          <template v-if="row.slot.item">
            <UTooltip
              v-for="target in ['icon', 'name']"
              :key="target"
              :reference="weaponAnchors[row.slot.index]"
              :content="{ side: group.tooltipSide, collisionPadding: 12 }"
              :ui="popup"
              disable-hoverable-content
            >
              <template #content>
                <LocalItemDetails
                  :item="row.slot.item"
                  :catalog="catalog"
                  :equipped="equipped"
                  heading
                />
              </template>
              <button
                v-if="target === 'icon'"
                type="button"
                tabindex="-1"
                class="equipment-icon relative grid size-14 shrink-0 cursor-pointer place-items-center overflow-hidden border bg-black/45"
                :style="{ borderColor: row.qualityColor }"
                :aria-label="row.slot.item.name"
                @click="emit('inspect', row.slot)"
              >
                <img v-if="row.icon" :src="row.icon" alt="" class="size-full object-cover" />
                <UIcon v-else name="i-lucide-shield" class="size-5 text-slate-400" />
                <span
                  v-if="row.level"
                  class="absolute top-0 left-0 bg-black/80 px-1 text-[10px] leading-4 font-semibold text-white tabular-nums"
                  >{{ row.level }}</span
                >
              </button>
              <button
                v-else
                type="button"
                class="equipment-name mb-0.5 min-w-0 max-w-full cursor-pointer self-start rounded text-sm leading-5 font-semibold wrap-break-word text-(--quality-light) focus-visible:outline-primary dark:text-(--quality-dark)"
                :style="{
                  '--quality-light': row.lightQualityColor,
                  '--quality-dark': row.qualityColor,
                }"
                @click="emit('inspect', row.slot)"
              >
                {{ row.slot.item.name }}
              </button>
            </UTooltip>
          </template>
          <UTooltip
            v-else
            :content="{ side: group.tooltipSide, collisionPadding: 12 }"
            :ui="emptyPopup"
            disable-hoverable-content
          >
            <template #content>{{ row.emptyLabel }}</template>
            <span
              tabindex="0"
              class="equipment-icon equipment-empty-slot grid size-14 shrink-0 place-items-center overflow-hidden border border-[#333] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              :aria-label="row.emptyLabel"
            >
              <img
                v-if="row.emptyIcon"
                :src="row.emptyIcon"
                alt=""
                class="size-full object-cover"
              />
              <UIcon
                v-else
                :name="group.name === 'weapons' ? 'i-lucide-swords' : 'i-lucide-shield'"
                class="size-6 text-neutral-600"
                aria-hidden="true"
              />
            </span>
          </UTooltip>
          <div v-if="row.enchant || row.sockets.length" class="equipment-enhancements min-w-0">
            <UTooltip
              v-if="row.enchant"
              :content="{ side: 'bottom', collisionPadding: 12 }"
              :ui="popup"
              disable-hoverable-content
            >
              <template #content>
                <div class="space-y-1 text-xs leading-snug">
                  <p class="font-semibold" :style="{ color: itemToneColors.effect }">
                    {{ row.enchant.name }}
                  </p>
                  <p :style="{ color: itemToneColors.muted }">
                    附魔 ID {{ row.slot.item?.enchant }}
                    <span v-if="row.enchant.spellId"> · 法术 ID {{ row.enchant.spellId }}</span>
                  </p>
                  <p
                    v-if="row.enchant.effect !== row.enchant.name"
                    :style="{ color: itemToneColors.effect }"
                  >
                    {{ row.enchant.effect }}
                  </p>
                  <p v-if="row.enchant.description" class="whitespace-pre-line text-white">
                    {{ row.enchant.description }}
                  </p>
                </div>
              </template>
              <span
                tabindex="0"
                class="relative z-10 block min-w-0 max-w-full rounded text-xs leading-snug wrap-break-word text-[#1a7f00] outline-primary focus-visible:outline-2 dark:text-[#1eff00]"
                :aria-label="`附魔，${row.enchant.name}`"
              >
                {{ row.enchant.name }}
              </span>
            </UTooltip>
            <div
              v-if="row.sockets.length"
              class="equipment-gems relative z-10 flex flex-wrap gap-1"
            >
              <UTooltip
                v-for="socket in row.sockets"
                :key="socket.index"
                :content="{ side: 'bottom', collisionPadding: 12 }"
                :ui="popup"
                disable-hoverable-content
              >
                <template #content>
                  <div v-if="socket.details" class="space-y-0.5 text-sm leading-snug text-white">
                    <p
                      class="font-semibold"
                      :style="{ color: itemQualityColor(socket.details.quality) }"
                    >
                      {{ socket.details.name }}
                    </p>
                    <p v-if="socket.details.level" :style="{ color: itemToneColors.accent }">
                      物品等级 {{ socket.details.level }}
                    </p>
                    <p
                      v-if="socket.details.effect"
                      :style="{
                        color: socket.details.active === false ? itemToneColors.muted : undefined,
                      }"
                    >
                      {{ socket.details.effect }}
                    </p>
                    <p
                      v-for="(line, index) in socket.details.requirements"
                      :key="index"
                      :style="{ color: line.tone ? itemToneColors[line.tone] : undefined }"
                    >
                      {{ line.text }}
                    </p>
                    <p
                      v-if="socket.details.description"
                      class="whitespace-pre-line"
                      :style="{ color: itemToneColors.accent }"
                    >
                      {{ socket.details.description }}
                    </p>
                  </div>
                  <p v-else class="text-sm" :style="{ color: itemToneColors.muted }">
                    {{ socket.label }}
                  </p>
                </template>
                <span
                  tabindex="0"
                  class="equipment-socket relative grid size-[22px] shrink-0 place-items-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  :data-socket="socket.type"
                  :data-native="!!socket.frame"
                  :style="socket.frame ? { '--socket-frame': `url(${socket.frame})` } : undefined"
                  :data-shine="socket.shine"
                  :data-filled="!!socket.gem"
                  :aria-label="
                    socket.details
                      ? `${socket.label}，${socket.details.name}${socket.match === undefined ? '' : socket.match ? '，颜色匹配' : '，颜色不匹配'}`
                      : `${socket.label}，未镶嵌`
                  "
                >
                  <span aria-hidden="true" class="equipment-socket-well grid place-items-center">
                    <img
                      v-if="socket.details?.icon"
                      :src="socket.details.icon"
                      alt=""
                      class="size-full object-cover"
                    />
                    <UIcon
                      v-else-if="socket.gem"
                      name="i-lucide-gem"
                      class="size-3 text-slate-100"
                    />
                  </span>
                  <template v-if="socket.shine">
                    <span
                      v-for="point in 4"
                      :key="point"
                      class="equipment-socket-spark"
                      :style="{ '--spark-index': point - 1 }"
                      aria-hidden="true"
                    />
                  </template>
                </span>
              </UTooltip>
            </div>
          </div>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.equipment-layout {
  display: grid;
  gap: 1rem 2rem;
  padding: 1rem;
}

.equipment-group {
  display: grid;
  min-width: 0;
  align-content: start;
  gap: 0.5rem;
}

.equipment-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  grid-template-rows: auto 1fr;
  column-gap: 0.75rem;
}

.equipment-icon {
  grid-column: 1;
  grid-row: 1 / span 2;
}

.equipment-empty-slot {
  background: radial-gradient(ellipse at 40% 35%, #292929, #101010 74%);
}

.equipment-name,
.equipment-enhancements {
  grid-column: 2;
}

.equipment-name {
  justify-self: start;
  text-align: inherit;
}

.equipment-enhancements {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  align-self: start;
  gap: 0.25rem 0.5rem;
}

.equipment-group[data-group='right'] .equipment-gems {
  order: -1;
}

.equipment-group[data-group='weapons'] {
  grid-column: 1 / -1;
  gap: 1rem;
}

.equipment-group[data-group='weapons'] .equipment-row {
  grid-row: span 3;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: subgrid;
  justify-items: center;
  row-gap: 0.375rem;
  text-align: center;
}

.equipment-group[data-group='weapons'] .equipment-enhancements {
  grid-area: 1 / 1;
  align-self: end;
  justify-content: center;
}

.equipment-group[data-group='weapons'] .equipment-icon {
  grid-area: 2 / 1;
}

.equipment-group[data-group='weapons'] .equipment-name {
  grid-area: 3 / 1;
  justify-self: center;
}

@container (min-width: 24rem) {
  .equipment-group[data-group='weapons'] {
    grid-template-columns: repeat(3, minmax(0, 9rem));
    justify-content: center;
  }
}

@container (min-width: 29rem) {
  .equipment-layout {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .equipment-group[data-group='right'] .equipment-row {
    grid-template-columns: minmax(0, 1fr) auto;
    text-align: right;
  }

  .equipment-group[data-group='right'] .equipment-icon {
    grid-column: 2;
  }

  .equipment-group[data-group='right'] :is(.equipment-name, .equipment-enhancements) {
    grid-column: 1;
  }

  .equipment-group[data-group='right'] .equipment-name {
    justify-self: end;
  }

  .equipment-group[data-group='right'] .equipment-enhancements {
    justify-content: flex-end;
  }

  .equipment-group[data-group='right'] .equipment-gems {
    justify-content: flex-end;
  }
}

.equipment-socket {
  --socket-edge: #a0abb8;
  --socket-light: #e1e7ed;
  --socket-metal: linear-gradient(145deg, var(--socket-light), var(--socket-edge) 48%, #253043 80%);
  --socket-cut: polygon(0 0, 75% 0, 100% 25%, 100% 100%, 25% 100%, 0 75%);
  isolation: isolate;
}

.equipment-socket[data-socket='1'] {
  --socket-edge: #9484c3;
  --socket-light: #efe7ff;
}

.equipment-socket[data-socket='2'] {
  --socket-edge: #e25765;
  --socket-light: #ffb3af;
}

.equipment-socket[data-socket='3'] {
  --socket-edge: #dcae3f;
  --socket-light: #ffe498;
}

.equipment-socket[data-socket='4'] {
  --socket-edge: #309ede;
  --socket-light: #b0e4ff;
}

.equipment-socket[data-socket='5'] {
  --socket-edge: #bd74bc;
  --socket-light: #f5b6ee;
}

.equipment-socket[data-socket='6'] {
  --socket-edge: #ae8b64;
  --socket-light: #ead6b3;
}

.equipment-socket[data-socket='7'] {
  --socket-edge: #78ccd0;
  --socket-light: #e5fbf8;
  --socket-metal: linear-gradient(
    145deg,
    #ffb4b1 8%,
    #f5d480 30%,
    #6ed6ce 55%,
    #ae9be5 76%,
    #47577d
  );
}

.equipment-socket::before {
  position: absolute;
  inset: 0;
  z-index: -1;
  clip-path: var(--socket-cut);
  background: var(--socket-metal);
  content: '';
}

.equipment-socket-well {
  width: calc(100% - 5px);
  height: calc(100% - 5px);
  overflow: hidden;
  clip-path: var(--socket-cut);
  background: radial-gradient(ellipse at 45% 45%, #1d2531, #06090f 76%);
  box-shadow: 0 0 0 1px #05070c;
}

.equipment-socket[data-shine='true'] {
  filter: drop-shadow(0 0 2px color-mix(in srgb, var(--socket-edge) 60%, transparent));
}

.equipment-socket[data-native='true']::before {
  z-index: 1;
  clip-path: none;
  pointer-events: none;
  background: var(--socket-frame) center / contain no-repeat;
}

.equipment-socket[data-native='true'] .equipment-socket-well {
  width: 78%;
  height: 78%;
  border-radius: 2px;
  clip-path: none;
}

.equipment-socket-spark {
  --edge-time: 2.5s;
  position: absolute;
  z-index: 2;
  width: 6px;
  height: 6px;
  translate: -50% -50%;
  pointer-events: none;
  background: radial-gradient(circle, #fff 8%, var(--socket-light) 25%, transparent 70%);
  animation: socket-orbit calc(4 * var(--edge-time)) linear infinite;
  animation-delay: calc(-1 * var(--spark-index) * var(--edge-time));
}

@keyframes socket-orbit {
  0%,
  100% {
    top: 8%;
    left: 8%;
  }

  25% {
    top: 8%;
    left: 92%;
  }

  50% {
    top: 92%;
    left: 92%;
  }

  75% {
    top: 92%;
    left: 8%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .equipment-socket-spark {
    animation-play-state: paused;
  }
}
</style>
