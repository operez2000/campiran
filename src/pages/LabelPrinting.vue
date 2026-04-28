<template>
  <div class="flex flex-center background-layout" style="height: 100vh;">
    <q-card class="q-mt-xl glass-element text-grey-4" style="max-width: 1400px; width: 100%; height: 90vh;">

      <!-- Header -->
      <q-card-section class="items-center q-pb-none">
        <div class="row">
          <div class="col">
            <div class="text-h6">Impresión de Etiquetas</div>
          </div>
          <q-space />
          <div class="col-auto">
            <!-- Settings Button -->
            <q-btn
              flat
              round
              dense
              icon="settings"
              @click="openSettings"
            >
              <q-tooltip>Configurar Impresora/Etiqueta</q-tooltip>
            </q-btn>
          </div>
        </div>
      </q-card-section>

      <q-separator class="q-mt-sm" />

      <q-card-section class="q-col-gutter-md">

        <!-- Tabla y vista previa -->
        <div class="row">
          <div class="col col-12 col-md-9">
            <q-table
              class="glass-element my-sticky-header-table"
              style="height: 75vh;"
              :rows="items"
              :columns="columns"
              row-key="id_item"
              :filter="filter"
              :loading="fetching"
              flat
              dark
              bordered
              dense
              virtual-scroll
              v-model:pagination="pagination"
              :rows-per-page-options="[0]"
            >
              <template v-slot:top-right>
                <q-input
                  v-model="filter"
                  dense
                  borderless
                  dark
                  debounce="300"
                  placeholder="Buscar..."
                >
                  <template v-slot:append>
                    <q-icon name="search" />
                  </template>
                </q-input>
              </template>

              <template v-slot:body-cell-actions="props">
                <q-td align="center">
                  <q-btn
                    dense
                    flat
                    round
                    icon="print"
                    color="secondary"
                    @click="promptPrint(props.row)"
                  >
                    <q-tooltip>Imprimir Etiqueta</q-tooltip>
                  </q-btn>
                </q-td>
              </template>

              <template v-slot:no-data>
                <div class="full-width row flex-center q-pa-md text-grey-8">
                  No hay productos disponibles
                </div>
              </template>
            </q-table>

          </div>

          <!-- Right: Preview -->
          <div class="col-auto col-md-3 q-px-md">
            <div
              class="bg-white text-black flex flex-center q-pa-md"
              style="border-radius: 8px; overflow: hidden; min-height: 300px;"
            >
                <div id="preview-container">
                    <!-- Canvas for bwip-js will be rendered here via raw HTML update or canvas append -->
                    <canvas id="barcode-preview"></canvas>
                    <div v-if="!currentPreviewItem" class="text-grey-6 text-center">
                      Selecciona un producto para visualizar
                    </div>
                </div>
            </div>

            <div class="q-mt-md" v-if="currentPreviewItem">
              <div class="text-caption">
                Producto: {{ currentPreviewItem.description }} <br>
                Código: {{ currentPreviewItem.code }}
              </div>
            </div>
          </div>

        </div>
      </q-card-section>
    </q-card>

    <!-- Settings Dialog -->
    <q-dialog v-model="settingsDialog" persistent>
      <q-card class="glass-element" style="min-width: 400px">
        <q-card-section>
          <div class="text-h6">Configuración de Etiqueta</div>
          <div class="text-caption text-grey-4">Para: {{ selectedLocation.label }}</div>
        </q-card-section>

        <q-card-section>
          <q-form @submit.prevent="saveSettings" class="q-gutter-sm">
             <div class="row q-col-gutter-sm">
               <div class="col-6">
                 <q-input v-model.number="settingsForm.paper_width" label="Ancho Papel (mm)" type="number" step="0.1" filled dark dense />
               </div>
               <div class="col-6">
                 <q-input v-model.number="settingsForm.paper_height" label="Alto Papel (mm)" type="number" step="0.1" filled dark dense />
               </div>
             </div>

             <div class="row q-col-gutter-sm">
               <div class="col-3">
                 <q-input v-model.number="settingsForm.margin_top" label="Mg Sup" type="number" step="0.1" filled dark dense />
               </div>
               <div class="col-3">
                 <q-input v-model.number="settingsForm.margin_bottom" label="Mg Inf" type="number" step="0.1" filled dark dense />
               </div>
               <div class="col-3">
                 <q-input v-model.number="settingsForm.margin_left" label="Mg Izq" type="number" step="0.1" filled dark dense />
               </div>
               <div class="col-3">
                 <q-input v-model.number="settingsForm.margin_right" label="Mg Der" type="number" step="0.1" filled dark dense />
               </div>
             </div>

             <div class="row q-col-gutter-sm">
                <div class="col-6">
                  <q-input v-model.number="settingsForm.font_size" label="Tamaño Fonte (pt)" type="number" step="0.1" filled dark dense />
                </div>
                <div class="col-6">
                  <q-input v-model.number="settingsForm.barcode_height" label="Alto Barcode (mm)" type="number" step="0.1" filled dark dense />
                </div>
             </div>

             <q-input v-model="settingsForm.printer_name" label="Nombre de Impresora (Ref)" filled dark dense hint="Solo referencia informativa" />

             <div class="row justify-end q-mt-md">
               <q-btn label="Cancelar" color="warning" flat v-close-popup no-caps />
               <q-btn label="Guardar Configuración" color="primary" type="submit" unelevated no-caps :loading="savingSettings" />
             </div>
          </q-form>
        </q-card-section>
      </q-card>
    </q-dialog>

    <!-- Quantity Dialog -->
    <q-dialog v-model="quantityDialog" persistent>
      <q-card class="glass-element" style="min-width: 300px">
        <q-card-section class="row items-center">
          <div class="text-h6">Imprimir Etiquetas</div>
        </q-card-section>

        <q-card-section>
          <div class="q-mb-sm">Producto: <b>{{ itemToPrint?.description }}</b></div>
          <q-input
            v-model.number="printQuantity"
            label="Cantidad"
            type="number"
            filled
            dark
            autofocus
            :rules="[val => val > 0 || 'Debe ser mayor a 0']"
            @keyup.enter="startPrinting"
          />
        </q-card-section>

        <q-card-actions align="right">
          <q-btn flat label="Cancelar" color="warning" v-close-popup no-caps />
          <q-btn flat label="Imprimir" color="primary" @click="startPrinting" no-caps />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Hidden Print Area -->
    <div id="print-area" class="print-only"></div>

    <!-- Configuration button (place near the configuration area) -->
    <div class="q-mt-md">
      <q-btn
        color="primary"
        icon="mdi-cog-outline"
        label="Configurar etiquetas"
        unelevated
        @click="configDialog = true"
      />
    </div>

    <!-- Label configuration dialog -->
    <q-dialog v-model="configDialog" maximized>
      <q-card class="glass-element" style="max-width: 1000px;">
        <q-card-section class="row items-center">
          <div class="text-h6">Configuración de impresión de etiquetas por ubicación</div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup @click="configDialog = false" />
        </q-card-section>

        <q-separator />

        <q-card-section>
          <div class="row">
            <div class="col-6">
              <q-table
                :rows="settings"
                :columns="settingColumns"
                row-key="id_label_setting"
                flat
                dense
                bordered
              >
                <template v-slot:body-cell-printer_name="props">
                  <q-td>{{ props.row.printer_name || '-' }}</q-td>
                </template>

                <template v-slot:body-cell-id_location="props">
                  <q-td>
                    {{ locationLabel(props.row.id_location) }}
                  </q-td>
                </template>

                <template v-slot:body-cell-actions="props">
                  <q-td align="center">
                    <q-btn dense flat round icon="edit" color="primary" @click="editSetting(props.row)" />
                    <q-btn dense flat round icon="delete" color="negative" @click="deleteSetting(props.row)" />
                  </q-td>
                </template>

                <template v-slot:no-data>
                  <div class="q-pa-md text-grey">No hay configuraciones definidas</div>
                </template>
              </q-table>
            </div>

            <div class="col-6">
              <q-form @submit.prevent="saveSetting" class="q-gutter-md">
                <div class="text-subtitle2 q-mb-sm">{{ form.id_label_setting ? 'Editar' : 'Nueva' }} configuración</div>

                <!-- Prefer show a select if locations were loaded, otherwise a text input for id -->
                <div v-if="locations.length">
                  <q-select
                    v-model="form.id_location"
                    :options="locations"
                    option-value="value"
                    option-label="label"
                    label="Ubicación"
                    use-chips
                    dense
                    outlined
                    :rules="[v => !!v || 'Seleccione ubicación']"
                  />
                </div>
                <div v-else>
                  <q-input
                    v-model="form.id_location"
                    label="ID de Ubicación (manual)"
                    dense
                    outlined
                    :rules="[v => !!v || 'Ingrese id de ubicación']"
                  />
                </div>

                <q-input v-model="form.printer_name" label="Nombre de impresora" outlined dense />

                <div class="row q-col-gutter-md">
                  <div class="col">
                    <q-input v-model.number="form.paper_width" label="Ancho (mm)" outlined dense type="number" />
                  </div>
                  <div class="col">
                    <q-input v-model.number="form.paper_height" label="Alto (mm)" outlined dense type="number" />
                  </div>
                </div>

                <div class="row q-col-gutter-md">
                  <div class="col">
                    <q-input v-model.number="form.margin_top" label="Margen superior (mm)" outlined dense type="number" />
                  </div>
                  <div class="col">
                    <q-input v-model.number="form.margin_bottom" label="Margen inferior (mm)" outlined dense type="number" />
                  </div>
                </div>

                <div class="row q-col-gutter-md">
                  <div class="col">
                    <q-input v-model.number="form.margin_left" label="Margen izquierdo (mm)" outlined dense type="number" />
                  </div>
                  <div class="col">
                    <q-input v-model.number="form.margin_right" label="Margen derecho (mm)" outlined dense type="number" />
                  </div>
                </div>

                <div class="row q-col-gutter-md">
                  <div class="col">
                    <q-input v-model.number="form.font_size" label="Tamaño de fuente" outlined dense type="number" />
                  </div>
                  <div class="col">
                    <q-input v-model.number="form.barcode_height" label="Altura del código de barras" outlined dense type="number" />
                  </div>
                </div>

                <div class="row q-justify-end q-mt-md">
                  <q-btn flat label="Cancelar" color="grey" @click="resetForm" />
                  <q-btn class="q-ml-sm" unelevated color="primary" type="submit" :loading="saving">Guardar</q-btn>
                </div>
              </q-form>
            </div>
          </div>
        </q-card-section>
      </q-card>
    </q-dialog>

  </div>
