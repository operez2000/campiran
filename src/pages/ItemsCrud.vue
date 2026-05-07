<template>
  <div class="flex flex-center background-layout" style="height: 100vh;">
    <q-card class="q-mx-md glass-element text-grey-4" style="max-width: 100%; width: 100%; height: 84%;margin-top: 50px;">
      <q-card-section class="row items-center q-mb-none q-pb-md">
        <div class="text-h6">Productos y Servicios</div>
        <q-space />
        <q-btn
          color="positive"
          icon="mdi-file-excel"
          no-caps
          unelevated
          class="q-mr-md"
          round
          @click="downloadExcel"
        >
          <q-tooltip>Descargar Excel</q-tooltip>
        </q-btn>
        <q-btn
          color="primary"
          icon="mdi-file-plus-outline"
          label="Nuevo Registro"
          no-caps
          unelevated
          @click="openDialog()"
        />
      </q-card-section>

      <q-card-section class="q-pt-none" style="height: calc(84vh - 100px); position: relative;">
        <q-table
          class="glass-element my-sticky-header-table"
          style="height: 100%;"
          :rows="items"
          :columns="columns"
          row-key="id_item"
          :filter="filter"
          :loading="fetching"
          flat
          dark
          bordered
          dense
          v-model:pagination="pagination"
          virtual-scroll
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
              <q-btn dense flat round icon="edit" color="primary" @click="openDialog(props.row)">
                <q-tooltip>Editar</q-tooltip>
              </q-btn>
              <q-btn dense flat round icon="print" color="secondary" @click="printLabel(props.row)">
                <q-tooltip>Imprimir Etiqueta</q-tooltip>
              </q-btn>
              <q-btn dense flat round icon="delete" color="negative" @click="confirmDelete(props.row)">
                <q-tooltip>Eliminar</q-tooltip>
              </q-btn>
            </q-td>
          </template>

          <template v-slot:no-data>
            <div class="full-width row flex-center q-pa-md text-grey-8">
              No hay productos o servicios registrados
            </div>
          </template>

        </q-table>

        <q-inner-loading
          :showing="fetching"
          label="Cargando..."
          label-class="text-white"
          label-style="font-size: 1.5em;"
        />
      </q-card-section>
    </q-card>

    <!-- Form Dialog -->
    <q-dialog class="q-mx-md" v-model="dialog" persistent>
      <q-card class="glass-element" style="max-width: 820px; width: 100%;">
        <q-card-section class="row items-center">
          <div class="text-h6">{{ editMode ? 'Editar' : 'Nuevo' }} Producto/Servicio</div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>

        <q-separator />

        <q-card-section class="q-pa-none" style="max-height: 80vh;">
          <q-tabs
            v-model="tab"
            dense
            class="text-grey-2 q-mt-md"
            active-color="positive"
            indicator-color="positive"
            align="justify"
          >
            <q-tab name="datos" label="Datos" />
            <q-tab name="imagenes" label="Imágenes" />
          </q-tabs>

          <q-separator />

          <q-tab-panels v-model="tab" animated>
            <!-- Datos Tab -->
            <q-tab-panel name="datos" class="glass-element q-pa-md" style="overflow: auto;">
              <q-form @submit.prevent="saveItem">
                <div class="row q-col-gutter-md q-my-md">
                  <div class="col-6">
                    <q-input
                      v-model="form.code"
                      label="Código"
                      maxlength="15"
                      outlined
                      readonly
                      :rules="[val => !!val || 'Campo requerido']"
                      autofocus
                    />
                  </div>

                  <div class="col-6">
                    <q-input
                      v-model="form.barcode"
                      label="Código de Barras"
                      maxlength="15"
                      outlined
                      :rules="[val => !!val || 'Campo requerido']"
                    />
                  </div>
                </div>

                <div class="row q-col-gutter-md q-my-md">
                  <div class="col-8">
                    <q-input
                      v-model="form.description"
                      label="Descripción"
                      outlined
                      :rules="[val => !!val || 'Campo requerido']"
                      maxlength="60"
                      @blur="onBlur('description')"
                    />
                  </div>
                  <div class="col-4">
                    <q-input
                      v-model="form.description_short"
                      label="Descripción Corta (para recibo)"
                      outlined
                      @focus="onFocus('description_short')"
                      :rules="[val => !!val || 'Campo requerido']"
                      maxlength="20"
                    />
                  </div>
                </div>

                <div class="row q-col-gutter-md q-my-md">
                  <div class="col-2">
                    <q-select
                      v-model="form.type"
                      :options="typeOptions"
                      label="Tipo"
                      filled
                      :rules="[val => !!val || 'Campo requerido']"
                      emit-value
                      map-options
                    />
                  </div>

                  <div class="col-3">
                    <q-select
                      v-model="form.id_area"
                      :options="areaOptions"
                      label="Área"
                      filled
                      option-value="value"
                      option-label="label"
                      emit-value
                      map-options
                    >
                      <template v-slot:after>
                        <q-btn color="positive" round flat icon="add" @click="showAreaDialog = true" />
                      </template>
                    </q-select>
                  </div>

                  <div class="col-3">
                    <q-select
                      v-model="form.id_department"
                      :options="departmentOptions"
                      label="Departamento"
                      filled
                      option-value="value"
                      option-label="label"
                      emit-value
                    >
                      <template v-slot:after>
                        <q-btn color="positive" round flat icon="add" @click="showDepartmentDialog = true" />
                      </template>
                    </q-select>
                  </div>
                  <div class="col">
                    <q-select
                      v-model="form.id_category"
                      :options="categoryOptions"
                      label="Categoría"
                      filled
                      option-value="value"
                      option-label="label"
                      emit-value
                      map-options
                    >
                      <template v-slot:after>
                        <q-btn color="positive" round flat icon="add" @click="showCategoryDialog = true" />
                      </template>
                    </q-select>
                  </div>
                </div>

                <div class="row q-col-gutter-md q-my-md">
                  <div class="col-4">
                    <q-input
                      input-class="text-right"
                      v-model.number="form.price1"
                      label="Precio 1"
                      outlined
                      type="number"
                      @focus="$event.target.select()"
                    />
                  </div>
                  <div class="col-4">
                    <q-input
                      input-class="text-right"
                      v-model.number="form.price2"
                      label="Precio 2"
                      outlined
                      type="number"
                      @focus="$event.target.select()"
                    />
                  </div>
                  <div class="col-4">
                    <q-input
                      input-class="text-right"
                      v-model.number="form.price3"
                      label="Precio 3"
                      outlined
                      type="number"
                      @focus="$event.target.select()"
                    />
                  </div>
                </div>

                <div class="row q-col-gutter-md q-my-md">
                  <div class="col">
                    <q-input
                      v-model.number="form.tax"
                      input-class="text-right"
                      label="Impuesto (%)"
                      outlined
                      type="number"
                      @focus="$event.target.select()"
                    />
                  </div>
                  <div class="col">
                    <q-input
                      v-model.number="form.comission"
                      input-class="text-right"
                      label="Comisión (%)"
                      outlined
                      type="number"
                      @focus="$event.target.select()"
                    />
                  </div>
                  <div class="col">
                    <q-input
                      v-model="form.unit"
                      label="U Medida"
                      outlined
                      maxlength="15"
                    />
                  </div>
                </div>

                <q-separator />

                <div class="row text-right q-mt-lg">
                  <div class="col">
                    <q-btn outline label="Cancelar" color="warning" v-close-popup no-caps />
                    <q-btn type="submit" class="q-ml-md" unelevated label="Guardar" color="primary" @click="saveItem" :loading="loading" :disable="!isFormValid || loading" no-caps />
                  </div>
                </div>
              </q-form>
            </q-tab-panel>

            <!-- Imágenes Tab -->
            <q-tab-panel name="imagenes" class="glass-element q-pa-md" style="overflow: auto;">
              <div class="row q-col-gutter-md items-center q-mb-md">
                <div class="col">
                  <q-file
                    v-model="imageFile"
                    label="Seleccionar imagen"
                    outlined
                    accept="image/*"
                    @update:model-value="onImageSelected"
                  >
                    <template v-slot:prepend>
                      <q-icon name="attach_file" />
                    </template>
                  </q-file>
                </div>
                <div class="col-auto">
                  <q-btn
                    color="primary"
                    icon="cloud_upload"
                    label="Subir"
                    no-caps
                    unelevated
                    @click="uploadImage"
                    :disable="!imageFile"
                  />
                </div>
              </div>

              <q-separator class="q-my-md" />

              <div v-if="images.length === 0" class="text-center text-grey q-py-xl">
                No hay imágenes cargadas
              </div>

              <q-carousel
                v-else
                v-model="slide"
                swipeable
                animated
                control-color="positive"
                navigation
                padding
                arrows
                class="bg-grey-2 rounded-borders"
                style="max-height: 400px;"
              >
                <q-carousel-slide
                  v-for="(img, idx) in images"
                  :key="idx"
                  :name="idx"
                  class="column flex-center relative-position glass-element"
                >
                  <q-img
                    :src="img.dataUrl"
                    spinner-color="primary"
                    style="max-height: 350px; max-width: 100%;"
                    contain
                  />
                  <!-- Delete button on hover -->
                  <q-btn
                    round
                    dense
                    icon="delete"
                    color="negative"
                    size="sm"
                    class="absolute-top-right q-ma-sm"
                    @click="removeImage(idx)"
                  >
                    <q-tooltip>Eliminar imagen</q-tooltip>
                  </q-btn>
                </q-carousel-slide>
              </q-carousel>

              <q-separator class="q-my-md" />

              <div class="row text-right q-mt-lg">
                <div class="col">
                  <q-btn outline label="Cancelar" color="warning" v-close-popup no-caps />
                  <q-btn type="submit" class="q-ml-md" unelevated label="Guardar" color="primary" @click="saveItem" :loading="loading" :disable="!isFormValid || loading" no-caps />
                </div>
              </div>

            </q-tab-panel>
          </q-tab-panels>
        </q-card-section>

        <q-card-actions align="right" class="q-pa-md">
        </q-card-actions>
      </q-card>
    </q-dialog>
    <!-- Areas Dialog -->
    <q-dialog v-model="showAreaDialog" maximized>
      <q-card>
        <q-card-section class="row items-center">
          <div class="text-h6">Gestión de Áreas</div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup @click="fetchAreas" />
        </q-card-section>

        <q-card-section class="q-pa-none">
          <AreasCrud />
        </q-card-section>
      </q-card>
    </q-dialog>

    <!-- Departments Dialog -->
    <q-dialog v-model="showDepartmentDialog" maximized>
      <q-card>
        <q-card-section class="row items-center">
          <div class="text-h6">Gestión de Departamentos</div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup @click="fetchDepartments" />
        </q-card-section>

        <q-card-section class="q-pa-none">
          <DepartmentsCrud />
        </q-card-section>
      </q-card>
    </q-dialog>

    <!-- Categories Dialog -->
    <q-dialog v-model="showCategoryDialog" maximized>
      <q-card>
        <q-card-section class="row items-center">
          <div class="text-h6">Gestión de Categorías</div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup @click="fetchCategories" />
        </q-card-section>

        <q-card-section class="q-pa-none">
          <CategoriesCrud />
        </q-card-section>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch, computed } from 'vue'
