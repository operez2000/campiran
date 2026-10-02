'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion } from 'framer-motion'
import { createClient } from '@/utils/supabase/client'
import { useStore } from '@/components/providers/store-provider'
import { GlassCard } from '@/components/glass-card'
import { GlassButton } from '@/components/glass-button'
import { GlassInput } from '@/components/glass-input'
import { StatusBadge } from '@/components/status-badge'
import { type Order, type Stock } from '@/lib/types'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { toast } from 'sonner'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, AreaChart, Area
} from 'recharts'
import {
  BarChart3, TrendingUp, DollarSign, ShoppingCart,
  AlertTriangle, Download, FileSpreadsheet, FileText,
  Calendar, RefreshCw, Trophy, ArrowUpRight
} from 'lucide-react'

type PeriodFilter = 'today' | 'week' | 'month' | 'year'

interface TopProduct {
  name: string
  quantity: number
  totalRevenue: number
}

export function ReportesClient() {
  const supabase = createClient()
  const { currentStore, storeId } = useStore()

  const [period, setPeriod] = useState<PeriodFilter>('month')
  const [orders, setOrders] = useState<Order[]>([])
  const [criticalStocks, setCriticalStocks] = useState<Stock[]>([])
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [loading, setLoading] = useState(true)

  const fetchReportData = useCallback(async () => {
    if (!storeId) return
    setLoading(true)

    // 1. Calculate start date based on period
    const now = new Date()
    const startDate = new Date()
    if (period === 'today') {
      startDate.setHours(0, 0, 0, 0)
    } else if (period === 'week') {
      startDate.setDate(now.getDate() - 7)
    } else if (period === 'month') {
      startDate.setDate(now.getDate() - 30)
    } else if (period === 'year') {
      startDate.setFullYear(now.getFullYear() - 1)
    }

    // 2. Fetch completed orders
    const { data: ordersData, error: ordersError } = await supabase
      .from('orders')
      .select(`
        *,
        client:clients(first_name, last_name),
        order_items (
          quantity, unit_price, total_price,
          item:items(description, cost)
        )
      `)
      .eq('id_store', storeId)
      .eq('status', 'completed')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: true })

    if (ordersError) {
      toast.error('Error al consultar ventas: ' + ordersError.message)
    } else if (ordersData) {
      setOrders(ordersData as unknown as Order[])

      // Aggregate top products
      const prodMap = new Map<string, { quantity: number; revenue: number }>()
      const typedList = ordersData as unknown as Order[]
      typedList.forEach((ord) => {
        if (ord.order_items) {
          ord.order_items.forEach((it) => {
            const desc = it.item?.description || 'Artículo'
            const existing = prodMap.get(desc) || { quantity: 0, revenue: 0 }
            prodMap.set(desc, {
              quantity: existing.quantity + Number(it.quantity || 0),
              revenue: existing.revenue + Number(it.total_price || 0),
            })
          })
        }
      })

      const topList: TopProduct[] = Array.from(prodMap.entries())
        .map(([name, val]) => ({
          name,
          quantity: val.quantity,
          totalRevenue: val.revenue,
        }))
        .sort((a, b) => b.totalRevenue - a.totalRevenue)
        .slice(0, 5)

      setTopProducts(topList)
    }

    // 3. Fetch critical stocks
    const { data: stockData } = await supabase
      .from('stocks')
      .select('*, item:items(description, code, unit), location:locations(description)')
      .eq('id_store', storeId)

    if (stockData) {
      const underMinimum = (stockData as unknown as Stock[]).filter(
        (s) => (s.current ?? 0) < (s.minimum ?? 0)
      )
      setCriticalStocks(underMinimum)
    }

    setLoading(false)
  }, [storeId, period, supabase])

  useEffect(() => {
    fetchReportData()
  }, [fetchReportData])

  // KPIs
  const metrics = useMemo(() => {
    let totalSales = 0
    const totalTransactions = orders.length
    let totalEstimatedProfit = 0

    orders.forEach((o) => {
      totalSales += Number(o.total_amount || 0)
      if (o.order_items) {
        o.order_items.forEach((it) => {
          const price = Number(it.unit_price || 0)
          const cost = Number(it.item?.cost || 0)
          const qty = Number(it.quantity || 1)
          totalEstimatedProfit += (price - cost) * qty
        })
      }
    })

    const avgTicket = totalTransactions > 0 ? totalSales / totalTransactions : 0

    return {
      totalSales,
      totalTransactions,
      avgTicket,
      totalEstimatedProfit,
    }
  }, [orders])

  // Chart Data Grouping
  const chartData = useMemo(() => {
    const map = new Map<string, number>()

    orders.forEach((o) => {
      const d = new Date(o.created_at)
      let label = ''
      if (period === 'today') {
        label = `${d.getHours()}:00`
      } else {
        label = `${d.getDate()}/${d.getMonth() + 1}`
      }
      const existing = map.get(label) || 0
      map.set(label, existing + Number(o.total_amount || 0))
    })

    return Array.from(map.entries()).map(([label, total]) => ({
      fecha: label,
      ventas: total,
    }))
  }, [orders, period])

  // Export to PDF
  const handleExportPDF = () => {
    if (orders.length === 0) {
      toast.error('No hay datos de ventas en este período')
      return
    }

    const doc = new jsPDF()
    doc.setFontSize(18)
    doc.setTextColor(16, 185, 129)
    doc.text('CAMPIRAN POS', 14, 20)

    doc.setFontSize(13)
    doc.setTextColor(30, 41, 59)
    doc.text(`Reporte de Ventas & Rendimiento (${currentStore?.description ?? 'Sucursal'})`, 14, 28)

    doc.setFontSize(9)
    doc.setTextColor(100, 116, 139)
    doc.text(`Período: ${period.toUpperCase()} · Generado el ${formatDateTime(new Date().toISOString())}`, 14, 35)
    doc.text(`Total Vendido: ${formatCurrency(metrics.totalSales)} · Órdenes: ${metrics.totalTransactions}`, 14, 40)

    const tableRows = orders.map((o, index) => {
      const clientName = o.client
        ? `${o.client.first_name ?? ''} ${o.client.last_name ?? ''}`.trim()
        : 'Público en General'
      return [
        index + 1,
        `#${o.order_number}`,
        formatDateTime(o.created_at),
        clientName,
        (o.payment_method || 'Efectivo').toUpperCase(),
        formatCurrency(Number(o.total_amount)),
      ]
    })

    autoTable(doc, {
      startY: 46,
      head: [['#', 'Folio', 'Fecha y Hora', 'Cliente', 'Método Pago', 'Total']],
      body: tableRows,
      theme: 'grid',
      headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255] },
      styles: { fontSize: 8 },
    })

    doc.save(`Reporte_Ventas_${currentStore?.description ?? 'Campiran'}.pdf`)
    toast.success('Reporte en PDF generado correctamente')
  }

  // Export to Excel
  const handleExportExcel = () => {
    if (orders.length === 0) {
      toast.error('No hay datos de ventas en este período')
      return
    }

    const dataRows = orders.map((o) => ({
      Folio: o.order_number,
      Fecha: formatDateTime(o.created_at),
      Cliente: o.client
        ? `${o.client.first_name ?? ''} ${o.client.last_name ?? ''}`.trim()
        : 'Público en General',
      'Método de Pago': (o.payment_method || 'Efectivo').toUpperCase(),
      Subtotal: Number(o.total_amount) - Number(o.tax_amount || 0),
      IVA: Number(o.tax_amount || 0),
      Total: Number(o.total_amount),
    }))

    const worksheet = XLSX.utils.json_to_sheet(dataRows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Ventas')

    XLSX.writeFile(workbook, `Reporte_Ventas_${currentStore?.description ?? 'Campiran'}.xlsx`)
    toast.success('Reporte en Excel descargado')
  }

  return (
    <div className="space-y-6">
      <div className="dashboard-bg" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <BarChart3 className="text-emerald-500" size={28} />
            Reportes & Rendimiento
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Análisis financiero y métricas comerciales para{' '}
            <span className="font-semibold text-emerald-500">
              {currentStore?.description ?? 'sucursal activa'}
            </span>
          </p>
        </div>

        {/* Action buttons & Period Filter */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Period selector */}
          <div className="flex items-center gap-1 p-1 rounded-xl glass">
            {(
              [
                { id: 'today', label: 'Hoy' },
                { id: 'week', label: '7 Días' },
                { id: 'month', label: '30 Días' },
                { id: 'year', label: 'Año' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => setPeriod(t.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  period === t.id
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <GlassButton variant="ghost" size="sm" onClick={handleExportPDF} title="Exportar PDF">
            <FileText size={15} className="mr-1.5" />
            PDF
          </GlassButton>
          <GlassButton variant="ghost" size="sm" onClick={handleExportExcel} title="Exportar Excel">
            <FileSpreadsheet size={15} className="mr-1.5" />
            Excel
          </GlassButton>
          <GlassButton variant="ghost" size="sm" onClick={fetchReportData} title="Refrescar">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </GlassButton>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <GlassCard variant="emerald" padding="sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Ventas Totales</p>
              <p className="text-2xl font-bold text-emerald-400 mt-1">
                {formatCurrency(metrics.totalSales)}
              </p>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <DollarSign size={20} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
            <TrendingUp size={13} className="text-emerald-400" />
            Ingresos netos del período
          </p>
        </GlassCard>

        <GlassCard variant="default" padding="sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Órdenes / Ventas</p>
              <p className="text-2xl font-bold text-foreground mt-1">
                {metrics.totalTransactions}
              </p>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-foreground">
              <ShoppingCart size={20} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">Transacciones registradas</p>
        </GlassCard>

        <GlassCard variant="indigo" padding="sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Ticket Promedio</p>
              <p className="text-2xl font-bold text-indigo-400 mt-1">
                {formatCurrency(metrics.avgTicket)}
              </p>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
              <TrendingUp size={20} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">Promedio por cada venta</p>
        </GlassCard>

        <GlassCard variant="default" padding="sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Utilidad Bruta Estimada</p>
              <p className="text-2xl font-bold text-emerald-400 mt-1">
                {formatCurrency(metrics.totalEstimatedProfit)}
              </p>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <ArrowUpRight size={20} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">Margen sobre costo</p>
        </GlassCard>
      </div>

      {/* Main Charts & Rankings Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Sales Trend Chart */}
        <div className="lg:col-span-8">
          <GlassCard padding="md" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-foreground">Evolución de Ventas ($)</h3>
                <p className="text-xs text-muted-foreground">Comportamiento temporal de facturación</p>
              </div>
            </div>

            <div className="h-[280px] w-full pt-4">
              {chartData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                  No hay datos suficientes para graficar en este rango
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="fecha" stroke="rgba(255,255,255,0.4)" fontSize={11} />
                    <YAxis stroke="rgba(255,255,255,0.4)" fontSize={11} tickFormatter={(v) => `$${v}`} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#18181b',
                        borderColor: '#27272a',
                        borderRadius: '1rem',
                        fontSize: '12px',
                      }}
                      formatter={(value: unknown) => [formatCurrency(Number(value) || 0), 'Ventas']}
                    />
                    <Area
                      type="monotone"
                      dataKey="ventas"
                      stroke="#10b981"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#salesGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </GlassCard>
        </div>

        {/* Top Products */}
        <div className="lg:col-span-4">
          <GlassCard padding="md" className="space-y-4 h-full flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Trophy size={18} className="text-amber-400" />
                <h3 className="text-base font-bold text-foreground">Top Productos</h3>
              </div>
              <p className="text-xs text-muted-foreground mb-4">Más vendidos por volumen de ingreso</p>

              <div className="space-y-3">
                {topProducts.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-8 text-center">Sin ventas en este período</p>
                ) : (
                  topProducts.map((p, idx) => (
                    <div key={p.name} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-foreground truncate max-w-[170px]">
                          {idx + 1}. {p.name}
                        </span>
                        <span className="font-mono font-bold text-emerald-400">
                          {formatCurrency(p.totalRevenue)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                        <span>{p.quantity} unidades</span>
                      </div>
                      <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-emerald-500 h-full rounded-full"
                          style={{
                            width: `${(p.totalRevenue / (topProducts[0]?.totalRevenue || 1)) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Critical Stock Alert Box */}
            {criticalStocks.length > 0 && (
              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 mt-4">
                <div className="flex items-center gap-2 text-amber-400 text-xs font-bold mb-1">
                  <AlertTriangle size={15} />
                  <span>{criticalStocks.length} Artículos Bajo Mínimo</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Se recomienda revisar el módulo de inventario para resurtido.
                </p>
              </div>
            )}
          </GlassCard>
        </div>
      </div>

      {/* Orders Table */}
      <GlassCard padding="none" className="overflow-hidden">
        <div className="p-4 border-b border-border/40 flex items-center justify-between">
          <h3 className="font-bold text-foreground text-sm sm:text-base">
            Detalle de Ventas Registradas ({orders.length})
          </h3>
          <span className="text-xs text-muted-foreground">Ordenadas por fecha reciente</span>
        </div>

        <div className="overflow-x-auto scroll-modern">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="glass-table-header border-b border-border/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3.5">Folio</th>
                <th className="px-4 py-3.5">Fecha y Hora</th>
                <th className="px-4 py-3.5">Cliente</th>
                <th className="px-4 py-3.5">Método de Pago</th>
                <th className="px-4 py-3.5 text-right">Subtotal</th>
                <th className="px-4 py-3.5 text-right">IVA</th>
                <th className="px-4 py-3.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    Cargando ventas...
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    No hay ventas registradas en este período
                  </td>
                </tr>
              ) : (
                orders.map((o) => {
                  const clientName = o.client
                    ? `${o.client.first_name ?? ''} ${o.client.last_name ?? ''}`.trim()
                    : 'Público en General'

                  return (
                    <tr key={o.id_order} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-emerald-400">
                        #{o.order_number}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                        {formatDateTime(o.created_at)}
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-foreground">
                        {clientName}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground uppercase font-mono">
                        {o.payment_method || 'Efectivo'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">
                        {formatCurrency(Number(o.total_amount) - Number(o.tax_amount || 0))}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">
                        {formatCurrency(Number(o.tax_amount || 0))}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-emerald-400">
                        {formatCurrency(Number(o.total_amount))}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  )
}
