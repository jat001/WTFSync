import type { InventoryItem } from '../profiles/syndicator/inventory'

type Row = Record<string, number | string | number[] | undefined>
type Rows = Record<number, Row | undefined>

export interface ItemCatalog {
  socketFrames?: Record<number, string | undefined>
  tables: Record<string, Rows | undefined>
  icons: Record<number, string | undefined>
  incomplete: boolean
}

export interface ItemLine {
  text: string
  tone?: 'accent' | 'effect' | 'muted'
  icon?: string
  quality?: number
}

const inventoryTypes = [
  '',
  '头部',
  '颈部',
  '肩部',
  '衬衣',
  '胸部',
  '腰部',
  '腿部',
  '脚部',
  '手腕',
  '手部',
  '手指',
  '饰品',
  '单手',
  '副手',
  '远程',
  '背部',
  '双手',
  '容器',
  '战袍',
  '胸部',
  '主手',
  '副手',
  '副手物品',
  '弹药',
  '投掷武器',
  '远程',
  '箭袋',
  '圣物',
  '专业工具',
  '专业装备',
]

const statNames: Record<number, string> = {
  0: '法力值',
  1: '生命值',
  3: '敏捷',
  4: '力量',
  5: '智力',
  6: '精神',
  7: '耐力',
  12: '防御等级',
  13: '躲闪等级',
  14: '招架等级',
  15: '格挡等级',
  16: '近战命中等级',
  17: '远程命中等级',
  18: '法术命中等级',
  19: '近战爆击等级',
  20: '远程爆击等级',
  21: '法术爆击等级',
  31: '命中等级',
  32: '爆击等级',
  35: '韧性等级',
  36: '急速等级',
  37: '精准等级',
  38: '攻击强度',
  39: '远程攻击强度',
  40: '野性攻击强度',
  41: '法术治疗',
  42: '法术伤害',
  43: '法力回复',
  44: '护甲穿透等级',
  45: '法术强度',
  46: '生命回复',
  47: '法术穿透',
  48: '格挡值',
  49: '精通等级',
  50: '额外护甲',
}

const socketNames: Record<number, string> = {
  1: '多彩插槽',
  2: '红色插槽',
  3: '黄色插槽',
  4: '蓝色插槽',
  5: '染煞插槽',
  6: '齿轮插槽',
  7: '棱彩插槽',
}
const socketMasks: Record<number, number> = { 1: 1, 2: 2, 3: 4, 4: 8, 7: 14 }
const bondTypes: Record<number, string> = {
  1: '拾取后绑定',
  2: '装备后绑定',
  3: '使用后绑定',
  4: '任务物品',
}
const classNames = [
  '战士',
  '圣骑士',
  '猎人',
  '潜行者',
  '牧师',
  '死亡骑士',
  '萨满祭司',
  '法师',
  '术士',
  '武僧',
  '德鲁伊',
  '恶魔猎手',
  '唤魔师',
]

function number(row: Row | undefined, col: string): number | undefined {
  const value = row?.[col]
  return typeof value === 'number' ? value : undefined
}
function list(row: Row | undefined, col: string): number[] {
  const value = row?.[col]
  return Array.isArray(value) ? value : []
}
function string(row: Row | undefined, col: string): string | undefined {
  const value = row?.[col]
  return typeof value === 'string' && value ? value : undefined
}
function table(catalog: ItemCatalog, name: string) {
  return Object.values(catalog.tables[name] ?? {}).filter((entry): entry is Row => !!entry)
}

export function catalogRequest(
  items: readonly InventoryItem[],
  additionalIcons: readonly number[] = [],
) {
  const ids = new Set<number>()
  const enchants = new Set<number>()
  const valid = (id: number | undefined): id is number =>
    Number.isInteger(id) && id! > 0 && id! <= 0x7fffffff
  const icons = new Set(additionalIcons.filter(valid))
  for (const item of items) {
    if (valid(item.id)) ids.add(item.id)
    if (valid(item.enchant)) enchants.add(item.enchant)
    if (valid(item.iconTexture)) icons.add(item.iconTexture)
    for (const gem of item.gems) if (valid(gem)) ids.add(gem)
  }
  return {
    items: [...ids].sort((a, b) => a - b),
    enchants: [...enchants].sort((a, b) => a - b),
    icon_ids: [...icons].sort((a, b) => a - b),
  }
}

