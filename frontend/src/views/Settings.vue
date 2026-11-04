<script setup>
import { onMounted, ref } from 'vue'
import { UserRound, Bell, Shield, Palette, Save, Check } from 'lucide-vue-next'
import { getSession, getCurrentUser } from '../api'
const name=ref('Ilya'), email=ref('ilya@example.com'), timezone=ref('Europe/Moscow'), saved=ref(false)
const emailFromApi=ref(false)
onMounted(async()=>{
  const session=getSession()
  if(session){
    email.value=session.email||email.value
    if(session.name) name.value=session.name
  }
  if(session?.accessToken){
    try{
      const me=await getCurrentUser(session.accessToken)
      if(me?.email){email.value=me.email;emailFromApi.value=true}
    }catch{/* keep the stored session email */}
  }
})
function save(){saved.value=true;setTimeout(()=>saved.value=false,1800)}
</script>
<template><div class="page"><header class="page-header"><div><div class="eyebrow">PREFERENCES</div><h1>Settings</h1><p class="page-subtitle">Manage your account and how DayWave works for you.</p></div></header><div class="settings-layout"><aside class="settings-nav"><button class="selected"><UserRound :size="17"/> Profile</button><button><Bell :size="17"/> Notifications</button><button><Shield :size="17"/> Privacy & security</button><button><Palette :size="17"/> Appearance</button></aside><section class="panel settings-panel"><div class="settings-heading"><h2>Profile</h2><p>Your personal information and preferences.</p></div><div class="form-grid"><label>Full name<input v-model="name"></label><label>Email address<input v-model="email" type="email" :readonly="emailFromApi"></label><label>Timezone<select v-model="timezone"><option>Europe/Moscow</option><option>Europe/Zurich</option><option>UTC</option><option>America/New_York</option></select></label></div><p v-if="emailFromApi" class="api-might-differ">Email is managed by your DayWave account.</p><div class="settings-save"><span v-if="saved" class="saved-msg"><Check :size="15"/> Changes saved</span><button class="primary-btn" @click="save"><Save :size="15"/> Save changes</button></div></section></div></div></template>
