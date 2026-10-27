'use client'

import { useState, useEffect, useMemo, useCallback, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/utils/supabase/client'
import { GlassCard } from '@/components/glass-card'
import { GlassButton } from '@/components/glass-button'
import { GlassInput } from '@/components/glass-input'
import { StatusBadge } from '@/components/status-badge'
import { CatalogoTabs } from '@/components/catalogo/catalogo-tabs'
import { type Item, type ItemClassification, type ItemImage, type Category, type Area, type Department, type Profile } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Tags, Search, Plus, Edit3, Trash2, RotateCcw,
  X, Check, Filter, Layers, DollarSign, Barcode,
  Image as ImageIcon, Package, Wrench, Sparkles, Percent, Loader2, Tag, FileText
} from 'lucide-react'
import { ProductImageManager, type ManagedImageItem } from '@/components/catalogo/product-image-manager'
import { ProductImageCarouselModal } from '@/components/catalogo/product-image-carousel-modal'
import { TableActionMenu, TableColumnHeader, TablePagination } from '@/components/tables'
import { useStore } from '@/components/providers/store-provider'
import { LabelPrintModal } from '@/components/labels/label-print-modal'
import { type LabelPrintQueueItem } from '@/lib/types'

interface ItemsClientProps {
  currentProfile?: Profile | null
}

interface ItemFormData {
  code: string
  barcode: string
  description: string
  description_short: string
  type: 'P' | 'S'
  classification: ItemClassification
  unit: string
  cost: number
  last_cost: number
  price: number
  price1: number
  price2: number
  price3: number
  tax: number
  comission: number
  id_category: string
  id_area: string
  id_department: string
  id_sat: string
  unit_sat: string
}

const INITIAL_FORM: ItemFormData = {
  code: '',
  barcode: '',
  description: '',
  description_short: '',
  type: 'P',
  classification: 'REGULAR',
  unit: 'Pza',
  cost: 0,
  last_cost: 0,
  price: 0,
  price1: 0,
  price2: 0,
  price3: 0,
  tax: 16,
  comission: 0,
  id_category: '',
  id_area: '',
  id_department: '',
  id_sat: '',
  unit_sat: 'H87',
}

// Ordena las imágenes de un producto colocando la portada (is_cover = true) en primer lugar
function sortItemImages(images?: ItemImage[]): ItemImage[] {
  if (!images || images.length === 0) return []
  return [...images].sort((a, b) => {
    if (a.is_cover && !b.is_cover) return -1
    if (!a.is_cover && b.is_cover) return 1
    return (a.created_at || '').localeCompare(b.created_at || '')
  })
}

/**
 * Calcula el siguiente código interno consecutivo con formato de 14 dígitos rellenos con ceros a la izquierda.
 * Ejemplo: Si el código numérico más alto es '00000000453082', devuelve '00000000453083'.
 */
function calculateNextItemCode(existingItems: Array<{ code?: string | null }>): string {
  let maxVal = BigInt(0)

  // 1. Priorizar códigos existentes en formato oficial de 14 dígitos con ceros iniciales
  for (const it of existingItems) {
    if (!it.code) continue
    const trimmed = it.code.trim()
    if (/^0+\d+$/.test(trimmed) && trimmed.length === 14) {
      try {
        const val = BigInt(trimmed)
        if (val > maxVal) maxVal = val
      } catch { }
    }
  }

  // 2. Si aún no hay registros de 14 dígitos con ceros a la izquierda, evaluar consecutivos numéricos generales
  // (omitiendo códigos de 12 o 13 dígitos que típicamente son códigos de barras comerciales EAN/UPC)
  if (maxVal === BigInt(0)) {
    for (const it of existingItems) {
      if (!it.code) continue
      const trimmed = it.code.trim()
      if (/^\d+$/.test(trimmed)) {
        if (trimmed.length === 12 || (trimmed.length === 13 && !trimmed.startsWith('0'))) {
          continue
        }
        try {
          const val = BigInt(trimmed)
          if (val > maxVal) maxVal = val
        } catch { }
      }
    }
  }

  const nextVal = maxVal + BigInt(1)
  return nextVal.toString().padStart(14, '0')
}



