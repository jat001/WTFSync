export const itemToneColors = {
  accent: '#ffd100',
  effect: '#1eff00',
  muted: '#9d9d9d',
}

const qualities = [
  '#9d9d9d',
  '#ffffff',
  '#1eff00',
  '#0070dd',
  '#a335ee',
  '#ff8000',
  '#e6cc80',
  '#00ccff',
]

export function itemQualityColor(quality: number | undefined): string {
  return qualities[quality ?? 1] ?? qualities[1]
}
