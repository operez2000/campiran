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
    <div className="space-y-6">
      <div className="dashboard-bg" />

      {/* Header and Sub-Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            {icon}
            {title}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          <CatalogoTabs />
          <GlassButton
            variant="primary"
            onClick={() => {
              setEditingRecord(null)
              setDescriptionInput('')
              setModalOpen(true)
            }}
          >
            <Plus size={16} className="mr-1.5" />
            Nuevo Registro
          </GlassButton>
        </div>
      </div>

      {/* Filters Bar */}
      <GlassCard padding="sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex-1 max-w-md">
            <GlassInput
              placeholder={`Buscar en ${title.toLowerCase()}...`}
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

            <GlassButton
              variant="ghost"
              size="sm"
              onClick={fetchRecords}
              disabled={loading}
              title="Recargar"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </GlassButton>
          </div>
        </div>
      </GlassCard>

      {/* Records Table */}
      <GlassCard padding="none" className="overflow-hidden">
        <div className="overflow-x-auto scroll-modern">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="glass-table-header border-b border-border/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3.5">Descripción</th>
                <th className="px-4 py-3.5 text-center">Estado</th>
                <th className="px-4 py-3.5 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {loading && records.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-muted-foreground">
                    Cargando datos...
                  </td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-muted-foreground">
                    No se encontraron registros
                  </td>
                </tr>
              ) : (
                filteredRecords.map((r) => (
                  <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 font-semibold text-foreground">{r.description}</td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => {
                            setEditingRecord(r)
                            setDescriptionInput(r.description || '')
                            setModalOpen(true)
                          }}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                          title="Editar"
                        >
                          <Edit3 size={15} />
                        </button>
                        <button
                          onClick={() => handleToggleStatus(r)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            r.status === 'A'
                              ? 'text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10'
                              : 'text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10'
                          }`}
                          title={r.status === 'A' ? 'Desactivar' : 'Reactivar'}
                        >
                          {r.status === 'A' ? <Trash2 size={15} /> : <RotateCcw size={15} />}
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
          <span>Total: {filteredRecords.length} registros</span>
          <span className="text-emerald-500 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Tiempo real activo
          </span>
        </div>
      </GlassCard>

      {/* Modal: Create / Edit */}
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
                  {editingRecord ? `Editar ${title.slice(0, -1)}` : `Nuevo(a) ${title.slice(0, -1)}`}
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
                    {saving ? 'Guardando...' : editingRecord ? 'Actualizar' : 'Guardar'}
                  </GlassButton>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
