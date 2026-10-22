'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/utils/supabase/client'
import { useStore } from '@/components/providers/store-provider'
import { GlassButton } from '@/components/glass-button'
import { GlassInput } from '@/components/glass-input'
import { type Item, type Location } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Wrench, Search, Plus, Minus, Equal, Trash2, X, Check,
  MapPin, Barcode, AlertTriangle, PackagePlus, ArrowRight, FileText
} from 'lucide-react'

export type AdjustmentMode = 'ADD' | 'SUBTRACT' | 'SET'

export const ADJUSTMENT_REASONS = [
  'Merma / Daño o Rotura',
  'Caducidad / Producto Vencido',
  'Sobrante de Inventario',
  'Faltante / Extravío',
  'Consumo / Uso Interno',
  'Muestra / Degustación / Cortesía',
  'Devolución sin Nota',
  'Carga / Ajuste Inicial de Stock',
  'Corrección Administrativa',
  'Otro motivo',
] as const

export interface AdjustmentLineItem {
  id_item: string
  item: Item
  stockBefore: number
  mode: AdjustmentMode
  inputValue: number
  unitCost: number
  itemNote: string
}

interface AjusteInventarioModalProps {
  open: boolean
  onClose: () => void
  onSuccess?: (adjustedItemIds: string[]) => void
  preselectedItem?: Item | null
  preselectedLocationId?: string | null
}

function generateFolio(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const rand = Math.floor(1000 + Math.random() * 9000)
  return `AJU-${y}${m}${d}-${rand}`
}

