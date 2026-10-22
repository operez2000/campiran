'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { getAuthenticatedProfile } from '@/lib/auth-profile'
import {
  type BranchTransfer,
  type BranchTransferItem,
  type TransferMode,
  type TransferStatus,
  type TransferDiscrepancyResolution,
  type Store,
  type Location,
  type Item,
  type Stock,
  type Profile,
  type Transaction,
} from '@/lib/types'

export interface CreateTransferLineInput {
  id_item: string
  quantity: number
  notes?: string
}

export interface CreateBranchTransferInput {
  originStoreId: string
  originLocationId: string | null
  destStoreId: string
  destLocationId: string | null
  transferMode: TransferMode
  notes: string
  items: CreateTransferLineInput[]
}

export interface ReceiveTransferLineInput {
  id_transfer_item?: string
  id_item: string
  quantity_received: number
  notes?: string
}

export interface ReceiveBranchTransferInput {
  transferId: string
  destLocationId: string | null
  receptionNotes: string
  discrepancyResolution: TransferDiscrepancyResolution
  items: ReceiveTransferLineInput[]
}

interface FallbackTransferMeta {
  __campiran_transfer: true
  id_transfer: string
  folio: number
  id_origin_store: string
  id_origin_location: string | null
  id_dest_store: string
  id_dest_location: string | null
  transfer_mode: TransferMode
  status: TransferStatus
  record_status: 'A' | 'I'
  id_sent_by: string | null
  sent_by_name: string | null
  id_received_by?: string | null
  received_by_name?: string | null
  id_cancelled_by?: string | null
  cancelled_by_name?: string | null
  notes: string | null
  reception_notes?: string | null
  cancellation_reason?: string | null
  sent_at: string
  received_at?: string | null
  cancelled_at?: string | null
  quantity_sent: number
  quantity_received: number
  stock_origin_before: number
  stock_dest_before: number
  item_notes?: string | null
}

function formatFolio(folio: number): string {
  return `TRP-${String(folio).padStart(4, '0')}`
}

/**
 * Verifica que el usuario tenga sesión activa y rol permitido para Inventario (ADMIN, MANAGER, ALMACENISTA).
 */
async function requireInventoryRole(): Promise<{
  profile: Profile
  adminClient: ReturnType<typeof createAdminClient>
}> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('No autorizado. Debes iniciar sesión.')
  }

  const profile = await getAuthenticatedProfile(supabase, user)

  if (
    profile.role !== 'ADMIN' &&
    profile.role !== 'MANAGER' &&
    profile.role !== 'ALMACENISTA'
  ) {
    throw new Error(
      'No tienes permisos suficientes para operar el módulo de traspasos de inventario.'
    )
  }

  const adminClient = createAdminClient()
  return { profile, adminClient }
}

/**
 * Resuelve la ubicación de almacén para una sucursal (o crea "Almacén General" si la sucursal aún no tiene ninguna).
 */
