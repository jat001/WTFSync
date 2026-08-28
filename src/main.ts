import './assets/css/main.css'

import ui from '@nuxt/ui/vue-plugin'
import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'

import About from './About.vue'
import App from './App.vue'
import Home from './Home.vue'
import Setting from './Setting.vue'

const routes = [
  { path: '/', component: Home },
  { path: '/setting', component: Setting },
  { path: '/about', component: About },
]

const router = createRouter({
  routes,
  history: createWebHistory(),
})

createApp(App).use(router).use(ui).mount('#app')
