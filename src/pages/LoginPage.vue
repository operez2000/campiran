<template>
  <q-card class="glass q-pa-lg" style="width: 400px">
    <q-card-section>
      <div class="text-h5 text-center">Login</div>
    </q-card-section>

    <q-card-section>
      <q-input v-model="email" label="Email" type="email" filled class="q-mb-md" />
      <q-input v-model="password" label="Password" type="password" filled />

      <q-btn label="Login" color="primary" class="full-width q-mt-lg" @click="handleLogin" />
    </q-card-section>
  </q-card>
</template>

<script setup>
import { ref } from 'vue'
import { supabase } from 'boot/supabase'
// import { useRouter } from 'vue-router'

console.log('LoginPage loaded', localStorage)


const email = ref('')
const password = ref('')
// const router = useRouter()

async function handleLogin() {
  console.log('Logging in with:', email.value, password.value)
  // Do validation / API login here
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin  // after login, will return here
    }
  })

  if (error) {
    console.error('Google login error:', error.message)
    // You can show a notification here if you want
  }
}
</script>

<style scoped>
.glass {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border-radius: 10px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.37);
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: white;
}
</style>