async function resolveStoreLocation(
  adminClient: ReturnType<typeof createAdminClient>,
  storeId: string,
  requestedLocationId: string | null
): Promise<string | null> {
  if (requestedLocationId) return requestedLocationId

  const { data: existingLoc } = await adminClient
    .from('locations')
    .select('id_location, is_selected')
    .eq('id_store', storeId)
    .eq('status', 'A')
    .order('is_selected', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (existingLoc?.id_location) {
    return existingLoc.id_location
  }

  const { data: createdLoc } = await adminClient
    .from('locations')
    .insert({
      id_store: storeId,
      description: 'Almacén General',
      status: 'A',
      is_selected: true,
    })
    .select('id_location')
    .maybeSingle()

  return createdLoc?.id_location ?? null
}

/**
 * Inserta un movimiento en `transactions` (Kardex) con soporte para `movim_type = 'T'`
 * y fallback automático si las columnas extendidas aún no existen.
 */
async function insertTransferTransaction(
  adminClient: ReturnType<typeof createAdminClient>,
  txPayload: {
    id_store: string
    id_location: string | null
    id_item: string
    id_user: string | null
    movim_type: 'T' | 'E' | 'S'
    reference: string
    amount_enrty: number
    amount_exit: number
    cost: number
    price: number
    concept: string
    origin: string
    comments: string
    stock_before: number
    stock_after: number
  }
) {
  const nowIso = new Date().toISOString()

  const { error: extError } = await adminClient.from('transactions').insert({
    id_store: txPayload.id_store,
    id_location: txPayload.id_location,
    id_item: txPayload.id_item,
    id_user: txPayload.id_user,
    date_transaction: nowIso,
    movim_type: txPayload.movim_type,
    reference: txPayload.reference,
    amount_enrty: txPayload.amount_enrty,
    amount_exit: txPayload.amount_exit,
    cost: txPayload.cost,
    price: txPayload.price,
    concept: txPayload.concept,
    origin: txPayload.origin,
    comments: txPayload.comments,
    stock_before: txPayload.stock_before,
    stock_after: txPayload.stock_after,
  })

  if (!extError) return

  await adminClient.from('transactions').insert({
    id_store: txPayload.id_store,
    id_location: txPayload.id_location,
    id_item: txPayload.id_item,
    id_user: txPayload.id_user,
    date_transaction: nowIso,
    movim_type: txPayload.movim_type,
    reference: txPayload.reference,
    amount_enrty: txPayload.amount_enrty,
    amount_exit: txPayload.amount_exit,
    cost: txPayload.cost,
    price: txPayload.price,
    concept: txPayload.concept,
    origin: txPayload.origin,
    comments: txPayload.comments,
  })
}

/**
 * Obtiene el stock actual de un artículo en una sucursal y ubicación.
 */
async function getItemStockInLocation(
  adminClient: ReturnType<typeof createAdminClient>,
  storeId: string,
  locationId: string | null,
  itemId: string
): Promise<{ id_stock: string | null; current: number }> {
  if (locationId) {
    const { data: locStock } = await adminClient
      .from('stocks')
      .select('id_stock, current')
      .eq('id_store', storeId)
      .eq('id_location', locationId)
      .eq('id_item', itemId)
      .maybeSingle()

    if (locStock) {
      return { id_stock: locStock.id_stock, current: Number(locStock.current ?? 0) }
    }
  }

  const { data: anyStock } = await adminClient
    .from('stocks')
    .select('id_stock, current')
    .eq('id_store', storeId)
    .eq('id_item', itemId)
    .order('current', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (anyStock && !locationId) {
    return { id_stock: anyStock.id_stock, current: Number(anyStock.current ?? 0) }
  }

  return { id_stock: null, current: 0 }
}

/**
 * Ajusta el stock de un artículo en una sucursal y ubicación (suma o resta `delta`).
 */
async function adjustStockInLocation(
  adminClient: ReturnType<typeof createAdminClient>,
  storeId: string,
  locationId: string | null,
  itemId: string,
  delta: number
): Promise<{ stockBefore: number; stockAfter: number }> {
  const existing = await getItemStockInLocation(adminClient, storeId, locationId, itemId)
  const stockBefore = existing.current
  const stockAfter = stockBefore + delta

  if (existing.id_stock) {
    await adminClient
      .from('stocks')
      .update({
        previous: stockBefore,
        current: stockAfter,
        ...(locationId ? { id_location: locationId } : {}),
      })
      .eq('id_stock', existing.id_stock)
  } else {
    await adminClient.from('stocks').insert({
      id_store: storeId,
      id_location: locationId,
      id_item: itemId,
      initial: Math.max(0, stockAfter),
      previous: 0,
      current: stockAfter,
      minimum: 0,
      maximum: 0,
      reorder_point: 0,
    })
  }

  return { stockBefore, stockAfter }
}

function tryParseFallbackMeta(comments: string | null): FallbackTransferMeta | null {
  if (!comments || !comments.trim().startsWith('{')) return null
  try {
    const parsed = JSON.parse(comments) as FallbackTransferMeta
    if (parsed && parsed.__campiran_transfer === true && parsed.id_transfer) {
      return parsed
    }
  } catch {
    // ignore
  }
  return null
}

/**
 * Consulta todos los datos necesarios para la vista de Traspasos entre Sucursales:
 * - Lista de traspasos enviados y recibidos para la sucursal activa (o todos para ADMIN)
 * - Todas las sucursales activas
 * - Todas las ubicaciones activas por sucursal
 * - Catálogo de artículos activos
 * - Existencias (`stocks`) de la sucursal activa
 */
export async function getBranchTransfersDataAction(storeId: string): Promise<{
  transfers: BranchTransfer[]
  stores: Store[]
  locations: Location[]
  items: Item[]
  originStocks: Stock[]
  migrationReady: boolean
}> {
  const { adminClient } = await requireInventoryRole()

  const [storesRes, locationsRes, itemsRes, stocksRes] = await Promise.all([
    adminClient
      .from('stores')
      .select('*')
      .eq('status', 'A')
      .order('description', { ascending: true }),
    adminClient
      .from('locations')
      .select('*')
      .eq('status', 'A')
      .order('is_selected', { ascending: false })
      .order('description', { ascending: true }),
    adminClient
      .from('items')
      .select('*, category:categories(description)')
      .eq('status', 'A')
      .order('description', { ascending: true }),
    storeId
      ? adminClient.from('stocks').select('*').eq('id_store', storeId)
      : Promise.resolve({ data: [] }),
  ])

  const stores = (storesRes.data ?? []) as Store[]
  const locations = (locationsRes.data ?? []) as Location[]
  const items = (itemsRes.data ?? []) as unknown as Item[]
  const originStocks = (stocksRes.data ?? []) as Stock[]

  const storesMap = new Map(stores.map((s) => [s.id_store, s]))
  const locationsMap = new Map(locations.map((l) => [l.id_location, l]))
  const itemsMap = new Map(items.map((it) => [it.id_item, it]))

  // 1. Intentar consultar tabla `branch_transfers`
  let query = adminClient
    .from('branch_transfers')
    .select('*')
    .eq('record_status', 'A')
    .order('sent_at', { ascending: false })
    .limit(200)

  if (storeId) {
    query = query.or(`id_origin_store.eq.${storeId},id_dest_store.eq.${storeId}`)
  }

  const { data: rawTransfers, error: transfersError } = await query

  if (!transfersError && rawTransfers) {
    const transferList = rawTransfers as BranchTransfer[]
    const transferIds = transferList.map((t) => t.id_transfer)

    const { data: rawItems } =
      transferIds.length > 0
        ? await adminClient
            .from('branch_transfer_items')
            .select('*')
            .in('id_transfer', transferIds)
            .eq('status', 'A')
            .order('created_at', { ascending: true })
        : { data: [] }

    const itemsByTransfer = new Map<string, BranchTransferItem[]>()
    for (const ti of (rawItems ?? []) as BranchTransferItem[]) {
      const hydratedItem: BranchTransferItem = {
        ...ti,
        quantity_sent: Number(ti.quantity_sent ?? 0),
        quantity_received: Number(ti.quantity_received ?? 0),
        unit_cost: Number(ti.unit_cost ?? 0),
        unit_price: Number(ti.unit_price ?? 0),
        stock_origin_before: Number(ti.stock_origin_before ?? 0),
        stock_dest_before: Number(ti.stock_dest_before ?? 0),
        item: itemsMap.get(ti.id_item),
      }
      const list = itemsByTransfer.get(ti.id_transfer) ?? []
      list.push(hydratedItem)
      itemsByTransfer.set(ti.id_transfer, list)
    }

    const hydratedTransfers: BranchTransfer[] = transferList.map((t) => ({
      ...t,
      total_items: Number(t.total_items ?? 0),
      total_quantity_sent: Number(t.total_quantity_sent ?? 0),
      total_quantity_received: Number(t.total_quantity_received ?? 0),
      total_cost: Number(t.total_cost ?? 0),
      origin_store: storesMap.get(t.id_origin_store),
      origin_location: t.id_origin_location
        ? locationsMap.get(t.id_origin_location)
        : undefined,
      dest_store: storesMap.get(t.id_dest_store),
      dest_location: t.id_dest_location
        ? locationsMap.get(t.id_dest_location)
        : undefined,
      transfer_items: itemsByTransfer.get(t.id_transfer) ?? [],
    }))

    return {
      transfers: hydratedTransfers,
      stores,
      locations,
      items,
      originStocks,
      migrationReady: true,
    }
  }

  // 2. Fallback: Reconstruir traspasos desde `transactions` con `origin = 'TRASPASOS'`
  // cuando la migración 018 aún no se ha ejecutado en Supabase
  const { data: fallbackTxs } = await adminClient
    .from('transactions')
    .select('*')
    .eq('origin', 'TRASPASOS')
    .order('date_transaction', { ascending: false })
    .limit(300)

  const groupedTransfers = new Map<string, BranchTransfer>()

  for (const tx of (fallbackTxs ?? []) as Transaction[]) {
    const meta = tryParseFallbackMeta(tx.comments)
    if (!meta || meta.record_status === 'I') continue
    if (
      storeId &&
      meta.id_origin_store !== storeId &&
      meta.id_dest_store !== storeId
    ) {
      continue
    }

    const itemObj = tx.id_item ? itemsMap.get(tx.id_item) : undefined
    const unitCost = Number(tx.cost ?? itemObj?.cost ?? 0)
    const unitPrice = Number(tx.price ?? itemObj?.price1 ?? itemObj?.price ?? 0)
    const qtySent = Number(meta.quantity_sent ?? tx.amount_exit ?? 0)
    const qtyReceived = Number(meta.quantity_received ?? 0)

    const lineItem: BranchTransferItem = {
      id_transfer_item: tx.id_transaction,
      id_transfer: meta.id_transfer,
      id_item: tx.id_item ?? '',
      quantity_sent: qtySent,
      quantity_received: qtyReceived,
      unit_cost: unitCost,
      unit_price: unitPrice,
      stock_origin_before: Number(meta.stock_origin_before ?? 0),
      stock_dest_before: Number(meta.stock_dest_before ?? 0),
      notes: meta.item_notes ?? null,
      status: 'A',
      created_at: tx.created_at,
      item: itemObj,
    }

    const existing = groupedTransfers.get(meta.id_transfer)
    if (!existing) {
      groupedTransfers.set(meta.id_transfer, {
        id_transfer: meta.id_transfer,
        folio: meta.folio,
        id_origin_store: meta.id_origin_store,
        id_origin_location: meta.id_origin_location,
        id_dest_store: meta.id_dest_store,
        id_dest_location: meta.id_dest_location,
        transfer_mode: meta.transfer_mode,
        status: meta.status,
        record_status: meta.record_status,
        id_sent_by: meta.id_sent_by,
        sent_by_name: meta.sent_by_name,
        id_received_by: meta.id_received_by ?? null,
        received_by_name: meta.received_by_name ?? null,
        id_cancelled_by: meta.id_cancelled_by ?? null,
        cancelled_by_name: meta.cancelled_by_name ?? null,
        total_items: 1,
        total_quantity_sent: qtySent,
        total_quantity_received: qtyReceived,
        total_cost: qtySent * unitCost,
        notes: meta.notes,
        reception_notes: meta.reception_notes ?? null,
        cancellation_reason: meta.cancellation_reason ?? null,
        sent_at: meta.sent_at || tx.date_transaction,
        received_at: meta.received_at ?? null,
        cancelled_at: meta.cancelled_at ?? null,
        created_at: tx.created_at,
        updated_at: meta.received_at || meta.cancelled_at || tx.created_at,
        origin_store: storesMap.get(meta.id_origin_store),
        origin_location: meta.id_origin_location
          ? locationsMap.get(meta.id_origin_location)
          : undefined,
        dest_store: storesMap.get(meta.id_dest_store),
        dest_location: meta.id_dest_location
          ? locationsMap.get(meta.id_dest_location)
          : undefined,
        transfer_items: [lineItem],
      })
    } else {
      existing.transfer_items?.push(lineItem)
      existing.total_items = existing.transfer_items?.length ?? 1
      existing.total_quantity_sent += qtySent
      existing.total_quantity_received += qtyReceived
      existing.total_cost += qtySent * unitCost
    }
  }

  return {
    transfers: Array.from(groupedTransfers.values()),
    stores,
    locations,
    items,
    originStocks,
    migrationReady: false,
  }
}

/**
 * Crea un nuevo Traspaso de Mercancía entre Sucursales.
 * Soporta ambos modos:
 * - 'TRANSIT': Descuenta stock en sucursal origen y queda 'IN_TRANSIT' hasta que destino confirme recepción.
 * - 'DIRECT': Descuenta stock en origen y suma en destino en un solo paso (exclusivo ADMIN / MANAGER).
 */
export async function createBranchTransferAction(
  input: CreateBranchTransferInput
): Promise<{ success: boolean; transfer?: BranchTransfer; error?: string }> {
  try {
    const { profile, adminClient } = await requireInventoryRole()

    if (!input.originStoreId || !input.destStoreId) {
      return {
        success: false,
        error: 'Debes seleccionar tanto la sucursal de origen como la sucursal de destino.',
      }
    }

    if (input.originStoreId === input.destStoreId) {
      return {
        success: false,
        error: 'La sucursal de destino debe ser diferente a la sucursal de origen.',
      }
    }

    if (
      input.transferMode === 'DIRECT' &&
      profile.role !== 'ADMIN' &&
      profile.role !== 'MANAGER'
    ) {
      return {
        success: false,
        error:
          'Solo usuarios con rol Administrador o Gerente pueden ejecutar traspasos directos inmediatos.',
      }
    }

    if (!input.items || input.items.length === 0) {
      return {
        success: false,
        error: 'Agrega al menos un artículo para realizar el traspaso.',
      }
    }

    // Consolidar partidas por id_item
    const consolidatedMap = new Map<string, { id_item: string; quantity: number; notes: string }>()
    for (const rawLine of input.items) {
      const qty = Math.round(Number(rawLine.quantity) || 0)
      if (!rawLine.id_item || qty <= 0) continue
      const existing = consolidatedMap.get(rawLine.id_item)
      if (existing) {
        existing.quantity += qty
        if (rawLine.notes && !existing.notes.includes(rawLine.notes)) {
          existing.notes = [existing.notes, rawLine.notes].filter(Boolean).join(' | ')
        }
      } else {
        consolidatedMap.set(rawLine.id_item, {
          id_item: rawLine.id_item,
          quantity: qty,
          notes: rawLine.notes?.trim() || '',
        })
      }
    }

    const lines = Array.from(consolidatedMap.values())
    if (lines.length === 0) {
      return {
        success: false,
        error: 'Las cantidades a traspasar deben ser mayores a cero.',
      }
    }

    // Resolver ubicaciones de origen y destino
    const [originLocId, destLocId, storesRes, itemsRes] = await Promise.all([
      resolveStoreLocation(adminClient, input.originStoreId, input.originLocationId),
      resolveStoreLocation(adminClient, input.destStoreId, input.destLocationId),
      adminClient
        .from('stores')
        .select('id_store, description')
        .in('id_store', [input.originStoreId, input.destStoreId]),
      adminClient
        .from('items')
        .select('id_item, code, barcode, description, cost, price, price1, status')
        .in(
          'id_item',
          lines.map((l) => l.id_item)
        ),
    ])

    const storesMap = new Map(
      (storesRes.data ?? []).map((s) => [s.id_store, s.description || 'Sucursal'])
    )
    const originStoreName = storesMap.get(input.originStoreId) || 'Sucursal Origen'
    const destStoreName = storesMap.get(input.destStoreId) || 'Sucursal Destino'

    const itemsMap = new Map((itemsRes.data ?? []).map((it) => [it.id_item, it as Item]))

    // Validar existencias suficientes en la sucursal y ubicación de origen antes de afectar
    const currentOriginStocks = new Map<string, number>()
    for (const line of lines) {
      const itemObj = itemsMap.get(line.id_item)
      if (!itemObj || itemObj.status === 'I') {
        return {
          success: false,
          error: 'Uno de los artículos seleccionados no existe o se encuentra inactivo.',
        }
      }

      const stockInfo = await getItemStockInLocation(
        adminClient,
        input.originStoreId,
        originLocId,
        line.id_item
      )

      if (line.quantity > stockInfo.current) {
        return {
          success: false,
          error: `Existencia insuficiente para "${itemObj.description}": disponible ${stockInfo.current} en la ubicación de origen, solicitado ${line.quantity}.`,
        }
      }

      currentOriginStocks.set(line.id_item, stockInfo.current)
    }

    const nowIso = new Date().toISOString()
    const isDirect = input.transferMode === 'DIRECT'
    const initialStatus: TransferStatus = isDirect ? 'RECEIVED' : 'IN_TRANSIT'

    let totalQtySent = 0
    let totalCost = 0
    for (const line of lines) {
      const itemObj = itemsMap.get(line.id_item)
      const cost = Number(itemObj?.cost ?? 0)
      totalQtySent += line.quantity
      totalCost += line.quantity * cost
    }

    // 1. Intentar insertar cabecera en `branch_transfers`
    const { data: insertedTransfer, error: insertTransferError } = await adminClient
      .from('branch_transfers')
      .insert({
        id_origin_store: input.originStoreId,
        id_origin_location: originLocId,
        id_dest_store: input.destStoreId,
        id_dest_location: destLocId,
        transfer_mode: input.transferMode,
        status: initialStatus,
        record_status: 'A',
        id_sent_by: profile.id,
        sent_by_name: profile.full_name || profile.email || 'Usuario',
        id_received_by: isDirect ? profile.id : null,
        received_by_name: isDirect ? profile.full_name || profile.email || 'Usuario' : null,
        total_items: lines.length,
        total_quantity_sent: totalQtySent,
        total_quantity_received: isDirect ? totalQtySent : 0,
        total_cost: totalCost,
        notes: input.notes?.trim() || null,
        sent_at: nowIso,
        received_at: isDirect ? nowIso : null,
      })
      .select('*')
      .maybeSingle()

    const fallbackId = crypto.randomUUID()
    const fallbackFolio = Math.floor(1000 + (Date.now() % 9000))
    const transferId = insertedTransfer?.id_transfer ?? fallbackId
    const folio = Number(insertedTransfer?.folio ?? fallbackFolio)
    const folioRef = formatFolio(folio)
    const useFallbackMeta = Boolean(insertTransferError || !insertedTransfer)

    const transferItemsPayload: Array<Record<string, unknown>> = []

    // 2. Afectar existencias y Kardex por cada partida
    for (const line of lines) {
      const itemObj = itemsMap.get(line.id_item)!
      const unitCost = Number(itemObj.cost ?? 0)
      const unitPrice = Number(itemObj.price1 ?? itemObj.price ?? 0)

      // 2a. Descontar de sucursal origen
      const originAdj = await adjustStockInLocation(
        adminClient,
        input.originStoreId,
        originLocId,
        line.id_item,
        -line.quantity
      )

      // 2b. Si es traspaso directo, sumar inmediatamente en sucursal destino
      let destStockBefore = 0
      let destStockAfter = 0
      if (isDirect) {
        const destAdj = await adjustStockInLocation(
          adminClient,
          input.destStoreId,
          destLocId,
          line.id_item,
          line.quantity
        )
        destStockBefore = destAdj.stockBefore
        destStockAfter = destAdj.stockAfter
      } else {
        const destInfo = await getItemStockInLocation(
          adminClient,
          input.destStoreId,
          destLocId,
          line.id_item
        )
        destStockBefore = destInfo.current
      }

      const fallbackMetaObj: FallbackTransferMeta = {
        __campiran_transfer: true,
        id_transfer: transferId,
        folio,
        id_origin_store: input.originStoreId,
        id_origin_location: originLocId,
        id_dest_store: input.destStoreId,
        id_dest_location: destLocId,
        transfer_mode: input.transferMode,
        status: initialStatus,
        record_status: 'A',
        id_sent_by: profile.id,
        sent_by_name: profile.full_name || profile.email || 'Usuario',
        id_received_by: isDirect ? profile.id : null,
        received_by_name: isDirect ? profile.full_name || profile.email || 'Usuario' : null,
        notes: input.notes?.trim() || null,
        sent_at: nowIso,
        received_at: isDirect ? nowIso : null,
        quantity_sent: line.quantity,
        quantity_received: isDirect ? line.quantity : 0,
        stock_origin_before: originAdj.stockBefore,
        stock_dest_before: destStockBefore,
        item_notes: line.notes || null,
      }

      const humanComment = [
        `Traspaso ${folioRef}: ${originStoreName} → ${destStoreName}`,
        input.notes?.trim() ? `Obs: ${input.notes.trim()}` : null,
        line.notes ? `Nota art: ${line.notes}` : null,
      ]
        .filter(Boolean)
        .join(' | ')

      // Registrar movimiento de salida en sucursal origen
      await insertTransferTransaction(adminClient, {
        id_store: input.originStoreId,
        id_location: originLocId,
        id_item: line.id_item,
        id_user: profile.id,
        movim_type: 'T',
        reference: folioRef,
        amount_enrty: 0,
        amount_exit: line.quantity,
        cost: unitCost,
        price: unitPrice,
        concept: isDirect
          ? `Salida por traspaso directo a ${destStoreName}`
          : `Salida por envío en tránsito a ${destStoreName}`,
        origin: 'TRASPASOS',
        comments: useFallbackMeta ? JSON.stringify(fallbackMetaObj) : humanComment,
        stock_before: originAdj.stockBefore,
        stock_after: originAdj.stockAfter,
      })

      // Si es directo, registrar también el movimiento de entrada en sucursal destino
      if (isDirect) {
        await insertTransferTransaction(adminClient, {
          id_store: input.destStoreId,
          id_location: destLocId,
          id_item: line.id_item,
          id_user: profile.id,
          movim_type: 'T',
          reference: folioRef,
          amount_enrty: line.quantity,
          amount_exit: 0,
          cost: unitCost,
          price: unitPrice,
          concept: `Entrada por traspaso directo desde ${originStoreName}`,
          origin: 'TRASPASOS',
          comments: humanComment,
          stock_before: destStockBefore,
          stock_after: destStockAfter,
        })
      }

      transferItemsPayload.push({
        id_transfer: transferId,
        id_item: line.id_item,
        quantity_sent: line.quantity,
        quantity_received: isDirect ? line.quantity : 0,
        unit_cost: unitCost,
        unit_price: unitPrice,
        stock_origin_before: originAdj.stockBefore,
        stock_dest_before: destStockBefore,
        notes: line.notes || null,
        status: 'A',
      })
    }

    if (!useFallbackMeta && transferItemsPayload.length > 0) {
      await adminClient.from('branch_transfer_items').insert(transferItemsPayload)
    }

    revalidatePath('/inventario/traspasos')
    revalidatePath('/inventario')
    revalidatePath('/inventario/movimientos')

    return {
      success: true,
      transfer: (insertedTransfer as BranchTransfer) ?? undefined,
    }
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Ocurrió un error al registrar el traspaso.'
    return { success: false, error: message }
  }
}

/**
 * Confirma la recepción de un traspaso que se encontraba 'IN_TRANSIT' en la sucursal destino.
 * Suma las cantidades recibidas al stock de la ubicación destino y maneja diferencias si las hubiera.
 */
export async function receiveBranchTransferAction(
  input: ReceiveBranchTransferInput
): Promise<{ success: boolean; error?: string }> {
  try {
    const { profile, adminClient } = await requireInventoryRole()

    if (!input.transferId) {
      return { success: false, error: 'Identificador de traspaso no válido.' }
    }

    const nowIso = new Date().toISOString()
    const receiverName = profile.full_name || profile.email || 'Usuario'

    // 1. Buscar en `branch_transfers`
    const { data: existingTransfer, error: transferErr } = await adminClient
      .from('branch_transfers')
      .select('*')
      .eq('id_transfer', input.transferId)
      .eq('record_status', 'A')
      .maybeSingle()

    if (!transferErr && existingTransfer) {
      const transfer = existingTransfer as BranchTransfer
      if (transfer.status !== 'IN_TRANSIT') {
        return {
          success: false,
          error: 'Este traspaso ya fue recibido o cancelado previamente.',
        }
      }

      const [destLocId, storesRes, rawItemsRes] = await Promise.all([
        resolveStoreLocation(
          adminClient,
          transfer.id_dest_store,
          input.destLocationId || transfer.id_dest_location
        ),
        adminClient
          .from('stores')
          .select('id_store, description')
          .in('id_store', [transfer.id_origin_store, transfer.id_dest_store]),
        adminClient
          .from('branch_transfer_items')
          .select('*')
          .eq('id_transfer', transfer.id_transfer)
          .eq('status', 'A'),
      ])

      const storesMap = new Map(
        (storesRes.data ?? []).map((s) => [s.id_store, s.description || 'Sucursal'])
      )
      const originStoreName = storesMap.get(transfer.id_origin_store) || 'Sucursal Origen'
      const destStoreName = storesMap.get(transfer.id_dest_store) || 'Sucursal Destino'
      const folioRef = formatFolio(transfer.folio)

      const transferItems = (rawItemsRes.data ?? []) as BranchTransferItem[]
      const inputMap = new Map(
        (input.items ?? []).map((it) => [it.id_item, it])
      )

      let totalReceived = 0
      let totalSent = 0

      for (const tItem of transferItems) {
        const sentQty = Number(tItem.quantity_sent ?? 0)
        totalSent += sentQty

        const recInput = inputMap.get(tItem.id_item)
        const recQty = recInput
          ? Math.max(0, Math.min(sentQty, Math.round(Number(recInput.quantity_received) || 0)))
          : sentQty

        totalReceived += recQty
        const diffQty = sentQty - recQty

        // Afectar stock en destino si recQty > 0
        let destStockBefore = 0
        if (recQty > 0) {
          const destAdj = await adjustStockInLocation(
            adminClient,
            transfer.id_dest_store,
            destLocId,
            tItem.id_item,
            recQty
          )
          destStockBefore = destAdj.stockBefore

          await insertTransferTransaction(adminClient, {
            id_store: transfer.id_dest_store,
            id_location: destLocId,
            id_item: tItem.id_item,
            id_user: profile.id,
            movim_type: 'T',
            reference: folioRef,
            amount_enrty: recQty,
            amount_exit: 0,
            cost: Number(tItem.unit_cost ?? 0),
            price: Number(tItem.unit_price ?? 0),
            concept: `Entrada por recepción de traspaso desde ${originStoreName}`,
            origin: 'TRASPASOS',
            comments: [
              `Recepción ${folioRef} en ${destStoreName}`,
              input.receptionNotes?.trim() ? `Obs: ${input.receptionNotes.trim()}` : null,
              recInput?.notes?.trim() ? `Nota art: ${recInput.notes.trim()}` : null,
            ]
              .filter(Boolean)
              .join(' | '),
            stock_before: destAdj.stockBefore,
            stock_after: destAdj.stockAfter,
          })
        } else {
          const destInfo = await getItemStockInLocation(
            adminClient,
            transfer.id_dest_store,
            destLocId,
            tItem.id_item
          )
          destStockBefore = destInfo.current
        }

        // Si hubo diferencia y se eligió devolver al origen
        if (diffQty > 0 && input.discrepancyResolution === 'RETURN_TO_ORIGIN') {
          const origReturnAdj = await adjustStockInLocation(
            adminClient,
            transfer.id_origin_store,
            transfer.id_origin_location,
            tItem.id_item,
            diffQty
          )

          await insertTransferTransaction(adminClient, {
            id_store: transfer.id_origin_store,
            id_location: transfer.id_origin_location,
            id_item: tItem.id_item,
            id_user: profile.id,
            movim_type: 'T',
            reference: folioRef,
            amount_enrty: diffQty,
            amount_exit: 0,
            cost: Number(tItem.unit_cost ?? 0),
            price: Number(tItem.unit_price ?? 0),
            concept: `Devolución por diferencia en recepción de ${destStoreName}`,
            origin: 'TRASPASOS',
            comments: `Diferencia devuelta al origen en recepción de ${folioRef} (${recQty}/${sentQty} recibidas)`,
            stock_before: origReturnAdj.stockBefore,
            stock_after: origReturnAdj.stockAfter,
          })
        }

        await adminClient
          .from('branch_transfer_items')
          .update({
            quantity_received: recQty,
            stock_dest_before: destStockBefore,
            notes: recInput?.notes?.trim() || tItem.notes || null,
          })
          .eq('id_transfer_item', tItem.id_transfer_item)
      }

      const finalStatus: TransferStatus =
        totalReceived < totalSent ? 'PARTIAL' : 'RECEIVED'

      await adminClient
        .from('branch_transfers')
        .update({
          status: finalStatus,
          id_dest_location: destLocId,
          id_received_by: profile.id,
          received_by_name: receiverName,
          total_quantity_received: totalReceived,
          reception_notes: input.receptionNotes?.trim() || null,
          received_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id_transfer', transfer.id_transfer)

      revalidatePath('/inventario/traspasos')
      revalidatePath('/inventario')
      revalidatePath('/inventario/movimientos')

      return { success: true }
    }

    // 2. Fallback si se almacenó en `transactions`
    const { data: fallbackTxs } = await adminClient
      .from('transactions')
      .select('*')
      .eq('origin', 'TRASPASOS')
      .order('date_transaction', { ascending: false })
      .limit(200)

    const matchingTxs = ((fallbackTxs ?? []) as Transaction[]).filter((tx) => {
      const m = tryParseFallbackMeta(tx.comments)
      return m && m.id_transfer === input.transferId
    })

    if (matchingTxs.length === 0) {
      return { success: false, error: 'No se encontró el traspaso especificado.' }
    }

    const firstMeta = tryParseFallbackMeta(matchingTxs[0].comments)!
    if (firstMeta.status !== 'IN_TRANSIT') {
      return {
        success: false,
        error: 'Este traspaso ya fue recibido o cancelado previamente.',
      }
    }

    const destLocId = await resolveStoreLocation(
      adminClient,
      firstMeta.id_dest_store,
      input.destLocationId || firstMeta.id_dest_location
    )
    const folioRef = formatFolio(firstMeta.folio)
    const inputMap = new Map((input.items ?? []).map((it) => [it.id_item, it]))

    let totalSent = 0
    let totalReceived = 0

    for (const tx of matchingTxs) {
      const meta = tryParseFallbackMeta(tx.comments)!
      const itemId = tx.id_item!
      const sentQty = Number(meta.quantity_sent ?? tx.amount_exit ?? 0)
      totalSent += sentQty

      const recInput = inputMap.get(itemId)
      const recQty = recInput
        ? Math.max(0, Math.min(sentQty, Math.round(Number(recInput.quantity_received) || 0)))
        : sentQty
      totalReceived += recQty
      const diffQty = sentQty - recQty

      let destStockBefore = 0
      if (recQty > 0) {
        const destAdj = await adjustStockInLocation(
          adminClient,
          firstMeta.id_dest_store,
          destLocId,
          itemId,
          recQty
        )
        destStockBefore = destAdj.stockBefore

        await insertTransferTransaction(adminClient, {
          id_store: firstMeta.id_dest_store,
          id_location: destLocId,
          id_item: itemId,
          id_user: profile.id,
          movim_type: 'T',
          reference: folioRef,
          amount_enrty: recQty,
          amount_exit: 0,
          cost: Number(tx.cost ?? 0),
          price: Number(tx.price ?? 0),
          concept: 'Entrada por recepción de traspaso entre sucursales',
          origin: 'TRASPASOS',
          comments: `Recepción ${folioRef} confirmada por ${receiverName}`,
          stock_before: destAdj.stockBefore,
          stock_after: destAdj.stockAfter,
        })
      }

      if (diffQty > 0 && input.discrepancyResolution === 'RETURN_TO_ORIGIN') {
        await adjustStockInLocation(
          adminClient,
          firstMeta.id_origin_store,
          firstMeta.id_origin_location,
          itemId,
          diffQty
        )
      }

      const updatedMeta: FallbackTransferMeta = {
        ...meta,
        id_dest_location: destLocId,
        status: totalReceived < totalSent ? 'PARTIAL' : 'RECEIVED',
        id_received_by: profile.id,
        received_by_name: receiverName,
        received_at: nowIso,
        reception_notes: input.receptionNotes?.trim() || null,
        quantity_received: recQty,
        stock_dest_before: destStockBefore,
        item_notes: recInput?.notes?.trim() || meta.item_notes || null,
      }

      await adminClient
        .from('transactions')
        .update({ comments: JSON.stringify(updatedMeta) })
        .eq('id_transaction', tx.id_transaction)
    }

    revalidatePath('/inventario/traspasos')
    revalidatePath('/inventario')
    revalidatePath('/inventario/movimientos')

    return { success: true }
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Ocurrió un error al recibir el traspaso.'
    return { success: false, error: message }
  }
}

/**
 * Cancela un traspaso en tránsito (o revierte un traspaso recibido si el usuario es ADMIN/MANAGER),
 * reintegrando las existencias a la sucursal de origen y registrando el movimiento en el Kardex.
 */
export async function cancelBranchTransferAction({
  transferId,
  reason,
}: {
  transferId: string
  reason: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { profile, adminClient } = await requireInventoryRole()

    if (!transferId) {
      return { success: false, error: 'Identificador de traspaso inválido.' }
    }

    const cleanReason = reason?.trim() || 'Cancelación solicitada por el usuario'
    const nowIso = new Date().toISOString()
    const userName = profile.full_name || profile.email || 'Usuario'

    const { data: existingTransfer, error: transferErr } = await adminClient
      .from('branch_transfers')
      .select('*')
      .eq('id_transfer', transferId)
      .eq('record_status', 'A')
      .maybeSingle()

    if (!transferErr && existingTransfer) {
      const transfer = existingTransfer as BranchTransfer
      if (transfer.status === 'CANCELLED') {
        return { success: false, error: 'Este traspaso ya se encuentra cancelado.' }
      }

      if (
        (transfer.status === 'RECEIVED' || transfer.status === 'PARTIAL') &&
        profile.role !== 'ADMIN' &&
        profile.role !== 'MANAGER'
      ) {
        return {
          success: false,
          error:
            'Solo un Administrador o Gerente puede cancelar y revertir un traspaso que ya fue recibido.',
        }
      }

      const { data: rawItems } = await adminClient
        .from('branch_transfer_items')
        .select('*')
        .eq('id_transfer', transfer.id_transfer)
        .eq('status', 'A')

      const transferItems = (rawItems ?? []) as BranchTransferItem[]
      const folioRef = formatFolio(transfer.folio)

      for (const tItem of transferItems) {
        const sentQty = Number(tItem.quantity_sent ?? 0)
        const recQty = Number(tItem.quantity_received ?? 0)

        // Si ya había sido recibido en destino, descontar lo recibido en destino
        if (
          (transfer.status === 'RECEIVED' || transfer.status === 'PARTIAL') &&
          recQty > 0
        ) {
          const destRevAdj = await adjustStockInLocation(
            adminClient,
            transfer.id_dest_store,
            transfer.id_dest_location,
            tItem.id_item,
            -recQty
          )

          await insertTransferTransaction(adminClient, {
            id_store: transfer.id_dest_store,
            id_location: transfer.id_dest_location,
            id_item: tItem.id_item,
            id_user: profile.id,
            movim_type: 'T',
            reference: folioRef,
            amount_enrty: 0,
            amount_exit: recQty,
            cost: Number(tItem.unit_cost ?? 0),
            price: Number(tItem.unit_price ?? 0),
            concept: `Reversión en destino por cancelación de traspaso ${folioRef}`,
            origin: 'TRASPASOS',
            comments: `Motivo: ${cleanReason}`,
            stock_before: destRevAdj.stockBefore,
            stock_after: destRevAdj.stockAfter,
          })
        }

        // Reintegrar a la sucursal de origen
        if (sentQty > 0) {
          const origRevAdj = await adjustStockInLocation(
            adminClient,
            transfer.id_origin_store,
            transfer.id_origin_location,
            tItem.id_item,
            sentQty
          )

          await insertTransferTransaction(adminClient, {
            id_store: transfer.id_origin_store,
            id_location: transfer.id_origin_location,
            id_item: tItem.id_item,
            id_user: profile.id,
            movim_type: 'T',
            reference: folioRef,
            amount_enrty: sentQty,
            amount_exit: 0,
            cost: Number(tItem.unit_cost ?? 0),
            price: Number(tItem.unit_price ?? 0),
            concept: `Reintegración a origen por cancelación de traspaso ${folioRef}`,
            origin: 'TRASPASOS',
            comments: `Motivo: ${cleanReason}`,
            stock_before: origRevAdj.stockBefore,
            stock_after: origRevAdj.stockAfter,
          })
        }
      }

      await adminClient
        .from('branch_transfers')
        .update({
          status: 'CANCELLED',
          id_cancelled_by: profile.id,
          cancelled_by_name: userName,
          cancellation_reason: cleanReason,
          cancelled_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id_transfer', transfer.id_transfer)

      revalidatePath('/inventario/traspasos')
      revalidatePath('/inventario')
      revalidatePath('/inventario/movimientos')

      return { success: true }
    }

    // Fallback en `transactions`
    const { data: fallbackTxs } = await adminClient
      .from('transactions')
      .select('*')
      .eq('origin', 'TRASPASOS')
      .order('date_transaction', { ascending: false })
      .limit(200)

    const matchingTxs = ((fallbackTxs ?? []) as Transaction[]).filter((tx) => {
      const m = tryParseFallbackMeta(tx.comments)
      return m && m.id_transfer === transferId
    })

    if (matchingTxs.length === 0) {
      return { success: false, error: 'No se encontró el traspaso a cancelar.' }
    }

    for (const tx of matchingTxs) {
      const meta = tryParseFallbackMeta(tx.comments)!
      if (meta.status === 'CANCELLED') {
        return { success: false, error: 'Este traspaso ya se encuentra cancelado.' }
      }

      const itemId = tx.id_item!
      const sentQty = Number(meta.quantity_sent ?? tx.amount_exit ?? 0)
      const recQty = Number(meta.quantity_received ?? 0)

      if ((meta.status === 'RECEIVED' || meta.status === 'PARTIAL') && recQty > 0) {
        await adjustStockInLocation(
          adminClient,
          meta.id_dest_store,
          meta.id_dest_location,
          itemId,
          -recQty
        )
      }

      if (sentQty > 0) {
        await adjustStockInLocation(
          adminClient,
          meta.id_origin_store,
          meta.id_origin_location,
          itemId,
          sentQty
        )
      }

      const updatedMeta: FallbackTransferMeta = {
        ...meta,
        status: 'CANCELLED',
        id_cancelled_by: profile.id,
        cancelled_by_name: userName,
        cancellation_reason: cleanReason,
        cancelled_at: nowIso,
      }

      await adminClient
        .from('transactions')
        .update({ comments: JSON.stringify(updatedMeta) })
        .eq('id_transaction', tx.id_transaction)
    }

    revalidatePath('/inventario/traspasos')
    revalidatePath('/inventario')
    revalidatePath('/inventario/movimientos')

    return { success: true }
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Ocurrió un error al cancelar el traspaso.'
    return { success: false, error: message }
  }
}

/**
 * Eliminación lógica (`record_status = 'I'`) de un registro de traspaso cancelado.
 * Cumple con la regla crítica: Jamás usar DELETE FROM en tablas de negocio.
 */
export async function deleteBranchTransferAction(
  transferId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { profile, adminClient } = await requireInventoryRole()

    if (profile.role !== 'ADMIN' && profile.role !== 'MANAGER') {
      return {
        success: false,
        error: 'Solo un Administrador o Gerente puede archivar registros de traspasos.',
      }
    }

    const { data: existingTransfer, error: transferErr } = await adminClient
      .from('branch_transfers')
      .select('id_transfer, status')
      .eq('id_transfer', transferId)
      .maybeSingle()

    if (!transferErr && existingTransfer) {
      if (existingTransfer.status !== 'CANCELLED') {
        return {
          success: false,
          error: 'Primero debes cancelar el traspaso antes de poder eliminarlo lógicamente.',
        }
      }

      await adminClient
        .from('branch_transfers')
        .update({
          record_status: 'I',
          updated_at: new Date().toISOString(),
        })
        .eq('id_transfer', transferId)

      await adminClient
        .from('branch_transfer_items')
        .update({ status: 'I' })
        .eq('id_transfer', transferId)

      revalidatePath('/inventario/traspasos')
      return { success: true }
    }

    // Fallback en `transactions`
    const { data: fallbackTxs } = await adminClient
      .from('transactions')
      .select('*')
      .eq('origin', 'TRASPASOS')
      .limit(200)

    const matchingTxs = ((fallbackTxs ?? []) as Transaction[]).filter((tx) => {
      const m = tryParseFallbackMeta(tx.comments)
      return m && m.id_transfer === transferId
    })

    for (const tx of matchingTxs) {
      const meta = tryParseFallbackMeta(tx.comments)!
      if (meta.status !== 'CANCELLED') {
        return {
          success: false,
          error: 'Primero debes cancelar el traspaso antes de poder eliminarlo lógicamente.',
        }
      }
      const updatedMeta: FallbackTransferMeta = {
        ...meta,
        record_status: 'I',
      }
      await adminClient
        .from('transactions')
        .update({ comments: JSON.stringify(updatedMeta) })
        .eq('id_transaction', tx.id_transaction)
    }

    revalidatePath('/inventario/traspasos')
    return { success: true }
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Ocurrió un error al eliminar el registro.'
    return { success: false, error: message }
  }
}
