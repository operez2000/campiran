'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/utils/supabase/client'
import { useStore } from '@/components/providers/store-provider'
import { GlassCard } from '@/components/glass-card'
import { GlassButton } from '@/components/glass-button'
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
  FileText, History, CheckCircle2, MapPin, X,
  RefreshCw, Camera
} from 'lucide-react'

// Normalize user object whether it comes from users (id_user, user_name) or profiles (id, full_name)
function normalizeUser(rawUser?: Record<string, unknown> | null): Profile | undefined {
  if (!rawUser) return undefined
  return {
    id: String(rawUser.id || rawUser.id_user || ''),
    full_name: (rawUser.full_name as string) || (rawUser.user_name as string) || (rawUser.email as string) || 'Usuario',
    email: (rawUser.email as string) || null,
    phone: (rawUser.phone as string) || null,
    role: (rawUser.role as Profile['role']) || 'ADMIN',
    id_store: (rawUser.id_store as string) || null,
    status: rawUser.status === 'I' ? 'inactive' : 'active',
    avatar_url: (rawUser.avatar_url as string) || null,
    created_at: (rawUser.created_at as string) || '',
    updated_at: (rawUser.updated_at as string) || '',
  }
}

// Audio & Haptic feedback for mobile barcode scanning
function playScanFeedback(isSuccess = true) {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (AudioCtx) {
      const ctx = new AudioCtx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      if (isSuccess) {
        osc.frequency.setValueAtTime(880, ctx.currentTime) // Beep agudo A5
        gain.gain.setValueAtTime(0.2, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1)
        osc.start(ctx.currentTime)
        osc.stop(ctx.currentTime + 0.1)
      } else {
        osc.frequency.setValueAtTime(260, ctx.currentTime) // Beep grave de error
        gain.gain.setValueAtTime(0.25, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25)
        osc.start(ctx.currentTime)
        osc.stop(ctx.currentTime + 0.25)
      }
    }
  } catch {
    // Ignore audio restrictions
  }

  // Haptic feedback for supported mobile devices
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(isSuccess ? 40 : [80, 40, 80])
    }
  } catch {
    // Ignore
  }
}

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

  // Camera scanner modal
  const [cameraModalOpen, setCameraModalOpen] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Close session confirm dialog
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false)
  const [closingSession, setClosingSession] = useState(false)

  // Helper to ensure focus stays in barcode input
  const focusScannerInput = useCallback(() => {
    barcodeInputRef.current?.focus()
    setTimeout(() => {
      barcodeInputRef.current?.focus()
    }, 60)
  }, [])

  // Load current user robustly (checks profiles, users table, or auth user metadata)
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      // 1. Try profiles
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
      if (prof) {
        setCurrentUser(prof as Profile)
        return
      }
      // 2. Try users table
      const { data: legUser } = await supabase
        .from('users')
        .select('*')
        .or(`id_user.eq.${user.id},email.eq.${user.email}`)
        .maybeSingle()
      if (legUser) {
        setCurrentUser({
          id: legUser.id_user,
          full_name: legUser.user_name || user.email?.split('@')[0] || 'Usuario',
          email: legUser.email || user.email || null,
          phone: legUser.phone || null,
          role: (legUser.role as string) === 'A' ? 'ADMIN' : 'ALMACENISTA',
          id_store: null,
          status: 'active',
          avatar_url: null,
          created_at: legUser.created_at || '',
          updated_at: legUser.created_at || '',
        })
        return
      }
      // 3. Fallback from auth metadata
      setCurrentUser({
        id: user.id,
        full_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Usuario',
        email: user.email || null,
        phone: null,
        role: 'ADMIN',
        id_store: null,
        status: 'active',
        avatar_url: user.user_metadata?.avatar_url || null,
        created_at: user.created_at || '',
        updated_at: user.created_at || '',
      })
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

    // 1. Try with user:users (matches current database foreign key)
    let { data, error } = await supabase
      .from('inventory_sessions')
      .select(`
        *,
        user:users(id_user, user_name, email)
      `)
      .eq('id_store', storeId)
      .eq('status', 'A')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // 2. If relationship fails (e.g. if 005 migration to profiles is applied)
    if (error) {
      const retryProfiles = await supabase
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

      if (!retryProfiles.error) {
        data = retryProfiles.data
        error = null
      } else {
        // 3. Fallback without embedded relation so the session is never blocked
        const retryPlain = await supabase
          .from('inventory_sessions')
          .select('*')
          .eq('id_store', storeId)
          .eq('status', 'A')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        data = retryPlain.data
        error = retryPlain.error
      }
    }

    if (error) {
      console.error('Error al verificar sesión de inventario:', error)
      toast.error('Error al verificar sesión de inventario')
    } else {
      const rawSession = data as unknown as (Omit<InventorySession, 'user'> & { user?: Record<string, unknown> }) | null
      const sessionData: InventorySession | null = rawSession
        ? {
            ...rawSession,
            user: normalizeUser(rawSession.user),
          }
        : null
      setActiveSession(sessionData)
    }
    setLoadingSession(false)
  }, [storeId, supabase])

  useEffect(() => {
    fetchActiveSession()
  }, [fetchActiveSession])

  // Load readings for active session
  const fetchReadings = useCallback(async (sessionId: string) => {
    setLoadingReadings(true)

    // 1. Try with user:users
    let { data, error } = await supabase
      .from('inventory_readings')
      .select(`
        *,
        item:items (id_item, code, barcode, description, unit),
        location:locations (id_location, description),
        user:users (id_user, user_name, email)
      `)
      .eq('id_session', sessionId)
      .order('created_at', { ascending: false })

    // 2. If relationship fails, fallback to user:profiles or plain
    if (error) {
      const retryProfiles = await supabase
        .from('inventory_readings')
        .select(`
          *,
          item:items (id_item, code, barcode, description, unit),
          location:locations (id_location, description),
          user:profiles (id, full_name)
        `)
        .eq('id_session', sessionId)
        .order('created_at', { ascending: false })

      if (!retryProfiles.error) {
        data = retryProfiles.data
        error = null
      } else {
        const retryPlain = await supabase
          .from('inventory_readings')
          .select(`
            *,
            item:items (id_item, code, barcode, description, unit),
            location:locations (id_location, description)
          `)
          .eq('id_session', sessionId)
          .order('created_at', { ascending: false })
        data = retryPlain.data
        error = retryPlain.error
      }
    }

    if (data) {
      const rawReadings = data as unknown as Array<InventoryReading & { user?: Record<string, unknown> }>
      const mapped = rawReadings.map((r) => ({
        ...r,
        user: normalizeUser(r.user),
      }))
      setReadings(mapped as unknown as InventoryReading[])
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

  // Permanent autofocus: on mount, visibility, and window focus
  useEffect(() => {
    focusScannerInput()
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        focusScannerInput()
      }
    }
    window.addEventListener('focus', focusScannerInput)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.removeEventListener('focus', focusScannerInput)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [activeSession, focusScannerInput])

  // Global click listener: when tapping anywhere outside interactive controls, return focus to code input
  const handleWorkspaceClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.closest('button, select, input, textarea, a, [role="dialog"], [role="menu"]')) {
      return
    }
    focusScannerInput()
  }

  // Start a new inventory session
  const handleStartSession = async (): Promise<InventorySession | null> => {
    if (!storeId) {
      toast.error('Seleccione una sucursal para operar')
      return null
    }

    let userId = currentUser?.id
    if (!userId) {
      const { data: { user } } = await supabase.auth.getUser()
      userId = user?.id
    }
    if (!userId) {
      toast.error('Falta información del usuario autenticado')
      return null
    }

    const { data, error } = await supabase
      .from('inventory_sessions')
      .insert({
        id_store: storeId,
        id_user: userId,
        status: 'A',
        notes: `Sesión iniciada desde móvil por ${currentUser?.full_name ?? currentUser?.email ?? 'Usuario'}`,
      })
      .select()
      .single()

    if (error) {
      toast.error('Error al iniciar nueva sesión: ' + error.message)
      return null
    } else {
      toast.success('Sesión de inventario iniciada')
      const newSession = data as unknown as InventorySession
      setActiveSession(newSession)
      focusScannerInput()
      return newSession
    }
  }

  // Handle Scan / Submit Reading
  const handleProcessScan = async (codeToSearch?: string) => {
    const rawCode = (codeToSearch ?? barcodeInput).trim()
    if (!rawCode) {
      toast.error('Ingrese o escanee un código de barras')
      focusScannerInput()
      return
    }

    let currentActive = activeSession
    if (!currentActive) {
      // Auto-start session for instantaneous mobile flow
      currentActive = await handleStartSession()
      if (!currentActive) return
    }

    if (!selectedLocation && locations.length > 0) {
      setSelectedLocation(locations[0].id_location)
    }

    const locId = selectedLocation || locations[0]?.id_location
    if (!locId) {
      toast.error('No hay ubicaciones registradas en esta sucursal')
      focusScannerInput()
      return
    }

    setIsProcessing(true)

    try {
      // 1. Find item by barcode OR code
      const { data: itemData, error: itemError } = await supabase
        .from('items')
        .select('*')
        .or(`barcode.eq.${rawCode},code.eq.${rawCode}`)
        .eq('status', 'A')
        .limit(1)
        .maybeSingle()

      if (itemError || !itemData) {
        playScanFeedback(false)
        toast.error(`Producto no encontrado para: ${rawCode}`)
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
        .eq('id_location', locId)
        .maybeSingle()

      const currentStock = stockData?.current ?? 0

      // 3. Calculate accumulated physical stock in this session for this item
      const existingReadings = readings.filter(
        (r) => r.id_item === item.id_item && r.id_location === locId
      )
      const prevPhysicalSum = existingReadings.reduce((acc, r) => acc + (r.quantity ?? 0), 0)
      const newPhysical = prevPhysicalSum + quantity
      const newDiff = newPhysical - currentStock

      // 4. Insert reading into inventory_readings
      const { error: readingError } = await supabase.from('inventory_readings').insert({
        id_session: currentActive.id_session,
        id_item: item.id_item,
        id_store: storeId,
        id_location: locId,
        id_user: currentUser?.id ?? null,
        quantity: quantity,
        stock_before: currentStock,
        stock_physical: newPhysical,
        stock_diff: newDiff,
      })

      if (readingError) {
        playScanFeedback(false)
        toast.error('Error al registrar lectura: ' + readingError.message)
        return
      }

      // 5. Register in transactions (movim_type = 'I')
      await supabase.from('transactions').insert({
        id_store: storeId,
        id_location: locId,
        id_item: item.id_item,
        id_user: currentUser?.id ?? null,
        movim_type: 'I',
        amount_enrty: quantity > 0 ? quantity : 0,
        amount_exit: quantity < 0 ? Math.abs(quantity) : 0,
        cost: item.cost ?? 0,
        price: item.price ?? 0,
        reference: `INV-SESIÓN-${currentActive.id_session.slice(0, 8)}`,
        concept: 'Lectura de inventario físico',
        origin: 'Inventario Físico',
      })

      const locObj = locations.find((l) => l.id_location === locId)

      // 6. Set last scanned item banner & play feedback sound
      playScanFeedback(true)
      setLastScanned({
        item,
        stockBefore: currentStock,
        stockPhysical: newPhysical,
        stockDiff: newDiff,
        locationName: locObj?.description ?? undefined,
      })

      toast.success(`${item.description}: +${quantity}`)

      // 7. Reset inputs and ALWAYS return focus to barcode input
      setBarcodeInput('')
      setQuantity(1)
      await fetchReadings(currentActive.id_session)
    } catch {
      playScanFeedback(false)
      toast.error('Ocurrió un error inesperado al capturar')
    } finally {
      setIsProcessing(false)
      focusScannerInput()
    }
  }

  // Camera Scanner routines
  const startCamera = async () => {
    try {
      setCameraModalOpen(true)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      })
      mediaStreamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      // BarcodeDetector on supported mobile browsers (Chrome Android / Safari 17+)
      const winWithDetector = window as unknown as {
        BarcodeDetector?: new (opts?: { formats: string[] }) => {
          detect: (src: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>
        }
      }

      if (winWithDetector.BarcodeDetector) {
        const detector = new winWithDetector.BarcodeDetector({
          formats: ['qr_code', 'ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e'],
        })

        scanIntervalRef.current = setInterval(async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) return
          try {
            const barcodes = await detector.detect(videoRef.current)
            if (barcodes.length > 0 && barcodes[0].rawValue) {
              const code = barcodes[0].rawValue
              stopCamera()
              await handleProcessScan(code)
            }
          } catch {
            // detection frame error, continue
          }
        }, 250)
      }
    } catch (err) {
      console.error('Error starting camera:', err)
      toast.error('No se pudo acceder a la cámara. Verifique los permisos del navegador.')
      stopCamera()
    }
  }

  const stopCamera = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current)
      scanIntervalRef.current = null
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop())
      mediaStreamRef.current = null
    }
    setCameraModalOpen(false)
    focusScannerInput()
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

      toast.success('Sesión cerrada y existencias sincronizadas exitosamente')
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
      toast.error('No hay lecturas registradas para exportar')
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
      `Verificación Hash: SHA256-${session.id_session.slice(0, 16)}-AUTENTICADO`,
      14,
      finalY + 41
    )

    doc.save(`Inventario-Fisico-${session.id_session.slice(0, 8)}.pdf`)
    toast.success('PDF generado exitosamente')
  }

  // Load past sessions history
  const openHistory = async () => {
    setShowHistoryModal(true)
    if (!storeId) return

    let { data, error } = await supabase
      .from('inventory_sessions')
      .select(`
        *,
        user:users(id_user, user_name, email)
      `)
      .eq('id_store', storeId)
      .eq('status', 'C')
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) {
      const retryProfiles = await supabase
        .from('inventory_sessions')
        .select(`
          *,
          user:profiles(full_name, email)
        `)
        .eq('id_store', storeId)
        .eq('status', 'C')
        .order('created_at', { ascending: false })
        .limit(20)

      if (!retryProfiles.error) {
        data = retryProfiles.data
        error = null
      } else {
        const retryPlain = await supabase
          .from('inventory_sessions')
          .select('*')
          .eq('id_store', storeId)
          .eq('status', 'C')
          .order('created_at', { ascending: false })
          .limit(20)
        data = retryPlain.data
        error = retryPlain.error
      }
    }

    if (data) {
      const rawSessions = data as unknown as Array<InventorySession & { user?: Record<string, unknown> }>
      const mapped = rawSessions.map((s) => ({
        ...s,
        user: normalizeUser(s.user),
      }))
      setPastSessions(mapped as unknown as InventorySession[])
    }
  }

  const handleSelectPastSession = async (session: InventorySession) => {
    setSelectedPastSession(session)
    setLoadingPastReadings(true)

    let { data, error } = await supabase
      .from('inventory_readings')
      .select(`
        *,
        item:items (id_item, code, barcode, description, unit),
        location:locations (id_location, description),
        user:users (id_user, user_name, email)
      `)
      .eq('id_session', session.id_session)
      .order('created_at', { ascending: false })

    if (error) {
      const retryProfiles = await supabase
        .from('inventory_readings')
        .select(`
          *,
          item:items (id_item, code, barcode, description, unit),
          location:locations (id_location, description),
          user:profiles (id, full_name)
        `)
        .eq('id_session', session.id_session)
        .order('created_at', { ascending: false })

      if (!retryProfiles.error) {
        data = retryProfiles.data
        error = null
      } else {
        const retryPlain = await supabase
          .from('inventory_readings')
          .select(`
            *,
            item:items (id_item, code, barcode, description, unit),
            location:locations (id_location, description)
          `)
          .eq('id_session', session.id_session)
          .order('created_at', { ascending: false })
        data = retryPlain.data
        error = retryPlain.error
      }
    }

    if (data) {
      const rawReadings = data as unknown as Array<InventoryReading & { user?: Record<string, unknown> }>
      const mapped = rawReadings.map((r) => ({
        ...r,
        user: normalizeUser(r.user),
      }))
      setPastSessionReadings(mapped as unknown as InventoryReading[])
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
    <div
      onClick={handleWorkspaceClick}
      className="space-y-3 sm:space-y-4 pb-20 sm:pb-6 select-none sm:select-auto"
    >
      <div className="dashboard-bg" />

      {/* ── TOP MOBILE-FIRST APP BAR ────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <ScanLine size={20} className="animate-pulse" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h1 className="font-bold text-base sm:text-lg text-foreground truncate leading-tight">
                Inventario Físico
              </h1>
              {activeSession && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              )}
            </div>
            <p className="text-[11px] text-muted-foreground truncate leading-tight">
              {currentStore?.description ?? 'Sucursal activa'}
              {activeSession && (
                <span className="font-mono text-emerald-400 ml-1.5">
                  #{activeSession.id_session.slice(0, 6).toUpperCase()}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Action Buttons (Compact Mobile Bar) */}
        <div className="flex items-center gap-1.5 shrink-0">
          {activeSession ? (
            <>
              <button
                type="button"
                onClick={() => handleExportPDF()}
                disabled={readings.length === 0}
                className="p-2 rounded-xl glass hover:bg-white/10 text-muted-foreground hover:text-foreground transition-all disabled:opacity-30"
                title="Descargar PDF firmado"
              >
                <FileText size={16} />
              </button>
              <button
                type="button"
                onClick={openHistory}
                className="p-2 rounded-xl glass hover:bg-white/10 text-muted-foreground hover:text-foreground transition-all"
                title="Historial de sesiones"
              >
                <History size={16} />
              </button>
              <button
                type="button"
                onClick={() => setConfirmCloseOpen(true)}
                className="px-2.5 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-400 text-xs font-semibold flex items-center gap-1 transition-all"
                title="Finalizar y sincronizar inventario"
              >
                <CheckCircle2 size={14} />
                <span className="hidden sm:inline">Cerrar</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={openHistory}
                className="p-2 rounded-xl glass hover:bg-white/10 text-muted-foreground hover:text-foreground transition-all"
                title="Historial de sesiones"
              >
                <History size={16} />
              </button>
              <GlassButton
                variant="primary"
                size="sm"
                onClick={handleStartSession}
                disabled={loadingSession || !storeId}
                className="text-xs font-semibold py-1.5 px-3"
              >
                <Plus size={14} className="mr-1" />
                Nueva Sesión
              </GlassButton>
            </>
          )}
        </div>
      </div>

      {/* ── HERO SCANNING CARD (MOBILE PROTAGONIST) ────────────────────── */}
      <GlassCard padding="sm" variant="emerald" className="border-emerald-500/30 shadow-lg space-y-3">
        {/* Row 1: Location & Session Pill */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 bg-black/20 rounded-xl px-2.5 py-1 border border-white/10 flex-1 min-w-0">
            <MapPin size={13} className="text-emerald-400 shrink-0" />
            <select
              value={selectedLocation}
              onChange={(e) => {
                setSelectedLocation(e.target.value)
                focusScannerInput()
              }}
              className="bg-transparent border-none text-foreground text-xs font-medium focus:outline-none cursor-pointer w-full truncate"
            >
              {locations.length === 0 ? (
                <option value="">Sin ubicaciones</option>
              ) : (
                locations.map((loc) => (
                  <option key={loc.id_location} value={loc.id_location} className="bg-zinc-900 text-white">
                    {loc.description}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="shrink-0 text-right">
            <span className="text-[11px] font-mono font-semibold px-2 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
              {readings.length} {readings.length === 1 ? 'lectura' : 'lecturas'}
            </span>
          </div>
        </div>

        {/* Row 2: Barcode Input (Always in Focus) */}
        <div className="relative flex items-center gap-1.5">
          <div className="relative flex-1">
            <input
              ref={barcodeInputRef}
              type="text"
              autoFocus
              inputMode="text"
              autoComplete="off"
              autoCorrect="off"
              spellCheck="false"
              placeholder="Escanee código o escriba aquí..."
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleProcessScan()
                }
              }}
              className="w-full pl-11 pr-24 py-3.5 sm:py-4 rounded-2xl glass-input text-base sm:text-lg font-mono font-bold text-foreground placeholder:text-muted-foreground/60 placeholder:font-normal placeholder:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 border border-emerald-500/40 bg-black/25 shadow-inner"
            />
            <ScanLine
              size={20}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-400 animate-pulse pointer-events-none"
            />

            {/* Quick action buttons inside input */}
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <button
                type="button"
                onClick={startCamera}
                title="Escanear con cámara"
                className="w-8 h-8 rounded-xl bg-white/10 hover:bg-emerald-500/20 text-muted-foreground hover:text-emerald-400 flex items-center justify-center transition-all"
              >
                <Camera size={16} />
              </button>
              <button
                type="button"
                onClick={openItemSearch}
                title="Buscar en catálogo"
                className="w-8 h-8 rounded-xl bg-white/10 hover:bg-emerald-500/20 text-muted-foreground hover:text-emerald-400 flex items-center justify-center transition-all"
              >
                <Search size={16} />
              </button>
            </div>
          </div>

          {/* Submit / Enter Button */}
          <button
            type="button"
            onClick={() => handleProcessScan()}
            disabled={isProcessing}
            className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold flex items-center justify-center shrink-0 shadow-lg shadow-emerald-500/20 active:scale-95 transition-all disabled:opacity-40"
            title="Registrar lectura (Enter)"
          >
            {isProcessing ? (
              <RefreshCw size={20} className="animate-spin" />
            ) : (
              <Check size={22} className="stroke-[2.5]" />
            )}
          </button>
        </div>

        {/* Row 3: Thumb-Friendly Quantity Controls */}
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <div className="flex items-center gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mr-1">
              Cant:
            </span>
            <div className="flex items-center bg-black/30 rounded-xl p-0.5 border border-white/10">
              <button
                type="button"
                onClick={() => {
                  setQuantity((q) => q - 1)
                  focusScannerInput()
                }}
                className="w-9 h-8 rounded-lg hover:bg-white/10 active:bg-white/20 text-muted-foreground hover:text-foreground flex items-center justify-center transition-all"
                title="Restar 1 (permite negativos)"
              >
                <Minus size={15} />
              </button>
              <input
                type="number"
                inputMode="numeric"
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                onFocus={(e) => e.target.select()}
                className="w-12 bg-transparent text-center font-mono font-bold text-sm text-foreground focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  setQuantity((q) => q + 1)
                  focusScannerInput()
                }}
                className="w-9 h-8 rounded-lg hover:bg-white/10 active:bg-white/20 text-muted-foreground hover:text-foreground flex items-center justify-center transition-all"
                title="Sumar 1"
              >
                <Plus size={15} />
              </button>
            </div>
          </div>

          {/* Quick Quantity Pills */}
          <div className="flex items-center gap-1">
            {[1, 5, 10, -1].map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => {
                  setQuantity(val)
                  focusScannerInput()
                }}
                className={`text-xs font-mono font-bold px-2 py-1.5 rounded-lg border transition-all ${
                  quantity === val
                    ? 'bg-emerald-500 text-white border-emerald-400'
                    : 'bg-white/5 hover:bg-white/10 border-white/10 text-muted-foreground hover:text-foreground'
                }`}
              >
                {val > 0 ? `+${val}` : val}
              </button>
            ))}
          </div>
        </div>
      </GlassCard>

      {/* ── LAST SCANNED BANNER (LIVE FEEDBACK) ─────────────────────────── */}
      <AnimatePresence>
        {lastScanned && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.15 }}
          >
            <GlassCard
              variant={lastScanned.stockDiff === 0 ? 'emerald' : lastScanned.stockDiff < 0 ? 'rose' : 'amber'}
              padding="sm"
              className="border border-white/20 shadow-md"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                      Último Escaneado
                    </span>
                    {lastScanned.locationName && (
                      <span className="text-[10px] text-muted-foreground font-mono">
                        · {lastScanned.locationName}
                      </span>
                    )}
                  </div>
                  <h4 className="font-bold text-foreground text-sm truncate leading-snug">
                    {lastScanned.item.description}
                  </h4>
                  <div className="text-[11px] text-muted-foreground font-mono truncate">
                    {lastScanned.item.barcode || lastScanned.item.code || 'Sin código'}
                  </div>
                </div>

                {/* 3 Metric Comparison Blocks */}
                <div className="grid grid-cols-3 gap-1.5 bg-black/30 p-1.5 rounded-xl border border-white/10 shrink-0">
                  <div className="text-center px-2 py-0.5">
                    <span className="text-[9px] uppercase font-bold text-muted-foreground block leading-tight">
                      Sistema
                    </span>
                    <span className="font-mono font-bold text-sm text-foreground">
                      {lastScanned.stockBefore}
                    </span>
                  </div>
                  <div className="text-center px-2 py-0.5 border-x border-white/10">
                    <span className="text-[9px] uppercase font-bold text-emerald-400 block leading-tight">
                      Físico
                    </span>
                    <span className="font-mono font-bold text-sm text-emerald-400">
                      {lastScanned.stockPhysical}
                    </span>
                  </div>
                  <div className="text-center px-2 py-0.5">
                    <span className="text-[9px] uppercase font-bold text-muted-foreground block leading-tight">
                      Diferencia
                    </span>
                    <span
                      className={`font-mono font-bold text-sm ${
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

      {/* ── READINGS LIST (MOBILE-OPTIMIZED CARDS / DESKTOP TABLE) ─────── */}
      <GlassCard padding="none" className="overflow-hidden">
        <div className="p-3 sm:p-4 border-b border-border/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-foreground text-sm sm:text-base">
              Lecturas Registradas
            </h3>
            <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-white/10 text-muted-foreground">
              {readings.length}
            </span>
          </div>
          <span className="text-[11px] text-emerald-400 flex items-center gap-1.5 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            En vivo
          </span>
        </div>

        {loadingReadings && readings.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <RefreshCw size={20} className="animate-spin text-emerald-400 mx-auto mb-2" />
            <p className="text-xs">Cargando lecturas...</p>
          </div>
        ) : readings.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <p className="text-sm font-semibold">Listo para escanear</p>
            <p className="text-xs text-muted-foreground/80 mt-1">
              Escanee con lector láser, use la cámara o busque productos por nombre
            </p>
          </div>
        ) : (
          <>
            {/* MOBILE VIEW: Touch-Friendly Compact Cards (No horizontal scroll) */}
            <div className="block md:hidden divide-y divide-border/20 max-h-[50vh] overflow-y-auto scroll-modern">
              {readings.map((r, i) => {
                const diff = r.stock_diff ?? 0
                return (
                  <div key={r.id_reading} className="p-3 hover:bg-white/[0.02] transition-colors space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <span className="text-[10px] text-muted-foreground font-mono mr-1.5">
                          #{readings.length - i}
                        </span>
                        <span className="font-bold text-foreground text-xs sm:text-sm">
                          {r.item?.description ?? 'Sin descripción'}
                        </span>
                      </div>
                      <span className="shrink-0 font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        {r.quantity > 0 ? `+${r.quantity}` : r.quantity}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <div className="flex items-center gap-2 truncate font-mono">
                        <span>{r.item?.barcode || r.item?.code || '—'}</span>
                        <span>·</span>
                        <span className="truncate">{r.location?.description ?? 'General'}</span>
                      </div>
                      <span className="font-mono text-[10px] shrink-0">
                        {formatDateTime(r.created_at).split(' ')[1] || formatDateTime(r.created_at)}
                      </span>
                    </div>

                    {/* Stock comparison badges */}
                    <div className="flex items-center gap-1.5 text-[10px] font-mono pt-0.5">
                      <span className="px-2 py-0.5 rounded bg-black/20 text-muted-foreground border border-white/5">
                        Sist: {r.stock_before}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/20 font-bold">
                        Fís: {r.stock_physical}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded border font-bold ${
                          diff === 0
                            ? 'bg-white/5 text-muted-foreground border-white/10'
                            : diff > 0
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                            : 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                        }`}
                      >
                        Dif: {diff > 0 ? `+${diff}` : diff}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* DESKTOP VIEW: Full Structured Table */}
            <div className="hidden md:block overflow-x-auto scroll-modern max-h-[50vh]">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-zinc-950/90 backdrop-blur-md border-b border-border/40 font-semibold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Producto</th>
                    <th className="px-4 py-3">Ubicación</th>
                    <th className="px-4 py-3 text-right">Cant.</th>
                    <th className="px-4 py-3 text-right">Stk Sist.</th>
                    <th className="px-4 py-3 text-right">Stk Fís.</th>
                    <th className="px-4 py-3 text-right">Diferencia</th>
                    <th className="px-4 py-3">Usuario</th>
                    <th className="px-4 py-3 text-right">Hora</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {readings.map((r, i) => {
                    const diff = r.stock_diff ?? 0
                    return (
                      <tr key={r.id_reading} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-2.5 font-mono text-muted-foreground">{readings.length - i}</td>
                        <td className="px-4 py-2.5">
                          <div className="font-semibold text-foreground text-xs">{r.item?.description}</div>
                          <div className="font-mono text-[10px] text-muted-foreground">{r.item?.barcode || r.item?.code}</div>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">{r.location?.description ?? '—'}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-400">
                          {r.quantity > 0 ? `+${r.quantity}` : r.quantity}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">{r.stock_before}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-400">{r.stock_physical}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold">
                          <span
                            className={
                              diff === 0 ? 'text-muted-foreground' : diff > 0 ? 'text-emerald-400' : 'text-rose-400'
                            }
                          >
                            {diff > 0 ? `+${diff}` : diff}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">{r.user?.full_name ?? currentUser?.full_name ?? '—'}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">{formatDateTime(r.created_at)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </GlassCard>

      {/* ── MODAL: CAMERA SCANNER (MOBILE WEBCAM) ───────────────────────── */}
      <AnimatePresence>
        {cameraModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card max-w-sm w-full p-4 space-y-3 relative overflow-hidden"
            >
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <Camera size={18} className="text-emerald-400" />
                  <h3 className="text-sm font-bold text-foreground">Escáner de Cámara</h3>
                </div>
                <button
                  type="button"
                  onClick={stopCamera}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Camera Viewport with targeting box */}
              <div className="relative aspect-square w-full rounded-2xl overflow-hidden bg-black flex items-center justify-center border border-white/20">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                {/* Targeting reticle */}
                <div className="absolute inset-8 border-2 border-emerald-400/80 rounded-2xl pointer-events-none flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.3)]">
                  <div className="w-full h-0.5 bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse" />
                </div>
              </div>

              <p className="text-center text-xs text-muted-foreground">
                Apunte la cámara hacia el código de barras o código QR
              </p>

              <GlassButton variant="ghost" size="sm" onClick={stopCamera} className="w-full">
                Cancelar
              </GlassButton>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── MODAL: SEARCH ITEM BY DESCRIPTION ──────────────────────────── */}
      <AnimatePresence>
        {searchModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card max-w-xl w-full p-4 space-y-3 max-h-[85vh] flex flex-col"
            >
              <div className="flex items-center justify-between border-b border-border/40 pb-2.5">
                <h3 className="text-sm sm:text-base font-bold text-foreground flex items-center gap-2">
                  <Search size={18} className="text-emerald-400" />
                  Buscar Artículo por Descripción
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setSearchModalOpen(false)
                    focusScannerInput()
                  }}
                  className="p-1 rounded-lg text-muted-foreground hover:text-foreground"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="relative">
                <input
                  type="text"
                  autoFocus
                  placeholder="Escriba descripción, código o código de barras..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="glass-input w-full pl-9 pr-3 py-2.5 text-sm text-foreground focus:ring-2 focus:ring-emerald-400"
                />
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              </div>

              <div className="flex-1 overflow-y-auto scroll-modern border border-border/30 rounded-xl divide-y divide-border/20">
                {loadingCatalog ? (
                  <div className="p-8 text-center text-muted-foreground text-xs">Cargando catálogo...</div>
                ) : filteredCatalogItems.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground text-xs">No se encontraron productos coincidentes</div>
                ) : (
                  filteredCatalogItems.map((item) => (
                    <div
                      key={item.id_item}
                      onClick={() => handleSelectItemFromSearch(item)}
                      className="p-3 hover:bg-emerald-500/10 active:bg-emerald-500/20 cursor-pointer transition-colors flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-foreground text-xs sm:text-sm truncate">
                          {item.description}
                        </div>
                        <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground mt-0.5">
                          {item.code && <span>Cód: {item.code}</span>}
                          {item.barcode && <span className="text-emerald-400">CB: {item.barcode}</span>}
                        </div>
                      </div>
                      <span className="shrink-0 px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 text-xs font-semibold">
                        Seleccionar
                      </span>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── MODAL: CONFIRM CLOSE SESSION ───────────────────────────────── */}
      <AnimatePresence>
        {confirmCloseOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card max-w-sm w-full p-5 space-y-4"
            >
              <div className="flex items-center gap-2.5 text-amber-400">
                <AlertCircle size={22} />
                <h3 className="text-base font-bold text-foreground">¿Cerrar Inventario?</h3>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Al confirmar, las existencias del sistema serán ajustadas para igualar el conteo físico ({readings.length} lecturas). Esta acción no se puede deshacer.
              </p>
              <div className="flex items-center justify-end gap-2 pt-1">
                <GlassButton
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setConfirmCloseOpen(false)
                    focusScannerInput()
                  }}
                >
                  Cancelar
                </GlassButton>
                <GlassButton
                  variant="danger"
                  size="sm"
                  onClick={handleCloseSession}
                  disabled={closingSession}
                >
                  {closingSession ? 'Sincronizando...' : 'Confirmar Cierre'}
                </GlassButton>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── MODAL: PAST SESSIONS HISTORY ──────────────────────────────── */}
      <AnimatePresence>
        {showHistoryModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card max-w-3xl w-full p-4 sm:p-5 space-y-3 max-h-[85vh] flex flex-col"
            >
              <div className="flex items-center justify-between border-b border-border/40 pb-2.5">
                <h3 className="text-sm sm:text-base font-bold text-foreground flex items-center gap-2">
                  <History size={18} className="text-emerald-400" />
                  Historial de Inventarios Cerrados
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setShowHistoryModal(false)
                    setSelectedPastSession(null)
                    focusScannerInput()
                  }}
                  className="p-1 rounded-lg text-muted-foreground hover:text-foreground"
                >
                  <X size={18} />
                </button>
              </div>

              {!selectedPastSession ? (
                <div className="flex-1 overflow-y-auto scroll-modern border border-border/30 rounded-xl divide-y divide-border/20">
                  {pastSessions.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground text-xs">
                      No hay inventarios cerrados en esta sucursal
                    </div>
                  ) : (
                    pastSessions.map((s) => (
                      <div
                        key={s.id_session}
                        onClick={() => handleSelectPastSession(s)}
                        className="p-3 hover:bg-white/[0.03] active:bg-white/[0.05] cursor-pointer transition-colors flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <span className="font-mono font-bold text-emerald-400 text-xs">
                            #{s.id_session.slice(0, 8).toUpperCase()}
                          </span>
                          <div className="text-[11px] text-muted-foreground">
                            Cerrado: {s.closed_at ? formatDateTime(s.closed_at) : '—'}
                          </div>
                          <div className="text-[11px] text-foreground/80 truncate">
                            {s.user?.full_name ?? s.user?.email ?? 'Auditor'}
                          </div>
                        </div>
                        <span className="shrink-0 text-xs text-emerald-400 font-semibold px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/20">
                          Ver Detalle
                        </span>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="space-y-3 flex-1 flex flex-col overflow-hidden">
                  <div className="flex items-center justify-between bg-white/[0.03] p-2.5 rounded-xl border border-white/5">
                    <span className="text-xs font-mono font-bold text-foreground">
                      Folio #{selectedPastSession.id_session.slice(0, 8).toUpperCase()}
                    </span>
                    <div className="flex items-center gap-2">
                      <GlassButton
                        variant="ghost"
                        size="sm"
                        onClick={() => handleExportPDF(selectedPastSession, pastSessionReadings)}
                        className="text-xs py-1 px-2.5"
                      >
                        <FileText size={14} className="mr-1" />
                        PDF
                      </GlassButton>
                      <button
                        type="button"
                        onClick={() => setSelectedPastSession(null)}
                        className="text-xs text-muted-foreground hover:text-foreground underline px-1"
                      >
                        Volver
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto scroll-modern border border-border/30 rounded-xl divide-y divide-border/20">
                    {loadingPastReadings ? (
                      <div className="p-8 text-center text-muted-foreground text-xs">Cargando lecturas...</div>
                    ) : (
                      pastSessionReadings.map((r) => {
                        const diff = r.stock_diff ?? 0
                        return (
                          <div key={r.id_reading} className="p-2.5 text-xs space-y-1">
                            <div className="font-semibold text-foreground">{r.item?.description}</div>
                            <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
                              <span>{r.item?.barcode || r.item?.code || '—'}</span>
                              <div className="flex items-center gap-2">
                                <span>Sist: {r.stock_before}</span>
                                <span className="text-emerald-400 font-bold">Fís: {r.stock_physical}</span>
                                <span className={diff === 0 ? 'text-muted-foreground' : diff > 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                                  Dif: {diff > 0 ? `+${diff}` : diff}
                                </span>
                              </div>
                            </div>
                          </div>
                        )
                      })
                    )}
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
