<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Sparkles, House, MessageSquare, CalendarDays, Plug, Zap, CheckSquare, Settings, LogOut, PanelLeftClose } from 'lucide-vue-next'
import { clearSession, getSession, getCurrentUser, logout as apiLogout } from './api'
const route = useRoute(), router = useRouter()
const publicPage = computed(() => route.path === '/auth')
const nav = [
  { label: 'Overview', path: '/', icon: House },
  { label: 'Assistant', path: '/chat', icon: MessageSquare },
  { label: 'Calendar', path: '/tasks', icon: CalendarDays },
  { label: 'Integrations', path: '/integrations', icon: Plug },
  { label: 'Automations', path: '/automations', icon: Zap }
]
const session = ref(null)
const profileName = ref('')
const profileEmail = ref('')
const initials = computed(() => {
  const base = profileName.value || profileEmail.value || ''
  const parts = base.replace(/@.*$/, '').split(/[\s._-]+/).filter(Boolean)
  if (!parts.length) return 'DA'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
})
async function loadProfile(){
  session.value = getSession() || null
  profileEmail.value = session.value?.email || ''
  profileName.value = session.value?.name || ''
  if (session.value?.accessToken) {
    try {
      const me = await getCurrentUser(session.value.accessToken)
      if (me?.email) {
        profileEmail.value = me.email
        if (!profileName.value) profileName.value = me.email.split('@')[0]
      }
    } catch { /* fall back to stored email/name */ }
  }
}
onMounted(loadProfile)
watch(publicPage, (isPublic) => { if (!isPublic) loadProfile() })
async function logout(){
  const s = session.value || getSession()
  if (s?.source === 'api' && s.refreshToken) {
    try { await apiLogout(s.refreshToken) } catch { /* best effort */ }
  }
  clearSession()
  session.value = null
  router.push('/auth')
}
</script>
<template>
  <div v-if="publicPage"><router-view /></div>
  <div v-else class="app-shell">
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark"><Sparkles :size="18"/></span><span class="brand-name">daywave<span class="brand-dot">.</span></span><button class="icon-btn collapse"><PanelLeftClose :size="16"/></button></div>
      <div class="workspace"><div class="avatar">{{ initials }}</div><div><strong>Personal workspace</strong><small>Free plan</small></div><span class="chevron">⌄</span></div>
      <nav class="nav">
        <p class="nav-label">WORKSPACE</p>
        <router-link v-for="item in nav" :key="item.path" :to="item.path" class="nav-item" :class="{active: route.path === item.path}"><component :is="item.icon" :size="18"/><span>{{ item.label }}</span><span v-if="item.path==='/automations'" class="nav-count">4</span></router-link>
        <p class="nav-label nav-label-spaced">PREFERENCES</p>
        <router-link to="/settings" class="nav-item" :class="{active: route.path === '/settings'}"><Settings :size="18"/><span>Settings</span></router-link>
      </nav>
      <div class="sidebar-bottom"><div class="upgrade"><div class="upgrade-icon"><Sparkles :size="16"/></div><strong>Unlock more with DayWave Pro</strong><p>More powerful models and unlimited automations.</p><button class="upgrade-btn">Explore plans <span>↗</span></button></div><button class="profile" @click="logout"><div class="avatar">{{ initials }}</div><div class="profile-info"><strong>{{ profileName || 'Account' }}</strong><small>{{ profileEmail || 'DayWave account' }}</small></div><LogOut :size="16" class="logout-icon"/></button></div>
    </aside>
    <main class="main"><router-view /></main>
  </div>
</template>
