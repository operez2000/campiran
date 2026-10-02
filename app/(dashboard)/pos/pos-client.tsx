'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/utils/supabase/client'
import { useStore } from '@/components/providers/store-provider'
import { GlassCard } from '@/components/glass-card'
import { GlassButton } from '@/components/glass-button'
import { GlassInput } from '@/components/glass-input'
import { StatusBadge } from '@/components/status-badge'
import { type Item, type Client, type Stock, type PaymentMethod } from '@/lib/types'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { toast } from 'sonner'
import {
  ShoppingCart, Search, Plus, Minus, Trash2, User,
  CreditCard, Banknote, ArrowRightLeft, Printer, CheckCircle2,
  X, Layers, ScanLine, DollarSign, Store as StoreIcon
} from 'lucide-react'

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

  // Items and Stock
  const [items, setItems] = useState<Item[]>([])
  const [stocksMap, setStocksMap] = useState<Record<string, number>>({})
  const [loadingItems, setLoadingItems] = useState(true)
  const [search, setSearch] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Cart
  const [cart, setCart] = useState<CartLine[]>([])

  // Selected Client
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [clientModalOpen, setClientModalOpen] = useState(false)
  const [clientsList, setClientsList] = useState<Client[]>([])
  const [clientSearch, setClientSearch] = useState('')
  const [loadingClients, setLoadingClients] = useState(false)

  // Checkout & Payment Modal
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [cashReceived, setCashReceived] = useState<string>('')
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false)

  // Ticket Receipt Modal
  const [completedOrder, setCompletedOrder] = useState<{
    orderId: string
    orderNumber: number
    date: string
    items: CartLine[]
    subtotal: number
    tax: number
    total: number
    clientName: string
    paymentMethod: PaymentMethod
    cashReceived?: number
    change?: number
  } | null>(null)

  // Load items and stocks
  const fetchCatalogAndStocks = useCallback(async () => {
    if (!storeId) return
    setLoadingItems(true)

    // 1. Fetch active items
    const { data: itemsData, error: itemsError } = await supabase
      .from('items')
      .select('*, category:categories(description)')
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

  // Realtime subscription on stocks for POS
  useEffect(() => {
    if (!storeId) return

    const channel = supabase
      .channel(`pos-stocks-${storeId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stocks', filter: `id_store=eq.${storeId}` },
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
  }

  // Barcode / Fast Input Scanner in search box
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
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
    if (cart.length === 0) {
      toast.error('El carrito está vacío')
      return
    }
    setCashReceived(Math.ceil(total).toString())
    setPaymentModalOpen(true)
  }

  // Cash change calculation
  const cashChange = useMemo(() => {
    const received = Number(cashReceived) || 0
    return Math.max(0, received - total)
  }, [cashReceived, total])

  // Process and Save Order
  const handleProcessOrder = async () => {
    if (!storeId) {
      toast.error('No hay una sucursal activa seleccionada')
      return
    }

    if (paymentMethod === 'cash' && Number(cashReceived) < total) {
      toast.error('El efectivo recibido es menor al total a pagar')
      return
    }

    setIsSubmittingOrder(true)

    try {
      // 1. Insert order into `orders`
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .insert({
          id_store: storeId,
          id_client: selectedClient?.id_client ?? null,
          total_amount: total,
          tax_amount: taxAmount,
          status: 'completed',
          payment_method: paymentMethod,
          payment_reference:
            paymentMethod === 'cash'
              ? `Efectivo Recibido: ${formatCurrency(Number(cashReceived))}`
              : `Pago ${paymentMethod.toUpperCase()}`,
        })
        .select()
        .single()

      if (orderError) throw new Error(orderError.message)

      const orderId = orderData.id_order
      const orderNumber = orderData.order_number ?? 1

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
        // Find existing stock in this store
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

          // Insert into `transactions` (movim_type = 'V' para venta)
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
        paymentMethod,
        cashReceived: paymentMethod === 'cash' ? Number(cashReceived) : undefined,
        change: paymentMethod === 'cash' ? cashChange : undefined,
      })

      // 5. Reset POS cart
      setCart([])
      setSelectedClient(null)
      setPaymentModalOpen(false)
      toast.success(`¡Venta #${orderNumber} completada exitosamente!`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al registrar la venta'
      toast.error(msg)
    } finally {
      setIsSubmittingOrder(false)
    }
  }

  // Load clients for client selector modal
  const openClientSelector = async () => {
    setClientModalOpen(true)
    setLoadingClients(true)
    const { data } = await supabase
      .from('clients')
      .select('*')
      .eq('status', 'A')
      .order('first_name')
      .limit(100)

    if (data) setClientsList(data as Client[])
    setLoadingClients(false)
  }

  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return clientsList
    const q = clientSearch.toLowerCase()
    return clientsList.filter(
      (c) =>
        c.first_name?.toLowerCase().includes(q) ||
        c.last_name?.toLowerCase().includes(q) ||
        c.rfc?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q)
    )
  }, [clientsList, clientSearch])

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
            <h1 className="text-xl font-bold text-foreground leading-none">
              Punto de Venta
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              Sucursal:{' '}
              <span className="font-semibold text-emerald-500">
                {currentStore?.description ?? 'No seleccionada'}
              </span>
            </p>
          </div>
        </div>

        {/* Client Selector Button */}
        <div className="flex items-center gap-2">
          <button
            onClick={openClientSelector}
            className="flex items-center gap-2 px-3 py-2 rounded-xl glass-input text-xs font-medium hover:border-emerald-500/40 transition-all"
          >
            <User size={15} className="text-emerald-500" />
            <div className="text-left">
              <span className="text-[10px] text-muted-foreground block leading-none">Cliente</span>
              <span className="text-foreground font-semibold truncate max-w-[150px] block">
                {selectedClient
                  ? `${selectedClient.first_name ?? ''} ${selectedClient.last_name ?? ''}`.trim()
                  : 'Público en General'}
              </span>
            </div>
            {selectedClient && (
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">
                Lista #{selectedClient.price_number ?? 1}
              </span>
            )}
          </button>

          {selectedClient && (
            <button
              onClick={() => setSelectedClient(null)}
              className="p-2 rounded-xl glass-input text-muted-foreground hover:text-foreground"
              title="Quitar cliente y usar Público en General"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Main POS Layout: Grid (Catalog) on Left + Cart on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Search & Products Grid */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-3">
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
          </div>

          {/* Catalog Grid */}
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

                return (
                  <motion.button
                    key={item.id_item}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleAddToCart(item)}
                    className="glass-card p-3 flex flex-col justify-between text-left group hover:border-emerald-500/40 transition-all relative overflow-hidden"
                  >
                    <div>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                        <span className="font-mono">{item.code || item.barcode || '—'}</span>
                        <span
                          className={`font-semibold ${
                            stock > 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          Stock: {stock}
                        </span>
                      </div>
                      <h4 className="font-semibold text-foreground text-xs sm:text-sm line-clamp-2 group-hover:text-emerald-400 transition-colors">
                        {item.description}
                      </h4>
                    </div>

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

            {/* Cart Items List */}
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
                cart.map((line) => (
                  <div
                    key={line.item.id_item}
                    className="p-2.5 flex items-center justify-between gap-3 group hover:bg-white/[0.02] rounded-xl"
                  >
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

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleUpdateQuantity(line.item.id_item, -1)}
                        className="w-6 h-6 rounded-lg glass-input flex items-center justify-center text-muted-foreground hover:text-foreground"
                      >
                        <Minus size={12} />
                      </button>
                      <span className="w-6 text-center text-xs font-bold font-mono text-foreground">
                        {line.quantity}
                      </span>
                      <button
                        onClick={() => handleUpdateQuantity(line.item.id_item, 1)}
                        className="w-6 h-6 rounded-lg glass-input flex items-center justify-center text-muted-foreground hover:text-foreground"
                      >
                        <Plus size={12} />
                      </button>
                    </div>

                    <div className="text-right min-w-[70px]">
                      <p className="text-xs font-bold font-mono text-emerald-400">
                        {formatCurrency(line.totalPrice)}
                      </p>
                    </div>

                    <button
                      onClick={() => handleRemoveFromCart(line.item.id_item)}
                      className="p-1 rounded-lg text-muted-foreground/60 hover:text-rose-400 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))
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
                  <span>Total</span>
                  <span className="font-mono text-emerald-400">{formatCurrency(total)}</span>
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

      {/* Modal: Client Selector */}
      <AnimatePresence>
        {clientModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card max-w-lg w-full p-5 space-y-4 max-h-[80vh] flex flex-col"
            >
              <div className="flex items-center justify-between border-b border-border/40 pb-3">
                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                  <User size={18} className="text-emerald-500" />
                  Seleccionar Cliente
                </h3>
                <button
                  onClick={() => setClientModalOpen(false)}
                  className="p-1 rounded-lg text-muted-foreground hover:text-foreground"
                >
                  <X size={18} />
                </button>
              </div>

              <GlassInput
                placeholder="Buscar por nombre, RFC o correo..."
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                autoFocus
              />

              <div className="flex-1 overflow-y-auto scroll-modern divide-y divide-border/20 border border-border/30 rounded-xl">
                {/* Option for General Public */}
                <button
                  onClick={() => {
                    setSelectedClient(null)
                    setClientModalOpen(false)
                  }}
                  className="w-full p-3 text-left hover:bg-white/[0.05] transition-colors flex items-center justify-between"
                >
                  <div>
                    <p className="font-semibold text-foreground text-sm">Público en General</p>
                    <p className="text-xs text-muted-foreground">Venta al mostrador (Lista de precio #1)</p>
                  </div>
                  {!selectedClient && <CheckCircle2 size={18} className="text-emerald-500" />}
                </button>

                {filteredClients.map((client) => {
                  const isSelected = selectedClient?.id_client === client.id_client
                  const fullName = `${client.first_name ?? ''} ${client.last_name ?? ''}`.trim()
                  return (
                    <button
                      key={client.id_client}
                      onClick={() => {
                        setSelectedClient(client)
                        setClientModalOpen(false)
                      }}
                      className="w-full p-3 text-left hover:bg-white/[0.05] transition-colors flex items-center justify-between"
                    >
                      <div>
                        <p className="font-semibold text-foreground text-sm">{fullName}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          {client.rfc && <span>RFC: {client.rfc}</span>}
                          {client.phone && <span>Tel: {client.phone}</span>}
                          <span className="text-emerald-400 font-medium">
                            Lista #{client.price_number ?? 1}
                          </span>
                        </div>
                      </div>
                      {isSelected && <CheckCircle2 size={18} className="text-emerald-500" />}
                    </button>
                  )
                })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: Payment & Checkout */}
      <AnimatePresence>
        {paymentModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card max-w-md w-full p-6 space-y-5"
            >
              <div className="flex items-center justify-between border-b border-border/40 pb-3">
                <h3 className="text-base font-bold text-foreground">Finalizar Venta</h3>
                <button
                  onClick={() => setPaymentModalOpen(false)}
                  className="p-1 rounded-lg text-muted-foreground hover:text-foreground"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Total Summary */}
              <div className="text-center p-4 rounded-2xl bg-white/[0.03] border border-border/30">
                <span className="text-xs uppercase font-semibold text-muted-foreground block">
                  Total a Cobrar
                </span>
                <span className="text-3xl font-extrabold text-emerald-400 font-mono mt-1 block">
                  {formatCurrency(total)}
                </span>
              </div>

              {/* Payment Methods */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground block">
                  Método de Pago
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('cash')}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-medium transition-all ${
                      paymentMethod === 'cash'
                        ? 'border-emerald-500 bg-emerald-500/15 text-emerald-400'
                        : 'border-border/40 glass hover:bg-white/5 text-muted-foreground'
                    }`}
                  >
                    <Banknote size={20} className="mb-1" />
                    Efectivo
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('card')}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-medium transition-all ${
                      paymentMethod === 'card'
                        ? 'border-emerald-500 bg-emerald-500/15 text-emerald-400'
                        : 'border-border/40 glass hover:bg-white/5 text-muted-foreground'
                    }`}
                  >
                    <CreditCard size={20} className="mb-1" />
                    Tarjeta
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('transfer')}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-medium transition-all ${
                      paymentMethod === 'transfer'
                        ? 'border-emerald-500 bg-emerald-500/15 text-emerald-400'
                        : 'border-border/40 glass hover:bg-white/5 text-muted-foreground'
                    }`}
                  >
                    <ArrowRightLeft size={20} className="mb-1" />
                    Transferencia
                  </button>
                </div>
              </div>

              {/* Cash change calculation */}
              {paymentMethod === 'cash' && (
                <div className="space-y-3 pt-1">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">
                      Monto Recibido
                    </label>
                    <GlassInput
                      type="number"
                      step="any"
                      value={cashReceived}
                      onChange={(e) => setCashReceived(e.target.value)}
                      autoFocus
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl bg-black/20 border border-white/10 text-sm">
                    <span className="font-semibold text-muted-foreground">Cambio / Devolución:</span>
                    <span className="font-mono font-bold text-lg text-emerald-400">
                      {formatCurrency(cashChange)}
                    </span>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-3">
                <GlassButton
                  variant="ghost"
                  size="sm"
                  onClick={() => setPaymentModalOpen(false)}
                >
                  Cancelar
                </GlassButton>
                <GlassButton
                  variant="primary"
                  onClick={handleProcessOrder}
                  disabled={isSubmittingOrder}
                  className="px-6"
                >
                  {isSubmittingOrder ? 'Procesando Venta...' : 'Completar Venta'}
                </GlassButton>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: Ticket Receipt & Print */}
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
                      <p className="font-semibold text-zinc-900 leading-tight">{it.item.description}</p>
                      <p className="text-[10px] text-zinc-500">{it.quantity} × {formatCurrency(it.unitPrice)}</p>
                    </div>
                    <span className="font-bold">{formatCurrency(it.totalPrice)}</span>
                  </div>
                ))}
              </div>

              {/* Totals */}
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
                {completedOrder.paymentMethod === 'cash' && (
                  <>
                    <div className="flex justify-between text-zinc-600 pt-1">
                      <span>Efectivo Recibido:</span>
                      <span>{formatCurrency(completedOrder.cashReceived || 0)}</span>
                    </div>
                    <div className="flex justify-between text-zinc-900 font-bold">
                      <span>Cambio:</span>
                      <span>{formatCurrency(completedOrder.change || 0)}</span>
                    </div>
                  </>
                )}
              </div>

              <div className="text-center text-[10px] text-zinc-500">
                <p>¡Gracias por su compra!</p>
                <p className="mt-0.5">Campiran POS · Sistema de Ventas en la Nube</p>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center gap-2 pt-2 print:hidden">
                <button
                  onClick={() => window.print()}
                  className="flex-1 py-2.5 rounded-xl bg-zinc-900 text-white text-xs font-bold hover:bg-zinc-800 transition-colors flex items-center justify-center gap-1.5"
                >
                  <Printer size={15} />
                  Imprimir Ticket
                </button>
                <button
                  onClick={() => setCompletedOrder(null)}
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
