'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/utils/supabase/client'
import { GlassCard } from '@/components/glass-card'
import { GlassButton } from '@/components/glass-button'
import { GlassInput } from '@/components/glass-input'
import { StatusBadge } from '@/components/status-badge'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { ConfiguracionTabs } from '@/components/configuracion/configuracion-tabs'
import { TableActionMenu, TableColumnHeader, TablePagination } from '@/components/tables'
import {
  connectToQz, isQzActive, getLocalPrinters, printTestReceipt
} from '@/lib/qz-tray-service'
import {
  getBranchPrintersAction, saveBranchPrinterAction, deleteBranchPrinterAction
} from '../actions'
import {
  type BranchPrinter, type Store, type UserRole, type CompanySettings,
  type PrinterConnectionType
} from '@/lib/types'
import { toast } from 'sonner'
import {
  Printer, Plus, Search, Wifi, Bluetooth, RotateCw, CheckCircle2,
  Trash2, Edit3, Store as StoreIcon, ShieldCheck, AlertCircle,
  HelpCircle, RefreshCw, Radio, Check, X, Laptop
} from 'lucide-react'

interface ImpresorasClientProps {
  initialPrinters: BranchPrinter[]
  initialStores: Store[]
  initialStoreId: string | null
  userRole: UserRole
  company: CompanySettings
}

