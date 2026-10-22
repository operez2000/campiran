'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { getAuthenticatedProfile } from '@/lib/auth-profile'
import {
  type Purchase,
  type PurchaseItem,
  type PurchasePayment,
  type PurchaseCondition,
  type PurchasePaymentStatus,
  type PurchaseStatus,
  type Supplier,
  type Location,
  type Item,
  type Stock,
  type Profile,
} from '@/lib/types'

export interface CreatePurchaseLineInput {
  id_item: string
  quantity: number
  previous_cost: number
  unit_cost: number
  tax_percent: number
  discount_amount?: number
  new_price1?: number | null
}

export interface CreatePurchaseInput {
  storeId: string
  locationId: string | null
  supplierId: string | null
  invoiceNumber: string
  purchaseCondition: PurchaseCondition
  paymentMethod: string
  creditDays: number
  initialPayment: number
  purchaseStatus: 'DRAFT' | 'RECEIVED'
  updateItemCost: boolean
  notes: string
  items: CreatePurchaseLineInput[]
}

/**
 * Verifica que el usuario tenga sesión activa y rol ADMIN o MANAGER.
 */
async function requirePurchaseRole(): Promise<{
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

  if (profile.role !== 'ADMIN' && profile.role !== 'MANAGER') {
    throw new Error(
      'Acceso restringido: Solo usuarios Administrador (ADMIN) y Gerente (MANAGER) pueden registrar o administrar compras.'
    )
  }

  const adminClient = createAdminClient()
  return { profile, adminClient }
}

/**
 * Garantiza que exista una ubicación de almacén activa para la sucursal
 */
async function resolveStoreLocation(
  adminClient: ReturnType<typeof createAdminClient>,
  storeId: string,
  requestedLocationId: string | null
): Promise<string | null> {
  if (requestedLocationId) return requestedLocationId

  const { data: existingLoc } = await adminClient
    .from('locations')
    .select('id_location')
    .eq('id_store', storeId)
    .eq('status', 'A')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (existingLoc?.id_location) {
    return existingLoc.id_location
  }

  // Crear ubicación general por defecto para la sucursal si no existe ninguna
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
 * Inserta un movimiento en `transactions` (Kardex) intentando primero con las columnas
 * extendidas (`stock_before`, `stock_after`, `id_purchase`, `id_supplier`) y haciendo
 * fallback automático al schema base si la migración 017 aún no se ha corrido en Supabase.
 */
async function insertKardexTransaction(
  adminClient: ReturnType<typeof createAdminClient>,
  txPayload: {
    id_store: string
    id_location: string | null
    id_item: string
    id_user: string | null
    movim_type: 'E' | 'S' | 'V' | 'I' | 'A'
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
    id_purchase?: string | null
    id_supplier?: string | null
  }
) {
  const nowIso = new Date().toISOString()

  // 1. Intentar con columnas extendidas de Kardex
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
    id_purchase: txPayload.id_purchase ?? null,
    id_supplier: txPayload.id_supplier ?? null,
  })

  if (!extError) return

  // 2. Fallback a las columnas base de `transactions`
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
 * Afecta existencias (`stocks`), costos (`items` + `price_history`) y Kardex (`transactions`)
 * para las partidas de una compra recibida.
 */
