'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/utils/supabase/client'
import { useStore } from '@/components/providers/store-provider'
import { GlassCard } from '@/components/glass-card'
import { GlassButton } from '@/components/glass-button'
import { GlassInput } from '@/components/glass-input'
import { TableActionMenu, TableColumnHeader, TablePagination } from '@/components/tables'
import { type Transaction, type MovimType, type Item, type Location, type Stock } from '@/lib/types'
import { formatDateTime, formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import {
  BookOpen, Search, RefreshCw, MapPin, Calendar, FileText, FileSpreadsheet,
  ArrowDownLeft, ArrowUpRight, ShoppingCart, ScanLine, Wrench, Boxes,
  Filter, X, Eye, ArrowRight, Package, Sparkles
} from 'lucide-react'

export interface EnrichedKardexRow extends Transaction {
  computedStockBefore: number
  computedStockAfter: number
  cleanComments: string
  movementQty: number
  movementValue: number
  balanceValuation: number
}

export const KARDEX_MOVIM_CONFIG: Record<
  MovimType,
  { label: string; icon: typeof ArrowDownLeft; color: string; badge: string }
> = {
  E: { label: 'Entrada', icon: ArrowDownLeft, color: 'text-emerald-400', badge: 'badge-active' },
  S: { label: 'Salida', icon: ArrowUpRight, color: 'text-rose-400', badge: 'badge-error' },
  V: { label: 'Venta POS', icon: ShoppingCart, color: 'text-indigo-400', badge: 'badge-info' },
  I: { label: 'Inv. Físico', icon: ScanLine, color: 'text-teal-400', badge: 'badge-active' },
  A: { label: 'Ajuste', icon: Wrench, color: 'text-amber-400', badge: 'badge-warning' },
  T: { label: 'Traspaso', icon: ArrowRight, color: 'text-violet-400', badge: 'badge-info' },
}

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

interface KardexViewProps {
  selectedItemId?: string | null
  onSelectItemId?: (itemId: string | null) => void
  initialLocationId?: string
  onOpenAdjustment?: (item?: Item | null, locationId?: string | null) => void
  compact?: boolean
}

export function KardexView({
  selectedItemId: controlledItemId,
  onSelectItemId,
  initialLocationId = 'all',
  onOpenAdjustment,
  compact = false,
}: KardexViewProps) {
  const supabase = createClient()
  const { currentStore, storeId } = useStore()

  // Internal item selection state if not controlled externally
  const [internalItemId, setInternalItemId] = useState<string | null>(controlledItemId ?? null)
  const activeItemId = controlledItemId !== undefined ? controlledItemId : internalItemId

  const setActiveItemId = useCallback(
    (id: string | null) => {
      if (onSelectItemId) {
        onSelectItemId(id)
      } else {
        setInternalItemId(id)
      }
    },
    [onSelectItemId]
  )

  useEffect(() => {
    if (controlledItemId !== undefined) {
      setInternalItemId(controlledItemId)
    }
  }, [controlledItemId])

  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [stocks, setStocks] = useState<Stock[]>([])
  const [catalogItems, setCatalogItems] = useState<Item[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [search, setSearch] = useState('')
  const [itemPickerQuery, setItemPickerQuery] = useState('')
  const [showItemDropdown, setShowItemDropdown] = useState(false)
  const [typeFilter, setTypeFilter] = useState<string>('ALL')
  const [locationFilter, setLocationFilter] = useState<string>(initialLocationId || 'all')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')

  // Detail modal state
  const [detailRow, setDetailRow] = useState<EnrichedKardexRow | null>(null)

  const fetchData = useCallback(async () => {
    if (!storeId) {
      setTransactions([])
      setStocks([])
      setLoading(false)
      return
    }

    setLoading(true)

    const [txRes, stocksRes, locsRes, itemsRes] = await Promise.all([
      supabase
        .from('transactions')
        .select('*')
        .eq('id_store', storeId)
        .order('date_transaction', { ascending: false })
        .limit(400),
      supabase
        .from('stocks')
        .select('*')
        .eq('id_store', storeId),
      supabase
        .from('locations')
        .select('*')
        .eq('id_store', storeId)
        .eq('status', 'A')
        .order('description'),
      supabase
        .from('items')
        .select('id_item, code, barcode, description, description_short, unit, cost, price, price1, status, category:categories(description)')
        .eq('status', 'A')
        .order('description')
        .limit(500),
    ])

    if (locsRes.data) setLocations(locsRes.data as Location[])
    if (stocksRes.data) setStocks(stocksRes.data as Stock[])

    const allItems = (itemsRes.data ?? []) as unknown as Item[]
    setCatalogItems(allItems)

    const txList = (txRes.data ?? []) as Transaction[]
    if (txRes.error) {
      toast.error('Error al cargar el Kardex: ' + txRes.error.message)
      setTransactions([])
      setLoading(false)
      return
    }

    // Map items & locations for fast hydration
    const itemsMap = new Map<string, Item>(allItems.map((it) => [it.id_item, it]))
    const locsMap = new Map<string, Location>((locsRes.data ?? []).map((l: Location) => [l.id_location, l]))

    // Fetch any missing items referenced in transactions that weren't in top 500
    const missingItemIds = Array.from(
      new Set(
        txList
          .map((t) => t.id_item)
          .filter((id): id is string => Boolean(id) && !itemsMap.has(id!))
      )
    )

    if (missingItemIds.length > 0) {
      const { data: extraItems } = await supabase
        .from('items')
        .select('id_item, code, barcode, description, description_short, unit, cost, price, price1, status')
        .in('id_item', missingItemIds)

      if (extraItems) {
        ;(extraItems as Item[]).forEach((it) => itemsMap.set(it.id_item, it))
      }
    }

    const hydrated: Transaction[] = txList.map((t) => ({
      ...t,
      item: t.id_item ? itemsMap.get(t.id_item) : undefined,
      location: t.id_location ? locsMap.get(t.id_location) : undefined,
    }))

    setTransactions(hydrated)
    setLoading(false)
  }, [storeId, supabase])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Realtime subscription on transactions & stocks
  useEffect(() => {
    if (!storeId) return

    const channel = supabase
      .channel(`kardex-live-${storeId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions', filter: `id_store=eq.${storeId}` },
        () => fetchData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stocks', filter: `id_store=eq.${storeId}` },
        () => fetchData()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [storeId, supabase, fetchData])

  // Compute running balances (stockBefore & stockAfter) per item + location
  const enrichedTransactions = useMemo<EnrichedKardexRow[]>(() => {
    // Map current stock by item_location and item_any
    const currentStockMap = new Map<string, number>()
    stocks.forEach((s) => {
      if (!s.id_item) return
      const key = `${s.id_item}_${s.id_location || 'null'}`
      currentStockMap.set(key, (currentStockMap.get(key) ?? 0) + (s.current ?? 0))
      const anyKey = `${s.id_item}_any`
      currentStockMap.set(anyKey, (currentStockMap.get(anyKey) ?? 0) + (s.current ?? 0))
    })

    // Sort newest first by date_transaction / created_at
    const sortedNewestFirst = [...transactions].sort((a, b) => {
      const da = new Date(a.date_transaction || a.created_at).getTime()
      const db = new Date(b.date_transaction || b.created_at).getTime()
      return db - da
    })

    // Track running stock backwards per (item, location)
    const runningMap = new Map<string, number>()

    return sortedNewestFirst.map((t) => {
      const itemKey = t.id_item || 'unknown'
      const locKey = `${itemKey}_${t.id_location || 'null'}`
      if (!runningMap.has(locKey)) {
        const initialCurrent =
          currentStockMap.get(locKey) ?? currentStockMap.get(`${itemKey}_any`) ?? 0
        runningMap.set(locKey, initialCurrent)
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

      // Update running pointer for older transactions of the same item+location
      runningMap.set(locKey, stockBefore)

      const unitCost = Number(t.cost || t.item?.cost || 0)
      const movementQty = entryQty > 0 ? entryQty : exitQty
      const movementValue = movementQty * unitCost
      const balanceValuation = stockAfter * unitCost

      return {
        ...t,
        computedStockBefore: stockBefore,
        computedStockAfter: stockAfter,
        cleanComments: parsed.clean,
        movementQty,
        movementValue,
        balanceValuation,
      }
    })
  }, [transactions, stocks])

  // Currently selected Item object
  const selectedItem = useMemo(() => {
    if (!activeItemId) return null
    return (
      catalogItems.find((i) => i.id_item === activeItemId) ??
      transactions.find((t) => t.id_item === activeItemId)?.item ??
      null
    )
  }, [activeItemId, catalogItems, transactions])

  // Current stock of selected item (filtered by locationFilter if set)
  const selectedItemStockSummary = useMemo(() => {
    if (!activeItemId) return { currentStock: 0, valuation: 0 }
    const matchingStocks = stocks.filter(
      (s) =>
        s.id_item === activeItemId &&
        (locationFilter === 'all' || s.id_location === locationFilter)
    )
    const currentStock = matchingStocks.reduce((acc, s) => acc + (s.current ?? 0), 0)
    const unitCost = selectedItem?.cost ?? 0
    return {
      currentStock,
      valuation: currentStock * unitCost,
    }
  }, [activeItemId, stocks, locationFilter, selectedItem])

  // Item search autocomplete list
  const matchingCatalogItems = useMemo(() => {
    const q = itemPickerQuery.trim().toLowerCase()
    if (!q) return catalogItems.slice(0, 10)
    return catalogItems
      .filter((it) => {
        const desc = it.description?.toLowerCase() ?? ''
        const code = it.code?.toLowerCase() ?? ''
        const barcode = it.barcode?.toLowerCase() ?? ''
        return desc.includes(q) || code.includes(q) || barcode.includes(q)
      })
      .slice(0, 12)
  }, [catalogItems, itemPickerQuery])

  // Apply filters
  const filteredRows = useMemo(() => {
    return enrichedTransactions.filter((row) => {
      if (activeItemId && row.id_item !== activeItemId) return false
      if (typeFilter !== 'ALL' && row.movim_type !== typeFilter) return false
      if (locationFilter !== 'all' && row.id_location !== locationFilter) return false

      if (dateFrom) {
        const txDate = new Date(row.date_transaction).toISOString().slice(0, 10)
        if (txDate < dateFrom) return false
      }
      if (dateTo) {
        const txDate = new Date(row.date_transaction).toISOString().slice(0, 10)
        if (txDate > dateTo) return false
      }

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
  }, [enrichedTransactions, activeItemId, typeFilter, locationFilter, dateFrom, dateTo, search])

  // Period KPIs for filtered Kardex rows
  const periodStats = useMemo(() => {
    let entriesQty = 0
    let exitsQty = 0
    let entriesVal = 0
    let exitsVal = 0

    filteredRows.forEach((r) => {
      const c = Number(r.cost || r.item?.cost || 0)
      if (r.amount_enrty > 0) {
        entriesQty += r.amount_enrty
        entriesVal += r.amount_enrty * c
      }
      if (r.amount_exit > 0) {
        exitsQty += r.amount_exit
        exitsVal += r.amount_exit * c
      }
    })

    return { entriesQty, exitsQty, entriesVal, exitsVal }
  }, [filteredRows])

  // Sorting state
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

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  useEffect(() => {
    setCurrentPage(1)
  }, [activeItemId, typeFilter, locationFilter, dateFrom, dateTo, search])

  const sortedRows = useMemo(() => {
    const list = [...filteredRows]
    return list.sort((a, b) => {
      let aVal: string | number = ''
      let bVal: string | number = ''

      switch (sortKey) {
        case 'date_transaction':
          aVal = new Date(a.date_transaction).getTime()
          bVal = new Date(b.date_transaction).getTime()
          break
        case 'movim_type':
          aVal = a.movim_type || ''
          bVal = b.movim_type || ''
          break
        case 'description':
          aVal = (a.item?.description || '').toLowerCase()
          bVal = (b.item?.description || '').toLowerCase()
          break
        case 'location':
          aVal = (a.location?.description || '').toLowerCase()
          bVal = (b.location?.description || '').toLowerCase()
          break
        case 'reference':
          aVal = `${a.concept || ''} ${a.reference || ''}`.toLowerCase()
          bVal = `${b.concept || ''} ${b.reference || ''}`.toLowerCase()
          break
        case 'stock_before':
          aVal = a.computedStockBefore
          bVal = b.computedStockBefore
          break
        case 'entry':
          aVal = Number(a.amount_enrty || 0)
          bVal = Number(b.amount_enrty || 0)
          break
        case 'exit':
          aVal = Number(a.amount_exit || 0)
          bVal = Number(b.amount_exit || 0)
          break
        case 'stock_after':
          aVal = a.computedStockAfter
          bVal = b.computedStockAfter
          break
        case 'cost':
          aVal = Number(a.cost || 0)
          bVal = Number(b.cost || 0)
          break
        case 'valuation':
          aVal = a.balanceValuation
          bVal = b.balanceValuation
          break
        default:
          return 0
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
  }, [filteredRows, sortKey, sortDirection])

  const totalPages = Math.ceil(sortedRows.length / pageSize) || 1
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedRows.slice(start, start + pageSize)
  }, [sortedRows, currentPage, pageSize])

  // Quick date range presets
  const applyQuickDateRange = (days: number | null) => {
    if (days === null) {
      setDateFrom('')
      setDateTo('')
      return
    }
    const end = new Date()
    const start = new Date()
    start.setDate(end.getDate() - days)
    setDateFrom(start.toISOString().slice(0, 10))
    setDateTo(end.toISOString().slice(0, 10))
  }

  // Export Kardex to PDF
  const handleExportPDF = () => {
    if (sortedRows.length === 0) {
      toast.error('No hay registros en el Kardex para exportar')
      return
    }

    const doc = new jsPDF({ orientation: 'landscape' })

    doc.setFontSize(16)
    doc.setTextColor(16, 185, 129)
    doc.text('CAMPIRAN POS — KARDEX DE INVENTARIO', 14, 16)

    doc.setFontSize(10)
    doc.setTextColor(60, 72, 88)
    doc.text(`Sucursal: ${currentStore?.description ?? 'General'}`, 14, 23)
    doc.text(
      `Artículo: ${
        selectedItem
          ? `${selectedItem.description} (${selectedItem.code || selectedItem.barcode || 'S/C'})`
          : 'Todos los artículos'
      }`,
      14,
      29
    )
    doc.text(`Fecha de emisión: ${formatDateTime(new Date())}`, 14, 35)

    const body = sortedRows.map((r) => [
      formatDateTime(r.date_transaction),
      KARDEX_MOVIM_CONFIG[r.movim_type as MovimType]?.label ?? r.movim_type ?? 'N/A',
      r.item?.description ?? '—',
      r.location?.description ?? 'General',
      `${r.concept || 'Movimiento'}${r.reference ? ` (${r.reference})` : ''}`,
      r.computedStockBefore,
      r.amount_enrty > 0 ? `+${r.amount_enrty}` : '—',
      r.amount_exit > 0 ? `-${r.amount_exit}` : '—',
      r.computedStockAfter,
      formatCurrency(r.cost),
      formatCurrency(r.balanceValuation),
    ])

    autoTable(doc, {
      startY: 40,
      head: [
        [
          'Fecha y Hora',
          'Tipo',
          'Artículo',
          'Ubicación',
          'Concepto / Ref.',
          'Stock Ant.',
          'Entrada',
          'Salida',
          'Saldo Final',
          'Costo Unit.',
          'Saldo Valorizado',
        ],
      ],
      body,
      theme: 'grid',
      headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 7.5, cellPadding: 2 },
      columnStyles: {
        5: { halign: 'right' },
        6: { halign: 'right' },
        7: { halign: 'right' },
        8: { halign: 'right', fontStyle: 'bold' },
        9: { halign: 'right' },
        10: { halign: 'right' },
      },
    })

    const fileSuffix = selectedItem?.code || selectedItem?.description?.slice(0, 15) || 'General'
    doc.save(`Kardex_${fileSuffix}_${new Date().toISOString().slice(0, 10)}.pdf`)
    toast.success('Kardex exportado a PDF exitosamente')
  }

  // Export Kardex to Excel
  const handleExportExcel = () => {
    if (sortedRows.length === 0) {
      toast.error('No hay registros en el Kardex para exportar')
      return
    }

    const rowsData = sortedRows.map((r) => ({
      'Fecha y Hora': formatDateTime(r.date_transaction),
      Tipo: KARDEX_MOVIM_CONFIG[r.movim_type as MovimType]?.label ?? r.movim_type ?? 'N/A',
      Código: r.item?.code || r.item?.barcode || '',
      Artículo: r.item?.description ?? '',
      Ubicación: r.location?.description ?? 'General',
      Concepto: r.concept ?? '',
      Referencia: r.reference ?? '',
      Observaciones: r.cleanComments ?? '',
      'Existencia Anterior': r.computedStockBefore,
      Entrada: r.amount_enrty,
      Salida: r.amount_exit,
      'Saldo Resultante': r.computedStockAfter,
      'Costo Unitario': r.cost,
      'Valor Movimiento': r.movementValue,
      'Saldo Valorizado': r.balanceValuation,
    }))

    const worksheet = XLSX.utils.json_to_sheet(rowsData)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Kardex')
    const fileSuffix = selectedItem?.code || 'General'
    XLSX.writeFile(workbook, `Kardex_${fileSuffix}_${new Date().toISOString().slice(0, 10)}.xlsx`)
    toast.success('Kardex exportado a Excel exitosamente')
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 gap-2.5 sm:gap-3">
      {/* Top Bar: Item Selector for Kardex + Selected Item Summary Card */}
      <GlassCard padding="none" className="p-3 shrink-0">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Item Selector */}
          <div className="relative flex-1 max-w-xl">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-1">
              <BookOpen size={13} className="text-emerald-400" />
              Consultar Kardex por Artículo
            </label>

            {selectedItem ? (
              <div className="flex items-center justify-between gap-3 px-3.5 py-2 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                    <Package size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">
                      {selectedItem.description}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono truncate">
                      Cód: {selectedItem.code || '—'} · CB: {selectedItem.barcode || '—'} · Unidad:{' '}
                      {selectedItem.unit ?? 'Pza'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {onOpenAdjustment && (
                    <GlassButton
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        onOpenAdjustment(
                          selectedItem,
                          locationFilter !== 'all' ? locationFilter : null
                        )
                      }
                      icon={<Wrench size={13} />}
                      className="text-xs py-1 px-2.5"
                    >
                      Ajustar Stock
                    </GlassButton>
                  )}
                  <button
                    type="button"
                    onClick={() => setActiveItemId(null)}
                    className="p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
                    title="Ver todos los artículos"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="relative">
                <GlassInput
                  value={itemPickerQuery}
                  onChange={(e) => {
                    setItemPickerQuery(e.target.value)
                    setShowItemDropdown(true)
                  }}
                  onFocus={() => setShowItemDropdown(true)}
                  onBlur={() => setTimeout(() => setShowItemDropdown(false), 180)}
                  placeholder="Seleccione o busque un artículo para ver su tarjeta Kardex individual (o consulte todos abajo)..."
                  icon={<Search size={15} />}
                />
                {showItemDropdown && matchingCatalogItems.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 z-30 glass-card p-1.5 max-h-64 overflow-y-auto scroll-modern border border-border/70 shadow-2xl">
                    {matchingCatalogItems.map((it) => {
                      const itemStock = stocks
                        .filter((s) => s.id_item === it.id_item)
                        .reduce((acc, s) => acc + (s.current ?? 0), 0)
                      return (
                        <button
                          key={it.id_item}
                          type="button"
                          onMouseDown={() => {
                            setActiveItemId(it.id_item)
                            setItemPickerQuery('')
                            setShowItemDropdown(false)
                          }}
                          className="w-full text-left px-3 py-2 rounded-xl hover:bg-emerald-500/15 flex items-center justify-between gap-3 transition-colors"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">
                              {it.description}
                            </p>
                            <p className="text-xs text-muted-foreground font-mono">
                              Cód: {it.code || '—'} · CB: {it.barcode || '—'}
                            </p>
                          </div>
                          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-lg bg-white/5 border border-border/40 text-emerald-400 shrink-0">
                            Existencia: {itemStock} {it.unit ?? 'Pza'}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Summary KPIs for the Kardex */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 shrink-0">
            {selectedItem && (
              <div className="glass rounded-xl px-3 py-2 border border-emerald-500/30 bg-emerald-500/5">
                <p className="text-[10px] font-medium text-muted-foreground uppercase">
                  Existencia Actual
                </p>
                <p className="text-sm font-bold font-mono text-emerald-400">
                  {selectedItemStockSummary.currentStock}{' '}
                  <span className="text-xs font-normal text-muted-foreground">
                    {selectedItem.unit ?? 'Pza'}
                  </span>
                </p>
              </div>
            )}

            <div className="glass rounded-xl px-3 py-2 border border-border/40">
              <p className="text-[10px] font-medium text-muted-foreground uppercase">
                Entradas (Periodo)
              </p>
              <p className="text-sm font-bold font-mono text-emerald-400">
                +{periodStats.entriesQty} u.
              </p>
            </div>

            <div className="glass rounded-xl px-3 py-2 border border-border/40">
              <p className="text-[10px] font-medium text-muted-foreground uppercase">
                Salidas (Periodo)
              </p>
              <p className="text-sm font-bold font-mono text-rose-400">
                -{periodStats.exitsQty} u.
              </p>
            </div>

            <div className="glass rounded-xl px-3 py-2 border border-border/40">
              <p className="text-[10px] font-medium text-muted-foreground uppercase">
                {selectedItem ? 'Saldo Valorizado' : 'Movimientos'}
              </p>
              <p className="text-sm font-bold font-mono text-indigo-400">
                {selectedItem
                  ? formatCurrency(selectedItemStockSummary.valuation)
                  : `${filteredRows.length} reg.`}
              </p>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Filters & Export Bar */}
      <GlassCard padding="none" className="p-2.5 shrink-0">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-2.5">
          {/* Left: Search & Location & Date filters */}
          <div className="flex flex-wrap items-center gap-2 flex-1">
            <div className="w-full sm:w-64">
              <GlassInput
                placeholder="Buscar folio, concepto, artículo..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                icon={<Search size={14} />}
                className="py-1.5 text-xs"
              />
            </div>

            {/* Location Filter */}
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

            {/* Date range inputs */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl glass-input text-xs">
              <Calendar size={13} className="text-muted-foreground shrink-0" />
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="bg-transparent text-xs text-foreground focus:outline-none"
                title="Fecha inicial"
              />
              <span className="text-muted-foreground">—</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="bg-transparent text-xs text-foreground focus:outline-none"
                title="Fecha final"
              />
            </div>

            {/* Quick date pills */}
            <div className="flex items-center gap-1 text-[11px]">
              <button
                type="button"
                onClick={() => applyQuickDateRange(0)}
                className="px-2 py-1 rounded-lg glass hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
              >
                Hoy
              </button>
              <button
                type="button"
                onClick={() => applyQuickDateRange(7)}
                className="px-2 py-1 rounded-lg glass hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
              >
                7D
              </button>
              <button
                type="button"
                onClick={() => applyQuickDateRange(30)}
                className="px-2 py-1 rounded-lg glass hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
              >
                30D
              </button>
              {(dateFrom || dateTo) && (
                <button
                  type="button"
                  onClick={() => applyQuickDateRange(null)}
                  className="px-2 py-1 rounded-lg bg-rose-500/15 text-rose-400 hover:bg-rose-500/25 transition-colors"
                >
                  Limpiar
                </button>
              )}
            </div>
          </div>

          {/* Right: Movement Type Pills & Export Buttons */}
          <div className="flex flex-wrap items-center justify-between xl:justify-end gap-2">
            <div className="flex items-center gap-1 p-0.5 rounded-xl glass border border-border/40 overflow-x-auto">
              <button
                type="button"
                onClick={() => setTypeFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  typeFilter === 'ALL'
                    ? 'bg-emerald-500 text-white shadow-sm font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Todos
              </button>
              {(Object.keys(KARDEX_MOVIM_CONFIG) as MovimType[]).map((type) => {
                const cfg = KARDEX_MOVIM_CONFIG[type]
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setTypeFilter(type)}
                    className={`px-2 py-1 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                      typeFilter === type
                        ? 'bg-emerald-500 text-white shadow-sm font-semibold'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {cfg.label}
                  </button>
                )
              })}
            </div>

            <div className="flex items-center gap-1.5">
              <GlassButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleExportPDF}
                title="Exportar Kardex a PDF"
                className="h-8 px-2.5 text-xs"
                icon={<FileText size={14} className="text-rose-400" />}
              >
                <span className="hidden sm:inline">PDF</span>
              </GlassButton>

              <GlassButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleExportExcel}
                title="Exportar Kardex a Excel"
                className="h-8 px-2.5 text-xs"
                icon={<FileSpreadsheet size={14} className="text-emerald-400" />}
              >
                <span className="hidden sm:inline">Excel</span>
              </GlassButton>

              <GlassButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={fetchData}
                disabled={loading}
                title="Recargar Kardex"
                className="h-8 px-2.5"
              >
                <RefreshCw size={13} className={loading ? 'animate-spin text-emerald-400' : ''} />
              </GlassButton>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Kardex Table */}
      <GlassCard
        padding="none"
        className={`overflow-hidden shadow-xl flex-1 min-h-0 flex flex-col ${
          compact ? 'max-h-[55vh]' : ''
        }`}
      >
        <div
          tabIndex={0}
          role="region"
          aria-label="Tabla de Kardex de Inventario"
          className="overflow-x-auto overflow-y-auto flex-1 min-h-0 scroll-modern focus:outline-none"
        >
          <table className="w-full text-left text-sm border-separate border-spacing-0">
            <thead className="sticky top-0 z-20">
              <tr className="glass-table-header border-b border-border/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="w-14 px-3 py-3.5 text-center sticky top-0 z-20 bg-card/95 backdrop-blur-md">
                  Acc.
                </th>
                <TableColumnHeader
                  title="Fecha y Hora"
                  sortKey="date_transaction"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                />
                <TableColumnHeader
                  title="Tipo"
                  sortKey="movim_type"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                />
                {!activeItemId && (
                  <TableColumnHeader
                    title="Artículo"
                    sortKey="description"
                    currentSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                )}
                <TableColumnHeader
                  title="Ubicación"
                  sortKey="location"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                />
                <TableColumnHeader
                  title="Concepto / Referencia"
                  sortKey="reference"
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
                  title="Entrada"
                  sortKey="entry"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  align="right"
                />
                <TableColumnHeader
                  title="Salida"
                  sortKey="exit"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  align="right"
                />
                <TableColumnHeader
                  title="Saldo Final"
                  sortKey="stock_after"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  align="right"
                />
                <TableColumnHeader
                  title="Costo Unit."
                  sortKey="cost"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  align="right"
                />
                <TableColumnHeader
                  title="Saldo Valorizado"
                  sortKey="valuation"
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
                  <td
                    colSpan={activeItemId ? 11 : 12}
                    className="px-4 py-12 text-center text-muted-foreground"
                  >
                    <RefreshCw size={24} className="animate-spin text-emerald-500 mx-auto mb-2" />
                    Cargando Kardex de inventario...
                  </td>
                </tr>
              ) : paginatedRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={activeItemId ? 11 : 12}
                    className="px-4 py-12 text-center text-muted-foreground"
                  >
                    <p className="text-base font-medium">No se encontraron movimientos en el Kardex</p>
                    <p className="text-xs text-muted-foreground/80 mt-1">
                      Intente cambiar los filtros o seleccione otro artículo
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedRows.map((row) => {
                  const mType = row.movim_type as MovimType
                  const cfg = KARDEX_MOVIM_CONFIG[mType] ?? {
                    label: row.movim_type ?? 'N/A',
                    color: 'text-muted-foreground',
                    badge: 'badge-info',
                  }

                  return (
                    <tr
                      key={row.id_transaction}
                      className="hover:bg-white/[0.03] transition-colors group"
                    >
                      <td className="w-14 px-3 py-3 text-center">
                        <TableActionMenu
                          items={[
                            {
                              label: 'Ver Detalle del Movimiento',
                              icon: <Eye size={15} />,
                              onClick: () => setDetailRow(row),
                              variant: 'default',
                            },
                            ...(row.id_item && !activeItemId
                              ? [
                                  {
                                    label: 'Filtrar Kardex de este Artículo',
                                    icon: <BookOpen size={15} />,
                                    onClick: () => setActiveItemId(row.id_item),
                                    variant: 'indigo' as const,
                                  },
                                ]
                              : []),
                            ...(onOpenAdjustment && row.item
                              ? [
                                  {
                                    label: 'Ajustar Stock de este Artículo',
                                    icon: <Wrench size={15} />,
                                    onClick: () =>
                                      onOpenAdjustment(row.item, row.id_location),
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

                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.badge}`}
                        >
                          {cfg.label}
                        </span>
                      </td>

                      {!activeItemId && (
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => row.id_item && setActiveItemId(row.id_item)}
                            className="text-left group/item"
                            title="Haga clic para ver el Kardex individual de este artículo"
                          >
                            <span className="font-semibold text-foreground group-hover/item:text-emerald-400 transition-colors block">
                              {row.item?.description ?? 'Artículo no especificado'}
                            </span>
                            <span className="text-[11px] text-muted-foreground font-mono">
                              {row.item?.code || row.item?.barcode || '—'}
                            </span>
                          </button>
                        </td>
                      )}

                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {row.location?.description ?? 'General'}
                      </td>

                      <td className="px-4 py-3 text-xs">
                        <div className="flex flex-col max-w-xs">
                          <span className="font-medium text-foreground truncate">
                            {row.concept || 'Movimiento de Almacén'}
                          </span>
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground/80 font-mono truncate">
                            {row.reference && <span>Ref: {row.reference}</span>}
                            {row.cleanComments && <span>· {row.cleanComments}</span>}
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">
                        {row.computedStockBefore}
                      </td>

                      <td className="px-4 py-3 text-right font-mono font-bold text-emerald-400">
                        {row.amount_enrty > 0 ? `+${row.amount_enrty}` : '—'}
                      </td>

                      <td className="px-4 py-3 text-right font-mono font-bold text-rose-400">
                        {row.amount_exit > 0 ? `-${row.amount_exit}` : '—'}
                      </td>

                      <td className="px-4 py-3 text-right font-mono">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-white/5 border border-border/40 font-bold text-foreground">
                          {row.computedStockAfter}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-right text-xs font-mono text-muted-foreground">
                        {formatCurrency(row.cost)}
                      </td>

                      <td className="px-4 py-3 text-right text-xs font-mono font-semibold text-emerald-400">
                        {formatCurrency(row.balanceValuation)}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={sortedRows.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          realtimeLabel="Kardex sincronizado en tiempo real"
        />
      </GlassCard>

      {/* Transaction Detail Modal */}
      <AnimatePresence>
        {detailRow && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card max-w-lg w-full p-6 space-y-4 border border-border/60 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-border/40 pb-3">
                <div>
                  <h3 className="text-base font-bold text-foreground">
                    Detalle de Registro en Kardex
                  </h3>
                  <p className="text-xs text-muted-foreground font-mono">
                    ID: {detailRow.id_transaction.slice(0, 12).toUpperCase()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDetailRow(null)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-3 text-xs sm:text-sm">
                <div className="p-3 rounded-2xl glass border border-border/40">
                  <p className="text-xs text-muted-foreground">Artículo</p>
                  <p className="font-bold text-foreground text-base">
                    {detailRow.item?.description ?? 'Artículo'}
                  </p>
                  <p className="text-xs font-mono text-muted-foreground mt-0.5">
                    Código: {detailRow.item?.code || '—'} · CB: {detailRow.item?.barcode || '—'}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2.5 rounded-xl glass border border-border/40">
                    <p className="text-[11px] text-muted-foreground">Existencia Ant.</p>
                    <p className="text-base font-bold font-mono text-foreground">
                      {detailRow.computedStockBefore}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-xl glass border border-border/40">
                    <p className="text-[11px] text-muted-foreground">Movimiento</p>
                    <p
                      className={`text-base font-bold font-mono ${
                        detailRow.amount_enrty > 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {detailRow.amount_enrty > 0
                        ? `+${detailRow.amount_enrty}`
                        : `-${detailRow.amount_exit}`}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                    <p className="text-[11px] text-emerald-300">Saldo Final</p>
                    <p className="text-base font-bold font-mono text-emerald-400">
                      {detailRow.computedStockAfter}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5 text-xs">
                  <div className="p-2.5 rounded-xl glass border border-border/30">
                    <span className="text-muted-foreground block">Fecha y Hora:</span>
                    <strong className="text-foreground font-mono">
                      {formatDateTime(detailRow.date_transaction)}
                    </strong>
                  </div>
                  <div className="p-2.5 rounded-xl glass border border-border/30">
                    <span className="text-muted-foreground block">Ubicación:</span>
                    <strong className="text-foreground">
                      {detailRow.location?.description ?? 'General'}
                    </strong>
                  </div>
                  <div className="p-2.5 rounded-xl glass border border-border/30">
                    <span className="text-muted-foreground block">Concepto / Motivo:</span>
                    <strong className="text-foreground">{detailRow.concept || '—'}</strong>
                  </div>
                  <div className="p-2.5 rounded-xl glass border border-border/30">
                    <span className="text-muted-foreground block">Referencia / Folio:</span>
                    <strong className="text-foreground font-mono">
                      {detailRow.reference || '—'}
                    </strong>
                  </div>
                  <div className="p-2.5 rounded-xl glass border border-border/30">
                    <span className="text-muted-foreground block">Costo Unitario:</span>
                    <strong className="text-foreground font-mono">
                      {formatCurrency(detailRow.cost)}
                    </strong>
                  </div>
                  <div className="p-2.5 rounded-xl glass border border-border/30">
                    <span className="text-muted-foreground block">Saldo Valorizado:</span>
                    <strong className="text-emerald-400 font-mono">
                      {formatCurrency(detailRow.balanceValuation)}
                    </strong>
                  </div>
                </div>

                {detailRow.cleanComments && (
                  <div className="p-3 rounded-xl glass border border-border/30 text-xs">
                    <span className="text-muted-foreground block mb-0.5">Observaciones:</span>
                    <p className="text-foreground">{detailRow.cleanComments}</p>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <GlassButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setDetailRow(null)}
                >
                  Cerrar
                </GlassButton>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

interface KardexModalProps {
  open: boolean
  onClose: () => void
  itemId: string | null
  locationId?: string
  onOpenAdjustment?: (item?: Item | null, locationId?: string | null) => void
}

export function KardexModal({
  open,
  onClose,
  itemId,
  locationId = 'all',
  onOpenAdjustment,
}: KardexModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/65 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            className="glass-card w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden p-0 border border-border/60 shadow-2xl"
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/40 bg-card/95 backdrop-blur-xl shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 flex items-center justify-center">
                  <BookOpen size={18} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-foreground">
                    Kardex Histórico y Trazabilidad de Inventario
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Control de entradas, salidas, existencias resultantes y valuación
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto scroll-modern p-4 flex flex-col min-h-0">
              <KardexView
                selectedItemId={itemId}
                initialLocationId={locationId}
                onOpenAdjustment={onOpenAdjustment}
                compact
              />
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
