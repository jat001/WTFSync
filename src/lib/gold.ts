const formatter = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 })

export function formatGold(value: number | undefined): string {
  return value === undefined ? '—' : `${formatter.format(value)} 金`
}

export function formatCopper(value: number | undefined): string {
  if (value === undefined) return '未记录'
  const gold = Math.floor(value / 10_000)
  const silver = Math.floor(value / 100) % 100
  const copper = value % 100
  return (
    [gold && formatGold(gold), silver && `${silver} 银`, copper && `${copper} 铜`]
      .filter(Boolean)
      .join(' ') || formatGold(0)
  )
}
