'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import { useStore } from '@/components/providers/store-provider'
import { GlassCard } from '@/components/glass-card'
import { GlassButton } from '@/components/glass-button'
import { GlassInput } from '@/components/glass-input'
import { StatusBadge } from '@/components/status-badge'
import { TableActionMenu, TableColumnHeader, TablePagination } from '@/components/tables'
import { LabelPrintModal } from '@/components/labels/label-print-modal'
import {
  type Purchase,
  type PurchaseCondition,
  type Supplier,
  type Location,
  type Item,
  type Stock,
  type Profile,
  type SupplierAccountSummary,
  type LabelPrintQueueItem,
} from '@/lib/types'
import { formatCurrency, formatDateTime, formatDate } from '@/lib/utils'
import {
  getPurchasesDataAction,
  createPurchaseAction,
  receiveDraftPurchaseAction,
  registerPurchasePaymentAction,
  cancelPurchaseAction,
} from './actions'
import { toast } from 'sonner'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import {
  ShoppingBag,
  Plus,
  Search,
  RefreshCw,
  Truck,
  MapPin,
  FileText,
  FileSpreadsheet,
  Check,
  X,
  AlertTriangle,
  ScanLine,
  ArrowRight,
  DollarSign,
  CreditCard,
  Clock,
  PackageCheck,
  Ban,
  Eye,
  Printer,
  Trash2,
  Sparkles,
  ArrowLeftRight,
  TrendingUp,
  TrendingDown,
  Wallet,
  CheckCircle2,
  History,
} from 'lucide-react'

interface ComprasClientProps {
  currentProfile: Profile
}

interface DraftPurchaseLine {
  item: Item
  currentStock: number
  quantity: number
  previousCost: number
  unitCost: number
  taxPercent: number
  discountAmount: number
  newPrice1: number | null
}

const SAT_PAYMENT_METHODS = [
  { code: '01', label: '01 - Efectivo' },
  { code: '03', label: '03 - Transferencia Electrónica (SPEI)' },
  { code: '02', label: '02 - Cheque Nominativo' },
  { code: '04', label: '04 - Tarjeta de Crédito' },
  { code: '28', label: '28 - Tarjeta de Débito' },
]

