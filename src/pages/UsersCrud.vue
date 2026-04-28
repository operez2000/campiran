<template>
  <div class="flex flex-center background-layout" style="height: 100vh;">
    <q-card class="glass-element text-grey-4" style="max-width: 90vw; width: 90%;">
      <q-card-section class="row items-center">
        <div class="text-h6">Usuarios</div>
        <q-space />
        <!-- <q-btn
          color="primary"
          icon="mdi-account-plus"
          label="Nuevo Usuario"
          no-caps
          unelevated
          @click="openDialog()"
        /> -->
      </q-card-section>

      <q-card-section>
        <q-table
          class="glass-element"
          :rows="users"
          :columns="columns"
          row-key="id_user"
          :filter="filter"
          :loading="loading"
          flat
          dark
          bordered
          v-model:pagination="pagination"
          :rows-per-page-options="[10, 20, 0]"
        >
          <template v-slot:top-right>
            <q-input
              dense
              borderless
              dark
              debounce="300"
              v-model="filter"
              placeholder="Buscar..."
            >
              <template v-slot:append>
                <q-icon name="search" />
              </template>
            </q-input>
          </template>

          <template v-slot:body-cell-status="props">
            <q-td :props="props">
              <q-chip
                :color="props.value === 'A' ? 'positive' : 'negative'"
                text-color="white"
                class="text-bold text-center"
                dense
                square
              >
                {{ props.value === 'A' ? 'Activo' : 'Inactivo' }}
              </q-chip>
            </q-td>
          </template>

          <template v-slot:body-cell-last_access="props">
            <q-td :props="props">
              {{ props.value ? formatDate(props.value) : 'Nunca' }}
            </q-td>
          </template>

          <template v-slot:body-cell-actions="props">
            <q-td align="center">
              <q-btn dense flat round icon="edit" color="primary" @click="openDialog(props.row)">
                <q-tooltip>Editar</q-tooltip>
              </q-btn>
              <!-- <q-btn dense flat round icon="delete" color="negative" @click="confirmDelete(props.row)">
                <q-tooltip>Eliminar</q-tooltip>
              </q-btn> -->
            </q-td>
          </template>

          <template v-slot:no-data>
            <div class="full-width row flex-center q-pa-md text-grey-8">
              No hay usuarios registrados
            </div>
          </template>
        </q-table>
      </q-card-section>
    </q-card>

    <q-dialog v-model="dialog" persistent>
      <q-card class="glass-element" style="min-width: 500px">
        <q-card-section class="row items-center">
          <div class="text-h6">{{ editMode ? 'Editar' : 'Nuevo' }} Usuario</div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>

        <q-card-section>
          <q-form @submit.prevent="saveUser">
            <div class="row q-col-gutter-md">
              <div class="col-12 col-md-6">
                <q-input
                  v-model="form.user_name"
                  label="Nombre completo"
                  :rules="[val => !!val || 'Campo requerido']"
                  filled
                  autofocus
                />
              </div>

              <div class="col-12 col-md-6">
                <q-input
                  v-model="form.email"
                  label="Correo electrónico"
                  :rules="[
                    val => !!val || 'Campo requerido',
                    val => /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(val) || 'Correo inválido'
                  ]"
                  filled
                  type="email"
                />
              </div>

              <div class="col-12 col-md-6">
                <q-input
                  v-model="form.phone"
                  label="Teléfono"
                  filled
                />
              </div>

              <div class="col-12 col-md-6">
                <q-select
                  v-model="form.role"
                  :options="roleOptions"
                  label="Rol"
                  filled
                  :rules="[val => !!val || 'Campo requerido']"
                  emit-value
                  map-options
                />
              </div>

              <div class="col-12 col-md-6">
                <q-input
                  v-model="form.user_id"
                  label="ID de Usuario"
                  filled
                  :disable="editMode"
                />
              </div>

              <div class="col-12 col-md-6">
                <q-select
                  v-model="form.status"
                  :options="statusOptions"
                  label="Estado"
                  filled
                  emit-value
                  map-options
                />
              </div>

              <div class="col-12 col-md-6" v-if="!editMode">
                <q-input
                  v-model="form.password"
                  label="Contraseña"
                  filled
                  type="password"
                  :rules="[val => !editMode ? !!val || 'Campo requerido' : true]"
                />
              </div>

              <div class="col-12 col-md-6" v-if="!editMode">
                <q-input
                  v-model="form.confirmPassword"
                  label="Confirmar contraseña"
                  filled
                  type="password"
                  :rules="[
                    val => !editMode ? !!val || 'Campo requerido' : true,
                    val => val === form.password || 'Las contraseñas no coinciden'
                  ]"
                />
              </div>

              <!-- <div class="col-12 col-md-6">
                <q-input
                  v-model="form.date_final"
                  label="Fecha de expiración"
                  filled
                >
                  <template v-slot:append>
                    <q-icon name="event" class="cursor-pointer">
                      <q-popup-proxy cover transition-show="scale" transition-hide="scale">
                        <q-date v-model="form.date_final" mask="YYYY-MM-DD HH:mm">
                          <div class="row items-center justify-end">
                            <q-btn v-close-popup label="Cerrar" color="primary" flat />
                          </div>
                        </q-date>
                      </q-popup-proxy>
                    </q-icon>
                  </template>
                </q-input>
              </div> -->
            </div>
          </q-form>
        </q-card-section>

        <q-card-actions align="right" class="q-ma-md">
          <q-btn outline label="Cancelar" color="warning" v-close-popup no-caps />
          <q-btn
            unelevated
            label="Guardar"
            color="primary"
            @click="saveUser"
            :loading="loading"
            :disabled="loading || !form.user_name || !form.email || !form.role || !form.status"
            no-caps
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useQuasar, date } from 'quasar'
import { supabase } from 'src/boot/supabase'

