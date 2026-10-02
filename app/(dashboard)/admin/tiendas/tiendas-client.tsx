'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/utils/supabase/client'
import { GlassCard } from '@/components/glass-card'
import { GlassButton } from '@/components/glass-button'
import { GlassInput } from '@/components/glass-input'
import { StatusBadge } from '@/components/status-badge'
import { type Store } from '@/lib/types'
import { toast } from 'sonner'
import {
  Store as StoreIcon, Search, Plus, Edit3, Trash2, RotateCcw,
  X, Check, MapPin, RefreshCw
} from 'lucide-react'

export function TiendasClient() {
  const supabase = createClient()

  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'A' | 'I' | 'ALL'>('A')

  // Modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editingStore, setEditingStore] = useState<Store | null>(null)
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [saving, setSaving] = useState(false)

  // Delete Confirm
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [storeToDelete, setStoreToDelete] = useState<Store | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchStores = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('stores')
      .select('*')
      .order('description')

    if (error) {
      toast.error('Error al cargar sucursales: ' + error.message)
    } else if (data) {
      setStores(data as Store[])
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchStores()
  }, [fetchStores])

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('stores-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stores' }, () => {
        fetchStores()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, fetchStores])

  const filteredStores = useMemo(() => {
    return stores.filter((s) => {
      if (statusFilter !== 'ALL' && s.status !== statusFilter) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        const desc = s.description?.toLowerCase() ?? ''
        const loc = s.location?.toLowerCase() ?? ''
        if (!desc.includes(q) && !loc.includes(q)) return false
      }
      return true
    })
  }, [stores, statusFilter, search])

  const handleOpenCreate = () => {
    setEditingStore(null)
    setDescription('')
    setLocation('')
    setModalOpen(true)
  }

  const handleOpenEdit = (store: Store) => {
    setEditingStore(store)
    setDescription(store.description || '')
    setLocation(store.location || '')
    setModalOpen(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!description.trim()) {
      toast.error('El nombre de la sucursal es obligatorio')
      return
    }

    setSaving(true)
    const payload = {
      description: description.trim(),
      location: location.trim() || null,
    }

    if (editingStore) {
      const { error } = await supabase
        .from('stores')
        .update(payload)
        .eq('id_store', editingStore.id_store)

      setSaving(false)
      if (error) {
        toast.error('Error al actualizar sucursal: ' + error.message)
      } else {
        toast.success('Sucursal actualizada exitosamente')
        setModalOpen(false)
        fetchStores()
      }
    } else {
      const { error } = await supabase
        .from('stores')
        .insert([{ ...payload, status: 'A' }])

      setSaving(false)
      if (error) {
        toast.error('Error al crear sucursal: ' + error.message)
      } else {
        toast.success('Sucursal creada exitosamente')
        setModalOpen(false)
        fetchStores()
      }
    }
  }

  const handleConfirmDelete = async () => {
    if (!storeToDelete) return
    setDeleting(true)

    const nextStatus = storeToDelete.status === 'A' ? 'I' : 'A'
    const { error } = await supabase
      .from('stores')
      .update({ status: nextStatus })
      .eq('id_store', storeToDelete.id_store)

    setDeleting(false)
    setDeleteConfirmOpen(false)

    if (error) {
      toast.error('Error al cambiar estado')
    } else {
      toast.success(nextStatus === 'I' ? 'Sucursal desactivada' : 'Sucursal reactivada')
      fetchStores()
    }
  }

  return (
    <div className="space-y-6">
      <div className="dashboard-bg" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <StoreIcon className="text-emerald-500" size={28} />
            Administración de Sucursales
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gestión de tiendas y puntos de venta de la empresa
          </p>
        </div>
        <GlassButton variant="primary" onClick={handleOpenCreate}>
          <Plus size={16} className="mr-1.5" />
          Nueva Sucursal
        </GlassButton>
      </div>

      {/* Filters Bar */}
      <GlassCard padding="sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex-1 max-w-md">
            <GlassInput
              placeholder="Buscar sucursal por nombre o dirección..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              icon={<Search size={16} />}
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 p-1 rounded-xl glass">
              <button
                onClick={() => setStatusFilter('A')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  statusFilter === 'A'
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Activas
              </button>
              <button
                onClick={() => setStatusFilter('I')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  statusFilter === 'I'
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Inactivas
              </button>
              <button
                onClick={() => setStatusFilter('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  statusFilter === 'ALL'
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Todas
              </button>
            </div>

            <GlassButton
              variant="ghost"
              size="sm"
              onClick={fetchStores}
              disabled={loading}
              title="Recargar"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </GlassButton>
          </div>
        </div>
      </GlassCard>

      {/* Stores Table */}
      <GlassCard padding="none" className="overflow-hidden">
        <div className="overflow-x-auto scroll-modern">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="glass-table-header border-b border-border/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3.5">Sucursal</th>
                <th className="px-4 py-3.5">Dirección / Ubicación</th>
                <th className="px-4 py-3.5 text-center">Estado</th>
                <th className="px-4 py-3.5 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-muted-foreground">
                    Cargando sucursales...
                  </td>
                </tr>
              ) : filteredStores.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-muted-foreground">
                    <p className="text-base font-medium">No se encontraron sucursales</p>
                  </td>
                </tr>
              ) : (
                filteredStores.map((store) => (
                  <tr key={store.id_store} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-4 py-3.5">
                      <span className="font-semibold text-foreground group-hover:text-emerald-400 transition-colors">
                        {store.description}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <MapPin size={13} className="text-muted-foreground/60" />
                        {store.location || 'Sin dirección registrada'}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 text-center">
                      <StatusBadge status={store.status} />
                    </td>

                    <td className="px-4 py-3.5 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleOpenEdit(store)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                          title="Editar"
                        >
                          <Edit3 size={15} />
                        </button>
                        <button
                          onClick={() => {
                            setStoreToDelete(store)
                            setDeleteConfirmOpen(true)
                          }}
                          className={`p-1.5 rounded-lg transition-colors ${
                            store.status === 'A'
                              ? 'text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10'
                              : 'text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10'
                          }`}
                          title={store.status === 'A' ? 'Desactivar' : 'Reactivar'}
                        >
                          {store.status === 'A' ? <Trash2 size={15} /> : <RotateCcw size={15} />}
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
          <span>Total: {filteredStores.length} sucursales</span>
          <span className="text-emerald-500 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Sincronización multi-tienda activa
          </span>
        </div>
      </GlassCard>

      {/* Modal: Create / Edit Store */}
      <AnimatePresence>
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card max-w-md w-full p-6 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-border/40 pb-3">
                <h3 className="text-base font-bold text-foreground">
                  {editingStore ? 'Editar Sucursal' : 'Nueva Sucursal'}
                </h3>
                <button
                  onClick={() => setModalOpen(false)}
                  className="p-1 rounded-lg text-muted-foreground hover:text-foreground"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    Nombre / Descripción *
                  </label>
                  <GlassInput
                    placeholder="Ej. Sucursal Centro, Matriz, etc."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    required
                    autoFocus
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    Dirección / Ubicación
                  </label>
                  <GlassInput
                    placeholder="Calle, número, colonia, ciudad"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                  />
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2">
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
                    {saving ? 'Guardando...' : editingStore ? 'Actualizar' : 'Guardar'}
                  </GlassButton>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: Delete Confirm */}
      <AnimatePresence>
        {deleteConfirmOpen && storeToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card max-w-md w-full p-6 space-y-4"
            >
              <h3 className="text-base font-bold text-foreground">
                {storeToDelete.status === 'A' ? '¿Desactivar Sucursal?' : '¿Reactivar Sucursal?'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {storeToDelete.status === 'A'
                  ? `La sucursal "${storeToDelete.description}" se marcará como inactiva.`
                  : `La sucursal "${storeToDelete.description}" volverá a estar disponible.`}
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
                  variant={storeToDelete.status === 'A' ? 'danger' : 'primary'}
                  size="sm"
                  onClick={handleConfirmDelete}
                  disabled={deleting}
                >
                  {deleting ? 'Procesando...' : storeToDelete.status === 'A' ? 'Desactivar' : 'Reactivar'}
                </GlassButton>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
