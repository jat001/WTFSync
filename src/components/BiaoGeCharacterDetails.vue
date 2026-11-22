<script setup lang="ts">
import { computed, ref } from 'vue'

import { formatTime } from '../lib/time'
import { wowClasses } from '../lib/wow-classes'
import { activeRaidLocks, type OverviewCharacter } from '../profiles/biaoge/overview'

const { character, now } = defineProps<{ character: OverviewCharacter; now: number }>()
const tab = ref('raids')
if (character.equipment.length) {
  tab.value = 'equipment'
} else if (!activeRaidLocks(character, now).length) {
  if (character.gold !== undefined || character.currencies.length || character.reputation.length) {
    tab.value = 'currencies'
  } else if (character.quests.length || character.professions.length || character.restedXp !== undefined) {
    tab.value = 'tasks'
  }
}
const tabs = [
  { value: 'equipment', label: '装备', icon: 'i-lucide-shield' },
  { value: 'raids', label: '副本进度', icon: 'i-lucide-swords' },
  { value: 'currencies', label: '货币与声望', icon: 'i-lucide-coins' },
  { value: 'tasks', label: '日常与专业', icon: 'i-lucide-list-checks' },
]

const className = computed(() => wowClasses[character.classFile ?? '']?.name)
const factionNames = new Map([['Alliance', '联盟'], ['Horde', '部落']])
const tags = computed(() => [
  className.value,
  factionNames.get(character.faction ?? ''),
  character.level === undefined ? undefined : `${character.level} 级`,
].filter(Boolean).join(' · '))
const raids = computed(() => activeRaidLocks(character, now))
const itemQualityClasses: Record<number, string> = {
  0: 'text-muted',
  2: 'text-green-700 dark:text-green-400',
  3: 'text-blue-700 dark:text-blue-400',
  4: 'text-violet-700 dark:text-violet-400',
  5: 'text-orange-700 dark:text-orange-400',
}

function storageText(storage: NonNullable<OverviewCharacter['equipment'][number]['storage']>): string {
  return [
    storage.bags ? `背包 ${storage.bags}` : '',
    storage.bank ? `银行 ${storage.bank}` : '',
    storage.mail ? `邮件 ${storage.mail}` : '',
  ].filter(Boolean).join(' · ')
}

function questStatus(quest: OverviewCharacter['quests'][number]): string {
  if (quest.resetAt !== undefined && quest.resetAt <= now) return '已重置'
  if (quest.count !== undefined) return `已完成 ${quest.count} 项`
  return quest.unfinished ? '未完成' : '已完成'
}
</script>

