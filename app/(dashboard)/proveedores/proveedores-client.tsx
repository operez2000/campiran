'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/utils/supabase/client'
import { GlassCard } from '@/components/glass-card'
import { GlassButton } from '@/components/glass-button'
import { GlassInput } from '@/components/glass-input'
import { StatusBadge } from '@/components/status-badge'
import { type Supplier } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Truck, Search, Plus, Edit3, Trash2, RotateCcw,
  X, Check, Phone, Mail, Globe, MapPin, DollarSign,
  Clock, RefreshCw
} from 'lucide-react'
import { TableActionMenu, TableColumnHeader, TablePagination } from '@/components/tables'

interface SupplierFormData {
  supplier_name: string
  rfc: string
  contact: string
  phone: string
  email1: string
  email2: string
  web_page: string
  address: string
  city: string
  state: string
  postal_code: string
  credit_days: number
  credit_limit: number
}

const INITIAL_FORM: SupplierFormData = {
  supplier_name: '',
  rfc: '',
  contact: '',
  phone: '',
  email1: '',
  email2: '',
  web_page: '',
  address: '',
  city: '',
  state: '',
  postal_code: '',
  credit_days: 0,
  credit_limit: 0,
}

export function ProveedoresClient() {
  const supabase = createClient()

  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'A' | 'I' | 'ALL'>('A')

  // Create / Edit Modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [formData, setFormData] = useState<SupplierFormData>(INITIAL_FORM)
  const [saving, setSaving] = useState(false)

  // Delete Confirm Dialog
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [supplierToDelete, setSupplierToDelete] = useState<Supplier | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Fetch Suppliers
  const fetchSuppliers = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .order('supplier_name')

    if (error) {
      toast.error('Error al cargar proveedores: ' + error.message)
    } else if (data) {
      setSuppliers(data as Supplier[])
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchSuppliers()
  }, [fetchSuppliers])

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('suppliers-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'suppliers' }, () => {
        fetchSuppliers()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, fetchSuppliers])

  // Filtered suppliers
  const filteredSuppliers = useMemo(() => {
    return suppliers.filter((s) => {
      if (statusFilter !== 'ALL' && s.status !== statusFilter) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        const name = s.supplier_name?.toLowerCase() ?? ''
        const rfc = s.rfc?.toLowerCase() ?? ''
        const contact = s.contact?.toLowerCase() ?? ''
        const email = (s.email1 || s.email2 || '').toLowerCase()
        const phone = s.phone?.toLowerCase() ?? ''
        if (!name.includes(q) && !rfc.includes(q) && !contact.includes(q) && !email.includes(q) && !phone.includes(q)) {
          return false
        }
      }
      return true
    })
  }, [suppliers, statusFilter, search])

  // Sorting state
  const [sortKey, setSortKey] = useState<string>('supplier_name')
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

  const sortedSuppliers = useMemo(() => {
    const list = [...filteredSuppliers]
    if (!sortKey) return list

    return list.sort((a, b) => {
      let aVal: string | number = ''
      let bVal: string | number = ''

      switch (sortKey) {
        case 'supplier_name':
          aVal = (a.supplier_name || '').toLowerCase()
          bVal = (b.supplier_name || '').toLowerCase()
          break
        case 'rfc':
          aVal = (a.rfc || '').toLowerCase()
          bVal = (b.rfc || '').toLowerCase()
          break
        case 'contact':
          aVal = (a.contact || '').toLowerCase()
          bVal = (b.contact || '').toLowerCase()
          break
        case 'city':
          aVal = `${a.city || ''} ${a.state || ''}`.toLowerCase()
          bVal = `${b.city || ''} ${b.state || ''}`.toLowerCase()
          break
        case 'credit_days':
          aVal = Number(a.credit_days || 0)
          bVal = Number(b.credit_days || 0)
          break
        case 'credit_limit':
          aVal = Number(a.credit_limit || 0)
          bVal = Number(b.credit_limit || 0)
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
  }, [filteredSuppliers, sortKey, sortDirection])

  const totalPages = Math.ceil(sortedSuppliers.length / pageSize) || 1
  const paginatedSuppliers = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedSuppliers.slice(start, start + pageSize)
  }, [sortedSuppliers, currentPage, pageSize])

  // Open Create Modal
  const handleOpenCreate = () => {
    setEditingSupplier(null)
    setFormData(INITIAL_FORM)
    setModalOpen(true)
  }

  // Open Edit Modal
  const handleOpenEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier)
    setFormData({
      supplier_name: supplier.supplier_name || '',
      rfc: supplier.rfc || '',
      contact: supplier.contact || '',
      phone: supplier.phone || '',
      email1: supplier.email1 || '',
      email2: supplier.email2 || '',
      web_page: supplier.web_page || '',
      address: supplier.address || '',
      city: supplier.city || '',
      state: supplier.state || '',
      postal_code: supplier.postal_code || '',
      credit_days: Number(supplier.credit_days) || 0,
      credit_limit: Number(supplier.credit_limit) || 0,
    })
    setModalOpen(true)
  }

  // Save Supplier
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.supplier_name.trim()) {
      toast.error('El nombre del proveedor es obligatorio')
      return
    }

    setSaving(true)

    const payload = {
      supplier_name: formData.supplier_name.trim(),
      rfc: formData.rfc.trim() || null,
      contact: formData.contact.trim() || null,
      phone: formData.phone.trim() || null,
      email1: formData.email1.trim() || null,
      email2: formData.email2.trim() || null,
      web_page: formData.web_page.trim() || null,
      address: formData.address.trim() || null,
      city: formData.city.trim() || null,
      state: formData.state.trim() || null,
      postal_code: formData.postal_code.trim() || null,
      credit_days: Number(formData.credit_days) || 0,
      credit_limit: Number(formData.credit_limit) || 0,
    }

    if (editingSupplier) {
      const { error } = await supabase
        .from('suppliers')
        .update(payload)
        .eq('id_supplier', editingSupplier.id_supplier)

      setSaving(false)
      if (error) {
        toast.error('Error al actualizar proveedor: ' + error.message)
      } else {
        toast.success('Proveedor actualizado correctamente')
        setModalOpen(false)
        fetchSuppliers()
      }
    } else {
      const { error } = await supabase
        .from('suppliers')
        .insert([{ ...payload, status: 'A' }])

      setSaving(false)
      if (error) {
        toast.error('Error al registrar proveedor: ' + error.message)
      } else {
        toast.success('Proveedor registrado exitosamente')
        setModalOpen(false)
        fetchSuppliers()
      }
    }
  }

  // Soft Delete / Reactivate
  const handleConfirmDelete = async () => {
    if (!supplierToDelete) return
    setDeleting(true)

    const nextStatus = supplierToDelete.status === 'A' ? 'I' : 'A'
    const { error } = await supabase
      .from('suppliers')
      .update({ status: nextStatus })
      .eq('id_supplier', supplierToDelete.id_supplier)

    setDeleting(false)
    setDeleteConfirmOpen(false)

    if (error) {
      toast.error('Error al modificar estado')
    } else {
      toast.success(nextStatus === 'I' ? 'Proveedor desactivado' : 'Proveedor reactivado')
      fetchSuppliers()
    }
  }

  return (
    <div className="space-y-6">
      <div className="dashboard-bg" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Truck className="text-emerald-500" size={28} />
            Directorio de Proveedores
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gestión de proveedores, información de contacto y condiciones comerciales de crédito
          </p>
        </div>
        <GlassButton variant="primary" onClick={handleOpenCreate}>
          <Plus size={16} className="mr-1.5" />
          Nuevo Proveedor
        </GlassButton>
      </div>

      {/* Filters Bar */}
      <GlassCard padding="sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex-1 max-w-md">
            <GlassInput
              placeholder="Buscar por nombre, RFC, contacto o correo..."
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
              onClick={fetchSuppliers}
              disabled={loading}
              title="Recargar"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </GlassButton>
          </div>
        </div>
      </GlassCard>

      {/* Suppliers Table */}
      <GlassCard padding="none" className="overflow-hidden">
        <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-320px)] min-h-[300px] scroll-modern">
          <table className="w-full text-left text-sm border-separate border-spacing-0">
            <thead className="sticky top-0 z-20">
              <tr className="glass-table-header border-b border-border/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <TableColumnHeader
                  title="Proveedor"
                  sortKey="supplier_name"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                />
                <TableColumnHeader
                  title="RFC"
                  sortKey="rfc"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                />
                <TableColumnHeader
                  title="Contacto"
                  sortKey="contact"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                />
                <TableColumnHeader
                  title="Ubicación"
                  sortKey="city"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                />
                <TableColumnHeader
                  title="Días Crédito"
                  sortKey="credit_days"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  align="center"
                />
                <TableColumnHeader
                  title="Límite Crédito"
                  sortKey="credit_limit"
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
                  <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                    Cargando directorio de proveedores...
                  </td>
                </tr>
              ) : paginatedSuppliers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                    <p className="text-base font-medium">No se encontraron proveedores</p>
                    <p className="text-xs text-muted-foreground/80 mt-1">
                      {search ? 'Intente con otro término de búsqueda' : 'Registre al primer proveedor en el sistema'}
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedSuppliers.map((supplier) => (
                  <tr key={supplier.id_supplier} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-4 py-3.5">
                      <span className="font-semibold text-foreground group-hover:text-emerald-400 transition-colors">
                        {supplier.supplier_name}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 font-mono text-xs text-muted-foreground">
                      {supplier.rfc || '—'}
                    </td>

                    <td className="px-4 py-3.5 text-xs text-muted-foreground">
                      <div className="flex flex-col gap-0.5">
                        {supplier.contact && (
                          <span className="font-medium text-foreground">{supplier.contact}</span>
                        )}
                        {supplier.phone && (
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <Phone size={12} className="text-emerald-400" />
                            {supplier.phone}
                          </span>
                        )}
                        {supplier.email1 && (
                          <span className="flex items-center gap-1.5 text-muted-foreground/80">
                            <Mail size={12} />
                            {supplier.email1}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3.5 text-xs text-muted-foreground">
                      {supplier.city ? `${supplier.city}, ${supplier.state || ''}` : '—'}
                    </td>

                    <td className="px-4 py-3.5 text-center text-xs font-mono font-medium text-foreground">
                      {supplier.credit_days ? `${supplier.credit_days} días` : 'Contado'}
                    </td>

                    <td className="px-4 py-3.5 text-right font-mono text-xs font-bold text-emerald-400">
                      {formatCurrency(Number(supplier.credit_limit))}
                    </td>

                    <td className="px-4 py-3.5 text-center">
                      <StatusBadge status={supplier.status} />
                    </td>

                    <td className="px-4 py-3.5 text-center">
                      <TableActionMenu
                        items={[
                          {
                            label: 'Editar Proveedor',
                            icon: <Edit3 size={15} />,
                            onClick: () => handleOpenEdit(supplier),
                            variant: 'primary',
                          },
                          {
                            label: supplier.status === 'A' ? 'Desactivar Proveedor' : 'Reactivar Proveedor',
                            icon: supplier.status === 'A' ? <Trash2 size={15} /> : <RotateCcw size={15} />,
                            onClick: () => {
                              setSupplierToDelete(supplier)
                              setDeleteConfirmOpen(true)
                            },
                            variant: supplier.status === 'A' ? 'danger' : 'primary',
                            separatorBefore: true,
                          },
                        ]}
                      />
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
          totalItems={sortedSuppliers.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          realtimeLabel="Sincronización en tiempo real"
        />
      </GlassCard>

      {/* Modal: Create / Edit Supplier */}
      <AnimatePresence>
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card max-w-xl w-full p-6 space-y-4 max-h-[90vh] flex flex-col"
            >
              <div className="flex items-center justify-between border-b border-border/40 pb-3">
                <h3 className="text-base font-bold text-foreground">
                  {editingSupplier ? 'Editar Proveedor' : 'Nuevo Proveedor'}
                </h3>
                <button
                  onClick={() => setModalOpen(false)}
                  className="p-1 rounded-lg text-muted-foreground hover:text-foreground"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSave} className="space-y-4 overflow-y-auto scroll-modern pr-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">
                      Razón Social / Nombre *
                    </label>
                    <GlassInput
                      placeholder="Nombre del proveedor"
                      value={formData.supplier_name}
                      onChange={(e) => setFormData({ ...formData, supplier_name: e.target.value })}
                      required
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">
                      RFC
                    </label>
                    <GlassInput
                      placeholder="RFC de la empresa"
                      value={formData.rfc}
                      onChange={(e) => setFormData({ ...formData, rfc: e.target.value.toUpperCase() })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">
                      Persona de Contacto
                    </label>
                    <GlassInput
                      placeholder="Nombre del contacto"
                      value={formData.contact}
                      onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">
                      Teléfono
                    </label>
                    <GlassInput
                      type="tel"
                      placeholder="Teléfono"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">
                      Correo Principal
                    </label>
                    <GlassInput
                      type="email"
                      placeholder="correo@proveedor.com"
                      value={formData.email1}
                      onChange={(e) => setFormData({ ...formData, email1: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">
                      Sitio Web
                    </label>
                    <GlassInput
                      placeholder="https://proveedor.com"
                      value={formData.web_page}
                      onChange={(e) => setFormData({ ...formData, web_page: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    Dirección (Calle y Número)
                  </label>
                  <GlassInput
                    placeholder="Domicilio de la empresa"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">
                      Ciudad
                    </label>
                    <GlassInput
                      placeholder="Ciudad"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">
                      Estado
                    </label>
                    <GlassInput
                      placeholder="Estado"
                      value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">
                      C.P.
                    </label>
                    <GlassInput
                      placeholder="C.P."
                      value={formData.postal_code}
                      onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                    />
                  </div>
                </div>

                {/* Credit terms */}
                <div className="pt-2 border-t border-border/20">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-2">
                    Condiciones de Crédito
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground block mb-1">
                        Días de Crédito
                      </label>
                      <GlassInput
                        type="number"
                        min={0}
                        value={formData.credit_days}
                        onChange={(e) => setFormData({ ...formData, credit_days: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground block mb-1">
                        Límite de Crédito ($)
                      </label>
                      <GlassInput
                        type="number"
                        step="any"
                        min={0}
                        value={formData.credit_limit}
                        onChange={(e) => setFormData({ ...formData, credit_limit: Number(e.target.value) })}
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
                    {saving ? 'Guardando...' : editingSupplier ? 'Actualizar' : 'Guardar Proveedor'}
                  </GlassButton>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: Delete / Deactivate Confirm */}
      <AnimatePresence>
        {deleteConfirmOpen && supplierToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card max-w-md w-full p-6 space-y-4"
            >
              <h3 className="text-base font-bold text-foreground">
                {supplierToDelete.status === 'A' ? '¿Desactivar Proveedor?' : '¿Reactivar Proveedor?'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {supplierToDelete.status === 'A'
                  ? `El proveedor "${supplierToDelete.supplier_name}" se marcará como inactivo (eliminación lógica).`
                  : `El proveedor "${supplierToDelete.supplier_name}" volverá a estar activo.`}
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
                  variant={supplierToDelete.status === 'A' ? 'danger' : 'primary'}
                  size="sm"
                  onClick={handleConfirmDelete}
                  disabled={deleting}
                >
                  {deleting ? 'Procesando...' : supplierToDelete.status === 'A' ? 'Desactivar' : 'Reactivar'}
                </GlassButton>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
