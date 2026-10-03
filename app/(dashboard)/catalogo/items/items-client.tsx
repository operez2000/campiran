'use client'

import { useState, useEffect, useMemo, useCallback, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/utils/supabase/client'
import { GlassCard } from '@/components/glass-card'
import { GlassButton } from '@/components/glass-button'
import { GlassInput } from '@/components/glass-input'
import { StatusBadge } from '@/components/status-badge'
import { CatalogoTabs } from '@/components/catalogo/catalogo-tabs'
import { type Item, type Category, type Area, type Department } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Tags, Search, Plus, Edit3, Trash2, RotateCcw,
  X, Check, Filter, Layers, DollarSign, Barcode,
  Image as ImageIcon, Package, Wrench, Sparkles, Percent, Loader2
} from 'lucide-react'
import { ProductImageManager, type ManagedImageItem } from '@/components/catalogo/product-image-manager'
import { ProductImageCarouselModal } from '@/components/catalogo/product-image-carousel-modal'
import { TableActionMenu, TableColumnHeader, TablePagination } from '@/components/tables'

interface ItemFormData {
  code: string
  barcode: string
  description: string
  description_short: string
  type: 'P' | 'S'
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

export function ItemsClient() {
  const supabase = createClient()

  const [items, setItems] = useState<Item[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [areas, setAreas] = useState<Area[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('ALL')
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

  // Realtime counters for products & services
  const stats = useMemo(() => {
    let products = 0
    let services = 0
    items.forEach((item) => {
      if (item.type === 'S') {
        services++
      } else {
        products++
      }
    })
    return { products, services, total: items.length }
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

    if (itemsRes.data) setItems(itemsRes.data as unknown as Item[])
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
      return data as unknown as Item
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
          const targetItemId = (newRec?.id_item as string) || (oldRec?.id_item as string)
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

      if (search.trim()) {
        const q = search.toLowerCase()
        const desc = item.description?.toLowerCase() ?? ''
        const code = item.code?.toLowerCase() ?? ''
        const barcode = item.barcode?.toLowerCase() ?? ''
        if (!desc.includes(q) && !code.includes(q) && !barcode.includes(q)) return false
      }

      return true
    })
  }, [items, search, categoryFilter, statusFilter, activeTab])

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
  }, [search, categoryFilter, statusFilter, activeTab])

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
        case 'cost':
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
  const handleOpenCreate = (targetType?: 'P' | 'S') => {
    const selectedType: 'P' | 'S' = targetType || (activeTab === 'S' ? 'S' : 'P')
    setEditingItem(null)
    setFormData({
      ...INITIAL_FORM,
      type: selectedType,
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
      unit: item.unit || 'Pza',
      cost: Number(item.cost) || 0,
      last_cost: Number(item.last_cost) || 0,
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

    // Map existing images to image manager state
    const mappedImages: ManagedImageItem[] = (item.item_images || []).map((img) => ({
      id: img.id_item_image,
      url: img.image_url || '',
      storagePath: img.image_path || undefined,
      isExisting: true,
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

    // 2. Upload any newly added images
    const newItems = itemImages.filter((img) => img.isNew && img.blob)
    for (let i = 0; i < newItems.length; i++) {
      const imgItem = newItems[i]
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

        await supabase.from('item_images').insert({
          id_item: targetItemId,
          image_url: publicUrlData.publicUrl,
          image_path: filePath,
        })
      } else {
        console.error('Error al subir imagen al bucket item_images:', uploadError)
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

    const payload = {
      code: formData.code.trim() || null,
      barcode: formData.barcode.trim() || null,
      description: formData.description.trim(),
      description_short: formData.description_short.trim() || null,
      type: formData.type,
      unit: formData.unit.trim() || 'Pza',
      cost: Number(formData.cost) || 0,
      last_cost: Number(formData.last_cost) || 0,
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

    if (editingItem) {
      const { error } = await supabase
        .from('items')
        .update(payload)
        .eq('id_item', editingItem.id_item)

      if (error) {
        setSaving(false)
        toast.error('Error al actualizar artículo: ' + error.message)
        return
      }

      await handleSyncImages(editingItem.id_item, formData.type)
      const updated = await fetchSingleItem(editingItem.id_item)
      if (updated) {
        setItems((prev) => prev.map((i) => (i.id_item === updated.id_item ? updated : i)))
      }
      setSaving(false)
      toast.success(
        formData.type === 'S'
          ? 'Servicio actualizado correctamente'
          : 'Producto actualizado correctamente'
      )
      setModalOpen(false)
    } else {
      const { data: createdItem, error } = await supabase
        .from('items')
        .insert([{ ...payload, status: 'A' }])
        .select()
        .single()

      if (error || !createdItem) {
        setSaving(false)
        toast.error('Error al crear artículo: ' + (error?.message || ''))
        return
      }

      await handleSyncImages(createdItem.id_item, formData.type)
      const created = await fetchSingleItem(createdItem.id_item)
      if (created) {
        setItems((prev) => [created, ...prev])
      }
      setSaving(false)
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
    <div className="space-y-6">
      <div className="dashboard-bg" />

      {/* Header and Sub-Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Tags className="text-emerald-500" size={28} />
            Catálogo de Artículos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gestión de productos y servicios
          </p>
        </div>
        <div className="flex items-center gap-3">
          <CatalogoTabs />
          <GlassButton variant="primary" onClick={() => handleOpenCreate()}>
            <Plus size={16} className="mr-1.5" />
            {activeTab === 'S' ? 'Nuevo Servicio' : activeTab === 'P' ? 'Nuevo Producto' : 'Nuevo Artículo'}
          </GlassButton>
        </div>
      </div>

      {/* Tabs de Segmentación: Productos vs Servicios */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-1.5 rounded-2xl glass border border-white/10">
        <div className="flex items-center gap-1.5 p-1 rounded-xl glass-input">
          <button
            type="button"
            onClick={() => handleTabChange('P')}
            className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-150 cursor-pointer ${
              activeTab === 'P'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/25'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
            }`}
          >
            {tabLoading === 'P' ? (
              <Loader2 size={16} className="animate-spin text-white" />
            ) : (
              <Package size={16} />
            )}
            <span>Productos</span>
            <span
              className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                activeTab === 'P' ? 'bg-white/20 text-white' : 'bg-white/10 text-muted-foreground'
              }`}
            >
              {stats.products}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('S')}
            className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-150 cursor-pointer ${
              activeTab === 'S'
                ? 'bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/25'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
            }`}
          >
            {tabLoading === 'S' ? (
              <Loader2 size={16} className="animate-spin text-white" />
            ) : (
              <Wrench size={16} />
            )}
            <span>Servicios</span>
            <span
              className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                activeTab === 'S' ? 'bg-white/20 text-white' : 'bg-white/10 text-muted-foreground'
              }`}
            >
              {stats.services}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('ALL')}
            className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-150 cursor-pointer ${
              activeTab === 'ALL'
                ? 'bg-gradient-to-r from-slate-700 to-slate-900 text-white shadow-md shadow-slate-500/25 dark:from-white/20 dark:to-white/10 dark:text-white'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
            }`}
          >
            {tabLoading === 'ALL' ? (
              <Loader2 size={16} className="animate-spin text-white" />
            ) : (
              <Layers size={16} />
            )}
            <span>Todos</span>
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                activeTab === 'ALL' ? 'bg-white/20 text-white' : 'bg-white/10 text-muted-foreground'
              }`}
            >
              {stats.total}
            </span>
          </button>
        </div>

        {/* Info contextual sutil */}
        <div className="hidden sm:flex items-center gap-2 text-xs px-3">
          {activeTab === 'P' && (
            <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Artículos físicos · Control de inventario y fotografías
            </span>
          )}
          {activeTab === 'S' && (
            <span className="flex items-center gap-1.5 text-indigo-400 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
              Servicios intangibles · Sin fotografías · Mano de obra & comisiones
            </span>
          )}
          {activeTab === 'ALL' && (
            <span className="flex items-center gap-1.5 text-muted-foreground font-medium">
              Vista general consolidada del catálogo
            </span>
          )}
        </div>
      </div>

      {/* Filters Bar */}
      <GlassCard padding="sm" className="space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex-1 max-w-md">
            <GlassInput
              placeholder="Buscar por código, código de barras o descripción..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              icon={<Search size={16} />}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Category Filter */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl glass-input text-xs font-medium">
              <Layers size={14} className="text-muted-foreground" />
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

            {/* Status Filter */}
            <div className="flex items-center gap-1 p-1 rounded-xl glass">
              <button
                onClick={() => setStatusFilter('A')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${statusFilter === 'A'
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                  }`}
              >
                Activos
              </button>
              <button
                onClick={() => setStatusFilter('I')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${statusFilter === 'I'
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                  }`}
              >
                Inactivos
              </button>
              <button
                onClick={() => setStatusFilter('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${statusFilter === 'ALL'
                    ? 'bg-emerald-500 text-white shadow-sm'
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
      <GlassCard padding="none" className="overflow-hidden">
        <div className={`overflow-x-auto overflow-y-auto max-h-[calc(100vh-320px)] min-h-[300px] scroll-modern transition-opacity duration-150 ${tabLoading !== null ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
          <table className="w-full text-left text-sm border-separate border-spacing-0">
            <thead className="sticky top-0 z-20">
              <tr className="glass-table-header border-b border-border/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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
                  title={activeTab === 'S' ? 'Costo Base' : 'Costo'}
                  sortKey="cost"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  align="right"
                />
                <TableColumnHeader
                  title={activeTab === 'S' ? 'Tarifa 1' : 'Precio 1'}
                  sortKey="price1"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  align="right"
                />
                <TableColumnHeader
                  title={activeTab === 'S' ? 'Tarifa 2' : 'Precio 2'}
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
                <th className="px-4 py-3.5 text-center sticky top-0 z-20 bg-card/95 backdrop-blur-md">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center text-muted-foreground">
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
                  <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
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
                            <button
                              type="button"
                              onClick={() => setCarouselModalItem(item)}
                              className="relative w-11 h-11 rounded-xl overflow-hidden border border-border/60 hover:border-emerald-500/80 transition-all shrink-0 group/img shadow-xs active:scale-95 cursor-pointer"
                              title={`Ver ${item.item_images.length} fotos en carrusel`}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={item.item_images[0].image_url || ''}
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

                      <td className="px-4 py-3.5 text-right font-mono text-xs text-muted-foreground">
                        {formatCurrency(Number(item.cost))}
                      </td>

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

                      <td className="px-4 py-3.5 text-center">
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card max-w-2xl w-full p-6 space-y-4 max-h-[90vh] flex flex-col"
            >
              <div className="flex items-center justify-between border-b border-border/40 pb-3 gap-3">
                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                  {formData.type === 'S' ? (
                    <>
                      <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400">
                        <Wrench size={16} />
                      </div>
                      <span>{editingItem ? 'Editar Servicio' : 'Nuevo Servicio'}</span>
                    </>
                  ) : (
                    <>
                      <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400">
                        <Package size={16} />
                      </div>
                      <span>{editingItem ? 'Editar Producto' : 'Nuevo Producto'}</span>
                    </>
                  )}
                </h3>
                <div className="flex items-center gap-2">
                  <GlassButton
                    type="submit"
                    form="item-form"
                    variant="primary"
                    size="sm"
                    disabled={saving}
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
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              <form id="item-form" onSubmit={handleSave} className="space-y-4 overflow-y-auto scroll-modern pr-1">
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
                    <span>Producto (Físico con Inventario)</span>
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
                    <span>Servicio (Intangible / Mano de Obra)</span>
                  </button>
                </div>

                {/* Basic Identification */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">
                      Código Interno
                    </label>
                    <GlassInput
                      placeholder={formData.type === 'S' ? 'Ej. SRV-001' : 'Ej. ART-001'}
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">
                      {formData.type === 'S' ? 'Código de Barras (Opcional)' : 'Código de Barras'}
                    </label>
                    <GlassInput
                      placeholder={
                        formData.type === 'S'
                          ? 'No requerido para servicios'
                          : 'Escanee o ingrese código'
                      }
                      value={formData.barcode}
                      onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                    />
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
                    {formData.type === 'S' ? 'Tarifas, Costo y Comisión' : 'Precios y Costos'}
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
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
                    <div>
                      <label className="text-xs font-semibold text-emerald-400 block mb-1">
                        {formData.type === 'S' ? 'Tarifa 1 *' : 'Precio 1 *'}
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
                      <label className="text-xs font-semibold text-muted-foreground block mb-1">
                        {formData.type === 'S' ? 'Tarifa 2' : 'Precio 2'}
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
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-border/40">
                  <GlassButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setModalOpen(false)}
                  >
                    Cancelar
                  </GlassButton>
                  <GlassButton type="submit" variant="primary" size="sm" disabled={saving}>
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
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: Confirm Delete / Deactivate */}
      <AnimatePresence>
        {deleteConfirmOpen && itemToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card max-w-md w-full p-6 space-y-4"
            >
              <h3 className="text-base font-bold text-foreground">
                {itemToDelete.status === 'A'
                  ? itemToDelete.type === 'S'
                    ? '¿Desactivar Servicio?'
                    : '¿Desactivar Producto?'
                  : itemToDelete.type === 'S'
                    ? '¿Reactivar Servicio?'
                    : '¿Reactivar Producto?'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {itemToDelete.status === 'A'
                  ? `El ${itemToDelete.type === 'S' ? 'servicio' : 'producto'} "${itemToDelete.description}" se marcará como inactivo (eliminación lógica). Podrá reactivarlo en cualquier momento.`
                  : `El ${itemToDelete.type === 'S' ? 'servicio' : 'producto'} "${itemToDelete.description}" volverá a estar activo en el catálogo y POS.`}
              </p>
              <div className="flex items-center justify-end gap-2.5 pt-2">
                <GlassButton
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeleteConfirmOpen(false)}
                >
                  Cancelar
                </GlassButton>
                <GlassButton
                  variant={itemToDelete.status === 'A' ? 'danger' : 'primary'}
                  size="sm"
                  onClick={handleConfirmDelete}
                  disabled={deleting}
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
    </div>
  )
}
