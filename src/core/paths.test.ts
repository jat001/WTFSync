import { describe, expect, it } from 'vitest'

import { basename, dirname, isInside, isSafeFileName, joinPath } from './paths'

describe('paths', () => {
  it('joins with the base path style', () => {
    expect(joinPath('D:\\Games\\WoW\\', '_retail_', 'WTF/Account')).toBe(
      'D:\\Games\\WoW\\_retail_\\WTF\\Account',
    )
    expect(joinPath('/games/wow', 'Interface/AddOns', 'X')).toBe(
      '/games/wow/Interface/AddOns/X',
    )
  })

  it('splits names and parents', () => {
    expect(basename('D:\\Games\\WoW\\_retail_\\')).toBe('_retail_')
    expect(dirname('D:\\Games\\WoW\\_retail_')).toBe('D:\\Games\\WoW')
    expect(dirname('D:\\WoW')).toBe('D:\\')
    expect(dirname('/wow')).toBe('/')
  })

  it('checks containment without resolving dot segments', () => {
    expect(isInside('D:\\WoW', 'd:/wow/Interface/x.lua')).toBe(true)
    expect(isInside('D:\\WoW', 'D:\\WoW')).toBe(false)
    expect(isInside('D:\\WoW', 'D:\\WoWX\\a')).toBe(false)
    expect(isInside('D:\\WoW', 'D:\\WoW\\..\\a')).toBe(false)
    expect(isInside('/wow', '/WOW/a')).toBe(false)
  })

  it('accepts only plain file names', () => {
    expect(isSafeFileName('100000001#1.lua')).toBe(true)
    for (const name of ['', '.', '..', 'a/b', 'a\\b', 'a:b', 'a.', 'a\x01']) {
      expect(isSafeFileName(name)).toBe(false)
    }
  })
})