async function applyPurchaseInventoryAndKardex({
  adminClient,
  storeId,
  locationId,
  supplierId,
  supplierName,
  userId,
  purchaseId,
  purchaseNumber,
  invoiceNumber,
  updateItemCost,
  lines,
}: {
  adminClient: ReturnType<typeof createAdminClient>
  storeId: string
  locationId: string | null
  supplierId: string | null
  supplierName: string | null
  userId: string
  purchaseId: string | null
  purchaseNumber: number
  invoiceNumber: string | null
  updateItemCost: boolean
  lines: CreatePurchaseLineInput[]
}): Promise<Array<CreatePurchaseLineInput & { stock_before: number; stock_after: number }>> {
  const targetLocationId = await resolveStoreLocation(adminClient, storeId, locationId)
  const processedLines: Array<
    CreatePurchaseLineInput & { stock_before: number; stock_after: number }
  > = []

  const refLabel = invoiceNumber
    ? `COMPRA-#${purchaseNumber} (Fact: ${invoiceNumber})`
    : `COMPRA-#${purchaseNumber}`

  for (const line of lines) {
    const qty = Math.max(1, Math.round(Number(line.quantity) || 1))
    const newUnitCost = Number(line.unit_cost) || 0

    // 1. Consultar artículo actual
    const { data: itemRow } = await adminClient
      .from('items')
      .select('id_item, cost, last_cost, price, price1, tax')
      .eq('id_item', line.id_item)
      .maybeSingle()

    const prevCost = Number(itemRow?.cost ?? line.previous_cost ?? 0)
    const currentSalePrice = Number(itemRow?.price1 ?? itemRow?.price ?? 0)
    const effectiveSalePrice =
      line.new_price1 && Number(line.new_price1) > 0
        ? Number(line.new_price1)
        : currentSalePrice

    // 2. Consultar existencia actual en `stocks` para la sucursal
    let stockQuery = adminClient
      .from('stocks')
      .select('id_stock, current, id_location')
      .eq('id_store', storeId)
      .eq('id_item', line.id_item)

    if (targetLocationId) {
      stockQuery = stockQuery.eq('id_location', targetLocationId)
    }

    let { data: stockEntry } = await stockQuery.limit(1).maybeSingle()

    // Si no encontró en la ubicación específica, buscar cualquier registro del artículo en la sucursal
    if (!stockEntry) {
      const { data: anyStoreStock } = await adminClient
        .from('stocks')
        .select('id_stock, current, id_location')
        .eq('id_store', storeId)
        .eq('id_item', line.id_item)
        .limit(1)
        .maybeSingle()
      stockEntry = anyStoreStock
    }

    const stockBefore = Number(stockEntry?.current ?? 0)
    const stockAfter = stockBefore + qty
    const effectiveLocId = stockEntry?.id_location ?? targetLocationId

    if (stockEntry?.id_stock) {
      await adminClient
        .from('stocks')
        .update({
          previous: stockBefore,
          current: stockAfter,
          ...(targetLocationId && !stockEntry.id_location
            ? { id_location: targetLocationId }
            : {}),
        })
        .eq('id_stock', stockEntry.id_stock)
    } else {
      await adminClient.from('stocks').insert({
        id_item: line.id_item,
        id_store: storeId,
        id_location: effectiveLocId,
        initial: qty,
        previous: 0,
        current: qty,
        minimum: 5,
        maximum: 100,
        reorder_point: 10,
      })
    }

    // 3. Actualizar costo (y opcionalmente precio de venta) en `items` + registrar en `price_history`
    if (updateItemCost || (line.new_price1 && Number(line.new_price1) > 0)) {
      const itemUpdatePayload: Record<string, unknown> = {}
      if (updateItemCost && newUnitCost > 0) {
        itemUpdatePayload.last_cost = prevCost
        itemUpdatePayload.cost = newUnitCost
      }
      if (line.new_price1 && Number(line.new_price1) > 0) {
        itemUpdatePayload.price = Number(line.new_price1)
        itemUpdatePayload.price1 = Number(line.new_price1)
      }

      if (Object.keys(itemUpdatePayload).length > 0) {
        await adminClient
          .from('items')
          .update(itemUpdatePayload)
          .eq('id_item', line.id_item)

        // Registrar trazabilidad en `price_history`
        await adminClient.from('price_history').insert({
          id_item: line.id_item,
          price: effectiveSalePrice,
          cost: newUnitCost,
          tax: Number(line.tax_percent ?? itemRow?.tax ?? 8),
          price_type: 'COMPRA',
          valid_from: new Date().toISOString(),
          changed_by: userId,
          comments: `${refLabel} | Costo ant: $${prevCost.toFixed(2)} → Nuevo: $${newUnitCost.toFixed(2)}`,
        })
      }
    }

    // 4. Registrar movimiento de entrada en el Kardex (`transactions`)
    const kardexComments = [
      `[Saldo: ${stockBefore} → ${stockAfter}]`,
      supplierName ? `Prov: ${supplierName}` : null,
      `Costo Ant: $${prevCost.toFixed(2)} → Compra: $${newUnitCost.toFixed(2)}`,
    ]
      .filter(Boolean)
      .join(' | ')

    await insertKardexTransaction(adminClient, {
      id_store: storeId,
      id_location: effectiveLocId,
      id_item: line.id_item,
      id_user: userId,
      movim_type: 'E',
      reference: refLabel,
      amount_enrty: qty,
      amount_exit: 0,
      cost: newUnitCost,
      price: effectiveSalePrice,
      concept: supplierName
        ? `Compra a Proveedor: ${supplierName}`
        : 'Entrada por Compra de Mercancía',
      origin: 'COMPRAS',
      comments: kardexComments,
      stock_before: stockBefore,
      stock_after: stockAfter,
      id_purchase: purchaseId,
      id_supplier: supplierId,
    })

    processedLines.push({
      ...line,
      quantity: qty,
      previous_cost: prevCost,
      unit_cost: newUnitCost,
      stock_before: stockBefore,
      stock_after: stockAfter,
    })
  }

  return processedLines
}

