'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/utils/supabase/client'
import { useStore } from '@/components/providers/store-provider'
import { GlassCard } from '@/components/glass-card'
import { GlassButton } from '@/components/glass-button'
import { GlassInput } from '@/components/glass-input'
import { StatusBadge } from '@/components/status-badge'
import { InventarioTabs } from '@/components/inventario/inventario-tabs'
import { type Stock, type Location } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Boxes, AlertTriangle, TrendingDown, DollarSign,
  Search, Filter, MapPin, RefreshCw, Layers, Edit3, X, Check
} from 'lucide-react'
import { TableActionMenu, TableColumnHeader, TablePagination } from '@/components/tables'

export function StockClient() {
  const supabase = createClient()
  const { currentStore, storeId } = useStore()

  const [stocks, setStocks] = useState<Stock[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedLocation, setSelectedLocation] = useState<string>('all')
  const [onlyLowStock, setOnlyLowStock] = useState(false)

  // Quick edit modal
  const [editingStock, setEditingStock] = useState<Stock | null>(null)
  const [editMin, setEditMin] = useState<number>(0)
  const [editMax, setEditMax] = useState<number>(0)
  const [savingEdit, setSavingEdit] = useState(false)

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

  const fetchStocks = useCallback(async () => {
    if (!storeId) {
      setStocks([])
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error } = await supabase
      .from('stocks')
      .select(`
        *,
        item:items (
          id_item, code, barcode, description, description_short, unit, cost, price, price1, status,
          category:categories(description)
        ),
        location:locations (id_location, description)
      `)
      .eq('id_store', storeId)

    if (error) {
      toast.error('Error al cargar existencias')
    } else if (data) {
      setStocks(data as unknown as Stock[])
    }
    setLoading(false)
  }, [storeId, supabase])

  useEffect(() => {
    fetchLocations()
    fetchStocks()
  }, [fetchLocations, fetchStocks])

  // Realtime subscription on stocks table
  useEffect(() => {
    if (!storeId) return

    const channel = supabase
      .channel(`stock-live-${storeId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stocks', filter: `id_store=eq.${storeId}` },
        () => {
          fetchStocks()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [storeId, supabase, fetchStocks])

  // Filtered list
  const filteredStocks = useMemo(() => {
    return stocks.filter((stock) => {
      const item = stock.item
      if (!item || item.status === 'I') return false

      if (onlyLowStock && (stock.current ?? 0) >= (stock.minimum ?? 0)) {
        return false
      }

      if (selectedLocation !== 'all' && stock.id_location !== selectedLocation) {
        return false
      }

      if (search.trim()) {
        const query = search.toLowerCase()
        const code = item.code?.toLowerCase() ?? ''
        const barcode = item.barcode?.toLowerCase() ?? ''
        const desc = item.description?.toLowerCase() ?? ''
        if (!code.includes(query) && !barcode.includes(query) && !desc.includes(query)) {
          return false
        }
      }

      return true
    })
  }, [stocks, search, selectedLocation, onlyLowStock])

  // Sorting state
  const [sortKey, setSortKey] = useState<string>('description')
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
  }, [search, selectedLocation, onlyLowStock])

  const sortedStocks = useMemo(() => {
    const list = [...filteredStocks]
    if (!sortKey) return list

    return list.sort((a, b) => {
      let aVal: string | number = ''
      let bVal: string | number = ''

      switch (sortKey) {
        case 'description':
          aVal = (a.item?.description || '').toLowerCase()
          bVal = (b.item?.description || '').toLowerCase()
          break
        case 'category':
          aVal = (a.item?.category?.description || '').toLowerCase()
          bVal = (b.item?.category?.description || '').toLowerCase()
          break
        case 'location':
          aVal = (a.location?.description || '').toLowerCase()
          bVal = (b.location?.description || '').toLowerCase()
          break
        case 'min_max':
          aVal = Number(a.minimum || 0)
          bVal = Number(b.minimum || 0)
          break
        case 'current':
          aVal = Number(a.current || 0)
          bVal = Number(b.current || 0)
          break
        case 'cost':
          aVal = Number(a.item?.cost || 0)
          bVal = Number(b.item?.cost || 0)
          break
        case 'totalVal':
          aVal = Number(a.current || 0) * Number(a.item?.cost || 0)
          bVal = Number(b.current || 0) * Number(b.item?.cost || 0)
          break
        case 'status': {
          const getStatusVal = (s: Stock) => {
            const cur = s.current ?? 0
            const min = s.minimum ?? 0
            if (cur === 0) return 0
            if (cur < min) return 1
            return 2
          }
          aVal = getStatusVal(a)
          bVal = getStatusVal(b)
          break
        }
        default:
          return 0
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
  }, [filteredStocks, sortKey, sortDirection])

  const totalPages = Math.ceil(sortedStocks.length / pageSize) || 1
  const paginatedStocks = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedStocks.slice(start, start + pageSize)
  }, [sortedStocks, currentPage, pageSize])

  // KPI calculations
  const stats = useMemo(() => {
    let totalItems = 0
    let lowStockCount = 0
    let totalUnits = 0
    let totalValuation = 0

    stocks.forEach((s) => {
      if (s.item && s.item.status !== 'I') {
        totalItems += 1
        const current = s.current ?? 0
        const min = s.minimum ?? 0
        const cost = s.item.cost ?? 0
        if (current < min) lowStockCount += 1
        totalUnits += current
        totalValuation += current * cost
      }
    })

    return { totalItems, lowStockCount, totalUnits, totalValuation }
  }, [stocks])

  const handleOpenEdit = (stock: Stock) => {
    setEditingStock(stock)
    setEditMin(stock.minimum ?? 0)
    setEditMax(stock.maximum ?? 0)
  }

  const handleSaveEdit = async () => {
    if (!editingStock) return
    setSavingEdit(true)
    const { error } = await supabase
      .from('stocks')
      .update({
        minimum: Number(editMin),
        maximum: Number(editMax),
      })
      .eq('id_stock', editingStock.id_stock)

    setSavingEdit(false)
    if (error) {
      toast.error('Error al actualizar límites de stock')
    } else {
      toast.success('Límites actualizados correctamente')
      setStocks((prev) =>
        prev.map((s) =>
          s.id_stock === editingStock.id_stock
            ? { ...s, minimum: Number(editMin), maximum: Number(editMax) }
            : s
        )
      )
      setEditingStock(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="dashboard-bg" />

      {/* Header & Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Inventario & Stock
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Control de existencias en tiempo real para{' '}
            <span className="font-semibold text-emerald-500">
              {currentStore?.description ?? 'sucursal activa'}
            </span>
          </p>
        </div>
        <InventarioTabs />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <GlassCard variant="default" padding="sm" className="relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Artículos Registrados</p>
              <p className="text-2xl font-bold text-foreground mt-1">{stats.totalItems}</p>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
              <Boxes size={20} />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-medium text-emerald-500">{stats.totalUnits}</span> unidades en almacén
          </div>
        </GlassCard>

        <GlassCard
          variant={stats.lowStockCount > 0 ? 'amber' : 'default'}
          padding="sm"
          className="relative overflow-hidden"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Bajo Mínimo</p>
              <p className="text-2xl font-bold text-amber-500 mt-1">{stats.lowStockCount}</p>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500">
              <AlertTriangle size={20} />
            </div>
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            {stats.lowStockCount > 0 ? (
              <span className="text-amber-500 font-medium">Requieren resurtido inmediato</span>
            ) : (
              <span className="text-emerald-500 font-medium">Nivel de stock óptimo</span>
            )}
          </div>
        </GlassCard>

        <GlassCard variant="indigo" padding="sm" className="relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Total Unidades</p>
              <p className="text-2xl font-bold text-indigo-400 mt-1">{stats.totalUnits}</p>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
              <Layers size={20} />
            </div>
          </div>
          <div className="mt-3 text-xs text-muted-foreground">En todas las ubicaciones</div>
        </GlassCard>

        <GlassCard variant="emerald" padding="sm" className="relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Valor del Inventario</p>
              <p className="text-2xl font-bold text-emerald-400 mt-1">
                {formatCurrency(stats.totalValuation)}
              </p>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <DollarSign size={20} />
            </div>
          </div>
          <div className="mt-3 text-xs text-muted-foreground">Basado en costo unitario</div>
        </GlassCard>
      </div>

      {/* Filters bar */}
      <GlassCard padding="sm" className="space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex-1 max-w-md">
            <GlassInput
              placeholder="Buscar por código, código de barras o descripción..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              icon={<Search size={16} />}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Location selector */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl glass-input text-xs font-medium">
              <MapPin size={14} className="text-muted-foreground" />
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className="bg-transparent border-none text-foreground text-xs focus:outline-none cursor-pointer"
              >
                <option value="all" className="bg-zinc-900 text-white">Todas las ubicaciones</option>
                {locations.map((loc) => (
                  <option key={loc.id_location} value={loc.id_location} className="bg-zinc-900 text-white">
                    {loc.description}
                  </option>
                ))}
              </select>
            </div>

            {/* Low stock toggle */}
            <button
              onClick={() => setOnlyLowStock((prev) => !prev)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                onlyLowStock
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-sm'
                  : 'glass-input text-muted-foreground hover:text-foreground'
              }`}
            >
              <TrendingDown size={14} />
              <span>Solo bajo mínimo</span>
            </button>

            {/* Refresh button */}
            <GlassButton
              variant="ghost"
              size="sm"
              onClick={fetchStocks}
              disabled={loading}
              title="Recargar datos"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </GlassButton>
          </div>
        </div>
      </GlassCard>

      {/* Stock Table */}
      <GlassCard padding="none" className="overflow-hidden">
        <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-320px)] min-h-[300px] scroll-modern">
          <table className="w-full text-left text-sm border-separate border-spacing-0">
            <thead className="sticky top-0 z-20">
              <tr className="glass-table-header border-b border-border/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <TableColumnHeader
                  title="Artículo"
                  sortKey="description"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                />
                <TableColumnHeader
                  title="Categoría"
                  sortKey="category"
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
                  title="Mín / Máx"
                  sortKey="min_max"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  align="center"
                />
                <TableColumnHeader
                  title="Existencia"
                  sortKey="current"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  align="right"
                />
                <TableColumnHeader
                  title="Costo"
                  sortKey="cost"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  align="right"
                />
                <TableColumnHeader
                  title="Valor Total"
                  sortKey="totalVal"
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
                  Acción
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {loading && stocks.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw size={24} className="animate-spin text-emerald-500" />
                      <p>Cargando existencias...</p>
                    </div>
                  </td>
                </tr>
              ) : paginatedStocks.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                    <p className="text-base font-medium">No se encontraron artículos</p>
                    <p className="text-xs text-muted-foreground/80 mt-1">
                      {search ? 'Intenta modificar el término de búsqueda o filtros' : 'No hay stock asignado para esta sucursal'}
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedStocks.map((stock) => {
                  const item = stock.item!
                  const current = stock.current ?? 0
                  const min = stock.minimum ?? 0
                  const max = stock.maximum ?? 0
                  const cost = item.cost ?? 0
                  const totalVal = current * cost

                  let statusBadge = 'ok'
                  if (current === 0) statusBadge = 'critical'
                  else if (current < min) statusBadge = 'low'

                  return (
                    <tr
                      key={stock.id_stock}
                      className="hover:bg-white/[0.03] transition-colors group"
                    >
                      <td className="px-4 py-3.5">
                        <div className="flex flex-col">
                          <span className="font-semibold text-foreground group-hover:text-emerald-400 transition-colors">
                            {item.description}
                          </span>
                          <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground font-mono">
                            {item.code && <span>Cód: {item.code}</span>}
                            {item.barcode && <span>CB: {item.barcode}</span>}
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3.5 text-xs text-muted-foreground">
                        {item.category?.description ?? '—'}
                      </td>

                      <td className="px-4 py-3.5 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <MapPin size={12} className="text-muted-foreground/60" />
                          {stock.location?.description ?? 'Sin asignar'}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 text-center text-xs font-mono text-muted-foreground">
                        {min} / {max}
                      </td>

                      <td className="px-4 py-3.5 text-right font-mono font-bold text-foreground">
                        {current} <span className="text-xs font-normal text-muted-foreground">{item.unit ?? 'Pza'}</span>
                      </td>

                      <td className="px-4 py-3.5 text-right text-xs font-mono text-muted-foreground">
                        {formatCurrency(cost)}
                      </td>

                      <td className="px-4 py-3.5 text-right text-xs font-mono font-semibold text-emerald-400">
                        {formatCurrency(totalVal)}
                      </td>

                      <td className="px-4 py-3.5 text-center">
                        <StatusBadge
                          status={statusBadge}
                          customLabel={
                            statusBadge === 'critical'
                              ? 'Agotado'
                              : statusBadge === 'low'
                              ? 'Bajo Mínimo'
                              : 'Óptimo'
                          }
                        />
                      </td>

                      <td className="px-4 py-3.5 text-center">
                        <TableActionMenu
                          items={[
                            {
                              label: 'Editar Límites de Stock',
                              icon: <Edit3 size={15} />,
                              onClick: () => handleOpenEdit(stock),
                              variant: 'primary',
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

        {/* Footer pagination */}
        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={sortedStocks.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          realtimeLabel="Sincronización en tiempo real activa"
        />
      </GlassCard>

      {/* Modal: Edit Min/Max limits */}
      <AnimatePresence>
        {editingStock && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card max-w-md w-full p-6 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-border/40 pb-3">
                <h3 className="text-base font-bold text-foreground">
                  Ajustar Niveles de Stock
                </h3>
                <button
                  onClick={() => setEditingStock(null)}
                  className="p-1 rounded-lg text-muted-foreground hover:text-foreground"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">
                  {editingStock.item?.description}
                </p>
                <p className="text-xs text-muted-foreground font-mono">
                  Código: {editingStock.item?.code ?? 'N/A'} | Ubicación:{' '}
                  {editingStock.location?.description ?? 'Sin asignar'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">
                    Stock Mínimo
                  </label>
                  <GlassInput
                    type="number"
                    min={0}
                    value={editMin}
                    onChange={(e) => setEditMin(Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">
                    Stock Máximo
                  </label>
                  <GlassInput
                    type="number"
                    min={0}
                    value={editMax}
                    onChange={(e) => setEditMax(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-4">
                <GlassButton
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingStock(null)}
                >
                  Cancelar
                </GlassButton>
                <GlassButton
                  variant="primary"
                  size="sm"
                  onClick={handleSaveEdit}
                  disabled={savingEdit}
                >
                  <Check size={14} className="mr-1.5" />
                  {savingEdit ? 'Guardando...' : 'Guardar Cambios'}
                </GlassButton>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
