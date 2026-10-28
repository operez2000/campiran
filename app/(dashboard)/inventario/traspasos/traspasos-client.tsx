'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Truck,
  ArrowRight,
  Plus,
  Search,
  ScanLine,
  Camera,
  CheckCircle2,
  AlertTriangle,
  PackageCheck,
  FileSpreadsheet,
  FileText,
  XCircle,
  Trash2,
  Eye,
  RefreshCw,
  MapPin,
  Store as StoreIcon,
  Boxes,
  Minus,
  X,
  ArrowDownLeft,
  ArrowUpRight,
  Zap,
  Clock,
  Lock,
} from 'lucide-react'
import { toast } from 'sonner'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

import { createClient } from '@/utils/supabase/client'
import { useStore } from '@/components/providers/store-provider'
import { GlassCard } from '@/components/glass-card'
import { GlassButton } from '@/components/glass-button'
import { GlassInput } from '@/components/glass-input'
import { StatusBadge } from '@/components/status-badge'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { InventarioTabs } from '@/components/inventario/inventario-tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  TableActionMenu,
  TableColumnHeader,
  TablePagination,
  type TableActionItem,
} from '@/components/tables'
import { formatCurrency, formatDateTime, cn } from '@/lib/utils'
import {
  type BranchTransfer,
  type TransferMode,
  type TransferDiscrepancyResolution,
  type Store,
  type Location,
  type Item,
  type Stock,
  type Profile,
} from '@/lib/types'
import {
  getBranchTransfersDataAction,
  createBranchTransferAction,
  receiveBranchTransferAction,
  cancelBranchTransferAction,
  deleteBranchTransferAction,
} from './actions'

interface DraftTransferLine {
  item: Item
  quantity: number
  availableStock: number
  unitCost: number
  notes: string
}

interface ReceiveLineState {
  id_transfer_item?: string
  id_item: string
  itemDescription: string
  itemCode: string
  unit: string
  quantity_sent: number
  quantity_received: number
  unit_cost: number
  notes: string
}

function formatFolio(folio: number): string {
  return `TRP-${String(folio || 1).padStart(4, '0')}`
}

// Audio & Haptic feedback for barcode scanning
function playScanFeedback(isSuccess = true) {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (AudioCtx) {
      const ctx = new AudioCtx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      if (isSuccess) {
        osc.frequency.setValueAtTime(880, ctx.currentTime)
        gain.gain.setValueAtTime(0.18, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1)
        osc.start(ctx.currentTime)
        osc.stop(ctx.currentTime + 0.1)
      } else {
        osc.frequency.setValueAtTime(240, ctx.currentTime)
        gain.gain.setValueAtTime(0.24, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25)
        osc.start(ctx.currentTime)
        osc.stop(ctx.currentTime + 0.25)
      }
    }
  } catch {
    // ignore audio restrictions
  }

  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(isSuccess ? 35 : [80, 40, 80])
    }
  } catch {
    // ignore
  }
}