/**
 * Obtiene todos los datos necesarios para el módulo de Compras en tiempo real:
 * - Historial de compras con partidas y pagos
 * - Proveedores activos
 * - Ubicaciones activas de la sucursal
 * - Catálogo de artículos activos con sus existencias actuales en la sucursal
 */
export async function getPurchasesDataAction(storeId: string): Promise<{
  purchases: Purchase[]
  suppliers: Supplier[]
  locations: Location[]
  items: Item[]
  stocks: Stock[]
  migrationReady: boolean
}> {
  const { adminClient } = await requirePurchaseRole()

  const [suppliersRes, locationsRes, itemsRes, stocksRes] = await Promise.all([
    adminClient
      .from('suppliers')
      .select('*')
      .eq('status', 'A')
      .order('supplier_name', { ascending: true }),
    adminClient
      .from('locations')
      .select('*')
      .eq('id_store', storeId)
      .eq('status', 'A')
      .order('description', { ascending: true }),
    adminClient
      .from('items')
      .select('*, category:categories(description)')
      .eq('status', 'A')
      .order('description', { ascending: true }),
    adminClient
      .from('stocks')
      .select('*')
      .eq('id_store', storeId),
  ])

  const suppliers = (suppliersRes.data ?? []) as Supplier[]
  const locations = (locationsRes.data ?? []) as Location[]
  const items = (itemsRes.data ?? []) as unknown as Item[]
  const stocks = (stocksRes.data ?? []) as Stock[]

  const suppliersMap = new Map(suppliers.map((s) => [s.id_supplier, s]))
  const locationsMap = new Map(locations.map((l) => [l.id_location, l]))
  const itemsMap = new Map(items.map((it) => [it.id_item, it]))

  // Intentar consultar tabla `purchases`
  const { data: rawPurchases, error: purchasesError } = await adminClient
    .from('purchases')
    .select('*')
    .eq('id_store', storeId)
    .eq('status', 'A')
    .order('created_at', { ascending: false })
    .limit(200)

  if (!purchasesError && rawPurchases) {
    const purchaseList = rawPurchases as Purchase[]
    const purchaseIds = purchaseList.map((p) => p.id_purchase)

    const [pItemsRes, pPaymentsRes] =
      purchaseIds.length > 0
        ? await Promise.all([
            adminClient
              .from('purchase_items')
              .select('*')
              .in('id_purchase', purchaseIds)
              .order('created_at', { ascending: true }),
            adminClient
              .from('purchase_payments')
              .select('*')
              .in('id_purchase', purchaseIds)
              .eq('status', 'A')
              .order('payment_date', { ascending: false }),
          ])
        : [{ data: [] }, { data: [] }]

    const itemsByPurchase = new Map<string, PurchaseItem[]>()
    for (const pi of (pItemsRes.data ?? []) as PurchaseItem[]) {
      const hydrated: PurchaseItem = {
        ...pi,
        item: itemsMap.get(pi.id_item),
      }
      const arr = itemsByPurchase.get(pi.id_purchase) ?? []
      arr.push(hydrated)
      itemsByPurchase.set(pi.id_purchase, arr)
    }

    const paymentsByPurchase = new Map<string, PurchasePayment[]>()
    for (const pay of (pPaymentsRes.data ?? []) as PurchasePayment[]) {
      const hydratedPay: PurchasePayment = {
        ...pay,
        supplier: pay.id_supplier ? suppliersMap.get(pay.id_supplier) : undefined,
      }
      const arr = paymentsByPurchase.get(pay.id_purchase) ?? []
      arr.push(hydratedPay)
      paymentsByPurchase.set(pay.id_purchase, arr)
    }

    const hydratedPurchases: Purchase[] = purchaseList.map((p) => ({
      ...p,
      supplier: p.id_supplier ? suppliersMap.get(p.id_supplier) : undefined,
      location: p.id_location ? locationsMap.get(p.id_location) : undefined,
      purchase_items: itemsByPurchase.get(p.id_purchase) ?? [],
      purchase_payments: paymentsByPurchase.get(p.id_purchase) ?? [],
    }))

    return {
      purchases: hydratedPurchases,
      suppliers,
      locations,
      items,
      stocks,
      migrationReady: true,
    }
  }

  // Fallback: Reconstruir historial de compras desde `transactions` con `origin = 'COMPRAS'`
  // en caso de que la tabla `purchases` aún no haya sido creada en Supabase
  const { data: fallbackTxs } = await adminClient
    .from('transactions')
    .select('*')
    .eq('id_store', storeId)
    .eq('origin', 'COMPRAS')
    .eq('movim_type', 'E')
    .order('date_transaction', { ascending: false })
    .limit(150)

  const groupedByRef = new Map<string, Purchase>()
  let fallbackCounter = 1001

  for (const tx of fallbackTxs ?? []) {
    const ref = tx.reference || `COMPRA-${tx.id_transaction.slice(0, 6)}`
    const qty = Number(tx.amount_enrty || 1)
    const unitCost = Number(tx.cost || 0)
    const itemObj = tx.id_item ? itemsMap.get(tx.id_item) : undefined
    const taxPct = Number(itemObj?.tax ?? 8)
    const lineSub = qty * unitCost
    const lineTax = lineSub * (taxPct / 100)
    const lineTotal = lineSub + lineTax

    // Extraer [Saldo: before → after] o KARDEX[before->after] de comments si existe
    let stockBefore = Number(tx.stock_before ?? 0)
    let stockAfter = Number(tx.stock_after ?? 0)
    const commStr = String(tx.comments || '')
    const matchSaldo = commStr.match(/\[Saldo:\s*(-?\d+)\s*→\s*(-?\d+)\]/)
    const matchKardex = commStr.match(/KARDEX\[(-?\d+)->(-?\d+)\]/)
    const match = matchSaldo || matchKardex
    if (match) {
      stockBefore = Number(match[1])
      stockAfter = Number(match[2])
    }

    const lineItem: PurchaseItem = {
      id_purchase_item: tx.id_transaction,
      id_purchase: ref,
      id_item: tx.id_item,
      quantity: qty,
      previous_cost: unitCost,
      unit_cost: unitCost,
      tax_percent: taxPct,
      tax_amount: lineTax,
      discount_amount: 0,
      subtotal: lineSub,
      total_cost: lineTotal,
      stock_before: stockBefore,
      stock_after: stockAfter,
      item: itemObj,
    }

    const existing = groupedByRef.get(ref)
    if (existing) {
      existing.subtotal += lineSub
      existing.tax_amount += lineTax
      existing.total_amount += lineTotal
      existing.paid_amount += lineTotal
      existing.purchase_items?.push(lineItem)
    } else {
      groupedByRef.set(ref, {
        id_purchase: ref,
        purchase_number: fallbackCounter++,
        id_store: storeId,
        id_location: tx.id_location,
        id_supplier: tx.id_supplier ?? null,
        id_user: tx.id_user,
        invoice_number: ref,
        purchase_date: tx.date_transaction,
        received_at: tx.date_transaction,
        cancelled_at: null,
        cancelled_by: null,
        payment_condition: 'CONTADO',
        payment_method: '01',
        payment_status: 'PAID',
        credit_days: 0,
        due_date: null,
        subtotal: lineSub,
        discount_amount: 0,
        tax_amount: lineTax,
        total_amount: lineTotal,
        paid_amount: lineTotal,
        balance_due: 0,
        update_item_cost: true,
        notes: tx.concept,
        purchase_status: 'RECEIVED',
        status: 'A',
        created_at: tx.date_transaction,
        updated_at: tx.date_transaction,
        location: tx.id_location ? locationsMap.get(tx.id_location) : undefined,
        purchase_items: [lineItem],
        purchase_payments: [],
      })
    }
  }

  return {
    purchases: Array.from(groupedByRef.values()),
    suppliers,
    locations,
    items,
    stocks,
    migrationReady: false,
  }
}

