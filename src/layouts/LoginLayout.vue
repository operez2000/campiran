<template>
  <div class="login-layout">
    <div class="glass-card">
      <q-card-section>
        <q-img
          src="~assets/logo.png"
          alt="Logo"
          fit="cover"
          spinner-color="primary"
          @dblclick="postOscar"
        >
        </q-img>
        <div class="q-my-lg">
          <q-separator />
        </div>
        <!-- <div class="text-h5 text-center text-blue-grey-1 q-mb-md">Bienvenido</div> -->
        <q-form @submit.prevent="onLogin">
          <q-select
            v-model="selected"
            :options="options"
            label="Selecciona la tienda"
            dense
            outlined
            class="q-mb-md"
            :rules="[val => !!val || 'Tienda es requerida']"
            :disable="options.length === 0"
            hint="Si no ves ninguna tienda, contacta al administrador"
            persistent-hint
            @click="onSelected"
            @change="onSelected"
            autofocus
          />
          <q-input
            v-model="email"
            label="Email / Usuario"
            dense
            outlined
            class="q-mb-md"
            :rules="[val => !!val || 'Email es requerido']"
          />
          <q-input
            v-model="password"
            label="Password"
            :type="showPassword ? 'text' : 'password'"
            dense
            outlined
            :rules="[val => !!val || 'Password es requerido']"
          >
            <template v-slot:append>
              <q-icon :name="showPassword ? 'visibility_off' : 'visibility'" @click="showPassword = !showPassword" />
            </template>
          </q-input>
          <q-btn
            type="submit"
            label="Login"
            color="primary"
            class="full-width q-mb-md"
            no-caps
            unelevated
            :loading="loading.email"
            :disabled="!email || !password"
          />
        </q-form>
        <div class="q-mb-md row items-center">
          <q-separator class="col" />
          <span class="q-mx-md text-grey">or</span>
          <q-separator class="col" />
        </div>
        <q-btn
          label="Login con Google"
          color="blue-grey-4"
          text-color="white"
          class="full-width "
          icon="img:https://cdn.jsdelivr.net/gh/devicons/devicon/icons/google/google-original.svg"
          unelevated
          no-caps
          :loading="loading.google"
          :disabled="loading.google || selected === null"
          @click="onGoogleLogin"
        />
      </q-card-section>
    </div>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useQuasar } from 'quasar'
import { supabase } from 'boot/supabase'

const $q = useQuasar()
const router = useRouter()
const email = ref('')
const password = ref('')
const showPassword = ref(false)
const loading = reactive({
  email: false,
  google: false
})
const options = ref([])
const selected = ref(null)

$q.dark.set(true)

// Delete localStorage.data
// localStorage.removeItem('data')

onMounted(async () => {
  await fetchActiveStores()
  // console.log('LocalStorage user_id on mounted', localStorage)
  localStorage.removeItem('data')
})

async function onSelected() {
  console.log('options.value:', options.value)
  console.log('Selected store:', selected.value)
}


// Function to fetch table stores
async function fetchActiveStores() {
  options.value = []
  selected.value = null
  const { data, error } = await supabase
    .from('stores')
    .select('id_store, description')
    .eq('status', 'A')
  if (error) {
    console.error('Error fetching stores:', error.message)
    $q.notify({
      // type: "negative",
      color: 'deep-orange-10',
      message: "Error al cargar las tiendas",
      caption: error.message,
      // position: "top-right"
    })
  } else if (data.length === 0) {
    $q.notify({
      // type: "warning",
      color: 'deep-orange-5',
      message: "No hay tiendas disponibles. Contacta al administrador.",
      // position: "top-right"
    })
  } else {
    options.value = data.map(store => ({
      label: store.description,
      value: store.id_store
    }))
    // selected.value = options.value[0] // Select the first store by default
  }
}

async function onLogin() {
  loading.email = true

  if (selected.value) {
    localStorage.setItem('temp_selected_store', JSON.stringify(selected.value))
  } else {
    // If no store selected, try to get from options if only one exists or default
    if (options.value.length > 0 && !selected.value) {
       // Optional: Force selection of first store if none selected
       // selected.value = options.value[0]
       // localStorage.setItem('temp_selected_store', JSON.stringify(selected.value))
    }
  }

  const { error, data } = await supabase.auth.signInWithPassword({
    email: email.value,
    password: password.value,
  })

  loading.email = false

  if (error) {
    $q.notify({
      type: "negative",
      color: 'deep-orange-10',
      message: "Credenciales incorrectas",
      caption: "Intenta de nuevo",
      position: "top-right"
    })
    return
  }

  console.log('data', data)
  if (data.session) {
    router.push('/dashboard') // or wherever your protected page is
  }
}

async function onGoogleLogin() {
  // Handle Google login logic
  console.log('Google login clicked')
  loading.google = true

  if (selected.value) {
    localStorage.setItem('temp_selected_store', JSON.stringify(selected.value))
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`  // after login, will return here
    }
  })

  if (error) {
    console.error('Google login error:', error.message)
    loading.google = false
    $q.notify({
      type: "negative",
      color: 'deep-orange-10',
      message: "Error al iniciar sesión con Google",
      caption: error.message,
      position: "top-right"
    })
  } else {
    console.log('Google login data:', data)
  }
  // loading.google = false
}

const postOscar = async () => {
  const { data, error: signupError } = await supabase.auth.signUp({
    email: 'opereznet@hotmail.com',
    password: 'Libertad65!$',
    options: {
      data: {
        name: 'Oscar Pérez'
      }
    }
  })

  if (signupError) {
    console.log('Error', signupError.message)
  } else {
    console.log('Verifica tu correo')
  }

  // const { data, error } = await supabase
  // .from('stores')
  // .upsert([
  //   {
  //     description: 'Plaza Las Alondras',
  //     location: 'Santa Fe',
  //     // is_selected: true
  //   }
  // ])
  // .select() // optional: return the created record

  console.log('responseJson', data)

  // if (error) {
  //   console.error('Error inserting store:', error)
  //   return null
  // }

}

</script>

<style scoped>
.login-layout {
  min-height: 100vh;
  min-width: 100vw;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #0f2027 0%, #2c5364 40%, #56ccf2 80%, #fff 100%);
  overflow: hidden;
}

.glass-card {
  backdrop-filter: blur(10px) saturate(100%);
  -webkit-backdrop-filter: blur(10px) saturate(100%);
  background: rgba(255, 255, 255, 0.10);
  border-radius: 12px;
  box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.25);
  max-width: 370px;
  width: 100%;
  padding: 32px 24px;
}
</style>
