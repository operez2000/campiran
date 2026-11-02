'use client'

import { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { GlassCard } from '@/components/glass-card'
import { GlassButton } from '@/components/glass-button'
import { GlassInput } from '@/components/glass-input'
import {
  type Client,
  type SatPaymentCode,
  type SatPaymentMethodInfo,
  type PaymentBreakdownItem,
  type Profile,
} from '@/lib/types'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'
import {
  CreditCard, Banknote, ArrowRightLeft, CheckCircle2,
  AlertCircle, DollarSign, Plus, Trash2, X, Receipt, Building2, HelpCircle, FileText,
  UserCheck, Wrench, Percent, AlertTriangle, Users
} from 'lucide-react'

export const SAT_PAYMENT_METHODS: SatPaymentMethodInfo[] = [
  { code: '01', label: 'Efectivo', description: 'Moneda nacional o extranjera (MXN / USD)' },
  { code: '04', label: 'Tarjeta de Crédito', description: 'Visa, Mastercard, Amex' },
  { code: '28', label: 'Tarjeta de Débito', description: 'Pagos con datáfono / terminal bancaria' },
  { code: '03', label: 'Transferencia', description: 'SPEI / Depósito electrónico' },
  { code: '02', label: 'Cheque', description: 'Cheque nominativo' },
  { code: '99', label: 'Por Definir (Crédito)', description: 'Venta a cuenta de crédito del cliente', isCredit: true },
]

interface PosPaymentModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  totalAmountMxn: number
  exchangeRate?: number
  selectedClient: Client | null
  isSubmitting?: boolean
  onConfirmPayment: (payload: {
    primaryMethod: SatPaymentCode
    payments: PaymentBreakdownItem[]
    cashReceivedMxn: number
    cashReceivedUsd: number
    changeMxn: number
    changeUsd: number
    exchangeRate: number
    notes?: string
  }) => void
  // Comisiones
  hasProducts?: boolean
  hasServices?: boolean
  selectedSellerId?: string | null
  selectedTechnicianId?: string | null
  onSellerChange?: (sellerId: string | null) => void
  onTechnicianChange?: (techId: string | null) => void
  employees?: Profile[]
}

