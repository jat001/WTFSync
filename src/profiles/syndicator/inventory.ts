import {
  asNumber,
  asString,
  asTable,
  tableEntries,
  valueOf,
  type LuaNode,
} from '../../core/lua/ast'
import { ProfileDataError } from '../../core/profile'
import { equipmentSlots } from '../../lib/equipment-slots'

export const syndicator = { sourceFiles: ['Syndicator.lua'] } as const
export type InventoryView = 'equipped' | 'bags' | 'bank' | 'guild' | 'warband'

export interface InventoryItem {
  id?: number
  name: string
  link?: string
  count?: number
  quality?: number
  bound?: boolean
  itemLevel?: number
  enchant?: number
  gems: number[]
  gemSlots?: number[]
}

export interface InventorySlot {
  index: number
  label: string
  recorded: boolean
  item?: InventoryItem
}

export interface Container {
  index: number
  name: string
  restricted: boolean
  slots: InventorySlot[]
}

interface CharacterInventory {
  key: string
  realm?: string
  name?: string
  label: string
  money?: number
  equipped: Container[]
  bags: Container[]
  bank: Container[]
}

interface BankInventory {
  money?: number
  tabs: Container[]
}

interface GuildInventory extends BankInventory {
  key: string
  label: string
  visited?: boolean
}

export interface InventoryAccount {
  account: string
  modifiedAt: number | null
  characters: CharacterInventory[]
  guilds: GuildInventory[]
  warband?: BankInventory
}

function flag(node: LuaNode | undefined, key: string) {
  const field = valueOf(node, key)
  return field?.kind === 'boolean' ? field.value : undefined
}

function money(owner: LuaNode): number | undefined {
  const amount = asNumber(valueOf(owner, 'money'))
  return amount !== undefined && Number.isSafeInteger(amount) && amount >= 0 ? amount : undefined
}

function numericEntries(node: LuaNode | undefined) {
  const entries: [number, LuaNode][] = []
  for (const [key, value] of tableEntries(node)) {
    if (typeof key === 'number' && Number.isSafeInteger(key) && key > 0 && value.kind === 'table') {
      entries.push([key, value])
    }
  }
  return entries.sort(([a], [b]) => a - b)
}

function readItem(node: LuaNode | undefined): InventoryItem | undefined {
  const link = asString(valueOf(node, 'itemLink'))
  const payload = link && /\|Hitem:([\d:-]+)/.exec(link)?.[1]
  const fields = payload ? payload.split(':') : []
  const id = asNumber(valueOf(node, 'itemID')) ?? (Number(fields[0]) || undefined)
  if (!link && !id) return undefined
  const name = link && /\|h\[([^\]]+)\]\|h/.exec(link)?.[1]
  const gemSlots = fields.slice(2, 6).map(Number)
  while (gemSlots.length && !gemSlots[gemSlots.length - 1]) gemSlots.pop()
  return {
    id,
    name: name?.replace(/\|A[^|]+\|a|\|T[^|]+\|t/g, '').trim() || (id ? `物品 #${id}` : '未知物品'),
    count: asNumber(valueOf(node, 'itemCount')),
    quality: asNumber(valueOf(node, 'quality')),
    bound: flag(node, 'isBound'),
    itemLevel: asNumber(valueOf(node, 'itemLevel')),
    link,
    enchant: Number(fields[1]) || undefined,
    gems: gemSlots.filter((gem) => gem > 0),
    gemSlots,
  }
}

function slots(node: LuaNode | undefined): InventorySlot[] {
  const entries = new Map(numericEntries(node))
  // A corrupt numeric key must not turn into an unbounded allocation.
  const last = Math.max(0, ...[...entries.keys()].filter((index) => index <= 512))
  return Array.from({ length: last }, (_, offset) => {
    const index = offset + 1
    return {
      index,
      label: `第 ${index} 格`,
      recorded: entries.has(index),
      item: readItem(entries.get(index)),
    }
  })
}

