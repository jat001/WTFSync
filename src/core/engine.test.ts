import { describe, expect, it } from 'vitest'

import { createGame, TEST_ROOT } from '../testing/game'
import { scanAccounts } from './accounts'
import {
  createSyncQueue,
  runSync,
  SyncError,
  type SyncReport,
  type SyncTask,
  type SyncTrigger,
} from './engine'
import { asString, valueOf } from './lua/ast'
import { MemoryFileSystem } from './memory-fs'
import { ProfileDataError, type AddonProfile, type RenderInput } from './profile'

const GAME = `${TEST_ROOT}\\_retail_`
const OUT = `${GAME}\\Interface\\AddOns\\EchoAccounts`

/**
 * Minimal profile: each account's `Echo.name` goes into `<id>.txt`, and
 * `index.txt` lists the accounts, like a toc.
 */
const echo: AddonProfile<string> = {
  id: 'echo',
  name: 'Echo',
  requiredAddon: 'Echo',
  sourceFiles: ['Echo.lua'],
  outputDir: 'Interface/AddOns/EchoAccounts',
  summarize: (source) => [
    { realm: 'r', name: echo.prepare(source) },
  ],
  prepare(source) {
    const chunk = source.files.get('Echo.lua')?.chunk
    const name = asString(valueOf(chunk?.globals.get('Echo'), 'name'))
    if (name === undefined) throw new ProfileDataError('no name')
    return name
  },
  render({ accounts, failed, existing }) {
    const listed = accounts.map((a) => a.id)
    const kept = failed.filter((id) => existing.files.has(`${id}.txt`))
    const index = [...listed, ...kept].sort()
    const previous = existing.files.get('index.txt')?.split('\n') ?? []
    return {
      files: [
        ...accounts.map(({ id, data }) => ({ name: `${id}.txt`, text: data })),
        { name: 'index.txt', text: index.join('\n') },
      ],
      remove: previous
        .filter((id) => id && !index.includes(id))
        .map((id) => `${id}.txt`),
    }
  },
}

function setup(accounts: Record<string, string>) {
  const fs = new MemoryFileSystem()
  createGame(fs, { flavor: '_retail_', product: 'wow', version: '12.1.0.1' })
  fs.setFile(`${GAME}\\Interface\\AddOns\\Echo\\Echo.toc`, '')
  fs.setFile(`${GAME}\\WTF\\Account\\SavedVariables\\Blizzard.lua`, '')
  for (const [id, source] of Object.entries(accounts)) {
    fs.setFile(`${GAME}\\WTF\\Account\\${id}\\SavedVariables\\Echo.lua`, source)
  }
  return fs
}

const noWait = { sleep: async () => {} }

function sync(
  fs: MemoryFileSystem,
  accounts: string[],
  profile: AddonProfile = echo,
): Promise<SyncReport> {
  return runSync(fs, { gameDir: GAME, profile, accounts }, 'manual', {
    retry: noWait,
    write: noWait,
  })
}