import { useQuasar } from 'quasar'
import { supabase } from 'src/boot/supabase'
import AreasCrud from 'src/components/AreasCrud.vue'
import DepartmentsCrud from 'src/components/DepartmentsCrud.vue'
import CategoriesCrud from 'src/components/CategoriesCrud.vue'
import * as XLSX from 'xlsx'

const $q = useQuasar()
const loading = ref(false)
const fetching = ref(false)
const dialog = ref(false)
const editMode = ref(false)
const items = ref([])
const filter = ref('')
const showAreaDialog = ref(false)
const showDepartmentDialog = ref(false)
const showCategoryDialog = ref(false)

// Options for selects
const areaOptions = ref([])
const departmentOptions = ref([])
const categoryOptions = ref([])

const typeOptions = [
  { label: 'Producto', value: 'P' },
  { label: 'Servicio', value: 'S' }
]

const pagination = ref({
  sortBy: 'description',
  descending: false,
  // page: 1,
  rowsPerPage: 0
})

const columns = [
  { name: 'actions', label: 'Acciones', field: 'actions', align: 'center' },
  { name: 'code', label: 'Código', field: 'code', align: 'left', sortable: true },
  // { name: 'barcode', label: 'Código de Barras', field: 'barcode', align: 'left', sortable: true },
  { name: 'description', label: 'Descripción', field: 'description', align: 'left', sortable: true },
  { name: 'description_short', label: 'Descripción Corta (para recibo)', field: 'description_short', align: 'left', sortable: true },
  { name: 'type', label: 'Tipo', field: 'type', align: 'left', sortable: true, format: val => val === 'P' ? 'Producto' : 'Servicio' },
  { name: 'price1', label: 'Precio 1', field: 'price1', align: 'right', sortable: true, format: val => `$${parseFloat(val || 0).toFixed(2)}` },
  { name: 'price2', label: 'Precio 2', field: 'price2', align: 'right', sortable: true, format: val => `$${parseFloat(val || 0).toFixed(2)}` },
  { name: 'price3', label: 'Precio 3', field: 'price3', align: 'right', sortable: true, format: val => `$${parseFloat(val || 0).toFixed(2)}` }
]

