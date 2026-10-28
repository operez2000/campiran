'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useStore } from '@/components/providers/store-provider'
import { GlassCard } from '@/components/glass-card'
import { GlassButton } from '@/components/glass-button'
import { GlassInput } from '@/components/glass-input'
import { InventarioTabs } from '@/components/inventario/inventario-tabs'
import { type Transaction, type MovimType, type Item } from '@/lib/types'
import { formatDateTime, formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  ArrowLeftRight,
  Search,
  RefreshCw,
  ArrowDownLeft,
  ArrowUpRight,
  ShoppingCart,
  ScanLine,
  Wrench,
  ShoppingBag,
  FileText,
  ArrowRight,
  Boxes,
  DollarSign,
} from 'lucide-react'
import { TableColumnHeader, TablePagination } from '@/components/tables'

const MOVIM_CONFIG: Record<
  MovimType,
  { label: string; icon: typeof ArrowDownLeft; color: string; badge: string }
> = {
  E: { label: 'Entrada', icon: ArrowDownLeft, color: 'text-emerald-400', badge: 'badge-active' },
  S: { label: 'Salida', icon: ArrowUpRight, color: 'text-rose-400', badge: 'badge-error' },
  V: { label: 'Venta', icon: ShoppingCart, color: 'text-indigo-400', badge: 'badge-info' },
  I: { label: 'Inventario', icon: ScanLine, color: 'text-teal-400', badge: 'badge-active' },
  A: { label: 'Ajuste', icon: Wrench, color: 'text-amber-400', badge: 'badge-warning' },
  T: { label: 'Traspaso', icon: ArrowLeftRight, color: 'text-violet-400', badge: 'badge-info' },
}

interface HydratedKardexTx extends Transaction {
  kardex_before: number | null
  kardex_after: number | null
  clean_comments: string | null
}

function parseKardexFromTransaction(tx: Transaction): {
  before: number | null
  after: number | null
  cleanComments: string | null
} {
  let before: number | null =
    typeof tx.stock_before === 'number' ? tx.stock_before : null
  let after: number | null =
    typeof tx.stock_after === 'number' ? tx.stock_after : null
  let cleanComments = tx.comments ?? null

  if (cleanComments) {
    const matchSaldo = cleanComments.match(/\[Saldo:\s*(-?\d+)\s*→\s*(-?\d+)\]/)
    const matchKardex = cleanComments.match(/KARDEX\[(-?\d+)->(-?\d+)\]/)
    const match = matchSaldo || matchKardex
    if (match) {
      if (before === null) before = Number(match[1])
      if (after === null) after = Number(match[2])
      cleanComments = cleanComments
        .replace(/\[Saldo:\s*(-?\d+)\s*→\s*(-?\d+)\]\s*\|\s*/, '')
        .replace(/\[Saldo:\s*(-?\d+)\s*→\s*(-?\d+)\]/, '')
        .replace(/KARDEX\[(-?\d+)->(-?\d+)\]\s*\|\s*/, '')
        .replace(/KARDEX\[(-?\d+)->(-?\d+)\]/, '')
        .trim() || null
    }
  }

  return { before, after, cleanComments }
}

