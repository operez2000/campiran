<script setup>
import { computed, onMounted, onBeforeMount } from 'vue'
import { useQuasar, useHydration } from 'quasar'
import { useUser } from 'src/stores/userStore'
import { supabase } from 'src/boot/supabase'

const $q = useQuasar()
const { isHydrated } = useHydration()
const { user } = useUser()
const verificaUsuario = computed(() => {
  if (!user.value) {
    return false
  }
  return (user.value && user.value.role) ? user.value.role !== null : false
})
let channel = null

console.log('IndexPage user', user.value)
console.log('IndexPage verificaUsuario', verificaUsuario.value)

// Setup realtime subscription on mount
onMounted(() => {
  channel = supabase.channel('users-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'users', filter: `id_user=eq.${user.value?.id_user}` }, payload => {
      console.log('Change received!... payload', payload)
      // Here you can update the user store or take other actions based on the change
      console.log('User data changed... payload.new', payload.new)
      // Update user store logic can be added here
      const userStore = useUser()
      if (payload?.new) {
        // update the reactive ref
        user.value = { ...(user.value || {}), ...payload.new }
        // try common store update methods if they exist
        if (typeof userStore.setUser === 'function') {
          userStore.setUser(user.value)
        } else if (typeof userStore.updateUser === 'function') {
          userStore.updateUser(payload.new)
        }
      }
      // Notify user if their account has been verified
      if (verificaUsuario.value) {
        $q.notify({
          color: 'grey-9',
          message: `Bienvenido ${user.value?.user_name}`,
          caption: 'Tu cuenta ha sido verificada. Ya puedes acceder al sistema.',
          position: 'bottom'
        })
      }
    })
    .subscribe()
})

// Close realtime channel on unmount
onBeforeMount(() => {
  if (channel) {
    supabase.removeChannel(channel)
  }
})

</script>

<template>
  <div>
    <q-page class="flex items-center justify-center background-layout" v-if="isHydrated">
      <div v-if="verificaUsuario" class="q-pa-md">
        <img alt="Campiran logo" src="~assets/logo.png" width="400">
      </div>
      <div v-else>
        <h1 class="text-h4 text-center">En espera de Verificación...</h1>
      </div>
    </q-page>
  </div>
</template>