export function itemIcon(
  catalog: ItemCatalog | undefined,
  id: number | undefined,
  iconTexture?: number,
) {
  if (!catalog) return undefined
  const instance = iconTexture && catalog.icons[iconTexture]
  if (instance) return instance
  const texture = id && number(catalog.tables.Item?.[id], 'IconFileDataID')
  return (texture && catalog.icons[texture]) || undefined
}

function spell(catalog: ItemCatalog, id: number): string | undefined {
  const description = string(catalog.tables.Spell?.[id], 'Description_lang')
  if (!description) return undefined
  function duration(spellId: number) {
    const misc = table(catalog, 'SpellMisc').find(
      (row) => row.SpellID === spellId && !row.DifficultyID,
    )
    return number(catalog.tables.SpellDuration?.[number(misc, 'DurationIndex') ?? -1], 'Duration')
  }
  const substitute = (text: string) =>
    text.replace(
      /\$(?:(\d+))?([dmost])([1-9])?/gi,
      (token, ref: string | undefined, code: string, index: string | undefined) => {
        const spellId = ref ? Number(ref) : id
        const type = code.toLowerCase()
        if (type === 'd') {
          const length = duration(spellId)
          if (!length || length < 0) return token
          if (length % 3_600_000 === 0) return `${length / 3_600_000} 小时`
          if (length % 60_000 === 0) return `${length / 60_000} 分钟`
          return `${length / 1_000} 秒`
        }
        const effect = table(catalog, 'SpellEffect').find(
          (row) =>
            row.SpellID === spellId &&
            !row.DifficultyID &&
            row.EffectIndex === Number(index ?? 1) - 1,
        )
        const period = number(effect, 'EffectAuraPeriod')
        if (type === 't') return period ? String(period / 1_000) : token
        const base = number(effect, 'EffectBasePointsF') || number(effect, 'EffectBasePoints')
        if (base === undefined) return token
        const sides = number(effect, 'EffectDieSides') ?? 0
        const low = Math.abs(base + (sides > 0 ? 1 : 0))
        if (type === 'o') {
          const length = duration(spellId)
          // MOD_REGEN amounts are expressed per five seconds, with no explicit period.
          const interval = period || (effect?.EffectAura === 84 ? 5_000 : 0)
          return length && length > 0 && interval > 0
            ? String(low * Math.floor(length / interval))
            : token
        }
        return sides > 1 && type === 's' ? `${low}–${Math.abs(base + sides)}` : String(low)
      },
    )
  const text = substitute(
    description.replace(/\$\{([^{}]+)\}/g, (token, expression: string) => {
      const arithmetic = substitute(expression).replace(/\s+/g, '')
      if (!/^-?\d+(?:\.\d+)?(?:[*/]-?\d+(?:\.\d+)?)*$/.test(arithmetic)) return token
      const [first, ...terms] = arithmetic.split(/(?=[*/])/)
      const total = terms.reduce(
        (value, term) =>
          term.startsWith('*') ? value * Number(term.slice(1)) : value / Number(term.slice(1)),
        Number(first),
      )
      return Number.isFinite(total) ? String(total) : token
    }),
  )
  return text.includes('$') ? undefined : text.replace(/\|n/g, '\n')
}

function gemProperty(catalog: ItemCatalog, id: number) {
  const record = catalog.tables.ItemSparse?.[id]
  return catalog.tables.GemProperties?.[number(record, 'Gem_properties') ?? 0]
}