</template>

<script setup>
import { ref, onMounted, nextTick, onBeforeUnmount } from 'vue'
import { useQuasar } from 'quasar'
import { supabase } from 'src/boot/supabase'
import bwipjs from 'bwip-js'

const $q = useQuasar()

// State
const items = ref([])
const fetching = ref(false)
const filter = ref('')
const locations = ref([])           // for config dialog (label / location list)
const selectedLocation = ref(null)

// Restore selected location synchronously from localStorage so template select isn't empty on first render
try {
  const raw = localStorage.getItem('temp_selected_store')
  if (raw) {
    const parsed = JSON.parse(raw)
    selectedLocation.value = {
      label: parsed.label,
      id_location: parsed.value
    }
  }
} catch (e) {
  console.error('Could not read stored location from localStorage', e)
  // Notify the user if no location found
  $q.notify({ type: 'warning', message: 'No se pudo cargar la ubicación guardada. Es necesario cerrar y volver a abrir tu sesión.' })
}

const settingsDialog = ref(false)
const savingSettings = ref(false)
const settingsForm = ref({
  id_label_setting: null,
  id_location: null,
  paper_width: 50,
  paper_height: 25,
  margin_top: 1,
  margin_bottom: 1,
  margin_left: 1,
  margin_right: 1,
  font_size: 8,
  barcode_height: 10,
  printer_name: ''
})

