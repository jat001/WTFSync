import { loadAccountSource } from '../../core/accounts'
import { writeFileAtomic, type FileSystem } from '../../core/fs'
import {
  asString,
  asTable,
  keyValue,
  valueOf,
  type LuaField,
  type LuaTable,
  type Span,
} from '../../core/lua/ast'
import { parseSavedVariables } from '../../core/lua/parser'
import { joinPath, pathKey } from '../../core/paths'
import { bytesEqual, encodeUtf8 } from '../../core/text'
import { savedVariablesDir } from '../../core/wow'
import { biaoge, readBiaoGeSave } from './index'
import type { OverviewCharacter } from './overview'

// BGLite's BG.DeletePlayerData list, with account-wide settings and history excluded.
const characterSections = new Set([
  'Hope',
  'FilterClassItemDB',
  'filterClassNum',
  'MeetingHorn',
  'MeetingHornWhisper',
  'FBCD',
  'RaidCD',
  'QuestCD',
  'Money',
  'MONEY',
  'tradeSkillCooldown',
  'PlayerItemsLevel',
  'playerInfo',
  'equip',
  'bag',
  'worldBossCD',
  'roleOverviewNote',
  'buffCD',
  'legendaryCloak',
  'RoleOverviewSort',
])

interface Edit extends Span {
  replacement?: Uint8Array
}

type CharacterIdentity = Pick<OverviewCharacter, 'account' | 'realmId' | 'name'>

function collectRealmEdits(table: LuaTable, name: string, isSortTable: boolean): Edit[] {
  const removed = new Set<LuaField>()
  const sortEntries = new Map<number, LuaField>()
  const shadowed: LuaField[] = []
  let removedSortEntry = false

  for (const field of table.fields) {
    const key = keyValue(field.key)
    if (key === name) removed.add(field)
    if (!isSortTable || typeof key !== 'number' || !Number.isSafeInteger(key) || key < 1) continue
    const previous = sortEntries.get(key)
    if (previous) shadowed.push(previous)
    if (asString(valueOf(field.value, 'player')) === name) {
      removed.add(field)
      removedSortEntry = true
    }
    sortEntries.set(key, field)
  }

  if (removedSortEntry) shadowed.forEach((field) => removed.add(field))
  const edits: Edit[] = []
  table.fields.forEach((field, index) => {
    if (removed.has(field)) {
      // Include the separator and any comments before the next field.
      edits.push({ start: field.start, end: table.fields[index + 1]?.start ?? table.end - 1 })
    }
  })
  if (removedSortEntry && table.fields.some(({ key }) => key.kind === 'number')) {
    const remaining = [...sortEntries]
      .sort(([a], [b]) => a - b)
      .filter(([, field]) => !removed.has(field))
    // Explicit numeric keys must stay contiguous for the addon's ipairs traversal.
    remaining.forEach(([, field], index) => {
      edits.push({
        start: field.start,
        end: field.value.start,
        replacement: encodeUtf8(`[${index + 1}] = `),
      })
    })
  }
  return edits
}

function removeRecords(
  bytes: Uint8Array,
  root: LuaTable,
  realmId: number,
  name: string,
): Uint8Array {
  const edits: Edit[] = []
  for (const section of root.fields) {
    const key = keyValue(section.key)
    if (typeof key !== 'string' || !characterSections.has(key)) continue
    for (const realm of asTable(section.value)?.fields ?? []) {
      if (keyValue(realm.key) !== realmId || realm.value.kind !== 'table') continue
      edits.push(...collectRealmEdits(realm.value, name, key === 'RoleOverviewSort'))
    }
  }

  edits.sort((a, b) => a.start - b.start)
  const length = edits.reduce(
    (size, edit) => size - (edit.end - edit.start) + (edit.replacement?.length ?? 0),
    bytes.length,
  )
  const result = new Uint8Array(length)
  let source = 0
  let destination = 0
  for (const { start, end, replacement } of edits) {
    result.set(bytes.subarray(source, start), destination)
    destination += start - source
    if (replacement) {
      result.set(replacement, destination)
      destination += replacement.length
    }
    source = end
  }
  result.set(bytes.subarray(source), destination)
  return result
}

const activeEdits = new Set<string>()

export class BiaoGeSaveChangedError extends Error {
  constructor() {
    super('BGLite.lua changed during character deletion')
  }
}

/** Return the local backup path, or undefined if the character is already gone. */
export async function deleteBiaoGeCharacter(
  fs: FileSystem,
  gameDir: string,
  { account, realmId, name }: CharacterIdentity,
): Promise<string | undefined> {
  const path = joinPath(savedVariablesDir(gameDir, account), biaoge.sourceFiles[0])
  const key = pathKey(path)
  if (activeEdits.has(key)) throw new BiaoGeSaveChangedError()
  activeEdits.add(key)
  try {
    const source = await loadAccountSource(fs, gameDir, biaoge, account)
    const {
      chunk: { bytes },
      root,
    } = readBiaoGeSave(source)
    const player = valueOf(valueOf(valueOf(root, 'playerInfo'), realmId), name)
    if (!asTable(player)) return undefined

    const updated = removeRecords(bytes, root, realmId, name)
    parseSavedVariables(updated)

    const backupBase = `${path}.wtfsync-backup-${Date.now()}`
    let backup = backupBase
    for (let suffix = 1; await fs.stat(backup); suffix++) backup = `${backupBase}-${suffix}`
    await writeFileAtomic(fs, backup, bytes)
    try {
      await writeFileAtomic(fs, path, updated, {
        async beforeReplace() {
          if (!bytesEqual(bytes, await fs.readFile(path))) throw new BiaoGeSaveChangedError()
        },
      })
    } catch (error) {
      await fs.remove(backup).catch(() => {})
      throw error
    }
    return backup
  } finally {
    activeEdits.delete(key)
  }
}