function gemRequirements(
  catalog: ItemCatalog,
  condition: Row,
  equipped?: readonly InventoryItem[],
) {
  const requirements: ItemLine[] = []
  const met: (boolean | undefined)[] = []
  const masks = list(condition, 'Lt_operandType')
  const values = list(condition, 'Rt_operand')
  const operators = list(condition, 'Operator')
  const rhs = list(condition, 'Rt_operandType')
  const logic = list(condition, 'Logic')
  const colors: Record<number, [string, number]> = {
    2: ['红色', 2],
    3: ['黄色', 4],
    4: ['蓝色', 8],
  }
  const equippedGems = equipped
    ?.flatMap(({ gems }) => gems)
    .map((id) => number(gemProperty(catalog, id), 'Type'))
  const unknown = equippedGems?.filter((mask) => mask === undefined).length
  for (let index = 0; index < masks.length; index++) {
    if (!masks[index]) continue
    const color = colors[masks[index]]
    if (!color || operators[index] !== 5 || rhs[index] || (logic[index] && logic[index] !== 1))
      return { requirements: [], active: undefined }
    const [name, bit] = color
    const count = equippedGems?.filter((mask) => mask !== undefined && mask & bit).length
    const satisfied =
      count !== undefined && count >= values[index]
        ? true
        : count !== undefined && unknown !== undefined && count + unknown < values[index]
          ? false
          : undefined
    met.push(satisfied)
    requirements.push({
      text: `需要至少 ${values[index]} 颗${name}宝石`,
      tone: satisfied === true ? undefined : 'muted',
    })
  }
  const active = met.includes(false)
    ? false
    : met.length && met.every((value) => value === true)
      ? true
      : undefined
  return { requirements, active }
}

export function itemLevel(catalog: ItemCatalog | undefined, item: InventoryItem) {
  return item.itemLevel ?? number(catalog?.tables.ItemSparse?.[item.id ?? 0], 'ItemLevel')
}

function enchantmentText(row: Row | undefined) {
  const template = string(row, 'Name_lang')
  const points = list(row, 'EffectPointsMin')
  const scaling = list(row, 'EffectScalingPoints')
  const text = template?.replace(/\$k([1-3])\b/gi, (token, slot: string) => {
    const index = Number(slot) - 1
    return points[index] === undefined || scaling[index] ? token : String(points[index])
  })
  return text && !/\$k\d/i.test(text) ? text : undefined
}

export function itemEnchant(catalog: ItemCatalog | undefined, id: number | undefined) {
  if (!id) return undefined
  const spellId = number(catalog?.tables.EnchantSpell?.[id], 'SpellID')
  return (
    enchantmentText(catalog?.tables.SpellItemEnchantment?.[id]) ??
    string(catalog?.tables.SpellName?.[spellId ?? 0], 'Name_lang') ??
    `附魔 #${id}`
  )
}

export function enchantDetails(catalog: ItemCatalog | undefined, id: number | undefined) {
  const effect = itemEnchant(catalog, id)
  if (!catalog || !id || !effect) return effect ? { name: effect, effect } : undefined
  const spellId = number(catalog.tables.EnchantSpell?.[id], 'SpellID')
  const name = string(catalog.tables.SpellName?.[spellId ?? 0], 'Name_lang') ?? effect
  const raw = string(catalog.tables.Spell?.[spellId ?? 0], 'Description_lang')
  const description = spellId ? (spell(catalog, spellId) ?? raw?.replace(/\|n/g, '\n')) : undefined
  return { name, effect, description, spellId }
}

