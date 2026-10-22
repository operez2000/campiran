'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { type Client } from '@/lib/types'

const PUBLICO_GENERAL_RFC = 'XAXX010101000'
const PUBLICO_GENERAL_NAME = 'Público en General'

function normalizeText(value?: string | null): string {
  return (value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function isPublicoGeneralRecord(client: Pick<Client, 'first_name' | 'last_name'>): boolean {
  const fullName = normalizeText(`${client.first_name || ''} ${client.last_name || ''}`)
  const firstName = normalizeText(client.first_name)
  return fullName === 'publico en general' || firstName === 'publico en general'
}

/**
 * Garantiza que el cliente predeterminado 'Público en General' exista en la tabla `clients`
 * con el RFC genérico XAXX010101000 y tipo 'Menudeo' (price_number = 1).
 */
export async function ensurePublicoEnGeneralClient(): Promise<Client[]> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('clients')
    .select('*')
    .order('first_name', { ascending: true })

  if (error) {
    console.error('[ensurePublicoEnGeneralClient] Error al consultar clients:', error.message)
    return []
  }

  const list = ((data || []) as Client[]).slice()
  const existingIndex = list.findIndex((c) => isPublicoGeneralRecord(c))

  if (existingIndex === -1) {
    // No existe 'Público en General' en la base de datos: lo insertamos
    const { data: inserted, error: insertError } = await admin
      .from('clients')
      .insert([
        {
          first_name: PUBLICO_GENERAL_NAME,
          last_name: null,
          rfc: PUBLICO_GENERAL_RFC,
          country: 'México',
          price_number: 1, // Menudeo
          status: 'A',
          comments: 'Cliente predeterminado para ventas de mostrador (Menudeo)',
        },
      ])
      .select()
      .single()

    if (insertError) {
      console.error('[ensurePublicoEnGeneralClient] Error al crear Público en General:', insertError.message)
      return list
    }

    if (inserted) {
      const createdClient = inserted as Client
      // Vincular órdenes históricas sin cliente (id_client IS NULL) a Público en General
      await admin
        .from('orders')
        .update({ id_client: createdClient.id_client })
        .is('id_client', null)

      return [createdClient, ...list]
    }
  } else {
    const existing = list[existingIndex]
    const needsUpdate =
      existing.first_name !== PUBLICO_GENERAL_NAME ||
      (existing.last_name !== null && existing.last_name !== '') ||
      (existing.rfc || '').trim().toUpperCase() !== PUBLICO_GENERAL_RFC ||
      Number(existing.price_number || 1) !== 1 ||
      existing.status !== 'A'

    if (needsUpdate) {
      const { data: updated, error: updateError } = await admin
        .from('clients')
        .update({
          first_name: PUBLICO_GENERAL_NAME,
          last_name: null,
          rfc: PUBLICO_GENERAL_RFC,
          price_number: 1, // Menudeo
          status: 'A',
        })
        .eq('id_client', existing.id_client)
        .select()
        .single()

      if (!updateError && updated) {
        list[existingIndex] = updated as Client
      }
    }

    // Mover Público en General al inicio de la lista por defecto
    const [publicoClient] = list.splice(existingIndex, 1)
    return [publicoClient, ...list]
  }

  return list
}

/**
 * Fetch all clients.
 * Verifies that the user has an active session before returning data,
 * and ensures 'Público en General' exists in the database.
 */
export async function getClients(): Promise<Client[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return []
  }

  return ensurePublicoEnGeneralClient()
}

/**
 * Create or update a client.
 */
export async function saveClientAction(
  clientData: {
    first_name: string
    last_name?: string | null
    rfc?: string | null
    email?: string | null
    phone?: string | null
    address?: string | null
    city?: string | null
    state?: string | null
    postal_code?: string | null
    country?: string | null
    price_number?: number | null
    branch?: string | null
    comments?: string | null
  },
  clientId?: string
): Promise<{ success: boolean; error?: string; client?: Client }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'No autorizado. Inicie sesión nuevamente.' }
  }

  const admin = createAdminClient()

  if (clientId) {
    // Update existing client
    const { data, error } = await admin
      .from('clients')
      .update(clientData)
      .eq('id_client', clientId)
      .select()
      .single()

    if (error) {
      return { success: false, error: error.message }
    }

    revalidatePath('/clientes')
    revalidatePath('/pos')
    return { success: true, client: data as Client }
  } else {
    // Insert new client
    const { data, error } = await admin
      .from('clients')
      .insert([{ ...clientData, status: 'A' }])
      .select()
      .single()

    if (error) {
      return { success: false, error: error.message }
    }

    revalidatePath('/clientes')
    revalidatePath('/pos')
    return { success: true, client: data as Client }
  }
}

/**
 * Toggle logical status between 'A' (active) and 'I' (inactive).
 */
export async function toggleClientStatusAction(
  clientId: string,
  newStatus: 'A' | 'I'
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'No autorizado' }
  }

  const admin = createAdminClient()

  if (newStatus === 'I') {
    const { data: targetClient } = await admin
      .from('clients')
      .select('first_name, last_name')
      .eq('id_client', clientId)
      .maybeSingle()

    if (targetClient && isPublicoGeneralRecord(targetClient)) {
      return {
        success: false,
        error: 'El cliente Público en General es predeterminado para el Punto de Venta y no puede desactivarse.',
      }
    }
  }

  const { error } = await admin
    .from('clients')
    .update({ status: newStatus })
    .eq('id_client', clientId)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/clientes')
  revalidatePath('/pos')
  return { success: true }
}
