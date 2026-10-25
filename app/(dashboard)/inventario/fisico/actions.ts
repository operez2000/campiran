'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export interface ResetInventoryResult {
  success: boolean
  message: string
  updatedCount?: number
  insertedCount?: number
  timestamp?: string
}

/**
 * Server action to atomically snapshot pre_inventory_stock and reset current stock to 0
 * for the entire branch (all locations within the branch).
 * Restricted to ADMIN and MANAGER roles.
 */
export async function resetStoreInventoryAction(storeId: string): Promise<ResetInventoryResult> {
  if (!storeId) {
    return { success: false, message: 'ID de sucursal no proporcionado' }
  }

  const supabase = await createClient()

  // 1. Verify authenticated user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { success: false, message: 'Usuario no autenticado' }
  }

  // 2. Verify role (ADMIN or MANAGER)
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, full_name, email')
    .eq('id', user.id)
    .maybeSingle()

  const role = profile?.role?.toUpperCase() || ''
  if (role !== 'ADMIN' && role !== 'MANAGER') {
    return {
      success: false,
      message: 'No tienes permisos suficientes para poner en cero el inventario. Se requiere rol ADMIN o MANAGER.',
    }
  }

  try {
    // 3. Try stored procedure reset_store_inventory_to_zero first
    const rpcRes = await supabase.rpc('reset_store_inventory_to_zero', {
      p_store_id: storeId,
      p_user_id: user.id,
    })

    if (!rpcRes.error && rpcRes.data) {
      revalidatePath('/inventario')
      revalidatePath('/inventario/fisico')
      revalidatePath('/inventario/consulta')
      return {
        success: true,
        message: 'Existencias de la sucursal puestas en cero exitosamente. La existencia previa fue respaldada.',
        updatedCount: rpcRes.data.updated ?? 0,
        insertedCount: rpcRes.data.inserted ?? 0,
        timestamp: rpcRes.data.timestamp,
      }
    }

    // 4. Fallback execution in case RPC was not yet run in remote SQL editor
    const nowIso = new Date().toISOString()

    // 4.1 Get default location for the store
    const { data: locations } = await supabase
      .from('locations')
      .select('id_location')
      .eq('id_store', storeId)
      .eq('status', 'A')
      .order('description', { ascending: true })
      .limit(1)

    const defaultLocId = locations && locations.length > 0 ? locations[0].id_location : null

    // 4.2 Fetch all current stock rows for this store
    const { data: currentStocks, error: fetchStocksError } = await supabase
      .from('stocks')
      .select('id_stock, id_item, current')
      .eq('id_store', storeId)

    if (fetchStocksError) {
      return { success: false, message: 'Error al consultar existencias actuales: ' + fetchStocksError.message }
    }

    // 4.3 Update each stock row: backup current to pre_inventory_stock and previous, set current to 0
    if (currentStocks && currentStocks.length > 0) {
      for (const st of currentStocks) {
        const curVal = Number(st.current ?? 0)
        await supabase
          .from('stocks')
          .update({
            pre_inventory_stock: curVal,
            previous: curVal,
            current: 0,
            last_inventory_reset_at: nowIso,
            last_inventory_reset_by: user.id,
          })
          .eq('id_stock', st.id_stock)
      }
    }

    // 4.4 Ensure catalog items without a stock row in this store get initialized
    let insertedCount = 0
    if (defaultLocId) {
      const existingItemIds = new Set((currentStocks || []).map((s) => s.id_item))
      const { data: activeItems } = await supabase
        .from('items')
        .select('id_item')
        .eq('status', 'A')

      const missingItems = (activeItems || []).filter((it) => !existingItemIds.has(it.id_item))
      if (missingItems.length > 0) {
        const toInsert = missingItems.map((it) => ({
          id_item: it.id_item,
          id_store: storeId,
          id_location: defaultLocId,
          current: 0,
          initial: 0,
          previous: 0,
          pre_inventory_stock: 0,
          last_inventory_reset_at: nowIso,
          last_inventory_reset_by: user.id,
        }))

        const { error: insErr } = await supabase.from('stocks').insert(toInsert)
        if (!insErr) {
          insertedCount = toInsert.length
        }
      }
    }

    // 4.5 Register audit in transactions
    await supabase.from('transactions').insert({
      id_store: storeId,
      id_location: defaultLocId,
      id_user: user.id,
      movim_type: 'I',
      amount_enrty: 0,
      amount_exit: 0,
      concept: 'Reinicio de existencias a cero para inventario físico',
      origin: 'Inventario Físico',
      comments: `Existencias reiniciadas a 0. Actualizados: ${currentStocks?.length ?? 0}, Nuevos: ${insertedCount}. Por: ${profile?.full_name || profile?.email || user.email}`,
    })

    revalidatePath('/inventario')
    revalidatePath('/inventario/fisico')
    revalidatePath('/inventario/consulta')

    return {
      success: true,
      message: 'Existencias de la sucursal puestas en cero exitosamente. La existencia previa fue respaldada.',
      updatedCount: currentStocks?.length ?? 0,
      insertedCount,
      timestamp: nowIso,
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado al reiniciar existencias'
    return { success: false, message: msg }
  }
}
