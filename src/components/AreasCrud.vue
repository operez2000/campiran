<template>
  <div class="flex flex-center background-layout" style="height: 100vh;">
    <q-card class="q-mx-auto glass-element" style="max-width: 800px; width: 100%;">
      <q-card-section class="row items-center">
        <div class="text-h6">Áreas</div>
        <q-space />
        <q-btn
          v-if="!showForm"
          color="primary"
          icon="mdi-file-plus-outline"
          label="Nueva Área"
          no-caps
          unelevated
          @click="showForm = true"
        />
      </q-card-section>

      <q-separator />

      <q-card-section v-if="showForm">
        <q-form @submit.prevent="onSubmit" class="q-gutter-md">
          <div class="text-subtitle2 q-mb-sm">{{ form.id_area ? 'Editar' : 'Nueva' }} Área</div>
          <q-input
            v-model="form.description"
            label="Descripción"
            :rules="[val => !!val || 'Campo requerido']"
            outlined
            dense
            autofocus
          />
          <div class="row justify-end q-mt-md">
            <q-btn
              flat
              label="Cancelar"
              @click="cancelForm"
              class="q-mr-sm"
              no-caps
            />
            <q-btn
              color="primary"
              label="Guardar"
              type="submit"
              :loading="saving"
              no-caps
              unelevated
            />
          </div>
        </q-form>
      </q-card-section>

      <q-card-section>
        <q-table
          class="glass-element my-sticky-header-table"
          :rows="areas"
          :columns="columns"
          row-key="id_area"
          flat
          bordered
          :filter="filter"
          v-model:pagination="pagination"
          :rows-per-page-options="[10, 20, 0]"
          :loading="loading"
        >
          <template v-slot:top-right>
            <q-input
              dense
              borderless
              debounce="300"
              v-model="filter"
              placeholder="Buscar...">
              <template v-slot:append>
                <q-icon name="search" />
              </template>
            </q-input>
          </template>

          <template v-slot:body-cell-actions="props">
            <q-td align="center">
              <q-btn dense flat round icon="edit" color="primary" @click="editArea(props.row)">
                <q-tooltip>Editar</q-tooltip>
              </q-btn>
              <q-btn dense flat round icon="delete" color="negative" @click="deleteArea(props.row.id_area)">
                <q-tooltip>Eliminar</q-tooltip>
              </q-btn>
            </q-td>
          </template>

          <template v-slot:no-data>
            <div class="full-width row flex-center q-pa-md text-grey-8">
              No hay áreas registradas
            </div>
          </template>
        </q-table>
      </q-card-section>
    </q-card>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useQuasar } from 'quasar'
import { supabase } from 'src/boot/supabase'

const $q = useQuasar()

const areas = ref([])
const loading = ref(false)
const saving = ref(false)
const showForm = ref(false)
const filter = ref('')
const form = ref({
  id_area: null,
  description: '',
  is_selected: false
})
const pagination = ref({
  sortBy: 'description',
  descending: false,
  page: 1,
  rowsPerPage: 10
})

const columns = [
  // { name: 'id_area', label: 'ID', field: 'id_area', sortable: true },
  { name: 'description', label: 'Descripción', field: 'description', sortable: true, align: 'left' },
  { name: 'actions', label: 'Acciones', field: 'actions', align: 'center' }
]

let channel = null

const fetchAreas = async () => {
  try {
    loading.value = true
    const { data, error } = await supabase
      .from('areas')
      .select('*')
      .order('description', { ascending: true })

    if (error) throw error
    areas.value = data || []
  } catch (error) {
    console.error('Error fetching areas:', error.message)
  } finally {
    loading.value = false
  }
}

const onSubmit = async () => {
  try {
    saving.value = true
    if (form.value.id_area) {
      // Update
      const { error } = await supabase
        .from('areas')
        .update({
          description: form.value.description,
          is_selected: form.value.is_selected || false
        })
        .eq('id_area', form.value.id_area)

      if (error) throw error

      // Show success notification
      $q.notify({
        color: 'positive',
        message: 'Área actualizada correctamente',
        position: 'top-right'
      })
    } else {
      // Insert
      const { error } = await supabase
        .from('areas')
        .insert({
          description: form.value.description,
          is_selected: form.value.is_selected || false
        })

      if (error) throw error

      // Show success notification
      $q.notify({
        color: 'positive',
        message: 'Área creada correctamente',
        position: 'top-right'
      })

      // Fetch again to ensure new area appears immediately (in case realtime is slow)
      await fetchAreas()
    }
    resetForm()
    showForm.value = false
  } catch (error) {
    console.error('Error saving area:', error.message)
    $q.notify({
      color: 'negative',
      message: `Error: ${error.message}`,
      position: 'top-right'
    })
  } finally {
    saving.value = false
  }
}

const editArea = (area) => {
  form.value = {
    id_area: area.id_area,
    description: area.description,
    is_selected: area.is_selected
  }
  showForm.value = true
}

const deleteArea = async (id_area) => {
  try {
    $q.dialog({
      title: 'Confirmar eliminación',
      message: '¿Estás seguro de eliminar esta área?',
      cancel: true,
      persistent: true
    }).onOk(async () => {
      loading.value = true
      const { error } = await supabase
        .from('areas')
        .delete()
        .eq('id_area', id_area)

      if (error) throw error

      $q.notify({
        color: 'positive',
        message: 'Área eliminada correctamente',
        position: 'top-right'
      })

      // Fetch again to ensure UI is updated
      await fetchAreas()
    })
  } catch (error) {
    console.error('Error deleting area:', error.message)
    $q.notify({
      color: 'negative',
      message: `Error: ${error.message}`,
      position: 'top-right'
    })
  } finally {
    loading.value = false
  }
}

const resetForm = () => {
  form.value = { id_area: null, description: '', is_selected: false }
}

const cancelForm = () => {
  resetForm()
  showForm.value = false
}

const handleRealtime = (payload) => {
  console.log('Realtime payload:', payload)
  if (payload.eventType === 'INSERT') {
    areas.value.unshift(payload.new)
  } else if (payload.eventType === 'UPDATE') {
    const idx = areas.value.findIndex(a => a.id_area === payload.new.id_area)
    if (idx !== -1) areas.value[idx] = payload.new
  } else if (payload.eventType === 'DELETE') {
    areas.value = areas.value.filter(a => a.id_area !== payload.old.id_area)
  }
}

onMounted(async () => {
  await fetchAreas()
  channel = supabase.channel('areas-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'areas' }, handleRealtime)
    .subscribe()
})

onBeforeUnmount(() => {
  if (channel) supabase.removeChannel(channel)
})
</script>
