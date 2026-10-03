'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
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
  Image as ImageIcon
} from 'lucide-react'
import { ProductImageManager, type ManagedImageItem } from '@/components/catalogo/product-image-manager'
import { ProductImageCarouselModal } from '@/components/catalogo/product-image-carousel-modal'

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

  // Fetch Master Data
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

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // 100% Realtime multi-table subscriptions (items, item_images, categories, areas, departments)
  useEffect(() => {
    const channel = supabase
      .channel('catalog-items-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, () => {
        fetchData()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'item_images' }, () => {
        fetchData()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, () => {
        fetchData()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'areas' }, () => {
        fetchData()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'departments' }, () => {
        fetchData()
      })
      .subscribe()

    // Immediate sync fallback on tab focus or visibility change
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        fetchData()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityOrFocus)
    window.addEventListener('focus', handleVisibilityOrFocus)

    return () => {
      supabase.removeChannel(channel)
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus)
      window.removeEventListener('focus', handleVisibilityOrFocus)
    }
  }, [supabase, fetchData])

  // Filtered Items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
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
  }, [items, search, categoryFilter, statusFilter])

  // Open Create Modal
  const handleOpenCreate = () => {
    setEditingItem(null)
    setFormData(INITIAL_FORM)
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
  const handleSyncImages = async (targetItemId: string) => {
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

      await handleSyncImages(editingItem.id_item)
      setSaving(false)
      toast.success('Artículo actualizado correctamente')
      setModalOpen(false)
      fetchData()
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

      await handleSyncImages(createdItem.id_item)
      setSaving(false)
      toast.success('Artículo creado exitosamente con sus imágenes')
      setModalOpen(false)
      fetchData()
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
      toast.success(
        nextStatus === 'I' ? 'Artículo desactivado (eliminación lógica)' : 'Artículo reactivado'
      )
      fetchData()
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
            Gestión completa de productos, precios dinámicos y códigos SAT
          </p>
        </div>
        <div className="flex items-center gap-3">
          <CatalogoTabs />
          <GlassButton variant="primary" onClick={handleOpenCreate}>
            <Plus size={16} className="mr-1.5" />
            Nuevo Artículo
          </GlassButton>
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
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  statusFilter === 'A'
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Activos
              </button>
              <button
                onClick={() => setStatusFilter('I')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  statusFilter === 'I'
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Inactivos
              </button>
              <button
                onClick={() => setStatusFilter('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  statusFilter === 'ALL'
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
        <div className="overflow-x-auto scroll-modern">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="glass-table-header border-b border-border/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3.5">Artículo</th>
                <th className="px-4 py-3.5">Categoría / Área</th>
                <th className="px-4 py-3.5 text-center">Tipo / Unidad</th>
                <th className="px-4 py-3.5 text-right">Costo</th>
                <th className="px-4 py-3.5 text-right">Precio 1</th>
                <th className="px-4 py-3.5 text-right">Precio 2</th>
                <th className="px-4 py-3.5 text-right">Precio 3</th>
                <th className="px-4 py-3.5 text-center">Estado</th>
                <th className="px-4 py-3.5 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                    Cargando catálogo...
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                    <p className="text-base font-medium">No se encontraron artículos</p>
                    <p className="text-xs text-muted-foreground/80 mt-1">
                      {search ? 'Modifique el término de búsqueda o filtros' : 'Añada el primer artículo al catálogo'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item.id_item} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        {/* Product Thumbnail with quick carousel preview */}
                        {item.item_images && item.item_images.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => setCarouselModalItem(item)}
                            className="relative w-11 h-11 rounded-xl overflow-hidden border border-border/60 hover:border-emerald-500/80 transition-all shrink-0 group/img shadow-xs active:scale-95"
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
                            title="Haz clic para agregar fotografías"
                          >
                            <ImageIcon size={18} />
                          </div>
                        )}

                        <div className="flex flex-col">
                          <span className="font-semibold text-foreground group-hover:text-emerald-400 transition-colors">
                            {item.description}
                          </span>
                          <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground font-mono">
                            {item.code && <span>Cód: {item.code}</span>}
                            {item.barcode && <span>CB: {item.barcode}</span>}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3.5 text-xs text-muted-foreground">
                      <div>{item.category?.description || 'Sin categoría'}</div>
                      <div className="text-[11px] text-muted-foreground/60">{item.area?.description || '—'}</div>
                    </td>

                    <td className="px-4 py-3.5 text-center text-xs">
                      <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-muted-foreground font-medium">
                        {item.type === 'S' ? 'Servicio' : 'Producto'} · {item.unit || 'Pza'}
                      </span>
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
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleOpenEdit(item)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                          title="Editar artículo"
                        >
                          <Edit3 size={15} />
                        </button>
                        <button
                          onClick={() => {
                            setItemToDelete(item)
                            setDeleteConfirmOpen(true)
                          }}
                          className={`p-1.5 rounded-lg transition-colors ${
                            item.status === 'A'
                              ? 'text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10'
                              : 'text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10'
                          }`}
                          title={item.status === 'A' ? 'Desactivar artículo' : 'Reactivar artículo'}
                        >
                          {item.status === 'A' ? <Trash2 size={15} /> : <RotateCcw size={15} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t border-border/20 text-xs text-muted-foreground flex items-center justify-between">
          <span>Mostrando {filteredItems.length} artículos</span>
          <span className="text-emerald-500 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Catálogo sincronizado
          </span>
        </div>
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
                <h3 className="text-base font-bold text-foreground">
                  {editingItem ? 'Editar Artículo' : 'Nuevo Artículo'}
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
                    {saving ? 'Guardando...' : editingItem ? 'Actualizar' : 'Guardar Artículo'}
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
                {/* Basic Identification */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">
                      Código Interno
                    </label>
                    <GlassInput
                      placeholder="Ej. ART-001"
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">
                      Código de Barras
                    </label>
                    <GlassInput
                      placeholder="Escanee o ingrese código"
                      value={formData.barcode}
                      onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    Descripción / Nombre *
                  </label>
                  <GlassInput
                    placeholder="Nombre completo del producto..."
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
                      className="w-full glass-input px-3 py-2 text-xs text-foreground bg-transparent focus:outline-none"
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
                      className="w-full glass-input px-3 py-2 text-xs text-foreground bg-transparent focus:outline-none"
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
                      className="w-full glass-input px-3 py-2 text-xs text-foreground bg-transparent focus:outline-none"
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

                {/* Product Images Manager (Mobile Camera + Drag & Drop + 720px resize + Carousel) */}
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

                {/* Costs and Prices */}
                <div className="pt-2 border-t border-border/20">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-2">
                    Precios y Costos
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground block mb-1">
                        Costo
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
                        Precio 1 (General) *
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
                        Precio 2 (Mayorista)
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
                        Precio 3 (Especial)
                      </label>
                      <GlassInput
                        type="number"
                        step="any"
                        value={formData.price3}
                        onChange={(e) => setFormData({ ...formData, price3: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                </div>

                {/* Fiscal & Tax */}
                <div className="pt-2 border-t border-border/20">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                    Datos Fiscales (SAT) & Unidad
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground block mb-1">
                        Unidad
                      </label>
                      <GlassInput
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
                        placeholder="Ej. 01010101"
                        value={formData.id_sat}
                        onChange={(e) => setFormData({ ...formData, id_sat: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground block mb-1">
                        Unidad SAT
                      </label>
                      <GlassInput
                        placeholder="Ej. H87"
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
                    {saving ? 'Guardando...' : editingItem ? 'Actualizar' : 'Guardar Artículo'}
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
                {itemToDelete.status === 'A' ? '¿Desactivar Artículo?' : '¿Reactivar Artículo?'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {itemToDelete.status === 'A'
                  ? `El artículo "${itemToDelete.description}" se marcará como inactivo (eliminación lógica). Podrá reactivarlo en cualquier momento.`
                  : `El artículo "${itemToDelete.description}" volverá a estar activo en el catálogo y POS.`}
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
