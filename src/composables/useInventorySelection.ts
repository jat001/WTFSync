import { computed, type Ref } from 'vue'
import { pathKey } from '../core/paths'
import { shortRealmName } from '../lib/wow-realms'
import type { InventoryAccount } from '../profiles/syndicator/inventory'
import { useSettings } from './useSettings'

function realmName(realm?: string): string {
  return realm ? shortRealmName(realm) : '未知服务器'
}

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
  const character = computed(() => {
    const characters = account.value?.characters
    const remembered = selection.value?.characters[accountId.value]
    return characters?.find(({ key }) => key === remembered) ?? characters?.[0]
  })

  const charactersByRealm = computed(() => {
    const groups = new Map<string, InventoryAccount['characters']>()
    for (const entry of account.value?.characters ?? []) {
      const realm = realmName(entry.realm)
      const group = groups.get(realm) ?? []
      group.push(entry)
      groups.set(realm, group)
    }
    return groups
  })
  const realmOptions = computed(() =>
    [...charactersByRealm.value.keys()]
      .sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }))
      .map((realm) => ({ value: realm, label: realm })),
  )

  function rememberCharacter(id: string) {
    if (!directory.value) return
    settings.inventorySelections = {
      ...settings.inventorySelections,
      [directory.value]: {
        account: accountId.value,
        characters: { ...selection.value?.characters, [accountId.value]: id },
      },
    }
  }

  const selectedRealm = computed({
    get: () => (character.value ? realmName(character.value.realm) : ''),
    set(realm: string) {
      if (realm === selectedRealm.value) return
      const firstCharacter = charactersByRealm.value.get(realm)?.[0]
      if (firstCharacter) rememberCharacter(firstCharacter.key)
    },
  })
  const characterOptions = computed(
    () =>
      charactersByRealm.value
        .get(selectedRealm.value)
        ?.map(({ key, name, label }) => ({ value: key, label: name || label })) ?? [],
  )
  const characterId = computed({
    get: () => character.value?.key ?? '',
    set(id: string) {
      if (characterOptions.value.some(({ value }) => value === id)) rememberCharacter(id)
    },
  })
  return {
    account,
    accountId,
    accountOptions,
    selectedRealm,
    realmOptions,
    character,
    characterId,
    characterOptions,
  }
}