const $q = useQuasar()
const loading = ref(false)
const dialog = ref(false)
const editMode = ref(false)
const users = ref([])
const filter = ref('')
const pagination = ref({
  sortBy: 'user_name',
  descending: false,
  page: 1,
  rowsPerPage: 10
})

const roleOptions = [
  { label: 'Administrador', value: 'A' },
  { label: 'Operador', value: 'O' },
  { label: 'Cajero', value: 'C' },
]

const statusOptions = [
  { label: 'Activo', value: 'A' },
  { label: 'Inactivo', value: 'I' }
]

const columns = [
  { name: 'user_name', label: 'Nombre', field: 'user_name', align: 'left', sortable: true },
  { name: 'email', label: 'Correo', field: 'email', align: 'left', sortable: true },
  { name: 'role', label: 'Rol', field: row => convertRole(row.role), align: 'left', sortable: true },
  { name: 'phone', label: 'Teléfono', field: 'phone', align: 'left' },
  { name: 'status', label: 'Estado', field: 'status', align: 'center', sortable: true },
  { name: 'last_access', label: 'Último acceso', field: 'last_access', align: 'left', sortable: true },
  { name: 'actions', label: 'Acciones', field: 'actions', align: 'center' }
]

const form = ref({
  id_user: null,
  user_id: '',
  user_name: '',
  role: 'user',
  password: '',
  confirmPassword: '',
  email: '',
  phone: '',
  status: 'A',
  date_final: '',
  last_access: null
})

const formatDate = (dateString) => {
  return date.formatDate(dateString, 'DD/MM/YYYY HH:mm')
}

const resetForm = () => {
  form.value = {
    id_user: null,
    user_id: '',
    user_name: '',
    role: 'U',
    password: '',
    confirmPassword: '',
    email: '',
    phone: '',
    status: 'A',
    date_final: '',
    last_access: null
  }
  editMode.value = false
}

const openDialog = (row = null) => {
  if (row) {
    form.value = {
      ...row,
      password: '',
      confirmPassword: '',
      date_final: row.date_final ? date.formatDate(row.date_final, 'YYYY-MM-DD HH:mm') : ''
    }
    editMode.value = true
  } else {
    resetForm()
  }
  dialog.value = true
}

