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

function isPublicoGeneralRecord(
  client: Pick<Client, 'first_name' | 'last_name'> & { rfc?: string | null }
): boolean {
  const fullName = normalizeText(`${client.first_name || ''} ${client.last_name || ''}`)
  const firstName = normalizeText(client.first_name)
  const rfcUpper = (client.rfc || '').trim().toUpperCase()
  return (
    fullName === 'publico en general' ||
    firstName === 'publico en general' ||
    rfcUpper === PUBLICO_GENERAL_RFC
  )
}

// Candado en memoria para evitar condiciones de carrera en llamadas concurrentes
let activeEnsurePromise: Promise<Client[]> | null = null

async function runEnsurePublicoEnGeneralClient(): Promise<Client[]> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('clients')
    .select('*')
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[ensurePublicoEnGeneralClient] Error al consultar clients:', error.message)
    return []
  }

  let list = ((data || []) as Client[]).slice()
  const matchingPublico = list.filter((c) => isPublicoGeneralRecord(c))

  if (matchingPublico.length === 0) {
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

      list = [createdClient, ...list]
    }
  } else {
    // Conservar únicamente el primer registro (más antiguo) como canónico
    let canonical = matchingPublico[0]
    const duplicates = matchingPublico.slice(1)

    // Si existen registros duplicados de 'Público en General' / 'XAXX010101000', reasignar referencias y borrarlos físicamente
    if (duplicates.length > 0) {
      const duplicateIds = duplicates.map((d) => d.id_client)

      await admin
        .from('orders')
        .update({ id_client: canonical.id_client })
        .in('id_client', duplicateIds)

      await admin
        .from('carts')
        .update({ id_client: canonical.id_client })
        .in('id_client', duplicateIds)

      await admin
        .from('shipping_addresses')
        .update({ id_client: canonical.id_client })
        .in('id_client', duplicateIds)

      const { error: deleteError } = await admin
        .from('clients')
        .delete()
        .in('id_client', duplicateIds)

      if (deleteError) {
        console.error('[ensurePublicoEnGeneralClient] Error al borrar duplicados:', deleteError.message)
      } else {
        const duplicateSet = new Set(duplicateIds)
        list = list.filter((c) => !duplicateSet.has(c.id_client))
      }
    }

    // Asegurar que el registro único tenga exactamente los datos requeridos
    const needsUpdate =
      canonical.first_name !== PUBLICO_GENERAL_NAME ||
      (canonical.last_name !== null && canonical.last_name !== '') ||
      (canonical.rfc || '').trim().toUpperCase() !== PUBLICO_GENERAL_RFC ||
      Number(canonical.price_number || 1) !== 1 ||
      canonical.status !== 'A'

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
        .eq('id_client', canonical.id_client)
        .select()
        .single()

      if (!updateError && updated) {
        canonical = updated as Client
        const idx = list.findIndex((c) => c.id_client === canonical.id_client)
        if (idx !== -1) list[idx] = canonical
      }
    }

    // Vincular órdenes históricas sin cliente (id_client IS NULL) al cliente canónico
    await admin
      .from('orders')
      .update({ id_client: canonical.id_client })
      .is('id_client', null)
  }

  // Ordenar alfabéticamente dejando a 'Público en General' al inicio
  list.sort((a, b) => {
    const aIsPublico = isPublicoGeneralRecord(a)
    const bIsPublico = isPublicoGeneralRecord(b)
    if (aIsPublico && !bIsPublico) return -1
    if (!aIsPublico && bIsPublico) return 1
    const nameA = `${a.first_name || ''} ${a.last_name || ''}`.trim().toLowerCase()
    const nameB = `${b.first_name || ''} ${b.last_name || ''}`.trim().toLowerCase()
    return nameA.localeCompare(nameB, 'es')
  })

  return list
}

/**
 * Garantiza que exista un único cliente 'Público en General' con RFC XAXX010101000
 * y elimina físicamente cualquier duplicado existente.
 */
export async function ensurePublicoEnGeneralClient(): Promise<Client[]> {
  if (!activeEnsurePromise) {
    activeEnsurePromise = runEnsurePublicoEnGeneralClient().finally(() => {
      activeEnsurePromise = null
    })
  }
  return activeEnsurePromise
}

/**
 * Fetch all clients.
 * Verifies that the user has an active session before returning data,
 * and ensures a single 'Público en General' exists in the database.
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
 * Create or update a client, validating that RFC and 'Público en General' are never duplicated.
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
  const normalizedRfc = clientData.rfc?.trim() ? clientData.rfc.trim().toUpperCase() : null

  // Validar que no exista otro cliente con el mismo RFC o mismo nombre 'Público en General'
  const { data: existingClients, error: checkError } = await admin
    .from('clients')
    .select('id_client, first_name, last_name, rfc')

  if (checkError) {
    return { success: false, error: 'Error al verificar duplicados: ' + checkError.message }
  }

  const others = ((existingClients || []) as Pick<Client, 'id_client' | 'first_name' | 'last_name' | 'rfc'>[]).filter(
    (c) => c.id_client !== clientId
  )

  if (normalizedRfc) {
    const duplicateRfc = others.find(
      (c) => (c.rfc || '').trim().toUpperCase() === normalizedRfc
    )
    if (duplicateRfc) {
      const dupName = `${duplicateRfc.first_name || ''} ${duplicateRfc.last_name || ''}`.trim()
      return {
        success: false,
        error: `El RFC "${normalizedRfc}" ya está registrado para el cliente "${dupName}". El RFC es único y no debe repetirse.`,
      }
    }
  }

  const candidateFullName = normalizeText(`${clientData.first_name || ''} ${clientData.last_name || ''}`)
  if (candidateFullName === 'publico en general') {
    const duplicatePublico = others.find((c) => isPublicoGeneralRecord(c))
    if (duplicatePublico) {
      return {
        success: false,
        error: 'El cliente "Público en General" ya existe en el catálogo y no puede duplicarse.',
      }
    }
  }

  const sanitizedData = {
    ...clientData,
    first_name: clientData.first_name.trim(),
    last_name: clientData.last_name?.trim() || null,
    rfc: normalizedRfc,
  }

  if (clientId) {
    // Update existing client
    const { data, error } = await admin
      .from('clients')
      .update(sanitizedData)
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
      .insert([{ ...sanitizedData, status: 'A' }])
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
      .select('first_name, last_name, rfc')
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
