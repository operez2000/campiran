'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { type Client } from '@/lib/types'

/**
 * Fetch all clients.
 * Verifies that the user has an active session before returning data.
 */
export async function getClients(): Promise<Client[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return []
  }

  // Use admin client to reliably read clients regardless of RLS restrictions
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('clients')
    .select('*')
    .order('first_name', { ascending: true })

  if (error) {
    console.error('[getClients] Error:', error.message)
    return []
  }

  return (data || []) as Client[]
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
  const { error } = await admin
    .from('clients')
    .update({ status: newStatus })
    .eq('id_client', clientId)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/clientes')
  return { success: true }
}
