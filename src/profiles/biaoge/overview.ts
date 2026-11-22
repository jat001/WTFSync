import {
  asNumber,
  asString,
  asTable,
  tableEntries,
  valueOf,
  type LuaKeyValue,
  type LuaNode,
  type LuaTable,
} from '../../core/lua/ast'
import type { Character } from '../../core/profile'
import {
  currencyNames,
  difficultyNames,
  equipmentSlots,
  professionNames,
  raidNames,
  standings,
  taskNames,
  titanWorldBossNames,
  worldBossNames,
} from './overview-names'

interface CharacterSummary extends Character {
  realmId: number
}

interface RaidBoss {
  name: string
  killed: boolean
}

export interface RaidLock {
  key: string
  name: string
  difficulty?: string
  players?: number
  resetAt?: number
  progress?: string
  bosses: RaidBoss[]
}

interface Currency {
  id: number
  name: string
  count: number
  weekly?: string
  total?: string
}

interface Equipment {
  slot: number
  part: string
  name: string
  level?: number
  quality?: number
  storage?: { bags?: number; bank?: number; mail?: number }
}

interface Quest {
  key: string
  name: string
  resetAt?: number
  count?: number
  unfinished: boolean
}

interface ProfessionCooldown {
  key: string
  name: string
  resetAt?: number
  ready: boolean
}

interface Reputation {
  id: number
  name: string
  standing?: string
  progress?: string
}

export interface OverviewCharacter extends CharacterSummary {
  account: string
  gold?: number
  note?: string
  restedXp?: number
  /** Undefined if there is no saved raid status. A saved empty list stays empty. */
  raids?: RaidLock[]
  currencies: Currency[]
  equipment: Equipment[]
  quests: Quest[]
  professions: ProfessionCooldown[]
  reputation: Reputation[]
}

function numberField(node: LuaNode | undefined, key: LuaKeyValue): number | undefined {
  const value = asNumber(valueOf(node, key))
  return value !== undefined && Number.isFinite(value) ? value : undefined
}

function textField(node: LuaNode | undefined, key: LuaKeyValue): string | undefined {
  return asString(valueOf(node, key))
}

function flag(node: LuaNode | undefined, key: LuaKeyValue): boolean {
  const field = valueOf(node, key)
  return field?.kind === 'boolean' && field.value
}

function resetTime(node: LuaNode | undefined): number | undefined {
  const end = numberField(node, 'endtime')
  return end !== undefined && end > 0 ? end * 1000 : undefined
}

function stripGameMarkup(text: string): string {
  return text.replace(/\|c[0-9a-f]{8}|\|r/gi, '').replace(/\|H[^|]*\|h([^|]*)\|h/g, '$1')
}

function range(current: number | undefined, max: number | undefined): string | undefined {
  return current !== undefined && max !== undefined && max > 0
    ? `${current.toLocaleString('zh-CN')} / ${max.toLocaleString('zh-CN')}`
    : undefined
}

function characterData(
  root: LuaTable,
  section: string,
  { realmId, name }: Pick<CharacterSummary, 'realmId' | 'name'>,
) {
  return valueOf(valueOf(valueOf(root, section), realmId), name)
}

export function readCharacterSummaries(root: LuaTable): CharacterSummary[] {
  const realmNames = valueOf(root, 'realmName')
  const characters: CharacterSummary[] = []
  for (const [realmId, players] of tableEntries(valueOf(root, 'playerInfo'))) {
    if (typeof realmId !== 'number') continue
    const realm = textField(realmNames, realmId) ?? String(realmId)
    for (const [name, info] of tableEntries(players)) {
      if (typeof name !== 'string' || !asTable(info)) continue
      characters.push({
        realm,
        realmId,
        name,
        classFile: textField(info, 'class'),
        level: numberField(info, 'level'),
        faction: textField(info, 'faction'),
        itemLevel: numberField(info, 'iLevel') ??
          asNumber(characterData(root, 'PlayerItemsLevel', { realmId, name })),
      })
    }
  }
  return characters
}

function readRaids(instances: LuaNode | undefined, worldBosses: LuaNode | undefined): RaidLock[] | undefined {
  if (!asTable(instances) && !asTable(worldBosses)) return undefined
  const raids: RaidLock[] = []
  for (const [index, entry] of tableEntries(instances)) {
    const id = numberField(entry, 'fbId')
    if (id === undefined) continue
    const isWorldBoss = flag(entry, 'isWorldBoss')
    const difficulty = numberField(entry, 'diff')
    const bosses: RaidBoss[] = []
    for (const boss of tableEntries(valueOf(entry, 'killInfo')).values()) {
      const name = textField(boss, 'name')
      if (name) bosses.push({ name, killed: flag(boss, 'isKilled') })
    }
    raids.push({
      key: `raid:${index}`,
      name: (isWorldBoss ? titanWorldBossNames : raidNames).get(id) ??
        textField(entry, 'name') ?? (isWorldBoss ? '其他世界首领' : '其他副本'),
      difficulty: difficultyNames.get(difficulty ?? 0),
      players: numberField(entry, 'num'),
      resetAt: resetTime(entry),
      progress: range(numberField(entry, 'killNum'), numberField(entry, 'bossSum')),
      bosses,
    })
  }
  for (const [key, entry] of tableEntries(worldBosses)) {
    if (typeof key !== 'string' || !asTable(entry)) continue
    raids.push({
      key: `world:${key}`,
      name: worldBossNames.get(key) ?? '其他世界首领',
      resetAt: resetTime(entry),
      bosses: [],
    })
  }
  return raids
}

