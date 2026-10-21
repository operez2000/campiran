'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/utils/supabase/client'
import { useStore } from '@/components/providers/store-provider'
import { GlassCard } from '@/components/glass-card'
import { GlassButton } from '@/components/glass-button'
import { GlassInput } from '@/components/glass-input'
import { StatusBadge } from '@/components/status-badge'
import {
  type Item,
  type Client,
  type Stock,
  type CashShift,
  type Profile,
  type SatPaymentCode,
  type PaymentBreakdownItem,
  type BranchPrinter,
  type CompanySettings,
} from '@/lib/types'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { toast } from 'sonner'
import {
  ShoppingCart, Search, Plus, Minus, Trash2, User,
  CreditCard, Banknote, ArrowRightLeft, Printer, CheckCircle2,
  X, Layers, ScanLine, DollarSign, Store as StoreIcon, ImageIcon,
  Users, Lock, ShieldCheck, DoorClosed, RotateCcw
} from 'lucide-react'
import { PosClientModal } from '@/components/pos/pos-client-modal'
import { ShiftOpenModal } from '@/components/pos/shift-open-modal'
import { PosPaymentModal, SAT_PAYMENT_METHODS } from '@/components/pos/pos-payment-modal'
import { getActiveShiftAction, closeShiftAction, getPosClientsAction } from './shift-actions'
import { printOrderReceipt } from '@/lib/qz-tray-service'

interface CartLine {
  item: Item
  quantity: number
  unitPrice: number
  totalPrice: number
  stockAvailable: number
}

