import { describe, expect, it } from 'vitest'

import { formatSavedVariables, formatValue, table } from '../../helpers/lua-writer'
import { encodeUtf8 } from '../../../src/core/text'
import {
  asNumber,
  asString,
  asTable,
  fieldOf,
  LuaParseError,
  sourceText,
  valueOf,
} from '../../../src/core/lua/ast'
import { parseSavedVariables } from '../../../src/core/lua/parser'
import { quoteLuaString } from '../../../src/core/lua/string'

const TRICKY = '{开头}，"引号" \\ 反斜杠\n换行}'

/** A small file in WoW's SavedVariables style. */
const SAMPLE = formatSavedVariables([
  [
    'Data',
    table([
      ['text', TRICKY],
      [
        'list',
        table([['n', 1]], [table([['choose', 0], ['text', '中文：']]), null, 'third']),
      ],
      [
        'players',
        table([
          [
            6382,
            table([
              [
                '角色甲',
                table([
                  ['level', 80],
                  ['iLevel', 227.625],
                  ['neg', -0.0015],
                  ['ok', true],
                  ['bad', false],
                ]),
              ],
            ]),
          ],
        ]),
      ],
    ]),
  ],
  ['Other', table()],
])

function expectParseError(source: string, reason: 'eof' | 'syntax') {
  try {
    parseSavedVariables(source)
  } catch (error) {
    expect(error).toBeInstanceOf(LuaParseError)
    expect((error as LuaParseError).reason, JSON.stringify(source)).toBe(reason)
    return
  }
  throw new Error(`expected a ${reason} error for ${JSON.stringify(source)}`)
}

describe('parseSavedVariables', () => {
  it('reads globals and nested values', () => {
    const chunk = parseSavedVariables(SAMPLE)
    expect([...chunk.globals.keys()]).toEqual(['Data', 'Other'])

    const data = chunk.globals.get('Data')
    expect(asString(valueOf(data, 'text'))).toBe(TRICKY)

    const list = asTable(valueOf(data, 'list'))
    expect(list?.fields.map((f) => f.key)).toEqual([
      { kind: 'positional', index: 1 },
      { kind: 'positional', index: 2 },
      { kind: 'positional', index: 3 },
      { kind: 'string', value: 'n' },
    ])
    expect(valueOf(list, 2)?.kind).toBe('nil')
    expect(asString(valueOf(list, 3))).toBe('third')
    expect(asString(valueOf(valueOf(list, 1), 'text'))).toBe('中文：')

    const player = valueOf(valueOf(valueOf(data, 'players'), 6382), '角色甲')
    expect(asNumber(valueOf(player, 'level'))).toBe(80)
    expect(asNumber(valueOf(player, 'iLevel'))).toBe(227.625)
    expect(asNumber(valueOf(player, 'neg'))).toBe(-0.0015)
    expect(valueOf(player, 'ok')).toMatchObject({ kind: 'boolean', value: true })
    expect(valueOf(player, 'bad')).toMatchObject({ kind: 'boolean', value: false })
  })

  it('records byte spans, with fields running through the separator', () => {
    const chunk = parseSavedVariables(encodeUtf8(SAMPLE))
    const data = chunk.globals.get('Data')

    const text = fieldOf(data, 'text')
    expect(text && sourceText(chunk, text.start, text.end)).toBe(
      `["text"] = ${quoteLuaString(TRICKY)},`,
    )

    const players = fieldOf(data, 'players')
    if (!players) throw new Error('players not found')
    expect(sourceText(chunk, players.start, players.end)).toBe(
      `["players"] = ${formatValue(
        table([[6382, table([['角色甲', table([['level', 80], ['iLevel', 227.625], ['neg', -0.0015], ['ok', true], ['bad', false]])]])]]),
      )},`,
    )
    expect(sourceText(chunk, players.value.end - 1, players.value.end)).toBe('}')
  })

  it('accepts name keys, semicolons, comments and long strings', () => {
    const chunk = parseSavedVariables(
      [
        '-- leading comment',
        'A = { x = 1; y = [[',
        'long]], [==[a]]b]==], --[[ block ]] z = 0x1F, }',
        'B = -.5 ; C = nil',
      ].join('\n'),
    )
    const a = chunk.globals.get('A')
    expect(asNumber(valueOf(a, 'x'))).toBe(1)
    expect(asString(valueOf(a, 'y'))).toBe('long')
    expect(asString(valueOf(a, 1))).toBe('a]]b')
    expect(asNumber(valueOf(a, 'z'))).toBe(31)
    expect(asNumber(chunk.globals.get('B'))).toBe(-0.5)
    expect(chunk.globals.get('C')?.kind).toBe('nil')
  })

  it('decodes escapes, including raw UTF-8 bytes', () => {
    const chunk = parseSavedVariables(
      String.raw`S = { "\228\189\160\229\165\189", "a\065b", 'it\'s', "line\
break" }`,
    )
    const s = chunk.globals.get('S')
    expect(asString(valueOf(s, 1))).toBe('你好')
    expect(asString(valueOf(s, 2))).toBe('aAb')
    expect(asString(valueOf(s, 3))).toBe("it's")
    expect(asString(valueOf(s, 4))).toBe('line\nbreak')
  })

  it('supports boolean and numeric keys; later duplicates win', () => {
    const chunk = parseSavedVariables('T = { [true] = 1, [2] = "a", "first", [1] = "override" }')
    const t = chunk.globals.get('T')
    expect(asNumber(valueOf(t, true))).toBe(1)
    expect(asString(valueOf(t, 2))).toBe('a')
    expect(asString(valueOf(t, 1))).toBe('override')
  })

  it('keeps byte offsets when the file starts with a BOM', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...encodeUtf8('X = { ["键"] = 1, }')])
    const chunk = parseSavedVariables(bytes)
    const field = fieldOf(chunk.globals.get('X'), '键')
    expect(field && sourceText(chunk, field.start, field.end)).toBe('["键"] = 1,')
  })

  it('reports syntax errors', () => {
    expectParseError('T = { 1 2 }', 'syntax')
    expectParseError('T = { [{}] = 1 }', 'syntax')
    expectParseError('T = foo\n', 'syntax')
    expectParseError('T == 1', 'syntax')
    expectParseError('T = { 1x }', 'syntax')
    expectParseError('local T = 1', 'syntax')
    expectParseError('print(1)\n', 'syntax')
  })

  it('reports empty input as incomplete', () => {
    expectParseError('', 'eof')
    expectParseError('\r\n  ', 'eof')
  })

  it('reports every truncation of a file as incomplete', () => {
    // Cutting right after a complete assignment yields a valid file.
    const complete = [...SAMPLE.matchAll(/\}\r\n(?=Other|$)/g)].map(
      (match) => (match.index ?? 0) + 1,
    )
    const bytes = encodeUtf8(SAMPLE)
    for (let length = 0; length < bytes.length; length++) {
      const cut = new TextDecoder().decode(bytes.subarray(0, length))
      const isComplete = complete.some(
        (end) => cut.length >= end && cut.slice(end).trim() === '',
      )
      // Cuts inside a multi-byte character are not valid UTF-8 files.
      if (isComplete || cut.includes('�')) continue
      expectParseError(cut, 'eof')
    }
  })
})

describe('quoteLuaString', () => {
  it('round-trips through the parser', () => {
    const values = ['100000001#1', 'a"b\\c\nd\re', '\x01\x7f9', '中文😀']
    for (const value of values) {
      const chunk = parseSavedVariables(`X = ${quoteLuaString(value)}`)
      expect(asString(chunk.globals.get('X'))).toBe(value)
    }
  })
})
