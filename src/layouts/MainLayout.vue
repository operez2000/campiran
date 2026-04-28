<script setup>
import { ref, watch, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
// import { useLocalStorage } from 'src/composables/useLocalStorage'
import { useQuasar } from 'quasar'
import { supabase } from 'src/boot/supabase'
import { useUser } from 'src/stores/userStore'

const route = useRoute()
const router = useRouter()
const pageTransition = ref('slide-right')
const $q = useQuasar()

const { user } = useUser()
const verificaUsuario = computed(() => {
  if (!user.value) {
    return false
  }
  return (user.value.role) ? user.value.role !== null : false
})

// Set dark mode by default
$q.dark.set(true)

// Watch system dark mode changes
// watch(
//   () => $q.dark.isActive,
//   val => {
//     $q.dark.set(val)
//   }
// )

// const leftDrawerOpen = ref(false)

// Determine transition based on route depth
const setTransition = (fromPath, toPath) => {
  const fromDepth = fromPath.split('/').filter(Boolean).length
  const toDepth = toPath.split('/').filter(Boolean).length
  pageTransition.value = toDepth > fromDepth ? 'slide-left' : 'slide-right'
}

async function logout() {
  const { error } = await supabase.auth.signOut()
  if (error) {
    console.error('Logout error:', error.message)
  } else {
    // clear reactive user state
    try { const { clearUser } = useUser(); clearUser() } catch {
      // ignore
    }
    router.push('/login')
  }
}

// Watch route changes
watch(
  () => route.fullPath,
  (toPath, fromPath) => {
    if (fromPath) {
      setTransition(fromPath, toPath)
    } else {
      pageTransition.value = 'slide-right'
    }
  },
  { immediate: true }
)
</script>

<template>
  <q-layout view="lHh Lpr lFf" class="background-layout-root">
    <q-header>
      <q-toolbar class="flex justify-between q-my-none q-py-none">
        <div v-if="!verificaUsuario">
          <img class="q-mt-sm" src="~assets/logo.png" alt="Campiran Logo" width="100" />
        </div>
        <div v-else>
          <div class="cursor-pointer non-selectable">
            <q-icon name="menu" size="md">
              <q-tooltip class="text-body2" anchor="center right" self="center left">
                Menú
              </q-tooltip>
            </q-icon>
            <q-menu class="background-menu">
              <q-item clickable v-close-popup to="/">
                <q-item-section class="text-grey-4 q-pl-md" thumbnail>
                  <q-icon name="home" size="sm" />
                </q-item-section>
                <q-item-section class="text-grey-4">
                  Inicio
                </q-item-section>
              </q-item>
              <q-separator />

              <q-item clickable v-close-popup to="/dashboard">
                <q-item-section class="text-grey-4 q-pl-md" thumbnail>
                  <q-icon name="dashboard" size="sm" />
                </q-item-section>
                <q-item-section class="text-grey-4">
                  Dashboard
                </q-item-section>
              </q-item>

              <q-separator />

              <q-item clickable>
                <q-item-section class="q-pl-md" thumbnail>
                  <q-icon name="inventory_2" size="sm" />
                </q-item-section>
                <q-item-section class="text-grey-4">Inventario</q-item-section>
                <q-item-section side>
                  <q-icon name="keyboard_arrow_right" />
                </q-item-section>
                <q-menu class="background-menu" anchor="top end" self="top start">
                  <q-item clickable v-close-popup to="/inventario-fisico">
                    <q-item-section class="text-grey-4">
                      Captura (Físico)
                    </q-item-section>
                  </q-item>
                  <q-separator />
                  <q-item clickable v-close-popup to="/inventario-consulta">
                    <q-item-section class="text-grey-4">
                      Consulta
                    </q-item-section>
                  </q-item>
                  <q-separator />
                  <q-item clickable v-close-popup to="/inventario-registro">
                    <q-item-section class="text-grey-4">
                      Registro
                    </q-item-section>
                  </q-item>
                  <q-separator />
                  <q-item clickable v-close-popup to="/inventario-etiquetas">
                    <q-item-section class="text-grey-4">
                      Impresión de etiquetas
                    </q-item-section>
                  </q-item>
                </q-menu>
              </q-item>

              <q-separator />

              <q-item clickable>
                <q-item-section class="q-pl-md" thumbnail>
                  <q-icon name="inventory_2" size="sm" />
                </q-item-section>
                <q-item-section class="text-grey-4">Catálogos</q-item-section>
                <q-item-section side>
                  <q-icon name="keyboard_arrow_right" />
                </q-item-section>
                <q-menu class="background-menu" anchor="top end" self="top start">
                  <q-item clickable v-close-popup to="/items">
                    <q-item-section class="text-grey-4">
                      Productos y Servicios
                    </q-item-section>
                  </q-item>
                  <q-separator />
                  <q-item clickable v-close-popup to="/areas">
                    <q-item-section class="text-grey-4">
                      Áreas
                    </q-item-section>
                  </q-item>
                  <q-separator />
                  <q-item clickable v-close-popup to="/departamentos">
                    <q-item-section class="text-grey-4">
                      Departamentos
                    </q-item-section>
                  </q-item>
                  <q-separator />
                  <q-item clickable v-close-popup to="/categorias">
                    <q-item-section class="text-grey-4">
                      Categorías
                    </q-item-section>
                  </q-item>
                  <q-separator />
                  <q-item clickable v-close-popup to="/ubicaciones">
                    <q-item-section class="text-grey-4">
                      Ubicaciones
                    </q-item-section>
                  </q-item>
                  <q-separator />
                  <q-item clickable v-close-popup to="/tiendas">
                    <q-item-section class="text-grey-4">
                      Tiendas
                    </q-item-section>
                  </q-item>
                  <q-separator />
                  <q-item clickable v-close-popup to="/usuarios">
                    <q-item-section class="text-grey-4">
                      Usuarios
                    </q-item-section>
                  </q-item>
                </q-menu>
              </q-item>

              <q-separator />

            </q-menu>

          </div>
        </div>

        <q-toolbar-title class="text-center">
          Sistema Administrativo Integral
          <span v-if="verificaUsuario">
            {{ ` - ${user.user_name}` }}
          </span>
        </q-toolbar-title>

        <div class="flex items-center gap-x-2">
          <q-btn
            class="q-my-none q-py-none"
            flat
            dense
            round
            icon="exit_to_app"
            size="lg"
            no-caps
            @click="logout"
            aria-label="Logout"
          >
            <q-tooltip class="text-body2">
              Cerrar sesión
            </q-tooltip>
          </q-btn>
        </div>
      </q-toolbar>
    </q-header>

    <!-- <q-drawer
      v-model="leftDrawerOpen"
      show-if-above
      bordered
    >
      <q-list>
        <q-item-label header>
          Menú
        </q-item-label>

        <q-expansion-item
          icon="inventory"
          label="Inventario"
          expand-separator
        >
          <EssentialLink
            v-for="link in linksList"
            :key="link.title"
            v-bind="link"
            inset
          />
        </q-expansion-item>
      </q-list>
    </q-drawer> -->

    <!-- ✅ Using router-view with slot props for transition -->
    <q-page-container>
      <router-view v-slot="{ Component }">
        <transition :name="pageTransition" mode="in-out">
          <component :is="Component" :key="route.fullPath" />
        </transition>
      </router-view>
    </q-page-container>

    <!-- <q-page-container>
      <router-view />
    </q-page-container> -->

  </q-layout>
</template>

<!-- ✅ Global transition styles (must not be scoped) -->
<style>
/* Ensure pages have background */
.q-page {
  position: absolute;
  background: transparent;
  width: 100%;
  height: 100%;
}

.q-page-container {
  /* position: relative; */
  /* overflow: hidden; */
  /* background: #0f2027; */
  background: #0f2027; /* o tu gradiente */
  min-height: 100vh;
}
/* background: white; Prevent black background */

/*
.slide-left-enter-active,
.slide-left-leave-active,
.slide-right-enter-active,
.slide-right-leave-active {
  position: absolute;
  width: 100%;
  height: 100%;
  transition: transform 0.5s 0.2s ease;
  will-change: transform;
  backface-visibility: hidden;
} */

.slide-left-enter-active,
.slide-right-enter-active {
  transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1),
              opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-left-leave-active,
.slide-right-leave-active {
  transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1),
              opacity 0.3s ease;
}

.slide-left-enter-from {
  transform: translateX(100%);
}
.slide-left-leave-to {
  transform: translateX(-100%);
}

.slide-right-enter-from {
  transform: translateX(-100%);
}
.slide-right-leave-to {
  transform: translateX(100%);
}

.background-layout-root {
  position: relative;
  overflow: hidden;
}

.background-layout {
  position: absolute;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: linear-gradient(135deg, #0f2027 0%, #2c5364 40%, #3ba9ce 80%, #00c9ed 100%);
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

/* #37474ff2; */
.background-menu {
  background: #3c5e68df;
}
</style>
