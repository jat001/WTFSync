import { expect, it } from 'vite-plus/test'
import { CatalogImageCache } from '../../src/lib/item-catalog-cache'

const gem = 'data:image/jpeg;base64,' + 'a'.repeat(300)
const otherGem = 'data:image/jpeg;base64,' + 'b'.repeat(300)

it('shares bytes across build and texture aliases while keeping different images separate', () => {
  const cache = new CatalogImageCache(3, 1_000)
  cache.set('game-a:', 'icon', 123, gem)
  cache.set('game-b:', 'icon', 123, gem)
  cache.set('game-b:', 'frame', 1, gem)
  expect(cache.get('game-a:', 'icon', 123)).toBe(gem)
  expect(cache.get('game-b:', 'icon', 123)).toBe(gem)
  expect(cache.get('game-b:', 'frame', 1)).toBe(gem)

  cache.set('game-c:', 'icon', 123, gem)
  expect(cache.get('game-a:', 'icon', 123)).toBeUndefined()
  expect(cache.known('game-b:', 'icon')).toEqual({ 123: gem })
  expect(cache.known('game-c:', 'icon')).toEqual({ 123: gem })

  cache.set('game-a:', 'icon', 123, otherGem)
  expect(cache.get('game-a:', 'icon', 123)).toBe(otherGem)
  expect(cache.get('game-b:', 'icon', 123)).toBeUndefined()
  expect(cache.get('game-c:', 'icon', 123)).toBeUndefined()
})

it('releases unique image bytes after invalidating the last build alias', () => {
  const cache = new CatalogImageCache(8, 1_000)
  cache.set('game-a:', 'icon', 123, gem)
  cache.set('game-b:', 'icon', 123, gem)
  cache.deletePrefix('game-a:')
  expect(cache.known('game-a:', 'icon')).toEqual({})
  expect(cache.known('game-b:', 'icon')).toEqual({ 123: gem })
  cache.deletePrefix('game-b:')
  cache.set('game-a:', 'icon', 123, otherGem)
  cache.set('game-a:', 'icon', 456, otherGem)
  cache.set('game-a:', 'icon', 789, gem.repeat(2))
  expect(cache.known('game-a:', 'icon')).toEqual({ 123: otherGem, 456: otherGem })
})