export function ComprasClient({ currentProfile }: ComprasClientProps) {
  const supabase = createClient()
  const { currentStore, storeId } = useStore()
  const isAdmin = currentProfile.role === 'ADMIN'

  // Tabs: 'historial' | 'nueva' | 'cuentas'
  const [activeTab, setActiveTab] = useState<'historial' | 'nueva' | 'cuentas'>('historial')

  // Data state
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [stocks, setStocks] = useState<Stock[]>([])
  const [loading, setLoading] = useState(true)

  // ── Filters & Table state for Historial ─────────────────────
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'RECEIVED' | 'DRAFT' | 'CANCELLED'>('ALL')
  const [conditionFilter, setConditionFilter] = useState<'ALL' | 'CONTADO' | 'CREDITO' | 'PENDING_PAY'>('ALL')
  const [sortKey, setSortKey] = useState<string>('purchase_date')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  // ── Filters & Table state for Cuentas por Pagar ─────────────
  const [apSearch, setApSearch] = useState('')
  const [apOnlyWithBalance, setApOnlyWithBalance] = useState(false)
  const [apSortKey, setApSortKey] = useState<string>('totalBalanceDue')
  const [apSortDirection, setApSortDirection] = useState<'asc' | 'desc'>('desc')
  const [apPage, setApPage] = useState(1)
  const [apPageSize, setApPageSize] = useState(25)

  // ── Nueva Compra (Capture State) ────────────────────────────
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('')
  const [selectedLocationId, setSelectedLocationId] = useState<string>('')
  const [invoiceNumber, setInvoiceNumber] = useState<string>('')
  const [purchaseMode, setPurchaseMode] = useState<'RECEIVED' | 'DRAFT'>('RECEIVED')
  const [paymentCondition, setPaymentCondition] = useState<PurchaseCondition>('CONTADO')
  const [paymentMethod, setPaymentMethod] = useState<string>('01')
  const [creditDays, setCreditDays] = useState<number>(0)
  const [initialPayment, setInitialPayment] = useState<number>(0)
  const [updateItemCost, setUpdateItemCost] = useState<boolean>(true)
  const [purchaseNotes, setPurchaseNotes] = useState<string>('')
  const [cartLines, setCartLines] = useState<DraftPurchaseLine[]>([])
  const [itemSearchQuery, setItemSearchQuery] = useState<string>('')
  const [submittingPurchase, setSubmittingPurchase] = useState<boolean>(false)
  const barcodeInputRef = useRef<HTMLInputElement>(null)

  // ── Modals State ────────────────────────────────────────────
  const [detailPurchase, setDetailPurchase] = useState<Purchase | null>(null)
  const [paymentPurchase, setPaymentPurchase] = useState<Purchase | null>(null)
  const [payAmount, setPayAmount] = useState<string>('')
  const [payMethod, setPayMethod] = useState<string>('03')
  const [payReference, setPayReference] = useState<string>('')
  const [payNotes, setPayNotes] = useState<string>('')
  const [savingPayment, setSavingPayment] = useState<boolean>(false)

  const [cancelPurchaseTarget, setCancelPurchaseTarget] = useState<Purchase | null>(null)
  const [cancelReason, setCancelReason] = useState<string>('')
  const [cancelling, setCancelling] = useState<boolean>(false)

  const [receivingPurchaseId, setReceivingPurchaseId] = useState<string | null>(null)

  // Label printing modal
  const [labelModalOpen, setLabelModalOpen] = useState(false)
  const [labelQueueItems, setLabelQueueItems] = useState<LabelPrintQueueItem[]>([])

  // ── Fetch All Data ──────────────────────────────────────────
  const fetchAllData = useCallback(async () => {
    if (!storeId) {
      setPurchases([])
      setStocks([])
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const res = await getPurchasesDataAction(storeId)
      setPurchases(res.purchases)
      setSuppliers(res.suppliers)
      setLocations(res.locations)
      setItems(res.items)
      setStocks(res.stocks)

      // Set default location if not selected yet
      if (res.locations.length > 0) {
        setSelectedLocationId((prev) =>
          prev && res.locations.some((l) => l.id_location === prev)
            ? prev
            : res.locations[0].id_location
        )
      } else {
        setSelectedLocationId('')
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Error al cargar datos del módulo de compras'
      )
    } finally {
      setLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    fetchAllData()
  }, [fetchAllData])

  // ── Realtime Subscriptions (100% Realtime) ──────────────────
  useEffect(() => {
    if (!storeId) return

    const channel = supabase
      .channel(`purchases-realtime-${storeId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'purchases', filter: `id_store=eq.${storeId}` },
        () => fetchAllData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'purchase_payments', filter: `id_store=eq.${storeId}` },
        () => fetchAllData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stocks', filter: `id_store=eq.${storeId}` },
        () => fetchAllData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions', filter: `id_store=eq.${storeId}` },
        () => fetchAllData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'items' },
        () => fetchAllData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'suppliers' },
        () => fetchAllData()
      )
      .subscribe()

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchAllData()
      }
    }
    window.addEventListener('visibilitychange', handleVisibility)

    return () => {
      supabase.removeChannel(channel)
      window.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [storeId, supabase, fetchAllData])

  // Map of current stock per item in the active store (and selected location if applicable)
  const stockByItemMap = useMemo(() => {
    const map = new Map<string, { current: number; minimum: number; maximum: number; reorder: number }>()
    for (const s of stocks) {
      if (!s.id_item) continue
      // If a location is selected, prioritize stock from that location or sum across store
      const existing = map.get(s.id_item)
      const cur = Number(s.current ?? 0)
      const min = Number(s.minimum ?? 0)
      const max = Number(s.maximum ?? 0)
      const reo = Number(s.reorder_point ?? 0)
      if (!existing) {
        map.set(s.id_item, { current: cur, minimum: min, maximum: max, reorder: reo })
      } else {
        map.set(s.id_item, {
          current: existing.current + cur,
          minimum: Math.max(existing.minimum, min),
          maximum: Math.max(existing.maximum, max),
          reorder: Math.max(existing.reorder, reo),
        })
      }
    }
    return map
  }, [stocks])

  // Low stock / reorder items in the active store
  const lowStockItems = useMemo(() => {
    return items.filter((it) => {
      if (it.type === 'S') return false
      const st = stockByItemMap.get(it.id_item)
      if (!st) return false
      const threshold = Math.max(st.minimum, st.reorder)
      return threshold > 0 && st.current <= threshold
    })
  }, [items, stockByItemMap])

  // Selected supplier object & credit metrics
  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s.id_supplier === selectedSupplierId) ?? null,
    [suppliers, selectedSupplierId]
  )

  // Auto-update credit days when supplier changes
  useEffect(() => {
    if (selectedSupplier) {
      setCreditDays(Number(selectedSupplier.credit_days || 0))
    } else {
      setCreditDays(0)
    }
  }, [selectedSupplier])

  // ── Supplier Accounts Payable Summary (Cuentas por Pagar) ───
  const supplierAccounts = useMemo<SupplierAccountSummary[]>(() => {
    const now = new Date()
    return suppliers.map((sup) => {
      const supPurchases = purchases.filter(
        (p) => p.id_supplier === sup.id_supplier && p.purchase_status !== 'CANCELLED'
      )
      let totalPurchasedAmount = 0
      let totalPaidAmount = 0
      let totalBalanceDue = 0
      let overdueCount = 0
      let overdueAmount = 0
      const pendingPurchases: Purchase[] = []

      for (const p of supPurchases) {
        const total = Number(p.total_amount || 0)
        const paid = Number(p.paid_amount || 0)
        const bal = Number(p.balance_due || 0)
        totalPurchasedAmount += total
        totalPaidAmount += paid
        totalBalanceDue += bal

        if (bal > 0.01) {
          pendingPurchases.push(p)
          if (p.due_date && new Date(p.due_date) < now) {
            overdueCount += 1
            overdueAmount += bal
          }
        }
      }

      const creditLimit = Number(sup.credit_limit || 0)
      const availableCredit = Math.max(0, creditLimit - totalBalanceDue)

      return {
        supplier: sup,
        totalPurchasesCount: supPurchases.length,
        totalPurchasedAmount,
        totalPaidAmount,
        totalBalanceDue,
        overdueCount,
        overdueAmount,
        availableCredit,
        pendingPurchases,
      }
    })
  }, [suppliers, purchases])

  const selectedSupplierAccount = useMemo(
    () => supplierAccounts.find((a) => a.supplier.id_supplier === selectedSupplierId) ?? null,
    [supplierAccounts, selectedSupplierId]
  )

  // ── KPIs Dashboard ──────────────────────────────────────────
  const kpis = useMemo(() => {
    let totalReceivedAmount = 0
    let receivedCount = 0
    let draftCount = 0
    let draftAmount = 0
    let totalPayableBalance = 0
    let overdueBalance = 0
    let totalUnitsEntered = 0
    const now = new Date()

    for (const p of purchases) {
      if (p.purchase_status === 'CANCELLED') continue

      const total = Number(p.total_amount || 0)
      const balance = Number(p.balance_due || 0)

      if (p.purchase_status === 'RECEIVED') {
        totalReceivedAmount += total
        receivedCount += 1
        for (const pi of p.purchase_items ?? []) {
          totalUnitsEntered += Number(pi.quantity || 0)
        }
      } else if (p.purchase_status === 'DRAFT') {
        draftCount += 1
        draftAmount += total
      }

      if (balance > 0.01) {
        totalPayableBalance += balance
        if (p.due_date && new Date(p.due_date) < now) {
          overdueBalance += balance
        }
      }
    }

    return {
      totalReceivedAmount,
      receivedCount,
      draftCount,
      draftAmount,
      totalPayableBalance,
      overdueBalance,
      totalUnitsEntered,
    }
  }, [purchases])

  // ── Add / Modify Items in Nueva Compra Cart ─────────────────
  const handleAddItemToPurchase = useCallback(
    (item: Item, suggestedQty = 1) => {
      const stockInfo = stockByItemMap.get(item.id_item)
      const currentStock = stockInfo?.current ?? 0
      const baseCost = Number(item.cost || item.last_cost || 0)
      const baseTax = Number(item.tax ?? 8)

      setCartLines((prev) => {
        const idx = prev.findIndex((l) => l.item.id_item === item.id_item)
        if (idx >= 0) {
          const updated = [...prev]
          updated[idx] = {
            ...updated[idx],
            quantity: updated[idx].quantity + suggestedQty,
          }
          return updated
        }
        return [
          ...prev,
          {
            item,
            currentStock,
            quantity: suggestedQty,
            previousCost: baseCost,
            unitCost: baseCost,
            taxPercent: baseTax,
            discountAmount: 0,
            newPrice1: item.price1 ?? item.price ?? null,
          },
        ]
      })
    },
    [stockByItemMap]
  )

  // Barcode / Quick Search Enter handler
  const handleBarcodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const q = itemSearchQuery.trim().toLowerCase()
    if (!q) return

    const exactMatch = items.find(
      (it) =>
        it.barcode?.toLowerCase() === q ||
        it.code?.toLowerCase() === q
    )

    if (exactMatch) {
      handleAddItemToPurchase(exactMatch, 1)
      setItemSearchQuery('')
      toast.success(`Agregado: ${exactMatch.description}`)
      return
    }

    const partialMatches = items.filter(
      (it) =>
        it.description?.toLowerCase().includes(q) ||
        it.code?.toLowerCase().includes(q) ||
        it.barcode?.toLowerCase().includes(q)
    )

    if (partialMatches.length === 1) {
      handleAddItemToPurchase(partialMatches[0], 1)
      setItemSearchQuery('')
      toast.success(`Agregado: ${partialMatches[0].description}`)
    } else if (partialMatches.length === 0) {
      toast.error('No se encontró ningún artículo con ese código o descripción')
    }
  }

  // Search results dropdown for item search
  const matchingCatalogItems = useMemo(() => {
    const q = itemSearchQuery.trim().toLowerCase()
    if (!q) return []
    return items
      .filter(
        (it) =>
          it.description?.toLowerCase().includes(q) ||
          it.code?.toLowerCase().includes(q) ||
          it.barcode?.toLowerCase().includes(q)
      )
      .slice(0, 8)
  }, [items, itemSearchQuery])

  // Load Low Stock / Reorder Items automatically
  const handleLoadLowStockItems = () => {
    if (lowStockItems.length === 0) {
      toast.message('Sin artículos bajo mínimo', {
        description: 'Todos los artículos de la sucursal están por encima de su stock mínimo.',
      })
      return
    }

    let addedCount = 0
    for (const it of lowStockItems) {
      const st = stockByItemMap.get(it.id_item)
      const cur = st?.current ?? 0
      const min = st?.minimum ?? 5
      const max = st?.maximum && st.maximum > min ? st.maximum : Math.max(min * 2, 10)
      const suggested = Math.max(1, max - cur)
      handleAddItemToPurchase(it, suggested)
      addedCount += 1
    }

    toast.success(`Se cargaron ${addedCount} artículos con stock crítico / punto de reorden`)
  }

  // Cart totals calculation
  const cartTotals = useMemo(() => {
    let subtotal = 0
    let discount = 0
    let tax = 0
    let totalUnits = 0

    for (const line of cartLines) {
      const qty = Math.max(1, Number(line.quantity) || 1)
      const cost = Math.max(0, Number(line.unitCost) || 0)
      const disc = Math.max(0, Number(line.discountAmount) || 0)
      const taxPct = Math.max(0, Number(line.taxPercent) || 0)

      const lineSub = Math.max(0, qty * cost - disc)
      const lineTax = lineSub * (taxPct / 100)

      subtotal += lineSub
      discount += disc
      tax += lineTax
      totalUnits += qty
    }

    const total = subtotal + tax
    const effectivePaid =
      paymentCondition === 'CREDITO'
        ? Math.min(total, Math.max(0, Number(initialPayment) || 0))
        : total
    const balanceDue = Math.max(0, total - effectivePaid)

    return { subtotal, discount, tax, total, totalUnits, effectivePaid, balanceDue }
  }, [cartLines, paymentCondition, initialPayment])

  // Submit New Purchase
  const handleSubmitPurchase = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!storeId) {
      toast.error('Selecciona una sucursal activa primero')
      return
    }
    if (cartLines.length === 0) {
      toast.error('Agrega al menos un artículo a la compra')
      return
    }
    if (paymentCondition === 'CREDITO' && !selectedSupplierId) {
      toast.error('Para compras a crédito debes seleccionar un proveedor')
      return
    }

    setSubmittingPurchase(true)
    const res = await createPurchaseAction({
      storeId,
      locationId: selectedLocationId || null,
      supplierId: selectedSupplierId || null,
      invoiceNumber,
      purchaseCondition: paymentCondition,
      paymentMethod,
      creditDays,
      initialPayment: paymentCondition === 'CREDITO' ? initialPayment : cartTotals.total,
      purchaseStatus: purchaseMode,
      updateItemCost,
      notes: purchaseNotes,
      items: cartLines.map((l) => ({
        id_item: l.item.id_item,
        quantity: l.quantity,
        previous_cost: l.previousCost,
        unit_cost: l.unitCost,
        tax_percent: l.taxPercent,
        discount_amount: l.discountAmount,
        new_price1: l.newPrice1,
      })),
    })

    setSubmittingPurchase(false)

    if (!res.success) {
      toast.error(res.error || 'Error al registrar la compra')
      return
    }

    toast.success(
      purchaseMode === 'RECEIVED'
        ? 'Compra registrada: Existencias, costos y Kardex actualizados en tiempo real'
        : 'Orden de compra guardada como Pendiente de Recepción'
    )

    // Reset capture form
    setCartLines([])
    setInvoiceNumber('')
    setPurchaseNotes('')
    setInitialPayment(0)
    setActiveTab('historial')
    fetchAllData()
  }

  // Receive a DRAFT purchase
  const handleReceivePurchase = async (purchase: Purchase) => {
    if (!storeId) return
    setReceivingPurchaseId(purchase.id_purchase)
    const res = await receiveDraftPurchaseAction(purchase.id_purchase, storeId)
    setReceivingPurchaseId(null)

    if (!res.success) {
      toast.error(res.error || 'Error al recibir mercancía')
    } else {
      toast.success(
        `Mercancía de Compra #${purchase.purchase_number} recibida: Stock y Kardex actualizados`
      )
      fetchAllData()
    }
  }

  // Register Supplier Payment (Abono)
  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!paymentPurchase || !storeId) return

    const amountNum = Number(payAmount) || 0
    if (amountNum <= 0) {
      toast.error('Ingresa un monto válido mayor a $0.00')
      return
    }

    setSavingPayment(true)
    const res = await registerPurchasePaymentAction({
      purchaseId: paymentPurchase.id_purchase,
      storeId,
      amount: amountNum,
      paymentMethod: payMethod,
      reference: payReference,
      notes: payNotes,
    })
    setSavingPayment(false)

    if (!res.success) {
      toast.error(res.error || 'Error al registrar abono')
    } else {
      toast.success('Abono registrado correctamente')
      setPaymentPurchase(null)
      setPayAmount('')
      setPayReference('')
      setPayNotes('')
      fetchAllData()
    }
  }

  // Cancel Purchase (with Stock & Kardex reversal)
  const handleConfirmCancelPurchase = async () => {
    if (!cancelPurchaseTarget || !storeId) return
    setCancelling(true)

    const res = await cancelPurchaseAction({
      purchaseId: cancelPurchaseTarget.id_purchase,
      storeId,
      reason: cancelReason,
    })
    setCancelling(false)

    if (!res.success) {
      toast.error(res.error || 'Error al cancelar la compra')
    } else {
      toast.success(
        cancelPurchaseTarget.purchase_status === 'RECEIVED'
          ? 'Compra cancelada: Se revirtieron las existencias y se registró la salida en el Kardex'
          : 'Orden de compra cancelada'
      )
      setCancelPurchaseTarget(null)
      setCancelReason('')
      fetchAllData()
    }
  }

  // Open Barcode Label Print Modal for a Purchase
  const handleOpenLabelModalForPurchase = (purchase: Purchase) => {
    const queue: LabelPrintQueueItem[] = (purchase.purchase_items ?? []).map((pi) => ({
      id_item: pi.id_item,
      code: pi.item?.code ?? null,
      barcode: pi.item?.barcode ?? pi.item?.code ?? null,
      description: pi.item?.description ?? 'Artículo',
      price1: pi.new_price1 ?? pi.item?.price1 ?? pi.item?.price ?? 0,
      price2: pi.item?.price2 ?? 0,
      price3: pi.item?.price3 ?? 0,
      quantity: Math.max(1, Math.round(Number(pi.quantity || 1))),
    }))

    if (queue.length === 0) {
      toast.error('Esta compra no tiene partidas para imprimir etiquetas')
      return
    }
    setLabelQueueItems(queue)
    setLabelModalOpen(true)
  }

  // ── Generate Single Purchase Receipt PDF ────────────────────
  const handleDownloadPurchasePdf = (purchase: Purchase) => {
    const doc = new jsPDF()
    const storeName = currentStore?.description || 'Sucursal Activa'

    doc.setFontSize(16)
    doc.text(`COMPROBANTE DE COMPRA #${purchase.purchase_number}`, 14, 18)

    doc.setFontSize(10)
    doc.text(`Sucursal: ${storeName}`, 14, 26)
    doc.text(`Ubicación Almacén: ${purchase.location?.description || 'Almacén General'}`, 14, 32)
    doc.text(
      `Proveedor: ${purchase.supplier?.supplier_name || 'Compra Directa / Sin Proveedor'}`,
      14,
      38
    )
    doc.text(`Factura / Remisión: ${purchase.invoice_number || 'S/N'}`, 14, 44)
    doc.text(`Fecha Registro: ${formatDateTime(purchase.purchase_date)}`, 120, 26)
    doc.text(
      `Estado Mercancía: ${
        purchase.purchase_status === 'RECEIVED'
          ? 'RECIBIDA (Afectó Kardex)'
          : purchase.purchase_status === 'DRAFT'
          ? 'PENDIENTE DE RECIBIR'
          : 'CANCELADA'
      }`,
      120,
      32
    )
    doc.text(`Condición Pago: ${purchase.payment_condition}`, 120, 38)
    doc.text(
      `Saldo Pendiente: ${formatCurrency(Number(purchase.balance_due || 0))}`,
      120,
      44
    )

    const bodyRows = (purchase.purchase_items ?? []).map((pi) => [
      pi.item?.code || pi.item?.barcode || '—',
      pi.item?.description || 'Artículo',
      String(pi.quantity),
      `${pi.stock_before ?? 0} -> ${pi.stock_after ?? pi.quantity}`,
      formatCurrency(Number(pi.previous_cost || 0)),
      formatCurrency(Number(pi.unit_cost || 0)),
      formatCurrency(Number(pi.tax_amount || 0)),
      formatCurrency(Number(pi.total_cost || 0)),
    ])

    autoTable(doc, {
      startY: 52,
      head: [
        [
          'Código',
          'Artículo',
          'Cant.',
          'Kardex Stock',
          'Costo Ant.',
          'Costo Compra',
          'IVA',
          'Total Línea',
        ],
      ],
      body: bodyRows,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [16, 185, 129] },
    })

    const finalY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 120
    doc.setFontSize(10)
    doc.text(`Subtotal: ${formatCurrency(Number(purchase.subtotal || 0))}`, 140, finalY + 10)
    doc.text(`IVA: ${formatCurrency(Number(purchase.tax_amount || 0))}`, 140, finalY + 16)
    doc.setFontSize(12)
    doc.text(`TOTAL: ${formatCurrency(Number(purchase.total_amount || 0))}`, 140, finalY + 24)

    doc.setFontSize(9)
    doc.text('___________________________________', 25, finalY + 42)
    doc.text('Firma de Recepción en Almacén', 32, finalY + 48)

    doc.save(`Compra_${purchase.purchase_number}_${storeName.replace(/\s+/g, '_')}.pdf`)
    toast.success('Comprobante PDF descargado')
  }

  // ── Filtered & Sorted Purchases Table ───────────────────────
  const filteredPurchases = useMemo(() => {
    return purchases.filter((p) => {
      if (statusFilter !== 'ALL' && p.purchase_status !== statusFilter) return false
      if (conditionFilter === 'CONTADO' && p.payment_condition !== 'CONTADO') return false
      if (conditionFilter === 'CREDITO' && p.payment_condition !== 'CREDITO') return false
      if (conditionFilter === 'PENDING_PAY' && Number(p.balance_due || 0) <= 0.01) return false

      if (search.trim()) {
        const q = search.toLowerCase()
        const folio = String(p.purchase_number || '')
        const inv = (p.invoice_number || '').toLowerCase()
        const sup = (p.supplier?.supplier_name || '').toLowerCase()
        const notes = (p.notes || '').toLowerCase()
        const hasItem = (p.purchase_items ?? []).some(
          (pi) =>
            pi.item?.description?.toLowerCase().includes(q) ||
            pi.item?.code?.toLowerCase().includes(q) ||
            pi.item?.barcode?.toLowerCase().includes(q)
        )
        if (
          !folio.includes(q) &&
          !inv.includes(q) &&
          !sup.includes(q) &&
          !notes.includes(q) &&
          !hasItem
        ) {
          return false
        }
      }
      return true
    })
  }, [purchases, statusFilter, conditionFilter, search])

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDirection('asc')
    }
  }

  const sortedPurchases = useMemo(() => {
    const list = [...filteredPurchases]
    return list.sort((a, b) => {
      let aVal: string | number = ''
      let bVal: string | number = ''

      switch (sortKey) {
        case 'purchase_number':
          aVal = Number(a.purchase_number || 0)
          bVal = Number(b.purchase_number || 0)
          break
        case 'purchase_date':
          aVal = a.purchase_date || ''
          bVal = b.purchase_date || ''
          break
        case 'supplier':
          aVal = (a.supplier?.supplier_name || '').toLowerCase()
          bVal = (b.supplier?.supplier_name || '').toLowerCase()
          break
        case 'invoice_number':
          aVal = (a.invoice_number || '').toLowerCase()
          bVal = (b.invoice_number || '').toLowerCase()
          break
        case 'items_count':
          aVal = (a.purchase_items ?? []).reduce((acc, it) => acc + Number(it.quantity || 0), 0)
          bVal = (b.purchase_items ?? []).reduce((acc, it) => acc + Number(it.quantity || 0), 0)
          break
        case 'payment_condition':
          aVal = a.payment_condition || ''
          bVal = b.payment_condition || ''
          break
        case 'total_amount':
          aVal = Number(a.total_amount || 0)
          bVal = Number(b.total_amount || 0)
          break
        case 'balance_due':
          aVal = Number(a.balance_due || 0)
          bVal = Number(b.balance_due || 0)
          break
        case 'purchase_status':
          aVal = a.purchase_status || ''
          bVal = b.purchase_status || ''
          break
        default:
          return 0
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
  }, [filteredPurchases, sortKey, sortDirection])

  const totalPages = Math.ceil(sortedPurchases.length / pageSize) || 1
  const paginatedPurchases = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedPurchases.slice(start, start + pageSize)
  }, [sortedPurchases, currentPage, pageSize])

  // ── Export Historial PDF / Excel ────────────────────────────
  const handleExportListPdf = () => {
    const doc = new jsPDF()
    doc.setFontSize(15)
    doc.text(
      `Reporte de Compras — ${currentStore?.description || 'Sucursal'}`,
      14,
      18
    )
    doc.setFontSize(9)
    doc.text(`Generado: ${formatDateTime(new Date().toISOString())}`, 14, 24)

    autoTable(doc, {
      startY: 30,
      head: [
        [
          'Folio',
          'Fecha',
          'Proveedor',
          'Factura',
          'Condición',
          'Total',
          'Saldo Pend.',
          'Estado',
        ],
      ],
      body: sortedPurchases.map((p) => [
        `#${p.purchase_number}`,
        formatDateTime(p.purchase_date),
        p.supplier?.supplier_name || 'Directa',
        p.invoice_number || '—',
        p.payment_condition,
        formatCurrency(Number(p.total_amount || 0)),
        formatCurrency(Number(p.balance_due || 0)),
        p.purchase_status === 'RECEIVED'
          ? 'Recibida'
          : p.purchase_status === 'DRAFT'
          ? 'Pendiente'
          : 'Cancelada',
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [16, 185, 129] },
    })

    doc.save(`Historial_Compras_${new Date().toISOString().slice(0, 10)}.pdf`)
    toast.success('Reporte de compras en PDF descargado')
  }

  const handleExportListExcel = () => {
    if (!isAdmin) {
      toast.error('Solo el Administrador puede exportar a Excel')
      return
    }
    const rows = sortedPurchases.map((p) => ({
      Folio: p.purchase_number,
      Fecha: formatDateTime(p.purchase_date),
      Proveedor: p.supplier?.supplier_name || 'Compra Directa',
      Factura_Remision: p.invoice_number || '',
      Ubicacion: p.location?.description || 'General',
      Condicion_Pago: p.payment_condition,
      Subtotal: Number(p.subtotal || 0),
      IVA: Number(p.tax_amount || 0),
      Total: Number(p.total_amount || 0),
      Pagado: Number(p.paid_amount || 0),
      Saldo_Pendiente: Number(p.balance_due || 0),
      Estado_Recepcion:
        p.purchase_status === 'RECEIVED'
          ? 'RECIBIDA'
          : p.purchase_status === 'DRAFT'
          ? 'PENDIENTE'
          : 'CANCELADA',
    }))

    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Compras')
    XLSX.writeFile(wb, `Compras_${new Date().toISOString().slice(0, 10)}.xlsx`)
    toast.success('Archivo Excel exportado correctamente')
  }

  // ── Filtered & Sorted Accounts Payable (Cuentas por Pagar) ──
  const filteredAccounts = useMemo(() => {
    return supplierAccounts.filter((acc) => {
      if (apOnlyWithBalance && acc.totalBalanceDue <= 0.01) return false
      if (apSearch.trim()) {
        const q = apSearch.toLowerCase()
        const name = (acc.supplier.supplier_name || '').toLowerCase()
        const rfc = (acc.supplier.rfc || '').toLowerCase()
        const contact = (acc.supplier.contact || '').toLowerCase()
        if (!name.includes(q) && !rfc.includes(q) && !contact.includes(q)) return false
      }
      return true
    })
  }, [supplierAccounts, apOnlyWithBalance, apSearch])

  const handleApSort = (key: string) => {
    if (apSortKey === key) {
      setApSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setApSortKey(key)
      setApSortDirection('desc')
    }
  }

  const sortedAccounts = useMemo(() => {
    const list = [...filteredAccounts]
    return list.sort((a, b) => {
      let aVal: string | number = ''
      let bVal: string | number = ''

      switch (apSortKey) {
        case 'supplier_name':
          aVal = (a.supplier.supplier_name || '').toLowerCase()
          bVal = (b.supplier.supplier_name || '').toLowerCase()
          break
        case 'credit_days':
          aVal = Number(a.supplier.credit_days || 0)
          bVal = Number(b.supplier.credit_days || 0)
          break
        case 'credit_limit':
          aVal = Number(a.supplier.credit_limit || 0)
          bVal = Number(b.supplier.credit_limit || 0)
          break
        case 'totalPurchasedAmount':
          aVal = a.totalPurchasedAmount
          bVal = b.totalPurchasedAmount
          break
        case 'totalPaidAmount':
          aVal = a.totalPaidAmount
          bVal = b.totalPaidAmount
          break
        case 'totalBalanceDue':
          aVal = a.totalBalanceDue
          bVal = b.totalBalanceDue
          break
        case 'overdueAmount':
          aVal = a.overdueAmount
          bVal = b.overdueAmount
          break
        case 'availableCredit':
          aVal = a.availableCredit
          bVal = b.availableCredit
          break
        default:
          return 0
      }

      if (aVal < bVal) return apSortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return apSortDirection === 'asc' ? 1 : -1
      return 0
    })
  }, [filteredAccounts, apSortKey, apSortDirection])

  const apTotalPages = Math.ceil(sortedAccounts.length / apPageSize) || 1
  const paginatedAccounts = useMemo(() => {
    const start = (apPage - 1) * apPageSize
    return sortedAccounts.slice(start, start + apPageSize)
  }, [sortedAccounts, apPage, apPageSize])

  return (
    <div className="h-full flex-1 flex flex-col min-h-0 gap-2.5 sm:gap-3">
      <div className="dashboard-bg" />

      {/* ── Top Header & Navigation Tabs ───────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-md shadow-emerald-500/10 shrink-0">
            <ShoppingBag size={18} />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-foreground leading-tight">
              Compras y Abastecimiento
            </h1>
            <p className="text-xs text-muted-foreground line-clamp-1">
              Recepción de mercancía en tiempo real, afectación a existencias, Kardex y Cuentas por Pagar ·{' '}
              <span className="font-semibold text-emerald-400">
                {currentStore?.description || 'Sucursal Activa'}
              </span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* View Switcher Tabs */}
          <div className="flex items-center gap-1 p-1 glass rounded-2xl border border-border/40">
            <button
              type="button"
              onClick={() => setActiveTab('historial')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'historial'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/20'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <History size={14} />
              <span>Historial ({purchases.length})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('nueva')
                setTimeout(() => barcodeInputRef.current?.focus(), 100)
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'nueva'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/20'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Plus size={14} />
              <span>Registrar Compra</span>
              {cartLines.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-white/20 text-[10px]">
                  {cartLines.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('cuentas')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'cuentas'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/20'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Wallet size={14} />
              <span>Cuentas por Pagar</span>
              {kpis.totalPayableBalance > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-400 text-[10px]">
                  {formatCurrency(kpis.totalPayableBalance)}
                </span>
              )}
            </button>
          </div>

          <Link
            href="/inventario/kardex"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl glass border border-border/50 text-xs font-medium text-muted-foreground hover:text-emerald-400 transition-colors"
            title="Ir al Kardex general de inventario"
          >
            <ArrowLeftRight size={14} />
            <span className="hidden sm:inline">Ver Kardex</span>
          </Link>
        </div>
      </div>

      {/* ── KPIs Summary Row ───────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 shrink-0">
        <GlassCard variant="emerald" padding="sm" className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium text-muted-foreground">Compras Recibidas</p>
            <p className="text-base sm:text-lg font-bold text-foreground font-mono mt-0.5">
              {formatCurrency(kpis.totalReceivedAmount)}
            </p>
            <p className="text-[10px] text-emerald-400">
              {kpis.receivedCount} recepciones · +{kpis.totalUnitsEntered} uds a Kardex
            </p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-400">
            <PackageCheck size={18} />
          </div>
        </GlassCard>

        <GlassCard variant="amber" padding="sm" className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium text-muted-foreground">Cuentas por Pagar</p>
            <p className="text-base sm:text-lg font-bold text-amber-400 font-mono mt-0.5">
              {formatCurrency(kpis.totalPayableBalance)}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {kpis.overdueBalance > 0
                ? `Vencido: ${formatCurrency(kpis.overdueBalance)}`
                : 'Al corriente con proveedores'}
            </p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center text-amber-400">
            <CreditCard size={18} />
          </div>
        </GlassCard>

        <GlassCard variant="indigo" padding="sm" className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium text-muted-foreground">Órdenes por Recibir</p>
            <p className="text-base sm:text-lg font-bold text-indigo-400 font-mono mt-0.5">
              {kpis.draftCount} órdenes
            </p>
            <p className="text-[10px] text-muted-foreground">
              En tránsito: {formatCurrency(kpis.draftAmount)}
            </p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-indigo-500/15 flex items-center justify-center text-indigo-400">
            <Clock size={18} />
          </div>
        </GlassCard>

        <GlassCard
          variant={lowStockItems.length > 0 ? 'rose' : 'default'}
          padding="sm"
          className="flex items-center justify-between cursor-pointer hover:border-emerald-500/40 transition-colors"
          onClick={() => {
            setActiveTab('nueva')
            if (lowStockItems.length > 0 && cartLines.length === 0) {
              handleLoadLowStockItems()
            }
          }}
        >
          <div>
            <p className="text-[11px] font-medium text-muted-foreground">Sugerido de Reorden</p>
            <p className="text-base sm:text-lg font-bold text-foreground font-mono mt-0.5">
              {lowStockItems.length} artículos
            </p>
            <p className="text-[10px] text-emerald-400 flex items-center gap-1">
              <Sparkles size={10} />
              Clic para cargar bajo mínimos
            </p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-rose-500/15 flex items-center justify-center text-rose-400">
            <AlertTriangle size={18} />
          </div>
        </GlassCard>
      </div>

      {/* ══════════════════════════════════════════════════════════
          TAB 1: HISTORIAL DE COMPRAS Y ÓRDENES
         ══════════════════════════════════════════════════════════ */}
      {activeTab === 'historial' && (
        <>
          {/* Filters Bar */}
          <GlassCard padding="none" className="p-2 shrink-0">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2">
              <div className="flex-1 max-w-md">
                <GlassInput
                  placeholder="Buscar por folio, factura, proveedor o artículo..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setCurrentPage(1)
                  }}
                  icon={<Search size={15} />}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Estado Recepción Filter */}
                <div className="flex items-center gap-1 p-0.5 rounded-xl glass border border-border/40">
                  {(
                    [
                      { key: 'ALL', label: 'Todas' },
                      { key: 'RECEIVED', label: 'Recibidas' },
                      { key: 'DRAFT', label: 'Pendientes' },
                      { key: 'CANCELLED', label: 'Canceladas' },
                    ] as const
                  ).map((st) => (
                    <button
                      key={st.key}
                      type="button"
                      onClick={() => {
                        setStatusFilter(st.key)
                        setCurrentPage(1)
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                        statusFilter === st.key
                          ? 'bg-emerald-500 text-white shadow-sm font-semibold'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>

                {/* Condición Pago Filter */}
                <div className="flex items-center gap-1 p-0.5 rounded-xl glass border border-border/40">
                  {(
                    [
                      { key: 'ALL', label: 'Todo Pago' },
                      { key: 'CONTADO', label: 'Contado' },
                      { key: 'CREDITO', label: 'Crédito' },
                      { key: 'PENDING_PAY', label: 'Por Pagar' },
                    ] as const
                  ).map((cf) => (
                    <button
                      key={cf.key}
                      type="button"
                      onClick={() => {
                        setConditionFilter(cf.key)
                        setCurrentPage(1)
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                        conditionFilter === cf.key
                          ? 'bg-indigo-500 text-white shadow-sm font-semibold'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {cf.label}
                    </button>
                  ))}
                </div>

                <GlassButton
                  variant="ghost"
                  size="sm"
                  onClick={handleExportListPdf}
                  className="h-8 px-2.5 text-xs"
                  title="Exportar a PDF"
                >
                  <FileText size={14} className="mr-1 text-rose-400" />
                  PDF
                </GlassButton>

                {isAdmin && (
                  <GlassButton
                    variant="ghost"
                    size="sm"
                    onClick={handleExportListExcel}
                    className="h-8 px-2.5 text-xs"
                    title="Exportar a Excel"
                  >
                    <FileSpreadsheet size={14} className="mr-1 text-emerald-400" />
                    Excel
                  </GlassButton>
                )}

                <GlassButton
                  variant="ghost"
                  size="sm"
                  onClick={fetchAllData}
                  disabled={loading}
                  title="Recargar compras"
                  className="h-8 px-2.5"
                >
                  <RefreshCw size={13} className={loading ? 'animate-spin text-emerald-400' : ''} />
                </GlassButton>
              </div>
            </div>
          </GlassCard>

          {/* Purchases Table */}
          <GlassCard padding="none" className="overflow-hidden shadow-xl flex-1 min-h-0 flex flex-col">
            <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0 scroll-modern">
              <table className="w-full text-left text-sm border-separate border-spacing-0">
                <thead className="sticky top-0 z-20">
                  <tr className="glass-table-header border-b border-border/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="w-16 px-3 py-3.5 text-center sticky top-0 z-20 bg-card/95 backdrop-blur-md">
                      Acciones
                    </th>
                    <TableColumnHeader
                      title="Folio"
                      sortKey="purchase_number"
                      currentSortKey={sortKey}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                    />
                    <TableColumnHeader
                      title="Fecha"
                      sortKey="purchase_date"
                      currentSortKey={sortKey}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                    />
                    <TableColumnHeader
                      title="Proveedor"
                      sortKey="supplier"
                      currentSortKey={sortKey}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                    />
                    <TableColumnHeader
                      title="Factura / Remisión"
                      sortKey="invoice_number"
                      currentSortKey={sortKey}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                    />
                    <TableColumnHeader
                      title="Partidas / Uds."
                      sortKey="items_count"
                      currentSortKey={sortKey}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                      align="center"
                    />
                    <TableColumnHeader
                      title="Condición"
                      sortKey="payment_condition"
                      currentSortKey={sortKey}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                      align="center"
                    />
                    <TableColumnHeader
                      title="Total Compra"
                      sortKey="total_amount"
                      currentSortKey={sortKey}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                      align="right"
                    />
                    <TableColumnHeader
                      title="Saldo por Pagar"
                      sortKey="balance_due"
                      currentSortKey={sortKey}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                      align="right"
                    />
                    <TableColumnHeader
                      title="Estado"
                      sortKey="purchase_status"
                      currentSortKey={sortKey}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                      align="center"
                    />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {loading && purchases.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">
                        <RefreshCw size={22} className="animate-spin text-emerald-500 mx-auto mb-2" />
                        Cargando historial de compras en tiempo real...
                      </td>
                    </tr>
                  ) : paginatedPurchases.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">
                        <p className="text-base font-medium">No se encontraron compras registradas</p>
                        <p className="text-xs text-muted-foreground/80 mt-1 mb-3">
                          Registra tu primera recepción de mercancía o carga los artículos bajo mínimo
                        </p>
                        <GlassButton
                          variant="primary"
                          size="sm"
                          onClick={() => setActiveTab('nueva')}
                        >
                          <Plus size={14} className="mr-1" />
                          Registrar Primera Compra
                        </GlassButton>
                      </td>
                    </tr>
                  ) : (
                    paginatedPurchases.map((p) => {
                      const totalUnits = (p.purchase_items ?? []).reduce(
                        (acc, it) => acc + Number(it.quantity || 0),
                        0
                      )
                      const balance = Number(p.balance_due || 0)
                      const isOverdue =
                        balance > 0.01 && p.due_date && new Date(p.due_date) < new Date()

                      return (
                        <tr
                          key={p.id_purchase}
                          className="hover:bg-white/[0.02] transition-colors group"
                        >
                          <td className="w-16 px-3 py-3 text-center">
                            <TableActionMenu
                              items={[
                                {
                                  label: 'Ver Detalle y Kardex',
                                  icon: <Eye size={15} />,
                                  onClick: () => setDetailPurchase(p),
                                  variant: 'primary',
                                },
                                ...(p.purchase_status === 'DRAFT'
                                  ? [
                                      {
                                        label: 'Recibir Mercancía (Afectar Stock)',
                                        icon: <PackageCheck size={15} />,
                                        onClick: () => handleReceivePurchase(p),
                                        variant: 'primary' as const,
                                        disabled: receivingPurchaseId === p.id_purchase,
                                      },
                                    ]
                                  : []),
                                ...(p.purchase_status !== 'CANCELLED' && balance > 0.01
                                  ? [
                                      {
                                        label: 'Registrar Abono / Pago',
                                        icon: <DollarSign size={15} />,
                                        onClick: () => {
                                          setPaymentPurchase(p)
                                          setPayAmount(String(balance.toFixed(2)))
                                        },
                                        variant: 'indigo' as const,
                                      },
                                    ]
                                  : []),
                                {
                                  label: 'Descargar Comprobante PDF',
                                  icon: <FileText size={15} />,
                                  onClick: () => handleDownloadPurchasePdf(p),
                                },
                                {
                                  label: 'Imprimir Etiquetas de Compra',
                                  icon: <Printer size={15} />,
                                  onClick: () => handleOpenLabelModalForPurchase(p),
                                },
                                ...(p.purchase_status !== 'CANCELLED'
                                  ? [
                                      {
                                        label:
                                          p.purchase_status === 'RECEIVED'
                                            ? 'Cancelar y Revertir Kardex'
                                            : 'Cancelar Orden Pendiente',
                                        icon: <Ban size={15} />,
                                        onClick: () => {
                                          setCancelPurchaseTarget(p)
                                          setCancelReason('')
                                        },
                                        variant: 'danger' as const,
                                        separatorBefore: true,
                                      },
                                    ]
                                  : []),
                              ]}
                            />
                          </td>

                          <td className="px-4 py-3 font-mono font-bold text-emerald-400 text-xs">
                            #{p.purchase_number}
                          </td>

                          <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                            <div>{formatDateTime(p.purchase_date)}</div>
                            {p.location?.description && (
                              <div className="text-[10px] text-muted-foreground/70 flex items-center gap-1 mt-0.5">
                                <MapPin size={10} />
                                {p.location.description}
                              </div>
                            )}
                          </td>

                          <td className="px-4 py-3">
                            <div className="font-semibold text-foreground text-xs sm:text-sm">
                              {p.supplier?.supplier_name || 'Compra Directa'}
                            </div>
                            {p.supplier?.rfc && (
                              <div className="text-[10px] font-mono text-muted-foreground">
                                {p.supplier.rfc}
                              </div>
                            )}
                          </td>

                          <td className="px-4 py-3 font-mono text-xs text-foreground">
                            {p.invoice_number || '—'}
                          </td>

                          <td className="px-4 py-3 text-center text-xs">
                            <span className="font-semibold text-foreground">
                              {(p.purchase_items ?? []).length} part.
                            </span>
                            <span className="text-muted-foreground ml-1 font-mono">
                              ({totalUnits} uds)
                            </span>
                          </td>

                          <td className="px-4 py-3 text-center">
                            <div className="flex flex-col items-center gap-0.5">
                              <StatusBadge status={p.payment_condition} />
                              {p.payment_condition === 'CREDITO' && p.due_date && (
                                <span
                                  className={`text-[10px] font-mono ${
                                    isOverdue ? 'text-rose-400 font-bold' : 'text-muted-foreground'
                                  }`}
                                >
                                  Vence: {formatDate(p.due_date)}
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="px-4 py-3 text-right font-mono font-bold text-foreground text-xs sm:text-sm">
                            {formatCurrency(Number(p.total_amount || 0))}
                          </td>

                          <td className="px-4 py-3 text-right font-mono text-xs">
                            {balance > 0.01 ? (
                              <span className="font-bold text-amber-400">
                                {formatCurrency(balance)}
                              </span>
                            ) : (
                              <span className="text-emerald-400 font-medium">Liquidada</span>
                            )}
                          </td>

                          <td className="px-4 py-3 text-center">
                            <StatusBadge status={p.purchase_status} />
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
              totalItems={sortedPurchases.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
              realtimeLabel="Compras y Kardex en tiempo real"
            />
          </GlassCard>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════
          TAB 2: NUEVA COMPRA / RECEPCIÓN DE MERCANCÍA
         ══════════════════════════════════════════════════════════ */}
      {activeTab === 'nueva' && (
        <form
          onSubmit={handleSubmitPurchase}
          className="flex-1 min-h-0 flex flex-col lg:flex-row gap-3 overflow-hidden"
        >
          {/* Left / Main Column: Item Search + Lines Table */}
          <div className="flex-1 min-h-0 flex flex-col gap-2.5 overflow-hidden">
            {/* Search & Low Stock Toolbar */}
            <GlassCard padding="sm" className="shrink-0 space-y-2.5 relative z-30">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex-1 relative">
                  <GlassInput
                    ref={barcodeInputRef}
                    placeholder="Escanea código de barras o busca artículo por clave / descripción (Enter)..."
                    value={itemSearchQuery}
                    onChange={(e) => setItemSearchQuery(e.target.value)}
                    onKeyDown={handleBarcodeKeyDown}
                    icon={<ScanLine size={16} className="text-emerald-400" />}
                    inputMode="text"
                    autoComplete="off"
                  />

                  {/* Autocomplete Dropdown */}
                  {matchingCatalogItems.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1.5 rounded-2xl glass border border-border/60 bg-card/95 backdrop-blur-2xl shadow-2xl overflow-hidden z-50 max-h-72 overflow-y-auto scroll-modern">
                      {matchingCatalogItems.map((it) => {
                        const st = stockByItemMap.get(it.id_item)
                        const cur = st?.current ?? 0
                        const min = st?.minimum ?? 0
                        return (
                          <button
                            key={it.id_item}
                            type="button"
                            onClick={() => {
                              handleAddItemToPurchase(it, 1)
                              setItemSearchQuery('')
                              barcodeInputRef.current?.focus()
                            }}
                            className="w-full px-3.5 py-2.5 text-left hover:bg-emerald-500/15 flex items-center justify-between gap-3 border-b border-border/20 last:border-0 transition-colors"
                          >
                            <div className="min-w-0">
                              <p className="text-xs sm:text-sm font-semibold text-foreground truncate">
                                {it.description}
                              </p>
                              <p className="text-[11px] text-muted-foreground font-mono">
                                Código: {it.code || '—'} · Barras: {it.barcode || '—'} · Unidad:{' '}
                                {it.unit || 'PZA'}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-xs font-mono font-bold text-emerald-400">
                                Costo: {formatCurrency(Number(it.cost || 0))}
                              </p>
                              <p
                                className={`text-[11px] font-mono ${
                                  cur <= min ? 'text-amber-400 font-semibold' : 'text-muted-foreground'
                                }`}
                              >
                                Stock actual: {cur}
                              </p>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <GlassButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleLoadLowStockItems}
                    className="text-xs h-9"
                  >
                    <Sparkles size={14} className="mr-1.5 text-amber-400" />
                    Cargar Bajo Mínimos ({lowStockItems.length})
                  </GlassButton>

                  {cartLines.length > 0 && (
                    <GlassButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setCartLines([])}
                      className="text-xs h-9 text-rose-400 hover:text-rose-300"
                    >
                      <Trash2 size={14} className="mr-1" />
                      Limpiar
                    </GlassButton>
                  )}
                </div>
              </div>
            </GlassCard>

            {/* Lines Table with Live Kardex Projection */}
            <GlassCard padding="none" className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0 scroll-modern">
                <table className="w-full text-left text-xs sm:text-sm border-separate border-spacing-0">
                  <thead className="sticky top-0 z-20">
                    <tr className="glass-table-header border-b border-border/40 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <th className="px-3 py-3 sticky top-0 z-20 bg-card/95 backdrop-blur-md">
                        Artículo
                      </th>
                      <th className="px-3 py-3 text-center sticky top-0 z-20 bg-card/95 backdrop-blur-md">
                        Proyección Kardex
                      </th>
                      <th className="px-3 py-3 text-center sticky top-0 z-20 bg-card/95 backdrop-blur-md w-28">
                        Cantidad
                      </th>
                      <th className="px-3 py-3 text-right sticky top-0 z-20 bg-card/95 backdrop-blur-md">
                        Costo Ant.
                      </th>
                      <th className="px-3 py-3 text-right sticky top-0 z-20 bg-card/95 backdrop-blur-md w-32">
                        Costo Compra ($)
                      </th>
                      <th className="px-3 py-3 text-center sticky top-0 z-20 bg-card/95 backdrop-blur-md w-20">
                        IVA %
                      </th>
                      <th className="px-3 py-3 text-right sticky top-0 z-20 bg-card/95 backdrop-blur-md w-32">
                        Precio Venta 1
                      </th>
                      <th className="px-3 py-3 text-right sticky top-0 z-20 bg-card/95 backdrop-blur-md">
                        Importe Total
                      </th>
                      <th className="px-2 py-3 text-center sticky top-0 z-20 bg-card/95 backdrop-blur-md w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {cartLines.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-14 text-center text-muted-foreground">
                          <ScanLine size={28} className="mx-auto mb-2 text-emerald-400/60" />
                          <p className="text-sm font-medium text-foreground">
                            Escanea o busca los artículos que ingresarán al almacén
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            También puedes usar el botón &ldquo;Cargar Bajo Mínimos&rdquo; para prellenar la orden automáticamente
                          </p>
                        </td>
                      </tr>
                    ) : (
                      cartLines.map((line, index) => {
                        const qty = Math.max(1, Number(line.quantity) || 1)
                        const newStock = line.currentStock + qty
                        const lineSub = Math.max(0, qty * line.unitCost - line.discountAmount)
                        const lineTax = lineSub * (line.taxPercent / 100)
                        const lineTotal = lineSub + lineTax
                        const costDiff = line.unitCost - line.previousCost
                        const salePrice = Number(line.newPrice1 || line.item.price1 || 0)
                        const marginPct =
                          salePrice > 0 ? ((salePrice - line.unitCost) / salePrice) * 100 : 0

                        return (
                          <tr key={line.item.id_item} className="hover:bg-white/[0.02]">
                            <td className="px-3 py-2.5">
                              <p className="font-semibold text-foreground text-xs sm:text-sm">
                                {line.item.description}
                              </p>
                              <p className="text-[11px] font-mono text-muted-foreground">
                                {line.item.code || line.item.barcode || '—'} ·{' '}
                                {line.item.unit || 'PZA'}
                              </p>
                            </td>

                            <td className="px-3 py-2.5 text-center">
                              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/20 font-mono text-xs">
                                <span className="text-muted-foreground">{line.currentStock}</span>
                                <ArrowRight size={12} className="text-emerald-400" />
                                <span className="font-bold text-emerald-400">{newStock}</span>
                              </div>
                            </td>

                            <td className="px-3 py-2.5">
                              <input
                                type="number"
                                min={1}
                                value={line.quantity}
                                onChange={(e) => {
                                  const val = Math.max(1, Number(e.target.value) || 1)
                                  setCartLines((prev) =>
                                    prev.map((l, i) => (i === index ? { ...l, quantity: val } : l))
                                  )
                                }}
                                className="w-24 px-2.5 py-1.5 rounded-xl glass border border-border/50 text-center font-mono text-xs font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                              />
                            </td>

                            <td className="px-3 py-2.5 text-right font-mono text-xs text-muted-foreground">
                              <div>{formatCurrency(line.previousCost)}</div>
                              {Math.abs(costDiff) > 0.01 && (
                                <span
                                  className={`inline-flex items-center gap-0.5 text-[10px] ${
                                    costDiff > 0 ? 'text-rose-400' : 'text-emerald-400'
                                  }`}
                                >
                                  {costDiff > 0 ? (
                                    <TrendingUp size={10} />
                                  ) : (
                                    <TrendingDown size={10} />
                                  )}
                                  {costDiff > 0 ? '+' : ''}
                                  {formatCurrency(costDiff)}
                                </span>
                              )}
                            </td>

                            <td className="px-3 py-2.5 text-right">
                              <input
                                type="number"
                                step="any"
                                min={0}
                                value={line.unitCost}
                                onChange={(e) => {
                                  const val = Math.max(0, Number(e.target.value) || 0)
                                  setCartLines((prev) =>
                                    prev.map((l, i) => (i === index ? { ...l, unitCost: val } : l))
                                  )
                                }}
                                className="w-28 px-2.5 py-1.5 rounded-xl glass border border-border/50 text-right font-mono text-xs font-bold text-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                              />
                            </td>

                            <td className="px-3 py-2.5 text-center">
                              <input
                                type="number"
                                step="any"
                                min={0}
                                max={100}
                                value={line.taxPercent}
                                onChange={(e) => {
                                  const val = Math.max(0, Number(e.target.value) || 0)
                                  setCartLines((prev) =>
                                    prev.map((l, i) =>
                                      i === index ? { ...l, taxPercent: val } : l
                                    )
                                  )
                                }}
                                className="w-16 px-2 py-1.5 rounded-xl glass border border-border/50 text-center font-mono text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                              />
                            </td>

                            <td className="px-3 py-2.5 text-right">
                              <input
                                type="number"
                                step="any"
                                min={0}
                                value={line.newPrice1 ?? ''}
                                placeholder="Precio 1"
                                onChange={(e) => {
                                  const val = e.target.value ? Number(e.target.value) : null
                                  setCartLines((prev) =>
                                    prev.map((l, i) => (i === index ? { ...l, newPrice1: val } : l))
                                  )
                                }}
                                className="w-28 px-2.5 py-1.5 rounded-xl glass border border-border/50 text-right font-mono text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                              />
                              <div
                                className={`text-[10px] font-mono mt-0.5 ${
                                  marginPct < 15 ? 'text-amber-400' : 'text-muted-foreground'
                                }`}
                              >
                                Margen: {marginPct.toFixed(1)}%
                              </div>
                            </td>

                            <td className="px-3 py-2.5 text-right font-mono font-bold text-foreground text-xs sm:text-sm">
                              {formatCurrency(lineTotal)}
                            </td>

                            <td className="px-2 py-2.5 text-center">
                              <button
                                type="button"
                                onClick={() =>
                                  setCartLines((prev) => prev.filter((_, i) => i !== index))
                                }
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                                title="Quitar partida"
                              >
                                <X size={15} />
                              </button>
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

          {/* Right Column: Purchase Header, Supplier, Payment Condition & Summary */}
          <GlassCard className="w-full lg:w-96 shrink-0 flex flex-col justify-between gap-4 overflow-y-auto scroll-modern">
            <div className="space-y-3.5">
              <div className="flex items-center justify-between border-b border-border/40 pb-2.5">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Truck size={16} className="text-emerald-400" />
                  Datos de la Compra
                </h3>
                <span className="text-[11px] font-mono text-emerald-400">
                  {cartTotals.totalUnits} uds.
                </span>
              </div>

              {/* Modalidad de Recepción */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Afectación al Inventario y Kardex
                </label>
                <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl glass border border-border/40">
                  <button
                    type="button"
                    onClick={() => setPurchaseMode('RECEIVED')}
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-all ${
                      purchaseMode === 'RECEIVED'
                        ? 'bg-emerald-500 text-white shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Entrada Directa (Hoy)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPurchaseMode('DRAFT')}
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-all ${
                      purchaseMode === 'DRAFT'
                        ? 'bg-amber-500 text-white shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Orden Pendiente
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {purchaseMode === 'RECEIVED'
                    ? 'Suma existencias en la sucursal y registra entrada en el Kardex al instante.'
                    : 'Guarda la orden de compra sin afectar existencias hasta confirmar su recepción.'}
                </p>
              </div>

              {/* Proveedor */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Proveedor {paymentCondition === 'CREDITO' ? '*' : '(Opcional)'}
                </label>
                <select
                  value={selectedSupplierId}
                  onChange={(e) => setSelectedSupplierId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl glass-input text-xs sm:text-sm text-foreground bg-card/80 border border-border/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                >
                  <option value="">— Compra Directa / Sin Proveedor —</option>
                  {suppliers.map((s) => (
                    <option key={s.id_supplier} value={s.id_supplier}>
                      {s.supplier_name} {s.rfc ? `(${s.rfc})` : ''}
                    </option>
                  ))}
                </select>

                {selectedSupplier && (
                  <div className="mt-1.5 p-2.5 rounded-xl bg-white/[0.03] border border-border/40 text-[11px] space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Plazo de crédito:</span>
                      <span className="font-mono font-semibold text-foreground">
                        {selectedSupplier.credit_days || 0} días
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Límite de crédito:</span>
                      <span className="font-mono font-semibold text-emerald-400">
                        {formatCurrency(Number(selectedSupplier.credit_limit || 0))}
                      </span>
                    </div>
                    {selectedSupplierAccount && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Saldo actual por pagar:</span>
                        <span className="font-mono font-semibold text-amber-400">
                          {formatCurrency(selectedSupplierAccount.totalBalanceDue)}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Ubicación de Almacén y Factura */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    Ubicación Destino
                  </label>
                  <select
                    value={selectedLocationId}
                    onChange={(e) => setSelectedLocationId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl glass-input text-xs text-foreground bg-card/80 border border-border/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  >
                    {locations.length === 0 ? (
                      <option value="">Almacén General (Auto)</option>
                    ) : (
                      locations.map((loc) => (
                        <option key={loc.id_location} value={loc.id_location}>
                          {loc.description}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    Folio Factura / Remisión
                  </label>
                  <GlassInput
                    placeholder="Ej. FAC-2045"
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                  />
                </div>
              </div>

              {/* Condición de Pago: Contado vs Crédito */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Condición de Pago
                </label>
                <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl glass border border-border/40">
                  <button
                    type="button"
                    onClick={() => setPaymentCondition('CONTADO')}
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-all ${
                      paymentCondition === 'CONTADO'
                        ? 'bg-emerald-500 text-white shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Contado
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentCondition('CREDITO')}
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-all ${
                      paymentCondition === 'CREDITO'
                        ? 'bg-indigo-500 text-white shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    A Crédito (CxP)
                  </button>
                </div>
              </div>

              {paymentCondition === 'CONTADO' ? (
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    Método de Pago
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl glass-input text-xs text-foreground bg-card/80 border border-border/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  >
                    {SAT_PAYMENT_METHODS.map((m) => (
                      <option key={m.code} value={m.code}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5 p-2.5 rounded-xl bg-indigo-500/5 border border-indigo-500/20">
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                      Días de Crédito
                    </label>
                    <GlassInput
                      type="number"
                      min={0}
                      value={creditDays}
                      onChange={(e) => setCreditDays(Math.max(0, Number(e.target.value) || 0))}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                      Anticipo / Abono ($)
                    </label>
                    <GlassInput
                      type="number"
                      step="any"
                      min={0}
                      value={initialPayment}
                      onChange={(e) => setInitialPayment(Math.max(0, Number(e.target.value) || 0))}
                    />
                  </div>
                </div>
              )}

              {/* Switch Actualizar Costo en Catálogo */}
              <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white/[0.02] border border-border/40 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={updateItemCost}
                  onChange={(e) => setUpdateItemCost(e.target.checked)}
                  className="mt-0.5 rounded accent-emerald-500"
                />
                <div className="text-xs">
                  <span className="font-semibold text-foreground block">
                    Actualizar costo en catálogo e historial
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Respalda el costo anterior en <code>last_cost</code>, actualiza <code>cost</code> y registra en <code>price_history</code>.
                  </span>
                </div>
              </label>

              {/* Notas */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Observaciones / Notas
                </label>
                <GlassInput
                  placeholder="Comentarios de recepción, transportista, etc."
                  value={purchaseNotes}
                  onChange={(e) => setPurchaseNotes(e.target.value)}
                />
              </div>
            </div>

            {/* Totals & Submit */}
            <div className="pt-3 border-t border-border/40 space-y-2.5">
              <div className="space-y-1 text-xs">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal:</span>
                  <span className="font-mono">{formatCurrency(cartTotals.subtotal)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Impuestos (IVA):</span>
                  <span className="font-mono">{formatCurrency(cartTotals.tax)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-foreground pt-1 border-t border-border/20">
                  <span>Total Compra:</span>
                  <span className="font-mono text-emerald-400">
                    {formatCurrency(cartTotals.total)}
                  </span>
                </div>
                {paymentCondition === 'CREDITO' && (
                  <div className="flex justify-between text-xs font-semibold text-amber-400">
                    <span>Saldo a Crédito (CxP):</span>
                    <span className="font-mono">{formatCurrency(cartTotals.balanceDue)}</span>
                  </div>
                )}
              </div>

              <GlassButton
                type="submit"
                variant="primary"
                size="md"
                disabled={submittingPurchase || cartLines.length === 0}
                className="w-full justify-center shadow-lg shadow-emerald-500/20"
              >
                <Check size={16} className="mr-1.5" />
                {submittingPurchase
                  ? 'Procesando compra...'
                  : purchaseMode === 'RECEIVED'
                  ? 'Registrar Compra y Afectar Existencias'
                  : 'Guardar Orden de Compra Pendiente'}
              </GlassButton>
            </div>
          </GlassCard>
        </form>
      )}

      {/* ══════════════════════════════════════════════════════════
          TAB 3: CUENTAS POR PAGAR A PROVEEDORES
         ══════════════════════════════════════════════════════════ */}
      {activeTab === 'cuentas' && (
        <>
          <GlassCard padding="none" className="p-2 shrink-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex-1 max-w-md">
                <GlassInput
                  placeholder="Buscar proveedor por nombre, RFC o contacto..."
                  value={apSearch}
                  onChange={(e) => {
                    setApSearch(e.target.value)
                    setApPage(1)
                  }}
                  icon={<Search size={15} />}
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setApOnlyWithBalance((prev) => !prev)
                    setApPage(1)
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                    apOnlyWithBalance
                      ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                      : 'glass border-border/40 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Solo con saldo pendiente
                </button>
              </div>
            </div>
          </GlassCard>

          <GlassCard padding="none" className="overflow-hidden shadow-xl flex-1 min-h-0 flex flex-col">
            <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0 scroll-modern">
              <table className="w-full text-left text-sm border-separate border-spacing-0">
                <thead className="sticky top-0 z-20">
                  <tr className="glass-table-header border-b border-border/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="w-16 px-3 py-3.5 text-center sticky top-0 z-20 bg-card/95 backdrop-blur-md">
                      Acciones
                    </th>
                    <TableColumnHeader
                      title="Proveedor"
                      sortKey="supplier_name"
                      currentSortKey={apSortKey}
                      sortDirection={apSortDirection}
                      onSort={handleApSort}
                    />
                    <TableColumnHeader
                      title="Plazo"
                      sortKey="credit_days"
                      currentSortKey={apSortKey}
                      sortDirection={apSortDirection}
                      onSort={handleApSort}
                      align="center"
                    />
                    <TableColumnHeader
                      title="Límite Crédito"
                      sortKey="credit_limit"
                      currentSortKey={apSortKey}
                      sortDirection={apSortDirection}
                      onSort={handleApSort}
                      align="right"
                    />
                    <TableColumnHeader
                      title="Total Comprado"
                      sortKey="totalPurchasedAmount"
                      currentSortKey={apSortKey}
                      sortDirection={apSortDirection}
                      onSort={handleApSort}
                      align="right"
                    />
                    <TableColumnHeader
                      title="Total Pagado"
                      sortKey="totalPaidAmount"
                      currentSortKey={apSortKey}
                      sortDirection={apSortDirection}
                      onSort={handleApSort}
                      align="right"
                    />
                    <TableColumnHeader
                      title="Saldo por Pagar"
                      sortKey="totalBalanceDue"
                      currentSortKey={apSortKey}
                      sortDirection={apSortDirection}
                      onSort={handleApSort}
                      align="right"
                    />
                    <TableColumnHeader
                      title="Vencido"
                      sortKey="overdueAmount"
                      currentSortKey={apSortKey}
                      sortDirection={apSortDirection}
                      onSort={handleApSort}
                      align="right"
                    />
                    <TableColumnHeader
                      title="Crédito Disponible"
                      sortKey="availableCredit"
                      currentSortKey={apSortKey}
                      sortDirection={apSortDirection}
                      onSort={handleApSort}
                      align="right"
                    />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {paginatedAccounts.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                        No se encontraron proveedores para los filtros seleccionados
                      </td>
                    </tr>
                  ) : (
                    paginatedAccounts.map((acc) => (
                      <tr key={acc.supplier.id_supplier} className="hover:bg-white/[0.02]">
                        <td className="w-16 px-3 py-3 text-center">
                          <TableActionMenu
                            items={[
                              {
                                label: 'Nueva Compra a este Proveedor',
                                icon: <Plus size={15} />,
                                onClick: () => {
                                  setSelectedSupplierId(acc.supplier.id_supplier)
                                  setActiveTab('nueva')
                                },
                                variant: 'primary',
                              },
                              {
                                label: 'Filtrar sus Compras en Historial',
                                icon: <Search size={15} />,
                                onClick: () => {
                                  setSearch(acc.supplier.supplier_name || '')
                                  setActiveTab('historial')
                                },
                              },
                              ...(acc.pendingPurchases.length > 0
                                ? [
                                    {
                                      label: `Abonar a Compra #${acc.pendingPurchases[0].purchase_number}`,
                                      icon: <DollarSign size={15} />,
                                      onClick: () => {
                                        const first = acc.pendingPurchases[0]
                                        setPaymentPurchase(first)
                                        setPayAmount(String(Number(first.balance_due || 0).toFixed(2)))
                                      },
                                      variant: 'indigo' as const,
                                    },
                                  ]
                                : []),
                            ]}
                          />
                        </td>

                        <td className="px-4 py-3">
                          <div className="font-semibold text-foreground">
                            {acc.supplier.supplier_name}
                          </div>
                          <div className="text-[11px] text-muted-foreground font-mono">
                            {acc.supplier.rfc || 'Sin RFC'} · {acc.totalPurchasesCount} compras
                          </div>
                        </td>

                        <td className="px-4 py-3 text-center font-mono text-xs">
                          {acc.supplier.credit_days ? `${acc.supplier.credit_days} días` : 'Contado'}
                        </td>

                        <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">
                          {formatCurrency(Number(acc.supplier.credit_limit || 0))}
                        </td>

                        <td className="px-4 py-3 text-right font-mono text-xs text-foreground">
                          {formatCurrency(acc.totalPurchasedAmount)}
                        </td>

                        <td className="px-4 py-3 text-right font-mono text-xs text-emerald-400">
                          {formatCurrency(acc.totalPaidAmount)}
                        </td>

                        <td className="px-4 py-3 text-right font-mono font-bold text-xs">
                          {acc.totalBalanceDue > 0.01 ? (
                            <span className="text-amber-400">
                              {formatCurrency(acc.totalBalanceDue)}
                            </span>
                          ) : (
                            <span className="text-emerald-400">$0.00</span>
                          )}
                        </td>

                        <td className="px-4 py-3 text-right font-mono text-xs">
                          {acc.overdueAmount > 0.01 ? (
                            <span className="text-rose-400 font-bold">
                              {formatCurrency(acc.overdueAmount)} ({acc.overdueCount})
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>

                        <td className="px-4 py-3 text-right font-mono text-xs font-semibold text-emerald-400">
                          {formatCurrency(acc.availableCredit)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <TablePagination
              currentPage={apPage}
              totalPages={apTotalPages}
              totalItems={sortedAccounts.length}
              pageSize={apPageSize}
              onPageChange={setApPage}
              onPageSizeChange={setApPageSize}
              realtimeLabel="Saldos de proveedores en tiempo real"
            />
          </GlassCard>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════
          MODAL: DETALLE DE COMPRA, KARDEX Y ABONOS
         ══════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {detailPurchase && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card max-w-4xl w-full flex flex-col max-h-[92dvh] sm:max-h-[90vh] overflow-hidden rounded-2xl sm:rounded-3xl shadow-2xl"
            >
              <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-b border-border/40 gap-2 shrink-0 bg-card/95 dark:bg-card/90 backdrop-blur-xl z-10">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm sm:text-base font-bold text-foreground flex flex-wrap items-center gap-2">
                    <span>Detalle de Compra #{detailPurchase.purchase_number}</span>
                    <StatusBadge status={detailPurchase.purchase_status} />
                    <StatusBadge status={detailPurchase.payment_condition} />
                  </h3>
                  <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 truncate">
                    Proveedor: {detailPurchase.supplier?.supplier_name || 'Compra Directa'} · Factura:{' '}
                    {detailPurchase.invoice_number || 'S/N'} · Fecha:{' '}
                    {formatDateTime(detailPurchase.purchase_date)}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setDetailPurchase(null)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto scroll-modern p-4 sm:p-6 space-y-4">
                {/* Partidas y Trazabilidad Kardex */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-2">
                    Partidas y Afectación a Kardex
                  </h4>
                  <div className="rounded-2xl border border-border/40 overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="glass-table-header border-b border-border/40 text-muted-foreground uppercase">
                          <th className="px-3 py-2.5">Artículo</th>
                          <th className="px-3 py-2.5 text-center">Cant.</th>
                          <th className="px-3 py-2.5 text-center">Trazabilidad Kardex</th>
                          <th className="px-3 py-2.5 text-right">Costo Ant.</th>
                          <th className="px-3 py-2.5 text-right">Costo Compra</th>
                          <th className="px-3 py-2.5 text-right">IVA</th>
                          <th className="px-3 py-2.5 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/20">
                        {(detailPurchase.purchase_items ?? []).map((pi) => (
                          <tr key={pi.id_purchase_item}>
                            <td className="px-3 py-2.5">
                              <div className="font-semibold text-foreground">
                                {pi.item?.description || 'Artículo'}
                              </div>
                              <div className="text-[10px] font-mono text-muted-foreground">
                                {pi.item?.code || pi.item?.barcode || '—'}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-center font-mono font-bold text-emerald-400">
                              +{pi.quantity}
                            </td>
                            <td className="px-3 py-2.5 text-center font-mono">
                              <span className="px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                                {pi.stock_before ?? 0} → {pi.stock_after ?? pi.quantity}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">
                              {formatCurrency(Number(pi.previous_cost || 0))}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono font-semibold text-foreground">
                              {formatCurrency(Number(pi.unit_cost || 0))}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">
                              {formatCurrency(Number(pi.tax_amount || 0))}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono font-bold text-foreground">
                              {formatCurrency(Number(pi.total_cost || 0))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Historial de Pagos / Abonos */}
                {(detailPurchase.purchase_payments ?? []).length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-400 mb-2">
                      Pagos y Abonos Registrados
                    </h4>
                    <div className="rounded-2xl border border-border/40 overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="glass-table-header border-b border-border/40 text-muted-foreground uppercase">
                            <th className="px-3 py-2">Fecha</th>
                            <th className="px-3 py-2">Método SAT</th>
                            <th className="px-3 py-2">Referencia</th>
                            <th className="px-3 py-2">Notas</th>
                            <th className="px-3 py-2 text-right">Monto Abonado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/20">
                          {(detailPurchase.purchase_payments ?? []).map((pay) => (
                            <tr key={pay.id_payment}>
                              <td className="px-3 py-2 font-mono text-muted-foreground">
                                {formatDateTime(pay.payment_date)}
                              </td>
                              <td className="px-3 py-2 font-mono">{pay.payment_method}</td>
                              <td className="px-3 py-2 font-mono">{pay.reference || '—'}</td>
                              <td className="px-3 py-2 text-muted-foreground">
                                {pay.notes || '—'}
                              </td>
                              <td className="px-3 py-2 text-right font-mono font-bold text-emerald-400">
                                {formatCurrency(Number(pay.amount || 0))}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Resumen Financiero */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2">
                  <div className="p-3 rounded-2xl glass border border-border/40">
                    <span className="text-[11px] text-muted-foreground block">Subtotal</span>
                    <span className="font-mono font-bold text-sm">
                      {formatCurrency(Number(detailPurchase.subtotal || 0))}
                    </span>
                  </div>
                  <div className="p-3 rounded-2xl glass border border-border/40">
                    <span className="text-[11px] text-muted-foreground block">IVA</span>
                    <span className="font-mono font-bold text-sm">
                      {formatCurrency(Number(detailPurchase.tax_amount || 0))}
                    </span>
                  </div>
                  <div className="p-3 rounded-2xl glass border border-border/40">
                    <span className="text-[11px] text-muted-foreground block">Total Compra</span>
                    <span className="font-mono font-bold text-sm text-emerald-400">
                      {formatCurrency(Number(detailPurchase.total_amount || 0))}
                    </span>
                  </div>
                  <div className="p-3 rounded-2xl glass border border-border/40">
                    <span className="text-[11px] text-muted-foreground block">Saldo Pendiente</span>
                    <span className="font-mono font-bold text-sm text-amber-400">
                      {formatCurrency(Number(detailPurchase.balance_due || 0))}
                    </span>
                </div>
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 p-3 sm:p-4 border-t border-border/40 shrink-0 bg-card/95 dark:bg-card/90 backdrop-blur-xl z-10">
                <GlassButton
                  variant="ghost"
                  size="sm"
                  onClick={() => setDetailPurchase(null)}
                  className="w-full sm:w-auto"
                >
                  Cerrar
                </GlassButton>
                <GlassButton
                  variant="secondary"
                  size="sm"
                  onClick={() => handleDownloadPurchasePdf(detailPurchase)}
                  className="w-full sm:w-auto"
                >
                  <FileText size={14} className="mr-1" />
                  Descargar PDF
                </GlassButton>
                <GlassButton
                  variant="secondary"
                  size="sm"
                  onClick={() => handleOpenLabelModalForPurchase(detailPurchase)}
                  className="w-full sm:w-auto"
                >
                  <Printer size={14} className="mr-1" />
                  Imprimir Etiquetas
                </GlassButton>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════════════
          MODAL: REGISTRAR PAGO / ABONO A PROVEEDOR
         ══════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {paymentPurchase && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card max-w-md w-full flex flex-col max-h-[92dvh] sm:max-h-[90vh] overflow-hidden rounded-2xl sm:rounded-3xl shadow-2xl"
            >
              <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-b border-border/40 shrink-0 bg-card/95 dark:bg-card/90 backdrop-blur-xl z-10">
                <h3 className="text-sm sm:text-base font-bold text-foreground flex items-center gap-2">
                  <DollarSign size={18} className="text-emerald-400" />
                  Abonar a Compra #{paymentPurchase.purchase_number}
                </h3>
                <button
                  type="button"
                  onClick={() => setPaymentPurchase(null)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <form id="payment-form" onSubmit={handleSavePayment} className="flex-1 min-h-0 overflow-y-auto scroll-modern p-4 sm:p-6 space-y-3.5">
                <div className="p-3 rounded-2xl bg-white/[0.03] border border-border/40 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Proveedor:</span>
                    <span className="font-semibold text-foreground">
                      {paymentPurchase.supplier?.supplier_name || 'Compra Directa'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Compra:</span>
                    <span className="font-mono">
                      {formatCurrency(Number(paymentPurchase.total_amount || 0))}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Saldo Pendiente:</span>
                    <span className="font-mono font-bold text-amber-400">
                      {formatCurrency(Number(paymentPurchase.balance_due || 0))}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    Monto del Abono ($) *
                  </label>
                  <GlassInput
                    type="number"
                    step="any"
                    min={0.01}
                    max={Number(paymentPurchase.balance_due || 0)}
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    required
                    autoFocus
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    Método de Pago
                  </label>
                  <select
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl glass-input text-xs text-foreground bg-card/80 border border-border/50"
                  >
                    {SAT_PAYMENT_METHODS.map((m) => (
                      <option key={m.code} value={m.code}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    Referencia / Folio de Transferencia
                  </label>
                  <GlassInput
                    placeholder="Ej. SPEI-994821"
                    value={payReference}
                    onChange={(e) => setPayReference(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    Notas
                  </label>
                  <GlassInput
                    placeholder="Observaciones del pago"
                    value={payNotes}
                    onChange={(e) => setPayNotes(e.target.value)}
                  />
                </div>
              </form>

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 p-3 sm:p-4 border-t border-border/40 shrink-0 bg-card/95 dark:bg-card/90 backdrop-blur-xl z-10">
                <GlassButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setPaymentPurchase(null)}
                  className="w-full sm:w-auto"
                >
                  Cancelar
                </GlassButton>
                <GlassButton
                  form="payment-form"
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={savingPayment}
                  className="w-full sm:w-auto"
                >
                  <CheckCircle2 size={14} className="mr-1" />
                  {savingPayment ? 'Guardando...' : 'Confirmar Abono'}
                </GlassButton>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════════════
          MODAL: CANCELAR COMPRA Y REVERTIR KARDEX
         ══════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {cancelPurchaseTarget && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card max-w-md w-full flex flex-col max-h-[92dvh] sm:max-h-[90vh] overflow-hidden rounded-2xl sm:rounded-3xl border-rose-500/40 shadow-2xl"
            >
              <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-b border-border/40 shrink-0 bg-card/95 dark:bg-card/90 backdrop-blur-xl z-10">
                <h3 className="text-sm sm:text-base font-bold text-rose-400 flex items-center gap-2">
                  <AlertTriangle size={18} />
                  ¿Cancelar Compra #{cancelPurchaseTarget.purchase_number}?
                </h3>
                <button
                  type="button"
                  onClick={() => setCancelPurchaseTarget(null)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto scroll-modern p-4 sm:p-6 space-y-3.5">
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  {cancelPurchaseTarget.purchase_status === 'RECEIVED'
                    ? 'Esta compra ya afectó existencias. Al cancelarla, se descontarán las unidades ingresadas en la sucursal y se registrará el movimiento de reversión (Salida) en el Kardex automáticamente.'
                    : 'La orden de compra pendiente quedará marcada como cancelada.'}
                </p>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    Motivo de cancelación
                  </label>
                  <GlassInput
                    placeholder="Ej. Error en captura de factura o devolución a proveedor"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    autoFocus
                  />
                </div>
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 p-3 sm:p-4 border-t border-border/40 shrink-0 bg-card/95 dark:bg-card/90 backdrop-blur-xl z-10">
                <GlassButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setCancelPurchaseTarget(null)}
                  className="w-full sm:w-auto"
                >
                  Volver
                </GlassButton>
                <GlassButton
                  type="button"
                  variant="danger"
                  size="sm"
                  disabled={cancelling}
                  onClick={handleConfirmCancelPurchase}
                  className="w-full sm:w-auto"
                >
                  <Ban size={14} className="mr-1" />
                  {cancelling ? 'Cancelando...' : 'Confirmar Cancelación'}
                </GlassButton>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Barcode Label Print Modal */}
      {storeId && (
        <LabelPrintModal
          open={labelModalOpen}
          onOpenChange={setLabelModalOpen}
          storeId={storeId}
          items={labelQueueItems}
        />
      )}
    </div>
  )
}
