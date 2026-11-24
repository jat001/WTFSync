import { describe, expect, it } from 'vitest'

import {
  enchantDetails,
  gemDetails,
  itemLines,
  itemSockets,
  type ItemCatalog,
} from '../../src/lib/item-catalog'
import { catalogRecords, mergeCatalogTables } from '../../src/lib/item-catalog-data'
import type { InventoryItem } from '../../src/profiles/syndicator/inventory'

const item: InventoryItem = {
  id: 48350,
  name: '努波顿的肩甲',
  bound: true,
  enchant: 3808,
  gems: [39999],
}
const catalog: ItemCatalog = {
  incomplete: false,
  icons: {},
  tables: {
    ItemSparse: {
      48350: {
        ItemLevel: 232,
        ItemSet: 865,
        SocketType: [4, 0, 0],
        Socket_match_enchantment_ID: 2877,
        Bonding: 1,
      },
      48348: { ItemSet: 865 },
      39999: {
        Gem_properties: 1218,
        ItemLevel: 80,
        OverallQualityID: 4,
        Description_lang: '对应红色插槽。',
      },
      19829: { InventoryType: 6, SocketType: [4, 0, 0], Socket_match_enchantment_ID: 2877 },
      19830: { InventoryType: 9, SocketType: [0, 0, 0] },
    },
    Item: { 48350: { Resistances: [994] } },
    ItemSet: { 865: { Name_lang: '努波顿的战甲', ItemID: [48350, 48348, 48346] } },
    ItemSetSpell: { 5470: { ItemSetID: 865, Threshold: 2, SpellID: 67220 } },
    EnchantSpell: { 3808: { SpellID: 59934 } },
    SpellName: { 59934: { Name_lang: '强效利斧铭文' } },
    Spell: {
      67220: { Description_lang: '静电震击天赋的触发几率提高$s1%。' },
      59934: { Description_lang: '永久性地为一件肩部装备附魔。|n附魔之后，该装备会与你绑定。' },
    },
    SpellEffect: {
      970570: { SpellID: 67220, EffectIndex: 0, EffectBasePoints: 2, EffectDieSides: 1 },
    },
    GemProperties: { 1218: { Enchant_ID: 3449, Type: 2 } },
    SpellItemEnchantment: {
      3808: { Name_lang: '+40 攻击强度，+15 爆击等级' },
      3449: { Name_lang: '+$k1 攻击强度', EffectPointsMin: [32, 0, 0] },
      2877: { Name_lang: '+$k1 敏捷', EffectPointsMin: [4, 0, 0] },
    },
  },
}