const tab = ref('datos')
const images = ref([])
const imageFile = ref(null)
const slide = ref(0)
// Images stored in Supabase Storage (bucket: item_images) and referenced in DB table item_images

// Handle image selection from QFile
const onImageSelected = async (val) => {
  try {
    let file = Array.isArray(val) ? val[0] : val

    // Clear selection if none
    if (!file) {
      imageFile.value = null
      return
    }

    // Basic validations
    if (!file.type || !file.type.startsWith('image/')) {
      imageFile.value = null
      $q.notify({
        color: 'negative',
        message: 'Selecciona un archivo de imagen válido',
        position: 'top-right'
      })
      return
    }

    const maxSizeMB = 5;
    const maxSizeKB = 800;

    if (file.size > maxSizeMB * 1024 * 1024) {
      imageFile.value = null
      $q.notify({
        color: 'warning',
        message: `La imagen supera ${maxSizeMB}MB y no puede ser procesada`,
        position: 'top-right'
      })
      return
    }

    if (file.size > maxSizeKB * 1024) {
      const originalSizeKB = (file.size / 1024).toFixed(2);
      
      const compressImage = (fileToCompress) => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(fileToCompress);
          reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
              const canvas = document.createElement('canvas');
              let width = img.width;
              let height = img.height;
              
              const max_width = 800;
              if (width > max_width) {
                height = Math.round((height * max_width) / width);
                width = max_width;
              }
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0, width, height);

              canvas.toBlob((blob) => {
                if (!blob) return reject(new Error('Canvas is empty'));
                const newFile = new File([blob], fileToCompress.name, {
                  type: 'image/jpeg',
                  lastModified: Date.now(),
                });
                resolve(newFile);
              }, 'image/jpeg', 0.8);
            };
            img.onerror = reject;
          };
          reader.onerror = reject;
        });
      };

      try {
        const compressedFile = await compressImage(file);
        const newSizeKB = (compressedFile.size / 1024).toFixed(2);
        
        $q.notify({
          color: 'info',
          message: `La imagen se redujo porque superaba los 800 KB. Tamaño original: ${originalSizeKB} KB, Nuevo tamaño: ${newSizeKB} KB.`,
          position: 'top-right',
          timeout: 4000
        });
        
        file = compressedFile;
      } catch (err) {
        console.error('Error compressing image:', err);
        $q.notify({
          color: 'negative',
          message: 'Error al intentar reducir el tamaño de la imagen',
          position: 'top-right'
        });
        imageFile.value = null;
        return;
      }
    }

    // Accept the file
    imageFile.value = file
    // Reset carousel position if needed
    slide.value = 0
  } catch (e) {
    console.error('Error on image selection:', e)
    $q.notify({
      color: 'negative',
      message: `Error al seleccionar imagen: ${e.message || e}`,
      position: 'top-right'
    })
  }
}