const quantityDialog = ref(false)
const itemToPrint = ref(null)
const printQuantity = ref(1)
const currentPreviewItem = ref(null)

const pagination = ref({
  sortBy: 'description',
  descending: false,
  page: 1,
  rowsPerPage: 0
})

const columns = [
  { name: 'code', label: 'Código', field: 'code', align: 'left', sortable: true },
  { name: 'barcode', label: 'Código Barras', field: 'barcode', align: 'left', sortable: true },
  { name: 'description', label: 'Descripción', field: 'description', align: 'left', sortable: true },
  { name: 'price', label: 'Precio', field: 'price', align: 'left', sortable: true, format: val => `$${parseFloat(val).toFixed(2)}` },
  { name: 'actions', label: 'Acciones', field: 'actions', align: 'center' }
]

// ---------- Data Fetching ----------
const fetchItems = async () => {
  try {
    fetching.value = true
    const { data, error } = await supabase
      .from('items')
      .select('id_item, code, barcode, description, price, description_short')
      .order('description', { ascending: true })

    if (error) throw error
    items.value = data || []
  } catch (error) {
    console.error('Error items:', error)
    $q.notify({ type: 'negative', message: 'Error cargando productos' })
  } finally {
    fetching.value = false
  }
}


const fetchLabelSettings = async () => {

  try {
    const { data, error } = await supabase
      .from('location_label_settings')
      .select('*')
      .eq('id_location', selectedLocation.value.id_location)
      .single()

    // PGRST116 means no rows found from PostgREST; ignore that
    if (error && error.code !== 'PGRST116') {
      console.error('Error settings:', error)
    }

    if (data) {
      settingsForm.value = { ...data }
    } else {
      // defaults
      settingsForm.value = {
        id_label_setting: null,
        id_location: selectedLocation.value.id_location,
        paper_width: 50,
        paper_height: 25,
        margin_top: 2,
        margin_bottom: 2,
        margin_left: 2,
        margin_right: 2,
        font_size: 9,
        barcode_height: 10,
        printer_name: ''
      }
    }
  } catch (error) {
    console.error('Error settings:', error)
  }
}

