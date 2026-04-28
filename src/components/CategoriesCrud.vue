<template>
  <div class="flex flex-center background-layout" style="height: 100vh;">
    <q-card class="q-mx-auto glass-element text-grey-4" style="max-width: 800px; width: 100%;">
      <q-card-section class="row items-center">
        <div class="text-h6">Categorías</div>
        <q-space />
        <q-btn
          color="primary"
          icon="mdi-file-plus-outline"
          label="Nueva Categoría"
          no-caps
          unelevated
          @click="showForm = true"
        />
      </q-card-section>

      <q-separator />

      <q-card-section>
        <q-table
          class="glass-element"
          :rows="categories"
          :columns="columns"
          row-key="id_category"
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
              <q-btn dense flat round icon="edit" color="primary" @click="editCategory(props.row)">
                <q-tooltip>Editar</q-tooltip>
              </q-btn>
              <q-btn dense flat round icon="delete" color="negative" @click="deleteCategory(props.row.id_category)">
                <q-tooltip>Eliminar</q-tooltip>
              </q-btn>
            </q-td>
          </template>

          <template v-slot:no-data>
            <div class="full-width row flex-center q-pa-md text-grey-8">
              No hay categorías registradas
            </div>
          </template>
        </q-table>
      </q-card-section>
    </q-card>

    <!-- Form Dialog -->
    <q-dialog v-model="showForm" persistent>
      <q-card class="glass-element" style="min-width: 350px">
        <q-card-section class="row items-center">
          <div class="text-h6">{{ form.id_category ? 'Editar' : 'Nueva' }} Categoría</div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup @click="cancelForm" />
        </q-card-section>

        <q-separator />

        <q-card-section>
          <q-form @submit="onSubmit">
            <q-input
              v-model="form.description"
              label="Descripción"
              filled
              :rules="[val => !!val || 'Campo requerido']"
              autofocus
            />
          </q-form>
        </q-card-section>

        <q-card-actions align="right" class="q-pa-md">
          <q-btn outline label="Cancelar" color="warning" v-close-popup @click="cancelForm" no-caps />
          <q-btn unelevated label="Guardar" color="primary" @click="onSubmit" :loading="saving" no-caps />
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

const categories = ref([])
const loading = ref(false)
const saving = ref(false)
const showForm = ref(false)
const filter = ref('')
const form = ref({
  id_category: null,
  description: ''
})
const pagination = ref({
  sortBy: 'description',
  descending: false,
  page: 1,
  rowsPerPage: 10
})

const columns = [
  { name: 'description', label: 'Descripción', field: 'description', sortable: true, align: 'left' },
  { name: 'actions', label: 'Acciones', field: 'actions', align: 'center' }
]

let channel = null

const fetchCategories = async () => {
  try {
    loading.value = true
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('description', { ascending: true })

    if (error) throw error
    categories.value = data || []
  } catch (error) {
    console.error('Error fetching categories:', error.message)
  } finally {
    loading.value = false
  }
}

const onSubmit = async () => {
  try {
    saving.value = true
    if (form.value.id_category) {
      // Update
      const { error } = await supabase
        .from('categories')
        .update({
          description: form.value.description
        })
        .eq('id_category', form.value.id_category)

      if (error) throw error

      // Show success notification
      $q.notify({
        color: 'positive',
        message: 'Categoría actualizada correctamente',
        position: 'top-right'
      })
    } else {
      // Insert
      const { error } = await supabase
        .from('categories')
        .insert({
          description: form.value.description
        })

      if (error) throw error

      // Show success notification
      $q.notify({
        color: 'positive',
        message: 'Categoría creada correctamente',
        position: 'top-right'
      })

      // Fetch again to ensure new category appears immediately (in case realtime is slow)
      await fetchCategories()
    }
    resetForm()
    showForm.value = false
  } catch (error) {
    console.error('Error saving category:', error.message)
    $q.notify({
      color: 'negative',
      message: `Error: ${error.message}`,
      position: 'top-right'
    })
  } finally {
    saving.value = false
  }
}

const editCategory = (category) => {
  form.value = {
    id_category: category.id_category,
    description: category.description
  }
  showForm.value = true
}

const deleteCategory = async (id_category) => {
  try {
    $q.dialog({
      title: 'Confirmar eliminación',
      message: '¿Está seguro que desea eliminar esta categoría?',
      cancel: true,
      persistent: true
    }).onOk(async () => {
      loading.value = true
      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id_category', id_category)

      if (error) throw error

      $q.notify({
        color: 'positive',
        message: 'Categoría eliminada correctamente',
        position: 'top-right'
      })

      // Fetch again to ensure UI is updated
      await fetchCategories()
    })
  } catch (error) {
    console.error('Error deleting category:', error.message)
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
  form.value = { id_category: null, description: '' }
}

const cancelForm = () => {
  resetForm()
  showForm.value = false
}

const handleRealtime = (payload) => {
  console.log('Realtime payload:', payload)
  if (payload.eventType === 'INSERT') {
    categories.value.unshift(payload.new)
  } else if (payload.eventType === 'UPDATE') {
    const idx = categories.value.findIndex(c => c.id_category === payload.new.id_category)
    if (idx !== -1) categories.value[idx] = payload.new
  } else if (payload.eventType === 'DELETE') {
    categories.value = categories.value.filter(c => c.id_category !== payload.old.id_category)
  }
}

onMounted(async () => {
  await fetchCategories()
  channel = supabase.channel('categories-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, handleRealtime)
    .subscribe()
})

onBeforeUnmount(() => {
  if (channel) supabase.removeChannel(channel)
})
</script>