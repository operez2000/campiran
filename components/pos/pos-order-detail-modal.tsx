'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { GlassButton } from '@/components/glass-button'
import { StatusBadge } from '@/components/status-badge'
import { type Order } from '@/lib/types'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import {
  X,
  Printer,
  RotateCcw,
  ShieldAlert,
  User,
  Calendar,
  CreditCard,
  Package,
  FileText,
  Building,
  CheckCircle2,
  Clock,
  KeyRound,
  Fingerprint,
  Camera
} from 'lucide-react'

interface PosOrderDetailModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  order: Order | null
  onInitiateCancel?: (order: Order) => void
}

export function PosOrderDetailModal({
  open,
  onOpenChange,
  order,
  onInitiateCancel,
}: PosOrderDetailModalProps) {
  if (!open || !order) return null

  const isCancelled = order.status === 'cancelled'

  const handlePrint = () => {
    window.print()
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 15 }}
          className="glass-card border-border/50 rounded-2xl sm:rounded-3xl max-w-2xl w-full relative overflow-hidden shadow-2xl max-h-[92dvh] sm:max-h-[90vh] flex flex-col print:m-0 print:p-4 print:shadow-none print:border-none"
        >
          {/* Header Fijo */}
          <div className="flex items-center justify-between border-b border-border/40 px-4 py-3 sm:px-6 sm:py-4 bg-card/95 dark:bg-card/90 backdrop-blur-xl shrink-0 z-10 print:static print:p-0">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 pr-2">
              <div
                className={`w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-lg shrink-0 ${
                  isCancelled
                    ? 'bg-gradient-to-br from-rose-500 to-red-600 shadow-rose-500/25'
                    : 'bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/25'
                }`}
              >
                {isCancelled ? <ShieldAlert size={20} /> : <FileText size={20} />}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm sm:text-base font-bold text-foreground truncate">
                    Detalle de Venta #{order.order_number}
                  </h3>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      isCancelled
                        ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                        : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                    }`}
                  >
                    {isCancelled ? 'CANCELADA' : 'COMPLETADA'}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 truncate">
                  <Calendar size={12} />
                  {formatDateTime(order.created_at)}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors shrink-0 print:hidden"
            >
              <X size={18} />
            </button>
          </div>

          {/* Cuerpo desplazable */}
          <div className="flex-1 min-h-0 overflow-y-auto scroll-modern p-4 sm:p-6 space-y-4">
            {/* Banner de Cancelación si aplica */}
            {isCancelled && (
              <div className="p-4 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-xs space-y-2 text-rose-300">
                <div className="flex items-center gap-2 font-bold text-rose-400 text-sm">
                  <ShieldAlert size={18} />
                  <span>Esta venta fue cancelada</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-rose-500/20">
                  <div>
                    <span className="text-muted-foreground block text-[10px]">Autorizado por:</span>
                    <span className="font-semibold text-foreground text-xs">
                      {order.cancelled_by_name || 'Supervisor'}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px]">Fecha de cancelación:</span>
                    <span className="font-semibold text-foreground text-xs">
                      {order.cancelled_at ? formatDateTime(order.cancelled_at) : 'N/D'}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px]">Método de autorización:</span>
                    <span className="font-semibold text-foreground text-xs flex items-center gap-1">
                      {order.cancellation_auth_method === 'pin' && (
                        <>
                          <KeyRound size={13} className="text-amber-400" /> PIN de Seguridad
                        </>
                      )}
                      {order.cancellation_auth_method === 'webauthn' && (
                        <>
                          <Fingerprint size={13} className="text-emerald-400" /> Sensor WebAuthn (Touch/Face ID)
                        </>
                      )}
                      {order.cancellation_auth_method === 'face' && (
                        <>
                          <Camera size={13} className="text-blue-400" /> Biometría Facial
                        </>
                      )}
                      {!order.cancellation_auth_method && 'Credencial de Supervisor'}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px]">Motivo:</span>
                    <span className="font-semibold text-foreground text-xs">
                      {order.cancellation_reason || 'Sin motivo especificado'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Datos del Cliente y Pago */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3.5 rounded-2xl bg-white/5 border border-border/30 text-xs space-y-1">
                <span className="text-muted-foreground font-semibold flex items-center gap-1.5 text-[11px]">
                  <User size={13} className="text-emerald-400" /> Cliente
                </span>
                <p className="font-bold text-foreground text-sm">
                  {order.client
                    ? `${order.client.first_name || ''} ${order.client.last_name || ''}`.trim()
                    : 'Público en General'}
                </p>
                {order.client?.rfc && (
                  <p className="text-muted-foreground text-[11px]">RFC: {order.client.rfc}</p>
                )}
                {order.client?.phone && (
                  <p className="text-muted-foreground text-[11px]">Tel: {order.client.phone}</p>
                )}
              </div>

              <div className="p-3.5 rounded-2xl bg-white/5 border border-border/30 text-xs space-y-1">
                <span className="text-muted-foreground font-semibold flex items-center gap-1.5 text-[11px]">
                  <CreditCard size={13} className="text-emerald-400" /> Pago
                </span>
                <p className="font-bold text-foreground capitalize">
                  {order.payment_method === 'cash'
                    ? 'Efectivo'
                    : order.payment_method === 'card'
                    ? 'Tarjeta'
                    : order.payment_method === 'transfer'
                    ? 'Transferencia'
                    : order.payment_method || 'General'}
                  {order.payment_sat_code && ` (SAT: ${order.payment_sat_code})`}
                </p>
                {order.payment_reference && (
                  <p className="text-muted-foreground text-[11px] truncate">
                    Ref: {order.payment_reference}
                  </p>
                )}
              </div>
            </div>

            {/* Tabla de Artículos */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Package size={14} className="text-emerald-400" /> Artículos Vendidos (
                  {order.order_items?.length || 0})
                </h4>
              </div>

              <div className="rounded-2xl border border-border/40 overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="glass-table-header text-muted-foreground border-b border-border/30">
                    <tr>
                      <th className="py-2.5 px-3 font-semibold">Producto / Concepto</th>
                      <th className="py-2.5 px-3 font-semibold text-center">Cant.</th>
                      <th className="py-2.5 px-3 font-semibold text-right">P. Unit.</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {order.order_items && order.order_items.length > 0 ? (
                      order.order_items.map((line) => (
                        <tr key={line.id_order_item} className="hover:bg-white/5">
                          <td className="py-2.5 px-3">
                            <span className="font-medium text-foreground block">
                              {line.item?.description || 'Artículo'}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-mono">
                              {line.item?.code || line.item?.barcode || 'S/C'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center font-bold text-foreground">
                            {line.quantity}
                          </td>
                          <td className="py-2.5 px-3 text-right text-muted-foreground">
                            {formatCurrency(line.unit_price)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-semibold text-foreground">
                            {formatCurrency(line.total_price)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="py-4 text-center text-muted-foreground text-xs">
                          Sin partidas registradas
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Totales */}
            <div className="p-3.5 rounded-2xl bg-white/5 border border-border/30 space-y-1.5 text-xs">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal:</span>
                <span>{formatCurrency(Number(order.total_amount) - Number(order.tax_amount || 0))}</span>
              </div>
              {Number(order.tax_amount) > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Impuestos (IVA):</span>
                  <span>{formatCurrency(order.tax_amount)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-border/20 pt-2 text-base font-bold">
                <span className="text-foreground">Total:</span>
                <span className={isCancelled ? 'text-rose-400 line-through' : 'text-emerald-400'}>
                  {formatCurrency(order.total_amount)}
                </span>
              </div>
            </div>
          </div>

          {/* Footer Fijo */}
          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 border-t border-border/40 p-3 sm:p-4 bg-card/95 dark:bg-card/90 backdrop-blur-xl shrink-0 z-10 print:hidden">
            <div>
              {!isCancelled && onInitiateCancel && (
                <GlassButton
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    onOpenChange(false)
                    onInitiateCancel(order)
                  }}
                  className="w-full sm:w-auto gap-1.5"
                >
                  <RotateCcw size={15} />
                  <span>Cancelar Esta Venta</span>
                </GlassButton>
              )}
            </div>

            <div className="flex flex-col-reverse sm:flex-row items-center gap-2">
              <GlassButton type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
                Cerrar
              </GlassButton>
              <GlassButton type="button" variant="secondary" size="sm" onClick={handlePrint} className="w-full sm:w-auto">
                <Printer size={15} className="mr-1.5" />
                Imprimir Comprobante
              </GlassButton>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