export function itemSockets(catalog: ItemCatalog | undefined, item: InventoryItem) {
  const base = catalog?.tables.ItemSparse?.[item.id ?? 0]
  const sockets = list(base, 'SocketType').filter(Boolean)
  const gems = item.gemSlots ?? item.gems
  return Array.from({ length: Math.max(sockets.length, gems.length) }, (_, index) => {
    const gem = gems[index] || undefined
    // An occupied link slot beyond the base sockets follows prismatic rules.
    // Its socket source and any unoccupied extra slots are not in the link.
    const extra = Array.isArray(base?.SocketType) && index >= sockets.length && !!gem
    const type = extra ? 7 : sockets[index]
    const mask = catalog && gem ? number(gemProperty(catalog, gem), 'Type') : undefined
    const socketMask = socketMasks[type]
    const match = mask !== undefined && socketMask ? Boolean(mask & socketMask) : undefined
    return {
      index,
      type,
      gem,
      match,
      extra,
      label: extra ? '额外棱彩插槽' : (socketNames[type] ?? `插槽 ${index + 1}`),
    }
  }).filter(({ type, gem }) => type || gem)
}

export function gemDetails(
  catalog: ItemCatalog | undefined,
  id: number,
  equipped?: readonly InventoryItem[],
) {
  const base = catalog?.tables.ItemSparse?.[id]
  const property = catalog && gemProperty(catalog, id)
  const effect = catalog?.tables.SpellItemEnchantment?.[number(property, 'Enchant_ID') ?? 0]
  const conditionId = number(effect, 'Condition_ID')
  const condition = catalog?.tables.SpellItemEnchantmentCondition?.[conditionId ?? 0]
  const activation =
    catalog && condition ? gemRequirements(catalog, condition, equipped) : undefined
  return {
    name: string(base, 'Display_lang') ?? `宝石 #${id}`,
    quality: number(base, 'OverallQualityID'),
    level: number(base, 'ItemLevel'),
    description: string(base, 'Description_lang')?.replace(/\|n/g, '\n'),
    effect: enchantmentText(effect),
    icon: itemIcon(catalog, id),
    active: conditionId ? activation?.active : effect ? true : undefined,
    requirements: activation?.requirements ?? [],
  }
}