describe('runSync', () => {
  it('writes the output, then skips files that did not change', async () => {
    const fs = setup({ '1#1': 'Echo = { name = "a" }', '2#1': 'Echo = { name = "b" }' })

    const first = await sync(fs, ['2#1', '1#1', '2#1'])
    expect(first.synced).toEqual(['1#1', '2#1'])
    expect(first.written).toEqual(['1#1.txt', '2#1.txt', 'index.txt'])
    expect(fs.getText(`${OUT}\\index.txt`)).toBe('1#1\n2#1')
    expect(fs.getText(`${OUT}\\1#1.txt`)).toBe('a')

    const writes = fs.log.length
    const second = await sync(fs, ['1#1', '2#1'])
    expect(second.written).toEqual([])
    expect(second.unchanged).toEqual(['1#1.txt', '2#1.txt', 'index.txt'])
    expect(fs.log.length).toBe(writes)
  })

  it('removes files of deselected accounts', async () => {
    const fs = setup({ '1#1': 'Echo = { name = "a" }', '2#1': 'Echo = { name = "b" }' })
    await sync(fs, ['1#1', '2#1'])
    fs.setFile(`${OUT}\\notes.txt`, 'not ours')

    const report = await sync(fs, ['1#1'])
    expect(report.removed).toEqual(['2#1.txt'])
    expect(fs.getText(`${OUT}\\2#1.txt`)).toBeUndefined()
    expect(fs.getText(`${OUT}\\notes.txt`)).toBe('not ours')
  })

  it('isolates accounts that cannot be read', async () => {
    const fs = setup({
      '1#1': 'Echo = { name = "a" }',
      '2#1': 'Echo = { name = "b" }',
      '3#1': 'Echo = { other = 1 }',
      '4#1': 'Echo = { name = ',
      'bad name': 'Echo = { name = "x" }',
    })
    await sync(fs, ['1#1', '2#1'])
    fs.setFile(`${GAME}\\WTF\\Account\\2#1\\SavedVariables\\Echo.lua`, 'Echo = { name = "b2"')

    let waits = 0
    const report = await runSync(
      fs,
      { gameDir: GAME, profile: echo, accounts: ['1#1', '2#1', '3#1', '4#1', '5#1', 'bad name'] },
      'watch',
      { retry: { retries: 2, sleep: async () => void waits++ }, write: noWait },
    )
    expect(report.synced).toEqual(['1#1'])
    expect(report.failed.map((f) => [f.id, f.reason])).toEqual([
      ['2#1', 'incomplete-source'],
      ['3#1', 'invalid-data'],
      ['4#1', 'incomplete-source'],
      ['5#1', 'missing-source'],
      ['bad name', 'invalid-name'],
    ])
    expect(waits).toBe(4)
    // The failed account keeps its previous output.
    expect(fs.getText(`${OUT}\\2#1.txt`)).toBe('b')
    expect(fs.getText(`${OUT}\\index.txt`)).toBe('1#1\n2#1')
  })

  it('stops when the game directory or required addon is missing', async () => {
    const fs = setup({ '1#1': 'Echo = { name = "a" }' })
    const missingAddon = { ...echo, requiredAddon: 'Nope' }
    await expect(sync(fs, ['1#1'], missingAddon)).rejects.toMatchObject({
      code: 'required-addon-missing',
    })
    await expect(
      runSync(fs, { gameDir: 'C:\\Nope', profile: echo, accounts: [] }, 'manual'),
    ).rejects.toBeInstanceOf(SyncError)
  })

  it('passes the installed client to the profile', async () => {
    const fs = setup({ '1#1': 'Echo = { name = "a" }' })
    let client: RenderInput<string>['client'] | undefined
    const spy = {
      ...echo,
      render(input: RenderInput<string>) {
        client = input.client
        return echo.render(input)
      },
    }
    await sync(fs, ['1#1'], spy)
    expect(client).toEqual({ version: '12.1.0.1', interfaceVersion: 120100 })
  })

  it('stops when the client version is unknown', async () => {
    const fs = setup({ '1#1': 'Echo = { name = "a" }' })
    fs.setFile(`${TEST_ROOT}\\.build.info`, '')
    await expect(sync(fs, ['1#1'])).rejects.toMatchObject({
      code: 'client-version-unknown',
    })
  })

  it('refuses output outside the output directory', async () => {
    const fs = setup({ '1#1': 'Echo = { name = "a" }' })
    for (const name of ['..\\evil.txt', 'a/b.txt', 'x.wtfsync-tmp']) {
      const evil = { ...echo, render: () => ({ files: [{ name, text: '' }], remove: [] }) }
      await expect(sync(fs, ['1#1'], evil)).rejects.toMatchObject({ code: 'invalid-output' })
    }
    const escaping = { ...echo, outputDir: '../Elsewhere' }
    await expect(sync(fs, ['1#1'], escaping)).rejects.toMatchObject({ code: 'invalid-output' })
  })

  it('retries a blocked rename and cleans up leftover temp files', async () => {
    const fs = setup({ '1#1': 'Echo = { name = "a" }' })
    fs.setFile(`${OUT}\\index.txt.wtfsync-tmp`, 'stale')
    fs.failRenames = 2

    const report = await sync(fs, ['1#1'])
    expect(report.written).toEqual(['1#1.txt', 'index.txt'])
    expect(fs.getText(`${OUT}\\index.txt.wtfsync-tmp`)).toBeUndefined()
    expect(fs.getText(`${OUT}\\1#1.txt.wtfsync-tmp`)).toBeUndefined()
  })
})

describe('scanAccounts', () => {
  it('lists accounts with their characters or why they cannot sync', async () => {
    const fs = setup({ '1#1': 'Echo = { name = "a" }', '2#1': 'Echo = {' })
    fs.setFile(`${GAME}\\WTF\\Account\\3#1\\macros-cache.txt`, '')

    const accounts = await scanAccounts(fs, GAME, echo)
    expect(accounts.map((a) => [a.id, a.failure?.reason ?? null])).toEqual([
      ['1#1', null],
      ['2#1', 'incomplete-source'],
      ['3#1', 'missing-source'],
    ])
    expect(accounts[0]?.characters).toEqual([{ realm: 'r', name: 'a' }])
    expect(accounts[0]?.modifiedAt).toBeTypeOf('number')
  })
})

describe('createSyncQueue', () => {
  it('runs one at a time and merges waiting requests for the same task', async () => {
    const started: [string, SyncTrigger, readonly string[]][] = []
    let release: () => void = () => {}
    const run = (task: SyncTask, trigger: SyncTrigger) => {
      started.push([task.profile.id, trigger, task.accounts])
      return new Promise<SyncReport>((resolve) => {
        release = () => resolve({ trigger } as SyncReport)
      })
    }
    const queue = createSyncQueue(run)
    const task = (accounts: string[]): SyncTask => ({ gameDir: GAME, profile: echo, accounts })

    const first = queue(task(['1#1']), 'startup')
    await Promise.resolve()
    expect(started).toEqual([['echo', 'startup', ['1#1']]])

    // Both arrive while the first run is busy, so they become one run.
    const second = queue(task(['1#1']), 'watch')
    const third = queue(task(['1#1', '2#1']), 'manual')
    expect(second).toBe(third)
    expect(second).not.toBe(first)
    expect(started).toHaveLength(1)

    release()
    await first
    await new Promise((resolve) => setTimeout(resolve))
    expect(started[1]).toEqual(['echo', 'manual', ['1#1', '2#1']])
    release()
    expect((await second).trigger).toBe('manual')
  })
})
