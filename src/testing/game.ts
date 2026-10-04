import type { MemoryFileSystem } from '../core/memory-fs'
import { joinPath } from '../core/paths'

/** Install root of the fake game used by tests. */
export const TEST_ROOT = 'C:\\WoW'

const BUILD_INFO_HEADER = [
  'Branch!STRING:0',
  'Active!DEC:1',
  'Build Key!HEX:16',
  'CDN Key!HEX:16',
  'Install Key!HEX:16',
  'IM Size!DEC:4',
  'CDN Path!STRING:0',
  'CDN Hosts!STRING:0',
  'CDN Servers!STRING:0',
  'Tags!STRING:0',
  'Armadillo!STRING:0',
  'Last Activated!STRING:0',
  'Version!STRING:0',
  'KeyRing!HEX:16',
  'Product!STRING:0',
].join('|')

export interface TestClient {
  product: string
  version: string
  active?: boolean
}

/** A launcher `.build.info` listing the given clients. */
export function buildInfoText(clients: readonly TestClient[]): string {
  const rows = clients.map(({ product, version, active = true }) =>
    [
      'us',
      active ? '1' : '0',
      '0'.repeat(32),
      '0'.repeat(32),
      '',
      '',
      'tpr/wow',
      '',
      '',
      'Windows x86_64 US? enUS speech?:Windows x86_64 US? enUS text?',
      '',
      '',
      version,
      '',
      product,
    ].join('|'),
  )
  return [BUILD_INFO_HEADER, ...rows].join('\n')
}

export interface TestGameOptions {
  flavor?: string
  product?: string
  version?: string
}

/**
 * Create an installed flavor (with `.flavor.info`, `WTF/Account` and
 * `Interface/AddOns`) under TEST_ROOT and return its directory.
 */
export function createGame(
  fs: MemoryFileSystem,
  {
    flavor = '_classic_titan_',
    product = 'wow_classic_titan',
    version = '3.80.2.12345',
  }: TestGameOptions = {},
): string {
  const gameDir = joinPath(TEST_ROOT, flavor)
  fs.setFile(joinPath(TEST_ROOT, '.build.info'), buildInfoText([{ product, version }]))
  fs.setFile(joinPath(gameDir, '.flavor.info'), `Product Flavor!STRING:0\n${product}`)
  fs.makeDir(joinPath(gameDir, 'WTF', 'Account', 'SavedVariables'))
  fs.makeDir(joinPath(gameDir, 'Interface', 'AddOns'))
  return gameDir
}

export function savedVariablesPath(gameDir: string, account: string, file: string) {
  return joinPath(gameDir, 'WTF', 'Account', account, 'SavedVariables', file)
}