/**
 * Registra una nueva compra (Entrada Directa o Borrador/Orden Pendiente).
 * Exclusivo para ADMIN y MANAGER.
 */
export async function createPurchaseAction(
  input: CreatePurchaseInput
): Promise<{ success: boolean; purchase?: Purchase; error?: string }> {
  try {
    const { profile, adminClient } = await requirePurchaseRole()

    if (!input.storeId) {
      return { success: false, error: 'Debes tener una sucursal activa seleccionada.' }
    }
    if (!input.items || input.items.length === 0) {
      return { success: false, error: 'Agrega al menos un artículo a la compra.' }
    }

    const targetLocationId = await resolveStoreLocation(
      adminClient,
      input.storeId,
      input.locationId
    )

    // Obtener información del proveedor si fue seleccionado
    let supplierObj: Supplier | null = null
    if (input.supplierId) {
      const { data: sup } = await adminClient
        .from('suppliers')
        .select('*')
        .eq('id_supplier', input.supplierId)
        .maybeSingle()
      if (sup) supplierObj = sup as Supplier
    }

    // Calcular totales de la compra
    let subtotal = 0
    let discountAmount = 0
    let taxAmount = 0

    const preparedLines = input.items.map((line) => {
      const qty = Math.max(1, Number(line.quantity) || 1)
      const cost = Math.max(0, Number(line.unit_cost) || 0)
      const disc = Math.max(0, Number(line.discount_amount) || 0)
      const taxPct = Math.max(0, Number(line.tax_percent) || 0)

      const lineSub = Math.max(0, qty * cost - disc)
      const lineTax = lineSub * (taxPct / 100)
      const lineTotal = lineSub + lineTax

      subtotal += lineSub
      discountAmount += disc
      taxAmount += lineTax

      return {
        ...line,
        quantity: qty,
        unit_cost: cost,
        discount_amount: disc,
        tax_percent: taxPct,
        subtotal: lineSub,
        tax_amount: lineTax,
        total_cost: lineTotal,
      }
    })

    const totalAmount = subtotal + taxAmount
    const isCredit = input.purchaseCondition === 'CREDITO'
    const creditDays = isCredit
      ? Number(input.creditDays || supplierObj?.credit_days || 0)
      : 0

    let dueDate: string | null = null
    if (isCredit && creditDays > 0) {
      const d = new Date()
      d.setDate(d.getDate() + creditDays)
      dueDate = d.toISOString()
    }

    const paidAmount = isCredit
      ? Math.min(totalAmount, Math.max(0, Number(input.initialPayment) || 0))
      : totalAmount
    const balanceDue = Math.max(0, totalAmount - paidAmount)

    const paymentStatus: PurchasePaymentStatus =
      balanceDue <= 0.01 ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'PENDING'

    const nowIso = new Date().toISOString()

    // 1. Intentar insertar en `public.purchases`
    const { data: insertedPurchase, error: purchaseErr } = await adminClient
      .from('purchases')
      .insert({
        id_store: input.storeId,
        id_location: targetLocationId,
        id_supplier: input.supplierId || null,
        id_user: profile.id,
        invoice_number: input.invoiceNumber?.trim() || null,
        purchase_date: nowIso,
        received_at: input.purchaseStatus === 'RECEIVED' ? nowIso : null,
        payment_condition: input.purchaseCondition,
        payment_method: isCredit ? '99' : input.paymentMethod || '01',
        payment_status: paymentStatus,
        credit_days: creditDays,
        due_date: dueDate,
        subtotal,
        discount_amount: discountAmount,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        paid_amount: paidAmount,
        balance_due: balanceDue,
        update_item_cost: input.updateItemCost,
        notes: input.notes?.trim() || null,
        purchase_status: input.purchaseStatus,
        status: 'A',
      })
      .select()
      .single()

    const purchaseId = insertedPurchase?.id_purchase ?? null
    const purchaseNumber =
      insertedPurchase?.purchase_number ?? Math.floor(1000 + Math.random() * 9000)

    // 2. Si el estado es 'RECEIVED', afectar existencias (`stocks`), costos (`items`) y Kardex (`transactions`)
    let kardexLines: Array<
      CreatePurchaseLineInput & { stock_before: number; stock_after: number }
    > = []

    if (input.purchaseStatus === 'RECEIVED') {
      kardexLines = await applyPurchaseInventoryAndKardex({
        adminClient,
        storeId: input.storeId,
        locationId: targetLocationId,
        supplierId: input.supplierId || null,
        supplierName: supplierObj?.supplier_name ?? null,
        userId: profile.id,
        purchaseId,
        purchaseNumber,
        invoiceNumber: input.invoiceNumber?.trim() || null,
        updateItemCost: input.updateItemCost,
        lines: preparedLines,
      })
    } else {
      // Si es Borrador/Orden Pendiente, obtener el stock actual solo como referencia inicial
      for (const line of preparedLines) {
        const { data: st } = await adminClient
          .from('stocks')
          .select('current')
          .eq('id_store', input.storeId)
          .eq('id_item', line.id_item)
          .limit(1)
          .maybeSingle()
        const cur = Number(st?.current ?? 0)
        kardexLines.push({
          ...line,
          stock_before: cur,
          stock_after: cur + line.quantity,
        })
      }
    }

    // 3. Si la tabla `purchases` existe, insertar partidas en `purchase_items` y pago inicial en `purchase_payments`
    if (purchaseId && !purchaseErr) {
      const itemsToInsert = preparedLines.map((line, idx) => {
        const kLine = kardexLines[idx]
        return {
          id_purchase: purchaseId,
          id_item: line.id_item,
          quantity: line.quantity,
          previous_cost: kLine?.previous_cost ?? line.previous_cost ?? 0,
          unit_cost: line.unit_cost,
          tax_percent: line.tax_percent,
          tax_amount: line.tax_amount,
          discount_amount: line.discount_amount,
          subtotal: line.subtotal,
          total_cost: line.total_cost,
          stock_before: kLine?.stock_before ?? 0,
          stock_after: kLine?.stock_after ?? line.quantity,
          new_price1: line.new_price1 ?? null,
        }
      })

      await adminClient.from('purchase_items').insert(itemsToInsert)

      if (paidAmount > 0) {
        await adminClient.from('purchase_payments').insert({
          id_purchase: purchaseId,
          id_store: input.storeId,
          id_supplier: input.supplierId || null,
          id_user: profile.id,
          amount: paidAmount,
          payment_method: input.paymentMethod || '01',
          reference: input.invoiceNumber?.trim() || `PAGO-COMPRA-#${purchaseNumber}`,
          notes: isCredit ? 'Abono inicial al registrar compra' : 'Pago de contado',
          payment_date: nowIso,
          status: 'A',
        })
      }
    }

    revalidatePath('/compras')
    revalidatePath('/inventario')
    revalidatePath('/inventario/movimientos')
    revalidatePath('/catalogo/items')

    return {
      success: true,
      purchase: (insertedPurchase as Purchase) ?? undefined,
    }
  } catch (err) {
    console.error('[createPurchaseAction] Error:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error inesperado al registrar la compra',
    }
  }
}

