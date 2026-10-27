'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/utils/supabase/client'
import { GlassCard } from '@/components/glass-card'
import { GlassButton } from '@/components/glass-button'
import { GlassInput } from '@/components/glass-input'
import { StatusBadge } from '@/components/status-badge'
import { CatalogoTabs } from '@/components/catalogo/catalogo-tabs'
import { toast } from 'sonner'
import {
  Search, Plus, Edit3, Trash2, RotateCcw, X, Check, RefreshCw
} from 'lucide-react'
import { TableActionMenu, TableColumnHeader, TablePagination } from '@/components/tables'

interface CatalogEntity {
  id: string
  description: string | null
  status: 'A' | 'I'
  created_at: string
}

interface SimpleCatalogCrudProps {
  title: string
  subtitle: string
  tableName: 'categories' | 'areas' | 'departments' | 'locations'
  idColumn: 'id_category' | 'id_area' | 'id_department' | 'id_location'
  icon: React.ReactNode
  storeIdFilter?: string | null // For locations
}

export function SimpleCatalogCrud({
  title,
  subtitle,
  tableName,
  idColumn,
  icon,
  storeIdFilter,
}: SimpleCatalogCrudProps) {
  const supabase = createClient()

  const [records, setRecords] = useState<CatalogEntity[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'A' | 'I' | 'ALL'>('A')

  // Modal State
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<CatalogEntity | null>(null)
  const [descriptionInput, setDescriptionInput] = useState('')
  const [saving, setSaving] = useState(false)

  // Fetch records
  const fetchRecords = useCallback(async () => {
    setLoading(true)
    let query = supabase.from(tableName).select('*').order('description')

    if (storeIdFilter) {
      query = query.eq('id_store', storeIdFilter)
    }

    const { data, error } = await query

    if (error) {
      toast.error(`Error al cargar ${title.toLowerCase()}`)
    } else if (data) {
      const mapped = data.map((d: Record<string, unknown>) => ({
        id: String(d[idColumn]),
        description: (d.description as string) ?? '',
        status: (d.status as 'A' | 'I') ?? 'A',
        created_at: (d.created_at as string) ?? '',
      }))
      setRecords(mapped)
    }
    setLoading(false)
  }, [supabase, tableName, idColumn, storeIdFilter, title])

  useEffect(() => {
    fetchRecords()
  }, [fetchRecords])

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`${tableName}-changes`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: tableName },
        () => {
          fetchRecords()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, tableName, fetchRecords])

  // Filtered records
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (statusFilter !== 'ALL' && r.status !== statusFilter) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        const desc = r.description?.toLowerCase() ?? ''
        if (!desc.includes(q)) return false
      }
      return true
    })
  }, [records, statusFilter, search])

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

  const sortedRecords = useMemo(() => {
    const list = [...filteredRecords]
    if (!sortKey) return list

    return list.sort((a, b) => {
      let aVal = ''
      let bVal = ''
      if (sortKey === 'description') {
        aVal = (a.description || '').toLowerCase()
        bVal = (b.description || '').toLowerCase()
      } else if (sortKey === 'status') {
        aVal = a.status
        bVal = b.status
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
  }, [filteredRecords, sortKey, sortDirection])

  const totalPages = Math.ceil(sortedRecords.length / pageSize) || 1
  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedRecords.slice(start, start + pageSize)
  }, [sortedRecords, currentPage, pageSize])

  // Handle Save
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!descriptionInput.trim()) {
      toast.error('Ingrese una descripción válida')
      return
    }

    setSaving(true)

    if (editingRecord) {
      const { error } = await supabase
        .from(tableName)
        .update({ description: descriptionInput.trim() })
        .eq(idColumn, editingRecord.id)

      setSaving(false)
      if (error) {
        toast.error('Error al actualizar: ' + error.message)
      } else {
        toast.success('Registro actualizado exitosamente')
        setModalOpen(false)
        fetchRecords()
      }
    } else {
      const insertPayload: Record<string, unknown> = {
        description: descriptionInput.trim(),
        status: 'A',
      }
      if (storeIdFilter) {
        insertPayload.id_store = storeIdFilter
      }

      const { error } = await supabase.from(tableName).insert([insertPayload])

      setSaving(false)
      if (error) {
        toast.error('Error al guardar: ' + error.message)
      } else {
        toast.success('Registro creado exitosamente')
        setModalOpen(false)
        fetchRecords()
      }
    }
  }

  // Handle Toggle Status (Logical Delete / Reactivate)
  const handleToggleStatus = async (record: CatalogEntity) => {
    const nextStatus = record.status === 'A' ? 'I' : 'A'
    const { error } = await supabase
      .from(tableName)
      .update({ status: nextStatus })
      .eq(idColumn, record.id)

    if (error) {
      toast.error('Error al cambiar estado')
    } else {
      toast.success(nextStatus === 'I' ? 'Registro desactivado' : 'Registro reactivado')
      fetchRecords()
    }
  }

  return (
    <div className="h-full flex-1 flex flex-col min-h-0 gap-2.5 sm:gap-3">
      <div className="dashboard-bg" />

      {/* Header and Sub-Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shrink-0">
        <div>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-foreground flex items-center gap-2 leading-tight">
            {icon}
            {title}
          </h1>
          <p className="text-xs text-muted-foreground line-clamp-1">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <CatalogoTabs />
          <GlassButton
            variant="primary"
            size="sm"
            className="text-xs h-8 sm:h-9"
            onClick={() => {
              setEditingRecord(null)
              setDescriptionInput('')
              setModalOpen(true)
            }}
          >
            <Plus size={15} className="mr-1" />
            Nuevo Registro
          </GlassButton>
        </div>
      </div>

      {/* Filters Bar */}
      <GlassCard padding="none" className="p-2 shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
          <div className="flex-1 max-w-md">
            <GlassInput
              placeholder={`Buscar en ${title.toLowerCase()}...`}
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
                Activos
              </button>
              <button
                onClick={() => setStatusFilter('I')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  statusFilter === 'I'
                    ? 'bg-emerald-500 text-white shadow-sm font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Inactivos
              </button>
              <button
                onClick={() => setStatusFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  statusFilter === 'ALL'
                    ? 'bg-emerald-500 text-white shadow-sm font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Todos
              </button>
            </div>

            <GlassButton
              variant="ghost"
              size="sm"
              onClick={fetchRecords}
              disabled={loading}
              title="Recargar"
              className="h-8 px-2.5"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin text-emerald-400' : ''} />
            </GlassButton>
          </div>
        </div>
      </GlassCard>

      {/* Records Table */}
      <GlassCard padding="none" className="overflow-hidden shadow-xl flex-1 min-h-0 flex flex-col">
        <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0 scroll-modern">
          <table className="w-full text-left text-sm border-separate border-spacing-0">
            <thead className="sticky top-0 z-20">
              <tr className="glass-table-header border-b border-border/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="w-20 px-4 py-3.5 text-center sticky top-0 z-20 bg-white dark:bg-card">
                  Acciones
                </th>
                <TableColumnHeader
                  title="Descripción"
                  sortKey="description"
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
              {loading && records.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-muted-foreground">
                    Cargando datos...
                  </td>
                </tr>
              ) : paginatedRecords.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-muted-foreground">
                    No se encontraron registros
                  </td>
                </tr>
              ) : (
                paginatedRecords.map((r) => (
                  <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="w-20 px-4 py-3 text-center">
                      <TableActionMenu
                        items={[
                          {
                            label: 'Editar',
                            icon: <Edit3 size={15} />,
                            onClick: () => {
                              setEditingRecord(r)
                              setDescriptionInput(r.description || '')
                              setModalOpen(true)
                            },
                            variant: 'primary',
                          },
                          {
                            label: r.status === 'A' ? 'Desactivar' : 'Reactivar',
                            icon: r.status === 'A' ? <Trash2 size={15} /> : <RotateCcw size={15} />,
                            onClick: () => handleToggleStatus(r),
                            variant: r.status === 'A' ? 'danger' : 'primary',
                            separatorBefore: true,
                          },
                        ]}
                      />
                    </td>
                    <td className="px-4 py-3 font-semibold text-foreground">{r.description}</td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={r.status} />
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
          totalItems={sortedRecords.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          realtimeLabel="Tiempo real activo"
        />
      </GlassCard>

      {/* Modal: Create / Edit */}
      <AnimatePresence>
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="glass-card max-w-md w-full flex flex-col max-h-[92dvh] sm:max-h-[90vh] overflow-hidden rounded-2xl sm:rounded-3xl shadow-2xl"
            >
              {/* Header Fijo */}
              <div className="flex items-center justify-between border-b border-border/40 px-4 py-3 sm:px-6 sm:py-4 bg-card/95 dark:bg-card/90 backdrop-blur-xl shrink-0 z-10">
                <h3 className="text-sm sm:text-base font-bold text-foreground truncate pr-2">
                  {editingRecord ? `Editar ${title.slice(0, -1)}` : `Nuevo(a) ${title.slice(0, -1)}`}
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
                <form id="catalog-form" onSubmit={handleSave} className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">
                      Descripción / Nombre *
                    </label>
                    <GlassInput
                      placeholder="Ej. Bebidas, Almacén Central, etc."
                      value={descriptionInput}
                      onChange={(e) => setDescriptionInput(e.target.value)}
                      autoFocus
                      required
                    />
                  </div>
                </form>
              </div>

              {/* Footer Fijo */}
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3 border-t border-border/40 p-3 sm:p-4 bg-card/95 dark:bg-card/90 backdrop-blur-xl shrink-0 z-10">
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
                  form="catalog-form"
                  variant="primary"
                  size="sm"
                  disabled={saving}
                  className="w-full sm:w-auto"
                >
                  <Check size={14} className="mr-1" />
                  {saving ? 'Guardando...' : editingRecord ? 'Actualizar' : 'Guardar'}
                </GlassButton>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
