'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useStore } from '@/components/providers/store-provider'
import { GlassCard } from '@/components/glass-card'
import { GlassButton } from '@/components/glass-button'
import { GlassInput } from '@/components/glass-input'
import { InventarioTabs } from '@/components/inventario/inventario-tabs'
import { type Transaction, type MovimType } from '@/lib/types'
import { formatDateTime, formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'
import {
  ArrowLeftRight, Search, RefreshCw,
  ArrowDownLeft, ArrowUpRight, ShoppingCart, ScanLine, Wrench
} from 'lucide-react'

const MOVIM_CONFIG: Record<MovimType, { label: string; icon: typeof ArrowDownLeft; color: string; badge: string }> = {
  E: { label: 'Entrada', icon: ArrowDownLeft, color: 'text-emerald-400', badge: 'badge-active' },
  S: { label: 'Salida', icon: ArrowUpRight, color: 'text-rose-400', badge: 'badge-error' },
  V: { label: 'Venta', icon: ShoppingCart, color: 'text-indigo-400', badge: 'badge-info' },
  I: { label: 'Inventario', icon: ScanLine, color: 'text-teal-400', badge: 'badge-active' },
  A: { label: 'Ajuste', icon: Wrench, color: 'text-amber-400', badge: 'badge-warning' },
}

export function MovimientosClient() {
  const supabase = createClient()
  const { currentStore, storeId } = useStore()

  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('ALL')

  const fetchTransactions = useCallback(async () => {
    if (!storeId) {
      setTransactions([])
      setLoading(false)
      return
    }

    setLoading(true)

    // 1. Fetch transactions for the current store
    const { data: rawTxs, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('id_store', storeId)
      .order('date_transaction', { ascending: false })
      .limit(150)

    if (error) {
      console.error('Error al cargar movimientos:', error)
      toast.error('Error al cargar movimientos: ' + error.message)
      setTransactions([])
      setLoading(false)
      return
    }

    const txList = (rawTxs ?? []) as Transaction[]
    if (txList.length === 0) {
      setTransactions([])
      setLoading(false)
      return
    }

    // 2. Collect unique item and location IDs
    const itemIds = Array.from(new Set(txList.map((t) => t.id_item).filter((id): id is string => Boolean(id))))
    const locationIds = Array.from(new Set(txList.map((t) => t.id_location).filter((id): id is string => Boolean(id))))

    // 3. Batch query items and locations in parallel
    const [itemsRes, locsRes] = await Promise.all([
      itemIds.length > 0
        ? supabase.from('items').select('id_item, code, barcode, description, unit').in('id_item', itemIds)
        : Promise.resolve({ data: [] }),
      locationIds.length > 0
        ? supabase.from('locations').select('id_location, description').in('id_location', locationIds)
        : Promise.resolve({ data: [] }),
    ])

    const itemsMap = new Map((itemsRes.data ?? []).map((it) => [it.id_item, it]))
    const locsMap = new Map((locsRes.data ?? []).map((loc) => [loc.id_location, loc]))

    // 4. Hydrate transactions with their relations
    const hydratedTransactions: Transaction[] = txList.map((t) => ({
      ...t,
      item: t.id_item ? (itemsMap.get(t.id_item) as Transaction['item']) : undefined,
      location: t.id_location ? (locsMap.get(t.id_location) as Transaction['location']) : undefined,
    }))

    setTransactions(hydratedTransactions)
    setLoading(false)
  }, [storeId, supabase])

  useEffect(() => {
    fetchTransactions()
  }, [fetchTransactions])

  // Realtime subscription
  useEffect(() => {
    if (!storeId) return

    const channel = supabase
      .channel(`transactions-live-${storeId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions', filter: `id_store=eq.${storeId}` },
        () => {
          fetchTransactions()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [storeId, supabase, fetchTransactions])

  // Filtered transactions
  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (typeFilter !== 'ALL' && t.movim_type !== typeFilter) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        const desc = t.item?.description?.toLowerCase() ?? ''
        const code = t.item?.code?.toLowerCase() ?? ''
        const barcode = t.item?.barcode?.toLowerCase() ?? ''
        const ref = t.reference?.toLowerCase() ?? ''
        const concept = t.concept?.toLowerCase() ?? ''
        if (!desc.includes(q) && !code.includes(q) && !barcode.includes(q) && !ref.includes(q) && !concept.includes(q)) {
          return false
        }
      }
      return true
    })
  }, [transactions, typeFilter, search])

  return (
    <div className="space-y-6">
      <div className="dashboard-bg" />

      {/* Header and Sub-Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <ArrowLeftRight className="text-emerald-500" size={28} />
            Movimientos de Inventario
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Historial de entradas, salidas, ventas y ajustes para{' '}
            <span className="font-semibold text-emerald-500">
              {currentStore?.description ?? 'sucursal activa'}
            </span>
          </p>
        </div>
        <InventarioTabs />
      </div>

      {/* Filters Bar */}
      <GlassCard padding="sm" className="space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex-1 max-w-md">
            <GlassInput
              placeholder="Buscar por artículo, referencia o concepto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              icon={<Search size={16} />}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-1 rounded-xl glass">
              <button
                onClick={() => setTypeFilter('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  typeFilter === 'ALL'
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Todos
              </button>
              {(Object.keys(MOVIM_CONFIG) as MovimType[]).map((type) => {
                const config = MOVIM_CONFIG[type]
                return (
                  <button
                    key={type}
                    onClick={() => setTypeFilter(type)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      typeFilter === type
                        ? 'bg-emerald-500 text-white shadow-sm'
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
              onClick={fetchTransactions}
              disabled={loading}
              title="Recargar movimientos"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </GlassButton>
          </div>
        </div>
      </GlassCard>

      {/* Transactions Table */}
      <GlassCard padding="none" className="overflow-hidden">
        <div className="overflow-x-auto scroll-modern">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="glass-table-header border-b border-border/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3.5">Fecha y Hora</th>
                <th className="px-4 py-3.5">Tipo</th>
                <th className="px-4 py-3.5">Artículo</th>
                <th className="px-4 py-3.5">Ubicación</th>
                <th className="px-4 py-3.5 text-right">Entrada</th>
                <th className="px-4 py-3.5 text-right">Salida</th>
                <th className="px-4 py-3.5 text-right">Costo</th>
                <th className="px-4 py-3.5">Referencia / Concepto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {loading && transactions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                    <RefreshCw size={24} className="animate-spin text-emerald-500 mx-auto mb-2" />
                    Cargando movimientos...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                    <p className="text-base font-medium">No se encontraron movimientos</p>
                    <p className="text-xs text-muted-foreground/80 mt-1">
                      No hay registros para los filtros seleccionados
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((t) => {
                  const mType = t.movim_type as MovimType
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
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.badge}`}>
                          {config.label}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-semibold text-foreground text-sm">
                            {t.item?.description ?? 'Artículo no especificado'}
                          </span>
                          <span className="text-xs text-muted-foreground font-mono">
                            {t.item?.code || t.item?.barcode || '—'}
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {t.location?.description ?? 'General'}
                      </td>

                      <td className="px-4 py-3 text-right font-mono font-bold text-emerald-400">
                        {t.amount_enrty > 0 ? `+${t.amount_enrty}` : '—'}
                      </td>

                      <td className="px-4 py-3 text-right font-mono font-bold text-rose-400">
                        {t.amount_exit > 0 ? `-${t.amount_exit}` : '—'}
                      </td>

                      <td className="px-4 py-3 text-right text-xs font-mono text-muted-foreground">
                        {formatCurrency(t.cost)}
                      </td>

                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">{t.concept || 'Movimiento de Almacén'}</span>
                          {t.reference && (
                            <span className="text-[11px] text-muted-foreground/80 font-mono">
                              Ref: {t.reference}
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

        <div className="px-4 py-3 border-t border-border/20 text-xs text-muted-foreground flex items-center justify-between">
          <span>Mostrando {filtered.length} movimientos</span>
          <span className="text-emerald-500 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Monitoreo en tiempo real
          </span>
        </div>
      </GlassCard>
    </div>
  )
}
