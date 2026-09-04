import './assets/css/main.css'

import ui from '@nuxt/ui/vue-plugin'
import { createApp } from 'vue'

import App from './App.vue'
import { settingsReady } from './composables/useSettings'

// Wait for persisted settings to hydrate before the first render so the
// UI starts from the stored values (theme, form fields) instead of defaults.
async function bootstrap() {
  await settingsReady
  createApp(App).use(ui).mount('#app')
}

void bootstrap()