export function AjusteInventarioModal({
  open,
  onClose,
  onSuccess,
  preselectedItem,
  preselectedLocationId,
}: AjusteInventarioModalProps) {
  const supabase = createClient()
  const { storeId, currentStore } = useStore()

  const [locations, setLocations] = useState<Location[]>([])
  const [selectedLocation, setSelectedLocation] = useState<string>('')
  const [catalogItems, setCatalogItems] = useState<Item[]>([])
  const [stocksByItemLoc, setStocksByItemLoc] = useState<Record<string, number>>({})
  const [loadingCatalog, setLoadingCatalog] = useState(false)

  // Header fields
  const [reason, setReason] = useState<string>(ADJUSTMENT_REASONS[0])
  const [customReason, setCustomReason] = useState<string>('')
  const [reference, setReference] = useState<string>(() => generateFolio())
  const [comments, setComments] = useState<string>('')

  // Search / Scanner input
  const [searchQuery, setSearchQuery] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Adjustment lines
  const [lines, setLines] = useState<AdjustmentLineItem[]>([])
  const [saving, setSaving] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  // Resolve authenticated user
  useEffect(() => {
    if (!open) return
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id)
    })
  }, [open, supabase])

  // Load locations, catalog items & current stocks for the store
  const loadStoreData = useCallback(async () => {
    if (!storeId || !open) return
    setLoadingCatalog(true)

    const [locsRes, itemsRes, stocksRes] = await Promise.all([
      supabase
        .from('locations')
        .select('*')
        .eq('id_store', storeId)
        .eq('status', 'A')
        .order('description'),
      supabase
        .from('items')
        .select('id_item, code, barcode, description, description_short, unit, cost, price, price1, tax, status')
        .eq('status', 'A')
        .order('description')
        .limit(500),
      supabase
        .from('stocks')
        .select('id_item, id_location, current')
        .eq('id_store', storeId),
    ])

    let activeLocId = preselectedLocationId || ''
    if (locsRes.data && locsRes.data.length > 0) {
      const locs = locsRes.data as Location[]
      setLocations(locs)
      if (!activeLocId || activeLocId === 'all') {
        activeLocId = locs[0].id_location
      }
      setSelectedLocation(activeLocId)
    } else {
      setLocations([])
      setSelectedLocation('')
    }

    if (itemsRes.data) {
      setCatalogItems(itemsRes.data as Item[])
    }

    const map: Record<string, number> = {}
    if (stocksRes.data) {
      stocksRes.data.forEach((s) => {
        if (!s.id_item) return
        const locKey = `${s.id_item}_${s.id_location || 'null'}`
        map[locKey] = (map[locKey] ?? 0) + (s.current ?? 0)
        // Also keep a store-wide fallback key if location is null
        const fallbackKey = `${s.id_item}_any`
        map[fallbackKey] = (map[fallbackKey] ?? 0) + (s.current ?? 0)
      })
    }
    setStocksByItemLoc(map)
    setLoadingCatalog(false)
  }, [storeId, open, preselectedLocationId, supabase])

  useEffect(() => {
    if (open) {
      setReference(generateFolio())
      setReason(ADJUSTMENT_REASONS[0])
      setCustomReason('')
      setComments('')
      setSearchQuery('')
      setLines([])
      loadStoreData()
    }
  }, [open, loadStoreData])

  // Helper to get stock for an item in the currently selected location
  const getItemStockForLocation = useCallback(
    (itemId: string, locId: string): number => {
      if (locId) {
        const exactKey = `${itemId}_${locId}`
        if (exactKey in stocksByItemLoc) {
          return stocksByItemLoc[exactKey]
        }
        // Fallback to unassigned location row if no location-specific row exists
        const nullKey = `${itemId}_null`
        if (nullKey in stocksByItemLoc) {
          return stocksByItemLoc[nullKey]
        }
        return 0
      }
      return stocksByItemLoc[`${itemId}_any`] ?? 0
    },
    [stocksByItemLoc]
  )

  // When preselectedItem is passed, add it once catalog/stocks are ready
  useEffect(() => {
    if (!open || !preselectedItem || loadingCatalog) return
    setLines((prev) => {
      if (prev.some((l) => l.id_item === preselectedItem.id_item)) return prev
      const stockBefore = getItemStockForLocation(preselectedItem.id_item, selectedLocation)
      return [
        {
          id_item: preselectedItem.id_item,
          item: preselectedItem,
          stockBefore,
          mode: 'ADD',
          inputValue: 1,
          unitCost: preselectedItem.cost ?? 0,
          itemNote: '',
        },
      ]
    })
  }, [open, preselectedItem, loadingCatalog, selectedLocation, getItemStockForLocation])

  // Update stockBefore across lines if location changes
  const handleLocationChange = (newLocId: string) => {
    setSelectedLocation(newLocId)
    setLines((prev) =>
      prev.map((line) => ({
        ...line,
        stockBefore: getItemStockForLocation(line.id_item, newLocId),
      }))
    )
  }

  // Filtered catalog items for autocomplete dropdown
  const matchingItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return []
    return catalogItems
      .filter((it) => {
        const desc = it.description?.toLowerCase() ?? ''
        const code = it.code?.toLowerCase() ?? ''
        const barcode = it.barcode?.toLowerCase() ?? ''
        return desc.includes(q) || code.includes(q) || barcode.includes(q)
      })
      .slice(0, 12)
  }, [catalogItems, searchQuery])

  const addItemToAdjustment = useCallback(
    (item: Item) => {
      setLines((prev) => {
        const existingIndex = prev.findIndex((l) => l.id_item === item.id_item)
        if (existingIndex >= 0) {
          const updated = [...prev]
          const currentLine = updated[existingIndex]
          if (currentLine.mode !== 'SET') {
            updated[existingIndex] = {
              ...currentLine,
              inputValue: currentLine.inputValue + 1,
            }
          }
          toast.message(`${item.description}`, { description: 'Se incrementó la cantidad en la lista de ajuste.' })
          return updated
        }
        const stockBefore = getItemStockForLocation(item.id_item, selectedLocation)
        return [
          ...prev,
          {
            id_item: item.id_item,
            item,
            stockBefore,
            mode: 'ADD',
            inputValue: 1,
            unitCost: item.cost ?? 0,
            itemNote: '',
          },
        ]
      })
      setSearchQuery('')
      setShowDropdown(false)
    },
    [getItemStockForLocation, selectedLocation]
  )

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const raw = searchQuery.trim()
      if (!raw) return
      // Exact match by barcode or code first
      const exact = catalogItems.find(
        (it) =>
          it.barcode?.toLowerCase() === raw.toLowerCase() ||
          it.code?.toLowerCase() === raw.toLowerCase()
      )
      if (exact) {
        addItemToAdjustment(exact)
        return
      }
      if (matchingItems.length === 1) {
        addItemToAdjustment(matchingItems[0])
      } else if (matchingItems.length === 0) {
        toast.error(`No se encontró ningún artículo para "${raw}"`)
      }
    }
  }

  const updateLine = (id_item: string, patch: Partial<AdjustmentLineItem>) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id_item !== id_item) return l
        const updated = { ...l, ...patch }
        // When switching mode to SET, default inputValue to current stockBefore
        if (patch.mode === 'SET' && l.mode !== 'SET') {
          updated.inputValue = l.stockBefore
        } else if (patch.mode && patch.mode !== 'SET' && l.mode === 'SET') {
          updated.inputValue = 1
        }
        return updated
      })
    )
  }

  const removeLine = (id_item: string) => {
    setLines((prev) => prev.filter((l) => l.id_item !== id_item))
  }

  // Compute line metrics (diff, stockAfter, financialImpact)
  const computedLines = useMemo(() => {
    return lines.map((line) => {
      const val = Math.max(0, Number(line.inputValue) || 0)
      let diff = 0
      let stockAfter = line.stockBefore

      if (line.mode === 'ADD') {
        diff = val
        stockAfter = line.stockBefore + val
      } else if (line.mode === 'SUBTRACT') {
        diff = -val
        stockAfter = line.stockBefore - val
      } else {
        // SET exact stock
        stockAfter = val
        diff = val - line.stockBefore
      }

      const financialImpact = diff * (Number(line.unitCost) || 0)
      const isNegativeStock = stockAfter < 0

      return {
        ...line,
        diff,
        stockAfter,
        financialImpact,
        isNegativeStock,
      }
    })
  }, [lines])

  // Summary totals
  const summary = useMemo(() => {
    let totalEntries = 0
    let totalExits = 0
    let netFinancial = 0
    let hasNegativeAfter = false
    let validLinesCount = 0

    computedLines.forEach((l) => {
      if (l.diff > 0) {
        totalEntries += l.diff
        validLinesCount++
      } else if (l.diff < 0) {
        totalExits += Math.abs(l.diff)
        validLinesCount++
      }
      netFinancial += l.financialImpact
      if (l.isNegativeStock) hasNegativeAfter = true
    })

    return {
      totalEntries,
      totalExits,
      netFinancial,
      hasNegativeAfter,
      validLinesCount,
    }
  }, [computedLines])

  const handleApplyAdjustment = async () => {
    if (!storeId) {
      toast.error('Seleccione una sucursal activa antes de continuar')
      return
    }
    if (lines.length === 0) {
      toast.error('Agregue al menos un artículo para ajustar')
      return
    }
    if (summary.validLinesCount === 0) {
      toast.error('Las cantidades de ajuste deben generar una diferencia distinta de cero')
      return
    }
    if (summary.hasNegativeAfter) {
      toast.error('La existencia resultante no puede ser menor a cero. Revise las salidas.')
      return
    }

    const finalConcept =
      reason === 'Otro motivo'
        ? customReason.trim() || 'Ajuste Manual de Inventario'
        : reason

    const finalRef = reference.trim() || generateFolio()

    setSaving(true)
    const adjustedIds: string[] = []

    try {
      for (const line of computedLines) {
        if (line.diff === 0) continue

        const locId = selectedLocation || null

        // 1. Lookup existing stock record for this item & store
        let existingStock: { id_stock: string; current: number; id_location: string | null } | null = null

        if (locId) {
          const { data: exactStock } = await supabase
            .from('stocks')
            .select('id_stock, current, id_location')
            .eq('id_item', line.id_item)
            .eq('id_store', storeId)
            .eq('id_location', locId)
            .maybeSingle()

          if (exactStock) {
            existingStock = exactStock
          } else {
            // Check if there is an unassigned location stock record to adopt
            const { data: unassignedStock } = await supabase
              .from('stocks')
              .select('id_stock, current, id_location')
              .eq('id_item', line.id_item)
              .eq('id_store', storeId)
              .is('id_location', null)
              .maybeSingle()

            if (unassignedStock) {
              existingStock = unassignedStock
            }
          }
        } else {
          const { data: anyStock } = await supabase
            .from('stocks')
            .select('id_stock, current, id_location')
            .eq('id_item', line.id_item)
            .eq('id_store', storeId)
            .limit(1)
            .maybeSingle()

          if (anyStock) existingStock = anyStock
        }

        const dbStockBefore = existingStock ? (existingStock.current ?? 0) : 0
        const dbStockAfter =
          line.mode === 'SET'
            ? Math.max(0, Math.round(line.inputValue))
            : Math.max(0, Math.round(dbStockBefore + line.diff))
        const actualDiff = dbStockAfter - dbStockBefore

        if (actualDiff === 0 && existingStock) continue

        // 2. Update or insert in `stocks`
        if (existingStock) {
          const { error: stockErr } = await supabase
            .from('stocks')
            .update({
              previous: dbStockBefore,
              current: dbStockAfter,
              ...(locId && !existingStock.id_location ? { id_location: locId } : {}),
            })
            .eq('id_stock', existingStock.id_stock)

          if (stockErr) throw new Error(stockErr.message)
        } else {
          const { error: insertStockErr } = await supabase.from('stocks').insert({
            id_item: line.id_item,
            id_store: storeId,
            id_location: locId,
            initial: dbStockAfter,
            previous: 0,
            current: dbStockAfter,
            minimum: 0,
            maximum: 0,
            reorder_point: 0,
          })

          if (insertStockErr) throw new Error(insertStockErr.message)
        }

        // 3. Build comment with embedded balance metadata so Kardex always knows exact before/after
        const userNote = [comments.trim(), line.itemNote.trim()].filter(Boolean).join(' | ')
        const fullComments = userNote
          ? `${userNote} [Saldo: ${dbStockBefore} → ${dbStockAfter}]`
          : `[Saldo: ${dbStockBefore} → ${dbStockAfter}]`

        const baseTxPayload = {
          id_store: storeId,
          id_location: locId,
          id_item: line.id_item,
          id_user: currentUserId,
          date_transaction: new Date().toISOString(),
          movim_type: 'A',
          reference: finalRef,
          amount_enrty: actualDiff > 0 ? actualDiff : 0,
          amount_exit: actualDiff < 0 ? Math.abs(actualDiff) : 0,
          cost: Number(line.unitCost) || 0,
          price: Number(line.item.price1 ?? line.item.price ?? 0),
          concept: finalConcept,
          origin: 'Ajustes de Inventario',
          comments: fullComments,
        }

        // Try inserting with stock_before and stock_after (Migration 017)
        const { error: txErr } = await supabase.from('transactions').insert({
          ...baseTxPayload,
          stock_before: dbStockBefore,
          stock_after: dbStockAfter,
        })

        // Fallback if stock_before / stock_after columns haven't been migrated yet
        if (txErr) {
          const { error: fallbackTxErr } = await supabase
            .from('transactions')
            .insert(baseTxPayload)

          if (fallbackTxErr) {
            // Final fallback if id_user FK conflicts
            const { error: minimalErr } = await supabase
              .from('transactions')
              .insert({ ...baseTxPayload, id_user: null })
            if (minimalErr) throw new Error(minimalErr.message)
          }
        }

        adjustedIds.push(line.id_item)
      }

      toast.success(
        adjustedIds.length === 1
          ? 'Ajuste de inventario aplicado exitosamente'
          : `${adjustedIds.length} ajustes de inventario aplicados exitosamente`
      )
      onSuccess?.(adjustedIds)
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido'
      toast.error('Error al aplicar el ajuste: ' + msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/65 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.2 }}
            className="glass-card w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden p-0 border border-border/60 shadow-2xl"
          >
            {/* Sticky Header */}
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border/40 bg-card/95 backdrop-blur-xl shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500/20 to-emerald-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                  <Wrench size={20} />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base sm:text-lg font-bold text-foreground truncate">
                    Registrar Ajuste de Inventario
                  </h2>
                  <p className="text-xs text-muted-foreground truncate">
                    Sucursal:{' '}
                    <span className="font-semibold text-emerald-400">
                      {currentStore?.description ?? 'Sucursal Activa'}
                    </span>{' '}
                    · Afectación inmediata en Stock y Kardex
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <GlassButton
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleApplyAdjustment}
                  loading={saving}
                  disabled={saving || summary.validLinesCount === 0 || summary.hasNegativeAfter}
                  icon={<Check size={15} />}
                >
                  Aplicar Ajuste
                </GlassButton>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
                  aria-label="Cerrar modal"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto scroll-modern p-5 space-y-4">
              {/* General Adjustment Parameters */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Location */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                    <MapPin size={13} className="text-emerald-400" />
                    Ubicación de Almacén
                  </label>
                  <div className="glass-input px-3 py-2 flex items-center">
                    <select
                      value={selectedLocation}
                      onChange={(e) => handleLocationChange(e.target.value)}
                      className="w-full bg-transparent text-sm text-foreground focus:outline-none cursor-pointer"
                    >
                      {locations.length === 0 ? (
                        <option value="" className="bg-zinc-900 text-white">
                          General (Sin ubicación)
                        </option>
                      ) : (
                        locations.map((loc) => (
                          <option
                            key={loc.id_location}
                            value={loc.id_location}
                            className="bg-zinc-900 text-white"
                          >
                            {loc.description}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                </div>

                {/* Concept / Reason */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                    <FileText size={13} className="text-amber-400" />
                    Motivo del Ajuste
                  </label>
                  <div className="glass-input px-3 py-2 flex items-center">
                    <select
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="w-full bg-transparent text-sm text-foreground focus:outline-none cursor-pointer"
                    >
                      {ADJUSTMENT_REASONS.map((r) => (
                        <option key={r} value={r} className="bg-zinc-900 text-white">
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Folio / Reference */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Folio / Referencia
                  </label>
                  <GlassInput
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="AJU-0001"
                    className="py-2 font-mono text-xs"
                  />
                </div>

                {/* Comments / Notes */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Observaciones / Notas
                  </label>
                  <GlassInput
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    placeholder="Ej. Autorizado por gerencia..."
                    className="py-2 text-xs"
                  />
                </div>
              </div>

              {reason === 'Otro motivo' && (
                <div>
                  <GlassInput
                    label="Especifique el motivo del ajuste"
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    placeholder="Describa el motivo del ajuste..."
                  />
                </div>
              )}

              {/* Item Search & Barcode Scanner Input */}
              <div className="relative">
                <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                  Agregar artículo por código de barras, clave o descripción
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <GlassInput
                      ref={searchInputRef}
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value)
                        setShowDropdown(true)
                      }}
                      onFocus={() => setShowDropdown(true)}
                      onKeyDown={handleSearchKeyDown}
                      placeholder="Escanee el código de barras y presione Enter, o escriba el nombre del producto..."
                      icon={<Search size={16} />}
                      iconRight={<Barcode size={16} />}
                      autoComplete="off"
                    />
                  </div>
                </div>

                {/* Autocomplete results dropdown */}
                {showDropdown && matchingItems.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 z-30 glass-card p-1.5 max-h-60 overflow-y-auto scroll-modern border border-border/70 shadow-2xl">
                    {matchingItems.map((it) => {
                      const st = getItemStockForLocation(it.id_item, selectedLocation)
                      return (
                        <button
                          key={it.id_item}
                          type="button"
                          onClick={() => addItemToAdjustment(it)}
                          className="w-full text-left px-3 py-2 rounded-xl hover:bg-emerald-500/15 flex items-center justify-between gap-3 transition-colors"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">
                              {it.description}
                            </p>
                            <p className="text-xs text-muted-foreground font-mono">
                              Cód: {it.code || '—'} · CB: {it.barcode || '—'} · Costo:{' '}
                              {formatCurrency(it.cost ?? 0)}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-mono font-bold bg-white/5 border border-border/40 text-foreground">
                              Stock: {st} {it.unit ?? 'Pza'}
                            </span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Lines Table */}
              <div className="glass rounded-2xl border border-border/50 overflow-hidden">
                {computedLines.length === 0 ? (
                  <div className="py-12 px-4 text-center text-muted-foreground flex flex-col items-center gap-2">
                    <PackagePlus size={32} className="text-muted-foreground/50" />
                    <p className="text-sm font-medium text-foreground">
                      No hay artículos en la lista de ajuste
                    </p>
                    <p className="text-xs text-muted-foreground max-w-md">
                      Utilice el buscador superior o escanee un código de barras para agregar uno o varios artículos a ajustar.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto scroll-modern">
                    <table className="w-full text-left text-xs sm:text-sm border-separate border-spacing-0">
                      <thead>
                        <tr className="glass-table-header text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          <th className="px-3.5 py-3">Artículo</th>
                          <th className="px-3 py-3 text-center">Stock Actual</th>
                          <th className="px-3 py-3 text-center">Tipo de Ajuste</th>
                          <th className="px-3 py-3 text-center w-32">Cantidad / Valor</th>
                          <th className="px-3 py-3 text-center">Diferencia</th>
                          <th className="px-3 py-3 text-center">Stock Resultante</th>
                          <th className="px-3 py-3 text-right w-28">Costo Unit.</th>
                          <th className="px-3 py-3 text-right">Impacto ($)</th>
                          <th className="px-2.5 py-3 text-center w-10"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/20">
                        {computedLines.map((line) => (
                          <tr key={line.id_item} className="hover:bg-white/[0.02] transition-colors">
                            {/* Item info */}
                            <td className="px-3.5 py-3">
                              <div className="flex flex-col">
                                <span className="font-semibold text-foreground">
                                  {line.item.description}
                                </span>
                                <span className="text-[11px] font-mono text-muted-foreground">
                                  {line.item.code || line.item.barcode || 'Sin código'} ·{' '}
                                  {line.item.unit ?? 'Pza'}
                                </span>
                              </div>
                            </td>

                            {/* Stock Before */}
                            <td className="px-3 py-3 text-center font-mono font-semibold text-muted-foreground">
                              {line.stockBefore}
                            </td>

                            {/* Mode selector (+ / - / =) */}
                            <td className="px-3 py-3">
                              <div className="inline-flex items-center p-0.5 rounded-xl glass border border-border/50">
                                <button
                                  type="button"
                                  onClick={() => updateLine(line.id_item, { mode: 'ADD' })}
                                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-all ${
                                    line.mode === 'ADD'
                                      ? 'bg-emerald-500 text-white shadow-sm'
                                      : 'text-muted-foreground hover:text-foreground'
                                  }`}
                                  title="Sumar unidades (Entrada por ajuste)"
                                >
                                  <Plus size={12} />
                                  <span>Entrada</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updateLine(line.id_item, { mode: 'SUBTRACT' })}
                                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-all ${
                                    line.mode === 'SUBTRACT'
                                      ? 'bg-rose-500 text-white shadow-sm'
                                      : 'text-muted-foreground hover:text-foreground'
                                  }`}
                                  title="Restar unidades (Salida / Merma)"
                                >
                                  <Minus size={12} />
                                  <span>Salida</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updateLine(line.id_item, { mode: 'SET' })}
                                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-all ${
                                    line.mode === 'SET'
                                      ? 'bg-indigo-500 text-white shadow-sm'
                                      : 'text-muted-foreground hover:text-foreground'
                                  }`}
                                  title="Fijar existencia física exacta"
                                >
                                  <Equal size={12} />
                                  <span>Fijar</span>
                                </button>
                              </div>
                            </td>

                            {/* Quantity or target stock input */}
                            <td className="px-3 py-3 text-center">
                              <input
                                type="number"
                                min={0}
                                step={1}
                                value={line.inputValue}
                                onChange={(e) =>
                                  updateLine(line.id_item, {
                                    inputValue: Math.max(0, Number(e.target.value)),
                                  })
                                }
                                className="w-24 glass-input px-2.5 py-1.5 text-center font-mono font-bold text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                              />
                            </td>

                            {/* Diff */}
                            <td className="px-3 py-3 text-center font-mono font-bold">
                              {line.diff > 0 ? (
                                <span className="text-emerald-400">+{line.diff}</span>
                              ) : line.diff < 0 ? (
                                <span className="text-rose-400">{line.diff}</span>
                              ) : (
                                <span className="text-muted-foreground">0</span>
                              )}
                            </td>

                            {/* Stock After */}
                            <td className="px-3 py-3 text-center">
                              <div className="inline-flex items-center gap-1.5 font-mono">
                                <span className="text-muted-foreground text-xs">
                                  {line.stockBefore}
                                </span>
                                <ArrowRight size={12} className="text-muted-foreground/60" />
                                <span
                                  className={`font-bold px-2 py-0.5 rounded-lg ${
                                    line.isNegativeStock
                                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                                      : 'bg-emerald-500/15 text-emerald-400'
                                  }`}
                                >
                                  {line.stockAfter}
                                </span>
                              </div>
                            </td>

                            {/* Unit cost */}
                            <td className="px-3 py-3 text-right">
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={line.unitCost}
                                onChange={(e) =>
                                  updateLine(line.id_item, {
                                    unitCost: Math.max(0, Number(e.target.value)),
                                  })
                                }
                                className="w-24 glass-input px-2 py-1 text-right font-mono text-xs text-foreground focus:outline-none"
                              />
                            </td>

                            {/* Financial Impact */}
                            <td className="px-3 py-3 text-right font-mono text-xs font-semibold">
                              <span
                                className={
                                  line.financialImpact > 0
                                    ? 'text-emerald-400'
                                    : line.financialImpact < 0
                                    ? 'text-rose-400'
                                    : 'text-muted-foreground'
                                }
                              >
                                {line.financialImpact > 0 ? '+' : ''}
                                {formatCurrency(line.financialImpact)}
                              </span>
                            </td>

                            {/* Remove */}
                            <td className="px-2.5 py-3 text-center">
                              <button
                                type="button"
                                onClick={() => removeLine(line.id_item)}
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                                title="Quitar de la lista"
                              >
                                <Trash2 size={15} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {summary.hasNegativeAfter && (
                <div className="flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-medium">
                  <AlertTriangle size={16} className="shrink-0" />
                  <span>
                    Una o más partidas resultarían con existencia negativa. Ajuste la cantidad de salida antes de continuar.
                  </span>
                </div>
              )}
            </div>

            {/* Footer Summary & Actions */}
            <div className="px-5 py-3.5 border-t border-border/40 bg-card/95 backdrop-blur-xl flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <div>
                  <span className="text-muted-foreground">Partidas: </span>
                  <strong className="text-foreground font-mono">{summary.validLinesCount}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Entradas: </span>
                  <strong className="text-emerald-400 font-mono">+{summary.totalEntries} u.</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Salidas: </span>
                  <strong className="text-rose-400 font-mono">-{summary.totalExits} u.</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Impacto Neto: </span>
                  <strong
                    className={`font-mono ${
                      summary.netFinancial >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {summary.netFinancial > 0 ? '+' : ''}
                    {formatCurrency(summary.netFinancial)}
                  </strong>
                </div>
              </div>

              <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                <GlassButton type="button" variant="ghost" size="sm" onClick={onClose}>
                  Cancelar
                </GlassButton>
                <GlassButton
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleApplyAdjustment}
                  loading={saving}
                  disabled={saving || summary.validLinesCount === 0 || summary.hasNegativeAfter}
                  icon={<Check size={15} />}
                >
                  Confirmar y Aplicar Ajuste
                </GlassButton>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