// ---------- Settings (quick) ----------
const openSettings = () => {
  fetchLabelSettings() // refresh current
  settingsDialog.value = true
}

const saveSettings = async () => {
  try {
    savingSettings.value = true
    console.log('Saving settings for location /////// selectedLocation.value', selectedLocation.value)
    const payload = {
      id_location: selectedLocation.value.id_location,
      paper_width: settingsForm.value.paper_width,
      paper_height: settingsForm.value.paper_height,
      margin_top: settingsForm.value.margin_top,
      margin_bottom: settingsForm.value.margin_bottom,
      margin_left: settingsForm.value.margin_left,
      margin_right: settingsForm.value.margin_right,
      font_size: settingsForm.value.font_size,
      barcode_height: settingsForm.value.barcode_height,
      printer_name: settingsForm.value.printer_name
    }

    let error = null
    if (settingsForm.value.id_label_setting) {
      const res = await supabase.from('location_label_settings').update(payload).eq('id_label_setting', settingsForm.value.id_label_setting)
      error = res.error
    } else {
      const res = await supabase.from('location_label_settings').insert(payload)
      error = res.error
    }

    if (error) throw error

    $q.notify({ type: 'positive', message: 'Configuración guardada' })
    settingsDialog.value = false
    if (currentPreviewItem.value) generatePreview(currentPreviewItem.value)
  } catch (e) {
    $q.notify({ type: 'negative', message: 'Error guardando configuración: ' + (e.message || e) })
  } finally {
    savingSettings.value = false
  }
}

// ---------- Printing Logic ----------
const promptPrint = (item) => {
  itemToPrint.value = item
  printQuantity.value = 1
  quantityDialog.value = true
  generatePreview(item)
}

