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
  FileText, CheckCircle2, UserX, Copy, Building2, Tag
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
  const [typeFilter, setTypeFilter] = useState<'ALL' | '1' | '2'>('ALL')

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
    const menudeo = clients.filter((c) => Number(c.price_number || 1) !== 2).length
    const mayoreo = clients.filter((c) => Number(c.price_number) === 2).length
    return { total, active, inactive, withRfc, menudeo, mayoreo }
  }, [clients])

  // Filtered clients
  const filteredClients = useMemo(() => {
    return clients.filter((c) => {
      if (statusFilter !== 'ALL' && c.status !== statusFilter) return false
      if (typeFilter === '1' && Number(c.price_number || 1) === 2) return false
      if (typeFilter === '2' && Number(c.price_number) !== 2) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        const fullName = `${c.first_name ?? ''} ${c.last_name ?? ''}`.toLowerCase()
        const rfc = (c.rfc ?? '').toLowerCase()
        const email = (c.email ?? '').toLowerCase()
        const phone = (c.phone ?? '').toLowerCase()
        const city = (c.city ?? '').toLowerCase()
        const branch = (c.branch ?? '').toLowerCase()
        const tipoText = Number(c.price_number) === 2 ? 'mayoreo' : 'menudeo'
        if (
          !fullName.includes(q) &&
          !rfc.includes(q) &&
          !email.includes(q) &&
          !phone.includes(q) &&
          !city.includes(q) &&
          !branch.includes(q) &&
          !tipoText.includes(q)
        ) {
          return false
        }
      }
      return true
    })
  }, [clients, statusFilter, typeFilter, search])

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
  }, [search, statusFilter, typeFilter])

  const isPublicoGeneralClient = useCallback((c: Client) => {
    const full = `${c.first_name || ''} ${c.last_name || ''}`
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
    return full === 'publico en general'
  }, [])

  const sortedClients = useMemo(() => {
    const list = [...filteredClients]
    if (!sortKey) return list

    return list.sort((a, b) => {
      if (sortKey === 'name' && sortDirection === 'asc') {
        const aIsDefault = isPublicoGeneralClient(a)
        const bIsDefault = isPublicoGeneralClient(b)
        if (aIsDefault && !bIsDefault) return -1
        if (!aIsDefault && bIsDefault) return 1
      }

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
  }, [filteredClients, sortKey, sortDirection, isPublicoGeneralClient])

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
      price_number: Number(formData.price_number) === 2 ? 2 : 1,
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

    let query = supabase
      .from('orders')
      .select('*, store:stores(description)')
      .order('created_at', { ascending: false })
      .limit(30)

    if (isPublicoGeneralClient(client)) {
      query = query.or(`id_client.eq.${client.id_client},id_client.is.null`)
    } else {
      query = query.eq('id_client', client.id_client)
    }

    const { data } = await query

    if (data) setClientOrders(data as Order[])
    setLoadingOrders(false)
  }

  // Helper for initials
  const getInitials = (first?: string | null, last?: string | null) => {
    const f = first?.trim() || ''
    const l = last?.trim() || ''
    if (f && l) return (f[0] + l[0]).toUpperCase()
    const words = f.split(/\s+/).filter((w) => w.length > 2 || w === f)
    if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase()
    return (f[0] || 'C').toUpperCase()
  }

  return (
    <div className="h-full flex-1 flex flex-col min-h-0 gap-2.5 sm:gap-3">
      {/* ── Page Header ────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-md shadow-emerald-500/10 shrink-0">
            <Users size={18} />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-foreground leading-tight">
              Directorio de Clientes
            </h1>
            <p className="text-xs text-muted-foreground line-clamp-1">
              Gestión de clientes, datos fiscales para facturación y listas de precios personalizadas
            </p>
          </div>
        </div>

        <GlassButton variant="primary" size="sm" onClick={handleOpenCreate} className="self-start sm:self-auto shadow-md shadow-emerald-500/20 text-xs h-8 sm:h-9">
          <Plus size={15} className="mr-1" />
          Nuevo Cliente
        </GlassButton>
      </div>

      {/* ── KPI Summary Cards (Compact) ─────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 shrink-0">
        <div className="glass rounded-xl px-3 py-1.5 flex items-center justify-between border border-border/40 hover:border-emerald-500/30 transition-all">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
              <Users size={13} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-medium text-muted-foreground truncate leading-tight">Total</p>
              <p className="text-sm font-bold text-foreground leading-none">{metrics.total}</p>
            </div>
          </div>
          <span className="text-[10px] text-muted-foreground/70 hidden sm:inline shrink-0">clientes</span>
        </div>

        <div className="glass rounded-xl px-3 py-1.5 flex items-center justify-between border border-border/40 hover:border-emerald-500/30 transition-all">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
              <Tag size={13} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-medium text-muted-foreground truncate leading-tight">Menudeo</p>
              <p className="text-sm font-bold text-emerald-400 leading-none">{metrics.menudeo}</p>
            </div>
          </div>
          <span className="text-[10px] text-emerald-500/80 font-medium shrink-0">Precio 1</span>
        </div>

        <div className="glass rounded-xl px-3 py-1.5 flex items-center justify-between border border-border/40 hover:border-blue-500/30 transition-all">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
              <Building2 size={13} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-medium text-muted-foreground truncate leading-tight">Mayoreo</p>
              <p className="text-sm font-bold text-blue-400 leading-none">{metrics.mayoreo}</p>
            </div>
          </div>
          <span className="text-[10px] text-blue-400/80 font-medium shrink-0">Precio 2</span>
        </div>

        <div className="glass rounded-xl px-3 py-1.5 flex items-center justify-between border border-border/40 hover:border-teal-500/30 transition-all">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded-lg bg-teal-500/10 text-teal-400 flex items-center justify-center shrink-0">
              <CheckCircle2 size={13} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-medium text-muted-foreground truncate leading-tight">Activos</p>
              <p className="text-sm font-bold text-teal-400 leading-none">{metrics.active}</p>
            </div>
          </div>
          <span className="text-[10px] text-teal-500/80 font-medium shrink-0">operativos</span>
        </div>

        <div className="glass rounded-xl px-3 py-1.5 flex items-center justify-between border border-border/40 hover:border-indigo-500/30 transition-all col-span-2 sm:col-span-1">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center shrink-0">
              <FileText size={13} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-medium text-muted-foreground truncate leading-tight">Con RFC</p>
              <p className="text-sm font-bold text-indigo-400 leading-none">{metrics.withRfc}</p>
            </div>
          </div>
          <span className="text-[10px] text-muted-foreground/70 hidden sm:inline shrink-0">fiscales</span>
        </div>
      </div>

      {/* ── Filters & Search Toolbar ────────────────────────────── */}
      <GlassCard padding="none" className="p-2 shrink-0">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2">
          <div className="flex-1 max-w-md relative">
            <GlassInput
              placeholder="Buscar por nombre, RFC, correo, teléfono o tipo (menudeo/mayoreo)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              icon={<Search size={15} />}
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
            {/* Filter by Client Type (Menudeo / Mayoreo) */}
            <div className="flex items-center gap-1 p-0.5 rounded-xl glass border border-border/40">
              <button
                type="button"
                onClick={() => setTypeFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                  typeFilter === 'ALL'
                    ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20 font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span>Todos</span>
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('1')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                  typeFilter === '1'
                    ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20 font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Clientes con tarifa de Menudeo (Precio 1)"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>Menudeo</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${typeFilter === '1' ? 'bg-white/20 text-white' : 'bg-white/10 text-muted-foreground'}`}>
                  {metrics.menudeo}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('2')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                  typeFilter === '2'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20 font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Clientes con tarifa de Mayoreo (Precio 2)"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                <span>Mayoreo</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${typeFilter === '2' ? 'bg-white/20 text-white' : 'bg-white/10 text-muted-foreground'}`}>
                  {metrics.mayoreo}
                </span>
              </button>
            </div>

            {/* Segmented Filter Control by Status */}
            <div className="flex items-center gap-1 p-0.5 rounded-xl glass border border-border/40">
              <button
                onClick={() => setStatusFilter('A')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
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
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
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
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
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
              className="h-8 px-2.5"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin text-emerald-400' : ''} />
              <span className="hidden sm:inline ml-1.5 text-xs">Actualizar</span>
            </GlassButton>
          </div>
        </div>
      </GlassCard>

      {/* ── Clients Table Card ──────────────────────────────────── */}
      <GlassCard padding="none" className="overflow-hidden shadow-xl flex-1 min-h-0 flex flex-col">
        <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0 scroll-modern">
          <table className="w-full text-left text-sm border-separate border-spacing-0">
            <thead className="sticky top-0 z-20">
              <tr className="glass-table-header border-b border-border/40 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <th className="w-20 px-4 py-3.5 text-center sticky top-0 z-20 bg-card/95 backdrop-blur-md">
                  Acciones
                </th>
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
                  title="Tipo de Cliente"
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
                  const isDefaultPos = isPublicoGeneralClient(client)

                  return (
                    <tr key={client.id_client} className="hover:bg-white/[0.03] transition-colors group">
                      {/* Acciones */}
                      <td className="w-20 px-4 py-4 text-center">
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
                            ...(!isDefaultPos
                              ? [
                                  {
                                    label: client.status === 'A' ? 'Desactivar Cliente' : 'Reactivar Cliente',
                                    icon: client.status === 'A' ? <Trash2 size={15} /> : <RotateCcw size={15} />,
                                    onClick: () => {
                                      setClientToDelete(client)
                                      setDeleteConfirmOpen(true)
                                    },
                                    variant: (client.status === 'A' ? 'danger' : 'primary') as 'danger' | 'primary',
                                    separatorBefore: true,
                                  },
                                ]
                              : []),
                          ]}
                        />
                      </td>

                      {/* Cliente info with initials badge */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-xs flex-shrink-0 shadow-sm">
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-foreground group-hover:text-emerald-400 transition-colors block truncate">
                                {fullName}
                              </span>
                              {isDefaultPos && (
                                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold shrink-0">
                                  Predeterminado POS
                                </span>
                              )}
                            </div>
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

                      {/* Tipo de Cliente */}
                      <td className="px-4 py-4 text-center">
                        {Number(client.price_number) === 2 ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-400 text-xs font-semibold shadow-sm">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                            Mayoreo · P2
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-semibold shadow-sm">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            Menudeo · P1
                          </span>
                        )}
                      </td>

                      {/* Estado */}
                      <td className="px-4 py-4 text-center">
                        <StatusBadge status={client.status === 'A' ? 'active' : 'inactive'} />
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
              <div className="flex items-center justify-between border-b border-border/40 pb-3 gap-2 shrink-0 sticky -top-6 -mx-6 px-6 pt-6 bg-card/95 dark:bg-card/90 backdrop-blur-xl z-20">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                    <Users size={18} />
                  </div>
                  <h3 className="text-base font-bold text-foreground">
                    {editingClient ? 'Editar Cliente' : 'Nuevo Cliente'}
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <GlassButton
                    type="submit"
                    form="client-form"
                    variant="primary"
                    size="sm"
                    disabled={saving}
                  >
                    <Check size={14} className="mr-1" />
                    {saving ? 'Guardando...' : editingClient ? 'Actualizar Cliente' : 'Guardar Cliente'}
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

              <form id="client-form" onSubmit={handleSave} className="space-y-4 overflow-y-auto scroll-modern pr-1">
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

                {/* Bloque: Tipo de Cliente y Condiciones Comerciales */}
                <div className="pt-2 border-t border-border/20">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 mb-2">
                    4. Tipo de Cliente y Condiciones Comerciales
                  </h4>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                        Tipo de Cliente *
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Option 1: Menudeo */}
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setFormData({ ...formData, price_number: 1 })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              setFormData({ ...formData, price_number: 1 })
                            }
                          }}
                          className={`p-3 rounded-2xl border cursor-pointer transition-all flex items-start gap-3 select-none ${
                            Number(formData.price_number || 1) !== 2
                              ? 'border-emerald-500 bg-emerald-500/15 shadow-md shadow-emerald-500/10'
                              : 'border-border/40 hover:border-border hover:bg-white/[0.02]'
                          }`}
                        >
                          <div
                            className={`w-5 h-5 rounded-full border flex items-center justify-center mt-0.5 shrink-0 transition-colors ${
                              Number(formData.price_number || 1) !== 2
                                ? 'border-emerald-500 bg-emerald-500 text-white'
                                : 'border-muted-foreground/40'
                            }`}
                          >
                            {Number(formData.price_number || 1) !== 2 && <Check size={12} strokeWidth={3} />}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-foreground">Menudeo</span>
                              <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">
                                Precio 1 General
                              </span>
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                              Tarifa general de menudeo. Aplica el Precio 1 de los artículos al cobrar en POS.
                            </p>
                          </div>
                        </div>

                        {/* Option 2: Mayoreo */}
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setFormData({ ...formData, price_number: 2 })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              setFormData({ ...formData, price_number: 2 })
                            }
                          }}
                          className={`p-3 rounded-2xl border cursor-pointer transition-all flex items-start gap-3 select-none ${
                            Number(formData.price_number) === 2
                              ? 'border-blue-500 bg-blue-500/15 shadow-md shadow-blue-500/10'
                              : 'border-border/40 hover:border-border hover:bg-white/[0.02]'
                          }`}
                        >
                          <div
                            className={`w-5 h-5 rounded-full border flex items-center justify-center mt-0.5 shrink-0 transition-colors ${
                              Number(formData.price_number) === 2
                                ? 'border-blue-500 bg-blue-500 text-white'
                                : 'border-muted-foreground/40'
                            }`}
                          >
                            {Number(formData.price_number) === 2 && <Check size={12} strokeWidth={3} />}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-foreground">Mayoreo</span>
                              <span className="px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-400 text-[10px] font-bold">
                                Precio 2 Mayorista
                              </span>
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                              Tarifa para compras por volumen. Aplica el Precio 2 de los artículos al cobrar en POS.
                            </p>
                          </div>
                        </div>
                      </div>
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
              <div className="flex items-center justify-between border-b border-border/40 pb-3 shrink-0 sticky -top-6 -mx-6 px-6 pt-6 bg-card/95 dark:bg-card/90 backdrop-blur-xl z-20">
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
              className="glass-card max-w-md w-full p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto scroll-modern"
            >
              <div className="flex items-center justify-between border-b border-border/40 pb-3 gap-2 sticky -top-6 -mx-6 px-6 pt-6 bg-card/95 dark:bg-card/90 backdrop-blur-xl z-20 shrink-0">
                <h3 className="text-base font-bold text-foreground">
                  {clientToDelete.status === 'A' ? '¿Desactivar Cliente?' : '¿Reactivar Cliente?'}
                </h3>
                <button
                  type="button"
                  onClick={() => setDeleteConfirmOpen(false)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
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
