import { computed, watch } from 'vue'

import { useSettings, type ThemeMode } from './useSettings'

const media = window.matchMedia('(prefers-color-scheme: dark)')

// Nuxt UI dark styles are driven by the `dark` class on <html>.
function apply(theme: ThemeMode) {
  const dark = theme === 'dark' || (theme === 'system' && media.matches)
  document.documentElement.classList.toggle('dark', dark)
}

/**
 * Apply the configured theme and keep it in sync with the OS.
 * Must be called once from the root component.
 */
export function useTheme() {
  const { settings } = useSettings()

  watch(() => settings.theme, apply, { immediate: true })
  media.addEventListener('change', () => apply(settings.theme))

  const theme = computed(() => settings.theme)

  const order: ThemeMode[] = ['light', 'dark', 'system']

  // The sidebar toggle flips the value; persistence is handled automatically.
  function cycleTheme() {
    const next = order[(order.indexOf(settings.theme) + 1) % order.length]
    settings.theme = next ?? 'system'
  }

  return { theme, cycleTheme }
}