describe('local item details', () => {
  it('reassembles item, gem and enchant records with the same tooltip dependencies', () => {
    const tables: ItemCatalog['tables'] = {}
    const record = catalogRecords(catalog.tables)
    for (const id of [48350, 48348, 39999]) mergeCatalogTables(tables, record('item', id))
    mergeCatalogTables(tables, record('enchant', 3808))
    const rebuilt = { ...catalog, tables }
    const equipped = [item, { id: 48348, name: '努波顿的面甲', gems: [] }]
    expect(itemLines(rebuilt, item, equipped)).toEqual(itemLines(catalog, item, equipped))
    expect(enchantDetails(rebuilt, 3808)).toEqual(enchantDetails(catalog, 3808))
    expect(gemDetails(rebuilt, 39999)).toEqual(gemDetails(catalog, 39999))
    expect(tables.ItemSparse?.[19829]).toBeUndefined()
  })

  it('uses the item binding rule, keeps a mismatched socket bonus inactive, and resolves set bonuses', () => {
    const lines = itemLines(catalog, item, [item, { id: 48348, name: '努波顿的面甲', gems: [] }])
    expect(lines).toEqual(
      expect.arrayContaining([
        { text: '物品等级 232', tone: 'accent' },
        { text: '拾取后绑定', tone: undefined },
        { text: '994 点护甲', tone: undefined },
        { text: '+40 攻击强度，+15 爆击等级', tone: 'effect' },
        { text: '+32 攻击强度', icon: undefined, quality: 4 },
        { text: '镶孔奖励：+4 敏捷', tone: 'muted' },
        { text: '努波顿的战甲（2/3）', tone: 'accent' },
        { text: '2 件套：静电震击天赋的触发几率提高3%。', tone: 'effect' },
      ]),
    )
  })

  it('keeps the matching weapon subclass and shows DPS after splitting the catalog', () => {
    const weapon = { id: 2493, name: '木槌棒', gems: [] }
    const record = catalogRecords({
      ItemSparse: {
        2493: { InventoryType: 17, ItemDelay: 2600, MinDamage: [10], MaxDamage: [16] },
      },
      Item: { 2493: { ClassID: 2, SubclassID: 5 } },
      ItemSubClass: {
        1: { ClassID: 2, SubClassID: 1, DisplayName_lang: '斧' },
        2: { ClassID: 2, SubClassID: 5, DisplayName_lang: '锤' },
      },
    })
    const tables = record('item', 2493)
    expect(Object.keys(tables.ItemSubClass ?? {})).toEqual(['2'])
    expect(itemLines({ ...catalog, tables }, weapon).map(({ text }) => text)).toEqual([
      '双手 · 锤',
      '10–16 伤害 · 速度 2.60',
      '每秒伤害 5.0',
    ])
  })

  it('keeps the known snapshot fields when a catalog is unavailable', () => {
    expect(itemLines(undefined, { ...item, itemLevel: 232 }).map(({ text }) => text)).toEqual([
      '物品等级 232',
    ])
  })

  it('only displays binding rules defined by the client, regardless of snapshot binding', () => {
    const bindingCatalog: ItemCatalog = {
      ...catalog,
      tables: {
        ItemSparse: { 1: { Bonding: 2 }, 2: { Bonding: 3 }, 3: { Bonding: 0 } },
      },
    }
    expect(itemLines(bindingCatalog, { id: 1, name: '装备', bound: true, gems: [] })[0]?.text).toBe(
      '装备后绑定',
    )
    expect(
      itemLines(bindingCatalog, { id: 2, name: '物品', bound: false, gems: [] })[0]?.text,
    ).toBe('使用后绑定')
    expect(itemLines(bindingCatalog, { id: 3, name: '材料', bound: false, gems: [] })).toEqual([])
  })

  it('reconstructs Dragonfin Filet use text from retained spell dependencies', () => {
    const record = catalogRecords({
      ItemSparse: { 43000: { ItemLevel: 80, Bonding: 0, RequiredLevel: 70 } },
      ItemEffect: { 143138: { ParentItemID: 43000, SpellID: 57370, TriggerType: 0 } },
      Spell: {
        57370: {
          Description_lang:
            '在$45548d内恢复总计$45548o1点生命值和${$57073m2/5*30}点法力值。如果你花费至少10秒钟来进食，你的力量将提高$57371s1点，耐力将提高$57371s2点，持续$57371d。',
        },
      },
      SpellEffect: {
        1: {
          SpellID: 45548,
          EffectIndex: 0,
          EffectBasePoints: 3749,
          EffectDieSides: 1,
          EffectAura: 84,
          EffectAuraPeriod: 0,
        },
        2: { SpellID: 57073, EffectIndex: 1, EffectBasePoints: 3199, EffectDieSides: 1 },
        3: { SpellID: 57371, EffectIndex: 0, EffectBasePoints: 39, EffectDieSides: 1 },
        4: { SpellID: 57371, EffectIndex: 1, EffectBasePoints: 39, EffectDieSides: 1 },
      },
      SpellMisc: {
        1: { SpellID: 45548, DurationIndex: 9 },
        2: { SpellID: 57371, DurationIndex: 42 },
      },
      SpellDuration: { 9: { Duration: 30_000 }, 42: { Duration: 3_600_000 } },
    })
    const local = { ...catalog, tables: record('item', 43000) }
    const food = { id: 43000, name: '龙鳞鱼片', bound: false, gems: [] }
    expect(itemLines(local, food).map(({ text }) => text)).toEqual([
      '物品等级 80',
      '需要等级 70',
      '使用：在30 秒内恢复总计22500点生命值和19200点法力值。如果你花费至少10秒钟来进食，你的力量将提高40点，耐力将提高40点，持续1 小时。',
    ])
  })

  it('keeps empty sockets in place and exposes details for the gem in the next socket', () => {
    const secondSocket = { ...item, gemSlots: [0, 39999] }
    expect(itemSockets(catalog, secondSocket)).toMatchObject([
      { index: 0, type: 4, label: '蓝色插槽', gem: undefined },
      { index: 1, type: 7, label: '额外棱彩插槽', gem: 39999 },
    ])
    expect(gemDetails(catalog, 39999)).toMatchObject({
      effect: '+32 攻击强度',
      description: '对应红色插槽。',
      level: 80,
      quality: 4,
      active: true,
    })
    expect(gemDetails(undefined, 39999).name).toBe('宝石 #39999')
  })

  it('keeps the application spell name, original description and stat line distinct', () => {
    expect(enchantDetails(catalog, 3808)).toEqual({
      name: '强效利斧铭文',
      effect: '+40 攻击强度，+15 爆击等级',
      description: '永久性地为一件肩部装备附魔。\n附魔之后，该装备会与你绑定。',
      spellId: 59934,
    })
    expect(enchantDetails(undefined, 3808)).toMatchObject({ name: '附魔 #3808' })
  })

  it('resolves the fixed enchantment values from the selected game catalog', () => {
    const titan: ItemCatalog = {
      ...catalog,
      tables: {
        ...catalog.tables,
        EnchantSpell: { 3754: { SpellID: 24162 } },
        SpellName: { 24162: { Name_lang: '愤怒预言' } },
        SpellItemEnchantment: {
          3754: {
            Name_lang: '+$k1 攻击强度/+$k2 爆击等级',
            EffectPointsMin: [58, 24, 0],
            EffectScalingPoints: [0, 0, 0],
          },
        },
      },
    }
    const tables = catalogRecords(titan.tables)('enchant', 3754)
    expect(enchantDetails({ ...titan, tables }, 3754)).toMatchObject({
      name: '愤怒预言',
      spellId: 24162,
      effect: '+58 攻击强度/+24 爆击等级',
    })
    expect(itemLines(titan, { ...item, enchant: 3754 })).toContainEqual({
      text: '+58 攻击强度/+24 爆击等级',
      tone: 'effect',
    })

    Object.assign(titan.tables.SpellItemEnchantment?.[3754] ?? {}, {
      EffectScalingPoints: [1, 0, 0],
    })
    expect(enchantDetails(titan, 3754)).toMatchObject({ name: '愤怒预言', effect: '愤怒预言' })
  })

  it('treats extra sockets on belts and bracers as prismatic without affecting the socket bonus', () => {
    const belt = { id: 19829, name: '腰带', gems: [39999, 39999] }
    expect(itemSockets(catalog, belt)).toMatchObject([
      { type: 4, match: false },
      { type: 7, match: true, label: '额外棱彩插槽', gem: 39999 },
    ])
    expect(itemLines(catalog, belt)).toContainEqual({ text: '镶孔奖励：+4 敏捷', tone: 'muted' })
    const bracers = { id: 19830, name: '护腕', gems: [39999] }
    expect(itemSockets(catalog, bracers)).toMatchObject([
      { type: 7, match: true, label: '额外棱彩插槽', gem: 39999 },
    ])
    expect(itemSockets(undefined, belt)[1]).toMatchObject({ label: '插槽 2', match: undefined })
    expect(itemSockets(catalog, { ...belt, gems: [39999] })).toHaveLength(1)
  })

  it('counts a gem in an extra socket toward the character-wide meta condition', () => {
    const withMeta: ItemCatalog = {
      ...catalog,
      tables: {
        ...catalog.tables,
        SpellItemEnchantment: {
          ...catalog.tables.SpellItemEnchantment,
          3480: { Name_lang: '+21 敏捷', Condition_ID: 1 },
        },
        ItemSparse: { ...catalog.tables.ItemSparse, 41398: { Gem_properties: 1220 } },
        GemProperties: { ...catalog.tables.GemProperties, 1220: { Enchant_ID: 3480, Type: 1 } },
        SpellItemEnchantmentCondition: {
          1: { Lt_operandType: [2], Rt_operand: [1], Operator: [5] },
        },
      },
    }
    const bracers = { id: 19830, name: '护腕', gems: [39999] }
    expect(gemDetails(withMeta, 41398, []).active).toBe(false)
    expect(gemDetails(withMeta, 41398).active).toBeUndefined()
    expect(gemDetails(withMeta, 41398, [bracers]).active).toBe(true)
    expect(gemDetails(withMeta, 41398, []).requirements).toEqual([
      { text: '需要至少 1 颗红色宝石', tone: 'muted' },
    ])
    expect(gemDetails(withMeta, 41398, [bracers]).requirements).toEqual([
      { text: '需要至少 1 颗红色宝石', tone: undefined },
    ])
  })

  it('shows condition thresholds without claiming a vault item is currently equipped', () => {
    const lines = itemLines(catalog, { id: 48350, name: item.name, gems: [] })
    expect(lines).toEqual(
      expect.arrayContaining([
        { text: '拾取后绑定', tone: undefined },
        { text: '蓝色插槽', tone: 'muted' },
        { text: '2 件套：静电震击天赋的触发几率提高3%。', tone: 'muted' },
      ]),
    )
    expect(lines.some(({ text }) => text.includes('（0/'))).toBe(false)
  })
})
