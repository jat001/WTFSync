import {
  AccountLoadError,
  isValidAccountName,
  loadAccountSourceWithRetry,
  toAccountFailure,
  type AccountFailure,
} from '../../core/accounts'
import { BoundedCache } from '../../core/bounded-cache'
import type { FileSystem } from '../../core/fs'
import { basename, joinPath, pathKey } from '../../core/paths'
import { savedVariablesDir } from '../../core/wow'
import { readInventory, syndicator, type InventoryAccount } from './inventory'

const sourceName = syndicator.sourceFiles[0]
const sourcePath = (dir: string, account: string) =>
  joinPath(savedVariablesDir(dir, account), sourceName)

interface SourceStamp {
  size: number
  modifiedAt: number
}

type AccountRecord = SourceStamp & {
  kind: 'account'
  characters: string[]
  guilds: string[]
  warband?: InventoryAccount['warband']
}
type CachedRecord =
  | AccountRecord
  | { kind: 'character'; value: InventoryAccount['characters'][number] }
  | { kind: 'guild'; value: InventoryAccount['guilds'][number] }

function sameSource(a: SourceStamp | undefined, b: { size: number; modifiedAt: number | null }) {
  return a !== undefined && a.modifiedAt === b.modifiedAt && a.size === b.size
}

export function createInventoryLoader(fs: FileSystem) {
  const cache = new BoundedCache<string, CachedRecord>(8_192, 32 * 1024 * 1024)
  const pending = new Map<string, SourceStamp & { snapshot: Promise<InventoryAccount> }>()

  function store(key: string, value: CachedRecord) {
    cache.set(key, value, 2 * (key.length + JSON.stringify(value).length))
  }

  function invalidate(path: string) {
    const key = pathKey(path)
    pending.delete(key)
    cache.delete(key)
    for (const record of cache.keys()) if (record.startsWith(key + '\0')) cache.delete(record)
  }

  function cachedAccount(key: string, account: string, info: SourceStamp) {
    const index = cache.get(key)
    if (index?.kind !== 'account' || !sameSource(index, info)) return undefined
    const characters: InventoryAccount['characters'] = []
    const guilds: InventoryAccount['guilds'] = []
    for (const id of index.characters) {
      const record = cache.get(id)
      if (record?.kind !== 'character') return undefined
      characters.push(record.value)
    }
    for (const id of index.guilds) {
      const record = cache.get(id)
      if (record?.kind !== 'guild') return undefined
      guilds.push(record.value)
    }
    return { account, modifiedAt: info.modifiedAt, characters, guilds, warband: index.warband }
  }

  async function readAccount(dir: string, account: string): Promise<InventoryAccount> {
    const source = await loadAccountSourceWithRetry(fs, dir, syndicator, account)
    const file = source.files.get(sourceName)!
    return {
      account,
      modifiedAt: file.modifiedAt,
      ...readInventory(file.chunk.globals.get('SYNDICATOR_DATA'), basename(dir)),
    }
  }

  async function loadAccount(dir: string, account: string) {
    if (!isValidAccountName(account)) {
      throw new AccountLoadError('invalid-name', `invalid account name: ${account}`)
    }
    const path = sourcePath(dir, account)
    const key = pathKey(path)
    const info = await fs.stat(path)
    if (!info?.isFile || info.modifiedAt === null) {
      invalidate(path)
      if (!info?.isFile) throw new AccountLoadError('missing-source', `${sourceName} not found`)
      return readAccount(dir, account)
    }
    const stamp = { size: info.size, modifiedAt: info.modifiedAt }
    const saved = cachedAccount(key, account, stamp)
    if (saved) return saved
    const active = pending.get(key)
    if (active && sameSource(active, stamp)) return active.snapshot

    invalidate(path)
    const entry = { ...stamp, snapshot: readAccount(dir, account) }
    pending.set(key, entry)
    try {
      const result = await entry.snapshot
      const current = await fs.stat(path).catch(() => null)
      // Retries can cross a save. Only cache results read under stable metadata.
      if (
        pending.get(key) === entry &&
        current?.isFile &&
        result.modifiedAt === stamp.modifiedAt &&
        sameSource(stamp, current)
      ) {
        const characters = result.characters.map((value) => {
          const id = key + '\0character:' + JSON.stringify([value.realm, value.name, value.key])
          store(id, { kind: 'character', value })
          return id
        })
        const guilds = result.guilds.map((value) => {
          const id = key + '\0guild:' + value.key
          store(id, { kind: 'guild', value })
          return id
        })
        store(key, { kind: 'account', ...stamp, characters, guilds, warband: result.warband })
      }
      return result
    } finally {
      if (pending.get(key) === entry) pending.delete(key)
    }
  }

  async function load(dir: string, ids: readonly string[]) {
    const accounts: InventoryAccount[] = []
    const failures: AccountFailure[] = []
    for (const account of ids) {
      try {
        accounts.push(await loadAccount(dir, account))
      } catch (error) {
        const failure = toAccountFailure(account, error)
        if (failure.reason !== 'missing-source') failures.push(failure)
      }
    }
    return { accounts, failures }
  }

  return {
    load,
    invalidate: (paths: Iterable<string>) => {
      for (const path of paths) invalidate(path)
    },
    invalidateAccounts: (dir: string, ids: readonly string[]) => {
      for (const id of ids) invalidate(sourcePath(dir, id))
    },
  }
}
