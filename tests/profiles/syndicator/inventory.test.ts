import { describe, expect, it, vi } from 'vitest'
import { parseSavedVariables } from '../../../src/core/lua/parser'
import { formatCopper } from '../../../src/lib/gold'
import { readInventory } from '../../../src/profiles/syndicator/inventory'
import { createInventoryLoader } from '../../../src/profiles/syndicator/load'
import { MemoryFileSystem } from '../../helpers/memory-fs'

const ring =
  '{itemID=30,itemLink="|cffa335ee|Hitem:30:14:15:::::77|h[月石指环]|h|r",itemCount=1,quality=4,isBound=false}'
function snapshot(character: string) {
  return `SYNDICATOR_DATA={Characters={["${character}"]={
    details={character="${character}",realm="示例服"},
    money=12345678,
    equipped={[12]=${ring},[13]={}},
    bags={{ {}, ${ring}, {} },[6]={{itemID=50,itemCount=3}}},
    bank={{ {}, {}, ${ring} }}
  }},Guilds={["测试公会"]={details={visited=true},money=0,bank={
    {name="材料",isViewable=true,slots={{},${ring},{}}},
    {name="官员",isViewable=false,slots={${ring}}}
  }}}}`
}
describe('Syndicator inventory', () => {
  it('preserves source offsets, empty positions, quantities and instance fields', () => {
    const root = parseSavedVariables(snapshot('样本')).globals.get('SYNDICATOR_DATA')
    const {
      characters: [c],
      guilds: [g],
    } = readInventory(root, '_classic_titan_')
    expect(c.label).toBe('样本 · 示例服')
    expect(formatCopper(c.money)).toBe('1,234 金 56 银 78 铜')
    expect(formatCopper(g.money)).toBe('0 金')
    expect(c.equipped[0].slots.find((slot) => slot.index === 11)).toMatchObject({
      label: '戒指一',
      item: { name: '月石指环', enchant: 14, gems: [15], bound: false },
    })
    expect(c.equipped[0].slots[11]).toMatchObject({ recorded: true, item: undefined })
    expect(c.bags[0].slots.map((x) => x.item?.id)).toEqual([undefined, 30, undefined])
    expect(c.bags[1]).toMatchObject({
      name: '钥匙环',
      slots: [{ item: { count: 3, name: '物品 #50' } }],
    })
    expect(c.bank[0].slots[2].item?.id).toBe(30)
    expect(g.tabs[0].slots[1].item?.bound).toBe(false)
    expect(g.tabs[1]).toMatchObject({ restricted: true, slots: [] })
  })

  it('omits inline icons from item names while preserving original hyperlinks', () => {
    const potion =
      '|cnIQ1:|Hitem:212241::::::::80:253::::1:38:3:::::|h[阿加法力药水 |A:Professions-ChatIcon-Quality-Tier3:17:15::1|a]|h|r'
    const reagent = '|cffffffff|Hitem:31|h[|T12345:0|t 贡品]|h|r'
    const root = parseSavedVariables(
      `SYNDICATOR_DATA={Characters={A={bags={{{itemLink="${potion}"},{itemLink="${reagent}"}}}}}}`,
    ).globals.get('SYNDICATOR_DATA')
    const {
      characters: [character],
    } = readInventory(root, '_retail_')
    expect(character.bags[0].slots.map(({ item }) => item)).toMatchObject([
      { id: 212241, name: '阿加法力药水', link: potion },
      { id: 31, name: '贡品', link: reagent },
    ])
  })

  it('reads tabbed personal banks independently of guild and warband banks', () => {
    const root = parseSavedVariables(
      `SYNDICATOR_DATA={Characters={A={bank={},bankTabs={{name="银行分页",slots={{},${ring}}}}}},Warband={{money=201,bank={[2]={name="战团材料",slots={[2]=${ring},[3]={}}}}}}}`,
    ).globals.get('SYNDICATOR_DATA')
    const {
      characters: [c],
      guilds,
      warband,
    } = readInventory(root, '_retail_')
    expect(c.bank).toHaveLength(1)
    expect(c.bank[0]).toMatchObject({
      name: '银行分页',
      slots: [{ item: undefined }, { item: { id: 30 } }],
    })
    expect(c.equipped).toHaveLength(0)
    expect(guilds).toHaveLength(0)
    expect(formatCopper(c.money)).toBe('未记录')
    expect(formatCopper(warband?.money)).toBe('2 银 1 铜')
    expect(warband?.tabs).toMatchObject([
      {
        index: 2,
        name: '战团材料',
        slots: [{ recorded: false }, { item: { id: 30 } }, { recorded: true, item: undefined }],
      },
    ])
    expect(readInventory(root, '_forever_').warband).toBeUndefined()
  })

  it('retains legacy warband tabs and shows saved balances with no recorded tabs', () => {
    const decode = (source: string) =>
      readInventory(parseSavedVariables(source).globals.get('SYNDICATOR_DATA'), '_retail_')
    expect(decode(`SYNDICATOR_DATA={Warband={bank={{slots={${ring}}}}}}`).warband).toMatchObject({
      money: undefined,
      tabs: [{ index: 1, slots: [{ item: { id: 30 } }] }],
    })
    expect(decode('SYNDICATOR_DATA={Warband={{money=17}}}').warband).toEqual({
      money: 17,
      tabs: [],
    })
  })

  it('caches warband data independently per account and reloads it when the save changes', async () => {
    const fs = new MemoryFileSystem()
    const readFile = vi.spyOn(fs, 'readFile')
    const dir = '/wow/_retail_'
    const a = `${dir}/WTF/Account/A/SavedVariables/Syndicator.lua`
    const b = `${dir}/WTF/Account/B/SavedVariables/Syndicator.lua`
    const save = (amount: number) =>
      `SYNDICATOR_DATA={Warband={{money=${amount},bank={{slots={${ring}}}}}}}`
    fs.setFile(a, save(101))
    fs.setFile(b, save(202))
    const loader = createInventoryLoader(fs)
    const load = async () => (await loader.load(dir, ['A', 'B'])).accounts
    const initial = await load()
    const cached = await load()
    expect(cached[0].warband).toBe(initial[0].warband)
    expect(cached.map(({ warband }) => warband?.money)).toEqual([101, 202])
    expect(readFile.mock.calls).toEqual([[a], [b]])
    fs.setFile(a, save(303))
    expect((await load()).map(({ warband }) => warband?.money)).toEqual([303, 202])
    expect(readFile.mock.calls).toEqual([[a], [b], [a]])
  })

  it('reads only Syndicator across independent accounts and isolates malformed files', async () => {
    const fs = new MemoryFileSystem()
    const dir = '/wow/_classic_titan_'
    const path = (id: string, name: string) => `${dir}/WTF/Account/${id}/SavedVariables/${name}.lua`
    for (const account of ['A', 'B']) fs.setFile(path(account, 'Syndicator'), snapshot('同名'))
    fs.setFile(path('Other', 'BGLite'), snapshot('其他插件'))
    fs.setFile(path('Broken', 'Syndicator'), 'SYNDICATOR_DATA=false')
    const { accounts, failures } = await createInventoryLoader(fs).load(dir, [
      'A',
      'Other',
      'Broken',
      'B',
    ])
    expect(accounts.map((a) => a.account)).toEqual(['A', 'B'])
    expect(failures).toMatchObject([{ id: 'Broken', reason: 'invalid-data' }])
    expect(fs.log).toEqual([])
  })

  it('reuses unchanged accounts and reloads changed, invalidated and replaced saves', async () => {
    const fs = new MemoryFileSystem()
    const readFile = vi.spyOn(fs, 'readFile')
    const dir = '/wow/_classic_titan_'
    const a = `${dir}/WTF/Account/A/SavedVariables/Syndicator.lua`
    const b = `${dir}/WTF/Account/B/SavedVariables/Syndicator.lua`
    fs.setFile(a, snapshot('旧角色'))
    fs.setFile(b, snapshot('第二账号'))
    const loader = createInventoryLoader(fs)
    const load = () => loader.load(dir, ['A', 'B'])

    const initial = await load()
    const cached = (await load()).accounts[0]
    expect(cached.characters[0]).toBe(initial.accounts[0].characters[0])
    expect(cached.guilds[0]).toBe(initial.accounts[0].guilds[0])
    expect(readFile.mock.calls).toEqual([[a], [b]])

    fs.setFile(a, snapshot('新角色'))
    expect((await load()).accounts[0].characters[0].key).toBe('新角色')
    expect(readFile.mock.calls).toEqual([[a], [b], [a]])

    loader.invalidate([b])
    await load()
    expect(readFile.mock.calls).toEqual([[a], [b], [a], [b]])

    loader.invalidateAccounts(dir, ['A', 'B'])
    await load()
    expect(readFile.mock.calls.slice(-2)).toEqual([[a], [b]])

    await fs.remove(a)
    expect((await load()).accounts.map(({ account }) => account)).toEqual(['B'])
    fs.setFile(a, snapshot('替换角色'))
    expect((await load()).accounts[0].characters[0].key).toBe('替换角色')
  })

  it('keeps same-name characters on different realms in separate cached records', async () => {
    const fs = new MemoryFileSystem()
    const dir = '/wow/_classic_titan_'
    const path = `${dir}/WTF/Account/A/SavedVariables/Syndicator.lua`
    fs.setFile(
      path,
      'SYNDICATOR_DATA={Characters={Alpha={details={character="同名",realm="一服"},equipped={[12]={itemID=30}}},Beta={details={character="同名",realm="二服"},equipped={[12]={itemID=31}}}}}',
    )
    const loader = createInventoryLoader(fs)
    const initial = (await loader.load(dir, ['A'])).accounts[0].characters
    const cached = (await loader.load(dir, ['A'])).accounts[0].characters
    expect(cached[0]).toBe(initial[0])
    expect(cached[1]).toBe(initial[1])
    expect(cached.find((c) => c.realm === '一服')?.equipped[0].slots[10].item?.id).toBe(30)
    expect(cached.find((c) => c.realm === '二服')?.equipped[0].slots[10].item?.id).toBe(31)
  })
})