export function ItemsClient({ currentProfile }: ItemsClientProps = {}) {
  const supabase = createClient()

  const [profile, setProfile] = useState<Profile | null>(currentProfile ?? null)

  useEffect(() => {
    if (currentProfile) {
      setProfile(currentProfile)
      return
    }
    const loadProfile = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()
        if (data) setProfile(data as Profile)
      }
    }
    loadProfile()
  }, [currentProfile, supabase])

  const isAdmin = profile?.role === 'ADMIN'

  const [items, setItems] = useState<Item[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [areas, setAreas] = useState<Area[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('ALL')
  const [classificationFilter, setClassificationFilter] = useState<'ALL' | 'REGULAR' | 'FICHA_TECNICA'>('ALL')
  const [statusFilter, setStatusFilter] = useState<'A' | 'I' | 'ALL'>('A')
  const [activeTab, setActiveTab] = useState<'P' | 'S' | 'ALL'>('P')
  const [tabLoading, setTabLoading] = useState<'P' | 'S' | 'ALL' | null>(null)
  const [, startTransition] = useTransition()

  // Manejo de cambio de tab con spinner en el botón correspondiente
  const handleTabChange = useCallback((newTab: 'P' | 'S' | 'ALL') => {
    if (tabLoading !== null) return
    setTabLoading(newTab)
    setTimeout(() => {
      startTransition(() => {
        setActiveTab(newTab)
        setTabLoading(null)
      })
    }, 180)
  }, [tabLoading])

  // Realtime counters for products, services & classifications
  const stats = useMemo(() => {
    let products = 0
    let services = 0
    let regular = 0
    let fichaTecnica = 0
    items.forEach((item) => {
      if (item.type === 'S') {
        services++
      } else {
        products++
      }
      if (item.classification === 'FICHA_TECNICA') {
        fichaTecnica++
      } else {
        regular++
      }
    })
    return { products, services, regular, fichaTecnica, total: items.length }
  }, [items])

  // Modal State
  const [modalOpen, setModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<Item | null>(null)
  const [formData, setFormData] = useState<ItemFormData>(INITIAL_FORM)
  const [saving, setSaving] = useState(false)

  // Images State
  const [itemImages, setItemImages] = useState<ManagedImageItem[]>([])
  const [deletedImageIds, setDeletedImageIds] = useState<string[]>([])
  const [carouselModalItem, setCarouselModalItem] = useState<Item | null>(null)

  // Delete Confirm Dialog
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<Item | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Contexto de Sucursal e Impresión de Etiquetas
  const { storeId } = useStore()
  const [printModalOpen, setPrintModalOpen] = useState(false)
  const [printQueue, setPrintQueue] = useState<LabelPrintQueueItem[]>([])

  const handleOpenPrintModal = useCallback((itemsToPrint: Item[]) => {
    const queueItems: LabelPrintQueueItem[] = itemsToPrint.map((item) => ({
      id_item: item.id_item,
      code: item.code,
      barcode: item.barcode,
      description: item.description,
      price1: item.price1 || item.price,
      price2: item.price2,
      price3: item.price3,
      quantity: 1,
    }))
    setPrintQueue(queueItems)
    setPrintModalOpen(true)
  }, [])

  // Fetch Master Data (Solo se ejecuta una única vez al montar el componente)
  const fetchData = useCallback(async () => {
    setLoading(true)

    const [itemsRes, catsRes, areasRes, depsRes] = await Promise.all([
      supabase
        .from('items')
        .select(`
          *,
          category:categories(id_category, description),
          area:areas(id_area, description),
          department:departments(id_department, description),
          item_images(*)
        `)
        .order('description'),
      supabase.from('categories').select('*').eq('status', 'A').order('description'),
      supabase.from('areas').select('*').eq('status', 'A').order('description'),
      supabase.from('departments').select('*').eq('status', 'A').order('description'),
    ])

    if (itemsRes.data) {
      const formattedItems = (itemsRes.data as unknown as Item[]).map((it) => ({
        ...it,
        item_images: sortItemImages(it.item_images),
      }))
      setItems(formattedItems)
    }
    if (catsRes.data) setCategories(catsRes.data as Category[])
    if (areasRes.data) setAreas(areasRes.data as Area[])
    if (depsRes.data) setDepartments(depsRes.data as Department[])

    setLoading(false)
  }, [supabase])

  // Carga inicial una sola vez
  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Consulta granular de un único ítem para sincronización en tiempo real sin recargar la tabla completa
  const fetchSingleItem = useCallback(
    async (idItem: string): Promise<Item | null> => {
      const { data, error } = await supabase
        .from('items')
        .select(`
          *,
          category:categories(id_category, description),
          area:areas(id_area, description),
          department:departments(id_department, description),
          item_images(*)
        `)
        .eq('id_item', idItem)
        .single()

      if (error || !data) return null
      const it = data as unknown as Item
      return {
        ...it,
        item_images: sortItemImages(it.item_images),
      }
    },
    [supabase]
  )


  // 100% Realtime granular: actualiza ÚNICAMENTE el registro modificado en otra computadora
  useEffect(() => {
    const channel = supabase
      .channel('catalog-items-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'items' },
        async (payload) => {
          const newRec = payload.new as Record<string, unknown> | null
          const oldRec = payload.old as Record<string, unknown> | null

          if (payload.eventType === 'INSERT' && newRec?.id_item) {
            const newItem = await fetchSingleItem(newRec.id_item as string)
            if (newItem) {
              setItems((prev) => {
                if (prev.some((i) => i.id_item === newItem.id_item)) {
                  return prev.map((i) => (i.id_item === newItem.id_item ? newItem : i))
                }
                return [newItem, ...prev]
              })
            }
          } else if (payload.eventType === 'UPDATE' && newRec?.id_item) {
            const updated = await fetchSingleItem(newRec.id_item as string)
            if (updated) {
              setItems((prev) =>
                prev.map((i) => (i.id_item === updated.id_item ? updated : i))
              )
            }
          } else if (payload.eventType === 'DELETE' && oldRec?.id_item) {
            const deletedId = oldRec.id_item as string
            setItems((prev) => prev.filter((i) => i.id_item !== deletedId))
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'item_images' },
        async (payload) => {
          const newRec = payload.new as Record<string, unknown> | null
          const oldRec = payload.old as Record<string, unknown> | null
          let targetItemId = (newRec?.id_item as string) || (oldRec?.id_item as string)

          // Fallback para DELETE cuando Postgres solo envía la primary key
          if (!targetItemId && oldRec?.id_item_image) {
            setItems((prev) => {
              const found = prev.find((it) =>
                it.item_images?.some((img) => img.id_item_image === oldRec.id_item_image)
              )
              if (found) {
                targetItemId = found.id_item
              }
              return prev
            })
          }

          if (targetItemId) {
            const updated = await fetchSingleItem(targetItemId)
            if (updated) {
              setItems((prev) =>
                prev.map((i) => (i.id_item === updated.id_item ? updated : i))
              )
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'categories' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setCategories((prev) => [...prev, payload.new as Category].sort((a, b) => (a.description || '').localeCompare(b.description || '')))
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as Category
            setCategories((prev) =>
              prev.map((c) => (c.id_category === updated.id_category ? updated : c))
            )
            setItems((prev) =>
              prev.map((i) =>
                i.id_category === updated.id_category
                  ? { ...i, category: updated }
                  : i
              )
            )
          } else if (payload.eventType === 'DELETE' && payload.old?.id_category) {
            setCategories((prev) => prev.filter((c) => c.id_category !== payload.old.id_category))
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'areas' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setAreas((prev) => [...prev, payload.new as Area].sort((a, b) => (a.description || '').localeCompare(b.description || '')))
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as Area
            setAreas((prev) =>
              prev.map((a) => (a.id_area === updated.id_area ? updated : a))
            )
            setItems((prev) =>
              prev.map((i) =>
                i.id_area === updated.id_area
                  ? { ...i, area: updated }
                  : i
              )
            )
          } else if (payload.eventType === 'DELETE' && payload.old?.id_area) {
            setAreas((prev) => prev.filter((a) => a.id_area !== payload.old.id_area))
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'departments' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setDepartments((prev) => [...prev, payload.new as Department].sort((a, b) => (a.description || '').localeCompare(b.description || '')))
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as Department
            setDepartments((prev) =>
              prev.map((d) => (d.id_department === updated.id_department ? updated : d))
            )
            setItems((prev) =>
              prev.map((i) =>
                i.id_department === updated.id_department
                  ? { ...i, department: updated }
                  : i
              )
            )
          } else if (payload.eventType === 'DELETE' && payload.old?.id_department) {
            setDepartments((prev) => prev.filter((d) => d.id_department !== payload.old.id_department))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, fetchSingleItem])

  // Filtered Items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Classification Tab Filter
      if (activeTab === 'P' && item.type === 'S') return false
      if (activeTab === 'S' && item.type !== 'S') return false

      if (statusFilter !== 'ALL' && item.status !== statusFilter) return false
      if (categoryFilter !== 'ALL' && item.id_category !== categoryFilter) return false
      if (classificationFilter !== 'ALL' && (item.classification || 'REGULAR') !== classificationFilter) return false

      if (search.trim()) {
        const q = search.toLowerCase()
        const desc = item.description?.toLowerCase() ?? ''
        const code = item.code?.toLowerCase() ?? ''
        const barcode = item.barcode?.toLowerCase() ?? ''
        if (!desc.includes(q) && !code.includes(q) && !barcode.includes(q)) return false
      }

      return true
    })
  }, [items, search, categoryFilter, classificationFilter, statusFilter, activeTab])

  // Sorting state
  const [sortKey, setSortKey] = useState<string>('description')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDirection('asc')
    }
  }

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [search, categoryFilter, classificationFilter, statusFilter, activeTab])

  // Sorted items
  const sortedItems = useMemo(() => {
    const list = [...filteredItems]
    if (!sortKey) return list

    return list.sort((a, b) => {
      let aVal: string | number = ''
      let bVal: string | number = ''

      switch (sortKey) {
        case 'description':
          aVal = (a.description || '').toLowerCase()
          bVal = (b.description || '').toLowerCase()
          break
        case 'category':
          aVal = (a.category?.description || '').toLowerCase()
          bVal = (b.category?.description || '').toLowerCase()
          break
        case 'type':
          aVal = `${a.type || ''}-${a.unit || ''}`.toLowerCase()
          bVal = `${b.type || ''}-${b.unit || ''}`.toLowerCase()
          break
        case 'classification':
          aVal = (a.classification || 'REGULAR').toLowerCase()
          bVal = (b.classification || 'REGULAR').toLowerCase()
          break
        case 'cost':
          if (!isAdmin) break
          aVal = Number(a.cost || 0)
          bVal = Number(b.cost || 0)
          break
        case 'price1':
          aVal = Number(a.price1 || a.price || 0)
          bVal = Number(b.price1 || b.price || 0)
          break
        case 'price2':
          aVal = Number(a.price2 || 0)
          bVal = Number(b.price2 || 0)
          break
        case 'price3':
          aVal = Number(a.price3 || 0)
          bVal = Number(b.price3 || 0)
          break
        case 'status':
          aVal = a.status || ''
          bVal = b.status || ''
          break
        default:
          return 0
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
  }, [filteredItems, sortKey, sortDirection])

  const totalPages = Math.ceil(sortedItems.length / pageSize) || 1
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedItems.slice(start, start + pageSize)
  }, [sortedItems, currentPage, pageSize])

  // Open Create Modal
  const handleOpenCreate = async (targetType?: 'P' | 'S') => {
    const selectedType: 'P' | 'S' = targetType || (activeTab === 'S' ? 'S' : 'P')

    // Consultar directamente los códigos más recientes en BD para asegurar el mayor consecutivo global real
    let combinedItems: Array<{ code?: string | null }> = items
    try {
      const { data: recentCodes } = await supabase
        .from('items')
        .select('code')
        .not('code', 'is', null)
        .order('code', { ascending: false })
        .limit(30)

      if (recentCodes && recentCodes.length > 0) {
        combinedItems = [...items, ...(recentCodes as Array<{ code: string }>)]
      }
    } catch (err) {
      console.error('Error al consultar códigos recientes en BD:', err)
    }

    const calculatedCode = calculateNextItemCode(combinedItems)

    setEditingItem(null)
    setFormData({
      ...INITIAL_FORM,
      code: calculatedCode,
      barcode: calculatedCode, // Por default el código de barras es igual al código interno
      type: selectedType,
      classification: 'REGULAR',
      unit: selectedType === 'S' ? 'Servicio' : 'Pza',
      unit_sat: selectedType === 'S' ? 'E48' : 'H87',
    })
    setItemImages([])
    setDeletedImageIds([])
    setModalOpen(true)
  }



  // Open Edit Modal
  const handleOpenEdit = (item: Item) => {
    setEditingItem(item)
    setFormData({
      code: item.code || '',
      barcode: item.barcode || '',
      description: item.description || '',
      description_short: item.description_short || '',
      type: (item.type as 'P' | 'S') || 'P',
      classification: (item.classification as ItemClassification) || 'REGULAR',
      unit: item.unit || 'Pza',
      cost: isAdmin ? (Number(item.cost) || 0) : 0,
      last_cost: isAdmin ? (Number(item.last_cost) || 0) : 0,
      price: Number(item.price) || 0,
      price1: Number(item.price1) || 0,
      price2: Number(item.price2) || 0,
      price3: Number(item.price3) || 0,
      tax: Number(item.tax) ?? 16,
      comission: Number(item.comission) || 0,
      id_category: item.id_category || '',
      id_area: item.id_area || '',
      id_department: item.id_department || '',
      id_sat: item.id_sat || '',
      unit_sat: item.unit_sat || 'H87',
    })

    // Map existing images to image manager state, placing cover image first
    const sortedImages = sortItemImages(item.item_images)
    const hasAnyCover = sortedImages.some((img) => img.is_cover)
    const mappedImages: ManagedImageItem[] = sortedImages.map((img, idx) => ({
      id: img.id_item_image,
      url: img.image_url || '',
      storagePath: img.image_path || undefined,
      isExisting: true,
      isCover: hasAnyCover ? Boolean(img.is_cover) : idx === 0,
    }))
    setItemImages(mappedImages)
    setDeletedImageIds([])
    setModalOpen(true)
  }

  // Sync images with Supabase Storage and public.item_images
  const handleSyncImages = async (targetItemId: string, itemType: 'P' | 'S') => {
    // Los servicios no tienen fotografía
    if (itemType === 'S') return

    // 1. Delete removed images from DB and Storage
    if (deletedImageIds.length > 0) {
      await supabase.from('item_images').delete().in('id_item_image', deletedImageIds)
    }

    // 2. Base timestamp para ordenar secuencialmente las imágenes en la base de datos
    // La imagen en índice 0 (portada) tendrá la fecha más antigua garantizada
    const baseTimestamp = new Date('2024-01-01T00:00:00.000Z').getTime()

    // 3. Subir e insertar imágenes nuevas
    const newItems = itemImages.filter((img) => img.isNew && img.blob)
    for (let i = 0; i < newItems.length; i++) {
      const imgItem = newItems[i]
      const overallIndex = itemImages.indexOf(imgItem)
      const isThisCover = overallIndex === 0
      const sequentialDate = new Date(baseTimestamp + (overallIndex * 1000)).toISOString()
      const filePath = `items/${targetItemId}/${Date.now()}_${i}_${Math.random().toString(36).substring(2, 7)}.webp`

      const { error: uploadError } = await supabase.storage
        .from('item_images')
        .upload(filePath, imgItem.blob!, {
          contentType: 'image/webp',
          upsert: true,
        })

      if (!uploadError) {
        const { data: publicUrlData } = supabase.storage
          .from('item_images')
          .getPublicUrl(filePath)

        const insertPayload: Record<string, unknown> = {
          id_item: targetItemId,
          image_url: publicUrlData.publicUrl,
          image_path: filePath,
          created_at: sequentialDate,
          is_cover: isThisCover,
        }

        const { error: insertError } = await supabase.from('item_images').insert(insertPayload)
        if (insertError) {
          // Si la columna is_cover aún no está disponible en cache de PostgREST, reintentar sin ella
          if (insertError.message?.includes('is_cover')) {
            delete insertPayload.is_cover
            await supabase.from('item_images').insert(insertPayload)
          } else {
            console.error('Error al insertar imagen en base de datos:', insertError)
          }
        }
      } else {
        console.error('Error al subir imagen al bucket item_images:', uploadError)
      }
    }

    // 4. Actualizar el orden secuencial y portada de las imágenes existentes en Postgres
    const existingItems = itemImages.filter((img) => img.isExisting && img.id)
    for (let idx = 0; idx < existingItems.length; idx++) {
      const existing = existingItems[idx]
      const overallIndex = itemImages.indexOf(existing)
      const isThisCover = overallIndex === 0
      const sequentialDate = new Date(baseTimestamp + (overallIndex * 1000)).toISOString()

      const updatePayload: Record<string, unknown> = {
        created_at: sequentialDate,
        is_cover: isThisCover,
      }

      const { error: updateError } = await supabase
        .from('item_images')
        .update(updatePayload)
        .eq('id_item_image', existing.id)

      if (updateError) {
        // Fallback: si is_cover no existe en BD, actualizar created_at para fijar el orden de portada
        if (updateError.message?.includes('is_cover')) {
          delete updatePayload.is_cover
          await supabase
            .from('item_images')
            .update(updatePayload)
            .eq('id_item_image', existing.id)
        } else {
          console.error('Error al actualizar created_at/is_cover en item_images:', updateError)
        }
      }
    }
  }

  // Save Item (Create or Update)
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.description.trim()) {
      toast.error('La descripción del artículo es obligatoria')
      return
    }

    setSaving(true)

    // Resolver códigos (código interno automático / inmutable, código de barras editable)
    let resolvedCode = formData.code.trim()
    let resolvedBarcode = formData.barcode.trim()
    const originalProposedCode = resolvedCode
    const wasBarcodeDefault = !resolvedBarcode || resolvedBarcode === originalProposedCode
    let wasReassigned = false

    if (!editingItem) {
      if (!resolvedCode) {
        resolvedCode = calculateNextItemCode(items)
        if (wasBarcodeDefault) {
          resolvedBarcode = resolvedCode
        }
      } else {
        // Verificar si alguien más registró este código entretanto para prevenir duplicados
        const { data: duplicate } = await supabase
          .from('items')
          .select('id_item')
          .eq('code', resolvedCode)
          .eq('status', 'A')
          .maybeSingle()

        if (duplicate) {
          wasReassigned = true
          const { data: recentCodes } = await supabase
            .from('items')
            .select('code')
            .not('code', 'is', null)
            .order('code', { ascending: false })
            .limit(50)

          const combined = [...items, ...(recentCodes || [])]
          const freshCode = calculateNextItemCode(combined)
          resolvedCode = freshCode
          if (wasBarcodeDefault) {
            resolvedBarcode = freshCode
          }
        }
      }
      if (!resolvedBarcode) {
        resolvedBarcode = resolvedCode
      }
    } else {
      // En edición de producto existente, el código interno es estrictamente inmutable
      resolvedCode = editingItem.code || formData.code.trim()
    }

    const payload: Record<string, unknown> = {
      code: resolvedCode || null,
      barcode: resolvedBarcode || null,
      description: formData.description.trim(),
      description_short: formData.description_short.trim() || null,
      type: formData.type,
      classification: formData.classification || 'REGULAR',
      unit: formData.unit.trim() || 'Pza',
      price: Number(formData.price) || 0,
      price1: Number(formData.price1) || 0,
      price2: Number(formData.price2) || 0,
      price3: Number(formData.price3) || 0,
      tax: Number(formData.tax) || 0,
      comission: Number(formData.comission) || 0,
      id_category: formData.id_category || null,
      id_area: formData.id_area || null,
      id_department: formData.id_department || null,
      id_sat: formData.id_sat.trim() || null,
      unit_sat: formData.unit_sat.trim() || null,
    }

    if (isAdmin) {
      payload.cost = Number(formData.cost) || 0
      payload.last_cost = Number(formData.last_cost) || 0
    } else if (editingItem) {
      // Si el usuario no es ADMIN, mantener los costos originales del artículo
      payload.cost = Number(editingItem.cost) || 0
      payload.last_cost = Number(editingItem.last_cost) || 0
    } else {
      // Alta por usuario no-ADMIN: costo en 0
      payload.cost = 0
      payload.last_cost = 0
    }

    if (editingItem) {
      // 1. Sincronizar imágenes y orden/portada en BD primero
      await handleSyncImages(editingItem.id_item, formData.type)

      // 2. Actualizar el registro en items (dispara Realtime en items con imágenes ya listas)
      const { error } = await supabase
        .from('items')
        .update(payload)
        .eq('id_item', editingItem.id_item)

      if (error) {
        setSaving(false)
        toast.error('Error al actualizar artículo: ' + error.message)
        return
      }

      const updated = await fetchSingleItem(editingItem.id_item)
      if (updated) {
        setItems((prev) => prev.map((i) => (i.id_item === updated.id_item ? updated : i)))
      }
      setSaving(false)
      toast.success(
        formData.type === 'S'
          ? 'Servicio actualizado correctamente'
          : 'Producto e imagen de portada actualizados correctamente en tiempo real'
      )
      setModalOpen(false)
    } else {
      // Manejo de inserción con reintento automático contra colisiones de concurrencia
      let insertSuccess = false
      let insertAttempts = 0
      let createdItem: Record<string, unknown> | null = null

      while (!insertSuccess && insertAttempts < 4) {
        insertAttempts++
        payload.code = resolvedCode || null
        payload.barcode = resolvedBarcode || null

        const { data, error } = await supabase
          .from('items')
          .insert([{ ...payload, status: 'A' }])
          .select()
          .single()

        if (!error && data) {
          createdItem = data
          insertSuccess = true
        } else if (
          error &&
          (error.code === '23505' ||
            error.message?.includes('duplicate key') ||
            error.message?.includes('idx_items_code') ||
            error.message?.includes('unique'))
        ) {
          // Colisión de concurrencia exacta: recalcular siguiente número libre y reintentar
          wasReassigned = true
          const { data: recentCodes } = await supabase
            .from('items')
            .select('code')
            .not('code', 'is', null)
            .order('code', { ascending: false })
            .limit(50)

          const combined = [...items, ...(recentCodes || [])]
          const freshCode = calculateNextItemCode(combined)
          resolvedCode = freshCode
          if (wasBarcodeDefault) {
            resolvedBarcode = freshCode
          }
        } else {
          setSaving(false)
          toast.error('Error al crear artículo: ' + (error?.message || ''))
          return
        }
      }

      if (!createdItem) {
        setSaving(false)
        toast.error('No se pudo asignar un código único disponible. Por favor intente nuevamente.')
        return
      }

      await handleSyncImages(createdItem.id_item as string, formData.type)
      const created = await fetchSingleItem(createdItem.id_item as string)
      if (created) {
        setItems((prev) => {
          if (prev.some((i) => i.id_item === created.id_item)) {
            return prev.map((i) => (i.id_item === created.id_item ? created : i))
          }
          return [created, ...prev]
        })
      }
      setSaving(false)

      if (wasReassigned) {
        toast.info(
          `Código interno asignado: ${resolvedCode} (el código ${originalProposedCode} fue registrado simultáneamente por otro usuario).`,
          { duration: 7000 }
        )
      }

      toast.success(
        formData.type === 'S'
          ? 'Servicio creado exitosamente'
          : 'Producto creado exitosamente con sus imágenes'
      )
      setModalOpen(false)
    }
  }

  // Soft Delete Item
  const handleConfirmDelete = async () => {
    if (!itemToDelete) return
    setDeleting(true)

    const nextStatus = itemToDelete.status === 'A' ? 'I' : 'A'
    const { error } = await supabase
      .from('items')
      .update({ status: nextStatus })
      .eq('id_item', itemToDelete.id_item)

    setDeleting(false)
    setDeleteConfirmOpen(false)

    if (error) {
      toast.error('Error al modificar estado del artículo')
    } else {
      setItems((prev) =>
        prev.map((i) =>
          i.id_item === itemToDelete.id_item ? { ...i, status: nextStatus } : i
        )
      )
      toast.success(
        nextStatus === 'I' ? 'Artículo desactivado (eliminación lógica)' : 'Artículo reactivado'
      )
    }
  }

  return (
    <div className="h-full flex-1 flex flex-col min-h-0 gap-2.5 sm:gap-3">
      <div className="dashboard-bg" />

      {/* Header and Sub-Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shrink-0">
        <div>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-foreground flex items-center gap-2 leading-tight">
            <Tags className="text-emerald-500" size={20} />
            Catálogo de Artículos
          </h1>
          <p className="text-xs text-muted-foreground line-clamp-1">
            Gestión de productos y servicios
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CatalogoTabs />
          <GlassButton
            variant="secondary"
            size="sm"
            className="text-xs h-8 sm:h-9 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
            onClick={() => {
              const productsOnly = filteredItems.filter((i) => i.type !== 'S' && i.status === 'A')
              if (productsOnly.length === 0) {
                toast.error('No hay productos disponibles para imprimir etiquetas.')
                return
              }
              handleOpenPrintModal(productsOnly.slice(0, 20))
            }}
          >
            <Tag size={15} className="mr-1 text-emerald-400" />
            Imprimir Etiquetas
          </GlassButton>
          <GlassButton variant="primary" size="sm" className="text-xs h-8 sm:h-9" onClick={() => handleOpenCreate()}>
            <Plus size={15} className="mr-1" />
            {activeTab === 'S' ? 'Nuevo Servicio' : activeTab === 'P' ? 'Nuevo Producto' : 'Nuevo Artículo'}
          </GlassButton>
        </div>
      </div>

      {/* Tabs de Segmentación: Productos vs Servicios */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-1 rounded-xl glass border border-white/10 shrink-0">
        <div className="flex items-center gap-1 p-0.5 rounded-lg glass-input">
          <button
            type="button"
            onClick={() => handleTabChange('P')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all duration-150 cursor-pointer ${activeTab === 'P'
              ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/25'
              : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
              }`}
          >
            {tabLoading === 'P' ? (
              <Loader2 size={13} className="animate-spin text-white" />
            ) : (
              <Package size={13} />
            )}
            <span>Productos</span>
            <span
              className={`px-1.5 py-0.2 rounded-md text-[10px] font-bold ${activeTab === 'P' ? 'bg-white/20 text-white' : 'bg-white/10 text-muted-foreground'
                }`}
            >
              {stats.products}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('S')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all duration-150 cursor-pointer ${activeTab === 'S'
              ? 'bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/25'
              : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
              }`}
          >
            {tabLoading === 'S' ? (
              <Loader2 size={13} className="animate-spin text-white" />
            ) : (
              <Wrench size={13} />
            )}
            <span>Servicios</span>
            <span
              className={`px-1.5 py-0.2 rounded-md text-[10px] font-bold ${activeTab === 'S' ? 'bg-white/20 text-white' : 'bg-white/10 text-muted-foreground'
                }`}
            >
              {stats.services}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('ALL')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all duration-150 cursor-pointer ${activeTab === 'ALL'
              ? 'bg-gradient-to-r from-slate-700 to-slate-900 text-white shadow-md shadow-slate-500/25 dark:from-white/20 dark:to-white/10 dark:text-white'
              : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
              }`}
          >
            {tabLoading === 'ALL' ? (
              <Loader2 size={13} className="animate-spin text-white" />
            ) : (
              <Layers size={13} />
            )}
            <span>Todos</span>
            <span
              className={`text-[10px] font-bold px-1.5 py-0.2 rounded-md ${activeTab === 'ALL' ? 'bg-white/20 text-white' : 'bg-white/10 text-muted-foreground'
                }`}
            >
              {stats.total}
            </span>
          </button>
        </div>

        {/* Info contextual sutil */}
        <div className="hidden sm:flex items-center gap-2 text-xs px-2">
          {activeTab === 'P' && (
            <span className="flex items-center gap-1.5 text-emerald-400 font-medium text-[11px]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Artículos físicos · Control de inventario y fotografías
            </span>
          )}
          {activeTab === 'S' && (
            <span className="flex items-center gap-1.5 text-indigo-400 font-medium text-[11px]">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
              Servicios intangibles · Sin fotografías · Mano de obra & comisiones
            </span>
          )}
          {activeTab === 'ALL' && (
            <span className="flex items-center gap-1.5 text-muted-foreground font-medium text-[11px]">
              Vista general consolidada del catálogo
            </span>
          )}
        </div>
      </div>

      {/* Filters Bar */}
      <GlassCard padding="none" className="p-2 shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
          <div className="flex-1 max-w-md">
            <GlassInput
              placeholder="Buscar por código, código de barras o descripción..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              icon={<Search size={15} />}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Category Filter */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl glass-input text-xs font-medium">
              <Layers size={13} className="text-muted-foreground" />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="bg-transparent border-none text-foreground text-xs focus:outline-none cursor-pointer"
              >
                <option value="ALL" className="bg-zinc-900 text-white">Todas las categorías</option>
                {categories.map((c) => (
                  <option key={c.id_category} value={c.id_category} className="bg-zinc-900 text-white">
                    {c.description}
                  </option>
                ))}
              </select>
            </div>

            {/* Classification Filter */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl glass-input text-xs font-medium">
              <FileText size={13} className="text-muted-foreground" />
              <select
                value={classificationFilter}
                onChange={(e) => setClassificationFilter(e.target.value as 'ALL' | 'REGULAR' | 'FICHA_TECNICA')}
                className="bg-transparent border-none text-foreground text-xs focus:outline-none cursor-pointer"
              >
                <option value="ALL" className="bg-zinc-900 text-white">Todas las clasificaciones</option>
                <option value="REGULAR" className="bg-zinc-900 text-white">Regular ({stats.regular})</option>
                <option value="FICHA_TECNICA" className="bg-zinc-900 text-white">Pieza Técnica ({stats.fichaTecnica})</option>
              </select>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1 p-0.5 rounded-xl glass border border-border/40">
              <button
                onClick={() => setStatusFilter('A')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${statusFilter === 'A'
                  ? 'bg-emerald-500 text-white shadow-sm font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
                  }`}
              >
                Activos
              </button>
              <button
                onClick={() => setStatusFilter('I')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${statusFilter === 'I'
                  ? 'bg-emerald-500 text-white shadow-sm font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
                  }`}
              >
                Inactivos
              </button>
              <button
                onClick={() => setStatusFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${statusFilter === 'ALL'
                  ? 'bg-emerald-500 text-white shadow-sm font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
                  }`}
              >
                Todos
              </button>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Items Table */}
      <GlassCard padding="none" className="overflow-hidden shadow-xl flex-1 min-h-0 flex flex-col">
        <div className={`overflow-x-auto overflow-y-auto flex-1 min-h-0 scroll-modern transition-opacity duration-150 ${tabLoading !== null ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
          <table className="w-full text-left text-sm border-separate border-spacing-0">
            <thead className="sticky top-0 z-20">
              <tr className="glass-table-header border-b border-border/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="w-20 px-4 py-3.5 text-center sticky top-0 z-20 bg-white dark:bg-card">
                  Acciones
                </th>
                <TableColumnHeader
                  title={activeTab === 'S' ? 'Servicio' : activeTab === 'P' ? 'Producto' : 'Artículo'}
                  sortKey="description"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                />
                <TableColumnHeader
                  title="Categoría / Área"
                  sortKey="category"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                />
                <TableColumnHeader
                  title="Tipo / Unidad"
                  sortKey="type"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  align="center"
                />
                <TableColumnHeader
                  title="Clasificación"
                  sortKey="classification"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  align="center"
                />
                {isAdmin && (
                  <TableColumnHeader
                    title={activeTab === 'S' ? 'Costo Base' : 'Costo'}
                    sortKey="cost"
                    currentSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    align="right"
                  />
                )}
                <TableColumnHeader
                  title={activeTab === 'S' ? 'Tarifa 1 (Menudeo)' : 'P1 (Menudeo)'}
                  sortKey="price1"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  align="right"
                />
                <TableColumnHeader
                  title={activeTab === 'S' ? 'Tarifa 2 (Mayoreo)' : 'P2 (Mayoreo)'}
                  sortKey="price2"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  align="right"
                />
                <TableColumnHeader
                  title={activeTab === 'S' ? 'Tarifa 3' : 'Precio 3'}
                  sortKey="price3"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  align="right"
                />
                <TableColumnHeader
                  title="Estado"
                  sortKey="status"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  align="center"
                />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {loading ? (
                <tr>
                  <td colSpan={isAdmin ? 10 : 9} className="px-4 py-16 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-2.5" role="status" aria-live="polite">
                      <Loader2
                        size={28}
                        className="animate-spin text-emerald-500"
                      />
                      <span className="text-sm font-medium">Cargando catálogo...</span>
                    </div>
                  </td>
                </tr>
              ) : paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 10 : 9} className="px-4 py-12 text-center text-muted-foreground">
                    <p className="text-base font-medium">
                      {activeTab === 'S'
                        ? 'No se encontraron servicios'
                        : activeTab === 'P'
                          ? 'No se encontraron productos'
                          : 'No se encontraron artículos'}
                    </p>
                    <p className="text-xs text-muted-foreground/80 mt-1">
                      {search
                        ? 'Modifique el término de búsqueda o filtros'
                        : activeTab === 'S'
                          ? 'Haga clic en "+ Nuevo Servicio" para registrar el primero'
                          : 'Haga clic en "+ Nuevo Producto" para registrar el primero'}
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedItems.map((item) => {
                  const isService = item.type === 'S'
                  const hasImages = !isService && item.item_images && item.item_images.length > 0

                  return (
                    <tr key={item.id_item} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="w-20 px-4 py-3.5 text-center">
                        <TableActionMenu
                          items={[
                            {
                              label: isService ? 'Editar Servicio' : 'Editar Producto',
                              icon: <Edit3 size={15} />,
                              onClick: () => handleOpenEdit(item),
                              variant: isService ? 'indigo' : 'primary',
                            },
                            ...(hasImages
                              ? [
                                {
                                  label: `Ver fotos (${item.item_images!.length})`,
                                  icon: <ImageIcon size={15} />,
                                  onClick: () => setCarouselModalItem(item),
                                  variant: 'default' as const,
                                },
                              ]
                              : []),
                            ...(!isService
                              ? [
                                {
                                  label: 'Imprimir etiqueta',
                                  icon: <Barcode size={15} />,
                                  onClick: () => handleOpenPrintModal([item]),
                                  variant: 'default' as const,
                                },
                              ]
                              : []),
                            {
                              label:
                                item.status === 'A'
                                  ? `Desactivar ${isService ? 'servicio' : 'producto'}`
                                  : `Reactivar ${isService ? 'servicio' : 'producto'}`,
                              icon:
                                item.status === 'A' ? (
                                  <Trash2 size={15} />
                                ) : (
                                  <RotateCcw size={15} />
                                ),
                              onClick: () => {
                                setItemToDelete(item)
                                setDeleteConfirmOpen(true)
                              },
                              variant: item.status === 'A' ? 'danger' : 'primary',
                              separatorBefore: true,
                            },
                          ]}
                        />
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          {/* Visual element: Product Thumbnail with carousel vs Service Icon without photo */}
                          {isService ? (
                            <div
                              onClick={() => handleOpenEdit(item)}
                              className="w-11 h-11 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0 shadow-xs group-hover:border-indigo-500/60 transition-colors cursor-pointer"
                              title="Servicio (sin fotografía)"
                            >
                              <Wrench size={18} />
                            </div>
                          ) : item.item_images && item.item_images.length > 0 ? (
                            (() => {
                              const coverImg = item.item_images.find((img) => img.is_cover) || item.item_images[0]
                              return (
                                <button
                                  type="button"
                                  onClick={() => setCarouselModalItem(item)}
                                  className="relative w-11 h-11 rounded-xl overflow-hidden border border-border/60 hover:border-emerald-500/80 transition-all shrink-0 group/img shadow-xs active:scale-95 cursor-pointer"
                                  title={`Ver ${item.item_images.length} fotos en carrusel`}
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={coverImg.image_url || ''}
                                    alt={item.description || 'Producto'}
                                    className="w-full h-full object-cover group-hover/img:scale-110 transition-transform duration-300"
                                    loading="lazy"
                                  />
                                  {item.item_images.length > 1 && (
                                    <span className="absolute bottom-0 right-0 px-1 py-0.2 rounded-tl-md bg-black/80 backdrop-blur-xs text-[9px] font-bold text-emerald-400">
                                      +{item.item_images.length - 1}
                                    </span>
                                  )}
                                </button>
                              )
                            })()
                          ) : (
                            <div
                              onClick={() => handleOpenEdit(item)}
                              className="w-11 h-11 rounded-xl bg-white/[0.03] border border-border/40 flex items-center justify-center text-muted-foreground/40 hover:text-emerald-400 hover:border-emerald-500/40 cursor-pointer transition-colors shrink-0"
                              title="Haz clic para agregar fotografías al producto"
                            >
                              <ImageIcon size={18} />
                            </div>
                          )}

                          <div className="flex flex-col">
                            <span
                              onClick={() => handleOpenEdit(item)}
                              className={`font-semibold transition-colors cursor-pointer ${isService
                                ? 'text-foreground group-hover:text-indigo-400'
                                : 'text-foreground group-hover:text-emerald-400'
                                }`}
                            >
                              {item.description}
                            </span>
                            <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground font-mono">
                              {item.code && <span>Cód: {item.code}</span>}
                              {item.barcode && <span>CB: {item.barcode}</span>}
                              {isService && Number(item.comission) > 0 && (
                                <span className="text-indigo-400 font-sans font-medium text-[11px]">
                                  · Comis: {item.comission}%
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3.5 text-xs text-muted-foreground">
                        <div>{item.category?.description || 'Sin categoría'}</div>
                        <div className="text-[11px] text-muted-foreground/60">{item.area?.description || '—'}</div>
                      </td>

                      <td className="px-4 py-3.5 text-center text-xs">
                        {isService ? (
                          <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/25 text-indigo-300 font-medium text-[11px] inline-flex items-center gap-1">
                            <Wrench size={11} />
                            Servicio · {item.unit || 'Servicio'}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 font-medium text-[11px] inline-flex items-center gap-1">
                            <Package size={11} />
                            Producto · {item.unit || 'Pza'}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-center text-xs">
                        {item.classification === 'FICHA_TECNICA' ? (
                          <span className="px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 font-medium text-[11px] inline-flex items-center gap-1 shadow-xs">
                            <FileText size={11} />
                            Pieza Técnica
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-medium text-[11px] inline-flex items-center gap-1 shadow-xs">
                            <Tag size={11} />
                            Regular
                          </span>
                        )}
                      </td>

                      {isAdmin && (
                        <td className="px-4 py-3.5 text-right font-mono text-xs text-muted-foreground">
                          {formatCurrency(Number(item.cost))}
                        </td>
                      )}

                      <td className="px-4 py-3.5 text-right font-mono text-xs font-bold text-emerald-400">
                        {formatCurrency(Number(item.price1 || item.price))}
                      </td>

                      <td className="px-4 py-3.5 text-right font-mono text-xs text-foreground">
                        {formatCurrency(Number(item.price2))}
                      </td>

                      <td className="px-4 py-3.5 text-right font-mono text-xs text-foreground">
                        {formatCurrency(Number(item.price3))}
                      </td>

                      <td className="px-4 py-3.5 text-center">
                        <StatusBadge status={item.status} />
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={sortedItems.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          realtimeLabel="Catálogo sincronizado en tiempo real"
        />
      </GlassCard>

      {/* Modal: Create / Edit Item */}
      <AnimatePresence>
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="glass-card max-w-2xl w-full flex flex-col max-h-[92dvh] sm:max-h-[90vh] overflow-hidden rounded-2xl sm:rounded-3xl shadow-2xl"
            >
              {/* Header Fijo */}
              <div className="flex items-center justify-between border-b border-border/40 px-4 py-3 sm:px-6 sm:py-4 bg-card/95 dark:bg-card/90 backdrop-blur-xl shrink-0 z-10">
                <h3 className="text-sm sm:text-base font-bold text-foreground flex items-center gap-2 truncate pr-2">
                  {formData.type === 'S' ? (
                    <>
                      <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400 shrink-0">
                        <Wrench size={16} />
                      </div>
                      <span className="truncate">{editingItem ? 'Editar Servicio' : 'Nuevo Servicio'}</span>
                    </>
                  ) : (
                    <>
                      <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 shrink-0">
                        <Package size={16} />
                      </div>
                      <span className="truncate">{editingItem ? 'Editar Producto' : 'Nuevo Producto'}</span>
                    </>
                  )}
                </h3>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors shrink-0"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Cuerpo desplazable */}
              <div className="flex-1 min-h-0 overflow-y-auto scroll-modern p-4 sm:p-6">
                <form id="item-form" onSubmit={handleSave} className="space-y-4">
                  {/* Segmented Switch: Tipo de Artículo (Producto vs Servicio) */}
                  <div className="p-1 rounded-xl glass border border-white/10 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setFormData((prev) => ({
                          ...prev,
                          type: 'P',
                          unit: prev.unit === 'Servicio' ? 'Pza' : prev.unit,
                          unit_sat: prev.unit_sat === 'E48' ? 'H87' : prev.unit_sat,
                        }))
                      }}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${formData.type === 'P'
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                        }`}
                    >
                      <Package size={15} />
                      <span>Producto (Físico)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFormData((prev) => ({
                          ...prev,
                          type: 'S',
                          unit: prev.unit === 'Pza' ? 'Servicio' : prev.unit,
                          unit_sat: prev.unit_sat === 'H87' ? 'E48' : prev.unit_sat,
                        }))
                      }}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${formData.type === 'S'
                        ? 'bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                        }`}
                    >
                      <Wrench size={15} />
                      <span>Servicio (Mano de Obra)</span>
                    </button>
                  </div>

                {/* Segmented Switch: Clasificación (Regular vs Pieza Técnica) */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    Clasificación del Artículo
                  </label>
                  <div className="p-1 rounded-xl glass border border-white/10 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        setFormData((prev) => ({
                          ...prev,
                          classification: 'REGULAR',
                        }))
                      }
                      className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${formData.classification === 'REGULAR'
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                        }`}
                    >
                      <Tag size={14} />
                      <span>Regular</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setFormData((prev) => ({
                          ...prev,
                          classification: 'FICHA_TECNICA',
                        }))
                      }
                      className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${formData.classification === 'FICHA_TECNICA'
                        ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                        }`}
                    >
                      <FileText size={14} />
                      <span>Pieza Técnica</span>
                    </button>
                  </div>
                </div>

                {/* Basic Identification */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-muted-foreground block">
                        Código Interno
                      </label>
                      <span className="text-[10px] text-emerald-400 font-medium bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                        Solo lectura
                      </span>
                    </div>
                    <GlassInput
                      placeholder="00000000000001"
                      value={formData.code}
                      readOnly
                      className="bg-black/25 text-muted-foreground cursor-not-allowed select-all font-mono tracking-wider border-dashed opacity-85 focus:ring-0 focus:border-white/10"
                      title="El Código Interno es generado automáticamente y no se puede modificar"
                    />
                    <p className="text-[10px] text-zinc-500 mt-1">
                      {editingItem
                        ? 'Código interno asignado al artículo (inmutable).'
                        : 'Calculado automáticamente (consecutivo con 14 dígitos).'}
                    </p>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-muted-foreground block">
                        Código de Barras
                      </label>
                      {formData.barcode === formData.code && formData.code ? (
                        <span className="text-[10px] text-zinc-400 bg-white/5 px-1.5 py-0.5 rounded border border-white/10">
                          Default = Cód. Interno
                        </span>
                      ) : (
                        <span className="text-[10px] text-teal-400 bg-teal-500/10 px-1.5 py-0.5 rounded border border-teal-500/20">
                          Personalizado
                        </span>
                      )}
                    </div>
                    <GlassInput
                      placeholder="Escanee o ingrese código de barras"
                      value={formData.barcode}
                      onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                      className="font-mono tracking-wider"
                    />
                    <p className="text-[10px] text-zinc-500 mt-1">
                      Por defecto es igual al código interno. Puede escanear o escribir un código diferente.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    {formData.type === 'S' ? 'Nombre del Servicio *' : 'Descripción / Nombre *'}
                  </label>
                  <GlassInput
                    placeholder={
                      formData.type === 'S'
                        ? 'Ej. Mantenimiento Preventivo, Cambio de Aceite, Asesoría...'
                        : 'Nombre completo del producto...'
                    }
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">
                      Categoría
                    </label>
                    <select
                      value={formData.id_category}
                      onChange={(e) => setFormData({ ...formData, id_category: e.target.value })}
                      className="w-full glass-input px-3 py-2 text-xs text-foreground bg-transparent focus:outline-none cursor-pointer"
                    >
                      <option value="" className="bg-zinc-900 text-white">Sin categoría</option>
                      {categories.map((c) => (
                        <option key={c.id_category} value={c.id_category} className="bg-zinc-900 text-white">
                          {c.description}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">
                      Área
                    </label>
                    <select
                      value={formData.id_area}
                      onChange={(e) => setFormData({ ...formData, id_area: e.target.value })}
                      className="w-full glass-input px-3 py-2 text-xs text-foreground bg-transparent focus:outline-none cursor-pointer"
                    >
                      <option value="" className="bg-zinc-900 text-white">Sin área</option>
                      {areas.map((a) => (
                        <option key={a.id_area} value={a.id_area} className="bg-zinc-900 text-white">
                          {a.description}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">
                      Departamento
                    </label>
                    <select
                      value={formData.id_department}
                      onChange={(e) => setFormData({ ...formData, id_department: e.target.value })}
                      className="w-full glass-input px-3 py-2 text-xs text-foreground bg-transparent focus:outline-none cursor-pointer"
                    >
                      <option value="" className="bg-zinc-900 text-white">Sin departamento</option>
                      {departments.map((d) => (
                        <option key={d.id_department} value={d.id_department} className="bg-zinc-900 text-white">
                          {d.description}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Fotografías: Solo para Productos; los servicios no llevan fotos */}
                {formData.type === 'P' ? (
                  <div className="pt-2 border-t border-border/20">
                    <ProductImageManager
                      key={editingItem?.id_item || 'new-product-images'}
                      initialImages={itemImages}
                      onChange={(nextImgs, nextDels) => {
                        setItemImages(nextImgs)
                        setDeletedImageIds(nextDels)
                      }}
                    />
                  </div>
                ) : (
                  <div className="p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/25 flex items-start gap-3 text-xs">
                    <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 shrink-0">
                      <Wrench size={16} />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">Servicio sin soporte fotográfico</p>
                      <p className="text-muted-foreground text-[11px] mt-0.5 leading-relaxed">
                        Los servicios profesionales no requieren galería de fotos ni control de inventario de existencias. La clave SAT recomendada para la mayoría de servicios es <strong className="text-indigo-300">E48 (Unidad de Servicio)</strong>.
                      </p>
                    </div>
                  </div>
                )}

                {/* Costs, Prices and Commission */}
                <div className="pt-2 border-t border-border/20">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-2">
                    {formData.type === 'S'
                      ? (isAdmin ? 'Tarifas, Costo y Comisión' : 'Tarifas y Comisión')
                      : (isAdmin ? 'Precios y Costos' : 'Precios de Venta')}
                  </h4>
                  <div className={`grid grid-cols-2 ${isAdmin ? 'sm:grid-cols-5' : 'sm:grid-cols-4'} gap-3`}>
                    {isAdmin && (
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground block mb-1">
                          {formData.type === 'S' ? 'Costo Insumos' : 'Costo Compra'}
                        </label>
                        <GlassInput
                          type="number"
                          step="any"
                          value={formData.cost}
                          onChange={(e) => setFormData({ ...formData, cost: Number(e.target.value) })}
                        />
                      </div>
                    )}
                    <div>
                      <label className="text-xs font-semibold text-emerald-400 block mb-1">
                        {formData.type === 'S' ? 'Tarifa 1 * (Menudeo)' : 'Precio 1 * (Menudeo)'}
                      </label>
                      <GlassInput
                        type="number"
                        step="any"
                        value={formData.price1}
                        onChange={(e) => setFormData({ ...formData, price1: Number(e.target.value) })}
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-blue-400 block mb-1">
                        {formData.type === 'S' ? 'Tarifa 2 (Mayoreo)' : 'Precio 2 (Mayoreo)'}
                      </label>
                      <GlassInput
                        type="number"
                        step="any"
                        value={formData.price2}
                        onChange={(e) => setFormData({ ...formData, price2: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground block mb-1">
                        {formData.type === 'S' ? 'Tarifa 3' : 'Precio 3'}
                      </label>
                      <GlassInput
                        type="number"
                        step="any"
                        value={formData.price3}
                        onChange={(e) => setFormData({ ...formData, price3: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-indigo-400 block mb-1">
                        Comisión %
                      </label>
                      <GlassInput
                        type="number"
                        step="any"
                        placeholder="0"
                        value={formData.comission}
                        onChange={(e) => setFormData({ ...formData, comission: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                </div>

                {/* Fiscal & Tax */}
                <div className="pt-2 border-t border-border/20">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                    Datos Fiscales (SAT) & Unidad de Medida
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground block mb-1">
                        Unidad
                      </label>
                      <GlassInput
                        placeholder={formData.type === 'S' ? 'Servicio / Hora' : 'Pza / Kg'}
                        value={formData.unit}
                        onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground block mb-1">
                        IVA %
                      </label>
                      <GlassInput
                        type="number"
                        value={formData.tax}
                        onChange={(e) => setFormData({ ...formData, tax: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground block mb-1">
                        Clave SAT (id_sat)
                      </label>
                      <GlassInput
                        placeholder={formData.type === 'S' ? 'Ej. 72101500' : 'Ej. 01010101'}
                        value={formData.id_sat}
                        onChange={(e) => setFormData({ ...formData, id_sat: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground block mb-1">
                        Unidad SAT
                      </label>
                      <GlassInput
                        placeholder={formData.type === 'S' ? 'E48 (Servicio)' : 'H87 (Pieza)'}
                        value={formData.unit_sat}
                        onChange={(e) => setFormData({ ...formData, unit_sat: e.target.value })}
                      />
                    </div>
                  </div>
                </form>
              </div>

              {/* Footer Fijo */}
              <div className="border-t border-border/40 p-3 sm:p-4 bg-card/95 dark:bg-card/90 backdrop-blur-xl shrink-0 z-10 space-y-1.5">
                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3">
                  <GlassButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setModalOpen(false)}
                    className="w-full sm:w-auto"
                  >
                    Cancelar
                  </GlassButton>
                  <GlassButton
                    type="submit"
                    form="item-form"
                    variant="primary"
                    size="sm"
                    disabled={saving}
                    className="w-full sm:w-auto"
                  >
                    <Check size={14} className="mr-1" />
                    {saving
                      ? 'Guardando...'
                      : editingItem
                        ? formData.type === 'S'
                          ? 'Actualizar Servicio'
                          : 'Actualizar Producto'
                        : formData.type === 'S'
                          ? 'Guardar Servicio'
                          : 'Guardar Producto'}
                  </GlassButton>
                </div>
                {editingItem && (
                  <p className="text-[11px] text-muted-foreground/75 text-right hidden sm:block">
                    💡 Cualquier cambio en datos, fotografías o portada se guardará y transmitirá en tiempo real.
                  </p>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: Confirm Delete / Deactivate */}
      <AnimatePresence>
        {deleteConfirmOpen && itemToDelete && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="glass-card max-w-md w-full flex flex-col max-h-[92dvh] sm:max-h-[90vh] overflow-hidden rounded-2xl sm:rounded-3xl shadow-2xl"
            >
              {/* Header Fijo */}
              <div className="flex items-center justify-between border-b border-border/40 px-4 py-3 sm:px-6 sm:py-4 bg-card/95 dark:bg-card/90 backdrop-blur-xl shrink-0 z-10">
                <h3 className="text-sm sm:text-base font-bold text-foreground truncate pr-2">
                  {itemToDelete.status === 'A'
                    ? itemToDelete.type === 'S'
                      ? '¿Desactivar Servicio?'
                      : '¿Desactivar Producto?'
                    : itemToDelete.type === 'S'
                      ? '¿Reactivar Servicio?'
                      : '¿Reactivar Producto?'}
                </h3>
                <button
                  type="button"
                  onClick={() => setDeleteConfirmOpen(false)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors shrink-0"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Cuerpo */}
              <div className="flex-1 min-h-0 overflow-y-auto scroll-modern p-4 sm:p-6">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {itemToDelete.status === 'A'
                    ? `El ${itemToDelete.type === 'S' ? 'servicio' : 'producto'} "${itemToDelete.description}" se marcará como inactivo (eliminación lógica). Podrá reactivarlo en cualquier momento.`
                    : `El ${itemToDelete.type === 'S' ? 'servicio' : 'producto'} "${itemToDelete.description}" volverá a estar activo en el catálogo y POS.`}
                </p>
              </div>

              {/* Footer Fijo */}
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3 border-t border-border/40 p-3 sm:p-4 bg-card/95 dark:bg-card/90 backdrop-blur-xl shrink-0 z-10">
                <GlassButton
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeleteConfirmOpen(false)}
                  className="w-full sm:w-auto"
                >
                  Cancelar
                </GlassButton>
                <GlassButton
                  variant={itemToDelete.status === 'A' ? 'danger' : 'primary'}
                  size="sm"
                  onClick={handleConfirmDelete}
                  disabled={deleting}
                  className="w-full sm:w-auto"
                >
                  {deleting ? 'Procesando...' : itemToDelete.status === 'A' ? 'Desactivar' : 'Reactivar'}
                </GlassButton>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: Product Images Carousel (Table Quick View) */}
      <ProductImageCarouselModal
        open={!!carouselModalItem}
        onClose={() => setCarouselModalItem(null)}
        productName={carouselModalItem?.description || ''}
        images={carouselModalItem?.item_images || []}
      />

      {/* Modal: Impresión de Etiquetas con Códigos de Barras */}
      <LabelPrintModal
        open={printModalOpen}
        onOpenChange={setPrintModalOpen}
        storeId={storeId || ''}
        items={printQueue}
      />
    </div>
  )
}
