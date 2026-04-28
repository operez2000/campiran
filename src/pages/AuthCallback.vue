<template>
  <div class="auth-callback">
    <q-spinner size="3em" />
    <p>Procesando...</p>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { supabase } from 'src/boot/supabase'
import { useRouter } from 'vue-router'

const router = useRouter()

onMounted(async () => {
  const { error, data } = await supabase.auth.getSession()

  if (error) {
    console.error('Auth session error:', error.message)
    router.push('/login')
    return
  }

  if (data.session) {
    // Optionally store user data or emit event
    router.push('/dashboard') // or wherever you want to go
  } else {
    // No session yet? Maybe still handling OAuth
    // Listen for auth changes
    supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        router.push('/')
      } else if (event === 'SIGNED_OUT') {
        router.push('/login')
      }
    })
  }
})
</script>