export function TraspasosClient({ currentProfile }: { currentProfile: Profile | null }) {
  const supabase = createClient()
  const { currentStore, storeId } = useStore()

  const canUseDirectMode =
    currentProfile?.role === 'ADMIN' || currentProfile?.role === 'MANAGER'
  const canDeleteCancelled =
    currentProfile?.role === 'ADMIN' || currentProfile?.role === 'MANAGER'

  // Main data state
  const [transfers, setTransfers] = useState<BranchTransfer[]>([])
  const [stores, setStores] = useState<Store[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [catalogItems, setCatalogItems] = useState<Item[]>([])
  const [originStocks, setOriginStocks] = useState<Stock[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [search, setSearch] = useState('')
  const [directionFilter, setDirectionFilter] = useState<'ALL' | 'INCOMING' | 'OUTGOING'>('ALL')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')

  // Sorting & Pagination
  const [sortKey, setSortKey] = useState<string>('sent_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  // ── Create Transfer Modal State ──────────────────────────────
  const [createOpen, setCreateOpen] = useState(false)
  const [transferMode, setTransferMode] = useState<TransferMode>('TRANSIT')
  const [selectedOriginLoc, setSelectedOriginLoc] = useState<string>('')
  const [selectedDestStore, setSelectedDestStore] = useState<string>('')
  const [selectedDestLoc, setSelectedDestLoc] = useState<string>('')
  const [transferNotes, setTransferNotes] = useState('')
  const [draftLines, setDraftLines] = useState<DraftTransferLine[]>([])
  const [submittingCreate, setSubmittingCreate] = useState(false)

  // Barcode & Search inside Create Modal
  const [barcodeInput, setBarcodeInput] = useState('')
  const [scanQty, setScanQty] = useState<number>(1)
  const [itemSearchQuery, setItemSearchQuery] = useState('')
  const [onlyItemsWithStock, setOnlyItemsWithStock] = useState(true)
  const [catalogPickerOpen, setCatalogPickerOpen] = useState(false)
  const barcodeInputRef = useRef<HTMLInputElement>(null)

  // Camera Scanner Modal
  const [cameraModalOpen, setCameraModalOpen] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // ── Receive Transfer Modal State ─────────────────────────────
  const [receiveTarget, setReceiveTarget] = useState<BranchTransfer | null>(null)
  const [receiveDestLoc, setReceiveDestLoc] = useState<string>('')
  const [receiveLines, setReceiveLines] = useState<ReceiveLineState[]>([])
  const [receptionNotes, setReceptionNotes] = useState('')
  const [discrepancyResolution, setDiscrepancyResolution] =
    useState<TransferDiscrepancyResolution>('RETURN_TO_ORIGIN')
  const [submittingReceive, setSubmittingReceive] = useState(false)

  // ── Detail Modal State ───────────────────────────────────────
  const [detailTransfer, setDetailTransfer] = useState<BranchTransfer | null>(null)

  // ── Cancel & Delete Dialogs ──────────────────────────────────
  const [cancelTarget, setCancelTarget] = useState<BranchTransfer | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [submittingCancel, setSubmittingCancel] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<BranchTransfer | null>(null)
  const [submittingDelete, setSubmittingDelete] = useState(false)

  // ── Data Fetching ────────────────────────────────────────────
  const fetchTransfersData = useCallback(
    async (silent = false) => {
      if (!storeId) {
        setTransfers([])
        setOriginStocks([])
        setLoading(false)
        return
      }
      if (!silent) setLoading(true)
      try {
        const res = await getBranchTransfersDataAction(storeId)
        setTransfers(res.transfers)
        setStores(res.stores)
        setLocations(res.locations)
        setCatalogItems(res.items)
        setOriginStocks(res.originStocks)
      } catch (err: unknown) {
        if (!silent) {
          const msg = err instanceof Error ? err.message : 'Error al cargar traspasos'
          toast.error(msg)
        }
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [storeId]
  )

  useEffect(() => {
    fetchTransfersData()
  }, [fetchTransfersData])

  // ── Realtime Subscriptions + Visibility Fallback ─────────────
  useEffect(() => {
    if (!storeId) return

    const channel = supabase
      .channel(`branch-transfers-live-${storeId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'branch_transfers' },
        () => {
          fetchTransfersData(true)
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'branch_transfer_items' },
        () => {
          fetchTransfersData(true)
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'stocks',
          filter: `id_store=eq.${storeId}`,
        },
        () => {
          fetchTransfersData(true)
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions',
          filter: `id_store=eq.${storeId}`,
        },
        () => {
          fetchTransfersData(true)
        }
      )
      .subscribe()

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchTransfersData(true)
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      supabase.removeChannel(channel)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [storeId, supabase, fetchTransfersData])

  // ── Origin & Destination Locations Helpers ───────────────────
  const originStoreLocations = useMemo(
    () => locations.filter((l) => l.id_store === storeId && l.status === 'A'),
    [locations, storeId]
  )

  const destinationStores = useMemo(
    () => stores.filter((s) => s.id_store !== storeId && s.status === 'A'),
    [stores, storeId]
  )

  const destStoreLocations = useMemo(
    () => locations.filter((l) => l.id_store === selectedDestStore && l.status === 'A'),
    [locations, selectedDestStore]
  )

  // Preselect default origin location when store or locations change
  useEffect(() => {
    if (originStoreLocations.length > 0) {
      const preferred =
        originStoreLocations.find((l) => l.is_selected) ?? originStoreLocations[0]
      if (
        !selectedOriginLoc ||
        !originStoreLocations.some((l) => l.id_location === selectedOriginLoc)
      ) {
        setSelectedOriginLoc(preferred.id_location)
      }
    } else {
      setSelectedOriginLoc('')
    }
  }, [originStoreLocations, selectedOriginLoc])

  // Preselect default destination store & its primary location
  useEffect(() => {
    if (destinationStores.length > 0 && !selectedDestStore) {
      setSelectedDestStore(destinationStores[0].id_store)
    }
  }, [destinationStores, selectedDestStore])

  useEffect(() => {
    if (destStoreLocations.length > 0) {
      const preferred =
        destStoreLocations.find((l) => l.is_selected) ?? destStoreLocations[0]
      setSelectedDestLoc(preferred.id_location)
    } else {
      setSelectedDestLoc('')
    }
  }, [selectedDestStore, destStoreLocations])

  // Map available stock per item in the selected origin location
  const stockByItemInOriginLoc = useMemo(() => {
    const map = new Map<string, number>()
    for (const st of originStocks) {
      if (!st.id_item) continue
      if (selectedOriginLoc) {
        if (st.id_location === selectedOriginLoc) {
          map.set(st.id_item, (map.get(st.id_item) ?? 0) + Number(st.current ?? 0))
        }
      } else {
        map.set(st.id_item, (map.get(st.id_item) ?? 0) + Number(st.current ?? 0))
      }
    }
    return map
  }, [originStocks, selectedOriginLoc])

  // Keep draftLines availableStock synced if user switches origin location
  useEffect(() => {
    setDraftLines((prev) =>
      prev.map((line) => {
        const avail = stockByItemInOriginLoc.get(line.item.id_item) ?? 0
        return {
          ...line,
          availableStock: avail,
          quantity: avail > 0 ? Math.min(line.quantity, avail) : line.quantity,
        }
      })
    )
  }, [stockByItemInOriginLoc])

  // ── Add / Scan Item into Draft Transfer ──────────────────────
  const addItemToDraft = useCallback(
    (item: Item, qtyToAdd = 1): boolean => {
      const available = stockByItemInOriginLoc.get(item.id_item) ?? 0
      const cleanQty = Math.max(1, Math.round(Number(qtyToAdd) || 1))

      if (available <= 0) {
        playScanFeedback(false)
        toast.error(
          `Sin existencia disponible para "${item.description}" en la ubicación de salida seleccionada.`
        )
        return false
      }

      let addedOk = false
      setDraftLines((prev) => {
        const existingIdx = prev.findIndex((l) => l.item.id_item === item.id_item)
        if (existingIdx >= 0) {
          const existing = prev[existingIdx]
          const nextQty = existing.quantity + cleanQty
          if (nextQty > available) {
            playScanFeedback(false)
            toast.error(
              `Stock máximo alcanzado para "${item.description}" (Disponible: ${available}).`
            )
            return prev
          }
          addedOk = true
          const copy = [...prev]
          copy[existingIdx] = {
            ...existing,
            quantity: nextQty,
            availableStock: available,
          }
          return copy
        } else {
          if (cleanQty > available) {
            playScanFeedback(false)
            toast.error(
              `Cantidad solicitada (${cleanQty}) supera la existencia disponible (${available}) de "${item.description}".`
            )
            return prev
          }
          addedOk = true
          return [
            {
              item,
              quantity: cleanQty,
              availableStock: available,
              unitCost: Number(item.cost ?? 0),
              notes: '',
            },
            ...prev,
          ]
        }
      })

      if (addedOk) {
        playScanFeedback(true)
        toast.success(`Agregado: ${item.description} (+${cleanQty})`)
      }
      return addedOk
    },
    [stockByItemInOriginLoc]
  )

  const handleBarcodeScanSubmit = (rawCode?: string) => {
    const code = (rawCode ?? barcodeInput).trim()
    if (!code) return

    const lower = code.toLowerCase()
    const matchedItem = catalogItems.find(
      (it) =>
        it.barcode?.toLowerCase() === lower ||
        it.code?.toLowerCase() === lower
    )

    if (!matchedItem) {
      playScanFeedback(false)
      toast.error(`No se encontró ningún artículo con código o código de barras "${code}"`)
      setBarcodeInput('')
      barcodeInputRef.current?.focus()
      return
    }

    addItemToDraft(matchedItem, scanQty)
    setBarcodeInput('')
    setScanQty(1)
    setTimeout(() => barcodeInputRef.current?.focus(), 50)
  }

  // ── Camera Barcode Scanner ───────────────────────────────────
  const stopCamera = useCallback(() => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current)
      scanIntervalRef.current = null
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop())
      mediaStreamRef.current = null
    }
    setCameraModalOpen(false)
  }, [])

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
              const rawValue = barcodes[0].rawValue
              stopCamera()
              handleBarcodeScanSubmit(rawValue)
            }
          } catch {
            // frame error
          }
        }, 250)
      }
    } catch {
      toast.error('No se pudo acceder a la cámara. Verifica los permisos del navegador.')
      stopCamera()
    }
  }

  useEffect(() => {
    return () => {
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current)
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop())
      }
    }
  }, [])

  // ── Filtered Catalog Items for Search Picker ─────────────────
  const filteredCatalogForPicker = useMemo(() => {
    const q = itemSearchQuery.trim().toLowerCase()
    return catalogItems
      .filter((it) => {
        const avail = stockByItemInOriginLoc.get(it.id_item) ?? 0
        if (onlyItemsWithStock && avail <= 0) return false
        if (!q) return true
        return (
          (it.description?.toLowerCase().includes(q) ?? false) ||
          (it.code?.toLowerCase().includes(q) ?? false) ||
          (it.barcode?.toLowerCase().includes(q) ?? false)
        )
      })
      .slice(0, 80)
  }, [catalogItems, itemSearchQuery, onlyItemsWithStock, stockByItemInOriginLoc])

  // Draft Totals
  const draftTotals = useMemo(() => {
    let totalUnits = 0
    let totalCost = 0
    let hasInvalidStock = false
    for (const l of draftLines) {
      totalUnits += l.quantity
      totalCost += l.quantity * l.unitCost
      if (l.quantity <= 0 || l.quantity > l.availableStock) {
        hasInvalidStock = true
      }
    }
    return {
      totalItems: draftLines.length,
      totalUnits,
      totalCost,
      hasInvalidStock,
    }
  }, [draftLines])

  const handleOpenCreateModal = () => {
    if (!storeId) {
      toast.error('Selecciona una sucursal activa en el encabezado antes de crear un traspaso.')
      return
    }
    setTransferMode('TRANSIT')
    setTransferNotes('')
    setDraftLines([])
    setBarcodeInput('')
    setItemSearchQuery('')
    setScanQty(1)
    if (destinationStores.length > 0 && !selectedDestStore) {
      setSelectedDestStore(destinationStores[0].id_store)
    }
    setCreateOpen(true)
    setTimeout(() => barcodeInputRef.current?.focus(), 120)
  }

  const handleCreateTransferSubmit = async () => {
    if (!storeId) return
    if (!selectedDestStore) {
      toast.error('Selecciona la sucursal de destino.')
      return
    }
    if (draftLines.length === 0) {
      toast.error('Agrega al menos un artículo al traspaso.')
      return
    }
    if (draftTotals.hasInvalidStock) {
      toast.error(
        'Revisa las cantidades de las partidas: ninguna puede superar la existencia disponible en la ubicación de origen.'
      )
      return
    }

    setSubmittingCreate(true)
    try {
      const res = await createBranchTransferAction({
        originStoreId: storeId,
        originLocationId: selectedOriginLoc || null,
        destStoreId: selectedDestStore,
        destLocationId: selectedDestLoc || null,
        transferMode,
        notes: transferNotes,
        items: draftLines.map((l) => ({
          id_item: l.item.id_item,
          quantity: l.quantity,
          notes: l.notes,
        })),
      })

      if (!res.success) {
        toast.error(res.error || 'No se pudo registrar el traspaso.')
        return
      }

      toast.success(
        transferMode === 'DIRECT'
          ? 'Traspaso directo aplicado exitosamente en ambas sucursales'
          : 'Envío de traspaso registrado en tránsito exitosamente'
      )
      setCreateOpen(false)
      setDraftLines([])
      await fetchTransfersData()
    } finally {
      setSubmittingCreate(false)
    }
  }

  // ── Open Receive Modal ───────────────────────────────────────
  const handleOpenReceiveModal = (transfer: BranchTransfer) => {
    setReceiveTarget(transfer)
    const targetStoreLocs = locations.filter(
      (l) => l.id_store === transfer.id_dest_store && l.status === 'A'
    )
    const defaultLoc =
      transfer.id_dest_location &&
      targetStoreLocs.some((l) => l.id_location === transfer.id_dest_location)
        ? transfer.id_dest_location
        : (targetStoreLocs.find((l) => l.is_selected) ?? targetStoreLocs[0])?.id_location ?? ''

    setReceiveDestLoc(defaultLoc)
    setReceptionNotes('')
    setDiscrepancyResolution('RETURN_TO_ORIGIN')
    setReceiveLines(
      (transfer.transfer_items ?? []).map((ti) => ({
        id_transfer_item: ti.id_transfer_item,
        id_item: ti.id_item,
        itemDescription: ti.item?.description ?? 'Artículo',
        itemCode: ti.item?.code || ti.item?.barcode || '—',
        unit: ti.item?.unit || 'PZA',
        quantity_sent: Number(ti.quantity_sent ?? 0),
        quantity_received: Number(ti.quantity_sent ?? 0),
        unit_cost: Number(ti.unit_cost ?? 0),
        notes: ti.notes ?? '',
      }))
    )
  }

  const receiveHasDiscrepancy = useMemo(
    () => receiveLines.some((l) => l.quantity_received < l.quantity_sent),
    [receiveLines]
  )

  const handleConfirmReceive = async () => {
    if (!receiveTarget) return
    setSubmittingReceive(true)
    try {
      const res = await receiveBranchTransferAction({
        transferId: receiveTarget.id_transfer,
        destLocationId: receiveDestLoc || null,
        receptionNotes,
        discrepancyResolution,
        items: receiveLines.map((l) => ({
          id_transfer_item: l.id_transfer_item,
          id_item: l.id_item,
          quantity_received: l.quantity_received,
          notes: l.notes,
        })),
      })

      if (!res.success) {
        toast.error(res.error || 'Error al confirmar recepción del traspaso')
        return
      }

      toast.success(
        `Traspaso ${formatFolio(receiveTarget.folio)} recibido y existencias actualizadas`
      )
      setReceiveTarget(null)
      await fetchTransfersData()
    } finally {
      setSubmittingReceive(false)
    }
  }

  // ── Cancel & Logical Delete Handlers ─────────────────────────
  const handleConfirmCancel = async () => {
    if (!cancelTarget) return
    setSubmittingCancel(true)
    try {
      const res = await cancelBranchTransferAction({
        transferId: cancelTarget.id_transfer,
        reason: cancelReason || 'Cancelado por el usuario',
      })
      if (!res.success) {
        toast.error(res.error || 'No se pudo cancelar el traspaso')
        return
      }
      toast.success(
        `Traspaso ${formatFolio(cancelTarget.folio)} cancelado y existencias reintegradas`
      )
      setCancelTarget(null)
      setCancelReason('')
      await fetchTransfersData()
    } finally {
      setSubmittingCancel(false)
    }
  }

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    setSubmittingDelete(true)
    try {
      const res = await deleteBranchTransferAction(deleteTarget.id_transfer)
      if (!res.success) {
        toast.error(res.error || 'No se pudo eliminar el registro')
        return
      }
      toast.success('Registro de traspaso eliminado lógicamente')
      setDeleteTarget(null)
      await fetchTransfersData()
    } finally {
      setSubmittingDelete(false)
    }
  }

  // ── PDF Voucher Generator ────────────────────────────────────
  const handleExportTransferPDF = (transfer: BranchTransfer) => {
    const doc = new jsPDF()
    const folioStr = formatFolio(transfer.folio)

    // Header
    doc.setFontSize(18)
    doc.setTextColor(16, 185, 129)
    doc.text('CAMPIRAN POS · TRASPASO ENTRE SUCURSALES', 14, 18)

    doc.setFontSize(12)
    doc.setTextColor(30, 41, 59)
    doc.text(`Folio de Traspaso: ${folioStr}`, 14, 26)

    doc.setFontSize(9.5)
    doc.setTextColor(71, 85, 105)
    const statusLabel =
      transfer.status === 'IN_TRANSIT'
        ? 'EN TRÁNSITO'
        : transfer.status === 'RECEIVED'
          ? 'RECIBIDO COMPLETO'
          : transfer.status === 'PARTIAL'
            ? 'RECIBIDO CON DIFERENCIAS'
            : 'CANCELADO'
    const modeLabel =
      transfer.transfer_mode === 'DIRECT'
        ? 'Traspaso Directo Inmediato'
        : 'Envío con Recepción en Destino'

    doc.text(`Estado: ${statusLabel}  |  Modalidad: ${modeLabel}`, 14, 33)
    doc.text(
      `Sucursal Origen: ${transfer.origin_store?.description ?? 'Origen'} (${transfer.origin_location?.description ?? 'Almacén General'})`,
      14,
      39
    )
    doc.text(
      `Sucursal Destino: ${transfer.dest_store?.description ?? 'Destino'} (${transfer.dest_location?.description ?? 'Almacén General'})`,
      14,
      45
    )
    doc.text(
      `Enviado por: ${transfer.sent_by_name ?? 'Usuario'}  |  Fecha Envío: ${formatDateTime(transfer.sent_at)}`,
      14,
      51
    )
    if (transfer.received_at) {
      doc.text(
        `Recibido por: ${transfer.received_by_name ?? 'Usuario'}  |  Fecha Recepción: ${formatDateTime(transfer.received_at)}`,
        14,
        57
      )
    }
    if (transfer.notes) {
      doc.text(`Observaciones de Envío: ${transfer.notes}`, 14, 63)
    }

    const rows = (transfer.transfer_items ?? []).map((ti, idx) => [
      String(idx + 1),
      ti.item?.code || ti.item?.barcode || '—',
      ti.item?.description || 'Artículo',
      ti.item?.unit || 'PZA',
      String(ti.quantity_sent),
      transfer.status === 'IN_TRANSIT' ? 'Pendiente' : String(ti.quantity_received),
      formatCurrency(ti.unit_cost),
      formatCurrency(ti.quantity_sent * ti.unit_cost),
    ])

    autoTable(doc, {
      startY: transfer.notes ? 68 : 62,
      head: [
        [
          '#',
          'Código',
          'Descripción del Artículo',
          'Unidad',
          'Cant. Enviada',
          'Cant. Recibida',
          'Costo Unit.',
          'Costo Total',
        ],
      ],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: [16, 185, 129], textColor: 255, fontSize: 8.5 },
      bodyStyles: { fontSize: 8.5 },
      foot: [
        [
          '',
          '',
          'TOTALES DEL TRASPASO',
          `${transfer.total_items} art.`,
          String(transfer.total_quantity_sent),
          transfer.status === 'IN_TRANSIT'
            ? '—'
            : String(transfer.total_quantity_received),
          '',
          formatCurrency(transfer.total_cost),
        ],
      ],
      footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
    })

    const finalY =
      (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 150
    const sigY = Math.min(265, finalY + 28)

    doc.setDrawColor(148, 163, 184)
    doc.line(18, sigY, 75, sigY)
    doc.line(82, sigY, 132, sigY)
    doc.line(139, sigY, 195, sigY)

    doc.setFontSize(8.5)
    doc.setTextColor(71, 85, 105)
    doc.text('Entregó (Sucursal Origen)', 26, sigY + 5)
    doc.text(transfer.sent_by_name ?? '', 26, sigY + 10)

    doc.text('Transportó / Traslado', 91, sigY + 5)

    doc.text('Recibió (Sucursal Destino)', 147, sigY + 5)
    doc.text(transfer.received_by_name ?? '', 147, sigY + 10)

    doc.save(`Traspaso_${folioStr}.pdf`)
    toast.success(`Comprobante PDF ${folioStr} descargado`)
  }

  // ── Filtering, Sorting & Pagination ──────────────────────────
  const filteredTransfers = useMemo(() => {
    return transfers.filter((t) => {
      if (directionFilter === 'INCOMING' && t.id_dest_store !== storeId) return false
      if (directionFilter === 'OUTGOING' && t.id_origin_store !== storeId) return false
      if (statusFilter !== 'ALL' && t.status !== statusFilter) return false

      if (search.trim()) {
        const q = search.toLowerCase()
        const folioStr = formatFolio(t.folio).toLowerCase()
        const origName = t.origin_store?.description?.toLowerCase() ?? ''
        const destName = t.dest_store?.description?.toLowerCase() ?? ''
        const sentBy = t.sent_by_name?.toLowerCase() ?? ''
        const notes = t.notes?.toLowerCase() ?? ''
        const matchesItem = (t.transfer_items ?? []).some(
          (ti) =>
            ti.item?.description?.toLowerCase().includes(q) ||
            ti.item?.code?.toLowerCase().includes(q) ||
            ti.item?.barcode?.toLowerCase().includes(q)
        )

        if (
          !folioStr.includes(q) &&
          !origName.includes(q) &&
          !destName.includes(q) &&
          !sentBy.includes(q) &&
          !notes.includes(q) &&
          !matchesItem
        ) {
          return false
        }
      }

      return true
    })
  }, [transfers, directionFilter, statusFilter, search, storeId])

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDirection('asc')
    }
  }

  useEffect(() => {
    setCurrentPage(1)
  }, [search, directionFilter, statusFilter])

  const sortedTransfers = useMemo(() => {
    const list = [...filteredTransfers]
    return list.sort((a, b) => {
      let aVal: string | number = ''
      let bVal: string | number = ''

      switch (sortKey) {
        case 'folio':
          aVal = a.folio
          bVal = b.folio
          break
        case 'sent_at':
          aVal = a.sent_at
          bVal = b.sent_at
          break
        case 'origin':
          aVal = (a.origin_store?.description || '').toLowerCase()
          bVal = (b.origin_store?.description || '').toLowerCase()
          break
        case 'dest':
          aVal = (a.dest_store?.description || '').toLowerCase()
          bVal = (b.dest_store?.description || '').toLowerCase()
          break
        case 'mode':
          aVal = a.transfer_mode
          bVal = b.transfer_mode
          break
        case 'units':
          aVal = a.total_quantity_sent
          bVal = b.total_quantity_sent
          break
        case 'cost':
          aVal = a.total_cost
          bVal = b.total_cost
          break
        case 'status':
          aVal = a.status
          bVal = b.status
          break
        default:
          return 0
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
  }, [filteredTransfers, sortKey, sortDirection])

  const totalPages = Math.ceil(sortedTransfers.length / pageSize) || 1
  const paginatedTransfers = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedTransfers.slice(start, start + pageSize)
  }, [sortedTransfers, currentPage, pageSize])

  // Excel Export
  const handleExportExcel = () => {
    if (sortedTransfers.length === 0) {
      toast.error('No hay traspasos para exportar')
      return
    }

    const rows = sortedTransfers.map((t) => ({
      Folio: formatFolio(t.folio),
      'Fecha Envío': formatDateTime(t.sent_at),
      'Sucursal Origen': t.origin_store?.description ?? '—',
      'Ubicación Origen': t.origin_location?.description ?? 'Almacén General',
      'Sucursal Destino': t.dest_store?.description ?? '—',
      'Ubicación Destino': t.dest_location?.description ?? 'Almacén General',
      Modalidad: t.transfer_mode === 'DIRECT' ? 'Directo' : 'En Tránsito',
      Estado:
        t.status === 'IN_TRANSIT'
          ? 'En Tránsito'
          : t.status === 'RECEIVED'
            ? 'Recibido'
            : t.status === 'PARTIAL'
              ? 'Recibido con Diferencias'
              : 'Cancelado',
      Partidas: t.total_items,
      'Unidades Enviadas': t.total_quantity_sent,
      'Unidades Recibidas': t.total_quantity_received,
      'Costo Total': t.total_cost,
      'Enviado Por': t.sent_by_name ?? '—',
      'Recibido Por': t.received_by_name ?? '—',
      'Fecha Recepción': t.received_at ? formatDateTime(t.received_at) : '—',
      Observaciones: t.notes ?? '',
    }))

    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Traspasos')
    XLSX.writeFile(
      wb,
      `Traspasos_${currentStore?.description?.replace(/\s+/g, '_') || 'Sucursal'}.xlsx`
    )
    toast.success('Archivo Excel de traspasos exportado exitosamente')
  }

  // KPIs
  const kpis = useMemo(() => {
    let incomingInTransit = 0
    let outgoingInTransit = 0
    let completedCount = 0
    let totalTransferredValue = 0

    for (const t of transfers) {
      if (t.status === 'IN_TRANSIT') {
        if (t.id_dest_store === storeId) incomingInTransit += 1
        if (t.id_origin_store === storeId) outgoingInTransit += 1
      }
      if (t.status === 'RECEIVED' || t.status === 'PARTIAL') {
        completedCount += 1
      }
      if (t.status !== 'CANCELLED') {
        totalTransferredValue += Number(t.total_cost ?? 0)
      }
    }

    return {
      incomingInTransit,
      outgoingInTransit,
      completedCount,
      totalTransferredValue,
    }
  }, [transfers, storeId])

  return (
    <div className="min-h-full sm:h-full flex-1 flex flex-col min-h-0 gap-2.5 sm:gap-3 pb-8 sm:pb-0">
      <div className="dashboard-bg" />

      {/* ── Header & Tabs ───────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shrink-0">
        <div>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-foreground flex items-center gap-2 leading-tight">
            <Truck className="text-emerald-500" size={20} />
            Traspasos entre Sucursales
          </h1>
          <p className="text-xs text-muted-foreground line-clamp-1">
            Envío y recepción de mercancía en tiempo real para{' '}
            <span className="font-semibold text-emerald-500">
              {currentStore?.description ?? 'sucursal activa'}
            </span>
          </p>
        </div>
        <InventarioTabs />
      </div>

      {/* ── KPIs Strip ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 shrink-0">
        <GlassCard
          variant={kpis.incomingInTransit > 0 ? 'amber' : 'default'}
          padding="none"
          className="p-2.5 sm:p-3 flex items-center gap-3 cursor-pointer"
          onClick={() => {
            setDirectionFilter('INCOMING')
            setStatusFilter('IN_TRANSIT')
          }}
        >
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center text-amber-400 shrink-0">
            <ArrowDownLeft size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground font-medium truncate">
              Por Recibir en Sucursal
            </p>
            <div className="flex items-baseline gap-1.5">
              <p className="text-base sm:text-lg font-bold text-foreground leading-tight">
                {kpis.incomingInTransit}
              </p>
              {kpis.incomingInTransit > 0 && (
                <span className="text-[10px] font-semibold text-amber-400">
                  Pendientes
                </span>
              )}
            </div>
          </div>
        </GlassCard>

        <GlassCard
          variant="indigo"
          padding="none"
          className="p-2.5 sm:p-3 flex items-center gap-3 cursor-pointer"
          onClick={() => {
            setDirectionFilter('OUTGOING')
            setStatusFilter('IN_TRANSIT')
          }}
        >
          <div className="w-9 h-9 rounded-xl bg-indigo-500/15 flex items-center justify-center text-indigo-400 shrink-0">
            <ArrowUpRight size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground font-medium truncate">
              Enviados en Tránsito
            </p>
            <p className="text-base sm:text-lg font-bold text-foreground leading-tight">
              {kpis.outgoingInTransit}
            </p>
          </div>
        </GlassCard>

        <GlassCard
          variant="emerald"
          padding="none"
          className="p-2.5 sm:p-3 flex items-center gap-3 cursor-pointer"
          onClick={() => {
            setDirectionFilter('ALL')
            setStatusFilter('RECEIVED')
          }}
        >
          <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-400 shrink-0">
            <PackageCheck size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground font-medium truncate">
              Traspasos Recibidos
            </p>
            <p className="text-base sm:text-lg font-bold text-foreground leading-tight">
              {kpis.completedCount}
            </p>
          </div>
        </GlassCard>

        <GlassCard padding="none" className="p-2.5 sm:p-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-teal-500/15 flex items-center justify-center text-teal-400 shrink-0">
            <Boxes size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground font-medium truncate">
              Valor Mercancía (Costo)
            </p>
            <p className="text-base sm:text-lg font-bold text-foreground leading-tight truncate">
              {formatCurrency(kpis.totalTransferredValue)}
            </p>
          </div>
        </GlassCard>
      </div>

      {/* ── Filters & Actions Toolbar ───────────────────────── */}
      <GlassCard padding="none" className="p-2.5 shrink-0">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1">
            <div className="flex-1 max-w-md">
              <GlassInput
                placeholder="Buscar por folio, sucursal, artículo o notas..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                icon={<Search size={15} />}
              />
            </div>

            {/* Direction Filter */}
            <div className="flex items-center gap-1 p-0.5 rounded-xl glass border border-border/40 w-fit">
              {(
                [
                  { id: 'ALL', label: 'Todos' },
                  { id: 'INCOMING', label: 'Entrantes' },
                  { id: 'OUTGOING', label: 'Salientes' },
                ] as const
              ).map((dir) => (
                <button
                  key={dir.id}
                  type="button"
                  onClick={() => setDirectionFilter(dir.id)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer',
                    directionFilter === dir.id
                      ? 'bg-emerald-500 text-white shadow-sm font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {dir.label}
                </button>
              ))}
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filtrar por estado de traspaso"
              className="glass-input px-3 py-1.5 text-xs font-medium text-foreground bg-transparent outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900 text-white">
                Estado: Todos
              </option>
              <option value="IN_TRANSIT" className="bg-slate-900 text-white">
                En Tránsito
              </option>
              <option value="RECEIVED" className="bg-slate-900 text-white">
                Recibidos Completos
              </option>
              <option value="PARTIAL" className="bg-slate-900 text-white">
                Recibidos con Diferencias
              </option>
              <option value="CANCELLED" className="bg-slate-900 text-white">
                Cancelados
              </option>
            </select>
          </div>

          <div className="flex items-center gap-2 self-end lg:self-auto">
            <GlassButton
              variant="ghost"
              size="sm"
              onClick={() => fetchTransfersData()}
              disabled={loading}
              title="Actualizar traspasos"
            >
              <RefreshCw
                size={14}
                className={loading ? 'animate-spin text-emerald-400' : ''}
              />
            </GlassButton>

            <GlassButton
              variant="secondary"
              size="sm"
              icon={<FileSpreadsheet size={15} />}
              onClick={handleExportExcel}
            >
              Excel
            </GlassButton>

            <GlassButton
              variant="primary"
              size="sm"
              icon={<Plus size={15} />}
              onClick={handleOpenCreateModal}
            >
              Nuevo Traspaso
            </GlassButton>
          </div>
        </div>
      </GlassCard>

      {/* ── Transfers Data Table ────────────────────────────── */}
      <GlassCard
        padding="none"
        className="overflow-hidden shadow-xl flex-1 min-h-[460px] sm:min-h-0 flex flex-col"
      >
        <div
          tabIndex={0}
          role="region"
          aria-label="Tabla de traspasos de mercancía entre sucursales"
          className="overflow-x-auto overflow-y-auto flex-1 min-h-[360px] sm:min-h-0 scroll-modern focus:outline-none"
        >
          <table className="w-full min-w-[850px] sm:min-w-full text-left text-sm border-separate border-spacing-0">
            <thead className="sticky top-0 z-20">
              <tr className="glass-table-header border-b border-border/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <TableColumnHeader
                  title="Folio / Fecha"
                  sortKey="folio"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                />
                <TableColumnHeader
                  title="Flujo"
                  sortKey="sent_at"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                />
                <TableColumnHeader
                  title="Sucursal Origen"
                  sortKey="origin"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                />
                <TableColumnHeader
                  title="Sucursal Destino"
                  sortKey="dest"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                />
                <TableColumnHeader
                  title="Modalidad"
                  sortKey="mode"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                />
                <TableColumnHeader
                  title="Mercancía"
                  sortKey="units"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  align="right"
                />
                <TableColumnHeader
                  title="Costo Total"
                  sortKey="cost"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  align="right"
                />
                <TableColumnHeader
                  title="Estado"
                  sortKey="status"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                />
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {loading && transfers.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-12 text-center text-muted-foreground"
                  >
                    <RefreshCw
                      size={24}
                      className="animate-spin text-emerald-500 mx-auto mb-2"
                    />
                    Cargando traspasos entre sucursales...
                  </td>
                </tr>
              ) : paginatedTransfers.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-12 text-center text-muted-foreground"
                  >
                    <Truck
                      size={32}
                      className="mx-auto mb-2 text-muted-foreground/40"
                    />
                    <p className="text-base font-medium">
                      No se encontraron traspasos registrados
                    </p>
                    <p className="text-xs text-muted-foreground/80 mt-1">
                      Crea un nuevo traspaso para enviar mercancía a otra sucursal.
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedTransfers.map((t) => {
                  const isIncoming = t.id_dest_store === storeId
                  const canReceiveHere =
                    t.status === 'IN_TRANSIT' &&
                    (isIncoming || currentProfile?.role === 'ADMIN')

                  const actionItems: TableActionItem[] = [
                    {
                      label: 'Ver detalle y partidas',
                      icon: <Eye size={15} />,
                      onClick: () => setDetailTransfer(t),
                    },
                    ...(canReceiveHere
                      ? [
                          {
                            label: 'Recibir mercancía',
                            icon: <PackageCheck size={15} />,
                            variant: 'primary' as const,
                            onClick: () => handleOpenReceiveModal(t),
                          },
                        ]
                      : []),
                    {
                      label: 'Descargar comprobante PDF',
                      icon: <FileText size={15} />,
                      variant: 'indigo' as const,
                      onClick: () => handleExportTransferPDF(t),
                    },
                    ...(t.status === 'IN_TRANSIT' ||
                    ((t.status === 'RECEIVED' || t.status === 'PARTIAL') &&
                      canUseDirectMode)
                      ? [
                          {
                            label:
                              t.status === 'IN_TRANSIT'
                                ? 'Cancelar envío (Reintegrar stock)'
                                : 'Revertir y cancelar traspaso',
                            icon: <XCircle size={15} />,
                            variant: 'warning' as const,
                            separatorBefore: true,
                            onClick: () => {
                              setCancelTarget(t)
                              setCancelReason('')
                            },
                          },
                        ]
                      : []),
                    ...(t.status === 'CANCELLED' && canDeleteCancelled
                      ? [
                          {
                            label: 'Eliminar registro',
                            icon: <Trash2 size={15} />,
                            variant: 'danger' as const,
                            separatorBefore: true,
                            onClick: () => setDeleteTarget(t),
                          },
                        ]
                      : []),
                  ]

                  return (
                    <tr
                      key={t.id_transfer}
                      className="hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-mono font-bold text-foreground text-xs sm:text-sm">
                            {formatFolio(t.folio)}
                          </span>
                          <span className="text-[11px] text-muted-foreground font-mono">
                            {formatDateTime(t.sent_at)}
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        {isIncoming ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            <ArrowDownLeft size={12} />
                            Entrante
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                            <ArrowUpRight size={12} />
                            Saliente
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-semibold text-foreground text-xs sm:text-sm">
                            {t.origin_store?.description ?? 'Sucursal Origen'}
                          </span>
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <MapPin size={10} />
                            {t.origin_location?.description ?? 'Almacén General'}
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-semibold text-foreground text-xs sm:text-sm">
                            {t.dest_store?.description ?? 'Sucursal Destino'}
                          </span>
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <MapPin size={10} />
                            {t.dest_location?.description ?? 'Almacén General'}
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        {t.transfer_mode === 'DIRECT' ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-400 font-medium">
                            <Zap size={12} />
                            Directo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-400 font-medium">
                            <Clock size={12} />
                            En Tránsito
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-col items-end font-mono">
                          <span className="text-xs sm:text-sm font-bold text-foreground">
                            {t.status === 'IN_TRANSIT'
                              ? `${t.total_quantity_sent} u.`
                              : `${t.total_quantity_received}/${t.total_quantity_sent} u.`}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {t.total_items}{' '}
                            {t.total_items === 1 ? 'partida' : 'partidas'}
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-right font-mono font-semibold text-foreground">
                        {formatCurrency(t.total_cost)}
                      </td>

                      <td className="px-4 py-3">
                        <StatusBadge
                          status={t.status}
                          customLabel={
                            t.status === 'IN_TRANSIT'
                              ? 'En Tránsito'
                              : t.status === 'RECEIVED'
                                ? 'Recibido'
                                : t.status === 'PARTIAL'
                                  ? 'Con Diferencia'
                                  : 'Cancelado'
                          }
                        />
                      </td>

                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {canReceiveHere && (
                            <GlassButton
                              variant="primary"
                              size="sm"
                              className="h-7 px-2.5 text-xs"
                              icon={<PackageCheck size={13} />}
                              onClick={() => handleOpenReceiveModal(t)}
                            >
                              Recibir
                            </GlassButton>
                          )}
                          <TableActionMenu
                            items={actionItems}
                            align="end"
                            triggerAriaLabel={`Acciones para traspaso ${formatFolio(t.folio)}`}
                          />
                        </div>
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
          totalItems={sortedTransfers.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          realtimeLabel="Traspasos en tiempo real"
        />
      </GlassCard>

      {/* ══════════════════════════════════════════════════════════
          MODAL 1: NUEVO TRASPASO ENTRE SUCURSALES
         ══════════════════════════════════════════════════════════ */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="text-emerald-500" size={20} />
              Nuevo Traspaso de Mercancía entre Sucursales
            </DialogTitle>
            <DialogDescription>
              Selecciona la modalidad, las ubicaciones de salida y entrada, y escanea o
              busca los artículos a enviar.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            {/* 1. Selector de Modalidad */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setTransferMode('TRANSIT')}
                className={cn(
                  'p-3 rounded-2xl border text-left transition-all cursor-pointer flex items-start gap-3',
                  transferMode === 'TRANSIT'
                    ? 'border-emerald-500/60 bg-emerald-500/10 shadow-sm'
                    : 'border-border/50 hover:border-border bg-white/[0.02]'
                )}
              >
                <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400 shrink-0 mt-0.5">
                  <Clock size={18} />
                </div>
                <div>
                  <p className="text-xs sm:text-sm font-bold text-foreground">
                    Envío con Recepción en Destino (En Tránsito)
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Descuenta el stock de esta sucursal al enviar y queda en tránsito hasta
                    que la sucursal destino confirme la recepción.
                  </p>
                </div>
              </button>

              <button
                type="button"
                disabled={!canUseDirectMode}
                onClick={() => {
                  if (canUseDirectMode) setTransferMode('DIRECT')
                }}
                className={cn(
                  'p-3 rounded-2xl border text-left transition-all flex items-start gap-3',
                  !canUseDirectMode
                    ? 'opacity-50 cursor-not-allowed border-border/30 bg-white/[0.01]'
                    : transferMode === 'DIRECT'
                      ? 'border-emerald-500/60 bg-emerald-500/10 shadow-sm cursor-pointer'
                      : 'border-border/50 hover:border-border bg-white/[0.02] cursor-pointer'
                )}
              >
                <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400 shrink-0 mt-0.5">
                  {canUseDirectMode ? <Zap size={18} /> : <Lock size={18} />}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs sm:text-sm font-bold text-foreground">
                      Traspaso Directo Inmediato (1 paso)
                    </p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 font-semibold">
                      ADMIN / GERENTE
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Descuenta en origen y suma automáticamente en la ubicación destino de
                    forma inmediata sin esperar recepción.
                  </p>
                </div>
              </button>
            </div>

            {/* 2. Sucursal y Ubicación Origen -> Destino */}
            <div className="grid grid-cols-1 md:grid-cols-11 gap-3 items-center p-3.5 rounded-2xl glass border border-border/50">
              {/* Origen */}
              <div className="md:col-span-5 flex flex-col gap-2">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-indigo-400">
                  <StoreIcon size={13} />
                  1. Sucursal y Ubicación de Salida (Origen)
                </div>
                <div className="glass-input px-3 py-2 text-sm font-semibold text-foreground opacity-90">
                  {currentStore?.description ?? 'Sucursal Activa'}
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground font-medium block mb-1">
                    Ubicación / Almacén de Salida
                  </label>
                  <select
                    value={selectedOriginLoc}
                    onChange={(e) => setSelectedOriginLoc(e.target.value)}
                    className="glass-input w-full px-3 py-2 text-xs sm:text-sm text-foreground bg-transparent outline-none cursor-pointer"
                  >
                    {originStoreLocations.length === 0 ? (
                      <option value="" className="bg-slate-900 text-white">
                        Almacén General (Por defecto)
                      </option>
                    ) : (
                      originStoreLocations.map((loc) => (
                        <option
                          key={loc.id_location}
                          value={loc.id_location}
                          className="bg-slate-900 text-white"
                        >
                          {loc.description}
                          {loc.is_selected ? ' (Principal)' : ''}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              {/* Arrow */}
              <div className="md:col-span-1 flex justify-center">
                <div className="w-8 h-8 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
                  <ArrowRight size={16} />
                </div>
              </div>

              {/* Destino */}
              <div className="md:col-span-5 flex flex-col gap-2">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-400">
                  <StoreIcon size={13} />
                  2. Sucursal y Ubicación de Entrada (Destino)
                </div>
                <select
                  value={selectedDestStore}
                  onChange={(e) => setSelectedDestStore(e.target.value)}
                  className="glass-input w-full px-3 py-2 text-sm font-semibold text-foreground bg-transparent outline-none cursor-pointer"
                >
                  <option value="" disabled className="bg-slate-900 text-white">
                    Selecciona sucursal destino...
                  </option>
                  {destinationStores.map((st) => (
                    <option
                      key={st.id_store}
                      value={st.id_store}
                      className="bg-slate-900 text-white"
                    >
                      {st.description}
                    </option>
                  ))}
                </select>
                <div>
                  <label className="text-[11px] text-muted-foreground font-medium block mb-1">
                    Ubicación / Almacén de Entrada en Destino
                  </label>
                  <select
                    value={selectedDestLoc}
                    onChange={(e) => setSelectedDestLoc(e.target.value)}
                    className="glass-input w-full px-3 py-2 text-xs sm:text-sm text-foreground bg-transparent outline-none cursor-pointer"
                  >
                    {destStoreLocations.length === 0 ? (
                      <option value="" className="bg-slate-900 text-white">
                        Almacén General (Se asignará automáticamente)
                      </option>
                    ) : (
                      destStoreLocations.map((loc) => (
                        <option
                          key={loc.id_location}
                          value={loc.id_location}
                          className="bg-slate-900 text-white"
                        >
                          {loc.description}
                          {loc.is_selected ? ' (Principal)' : ''}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>
            </div>

            {/* 3. Barra de Escáner de Código de Barras y Buscador de Artículos */}
            <div className="p-3.5 rounded-2xl glass border border-border/50 flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row sm:items-end gap-2">
                <div className="flex-1">
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    Escáner de Código de Barras / Código de Artículo
                  </label>
                  <div className="glass-input flex items-center px-3 py-1.5">
                    <ScanLine size={16} className="text-emerald-400 mr-2 shrink-0" />
                    <input
                      ref={barcodeInputRef}
                      type="text"
                      inputMode="text"
                      autoComplete="off"
                      placeholder="Escanea o escribe el código de barras y presiona Enter..."
                      value={barcodeInput}
                      onChange={(e) => setBarcodeInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleBarcodeScanSubmit()
                        }
                      }}
                      className="flex-1 bg-transparent text-sm text-foreground outline-none"
                    />
                  </div>
                </div>

                <div className="w-24">
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    Cantidad
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={scanQty}
                    onChange={(e) => setScanQty(Math.max(1, Number(e.target.value) || 1))}
                    className="glass-input w-full px-3 py-2 text-sm font-mono font-bold text-center text-foreground bg-transparent outline-none"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <GlassButton
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => handleBarcodeScanSubmit()}
                  >
                    Agregar
                  </GlassButton>
                  <GlassButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    icon={<Camera size={15} />}
                    onClick={startCamera}
                    title="Escanear con cámara del dispositivo"
                  >
                    Cámara
                  </GlassButton>
                  <GlassButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    icon={<Search size={15} />}
                    onClick={() => setCatalogPickerOpen((prev) => !prev)}
                  >
                    {catalogPickerOpen ? 'Ocultar Buscador' : 'Buscar Artículo'}
                  </GlassButton>
                </div>
              </div>

              {/* Buscador interactivo desplegable con existencias */}
              <AnimatePresence initial={false}>
                {catalogPickerOpen && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden border-t border-border/40 pt-3 flex flex-col gap-2"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex-1">
                        <GlassInput
                          placeholder="Buscar artículo por descripción, código o código de barras..."
                          value={itemSearchQuery}
                          onChange={(e) => setItemSearchQuery(e.target.value)}
                          icon={<Search size={14} />}
                        />
                      </div>
                      <label className="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={onlyItemsWithStock}
                          onChange={(e) => setOnlyItemsWithStock(e.target.checked)}
                          className="rounded border-border text-emerald-500 focus:ring-emerald-500"
                        />
                        Mostrar solo artículos con existencia disponible
                      </label>
                    </div>

                    <div className="max-h-48 overflow-y-auto scroll-modern rounded-xl border border-border/40 divide-y divide-border/20">
                      {filteredCatalogForPicker.length === 0 ? (
                        <div className="p-4 text-center text-xs text-muted-foreground">
                          No se encontraron artículos con los criterios seleccionados.
                        </div>
                      ) : (
                        filteredCatalogForPicker.map((it) => {
                          const avail = stockByItemInOriginLoc.get(it.id_item) ?? 0
                          const inDraft =
                            draftLines.find((l) => l.item.id_item === it.id_item)
                              ?.quantity ?? 0

                          return (
                            <div
                              key={it.id_item}
                              className="px-3 py-2 flex items-center justify-between gap-2 hover:bg-white/[0.03] transition-colors"
                            >
                              <div className="min-w-0">
                                <p className="text-xs sm:text-sm font-semibold text-foreground truncate">
                                  {it.description}
                                </p>
                                <p className="text-[11px] text-muted-foreground font-mono">
                                  {it.code || it.barcode || 'S/C'} · Costo:{' '}
                                  {formatCurrency(it.cost ?? 0)}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span
                                  className={cn(
                                    'px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold',
                                    avail > 0
                                      ? 'bg-emerald-500/15 text-emerald-400'
                                      : 'bg-rose-500/15 text-rose-400'
                                  )}
                                >
                                  Disp: {avail} {it.unit || 'PZA'}
                                </span>
                                {inDraft > 0 && (
                                  <span className="px-2 py-0.5 rounded-full text-[11px] font-mono bg-indigo-500/15 text-indigo-400">
                                    En lista: {inDraft}
                                  </span>
                                )}
                                <GlassButton
                                  type="button"
                                  variant="primary"
                                  size="sm"
                                  disabled={avail <= inDraft}
                                  className="h-7 px-2.5 text-xs"
                                  onClick={() => addItemToDraft(it, 1)}
                                >
                                  + Agregar
                                </GlassButton>
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* 4. Tabla de Partidas a Traspasar */}
            <div className="rounded-2xl border border-border/50 overflow-hidden">
              <div className="max-h-64 overflow-y-auto scroll-modern">
                <table className="w-full text-left text-xs sm:text-sm border-separate border-spacing-0">
                  <thead className="sticky top-0 z-10">
                    <tr className="glass-table-header text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <th className="px-3 py-2.5">Artículo</th>
                      <th className="px-3 py-2.5 text-right">Stock Origen</th>
                      <th className="px-3 py-2.5 text-center">Cant. a Enviar</th>
                      <th className="px-3 py-2.5 text-right">Restante</th>
                      <th className="px-3 py-2.5 text-right">Subtotal Costo</th>
                      <th className="px-3 py-2.5">Nota</th>
                      <th className="px-3 py-2.5 text-right">Quitar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {draftLines.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-4 py-8 text-center text-xs text-muted-foreground"
                        >
                          Escanea un código de barras o usa el botón &ldquo;Buscar
                          Artículo&rdquo; para agregar mercancía al traspaso.
                        </td>
                      </tr>
                    ) : (
                      draftLines.map((line) => {
                        const remaining = line.availableStock - line.quantity
                        const isOver = line.quantity > line.availableStock

                        return (
                          <tr key={line.item.id_item} className="hover:bg-white/[0.02]">
                            <td className="px-3 py-2">
                              <p className="font-semibold text-foreground">
                                {line.item.description}
                              </p>
                              <p className="text-[11px] text-muted-foreground font-mono">
                                {line.item.code || line.item.barcode || '—'}
                              </p>
                            </td>

                            <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                              {line.availableStock} {line.item.unit || 'PZA'}
                            </td>

                            <td className="px-3 py-2">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDraftLines((prev) =>
                                      prev.map((l) =>
                                        l.item.id_item === line.item.id_item
                                          ? { ...l, quantity: Math.max(1, l.quantity - 1) }
                                          : l
                                      )
                                    )
                                  }
                                  className="w-6 h-6 rounded-lg glass flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"
                                >
                                  <Minus size={12} />
                                </button>
                                <input
                                  type="number"
                                  min={1}
                                  max={line.availableStock}
                                  value={line.quantity}
                                  onChange={(e) => {
                                    const val = Math.max(1, Number(e.target.value) || 1)
                                    setDraftLines((prev) =>
                                      prev.map((l) =>
                                        l.item.id_item === line.item.id_item
                                          ? {
                                              ...l,
                                              quantity: Math.min(val, l.availableStock),
                                            }
                                          : l
                                      )
                                    )
                                  }}
                                  className={cn(
                                    'w-16 glass-input py-1 text-center font-mono font-bold text-xs outline-none',
                                    isOver && 'border-rose-500 text-rose-400'
                                  )}
                                />
                                <button
                                  type="button"
                                  disabled={line.quantity >= line.availableStock}
                                  onClick={() =>
                                    setDraftLines((prev) =>
                                      prev.map((l) =>
                                        l.item.id_item === line.item.id_item
                                          ? {
                                              ...l,
                                              quantity: Math.min(
                                                l.availableStock,
                                                l.quantity + 1
                                              ),
                                            }
                                          : l
                                      )
                                    )
                                  }
                                  className="w-6 h-6 rounded-lg glass flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40 cursor-pointer"
                                >
                                  <Plus size={12} />
                                </button>
                              </div>
                            </td>

                            <td
                              className={cn(
                                'px-3 py-2 text-right font-mono font-semibold',
                                remaining < 0 ? 'text-rose-400' : 'text-emerald-400'
                              )}
                            >
                              {remaining}
                            </td>

                            <td className="px-3 py-2 text-right font-mono text-foreground">
                              {formatCurrency(line.quantity * line.unitCost)}
                            </td>

                            <td className="px-3 py-2">
                              <input
                                type="text"
                                placeholder="Opcional..."
                                value={line.notes}
                                onChange={(e) =>
                                  setDraftLines((prev) =>
                                    prev.map((l) =>
                                      l.item.id_item === line.item.id_item
                                        ? { ...l, notes: e.target.value }
                                        : l
                                    )
                                  )
                                }
                                className="glass-input px-2 py-1 text-xs w-28 bg-transparent outline-none"
                              />
                            </td>

                            <td className="px-3 py-2 text-right">
                              <button
                                type="button"
                                onClick={() =>
                                  setDraftLines((prev) =>
                                    prev.filter(
                                      (l) => l.item.id_item !== line.item.id_item
                                    )
                                  )
                                }
                                className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/15 transition-colors cursor-pointer"
                                title="Quitar partida"
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 5. Notas generales y Resumen */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
              <div className="sm:col-span-2">
                <GlassInput
                  label="Observaciones del Traspaso (Opcional)"
                  placeholder="Ej. Chofer responsable, número de guía o motivo del traspaso..."
                  value={transferNotes}
                  onChange={(e) => setTransferNotes(e.target.value)}
                />
              </div>
              <div className="p-3 rounded-2xl glass border border-emerald-500/30 flex flex-col gap-1 text-right">
                <span className="text-[11px] text-muted-foreground">
                  Partidas: <strong>{draftTotals.totalItems}</strong> · Unidades:{' '}
                  <strong>{draftTotals.totalUnits}</strong>
                </span>
                <span className="text-base font-bold text-emerald-400 font-mono">
                  Costo Total: {formatCurrency(draftTotals.totalCost)}
                </span>
              </div>
            </div>
          </DialogBody>

          <DialogFooter>
            <GlassButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setCreateOpen(false)}
              disabled={submittingCreate}
              className="w-full sm:w-auto"
            >
              Cancelar
            </GlassButton>
            <GlassButton
              type="button"
              variant="primary"
              size="sm"
              loading={submittingCreate}
              disabled={draftLines.length === 0 || !selectedDestStore}
              icon={transferMode === 'DIRECT' ? <Zap size={15} /> : <Truck size={15} />}
              onClick={handleCreateTransferSubmit}
              className="w-full sm:w-auto"
            >
              {transferMode === 'DIRECT'
                ? 'Aplicar Traspaso Directo'
                : 'Confirmar Envío de Mercancía'}
            </GlassButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════
          MODAL 2: RECEPCIÓN DE MERCANCÍA EN SUCURSAL DESTINO
         ══════════════════════════════════════════════════════════ */}
      <Dialog
        open={Boolean(receiveTarget)}
        onOpenChange={(open) => {
          if (!open) setReceiveTarget(null)
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackageCheck className="text-emerald-500" size={20} />
              Recibir Traspaso{' '}
              {receiveTarget ? formatFolio(receiveTarget.folio) : ''}
            </DialogTitle>
            <DialogDescription>
              Verifica las cantidades físicas recibidas de{' '}
              <strong>
                {receiveTarget?.origin_store?.description ?? 'Sucursal Origen'}
              </strong>{' '}
              y selecciona la ubicación de entrada en{' '}
              <strong>
                {receiveTarget?.dest_store?.description ?? 'Sucursal Destino'}
              </strong>
              .
            </DialogDescription>
          </DialogHeader>

          {receiveTarget && (
            <DialogBody className="space-y-4">
              {/* Ubicación de recepción */}
              <div className="p-3 rounded-2xl glass border border-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <MapPin size={14} className="text-emerald-400" />
                    Ubicación / Almacén de Entrada en{' '}
                    {receiveTarget.dest_store?.description ?? 'Destino'}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Las unidades confirmadas se sumarán inmediatamente a esta ubicación.
                  </p>
                </div>
                <select
                  value={receiveDestLoc}
                  onChange={(e) => setReceiveDestLoc(e.target.value)}
                  className="glass-input px-3 py-2 text-xs sm:text-sm font-semibold text-foreground bg-transparent outline-none cursor-pointer min-w-[210px]"
                >
                  {locations
                    .filter(
                      (l) =>
                        l.id_store === receiveTarget.id_dest_store && l.status === 'A'
                    )
                    .map((loc) => (
                      <option
                        key={loc.id_location}
                        value={loc.id_location}
                        className="bg-slate-900 text-white"
                      >
                        {loc.description}
                        {loc.is_selected ? ' (Principal)' : ''}
                      </option>
                    ))}
                </select>
              </div>

              {/* Tabla de verificación de partidas */}
              <div className="rounded-2xl border border-border/50 overflow-hidden">
                <div className="max-h-64 overflow-y-auto scroll-modern">
                  <table className="w-full text-left text-xs sm:text-sm border-separate border-spacing-0">
                    <thead className="sticky top-0 z-10">
                      <tr className="glass-table-header text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        <th className="px-3 py-2.5">Artículo</th>
                        <th className="px-3 py-2.5 text-right">Cant. Enviada</th>
                        <th className="px-3 py-2.5 text-center">Cant. Recibida</th>
                        <th className="px-3 py-2.5 text-right">Diferencia</th>
                        <th className="px-3 py-2.5">Observación</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/20">
                      {receiveLines.map((line) => {
                        const diff = line.quantity_received - line.quantity_sent
                        return (
                          <tr key={line.id_item} className="hover:bg-white/[0.02]">
                            <td className="px-3 py-2">
                              <p className="font-semibold text-foreground">
                                {line.itemDescription}
                              </p>
                              <p className="text-[11px] text-muted-foreground font-mono">
                                {line.itemCode}
                              </p>
                            </td>

                            <td className="px-3 py-2 text-right font-mono font-bold text-foreground">
                              {line.quantity_sent} {line.unit}
                            </td>

                            <td className="px-3 py-2 text-center">
                              <input
                                type="number"
                                min={0}
                                max={line.quantity_sent}
                                value={line.quantity_received}
                                onChange={(e) => {
                                  const val = Math.max(
                                    0,
                                    Math.min(
                                      line.quantity_sent,
                                      Math.round(Number(e.target.value) || 0)
                                    )
                                  )
                                  setReceiveLines((prev) =>
                                    prev.map((l) =>
                                      l.id_item === line.id_item
                                        ? { ...l, quantity_received: val }
                                        : l
                                    )
                                  )
                                }}
                                className="w-20 glass-input py-1 text-center font-mono font-bold text-xs outline-none"
                              />
                            </td>

                            <td
                              className={cn(
                                'px-3 py-2 text-right font-mono font-bold',
                                diff === 0 ? 'text-emerald-400' : 'text-amber-400'
                              )}
                            >
                              {diff === 0 ? 'Completo' : `${diff}`}
                            </td>

                            <td className="px-3 py-2">
                              <input
                                type="text"
                                placeholder="Nota..."
                                value={line.notes}
                                onChange={(e) =>
                                  setReceiveLines((prev) =>
                                    prev.map((l) =>
                                      l.id_item === line.id_item
                                        ? { ...l, notes: e.target.value }
                                        : l
                                    )
                                  )
                                }
                                className="glass-input px-2 py-1 text-xs w-full bg-transparent outline-none"
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Discrepancy resolution if received < sent */}
              {receiveHasDiscrepancy && (
                <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
                    <AlertTriangle size={15} />
                    Se detectaron diferencias entre la cantidad enviada y la recibida
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label
                      className={cn(
                        'p-2.5 rounded-xl border text-xs cursor-pointer flex items-start gap-2',
                        discrepancyResolution === 'RETURN_TO_ORIGIN'
                          ? 'border-emerald-500/60 bg-emerald-500/10 text-foreground font-semibold'
                          : 'border-border/40 text-muted-foreground'
                      )}
                    >
                      <input
                        type="radio"
                        name="discrepancyResolution"
                        checked={discrepancyResolution === 'RETURN_TO_ORIGIN'}
                        onChange={() => setDiscrepancyResolution('RETURN_TO_ORIGIN')}
                        className="mt-0.5"
                      />
                      <span>
                        Devolver unidades no recibidas automáticamente al stock de la
                        sucursal origen
                      </span>
                    </label>
                    <label
                      className={cn(
                        'p-2.5 rounded-xl border text-xs cursor-pointer flex items-start gap-2',
                        discrepancyResolution === 'REGISTER_DISCREPANCY'
                          ? 'border-amber-500/60 bg-amber-500/10 text-foreground font-semibold'
                          : 'border-border/40 text-muted-foreground'
                      )}
                    >
                      <input
                        type="radio"
                        name="discrepancyResolution"
                        checked={discrepancyResolution === 'REGISTER_DISCREPANCY'}
                        onChange={() => setDiscrepancyResolution('REGISTER_DISCREPANCY')}
                        className="mt-0.5"
                      />
                      <span>
                        Registrar como faltante en tránsito (no devolver a sucursal
                        origen)
                      </span>
                    </label>
                  </div>
                </div>
              )}

              <GlassInput
                label="Observaciones de Recepción (Opcional)"
                placeholder="Ej. Mercancía recibida en buen estado / comentarios de recepción..."
                value={receptionNotes}
                onChange={(e) => setReceptionNotes(e.target.value)}
              />
            </DialogBody>
          )}

          <DialogFooter>
            <GlassButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setReceiveTarget(null)}
              disabled={submittingReceive}
              className="w-full sm:w-auto"
            >
              Cancelar
            </GlassButton>
            <GlassButton
              type="button"
              variant="primary"
              size="sm"
              loading={submittingReceive}
              icon={<CheckCircle2 size={15} />}
              onClick={handleConfirmReceive}
              className="w-full sm:w-auto"
            >
              Confirmar Recepción y Sumar Stock
            </GlassButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════
          MODAL 3: DETALLE COMPLETO DEL TRASPASO
         ══════════════════════════════════════════════════════════ */}
      <Dialog
        open={Boolean(detailTransfer)}
        onOpenChange={(open) => {
          if (!open) setDetailTransfer(null)
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between pr-6">
              <span className="flex items-center gap-2">
                <FileText className="text-emerald-500" size={19} />
                Detalle de Traspaso{' '}
                {detailTransfer ? formatFolio(detailTransfer.folio) : ''}
              </span>
              {detailTransfer && (
                <StatusBadge
                  status={detailTransfer.status}
                  customLabel={
                    detailTransfer.status === 'IN_TRANSIT'
                      ? 'En Tránsito'
                      : detailTransfer.status === 'RECEIVED'
                        ? 'Recibido'
                        : detailTransfer.status === 'PARTIAL'
                          ? 'Con Diferencia'
                          : 'Cancelado'
                  }
                />
              )}
            </DialogTitle>
            <DialogDescription>
              Información de origen, destino, responsables y desglose de artículos.
            </DialogDescription>
          </DialogHeader>

          {detailTransfer && (
            <DialogBody className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-2xl glass border border-border/50">
                  <p className="text-[11px] font-bold uppercase text-indigo-400">
                    Sucursal de Origen (Salida)
                  </p>
                  <p className="text-sm font-bold text-foreground mt-0.5">
                    {detailTransfer.origin_store?.description ?? 'Sucursal Origen'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Ubicación:{' '}
                    {detailTransfer.origin_location?.description ?? 'Almacén General'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Enviado por: <strong>{detailTransfer.sent_by_name ?? '—'}</strong>
                  </p>
                  <p className="text-[11px] text-muted-foreground font-mono">
                    {formatDateTime(detailTransfer.sent_at)}
                  </p>
                </div>

                <div className="p-3 rounded-2xl glass border border-border/50">
                  <p className="text-[11px] font-bold uppercase text-emerald-400">
                    Sucursal de Destino (Entrada)
                  </p>
                  <p className="text-sm font-bold text-foreground mt-0.5">
                    {detailTransfer.dest_store?.description ?? 'Sucursal Destino'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Ubicación:{' '}
                    {detailTransfer.dest_location?.description ?? 'Almacén General'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Recibido por:{' '}
                    <strong>{detailTransfer.received_by_name ?? 'Pendiente'}</strong>
                  </p>
                  <p className="text-[11px] text-muted-foreground font-mono">
                    {detailTransfer.received_at
                      ? formatDateTime(detailTransfer.received_at)
                      : 'En espera de recepción'}
                  </p>
                </div>
              </div>

              {(detailTransfer.notes ||
                detailTransfer.reception_notes ||
                detailTransfer.cancellation_reason) && (
                <div className="p-3 rounded-2xl glass border border-border/40 text-xs flex flex-col gap-1">
                  {detailTransfer.notes && (
                    <p>
                      <span className="font-semibold text-muted-foreground">
                        Notas de envío:{' '}
                      </span>
                      {detailTransfer.notes}
                    </p>
                  )}
                  {detailTransfer.reception_notes && (
                    <p>
                      <span className="font-semibold text-emerald-400">
                        Notas de recepción:{' '}
                      </span>
                      {detailTransfer.reception_notes}
                    </p>
                  )}
                  {detailTransfer.cancellation_reason && (
                    <p>
                      <span className="font-semibold text-rose-400">
                        Motivo de cancelación ({detailTransfer.cancelled_by_name ?? '—'}):{' '}
                      </span>
                      {detailTransfer.cancellation_reason}
                    </p>
                  )}
                </div>
              )}

              <div className="rounded-2xl border border-border/50 overflow-hidden">
                <div className="max-h-64 overflow-y-auto scroll-modern">
                  <table className="w-full text-left text-xs sm:text-sm border-separate border-spacing-0">
                    <thead className="sticky top-0 z-10">
                      <tr className="glass-table-header text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        <th className="px-3 py-2.5">Artículo</th>
                        <th className="px-3 py-2.5 text-right">Enviado</th>
                        <th className="px-3 py-2.5 text-right">Recibido</th>
                        <th className="px-3 py-2.5 text-right">Costo Unit.</th>
                        <th className="px-3 py-2.5 text-right">Total Costo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/20">
                      {(detailTransfer.transfer_items ?? []).map((ti) => (
                        <tr key={ti.id_transfer_item}>
                          <td className="px-3 py-2">
                            <p className="font-semibold text-foreground">
                              {ti.item?.description ?? 'Artículo'}
                            </p>
                            <p className="text-[11px] text-muted-foreground font-mono">
                              {ti.item?.code || ti.item?.barcode || '—'}
                              {ti.notes ? ` · ${ti.notes}` : ''}
                            </p>
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-bold">
                            {ti.quantity_sent} {ti.item?.unit || 'PZA'}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-emerald-400">
                            {detailTransfer.status === 'IN_TRANSIT'
                              ? 'Pendiente'
                              : `${ti.quantity_received} ${ti.item?.unit || 'PZA'}`}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                            {formatCurrency(ti.unit_cost)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-semibold text-foreground">
                            {formatCurrency(ti.quantity_sent * ti.unit_cost)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </DialogBody>
          )}

          <DialogFooter>
            {detailTransfer && (
              <GlassButton
                type="button"
                variant="secondary"
                size="sm"
                icon={<FileText size={15} />}
                onClick={() => handleExportTransferPDF(detailTransfer)}
                className="w-full sm:w-auto"
              >
                Descargar Comprobante PDF
              </GlassButton>
            )}
            <GlassButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setDetailTransfer(null)}
              className="w-full sm:w-auto"
            >
              Cerrar
            </GlassButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════
          MODAL 4: ESCÁNER DE CÁMARA
         ══════════════════════════════════════════════════════════ */}
      <Dialog
        open={cameraModalOpen}
        onOpenChange={(open) => {
          if (!open) stopCamera()
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="text-emerald-500" size={18} />
              Escanear Código de Barras con Cámara
            </DialogTitle>
            <DialogDescription>
              Apunta la cámara hacia el código de barras del producto para agregarlo al
              traspaso.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-video border border-border/50">
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                playsInline
                muted
              />
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-3/4 h-24 border-2 border-emerald-400/80 rounded-xl shadow-[0_0_25px_rgba(16,185,129,0.35)]" />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <GlassButton
              type="button"
              variant="ghost"
              size="sm"
              icon={<X size={14} />}
              onClick={stopCamera}
              className="w-full sm:w-auto"
            >
              Cerrar Cámara
            </GlassButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════
          MODAL 5: CANCELACIÓN DE TRASPASO
         ══════════════════════════════════════════════════════════ */}
      <Dialog
        open={Boolean(cancelTarget)}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-400">
              <AlertTriangle size={18} />
              Cancelar Traspaso {cancelTarget ? formatFolio(cancelTarget.folio) : ''}
            </DialogTitle>
            <DialogDescription>
              Al cancelar este traspaso, las unidades se reintegrarán automáticamente al
              stock de la sucursal de origen y quedará registrado en el Kardex.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <GlassInput
              label="Motivo de la cancelación"
              placeholder="Ej. Error de captura en cantidades o sucursal destino..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
          </DialogBody>
          <DialogFooter>
            <GlassButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setCancelTarget(null)}
              disabled={submittingCancel}
              className="w-full sm:w-auto"
            >
              Volver
            </GlassButton>
            <GlassButton
              type="button"
              variant="danger"
              size="sm"
              loading={submittingCancel}
              onClick={handleConfirmCancel}
              className="w-full sm:w-auto"
            >
              Confirmar Cancelación
            </GlassButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirmación de Eliminación Lógica ─────────────── */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="Eliminar registro de traspaso"
        description={`¿Deseas archivar lógicamente el traspaso cancelado ${
          deleteTarget ? formatFolio(deleteTarget.folio) : ''
        }?`}
        confirmLabel="Eliminar"
        variant="destructive"
        loading={submittingDelete}
        onConfirm={handleConfirmDelete}
      />
    </div>
  )
}