<template>
  <div class="space-y-4">
    <div v-if="tags || character.note">
      <p v-if="tags" class="text-sm font-medium text-highlighted">{{ tags }}</p>
      <p v-if="character.note" class="mt-1 text-sm wrap-break-word whitespace-pre-wrap text-muted select-text">
        {{ character.note }}
      </p>
    </div>

    <UTabs v-model="tab" :items="tabs" :content="false" size="sm" class="w-full" />

    <template v-if="tab === 'equipment'">
      <div v-if="character.equipment.length" class="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div
          v-for="item in character.equipment"
          :key="item.slot"
          class="min-w-0 rounded-md border border-default px-3 py-2"
        >
          <div class="flex items-center justify-between gap-2 text-xs text-muted">
            <span>{{ item.part }}</span>
            <span v-if="item.level !== undefined" class="tabular-nums">装等 {{ item.level }}</span>
          </div>
          <p
            class="mt-1 text-sm font-medium wrap-break-word select-text"
            :class="itemQualityClasses[item.quality ?? 1] ?? 'text-highlighted'"
          >
            {{ item.name }}
          </p>
          <p v-if="item.storage && storageText(item.storage)" class="mt-0.5 text-xs text-muted">
            {{ storageText(item.storage) }}
          </p>
        </div>
      </div>
      <UEmpty v-else icon="i-lucide-shield" title="暂无装备记录" size="sm" />
    </template>

    <template v-else-if="tab === 'raids'">
      <UCard v-for="raid in raids" :key="raid.key" :ui="{ body: 'p-3 sm:p-3' }">
        <div class="flex items-start justify-between gap-2">
          <div>
            <p class="text-sm font-semibold text-highlighted">{{ raid.name }}</p>
            <p v-if="raid.players || raid.difficulty || raid.resetAt" class="mt-1 text-xs text-muted">
              {{ [
                raid.players ? `${raid.players} 人` : '',
                raid.difficulty,
                raid.resetAt ? `${formatTime(raid.resetAt, now)} 重置` : '',
              ].filter(Boolean).join(' · ') }}
            </p>
          </div>
          <UBadge color="info" variant="subtle" size="sm">
            {{ raid.progress ? `已击败 ${raid.progress}` : '已锁定' }}
          </UBadge>
        </div>
        <ul v-if="raid.bosses.length" class="mt-3 space-y-1 border-t border-default pt-2">
          <li v-for="(boss, index) in raid.bosses" :key="index" class="flex items-center justify-between gap-2 text-xs">
            <span>{{ boss.name }}</span>
            <span :class="boss.killed ? 'text-success' : 'text-muted'" class="shrink-0">
              {{ boss.killed ? '已击败' : '未击败' }}
            </span>
          </li>
        </ul>
      </UCard>
      <UEmpty
        v-if="!raids.length"
        icon="i-lucide-swords"
        :title="character.raids === undefined ? '暂无副本记录' : '当前没有副本锁定'"
        size="sm"
      />
    </template>

    <template v-else-if="tab === 'currencies'">
      <UCard
        v-if="character.gold !== undefined || character.currencies.length"
        :ui="{ body: 'divide-y divide-default p-0 sm:p-0' }"
      >
        <div v-if="character.gold !== undefined" class="flex justify-between gap-2 px-3 py-2 text-sm">
          <span>金币</span>
          <span class="font-medium tabular-nums text-amber-700 dark:text-amber-400">
            {{ character.gold.toLocaleString('zh-CN') }}
          </span>
        </div>
        <div v-for="currency in character.currencies" :key="currency.id" class="flex justify-between gap-2 px-3 py-2">
          <div>
            <p class="text-sm">{{ currency.name }}</p>
            <p v-if="currency.weekly || currency.total" class="mt-0.5 text-xs text-muted">
              {{ [
                currency.weekly ? `周进度 ${currency.weekly}` : '',
                currency.total ? `累计 ${currency.total}` : '',
              ].filter(Boolean).join(' · ') }}
            </p>
          </div>
          <span class="text-sm font-medium tabular-nums">{{ currency.count.toLocaleString('zh-CN') }}</span>
        </div>
      </UCard>
      <section v-if="character.reputation.length">
        <h2 class="mb-2 text-sm font-semibold text-highlighted">声望</h2>
        <UCard :ui="{ body: 'divide-y divide-default p-0 sm:p-0' }">
          <div v-for="entry in character.reputation" :key="entry.id" class="flex flex-wrap justify-between gap-1 px-3 py-2 text-sm">
            <span>{{ entry.name }}</span>
            <span class="text-xs tabular-nums text-muted">{{ [entry.standing, entry.progress].filter(Boolean).join(' · ') }}</span>
          </div>
        </UCard>
      </section>
      <UEmpty
        v-if="character.gold === undefined && !character.currencies.length && !character.reputation.length"
        icon="i-lucide-coins"
        title="暂无货币或声望记录"
        size="sm"
      />
    </template>

    <template v-else>
      <section v-if="character.quests.length || character.restedXp !== undefined">
        <h2 class="mb-2 text-sm font-semibold text-highlighted">日常与周常</h2>
        <UCard :ui="{ body: 'divide-y divide-default p-0 sm:p-0' }">
          <div v-for="quest in character.quests" :key="quest.key" class="flex justify-between gap-2 px-3 py-2 text-sm">
            <span>{{ quest.name }}</span>
            <span class="text-muted">{{ questStatus(quest) }}</span>
          </div>
          <div v-if="character.restedXp !== undefined" class="flex justify-between gap-2 px-3 py-2 text-sm">
            <span>双倍经验</span>
            <span class="text-muted">{{ character.restedXp }}%</span>
          </div>
        </UCard>
      </section>
      <section v-if="character.professions.length">
        <h2 class="mb-2 text-sm font-semibold text-highlighted">专业技能冷却</h2>
        <UCard :ui="{ body: 'divide-y divide-default p-0 sm:p-0' }">
          <div v-for="skill in character.professions" :key="skill.key" class="flex justify-between gap-2 px-3 py-2 text-sm">
            <span>{{ skill.name }}</span>
            <span v-if="skill.ready || (skill.resetAt !== undefined && skill.resetAt <= now)" class="text-success">可用</span>
            <span v-else-if="skill.resetAt !== undefined" class="text-muted">{{ formatTime(skill.resetAt, now) }} 可用</span>
          </div>
        </UCard>
      </section>
      <UEmpty
        v-if="!character.quests.length && !character.professions.length && character.restedXp === undefined"
        icon="i-lucide-list-checks"
        title="暂无任务或专业技能记录"
        size="sm"
      />
    </template>
  </div>
</template>