const fetchItemImages = async () => {
  if (!form.value.id_item) {
    images.value = []
    return
  }
  const { data, error } = await supabase
    .from('item_images')
    .select('id_item_image, image_url, image_path, created_at')
    .eq('id_item', form.value.id_item)
    .order('created_at', { ascending: true })
  if (error) {
    console.error('Error fetching item images:', error)
    images.value = []
    return
  }
  images.value = (data || []).map(row => {
    return {
      id: row.id_item_image,
      dataUrl: row.image_url,
      path: row.image_path,
      created_at: row.created_at
    }
  })
  slide.value = 0
}

// Upload selected image to Supabase Storage and add to carousel
const uploadImage = async () => {
  try {
    // Ensure there is a file selected
    const file = imageFile.value
    if (!file) {
      $q.notify({
        color: 'warning',
        message: 'Primero selecciona una imagen',
        position: 'top-right'
      })
      return
    }

    // Ensure the item exists (has id)
    if (!form.value.id_item) {
      $q.notify({
        color: 'warning',
        message: 'Guarda el producto/servicio antes de subir imágenes',
        position: 'top-right'
      })
      return
    }

    loading.value = true

    // 1. Upload to Supabase Storage
    const fileExt = file.name.split('.').pop()
    const fileName = `${form.value.id_item}/${Date.now()}.${fileExt}`
    
    const { error: uploadError } = await supabase.storage
      .from('item_images')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false
      })

    if (uploadError) throw uploadError

    // 2. Get Public URL
    const { data: { publicUrl } } = supabase.storage
      .from('item_images')
      .getPublicUrl(fileName)

    // 3. Insert record into item_images table
    const { data: insertData, error: insertError } = await supabase
      .from('item_images')
      .insert({ 
        id_item: form.value.id_item, 
        image_url: publicUrl,
        image_path: fileName
      })
      .select()
      .single()

    if (insertError) throw insertError

    images.value.push({ 
      id: insertData.id_item_image, 
      dataUrl: insertData.image_url, 
      path: insertData.image_path,
      created_at: insertData.created_at 
    })
    
    // Reset QFile
    imageFile.value = null
    slide.value = images.value.length - 1

    $q.notify({
      color: 'positive',
      message: 'Imagen subida correctamente',
      position: 'top-right'
    })
  } catch (error) {
    console.error('Error uploading image:', error)
    $q.notify({
      color: 'negative',
      message: `Error al subir imagen: ${error.message || error}`,
      position: 'top-right'
    })
  } finally {
    loading.value = false
  }
}

