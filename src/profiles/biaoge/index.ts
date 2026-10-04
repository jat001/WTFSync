import loaderTemplate from '../../../addons/BiaoGeAccounts/BiaoGeAccounts.lua?raw'
import tocTemplate from '../../../addons/BiaoGeAccounts/BiaoGeAccounts.toc?raw'
import { isValidAccountName } from '../../core/accounts'
import {
  asNumber,
  asString,
  asTable,
  fieldOf,
  keyValue,
  sourceText,
  valueOf,
  type LuaChunk,
  type LuaTable,
} from '../../core/lua/ast'
import { quoteLuaString } from '../../core/lua/string'
import {
  ProfileDataError,
  type AccountSource,
  type AddonProfile,
  type Character,
  type ExistingOutput,
} from '../../core/profile'
import { fillTemplate } from '../../core/template'
import { toCrlf } from '../../core/text'
import { parseTocFiles } from '../../core/toc'

/**
 * BiaoGe keeps every character overview in its account-wide SavedVariables.
 * The original BiaoGeUpdater tool copies selected top-level fields of each
 * account's `BiaoGe` table into a generated `BiaoGeAccounts` addon, whose
 * loader merges them so the role overview can list characters of all
 * accounts. This profile reproduces that output, using the loader and toc
 * in addons/BiaoGeAccounts as templates.
 */

const SOURCE_FILE = 'BiaoGe.lua'
const GLOBAL_NAME = 'BiaoGe'
const LOADER_FILE = 'BiaoGeAccounts.lua'
const TOC_FILE = 'BiaoGeAccounts.toc'
const ACCOUNT_FILE_EXT = '.lua'
const CRLF = '\r\n'

/** Field the loader adds itself; it is injected, not copied. */
const ACCOUNT_NAME_KEY = 'accountName'

/** Field whitelist from the loader template (`local tbl = { ... }`). */
export function parseLoaderKeys(loader: string): string[] {
  const match = /local\s+tbl\s*=\s*\{([^}]*)\}/.exec(loader)
  if (!match) throw new Error('loader template has no field whitelist')
  return [...(match[1] ?? '').matchAll(/"([^"]+)"/g)].map((m) => m[1] ?? '')
}

/**
 * Top-level fields of `BiaoGe` copied into each account file, in order.
 * Derived from the loader so the two can never drift apart.
 */
export const EXPORT_KEYS: readonly string[] = parseLoaderKeys(
  loaderTemplate,
).filter((key) => key !== ACCOUNT_NAME_KEY)

function accountFile(id: string): string {
  return id + ACCOUNT_FILE_EXT
}

/** Account ids whose files are listed in a BiaoGeAccounts toc. */
function listedAccounts(toc: string): string[] {
  return parseTocFiles(toc)
    .filter((name) => name !== LOADER_FILE && name.endsWith(ACCOUNT_FILE_EXT))
    .map((name) => name.slice(0, -ACCOUNT_FILE_EXT.length))
    .filter(isValidAccountName)
}

function biaoGeTable(source: AccountSource): { chunk: LuaChunk; root: LuaTable } {
  const chunk = source.files.get(SOURCE_FILE)?.chunk
  const root = asTable(chunk?.globals.get(GLOBAL_NAME))
  if (!chunk || !root) {
    throw new ProfileDataError(`${SOURCE_FILE} does not define ${GLOBAL_NAME}`)
  }
  return { chunk, root }
}

/**
 * Data file of one account: each exported field's original text wrapped in
 * `table.insert(_BiaoGeAccounts, { ... })`, with the account name injected
 * into `playerInfo`.
 */
export function renderAccountFile(
  account: string,
  chunk: LuaChunk,
  root: LuaTable,
): string {
  const blocks: string[] = []
  for (const key of EXPORT_KEYS) {
    const field = fieldOf(root, key)
    if (!field) continue
    let text: string
    if (key === 'playerInfo' && field.value.kind === 'table') {
      // Insert right before the table's closing brace.
      const brace = field.value.end - 1
      const entry = `[${quoteLuaString(ACCOUNT_NAME_KEY)}]=${quoteLuaString(account)},`
      text =
        sourceText(chunk, field.start, brace) +
        entry +
        sourceText(chunk, brace, field.end)
    } else {
      text = sourceText(chunk, field.start, field.end)
    }
    blocks.push(`table.insert(_BiaoGeAccounts, {${CRLF}    ${text}${CRLF}})`)
  }
  return `if not _BiaoGeAccounts then return end${CRLF}${blocks.join(CRLF)}`
}

/**
 * The template toc up to its loader line, followed by the account files,
 * with `{{INTERFACE}}` set to the installed client's interface version.
 */
export function renderToc(
  accountFiles: readonly string[],
  interfaceVersion: number,
): string {
  const toc = fillTemplate(tocTemplate, { INTERFACE: String(interfaceVersion) })
  const lines = toc.split(/\r\n|\r|\n/)
  const loaderLine = lines.findIndex((line) => line.trim() === LOADER_FILE)
  if (loaderLine < 0) throw new Error('toc template does not list the loader')
  return [...lines.slice(0, loaderLine + 1), '', ...accountFiles].join(CRLF)
}

function summarize(source: AccountSource): Character[] {
  const { root } = biaoGeTable(source)
  const playerInfo = asTable(valueOf(root, 'playerInfo'))
  const realmNames = asTable(valueOf(root, 'realmName'))
  const characters: Character[] = []
  for (const realmField of playerInfo?.fields ?? []) {
    const realmId = keyValue(realmField.key)
    if (typeof realmId !== 'number') continue
    const realm = asString(valueOf(realmNames, realmId)) ?? String(realmId)
    for (const playerField of asTable(realmField.value)?.fields ?? []) {
      const name = keyValue(playerField.key)
      if (typeof name !== 'string') continue
      const info = asTable(playerField.value)
      characters.push({
        realm,
        name,
        classFile: asString(valueOf(info, 'class')),
        level: asNumber(valueOf(info, 'level')),
        faction: asString(valueOf(info, 'faction')),
        itemLevel: asNumber(valueOf(info, 'iLevel')),
      })
    }
  }
  return characters
}

function syncedAccounts(existing: ExistingOutput): string[] {
  const toc = existing.files.get(TOC_FILE)
  return toc === undefined ? [] : listedAccounts(toc)
}

export const biaoge: AddonProfile<string> = {
  id: 'biaoge',
  name: 'BiaoGe 金团表格',
  requiredAddon: 'BiaoGe',
  sourceFiles: [SOURCE_FILE],
  outputDir: 'Interface/AddOns/BiaoGeAccounts',

  summarize,

  prepare(source) {
    const { chunk, root } = biaoGeTable(source)
    return renderAccountFile(source.id, chunk, root)
  },

  render({ accounts, failed, existing, client }) {
    const files = accounts.map(({ id, data }) => ({
      name: accountFile(id),
      text: data,
    }))
    // An account that failed this time keeps its previous file and entry.
    const kept = failed.filter((id) => existing.files.has(accountFile(id)))
    const listed = [...accounts.map(({ id }) => id), ...kept].sort()
    files.push(
      { name: LOADER_FILE, text: toCrlf(loaderTemplate) },
      {
        name: TOC_FILE,
        text: renderToc(listed.map(accountFile), client.interfaceVersion),
      },
    )

    // Only files the previous toc listed are ours to delete.
    const remove = syncedAccounts(existing)
      .filter((id) => !listed.includes(id))
      .map(accountFile)
    return { files, remove }
  },

  syncedAccounts,
}
