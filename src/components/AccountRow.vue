<script setup lang="ts">
import { computed, ref } from 'vue'

import type { AccountInfo } from '../core/accounts'
import type { Character } from '../core/profile'
import { failureLabels } from '../lib/sync-text'
import { formatTime } from '../lib/time'
import { wowClasses } from '../lib/wow-classes'

const { account, selected, synced } = defineProps<{
  account: AccountInfo
  selected: boolean
  /** Whether the current output already contains this account. */
  synced: boolean
}>()

const emit = defineEmits<{ toggle: [selected: boolean] }>()

const open = ref(false)

const detail = computed(() => {
  if (account.failure) return failureLabels[account.failure.reason]
  const parts = [`${account.characters.length} 个角色`]
  if (account.modifiedAt !== null) {
    parts.push(`存档更新于 ${formatTime(account.modifiedAt)}`)
  }
  return parts.join(' · ')
})

/** Characters grouped by realm, highest level first. */
const realms = computed(() => {
  const groups = new Map<string, Character[]>()
  for (const character of account.characters) {
    const list = groups.get(character.realm) ?? []
    list.push(character)
    groups.set(character.realm, list)
  }
  return [...groups].map(([realm, characters]) => ({
    realm,
    characters: [...characters].sort((a, b) => (b.level ?? 0) - (a.level ?? 0)),
  }))
})

function classDot(character: Character): string {
  return wowClasses[character.classFile ?? '']?.dot ?? 'bg-muted'
}

function characterTitle(character: Character): string {
  const className =
    wowClasses[character.classFile ?? '']?.name ?? character.classFile ?? '未知职业'
  return character.itemLevel === undefined
    ? className
    : `${className} · 装等 ${character.itemLevel.toFixed(1)}`
}
</script>

<template>
  <div class="px-4 py-2.5">
    <div class="flex items-center gap-3">
      <UCheckbox
        :model-value="selected"
        :disabled="!!account.failure && !selected"
        :aria-label="`同步账号 ${account.id}`"
        @update:model-value="emit('toggle', $event === true)"
      />
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <p class="truncate text-xs font-medium text-highlighted select-text">
            {{ account.id }}
          </p>
          <UBadge v-if="synced" color="success" variant="subtle" size="sm">
            已同步
          </UBadge>
        </div>
        <p
          class="truncate text-[11px]"
          :class="account.failure ? 'text-warning' : 'text-dimmed'"
          :title="account.failure?.detail"
        >
          {{ detail }}
        </p>
      </div>
      <UButton
        v-if="account.characters.length > 0"
        :icon="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
        color="neutral"
        variant="ghost"
        size="xs"
        :aria-label="open ? '收起角色' : '展开角色'"
        :aria-expanded="open"
        @click="open = !open"
      />
    </div>

    <div v-if="open" class="mt-2 space-y-2 pl-7">
      <div v-for="group in realms" :key="group.realm">
        <p class="text-[11px] text-muted">{{ group.realm }}</p>
        <div class="mt-1 flex flex-wrap gap-1.5">
          <UBadge
            v-for="character in group.characters"
            :key="character.name"
            color="neutral"
            variant="soft"
            size="sm"
            :title="characterTitle(character)"
          >
            <span
              class="size-2 shrink-0 rounded-full ring-1 ring-default"
              :class="classDot(character)"
            />
            <span>{{ character.name }}</span>
            <span
              v-if="character.level !== undefined"
              class="tabular-nums text-dimmed"
              >{{ character.level }}</span
            >
          </UBadge>
        </div>
      </div>
    </div>
  </div>
</template>