export function MovimientosClient() {
  const supabase = createClient()
  const { currentStore, storeId } = useStore()

  const [transactions, setTransactions] = useState<HydratedKardexTx[]>([])
  const [catalogItems, setCatalogItems] = useState<Item[]>([])
  const [currentStockByItem, setCurrentStockByItem] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('ALL')
  const [selectedItemId, setSelectedItemId] = useState<string>('ALL')

  const fetchTransactions = useCallback(async () => {
    if (!storeId) {
      setTransactions([])
      setLoading(false)
      return
    }

    setLoading(true)

    const [txRes, allItemsRes, stocksRes] = await Promise.all([
      supabase
        .from('transactions')
        .select('*')
        .eq('id_store', storeId)
        .order('date_transaction', { ascending: false })
        .limit(300),
      supabase
        .from('items')
        .select('id_item, code, barcode, description, unit, cost, last_cost, price1, status')
        .eq('status', 'A')
        .order('description', { ascending: true }),
      supabase
        .from('stocks')
        .select('id_item, current')
        .eq('id_store', storeId),
    ])

    if (txRes.error) {
      console.error('Error al cargar movimientos:', txRes.error)
      toast.error('Error al cargar movimientos: ' + txRes.error.message)
      setTransactions([])
      setLoading(false)
      return
    }

    const itemsList = (allItemsRes.data ?? []) as unknown as Item[]
    setCatalogItems(itemsList)
    const itemsMap = new Map(itemsList.map((it) => [it.id_item, it]))

    const stockMap = new Map<string, number>()
    for (const s of stocksRes.data ?? []) {
      if (s.id_item) {
        stockMap.set(s.id_item, (stockMap.get(s.id_item) ?? 0) + Number(s.current ?? 0))
      }
    }
    setCurrentStockByItem(stockMap)

    const txList = (txRes.data ?? []) as Transaction[]
    if (txList.length === 0) {
      setTransactions([])
      setLoading(false)
      return
    }

    const locationIds = Array.from(
      new Set(txList.map((t) => t.id_location).filter((id): id is string => Boolean(id)))
    )

    const locsRes =
      locationIds.length > 0
        ? await supabase
            .from('locations')
            .select('id_location, description')
            .in('id_location', locationIds)
        : { data: [] }

    const locsMap = new Map((locsRes.data ?? []).map((loc) => [loc.id_location, loc]))

    // Calcular saldo retroactivo por artículo para movimientos antiguos que no tenían KARDEX[before->after]
    const runningBalanceByItem = new Map<string, number>(stockMap)

    const hydratedTransactions: HydratedKardexTx[] = txList.map((t) => {
      const parsed = parseKardexFromTransaction(t)
      let kBefore = parsed.before
      let kAfter = parsed.after

      if (t.id_item) {
        const knownRunning = runningBalanceByItem.get(t.id_item)
        const netDelta = Number(t.amount_enrty || 0) - Number(t.amount_exit || 0)

        if (kAfter === null && typeof knownRunning === 'number') {
          kAfter = knownRunning
        }
        if (kBefore === null && kAfter !== null) {
          kBefore = Math.max(0, kAfter - netDelta)
        }
        if (kBefore !== null) {
          runningBalanceByItem.set(t.id_item, kBefore)
        }
      }

      return {
        ...t,
        item: t.id_item ? itemsMap.get(t.id_item) : undefined,
        location: t.id_location ? (locsMap.get(t.id_location) as Transaction['location']) : undefined,
        kardex_before: kBefore,
        kardex_after: kAfter,
        clean_comments: parsed.cleanComments,
      }
    })

    setTransactions(hydratedTransactions)
    setLoading(false)
  }, [storeId, supabase])

  useEffect(() => {
    fetchTransactions()
  }, [fetchTransactions])

  // Realtime subscription on transactions & stocks
  useEffect(() => {
    if (!storeId) return

    const channel = supabase
      .channel(`transactions-live-${storeId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions', filter: `id_store=eq.${storeId}` },
        () => fetchTransactions()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stocks', filter: `id_store=eq.${storeId}` },
        () => fetchTransactions()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [storeId, supabase, fetchTransactions])

  // Filtered transactions
  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (selectedItemId !== 'ALL' && t.id_item !== selectedItemId) return false

      if (typeFilter === 'COMPRAS') {
        if (t.origin !== 'COMPRAS') return false
      } else if (typeFilter !== 'ALL' && t.movim_type !== typeFilter) {
        return false
      }

      if (search.trim()) {
        const q = search.toLowerCase()
        const desc = t.item?.description?.toLowerCase() ?? ''
        const code = t.item?.code?.toLowerCase() ?? ''
        const barcode = t.item?.barcode?.toLowerCase() ?? ''
        const ref = t.reference?.toLowerCase() ?? ''
        const concept = t.concept?.toLowerCase() ?? ''
        const comm = (t.clean_comments || '').toLowerCase()
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
  }, [transactions, typeFilter, selectedItemId, search])

  // Selected item summary for Kardex card
  const selectedItemObj = useMemo(
    () => (selectedItemId !== 'ALL' ? catalogItems.find((i) => i.id_item === selectedItemId) ?? null : null),
    [catalogItems, selectedItemId]
  )

  const kardexStats = useMemo(() => {
    let totalEntries = 0
    let totalExits = 0
    let totalPurchaseEntries = 0

    for (const t of filtered) {
      totalEntries += Number(t.amount_enrty || 0)
      totalExits += Number(t.amount_exit || 0)
      if (t.origin === 'COMPRAS' && t.movim_type === 'E') {
        totalPurchaseEntries += Number(t.amount_enrty || 0)
      }
    }

    return { totalEntries, totalExits, totalPurchaseEntries }
  }, [filtered])

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
  }, [search, typeFilter, selectedItemId])

  const sortedTransactions = useMemo(() => {
    const list = [...filtered]
    if (!sortKey) return list

    return list.sort((a, b) => {
      let aVal: string | number = ''
      let bVal: string | number = ''

      switch (sortKey) {
        case 'date_transaction':
          aVal = a.date_transaction || ''
          bVal = b.date_transaction || ''
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
        case 'kardex_before':
          aVal = Number(a.kardex_before ?? 0)
          bVal = Number(b.kardex_before ?? 0)
          break
        case 'entry':
          aVal = Number(a.amount_enrty || 0)
          bVal = Number(b.amount_enrty || 0)
          break
        case 'exit':
          aVal = Number(a.amount_exit || 0)
          bVal = Number(b.amount_exit || 0)
          break
        case 'kardex_after':
          aVal = Number(a.kardex_after ?? 0)
          bVal = Number(b.kardex_after ?? 0)
          break
        case 'cost':
          aVal = Number(a.cost || 0)
          bVal = Number(b.cost || 0)
          break
        case 'reference':
          aVal = `${a.concept || ''} ${a.reference || ''}`.toLowerCase()
          bVal = `${b.concept || ''} ${b.reference || ''}`.toLowerCase()
          break
        default:
          return 0
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
  }, [filtered, sortKey, sortDirection])

  const totalPages = Math.ceil(sortedTransactions.length / pageSize) || 1
  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedTransactions.slice(start, start + pageSize)
  }, [sortedTransactions, currentPage, pageSize])

  const handleExportKardexPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape' })
    const title = selectedItemObj
      ? `Kardex de Artículo: ${selectedItemObj.description}`
      : `Kardex General de Movimientos — ${currentStore?.description ?? 'Sucursal'}`

    doc.setFontSize(14)
    doc.text(title, 14, 16)
    doc.setFontSize(9)
    doc.text(
      `Sucursal: ${currentStore?.description ?? 'Activa'} | Generado: ${formatDateTime(
        new Date().toISOString()
      )}`,
      14,
      22
    )

    autoTable(doc, {
      startY: 28,
      head: [
        [
          'Fecha y Hora',
          'Tipo / Origen',
          'Artículo',
          'Ubicación',
          'Exist. Ant.',
          'Entrada (+)',
          'Salida (-)',
          'Saldo Final',
          'Costo Unit.',
          'Referencia / Concepto',
        ],
      ],
      body: sortedTransactions.map((t) => [
        formatDateTime(t.date_transaction),
        t.origin === 'COMPRAS'
          ? 'Compra'
          : MOVIM_CONFIG[t.movim_type as MovimType]?.label ?? t.movim_type ?? 'N/A',
        t.item?.description ?? 'Artículo',
        t.location?.description ?? 'General',
        t.kardex_before !== null ? String(t.kardex_before) : '—',
        t.amount_enrty > 0 ? `+${t.amount_enrty}` : '—',
        t.amount_exit > 0 ? `-${t.amount_exit}` : '—',
        t.kardex_after !== null ? String(t.kardex_after) : '—',
        formatCurrency(Number(t.cost || 0)),
        `${t.concept || ''} ${t.reference ? `(${t.reference})` : ''}`,
      ]),
      styles: { fontSize: 7.5 },
      headStyles: { fillColor: [16, 185, 129] },
    })

    doc.save(`Kardex_${new Date().toISOString().slice(0, 10)}.pdf`)
    toast.success('Kardex exportado en PDF')
  }

  return (
    <div className="min-h-full sm:h-full flex-1 flex flex-col min-h-0 gap-2.5 sm:gap-3 pb-8 sm:pb-0">
      <div className="dashboard-bg" />

      {/* Header and Sub-Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shrink-0">
        <div>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-foreground flex items-center gap-2 leading-tight">
            <ArrowLeftRight className="text-emerald-500" size={20} />
            Movimientos y Kardex de Inventario
          </h1>
          <p className="text-xs text-muted-foreground line-clamp-1">
            Trazabilidad en tiempo real de compras, ventas, ajustes y saldos resultantes para{' '}
            <span className="font-semibold text-emerald-500">
              {currentStore?.description ?? 'sucursal activa'}
            </span>
          </p>
        </div>
        <InventarioTabs />
      </div>

      {/* Selected Item Kardex Summary Banner (or Store Kardex KPIs) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 shrink-0">
        <GlassCard variant="emerald" padding="sm" className="flex items-center justify-between">
          <div>
            <p className="text-[11px] text-muted-foreground">Total Entradas (+)</p>
            <p className="text-base sm:text-lg font-bold font-mono text-emerald-400">
              +{kardexStats.totalEntries} uds
            </p>
            <p className="text-[10px] text-muted-foreground">
              Por Compras: +{kardexStats.totalPurchaseEntries} uds
            </p>
          </div>
          <ArrowDownLeft size={18} className="text-emerald-400" />
        </GlassCard>

        <GlassCard variant="rose" padding="sm" className="flex items-center justify-between">
          <div>
            <p className="text-[11px] text-muted-foreground">Total Salidas (-)</p>
            <p className="text-base sm:text-lg font-bold font-mono text-rose-400">
              -{kardexStats.totalExits} uds
            </p>
            <p className="text-[10px] text-muted-foreground">Ventas, ajustes y devoluciones</p>
          </div>
          <ArrowUpRight size={18} className="text-rose-400" />
        </GlassCard>

        <GlassCard variant="indigo" padding="sm" className="flex items-center justify-between">
          <div>
            <p className="text-[11px] text-muted-foreground">
              {selectedItemObj ? 'Existencia Actual Artículo' : 'Movimientos en Kardex'}
            </p>
            <p className="text-base sm:text-lg font-bold font-mono text-foreground">
              {selectedItemObj
                ? `${currentStockByItem.get(selectedItemObj.id_item) ?? 0} ${
                    selectedItemObj.unit || 'uds'
                  }`
                : `${filtered.length} registros`}
            </p>
            <p className="text-[10px] text-indigo-400 truncate max-w-[180px]">
              {selectedItemObj ? selectedItemObj.description : 'Todos los artículos'}
            </p>
          </div>
          <Boxes size={18} className="text-indigo-400" />
        </GlassCard>

        <GlassCard variant="amber" padding="sm" className="flex items-center justify-between">
          <div>
            <p className="text-[11px] text-muted-foreground">
              {selectedItemObj ? 'Costo Actual / Anterior' : 'Valuación Unitaria'}
            </p>
            <p className="text-base sm:text-lg font-bold font-mono text-amber-400">
              {selectedItemObj
                ? formatCurrency(Number(selectedItemObj.cost || 0))
                : formatCurrency(
                    filtered.length > 0 ? Number(filtered[0].cost || 0) : 0
                  )}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {selectedItemObj
                ? `Costo ant: ${formatCurrency(Number(selectedItemObj.last_cost || 0))}`
                : 'Último movimiento registrado'}
            </p>
          </div>
          <DollarSign size={18} className="text-amber-400" />
        </GlassCard>
      </div>

      {/* Filters Bar */}
      <GlassCard padding="none" className="p-2 shrink-0">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-2">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1">
            <div className="flex-1 max-w-sm">
              <GlassInput
                placeholder="Buscar por artículo, factura, referencia o concepto..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                icon={<Search size={15} />}
              />
            </div>

            {/* Selector de Artículo para ver su Kardex individual */}
            <select
              value={selectedItemId}
              onChange={(e) => setSelectedItemId(e.target.value)}
              className="px-3 py-2 rounded-xl glass-input text-xs text-foreground bg-card/80 border border-border/50 max-w-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            >
              <option value="ALL">— Kardex de Todos los Artículos —</option>
              {catalogItems.map((it) => (
                <option key={it.id_item} value={it.id_item}>
                  {it.code ? `[${it.code}] ` : ''}
                  {it.description}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-0.5 rounded-xl glass border border-border/40">
              <button
                onClick={() => setTypeFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  typeFilter === 'ALL'
                    ? 'bg-emerald-500 text-white shadow-sm font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Todos
              </button>
              <button
                onClick={() => setTypeFilter('COMPRAS')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1 ${
                  typeFilter === 'COMPRAS'
                    ? 'bg-emerald-500 text-white shadow-sm font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <ShoppingBag size={12} />
                Compras
              </button>
              {(Object.keys(MOVIM_CONFIG) as MovimType[]).map((type) => {
                const config = MOVIM_CONFIG[type]
                return (
                  <button
                    key={type}
                    onClick={() => setTypeFilter(type)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                      typeFilter === type
                        ? 'bg-emerald-500 text-white shadow-sm font-semibold'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {config.label}
                  </button>
                )
              })}
            </div>

            <GlassButton
              variant="ghost"
              size="sm"
              onClick={handleExportKardexPdf}
              className="h-8 px-2.5 text-xs"
              title="Descargar Kardex en PDF"
            >
              <FileText size={14} className="mr-1 text-rose-400" />
              PDF
            </GlassButton>

            <GlassButton
              variant="ghost"
              size="sm"
              onClick={fetchTransactions}
              disabled={loading}
              title="Recargar movimientos"
              className="h-8 px-2.5"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin text-emerald-400' : ''} />
            </GlassButton>
          </div>
        </div>
      </GlassCard>

      {/* Transactions / Kardex Table */}
      <GlassCard padding="none" className="overflow-hidden shadow-xl flex-1 min-h-[460px] sm:min-h-0 flex flex-col">
        <div className="overflow-x-auto overflow-y-auto flex-1 min-h-[360px] sm:min-h-0 scroll-modern">
          <table className="w-full min-w-[850px] sm:min-w-full text-left text-sm border-separate border-spacing-0">
            <thead className="sticky top-0 z-20">
              <tr className="glass-table-header border-b border-border/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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
                  title="Exist. Ant."
                  sortKey="kardex_before"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  align="right"
                />
                <TableColumnHeader
                  title="Entrada (+)"
                  sortKey="entry"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  align="right"
                />
                <TableColumnHeader
                  title="Salida (-)"
                  sortKey="exit"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  align="right"
                />
                <TableColumnHeader
                  title="Saldo Kardex"
                  sortKey="kardex_after"
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
                  title="Referencia / Concepto"
                  sortKey="reference"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {loading && transactions.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">
                    <RefreshCw size={24} className="animate-spin text-emerald-500 mx-auto mb-2" />
                    Cargando Kardex de movimientos...
                  </td>
                </tr>
              ) : paginatedTransactions.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">
                    <p className="text-base font-medium">No se encontraron movimientos en el Kardex</p>
                    <p className="text-xs text-muted-foreground/80 mt-1">
                      No hay registros para los filtros seleccionados
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedTransactions.map((t) => {
                  const mType = t.movim_type as MovimType
                  const isPurchase = t.origin === 'COMPRAS'
                  const config = MOVIM_CONFIG[mType] ?? {
                    label: t.movim_type ?? 'N/A',
                    color: 'text-muted-foreground',
                    badge: 'badge-info',
                  }

                  return (
                    <tr key={t.id_transaction} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                        {formatDateTime(t.date_transaction)}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex flex-col items-start gap-0.5">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.badge}`}
                          >
                            {isPurchase && mType === 'E' ? 'Compra (Entrada)' : config.label}
                          </span>
                          {t.origin && (
                            <span className="text-[10px] font-mono text-muted-foreground">
                              Origen: {t.origin}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() =>
                            t.id_item &&
                            setSelectedItemId((prev) =>
                              prev === t.id_item ? 'ALL' : t.id_item!
                            )
                          }
                          className="flex flex-col text-left group"
                          title="Clic para filtrar el Kardex de este artículo"
                        >
                          <span className="font-semibold text-foreground group-hover:text-emerald-400 transition-colors text-xs sm:text-sm">
                            {t.item?.description ?? 'Artículo no especificado'}
                          </span>
                          <span className="text-[11px] text-muted-foreground font-mono">
                            {t.item?.code || t.item?.barcode || '—'}
                          </span>
                        </button>
                      </td>

                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {t.location?.description ?? 'General'}
                      </td>

                      <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">
                        {t.kardex_before !== null ? t.kardex_before : '—'}
                      </td>

                      <td className="px-4 py-3 text-right font-mono font-bold text-emerald-400">
                        {t.amount_enrty > 0 ? `+${t.amount_enrty}` : '—'}
                      </td>

                      <td className="px-4 py-3 text-right font-mono font-bold text-rose-400">
                        {t.amount_exit > 0 ? `-${t.amount_exit}` : '—'}
                      </td>

                      <td className="px-4 py-3 text-right font-mono text-xs">
                        {t.kardex_after !== null ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/[0.04] border border-border/40 font-bold text-foreground">
                            {t.kardex_before !== null && (
                              <>
                                <span className="text-muted-foreground font-normal">
                                  {t.kardex_before}
                                </span>
                                <ArrowRight size={10} className="text-emerald-400" />
                              </>
                            )}
                            <span>{t.kardex_after}</span>
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>

                      <td className="px-4 py-3 text-right text-xs font-mono text-muted-foreground">
                        {formatCurrency(t.cost)}
                      </td>

                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">
                            {t.concept || 'Movimiento de Almacén'}
                          </span>
                          {t.reference && (
                            <span className="text-[11px] text-emerald-400/90 font-mono">
                              Ref: {t.reference}
                            </span>
                          )}
                          {t.clean_comments && (
                            <span className="text-[10px] text-muted-foreground/80">
                              {t.clean_comments}
                            </span>
                          )}
                        </div>
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
          totalItems={sortedTransactions.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          realtimeLabel="Kardex sincronizado en tiempo real"
        />
      </GlassCard>
    </div>
  )
}