export function itemLines(
  catalog: ItemCatalog | undefined,
  item: InventoryItem,
  equipped?: readonly InventoryItem[],
): ItemLine[] {
  const lines: ItemLine[] = []
  const add = (text: string | undefined, tone?: ItemLine['tone']) => {
    if (text) lines.push({ text, tone })
  }
  const id = item.id ?? 0
  const base = catalog?.tables.ItemSparse?.[id]
  const detail = catalog?.tables.Item?.[id]
  const level = itemLevel(catalog, item)
  if (level) add(`物品等级 ${level}`, 'accent')
  add(bondTypes[number(base, 'Bonding') ?? 0])
  if (!catalog || !base) return lines

  const location = inventoryTypes[number(base, 'InventoryType') ?? 0]
  const kind = table(catalog, 'ItemSubClass').find(
    (row) => row.ClassID === detail?.ClassID && row.SubClassID === detail?.SubclassID,
  )
  if (location) add([location, string(kind, 'DisplayName_lang')].filter(Boolean).join(' · '))
  if (list(detail, 'Resistances')[0] > 0) add(`${list(detail, 'Resistances')[0]} 点护甲`)
  else if (list(base, 'Resistances')[0] > 0) add(`${list(base, 'Resistances')[0]} 点护甲`)
  const low = list(detail, 'MinDamage')[0] || list(base, 'MinDamage')[0]
  const high = list(detail, 'MaxDamage')[0] || list(base, 'MaxDamage')[0]
  const delay = number(base, 'ItemDelay') ?? 0
  if (low && high && delay > 0) {
    const speed = delay / 1000
    add(`${low}–${high} 伤害 · 速度 ${speed.toFixed(2)}`)
    add(`每秒伤害 ${((low + high) / 2 / speed).toFixed(1)}`)
  }
  const statIds = list(base, 'StatModifier_bonusStat')
  const amounts = list(base, 'StatModifier_bonusAmount')
  function stats(plain: boolean) {
    for (const [index, stat] of statIds.entries()) {
      if (stat <= 7 !== plain || !amounts[index] || !statNames[stat]) continue
      add(
        plain
          ? `+${amounts[index]} ${statNames[stat]}`
          : `装备：${statNames[stat]}提高 ${amounts[index]} 点`,
        plain ? undefined : 'effect',
      )
    }
  }
  stats(true)
  const enchants = catalog.tables.SpellItemEnchantment
  add(itemEnchant(catalog, item.enchant), 'effect')
  const sockets = itemSockets(catalog, item)
  for (const { gem, label } of sockets) {
    if (!gem) {
      add(label, 'muted')
      continue
    }
    const details = gemDetails(catalog, gem, equipped)
    const line: ItemLine = { text: details.effect ?? details.name, icon: details.icon }
    if (details.active === false) line.tone = 'muted'
    else if (details.quality !== undefined) line.quality = details.quality
    lines.push(line)
    lines.push(...details.requirements)
  }
  const bonus = enchantmentText(enchants?.[number(base, 'Socket_match_enchantment_ID') ?? 0])
  if (bonus) {
    const requiredSockets = sockets.filter(({ type, extra }) => type && !extra)
    const active =
      requiredSockets.length > 0 && requiredSockets.every(({ match }) => match === true)
    add(`镶孔奖励：${bonus}`, active ? 'effect' : 'muted')
  }
  const durability = number(base, 'MaxDurability') || number(detail, 'MaxDurability')
  if (durability) add(`耐久上限 ${durability}`)
  const classes = number(base, 'AllowableClass') ?? 0
  if (classes > 0) {
    const names = classNames.filter((_, index) => classes & (1 << index))
    if (names.length && names.length < classNames.length) add(`职业：${names.join('、')}`)
  }
  const required = number(base, 'RequiredLevel')
  if (required) add(`需要等级 ${required}`)
  stats(false)
  for (const effect of table(catalog, 'ItemEffect').filter((r) => r.ParentItemID === id)) {
    const text = spell(catalog, number(effect, 'SpellID') ?? 0)
    if (!text) continue
    const use = effect.TriggerType === 0 || effect.TriggerType === 5
    const cooldown = number(effect, 'CoolDownMSec') ?? 0
    add(
      `${use ? '使用' : '装备'}：${text}${use && cooldown > 0 ? `（冷却 ${cooldown / 1000} 秒）` : ''}`,
      'effect',
    )
  }
  const setId = number(base, 'ItemSet')
  const set = catalog.tables.ItemSet?.[setId ?? 0]
  const setName = string(set, 'Name_lang')
  if (setId && setName) {
    const pieces = list(set, 'ItemID').filter((piece) => piece > 0)
    const wearing = new Set(
      (equipped ?? [])
        .filter((part) => part.id && catalog.tables.ItemSparse?.[part.id]?.ItemSet === setId)
        .map((part) => part.id),
    )
    const counted = Math.min(wearing.size, pieces.length)
    add(equipped && pieces.length ? `${setName}（${counted}/${pieces.length}）` : setName, 'accent')
    for (const piece of pieces) {
      const entry = catalog.tables.Pieces?.[piece]
      const slot = number(entry, 'InventoryType')
      const worn = equipped?.find(
        (part) =>
          wearing.has(part.id) &&
          (part.id === piece ||
            (slot && catalog.tables.ItemSparse?.[part.id ?? 0]?.InventoryType === slot)),
      )
      add(worn?.name ?? string(entry, 'Display_lang'), worn ? 'accent' : 'muted')
    }
    const bonuses = table(catalog, 'ItemSetSpell')
      .filter((r) => r.ItemSetID === setId)
      .sort((a, b) => (number(a, 'Threshold') ?? 0) - (number(b, 'Threshold') ?? 0))
    for (const r of bonuses) {
      const threshold = number(r, 'Threshold')
      if (!threshold) continue
      const effect = spell(catalog, number(r, 'SpellID') ?? 0)
      add(
        `${threshold} 件套：${effect ?? '本地缺少效果说明'}`,
        effect && counted >= threshold && !r.ChrSpecID ? 'effect' : 'muted',
      )
    }
  }
  add(string(base, 'Description_lang')?.replace(/\|n/g, '\n'), 'accent')
  return lines
}
