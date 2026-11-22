const formatter = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 })

export function formatGold(value: number | undefined): string {
  return value === undefined ? '—' : `${formatter.format(value)} 金`
}
