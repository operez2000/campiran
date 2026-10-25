'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import * as XLSX from 'xlsx'
import {
  ClipboardCheck,
  Search,
  Filter,
  MapPin,
  RefreshCw,
  FileSpreadsheet,
  RotateCcw,
  AlertTriangle,
  ScanLine,
  TrendingDown,
  TrendingUp,
  CheckCircle2,
  X,
  BookOpen,
  Wrench,
  Layers,
  ArrowRight
} from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/utils/supabase/client'
import { useStore } from '@/components/providers/store-provider'
import { GlassCard } from '@/components/glass-card'
import { GlassButton } from '@/components/glass-button'
import { GlassInput } from '@/components/glass-input'
import { InventarioTabs } from '@/components/inventario/inventario-tabs'
import { TableActionMenu, TableColumnHeader, TablePagination } from '@/components/tables'
import { AjusteInventarioModal } from '@/components/inventario/ajuste-modal'
import { KardexModal } from '@/components/inventario/kardex-view'
import { resetStoreInventoryAction } from '../fisico/actions'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { type Stock, type Location, type Item, type Profile } from '@/lib/types'

type DiffFilter = 'all' | 'diff' | 'missing' | 'surplus' | 'exact' | 'zero'

export interface InventoryItemRow {
  key: string
  item: Item
  stock?: Stock
  locationId?: string
  locationName: string
  preInventoryStock: number
  currentStock: number
  diff: number
  cost: number
  preVal: number
  currentVal: number
  diffVal: number
  statusType: 'faltante' | 'sobrante' | 'exacto' | 'sin_conteo' | 'sin_movimiento'
}

