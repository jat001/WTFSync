<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import EquipmentOverview from '../components/EquipmentOverview.vue'
import InventoryContainer from '../components/InventoryContainer.vue'
import LocalItemDetails from '../components/LocalItemDetails.vue'
import { useItemCatalog } from '../composables/useItemCatalog'
import { useGameDirectoryPicker } from '../composables/useGameDirectoryPicker'
import { useInventory } from '../composables/useInventory'
import { useInventorySelection } from '../composables/useInventorySelection'
import { useSettings } from '../composables/useSettings'
import { useSync } from '../composables/useSync'
import { equipmentSlotTextures } from '../lib/equipment-slots'
import { formatCopper } from '../lib/gold'
import { failureLabels } from '../lib/sync-text'
import { formatTime } from '../lib/time'
import { gameVersionItems } from '../lib/wow-flavors'
import type { Container, InventorySlot, InventoryView } from '../profiles/syndicator/inventory'

const { gameDir, flavors } = useSync()
const { settings } = useSettings()
const { pickGameDirectory } = useGameDirectoryPicker()
const { data, reload, watchFailed, loading, error } = useInventory(gameDir)
const flavorItems = computed(() => gameVersionItems(flavors.value))
const inventoryViews = [
  { value: 'equipped', label: '角色装备', icon: 'i-lucide-shield' },
  { value: 'bags', label: '背包', icon: 'i-lucide-backpack' },
  { value: 'bank', label: '个人银行', icon: 'i-lucide-vault' },
  { value: 'warband', label: '战团银行', icon: 'i-lucide-users' },
  { value: 'guild', label: '公会银行', icon: 'i-lucide-landmark' },
]
const isRetail = computed(() => settings.flavor === '_retail_')
const views = computed(() =>
  inventoryViews.filter(({ value }) => value !== 'warband' || isRetail.value),
)
const view = ref<InventoryView>('equipped')
watch(isRetail, (retail) => {
  if (!retail && view.value === 'warband') view.value = 'equipped'
})
const guildId = ref('')
const search = ref('')
const { account, accountId, accountOptions, character, characterId, characterOptions } =
  useInventorySelection(gameDir, data)
const guildOptions = computed(
  () => account.value?.guilds.map((g) => ({ value: g.key, label: g.label })) ?? [],
)
watch(
  guildOptions,
  (list) => {
    if (!list.some((g) => g.value === guildId.value)) guildId.value = list[0]?.value ?? ''
  },
  { immediate: true },
)
const guild = computed(() => account.value?.guilds.find((g) => g.key === guildId.value))
const warband = computed(() => account.value?.warband)
const containers = computed(() => {
  if (view.value === 'guild') return guild.value?.tabs ?? []
  if (view.value === 'warband') return warband.value?.tabs ?? []
  return character.value?.[view.value] ?? []
})
const balance = computed(() => {
  if (view.value === 'guild') {
    return guild.value && { label: '公会银行金币', money: guild.value.money }
  }
  if (view.value === 'warband') {
    return warband.value && { label: '战团银行金币', money: warband.value.money }
  }
  return character.value && { label: '角色金币', money: character.value.money }
})
const items = (boxes: Container[]) =>
  boxes.flatMap((box) => box.slots.flatMap((slot) => (slot.item ? [slot.item] : [])))