/**
 * Confirma la recepción física de una Orden de Compra que estaba en estado 'DRAFT' (Pendiente),
 * afectando existencias (`stocks`), costos (`items`) y el Kardex (`transactions`) en tiempo real.
 */
export async function receiveDraftPurchaseAction(
  purchaseId: string,
  storeId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { profile, adminClient } = await requirePurchaseRole()

    const { data: purchase, error: pErr } = await adminClient
      .from('purchases')
      .select('*, supplier:suppliers(supplier_name)')
      .eq('id_purchase', purchaseId)
      .eq('id_store', storeId)
      .single()

    if (pErr || !purchase) {
      return { success: false, error: 'No se encontró la orden de compra.' }
    }

    if (purchase.purchase_status === 'RECEIVED') {
      return { success: false, error: 'Esta compra ya fue recibida en el almacén.' }
    }
    if (purchase.purchase_status === 'CANCELLED') {
      return { success: false, error: 'No se puede recibir una compra cancelada.' }
    }

    const { data: pItems } = await adminClient
      .from('purchase_items')
      .select('*')
      .eq('id_purchase', purchaseId)

    const itemsList = (pItems ?? []) as PurchaseItem[]
    if (itemsList.length === 0) {
      return { success: false, error: 'La orden de compra no contiene partidas.' }
    }

    const supplierName =
      (purchase.supplier as { supplier_name?: string } | null)?.supplier_name ?? null

    const processed = await applyPurchaseInventoryAndKardex({
      adminClient,
      storeId,
      locationId: purchase.id_location,
      supplierId: purchase.id_supplier,
      supplierName,
      userId: profile.id,
      purchaseId: purchase.id_purchase,
      purchaseNumber: purchase.purchase_number,
      invoiceNumber: purchase.invoice_number,
      updateItemCost: Boolean(purchase.update_item_cost),
      lines: itemsList.map((it) => ({
        id_item: it.id_item,
        quantity: Number(it.quantity),
        previous_cost: Number(it.previous_cost),
        unit_cost: Number(it.unit_cost),
        tax_percent: Number(it.tax_percent),
        discount_amount: Number(it.discount_amount),
        new_price1: it.new_price1,
      })),
    })

    // Actualizar stock_before y stock_after en cada partida
    for (let i = 0; i < itemsList.length; i++) {
      const k = processed[i]
      if (k) {
        await adminClient
          .from('purchase_items')
          .update({
            stock_before: k.stock_before,
            stock_after: k.stock_after,
          })
          .eq('id_purchase_item', itemsList[i].id_purchase_item)
      }
    }

    // Marcar la compra como RECEIVED
    const nowIso = new Date().toISOString()
    await adminClient
      .from('purchases')
      .update({
        purchase_status: 'RECEIVED',
        received_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id_purchase', purchaseId)

    revalidatePath('/compras')
    revalidatePath('/inventario')
    revalidatePath('/inventario/movimientos')
    revalidatePath('/catalogo/items')

    return { success: true }
  } catch (err) {
    console.error('[receiveDraftPurchaseAction] Error:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error al recibir la mercancía',
    }
  }
}

/**
 * Registra un pago o abono a una compra a crédito (Cuentas por Pagar).
 */
export async function registerPurchasePaymentAction({
  purchaseId,
  storeId,
  amount,
  paymentMethod,
  reference,
  notes,
}: {
  purchaseId: string
  storeId: string
  amount: number
  paymentMethod: string
  reference?: string
  notes?: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { profile, adminClient } = await requirePurchaseRole()

    const payAmount = Number(amount) || 0
    if (payAmount <= 0) {
      return { success: false, error: 'El monto del abono debe ser mayor a $0.00' }
    }

    const { data: purchase, error: pErr } = await adminClient
      .from('purchases')
      .select('*')
      .eq('id_purchase', purchaseId)
      .eq('id_store', storeId)
      .single()

    if (pErr || !purchase) {
      return { success: false, error: 'No se encontró la compra especificada.' }
    }

    if (purchase.purchase_status === 'CANCELLED') {
      return { success: false, error: 'No se pueden registrar pagos en una compra cancelada.' }
    }

    const currentBalance = Number(purchase.balance_due || 0)
    if (payAmount > currentBalance + 0.05) {
      return {
        success: false,
        error: `El abono excede el saldo pendiente de la compra ($${currentBalance.toFixed(2)}).`,
      }
    }

    const nowIso = new Date().toISOString()

    // 1. Insertar abono en `purchase_payments`
    const { error: insertPayErr } = await adminClient
      .from('purchase_payments')
      .insert({
        id_purchase: purchaseId,
        id_store: storeId,
        id_supplier: purchase.id_supplier,
        id_user: profile.id,
        amount: payAmount,
        payment_method: paymentMethod || '03',
        reference: reference?.trim() || `ABONO-COMPRA-#${purchase.purchase_number}`,
        notes: notes?.trim() || null,
        payment_date: nowIso,
        status: 'A',
      })

    if (insertPayErr) {
      return { success: false, error: 'Error al guardar el pago: ' + insertPayErr.message }
    }

    // 2. Actualizar saldo de la compra
    const newPaid = Number(purchase.paid_amount || 0) + payAmount
    const newBalance = Math.max(0, Number(purchase.total_amount || 0) - newPaid)
    const newPaymentStatus: PurchasePaymentStatus =
      newBalance <= 0.01 ? 'PAID' : 'PARTIAL'

    await adminClient
      .from('purchases')
      .update({
        paid_amount: newPaid,
        balance_due: newBalance,
        payment_status: newPaymentStatus,
        updated_at: nowIso,
      })
      .eq('id_purchase', purchaseId)

    revalidatePath('/compras')
    return { success: true }
  } catch (err) {
    console.error('[registerPurchasePaymentAction] Error:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error al registrar el abono',
    }
  }
}

/**
 * Cancela lógicamente una compra. Si la compra ya había sido recibida ('RECEIVED'),
 * revierte las existencias en `stocks` y registra la salida correspondiente en el Kardex (`transactions`).
 */
export async function cancelPurchaseAction({
  purchaseId,
  storeId,
  reason,
}: {
  purchaseId: string
  storeId: string
  reason?: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { profile, adminClient } = await requirePurchaseRole()

    const { data: purchase, error: pErr } = await adminClient
      .from('purchases')
      .select('*, supplier:suppliers(supplier_name)')
      .eq('id_purchase', purchaseId)
      .eq('id_store', storeId)
      .single()

    if (pErr || !purchase) {
      return { success: false, error: 'No se encontró la compra a cancelar.' }
    }

    if (purchase.purchase_status === 'CANCELLED') {
      return { success: false, error: 'Esta compra ya se encuentra cancelada.' }
    }

    const wasReceived = purchase.purchase_status === 'RECEIVED'

    if (wasReceived) {
      const { data: pItems } = await adminClient
        .from('purchase_items')
        .select('*')
        .eq('id_purchase', purchaseId)

      const itemsList = (pItems ?? []) as PurchaseItem[]

      for (const line of itemsList) {
        const qty = Math.max(1, Math.round(Number(line.quantity) || 1))

        let stockQuery = adminClient
          .from('stocks')
          .select('id_stock, current, id_location')
          .eq('id_store', storeId)
          .eq('id_item', line.id_item)

        if (purchase.id_location) {
          stockQuery = stockQuery.eq('id_location', purchase.id_location)
        }

        let { data: stockEntry } = await stockQuery.limit(1).maybeSingle()
        if (!stockEntry) {
          const { data: anyStock } = await adminClient
            .from('stocks')
            .select('id_stock, current, id_location')
            .eq('id_store', storeId)
            .eq('id_item', line.id_item)
            .limit(1)
            .maybeSingle()
          stockEntry = anyStock
        }

        const stockBefore = Number(stockEntry?.current ?? 0)
        const stockAfter = Math.max(0, stockBefore - qty)

        if (stockEntry?.id_stock) {
          await adminClient
            .from('stocks')
            .update({
              previous: stockBefore,
              current: stockAfter,
            })
            .eq('id_stock', stockEntry.id_stock)
        }

        await insertKardexTransaction(adminClient, {
          id_store: storeId,
          id_location: stockEntry?.id_location ?? purchase.id_location,
          id_item: line.id_item,
          id_user: profile.id,
          movim_type: 'S',
          reference: `CANC-COMPRA-#${purchase.purchase_number}`,
          amount_enrty: 0,
          amount_exit: qty,
          cost: Number(line.unit_cost || 0),
          price: 0,
          concept: `Reversión por Cancelación de Compra #${purchase.purchase_number}`,
          origin: 'COMPRAS',
          comments: `[Saldo: ${stockBefore} → ${stockAfter}] | Motivo: ${reason?.trim() || 'Cancelación de compra'}`,
          stock_before: stockBefore,
          stock_after: stockAfter,
          id_purchase: purchase.id_purchase,
          id_supplier: purchase.id_supplier,
        })
      }
    }

    const nowIso = new Date().toISOString()
    await adminClient
      .from('purchases')
      .update({
        purchase_status: 'CANCELLED' as PurchaseStatus,
        cancelled_at: nowIso,
        cancelled_by: profile.id,
        balance_due: 0,
        notes: reason?.trim()
          ? `${purchase.notes ? purchase.notes + ' | ' : ''}Cancelada: ${reason.trim()}`
          : purchase.notes,
        updated_at: nowIso,
      })
      .eq('id_purchase', purchaseId)

    revalidatePath('/compras')
    revalidatePath('/inventario')
    revalidatePath('/inventario/movimientos')

    return { success: true }
  } catch (err) {
    console.error('[cancelPurchaseAction] Error:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error al cancelar la compra',
    }
  }
}