export function ConsultaInventarioClient() {
  const supabase = createClient()
  const { currentStore, storeId } = useStore()

  const [currentUser, setCurrentUser] = useState<Profile | null>(null)
  const [locations, setLocations] = useState<Location[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [stocks, setStocks] = useState<Stock[]>([])
  const [loading, setLoading] = useState(true)

  // Filters & Search
  const [search, setSearch] = useState('')
  const [selectedLocation, setSelectedLocation] = useState<string>('all')
  const [diffFilter, setDiffFilter] = useState<DiffFilter>('all')

  // Sorting
  const [sortKey, setSortKey] = useState<string>('diff')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  // Modals
  const [resetModalOpen, setResetModalOpen] = useState(false)
  const [resetConfirmText, setResetConfirmText] = useState('')
  const [isResetting, setIsResetting] = useState(false)

  // Kardex & Adjust modals
  const [kardexModalOpen, setKardexModalOpen] = useState(false)
  const [kardexItemId, setKardexItemId] = useState<string | null>(null)
  const [kardexLocationId, setKardexLocationId] = useState<string>('all')

  const [ajusteModalOpen, setAjusteModalOpen] = useState(false)
  const [ajusteItem, setAjusteItem] = useState<Item | null>(null)
  const [ajusteLocationId, setAjusteLocationId] = useState<string | null>(null)

  // 1. Load User Profile
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
      if (prof) {
        setCurrentUser(prof as Profile)
      } else {
        setCurrentUser({
          id: user.id,
          full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuario',
          email: user.email || null,
          role: 'ADMIN',
          status: 'active',
          phone: null,
          id_store: null,
          avatar_url: null,
          created_at: '',
          updated_at: '',
        })
      }
    })
  }, [supabase])

  // 2. Fetch Locations for Store
  const fetchLocations = useCallback(async () => {
    if (!storeId) return
    const { data } = await supabase
      .from('locations')
      .select('*')
      .eq('id_store', storeId)
      .eq('status', 'A')
      .order('description')
    if (data) setLocations(data as Location[])
  }, [storeId, supabase])

  // 3. Fetch Data (Catalog Items & Stocks)
  const fetchData = useCallback(async () => {
    if (!storeId) return
    setLoading(true)

    // Load active items
    const { data: itemsData } = await supabase
      .from('items')
      .select('*, category:categories(id_category, description)')
      .eq('status', 'A')
      .order('description')

    // Load stocks for current store
    const { data: stocksData } = await supabase
      .from('stocks')
      .select(`
        *,
        item:items(*, category:categories(id_category, description)),
        location:locations(*)
      `)
      .eq('id_store', storeId)

    if (itemsData) setItems(itemsData as Item[])
    if (stocksData) setStocks(stocksData as Stock[])

    setLoading(false)
  }, [storeId, supabase])

  useEffect(() => {
    fetchLocations()
    fetchData()
  }, [fetchLocations, fetchData])

  // 4. Realtime subscription on stocks table
  useEffect(() => {
    if (!storeId) return

    const channel = supabase
      .channel(`inventory-consulta-${storeId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stocks', filter: `id_store=eq.${storeId}` },
        () => {
          fetchData()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [storeId, supabase, fetchData])

  // Find latest reset date in stocks
  const latestResetDate = useMemo(() => {
    let latest: string | null = null
    for (const s of stocks) {
      if (s.last_inventory_reset_at) {
        if (!latest || new Date(s.last_inventory_reset_at) > new Date(latest)) {
          latest = s.last_inventory_reset_at
        }
      }
    }
    return latest
  }, [stocks])

  // 5. Construct Unified Rows: combine stocks and catalog items
  const unifiedRows = useMemo<InventoryItemRow[]>(() => {
    if (!items.length) return []

    // Map stocks by item and location
    const stocksByItem = new Map<string, Stock[]>()
    stocks.forEach((st) => {
      if (!st.id_item) return
      const arr = stocksByItem.get(st.id_item) || []
      arr.push(st)
      stocksByItem.set(st.id_item, arr)
    })

    const rows: InventoryItemRow[] = []

    items.forEach((item) => {
      const itemStocks = stocksByItem.get(item.id_item) || []

      if (itemStocks.length === 0) {
        // Item with no stock records in this store yet
        const cost = Number(item.cost ?? 0)
        rows.push({
          key: `item-${item.id_item}-nostock`,
          item,
          locationId: undefined,
          locationName: 'Sin asignar',
          preInventoryStock: 0,
          currentStock: 0,
          diff: 0,
          cost,
          preVal: 0,
          currentVal: 0,
          diffVal: 0,
          statusType: 'sin_movimiento',
        })
      } else {
        // One row per location where this item has stock record
        itemStocks.forEach((st) => {
          const pre = Number(st.pre_inventory_stock ?? 0)
          const curr = Number(st.current ?? 0)
          const diff = curr - pre
          const cost = Number(item.cost ?? 0)

          let statusType: InventoryItemRow['statusType'] = 'exacto'
          if (pre > 0 && curr === 0) {
            statusType = 'sin_conteo'
          } else if (diff < 0) {
            statusType = 'faltante'
          } else if (diff > 0) {
            statusType = 'sobrante'
          } else if (pre === 0 && curr === 0) {
            statusType = 'sin_movimiento'
          } else {
            statusType = 'exacto'
          }

          rows.push({
            key: `stock-${st.id_stock}`,
            item,
            stock: st,
            locationId: st.id_location ?? undefined,
            locationName: st.location?.description || 'General',
            preInventoryStock: pre,
            currentStock: curr,
            diff,
            cost,
            preVal: pre * cost,
            currentVal: curr * cost,
            diffVal: diff * cost,
            statusType,
          })
        })
      }
    })

    return rows
  }, [items, stocks])

  // 6. Summary KPIs across all rows
  const summary = useMemo(() => {
    let totalItems = unifiedRows.length
    let totalPreQty = 0
    let totalCurrentQty = 0
    let totalDiffQty = 0
    let totalPreVal = 0
    let totalCurrentVal = 0
    let totalDiffVal = 0

    let missingCount = 0
    let missingVal = 0
    let surplusCount = 0
    let surplusVal = 0
    let exactCount = 0
    let zeroCount = 0

    unifiedRows.forEach((r) => {
      totalPreQty += r.preInventoryStock
      totalCurrentQty += r.currentStock
      totalDiffQty += r.diff
      totalPreVal += r.preVal
      totalCurrentVal += r.currentVal
      totalDiffVal += r.diffVal

      if (r.statusType === 'sin_conteo') {
        zeroCount++
        missingCount++
        missingVal += Math.abs(r.diffVal)
      } else if (r.statusType === 'faltante') {
        missingCount++
        missingVal += Math.abs(r.diffVal)
      } else if (r.statusType === 'sobrante') {
        surplusCount++
        surplusVal += r.diffVal
      } else if (r.statusType === 'exacto') {
        exactCount++
      }
    })

    return {
      totalItems,
      totalPreQty,
      totalCurrentQty,
      totalDiffQty,
      totalPreVal,
      totalCurrentVal,
      totalDiffVal,
      missingCount,
      missingVal,
      surplusCount,
      surplusVal,
      exactCount,
      zeroCount,
    }
  }, [unifiedRows])

  // 7. Filtered rows
  const filteredRows = useMemo(() => {
    let result = unifiedRows

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase().trim()
      result = result.filter(
        (r) =>
          r.item.description?.toLowerCase().includes(q) ||
          r.item.code?.toLowerCase().includes(q) ||
          r.item.barcode?.toLowerCase().includes(q) ||
          r.locationName.toLowerCase().includes(q)
      )
    }

    // Location filter
    if (selectedLocation !== 'all') {
      result = result.filter((r) => r.locationId === selectedLocation)
    }

    // Difference status filter
    if (diffFilter === 'diff') {
      result = result.filter((r) => r.diff !== 0)
    } else if (diffFilter === 'missing') {
      result = result.filter((r) => r.diff < 0)
    } else if (diffFilter === 'surplus') {
      result = result.filter((r) => r.diff > 0)
    } else if (diffFilter === 'exact') {
      result = result.filter((r) => r.statusType === 'exacto')
    } else if (diffFilter === 'zero') {
      result = result.filter((r) => r.statusType === 'sin_conteo')
    }

    return result
  }, [unifiedRows, search, selectedLocation, diffFilter])

  // 8. Sorting
  const sortedRows = useMemo(() => {
    const list = [...filteredRows]

    list.sort((a, b) => {
      let valA: unknown = ''
      let valB: unknown = ''

      switch (sortKey) {
        case 'code':
          valA = a.item.code || ''
          valB = b.item.code || ''
          break
        case 'barcode':
          valA = a.item.barcode || ''
          valB = b.item.barcode || ''
          break
        case 'description':
          valA = a.item.description || ''
          valB = b.item.description || ''
          break
        case 'location':
          valA = a.locationName || ''
          valB = b.locationName || ''
          break
        case 'pre':
          valA = a.preInventoryStock
          valB = b.preInventoryStock
          break
        case 'current':
          valA = a.currentStock
          valB = b.currentStock
          break
        case 'diff':
          valA = a.diff
          valB = b.diff
          break
        case 'cost':
          valA = a.cost
          valB = b.cost
          break
        case 'diffVal':
          valA = a.diffVal
          valB = b.diffVal
          break
        case 'status':
          valA = a.statusType
          valB = b.statusType
          break
        default:
          valA = a.diff
          valB = b.diff
      }

      if (typeof valA === 'string' && typeof valB === 'string') {
        const cmp = valA.localeCompare(valB)
        return sortDirection === 'asc' ? cmp : -cmp
      }

      const numA = Number(valA ?? 0)
      const numB = Number(valB ?? 0)
      return sortDirection === 'asc' ? numA - numB : numB - numA
    })

    return list
  }, [filteredRows, sortKey, sortDirection])

  // 9. Pagination
  const totalPages = Math.ceil(sortedRows.length / pageSize) || 1
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedRows.slice(start, start + pageSize)
  }, [sortedRows, currentPage, pageSize])

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDirection('asc')
    }
    setCurrentPage(1)
  }

  // 10. Handle Reset to Zero Action
  const handleConfirmResetToZero = async () => {
    if (!storeId) {
      toast.error('Selecciona una sucursal para operar')
      return
    }

    if (resetConfirmText.trim().toUpperCase() !== 'CONFIRMAR') {
      toast.error('Debes escribir la palabra "CONFIRMAR" para proceder')
      return
    }

    setIsResetting(true)
    try {
      const res = await resetStoreInventoryAction(storeId)
      if (res.success) {
        toast.success(res.message)
        setResetModalOpen(false)
        setResetConfirmText('')
        await fetchData()
      } else {
        toast.error(res.message)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al reiniciar existencias'
      toast.error(msg)
    } finally {
      setIsResetting(false)
    }
  }

  // 11. Handle Export to Excel
  const handleExportExcel = () => {
    if (sortedRows.length === 0) {
      toast.error('No hay datos disponibles para exportar')
      return
    }

    const storeName = currentStore?.description || 'Sucursal'
    const now = new Date()

    // 1. Prepare clean data rows
    const dataRows = sortedRows.map((r, index) => {
      let estatusLabel = 'Cuadrado'
      if (r.statusType === 'sin_conteo') estatusLabel = 'Sin Conteo (Faltante Total)'
      else if (r.statusType === 'faltante') estatusLabel = 'Faltante (-)'
      else if (r.statusType === 'sobrante') estatusLabel = 'Sobrante (+)'
      else if (r.statusType === 'sin_movimiento') estatusLabel = 'Sin Movimiento'

      return {
        '#': index + 1,
        'Código': r.item.code || '',
        'Código de Barras': r.item.barcode || '',
        'Descripción del Producto': r.item.description || '',
        'Categoría': r.item.category?.description || 'General',
        'Ubicación': r.locationName,
        'Existencia Previa': r.preInventoryStock,
        'Nueva Existencia Física': r.currentStock,
        'Diferencia (Uds)': r.diff,
        'Estatus': estatusLabel,
        'Costo Unitario': r.cost,
        'Valor Previo ($)': r.preVal,
        'Valor Físico Actual ($)': r.currentVal,
        'Impacto Financiero ($)': r.diffVal,
      }
    })

    // 2. Append Totals Row
    const totalsRow = {
      '#': '',
      'Código': '',
      'Código de Barras': '',
      'Descripción del Producto': 'TOTALES GENERALES',
      'Categoría': '',
      'Ubicación': '',
      'Existencia Previa': summary.totalPreQty,
      'Nueva Existencia Física': summary.totalCurrentQty,
      'Diferencia (Uds)': summary.totalDiffQty,
      'Estatus': summary.totalDiffQty === 0 ? 'Balance Cuadrado' : summary.totalDiffQty < 0 ? 'Faltante Neto' : 'Sobrante Neto',
      'Costo Unitario': '',
      'Valor Previo ($)': summary.totalPreVal,
      'Valor Físico Actual ($)': summary.totalCurrentVal,
      'Impacto Financiero ($)': summary.totalDiffVal,
    }

    const fullData = [...dataRows, totalsRow]

    // 3. Build Sheet and Workbook
    const ws = XLSX.utils.json_to_sheet(fullData)

    // Set column widths for comfortable viewing
    ws['!cols'] = [
      { wch: 6 },  // #
      { wch: 14 }, // Código
      { wch: 16 }, // Código de Barras
      { wch: 38 }, // Descripción
      { wch: 18 }, // Categoría
      { wch: 18 }, // Ubicación
      { wch: 16 }, // Previa
      { wch: 18 }, // Física
      { wch: 16 }, // Diferencia
      { wch: 22 }, // Estatus
      { wch: 14 }, // Costo
      { wch: 16 }, // Valor Previo
      { wch: 18 }, // Valor Actual
      { wch: 20 }, // Impacto
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Inventario_Fisico')

    const dateStr = now.toISOString().slice(0, 10)
    const fileName = `Inventario_Fisico_${storeName.replace(/\s+/g, '_')}_${dateStr}.xlsx`
    XLSX.writeFile(wb, fileName)

    toast.success(`Archivo Excel descargado: ${fileName}`)
  }

  const canResetStock = currentUser?.role === 'ADMIN' || currentUser?.role === 'MANAGER'

  return (
    <div className="h-full flex-1 flex flex-col min-h-0 gap-3 pb-6">
      <div className="dashboard-bg" />

      {/* Header & Tabs */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-foreground flex items-center gap-2 leading-tight">
            <ClipboardCheck className="text-emerald-500" size={22} />
            Consulta & Comparativa de Inventario Físico
          </h1>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
            <span>Sucursal: <strong className="text-foreground">{currentStore?.description ?? 'Sin sucursal'}</strong></span>
            {latestResetDate && (
              <>
                <span>•</span>
                <span className="text-emerald-400 font-medium">
                  Última puesta a ceros: {formatDateTime(latestResetDate)}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Action: Go to Scan capture */}
          <Link href="/inventario/fisico">
            <GlassButton variant="ghost" size="sm" className="text-xs">
              <ScanLine size={14} className="mr-1.5 text-emerald-400" />
              Captura (Escáner)
            </GlassButton>
          </Link>

          {/* Action: Reset to zero */}
          {canResetStock && (
            <GlassButton
              variant="danger"
              size="sm"
              onClick={() => {
                setResetConfirmText('')
                setResetModalOpen(true)
              }}
              className="text-xs"
              title="Poner existencias en cero y respaldar la existencia previa"
            >
              <RotateCcw size={14} className="mr-1.5" />
              Poner a Cero Existencias
            </GlassButton>
          )}

          {/* Action: Export Excel */}
          <GlassButton
            variant="primary"
            size="sm"
            onClick={handleExportExcel}
            disabled={sortedRows.length === 0}
            className="text-xs"
            title="Descargar comparativa completa en Excel"
          >
            <FileSpreadsheet size={14} className="mr-1.5" />
            Descargar Excel
          </GlassButton>
        </div>
      </div>

      {/* Module Navigation Tabs */}
      <InventarioTabs />

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 shrink-0">
        <GlassCard padding="sm" className="space-y-1">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span>Total Catálogo</span>
            <Layers size={14} className="text-indigo-400" />
          </div>
          <div className="text-base sm:text-lg font-bold text-foreground font-mono">
            {summary.totalItems}
          </div>
          <p className="text-[10px] text-muted-foreground">Artículos en la sucursal</p>
        </GlassCard>

        <GlassCard padding="sm" className="space-y-1">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span>Exist. Previa</span>
            <RotateCcw size={14} className="text-zinc-400" />
          </div>
          <div className="text-base sm:text-lg font-bold text-foreground font-mono">
            {summary.totalPreQty.toLocaleString()} uds
          </div>
          <p className="text-[10px] text-muted-foreground font-mono">
            {formatCurrency(summary.totalPreVal)}
          </p>
        </GlassCard>

        <GlassCard padding="sm" className="space-y-1">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span>Físico Contado</span>
            <CheckCircle2 size={14} className="text-emerald-400" />
          </div>
          <div className="text-base sm:text-lg font-bold text-emerald-400 font-mono">
            {summary.totalCurrentQty.toLocaleString()} uds
          </div>
          <p className="text-[10px] text-emerald-400/80 font-mono">
            {formatCurrency(summary.totalCurrentVal)}
          </p>
        </GlassCard>

        <GlassCard padding="sm" className="space-y-1">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span>Diferencia Neta</span>
            {summary.totalDiffQty >= 0 ? (
              <TrendingUp size={14} className="text-emerald-400" />
            ) : (
              <TrendingDown size={14} className="text-rose-400" />
            )}
          </div>
          <div
            className={`text-base sm:text-lg font-bold font-mono ${
              summary.totalDiffQty === 0
                ? 'text-muted-foreground'
                : summary.totalDiffQty > 0
                ? 'text-emerald-400'
                : 'text-rose-400'
            }`}
          >
            {summary.totalDiffQty > 0 ? `+${summary.totalDiffQty}` : summary.totalDiffQty} uds
          </div>
          <p
            className={`text-[10px] font-mono ${
              summary.totalDiffVal === 0
                ? 'text-muted-foreground'
                : summary.totalDiffVal > 0
                ? 'text-emerald-400'
                : 'text-rose-400'
            }`}
          >
            {summary.totalDiffVal > 0 ? `+${formatCurrency(summary.totalDiffVal)}` : formatCurrency(summary.totalDiffVal)}
          </p>
        </GlassCard>

        <GlassCard padding="sm" className="space-y-1">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span>Faltantes (-)</span>
            <AlertTriangle size={14} className="text-rose-400" />
          </div>
          <div className="text-base sm:text-lg font-bold text-rose-400 font-mono">
            {summary.missingCount} arts
          </div>
          <p className="text-[10px] text-rose-400/80 font-mono">
            -{formatCurrency(summary.missingVal)}
          </p>
        </GlassCard>

        <GlassCard padding="sm" className="space-y-1">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span>Sobrantes (+)</span>
            <TrendingUp size={14} className="text-amber-400" />
          </div>
          <div className="text-base sm:text-lg font-bold text-amber-400 font-mono">
            {summary.surplusCount} arts
          </div>
          <p className="text-[10px] text-amber-400/80 font-mono">
            +{formatCurrency(summary.surplusVal)}
          </p>
        </GlassCard>
      </div>

      {/* Filters Toolbar */}
      <GlassCard padding="sm" className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 shrink-0">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
          {/* Search Bar */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <GlassInput
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setCurrentPage(1)
              }}
              placeholder="Buscar por código, CB o descripción..."
              className="pl-9 pr-3 py-1.5 text-xs h-9 w-full"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Location Select */}
          <div className="flex items-center gap-1.5 bg-black/20 dark:bg-white/[0.04] border border-border/40 rounded-xl px-2.5 py-1 text-xs">
            <MapPin size={13} className="text-emerald-400 shrink-0" />
            <select
              value={selectedLocation}
              onChange={(e) => {
                setSelectedLocation(e.target.value)
                setCurrentPage(1)
              }}
              className="bg-transparent border-none text-foreground text-xs font-medium focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-zinc-900 text-white">Todas las ubicaciones</option>
              {locations.map((loc) => (
                <option key={loc.id_location} value={loc.id_location} className="bg-zinc-900 text-white">
                  {loc.description}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Quick Filter Pills */}
        <div className="flex items-center gap-1 overflow-x-auto scroll-modern py-0.5 text-xs">
          <Filter size={13} className="text-muted-foreground mr-1 shrink-0" />
          {[
            { id: 'all', label: 'Todos' },
            { id: 'diff', label: 'Con Diferencias' },
            { id: 'missing', label: 'Faltantes (-)' },
            { id: 'surplus', label: 'Sobrantes (+)' },
            { id: 'zero', label: 'Sin Conteo (0)' },
            { id: 'exact', label: 'Cuadrados (=)' },
          ].map((pill) => (
            <button
              key={pill.id}
              type="button"
              onClick={() => {
                setDiffFilter(pill.id as DiffFilter)
                setCurrentPage(1)
              }}
              className={`px-2.5 py-1 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${
                diffFilter === pill.id
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/5 border border-transparent'
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </GlassCard>

      {/* Main Table */}
      <GlassCard padding="none" className="overflow-hidden shadow-xl flex-1 min-h-0 flex flex-col">
        <div className="scrollable-table scroll-modern flex-1 overflow-auto">
          <table className="w-full text-left text-sm border-separate border-spacing-0">
            <thead className="sticky top-0 z-20">
              <tr className="glass-table-header border-b border-border/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="w-12 px-3 py-3.5 text-center sticky top-0 z-20 bg-white dark:bg-card">
                  Acc.
                </th>
                <TableColumnHeader
                  title="Código"
                  sortKey="code"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  className="w-24"
                />
                <TableColumnHeader
                  title="Código de Barras"
                  sortKey="barcode"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  className="w-32"
                />
                <TableColumnHeader
                  title="Artículo / Descripción"
                  sortKey="description"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  className="min-w-[200px]"
                />
                <TableColumnHeader
                  title="Ubicación"
                  sortKey="location"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  className="w-28"
                />
                <TableColumnHeader
                  title="Exist. Previa"
                  sortKey="pre"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  align="right"
                  className="w-24"
                />
                <TableColumnHeader
                  title="Exist. Física"
                  sortKey="current"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  align="right"
                  className="w-24"
                />
                <TableColumnHeader
                  title="Diferencia"
                  sortKey="diff"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  align="right"
                  className="w-24"
                />
                <TableColumnHeader
                  title="Estatus"
                  sortKey="status"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  align="center"
                  className="w-28"
                />
                <TableColumnHeader
                  title="Costo"
                  sortKey="cost"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  align="right"
                  className="w-24"
                />
                <TableColumnHeader
                  title="Impacto Financiero"
                  sortKey="diffVal"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  align="right"
                  className="w-32"
                />
              </tr>
            </thead>

            <tbody className="divide-y divide-border/20 text-xs">
              {loading && items.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-16 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw size={24} className="animate-spin text-emerald-500" />
                      <p>Cargando información de inventario...</p>
                    </div>
                  </td>
                </tr>
              ) : paginatedRows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-16 text-center text-muted-foreground">
                    <p className="font-medium text-foreground">No se encontraron artículos</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {search ? 'Intenta modificar el término de búsqueda o filtros.' : 'No hay mercancía registrada en esta sucursal.'}
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedRows.map((r) => {
                  const isNegative = r.diff < 0
                  const isPositive = r.diff > 0
                  const isZeroMissing = r.statusType === 'sin_conteo'

                  return (
                    <tr
                      key={r.key}
                      className="hover:bg-white/[0.03] transition-colors group"
                    >
                      {/* Action Menu */}
                      <td className="px-2 py-2.5 text-center">
                        <TableActionMenu
                          triggerAriaLabel={`Acciones para ${r.item.description}`}
                          items={[
                            {
                              label: 'Consultar Kardex',
                              icon: <BookOpen size={15} />,
                              onClick: () => {
                                setKardexItemId(r.item.id_item)
                                setKardexLocationId(r.locationId || 'all')
                                setKardexModalOpen(true)
                              },
                              variant: 'indigo',
                            },
                            {
                              label: 'Ajustar Existencia',
                              icon: <Wrench size={15} />,
                              onClick: () => {
                                setAjusteItem(r.item)
                                setAjusteLocationId(r.locationId || null)
                                setAjusteModalOpen(true)
                              },
                              variant: 'warning',
                            },
                            {
                              label: 'Ir a Captura (Físico)',
                              icon: <ScanLine size={15} />,
                              onClick: () => {
                                window.location.href = '/inventario/fisico'
                              },
                              variant: 'primary',
                              separatorBefore: true,
                            },
                          ]}
                        />
                      </td>

                      {/* Code */}
                      <td className="px-3 py-2.5 font-mono text-muted-foreground font-semibold">
                        {r.item.code || '—'}
                      </td>

                      {/* Barcode */}
                      <td className="px-3 py-2.5 font-mono text-muted-foreground">
                        {r.item.barcode || '—'}
                      </td>

                      {/* Description */}
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-foreground group-hover:text-emerald-400 transition-colors">
                          {r.item.description}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {r.item.category?.description || 'Sin categoría'} {r.item.unit ? `• ${r.item.unit}` : ''}
                        </div>
                      </td>

                      {/* Location */}
                      <td className="px-3 py-2.5 text-muted-foreground">
                        <span className="inline-flex items-center gap-1 text-[11px]">
                          <MapPin size={11} className="text-muted-foreground/60 shrink-0" />
                          <span className="truncate max-w-[110px]">{r.locationName}</span>
                        </span>
                      </td>

                      {/* Pre Inventory Stock */}
                      <td className="px-3 py-2.5 text-right font-mono font-medium text-muted-foreground">
                        {r.preInventoryStock}
                      </td>

                      {/* Current Stock (Physical) */}
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-foreground">
                        {r.currentStock}
                      </td>

                      {/* Difference */}
                      <td className="px-3 py-2.5 text-right font-mono font-bold">
                        <span
                          className={`px-2 py-0.5 rounded-lg text-xs inline-block ${
                            isNegative
                              ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                              : isPositive
                              ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                              : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          }`}
                        >
                          {isPositive ? `+${r.diff}` : r.diff}
                        </span>
                      </td>

                      {/* Status Badge */}
                      <td className="px-3 py-2.5 text-center">
                        {isZeroMissing ? (
                          <span className="px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                            Sin Conteo
                          </span>
                        ) : isNegative ? (
                          <span className="px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                            Faltante
                          </span>
                        ) : isPositive ? (
                          <span className="px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                            Sobrante
                          </span>
                        ) : r.statusType === 'sin_movimiento' ? (
                          <span className="px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-zinc-500/15 text-zinc-400 border border-zinc-500/30">
                            Sin Existencia
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            Cuadrado
                          </span>
                        )}
                      </td>

                      {/* Cost */}
                      <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">
                        {formatCurrency(r.cost)}
                      </td>

                      {/* Financial Impact */}
                      <td className="px-3 py-2.5 text-right font-mono font-semibold">
                        <span
                          className={
                            r.diffVal < 0
                              ? 'text-rose-400'
                              : r.diffVal > 0
                              ? 'text-amber-400'
                              : 'text-muted-foreground'
                          }
                        >
                          {r.diffVal > 0 ? `+${formatCurrency(r.diffVal)}` : formatCurrency(r.diffVal)}
                        </span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Pagination */}
        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={sortedRows.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          realtimeLabel="Sincronización en tiempo real activa con escáner"
        />
      </GlassCard>

      {/* ── MODAL: CONFIRM RESET STOCK TO ZERO ─────────────────────────── */}
      <AnimatePresence>
        {resetModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card max-w-lg w-full p-6 space-y-4 border-rose-500/40 shadow-2xl"
            >
              <div className="flex items-center gap-3 border-b border-border/40 pb-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                  <AlertTriangle size={22} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">
                    Poner Existencias a Cero
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Sucursal: <strong className="text-foreground">{currentStore?.description}</strong>
                  </p>
                </div>
              </div>

              <div className="space-y-3 text-xs text-foreground/90 leading-relaxed">
                <p className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300">
                  ⚠️ <strong>Acción crítica para Inventario Físico:</strong>
                  <br />
                  1. La existencia actual de <strong>todos los artículos</strong> en esta sucursal será respaldada en el campo <code>Existencia Previa</code>.
                  <br />
                  2. La existencia actual (<code>stocks.current</code>) quedará en <strong>0</strong> para iniciar el conteo físico con escáner.
                  <br />
                  3. Las diferencias se calcularán contra la existencia previa a medida que vayas escaneando.
                </p>

                <p className="text-muted-foreground">
                  Para confirmar que deseas continuar con el reinicio de existencias de esta sucursal, escribe la palabra <strong className="text-foreground font-mono">CONFIRMAR</strong> a continuación:
                </p>

                <GlassInput
                  value={resetConfirmText}
                  onChange={(e) => setResetConfirmText(e.target.value)}
                  placeholder="Escribe CONFIRMAR aquí..."
                  className="w-full font-mono text-center uppercase tracking-widest text-sm"
                  autoFocus
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
                <GlassButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setResetModalOpen(false)
                    setResetConfirmText('')
                  }}
                  disabled={isResetting}
                >
                  Cancelar
                </GlassButton>
                <GlassButton
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={handleConfirmResetToZero}
                  disabled={resetConfirmText.trim().toUpperCase() !== 'CONFIRMAR' || isResetting}
                >
                  {isResetting ? (
                    <span className="flex items-center gap-1.5">
                      <RefreshCw size={14} className="animate-spin" />
                      Procesando...
                    </span>
                  ) : (
                    'Confirmar y Dejar en Cero'
                  )}
                </GlassButton>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: Kardex */}
      {kardexModalOpen && kardexItemId && (
        <KardexModal
          open={kardexModalOpen}
          onClose={() => {
            setKardexModalOpen(false)
            setKardexItemId(null)
          }}
          itemId={kardexItemId}
          locationId={kardexLocationId}
        />
      )}

      {/* Modal: Ajuste de Inventario */}
      {ajusteModalOpen && ajusteItem && (
        <AjusteInventarioModal
          open={ajusteModalOpen}
          onClose={() => {
            setAjusteModalOpen(false)
            setAjusteItem(null)
            setAjusteLocationId(null)
          }}
          preselectedItem={ajusteItem}
          preselectedLocationId={ajusteLocationId}
          onSuccess={() => {
            fetchData()
          }}
        />
      )}
    </div>
  )
}
