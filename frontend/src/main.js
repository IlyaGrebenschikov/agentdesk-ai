import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import Dashboard from './views/Dashboard.vue'
import Chat from './views/Chat.vue'
import Integrations from './views/Integrations.vue'
import Automations from './views/Automations.vue'
import Tasks from './views/Tasks.vue'
import Settings from './views/Settings.vue'
import Auth from './views/Auth.vue'
import './styles.css'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/auth', component: Auth, meta: { public: true } },
    { path: '/', component: Dashboard },
    { path: '/chat', component: Chat },
    { path: '/integrations', component: Integrations },
    { path: '/automations', component: Automations },
    { path: '/tasks', component: Tasks },
    { path: '/settings', component: Settings }
  ]
})
router.beforeEach((to) => {
  const session = localStorage.getItem('daywave-session')
  if (!to.meta.public && !session) return '/auth'
  if (to.path === '/auth' && session) return '/'
})
createApp(App).use(router).mount('#app')