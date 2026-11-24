import { expect, it } from 'vite-plus/test'
import { BoundedCache } from '../../src/core/bounded-cache'

it('evicts the least recently used entries within both cache limits', () => {
  const cache = new BoundedCache<string, string>(2, 10)
  cache.set('a', 'A', 3)
  cache.set('b', 'B', 3)
  expect(cache.get('a')).toBe('A')
  cache.set('c', 'C', 3)
  expect([...cache.keys()]).toEqual(['a', 'c'])

  cache.set('d', 'D', 8)
  expect([...cache.keys()]).toEqual(['d'])
  cache.set('large', 'Large', 11)
  expect([...cache.keys()]).toEqual(['d'])

  cache.set('d', 'Smaller', 5)
  cache.set('e', 'E', 5)
  expect([...cache.keys()]).toEqual(['d', 'e'])
})
