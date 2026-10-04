import { isDirectory, isFile, readText, type FileSystem } from './fs'
import { basename, dirname, joinPath } from './paths'

const FLAVOR_INFO = '.flavor.info'
const BUILD_INFO = '.build.info'
/** Account-wide data shared by all accounts; not an account itself. */
const SHARED_SAVED_VARIABLES = 'savedvariables'
/** Flavor directories look like `_retail_` or `_classic_titan_`. */
const FLAVOR_DIR = /^_.+_$/

export interface Flavor {
  /** Directory name, e.g. `_classic_titan_`. */
  dir: string
  path: string
  /** Product flavor from `.flavor.info`, e.g. `wow_classic_titan`. */
  id: string | null
  /** Installed client version, e.g. `3.80.2.69874`. */
  version: string | null
}

export interface ClientInfo {
  /** Installed client version, when known, e.g. `3.80.2.69874`. */
  version: string | null
  /** Interface number a toc declares for this client, e.g. `38002`. */
  interfaceVersion: number
}

export function accountDir(gameDir: string, account: string): string {
  return joinPath(gameDir, 'WTF', 'Account', account)
}

export function savedVariablesDir(gameDir: string, account: string): string {
  return joinPath(accountDir(gameDir, account), 'SavedVariables')
}

export function addonDir(gameDir: string, addon: string): string {
  return joinPath(gameDir, 'Interface', 'AddOns', addon)
}

/** Whether `path` is a game directory of one flavor (has WTF and Interface). */
export async function isFlavorDir(fs: FileSystem, path: string) {
  if (await isFile(fs, joinPath(path, FLAVOR_INFO))) return true
  return (
    (await isDirectory(fs, joinPath(path, 'WTF'))) &&
    (await isDirectory(fs, joinPath(path, 'Interface')))
  )
}

/** Product flavor id: the last line of `.flavor.info`. */
export async function readFlavorId(fs: FileSystem, path: string) {
  try {
    const text = await readText(fs, joinPath(path, FLAVOR_INFO))
    const lines = text.split(/\r?\n/).map((line) => line.trim())
    return lines.filter(Boolean).pop() ?? null
  } catch {
    return null
  }
}

/** `3.80.2.69874` → 38002, i.e. major * 10000 + minor * 100 + patch. */
export function interfaceFromVersion(version: string): number | null {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version)
  if (!match) return null
  const [major, minor, patch] = match.slice(1).map(Number)
  return (major ?? 0) * 10000 + (minor ?? 0) * 100 + (patch ?? 0)
}

/**
 * Installed client versions by product, from the launcher's `.build.info`
 * at the install root: a `|`-separated table whose header row names the
 * columns (`Name!TYPE:size`).
 */
export async function readBuildInfo(
  fs: FileSystem,
  root: string,
): Promise<Map<string, string>> {
  const versions = new Map<string, string>()
  let text: string
  try {
    text = await readText(fs, joinPath(root, BUILD_INFO))
  } catch {
    return versions
  }
  const [header = '', ...rows] = text.split(/\r?\n/).filter(Boolean)
  const columns = header.split('|').map((column) => column.split('!')[0])
  const product = columns.indexOf('Product')
  const version = columns.indexOf('Version')
  const active = columns.indexOf('Active')
  if (product < 0 || version < 0) return versions
  for (const row of rows) {
    const cells = row.split('|')
    const id = cells[product]
    const value = cells[version]
    if (!id || !value) continue
    // Prefer the active entry when a product is listed more than once.
    if (!versions.has(id) || cells[active] === '1') versions.set(id, value)
  }
  return versions
}

/** Interface number recorded by the last game run, from WTF/Config.wtf. */
async function readLastAddonVersion(fs: FileSystem, gameDir: string) {
  try {
    const config = await readText(fs, joinPath(gameDir, 'WTF', 'Config.wtf'))
    const match = /^SET lastAddonVersion "(\d+)"/m.exec(config)
    return match ? Number(match[1]) : null
  } catch {
    return null
  }
}

/**
 * Version of the client installed in a flavor directory. `.build.info` is
 * updated by the launcher as soon as the client is patched, so it wins over
 * Config.wtf, which only changes after the game has been run.
 */
export async function readClientInfo(
  fs: FileSystem,
  gameDir: string,
): Promise<ClientInfo | null> {
  const product = await readFlavorId(fs, gameDir)
  if (product) {
    const version = (await readBuildInfo(fs, dirname(gameDir))).get(product)
    const interfaceVersion = version ? interfaceFromVersion(version) : null
    if (version && interfaceVersion !== null) {
      return { version, interfaceVersion }
    }
  }
  const interfaceVersion = await readLastAddonVersion(fs, gameDir)
  return interfaceVersion === null ? null : { version: null, interfaceVersion }
}

/** Flavor directories under a WoW install root, sorted by name. */
export async function listFlavors(
  fs: FileSystem,
  root: string,
): Promise<Flavor[]> {
  if (!(await isDirectory(fs, root))) return []
  const builds = await readBuildInfo(fs, root)
  const flavors: Flavor[] = []
  for (const entry of await fs.readDir(root)) {
    if (!entry.isDirectory || !FLAVOR_DIR.test(entry.name)) continue
    const path = joinPath(root, entry.name)
    if (!(await isFlavorDir(fs, path))) continue
    const id = await readFlavorId(fs, path)
    flavors.push({
      dir: entry.name,
      path,
      id,
      version: (id && builds.get(id)) ?? null,
    })
  }
  return flavors.sort((a, b) => a.dir.localeCompare(b.dir))
}

/**
 * Interpret a directory picked by the user, which may be either the WoW
 * install root or one flavor directory inside it.
 */
export async function resolveGameDir(
  fs: FileSystem,
  path: string,
): Promise<{ root: string; flavor: string | null }> {
  const trimmed = path.replace(/[\\/]+$/, '')
  const name = basename(trimmed)
  if (FLAVOR_DIR.test(name) && (await isFlavorDir(fs, trimmed))) {
    return { root: dirname(trimmed), flavor: name }
  }
  return { root: trimmed, flavor: null }
}

/** Account directory names under WTF/Account, sorted. */
export async function listAccounts(
  fs: FileSystem,
  gameDir: string,
): Promise<string[]> {
  const dir = joinPath(gameDir, 'WTF', 'Account')
  if (!(await isDirectory(fs, dir))) return []
  return (await fs.readDir(dir))
    .filter(
      (entry) =>
        entry.isDirectory &&
        entry.name.toLowerCase() !== SHARED_SAVED_VARIABLES,
    )
    .map((entry) => entry.name)
    .sort()
}
