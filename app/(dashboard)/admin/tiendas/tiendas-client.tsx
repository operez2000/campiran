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
import { TableActionMenu, TableColumnHeader, TablePagination } from '@/components/tables'

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

  useEffect(() => {
    setCurrentPage(1)
  }, [search, statusFilter])

  const sortedStores = useMemo(() => {
    const list = [...filteredStores]
    if (!sortKey) return list

    return list.sort((a, b) => {
      let aVal = ''
      let bVal = ''

      switch (sortKey) {
        case 'description':
          aVal = (a.description || '').toLowerCase()
          bVal = (b.description || '').toLowerCase()
          break
        case 'location':
          aVal = (a.location || '').toLowerCase()
          bVal = (b.location || '').toLowerCase()
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
  }, [filteredStores, sortKey, sortDirection])

  const totalPages = Math.ceil(sortedStores.length / pageSize) || 1
  const paginatedStores = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedStores.slice(start, start + pageSize)
  }, [sortedStores, currentPage, pageSize])

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
    <div className="h-full flex-1 flex flex-col min-h-0 gap-2.5 sm:gap-3">
      <div className="dashboard-bg" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shrink-0">
        <div>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-foreground flex items-center gap-2 leading-tight">
            <StoreIcon className="text-emerald-500" size={20} />
            Administración de Sucursales
          </h1>
          <p className="text-xs text-muted-foreground line-clamp-1">
            Gestión de tiendas y puntos de venta de la empresa
          </p>
        </div>
        <GlassButton variant="primary" size="sm" onClick={handleOpenCreate} className="self-start sm:self-auto shadow-md shadow-emerald-500/20 text-xs h-8 sm:h-9">
          <Plus size={15} className="mr-1" />
          Nueva Sucursal
        </GlassButton>
      </div>

      {/* Filters Bar */}
      <GlassCard padding="none" className="p-2 shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
          <div className="flex-1 max-w-md">
            <GlassInput
              placeholder="Buscar sucursal por nombre o dirección..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              icon={<Search size={15} />}
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 p-0.5 rounded-xl glass border border-border/40">
              <button
                onClick={() => setStatusFilter('A')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  statusFilter === 'A'
                    ? 'bg-emerald-500 text-white shadow-sm font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Activas
              </button>
              <button
                onClick={() => setStatusFilter('I')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  statusFilter === 'I'
                    ? 'bg-emerald-500 text-white shadow-sm font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Inactivas
              </button>
              <button
                onClick={() => setStatusFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  statusFilter === 'ALL'
                    ? 'bg-emerald-500 text-white shadow-sm font-semibold'
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
              className="h-8 px-2.5"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin text-emerald-400' : ''} />
            </GlassButton>
          </div>
        </div>
      </GlassCard>

      {/* Stores Table */}
      <GlassCard padding="none" className="overflow-hidden shadow-xl flex-1 min-h-0 flex flex-col">
        <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0 scroll-modern">
          <table className="w-full text-left text-sm border-separate border-spacing-0">
            <thead className="sticky top-0 z-20">
              <tr className="glass-table-header border-b border-border/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="w-20 px-4 py-3.5 text-center sticky top-0 z-20 bg-card/95 backdrop-blur-md">
                  Acciones
                </th>
                <TableColumnHeader
                  title="Sucursal"
                  sortKey="description"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                />
                <TableColumnHeader
                  title="Dirección / Ubicación"
                  sortKey="location"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
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
                  <td colSpan={4} className="px-4 py-12 text-center text-muted-foreground">
                    Cargando sucursales...
                  </td>
                </tr>
              ) : paginatedStores.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-muted-foreground">
                    <p className="text-base font-medium">No se encontraron sucursales</p>
                  </td>
                </tr>
              ) : (
                paginatedStores.map((store) => (
                  <tr key={store.id_store} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="w-20 px-4 py-3.5 text-center">
                      <TableActionMenu
                        items={[
                          {
                            label: 'Editar Sucursal',
                            icon: <Edit3 size={15} />,
                            onClick: () => handleOpenEdit(store),
                            variant: 'primary',
                          },
                          {
                            label: store.status === 'A' ? 'Desactivar Sucursal' : 'Reactivar Sucursal',
                            icon: store.status === 'A' ? <Trash2 size={15} /> : <RotateCcw size={15} />,
                            onClick: () => {
                              setStoreToDelete(store)
                              setDeleteConfirmOpen(true)
                            },
                            variant: store.status === 'A' ? 'danger' : 'primary',
                            separatorBefore: true,
                          },
                        ]}
                      />
                    </td>

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
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={sortedStores.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          realtimeLabel="Sincronización multi-tienda activa"
        />
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
              <div className="flex items-center justify-between border-b border-border/40 pb-3 gap-2">
                <h3 className="text-base font-bold text-foreground">
                  {editingStore ? 'Editar Sucursal' : 'Nueva Sucursal'}
                </h3>
                <div className="flex items-center gap-2">
                  <GlassButton
                    type="submit"
                    form="store-form"
                    variant="primary"
                    size="sm"
                    disabled={saving}
                  >
                    <Check size={14} className="mr-1" />
                    {saving ? 'Guardando...' : editingStore ? 'Actualizar' : 'Guardar'}
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

              <form id="store-form" onSubmit={handleSave} className="space-y-4">
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
