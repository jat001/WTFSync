import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// Compile test-only generators without importing them into the application.
const bundled = await build({
  configFile: false,
  root,
  logLevel: 'error',
  build: {
    lib: { entry: join(root, 'tests/helpers/biaoge.ts'), formats: ['es'] },
    write: false,
    minify: false,
  },
})
const outputs = Array.isArray(bundled) ? bundled : [bundled]
const entry = outputs.flatMap(result => result.output).find(output => output.type === 'chunk' && output.isEntry)
if (!entry) throw new Error('The sample generator did not produce an entry chunk.')
const { generateAccount } = await import(`data:text/javascript;base64,${Buffer.from(entry.code).toString('base64')}`)
const sampleRoot = join(root, 'artifacts/store-sample/WorldOfWarcraft')
const flavorDir = join(sampleRoot, '_classic_titan_')
async function put(relativePath, text) {
  const path = join(sampleRoot, relativePath)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, text, 'utf8')
}
await put('.build.info', 'Active!DEC:1|Version!STRING:0|Product!STRING:0\n1|3.80.2.12345|wow_classic_titan\n')
await put('_classic_titan_/.flavor.info', 'Product Flavor!STRING:0\nwow_classic_titan\n')
await put('_classic_titan_/Interface/AddOns/BiaoGe/BiaoGe.toc', '## Title: Synthetic test fixture; not a playable addon\n')
const accounts = [['100000001#1', 11], ['100000002#2', 12]]
for (const [id, seed] of accounts) {
  await put(`_classic_titan_/WTF/Account/${id}/SavedVariables/BiaoGe.lua`, generateAccount(id, seed).source)
}
await put('README.txt', [
  'WTFSync 离线审核示例',
  '',
  '所有账号、角色和物品数据均由测试生成器编造，不含真实用户存档。',
  '这是测试目录，不是游戏安装包；其中的 BiaoGe.toc 仅用于目录识别。',
  '不要将这个示例复制到真实游戏目录。',
  '',
  '1. 解压后，在 WTFSync 的设置 > 游戏中选择本 WorldOfWarcraft 目录。',
  '2. 回工作台，勾选两个示例账号，点击“立即同步”。',
  '3. 检查 _classic_titan_/Interface/AddOns/BiaoGeAccounts 中的输出。',
  '4. 再次同步应显示文件均为最新。',
  '5. 开启自动同步后，编辑其中一个示例存档的角色等级并保存，稍后检查输出。',
  '',
].join('\r\n'))
await put('README-en.txt', [
  'WTFSync offline review sample',
  '',
  'All account, character and item data are synthetic. No real user SavedVariables are included.',
  'This is not a game installation. The placeholder BiaoGe.toc only enables directory recognition.',
  '',
  '1. Extract this archive to a writable local folder.',
  '2. In WTFSync, open Settings (设置) > Game (游戏), then select the extracted WorldOfWarcraft folder.',
  '3. Return to Workbench (工作台), select both accounts, and click Sync now (立即同步).',
  '4. Verify the Lua files and TOC in _classic_titan_/Interface/AddOns/BiaoGeAccounts.',
  '5. Repeating sync without a data change should report that files are already current.',
  '6. With automatic sync enabled and the app open, change a character level in a synthetic BiaoGe.lua and save.',
  '7. Output should update shortly afterwards. Settings should persist after closing and reopening the app.',
  '',
  'Do not copy this fixture into a real game installation. Live game use requires World of Warcraft and BiaoGe.',
  'WTFSync does not require Battle.net login credentials.',
  '',
].join('\r\n'))
console.log(`Synthetic game directory: ${flavorDir}`)