const generatePreview = (item) => {
  currentPreviewItem.value = item
  nextTick(() => {
    try {
      const canvas = document.getElementById('barcode-preview')
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      bwipjs.toCanvas('barcode-preview', {
        bcid:        'code128',
        text:        item.barcode || item.code,
        scale:       2,
        height:      10,
        includetext: true,
        textxalign:  'center'
      })
    } catch (e) {
      // ignore invalid barcode data
      console.warn('Preview barcode error', e)
    }
  })
}

const startPrinting = async () => {
  if (!itemToPrint.value || printQuantity.value <= 0) return

  if (!settingsForm.value.value) {
    await fetchLabelSettings()
  }
  const s = settingsForm.value
  const printArea = document.getElementById('print-area')
  if (!printArea) return
  printArea.innerHTML = ''

  for (let i = 0; i < printQuantity.value; i++) {
    const labelDiv = document.createElement('div')
    labelDiv.className = 'label-page'
    labelDiv.style.width = `${s.paper_width}mm`
    labelDiv.style.height = `${s.paper_height}mm`
    labelDiv.style.paddingTop = `${s.margin_top}mm`
    labelDiv.style.paddingBottom = `${s.margin_bottom}mm`
    labelDiv.style.paddingLeft = `${s.margin_left}mm`
    labelDiv.style.paddingRight = `${s.margin_right}mm`
    labelDiv.style.display = 'flex'
    labelDiv.style.flexDirection = 'column'
    labelDiv.style.alignItems = 'center'
    labelDiv.style.justifyContent = 'center'
    labelDiv.style.boxSizing = 'border-box'
    labelDiv.style.overflow = 'hidden'
    labelDiv.style.pageBreakAfter = 'always'

    const descEl = document.createElement('div')
    descEl.innerText = (itemToPrint.value.description_short || itemToPrint.value.description || '').substring(0, 25)
    descEl.style.fontSize = `${s.font_size}pt`
    descEl.style.fontWeight = 'bold'
    descEl.style.textAlign = 'center'
    descEl.style.lineHeight = '1.1'
    descEl.style.marginBottom = '2px'
    descEl.style.fontFamily = 'Arial, sans-serif'
    descEl.style.width = '100%'
    descEl.style.whiteSpace = 'nowrap'
    descEl.style.overflow = 'hidden'
    labelDiv.appendChild(descEl)

    const canvas = document.createElement('canvas')
    labelDiv.appendChild(canvas)

    try {
      bwipjs.toCanvas(canvas, {
        bcid:        'code128',
        text:        itemToPrint.value.barcode || itemToPrint.value.code,
        scale:       2,
        height:      s.barcode_height,
        includetext: true,
        textxalign:  'center',
        textsize:    s.font_size
      })
    } catch (e) {
      console.warn('Print barcode error', e)
    }

    printArea.appendChild(labelDiv)
  }

  quantityDialog.value = false

  setTimeout(() => {
    window.print()
  }, 500)
}

// ---------- Configuration (full) ----------
const configDialog = ref(false)
const settings = ref([])
const saving = ref(false)

const form = ref({
  id_label_setting: null,
  id_location: null,
  printer_name: '',
  paper_width: 50.0,
  paper_height: 25.0,
  margin_top: 1.0,
  margin_bottom: 1.0,
  margin_left: 1.0,
  margin_right: 1.0,
  font_size: 8.0,
  barcode_height: 10.0
})

const settingColumns = [
  { name: 'id_location', label: 'Ubicación', field: 'id_location' },
  { name: 'printer_name', label: 'Impresora', field: 'printer_name' },
  { name: 'paper_width', label: 'Ancho', field: 'paper_width' },
  { name: 'paper_height', label: 'Alto', field: 'paper_height' },
  { name: 'actions', label: 'Acciones', field: 'actions', align: 'center' }
]

const locationLabel = (id) => {
  const loc = locations.value.find(l => l.value === id)
  return loc ? loc.label : id
}

const fetchSettings = async () => {
  try {
    const { data, error } = await supabase
      .from('location_label_settings')
      .select('*')
      .order('created_at', { ascending: true })

    if (error) throw error
    settings.value = data || []
  } catch (err) {
    console.error('Error fetching label settings:', err)
    $q.notify({ color: 'negative', message: 'Error cargando configuraciones' })
    settings.value = []
  }
}

