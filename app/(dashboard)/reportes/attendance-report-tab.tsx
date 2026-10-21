'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { GlassCard } from '@/components/glass-card'
import { GlassButton } from '@/components/glass-button'
import { GlassInput } from '@/components/glass-input'
import { StatusBadge } from '@/components/status-badge'
import {
  type Profile,
  type Store,
  type AttendanceDailySummary,
  type EmployeeAttendance,
} from '@/lib/types'
import {
  getAttendanceReportAction,
  getStoresForAttendanceAction,
  getStoreEmployeesAction,
} from './attendance-actions'
import { TableActionMenu, TableColumnHeader, TablePagination } from '@/components/tables'
import { formatDateTime, getInitials, getRoleLabel } from '@/lib/utils'
import { toast } from 'sonner'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import {
  Clock, Store as StoreIcon, Users, Calendar, Search, RefreshCw,
  FileText, FileSpreadsheet, AlertCircle, ArrowUpRight,
  Eye, CheckCircle2, ChevronRight, Filter, Sparkles
} from 'lucide-react'

interface AttendanceReportTabProps {
  currentProfile: Profile | null
  activeStoreId: string | null
}

export function AttendanceReportTab({
  currentProfile,
  activeStoreId,
}: AttendanceReportTabProps) {
  const isAdmin = currentProfile?.role === 'ADMIN'

  // Stores & Employees
  const [stores, setStores] = useState<Store[]>([])
  const [selectedStoreId, setSelectedStoreId] = useState<string>(() => {
    if (isAdmin) return activeStoreId || ''
    return currentProfile?.id_store || activeStoreId || ''
  })
  const [employees, setEmployees] = useState<Profile[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string>('ALL')

  // Date Range (default: current month from day 1 to today)
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0]
  })
  const [endDate, setEndDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0]
  })

  // Data & State
  const [loading, setLoading] = useState(false)
  const [dailySummaries, setDailySummaries] = useState<AttendanceDailySummary[]>([])
  const [rawRecords, setRawRecords] = useState<EmployeeAttendance[]>([])
  const [metrics, setMetrics] = useState({
    totalMinutes: 0,
    totalHoursFormatted: '0h',
    totalDaysWorked: 0,
    totalEmployees: 0,
    openShiftsCount: 0,
    averageHoursPerDayFormatted: '0h',
  })

  // Search & Sorting
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<string>('date')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  // Detail Modal for daily intervals
  const [selectedSummary, setSelectedSummary] = useState<AttendanceDailySummary | null>(null)

  // 1. Load Stores (for ADMIN selection)
  useEffect(() => {
    getStoresForAttendanceAction().then((storeList) => {
      setStores(storeList)
      if (isAdmin && !selectedStoreId && storeList.length > 0) {
        // If admin hasn't picked one, let active store or first store be selected
        if (activeStoreId) {
          setSelectedStoreId(activeStoreId)
        }
      }
    })
  }, [isAdmin, activeStoreId, selectedStoreId])

  // Sync if activeStoreId changes for non-admin
  useEffect(() => {
    if (!isAdmin) {
      setSelectedStoreId(currentProfile?.id_store || activeStoreId || '')
    }
  }, [isAdmin, currentProfile?.id_store, activeStoreId])

  // 2. Load Employees when selected store changes
  useEffect(() => {
    if (!selectedStoreId) {
      setEmployees([])
      return
    }
    getStoreEmployeesAction(selectedStoreId).then(setEmployees)
  }, [selectedStoreId])

  // 3. Fetch Attendance Report
  const fetchReport = useCallback(async () => {
    if (!selectedStoreId) return
    setLoading(true)
    try {
      const res = await getAttendanceReportAction({
        storeId: selectedStoreId,
        startDate,
        endDate,
        userId: selectedUserId,
      })

      if (res.success) {
        setDailySummaries(res.dailySummaries)
        setRawRecords(res.records)
        setMetrics(res.metrics)
      } else {
        toast.error(res.error || 'Error al obtener reporte de asistencia')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error inesperado'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [selectedStoreId, startDate, endDate, selectedUserId])

  useEffect(() => {
    if (selectedStoreId) {
      fetchReport()
    }
  }, [fetchReport, selectedStoreId])

  // Presets
  const setPreset = (preset: 'today' | 'week' | 'fortnight' | 'month') => {
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]
    setEndDate(todayStr)

    if (preset === 'today') {
      setStartDate(todayStr)
    } else if (preset === 'week') {
      const past = new Date()
      past.setDate(today.getDate() - 7)
      setStartDate(past.toISOString().split('T')[0])
    } else if (preset === 'fortnight') {
      const past = new Date()
      past.setDate(today.getDate() - 15)
      setStartDate(past.toISOString().split('T')[0])
    } else if (preset === 'month') {
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
      setStartDate(startOfMonth.toISOString().split('T')[0])
    }
  }

  // Filter & Search
  const filteredSummaries = useMemo(() => {
    if (!search.trim()) return dailySummaries
    const q = search.toLowerCase()
    return dailySummaries.filter((s) => {
      return (
        s.userName.toLowerCase().includes(q) ||
        (s.userEmail || '').toLowerCase().includes(q) ||
        s.date.includes(q)
      )
    })
  }, [dailySummaries, search])

  // Sorting
  const sortedSummaries = useMemo(() => {
    const list = [...filteredSummaries]
    if (!sortKey) return list

    return list.sort((a, b) => {
      let aVal: string | number = ''
      let bVal: string | number = ''

      switch (sortKey) {
        case 'date':
          aVal = a.date
          bVal = b.date
          break
        case 'userName':
          aVal = a.userName.toLowerCase()
          bVal = b.userName.toLowerCase()
          break
        case 'totalMinutes':
          aVal = a.totalMinutes
          bVal = b.totalMinutes
          break
        case 'firstCheckIn':
          aVal = a.firstCheckIn
          bVal = b.firstCheckIn
          break
        case 'lastCheckOut':
          aVal = a.lastCheckOut || ''
          bVal = b.lastCheckOut || ''
          break
        default:
          return 0
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
  }, [filteredSummaries, sortKey, sortDirection])

  // Pagination
  const totalPages = Math.ceil(sortedSummaries.length / pageSize) || 1
  const paginatedSummaries = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedSummaries.slice(start, start + pageSize)
  }, [sortedSummaries, currentPage, pageSize])

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDirection('asc')
    }
  }

  const selectedStore = stores.find((s) => s.id_store === selectedStoreId)

  // Export to PDF
  const handleExportPDF = () => {
    if (dailySummaries.length === 0) {
      toast.error('No hay datos de asistencia para exportar en este período.')
      return
    }

    const doc = new jsPDF()
    doc.setFontSize(18)
    doc.setTextColor(16, 185, 129)
    doc.text('CAMPIRAN — Control de Asistencia', 14, 20)

    doc.setFontSize(12)
    doc.setTextColor(30, 41, 59)
    doc.text(`Sucursal: ${selectedStore?.description || 'Sucursal Seleccionada'}`, 14, 28)

    doc.setFontSize(9)
    doc.setTextColor(100, 116, 139)
    doc.text(
      `Período: ${startDate} al ${endDate} · Generado el ${formatDateTime(new Date().toISOString())}`,
      14,
      35
    )
    doc.text(
      `Total Horas Laboradas: ${metrics.totalHoursFormatted} · Días Registrados: ${metrics.totalDaysWorked} · Empleados: ${metrics.totalEmployees}`,
      14,
      40
    )

    const tableRows = sortedSummaries.map((s, idx) => {
      const inTime = s.firstCheckIn
        ? new Date(s.firstCheckIn).toLocaleTimeString('es-MX', {
            hour: '2-digit',
            minute: '2-digit',
          })
        : '--'
      const outTime = s.lastCheckOut
        ? new Date(s.lastCheckOut).toLocaleTimeString('es-MX', {
            hour: '2-digit',
            minute: '2-digit',
          })
        : s.hasOpenShift
        ? 'En curso'
        : '--'

      return [
        idx + 1,
        s.date,
        s.userName,
        getRoleLabel(s.userRole),
        inTime,
        outTime,
        `${s.records.length} marca(s)`,
        s.totalHoursFormatted,
        s.hasOpenShift ? 'Abierto' : 'Completado',
      ]
    })

    autoTable(doc, {
      startY: 46,
      head: [
        ['#', 'Fecha', 'Empleado', 'Puesto', 'Entrada', 'Salida', 'Marcas', 'Total Horas', 'Estado'],
      ],
      body: tableRows,
      theme: 'grid',
      headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255] },
      styles: { fontSize: 8 },
    })

    doc.save(`Asistencia_${selectedStore?.description || 'Campiran'}_${startDate}_${endDate}.pdf`)
    toast.success('Reporte de asistencia en PDF descargado')
  }

  // Export to Excel
  const handleExportExcel = () => {
    if (dailySummaries.length === 0) {
      toast.error('No hay datos de asistencia para exportar en este período.')
      return
    }

    const dataRows = sortedSummaries.map((s) => ({
      Fecha: s.date,
      Empleado: s.userName,
      Correo: s.userEmail || '',
      Puesto: getRoleLabel(s.userRole),
      'Primera Entrada': s.firstCheckIn
        ? new Date(s.firstCheckIn).toLocaleTimeString('es-MX', {
            hour: '2-digit',
            minute: '2-digit',
          })
        : '',
      'Última Salida': s.lastCheckOut
        ? new Date(s.lastCheckOut).toLocaleTimeString('es-MX', {
            hour: '2-digit',
            minute: '2-digit',
          })
        : s.hasOpenShift
        ? 'En curso'
        : '',
      'Total Horas Formato': s.totalHoursFormatted,
      'Total Minutos': s.totalMinutes,
      'Horas Decimales': (s.totalMinutes / 60).toFixed(2),
      'Marcajes del Día': s.records.length,
      Estado: s.hasOpenShift ? 'En turno abierto' : 'Completado',
    }))

    const worksheet = XLSX.utils.json_to_sheet(dataRows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Asistencia')

    XLSX.writeFile(
      workbook,
      `Asistencia_${selectedStore?.description || 'Campiran'}_${startDate}_${endDate}.xlsx`
    )
    toast.success('Reporte de asistencia en Excel descargado')
  }

  return (
    <div className="space-y-6">
      {/* Filters and Controls Card */}
      <GlassCard variant="default" padding="md">
        <div className="space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Store & Employee Selector */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Store Selector (Mandatory for ADMIN) */}
              <div className="flex flex-col gap-1 min-w-[200px]">
                <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <StoreIcon size={13} className="text-emerald-500" />
                  Sucursal {isAdmin && <span className="text-rose-500">*</span>}
                </label>

                {isAdmin ? (
                  <select
                    value={selectedStoreId}
                    onChange={(e) => {
                      setSelectedStoreId(e.target.value)
                      setSelectedUserId('ALL')
                    }}
                    className="h-10 px-3 rounded-xl glass border border-[var(--border)] text-sm font-medium focus:outline-none focus:border-emerald-500/60 bg-[var(--card)] text-foreground"
                  >
                    <option value="" disabled>
                      -- Selecciona una Sucursal --
                    </option>
                    {stores.map((s) => (
                      <option key={s.id_store} value={s.id_store}>
                        {s.description}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="h-10 px-3.5 rounded-xl glass flex items-center gap-2 text-sm font-medium text-foreground">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>{selectedStore?.description || 'Tu Sucursal Asignada'}</span>
                  </div>
                )}
              </div>

              {/* Employee Selector */}
              <div className="flex flex-col gap-1 min-w-[200px]">
                <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <Users size={13} className="text-emerald-500" />
                  Empleado
                </label>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  disabled={!selectedStoreId}
                  className="h-10 px-3 rounded-xl glass border border-[var(--border)] text-sm font-medium focus:outline-none focus:border-emerald-500/60 bg-[var(--card)] text-foreground disabled:opacity-50"
                >
                  <option value="ALL">Todos los Empleados</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.full_name || emp.email} ({getRoleLabel(emp.role)})
                    </option>
                  ))}
                </select>
              </div>

              {/* Date Presets */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                  <Calendar size={13} className="text-emerald-500" />
                  Rango Rápido
                </label>
                <div className="flex items-center gap-1 p-1 rounded-xl glass h-10">
                  <button
                    type="button"
                    onClick={() => setPreset('today')}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-emerald-500/10 transition-all"
                  >
                    Hoy
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreset('week')}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-emerald-500/10 transition-all"
                  >
                    Semana
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreset('fortnight')}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-emerald-500/10 transition-all"
                  >
                    Quincena
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreset('month')}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-emerald-500/10 transition-all"
                  >
                    Mes
                  </button>
                </div>
              </div>
            </div>

            {/* Date Pickers & Actions */}
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-muted-foreground">Desde</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-10 px-3 rounded-xl glass border border-[var(--border)] text-xs font-medium focus:outline-none focus:border-emerald-500/60 bg-[var(--card)] text-foreground"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-muted-foreground">Hasta</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-10 px-3 rounded-xl glass border border-[var(--border)] text-xs font-medium focus:outline-none focus:border-emerald-500/60 bg-[var(--card)] text-foreground"
                />
              </div>

              <div className="flex items-center gap-1.5">
                <GlassButton
                  variant="ghost"
                  size="sm"
                  onClick={handleExportPDF}
                  title="Exportar a PDF"
                  disabled={dailySummaries.length === 0}
                >
                  <FileText size={15} className="mr-1 text-rose-500" />
                  PDF
                </GlassButton>
                <GlassButton
                  variant="ghost"
                  size="sm"
                  onClick={handleExportExcel}
                  title="Exportar a Excel"
                  disabled={dailySummaries.length === 0}
                >
                  <FileSpreadsheet size={15} className="mr-1 text-emerald-500" />
                  Excel
                </GlassButton>
                <GlassButton
                  variant="ghost"
                  size="sm"
                  onClick={fetchReport}
                  title="Actualizar datos"
                  disabled={loading || !selectedStoreId}
                >
                  <RefreshCw size={14} className={loading ? 'animate-spin text-emerald-500' : ''} />
                </GlassButton>
              </div>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* If Admin hasn't selected a store yet */}
      {isAdmin && !selectedStoreId ? (
        <GlassCard variant="indigo" padding="lg" className="text-center py-12">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-500 mb-3">
            <StoreIcon size={28} />
          </div>
          <h3 className="text-lg font-bold text-foreground">Selecciona una Sucursal</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mt-1">
            Como Administrador General, debes elegir la sucursal que deseas consultar para ver las
            horas trabajadas por empleado.
          </p>
        </GlassCard>
      ) : (
        <>
          {/* KPI Metrics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <GlassCard variant="emerald" padding="sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Total Horas Laboradas
                  </p>
                  <p className="text-2xl font-bold text-foreground mt-1">
                    {metrics.totalHoursFormatted}
                  </p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">
                    {metrics.totalMinutes} minutos acumulados
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-500">
                  <Clock size={20} />
                </div>
              </div>
            </GlassCard>

            <GlassCard variant="indigo" padding="sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Días Registrados
                  </p>
                  <p className="text-2xl font-bold text-foreground mt-1">{metrics.totalDaysWorked}</p>
                  <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium mt-0.5">
                    Jornadas en el período
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center text-indigo-500">
                  <Calendar size={20} />
                </div>
              </div>
            </GlassCard>

            <GlassCard variant="amber" padding="sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Promedio Diario
                  </p>
                  <p className="text-2xl font-bold text-foreground mt-1">
                    {metrics.averageHoursPerDayFormatted}
                  </p>
                  <p className="text-xs text-amber-600 dark:text-amber-400 font-medium mt-0.5">
                    Por jornada registrada
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center text-amber-500">
                  <ArrowUpRight size={20} />
                </div>
              </div>
            </GlassCard>

            <GlassCard variant="default" padding="sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    En Turno Activo
                  </p>
                  <p className="text-2xl font-bold text-foreground mt-1">
                    {metrics.openShiftsCount}
                  </p>
                  <p className="text-xs text-muted-foreground font-medium mt-0.5">
                    Sin salida registrada hoy
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-teal-500/15 flex items-center justify-center text-teal-500">
                  <Users size={20} />
                </div>
              </div>
            </GlassCard>
          </div>

          {/* Search bar & Table Card */}
          <GlassCard variant="default" padding="md" className="space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative w-full sm:w-72">
                <Search
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <GlassInput
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setCurrentPage(1)
                  }}
                  placeholder="Buscar por empleado o fecha..."
                  className="pl-9 h-9 text-xs"
                />
              </div>

              <div className="text-xs text-muted-foreground self-end sm:self-center">
                Mostrando{' '}
                <span className="font-semibold text-foreground">{sortedSummaries.length}</span>{' '}
                jornada(s)
              </div>
            </div>

            {/* Daily Summaries Table with Sticky Header */}
            <div className="scrollable-table scroll-modern border border-[var(--border)] rounded-2xl overflow-hidden max-h-[500px]">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="glass-table-header sticky top-0 z-10 border-b border-[var(--border)] text-xs text-muted-foreground uppercase tracking-wider">
                    <TableColumnHeader
                      title="Fecha"
                      sortKey="date"
                      currentSortKey={sortKey}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                      className="py-3 px-4"
                    />
                    <TableColumnHeader
                      title="Empleado"
                      sortKey="userName"
                      currentSortKey={sortKey}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                      className="py-3 px-4"
                    />
                    <TableColumnHeader
                      title="Primera Entrada"
                      sortKey="firstCheckIn"
                      currentSortKey={sortKey}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                      className="py-3 px-4"
                    />
                    <TableColumnHeader
                      title="Última Salida"
                      sortKey="lastCheckOut"
                      currentSortKey={sortKey}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                      className="py-3 px-4"
                    />
                    <th className="py-3 px-4 font-semibold">Marcas del Día</th>
                    <TableColumnHeader
                      title="Horas Trabajadas"
                      sortKey="totalMinutes"
                      currentSortKey={sortKey}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                      className="py-3 px-4"
                    />
                    <th className="py-3 px-4 font-semibold">Estado</th>
                    <th className="py-3 px-4 font-semibold text-right">Acciones</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-[var(--border)]">
                  {paginatedSummaries.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-muted-foreground text-sm">
                        {loading
                          ? 'Cargando registros de asistencia...'
                          : 'No se encontraron horas registradas en este período para la sucursal seleccionada.'}
                      </td>
                    </tr>
                  ) : (
                    paginatedSummaries.map((summary) => {
                      const inFormatted = summary.firstCheckIn
                        ? new Date(summary.firstCheckIn).toLocaleTimeString('es-MX', {
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true,
                          })
                        : '--'

                      const outFormatted = summary.lastCheckOut
                        ? new Date(summary.lastCheckOut).toLocaleTimeString('es-MX', {
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true,
                          })
                        : summary.hasOpenShift
                        ? 'En curso'
                        : '--'

                      return (
                        <tr
                          key={`${summary.date}_${summary.userId}`}
                          className="hover:bg-emerald-500/5 transition-colors"
                        >
                          {/* Fecha */}
                          <td className="py-3 px-4 font-mono font-medium text-xs text-foreground whitespace-nowrap">
                            {summary.date}
                          </td>

                          {/* Empleado */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500/30 to-teal-600/30 border border-emerald-500/40 flex items-center justify-center text-xs font-bold text-emerald-600 dark:text-emerald-400 flex-shrink-0">
                                {getInitials(summary.userName)}
                              </div>
                              <div className="truncate max-w-[200px]">
                                <div className="font-semibold text-foreground text-xs">
                                  {summary.userName}
                                </div>
                                <div className="text-[11px] text-muted-foreground">
                                  {getRoleLabel(summary.userRole)}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Entrada */}
                          <td className="py-3 px-4 text-xs font-mono text-muted-foreground whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold border border-emerald-500/20">
                              {inFormatted}
                            </span>
                          </td>

                          {/* Salida */}
                          <td className="py-3 px-4 text-xs font-mono text-muted-foreground whitespace-nowrap">
                            {summary.hasOpenShift && !summary.lastCheckOut ? (
                              <span className="px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold border border-amber-500/20">
                                En turno
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 font-semibold border border-rose-500/20">
                                {outFormatted}
                              </span>
                            )}
                          </td>

                          {/* Marcas / Intervalos */}
                          <td className="py-3 px-4 text-xs">
                            <span className="font-medium text-foreground">
                              {summary.records.length} marca(s)
                            </span>
                          </td>

                          {/* Horas Trabajadas */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-foreground">
                                {summary.totalHoursFormatted}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                ({(summary.totalMinutes / 60).toFixed(1)} hrs)
                              </span>
                            </div>
                          </td>

                          {/* Estado */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            {summary.hasOpenShift ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                En Curso
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                <CheckCircle2 size={12} />
                                Completada
                              </span>
                            )}
                          </td>

                          {/* Acciones */}
                          <td className="py-3 px-4 text-right">
                            <TableActionMenu
                              items={[
                                {
                                  label: 'Ver Desglose de Intervalos',
                                  icon: <Eye size={14} />,
                                  onClick: () => setSelectedSummary(summary),
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

            {/* Pagination Controls */}
            {sortedSummaries.length > 0 && (
              <TablePagination
                currentPage={currentPage}
                totalPages={totalPages}
                pageSize={pageSize}
                totalItems={sortedSummaries.length}
                onPageChange={setCurrentPage}
                onPageSizeChange={(size) => {
                  setPageSize(size)
                  setCurrentPage(1)
                }}
              />
            )}
          </GlassCard>
        </>
      )}

      {/* Modal de Desglose de Turnos del Día */}
      <AnimatePresence>
        {selectedSummary && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="w-full max-w-lg"
            >
              <GlassCard variant="default" padding="lg" className="border-emerald-500/30 shadow-2xl max-h-[90vh] overflow-y-auto scroll-modern">
                <div className="flex items-center justify-between pb-3 border-b border-[var(--border)] shrink-0 sticky -top-6 -mx-6 px-6 pt-2 bg-card/95 dark:bg-card/90 backdrop-blur-xl z-20">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-500">
                      <Clock size={20} />
                    </div>
                    <div>
                      <h3 className="font-bold text-base text-foreground">
                        Desglose de Jornada — {selectedSummary.date}
                      </h3>
                      <p className="text-xs text-muted-foreground">{selectedSummary.userName}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => setSelectedSummary(null)}
                    className="p-1.5 rounded-lg btn-ghost text-muted-foreground hover:text-foreground"
                  >
                    ✕
                  </button>
                </div>

                <div className="py-4 space-y-3">
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">
                      Total Acumulado del Día:
                    </span>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-base">
                      {selectedSummary.totalHoursFormatted} ({selectedSummary.totalMinutes} min)
                    </span>
                  </div>

                  <div className="space-y-2 max-h-64 overflow-y-auto scroll-modern pr-1">
                    {selectedSummary.records.map((rec, i) => {
                      const inTime = new Date(rec.check_in).toLocaleTimeString('es-MX', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true,
                      })
                      const outTime = rec.check_out
                        ? new Date(rec.check_out).toLocaleTimeString('es-MX', {
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true,
                          })
                        : 'En curso'

                      const minutes =
                        rec.status === 'open'
                          ? Math.round(
                              (new Date().getTime() - new Date(rec.check_in).getTime()) / 60000
                            )
                          : Number(rec.total_minutes || 0)

                      return (
                        <div
                          key={rec.id_attendance || i}
                          className="p-3 rounded-xl glass border border-[var(--border)] flex items-center justify-between text-xs"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 font-mono font-semibold text-foreground">
                              <span className="text-emerald-500">Entrada: {inTime}</span>
                              <span>→</span>
                              <span className={rec.status === 'open' ? 'text-amber-500' : 'text-rose-500'}>
                                Salida: {outTime}
                              </span>
                            </div>
                            <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                              <span>
                                Método:{' '}
                                {rec.auth_method === 'webauthn'
                                  ? 'Touch ID / Sensor Biométrico'
                                  : rec.auth_method === 'face'
                                  ? 'Face ID / Facial'
                                  : rec.auth_method === 'pin'
                                  ? 'PIN Quiosco'
                                  : 'Sesión Web'}
                              </span>
                              {rec.notes && <span>· Nota: {rec.notes}</span>}
                            </div>
                          </div>

                          <div className="text-right">
                            <span className="font-bold text-foreground">
                              {Math.floor(minutes / 60)}h {minutes % 60}m
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="flex justify-end pt-2 border-t border-[var(--border)]">
                  <GlassButton variant="ghost" size="sm" onClick={() => setSelectedSummary(null)}>
                    Cerrar
                  </GlassButton>
                </div>
              </GlassCard>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