const equipped = computed(() =>
  view.value === 'equipped' && character.value ? items(character.value.equipped) : undefined,
)
const catalogItems = computed(() => items(containers.value))
const slotIcons = computed(() => {
  if (view.value !== 'equipped') return []
  const ids = new Set<number>()
  for (const box of containers.value) {
    for (const slot of box.slots) {
      const texture = equipmentSlotTextures[slot.index - 1]
      if (!slot.item && texture) ids.add(texture)
    }
  }
  return [...ids].sort((a, b) => a - b)
})
const { catalog, state: catalogState } = useItemCatalog(gameDir, catalogItems, data, slotIcons)
const emptyText = computed(() => {
  if (view.value === 'guild') {
    if (!guild.value) return '该账号没有公会记录'
    return guild.value.visited
      ? '没有记录的公会银行分页'
      : '尚未记录公会银行，请在游戏中访问公会银行后退出游戏'
  }
  if (view.value === 'warband') {
    return '尚无战团银行分页快照，请在游戏中打开战团银行后退出游戏'
  }
  if (!character.value) return '该账号没有角色记录'
  if (view.value === 'bank') return '尚无个人银行快照，请在游戏中打开银行后退出游戏'
  return view.value === 'bags' ? '尚无背包快照' : '尚无装备快照'
})
const selected = ref<{ box: number; slot: number }>()
const selectedBox = computed(() => containers.value.find((b) => b.index === selected.value?.box))
const selectedSlot = computed(() =>
  selectedBox.value?.slots.find((s) => s.index === selected.value?.slot),
)
const item = computed(() => selectedSlot.value?.item)
const detailsOpen = computed({
  get: () => !!item.value,
  set: (open: boolean) => {
    if (!open) selected.value = undefined
  },
})
watch([gameDir, accountId, view, characterId, guildId], () => {
  selected.value = undefined
  search.value = ''
})
function inspect(box: Container, slot: InventorySlot) {
  selected.value = { box: box.index, slot: slot.index }
}
</script>

