<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { Sparkles, Eye, EyeOff, ArrowRight } from 'lucide-vue-next'
import { ApiError, NetworkError, extractErrorMessage, loginAndSaveSession, signupAndSaveSession } from '../api'
const router=useRouter(), mode=ref('login'), name=ref(''), email=ref(''), password=ref(''), show=ref(false), error=ref(''), busy=ref(false)
function validate(){
  if(!email.value || !password.value) return 'Please enter your email and password.'
  if(password.value.length<8) return 'At least 8 characters with a letter and a digit.'
  if(!/[A-Za-z]/.test(password.value)||!/[0-9]/.test(password.value)) return 'At least 8 characters with a letter and a digit.'
  return ''
}
function friendlyMessage(err){
  if(err instanceof ApiError){
    if(err.status===401) return mode.value==='signup' ? 'Account created, but sign-in failed. Check your credentials.' : 'Invalid email or password.'
    if(err.status===409) return 'This email is already registered. Try signing in instead.'
    if(err.status===422) return 'At least 8 characters with a letter and a digit.'
    return err.message
  }
  if(err instanceof NetworkError) return ''
  return extractErrorMessage(err)
}
async function submit(){
  error.value=''
  const clientError=validate()
  if(clientError){ error.value=clientError; return }
  busy.value=true
  try{
    const flow=mode.value==='signup'?signupAndSaveSession:loginAndSaveSession
    const session=await flow({email:email.value,password:password.value,name:name.value})
    router.push('/')
  }catch(err){
    error.value=friendlyMessage(err)||'Could not reach the DayWave service. Please try again later.'
  }finally{ busy.value=false }
}
</script>
<template><div class="auth-page"><div class="auth-glow"></div><header class="auth-brand"><span class="brand-mark"><Sparkles :size="18"/></span><span class="brand-name">daywave<span class="brand-dot">.</span></span></header><section class="auth-card"><div class="auth-symbol"><Sparkles :size="22"/></div><h1>{{mode==='login'?'Welcome back':'Create your account'}}</h1><p class="auth-sub">{{mode==='login'?'Your personal AI assistant is ready.':'Start building a more focused day with DayWave.'}}</p><div class="auth-tabs"><button :class="{selected:mode==='login'}" @click="mode='login';error=''">Sign in</button><button :class="{selected:mode==='signup'}" @click="mode='signup';error=''">Create account</button></div><form @submit.prevent="submit"><p v-if="error" class="form-error">{{error}}</p><label v-if="mode==='signup'">Full name<input v-model="name" placeholder="Ilya Grebenshchikov" required></label><label>Email address<input v-model="email" type="email" placeholder="you@example.com" required></label><label>Password<div class="password-wrap"><input v-model="password" :type="show?'text':'password'" placeholder="At least 8 characters with a letter and a digit" minlength="8" required><button type="button" class="reveal" @click="show=!show"><Eye v-if="!show" :size="17"/><EyeOff v-else :size="17"/></button></div></label><button class="primary-btn auth-submit" type="submit" :disabled="busy">{{busy?'Signing in…':(mode==='login'?'Sign in':'Create account')}} <ArrowRight v-if="!busy" :size="17"/></button></form><div class="auth-note"><span></span> Works locally when the DayWave service is offline · live account sync when connected <span></span></div></section><p class="auth-footer">By continuing, you agree to our <a>Terms</a> and <a>Privacy Policy</a>.</p></div></template>
