'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { GlassButton } from '@/components/glass-button'
import { GlassInput } from '@/components/glass-input'
import { TableActionMenu, TableColumnHeader, TablePagination } from '@/components/tables'
import {
  type Order,
  type Profile,
} from '@/lib/types'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import {
  History,
  Search,
  RotateCcw,
  RefreshCw,
  X,
  FileText,
  Printer,
  ShieldAlert,
  Calendar,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Receipt
} from 'lucide-react'
import { toast } from 'sonner'
import { getStoreOrdersAction } from '@/app/(dashboard)/pos/sales-cancellation-actions'
import { PosCancelSaleModal } from './pos-cancel-sale-modal'
import { PosOrderDetailModal } from './pos-order-detail-modal'

interface PosSalesHistoryModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  storeId: string
  storeName?: string
  currentUser: Profile | null
  onStockUpdated?: () => void
  onReprintTicket?: (order: Order) => void
}

export function PosSalesHistoryModal({
  open,
  onOpenChange,
  storeId,
  storeName,
  currentUser,
  onStockUpdated,
  onReprintTicket,
}: PosSalesHistoryModalProps) {
  // Orders Data & State
  const [orders, setOrders] = useState<Order[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(false)

  // Filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'completed' | 'cancelled'>('ALL')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Pagination & Sorting
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [sortBy, setSortBy] = useState('created_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  // Modals inside
  const [selectedOrderForDetail, setSelectedOrderForDetail] = useState<Order | null>(null)
  const [selectedOrderForCancel, setSelectedOrderForCancel] = useState<Order | null>(null)

  // Fetch orders from server action
  const loadOrders = useCallback(async () => {
    if (!storeId || !open) return
    setLoading(true)

    try {
      const data = await getStoreOrdersAction({
        storeId,
        page,
        pageSize,
        search,
        status: statusFilter,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        sortBy,
        sortOrder,
      })

      setOrders(data.orders)
      setTotalCount(data.totalCount)
    } catch (err: unknown) {
      console.error('Error loading store orders:', err)
      toast.error('Error al consultar historial de ventas')
    } finally {
      setLoading(false)
    }
  }, [storeId, open, page, pageSize, search, statusFilter, dateFrom, dateTo, sortBy, sortOrder])

  useEffect(() => {
    if (open) {
      loadOrders()
    }
  }, [open, loadOrders])

  // Sorting handler
  const handleSort = (key: string) => {
    if (sortBy === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(key)
      setSortOrder(key === 'created_at' ? 'desc' : 'asc')
    }
    setPage(1)
  }

  // Handle Order Cancelled callback
  const handleOrderCancelled = (cancelledOrder: Order) => {
    // Update local state
    setOrders((prev) =>
      prev.map((o) => (o.id_order === cancelledOrder.id_order ? cancelledOrder : o))
    )
    if (selectedOrderForDetail?.id_order === cancelledOrder.id_order) {
      setSelectedOrderForDetail(cancelledOrder)
    }
    if (onStockUpdated) {
      onStockUpdated()
    }
  }

  const totalPages = Math.ceil(totalCount / pageSize) || 1

  if (!open) return null

  return (
    <>
      <AnimatePresence>
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            className="glass-card border-border/50 rounded-2xl sm:rounded-3xl max-w-5xl w-full flex flex-col max-h-[92dvh] sm:max-h-[90vh] overflow-hidden shadow-2xl relative"
          >
            {/* Header Fijo */}
            <div className="p-3 sm:p-5 border-b border-border/40 flex items-center justify-between gap-3 shrink-0 bg-card/95 dark:bg-card/90 backdrop-blur-xl z-10">
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 pr-2">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/25 shrink-0">
                  <History size={20} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-bold text-foreground flex items-center gap-2 truncate">
                    <span>Historial de Ventas</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 font-mono">
                      {totalCount}
                    </span>
                  </h3>
                  <p className="text-[11px] text-muted-foreground truncate">
                    Sucursal: <strong className="text-foreground">{storeName || 'Activa'}</strong> · Consultas y cancelaciones
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <GlassButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={loadOrders}
                  disabled={loading}
                  className="p-2 sm:px-3 gap-1.5"
                  title="Recargar listado"
                >
                  <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                  <span className="hidden sm:inline">Actualizar</span>
                </GlassButton>
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors shrink-0"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="p-3 sm:px-6 py-3 border-b border-border/20 bg-card/40 backdrop-blur-md flex flex-wrap items-center gap-2.5 shrink-0">
              {/* Buscador */}
              <div className="relative flex-1 min-w-[200px]">
                <Search
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  type="text"
                  placeholder="Buscar por folio (#1001), cliente o referencia..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setPage(1)
                  }}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl glass-input text-foreground placeholder:text-muted-foreground border border-border/40 focus:border-emerald-500/60 focus:outline-none"
                />
              </div>

              {/* Filtro de Estatus */}
              <div className="flex items-center rounded-xl bg-white/5 border border-border/30 p-0.5 text-xs">
                {(['ALL', 'completed', 'cancelled'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => {
                      setStatusFilter(st)
                      setPage(1)
                    }}
                    className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                      statusFilter === st
                        ? st === 'cancelled'
                          ? 'bg-rose-500 text-white font-bold shadow-sm'
                          : st === 'completed'
                          ? 'bg-emerald-500 text-white font-bold shadow-sm'
                          : 'bg-indigo-500 text-white font-bold shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {st === 'ALL' ? 'Todas' : st === 'completed' ? 'Completadas' : 'Canceladas'}
                  </button>
                ))}
              </div>

              {/* Filtros de Fecha */}
              <div className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value)
                    setPage(1)
                  }}
                  className="px-2 py-1.5 rounded-xl glass-input text-foreground text-xs"
                  title="Fecha desde"
                />
                <span>-</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value)
                    setPage(1)
                  }}
                  className="px-2 py-1.5 rounded-xl glass-input text-foreground text-xs"
                  title="Fecha hasta"
                />
                {(dateFrom || dateTo) && (
                  <button
                    type="button"
                    onClick={() => {
                      setDateFrom('')
                      setDateTo('')
                      setPage(1)
                    }}
                    className="p-1 rounded-lg text-muted-foreground hover:text-foreground"
                    title="Limpiar fechas"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Scrollable Table with Sticky Header */}
            <div className="scrollable-table scroll-modern flex-1 overflow-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="glass-table-header border-b border-border/30">
                    <TableColumnHeader
                      title="Folio"
                      sortKey="order_number"
                      currentSortKey={sortBy}
                      direction={sortOrder}
                      onSort={handleSort}
                      className="w-[110px]"
                    />
                    <TableColumnHeader
                      title="Fecha y Hora"
                      sortKey="created_at"
                      currentSortKey={sortBy}
                      direction={sortOrder}
                      onSort={handleSort}
                      className="w-[160px]"
                    />
                    <th className="px-4 py-3.5 text-left font-semibold text-muted-foreground sticky top-0 z-20 bg-card/95 backdrop-blur-md">
                      Cliente
                    </th>
                    <th className="px-4 py-3.5 text-left font-semibold text-muted-foreground sticky top-0 z-20 bg-card/95 backdrop-blur-md">
                      Método Pago
                    </th>
                    <TableColumnHeader
                      title="Total"
                      sortKey="total_amount"
                      currentSortKey={sortBy}
                      direction={sortOrder}
                      onSort={handleSort}
                      align="right"
                      className="w-[120px]"
                    />
                    <th className="px-4 py-3.5 text-center font-semibold text-muted-foreground sticky top-0 z-20 bg-card/95 backdrop-blur-md w-[130px]">
                      Estatus
                    </th>
                    <th className="px-4 py-3.5 text-center font-semibold text-muted-foreground sticky top-0 z-20 bg-card/95 backdrop-blur-md w-[70px]">
                      Acciones
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-border/20">
                  {loading && orders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-muted-foreground">
                        <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-emerald-500" />
                        Cargando ventas...
                      </td>
                    </tr>
                  ) : orders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-muted-foreground">
                        <Receipt size={32} className="mx-auto mb-2 opacity-40 text-muted-foreground" />
                        No se encontraron ventas registradas con los filtros actuales.
                      </td>
                    </tr>
                  ) : (
                    orders.map((ord) => {
                      const isCancelled = ord.status === 'cancelled'
                      const clientName = ord.client
                        ? `${ord.client.first_name || ''} ${ord.client.last_name || ''}`.trim()
                        : 'Público en General'

                      // Menu items for TableActionMenu
                      const actionItems = [
                        {
                          label: 'Ver Detalle Completo',
                          icon: <FileText size={15} />,
                          onClick: () => setSelectedOrderForDetail(ord),
                          variant: 'default' as const,
                        },
                        {
                          label: 'Reimprimir Ticket',
                          icon: <Printer size={15} />,
                          onClick: () => {
                            if (onReprintTicket) {
                              onReprintTicket(ord)
                            } else {
                              setSelectedOrderForDetail(ord)
                            }
                          },
                          variant: 'default' as const,
                        },
                        {
                          label: isCancelled ? 'Venta Ya Cancelada' : 'Cancelar Venta',
                          icon: <RotateCcw size={15} />,
                          onClick: () => setSelectedOrderForCancel(ord),
                          variant: 'danger' as const,
                          disabled: isCancelled,
                          separatorBefore: true,
                        },
                      ]

                      return (
                        <tr
                          key={ord.id_order}
                          className={`hover:bg-white/5 transition-colors group ${
                            isCancelled ? 'bg-rose-500/[0.03]' : ''
                          }`}
                        >
                          {/* Folio */}
                          <td className="px-4 py-3 font-mono font-bold text-foreground">
                            <button
                              type="button"
                              onClick={() => setSelectedOrderForDetail(ord)}
                              className="hover:underline text-emerald-400 group-hover:text-emerald-300"
                            >
                              #{ord.order_number}
                            </button>
                          </td>

                          {/* Fecha */}
                          <td className="px-4 py-3 text-muted-foreground">
                            {formatDateTime(ord.created_at)}
                          </td>

                          {/* Cliente */}
                          <td className="px-4 py-3">
                            <span className="font-semibold text-foreground block truncate max-w-[200px]">
                              {clientName}
                            </span>
                            {ord.client?.rfc && (
                              <span className="text-[10px] text-muted-foreground font-mono">
                                {ord.client.rfc}
                              </span>
                            )}
                          </td>

                          {/* Método Pago */}
                          <td className="px-4 py-3">
                            <span className="capitalize font-medium text-foreground">
                              {ord.payment_method === 'cash'
                                ? 'Efectivo'
                                : ord.payment_method === 'card'
                                ? 'Tarjeta'
                                : ord.payment_method === 'transfer'
                                ? 'Transferencia'
                                : ord.payment_method || 'General'}
                            </span>
                            {ord.payment_sat_code && (
                              <span className="text-[10px] text-muted-foreground block">
                                SAT: {ord.payment_sat_code}
                              </span>
                            )}
                          </td>

                          {/* Total */}
                          <td className="px-4 py-3 text-right font-black">
                            <span
                              className={
                                isCancelled
                                  ? 'text-rose-400/80 line-through'
                                  : 'text-foreground'
                              }
                            >
                              {formatCurrency(ord.total_amount)}
                            </span>
                          </td>

                          {/* Estatus */}
                          <td className="px-4 py-3 text-center">
                            {isCancelled ? (
                              <span
                                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400 text-[10px] font-bold"
                                title={`Cancelado por: ${ord.cancelled_by_name || 'Supervisor'} - Motivo: ${
                                  ord.cancellation_reason || 'N/D'
                                }`}
                              >
                                <ShieldAlert size={11} /> CANCELADA
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold">
                                <CheckCircle2 size={11} /> COMPLETADA
                              </span>
                            )}
                          </td>

                          {/* Columna Acciones con 3 puntos verticales */}
                          <td className="px-4 py-3 text-center">
                            <TableActionMenu items={actionItems} align="end" />
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Paginador */}
            <TablePagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={totalCount}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              realtimeLabel="Actualización en vivo"
            />

            {/* Footer Fijo en Móvil */}
            <div className="flex sm:hidden items-center justify-between border-t border-border/40 p-3 bg-card/95 dark:bg-card/90 backdrop-blur-xl shrink-0 z-10">
              <span className="text-xs text-muted-foreground">{totalCount} registros</span>
              <GlassButton variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                Cerrar
              </GlassButton>
            </div>
          </motion.div>
        </div>
      </AnimatePresence>

      {/* Modal de Cancelación con Autorización PIN / Biometría */}
      <PosCancelSaleModal
        open={Boolean(selectedOrderForCancel)}
        onOpenChange={(open) => {
          if (!open) setSelectedOrderForCancel(null)
        }}
        order={selectedOrderForCancel}
        storeId={storeId}
        currentUser={currentUser}
        onOrderCancelled={handleOrderCancelled}
      />

      {/* Modal de Detalle de Venta */}
      <PosOrderDetailModal
        open={Boolean(selectedOrderForDetail)}
        onOpenChange={(open) => {
          if (!open) setSelectedOrderForDetail(null)
        }}
        order={selectedOrderForDetail}
        onInitiateCancel={(ord) => {
          setSelectedOrderForCancel(ord)
        }}
      />
    </>
  )
}
