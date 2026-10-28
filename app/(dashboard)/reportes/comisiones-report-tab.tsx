'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { GlassCard } from '@/components/glass-card'
import { GlassButton } from '@/components/glass-button'
import { GlassInput } from '@/components/glass-input'
import { StatusBadge } from '@/components/status-badge'
import { type Profile, type Store, type Order } from '@/lib/types'
import {
  getCommissionsReportAction,
  type EmployeeCommissionSummary,
  type CommissionReportData,
} from './comisiones-actions'
import {
  getStoresForAttendanceAction,
  getStoreEmployeesAction,
} from './attendance-actions'
import { TableColumnHeader, TablePagination } from '@/components/tables'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { toast } from 'sonner'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import {
  Percent, DollarSign, Store as StoreIcon, Users, Calendar, Search, RefreshCw,
  FileText, FileSpreadsheet, AlertCircle, ArrowUpRight, CheckCircle2,
  Trophy, Wrench, ShoppingBag, Receipt, Sparkles, Filter
} from 'lucide-react'
import { UserAvatar } from '@/components/user-avatar'

interface CommissionsReportTabProps {
  currentProfile: Profile | null
  activeStoreId: string | null
}

export function CommissionsReportTab({
  currentProfile,
  activeStoreId,
}: CommissionsReportTabProps) {
  const isAdmin = currentProfile?.role === 'ADMIN'

  // Stores & Employees filters
  const [stores, setStores] = useState<Store[]>([])
  const [selectedStoreId, setSelectedStoreId] = useState<string>(() => {
    if (isAdmin) return activeStoreId || 'ALL'
    return currentProfile?.id_store || activeStoreId || ''
  })
  const [employees, setEmployees] = useState<Profile[]>([])
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('ALL')

  // Date Range (default: Quincena actual o Mes)
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0]
  })
  const [endDate, setEndDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0]
  })

  // View mode: 'summaries' (por colaborador) or 'tickets' (por ticket)
  const [viewMode, setViewMode] = useState<'summaries' | 'tickets'>('summaries')

  // Data & Loading
  const [loading, setLoading] = useState(false)
  const [orders, setOrders] = useState<Order[]>([])
  const [summaries, setSummaries] = useState<EmployeeCommissionSummary[]>([])
  const [metrics, setMetrics] = useState<CommissionReportData['metrics']>({
    totalSalesWithoutTax: 0,
    totalServicesWithoutTax: 0,
    totalCommissions: 0,
    totalOrdersWithCommission: 0,
    topEarner: null,
  })

  // Search & Sorting
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<string>('total_commission')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  // 1. Load Stores
  useEffect(() => {
    getStoresForAttendanceAction().then((storeList) => {
      setStores(storeList)
      if (isAdmin && !selectedStoreId && storeList.length > 0) {
        if (activeStoreId) {
          setSelectedStoreId(activeStoreId)
        }
      }
    })
  }, [isAdmin, activeStoreId, selectedStoreId])

  // 2. Load Employees for Selected Store
  useEffect(() => {
    const storeParam = selectedStoreId === 'ALL' ? null : selectedStoreId
    getStoreEmployeesAction(storeParam).then((empList) => {
      setEmployees(empList || [])
    })
  }, [selectedStoreId])

  // 3. Fetch Report Data
  const fetchReport = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getCommissionsReportAction({
        storeId: selectedStoreId,
        startDate,
        endDate,
        employeeId: selectedEmployeeId,
      })

      setOrders(data.orders)
      setSummaries(data.summaries)
      setMetrics(data.metrics)
      setCurrentPage(1)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al cargar reporte de comisiones'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [selectedStoreId, startDate, endDate, selectedEmployeeId])

  useEffect(() => {
    fetchReport()
  }, [fetchReport])

  // Presets de Fechas
  const applyDatePreset = (preset: 'today' | 'week' | 'fortnight' | 'month') => {
    const now = new Date()
    const todayStr = now.toISOString().split('T')[0]

    if (preset === 'today') {
      setStartDate(todayStr)
      setEndDate(todayStr)
    } else if (preset === 'week') {
      const day = now.getDay()
      const diffToMonday = (day === 0 ? -6 : 1) - day
      const monday = new Date(now)
      monday.setDate(now.getDate() + diffToMonday)
      setStartDate(monday.toISOString().split('T')[0])
      setEndDate(todayStr)
    } else if (preset === 'fortnight') {
      const currentDay = now.getDate()
      const firstDay = currentDay <= 15 ? 1 : 16
      const start = new Date(now.getFullYear(), now.getMonth(), firstDay)
      setStartDate(start.toISOString().split('T')[0])
      setEndDate(todayStr)
    } else if (preset === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      setStartDate(start.toISOString().split('T')[0])
      setEndDate(todayStr)
    }
  }

  // Filtered & Sorted Summaries
  const filteredSummaries = useMemo(() => {
    let list = [...summaries]

    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((s) => s.full_name.toLowerCase().includes(q) || (s.email || '').toLowerCase().includes(q))
    }

    list.sort((a, b) => {
      let aVal: number | string = 0
      let bVal: number | string = 0

      switch (sortKey) {
        case 'name':
          aVal = a.full_name.toLowerCase()
          bVal = b.full_name.toLowerCase()
          break
        case 'products':
          aVal = a.products_subtotal
          bVal = b.products_subtotal
          break
        case 'sales_commission':
          aVal = a.sales_commission_amount
          bVal = b.sales_commission_amount
          break
        case 'services':
          aVal = a.services_subtotal
          bVal = b.services_subtotal
          break
        case 'service_commission':
          aVal = a.service_commission_amount
          bVal = b.service_commission_amount
          break
        case 'total_commission':
        default:
          aVal = a.total_commission
          bVal = b.total_commission
          break
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })

    return list
  }, [summaries, search, sortKey, sortDirection])

  // Filtered & Sorted Orders (Tickets)
  const filteredOrders = useMemo(() => {
    let list = [...orders]

    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((o) => {
        const orderNum = String(o.order_number || '')
        const sellerName = (o.seller?.full_name || '').toLowerCase()
        const techName = (o.technician?.full_name || '').toLowerCase()
        const clientName = o.client
          ? `${o.client.first_name || ''} ${o.client.last_name || ''}`.toLowerCase()
          : 'publico en general'
        return orderNum.includes(q) || sellerName.includes(q) || techName.includes(q) || clientName.includes(q)
      })
    }

    return list
  }, [orders, search])

  const totalPages =
    viewMode === 'summaries'
      ? Math.ceil(filteredSummaries.length / pageSize) || 1
      : Math.ceil(filteredOrders.length / pageSize) || 1

  const paginatedSummaries = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredSummaries.slice(start, start + pageSize)
  }, [filteredSummaries, currentPage, pageSize])

  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredOrders.slice(start, start + pageSize)
  }, [filteredOrders, currentPage, pageSize])

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDirection('desc')
    }
  }

  // Exportar Excel
  const exportToExcel = () => {
    if (summaries.length === 0 && orders.length === 0) {
      toast.error('No hay datos para exportar')
      return
    }

    const wb = XLSX.utils.book_new()

    // Hoja 1: Resumen por Colaborador
    const summaryRows = summaries.map((s) => ({
      Colaborador: s.full_name,
      Rol: s.role,
      'Tickets de Venta': s.sales_count,
      'Ventas Prod. (Sin IVA)': s.products_subtotal,
      'Comisión Ventas ($)': s.sales_commission_amount,
      'Órdenes de Servicio': s.services_count,
      'Servicios Taller (Sin IVA)': s.services_subtotal,
      'Comisión Servicios ($)': s.service_commission_amount,
      'TOTAL COMISIÓN A LIQUIDAR': s.total_commission,
    }))
    const wsSummaries = XLSX.utils.json_to_sheet(summaryRows)
    XLSX.utils.book_append_sheet(wb, wsSummaries, 'Resumen Colaboradores')

    // Hoja 2: Detalle por Ticket
    const ticketRows = orders.map((o) => ({
      'No. Ticket': `#${o.order_number}`,
      Fecha: formatDateTime(o.created_at),
      Cliente: o.client ? `${o.client.first_name || ''} ${o.client.last_name || ''}`.trim() : 'Público en General',
      'Vendedor Asignado': o.seller?.full_name || 'N/A',
      'Prod. Sin IVA': Number(o.products_subtotal || 0),
      '% Com. Venta': `${o.seller_commission_pct || 0}%`,
      '$ Com. Vendedor': Number(o.seller_commission_amount || 0),
      'Técnico Asignado': o.technician?.full_name || 'N/A',
      'Serv. Sin IVA': Number(o.services_subtotal || 0),
      '% Com. Técnico': `${o.technician_commission_pct || 0}%`,
      '$ Com. Técnico': Number(o.technician_commission_amount || 0),
      'Comisión Total Ticket': Number(o.seller_commission_amount || 0) + Number(o.technician_commission_amount || 0),
      'Total Ticket con IVA': Number(o.total_amount || 0),
    }))
    const wsTickets = XLSX.utils.json_to_sheet(ticketRows)
    XLSX.utils.book_append_sheet(wb, wsTickets, 'Detalle por Ticket')

    XLSX.writeFile(wb, `Reporte_Comisiones_Campiran_${startDate}_al_${endDate}.xlsx`)
    toast.success('Reporte de comisiones exportado en Excel correctamente')
  }

  // Exportar PDF
  const exportToPdf = () => {
    if (summaries.length === 0) {
      toast.error('No hay datos para exportar a PDF')
      return
    }

    const doc = new jsPDF('landscape')
    const storeLabel =
      selectedStoreId === 'ALL'
        ? 'Todas las Sucursales'
        : stores.find((s) => s.id_store === selectedStoreId)?.description || 'Sucursal'

    // Header
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text('CAMPIRAN — REPORTE DE COMISIONES Y NÓMINA', 14, 15)

    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text(`Sucursal: ${storeLabel} | Periodo: ${startDate} al ${endDate}`, 14, 21)
    doc.text(
      `Total Ventas (Sin IVA): ${formatCurrency(metrics.totalSalesWithoutTax)} | Total Servicios (Sin IVA): ${formatCurrency(metrics.totalServicesWithoutTax)} | COMISIONES TOTALES: ${formatCurrency(metrics.totalCommissions)}`,
      14,
      27
    )

    // Table
    const tableData = summaries.map((s) => [
      s.full_name,
      s.role,
      String(s.sales_count),
      formatCurrency(s.products_subtotal),
      formatCurrency(s.sales_commission_amount),
      String(s.services_count),
      formatCurrency(s.services_subtotal),
      formatCurrency(s.service_commission_amount),
      formatCurrency(s.total_commission),
    ])

    autoTable(doc, {
      startY: 32,
      head: [
        [
          'Colaborador',
          'Rol',
          'Tickets',
          'Ventas Prod. (s/IVA)',
          'Com. Vendedor',
          'Servicios',
          'Servicios (s/IVA)',
          'Com. Técnico',
          'Total a Liquidar',
        ],
      ],
      body: tableData,
      theme: 'grid',
      headStyles: {
        fillColor: [16, 185, 129], // Emerald
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
      },
      styles: {
        fontSize: 7.5,
        cellPadding: 2,
      },
      columnStyles: {
        0: { fontStyle: 'bold' },
        8: { fontStyle: 'bold', textColor: [16, 185, 129] },
      },
    })

    doc.save(`Reporte_Comisiones_${startDate}_al_${endDate}.pdf`)
    toast.success('Reporte de comisiones generado en PDF')
  }

  return (
    <div className="space-y-4">
      {/* Filters Card */}
      <GlassCard padding="md" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Percent className="text-emerald-500" size={20} />
            <div>
              <h3 className="text-base font-bold text-foreground">
                Control y Liquidación de Comisiones
              </h3>
              <p className="text-xs text-muted-foreground">
                Comisiones calculadas sobre el subtotal sin IVA para vendedores (artículos) y técnicos (servicios).
              </p>
            </div>
          </div>

          {/* Export Actions & Refresh */}
          <div className="flex items-center gap-2">
            <GlassButton
              variant="ghost"
              size="sm"
              onClick={fetchReport}
              disabled={loading}
              className="text-xs"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin mr-1' : 'mr-1'} />
              Actualizar
            </GlassButton>
            <GlassButton
              variant="secondary"
              size="sm"
              onClick={exportToExcel}
              className="text-xs text-emerald-400"
            >
              <FileSpreadsheet size={14} className="mr-1" />
              Excel
            </GlassButton>
            <GlassButton
              variant="secondary"
              size="sm"
              onClick={exportToPdf}
              className="text-xs text-indigo-300"
            >
              <FileText size={14} className="mr-1" />
              PDF
            </GlassButton>
          </div>
        </div>

        {/* Filter Controls Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-border/20">
          {/* Sucursal (ADMIN o Fija) */}
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
              Sucursal
            </label>
            {isAdmin ? (
              <select
                value={selectedStoreId}
                onChange={(e) => setSelectedStoreId(e.target.value)}
                className="w-full glass-input px-3 py-1.5 text-xs text-foreground bg-transparent focus:outline-none"
              >
                <option value="ALL" className="bg-zinc-900 text-white">
                  Todas las Sucursales
                </option>
                {stores.map((s) => (
                  <option key={s.id_store} value={s.id_store} className="bg-zinc-900 text-white">
                    {s.description}
                  </option>
                ))}
              </select>
            ) : (
              <div className="glass-input px-3 py-1.5 text-xs text-foreground flex items-center gap-1.5">
                <StoreIcon size={13} className="text-emerald-400" />
                <span className="truncate">
                  {stores.find((s) => s.id_store === selectedStoreId)?.description || 'Mi Sucursal'}
                </span>
              </div>
            )}
          </div>

          {/* Colaborador */}
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
              Colaborador (Vendedor o Técnico)
            </label>
            <select
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              className="w-full glass-input px-3 py-1.5 text-xs text-foreground bg-transparent focus:outline-none"
            >
              <option value="ALL" className="bg-zinc-900 text-white">
                Todos los colaboradores
              </option>
              {employees.map((e) => (
                <option key={e.id} value={e.id} className="bg-zinc-900 text-white">
                  {e.full_name || e.email} ({e.sales_commission_pct ?? 0}% prod / {e.service_commission_pct ?? 0}% serv)
                </option>
              ))}
            </select>
          </div>

          {/* Rango de Fechas */}
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
              Fecha Inicio
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full glass-input px-3 py-1 text-xs text-foreground bg-transparent focus:outline-none"
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
              Fecha Fin
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full glass-input px-3 py-1 text-xs text-foreground bg-transparent focus:outline-none"
            />
          </div>
        </div>

        {/* Quick Date Presets */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground mr-1">Periodo rápido:</span>
            <button
              type="button"
              onClick={() => applyDatePreset('today')}
              className="px-2 py-0.5 rounded-lg text-[11px] glass hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={() => applyDatePreset('week')}
              className="px-2 py-0.5 rounded-lg text-[11px] glass hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Esta Semana
            </button>
            <button
              type="button"
              onClick={() => applyDatePreset('fortnight')}
              className="px-2 py-0.5 rounded-lg text-[11px] glass hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Esta Quincena
            </button>
            <button
              type="button"
              onClick={() => applyDatePreset('month')}
              className="px-2 py-0.5 rounded-lg text-[11px] glass hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Este Mes
            </button>
          </div>

          {/* Toggle View: Resumen por Colaborador vs Tickets */}
          <div className="flex items-center gap-1 bg-white/[0.04] p-1 rounded-xl border border-border/30">
            <button
              type="button"
              onClick={() => {
                setViewMode('summaries')
                setCurrentPage(1)
              }}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'summaries'
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Resumen por Colaborador ({summaries.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode('tickets')
                setCurrentPage(1)
              }}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'tickets'
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Detalle por Ticket ({orders.length})
            </button>
          </div>
        </div>
      </GlassCard>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Comisiones a Liquidar */}
        <GlassCard padding="md" variant="emerald" className="relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
              Total Comisiones a Liquidar
            </span>
            <DollarSign size={18} className="text-emerald-400" />
          </div>
          <p className="text-2xl font-bold font-mono text-foreground mt-2">
            {formatCurrency(metrics.totalCommissions)}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
            <Sparkles size={12} className="text-emerald-400" />
            <span>En {metrics.totalOrdersWithCommission} ventas con comisión asignada</span>
          </p>
        </GlassCard>

        {/* Ventas Productos (Sin IVA) */}
        <GlassCard padding="md" variant="indigo" className="relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-indigo-300 uppercase tracking-wider">
              Venta de Artículos (s/IVA)
            </span>
            <ShoppingBag size={18} className="text-indigo-400" />
          </div>
          <p className="text-2xl font-bold font-mono text-foreground mt-2">
            {formatCurrency(metrics.totalSalesWithoutTax)}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            Importe base comisionable para vendedores
          </p>
        </GlassCard>

        {/* Servicios Realizados (Sin IVA) */}
        <GlassCard padding="md" className="relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-purple-400 uppercase tracking-wider">
              Servicios / Taller (s/IVA)
            </span>
            <Wrench size={18} className="text-purple-400" />
          </div>
          <p className="text-2xl font-bold font-mono text-foreground mt-2">
            {formatCurrency(metrics.totalServicesWithoutTax)}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            Importe base comisionable para técnicos
          </p>
        </GlassCard>

        {/* Top Comisionista */}
        <GlassCard padding="md" variant="amber" className="relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
              Mayor Comisionista
            </span>
            <Trophy size={18} className="text-amber-400" />
          </div>
          <p className="text-lg font-bold text-foreground mt-2 truncate">
            {metrics.topEarner?.name || 'Sin registros'}
          </p>
          <p className="text-[11px] font-mono text-amber-300 font-bold mt-1">
            {metrics.topEarner ? formatCurrency(metrics.topEarner.amount) : '$0.00'}
          </p>
        </GlassCard>
      </div>

      {/* Table Section */}
      <GlassCard padding="none" className="overflow-hidden flex flex-col">
        {/* Table Search & Title Header */}
        <div className="p-3.5 border-b border-border/40 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-foreground">
              {viewMode === 'summaries'
                ? `Liquidación por Colaborador (${filteredSummaries.length})`
                : `Auditoría Detallada por Ticket (${filteredOrders.length})`}
            </span>
          </div>

          <div className="w-full sm:w-64">
            <GlassInput
              placeholder="Buscar colaborador o ticket..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              icon={<Search size={14} />}
              className="text-xs"
            />
          </div>
        </div>

        {/* VISTA 1: RESUMEN POR COLABORADOR */}
        {viewMode === 'summaries' ? (
          <div className="scrollable-table scroll-modern flex-1 min-h-[360px] sm:min-h-0">
            <table className="w-full min-w-[750px] sm:min-w-full text-left text-xs">
              <thead>
                <tr className="glass-table-header">
                  <TableColumnHeader
                    title="Colaborador"
                    sortKey="name"
                    currentSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <th className="px-4 py-3.5 text-xs font-semibold text-muted-foreground">Rol</th>
                  <TableColumnHeader
                    title="Venta Prod. (s/IVA)"
                    sortKey="products"
                    currentSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    align="right"
                  />
                  <TableColumnHeader
                    title="Com. Vendedor ($)"
                    sortKey="sales_commission"
                    currentSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    align="right"
                  />
                  <TableColumnHeader
                    title="Servicios (s/IVA)"
                    sortKey="services"
                    currentSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    align="right"
                  />
                  <TableColumnHeader
                    title="Com. Técnico ($)"
                    sortKey="service_commission"
                    currentSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    align="right"
                  />
                  <TableColumnHeader
                    title="TOTAL A LIQUIDAR"
                    sortKey="total_commission"
                    currentSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    align="right"
                  />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw size={18} className="animate-spin text-emerald-500" />
                        <span>Calculando comisiones...</span>
                      </div>
                    </td>
                  </tr>
                ) : paginatedSummaries.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                      <p className="text-sm font-medium">No hay comisiones en este rango de fechas</p>
                      <p className="text-xs text-muted-foreground/70 mt-1">
                        Ajusta las fechas o verifica que las ventas tengan vendedores/técnicos asignados.
                      </p>
                    </td>
                  </tr>
                ) : (
                  paginatedSummaries.map((s) => (
                    <tr key={s.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <UserAvatar src={s.avatar_url} name={s.full_name} size="sm" rounded="lg" />
                          <div>
                            <span className="font-semibold text-foreground block">
                              {s.full_name}
                            </span>
                            {s.email && (
                              <span className="text-[10px] text-muted-foreground font-mono">
                                {s.email}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/5 border border-border/40 text-muted-foreground">
                          {s.role}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                        <div>
                          <span>{formatCurrency(s.products_subtotal)}</span>
                          <span className="text-[10px] text-muted-foreground/60 block">
                            {s.sales_count} tickets
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-right font-mono font-bold text-emerald-400">
                        {formatCurrency(s.sales_commission_amount)}
                      </td>

                      <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                        <div>
                          <span>{formatCurrency(s.services_subtotal)}</span>
                          <span className="text-[10px] text-muted-foreground/60 block">
                            {s.services_count} servicios
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-right font-mono font-bold text-indigo-300">
                        {formatCurrency(s.service_commission_amount)}
                      </td>

                      <td className="px-4 py-3 text-right font-mono text-sm font-bold text-emerald-400 bg-emerald-500/[0.03]">
                        {formatCurrency(s.total_commission)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          /* VISTA 2: AUDITORÍA DETALLADA POR TICKET */
          <div className="scrollable-table scroll-modern flex-1 min-h-[360px] sm:min-h-0">
            <table className="w-full min-w-[850px] sm:min-w-full text-left text-xs">
              <thead>
                <tr className="glass-table-header">
                  <th className="px-4 py-3.5 text-xs font-semibold text-muted-foreground">No. Ticket</th>
                  <th className="px-4 py-3.5 text-xs font-semibold text-muted-foreground">Fecha y Hora</th>
                  <th className="px-4 py-3.5 text-xs font-semibold text-muted-foreground">Cliente</th>
                  <th className="px-4 py-3.5 text-xs font-semibold text-muted-foreground">Vendedor (Prod)</th>
                  <th className="px-4 py-3.5 text-xs font-semibold text-muted-foreground text-right">Com. Venta</th>
                  <th className="px-4 py-3.5 text-xs font-semibold text-muted-foreground">Técnico (Serv)</th>
                  <th className="px-4 py-3.5 text-xs font-semibold text-muted-foreground text-right">Com. Técnico</th>
                  <th className="px-4 py-3.5 text-xs font-semibold text-muted-foreground text-right">Total Comisiones</th>
                  <th className="px-4 py-3.5 text-xs font-semibold text-muted-foreground text-right">Total Ticket</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw size={18} className="animate-spin text-emerald-500" />
                        <span>Cargando tickets...</span>
                      </div>
                    </td>
                  </tr>
                ) : paginatedOrders.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                      <p className="text-sm font-medium">No se encontraron tickets en este periodo</p>
                    </td>
                  </tr>
                ) : (
                  paginatedOrders.map((o) => {
                    const clientName = o.client
                      ? `${o.client.first_name || ''} ${o.client.last_name || ''}`.trim()
                      : 'Público en General'
                    const sAmount = Number(o.seller_commission_amount || 0)
                    const tAmount = Number(o.technician_commission_amount || 0)
                    const totalTicketCommission = sAmount + tAmount

                    return (
                      <tr key={o.id_order} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-foreground">
                          #{o.order_number}
                        </td>

                        <td className="px-4 py-3 text-muted-foreground text-[11px]">
                          {formatDateTime(o.created_at)}
                        </td>

                        <td className="px-4 py-3 text-foreground font-medium truncate max-w-[150px]">
                          {clientName}
                        </td>

                        {/* Vendedor */}
                        <td className="px-4 py-3">
                          {o.seller ? (
                            <div>
                              <span className="font-semibold text-foreground block">
                                {o.seller.full_name || o.seller.email}
                              </span>
                              <span className="text-[10px] text-muted-foreground font-mono">
                                {o.seller_commission_pct || 0}% de {formatCurrency(Number(o.products_subtotal || 0))}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[11px] text-muted-foreground/50">—</span>
                          )}
                        </td>

                        <td className="px-4 py-3 text-right font-mono font-bold text-emerald-400">
                          {formatCurrency(sAmount)}
                        </td>

                        {/* Técnico */}
                        <td className="px-4 py-3">
                          {o.technician ? (
                            <div>
                              <span className="font-semibold text-indigo-300 block">
                                {o.technician.full_name || o.technician.email}
                              </span>
                              <span className="text-[10px] text-muted-foreground font-mono">
                                {o.technician_commission_pct || 0}% de {formatCurrency(Number(o.services_subtotal || 0))}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[11px] text-muted-foreground/50">—</span>
                          )}
                        </td>

                        <td className="px-4 py-3 text-right font-mono font-bold text-indigo-300">
                          {formatCurrency(tAmount)}
                        </td>

                        <td className="px-4 py-3 text-right font-mono font-bold text-emerald-400 bg-emerald-500/[0.03]">
                          {formatCurrency(totalTicketCommission)}
                        </td>

                        <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                          {formatCurrency(Number(o.total_amount || 0))}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={viewMode === 'summaries' ? filteredSummaries.length : filteredOrders.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </GlassCard>
    </div>
  )
}