const resetForm = () => {
  form.value = {
    id_label_setting: null,
    id_location: null,
    printer_name: '',
    paper_width: 50.0,
    paper_height: 25.0,
    margin_top: 1.0,
    margin_bottom: 1.0,
    margin_left: 1.0,
    margin_right: 1.0,
    font_size: 8.0,
    barcode_height: 10.0
  }
  saving.value = false
}

const editSetting = (row) => {
  form.value = { ...row }
  configDialog.value = true
}

const saveSetting = async () => {
  try {
    saving.value = true
    const payload = {
      id_location: form.value.id_location,
      printer_name: form.value.printer_name || null,
      paper_width: Number(form.value.paper_width) || 0,
      paper_height: Number(form.value.paper_height) || 0,
      margin_top: Number(form.value.margin_top) || 0,
      margin_bottom: Number(form.value.margin_bottom) || 0,
      margin_left: Number(form.value.margin_left) || 0,
      margin_right: Number(form.value.margin_right) || 0,
      font_size: Number(form.value.font_size) || 0,
      barcode_height: Number(form.value.barcode_height) || 0
    }

    if (form.value.id_label_setting) {
      const { error } = await supabase
        .from('location_label_settings')
        .update(payload)
        .eq('id_label_setting', form.value.id_label_setting)

      if (error) throw error
      $q.notify({ color: 'positive', message: 'Configuración actualizada' })
    } else {
      const { error } = await supabase
        .from('location_label_settings')
        .insert(payload)

      if (error) throw error
      $q.notify({ color: 'positive', message: 'Configuración creada' })
    }

    await fetchSettings()
    resetForm()
  } catch (err) {
    console.error('Error saving setting:', err)
    $q.notify({ color: 'negative', message: 'Error guardando configuración' })
  } finally {
    saving.value = false
  }
}

const deleteSetting = async (row) => {
  try {
    $q.dialog({ title: 'Confirmar', message: '¿Eliminar configuración?', cancel: true, persistent: true })
      .onOk(async () => {
        const { error } = await supabase
          .from('location_label_settings')
          .delete()
          .eq('id_label_setting', row.id_label_setting)

        if (error) throw error
        $q.notify({ color: 'positive', message: 'Configuración eliminada' })
        await fetchSettings()
      })
  } catch (err) {
    console.error('Error deleting setting:', err)
    $q.notify({ color: 'negative', message: 'No se pudo eliminar' })
  }
}

// ---------- Realtime channels & Lifecycle ----------
let labelChannel = null
let itemsChannel = null

onMounted(async () => {
  // initial loads
  await Promise.all([ fetchItems(), fetchSettings() ])

  // subscribe to location_label_settings changes (updates listing)
  labelChannel = supabase.channel('location-label-settings')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'location_label_settings' }, () => {
      // reload settings list and refresh current settings for selected location if applicable
      fetchSettings().catch(e => console.error(e))
      if (selectedLocation.value) fetchLabelSettings().catch(e => console.error(e))
    })
    .subscribe()

  // subscribe to items changes (refresh table)
  itemsChannel = supabase.channel('items-updates')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, () => {
      fetchItems().catch(e => console.error(e))
    })
    .subscribe()
})

onBeforeUnmount(() => {
  if (labelChannel) supabase.removeChannel(labelChannel)
  if (itemsChannel) supabase.removeChannel(itemsChannel)
})
</script>

<style lang="sass">

/* Print Styles */
@media print
  body *
    visibility: hidden
  #print-area, #print-area *
    visibility: visible
  #print-area
    position: absolute
    left: 0
    top: 0
    width: 100%
    margin: 0
    padding: 0

  .label-page
    /* Ensure each label is on its own physical page/label */
    page-break-after: always
    page-break-inside: avoid
    background: white
    color: black

  /* Hide Quasar UI scrollbars etc */
  /* .q-page, .background-layout
    background: white !important
    height: auto !important */
</style>
