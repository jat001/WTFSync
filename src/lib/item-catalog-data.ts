import type { ItemCatalog } from './item-catalog'

type Tables = ItemCatalog['tables']

function byColumn(table: Tables[string], column: string) {
  const index = new Map<number, number[]>()
  for (const [id, row] of Object.entries(table ?? {})) {
    const key = row?.[column]
    if (typeof key !== 'number') continue
    const rows = index.get(key) ?? []
    rows.push(Number(id))
    index.set(key, rows)
  }
  return index
}

/** Splits a reader batch into independent item and applied-enchantment records. */
export function catalogRecords(source: Tables) {
  const effects = byColumn(source.ItemEffect, 'ParentItemID')
  const bonuses = byColumn(source.ItemSetSpell, 'ItemSetID')
  const spellEffects = byColumn(source.SpellEffect, 'SpellID')
  const spellMisc = byColumn(source.SpellMisc, 'SpellID')
  const subclasses = byColumn(source.ItemSubClass, 'ClassID')

  return (kind: 'item' | 'enchant', id: number) => {
    const tables: Tables = {}
    const spells = new Set<number>()
    function include(table: string, key: unknown) {
      if (typeof key !== 'number' || !key) return undefined
      const row = source[table]?.[key]
      if (row) (tables[table] ??= {})[key] = row
      return row
    }
    function addSpell(key: unknown) {
      if (typeof key === 'number' && key > 0) spells.add(key)
    }
    function includeEnchant(key: unknown) {
      const enchant = include('SpellItemEnchantment', key)
      include('SpellItemEnchantmentCondition', enchant?.Condition_ID)
    }
    if (kind === 'enchant') {
      includeEnchant(id)
      const spellId = include('EnchantSpell', id)?.SpellID
      include('SpellName', spellId)
      addSpell(spellId)
    } else {
      const sparse = include('ItemSparse', id)
      const item = include('Item', id)
      const gem = include('GemProperties', sparse?.Gem_properties)
      includeEnchant(gem?.Enchant_ID)
      includeEnchant(sparse?.Socket_match_enchantment_ID)
      const setId = sparse?.ItemSet
      const set = include('ItemSet', setId)
      if (Array.isArray(set?.ItemID)) {
        for (const piece of set.ItemID) include('Pieces', piece)
      }
      if (typeof setId === 'number') {
        for (const bonus of bonuses.get(setId) ?? []) {
          addSpell(include('ItemSetSpell', bonus)?.SpellID)
        }
      }
      for (const effect of effects.get(id) ?? []) addSpell(include('ItemEffect', effect)?.SpellID)
      if (typeof item?.ClassID === 'number') {
        for (const subclass of subclasses.get(item.ClassID) ?? []) {
          if (source.ItemSubClass?.[subclass]?.SubClassID === item.SubclassID) {
            include('ItemSubClass', subclass)
          }
        }
      }
    }
    // Matches the reader's spell dependency discovery. The set also handles cycles.
    for (const spellId of spells) {
      const description = include('Spell', spellId)?.Description_lang
      if (typeof description === 'string') {
        for (const match of description.matchAll(
          /\$(?:@spell(?:name|desc|tooltip))?(\d+)[sdmt]?/gi,
        )) {
          addSpell(Number(match[1]))
        }
      }
      for (const effect of spellEffects.get(spellId) ?? []) include('SpellEffect', effect)
      for (const misc of spellMisc.get(spellId) ?? []) {
        include('SpellDuration', include('SpellMisc', misc)?.DurationIndex)
      }
    }
    return tables
  }
}

export function mergeCatalogTables(target: Tables, source: Tables) {
  for (const [table, rows] of Object.entries(source)) {
    if (rows) Object.assign((target[table] ??= {}), rows)
  }
}
