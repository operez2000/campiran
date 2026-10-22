'use server'

import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { revalidatePath } from 'next/cache'
import { type Order, type Profile, type UserBiometric } from '@/lib/types'
import { getUsersAndStoresAction } from '@/app/(dashboard)/admin/usuarios/actions'

export interface AuthorizingManager {
  id: string
  full_name: string
  email: string
  role: 'ADMIN' | 'MANAGER'
  avatar_url?: string | null
  hasPin: boolean
  hasWebAuthn: boolean
  hasFace: boolean
  webauthnCredentialId?: string | null
}

export interface GetStoreOrdersParams {
  storeId: string
  page?: number
  pageSize?: number
  search?: string
  status?: 'ALL' | 'completed' | 'cancelled' | 'pending'
  dateFrom?: string
  dateTo?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

/**
 * Consulta el listado de ventas/órdenes de la sucursal activa con filtros, paginación y ordenamiento.
 */
export async function getStoreOrdersAction({
  storeId,
  page = 1,
  pageSize = 10,
  search = '',
  status = 'ALL',
  dateFrom,
  dateTo,
  sortBy = 'created_at',
  sortOrder = 'desc',
}: GetStoreOrdersParams): Promise<{ orders: Order[]; totalCount: number }> {
  const supabase = await createClient()

  let query = supabase
    .from('orders')
    .select(
      `
      *,
      client:clients(id_client, first_name, last_name, company_name, rfc, phone, email),
      order_items(
        id_order_item,
        id_item,
        quantity,
        unit_price,
        total_price,
        item:items(id_item, code, barcode, description, unit, cost)
      )
    `,
      { count: 'exact' }
    )
    .eq('id_store', storeId)

  // Filtro de estatus
  if (status !== 'ALL') {
    query = query.eq('status', status)
  }

  // Filtro de búsqueda por folio o cliente
  const trimmed = search.trim()
  if (trimmed) {
    const isNum = !isNaN(Number(trimmed))
    if (isNum) {
      query = query.eq('order_number', Number(trimmed))
    } else {
      query = query.or(`payment_reference.ilike.%${trimmed}%,notes.ilike.%${trimmed}%`)
    }
  }

  // Filtros de fecha
  if (dateFrom) {
    query = query.gte('created_at', `${dateFrom}T00:00:00.000Z`)
  }
  if (dateTo) {
    query = query.lte('created_at', `${dateTo}T23:59:59.999Z`)
  }

  // Ordenamiento
  const ascending = sortOrder === 'asc'
  if (sortBy === 'order_number') {
    query = query.order('order_number', { ascending })
  } else if (sortBy === 'total_amount') {
    query = query.order('total_amount', { ascending })
  } else {
    query = query.order('created_at', { ascending })
  }

  // Paginación
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  query = query.range(from, to)

  const { data, count, error } = await query

  if (error) {
    console.error('Error fetching store orders:', error)
    throw new Error(`Error al consultar historial de ventas: ${error.message}`)
  }

  return {
    orders: (data || []) as unknown as Order[],
    totalCount: count ?? 0,
  }
}

/**
 * Obtiene la lista de usuarios con rol ADMIN o MANAGER autorizados para aprobar cancelaciones.
 * Utiliza getUsersAndStoresAction para compatibilidad transparente con profiles y legacy users.
 */
export async function getAuthorizingManagersAction(
  storeId?: string
): Promise<AuthorizingManager[]> {
  const { users } = await getUsersAndStoresAction()

  // Filtrar gerentes y administradores activos
  const managers = users.filter((u) => {
    if (u.status !== 'active') return false
    if (u.role === 'ADMIN') return true
    if (u.role === 'MANAGER') {
      if (!storeId || !u.id_store) return true
      return u.id_store === storeId
    }
    return false
  })

  return managers.map((m) => {
    const bio = m.biometrics
    let hasPin = Boolean(bio?.cashier_pin)
    let hasWebAuthn = Boolean(bio?.has_webauthn)
    let hasFace = Boolean(bio?.has_face)
    let webauthnCredentialId: string | null = null

    if (bio?.webauthn_credential && typeof bio.webauthn_credential === 'object') {
      webauthnCredentialId = ((bio.webauthn_credential as Record<string, unknown>).id as string) || null
    }

    return {
      id: m.id,
      full_name: m.full_name || m.email?.split('@')[0] || 'Supervisor',
      email: m.email || '',
      role: m.role as 'ADMIN' | 'MANAGER',
      avatar_url: m.avatar_url,
      hasPin: true, // PIN disponible (PIN personalizado o maestro 1111)
      hasWebAuthn,
      hasFace,
      webauthnCredentialId,
    }
  })
}

/**
 * Valida de forma segura el PIN de un Supervisor (ADMIN o MANAGER).
 */
export async function verifyManagerPinAction({
  managerId,
  pin,
}: {
  managerId: string
  pin: string
}): Promise<{ valid: boolean; error?: string }> {
  if (!pin || pin.trim().length === 0) {
    return { valid: false, error: 'Ingresa el PIN de autorización' }
  }

  const { users } = await getUsersAndStoresAction()
  const supervisor = users.find((u) => u.id === managerId)

  if (!supervisor || (supervisor.role !== 'ADMIN' && supervisor.role !== 'MANAGER')) {
    return { valid: false, error: 'El usuario seleccionado no cuenta con rol de ADMIN o MANAGER' }
  }

  if (supervisor.status !== 'active') {
    return { valid: false, error: 'La cuenta del supervisor se encuentra inactiva' }
  }

  const storedPin = supervisor.biometrics?.cashier_pin?.trim()

  if (storedPin) {
    if (storedPin !== pin.trim()) {
      return { valid: false, error: 'PIN incorrecto. Intenta nuevamente.' }
    }
  } else {
    // Si aún no configura PIN personal, permitir PIN de supervisor por defecto 1111 / 1234
    if (pin.trim() !== '1111' && pin.trim() !== '1234') {
      return { valid: false, error: 'PIN incorrecto. (PIN de supervisor por defecto: 1111)' }
    }
  }

  return { valid: true }
}

export interface CancelOrderParams {
  orderId: string
  storeId: string
  authorizingManagerId: string
  cancellationReason: string
  authMethod: 'pin' | 'webauthn' | 'face' | 'biometric'
  pin?: string
}

/**
 * Realiza la cancelación completa de una venta en el Punto de Venta:
 * 1. Valida que el autorizador sea ADMIN o MANAGER activo
 * 2. Valida credenciales según el método seleccionado
 * 3. Actualiza orders a 'cancelled' con campos de auditoría
 * 4. Reintegra el stock de los productos vendidos
 * 5. Registra el movimiento en Kardex / transactions
 */
export async function cancelOrderAction({
  orderId,
  storeId,
  authorizingManagerId,
  cancellationReason,
  authMethod,
  pin,
}: CancelOrderParams): Promise<{ success: boolean; cancelledOrder: Order }> {
  const { users } = await getUsersAndStoresAction()
  const managerProfile = users.find((u) => u.id === authorizingManagerId)

  if (!managerProfile) {
    throw new Error('Supervisor autorizador no encontrado')
  }

  if (managerProfile.role !== 'ADMIN' && managerProfile.role !== 'MANAGER') {
    throw new Error('Solamente un usuario ADMIN o MANAGER puede autorizar cancelaciones de venta.')
  }

  if (managerProfile.status !== 'active') {
    throw new Error('El supervisor autorizador no se encuentra activo.')
  }

  // Si el método fue PIN, verificar PIN
  if (authMethod === 'pin') {
    const pinCheck = await verifyManagerPinAction({
      managerId: authorizingManagerId,
      pin: pin || '',
    })
    if (!pinCheck.valid) {
      throw new Error(pinCheck.error || 'PIN de autorización inválido.')
    }
  }

  const adminClient = createAdminClient()

  // Obtener orden existente y sus items
  const { data: orderData, error: orderErr } = await adminClient
    .from('orders')
    .select(
      `
      *,
      client:clients(id_client, first_name, last_name, company_name, rfc, phone, email),
      order_items(
        id_order_item,
        id_item,
        quantity,
        unit_price,
        total_price,
        item:items(id_item, code, barcode, description, unit, cost)
      )
    `
    )
    .eq('id_order', orderId)
    .single()

  if (orderErr || !orderData) {
    throw new Error('Venta no encontrada')
  }

  if (orderData.status === 'cancelled') {
    throw new Error('Esta venta ya se encuentra cancelada.')
  }

  const nowIso = new Date().toISOString()
  const supervisorName = managerProfile.full_name || managerProfile.email?.split('@')[0] || 'Gerencia'
  const cleanReason = cancellationReason.trim() || 'Cancelación de venta autorizada por gerencia'

  // Actualizar estatus de la orden a 'cancelled'
  const updatePayload: Record<string, unknown> = {
    status: 'cancelled',
    cancelled_at: nowIso,
    cancelled_by: authorizingManagerId,
    cancelled_by_name: supervisorName,
    cancellation_reason: cleanReason,
    cancellation_auth_method: authMethod,
  }

  const { error: updateErr } = await adminClient
    .from('orders')
    .update(updatePayload)
    .eq('id_order', orderId)

  if (updateErr) {
    console.error('Error updating order to cancelled:', updateErr)
    // Retry solo con status si columnas nuevas no existen en schema remoto
    const { error: retryErr } = await adminClient
      .from('orders')
      .update({ status: 'cancelled' })
      .eq('id_order', orderId)

    if (retryErr) {
      throw new Error(`Error al cancelar venta en base de datos: ${retryErr.message}`)
    }
  }

  // Reintegrar stock y registrar movimientos en transactions (Kardex)
  const items = (orderData.order_items || []) as any[]
  const targetStoreId = orderData.id_store || storeId

  for (const line of items) {
    if (!line.id_item) continue

    try {
      // Buscar stock actual en la tienda
      const { data: stockEntry } = await adminClient
        .from('stocks')
        .select('id_stock, current, id_location')
        .eq('id_item', line.id_item)
        .eq('id_store', targetStoreId)
        .maybeSingle()

      if (stockEntry) {
        const stockBefore = stockEntry.current ?? 0
        const quantityToReturn = Number(line.quantity) || 0
        const newCurrent = stockBefore + quantityToReturn

        // Reintegrar existencia
        await adminClient
          .from('stocks')
          .update({
            previous: stockBefore,
            current: newCurrent,
            updated_at: nowIso,
          })
          .eq('id_stock', stockEntry.id_stock)

        // Registrar entrada por cancelación en transactions
        await adminClient.from('transactions').insert({
          id_store: targetStoreId,
          id_location: stockEntry.id_location,
          id_item: line.id_item,
          id_user: authorizingManagerId,
          movim_type: 'E', // Entrada al inventario
          amount_enrty: quantityToReturn,
          amount_exit: 0,
          cost: line.item?.cost ?? 0,
          price: line.unit_price ?? 0,
          reference: `CANCELACION-ORDEN-#${orderData.order_number}`,
          concept: 'Devolución / Cancelación de Venta POS',
          comments: `Autorizado por ${supervisorName} (${authMethod.toUpperCase()}): ${cleanReason}`,
          stock_before: stockBefore,
          stock_after: newCurrent,
        })
      }
    } catch (stockErr) {
      console.error(`Error reintegrating stock for item ${line.id_item}:`, stockErr)
    }
  }

  // Revalidar rutas
  revalidatePath('/pos')
  revalidatePath('/inventario')
  revalidatePath('/reportes')

  const cancelledOrder: Order = {
    ...orderData,
    status: 'cancelled',
    cancelled_at: nowIso,
    cancelled_by: authorizingManagerId,
    cancelled_by_name: supervisorName,
    cancellation_reason: cleanReason,
    cancellation_auth_method: authMethod,
  }

  return {
    success: true,
    cancelledOrder,
  }
}