export function ImpresorasClient({
  initialPrinters,
  initialStores,
  initialStoreId,
  userRole,
  company,
}: ImpresorasClientProps) {
  const supabase = createClient()
  const isAdmin = userRole === 'ADMIN'

  // Stores and Selected Store
  const [stores] = useState<Store[]>(initialStores)
  const [selectedStoreId, setSelectedStoreId] = useState<string>(
    initialStoreId || (initialStores[0]?.id_store ?? '')
  )

  // Printers list
  const [printers, setPrinters] = useState<BranchPrinter[]>(initialPrinters)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')

  // QZ Tray Status
  const [qzConnected, setQzConnected] = useState<boolean>(false)
  const [qzChecking, setQzChecking] = useState<boolean>(false)
  const [systemPrinters, setSystemPrinters] = useState<string[]>([])
  const [testingPrinterId, setTestingPrinterId] = useState<string | null>(null)

  // Modal Crear / Editar
  const [modalOpen, setModalOpen] = useState(false)
  const [editingPrinter, setEditingPrinter] = useState<BranchPrinter | null>(null)
  const [saving, setSaving] = useState(false)

  // Form Fields
  const [formName, setFormName] = useState('')
  const [formConnectionType, setFormConnectionType] = useState<PrinterConnectionType>('network')
  const [formIpAddress, setFormIpAddress] = useState('')
  const [formIpPort, setFormIpPort] = useState(9100)
  const [formBluetoothName, setFormBluetoothName] = useState('')
  const [formPaperWidth, setFormPaperWidth] = useState<number>(80)
  const [formCharactersPerLine, setFormCharactersPerLine] = useState<number>(48)
  const [formCutPaper, setFormCutPaper] = useState(true)
  const [formOpenCashDrawer, setFormOpenCashDrawer] = useState(true)
  const [formIsDefault, setFormIsDefault] = useState(false)

  // Delete Confirm
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [printerToDelete, setPrinterToDelete] = useState<BranchPrinter | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Sorting
  const [sortKey, setSortKey] = useState<string>('name')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)

  // Fetch printers for selected store
  const fetchPrinters = useCallback(async () => {
    if (!selectedStoreId) return
    setLoading(true)
    try {
      const data = await getBranchPrintersAction(selectedStoreId)
      setPrinters(data.printers)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error('Error al cargar impresoras: ' + msg)
    } finally {
      setLoading(false)
    }
  }, [selectedStoreId])

  useEffect(() => {
    fetchPrinters()
  }, [fetchPrinters])

  // Realtime subscription on branch_printers
  useEffect(() => {
    const channel = supabase
      .channel('branch-printers-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'branch_printers' }, () => {
        fetchPrinters()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, fetchPrinters])

  // Check QZ Tray status on mount
  const checkQzConnection = useCallback(async (showToast = false) => {
    setQzChecking(true)
    try {
      const active = await isQzActive()
      if (active) {
        setQzConnected(true)
        if (showToast) toast.success('QZ Tray conectado y listo para imprimir.')
      } else {
        const connected = await connectToQz({ retries: 1, delay: 1 })
        setQzConnected(connected)
        if (connected && showToast) {
          toast.success('Conexión establecida con QZ Tray.')
        }
      }
    } catch {
      setQzConnected(false)
      if (showToast) {
        toast.error('No se pudo conectar con QZ Tray', {
          description: 'Verifica que la aplicación QZ Tray esté abierta en segundo plano en esta computadora.',
        })
      }
    } finally {
      setQzChecking(false)
    }
  }, [])

  useEffect(() => {
    checkQzConnection(false)
  }, [checkQzConnection])

  // Scan local printers from QZ Tray
  const handleScanLocalPrinters = async () => {
    try {
      toast.info('Escaneando impresoras del sistema...')
      const list = await getLocalPrinters()
      setSystemPrinters(list)
      setQzConnected(true)
      toast.success(`Se encontraron ${list.length} impresoras en el equipo.`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error('Error al detectar impresoras: ' + msg)
    }
  }

  // Current store name
  const currentStore = useMemo(() => {
    return stores.find((s) => s.id_store === selectedStoreId)
  }, [stores, selectedStoreId])

  // Open modal for Create
  const handleOpenCreateModal = () => {
    setEditingPrinter(null)
    setFormName('')
    setFormConnectionType('network')
    setFormIpAddress('')
    setFormIpPort(9100)
    setFormBluetoothName('')
    setFormPaperWidth(80)
    setFormCharactersPerLine(48)
    setFormCutPaper(true)
    setFormOpenCashDrawer(true)
    setFormIsDefault(printers.length === 0)
    setModalOpen(true)
  }

  // Open modal for Edit
  const handleOpenEditModal = (printer: BranchPrinter) => {
    setEditingPrinter(printer)
    setFormName(printer.name)
    setFormConnectionType(printer.connection_type)
    setFormIpAddress(printer.ip_address || '')
    setFormIpPort(printer.ip_port || 9100)
    setFormBluetoothName(printer.bluetooth_name || '')
    setFormPaperWidth(printer.paper_width || 80)
    setFormCharactersPerLine(printer.characters_per_line || (printer.paper_width === 58 ? 32 : 48))
    setFormCutPaper(printer.cut_paper)
    setFormOpenCashDrawer(printer.open_cash_drawer)
    setFormIsDefault(printer.is_default)
    setModalOpen(true)
  }

  // Handle Save Printer
  const handleSavePrinter = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formName.trim()) {
      toast.error('El nombre de la impresora es requerido.')
      return
    }

    if (formConnectionType === 'network' && !formIpAddress.trim()) {
      toast.error('Ingresa la dirección IP de la impresora.')
      return
    }

    if (formConnectionType === 'bluetooth' && !formBluetoothName.trim()) {
      toast.error('Ingresa el nombre o identificador Bluetooth de la impresora.')
      return
    }

    setSaving(true)
    try {
      await saveBranchPrinterAction({
        id_printer: editingPrinter?.id_printer,
        id_store: selectedStoreId,
        name: formName.trim(),
        connection_type: formConnectionType,
        ip_address: formConnectionType === 'network' ? formIpAddress.trim() : null,
        ip_port: formConnectionType === 'network' ? Number(formIpPort) || 9100 : 9100,
        bluetooth_name: formConnectionType === 'bluetooth' ? formBluetoothName.trim() : null,
        paper_width: Number(formPaperWidth) || 80,
        characters_per_line: Number(formCharactersPerLine) || (formPaperWidth === 58 ? 32 : 48),
        cut_paper: formCutPaper,
        open_cash_drawer: formOpenCashDrawer,
        is_default: formIsDefault,
      })

      toast.success(editingPrinter ? 'Impresora actualizada' : 'Impresora registrada')
      setModalOpen(false)
      fetchPrinters()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  // Handle Mark as Default
  const handleSetDefault = async (printer: BranchPrinter) => {
    try {
      await saveBranchPrinterAction({
        ...printer,
        is_default: true,
      })
      toast.success(`"${printer.name}" establecida como predeterminada`)
      fetchPrinters()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(msg)
    }
  }

  // Handle Delete
  const handleDeletePrinter = async () => {
    if (!printerToDelete) return
    setDeleting(true)
    try {
      await deleteBranchPrinterAction(printerToDelete.id_printer)
      toast.success(`Impresora "${printerToDelete.name}" eliminada`)
      setDeleteDialogOpen(false)
      setPrinterToDelete(null)
      fetchPrinters()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(msg)
    } finally {
      setDeleting(false)
    }
  }

  // Handle Test Print
  const handleTestPrint = async (printer: BranchPrinter) => {
    setTestingPrinterId(printer.id_printer)
    try {
      toast.info(`Enviando ticket de prueba a "${printer.name}"...`)
      await printTestReceipt(printer, company, currentStore?.description || undefined)
      toast.success(`Ticket de prueba impreso con éxito en "${printer.name}"`)
      setQzConnected(true)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error('Fallo en la prueba de impresión: ' + msg)
    } finally {
      setTestingPrinterId(null)
    }
  }

  // Filtered & Sorted Printers
  const filteredPrinters = useMemo(() => {
    return printers.filter((p) => {
      if (!search.trim()) return true
      const q = search.toLowerCase()
      const name = p.name.toLowerCase()
      const ip = (p.ip_address || '').toLowerCase()
      const bt = (p.bluetooth_name || '').toLowerCase()
      return name.includes(q) || ip.includes(q) || bt.includes(q)
    })
  }, [printers, search])

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDirection('asc')
    }
  }

  const sortedPrinters = useMemo(() => {
    const list = [...filteredPrinters]
    if (!sortKey) return list

    return list.sort((a, b) => {
      let aVal: string | number = ''
      let bVal: string | number = ''

      switch (sortKey) {
        case 'name':
          aVal = a.name.toLowerCase()
          bVal = b.name.toLowerCase()
          break
        case 'connection_type':
          aVal = a.connection_type
          bVal = b.connection_type
          break
        case 'address':
          aVal = a.connection_type === 'network' ? (a.ip_address || '') : (a.bluetooth_name || '')
          bVal = b.connection_type === 'network' ? (b.ip_address || '') : (b.bluetooth_name || '')
          break
        case 'paper_width':
          aVal = a.paper_width
          bVal = b.paper_width
          break
        case 'is_default':
          aVal = a.is_default ? 1 : 0
          bVal = b.is_default ? 1 : 0
          break
        default:
          return 0
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
  }, [filteredPrinters, sortKey, sortDirection])

  const totalPages = Math.max(1, Math.ceil(filteredPrinters.length / pageSize))

  // Paginated Printers
  const paginatedPrinters = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedPrinters.slice(start, start + pageSize)
  }, [sortedPrinters, currentPage, pageSize])

  return (
    <div className="h-full flex-1 flex flex-col min-h-0 gap-2.5 sm:gap-3 w-full">
      <div className="dashboard-bg" />

      {/* Header & Tabs */}
      <div className="flex flex-col gap-2 shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-500 border border-emerald-500/20 flex items-center justify-center shrink-0">
              <Printer size={18} />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-foreground leading-tight">
                Configuración del Sistema
              </h1>
              <p className="text-xs text-muted-foreground line-clamp-1">
                Impresoras térmicas de tickets y recibos por sucursal gestionadas mediante QZ Tray
              </p>
            </div>
          </div>

          {/* QZ Tray Status Pill */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => checkQzConnection(true)}
              disabled={qzChecking}
              className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                qzConnected
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                  : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
              }`}
            >
              <div
                className={`w-2 h-2 rounded-full ${
                  qzConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'
                }`}
              />
              <span>
                {qzChecking
                  ? 'Verificando...'
                  : qzConnected
                  ? 'QZ Tray Conectado'
                  : 'QZ Tray Desconectado'}
              </span>
              <RotateCw size={12} className={qzChecking ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <ConfiguracionTabs />
      </div>

      {/* Store Selector & Controls Bar */}
      <GlassCard padding="none" className="p-2 shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
          {/* Sucursal Activa */}
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-white/5 border border-white/10 text-emerald-400">
              <StoreIcon size={18} />
            </div>
            <div>
              <span className="text-[11px] font-semibold text-muted-foreground block">
                Sucursal para Impresión
              </span>
              {isAdmin ? (
                <select
                  value={selectedStoreId}
                  onChange={(e) => setSelectedStoreId(e.target.value)}
                  className="mt-0.5 px-3 py-1 text-xs font-bold text-foreground bg-white/5 border border-white/15 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                >
                  {stores.map((s) => (
                    <option key={s.id_store} value={s.id_store} className="bg-zinc-900 text-white">
                      {s.description || 'Sucursal sin nombre'} ({s.location || 'Local'})
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-xs font-bold text-foreground mt-0.5">
                  {currentStore?.description || 'Sucursal Asignada'}
                </p>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <GlassButton
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleScanLocalPrinters}
              className="text-xs flex items-center gap-1.5"
            >
              <Laptop size={14} />
              <span>Detectar en Equipo</span>
            </GlassButton>

            <GlassButton
              type="button"
              variant="primary"
              size="sm"
              onClick={handleOpenCreateModal}
              className="text-xs flex items-center gap-1.5 shadow-md shadow-emerald-500/20"
            >
              <Plus size={15} />
              <span>Nueva Impresora</span>
            </GlassButton>
          </div>
        </div>
      </GlassCard>

      {/* Search & Stats Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <GlassInput
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setCurrentPage(1)
            }}
            placeholder="Buscar por nombre, IP o Bluetooth..."
            className="pl-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{filteredPrinters.length} impresora(s) configurada(s)</span>
        </div>
      </div>

      {/* Printers Table */}
      <GlassCard className="flex-1 min-h-0 flex flex-col overflow-hidden p-0 shadow-xl">
        <div className="scrollable-table scroll-modern flex-1 min-h-0 overflow-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="glass-table-header sticky top-0 z-10">
                <TableColumnHeader
                  title="Impresora / Nombre"
                  sortKey="name"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  className="pl-6"
                />
                <TableColumnHeader
                  title="Conexión"
                  sortKey="connection_type"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                />
                <TableColumnHeader
                  title="Dirección / Identificador"
                  sortKey="address"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                />
                <TableColumnHeader
                  title="Papel / Columnas"
                  sortKey="paper_width"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                />
                <th className="py-3 px-4 text-center text-xs font-semibold text-muted-foreground">
                  Corte / Cajón
                </th>
                <TableColumnHeader
                  title="Predeterminada"
                  sortKey="is_default"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  align="center"
                />
                <th className="py-3 pr-6 text-right text-xs font-semibold text-muted-foreground">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-xs text-muted-foreground">
                    <RefreshCw size={20} className="animate-spin mx-auto mb-2 text-emerald-500" />
                    Cargando impresoras...
                  </td>
                </tr>
              ) : paginatedPrinters.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-xs text-muted-foreground">
                    <Printer size={32} className="mx-auto mb-2 text-muted-foreground/40" />
                    No hay impresoras registradas para esta sucursal.
                    <div className="mt-2">
                      <GlassButton
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={handleOpenCreateModal}
                        className="text-xs"
                      >
                        <Plus size={14} className="mr-1" />
                        Agregar la primera impresora
                      </GlassButton>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedPrinters.map((printer) => {
                  const isTesting = testingPrinterId === printer.id_printer

                  return (
                    <tr
                      key={printer.id_printer}
                      className="border-b border-white/5 hover:bg-white/5 transition-colors group"
                    >
                      {/* Name */}
                      <td className="py-3.5 pl-6">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 rounded-xl bg-white/5 border border-white/10 text-emerald-400 group-hover:scale-105 transition-transform">
                            <Printer size={16} />
                          </div>
                          <div>
                            <span className="text-xs font-bold text-foreground block">
                              {printer.name}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {currentStore?.description || 'Sucursal'}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Connection Type */}
                      <td className="py-3.5 text-xs">
                        {printer.connection_type === 'network' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <Wifi size={12} />
                            <span>Red (IP / Ethernet)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                            <Bluetooth size={12} />
                            <span>Bluetooth</span>
                          </span>
                        )}
                      </td>

                      {/* Address */}
                      <td className="py-3.5 text-xs font-mono">
                        {printer.connection_type === 'network' ? (
                          <span className="text-foreground">
                            {printer.ip_address}:{printer.ip_port || 9100}
                          </span>
                        ) : (
                          <span className="text-indigo-300">
                            {printer.bluetooth_name || 'N/A'}
                          </span>
                        )}
                      </td>

                      {/* Paper Width */}
                      <td className="py-3.5 text-xs">
                        <span className="font-semibold text-foreground">
                          {printer.paper_width || 80} mm
                        </span>
                        <span className="text-[10px] text-muted-foreground block">
                          {printer.characters_per_line || (printer.paper_width === 58 ? 32 : 48)} caracteres/línea
                        </span>
                      </td>

                      {/* Cut / Drawer */}
                      <td className="py-3.5 text-center text-xs">
                        <div className="flex items-center justify-center gap-2 text-[11px]">
                          <span
                            title="Corte de papel"
                            className={`px-1.5 py-0.5 rounded ${
                              printer.cut_paper
                                ? 'bg-emerald-500/15 text-emerald-400'
                                : 'bg-white/5 text-muted-foreground/50'
                            }`}
                          >
                            Corte
                          </span>
                          <span
                            title="Apertura de cajón de dinero"
                            className={`px-1.5 py-0.5 rounded ${
                              printer.open_cash_drawer
                                ? 'bg-indigo-500/15 text-indigo-400'
                                : 'bg-white/5 text-muted-foreground/50'
                            }`}
                          >
                            Cajón
                          </span>
                        </div>
                      </td>

                      {/* Is Default */}
                      <td className="py-3.5 text-center text-xs">
                        {printer.is_default ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            <CheckCircle2 size={12} />
                            <span>Predeterminada</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleSetDefault(printer)}
                            className="text-[11px] text-muted-foreground hover:text-emerald-400 transition-colors"
                          >
                            Hacer default
                          </button>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 pr-6 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Quick test button */}
                          <button
                            type="button"
                            onClick={() => handleTestPrint(printer)}
                            disabled={isTesting}
                            title="Imprimir ticket de prueba"
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-emerald-400 hover:bg-white/5 transition-colors"
                          >
                            {isTesting ? (
                              <RefreshCw size={15} className="animate-spin text-emerald-400" />
                            ) : (
                              <Printer size={15} />
                            )}
                          </button>

                          {/* 3-dots action menu */}
                          <TableActionMenu
                            items={[
                              {
                                label: 'Probar Impresión (QZ Tray)',
                                icon: <Printer size={14} />,
                                onClick: () => handleTestPrint(printer),
                              },
                              {
                                label: 'Editar Configuración',
                                icon: <Edit3 size={14} />,
                                onClick: () => handleOpenEditModal(printer),
                              },
                              ...(!printer.is_default
                                ? [
                                    {
                                      label: 'Marcar como Predeterminada',
                                      icon: <CheckCircle2 size={14} />,
                                      onClick: () => handleSetDefault(printer),
                                    },
                                  ]
                                : []),
                              {
                                label: 'Eliminar Impresora',
                                icon: <Trash2 size={14} />,
                                variant: 'danger',
                                onClick: () => {
                                  setPrinterToDelete(printer)
                                  setDeleteDialogOpen(true)
                                },
                              },
                            ]}
                          />
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {filteredPrinters.length > 0 && (
          <TablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            totalItems={filteredPrinters.length}
            onPageChange={setCurrentPage}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize)
              setCurrentPage(1)
            }}
          />
        )}
      </GlassCard>

      {/* Modal: Crear / Editar Impresora */}
      <AnimatePresence>
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto scroll-modern"
            >
              <div className="flex items-center justify-between border-b border-border/40 pb-3 gap-2 shrink-0 sticky -top-6 -mx-6 px-6 pt-6 bg-card/95 dark:bg-card/90 backdrop-blur-xl z-20">
                <div className="flex items-center gap-2">
                  <Printer size={20} className="text-emerald-500" />
                  <h3 className="text-base font-bold text-foreground">
                    {editingPrinter ? 'Editar Impresora' : 'Registrar Impresora'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSavePrinter} className="flex flex-col gap-4">
                {/* Nombre */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1 block">
                    Nombre de la Impresora *
                  </label>
                  <GlassInput
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Ej. Impresora Mostrador / Caja 1"
                    required
                    autoFocus
                  />
                </div>

                {/* Tipo de Conexión */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                    Tipo de Conexión
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setFormConnectionType('network')}
                      className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-bold transition-all ${
                        formConnectionType === 'network'
                          ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 shadow-md shadow-emerald-500/10'
                          : 'bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10'
                      }`}
                    >
                      <Wifi size={16} />
                      <span>Red (IP / Ethernet)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setFormConnectionType('bluetooth')}
                      className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-bold transition-all ${
                        formConnectionType === 'bluetooth'
                          ? 'bg-indigo-500/20 border-indigo-500 text-indigo-400 shadow-md shadow-indigo-500/10'
                          : 'bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10'
                      }`}
                    >
                      <Bluetooth size={16} />
                      <span>Bluetooth</span>
                    </button>
                  </div>
                </div>

                {/* Dynamic fields based on connection type */}
                {formConnectionType === 'network' ? (
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="text-xs font-semibold text-muted-foreground mb-1 block">
                        Dirección IP de la Impresora *
                      </label>
                      <GlassInput
                        value={formIpAddress}
                        onChange={(e) => setFormIpAddress(e.target.value)}
                        placeholder="192.168.1.100"
                        className="font-mono"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground mb-1 block">
                        Puerto RAW
                      </label>
                      <GlassInput
                        type="number"
                        value={formIpPort}
                        onChange={(e) => setFormIpPort(Number(e.target.value))}
                        placeholder="9100"
                        className="font-mono"
                        required
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-muted-foreground">
                        Nombre o MAC del Dispositivo Bluetooth *
                      </label>
                      {systemPrinters.length > 0 && (
                        <span className="text-[10px] text-emerald-400">
                          {systemPrinters.length} disponibles
                        </span>
                      )}
                    </div>
                    <GlassInput
                      value={formBluetoothName}
                      onChange={(e) => setFormBluetoothName(e.target.value)}
                      placeholder="Ej. MTP-II o POS-58"
                      className="font-mono"
                      required
                    />
                    {systemPrinters.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {systemPrinters.slice(0, 5).map((sp) => (
                          <button
                            key={sp}
                            type="button"
                            onClick={() => setFormBluetoothName(sp)}
                            className="text-[10px] px-2 py-0.5 rounded-md bg-white/5 hover:bg-white/10 text-muted-foreground border border-white/10 font-mono"
                          >
                            {sp}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Paper width & Characters per line */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground mb-1 block">
                      Ancho de Papel Térmico
                    </label>
                    <select
                      value={formPaperWidth}
                      onChange={(e) => {
                        const width = Number(e.target.value)
                        setFormPaperWidth(width)
                        setFormCharactersPerLine(width === 58 ? 32 : 48)
                      }}
                      className="w-full glass-input px-3.5 py-2.5 text-xs text-foreground bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value={80} className="bg-zinc-900 text-white">
                        80 mm (Estándar)
                      </option>
                      <option value={58} className="bg-zinc-900 text-white">
                        58 mm (Compacto)
                      </option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-muted-foreground mb-1 block">
                      Caracteres por Línea
                    </label>
                    <GlassInput
                      type="number"
                      value={formCharactersPerLine}
                      onChange={(e) => setFormCharactersPerLine(Number(e.target.value))}
                      placeholder="48"
                      className="font-mono"
                    />
                  </div>
                </div>

                {/* ESC/POS Toggles */}
                <div className="p-3 rounded-2xl bg-white/5 border border-white/10 flex flex-col gap-2.5">
                  <label className="flex items-center justify-between cursor-pointer text-xs">
                    <span className="text-muted-foreground">Corte automático de papel (ESC/POS)</span>
                    <input
                      type="checkbox"
                      checked={formCutPaper}
                      onChange={(e) => setFormCutPaper(e.target.checked)}
                      className="rounded border-zinc-700 bg-zinc-800 text-emerald-500 focus:ring-emerald-500"
                    />
                  </label>

                  <label className="flex items-center justify-between cursor-pointer text-xs">
                    <span className="text-muted-foreground">Apertura automática de cajón de dinero</span>
                    <input
                      type="checkbox"
                      checked={formOpenCashDrawer}
                      onChange={(e) => setFormOpenCashDrawer(e.target.checked)}
                      className="rounded border-zinc-700 bg-zinc-800 text-emerald-500 focus:ring-emerald-500"
                    />
                  </label>

                  <label className="flex items-center justify-between cursor-pointer text-xs">
                    <span className="text-muted-foreground">Marcar como impresora predeterminada</span>
                    <input
                      type="checkbox"
                      checked={formIsDefault}
                      onChange={(e) => setFormIsDefault(e.target.checked)}
                      className="rounded border-zinc-700 bg-zinc-800 text-emerald-500 focus:ring-emerald-500"
                    />
                  </label>
                </div>

                {/* Submit / Cancel */}
                <div className="flex items-center justify-end gap-2 pt-2">
                  <GlassButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setModalOpen(false)}
                    disabled={saving}
                  >
                    Cancelar
                  </GlassButton>
                  <GlassButton
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={saving}
                    className="shadow-md shadow-emerald-500/20"
                  >
                    {saving ? (
                      <>
                        <RefreshCw size={14} className="animate-spin mr-1.5" />
                        <span>Guardando...</span>
                      </>
                    ) : (
                      <span>{editingPrinter ? 'Actualizar Impresora' : 'Registrar Impresora'}</span>
                    )}
                  </GlassButton>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="¿Eliminar impresora?"
        description={`Se dará de baja la impresora "${printerToDelete?.name}". Podrás dar de alta una nueva o reactivarla en cualquier momento.`}
        confirmLabel={deleting ? 'Eliminando...' : 'Eliminar Impresora'}
        cancelLabel="Cancelar"
        variant="destructive"
        onConfirm={handleDeletePrinter}
      />
    </div>
  )
}
