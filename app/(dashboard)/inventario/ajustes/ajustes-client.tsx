'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/utils/supabase/client'
import { useStore } from '@/components/providers/store-provider'
import { GlassCard } from '@/components/glass-card'
import { GlassButton } from '@/components/glass-button'
import { GlassInput } from '@/components/glass-input'
import { InventarioTabs } from '@/components/inventario/inventario-tabs'
import {
  AjusteInventarioModal,
  ADJUSTMENT_REASONS,
} from '@/components/inventario/ajuste-modal'
import { KardexView, KardexModal } from '@/components/inventario/kardex-view'
import { TableActionMenu, TableColumnHeader, TablePagination } from '@/components/tables'
import { type Transaction, type Item, type Location, type Stock } from '@/lib/types'
import { formatDateTime, formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import {
  Wrench, BookOpen, Plus, Search, RefreshCw, MapPin,
  TrendingUp, TrendingDown, DollarSign, FileText, FileSpreadsheet,
  Eye, ArrowRight, X, Printer, Filter
} from 'lucide-react'

const SALDO_REGEX = /\[Saldo:\s*(-?\d+)\s*→\s*(-?\d+)\]/

function parseEmbeddedSaldo(comments: string | null | undefined): {
  before?: number
  after?: number
  clean: string
} {
  if (!comments) return { clean: '' }
  const match = comments.match(SALDO_REGEX)
  if (!match) return { clean: comments }
  return {
    before: Number(match[1]),
    after: Number(match[2]),
    clean: comments.replace(SALDO_REGEX, '').trim(),
  }
}

interface EnrichedAdjustmentRow extends Transaction {
  computedStockBefore: number
  computedStockAfter: number
  cleanComments: string
  netDiff: number
  financialImpact: number
}

export function AjustesClient() {
  const supabase = createClient()
  const { currentStore, storeId } = useStore()

  // Active sub-view: 'ajustes' or 'kardex'
  const [activeSubView, setActiveSubView] = useState<'ajustes' | 'kardex'>('ajustes')
  const [kardexSelectedItemId, setKardexSelectedItemId] = useState<string | null>(null)

  // Modal states
  const [ajusteModalOpen, setAjusteModalOpen] = useState(false)
  const [preselectedItem, setPreselectedItem] = useState<Item | null>(null)
  const [preselectedLocationId, setPreselectedLocationId] = useState<string | null>(null)

  const [kardexModalItemId, setKardexModalItemId] = useState<string | null>(null)
  const [kardexModalOpen, setKardexModalOpen] = useState(false)

  const [detailAdjustment, setDetailAdjustment] = useState<EnrichedAdjustmentRow | null>(null)

  // Data
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [stocks, setStocks] = useState<Stock[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [search, setSearch] = useState('')
  const [directionFilter, setDirectionFilter] = useState<'ALL' | 'POSITIVE' | 'NEGATIVE'>('ALL')
  const [reasonFilter, setReasonFilter] = useState<string>('ALL')
  const [locationFilter, setLocationFilter] = useState<string>('all')

  const fetchAdjustmentsData = useCallback(async () => {
    if (!storeId) {
      setTransactions([])
      setStocks([])
      setLoading(false)
      return
    }

    setLoading(true)

    const [txRes, stocksRes, locsRes] = await Promise.all([
      supabase
        .from('transactions')
        .select('*')
        .eq('id_store', storeId)
        .order('date_transaction', { ascending: false })
        .limit(350),
      supabase.from('stocks').select('*').eq('id_store', storeId),
      supabase
        .from('locations')
        .select('*')
        .eq('id_store', storeId)
        .eq('status', 'A')
        .order('description'),
    ])

    if (locsRes.data) setLocations(locsRes.data as Location[])
    if (stocksRes.data) setStocks(stocksRes.data as Stock[])

    if (txRes.error) {
      toast.error('Error al cargar ajustes: ' + txRes.error.message)
      setTransactions([])
      setLoading(false)
      return
    }

    const txList = (txRes.data ?? []) as Transaction[]
    const itemIds = Array.from(
      new Set(txList.map((t) => t.id_item).filter((id): id is string => Boolean(id)))
    )

    const itemsRes =
      itemIds.length > 0
        ? await supabase
            .from('items')
            .select('id_item, code, barcode, description, description_short, unit, cost, price, price1, status')
            .in('id_item', itemIds)
        : { data: [] }

    const itemsMap = new Map((itemsRes.data ?? []).map((it) => [it.id_item, it as Item]))
    const locsMap = new Map(
      ((locsRes.data ?? []) as Location[]).map((l) => [l.id_location, l])
    )

    const hydrated: Transaction[] = txList.map((t) => ({
      ...t,
      item: t.id_item ? itemsMap.get(t.id_item) : undefined,
      location: t.id_location ? locsMap.get(t.id_location) : undefined,
    }))

    setTransactions(hydrated)
    setLoading(false)
  }, [storeId, supabase])

  useEffect(() => {
    fetchAdjustmentsData()
  }, [fetchAdjustmentsData])

  // Realtime subscription
  useEffect(() => {
    if (!storeId) return

    const channel = supabase
      .channel(`ajustes-live-${storeId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions', filter: `id_store=eq.${storeId}` },
        () => fetchAdjustmentsData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stocks', filter: `id_store=eq.${storeId}` },
        () => fetchAdjustmentsData()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [storeId, supabase, fetchAdjustmentsData])

  // Compute stockBefore and stockAfter across all transactions, then filter to adjustments ('A', 'E', 'S' from Ajustes)
  const adjustmentRows = useMemo<EnrichedAdjustmentRow[]>(() => {
    const currentStockMap = new Map<string, number>()
    stocks.forEach((s) => {
      if (!s.id_item) return
      const key = `${s.id_item}_${s.id_location || 'null'}`
      currentStockMap.set(key, (currentStockMap.get(key) ?? 0) + (s.current ?? 0))
      const anyKey = `${s.id_item}_any`
      currentStockMap.set(anyKey, (currentStockMap.get(anyKey) ?? 0) + (s.current ?? 0))
    })

    const sortedNewestFirst = [...transactions].sort((a, b) => {
      const da = new Date(a.date_transaction || a.created_at).getTime()
      const db = new Date(b.date_transaction || b.created_at).getTime()
      return db - da
    })

    const runningMap = new Map<string, number>()

    const allEnriched: EnrichedAdjustmentRow[] = sortedNewestFirst.map((t) => {
      const itemKey = t.id_item || 'unknown'
      const locKey = `${itemKey}_${t.id_location || 'null'}`
      if (!runningMap.has(locKey)) {
        const init = currentStockMap.get(locKey) ?? currentStockMap.get(`${itemKey}_any`) ?? 0
        runningMap.set(locKey, init)
      }

      const currentRunning = runningMap.get(locKey) ?? 0
      const entryQty = Number(t.amount_enrty || 0)
      const exitQty = Number(t.amount_exit || 0)
      const parsed = parseEmbeddedSaldo(t.comments)

      let stockBefore: number
      let stockAfter: number

      if (t.stock_before != null && t.stock_after != null) {
        stockBefore = Number(t.stock_before)
        stockAfter = Number(t.stock_after)
      } else if (parsed.before !== undefined && parsed.after !== undefined) {
        stockBefore = parsed.before
        stockAfter = parsed.after
      } else {
        stockAfter = currentRunning
        stockBefore = Math.max(0, stockAfter - entryQty + exitQty)
      }

      runningMap.set(locKey, stockBefore)

      const netDiff = entryQty - exitQty
      const unitCost = Number(t.cost || t.item?.cost || 0)
      const financialImpact = netDiff * unitCost

      return {
        ...t,
        computedStockBefore: stockBefore,
        computedStockAfter: stockAfter,
        cleanComments: parsed.clean,
        netDiff,
        financialImpact,
      }
    })

    // Keep adjustments ('A') or manual entries/exits originating from adjustments
    return allEnriched.filter(
      (r) =>
        r.movim_type === 'A' ||
        r.origin === 'Ajustes de Inventario' ||
        (r.reference && r.reference.startsWith('AJU-'))
    )
  }, [transactions, stocks])

  // Filtered adjustment rows
  const filteredAdjustments = useMemo(() => {
    return adjustmentRows.filter((row) => {
      if (directionFilter === 'POSITIVE' && row.netDiff <= 0) return false
      if (directionFilter === 'NEGATIVE' && row.netDiff >= 0) return false
      if (locationFilter !== 'all' && row.id_location !== locationFilter) return false
      if (reasonFilter !== 'ALL' && row.concept !== reasonFilter) return false

      if (search.trim()) {
        const q = search.toLowerCase()
        const desc = row.item?.description?.toLowerCase() ?? ''
        const code = row.item?.code?.toLowerCase() ?? ''
        const barcode = row.item?.barcode?.toLowerCase() ?? ''
        const ref = row.reference?.toLowerCase() ?? ''
        const concept = row.concept?.toLowerCase() ?? ''
        const comm = row.cleanComments?.toLowerCase() ?? ''
        if (
          !desc.includes(q) &&
          !code.includes(q) &&
          !barcode.includes(q) &&
          !ref.includes(q) &&
          !concept.includes(q) &&
          !comm.includes(q)
        ) {
          return false
        }
      }

      return true
    })
  }, [adjustmentRows, directionFilter, locationFilter, reasonFilter, search])

  // KPIs
  const stats = useMemo(() => {
    let totalCount = adjustmentRows.length
    let positiveUnits = 0
    let negativeUnits = 0
    let positiveValue = 0
    let negativeValue = 0
    let netFinancial = 0

    adjustmentRows.forEach((r) => {
      if (r.netDiff > 0) {
        positiveUnits += r.netDiff
        positiveValue += r.financialImpact
      } else if (r.netDiff < 0) {
        negativeUnits += Math.abs(r.netDiff)
        negativeValue += Math.abs(r.financialImpact)
      }
      netFinancial += r.financialImpact
    })

    return {
      totalCount,
      positiveUnits,
      negativeUnits,
      positiveValue,
      negativeValue,
      netFinancial,
    }
  }, [adjustmentRows])

  // Sorting
  const [sortKey, setSortKey] = useState<string>('date_transaction')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDirection('asc')
    }
  }

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  useEffect(() => {
    setCurrentPage(1)
  }, [search, directionFilter, reasonFilter, locationFilter])

  const sortedAdjustments = useMemo(() => {
    const list = [...filteredAdjustments]
    return list.sort((a, b) => {
      let aVal: string | number = ''
      let bVal: string | number = ''

      switch (sortKey) {
        case 'date_transaction':
          aVal = new Date(a.date_transaction).getTime()
          bVal = new Date(b.date_transaction).getTime()
          break
        case 'reference':
          aVal = (a.reference || '').toLowerCase()
          bVal = (b.reference || '').toLowerCase()
          break
        case 'description':
          aVal = (a.item?.description || '').toLowerCase()
          bVal = (b.item?.description || '').toLowerCase()
          break
        case 'location':
          aVal = (a.location?.description || '').toLowerCase()
          bVal = (b.location?.description || '').toLowerCase()
          break
        case 'concept':
          aVal = (a.concept || '').toLowerCase()
          bVal = (b.concept || '').toLowerCase()
          break
        case 'stock_before':
          aVal = a.computedStockBefore
          bVal = b.computedStockBefore
          break
        case 'netDiff':
          aVal = a.netDiff
          bVal = b.netDiff
          break
        case 'stock_after':
          aVal = a.computedStockAfter
          bVal = b.computedStockAfter
          break
        case 'financialImpact':
          aVal = a.financialImpact
          bVal = b.financialImpact
          break
        default:
          return 0
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
  }, [filteredAdjustments, sortKey, sortDirection])

  const totalPages = Math.ceil(sortedAdjustments.length / pageSize) || 1
  const paginatedAdjustments = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedAdjustments.slice(start, start + pageSize)
  }, [sortedAdjustments, currentPage, pageSize])

  const handleOpenNewAdjustment = (item?: Item | null, locId?: string | null) => {
    setPreselectedItem(item ?? null)
    setPreselectedLocationId(locId ?? null)
    setAjusteModalOpen(true)
  }

  const handleOpenItemKardex = (itemId: string | null) => {
    setKardexModalItemId(itemId)
    setKardexModalOpen(true)
  }

  const handleSwitchToIntegratedKardex = (itemId?: string | null) => {
    if (itemId !== undefined) setKardexSelectedItemId(itemId)
    setActiveSubView('kardex')
  }

  // Export single adjustment voucher PDF
  const handlePrintVoucherPDF = (row: EnrichedAdjustmentRow) => {
    const doc = new jsPDF()

    doc.setFontSize(18)
    doc.setTextColor(16, 185, 129)
    doc.text('CAMPIRAN POS', 14, 20)

    doc.setFontSize(13)
    doc.setTextColor(30, 41, 59)
    doc.text('Póliza / Comprobante de Ajuste de Inventario', 14, 28)

    doc.setFontSize(10)
    doc.setTextColor(100, 116, 139)
    doc.text(`Sucursal: ${currentStore?.description ?? 'General'}`, 14, 36)
    doc.text(`Folio de Referencia: ${row.reference || 'S/R'}`, 14, 42)
    doc.text(`Fecha y Hora: ${formatDateTime(row.date_transaction)}`, 14, 48)
    doc.text(`Motivo del Ajuste: ${row.concept || 'Ajuste Manual'}`, 14, 54)
    if (row.cleanComments) {
      doc.text(`Observaciones: ${row.cleanComments}`, 14, 60)
    }

    autoTable(doc, {
      startY: row.cleanComments ? 66 : 60,
      head: [
        [
          'Código',
          'Artículo',
          'Ubicación',
          'Stock Ant.',
          'Ajuste',
          'Stock Final',
          'Costo Unit.',
          'Impacto ($)',
        ],
      ],
      body: [
        [
          row.item?.code || row.item?.barcode || '—',
          row.item?.description ?? 'Artículo',
          row.location?.description ?? 'General',
          row.computedStockBefore,
          row.netDiff > 0 ? `+${row.netDiff}` : `${row.netDiff}`,
          row.computedStockAfter,
          formatCurrency(row.cost),
          `${row.financialImpact > 0 ? '+' : ''}${formatCurrency(row.financialImpact)}`,
        ],
      ],
      theme: 'grid',
      headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 9, cellPadding: 3 },
    })

    const finalY =
      (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY || 110

    doc.setFontSize(9)
    doc.setTextColor(71, 85, 105)
    doc.text('______________________________________', 14, finalY + 28)
    doc.text('Elaboró / Almacén', 14, finalY + 34)

    doc.text('______________________________________', 115, finalY + 28)
    doc.text('Autorizó / Gerencia', 115, finalY + 34)

    doc.save(`Poliza_Ajuste_${row.reference || row.id_transaction.slice(0, 8)}.pdf`)
    toast.success('Comprobante de ajuste generado en PDF')
  }

  // Export full adjustments report PDF
  const handleExportListPDF = () => {
    if (sortedAdjustments.length === 0) {
      toast.error('No hay ajustes para exportar')
      return
    }

    const doc = new jsPDF({ orientation: 'landscape' })
    doc.setFontSize(16)
    doc.setTextColor(16, 185, 129)
    doc.text('CAMPIRAN POS — REPORTE DE AJUSTES DE INVENTARIO', 14, 16)

    doc.setFontSize(10)
    doc.setTextColor(60, 72, 88)
    doc.text(`Sucursal: ${currentStore?.description ?? 'General'}`, 14, 23)
    doc.text(`Total Registros: ${sortedAdjustments.length}`, 14, 29)

    autoTable(doc, {
      startY: 35,
      head: [
        [
          'Fecha',
          'Folio',
          'Artículo',
          'Ubicación',
          'Motivo / Concepto',
          'Stock Ant.',
          'Diferencia',
          'Stock Final',
          'Costo Unit.',
          'Impacto ($)',
        ],
      ],
      body: sortedAdjustments.map((r) => [
        formatDateTime(r.date_transaction),
        r.reference || '—',
        r.item?.description ?? '—',
        r.location?.description ?? 'General',
        r.concept || 'Ajuste',
        r.computedStockBefore,
        r.netDiff > 0 ? `+${r.netDiff}` : `${r.netDiff}`,
        r.computedStockAfter,
        formatCurrency(r.cost),
        `${r.financialImpact > 0 ? '+' : ''}${formatCurrency(r.financialImpact)}`,
      ]),
      theme: 'grid',
      headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 2 },
    })

    doc.save(`Ajustes_Inventario_${new Date().toISOString().slice(0, 10)}.pdf`)
    toast.success('Reporte de ajustes exportado a PDF')
  }

  // Export full adjustments report Excel
  const handleExportListExcel = () => {
    if (sortedAdjustments.length === 0) {
      toast.error('No hay ajustes para exportar')
      return
    }

    const data = sortedAdjustments.map((r) => ({
      'Fecha y Hora': formatDateTime(r.date_transaction),
      Folio: r.reference ?? '',
      Código: r.item?.code || r.item?.barcode || '',
      Artículo: r.item?.description ?? '',
      Ubicación: r.location?.description ?? 'General',
      Motivo: r.concept ?? 'Ajuste',
      Observaciones: r.cleanComments ?? '',
      'Existencia Anterior': r.computedStockBefore,
      'Ajuste Aplicado': r.netDiff,
      'Existencia Resultante': r.computedStockAfter,
      'Costo Unitario': r.cost,
      'Impacto Financiero': r.financialImpact,
    }))

    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Ajustes_Inventario')
    XLSX.writeFile(wb, `Ajustes_Inventario_${new Date().toISOString().slice(0, 10)}.xlsx`)
    toast.success('Reporte de ajustes exportado a Excel')
  }

  return (
    <div className="h-full flex-1 flex flex-col min-h-0 gap-2.5 sm:gap-3">
      <div className="dashboard-bg" />

      {/* Header & Main Module Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shrink-0">
        <div>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-foreground flex items-center gap-2 leading-tight">
            <Wrench className="text-emerald-500" size={20} />
            Ajustes de Inventario & Kardex
          </h1>
          <p className="text-xs text-muted-foreground line-clamp-1">
            Control de ajustes de existencias, mermas, sobrantes y Kardex por artículo para{' '}
            <span className="font-semibold text-emerald-500">
              {currentStore?.description ?? 'sucursal activa'}
            </span>
          </p>
        </div>
        <InventarioTabs />
      </div>

      {/* Sub-view Switcher (Ajustes vs Kardex Integrado) + Primary CTA */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 shrink-0">
        <div className="flex items-center gap-1.5 p-1 glass rounded-2xl border border-border/50">
          <button
            type="button"
            onClick={() => setActiveSubView('ajustes')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
              activeSubView === 'ajustes'
                ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
            }`}
          >
            <Wrench size={15} />
            <span>Gestión de Ajustes</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubView('kardex')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
              activeSubView === 'kardex'
                ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
            }`}
          >
            <BookOpen size={15} />
            <span>Kardex de Inventario</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <GlassButton
            type="button"
            variant="primary"
            size="sm"
            onClick={() => handleOpenNewAdjustment(null, null)}
            icon={<Plus size={16} />}
          >
            Nuevo Ajuste de Inventario
          </GlassButton>
        </div>
      </div>

      {activeSubView === 'kardex' ? (
        <KardexView
          selectedItemId={kardexSelectedItemId}
          onSelectItemId={setKardexSelectedItemId}
          onOpenAdjustment={(item, locId) => handleOpenNewAdjustment(item, locId)}
        />
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 shrink-0">
            <div className="glass rounded-xl px-3 py-2 flex items-center justify-between border border-border/40 hover:border-amber-500/30 transition-all">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
                  <Wrench size={14} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-medium text-muted-foreground truncate">
                    Total Ajustes
                  </p>
                  <p className="text-sm font-bold text-foreground leading-none">
                    {stats.totalCount}
                  </p>
                </div>
              </div>
              <span className="text-[10px] text-muted-foreground/70 hidden sm:inline shrink-0">
                movimientos
              </span>
            </div>

            <div className="glass rounded-xl px-3 py-2 flex items-center justify-between border border-border/40 hover:border-emerald-500/30 transition-all">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
                  <TrendingUp size={14} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-medium text-muted-foreground truncate">
                    Ajustes Positivos (+)
                  </p>
                  <p className="text-sm font-bold text-emerald-400 leading-none font-mono">
                    +{stats.positiveUnits} u.
                  </p>
                </div>
              </div>
              <span className="text-[10px] text-emerald-400/80 font-mono hidden sm:inline shrink-0">
                +{formatCurrency(stats.positiveValue)}
              </span>
            </div>

            <div className="glass rounded-xl px-3 py-2 flex items-center justify-between border border-border/40 hover:border-rose-500/30 transition-all">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center shrink-0">
                  <TrendingDown size={14} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-medium text-muted-foreground truncate">
                    Mermas / Salidas (-)
                  </p>
                  <p className="text-sm font-bold text-rose-400 leading-none font-mono">
                    -{stats.negativeUnits} u.
                  </p>
                </div>
              </div>
              <span className="text-[10px] text-rose-400/80 font-mono hidden sm:inline shrink-0">
                -{formatCurrency(stats.negativeValue)}
              </span>
            </div>

            <div className="glass rounded-xl px-3 py-2 flex items-center justify-between border border-border/40 hover:border-indigo-500/30 transition-all">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center shrink-0">
                  <DollarSign size={14} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-medium text-muted-foreground truncate">
                    Impacto Neto ($)
                  </p>
                  <p
                    className={`text-sm font-bold leading-none font-mono ${
                      stats.netFinancial >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {stats.netFinancial > 0 ? '+' : ''}
                    {formatCurrency(stats.netFinancial)}
                  </p>
                </div>
              </div>
              <span className="text-[10px] text-muted-foreground/70 hidden sm:inline shrink-0">
                valuación
              </span>
            </div>
          </div>

          {/* Filters Bar */}
          <GlassCard padding="none" className="p-2.5 shrink-0">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-2 flex-1">
                <div className="w-full sm:w-72">
                  <GlassInput
                    placeholder="Buscar artículo, folio, motivo..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    icon={<Search size={14} />}
                    className="py-1.5 text-xs"
                  />
                </div>

                {/* Location selector */}
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl glass-input text-xs font-medium">
                  <MapPin size={13} className="text-muted-foreground" />
                  <select
                    value={locationFilter}
                    onChange={(e) => setLocationFilter(e.target.value)}
                    className="bg-transparent border-none text-foreground text-xs focus:outline-none cursor-pointer"
                  >
                    <option value="all" className="bg-zinc-900 text-white">
                      Todas las ubicaciones
                    </option>
                    {locations.map((loc) => (
                      <option
                        key={loc.id_location}
                        value={loc.id_location}
                        className="bg-zinc-900 text-white"
                      >
                        {loc.description}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Reason selector */}
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl glass-input text-xs font-medium">
                  <Filter size={13} className="text-muted-foreground" />
                  <select
                    value={reasonFilter}
                    onChange={(e) => setReasonFilter(e.target.value)}
                    className="bg-transparent border-none text-foreground text-xs focus:outline-none cursor-pointer"
                  >
                    <option value="ALL" className="bg-zinc-900 text-white">
                      Todos los motivos
                    </option>
                    {ADJUSTMENT_REASONS.map((r) => (
                      <option key={r} value={r} className="bg-zinc-900 text-white">
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between xl:justify-end gap-2">
                {/* Direction pills */}
                <div className="flex items-center gap-1 p-0.5 rounded-xl glass border border-border/40">
                  <button
                    type="button"
                    onClick={() => setDirectionFilter('ALL')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                      directionFilter === 'ALL'
                        ? 'bg-emerald-500 text-white shadow-sm font-semibold'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Todos
                  </button>
                  <button
                    type="button"
                    onClick={() => setDirectionFilter('POSITIVE')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                      directionFilter === 'POSITIVE'
                        ? 'bg-emerald-500 text-white shadow-sm font-semibold'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Entradas (+)
                  </button>
                  <button
                    type="button"
                    onClick={() => setDirectionFilter('NEGATIVE')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                      directionFilter === 'NEGATIVE'
                        ? 'bg-rose-500 text-white shadow-sm font-semibold'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Mermas / Salidas (-)
                  </button>
                </div>

                {/* Export & Refresh buttons */}
                <div className="flex items-center gap-1.5">
                  <GlassButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleExportListPDF}
                    title="Exportar Ajustes a PDF"
                    className="h-8 px-2.5 text-xs"
                    icon={<FileText size={14} className="text-rose-400" />}
                  >
                    <span className="hidden sm:inline">PDF</span>
                  </GlassButton>
                  <GlassButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleExportListExcel}
                    title="Exportar Ajustes a Excel"
                    className="h-8 px-2.5 text-xs"
                    icon={<FileSpreadsheet size={14} className="text-emerald-400" />}
                  >
                    <span className="hidden sm:inline">Excel</span>
                  </GlassButton>
                  <GlassButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={fetchAdjustmentsData}
                    disabled={loading}
                    title="Recargar ajustes"
                    className="h-8 px-2.5"
                  >
                    <RefreshCw
                      size={13}
                      className={loading ? 'animate-spin text-emerald-400' : ''}
                    />
                  </GlassButton>
                </div>
              </div>
            </div>
          </GlassCard>

          {/* Adjustments Table */}
          <GlassCard
            padding="none"
            className="overflow-hidden shadow-xl flex-1 min-h-0 flex flex-col"
          >
            <div
              tabIndex={0}
              role="region"
              aria-label="Tabla de Ajustes de Inventario"
              className="overflow-x-auto overflow-y-auto flex-1 min-h-0 scroll-modern focus:outline-none"
            >
              <table className="w-full text-left text-sm border-separate border-spacing-0">
                <thead className="sticky top-0 z-20">
                  <tr className="glass-table-header border-b border-border/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="w-16 px-3 py-3.5 text-center sticky top-0 z-20 bg-card/95 backdrop-blur-md">
                      Acciones
                    </th>
                    <TableColumnHeader
                      title="Fecha y Hora"
                      sortKey="date_transaction"
                      currentSortKey={sortKey}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                    />
                    <TableColumnHeader
                      title="Folio"
                      sortKey="reference"
                      currentSortKey={sortKey}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                    />
                    <TableColumnHeader
                      title="Artículo"
                      sortKey="description"
                      currentSortKey={sortKey}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                    />
                    <TableColumnHeader
                      title="Ubicación"
                      sortKey="location"
                      currentSortKey={sortKey}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                    />
                    <TableColumnHeader
                      title="Motivo / Concepto"
                      sortKey="concept"
                      currentSortKey={sortKey}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                    />
                    <TableColumnHeader
                      title="Stock Ant."
                      sortKey="stock_before"
                      currentSortKey={sortKey}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                      align="right"
                    />
                    <TableColumnHeader
                      title="Ajuste"
                      sortKey="netDiff"
                      currentSortKey={sortKey}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                      align="right"
                    />
                    <TableColumnHeader
                      title="Stock Final"
                      sortKey="stock_after"
                      currentSortKey={sortKey}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                      align="right"
                    />
                    <TableColumnHeader
                      title="Impacto ($)"
                      sortKey="financialImpact"
                      currentSortKey={sortKey}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                      align="right"
                    />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {loading && transactions.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">
                        <RefreshCw
                          size={24}
                          className="animate-spin text-emerald-500 mx-auto mb-2"
                        />
                        Cargando historial de ajustes...
                      </td>
                    </tr>
                  ) : paginatedAdjustments.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">
                        <p className="text-base font-medium">
                          No se encontraron ajustes de inventario
                        </p>
                        <p className="text-xs text-muted-foreground/80 mt-1 mb-3">
                          Utilice el botón &quot;Nuevo Ajuste de Inventario&quot; para registrar entradas, salidas o mermas.
                        </p>
                        <GlassButton
                          type="button"
                          variant="primary"
                          size="sm"
                          onClick={() => handleOpenNewAdjustment(null, null)}
                          icon={<Plus size={15} />}
                        >
                          Registrar Primer Ajuste
                        </GlassButton>
                      </td>
                    </tr>
                  ) : (
                    paginatedAdjustments.map((row) => (
                      <tr
                        key={row.id_transaction}
                        className="hover:bg-white/[0.03] transition-colors group"
                      >
                        <td className="w-16 px-3 py-3 text-center">
                          <TableActionMenu
                            items={[
                              {
                                label: 'Ver Kardex del Artículo',
                                icon: <BookOpen size={15} />,
                                onClick: () => handleOpenItemKardex(row.id_item),
                                variant: 'indigo',
                              },
                              {
                                label: 'Abrir en Pestaña Kardex',
                                icon: <ArrowRight size={15} />,
                                onClick: () => handleSwitchToIntegratedKardex(row.id_item),
                                variant: 'default',
                              },
                              {
                                label: 'Ver Detalle / Póliza',
                                icon: <Eye size={15} />,
                                onClick: () => setDetailAdjustment(row),
                                variant: 'default',
                                separatorBefore: true,
                              },
                              {
                                label: 'Imprimir Póliza PDF',
                                icon: <Printer size={15} />,
                                onClick: () => handlePrintVoucherPDF(row),
                                variant: 'default',
                              },
                              ...(row.item
                                ? [
                                    {
                                      label: 'Nuevo Ajuste a este Artículo',
                                      icon: <Wrench size={15} />,
                                      onClick: () =>
                                        handleOpenNewAdjustment(row.item, row.id_location),
                                      variant: 'primary' as const,
                                      separatorBefore: true,
                                    },
                                  ]
                                : []),
                            ]}
                          />
                        </td>

                        <td className="px-4 py-3 text-xs text-muted-foreground font-mono whitespace-nowrap">
                          {formatDateTime(row.date_transaction)}
                        </td>

                        <td className="px-4 py-3 text-xs font-mono font-semibold text-amber-400 whitespace-nowrap">
                          {row.reference || '—'}
                        </td>

                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => handleOpenItemKardex(row.id_item)}
                            className="text-left group/item"
                            title="Ver Kardex de este artículo"
                          >
                            <span className="font-semibold text-foreground group-hover/item:text-emerald-400 transition-colors block">
                              {row.item?.description ?? 'Artículo no especificado'}
                            </span>
                            <span className="text-[11px] text-muted-foreground font-mono">
                              {row.item?.code || row.item?.barcode || '—'}
                            </span>
                          </button>
                        </td>

                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {row.location?.description ?? 'General'}
                        </td>

                        <td className="px-4 py-3 text-xs">
                          <div className="flex flex-col max-w-xs">
                            <span className="font-medium text-foreground truncate">
                              {row.concept || 'Ajuste de Inventario'}
                            </span>
                            {row.cleanComments && (
                              <span className="text-[11px] text-muted-foreground/80 truncate">
                                {row.cleanComments}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">
                          {row.computedStockBefore}
                        </td>

                        <td className="px-4 py-3 text-right font-mono font-bold">
                          {row.netDiff > 0 ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-400 text-xs">
                              +{row.netDiff}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-rose-500/15 text-rose-400 text-xs">
                              {row.netDiff}
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3 text-right font-mono font-bold text-foreground">
                          {row.computedStockAfter}{' '}
                          <span className="text-[11px] font-normal text-muted-foreground">
                            {row.item?.unit ?? 'Pza'}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-right font-mono text-xs font-semibold">
                          <span
                            className={
                              row.financialImpact >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }
                          >
                            {row.financialImpact > 0 ? '+' : ''}
                            {formatCurrency(row.financialImpact)}
                          </span>
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
              totalItems={sortedAdjustments.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
              realtimeLabel="Ajustes sincronizados en tiempo real"
            />
          </GlassCard>
        </>
      )}

      {/* Modal: Create Inventory Adjustment */}
      <AjusteInventarioModal
        open={ajusteModalOpen}
        onClose={() => setAjusteModalOpen(false)}
        preselectedItem={preselectedItem}
        preselectedLocationId={preselectedLocationId}
        onSuccess={() => {
          fetchAdjustmentsData()
        }}
      />

      {/* Modal: Item Kardex Quick View */}
      <KardexModal
        open={kardexModalOpen}
        onClose={() => setKardexModalOpen(false)}
        itemId={kardexModalItemId}
        onOpenAdjustment={(item, locId) => {
          setKardexModalOpen(false)
          handleOpenNewAdjustment(item, locId)
        }}
      />

      {/* Modal: Adjustment Voucher Detail */}
      <AnimatePresence>
        {detailAdjustment && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="glass-card max-w-lg w-full flex flex-col max-h-[92dvh] sm:max-h-[90vh] overflow-hidden border border-border/60 shadow-2xl rounded-2xl sm:rounded-3xl"
            >
              {/* Header Fijo */}
              <div className="flex items-center justify-between border-b border-border/40 px-4 py-3 sm:px-6 sm:py-4 bg-card/95 dark:bg-card/90 backdrop-blur-xl shrink-0 z-10">
                <div className="min-w-0 pr-2">
                  <h3 className="text-sm sm:text-base font-bold text-foreground truncate">
                    Póliza de Ajuste de Inventario
                  </h3>
                  <p className="text-xs font-mono text-amber-400 truncate">
                    Folio: {detailAdjustment.reference || detailAdjustment.id_transaction.slice(0, 8)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDetailAdjustment(null)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors shrink-0"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Cuerpo desplazable */}
              <div className="flex-1 min-h-0 overflow-y-auto scroll-modern p-4 sm:p-6 space-y-3 text-xs sm:text-sm">
                <div className="p-3 rounded-2xl glass border border-border/40">
                  <p className="text-xs text-muted-foreground">Artículo Ajustado</p>
                  <p className="font-bold text-foreground text-base">
                    {detailAdjustment.item?.description ?? 'Artículo'}
                  </p>
                  <p className="text-xs font-mono text-muted-foreground">
                    Código: {detailAdjustment.item?.code || '—'} · CB:{' '}
                    {detailAdjustment.item?.barcode || '—'}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2.5 rounded-xl glass border border-border/40">
                    <p className="text-[11px] text-muted-foreground">Stock Anterior</p>
                    <p className="text-base font-bold font-mono text-foreground">
                      {detailAdjustment.computedStockBefore}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-xl glass border border-border/40">
                    <p className="text-[11px] text-muted-foreground">Diferencia</p>
                    <p
                      className={`text-base font-bold font-mono ${
                        detailAdjustment.netDiff >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {detailAdjustment.netDiff > 0
                        ? `+${detailAdjustment.netDiff}`
                        : detailAdjustment.netDiff}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                    <p className="text-[11px] text-emerald-300">Stock Resultante</p>
                    <p className="text-base font-bold font-mono text-emerald-400">
                      {detailAdjustment.computedStockAfter}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5 text-xs">
                  <div className="p-2.5 rounded-xl glass border border-border/30">
                    <span className="text-muted-foreground block">Fecha y Hora:</span>
                    <strong className="text-foreground font-mono">
                      {formatDateTime(detailAdjustment.date_transaction)}
                    </strong>
                  </div>
                  <div className="p-2.5 rounded-xl glass border border-border/30">
                    <span className="text-muted-foreground block">Ubicación:</span>
                    <strong className="text-foreground">
                      {detailAdjustment.location?.description ?? 'General'}
                    </strong>
                  </div>
                  <div className="p-2.5 rounded-xl glass border border-border/30">
                    <span className="text-muted-foreground block">Motivo:</span>
                    <strong className="text-foreground">
                      {detailAdjustment.concept || 'Ajuste'}
                    </strong>
                  </div>
                  <div className="p-2.5 rounded-xl glass border border-border/30">
                    <span className="text-muted-foreground block">Impacto Financiero:</span>
                    <strong
                      className={`font-mono ${
                        detailAdjustment.financialImpact >= 0
                          ? 'text-emerald-400'
                          : 'text-rose-400'
                      }`}
                    >
                      {detailAdjustment.financialImpact > 0 ? '+' : ''}
                      {formatCurrency(detailAdjustment.financialImpact)}
                    </strong>
                  </div>
                </div>

                {detailAdjustment.cleanComments && (
                  <div className="p-3 rounded-xl glass border border-border/30 text-xs">
                    <span className="text-muted-foreground block mb-0.5">Observaciones:</span>
                    <p className="text-foreground">{detailAdjustment.cleanComments}</p>
                  </div>
                )}
              </div>

              {/* Footer Fijo */}
              <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 border-t border-border/40 p-3 sm:p-4 bg-card/95 dark:bg-card/90 backdrop-blur-xl shrink-0 z-10">
                <GlassButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const itemId = detailAdjustment.id_item
                    setDetailAdjustment(null)
                    handleOpenItemKardex(itemId)
                  }}
                  icon={<BookOpen size={14} />}
                  className="w-full sm:w-auto"
                >
                  Ver en Kardex
                </GlassButton>

                <div className="flex flex-col-reverse sm:flex-row items-center gap-2 w-full sm:w-auto">
                  <GlassButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setDetailAdjustment(null)}
                    className="w-full sm:w-auto"
                  >
                    Cerrar
                  </GlassButton>
                  <GlassButton
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => handlePrintVoucherPDF(detailAdjustment)}
                    icon={<Printer size={14} />}
                    className="w-full sm:w-auto"
                  >
                    Imprimir Póliza PDF
                  </GlassButton>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