export function PosClient() {
  const supabase = createClient()
  const { currentStore, storeId } = useStore()

  // Authenticated User & Active Cash Shift
  const [currentUser, setCurrentUser] = useState<Profile | null>(null)
  const [activeShift, setActiveShift] = useState<CashShift | null>(null)
  const [checkingShift, setCheckingShift] = useState(true)
  const [shiftModalOpen, setShiftModalOpen] = useState(false)
  const [closingShift, setClosingShift] = useState(false)

  // Items and Stock
  const [items, setItems] = useState<Item[]>([])
  const [stocksMap, setStocksMap] = useState<Record<string, number>>({})
  const [loadingItems, setLoadingItems] = useState(true)
  const [search, setSearch] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Cart
  const [cart, setCart] = useState<CartLine[]>([])

  // Selected Client & Client Selector Modal
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [isClientSelected, setIsClientSelected] = useState<boolean>(false)
  const [clientModalOpen, setClientModalOpen] = useState(false)
  const [clientsList, setClientsList] = useState<Client[]>([])
  const [loadingClients, setLoadingClients] = useState(false)

  // Checkout & SAT Payment Modal
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false)

  // Completed Order for Ticket Receipt Modal
  const [completedOrder, setCompletedOrder] = useState<{
    orderId: string
    orderNumber: number
    date: string
    items: CartLine[]
    subtotal: number
    tax: number
    total: number
    clientName: string
    primaryMethod: SatPaymentCode
    payments: PaymentBreakdownItem[]
    cashReceivedMxn: number
    cashReceivedUsd: number
    changeMxn: number
    changeUsd: number
    exchangeRate: number
    notes?: string
  } | null>(null)
  const [printingWithQz, setPrintingWithQz] = useState(false)

  const handlePrintTicket = async () => {
    if (!completedOrder) return
    setPrintingWithQz(true)

    try {
      // 1. Check if there's an active branch printer for this store
      if (storeId) {
        const { data: printer } = await supabase
          .from('branch_printers')
          .select('*')
          .eq('id_store', storeId)
          .eq('status', 'A')
          .order('is_default', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (printer) {
          const { data: company } = await supabase
            .from('company_settings')
            .select('*')
            .limit(1)
            .maybeSingle()

          await printOrderReceipt(
            printer as BranchPrinter,
            {
              orderNumber: completedOrder.orderNumber,
              date: completedOrder.date,
              clientName: completedOrder.clientName,
              items: completedOrder.items.map((it) => ({
                description: it.item.description || 'Artículo',
                quantity: it.quantity,
                unitPrice: it.unitPrice,
                totalPrice: it.totalPrice,
              })),
              subtotal: completedOrder.subtotal,
              tax: completedOrder.tax,
              total: completedOrder.total,
              primaryMethod: completedOrder.primaryMethod,
              payments: completedOrder.payments.map((p) => ({
                method: SAT_PAYMENT_METHODS.find((m) => m.code === p.method)?.label || p.method,
                amount: p.amountMxn || p.amountUsd || 0,
                reference: p.reference,
              })),
              cashReceivedMxn: completedOrder.cashReceivedMxn,
              cashReceivedUsd: completedOrder.cashReceivedUsd,
              changeMxn: completedOrder.changeMxn,
              changeUsd: completedOrder.changeUsd,
              exchangeRate: completedOrder.exchangeRate,
              notes: completedOrder.notes,
            },
            company as CompanySettings | null,
            currentStore?.description || undefined
          )

          toast.success(`Ticket impreso en "${printer.name}" vía QZ Tray`)
          setPrintingWithQz(false)
          return
        }
      }
    } catch (err: unknown) {
      console.warn('[POS] QZ Tray no disponible, recurriendo a impresión de navegador:', err)
    } finally {
      setPrintingWithQz(false)
    }

    // Fallback: window.print()
    window.print()
  }

  // 1. Fetch Current Authenticated User Profile
  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Try fetching profile from profiles or users
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle()

      if (profile) {
        setCurrentUser(profile as Profile)
      } else {
        // Fallback with user metadata
        setCurrentUser({
          id: user.id,
          full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Cajero',
          email: user.email || null,
          phone: user.phone || null,
          role: (user.user_metadata?.role as any) || 'CASHIER',
          id_store: storeId || null,
          status: 'active',
          avatar_url: user.user_metadata?.avatar_url || null,
          created_at: user.created_at,
          updated_at: user.created_at,
        })
      }
    }
    loadUser()
  }, [supabase, storeId])

  // 2. Check for Active Cash Shift
  const checkShift = useCallback(async () => {
    if (!storeId || !currentUser) {
      setCheckingShift(false)
      return
    }

    setCheckingShift(true)
    try {
      const shift = await getActiveShiftAction(storeId, currentUser.id)
      if (shift && shift.status === 'open') {
        setActiveShift(shift)
        setShiftModalOpen(false)
      } else {
        setActiveShift(null)
        setShiftModalOpen(true)
      }
    } catch (err) {
      console.warn('Error verificando turno de caja:', err)
      setActiveShift(null)
      setShiftModalOpen(true)
    } finally {
      setCheckingShift(false)
    }
  }, [storeId, currentUser])

  useEffect(() => {
    if (storeId && currentUser) {
      checkShift()
    }
  }, [storeId, currentUser, checkShift])

  // Realtime subscription on cash_shifts
  useEffect(() => {
    if (!storeId) return

    const channel = supabase
      .channel(`pos-shifts-${storeId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cash_shifts', filter: `id_store=eq.${storeId}` },
        () => {
          checkShift()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [storeId, supabase, checkShift])

  // 3. Load Clients List for Quick Autocomplete Modal (via Admin Server Action to bypass RLS)
  const fetchClients = useCallback(async () => {
    setLoadingClients(true)
    try {
      const data = await getPosClientsAction()
      setClientsList(data || [])
    } catch (err) {
      console.error('Error cargando clientes en POS:', err)
      setClientsList([])
    } finally {
      setLoadingClients(false)
    }
  }, [])

  useEffect(() => {
    fetchClients()
  }, [fetchClients])

  // Realtime subscription on clients table
  useEffect(() => {
    const channel = supabase
      .channel('pos-clients-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'clients' },
        () => {
          fetchClients()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, fetchClients])

  // Prompt client selector modal when shift is open and client is not yet selected
  const initialClientPromptDone = useRef(false)
  useEffect(() => {
    if (activeShift && !checkingShift && !isClientSelected && !initialClientPromptDone.current) {
      initialClientPromptDone.current = true
      // Open client selector immediately so cashier selects client before ticket
      setClientModalOpen(true)
    }
  }, [activeShift, checkingShift, isClientSelected])

  // 4. Load Items with Images and Stocks
  const fetchCatalogAndStocks = useCallback(async () => {
    if (!storeId) return
    setLoadingItems(true)

    // 1. Fetch active items with their uploaded images
    const { data: itemsData, error: itemsError } = await supabase
      .from('items')
      .select('*, category:categories(description), item_images(*)')
      .eq('status', 'A')
      .order('description')

    if (itemsError) {
      toast.error('Error al cargar artículos')
      setLoadingItems(false)
      return
    }

    // 2. Fetch stocks for this store
    const { data: stocksData } = await supabase
      .from('stocks')
      .select('id_item, current')
      .eq('id_store', storeId)

    const map: Record<string, number> = {}
    if (stocksData) {
      stocksData.forEach((s) => {
        if (s.id_item) map[s.id_item] = (map[s.id_item] ?? 0) + (s.current ?? 0)
      })
    }

    setItems((itemsData as unknown as Item[]) ?? [])
    setStocksMap(map)
    setLoadingItems(false)
  }, [storeId, supabase])

  useEffect(() => {
    fetchCatalogAndStocks()
  }, [fetchCatalogAndStocks])

  // Realtime subscription on stocks & item_images for POS
  useEffect(() => {
    if (!storeId) return

    const channel = supabase
      .channel(`pos-catalog-${storeId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stocks', filter: `id_store=eq.${storeId}` },
        () => {
          fetchCatalogAndStocks()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'item_images' },
        () => {
          fetchCatalogAndStocks()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'items' },
        () => {
          fetchCatalogAndStocks()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [storeId, supabase, fetchCatalogAndStocks])

  // Determine price based on client's assigned price list
  const getItemPrice = useCallback(
    (item: Item): number => {
      const priceNum = selectedClient?.price_number ?? 1
      if (priceNum === 2 && item.price2) return Number(item.price2)
      if (priceNum === 3 && item.price3) return Number(item.price3)
      if (item.price1) return Number(item.price1)
      if (item.price) return Number(item.price)
      return 0
    },
    [selectedClient]
  )

  // Re-calculate cart prices if client changes
  useEffect(() => {
    setCart((prev) =>
      prev.map((line) => {
        const unitPrice = getItemPrice(line.item)
        return {
          ...line,
          unitPrice,
          totalPrice: unitPrice * line.quantity,
        }
      })
    )
  }, [selectedClient, getItemPrice])

  // Add Item to Cart
  const handleAddToCart = (item: Item) => {
    if (!activeShift) {
      toast.error('Debes abrir caja antes de realizar ventas')
      setShiftModalOpen(true)
      return
    }

    if (!isClientSelected) {
      toast.error('Debes seleccionar o confirmar el cliente antes de agregar productos')
      setClientModalOpen(true)
      return
    }

    const unitPrice = getItemPrice(item)
    const stockAvailable = stocksMap[item.id_item] ?? 0

    setCart((prev) => {
      const existing = prev.find((line) => line.item.id_item === item.id_item)
      if (existing) {
        return prev.map((line) => {
          if (line.item.id_item === item.id_item) {
            const nextQty = line.quantity + 1
            return {
              ...line,
              quantity: nextQty,
              totalPrice: nextQty * line.unitPrice,
            }
          }
          return line
        })
      } else {
        return [
          ...prev,
          {
            item,
            quantity: 1,
            unitPrice,
            totalPrice: unitPrice,
            stockAvailable,
          },
        ]
      }
    })
    toast.success(`${item.description} agregado al carrito`)
    searchInputRef.current?.focus()
  }

  // Update Cart Quantity
  const handleUpdateQuantity = (itemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((line) => {
          if (line.item.id_item === itemId) {
            const newQty = line.quantity + delta
            if (newQty <= 0) return null
            return {
              ...line,
              quantity: newQty,
              totalPrice: newQty * line.unitPrice,
            }
          }
          return line
        })
        .filter(Boolean) as CartLine[]
    )
  }

  // Remove from Cart
  const handleRemoveFromCart = (itemId: string) => {
    setCart((prev) => prev.filter((l) => l.item.id_item !== itemId))
  }

  // Clear Cart
  const handleClearCart = () => {
    setCart([])
    setSelectedClient(null)
    setIsClientSelected(false)
    initialClientPromptDone.current = false
    setClientModalOpen(true)
  }

  // Barcode / Fast Input Scanner in search box
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (!isClientSelected) {
        toast.error('Debes seleccionar o confirmar el cliente antes de buscar o escanear productos')
        setClientModalOpen(true)
        return
      }
      const query = search.trim().toLowerCase()
      if (!query) return

      // Look for exact barcode or code match first
      const exactMatch = items.find(
        (i) => i.barcode?.toLowerCase() === query || i.code?.toLowerCase() === query
      )

      if (exactMatch) {
        handleAddToCart(exactMatch)
        setSearch('')
      } else {
        // If not exact barcode, check if there's only 1 item matching search
        const filtered = items.filter(
          (i) =>
            i.description?.toLowerCase().includes(query) ||
            i.code?.toLowerCase().includes(query) ||
            i.barcode?.toLowerCase().includes(query)
        )
        if (filtered.length === 1) {
          handleAddToCart(filtered[0])
          setSearch('')
        }
      }
    }
  }

  // Cart Totals
  const { subtotal, taxAmount, total } = useMemo(() => {
    let sub = 0
    let tax = 0
    cart.forEach((line) => {
      const lineTotal = line.totalPrice
      const lineTaxRate = (line.item.tax ?? 16) / 100
      sub += lineTotal
      tax += lineTotal * lineTaxRate
    })
    return {
      subtotal: sub,
      taxAmount: tax,
      total: sub + tax,
    }
  }, [cart])

  // Open Checkout Modal
  const handleOpenCheckout = () => {
    if (!activeShift) {
      toast.error('Debes abrir caja antes de realizar cobros')
      setShiftModalOpen(true)
      return
    }
    if (!isClientSelected) {
      toast.error('Debes seleccionar un cliente para este ticket')
      setClientModalOpen(true)
      return
    }
    if (cart.length === 0) {
      toast.error('El carrito está vacío')
      return
    }
    setPaymentModalOpen(true)
  }

  // Process SAT Order & Mixed Payment
  const handleProcessOrder = async (paymentData: {
    primaryMethod: SatPaymentCode
    payments: PaymentBreakdownItem[]
    cashReceivedMxn: number
    cashReceivedUsd: number
    changeMxn: number
    changeUsd: number
    exchangeRate: number
    notes?: string
  }) => {
    if (!storeId) {
      toast.error('No hay una sucursal activa seleccionada')
      return
    }

    setIsSubmittingOrder(true)

    try {
      // 1. Insert order into `orders`
      const orderPayload: Record<string, unknown> = {
        id_store: storeId,
        id_client: selectedClient?.id_client ?? null,
        total_amount: total,
        tax_amount: taxAmount,
        status: 'completed',
        payment_method:
          paymentData.primaryMethod === '01'
            ? 'cash'
            : paymentData.primaryMethod === '04' || paymentData.primaryMethod === '28'
            ? 'card'
            : paymentData.primaryMethod === '03'
            ? 'transfer'
            : 'mixed',
        payment_reference: paymentData.notes
          ? `${paymentData.notes} | ${paymentData.payments.map((p) => `[SAT ${p.method}] ${formatCurrency(p.amountMxn)}`).join(' | ')}`
          : paymentData.payments
              .map((p) => `[SAT ${p.method}] ${formatCurrency(p.amountMxn)}`)
              .join(' | '),
      }

      // Extras if columns exist
      if (activeShift?.id_shift) orderPayload.id_shift = activeShift.id_shift
      if (paymentData.notes) orderPayload.notes = paymentData.notes
      orderPayload.payment_sat_code = paymentData.primaryMethod
      orderPayload.payment_breakdown = paymentData.payments
      orderPayload.exchange_rate = paymentData.exchangeRate
      orderPayload.cash_received_mxn = paymentData.cashReceivedMxn
      orderPayload.cash_received_usd = paymentData.cashReceivedUsd
      orderPayload.change_mxn = paymentData.changeMxn
      orderPayload.change_usd = paymentData.changeUsd

      let orderData: any = null
      const { data: insertedOrder, error: orderError } = await supabase
        .from('orders')
        .insert(orderPayload)
        .select()
        .single()

      if (orderError) {
        // Retry without extended columns if schema isn't fully migrated
        const basicPayload = {
          id_store: storeId,
          id_client: selectedClient?.id_client ?? null,
          total_amount: total,
          tax_amount: taxAmount,
          status: 'completed',
          payment_method: orderPayload.payment_method,
          payment_reference: orderPayload.payment_reference,
        }
        const { data: retryOrder, error: retryErr } = await supabase
          .from('orders')
          .insert(basicPayload)
          .select()
          .single()

        if (retryErr) throw new Error(retryErr.message)
        orderData = retryOrder
      } else {
        orderData = insertedOrder
      }

      const orderId = orderData.id_order
      const orderNumber = orderData.order_number ?? Math.floor(1000 + Math.random() * 9000)

      // 2. Insert items into `order_items`
      const orderItemsToInsert = cart.map((line) => ({
        id_order: orderId,
        id_item: line.item.id_item,
        quantity: line.quantity,
        unit_price: line.unitPrice,
        total_price: line.totalPrice,
      }))

      const { error: itemsError } = await supabase.from('order_items').insert(orderItemsToInsert)
      if (itemsError) throw new Error(itemsError.message)

      // 3. Update stock & register transactions
      for (const line of cart) {
        const { data: stockEntry } = await supabase
          .from('stocks')
          .select('id_stock, current, id_location')
          .eq('id_item', line.item.id_item)
          .eq('id_store', storeId)
          .maybeSingle()

        if (stockEntry) {
          const newCurrent = Math.max(0, (stockEntry.current ?? 0) - line.quantity)
          await supabase
            .from('stocks')
            .update({
              previous: stockEntry.current,
              current: newCurrent,
            })
            .eq('id_stock', stockEntry.id_stock)

          await supabase.from('transactions').insert({
            id_store: storeId,
            id_location: stockEntry.id_location,
            id_item: line.item.id_item,
            movim_type: 'V',
            amount_enrty: 0,
            amount_exit: line.quantity,
            cost: line.item.cost ?? 0,
            price: line.unitPrice,
            reference: `VENTA-ORDEN-#${orderNumber}`,
            concept: 'Venta Punto de Venta (POS)',
            origin: 'POS',
          })
        }
      }

      // 4. Set completed order for Ticket receipt preview
      setCompletedOrder({
        orderId,
        orderNumber,
        date: new Date().toISOString(),
        items: [...cart],
        subtotal,
        tax: taxAmount,
        total,
        clientName: selectedClient
          ? `${selectedClient.first_name ?? ''} ${selectedClient.last_name ?? ''}`.trim()
          : 'Público en General',
        primaryMethod: paymentData.primaryMethod,
        payments: paymentData.payments,
        cashReceivedMxn: paymentData.cashReceivedMxn,
        cashReceivedUsd: paymentData.cashReceivedUsd,
        changeMxn: paymentData.changeMxn,
        changeUsd: paymentData.changeUsd,
        exchangeRate: paymentData.exchangeRate,
        notes: paymentData.notes,
      })

      // 5. Reset POS cart & close payment modal
      setCart([])
      setSelectedClient(null)
      setIsClientSelected(false)
      initialClientPromptDone.current = false
      setPaymentModalOpen(false)
      toast.success(`¡Venta #${orderNumber} completada exitosamente!`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al registrar la venta'
      toast.error(msg)
    } finally {
      setIsSubmittingOrder(false)
    }
  }

  // Handle Close Shift (Fin de jornada)
  const handleCloseShift = async () => {
    if (!activeShift) return
    const ok = window.confirm(
      '¿Deseas cerrar tu caja y finalizar tu jornada de cobro en esta sucursal?'
    )
    if (!ok) return

    setClosingShift(true)
    try {
      await closeShiftAction(
        activeShift.id_shift,
        activeShift.initial_cash_mxn,
        activeShift.initial_cash_usd,
        'Cierre de turno realizado desde POS'
      )
      toast.success('Jornada de caja finalizada')
      setActiveShift(null)
      setShiftModalOpen(true)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al cerrar caja'
      toast.error(msg)
    } finally {
      setClosingShift(false)
    }
  }

  // Filtered Items for catalog grid
  const filteredCatalog = useMemo(() => {
    if (!search.trim()) return items
    const q = search.toLowerCase()
    return items.filter(
      (i) =>
        i.description?.toLowerCase().includes(q) ||
        i.code?.toLowerCase().includes(q) ||
        i.barcode?.toLowerCase().includes(q) ||
        i.category?.description?.toLowerCase().includes(q)
    )
  }, [items, search])

  return (
    <div className="space-y-4">
      <div className="dashboard-bg" />

      {/* POS Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 glass p-3 rounded-2xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-lg">
            <ShoppingCart size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground leading-none">Punto de Venta</h1>
            <div className="flex items-center gap-2 mt-1 text-xs">
              <span className="text-muted-foreground">
                Sucursal:{' '}
                <span className="font-semibold text-emerald-500">
                  {currentStore?.description ?? 'No seleccionada'}
                </span>
              </span>

              {/* Status Badge of Active Cash Shift */}
              {activeShift ? (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold">
                  <ShieldCheck size={11} /> Caja Abierta (Fondo: {formatCurrency(activeShift.initial_cash_mxn)} / ${activeShift.initial_cash_usd} USD)
                </span>
              ) : (
                <button
                  onClick={() => setShiftModalOpen(true)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400 text-[10px] font-bold hover:bg-rose-500/25 transition-colors"
                >
                  <Lock size={11} /> Caja Cerrada (Abrir Turno)
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons: Client Selector & Shift Options */}
        <div className="flex items-center gap-2">
          {/* Client Selector Button */}
          <button
            onClick={() => setClientModalOpen(true)}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
              !isClientSelected
                ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 ring-2 ring-amber-500/30 animate-pulse'
                : 'glass-input hover:border-emerald-500/40'
            }`}
          >
            <User size={15} className={!isClientSelected ? 'text-amber-400' : 'text-emerald-500'} />
            <div className="text-left">
              <span className="text-[10px] text-muted-foreground block leading-none">
                {!isClientSelected ? '⚠️ Cliente Requerido' : 'Cliente'}
              </span>
              <span className="text-foreground font-semibold truncate max-w-[150px] block">
                {!isClientSelected
                  ? 'Clic para seleccionar'
                  : selectedClient
                  ? `${selectedClient.first_name ?? ''} ${selectedClient.last_name ?? ''}`.trim()
                  : 'Público en General'}
              </span>
            </div>
            {isClientSelected && selectedClient && (
              Number(selectedClient.price_number) === 2 ? (
                <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 text-[10px] font-bold border border-blue-500/30">
                  Mayoreo (P2)
                </span>
              ) : (
                <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-bold border border-emerald-500/30">
                  Menudeo (P1)
                </span>
              )
            )}
            {isClientSelected && !selectedClient && (
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-bold border border-emerald-500/30">
                Público General
              </span>
            )}
          </button>

          {isClientSelected && (
            <button
              onClick={() => {
                setSelectedClient(null)
                setIsClientSelected(false)
                initialClientPromptDone.current = false
                setClientModalOpen(true)
              }}
              className="p-2 rounded-xl glass-input text-muted-foreground hover:text-foreground"
              title="Cambiar cliente"
            >
              <RotateCcw size={14} />
            </button>
          )}

          {/* Close Shift Button */}
          {activeShift && (
            <button
              onClick={handleCloseShift}
              disabled={closingShift}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl glass-input text-xs font-medium text-rose-400 hover:text-rose-300 hover:border-rose-500/40 transition-all"
              title="Cerrar turno de caja al terminar jornada"
            >
              <DoorClosed size={14} />
              <span className="hidden md:inline">Cerrar Caja</span>
            </button>
          )}
        </div>
      </div>

      {/* Main POS Layout: Grid (Catalog) on Left + Cart on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Search & Products Grid */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-3">
          {/* Client Required Alert Banner */}
          {!isClientSelected && (
            <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-between gap-3 text-amber-300 text-xs shadow-lg">
              <div className="flex items-center gap-2.5">
                <Users size={18} className="text-amber-400 shrink-0" />
                <div>
                  <p className="font-bold text-foreground">Selección de cliente obligatoria</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Para iniciar un nuevo ticket de venta, debes seleccionar un cliente registrado o confirmar Público en General.
                  </p>
                </div>
              </div>
              <GlassButton
                variant="primary"
                size="sm"
                onClick={() => setClientModalOpen(true)}
                className="text-xs shrink-0 py-1.5 px-3"
              >
                Seleccionar Cliente
              </GlassButton>
            </div>
          )}

          {/* Search bar with scanner autofocus */}
          <div className="relative">
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Buscar por descripción o escanear código de barras (Enter para agregar)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="glass-input w-full pl-10 pr-4 py-3 text-sm text-foreground focus:ring-2 focus:ring-emerald-500/50"
            />
            <Search
              size={18}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Catalog Grid with Product Thumbnails */}
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 max-h-[calc(100vh-250px)] overflow-y-auto scroll-modern pr-1">
            {loadingItems ? (
              <div className="col-span-full py-16 text-center text-muted-foreground">
                <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-sm">Cargando productos...</p>
              </div>
            ) : filteredCatalog.length === 0 ? (
              <div className="col-span-full py-16 text-center text-muted-foreground">
                <p className="text-base font-semibold">No se encontraron artículos</p>
                <p className="text-xs text-muted-foreground/80 mt-1">
                  Intente con otra búsqueda o código
                </p>
              </div>
            ) : (
              filteredCatalog.map((item) => {
                const stock = stocksMap[item.id_item] ?? 0
                const price = getItemPrice(item)
                const coverImg =
                  item.item_images?.find((img) => img.is_cover) || item.item_images?.[0]

                return (
                  <motion.button
                    key={item.id_item}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleAddToCart(item)}
                    className="glass-card p-3 flex flex-col justify-between text-left group hover:border-emerald-500/40 transition-all relative overflow-hidden"
                  >
                    <div>
                      {/* Code and Stock info */}
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1.5">
                        <span className="font-mono truncate max-w-[90px]">
                          {item.code || item.barcode || '—'}
                        </span>
                        <span
                          className={`font-semibold shrink-0 ${
                            stock > 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          Stock: {stock}
                        </span>
                      </div>

                      {/* Product Thumbnail + Title */}
                      <div className="flex items-start gap-2.5 my-1">
                        {coverImg?.image_url ? (
                          <div className="w-11 h-11 rounded-xl overflow-hidden border border-border/40 shrink-0 bg-black/20 relative group-hover:border-emerald-500/40 transition-colors">
                            <img
                              src={coverImg.image_url}
                              alt={item.description || 'Producto'}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                              loading="lazy"
                            />
                            {item.item_images && item.item_images.length > 1 && (
                              <span className="absolute bottom-0 right-0 px-1 py-0.2 rounded-tl-md bg-black/80 backdrop-blur-xs text-[8px] font-bold text-emerald-400">
                                +{item.item_images.length - 1}
                              </span>
                            )}
                          </div>
                        ) : (
                          /* Generic Image Placeholder matching items-client.tsx L1044 */
                          <div
                            className="w-11 h-11 rounded-xl bg-white/[0.03] border border-border/40 flex items-center justify-center text-muted-foreground/40 group-hover:text-emerald-400 group-hover:border-emerald-500/40 transition-colors shrink-0"
                            title="Sin imagen"
                          >
                            <ImageIcon size={18} />
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-foreground text-xs sm:text-sm line-clamp-2 group-hover:text-emerald-400 transition-colors leading-snug">
                            {item.description}
                          </h4>
                          {item.category?.description && (
                            <span className="text-[10px] text-muted-foreground/70 truncate block mt-0.5">
                              {item.category.description}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Price and Add button */}
                    <div className="mt-3 pt-2 border-t border-border/20 flex items-center justify-between">
                      <span className="text-sm font-bold text-emerald-400 font-mono">
                        {formatCurrency(price)}
                      </span>
                      <span className="w-6 h-6 rounded-lg bg-emerald-500/10 group-hover:bg-emerald-500 text-emerald-400 group-hover:text-white flex items-center justify-center transition-colors">
                        <Plus size={14} />
                      </span>
                    </div>
                  </motion.button>
                )
              })
            )}
          </div>
        </div>

        {/* Right: Cart & Order Summary */}
        <div className="lg:col-span-5 xl:col-span-4 flex flex-col">
          <GlassCard padding="none" className="flex flex-col flex-1 max-h-[calc(100vh-190px)]">
            {/* Cart Header */}
            <div className="p-3.5 border-b border-border/40 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingCart size={18} className="text-emerald-500" />
                <h3 className="font-bold text-foreground text-sm">
                  Ticket de Venta ({cart.reduce((a, b) => a + b.quantity, 0)})
                </h3>
              </div>
              {cart.length > 0 && (
                <button
                  onClick={handleClearCart}
                  className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 transition-colors"
                >
                  <Trash2 size={13} />
                  Limpiar
                </button>
              )}
            </div>

            {/* Cart Items List with Thumbnail */}
            <div className="flex-1 overflow-y-auto scroll-modern divide-y divide-border/20 p-2">
              {cart.length === 0 ? (
                <div className="py-16 text-center text-muted-foreground px-4">
                  <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-3 text-muted-foreground/60">
                    <ScanLine size={24} />
                  </div>
                  <p className="text-sm font-medium">El carrito está vacío</p>
                  <p className="text-xs text-muted-foreground/80 mt-1">
                    Seleccione un producto o escanee un código de barras
                  </p>
                </div>
              ) : (
                cart.map((line) => {
                  const cartImg =
                    line.item.item_images?.find((i) => i.is_cover) || line.item.item_images?.[0]

                  return (
                    <div
                      key={line.item.id_item}
                      className="p-2.5 flex items-center justify-between gap-2.5 group hover:bg-white/[0.02] rounded-xl"
                    >
                      {/* Mini Thumbnail in Cart */}
                      <div className="w-9 h-9 rounded-lg overflow-hidden border border-border/40 shrink-0 bg-black/20 flex items-center justify-center">
                        {cartImg?.image_url ? (
                          <img
                            src={cartImg.image_url}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <ImageIcon size={14} className="text-muted-foreground/40" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">
                          {line.item.description}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground font-mono">
                          <span>{formatCurrency(line.unitPrice)}</span>
                          <span>×</span>
                          <span className="text-foreground font-semibold">{line.quantity}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleUpdateQuantity(line.item.id_item, -1)}
                          className="w-6 h-6 rounded-lg glass-input flex items-center justify-center text-muted-foreground hover:text-foreground"
                        >
                          <Minus size={12} />
                        </button>
                        <span className="w-5 text-center text-xs font-bold font-mono text-foreground">
                          {line.quantity}
                        </span>
                        <button
                          onClick={() => handleUpdateQuantity(line.item.id_item, 1)}
                          className="w-6 h-6 rounded-lg glass-input flex items-center justify-center text-muted-foreground hover:text-foreground"
                        >
                          <Plus size={12} />
                        </button>
                      </div>

                      <div className="text-right min-w-[65px]">
                        <span className="text-xs font-bold text-foreground font-mono block">
                          {formatCurrency(line.totalPrice)}
                        </span>
                        <button
                          onClick={() => handleRemoveFromCart(line.item.id_item)}
                          className="text-[10px] text-rose-400/80 hover:text-rose-300 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          Quitar
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* Cart Footer / Totals & Pay Button */}
            <div className="p-4 border-t border-border/40 space-y-3 bg-black/20">
              <div className="space-y-1.5 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="font-mono text-foreground">{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Impuestos (IVA)</span>
                  <span className="font-mono text-foreground">{formatCurrency(taxAmount)}</span>
                </div>
                <div className="flex justify-between text-base font-bold text-foreground pt-1.5 border-t border-border/20">
                  <div>
                    <span>Total MXN:</span>
                    <span className="text-[11px] text-muted-foreground block font-normal">
                      ≈ ${(total / (activeShift?.exchange_rate || 19)).toFixed(2)} USD
                    </span>
                  </div>
                  <span className="font-mono text-emerald-400 text-lg">
                    {formatCurrency(total)}
                  </span>
                </div>
              </div>

              <GlassButton
                variant="primary"
                onClick={handleOpenCheckout}
                disabled={cart.length === 0}
                className="w-full py-3.5 text-sm font-bold shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2"
              >
                <DollarSign size={18} />
                Cobrar {formatCurrency(total)}
              </GlassButton>
            </div>
          </GlassCard>
        </div>
      </div>

      {/* Modal 1: Shift Opening (Apertura de Caja Bimoneda con Biometría Obligatoria) */}
      <ShiftOpenModal
        open={shiftModalOpen && !checkingShift}
        storeId={storeId || ''}
        storeName={currentStore?.description || 'Sucursal Matriz'}
        user={currentUser}
        onShiftOpened={(shift) => {
          setActiveShift(shift)
          setShiftModalOpen(false)
          // Open Client prompt right after opening shift
          setClientModalOpen(true)
        }}
      />

      {/* Modal 2: Client Selector with Enter shortcut for Público en General + Autocomplete */}
      <PosClientModal
        open={clientModalOpen}
        onOpenChange={setClientModalOpen}
        clients={clientsList}
        selectedClient={selectedClient}
        loading={loadingClients}
        required={!isClientSelected && cart.length === 0}
        onSelectClient={(c) => {
          setSelectedClient(c)
          setIsClientSelected(true)
          setClientModalOpen(false)
          toast.success(
            c
              ? `Cliente ${c.first_name || ''} ${c.last_name || ''} seleccionado (${Number(c.price_number) === 2 ? 'Mayoreo · Precio 2' : 'Menudeo · Precio 1'})`
              : 'Público en General seleccionado'
          )
          searchInputRef.current?.focus()
        }}
      />

      {/* Modal 3: SAT Payment Methods & Mixed Payments (MXN / USD) */}
      <PosPaymentModal
        open={paymentModalOpen}
        onOpenChange={setPaymentModalOpen}
        totalAmountMxn={total}
        exchangeRate={activeShift?.exchange_rate || 19.0}
        selectedClient={selectedClient}
        isSubmitting={isSubmittingOrder}
        onConfirmPayment={handleProcessOrder}
      />

      {/* Modal 4: Completed Ticket Receipt Preview with SAT breakdown & Bilingual Change */}
      <AnimatePresence>
        {completedOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white text-zinc-900 rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4 print:shadow-none print:m-0 print:p-2"
            >
              {/* Thermal ticket layout */}
              <div className="text-center border-b border-dashed border-zinc-300 pb-3">
                <h2 className="font-black text-xl tracking-tight text-zinc-950">CAMPIRAN POS</h2>
                <p className="text-xs text-zinc-600 mt-0.5">{currentStore?.description ?? 'Matriz'}</p>
                <p className="text-[11px] text-zinc-500 font-mono mt-1">
                  Ticket #{completedOrder.orderNumber} · {formatDateTime(completedOrder.date)}
                </p>
                <p className="text-[11px] text-zinc-600 mt-0.5">
                  Cliente: <span className="font-bold">{completedOrder.clientName}</span>
                </p>
              </div>

              {/* Items Table */}
              <div className="space-y-1.5 text-xs font-mono border-b border-dashed border-zinc-300 pb-3">
                {completedOrder.items.map((it) => (
                  <div key={it.item.id_item} className="flex justify-between items-start">
                    <div className="flex-1 pr-2">
                      <p className="font-semibold text-zinc-900 leading-tight">
                        {it.item.description}
                      </p>
                      <p className="text-[10px] text-zinc-500">
                        {it.quantity} × {formatCurrency(it.unitPrice)}
                      </p>
                    </div>
                    <span className="font-bold">{formatCurrency(it.totalPrice)}</span>
                  </div>
                ))}
              </div>

              {/* Totals & SAT Payments Breakdown */}
              <div className="space-y-1 text-xs font-mono border-b border-dashed border-zinc-300 pb-3">
                <div className="flex justify-between text-zinc-600">
                  <span>Subtotal:</span>
                  <span>{formatCurrency(completedOrder.subtotal)}</span>
                </div>
                <div className="flex justify-between text-zinc-600">
                  <span>IVA:</span>
                  <span>{formatCurrency(completedOrder.tax)}</span>
                </div>
                <div className="flex justify-between font-bold text-sm text-zinc-950 pt-1">
                  <span>TOTAL:</span>
                  <span>{formatCurrency(completedOrder.total)}</span>
                </div>

                {/* SAT Payment Breakdown */}
                <div className="pt-2 mt-2 border-t border-dashed border-zinc-200">
                  <div className="flex justify-between font-semibold text-zinc-800 text-[11px]">
                    <span>Forma Pago SAT:</span>
                    <span>
                      [{completedOrder.primaryMethod}]{' '}
                      {SAT_PAYMENT_METHODS.find((m) => m.code === completedOrder.primaryMethod)?.label}
                    </span>
                  </div>

                  {completedOrder.payments.map((p, i) => (
                    <div key={i} className="flex justify-between text-zinc-600 text-[10px]">
                      <span>
                        • SAT {p.method} ({p.currency}):
                      </span>
                      <span>
                        {formatCurrency(p.amountMxn)}{' '}
                        {p.currency === 'USD' && `($${p.amountUsd?.toFixed(2)} USD)`}
                      </span>
                    </div>
                  ))}

                  {/* Change in BOTH MXN and USD */}
                  {completedOrder.changeMxn > 0 && (
                    <div className="pt-1.5 mt-1 border-t border-zinc-200 text-zinc-950 font-bold">
                      <div className="flex justify-between text-xs">
                        <span>CAMBIO ENTREGADO:</span>
                        <span>{formatCurrency(completedOrder.changeMxn)}</span>
                      </div>
                      <div className="flex justify-between text-[11px] text-emerald-700">
                        <span>Equiv. en Dólares (USD):</span>
                        <span>${completedOrder.changeUsd.toFixed(2)} USD</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Observaciones de la Venta (impresión en ticket) */}
              {completedOrder.notes && (
                <div className="border-b border-dashed border-zinc-300 pb-2.5 text-left">
                  <p className="text-[10px] font-bold text-zinc-700 uppercase tracking-wide">
                    Observaciones:
                  </p>
                  <p className="text-[11px] text-zinc-800 font-mono mt-0.5 whitespace-pre-wrap bg-zinc-50 p-2 rounded-lg border border-zinc-200">
                    {completedOrder.notes}
                  </p>
                </div>
              )}

              <div className="text-center text-[10px] text-zinc-500">
                <p>¡Gracias por su compra!</p>
                <p className="mt-0.5">Campiran POS · Sistema de Ventas en la Nube</p>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center gap-2 pt-2 print:hidden">
                <button
                  onClick={handlePrintTicket}
                  disabled={printingWithQz}
                  className="flex-1 py-2.5 rounded-xl bg-zinc-900 text-white text-xs font-bold hover:bg-zinc-800 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Printer size={15} className={printingWithQz ? 'animate-spin' : ''} />
                  <span>{printingWithQz ? 'Imprimiendo...' : 'Imprimir Ticket'}</span>
                </button>
                <button
                  onClick={() => {
                    setCompletedOrder(null)
                    setIsClientSelected(false)
                    initialClientPromptDone.current = false
                    setClientModalOpen(true)
                  }}
                  className="flex-1 py-2.5 rounded-xl border border-zinc-300 text-zinc-800 text-xs font-bold hover:bg-zinc-100 transition-colors"
                >
                  Nueva Venta
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