// Remove image from DB and local list
const removeImage = async (idx) => {
  const img = images.value[idx]
  if (!img) return
  try {
    // 1. Delete from Storage
    if (img.path) {
      const { error: storageError } = await supabase.storage
        .from('item_images')
        .remove([img.path])
      if (storageError) {
        console.warn('Error deleting from storage:', storageError.message)
      }
    }

    // 2. Delete from DB
    const { error: deleteError } = await supabase
      .from('item_images')
      .delete()
      .eq('id_item_image', img.id)
    
    if (deleteError) {
      console.warn('Error deleting image row:', deleteError.message)
      $q.notify({ color: 'warning', message: 'No se pudo eliminar la imagen del registro', position: 'top-right' })
    } else {
      images.value.splice(idx, 1)
      if (slide.value >= images.value.length) {
        slide.value = Math.max(0, images.value.length - 1)
      }
      $q.notify({ color: 'positive', message: 'Imagen eliminada', position: 'top-right' })
    }
  } catch (e) {
    console.warn('removeImage error:', e)
  }
}

const form = ref({
  id_item: null,
  code: '',
  barcode: '',
  description: '',
  description_short: '',
  type: 'P',
  id_area: null,
  id_department: null,
  id_category: null,
  unit: '',
  price1: 0,
  price2: 0,
  price3: 0,
  tax: 8,
  comission: 0,
})

const resetForm = () => {
  form.value = {
    id_item: null,
    code: '',
    barcode: '',
    description: '',
    description_short: '',
    type: 'P',
    id_area: null,
    id_department: null,
    id_category: null,
    unit: '',
    price1: 0,
    price2: 0,
    price3: 0,
    tax: 8,
    comission: 0,
  }
  editMode.value = false
  setNextCode()
}

// Create a computed property for form validation
const isFormValid = computed(() => {
  return form.value.code && form.value.barcode && form.value.description && form.value.description_short && (form.value.price1 !== null && form.value.price1 !== undefined)
})

const onBlur = (field) => {
  if (field === 'description') {
    if (form.value.description && !form.value.description_short) {
      form.value.description_short = form.value.description.substring(0, 20)
    }
  }
}

const openDialog = (row = null) => {
  if (row) {
    form.value = { ...row }
    // ensure existing code is sanitized/padded
    form.value.code = padCode(extractDigits(form.value.code))
    console.log('form.value.code', form.value.code)
    editMode.value = true
    // Load images for this item
    fetchItemImages()
  } else {
    resetForm()
    images.value = []
  }
  dialog.value = true
}