function readCurrencies(money: LuaNode | undefined): Currency[] {
  const currencies: Currency[] = []
  for (const [id, currency] of tableEntries(money)) {
    if (typeof id !== 'number' || flag(currency, 'isNotKnow')) continue
    const count = numberField(currency, 'count')
    if (count === undefined) continue
    currencies.push({
      id,
      name: textField(currency, 'name') || currencyNames.get(id) ||
        (flag(currency, 'isItem') ? '其他代币' : '其他货币'),
      count,
      weekly: range(numberField(currency, 'weekCount'), numberField(currency, 'weekMax')),
      total: range(numberField(currency, 'totalCount'), numberField(currency, 'totalMax')),
    })
  }
  return currencies.sort((a, b) => a.id - b.id)
}

function readEquipment(gear: LuaNode | undefined, bag: LuaNode | undefined): Equipment[] {
  const equipment: Equipment[] = []
  for (const [key, entry] of tableEntries(gear)) {
    const slot = typeof key === 'boolean' ? 0 : Number(key)
    const part = equipmentSlots[slot - 1]
    const link = textField(entry, 'link')
    const name = link && /\|Hitem:[^|]*\|h\[([^\]]+)\]\|h/.exec(link)?.[1]
    if (!part || !name) continue
    const itemId = numberField(entry, 'itemID') ?? Number(/\|Hitem:(\d+)/.exec(link)?.[1])
    const carried = numberField(valueOf(bag, 'bag'), itemId)
    const keyring = numberField(valueOf(bag, 'bagKey'), itemId)
    const bank = numberField(valueOf(bag, 'bank'), itemId)
    const mail = numberField(valueOf(bag, 'mail'), itemId)
    const bags = carried !== undefined || keyring !== undefined ? (carried ?? 0) + (keyring ?? 0) : undefined
    equipment.push({
      slot,
      part,
      name,
      level: numberField(entry, 'level'),
      quality: numberField(entry, 'quality'),
      storage: bags !== undefined || bank !== undefined || mail !== undefined
        ? { bags, bank, mail }
        : undefined,
    })
  }
  return equipment.sort((a, b) => a.slot - b.slot)
}

function readReputation(bag: LuaNode | undefined): Reputation[] {
  const reputation: Reputation[] = []
  for (const [id, entry] of tableEntries(valueOf(bag, 'faction'))) {
    const name = textField(entry, 'name')
    if (typeof id !== 'number' || !name) continue
    reputation.push({
      id,
      name,
      standing: standings[(numberField(entry, 'standingID') ?? 0) - 1],
      progress: range(numberField(entry, 'currentValue'), numberField(entry, 'maxValue')),
    })
  }
  return reputation.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
}

function readQuests(data: LuaNode | undefined): Quest[] {
  const quests: Quest[] = []
  for (const [key, entry] of tableEntries(data)) {
    if (typeof key !== 'string' || !asTable(entry)) continue
    quests.push({
      key,
      name: taskNames.get(key) ?? '其他任务',
      resetAt: resetTime(entry),
      count: numberField(entry, 'count'),
      unfinished: flag(entry, 'notFinish'),
    })
  }
  return quests
}

function readProfessions(data: LuaNode | undefined): ProfessionCooldown[] {
  const professions: ProfessionCooldown[] = []
  for (const [key, entry] of tableEntries(data)) {
    if (typeof key !== 'string' || !asTable(entry)) continue
    const resetAt = resetTime(entry)
    const ready = flag(entry, 'ready')
    if (!ready && resetAt === undefined) continue
    professions.push({ key, name: professionNames.get(key) ?? '其他专业冷却', resetAt, ready })
  }
  return professions
}

export function readOverview(root: LuaTable, account: string): OverviewCharacter[] {
  return readCharacterSummaries(root).map((character) => {
    const data = (section: string) => characterData(root, section, character)
    const money = asTable(data('MONEY')) ?? asTable(data('Money'))
    const raids = asTable(data('RaidCD')) ?? asTable(data('FBCD'))
    const bag = data('bag')
    const note = asString(data('roleOverviewNote'))
    const xp = valueOf(valueOf(money, 'xp'), 'perNow')
    const restedXp = asNumber(xp) ?? Number(asString(xp))
    return {
      ...character,
      account,
      // RoleOverview writes floor(GetMoney() / 10000), already in whole gold.
      gold: numberField(money, 'money'),
      note: note ? stripGameMarkup(note).trim() : undefined,
      restedXp: Number.isFinite(restedXp) ? restedXp : undefined,
      raids: readRaids(raids, data('worldBossCD')),
      currencies: readCurrencies(money),
      equipment: readEquipment(data('equip'), bag),
      quests: readQuests(data('QuestCD')),
      professions: readProfessions(data('tradeSkillCooldown')),
      reputation: readReputation(bag),
    }
  })
}

export function activeRaidLocks(character: OverviewCharacter, now: number): RaidLock[] {
  return character.raids?.filter(({ resetAt }) => resetAt === undefined || resetAt > now) ?? []
}
