import { computed, type Ref } from 'vue'
import { pathKey } from '../core/paths'
import type { InventoryAccount } from '../profiles/syndicator/inventory'
import { useSettings } from './useSettings'

export function useInventorySelection(
  gameDir: Readonly<Ref<string>>,
  data: Readonly<Ref<{ accounts: InventoryAccount[] } | undefined>>,
) {
  const { settings } = useSettings()
  const directory = computed(() => pathKey(gameDir.value))
  const selection = computed(() => settings.inventorySelections[directory.value])
  const accountOptions = computed(() => data.value?.accounts.map((entry) => entry.account) ?? [])
  const accountId = computed({
    get() {
      const remembered = selection.value?.account ?? ''
      return accountOptions.value.includes(remembered)
        ? remembered
        : (accountOptions.value[0] ?? '')
    },
    set(id: string) {
      if (!directory.value || !accountOptions.value.includes(id)) return
      settings.inventorySelections = {
        ...settings.inventorySelections,
        [directory.value]: { account: id, characters: selection.value?.characters ?? {} },
      }
    },
  })
  const account = computed(() =>
    data.value?.accounts.find((entry) => entry.account === accountId.value),
  )
  const characterOptions = computed(
    () =>
      account.value?.characters.map((entry) => ({ value: entry.key, label: entry.label })) ?? [],
  )
  const characterId = computed({
    get() {
      const remembered = selection.value?.characters[accountId.value] ?? ''
      return characterOptions.value.some((entry) => entry.value === remembered)
        ? remembered
        : (characterOptions.value[0]?.value ?? '')
    },
    set(id: string) {
      if (!directory.value || !characterOptions.value.some((entry) => entry.value === id)) return
      settings.inventorySelections = {
        ...settings.inventorySelections,
        [directory.value]: {
          account: accountId.value,
          characters: { ...selection.value?.characters, [accountId.value]: id },
        },
      }
    },
  })
  const character = computed(() =>
    account.value?.characters.find((entry) => entry.key === characterId.value),
  )
  return { account, accountId, accountOptions, character, characterId, characterOptions }
}
