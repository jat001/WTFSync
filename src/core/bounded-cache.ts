/** Retains recently used entries within both a count and a size budget. */
export class BoundedCache<K, V> {
  private readonly entries = new Map<K, { value: V; size: number }>()
  private size = 0

  constructor(
    private readonly maxEntries: number,
    private readonly maxSize: number,
  ) {}

  get(key: K): V | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    this.entries.delete(key)
    this.entries.set(key, entry)
    return entry.value
  }

  set(key: K, value: V, size: number): void {
    this.delete(key)
    if (size > this.maxSize) return
    this.entries.set(key, { value, size })
    this.size += size
    while (this.entries.size > this.maxEntries || this.size > this.maxSize) {
      const oldest = this.entries.keys().next()
      if (oldest.done) break
      this.delete(oldest.value)
    }
  }

  delete(key: K): void {
    const entry = this.entries.get(key)
    if (!entry) return
    this.entries.delete(key)
    this.size -= entry.size
  }

  keys(): IterableIterator<K> {
    return this.entries.keys()
  }
}
