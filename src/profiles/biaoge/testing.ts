import { quoteLuaString } from '../../core/lua/string'
import {
  formatField,
  formatSavedVariables,
  table,
  type LuaKeyLiteral,
  type LuaValue,
} from '../../testing/lua-writer'
import { createRandom, type Random } from '../../testing/random'
import { EXPORT_KEYS } from '.'

/**
 * Generates BiaoGe.lua files with made-up accounts and characters, shaped
 * like real BiaoGe data and written the way WoW serializes it, plus the
 * account file BiaoGeUpdater produces for them.
 */

const REALM_IDS = [4533, 4534, 6379, 6380, 6382, 6384]
const CLASSES = ['WARRIOR', 'PALADIN', 'HUNTER', 'ROGUE', 'PRIEST', 'DEATHKNIGHT', 'SHAMAN', 'MAGE', 'WARLOCK', 'DRUID']
const SYLLABLES = ['晨', '夜', '霜', '星', '风', '影', '月', '岚', '雷', '焰', 'Ar', 'el', 'th', 'or', 'ia', 'yn']
const RAIDS = ['NAXXtitan', 'ULDtitan', 'TOCtitan', 'BWL', 'SSC']
/** Text exercising escapes and Lua punctuation inside strings. */
const TRICKY_TEXT = '备注 {重要}，含 "引号"、\\ 反斜杠、--、]] 和 | 竖线\n第二行'

export interface GeneratedCharacter {
  realmId: number
  realm: string
  name: string
  classFile: string
  level: number
  faction: string
  itemLevel: number
}

export interface GeneratedAccount {
  id: string
  /** Contents of BiaoGe.lua. */
  source: string
  characters: GeneratedCharacter[]
  /** Exported top-level fields by key, as written in `source`. */
  exported: Map<string, string>
}

function name(rng: Random): string {
  const parts = Array.from({ length: rng.int(2, 3) }, () => rng.pick(SYLLABLES))
  const text = parts.join('')
  return rng.chance(0.2) ? `${text}丶` : text
}

function itemLink(rng: Random): string {
  return `|cffa335ee|Hitem:${rng.int(10000, 99999)}:${rng.int(0, 4000)}::::::::80:::::|h[${name(rng)}之刃]|h|r`
}

function perCharacter(
  realms: number[],
  characters: GeneratedCharacter[],
  value: (character: GeneratedCharacter) => LuaValue,
) {
  return table(
    realms.map((realmId) => [
      realmId,
      table(
        characters
          .filter((c) => c.realmId === realmId)
          .map((c): [LuaKeyLiteral, LuaValue] => [c.name, value(c)]),
      ),
    ]),
  )
}

