'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/utils/supabase/client'
import { useStore } from '@/components/providers/store-provider'
import { GlassCard } from '@/components/glass-card'
import { GlassButton } from '@/components/glass-button'
import { GlassInput } from '@/components/glass-input'
import { StatusBadge } from '@/components/status-badge'
import { InventarioTabs } from '@/components/inventario/inventario-tabs'
import {
  type InventorySession,
  type InventoryReading,
  type Location,
  type Item,
  type Profile,
} from '@/lib/types'
import { formatDateTime } from '@/lib/utils'
import { toast } from 'sonner'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  ScanLine, Search, Plus, Minus, Check, AlertCircle,
  FileText, History, CheckCircle2, MapPin, X, ArrowUpDown,
  Boxes, RefreshCw
} from 'lucide-react'

export function FisicoClient() {
  const supabase = createClient()
  const { currentStore, storeId } = useStore()

  // User Profile
  const [currentUser, setCurrentUser] = useState<Profile | null>(null)

  // Sessions
  const [activeSession, setActiveSession] = useState<InventorySession | null>(null)
  const [loadingSession, setLoadingSession] = useState(true)
  const [pastSessions, setPastSessions] = useState<InventorySession[]>([])
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [selectedPastSession, setSelectedPastSession] = useState<InventorySession | null>(null)
  const [pastSessionReadings, setPastSessionReadings] = useState<InventoryReading[]>([])
  const [loadingPastReadings, setLoadingPastReadings] = useState(false)

  // Locations & Items catalog
  const [locations, setLocations] = useState<Location[]>([])
  const [selectedLocation, setSelectedLocation] = useState<string>('')

  // Scanning inputs
  const [barcodeInput, setBarcodeInput] = useState('')
  const [quantity, setQuantity] = useState<number>(1)
  const [isProcessing, setIsProcessing] = useState(false)
  const barcodeInputRef = useRef<HTMLInputElement>(null)

  // Last scanned item preview
  const [lastScanned, setLastScanned] = useState<{
    item: Item
    stockBefore: number
    stockPhysical: number
    stockDiff: number
    locationName?: string
  } | null>(null)

  // Current session readings
  const [readings, setReadings] = useState<InventoryReading[]>([])
  const [loadingReadings, setLoadingReadings] = useState(false)

  // Item Search Modal
  const [searchModalOpen, setSearchModalOpen] = useState(false)
  const [catalogItems, setCatalogItems] = useState<Item[]>([])
  const [searchFilter, setSearchFilter] = useState('')
  const [loadingCatalog, setLoadingCatalog] = useState(false)

  // Close session confirm dialog
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false)
  const [closingSession, setClosingSession] = useState(false)

  // Focus input helper
  const focusScannerInput = useCallback(() => {
    setTimeout(() => {
      barcodeInputRef.current?.focus()
    }, 100)
  }, [])

  // Load current user
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()
          .then(({ data }) => {
            if (data) setCurrentUser(data as Profile)
          })
      }
    })
  }, [supabase])

  // Load locations for current store
  useEffect(() => {
    if (!storeId) return
    supabase
      .from('locations')
      .select('*')
      .eq('id_store', storeId)
      .eq('status', 'A')
      .order('description')
      .then(({ data }) => {
        if (data && data.length > 0) {
          const locs = data as Location[]
          setLocations(locs)
          setSelectedLocation(locs[0].id_location)
        }
      })
  }, [storeId, supabase])

  // Load active inventory session
  const fetchActiveSession = useCallback(async () => {
    if (!storeId) return
    setLoadingSession(true)
    const { data, error } = await supabase
      .from('inventory_sessions')
      .select(`
        *,
        user:profiles(full_name, email)
      `)
      .eq('id_store', storeId)
      .eq('status', 'A')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      toast.error('Error al verificar sesión de inventario')
    } else {
      setActiveSession(data as unknown as InventorySession | null)
    }
    setLoadingSession(false)
  }, [storeId, supabase])

  useEffect(() => {
    fetchActiveSession()
  }, [fetchActiveSession])

  // Load readings for active session
  const fetchReadings = useCallback(async (sessionId: string) => {
    setLoadingReadings(true)
    const { data } = await supabase
      .from('inventory_readings')
      .select(`
        *,
        item:items (id_item, code, barcode, description, unit),
        location:locations (id_location, description),
        user:profiles (id, full_name)
      `)
      .eq('id_session', sessionId)
      .order('created_at', { ascending: false })

    if (data) {
      setReadings(data as unknown as InventoryReading[])
    }
    setLoadingReadings(false)
  }, [supabase])

  useEffect(() => {
    if (activeSession?.id_session) {
      fetchReadings(activeSession.id_session)
    } else {
      setReadings([])
    }
  }, [activeSession, fetchReadings])

  // Realtime subscription for readings in active session
  useEffect(() => {
    if (!activeSession?.id_session) return

    const channel = supabase
      .channel(`inventory-session-${activeSession.id_session}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'inventory_readings',
          filter: `id_session=eq.${activeSession.id_session}`,
        },
        () => {
          fetchReadings(activeSession.id_session)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [activeSession?.id_session, supabase, fetchReadings])

  // Permanent autofocus on mount and after interactions
  useEffect(() => {
    focusScannerInput()
  }, [activeSession, focusScannerInput])

  // Start a new inventory session
  const handleStartSession = async () => {
    if (!storeId || !currentUser) {
      toast.error('Falta información de la sucursal o usuario')
      return
    }

    const { data, error } = await supabase
      .from('inventory_sessions')
      .insert({
        id_store: storeId,
        id_user: currentUser.id,
        status: 'A',
        notes: `Sesión de inventario físico iniciada por ${currentUser.full_name ?? currentUser.email}`,
      })
      .select()
      .single()

    if (error) {
      toast.error('Error al iniciar nueva sesión: ' + error.message)
    } else {
      toast.success('Sesión de inventario iniciada exitosamente')
      setActiveSession(data as unknown as InventorySession)
      focusScannerInput()
    }
  }

  // Handle Scan / Submit Reading
  const handleProcessScan = async (codeToSearch?: string) => {
    const rawCode = (codeToSearch ?? barcodeInput).trim()
    if (!rawCode) {
      toast.error('Ingrese un código de barras o código de artículo')
      focusScannerInput()
      return
    }

    if (!activeSession) {
      toast.error('Debe iniciar o seleccionar una sesión abierta')
      return
    }

    if (!selectedLocation) {
      toast.error('Seleccione una ubicación válida')
      return
    }

    setIsProcessing(true)

    try {
      // 1. Find item by barcode OR code OR id_item
      const { data: itemData, error: itemError } = await supabase
        .from('items')
        .select('*')
        .or(`barcode.eq.${rawCode},code.eq.${rawCode}`)
        .eq('status', 'A')
        .limit(1)
        .maybeSingle()

      if (itemError || !itemData) {
        toast.error(`Producto no encontrado para el código: ${rawCode}`)
        setIsProcessing(false)
        setBarcodeInput('')
        focusScannerInput()
        return
      }

      const item = itemData as Item

      // 2. Get current system stock for this item & store & location
      const { data: stockData } = await supabase
        .from('stocks')
        .select('current')
        .eq('id_item', item.id_item)
        .eq('id_store', storeId)
        .eq('id_location', selectedLocation)
        .maybeSingle()

      const currentStock = stockData?.current ?? 0

      // 3. Calculate accumulated physical stock in this session for this item
      const existingReadings = readings.filter(
        (r) => r.id_item === item.id_item && r.id_location === selectedLocation
      )
      const prevPhysicalSum = existingReadings.reduce((acc, r) => acc + (r.quantity ?? 0), 0)
      const newPhysical = prevPhysicalSum + quantity
      const newDiff = newPhysical - currentStock

      // 4. Insert reading into inventory_readings
      const { error: readingError } = await supabase.from('inventory_readings').insert({
        id_session: activeSession.id_session,
        id_item: item.id_item,
        id_store: storeId,
        id_location: selectedLocation,
        id_user: currentUser?.id ?? null,
        quantity: quantity,
        stock_before: currentStock,
        stock_physical: newPhysical,
        stock_diff: newDiff,
      })

      if (readingError) {
        toast.error('Error al registrar lectura: ' + readingError.message)
        setIsProcessing(false)
        return
      }

      // 5. Register in transactions (movim_type = 'I')
      await supabase.from('transactions').insert({
        id_store: storeId,
        id_location: selectedLocation,
        id_item: item.id_item,
        id_user: currentUser?.id ?? null,
        movim_type: 'I',
        amount_enrty: quantity > 0 ? quantity : 0,
        amount_exit: quantity < 0 ? Math.abs(quantity) : 0,
        cost: item.cost ?? 0,
        price: item.price ?? 0,
        reference: `INV-SESIÓN-${activeSession.id_session.slice(0, 8)}`,
        concept: 'Lectura de inventario físico',
        origin: 'Inventario Físico',
      })

      const locObj = locations.find((l) => l.id_location === selectedLocation)

      // 6. Set last scanned item banner
      setLastScanned({
        item,
        stockBefore: currentStock,
        stockPhysical: newPhysical,
        stockDiff: newDiff,
        locationName: locObj?.description ?? undefined,
      })

      toast.success(`${item.description}: +${quantity} capturado`)

      // 7. Reset inputs and ALWAYS return focus to barcode input
      setBarcodeInput('')
      setQuantity(1)
      await fetchReadings(activeSession.id_session)
    } catch {
      toast.error('Ocurrió un error inesperado al capturar')
    } finally {
      setIsProcessing(false)
      focusScannerInput()
    }
  }

  // Load items for search modal
  const openItemSearch = async () => {
    setSearchModalOpen(true)
    setLoadingCatalog(true)
    const { data } = await supabase
      .from('items')
      .select('id_item, code, barcode, description, unit, status')
      .eq('status', 'A')
      .order('description')
      .limit(100)

    if (data) {
      setCatalogItems(data as Item[])
    }
    setLoadingCatalog(false)
  }

  const handleSelectItemFromSearch = (item: Item) => {
    setSearchModalOpen(false)
    const code = item.barcode || item.code || ''
    setBarcodeInput(code)
    handleProcessScan(code)
  }

  // Close session logic
  const handleCloseSession = async () => {
    if (!activeSession) return
    setClosingSession(true)

    try {
      // 1. Update session status to 'C'
      const { error } = await supabase
        .from('inventory_sessions')
        .update({
          status: 'C',
          closed_at: new Date().toISOString(),
        })
        .eq('id_session', activeSession.id_session)

      if (error) {
        toast.error('Error al cerrar la sesión: ' + error.message)
        setClosingSession(false)
        return
      }

      // 2. Adjust stocks in DB to match physical count for each distinct item scanned
      const itemMap = new Map<string, { id_item: string; id_location: string; finalPhysical: number }>()
      readings.forEach((r) => {
        if (!r.id_item || !r.id_location) return
        const key = `${r.id_item}_${r.id_location}`
        if (!itemMap.has(key)) {
          itemMap.set(key, {
            id_item: r.id_item,
            id_location: r.id_location,
            finalPhysical: r.stock_physical,
          })
        }
      })

      // Update stocks
      for (const entry of Array.from(itemMap.values())) {
        const { data: existingStock } = await supabase
          .from('stocks')
          .select('id_stock, current')
          .eq('id_item', entry.id_item)
          .eq('id_store', storeId)
          .eq('id_location', entry.id_location)
          .maybeSingle()

        if (existingStock) {
          await supabase
            .from('stocks')
            .update({
              previous: existingStock.current,
              current: entry.finalPhysical,
            })
            .eq('id_stock', existingStock.id_stock)
        } else {
          await supabase.from('stocks').insert({
            id_item: entry.id_item,
            id_store: storeId,
            id_location: entry.id_location,
            current: entry.finalPhysical,
            initial: entry.finalPhysical,
          })
        }
      }

      toast.success('Sesión de inventario cerrada y existencias sincronizadas')
      setConfirmCloseOpen(false)
      setActiveSession(null)
      setReadings([])
      setLastScanned(null)
    } catch {
      toast.error('Error durante el cierre de inventario')
    } finally {
      setClosingSession(false)
    }
  }

  // Export PDF with digital signature
  const handleExportPDF = (sessionToExport?: InventorySession, readingsToExport?: InventoryReading[]) => {
    const session = sessionToExport || activeSession
    const list = readingsToExport || readings

    if (!session || list.length === 0) {
      toast.error('No hay datos suficientes para generar el reporte en PDF')
      return
    }

    const doc = new jsPDF()

    // Title & Header
    doc.setFontSize(18)
    doc.setTextColor(16, 185, 129) // Emerald
    doc.text('CAMPIRAN POS', 14, 20)

    doc.setFontSize(14)
    doc.setTextColor(30, 41, 59)
    doc.text('Reporte de Captura de Inventario Físico', 14, 28)

    doc.setFontSize(10)
    doc.setTextColor(100, 116, 139)
    doc.text(`Sucursal: ${currentStore?.description ?? 'General'}`, 14, 36)
    doc.text(`Folio de Sesión: ${session.id_session.slice(0, 8).toUpperCase()}`, 14, 42)
    doc.text(`Fecha de Apertura: ${formatDateTime(session.created_at)}`, 14, 48)
    if (session.closed_at) {
      doc.text(`Fecha de Cierre: ${formatDateTime(session.closed_at)}`, 14, 54)
    }

    // Table Content
    const tableData = list.map((r, index) => [
      index + 1,
      r.item?.description ?? 'Sin descripción',
      r.item?.code || r.item?.barcode || 'N/A',
      r.location?.description ?? 'N/A',
      r.stock_before,
      r.stock_physical,
      r.stock_diff > 0 ? `+${r.stock_diff}` : r.stock_diff,
      r.user?.full_name ?? currentUser?.full_name ?? 'Usuario',
      formatDateTime(r.created_at),
    ])

    autoTable(doc, {
      startY: session.closed_at ? 60 : 54,
      head: [['#', 'Producto', 'Código', 'Ubicación', 'Stk Sist.', 'Stk Fís.', 'Dif.', 'Usuario', 'Hora']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: {
        0: { cellWidth: 8 },
        1: { cellWidth: 42 },
        2: { cellWidth: 22 },
        3: { cellWidth: 22 },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right' },
      },
    })

    // Digital Signature Section
    const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY || 180

    doc.setFontSize(9)
    doc.setTextColor(71, 85, 105)
    doc.text('___________________________________________', 14, finalY + 25)
    doc.setFont('helvetica', 'bold')
    doc.text(`Firma Digital: ${currentUser?.full_name ?? 'Auditor de Inventario'}`, 14, finalY + 31)
    doc.setFont('helvetica', 'normal')
    doc.text(`RFC / Email: ${currentUser?.email ?? 'N/A'}`, 14, finalY + 36)
    doc.text(
      `Verificado en tiempo real con Campiran POS Cloud · Fecha de emisión: ${formatDateTime(new Date().toISOString())}`,
      14,
      finalY + 42
    )

    doc.save(`Inventario_Fisico_${session.id_session.slice(0, 8)}.pdf`)
    toast.success('PDF generado y descargado exitosamente')
  }

  // Load past sessions history
  const openHistory = async () => {
    setShowHistoryModal(true)
    if (!storeId) return
    const { data } = await supabase
      .from('inventory_sessions')
      .select(`
        *,
        user:profiles(full_name, email)
      `)
      .eq('id_store', storeId)
      .eq('status', 'C')
      .order('created_at', { ascending: false })
      .limit(20)

    if (data) {
      setPastSessions(data as unknown as InventorySession[])
    }
  }

  const handleSelectPastSession = async (session: InventorySession) => {
    setSelectedPastSession(session)
    setLoadingPastReadings(true)
    const { data } = await supabase
      .from('inventory_readings')
      .select(`
        *,
        item:items (id_item, code, barcode, description, unit),
        location:locations (id_location, description),
        user:profiles (id, full_name)
      `)
      .eq('id_session', session.id_session)
      .order('created_at', { ascending: false })

    if (data) {
      setPastSessionReadings(data as unknown as InventoryReading[])
    }
    setLoadingPastReadings(false)
  }

  // Filtered items in Search Modal
  const filteredCatalogItems = useMemo(() => {
    if (!searchFilter.trim()) return catalogItems
    const q = searchFilter.toLowerCase()
    return catalogItems.filter(
      (item) =>
        item.description?.toLowerCase().includes(q) ||
        item.code?.toLowerCase().includes(q) ||
        item.barcode?.toLowerCase().includes(q)
    )
  }, [catalogItems, searchFilter])

  return (
    <div className="space-y-6">
      <div className="dashboard-bg" />

      {/* Header and Sub-Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <ScanLine className="text-emerald-500" size={28} />
            Captura de Inventario Físico
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Conteo físico en tiempo real con escáner de código de barras para{' '}
            <span className="font-semibold text-emerald-500">
              {currentStore?.description ?? 'sucursal activa'}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <InventarioTabs />
          <GlassButton
            variant="ghost"
            size="sm"
            onClick={openHistory}
            className="hidden md:flex items-center gap-1.5"
          >
            <History size={15} />
            <span>Historial</span>
          </GlassButton>
        </div>
      </div>

      {/* Active Session Status & Action Controls */}
      <GlassCard padding="sm" className="relative">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-11 h-11 rounded-2xl flex items-center justify-center ${
                activeSession
                  ? 'bg-emerald-500/10 text-emerald-500'
                  : 'bg-amber-500/10 text-amber-500'
              }`}
            >
              <Boxes size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-foreground text-sm sm:text-base">
                  {activeSession ? 'Sesión de Inventario Activa' : 'Sin Sesión Abierta'}
                </h3>
                {activeSession && (
                  <StatusBadge status="open" customLabel="En Progreso" />
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {activeSession ? (
                  <>
                    Folio:{' '}
                    <span className="font-mono font-semibold text-foreground">
                      {activeSession.id_session.slice(0, 8).toUpperCase()}
                    </span>{' '}
                    · Iniciada:{' '}
                    <span className="text-foreground">
                      {formatDateTime(activeSession.created_at)}
                    </span>
                  </>
                ) : (
                  'Inicia una sesión para comenzar a registrar lecturas con el escáner.'
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {!activeSession ? (
              <GlassButton
                variant="primary"
                onClick={handleStartSession}
                disabled={loadingSession || !storeId}
              >
                <Plus size={16} className="mr-1.5" />
                Iniciar Nueva Sesión
              </GlassButton>
            ) : (
              <>
                <GlassButton
                  variant="ghost"
                  size="sm"
                  onClick={() => handleExportPDF()}
                  disabled={readings.length === 0}
                  title="Exportar PDF firmado"
                >
                  <FileText size={15} className="mr-1.5" />
                  PDF Firmado
                </GlassButton>
                <GlassButton
                  variant="danger"
                  size="sm"
                  onClick={() => setConfirmCloseOpen(true)}
                  disabled={closingSession}
                >
                  <CheckCircle2 size={15} className="mr-1.5" />
                  Cerrar Sesión de Inventario
                </GlassButton>
              </>
            )}
            <GlassButton
              variant="ghost"
              size="sm"
              onClick={openHistory}
              className="md:hidden"
            >
              <History size={15} />
            </GlassButton>
          </div>
        </div>
      </GlassCard>

      {/* Main Scanner Section (if session active) */}
      {activeSession ? (
        <div className="space-y-4">
          <GlassCard padding="md" variant="emerald" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
              {/* Location Selector */}
              <div className="md:col-span-3">
                <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                  Ubicación de Escaneo
                </label>
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl glass-input text-xs font-medium">
                  <MapPin size={15} className="text-emerald-500" />
                  <select
                    value={selectedLocation}
                    onChange={(e) => {
                      setSelectedLocation(e.target.value)
                      focusScannerInput()
                    }}
                    className="w-full bg-transparent border-none text-foreground text-xs font-medium focus:outline-none cursor-pointer"
                  >
                    {locations.map((loc) => (
                      <option key={loc.id_location} value={loc.id_location} className="bg-zinc-900 text-white">
                        {loc.description}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Barcode / Code Input with Permanent Focus */}
              <div className="md:col-span-6">
                <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                  Código de Barras o Código de Artículo
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      ref={barcodeInputRef}
                      type="text"
                      inputMode="text"
                      autoComplete="off"
                      placeholder="Escanee con pistola o escriba el código y presione Enter..."
                      value={barcodeInput}
                      onChange={(e) => setBarcodeInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleProcessScan()
                        }
                      }}
                      className="glass-input w-full pl-10 pr-4 py-2.5 text-sm font-mono text-foreground focus:ring-2 focus:ring-emerald-500/50"
                    />
                    <ScanLine
                      size={18}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500 animate-pulse"
                    />
                  </div>
                  <GlassButton
                    variant="ghost"
                    onClick={openItemSearch}
                    title="Buscar por descripción"
                    className="px-3"
                  >
                    <Search size={16} />
                  </GlassButton>
                </div>
              </div>

              {/* Quantity Counter */}
              <div className="md:col-span-3">
                <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                  Cantidad (Default: 1)
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => q - 1)}
                    className="p-2 rounded-xl glass-input hover:bg-white/10 text-muted-foreground hover:text-foreground transition-all"
                    title="Restar 1 (acepta negativos para corrección)"
                  >
                    <Minus size={15} />
                  </button>
                  <input
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value))}
                    className="glass-input w-full text-center py-2 text-sm font-bold font-mono text-foreground focus:ring-2 focus:ring-emerald-500/50"
                  />
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => q + 1)}
                    className="p-2 rounded-xl glass-input hover:bg-white/10 text-muted-foreground hover:text-foreground transition-all"
                    title="Sumar 1"
                  >
                    <Plus size={15} />
                  </button>
                  <GlassButton
                    variant="primary"
                    onClick={() => handleProcessScan()}
                    disabled={isProcessing}
                    className="px-3.5"
                  >
                    <Check size={16} />
                  </GlassButton>
                </div>
              </div>
            </div>
          </GlassCard>

          {/* Last Scanned Item Banner */}
          <AnimatePresence>
            {lastScanned && (
              <motion.div
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.2 }}
              >
                <GlassCard
                  variant={lastScanned.stockDiff === 0 ? 'emerald' : lastScanned.stockDiff < 0 ? 'rose' : 'amber'}
                  padding="sm"
                  className="border border-white/20"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-lg font-bold">
                        {lastScanned.item.description?.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                          Último Producto Escaneado
                        </span>
                        <h4 className="font-bold text-foreground text-sm sm:text-base">
                          {lastScanned.item.description}
                        </h4>
                        <div className="flex items-center gap-2.5 text-xs text-muted-foreground font-mono mt-0.5">
                          {lastScanned.item.code && <span>Código: {lastScanned.item.code}</span>}
                          {lastScanned.item.barcode && <span>CB: {lastScanned.item.barcode}</span>}
                          {lastScanned.locationName && <span>Ubic: {lastScanned.locationName}</span>}
                        </div>
                      </div>
                    </div>

                    {/* Stock Metrics */}
                    <div className="flex items-center gap-4 bg-black/20 p-2.5 rounded-xl border border-white/10">
                      <div className="text-center px-2">
                        <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                          Stock Sistema
                        </span>
                        <span className="font-mono font-bold text-base text-foreground">
                          {lastScanned.stockBefore}
                        </span>
                      </div>
                      <div className="w-px h-8 bg-white/10" />
                      <div className="text-center px-2">
                        <span className="text-[10px] uppercase font-semibold text-emerald-400 block">
                          Stock Físico
                        </span>
                        <span className="font-mono font-bold text-base text-emerald-400">
                          {lastScanned.stockPhysical}
                        </span>
                      </div>
                      <div className="w-px h-8 bg-white/10" />
                      <div className="text-center px-2">
                        <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                          Diferencia
                        </span>
                        <span
                          className={`font-mono font-bold text-base ${
                            lastScanned.stockDiff === 0
                              ? 'text-muted-foreground'
                              : lastScanned.stockDiff > 0
                              ? 'text-emerald-400'
                              : 'text-rose-400'
                          }`}
                        >
                          {lastScanned.stockDiff > 0 ? `+${lastScanned.stockDiff}` : lastScanned.stockDiff}
                        </span>
                      </div>
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Readings Table in Active Session */}
          <GlassCard padding="none" className="overflow-hidden">
            <div className="p-4 border-b border-border/40 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-foreground text-sm sm:text-base">
                  Lecturas Registradas en esta Sesión
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Total de capturas: <span className="font-semibold text-foreground">{readings.length}</span>
                </p>
              </div>
              <span className="text-xs text-emerald-500 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Actualización en vivo
              </span>
            </div>

            <div className="overflow-x-auto scroll-modern">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="glass-table-header border-b border-border/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3.5">#</th>
                    <th className="px-4 py-3.5">Producto</th>
                    <th className="px-4 py-3.5">Ubicación</th>
                    <th className="px-4 py-3.5 text-right">Cant. Escaneada</th>
                    <th className="px-4 py-3.5 text-right">Stock Sistema</th>
                    <th className="px-4 py-3.5 text-right">Stock Físico</th>
                    <th className="px-4 py-3.5 text-right">Diferencia</th>
                    <th className="px-4 py-3.5">Usuario</th>
                    <th className="px-4 py-3.5 text-right">Hora</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {loadingReadings && readings.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                        <RefreshCw size={20} className="animate-spin text-emerald-500 mx-auto mb-2" />
                        Cargando lecturas...
                      </td>
                    </tr>
                  ) : readings.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                        <p className="text-base font-medium">Aún no hay lecturas en esta sesión</p>
                        <p className="text-xs text-muted-foreground/80 mt-1">
                          Escanee el primer artículo para registrarlo en el sistema
                        </p>
                      </td>
                    </tr>
                  ) : (
                    readings.map((reading, index) => {
                      const diff = reading.stock_diff ?? 0
                      return (
                        <tr
                          key={reading.id_reading}
                          className="hover:bg-white/[0.02] transition-colors"
                        >
                          <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                            {readings.length - index}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col">
                              <span className="font-semibold text-foreground text-sm">
                                {reading.item?.description ?? 'N/A'}
                              </span>
                              <span className="text-xs text-muted-foreground font-mono">
                                {reading.item?.barcode || reading.item?.code || '—'}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {reading.location?.description ?? 'General'}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-foreground">
                            {reading.quantity > 0 ? `+${reading.quantity}` : reading.quantity}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                            {reading.stock_before}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-emerald-400">
                            {reading.stock_physical}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold">
                            <span
                              className={
                                diff === 0
                                  ? 'text-muted-foreground'
                                  : diff > 0
                                  ? 'text-emerald-400'
                                  : 'text-rose-400'
                              }
                            >
                              {diff > 0 ? `+${diff}` : diff}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {reading.user?.full_name ?? currentUser?.full_name ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-right text-xs text-muted-foreground font-mono">
                            {formatDateTime(reading.created_at)}
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
      ) : null}

      {/* Modal: Item Search by Description */}
      <AnimatePresence>
        {searchModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card max-w-2xl w-full p-6 space-y-4 max-h-[85vh] flex flex-col"
            >
              <div className="flex items-center justify-between border-b border-border/40 pb-3">
                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                  <Search size={18} className="text-emerald-500" />
                  Buscador de Artículos por Descripción
                </h3>
                <button
                  onClick={() => setSearchModalOpen(false)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground"
                >
                  <X size={18} />
                </button>
              </div>

              <GlassInput
                placeholder="Escriba descripción, código o código de barras..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                autoFocus
              />

              <div className="flex-1 overflow-y-auto scroll-modern border border-border/30 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-zinc-900 border-b border-border/40 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2.5">Código (ID)</th>
                      <th className="px-3 py-2.5">Código de Barras</th>
                      <th className="px-3 py-2.5">Descripción</th>
                      <th className="px-3 py-2.5 text-center">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {loadingCatalog ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                          Cargando catálogo...
                        </td>
                      </tr>
                    ) : filteredCatalogItems.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                          No se encontraron artículos con ese criterio
                        </td>
                      </tr>
                    ) : (
                      filteredCatalogItems.map((item) => (
                        <tr
                          key={item.id_item}
                          className="hover:bg-white/[0.05] transition-colors cursor-pointer"
                          onClick={() => handleSelectItemFromSearch(item)}
                        >
                          <td className="px-3 py-2.5 font-mono text-muted-foreground">
                            {item.code || '—'}
                          </td>
                          <td className="px-3 py-2.5 font-mono text-emerald-400">
                            {item.barcode || '—'}
                          </td>
                          <td className="px-3 py-2.5 font-semibold text-foreground">
                            {item.description}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <span className="px-2 py-1 rounded bg-emerald-500/20 text-emerald-400 text-[11px] font-medium">
                              Seleccionar
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: Confirm Close Session */}
      <AnimatePresence>
        {confirmCloseOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card max-w-md w-full p-6 space-y-4"
            >
              <div className="flex items-center gap-3 text-amber-500">
                <AlertCircle size={24} />
                <h3 className="text-base font-bold text-foreground">
                  ¿Cerrar Sesión de Inventario?
                </h3>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Al cerrar la sesión, las existencias en el sistema serán actualizadas para igualar
                el conteo físico capturado ({readings.length} lecturas). Esta acción no se puede
                deshacer.
              </p>
              <div className="flex items-center justify-end gap-2.5 pt-2">
                <GlassButton
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmCloseOpen(false)}
                >
                  Cancelar
                </GlassButton>
                <GlassButton
                  variant="danger"
                  size="sm"
                  onClick={handleCloseSession}
                  disabled={closingSession}
                >
                  {closingSession ? 'Cerrando y Sincronizando...' : 'Confirmar Cierre'}
                </GlassButton>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: Past Sessions History */}
      <AnimatePresence>
        {showHistoryModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card max-w-4xl w-full p-6 space-y-4 max-h-[85vh] flex flex-col"
            >
              <div className="flex items-center justify-between border-b border-border/40 pb-3">
                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                  <History size={18} className="text-emerald-500" />
                  Historial de Inventarios Físicos Cerrados
                </h3>
                <button
                  onClick={() => {
                    setShowHistoryModal(false)
                    setSelectedPastSession(null)
                  }}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground"
                >
                  <X size={18} />
                </button>
              </div>

              {!selectedPastSession ? (
                <div className="flex-1 overflow-y-auto scroll-modern border border-border/30 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-zinc-900 border-b border-border/40 text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2.5">Folio</th>
                        <th className="px-3 py-2.5">Apertura</th>
                        <th className="px-3 py-2.5">Cierre</th>
                        <th className="px-3 py-2.5">Usuario Responsable</th>
                        <th className="px-3 py-2.5 text-center">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/20">
                      {pastSessions.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                            No hay historial de inventarios cerrados en esta sucursal
                          </td>
                        </tr>
                      ) : (
                        pastSessions.map((session) => (
                          <tr key={session.id_session} className="hover:bg-white/[0.05] transition-colors">
                            <td className="px-3 py-2.5 font-mono font-bold text-emerald-400">
                              {session.id_session.slice(0, 8).toUpperCase()}
                            </td>
                            <td className="px-3 py-2.5 text-muted-foreground">
                              {formatDateTime(session.created_at)}
                            </td>
                            <td className="px-3 py-2.5 text-muted-foreground">
                              {session.closed_at ? formatDateTime(session.closed_at) : '—'}
                            </td>
                            <td className="px-3 py-2.5 text-foreground">
                              {session.user?.full_name ?? session.user?.email ?? '—'}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <button
                                onClick={() => handleSelectPastSession(session)}
                                className="px-2.5 py-1 rounded bg-white/10 hover:bg-emerald-500/20 text-foreground hover:text-emerald-400 font-medium transition-colors"
                              >
                                Ver Detalle
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="space-y-4 flex-1 flex flex-col overflow-hidden">
                  <div className="flex items-center justify-between bg-white/[0.03] p-3 rounded-xl">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Folio:{' '}
                        <span className="font-mono font-bold text-foreground">
                          {selectedPastSession.id_session.slice(0, 8).toUpperCase()}
                        </span>{' '}
                        · Cerrado el {formatDateTime(selectedPastSession.closed_at || '')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <GlassButton
                        variant="ghost"
                        size="sm"
                        onClick={() => handleExportPDF(selectedPastSession, pastSessionReadings)}
                      >
                        <FileText size={14} className="mr-1" />
                        Descargar PDF
                      </GlassButton>
                      <button
                        onClick={() => setSelectedPastSession(null)}
                        className="text-xs text-muted-foreground hover:text-foreground underline px-2"
                      >
                        Volver al listado
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto scroll-modern border border-border/30 rounded-xl">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-zinc-900 border-b border-border/40 text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2">Producto</th>
                          <th className="px-3 py-2 text-right">Stk Sistema</th>
                          <th className="px-3 py-2 text-right">Stk Físico</th>
                          <th className="px-3 py-2 text-right">Diferencia</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/20">
                        {loadingPastReadings ? (
                          <tr>
                            <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                              Cargando detalle...
                            </td>
                          </tr>
                        ) : pastSessionReadings.map((r) => (
                          <tr key={r.id_reading} className="hover:bg-white/[0.02]">
                            <td className="px-3 py-2">
                              <div className="font-medium text-foreground">{r.item?.description}</div>
                              <div className="text-[10px] text-muted-foreground font-mono">
                                {r.item?.barcode || r.item?.code}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right font-mono">{r.stock_before}</td>
                            <td className="px-3 py-2 text-right font-mono text-emerald-400 font-bold">{r.stock_physical}</td>
                            <td className="px-3 py-2 text-right font-mono font-bold">
                              <span className={r.stock_diff === 0 ? 'text-muted-foreground' : r.stock_diff > 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                {r.stock_diff > 0 ? `+${r.stock_diff}` : r.stock_diff}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
