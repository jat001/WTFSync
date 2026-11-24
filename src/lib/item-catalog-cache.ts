import type { ItemCatalog } from './item-catalog'

interface ImageData {
  url: string
  references: number
}

interface ImageEntry {
  image: ImageData
  expiresAt: number
}

type Images = ItemCatalog['icons']
type ImageKind = 'icon' | 'frame'

/** Indexes images by client version and texture ID, and shares equal image payloads. */
export class CatalogImageCache {
  private readonly entries = new Map<string, ImageEntry>()
  private readonly images = new Map<string, ImageData>()
  private size = 0

  constructor(
    private readonly maxEntries: number,
    private readonly maxSize: number,
  ) {}

  get(scope: string, kind: ImageKind, id: number): string | undefined {
    const key = scope + kind + ':' + id
    const entry = this.entries.get(key)
    if (!entry) return undefined
    if (entry.expiresAt <= Date.now()) {
      this.delete(key)
      return undefined
    }
    this.entries.delete(key)
    this.entries.set(key, entry)
    return entry.image.url
  }

  known(scope: string, kind: ImageKind): Images {
    const prefix = scope + kind + ':'
    const result: Images = {}
    const now = Date.now()
    for (const [key, entry] of this.entries) {
      if (key.startsWith(prefix) && entry.expiresAt > now) {
        result[Number(key.slice(prefix.length))] = entry.image.url
      }
    }
    return result
  }

  set(scope: string, kind: ImageKind, id: number, url: string): string {
    const key = scope + kind + ':' + id
    this.delete(key)
    if (this.keySize(key) + 2 * url.length > this.maxSize) return url
    const image = this.images.get(url) ?? { url, references: 0 }
    if (image.references === 0) {
      this.images.set(image.url, image)
      this.size += 2 * image.url.length
    }
    image.references++
    this.entries.set(key, { image, expiresAt: url ? Infinity : Date.now() + 30_000 })
    this.size += this.keySize(key)
    while (this.entries.size > this.maxEntries || this.size > this.maxSize) {
      const oldest = this.entries.keys().next()
      if (oldest.done) break
      this.delete(oldest.value)
    }
    return image.url
  }

  deletePrefix(prefix: string): void {
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) this.delete(key)
    }
  }

  private keySize(key: string): number {
    return 2 * key.length + 8
  }

  private delete(key: string): void {
    const entry = this.entries.get(key)
    if (!entry) return
    const { image } = entry
    this.entries.delete(key)
    this.size -= this.keySize(key)
    image.references--
    if (image.references === 0) {
      this.images.delete(image.url)
      this.size -= 2 * image.url.length
    }
  }
}