function equipment(node: LuaNode | undefined): Container[] {
  if (!numericEntries(node).length) return []
  return [
    {
      index: 1,
      name: '装备栏',
      restricted: false,
      slots: equipmentSlots.map((label, index) => {
        // Syndicator reserves stored index 1 for inventory slot 0 (ammo).
        const entry = asTable(valueOf(node, index + 2))
        return { index: index + 1, label, recorded: !!entry, item: readItem(entry) }
      }),
    },
  ]
}

function tabs(node: LuaNode | undefined): Container[] {
  return numericEntries(node).map(([index, tab]) => {
    const restricted = flag(tab, 'isViewable') === false
    return {
      index,
      name: asString(valueOf(tab, 'name')) || `分页 ${index}`,
      restricted,
      slots: restricted ? [] : slots(valueOf(tab, 'slots')),
    }
  })
}

function bags(character: LuaNode, area: 'bags' | 'bank', flavor: string): Container[] {
  if (area === 'bank') {
    const pages = tabs(valueOf(character, 'bankTabs'))
    if (pages.length) return pages
  }
  const info = valueOf(valueOf(character, 'containerInfo'), area)
  return numericEntries(valueOf(character, area)).map(([index, bag]) => {
    const isBank = area === 'bank'
    let name = isBank ? '银行主栏' : '背包'
    if (index > 1) {
      const modern = flavor === '_retail_' || flavor === '_forever_'
      name = isBank ? `银行包 ${index - 1}` : `背包 ${index - 1}`
      if (!isBank && index === 6) name = modern ? '材料包' : '钥匙环'
      if (!isBank && index === 7 && modern) name = '钥匙环'
      const bagName = readItem(valueOf(info, index - 1))?.name
      if (bagName) name += ` · ${bagName}`
    }
    return { index, name, restricted: false, slots: slots(bag) }
  })
}

function owners<T>(node: LuaNode | undefined, read: (key: string, owner: LuaNode) => T) {
  const result: T[] = []
  for (const [key, value] of tableEntries(node)) {
    if (typeof key === 'string' && asTable(value)) result.push(read(key, value))
  }
  return result
}

function label(key: string, owner: LuaNode, field: string) {
  const details = valueOf(owner, 'details')
  const name = asString(valueOf(details, field))
  const realm = asString(valueOf(details, 'realm'))
  return name && realm ? `${name} · ${realm}` : key
}

function readWarband(node: LuaNode | undefined): BankInventory | undefined {
  // Older Syndicator snapshots stored the sole warband directly under Warband.
  const bank = asTable(valueOf(node, 1)) ?? asTable(node)
  if (!bank) return undefined
  const pages = asTable(valueOf(bank, 'bank'))
  const amount = money(bank)
  if (!pages && amount === undefined) return undefined
  return { money: amount, tabs: tabs(pages) }
}

export function readInventory(
  root: LuaNode | undefined,
  flavor: string,
): Omit<InventoryAccount, 'account' | 'modifiedAt'> {
  if (!asTable(root)) throw new ProfileDataError('missing SYNDICATOR_DATA table')
  return {
    characters: owners(valueOf(root, 'Characters'), (key, character) => ({
      key,
      realm: asString(valueOf(valueOf(character, 'details'), 'realm')),
      name: asString(valueOf(valueOf(character, 'details'), 'character')),
      label: label(key, character, 'character'),
      money: money(character),
      equipped: equipment(valueOf(character, 'equipped')),
      bags: bags(character, 'bags', flavor),
      bank: bags(character, 'bank', flavor),
    })).sort((a, b) => a.label.localeCompare(b.label, 'zh-CN')),
    guilds: owners(valueOf(root, 'Guilds'), (key, guild) => ({
      key,
      label: label(key, guild, 'guild'),
      visited: flag(valueOf(guild, 'details'), 'visited'),
      money: money(guild),
      tabs: tabs(valueOf(guild, 'bank')),
    })).sort((a, b) => a.label.localeCompare(b.label, 'zh-CN')),
    warband: flavor === '_retail_' ? readWarband(valueOf(root, 'Warband')) : undefined,
  }
}