/** A generated account; the same seed always gives the same data. */
export function generateAccount(id: string, seed: number): GeneratedAccount {
  const rng = createRandom(seed)
  const realms = rng.shuffle(REALM_IDS).slice(0, rng.int(1, 2))
  const realmNames = new Map(realms.map((realmId) => [realmId, `${name(rng)}之谷`]))

  const characters: GeneratedCharacter[] = []
  for (const realmId of realms) {
    const count = rng.int(1, 4)
    const names = new Set<string>()
    while (names.size < count) names.add(name(rng))
    for (const characterName of names) {
      characters.push({
        realmId,
        realm: realmNames.get(realmId) ?? '',
        name: characterName,
        classFile: rng.pick(CLASSES),
        level: rng.chance(0.7) ? 80 : rng.int(1, 79),
        faction: rng.pick(['Alliance', 'Horde']),
        // Multiples of 1/8 print exactly in both JS and Lua.
        itemLevel: rng.int(1600, 1900) / 8,
      })
    }
  }
  // BiaoGe also keeps empty tables for realms without characters.
  const allRealms = [...realms, rng.pick(REALM_IDS.filter((r) => !realms.includes(r)))]

  const exported: [string, LuaValue][] = [
    [
      'playerInfo',
      perCharacter(allRealms, characters, (c) =>
        table([
          ['faction', c.faction],
          ['talent', rng.int(1, 3)],
          ['class', c.classFile],
          ['level', c.level],
          ['iLevel', c.itemLevel],
          ['raceID', rng.int(1, 11)],
        ]),
      ),
    ],
    ['realmName', table(realms.map((realmId) => [realmId, realmNames.get(realmId) ?? '']))],
    [
      'MONEY',
      perCharacter(allRealms, characters, (c) =>
        table([
          ['money', rng.int(0, 5_000_000)],
          ['colorplayer', `|cffc41f3b${c.name}|r`],
          ['player', c.name],
        ]),
      ),
    ],
    [
      'equip',
      perCharacter(allRealms, characters, () =>
        table([
          ['1', table([['link', itemLink(rng)]])],
          ['5', table([['link', itemLink(rng)], ['count', 1]])],
        ]),
      ),
    ],
    [
      'bag',
      // Array part with a nil hole, like an empty bag slot.
      perCharacter(allRealms, characters, () =>
        table([], [itemLink(rng), null, itemLink(rng)]),
      ),
    ],
    [
      'History',
      table(
        RAIDS.map((raid) => [
          raid,
          rng.chance(0.4)
            ? table([
                [
                  String(1_780_000_000 + rng.int(0, 9_999_999)),
                  table([
                    ['boss1', table([['zhuangbei1', itemLink(rng)], ['maijia1', name(rng)], ['jine1', '1500']])],
                  ]),
                ],
              ])
            : table(),
        ]),
      ),
    ],
    [
      'HistoryList',
      table(
        RAIDS.map((raid) => [
          raid,
          table([], rng.chance(0.4) ? [table([], [1_780_000_000 + rng.int(0, 99_999), '团本记录'])] : []),
        ]),
      ),
    ],
    [
      'QuestCD',
      perCharacter(allRealms, characters, () =>
        table([
          ['fish', table([['notFinish', true]])],
          ['dayQuestCount', table([['count', rng.int(0, 5)], ['resettime', -rng.int(1, 3600)]])],
        ]),
      ),
    ],
    [
      'roleOverviewNote',
      table(realms.map((realmId) => [realmId, table(rng.chance(0.5) ? [[name(rng), TRICKY_TEXT]] : [])])),
    ],
  ]
  // Optional fields, present in some accounts only.
  for (const key of ['tradeSkillCooldown', 'RaidCD', 'worldBossCD', 'buffCD', 'legendaryCloak']) {
    if (rng.chance(0.5)) exported.push([key, perCharacter(allRealms, characters, () => table())])
  }

  const others: [string, LuaValue][] = [
    ['welcome', table([['body', `{C}，${TRICKY_TEXT}`], ['choose', 0]], [table([['text', 'YY：']])])],
    ['options', table([['autoTrade', 1], ['ratio', 0.5]])],
    ['lastGuoQiTime', 1_780_000_000],
    ['FB', 'NAXXtitan'],
  ]

  const fields = rng.shuffle([...exported, ...others])
  return {
    id,
    source: formatSavedVariables([['BiaoGe', table(fields)]]),
    characters,
    exported: new Map(exported.map(([key, value]) => [key, formatField(key, value)])),
  }
}

/** The account file BiaoGeUpdater writes for a generated account. */
export function expectedAccountFile(account: GeneratedAccount): string {
  const blocks: string[] = []
  for (const key of EXPORT_KEYS) {
    let text = account.exported.get(key)
    if (text === undefined) continue
    if (key === 'playerInfo') {
      // The account name goes right before the table's closing brace.
      text = `${text.slice(0, -2)}["accountName"]=${quoteLuaString(account.id)},},`
    }
    blocks.push(`table.insert(_BiaoGeAccounts, {\r\n    ${text}\r\n})`)
  }
  return `if not _BiaoGeAccounts then return end\r\n${blocks.join('\r\n')}`
}
