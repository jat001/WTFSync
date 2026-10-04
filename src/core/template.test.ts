import { describe, expect, it } from 'vitest'

import { fillTemplate } from './template'

describe('fillTemplate', () => {
  it('replaces placeholders and rejects unknown ones', () => {
    expect(fillTemplate('## Interface: {{INTERFACE}}\r\n', { INTERFACE: '38002' })).toBe(
      '## Interface: 38002\r\n',
    )
    expect(() => fillTemplate('{{MISSING}}', {})).toThrow('{{MISSING}}')
  })
})
