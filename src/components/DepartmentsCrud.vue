<template>
  <div class="flex flex-center background-layout" style="height: 100vh;">
    <q-card class="glass-element text-grey-4" style="max-width: 800px; width: 100%;">
      <q-card-section class="row items-center">
        <div class="text-h6">Departamentos</div>
        <q-space />
        <q-btn
          color="primary"
          icon="mdi-file-plus-outline"
          label="Nuevo Departamento"
          no-caps
          unelevated
          @click="openDialog()"
        />
      </q-card-section>

      <q-separator />

      <q-card-section>
        <q-table
          class="glass-element"
          :rows="departments"
          :columns="columns"
          row-key="id_department"
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

          <template v-slot:body-cell-actions="props">
            <q-td align="center">
              <q-btn dense flat round icon="edit" color="primary" @click="openDialog(props.row)">
                <q-tooltip>Editar</q-tooltip>
              </q-btn>
              <q-btn dense flat round icon="delete" color="negative" @click="confirmDelete(props.row)">
                <q-tooltip>Eliminar</q-tooltip>
              </q-btn>
            </q-td>
          </template>

          <template v-slot:no-data>
            <div class="full-width row flex-center q-pa-md text-grey-8">
              No hay departamentos registrados
            </div>
          </template>
        </q-table>
      </q-card-section>
    </q-card>

    <q-dialog v-model="dialog" persistent>
      <q-card class="glass-element" style="min-width: 400px">
        <q-card-section class="row items-center">
          <div class="text-h6">{{ editMode ? 'Editar' : 'Nuevo' }} Departamento</div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>

        <q-card-section>
          <q-form @submit.prevent="saveDepartment">
            <q-input
              v-model="form.description"
              label="Nombre del Departamento"
              :rules="[val => !!val || 'Campo requerido']"
              filled
              autofocus
            />
          </q-form>
        </q-card-section>

        <q-card-actions align="right">
          <q-btn outline label="Omitir" color="warning" v-close-popup no-caps />
          <q-btn unelevated label="Guardar" color="primary" @click="saveDepartment" :loading="loading" no-caps />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useQuasar } from 'quasar'
import { supabase } from 'src/boot/supabase'

const $q = useQuasar()
const loading = ref(false)
const dialog = ref(false)
const editMode = ref(false)
const departments = ref([])
const filter = ref('')
const pagination = ref({
  sortBy: 'description',
  descending: false,
  page: 1,
  rowsPerPage: 10
})

const columns = [
  // { name: 'id_department', label: 'ID', field: 'id_department', sortable: true },
  { name: 'description', label: 'Descripción', field: 'description', align: 'left', sortable: true },
  { name: 'actions', label: 'Acciones', field: 'actions', align: 'center' }
]

const form = ref({
  id_department: null,
  description: ''
})

const resetForm = () => {
  form.value = {
    id_department: '',
    description: ''
  }
  editMode.value = false
}

const openDialog = (row = null) => {
  if (row) {
    form.value = { ...row }
    editMode.value = true
  } else {
    resetForm()
  }
  dialog.value = true
}

const fetchDepartments = async () => {
  try {
    loading.value = true
    const { data, error } = await supabase
      .from('departments')
      .select('id_department, description')
      .order('description', { ascending: true })

    if (error) throw error
    departments.value = data || []
  } catch (error) {
    console.error('Error fetching departments:', error.message)
    $q.notify({
      color: 'negative',
      message: `Error al cargar departamentos: ${error.message}`,
      position: 'top-right'
    })
  } finally {
    loading.value = false
  }
}

const saveDepartment = async () => {
  try {
    loading.value = true

    if (editMode.value) {
      // Update
      const { error } = await supabase
        .from('departments')
        .update({
          description: form.value.description
        })
        .eq('id_department', form.value.id_department)

      if (error) throw error

      $q.notify({
        color: 'positive',
        message: 'Departamento actualizado correctamente',
        position: 'top-right'
      })
    } else {
      // Insert
      const { error } = await supabase
        .from('departments')
        .insert({
          description: form.value.description
        })

      if (error) throw error

      $q.notify({
        color: 'positive',
        message: 'Departamento creado correctamente',
        position: 'top-right'
      })
    }

    dialog.value = false
    await fetchDepartments()
  } catch (error) {
    console.error('Error saving department:', error.message)
    $q.notify({
      color: 'negative',
      message: `Error: ${error.message}`,
      position: 'top-right'
    })
  } finally {
    loading.value = false
  }
}

const confirmDelete = async (row) => {
  try {
    $q.dialog({
      title: 'Confirmar eliminación',
      message: '¿Estás seguro de eliminar este departamento?',
      cancel: true,
      persistent: true
    }).onOk(async () => {
      try {
        loading.value = true
        const { error } = await supabase
          .from('departments')
          .delete()
          .eq('id_department', row.id_department)

        if (error) throw error

        $q.notify({
          color: 'positive',
          message: 'Departamento eliminado correctamente',
          position: 'top-right'
        })
        await fetchDepartments()
      } catch (error) {
        console.error('Error deleting department:', error.message)
        $q.notify({
          color: 'negative',
          message: `Error: ${error.message}`,
          position: 'top-right'
        })
      } finally {
        loading.value = false
      }
    })
  } catch (error) {
    console.error('Dialog error:', error)
  }
}

const handleRealtime = (payload) => {
  if (payload.eventType === 'INSERT') {
    departments.value.unshift(payload.new)
  } else if (payload.eventType === 'UPDATE') {
    const idx = departments.value.findIndex(d => d.id_department === payload.new.id_department)
    if (idx !== -1) departments.value[idx] = payload.new
  } else if (payload.eventType === 'DELETE') {
    departments.value = departments.value.filter(d => d.id_department !== payload.old.id_department)
  }
}

let channel = null

onMounted(async () => {
  await fetchDepartments()

  // Set up real-time subscription
  channel = supabase.channel('departments-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'departments' }, handleRealtime)
    .subscribe()
})

onBeforeUnmount(() => {
  if (channel) supabase.removeChannel(channel)
})
</script>