<template>
  <div class="space-y-4 p-4">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-base font-semibold text-highlighted">离线库存</h1>
      <div v-if="gameDir" class="flex items-center gap-2">
        <USelect
          v-if="flavorItems.length > 1"
          v-model="settings.flavor"
          :items="flavorItems"
          aria-label="游戏版本"
          size="sm"
          class="game-version-select"
        />
        <UButton
          label="重新读取"
          icon="i-lucide-rotate-cw"
          color="neutral"
          variant="outline"
          size="sm"
          :loading="loading"
          @click="reload"
        />
      </div>
    </header>
    <UCard v-if="!gameDir">
      <UEmpty
        title="尚未设置游戏目录"
        icon="i-lucide-folder-search"
        :actions="[{ label: '选择目录', icon: 'i-lucide-folder-open', onClick: pickGameDirectory }]"
        size="sm"
      />
    </UCard>
    <template v-else>
      <UAlert
        v-if="error"
        title="无法读取库存目录"
        :description="error"
        color="error"
        variant="subtle"
      />
      <UAlert
        v-for="failure in data?.failures"
        :key="failure.id"
        :title="`${failure.id}：读取 Syndicator 存档失败`"
        :description="
          failureLabels[failure.reason] +
          (data?.accounts.some((a) => a.account === failure.id) ? '。正在显示上次可读的快照。' : '')
        "
        color="warning"
        variant="subtle"
      />
      <UAlert
        v-if="watchFailed"
        title="无法监听库存变化"
        description="可点击「重新读取」更新快照。"
        color="warning"
        variant="subtle"
      />
      <UEmpty
        v-if="!account && loading"
        title="正在读取本地库存…"
        icon="i-lucide-loader-circle"
        size="sm"
      />
      <UEmpty
        v-else-if="!account && !error && !data?.failures.length"
        title="没有 Syndicator 库存存档"
        description="在当前游戏版本启用 Syndicator，登录角色并退出游戏后，点击「重新读取」。"
        icon="i-lucide-package-open"
        size="sm"
      />
      <template v-if="account">
        <div class="flex flex-wrap items-end gap-3">
          <UFormField label="来源账号"
            ><USelect v-model="accountId" :items="accountOptions" aria-label="来源账号" size="sm"
          /></UFormField>
          <UFormField v-if="view === 'guild' && guildOptions.length" label="公会"
            ><USelect v-model="guildId" :items="guildOptions" aria-label="公会" size="sm"
          /></UFormField>
          <UFormField
            v-if="view !== 'guild' && view !== 'warband' && characterOptions.length"
            label="角色"
            ><USelect v-model="characterId" :items="characterOptions" aria-label="角色" size="sm"
          /></UFormField>
          <span v-if="account.modifiedAt" class="pb-1 text-xs text-muted"
            >存档更新于 {{ formatTime(account.modifiedAt) }}</span
          >
        </div>
        <UTabs
          v-model="view"
          :items="views"
          :content="false"
          size="sm"
          variant="link"
          :ui="{ list: 'flex-wrap' }"
        />
        <template v-if="containers.length">
          <p v-if="catalogState === 'loading'" class="text-xs text-muted" role="status">
            正在读取客户端物品资料…
          </p>
          <p
            v-else-if="catalogState === 'unavailable' || catalog?.incomplete"
            class="text-xs text-muted"
            role="status"
          >
            部分物品只显示存档资料，客户端数据或同版本热修可能缺失。
          </p>
        </template>
        <div
          v-if="containers.length || balance"
          class="flex flex-wrap items-center gap-x-4 gap-y-2"
        >
          <UInput
            v-if="containers.length"
            v-model="search"
            type="search"
            size="sm"
            icon="i-lucide-search"
            placeholder="按名称或物品 ID 高亮"
            aria-label="按名称或物品 ID 高亮"
          />
          <dl v-if="balance" class="ml-auto flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <dt class="flex items-center gap-1.5 text-muted">
              <UIcon name="i-lucide-coins" aria-hidden="true" class="size-4 text-amber-500" />
              {{ balance.label }}
            </dt>
            <dd class="font-medium text-highlighted tabular-nums">
              {{ formatCopper(balance.money) }}
            </dd>
          </dl>
        </div>
        <template v-if="containers.length">
          <template v-if="view === 'equipped'">
            <EquipmentOverview
              v-for="box in containers"
              :key="box.index"
              :box="box"
              :search="search"
              :catalog="catalog"
              :equipped="equipped"
              @inspect="inspect(box, $event)"
            />
          </template>
          <template v-else>
            <InventoryContainer
              v-for="box in containers"
              :key="box.index"
              :box="box"
              :view="view"
              :search="search"
              :catalog="catalog"
              @inspect="inspect(box, $event)"
            />
          </template>
        </template>
        <UEmpty v-else :title="emptyText" icon="i-lucide-package-open" size="sm" />
      </template>
    </template>
    <UModal
      v-model:open="detailsOpen"
      :title="item?.name"
      :description="
        selectedBox && selectedSlot ? selectedBox.name + ' · ' + selectedSlot.label : undefined
      "
    >
      <template #body>
        <section v-if="item && catalog" class="mb-4 rounded-lg bg-slate-900 p-3 text-slate-100">
          <LocalItemDetails :item="item" :catalog="catalog" :equipped="equipped" />
        </section>
        <dl v-if="item" class="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 text-sm select-text">
          <template v-if="item.id"
            ><dt>物品 ID</dt>
            <dd>{{ item.id }}</dd></template
          >
          <template v-if="!catalog && item.itemLevel !== undefined"
            ><dt>物品等级</dt>
            <dd>{{ item.itemLevel }}</dd></template
          >
          <template v-if="item.count !== undefined"
            ><dt>数量</dt>
            <dd>{{ item.count }}</dd></template
          >
          <template v-if="item.enchant"
            ><dt>附魔 ID</dt>
            <dd>{{ item.enchant }}</dd></template
          >
          <template v-if="item.gems.length"
            ><dt>宝石 ID</dt>
            <dd>{{ item.gems.join('、') }}</dd></template
          >
          <template v-if="item.link"
            ><dt>物品链接</dt>
            <dd class="min-w-0 break-all font-mono text-xs">{{ item.link }}</dd></template
          >
        </dl></template
      >
    </UModal>
  </div>
</template>