const fetchItems = async () => {
  try {
    loading.value = true
    fetching.value = true
    const { data, error } = await supabase
      .from('items')
      .select('id_item, code, barcode, description, description_short, type, id_area, id_department, id_category, unit, price1, price2, price3, tax, comission')
      .order('description', { ascending: true })

    if (error) throw error
    items.value = data || []
  } catch (error) {
    console.error('Error fetching items:', error.message)
    $q.notify({
      color: 'negative',
      message: `Error al cargar productos: ${error.message}`,
      position: 'top-right'
    })
  } finally {
    loading.value = false
    fetching.value = false
  }
}

const fetchAreas = async () => {
  try {
    const { data, error } = await supabase
      .from('areas')
      .select('id_area, description')
      .order('description', { ascending: true })

    if (error) throw error
    areaOptions.value = data.map(area => ({
      label: area.description,
      value: area.id_area
    })) || []
  } catch (error) {
    console.error('Error fetching areas:', error.message)
  }
}

const fetchDepartments = async () => {
  try {
    const { data, error } = await supabase
      .from('departments')
      .select('id_department, description')
      .order('description', { ascending: true })

    if (error) throw error
    departmentOptions.value = data.map(dept => ({
      label: dept.description,
      value: dept.id_department
    })) || []
  } catch (error) {
    console.error('Error fetching departments:', error.message)
  }
}

const fetchCategories = async () => {
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('id_category, description')
      .order('description', { ascending: true })

    if (error) throw error
    categoryOptions.value = data?.map(cat => ({
      label: cat.description,
      value: cat.id_category
    })) || []
  } catch (error) {
    console.error('Error fetching categories:', error.message)
    // Categories might not exist yet, so we don't show an error notification
  }
}