export function PosPaymentModal({
  open,
  onOpenChange,
  totalAmountMxn,
  exchangeRate = 19.0,
  selectedClient,
  isSubmitting = false,
  onConfirmPayment,
  hasProducts = false,
  hasServices = false,
  selectedSellerId = null,
  selectedTechnicianId = null,
  onSellerChange,
  onTechnicianChange,
  employees = [],
}: PosPaymentModalProps) {
  // Active payment entries
  const [payments, setPayments] = useState<PaymentBreakdownItem[]>([])

  // Current entry input fields
  const [selectedMethod, setSelectedMethod] = useState<SatPaymentCode>('01')
  const [inputCurrency, setInputCurrency] = useState<'MXN' | 'USD'>('MXN')
  const [inputAmount, setInputAmount] = useState<string>('')
  const [inputRef, setInputRef] = useState<string>('')
  const [notes, setNotes] = useState<string>('')
  const [customCashAmount, setCustomCashAmount] = useState<string>('')

  // Reset or initialize on open
  useEffect(() => {
    if (open) {
      // Default initial payment: full amount in cash
      setPayments([
        {
          method: '01',
          amountMxn: totalAmountMxn,
          currency: 'MXN',
        },
      ])
      setSelectedMethod('01')
      setInputCurrency('MXN')
      setInputAmount('')
      setInputRef('')
      setNotes('')
      setCustomCashAmount('')
    }
  }, [open, totalAmountMxn])

  // Total paid calculation (all converted to MXN)
  const totalPaidMxn = useMemo(() => {
    return payments.reduce((acc, p) => acc + (p.amountMxn || 0), 0)
  }, [payments])

  // Remaining or change
  const remainingMxn = Math.max(0, totalAmountMxn - totalPaidMxn)
  const changeMxn = Math.max(0, totalPaidMxn - totalAmountMxn)
  const changeUsd = exchangeRate > 0 ? changeMxn / exchangeRate : 0

  // Cash received breakdown
  const cashReceivedMxn = useMemo(() => {
    return payments
      .filter((p) => p.method === '01' && p.currency === 'MXN')
      .reduce((acc, p) => acc + p.amountMxn, 0)
  }, [payments])

  const cashReceivedUsd = useMemo(() => {
    return payments
      .filter((p) => p.method === '01' && p.currency === 'USD')
      .reduce((acc, p) => acc + (p.amountUsd || p.amountMxn / exchangeRate), 0)
  }, [payments, exchangeRate])

  // Primary payment method (the one with the largest amount)
  const primaryMethod = useMemo((): SatPaymentCode => {
    if (payments.length === 0) return '01'
    const byMethod: Record<string, number> = {}
    payments.forEach((p) => {
      byMethod[p.method] = (byMethod[p.method] || 0) + p.amountMxn
    })
    let highestMethod: SatPaymentCode = '01'
    let highestAmount = -1
    Object.entries(byMethod).forEach(([code, amt]) => {
      if (amt > highestAmount) {
        highestAmount = amt
        highestMethod = code as SatPaymentCode
      }
    })
    return highestMethod
  }, [payments])

  // Current MXN cash amount in payments list
  const currentCashMxn = useMemo(() => {
    const cashItem = payments.find((p) => p.method === '01' && p.currency === 'MXN')
    return cashItem ? cashItem.amountMxn : 0
  }, [payments])

  // Common Mexican bills and rounded presets
  const suggestedPresets = useMemo(() => {
    const commonBills = [50, 100, 200, 500, 1000]
    const rounded = [
      Math.ceil(totalAmountMxn / 50) * 50,
      Math.ceil(totalAmountMxn / 100) * 100,
    ]
    const combined = Array.from(new Set([...rounded, ...commonBills]))
      .filter((v) => v > totalAmountMxn)
      .sort((a, b) => a - b)
    return combined.slice(0, 4)
  }, [totalAmountMxn])

  // Apply a preset or custom cash amount to payments
  const handleApplyCashAmount = (amount: number, isCustom = false) => {
    if (isCustom) {
      setCustomCashAmount(amount > 0 ? amount.toString() : '')
    } else {
      setCustomCashAmount(amount === totalAmountMxn ? '' : amount.toString())
    }

    setPayments((prev) => {
      const nonCash = prev.filter((p) => !(p.method === '01' && p.currency === 'MXN'))
      if (amount <= 0 && nonCash.length > 0) {
        return nonCash
      }
      return [
        ...nonCash,
        {
          method: '01',
          amountMxn: Math.max(0, amount),
          currency: 'MXN',
        },
      ]
    })
  }

  // Handle free-form cash input change ("Paga con: $")
  const handleCustomCashInputChange = (val: string) => {
    setCustomCashAmount(val)
    const num = parseFloat(val)
    if (!isNaN(num) && num >= 0) {
      setPayments((prev) => {
        const nonCash = prev.filter((p) => !(p.method === '01' && p.currency === 'MXN'))
        return [
          ...nonCash,
          {
            method: '01',
            amountMxn: num,
            currency: 'MXN',
          },
        ]
      })
    } else if (val === '') {
      // Revert back to exact total if single payment
      setPayments((prev) => {
        const nonCash = prev.filter((p) => !(p.method === '01' && p.currency === 'MXN'))
        const coveredByOther = nonCash.reduce((acc, p) => acc + (p.amountMxn || 0), 0)
        const defaultCash = Math.max(0, totalAmountMxn - coveredByOther)
        return [
          ...nonCash,
          {
            method: '01',
            amountMxn: defaultCash,
            currency: 'MXN',
          },
        ]
      })
    }
  }

  // Add a new payment line
  const handleAddPayment = () => {
    const rawNum = Number(inputAmount)
    if (!rawNum || rawNum <= 0) {
      toast.error('Ingresa un monto válido')
      return
    }

    let mxnEquivalent = rawNum
    let usdAmount: number | undefined = undefined

    if (inputCurrency === 'USD') {
      usdAmount = rawNum
      mxnEquivalent = rawNum * exchangeRate
    }

    // Check if adding to existing method or new entry
    setPayments((prev) => [
      ...prev,
      {
        method: selectedMethod,
        amountMxn: mxnEquivalent,
        amountUsd: usdAmount,
        currency: inputCurrency,
        reference: inputRef.trim() || undefined,
      },
    ])

    setInputAmount('')
    setInputRef('')
  }

  // Remove payment line
  const handleRemovePayment = (index: number) => {
    const item = payments[index]
    if (item && item.method === '01' && item.currency === 'MXN') {
      setCustomCashAmount('')
    }
    setPayments((prev) => prev.filter((_, idx) => idx !== index))
  }

  // Submit order payment
  const handleConfirm = () => {
    if (totalPaidMxn < totalAmountMxn) {
      toast.error(
        `Faltan ${formatCurrency(remainingMxn)} por cubrir. Agrega otro método de pago.`
      )
      return
    }

    if (hasProducts && !selectedSellerId) {
      toast.error('Debes seleccionar el Vendedor de productos para completar la venta.')
      return
    }

    if (hasServices && !selectedTechnicianId) {
      toast.error('Debes seleccionar el Técnico del servicio para completar la venta.')
      return
    }

    onConfirmPayment({
      primaryMethod,
      payments,
      cashReceivedMxn,
      cashReceivedUsd,
      changeMxn,
      changeUsd,
      exchangeRate,
      notes: notes.trim() || undefined,
    })
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-md overflow-hidden">
          {/* Backdrop click */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0"
            onClick={() => !isSubmitting && onOpenChange(false)}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            className="glass-card border-border/50 rounded-2xl sm:rounded-3xl max-w-2xl w-full relative z-10 overflow-hidden shadow-2xl flex flex-col h-[calc(100dvh-1rem)] sm:h-auto sm:max-h-[min(88vh,calc(100dvh-2rem))]"
          >
            {/* Header Fijo */}
            <div className="flex items-center justify-between border-b border-border/40 px-4 py-3 sm:px-6 sm:py-4 bg-card/95 dark:bg-card/90 backdrop-blur-xl shrink-0 z-10">
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 pr-2">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20 shrink-0">
                  <Receipt size={18} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-bold text-foreground truncate">
                    Procesar Pago
                  </h3>
                  <p className="text-[11px] text-muted-foreground truncate">
                    Cliente:{' '}
                    <span className="font-semibold text-foreground">
                      {selectedClient
                        ? `${selectedClient.first_name || ''} ${selectedClient.last_name || ''}`.trim()
                        : 'Público en General'}
                    </span>{' '}
                    · TC: <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">${exchangeRate.toFixed(2)}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isSubmitting && onOpenChange(false)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors shrink-0"
              >
                <X size={18} />
              </button>
            </div>

            {/* Cuerpo desplazable */}
            <div className="flex-1 min-h-0 overflow-y-auto scroll-modern p-4 sm:p-6 space-y-4">
              {/* Total Display Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4 p-3 rounded-2xl bg-white/90 dark:bg-white/[0.03] border border-zinc-200/80 dark:border-border/40 shadow-xs shrink-0">
              <div className="flex flex-col justify-center">
                <span className="text-[10px] font-medium text-muted-foreground block">Total a Pagar</span>
                <span className="text-base font-bold text-foreground font-mono">
                  {formatCurrency(totalAmountMxn)}
                </span>
                <span className="text-[10px] text-muted-foreground/70 block">
                  ≈ ${(totalAmountMxn / exchangeRate).toFixed(2)} USD
                </span>
              </div>

              <div className="flex flex-col justify-center">
                <span className="text-[10px] font-medium text-muted-foreground block">Monto Cubierto</span>
                <span
                  className={`text-base font-bold font-mono ${
                    totalPaidMxn >= totalAmountMxn
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {formatCurrency(totalPaidMxn)}
                </span>
              </div>

              <div className="flex flex-col justify-center">
                <span className="text-[10px] font-medium text-muted-foreground block">Restante</span>
                <span
                  className={`text-base font-bold font-mono ${
                    remainingMxn > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground/60'
                  }`}
                >
                  {formatCurrency(remainingMxn)}
                </span>
              </div>

              {/* Cambio a Regresar: High contrast highlight box */}
              <div
                className={`p-2 sm:p-2.5 pl-3 rounded-xl border transition-all flex flex-col justify-center ${
                  changeMxn > 0
                    ? 'bg-gradient-to-br from-emerald-600 to-teal-700 text-white border-emerald-500 shadow-md shadow-emerald-600/20 dark:from-emerald-600/40 dark:to-teal-700/30 dark:border-emerald-500/50 dark:text-emerald-100'
                    : 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/25 text-emerald-950 dark:text-emerald-300'
                }`}
              >
                <span
                  className={`text-[10px] font-bold block tracking-wide ${
                    changeMxn > 0
                      ? 'text-emerald-100 dark:text-emerald-200'
                      : 'text-emerald-800 dark:text-emerald-400'
                  }`}
                >
                  Cambio a Regresar
                </span>
                <span
                  className={`text-lg font-black font-mono block leading-tight ${
                    changeMxn > 0
                      ? 'text-white dark:text-emerald-100'
                      : 'text-emerald-900 dark:text-emerald-300'
                  }`}
                >
                  {formatCurrency(changeMxn)}
                </span>
                <span
                  className={`text-[10px] font-bold font-mono block ${
                    changeMxn > 0
                      ? 'text-emerald-100/90 dark:text-emerald-300/90'
                      : 'text-emerald-700/80 dark:text-emerald-400/80'
                  }`}
                >
                  ≈ ${changeUsd.toFixed(2)} USD
                </span>
              </div>
            </div>

            {/* Main Area: Existing Payment Lines + New Payment Form */}
            <div className="space-y-3">
              {/* Payment Lines List */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                  <span>Desglose de Pagos Registrados</span>
                  <span className="text-[11px] text-emerald-400 font-mono">
                    Forma Principal SAT: [{primaryMethod}]{' '}
                    {SAT_PAYMENT_METHODS.find((m) => m.code === primaryMethod)?.label}
                  </span>
                </div>

                {payments.length === 0 ? (
                  <div className="p-4 rounded-xl border border-dashed border-border/40 text-center text-xs text-muted-foreground">
                    No has agregado ninguna forma de pago aún.
                  </div>
                ) : (
                  payments.map((p, idx) => {
                    const info = SAT_PAYMENT_METHODS.find((m) => m.code === p.method)
                    const isPrimary = p.method === primaryMethod

                    return (
                      <div
                        key={idx}
                        className={`p-2.5 rounded-xl border flex items-center justify-between text-xs transition-colors ${
                          isPrimary
                            ? 'border-emerald-500/40 bg-emerald-500/10'
                            : 'border-border/30 bg-white/[0.02]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="px-1.5 py-0.5 rounded bg-black/40 font-mono text-[10px] font-bold text-emerald-400 shrink-0">
                            SAT {p.method}
                          </span>
                          <div className="min-w-0">
                            <span className="font-bold text-foreground block truncate">
                              {info?.label || 'Otro'}
                              {isPrimary && (
                                <span className="ml-2 text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-semibold">
                                  Mayor Importe
                                </span>
                              )}
                            </span>
                            {p.reference && (
                              <span className="text-[10px] text-muted-foreground truncate block">
                                Ref: {p.reference}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <span className="font-mono font-bold text-foreground block">
                              {formatCurrency(p.amountMxn)}
                            </span>
                            {p.currency === 'USD' && (
                              <span className="text-[10px] font-mono text-teal-400 block">
                                (${p.amountUsd?.toFixed(2)} USD)
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemovePayment(idx)}
                            className="p-1 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                            title="Eliminar este pago"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              {/* Quick Cash Presets & Captura Libre de Efectivo */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-muted-foreground block">
                    Atajos de Efectivo Rápido (MXN):
                  </span>
                  <span className="text-[10px] text-muted-foreground/75 hidden sm:inline">
                    Selecciona un billete o ingresa el monto recibido
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Botón Exacto */}
                  <button
                    type="button"
                    onClick={() => handleApplyCashAmount(totalAmountMxn)}
                    className={`px-2.5 py-1 rounded-xl text-xs font-semibold border transition-all ${
                      currentCashMxn === totalAmountMxn && !customCashAmount
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-800 dark:text-emerald-300 font-bold shadow-xs'
                        : 'glass border-border/40 hover:border-emerald-500/40 text-foreground'
                    }`}
                  >
                    Exacto ({formatCurrency(totalAmountMxn)})
                  </button>

                  {/* Billetes / Montos sugeridos */}
                  {suggestedPresets.map((preset) => {
                    const isSelected = currentCashMxn === preset && customCashAmount === preset.toString()
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => handleApplyCashAmount(preset)}
                        className={`px-2.5 py-1 rounded-xl text-xs font-mono font-semibold border transition-all ${
                          isSelected
                            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-800 dark:text-emerald-300 font-bold shadow-xs'
                            : 'glass border-border/40 hover:border-emerald-500/40 text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {formatCurrency(preset)}
                      </button>
                    )
                  })}

                  {/* Captura Libre de Importe ("Paga con:") */}
                  <div className="flex items-center gap-1.5 bg-white/80 dark:bg-white/[0.04] px-2.5 py-1 rounded-xl border border-zinc-200 dark:border-border/60 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500/30 transition-all shadow-xs">
                    <span className="text-[11px] font-bold text-foreground/80 whitespace-nowrap flex items-center gap-1">
                      <Banknote size={13} className="text-emerald-600 dark:text-emerald-400" />
                      <span>Paga con: $</span>
                    </span>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="Otro importe..."
                      value={customCashAmount}
                      onChange={(e) => handleCustomCashInputChange(e.target.value)}
                      onFocus={(e) => e.target.select()}
                      className="w-24 sm:w-28 text-xs font-mono font-bold text-foreground bg-transparent focus:outline-none placeholder:font-sans placeholder:font-normal placeholder:text-muted-foreground/50"
                    />
                    {customCashAmount && (
                      <button
                        type="button"
                        onClick={() => handleCustomCashInputChange('')}
                        className="p-0.5 text-muted-foreground hover:text-foreground rounded transition-colors"
                        title="Restablecer importe exacto"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Add Payment Form (Pago Mixto o Divisa) */}
              <GlassCard padding="sm" className="space-y-3 mt-2 border-border/40">
                <span className="text-xs font-bold text-foreground block">
                  Agregar Forma de Pago Adicional (Pago Mixto / Dólares)
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {/* Select SAT Method */}
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-1">
                      Método SAT
                    </label>
                    <select
                      value={selectedMethod}
                      onChange={(e) => setSelectedMethod(e.target.value as SatPaymentCode)}
                      className="w-full glass-input px-2.5 py-2 text-xs text-foreground bg-transparent focus:outline-none"
                    >
                      {SAT_PAYMENT_METHODS.map((m) => {
                        const isPublico =
                          !selectedClient ||
                          `${selectedClient.first_name || ''} ${selectedClient.last_name || ''}`
                            .trim()
                            .toLowerCase()
                            .normalize('NFD')
                            .replace(/[\u0300-\u036f]/g, '') === 'publico en general'
                        return (
                          <option
                            key={m.code}
                            value={m.code}
                            className="bg-zinc-900 text-white"
                            disabled={m.isCredit && isPublico}
                          >
                            {m.code} - {m.label} {m.isCredit && isPublico ? '(Solo cliente)' : ''}
                          </option>
                        )
                      })}
                    </select>
                  </div>

                  {/* Currency (MXN or USD) */}
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-1">Moneda</label>
                    <div className="grid grid-cols-2 gap-1">
                      <button
                        type="button"
                        onClick={() => setInputCurrency('MXN')}
                        className={`py-1.5 rounded-lg text-xs font-bold transition-all ${
                          inputCurrency === 'MXN'
                            ? 'bg-emerald-500 text-white shadow-md'
                            : 'glass text-muted-foreground'
                        }`}
                      >
                        MXN ($)
                      </button>
                      <button
                        type="button"
                        onClick={() => setInputCurrency('USD')}
                        className={`py-1.5 rounded-lg text-xs font-bold transition-all ${
                          inputCurrency === 'USD'
                            ? 'bg-teal-500 text-white shadow-md'
                            : 'glass text-muted-foreground'
                        }`}
                      >
                        USD ($)
                      </button>
                    </div>
                  </div>

                  {/* Amount Input */}
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-1">
                      Monto a Ingresar
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        step="0.01"
                        placeholder={
                          remainingMxn > 0
                            ? inputCurrency === 'USD'
                              ? (remainingMxn / exchangeRate).toFixed(2)
                              : remainingMxn.toFixed(2)
                            : '0.00'
                        }
                        value={inputAmount}
                        onChange={(e) => setInputAmount(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddPayment()}
                        className="glass-input w-full px-2.5 py-2 text-xs font-mono font-bold text-foreground"
                      />
                      <GlassButton variant="primary" size="sm" onClick={handleAddPayment}>
                        <Plus size={14} />
                      </GlassButton>
                    </div>
                  </div>
                </div>

                {/* Optional Reference */}
                <div className="pt-1">
                  <input
                    type="text"
                    placeholder="Referencia bancaria / últimos 4 dígitos tarjeta (opcional)..."
                    value={inputRef}
                    onChange={(e) => setInputRef(e.target.value)}
                    className="glass-input w-full px-2.5 py-1.5 text-[11px] text-muted-foreground placeholder:text-muted-foreground/60"
                  />
                </div>
              </GlassCard>

              {/* Asignación de Comisiones (Vendedor / Técnico) */}
              {(hasProducts || hasServices) && (
                <GlassCard
                  padding="sm"
                  className={`space-y-2.5 border transition-all ${
                    (hasProducts && !selectedSellerId) || (hasServices && !selectedTechnicianId)
                      ? 'border-amber-500/50 bg-amber-500/5 ring-1 ring-amber-500/30'
                      : 'border-border/40'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                    <span className="flex items-center gap-1.5">
                      <UserCheck size={15} className="text-emerald-400" />
                      <span>Personal y Comisiones de la Venta</span>
                    </span>
                    {(hasProducts && !selectedSellerId) || (hasServices && !selectedTechnicianId) ? (
                      <span className="text-[11px] text-amber-400 flex items-center gap-1 font-medium animate-pulse">
                        <AlertTriangle size={12} />
                        Asignación pendiente
                      </span>
                    ) : (
                      <span className="text-[10px] text-emerald-400 font-medium">✓ Personal asignado</span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {/* Vendedor de productos */}
                    {hasProducts ? (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-semibold text-muted-foreground">
                            Vendedor (Artículos) *
                          </label>
                          {selectedSellerId && (
                            <span className="text-[10px] text-emerald-400 font-mono font-bold">
                              {employees.find((e) => e.id === selectedSellerId)?.sales_commission_pct ?? 0}% com.
                            </span>
                          )}
                        </div>
                        <select
                          value={selectedSellerId || ''}
                          onChange={(e) => onSellerChange?.(e.target.value || null)}
                          className={`w-full glass-input px-2.5 py-1.5 text-xs text-foreground bg-transparent focus:outline-none transition-colors ${
                            !selectedSellerId ? 'border-amber-500/80 bg-amber-500/10' : ''
                          }`}
                        >
                          <option value="" className="bg-zinc-900 text-white">
                            -- Seleccionar Vendedor * --
                          </option>
                          {employees.map((emp) => (
                            <option key={emp.id} value={emp.id} className="bg-zinc-900 text-white">
                              {emp.full_name || emp.email} ({emp.sales_commission_pct ?? 0}% prod)
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div className="p-2 rounded-xl bg-white/[0.02] border border-border/20 text-[11px] text-muted-foreground/70 flex items-center justify-center">
                        Sin artículos (no requiere vendedor)
                      </div>
                    )}

                    {/* Técnico de servicios */}
                    {hasServices ? (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                            <Wrench size={12} className="text-indigo-400" />
                            <span>Técnico (Servicio) *</span>
                          </label>
                          <div className="flex items-center gap-1.5">
                            {selectedSellerId && (
                              <button
                                type="button"
                                onClick={() => onTechnicianChange?.(selectedSellerId)}
                                className="text-[10px] text-indigo-400 hover:text-indigo-300 underline font-medium cursor-pointer"
                                title="Copiar el mismo vendedor como técnico"
                              >
                                Mismo vendedor
                              </button>
                            )}
                            {selectedTechnicianId && (
                              <span className="text-[10px] text-indigo-300 font-mono font-bold">
                                {employees.find((e) => e.id === selectedTechnicianId)?.service_commission_pct ?? 0}% com.
                              </span>
                            )}
                          </div>
                        </div>
                        <select
                          value={selectedTechnicianId || ''}
                          onChange={(e) => onTechnicianChange?.(e.target.value || null)}
                          className={`w-full glass-input px-2.5 py-1.5 text-xs text-foreground bg-transparent focus:outline-none transition-colors ${
                            !selectedTechnicianId ? 'border-amber-500/80 bg-amber-500/10' : ''
                          }`}
                        >
                          <option value="" className="bg-zinc-900 text-white">
                            -- Seleccionar Técnico * --
                          </option>
                          {employees.map((emp) => (
                            <option key={emp.id} value={emp.id} className="bg-zinc-900 text-white">
                              {emp.full_name || emp.email} ({emp.service_commission_pct ?? 0}% serv)
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div className="p-2 rounded-xl bg-white/[0.02] border border-border/20 text-[11px] text-muted-foreground/70 flex items-center justify-center">
                        Sin servicios (no requiere técnico)
                      </div>
                    )}
                  </div>
                </GlassCard>
              )}

              {/* Observaciones de la Venta (Texto libre - se guardará y se imprimirá en ticket) */}
              <GlassCard padding="sm" className="space-y-1.5 border-border/40">
                <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                  <span className="flex items-center gap-1.5">
                    <FileText size={14} className="text-emerald-500" />
                    Observaciones de la Venta
                  </span>
                  <span className="text-[10px] text-muted-foreground font-normal">
                    Se imprimirá en el ticket
                  </span>
                </div>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Escribe observaciones o comentarios (ej. Entrega a domicilio, folio de vale, observaciones de entrega)..."
                  className="glass-input w-full px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 resize-none focus:ring-1 focus:ring-emerald-500/50"
                />
              </GlassCard>
            </div>
            </div>

            {/* Footer Fijo y Visible */}
            <div className="border-t border-border/40 p-3 sm:p-4 bg-card/95 dark:bg-card/90 backdrop-blur-xl shrink-0 z-20 shadow-lg">
              <div className="flex items-center justify-between gap-2.5 sm:gap-4">
                <div className="flex items-center gap-2 min-w-0">
                  <GlassButton
                    variant="ghost"
                    size="sm"
                    onClick={() => onOpenChange(false)}
                    disabled={isSubmitting}
                    className="px-3 shrink-0"
                  >
                    Cancelar
                  </GlassButton>

                  {/* Indicador rápido de estado de pago */}
                  {remainingMxn > 0 ? (
                    <span className="hidden xs:inline-flex sm:inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 dark:text-rose-400 bg-rose-100 dark:bg-rose-500/10 border border-rose-300 dark:border-rose-500/20 px-2.5 py-1 rounded-xl truncate">
                      Falta: {formatCurrency(remainingMxn)}
                    </span>
                  ) : changeMxn > 0 ? (
                    <span className="hidden xs:inline-flex sm:inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-500/20 border border-emerald-300 dark:border-emerald-500/30 px-2.5 py-1 rounded-xl truncate shadow-xs">
                      Cambio: {formatCurrency(changeMxn)}
                    </span>
                  ) : (
                    <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 dark:text-emerald-400 bg-emerald-100/70 dark:bg-emerald-500/10 border border-emerald-300/70 dark:border-emerald-500/20 px-2.5 py-1 rounded-xl">
                      Pago exacto
                    </span>
                  )}
                </div>

                <GlassButton
                  variant="primary"
                  size="md"
                  disabled={isSubmitting}
                  onClick={handleConfirm}
                  className={`flex-1 sm:flex-initial px-5 sm:px-7 font-bold py-2.5 sm:py-3 shadow-lg shadow-emerald-500/25 transition-all text-xs sm:text-sm ${
                    totalPaidMxn < totalAmountMxn ||
                    Boolean(hasProducts && !selectedSellerId) ||
                    Boolean(hasServices && !selectedTechnicianId)
                      ? 'opacity-85 hover:opacity-100 ring-1 ring-amber-500/40'
                      : ''
                  }`}
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2 shrink-0" />
                      <span>Registrando Venta...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={17} className="mr-2 shrink-0" />
                      <span>Completar Cobro</span>
                      <span className="ml-1.5 font-mono">({formatCurrency(totalAmountMxn)})</span>
                    </>
                  )}
                </GlassButton>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
