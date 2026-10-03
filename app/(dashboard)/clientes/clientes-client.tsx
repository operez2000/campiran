'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/utils/supabase/client'
import { getClients, saveClientAction, toggleClientStatusAction } from './actions'
import { GlassCard } from '@/components/glass-card'
import { GlassButton } from '@/components/glass-button'
import { GlassInput } from '@/components/glass-input'
import { StatusBadge } from '@/components/status-badge'
import { type Client, type Order } from '@/lib/types'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Users, Search, Plus, Edit3, Trash2, RotateCcw,
  X, Check, ShoppingBag, Phone, Mail, MapPin, RefreshCw,
  FileText, CheckCircle2, UserX, Copy, Building2
} from 'lucide-react'
import { TableActionMenu, TableColumnHeader, TablePagination } from '@/components/tables'

interface ClientFormData {
  first_name: string
  last_name: string
  rfc: string
  email: string
  phone: string
  address: string
  city: string
  state: string
  postal_code: string
  country: string
  price_number: number
  branch: string
  comments: string
}

const INITIAL_FORM: ClientFormData = {
  first_name: '',
  last_name: '',
  rfc: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  state: '',
  postal_code: '',
  country: 'México',
  price_number: 1,
  branch: '',
  comments: '',
}

export function ClientesClient({ initialData = [] }: { initialData?: Client[] }) {
  const supabase = createClient()

  const [clients, setClients] = useState<Client[]>(initialData)
  const [loading, setLoading] = useState(initialData.length === 0)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'A' | 'I' | 'ALL'>('A')

  // Create / Edit Modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [formData, setFormData] = useState<ClientFormData>(INITIAL_FORM)
  const [saving, setSaving] = useState(false)

  // Orders History Modal
  const [historyModalOpen, setHistoryModalOpen] = useState(false)
  const [historyClient, setHistoryClient] = useState<Client | null>(null)
  const [clientOrders, setClientOrders] = useState<Order[]>([])
  const [loadingOrders, setLoadingOrders] = useState(false)

  // Delete Confirm Dialog
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Fetch Clients using Server Action to ensure RLS bypass and fresh session
  const fetchClients = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getClients()
      setClients(data)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido'
      toast.error('Error al cargar clientes: ' + msg)
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial load if no initialData
  useEffect(() => {
    if (initialData.length === 0) {
      fetchClients()
    }
  }, [fetchClients, initialData.length])

  // Realtime subscription with unique channel name to prevent clashes
  useEffect(() => {
    const channelId = `clients-live-${Date.now()}`
    const channel = supabase
      .channel(channelId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, () => {
        fetchClients()
      })
      .subscribe((status, err) => {
        if (err) {
          console.warn('[Realtime clients] notice:', err.message)
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, fetchClients])

  // Metrics calculation
  const metrics = useMemo(() => {
    const total = clients.length
    const active = clients.filter((c) => c.status === 'A').length
    const inactive = clients.filter((c) => c.status === 'I').length
    const withRfc = clients.filter((c) => !!c.rfc && c.rfc.trim() !== '').length
    return { total, active, inactive, withRfc }
  }, [clients])

  // Filtered clients
  const filteredClients = useMemo(() => {
    return clients.filter((c) => {
      if (statusFilter !== 'ALL' && c.status !== statusFilter) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        const fullName = `${c.first_name ?? ''} ${c.last_name ?? ''}`.toLowerCase()
        const rfc = (c.rfc ?? '').toLowerCase()
        const email = (c.email ?? '').toLowerCase()
        const phone = (c.phone ?? '').toLowerCase()
        const city = (c.city ?? '').toLowerCase()
        const branch = (c.branch ?? '').toLowerCase()
        if (
          !fullName.includes(q) &&
          !rfc.includes(q) &&
          !email.includes(q) &&
          !phone.includes(q) &&
          !city.includes(q) &&
          !branch.includes(q)
        ) {
          return false
        }
      }
      return true
    })
  }, [clients, statusFilter, search])

  // Sorting state
  const [sortKey, setSortKey] = useState<string>('name')
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

  const sortedClients = useMemo(() => {
    const list = [...filteredClients]
    if (!sortKey) return list

    return list.sort((a, b) => {
      let aVal: string | number = ''
      let bVal: string | number = ''

      switch (sortKey) {
        case 'name':
          aVal = `${a.first_name || ''} ${a.last_name || ''}`.trim().toLowerCase()
          bVal = `${b.first_name || ''} ${b.last_name || ''}`.trim().toLowerCase()
          break
        case 'rfc':
          aVal = (a.rfc || '').toLowerCase()
          bVal = (b.rfc || '').toLowerCase()
          break
        case 'contact':
          aVal = `${a.phone || ''} ${a.email || ''}`.toLowerCase()
          bVal = `${b.phone || ''} ${b.email || ''}`.toLowerCase()
          break
        case 'location':
          aVal = `${a.city || ''} ${a.state || ''}`.toLowerCase()
          bVal = `${b.city || ''} ${b.state || ''}`.toLowerCase()
          break
        case 'price_number':
          aVal = Number(a.price_number || 1)
          bVal = Number(b.price_number || 1)
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
  }, [filteredClients, sortKey, sortDirection])

  const totalPages = Math.ceil(sortedClients.length / pageSize) || 1
  const paginatedClients = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedClients.slice(start, start + pageSize)
  }, [sortedClients, currentPage, pageSize])

  // Open Create Modal
  const handleOpenCreate = () => {
    setEditingClient(null)
    setFormData(INITIAL_FORM)
    setModalOpen(true)
  }

  // Open Edit Modal
  const handleOpenEdit = (client: Client) => {
    setEditingClient(client)
    setFormData({
      first_name: client.first_name || '',
      last_name: client.last_name || '',
      rfc: client.rfc || '',
      email: client.email || '',
      phone: client.phone || '',
      address: client.address || '',
      city: client.city || '',
      state: client.state || '',
      postal_code: client.postal_code || '',
      country: client.country || 'México',
      price_number: Number(client.price_number) || 1,
      branch: client.branch || '',
      comments: client.comments || '',
    })
    setModalOpen(true)
  }

  // Save Client via Server Action
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.first_name.trim()) {
      toast.error('El nombre del cliente es obligatorio')
      return
    }

    setSaving(true)

    const payload = {
      first_name: formData.first_name.trim(),
      last_name: formData.last_name.trim() || null,
      rfc: formData.rfc.trim() || null,
      email: formData.email.trim() || null,
      phone: formData.phone.trim() || null,
      address: formData.address.trim() || null,
      city: formData.city.trim() || null,
      state: formData.state.trim() || null,
      postal_code: formData.postal_code.trim() || null,
      country: formData.country.trim() || 'México',
      price_number: Number(formData.price_number) || 1,
      branch: formData.branch.trim() || null,
      comments: formData.comments.trim() || null,
    }

    const res = await saveClientAction(payload, editingClient?.id_client)
    setSaving(false)

    if (!res.success) {
      toast.error(res.error || 'Error al guardar cliente')
    } else {
      toast.success(editingClient ? 'Cliente actualizado correctamente' : 'Cliente registrado exitosamente')
      setModalOpen(false)
      fetchClients()
    }
  }

  // Toggle logical deletion via Server Action
  const handleConfirmDelete = async () => {
    if (!clientToDelete) return
    setDeleting(true)

    const nextStatus = clientToDelete.status === 'A' ? 'I' : 'A'
    const res = await toggleClientStatusAction(clientToDelete.id_client, nextStatus)

    setDeleting(false)
    setDeleteConfirmOpen(false)

    if (!res.success) {
      toast.error(res.error || 'Error al modificar estado')
    } else {
      toast.success(nextStatus === 'I' ? 'Cliente desactivado' : 'Cliente reactivado')
      fetchClients()
    }
  }

  // View Client Purchases History
  const handleOpenHistory = async (client: Client) => {
    setHistoryClient(client)
    setHistoryModalOpen(true)
    setLoadingOrders(true)

    const { data } = await supabase
      .from('orders')
      .select('*, store:stores(description)')
      .eq('id_client', client.id_client)
      .order('created_at', { ascending: false })
      .limit(30)

    if (data) setClientOrders(data as Order[])
    setLoadingOrders(false)
  }

  // Helper for initials
  const getInitials = (first?: string | null, last?: string | null) => {
    const f = first?.trim()[0] || ''
    const l = last?.trim()[0] || ''
    return (f + l).toUpperCase() || 'C'
  }

  return (
    <div className="space-y-6">
      {/* ── Page Header ────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/10">
            <Users size={24} />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Directorio de Clientes
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Gestión de clientes, datos fiscales para facturación y listas de precios personalizadas
            </p>
          </div>
        </div>

        <GlassButton variant="primary" onClick={handleOpenCreate} className="self-start sm:self-auto shadow-lg shadow-emerald-500/20">
          <Plus size={16} className="mr-1.5" />
          Nuevo Cliente
        </GlassButton>
      </div>

      {/* ── KPI Summary Cards ───────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <GlassCard padding="sm" className="relative overflow-hidden group hover:border-emerald-500/30 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Total Registrados</span>
            <div className="w-7 h-7 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <Users size={15} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-foreground">{metrics.total}</span>
            <span className="text-[11px] text-muted-foreground">clientes</span>
          </div>
        </GlassCard>

        <GlassCard padding="sm" className="relative overflow-hidden group hover:border-emerald-500/30 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Clientes Activos</span>
            <div className="w-7 h-7 rounded-xl bg-teal-500/10 text-teal-400 flex items-center justify-center">
              <CheckCircle2 size={15} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-400">{metrics.active}</span>
            <span className="text-[11px] text-emerald-500/80 font-medium">operativos</span>
          </div>
        </GlassCard>

        <GlassCard padding="sm" className="relative overflow-hidden group hover:border-amber-500/30 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Inactivos</span>
            <div className="w-7 h-7 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <UserX size={15} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-amber-400">{metrics.inactive}</span>
            <span className="text-[11px] text-muted-foreground">en pausa</span>
          </div>
        </GlassCard>

        <GlassCard padding="sm" className="relative overflow-hidden group hover:border-indigo-500/30 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Con Datos Fiscales (RFC)</span>
            <div className="w-7 h-7 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
              <FileText size={15} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-indigo-400">{metrics.withRfc}</span>
            <span className="text-[11px] text-muted-foreground">para CFDI</span>
          </div>
        </GlassCard>
      </div>

      {/* ── Filters & Search Toolbar ────────────────────────────── */}
      <GlassCard padding="sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex-1 max-w-md relative">
            <GlassInput
              placeholder="Buscar por nombre, RFC, correo, teléfono o sucursal..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              icon={<Search size={16} />}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                title="Limpiar búsqueda"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Segmented Filter Control */}
            <div className="flex items-center gap-1 p-1 rounded-xl glass border border-border/40">
              <button
                onClick={() => setStatusFilter('A')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                  statusFilter === 'A'
                    ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20 font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span>Activos</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${statusFilter === 'A' ? 'bg-white/20 text-white' : 'bg-white/10 text-muted-foreground'}`}>
                  {metrics.active}
                </span>
              </button>
              <button
                onClick={() => setStatusFilter('I')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                  statusFilter === 'I'
                    ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20 font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span>Inactivos</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${statusFilter === 'I' ? 'bg-white/20 text-white' : 'bg-white/10 text-muted-foreground'}`}>
                  {metrics.inactive}
                </span>
              </button>
              <button
                onClick={() => setStatusFilter('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                  statusFilter === 'ALL'
                    ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20 font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span>Todos</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${statusFilter === 'ALL' ? 'bg-white/20 text-white' : 'bg-white/10 text-muted-foreground'}`}>
                  {metrics.total}
                </span>
              </button>
            </div>

            <GlassButton
              variant="ghost"
              size="sm"
              onClick={fetchClients}
              disabled={loading}
              title="Recargar directorio"
              className="h-9 px-3"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin text-emerald-400' : ''} />
              <span className="hidden sm:inline ml-1.5 text-xs">Actualizar</span>
            </GlassButton>
          </div>
        </div>
      </GlassCard>

      {/* ── Clients Table Card ──────────────────────────────────── */}
      <GlassCard padding="none" className="overflow-hidden shadow-xl">
        <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-320px)] min-h-[300px] scroll-modern">
          <table className="w-full text-left text-sm border-separate border-spacing-0">
            <thead className="sticky top-0 z-20">
              <tr className="glass-table-header border-b border-border/40 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <TableColumnHeader
                  title="Cliente"
                  sortKey="name"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                />
                <TableColumnHeader
                  title="RFC Fiscal"
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
                  title="Ubicación / Sucursal"
                  sortKey="location"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                />
                <TableColumnHeader
                  title="Lista de Precios"
                  sortKey="price_number"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  align="center"
                />
                <TableColumnHeader
                  title="Estado"
                  sortKey="status"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  align="center"
                />
                <th className="px-5 py-3.5 text-center sticky top-0 z-20 bg-card/95 backdrop-blur-md">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="w-8 h-8 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
                      <p className="text-sm font-medium">Cargando directorio de clientes...</p>
                    </div>
                  </td>
                </tr>
              ) : paginatedClients.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center max-w-sm mx-auto">
                      <div className="w-14 h-14 rounded-2xl bg-zinc-800/50 border border-zinc-700/40 flex items-center justify-center text-muted-foreground mb-3">
                        <Users size={28} />
                      </div>
                      <p className="text-base font-semibold text-foreground">No se encontraron clientes</p>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        {search ? `No hay resultados para "${search}". Intente con otro término.` : 'No hay clientes registrados en esta sección.'}
                      </p>
                      {search && (
                        <button
                          onClick={() => setSearch('')}
                          className="mt-4 px-3 py-1.5 text-xs rounded-xl bg-white/10 hover:bg-white/15 text-foreground transition-all"
                        >
                          Limpiar filtro
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedClients.map((client) => {
                  const fullName = `${client.first_name ?? ''} ${client.last_name ?? ''}`.trim() || 'Sin Nombre'
                  const initials = getInitials(client.first_name, client.last_name)
                  const hasRfc = !!client.rfc && client.rfc.trim() !== ''

                  return (
                    <tr key={client.id_client} className="hover:bg-white/[0.03] transition-colors group">
                      {/* Cliente info with initials badge */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-xs flex-shrink-0 shadow-sm">
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <span className="font-semibold text-foreground group-hover:text-emerald-400 transition-colors block truncate">
                              {fullName}
                            </span>
                            <div className="flex items-center gap-2 mt-0.5">
                              {client.branch && (
                                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground font-medium">
                                  <Building2 size={11} className="text-muted-foreground/80" />
                                  {client.branch}
                                </span>
                              )}
                              {client.comments && (
                                <span className="text-[11px] text-muted-foreground/70 truncate max-w-[140px]" title={client.comments}>
                                  · {client.comments}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* RFC */}
                      <td className="px-4 py-4">
                        {hasRfc ? (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800/60 border border-zinc-700/50 font-mono text-xs text-foreground font-medium">
                            <span>{client.rfc}</span>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(client.rfc!)
                                toast.success('RFC copiado al portapapeles')
                              }}
                              className="text-muted-foreground hover:text-emerald-400 transition-colors"
                              title="Copiar RFC"
                            >
                              <Copy size={11} />
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground/60">—</span>
                        )}
                      </td>

                      {/* Contacto */}
                      <td className="px-4 py-4 text-xs text-muted-foreground">
                        <div className="flex flex-col gap-1">
                          {client.phone ? (
                            <a
                              href={`tel:${client.phone}`}
                              className="flex items-center gap-1.5 text-foreground hover:text-emerald-400 transition-colors font-medium"
                            >
                              <Phone size={12} className="text-emerald-400 flex-shrink-0" />
                              <span>{client.phone}</span>
                            </a>
                          ) : null}
                          {client.email ? (
                            <a
                              href={`mailto:${client.email}`}
                              className="flex items-center gap-1.5 text-muted-foreground hover:text-teal-400 transition-colors"
                            >
                              <Mail size={12} className="flex-shrink-0" />
                              <span className="truncate max-w-[160px]">{client.email}</span>
                            </a>
                          ) : null}
                          {!client.phone && !client.email && <span className="text-muted-foreground/60">—</span>}
                        </div>
                      </td>

                      {/* Ubicación */}
                      <td className="px-4 py-4 text-xs text-muted-foreground">
                        {client.city || client.state ? (
                          <div className="flex items-center gap-1.5">
                            <MapPin size={12} className="text-muted-foreground/70 flex-shrink-0" />
                            <span className="truncate max-w-[150px]">
                              {[client.city, client.state].filter(Boolean).join(', ')}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground/60">—</span>
                        )}
                      </td>

                      {/* Lista de Precios */}
                      <td className="px-4 py-4 text-center">
                        {client.price_number === 2 ? (
                          <span className="px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold">
                            Lista 2 · Mayoreo
                          </span>
                        ) : client.price_number === 3 ? (
                          <span className="px-2.5 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-xs font-semibold">
                            Lista 3 · Especial
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
                            Lista 1 · General
                          </span>
                        )}
                      </td>

                      {/* Estado */}
                      <td className="px-4 py-4 text-center">
                        <StatusBadge status={client.status === 'A' ? 'active' : 'inactive'} />
                      </td>

                      {/* Acciones */}
                      <td className="px-5 py-4 text-center">
                        <TableActionMenu
                          items={[
                            {
                              label: 'Historial de Compras',
                              icon: <ShoppingBag size={15} />,
                              onClick: () => handleOpenHistory(client),
                              variant: 'indigo',
                            },
                            {
                              label: 'Editar Cliente',
                              icon: <Edit3 size={15} />,
                              onClick: () => handleOpenEdit(client),
                              variant: 'primary',
                            },
                            ...(hasRfc
                              ? [
                                  {
                                    label: 'Copiar RFC',
                                    icon: <Copy size={15} />,
                                    onClick: () => {
                                      navigator.clipboard.writeText(client.rfc!)
                                      toast.success('RFC copiado al portapapeles')
                                    },
                                    variant: 'default' as const,
                                  },
                                ]
                              : []),
                            {
                              label: client.status === 'A' ? 'Desactivar Cliente' : 'Reactivar Cliente',
                              icon: client.status === 'A' ? <Trash2 size={15} /> : <RotateCcw size={15} />,
                              onClick: () => {
                                setClientToDelete(client)
                                setDeleteConfirmOpen(true)
                              },
                              variant: client.status === 'A' ? 'danger' : 'primary',
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

        {/* Footer with Pagination */}
        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={sortedClients.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          realtimeLabel="Sincronización en tiempo real activa"
        />
      </GlassCard>

      {/* ── Modal: Create / Edit Client ─────────────────────────── */}
      <AnimatePresence>
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card max-w-2xl w-full p-6 space-y-4 max-h-[90vh] flex flex-col shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-border/40 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                    <Users size={18} />
                  </div>
                  <h3 className="text-base font-bold text-foreground">
                    {editingClient ? 'Editar Cliente' : 'Nuevo Cliente'}
                  </h3>
                </div>
                <button
                  onClick={() => setModalOpen(false)}
                  className="p-1 rounded-lg text-muted-foreground hover:text-foreground"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSave} className="space-y-4 overflow-y-auto scroll-modern pr-1">
                {/* Bloque: Identificación */}
                <div>
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 mb-2">
                    1. Información General
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground block mb-1">
                        Nombre o Razón Social *
                      </label>
                      <GlassInput
                        placeholder="Ej. Omar"
                        value={formData.first_name}
                        onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                        required
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground block mb-1">
                        Apellidos
                      </label>
                      <GlassInput
                        placeholder="Ej. Milgarejo"
                        value={formData.last_name}
                        onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground block mb-1">
                        RFC Fiscal
                      </label>
                      <GlassInput
                        placeholder="XAXX010101000"
                        value={formData.rfc}
                        onChange={(e) => setFormData({ ...formData, rfc: e.target.value.toUpperCase() })}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground block mb-1">
                        Sucursal / Referencia
                      </label>
                      <GlassInput
                        placeholder="Ej. CELL REF"
                        value={formData.branch}
                        onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                {/* Bloque: Contacto */}
                <div className="pt-2 border-t border-border/20">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 mb-2">
                    2. Medios de Contacto
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground block mb-1">
                        Teléfono
                      </label>
                      <GlassInput
                        type="tel"
                        placeholder="664-789-9177"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground block mb-1">
                        Correo Electrónico
                      </label>
                      <GlassInput
                        type="email"
                        placeholder="cliente@ejemplo.com"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                {/* Bloque: Dirección */}
                <div className="pt-2 border-t border-border/20">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 mb-2">
                    3. Dirección & Ubicación
                  </h4>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground block mb-1">
                        Calle y Número
                      </label>
                      <GlassInput
                        placeholder="Av. Paseo de los Héroes #123"
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
                          placeholder="Tijuana"
                          value={formData.city}
                          onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground block mb-1">
                          Estado
                        </label>
                        <GlassInput
                          placeholder="Baja California"
                          value={formData.state}
                          onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground block mb-1">
                          Código Postal
                        </label>
                        <GlassInput
                          placeholder="22000"
                          value={formData.postal_code}
                          onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bloque: Condiciones Comerciales */}
                <div className="pt-2 border-t border-border/20">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 mb-2">
                    4. Condiciones Comerciales
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground block mb-1">
                        Tarifa de Precios Aplicable
                      </label>
                      <select
                        value={formData.price_number}
                        onChange={(e) => setFormData({ ...formData, price_number: Number(e.target.value) })}
                        className="w-full glass-input px-3.5 py-2.5 text-xs text-foreground bg-zinc-900/90 rounded-xl border border-border/50 focus:outline-none focus:border-emerald-500"
                      >
                        <option value={1}>Lista 1 — Precio General al Público</option>
                        <option value={2}>Lista 2 — Precio Mayorista</option>
                        <option value={3}>Lista 3 — Precio Especial / Preferencial</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground block mb-1">
                        Notas / Comentarios
                      </label>
                      <GlassInput
                        placeholder="Observaciones de venta o crédito"
                        value={formData.comments}
                        onChange={(e) => setFormData({ ...formData, comments: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                {/* Actions */}
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
                    {saving ? 'Guardando...' : editingClient ? 'Actualizar Cliente' : 'Guardar Cliente'}
                  </GlassButton>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Modal: Client Purchases History ─────────────────────── */}
      <AnimatePresence>
        {historyModalOpen && historyClient && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card max-w-2xl w-full p-6 space-y-4 max-h-[85vh] flex flex-col shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-border/40 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                    <ShoppingBag size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-foreground">
                      Historial de Compras
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Cliente: <strong className="text-foreground">{historyClient.first_name} {historyClient.last_name || ''}</strong>
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setHistoryModalOpen(false)}
                  className="p-1 rounded-lg text-muted-foreground hover:text-foreground"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto scroll-modern border border-border/30 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-zinc-900 border-b border-border/40 text-muted-foreground">
                    <tr>
                      <th className="px-3.5 py-2.5">Folio</th>
                      <th className="px-3.5 py-2.5">Fecha</th>
                      <th className="px-3.5 py-2.5">Método de Pago</th>
                      <th className="px-3.5 py-2.5 text-right">Total</th>
                      <th className="px-3.5 py-2.5 text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {loadingOrders ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                          Cargando órdenes...
                        </td>
                      </tr>
                    ) : clientOrders.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">
                          <p className="text-sm font-medium">Este cliente aún no registra compras</p>
                          <p className="text-xs text-muted-foreground/70 mt-1">
                            Las compras realizadas en el Punto de Venta aparecerán aquí.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      clientOrders.map((order) => (
                        <tr key={order.id_order} className="hover:bg-white/[0.05] transition-colors">
                          <td className="px-3.5 py-2.5 font-mono font-bold text-emerald-400">
                            #{order.order_number}
                          </td>
                          <td className="px-3.5 py-2.5 text-muted-foreground">
                            {formatDateTime(order.created_at)}
                          </td>
                          <td className="px-3.5 py-2.5 uppercase font-mono text-[11px] text-muted-foreground">
                            {order.payment_method || 'Efectivo'}
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-mono font-bold text-foreground">
                            {formatCurrency(Number(order.total_amount))}
                          </td>
                          <td className="px-3.5 py-2.5 text-center">
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">
                              Completada
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Modal: Delete / Deactivate Confirm ─────────────────── */}
      <AnimatePresence>
        {deleteConfirmOpen && clientToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card max-w-md w-full p-6 space-y-4 shadow-2xl"
            >
              <h3 className="text-base font-bold text-foreground">
                {clientToDelete.status === 'A' ? '¿Desactivar Cliente?' : '¿Reactivar Cliente?'}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {clientToDelete.status === 'A'
                  ? `El cliente "${clientToDelete.first_name} ${clientToDelete.last_name || ''}" será desactivado de forma lógica. Podrá reactivarlo en cualquier momento desde el filtro de Inactivos.`
                  : `El cliente "${clientToDelete.first_name} ${clientToDelete.last_name || ''}" volverá a estar disponible para ventas y cotizaciones.`}
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
                  variant={clientToDelete.status === 'A' ? 'danger' : 'primary'}
                  size="sm"
                  onClick={handleConfirmDelete}
                  disabled={deleting}
                >
                  {deleting ? 'Procesando...' : clientToDelete.status === 'A' ? 'Desactivar' : 'Reactivar'}
                </GlassButton>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
