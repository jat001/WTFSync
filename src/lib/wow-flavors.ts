import type { Flavor } from '../core/wow'

const flavorNames = new Map([
  ['_forever_', '无限'],
  ['_retail_', '至暗之夜'],
  ['_classic_titan_', '泰坦重铸'],
  ['_classic_', '熊猫人之谜'],
  ['_anniversary_', '燃烧的远征'],
  ['_classic_era_', '旧世经典'],
])
const flavorOrder = [...flavorNames.keys()]

export function gameVersionName(dir: string): string {
  return flavorNames.get(dir) ?? dir
}

function flavorRank(dir: string): number {
  const index = flavorOrder.indexOf(dir)
  return index < 0 ? flavorOrder.length : index
}

export function gameVersionItems(flavors: readonly Flavor[], includeVersion = false) {
  return [...flavors]
    .sort((a, b) => flavorRank(a.dir) - flavorRank(b.dir))
    .map(({ dir, version }) => {
      const name = gameVersionName(dir)
      return {
        label: includeVersion && version ? `${name}（${version}）` : name,
        value: dir,
      }
    })
}