// Función para convertir roles a valores legibles
const convertRole = (role) => {
  if (role === 'O') return 'Operador'
  if (role === 'C') return 'Cajero'
  if (role === 'A') return 'Administrador'
}

const fetchUsers = async () => {
  try {
    loading.value = true
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('user_name', { ascending: true })

    if (error) throw error
    users.value = data || []
  } catch (error) {
    console.error('Error fetching users:', error.message)
    $q.notify({
      color: 'negative',
      message: `Error al cargar usuarios: ${error.message}`,
      position: 'top-right'
    })
  } finally {
    loading.value = false
  }
}

const saveUser = async () => {
  try {
    loading.value = true

    // Validar contraseñas si es un nuevo usuario
    // if (!editMode.value && form.value.password !== form.value.confirmPassword) {
    //   $q.notify({
    //     color: 'negative',
    //     message: 'Las contraseñas no coinciden',
    //     position: 'top-right'
    //   })
    //   loading.value = false
    //   return
    // }

    const userData = {
      user_id: form.value.user_id,
      user_name: form.value.user_name,
      role: form.value.role,
      email: form.value.email,
      phone: form.value.phone,
      status: form.value.status,
      date_final: form.value.date_final || null
    }

    // Agregar contraseña solo si se proporciona una nueva
    if (form.value.password) {
      // En una aplicación real, aquí se haría el hash de la contraseña
      // Esto es solo un ejemplo, en producción NUNCA almacenar contraseñas en texto plano
      userData.password_hash = form.value.password
    }

    if (editMode.value) {
      // Update
      const { error } = await supabase
        .from('users')
        .update(userData)
        .eq('id_user', form.value.id_user)

      if (error) throw error

      $q.notify({
        color: 'positive',
        message: 'Usuario actualizado correctamente',
        position: 'top-right'
      })
    } else {
      // Insert
      const { error } = await supabase
        .from('users')
        .insert(userData)

      if (error) throw error

      $q.notify({
        color: 'positive',
        message: 'Usuario creado correctamente',
        position: 'top-right'
      })
    }

    dialog.value = false
    await fetchUsers()
  } catch (error) {
    console.error('Error saving user:', error.message)
    $q.notify({
      color: 'negative',
      message: `Error: ${error.message}`,
      position: 'top-right'
    })
  } finally {
    loading.value = false
  }
}


// const confirmDelete = async (row) => {
//   try {
//     $q.dialog({
//       title: 'Confirmar eliminación',
//       message: '¿Estás seguro de eliminar este usuario?',
//       cancel: true,
//       persistent: true
//     }).onOk(async () => {
//       try {
//         loading.value = true
//         const { error } = await supabase
//           .from('users')
//           .delete()
//           .eq('id_user', row.id_user)

//         if (error) throw error

//         $q.notify({
//           color: 'positive',
//           message: 'Usuario eliminado correctamente',
//           position: 'top-right'
//         })
//         await fetchUsers()
//       } catch (error) {
//         console.error('Error deleting user:', error.message)
//         $q.notify({
//           color: 'negative',
//           message: `Error: ${error.message}`,
//           position: 'top-right'
//         })
//       } finally {
//         loading.value = false
//       }
//     })
//   } catch (error) {
//     console.error('Dialog error:', error)
//   }
// }

const handleRealtime = (payload) => {
  if (payload.eventType === 'INSERT') {
    users.value.unshift(payload.new)
  } else if (payload.eventType === 'UPDATE') {
    const idx = users.value.findIndex(u => u.id_user === payload.new.id_user)
    if (idx !== -1) users.value[idx] = payload.new
  } else if (payload.eventType === 'DELETE') {
    users.value = users.value.filter(u => u.id_user !== payload.old.id_user)
  }
}

let channel = null

onMounted(async () => {
  await fetchUsers()

  // Set up real-time subscription
  channel = supabase.channel('users-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, handleRealtime)
    .subscribe()
})

onBeforeUnmount(() => {
  if (channel) supabase.removeChannel(channel)
})
</script>
