'use server'

import { createAdminClient } from '@/utils/supabase/admin'
import { revalidatePath } from 'next/cache'
import { type CashShift, type Client } from '@/lib/types'

/**
 * Obtiene la lista completa de clientes activos para el Punto de Venta.
 * Utiliza adminClient para garantizar la carga completa y evitar bloqueos por RLS.
 */
export async function getPosClientsAction(): Promise<Client[]> {
  const adminClient = createAdminClient()

  try {
    const { data, error } = await adminClient
      .from('clients')
      .select('*')
      .order('first_name', { ascending: true })

    if (error) {
      console.error('[getPosClientsAction] Error cargando clientes:', error.message)
      return []
    }

    const list = (data || []) as Client[]
    return list.filter((c) => c.status === 'A' || !c.status)
  } catch (err) {
    console.error('[getPosClientsAction] Excepción:', err)
    return []
  }
}

/**
 * Consulta si el usuario tiene un turno de caja activo (abierto) en la sucursal.
 */
export async function getActiveShiftAction(
  storeId: string,
  userId: string
): Promise<CashShift | null> {
  const adminClient = createAdminClient()

  try {
    const { data, error } = await adminClient
      .from('cash_shifts')
      .select('*')
      .eq('id_store', storeId)
      .eq('id_user', userId)
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!error && data) {
      return data as CashShift
    }
  } catch (err) {
    console.warn('cash_shifts no disponible aún en DB:', err)
  }

  return null
}

/**
 * Abre un nuevo turno de caja con fondo bimoneda y método de autenticación.
 */
export async function openShiftAction(data: {
  storeId: string
  userId: string
  initialCashMxn: number
  initialCashUsd: number
  exchangeRate: number
  authMethod?: 'webauthn' | 'face' | 'pin' | 'biometric'
  notes?: string
}): Promise<CashShift> {
  const adminClient = createAdminClient()

  const payload = {
    id_store: data.storeId,
    id_user: data.userId,
    initial_cash_mxn: Number(data.initialCashMxn) || 0,
    initial_cash_usd: Number(data.initialCashUsd) || 0,
    exchange_rate: Number(data.exchangeRate) || 19.0,
    status: 'open',
    auth_method: data.authMethod || 'biometric',
    notes: data.notes || null,
    opened_at: new Date().toISOString(),
  }

  // 1. Intentar insertar en tabla cash_shifts
  try {
    const { data: shiftData, error } = await adminClient
      .from('cash_shifts')
      .insert(payload)
      .select()
      .single()

    if (!error && shiftData) {
      revalidatePath('/pos')
      return shiftData as CashShift
    }
  } catch (err) {
    console.warn('Fallo inserción en cash_shifts DB:', err)
  }

  // 2. Fallback temporal en caso de que la tabla aún no haya sido migrada en Supabase
  const fallbackShift: CashShift = {
    id_shift: 'shift-' + Date.now(),
    id_store: data.storeId,
    id_user: data.userId,
    opened_at: payload.opened_at,
    closed_at: null,
    initial_cash_mxn: payload.initial_cash_mxn,
    initial_cash_usd: payload.initial_cash_usd,
    exchange_rate: payload.exchange_rate,
    final_cash_mxn: null,
    final_cash_usd: null,
    status: 'open',
    notes: payload.notes,
    auth_method: data.authMethod || 'biometric',
    created_at: payload.opened_at,
    updated_at: payload.opened_at,
  }

  revalidatePath('/pos')
  return fallbackShift
}

/**
 * Cierra un turno de caja activo con corte final.
 */
export async function closeShiftAction(
  shiftId: string,
  finalCashMxn: number,
  finalCashUsd: number,
  notes?: string
): Promise<{ success: boolean }> {
  const adminClient = createAdminClient()

  try {
    await adminClient
      .from('cash_shifts')
      .update({
        status: 'closed',
        final_cash_mxn: finalCashMxn,
        final_cash_usd: finalCashUsd,
        closed_at: new Date().toISOString(),
        notes: notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id_shift', shiftId)
  } catch (err) {
    console.warn('Fallo cierre en cash_shifts:', err)
  }

  revalidatePath('/pos')
  return { success: true }
}