const saveItem = async () => {
  try {
    loading.value = true

    if (editMode.value) {
      // Update
      const { error } = await supabase
        .from('items')
        .update({
          code: form.value.code,
          barcode: form.value.barcode,
          description: form.value.description,
          description_short: form.value.description_short,
          type: form.value.type,
          id_area: form.value.id_area,
          id_department: form.value.id_department,
          id_category: form.value.id_category,
          unit: form.value.unit,
          price1: form.value.price1,
          price2: form.value.price2,
          price3: form.value.price3,
          tax: form.value.tax,
          comission: form.value.comission,
        })
        .eq('id_item', form.value.id_item)

      if (error) throw error

      $q.notify({
        color: 'positive',
        message: 'Producto/Servicio actualizado correctamente',
        position: 'top-right',
        icon: 'check_circle'
      })
    } else {
      // Insert
      const { error } = await supabase
        .from('items')
        .insert({
          code: form.value.code,
          barcode: form.value.barcode,
          description: form.value.description,
          description_short: form.value.description_short,
          type: form.value.type,
          id_area: form.value.id_area,
          id_department: form.value.id_department,
          id_category: form.value.id_category,
          unit: form.value.unit,
          price1: form.value.price1,
          price2: form.value.price2,
          price3: form.value.price3,
          tax: form.value.tax,
          comission: form.value.comission
        })

      if (error) throw error

      $q.notify({
        color: 'positive',
        message: 'Registro creado correctamente',
        position: 'top-right',
        icon: 'check_circle'
      })
    }

    dialog.value = false
    await fetchItems()
  } catch (error) {
    console.error('Error saving item:', error.message)
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
      title: 'Confirmar borrado',
      message: '¿Estás seguro de eliminar este registro?',
      cancel: true,
      persistent: true
    }).onOk(async () => {
      try {
        loading.value = true
        const { error } = await supabase
          .from('items')
          .delete()
          .eq('id_item', row.id_item)

        if (error) throw error

        $q.notify({
          color: 'positive',
          message: 'Registro eliminado correctamente',
          position: 'top-right'
        })
        await fetchItems()
      } catch (error) {
        console.error('Error deleting item:', error.message)
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

const onFocus = (field) => {
  if (field === 'description_short' && !form.value.description_short) {
    form.value.description_short = form.value.description.substring(0, 20)
  }
}


// Function to print label (stub)
const printLabel = (row) => {
  $q.notify({
    color: 'info',
    message: `Imprimir etiqueta para: ${row.description}`,
    position: 'top-right'
  })
}


// **************************  Copilot inicio  *****************************

// sanitize code: keep digits only and return numeric string (no padding)
const extractDigits = raw => String(raw || '').replace(/\D/g, '')

// pad a numeric string left to 14 digits
const padCode = (numStr) => String(numStr || '').padStart(14, '0')

// compute next code from items table and set into form.code (14-digit left padded)
const setNextCode = async () => {
  try {
    const { data, error } = await supabase
      .from('items')
      .select('code')
      .order('code', { ascending: false })
      .limit(1)

    if (error) throw error

    let max = 0
    if (data && data.length) {
      const raw = String(data[0].code || '')
      const numeric = parseInt(extractDigits(raw), 10)
      max = Number.isNaN(numeric) ? 0 : numeric
    }

    const next = max + 1
    form.value.code = padCode(String(next))
  } catch (err) {
    console.error('Error computing next code:', err)
    form.value.code = padCode('1')
  }
}

// **************************  Copilot final  *****************************



const handleRealtime = (payload) => {
  console.log('Realtime payload on ItemsCrud.vue:', payload)
  if (payload.eventType === 'INSERT') {
    items.value.unshift(payload.new)
    // recompute next code to avoid duplicates when others insert
    setNextCode().catch(e => console.error(e))
  } else if (payload.eventType === 'UPDATE') {
    const idx = items.value.findIndex(d => d.id_item === payload.new.id_item)
    if (idx !== -1) items.value[idx] = payload.new
  } else if (payload.eventType === 'DELETE') {
    items.value = items.value.filter(d => d.id_item !== payload.old.id_item)
  }
}

// Watch for dialog changes to refresh data
watch(showAreaDialog, (newVal, oldVal) => {
  if (oldVal && !newVal) {
    fetchAreas()
  }
})

watch(showDepartmentDialog, (newVal, oldVal) => {
  if (oldVal && !newVal) {
    fetchDepartments()
  }
})

watch(showCategoryDialog, (newVal, oldVal) => {
  if (oldVal && !newVal) {
    fetchCategories()
  }
})

const downloadExcel = () => {
  try {
    const rows = items.value.map(x => ({
      Codigo: x.code,
      Barras: x.barcode,
      Descripcion: x.description,
      DescripcionCorta: x.description_short,
      Tipo: x.type === 'P' ? 'Producto' : 'Servicio',
      AreaID: x.id_area,
      DepartamentoID: x.id_department,
      CategoriaID: x.id_category,
      Unidad: x.unit,
      Precio1: x.price1,
      Precio2: x.price2,
      Precio3: x.price3,
      Impuesto: x.tax,
      Comision: x.comission,
    }))

    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Items')
    XLSX.writeFile(workbook, 'items.xlsx')

    $q.notify({
      color: 'positive',
      message: 'Excel generado',
      position: 'top-right'
    })
  } catch (e) {
    $q.notify({
      color: 'negative',
      message: `Error al exportar: ${e.message}`,
      position: 'top-right'
    })
  }
}

let channel = null

onMounted(async () => {
  console.log('Mounted ItemsCrud.vue before fetching data...')
  await Promise.all([
    fetchItems(),
    fetchAreas(),
    fetchDepartments(),
    fetchCategories()
  ])
  console.log('Mounted ItemsCrud.vue after fetching data and be')

  // Set up real-time subscription
  channel = supabase.channel('items-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, handleRealtime)
    .subscribe()
})

onBeforeUnmount(() => {
  if (channel) supabase.removeChannel(channel)
})
</script>

<style lang="sass">
.my-sticky-header-table
  /* height or max-height is important */
  height: 428px

  .q-table__top,
  .q-table__bottom,
  thead tr:first-child th
    /* bg color is important for th; just specify one */
    background-color: rgba(26, 66, 83) /* #1976D2  263238, 455a64 */

  thead tr th
    position: sticky
    z-index: 1
  thead tr:first-child th
    top: 0

  /* this is when the loading indicator appears */
  &.q-table--loading thead tr:last-child th
    /* height of all previous header rows */
    top: 148px

  /* prevent scrolling behind sticky top row on focus */
  tbody
    /* height of all previous header rows */
    scroll-margin-top: 148px


</style>
