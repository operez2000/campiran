'use server'

import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { getAuthenticatedProfile } from '@/lib/auth-profile'
import {
  type CompanySettings, type BranchPrinter, type Store, type UserRole,
  type BranchLabelConfig
} from '@/lib/types'

// Default fallback for company settings
const DEFAULT_COMPANY: CompanySettings = {
  id_company: '00000000-0000-0000-0000-000000000001',
  legal_name: 'Campiran S.A. de C.V.',
  trade_name: 'Campiran',
  rfc: 'XAXX010101000',
  tax_regime: '601 - General de Ley Personas Morales',
  tax_regime_code: '601',
  street: 'Av. Principal',
  exterior_number: '100',
  interior_number: '',
  neighborhood: 'Centro',
  postal_code: '00000',
  city: 'Ciudad',
  state: 'Estado',
  country: 'México',
  phone: '',
  email: '',
  website: '',
  logo_url: null,
  ticket_footer_message: '¡Gracias por su compra!',
  qz_cert: null,
  qz_private_key: null,
}

/**
 * Obtiene los datos fiscales y generales de la empresa propia.
 * Accesible tanto por ADMIN como por MANAGER.
 */
export async function getCompanySettingsAction(): Promise<{
  company: CompanySettings
  userRole: UserRole
  userStoreId: string | null
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autorizado. Debes iniciar sesión.')

  const profile = await getAuthenticatedProfile(supabase, user)
  if (profile.role !== 'ADMIN' && profile.role !== 'MANAGER') {
    throw new Error('No tienes permisos suficientes para acceder a la configuración.')
  }

  const adminClient = createAdminClient()
  const { data, error } = await adminClient
    .from('company_settings')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    // Si la tabla aún no tiene registro o no existe, retornamos default
    return {
      company: DEFAULT_COMPANY,
      userRole: profile.role,
      userStoreId: profile.id_store,
    }
  }

  return {
    company: data as CompanySettings,
    userRole: profile.role,
    userStoreId: profile.id_store,
  }
}

/**
 * Actualiza los datos de la empresa propia (Global).
 * Exclusivo para rol ADMIN. El MANAGER tiene vista de sólo lectura.
 */
export async function updateCompanySettingsAction(
  data: Partial<CompanySettings>
): Promise<CompanySettings> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autorizado. Debes iniciar sesión.')

  const profile = await getAuthenticatedProfile(supabase, user)
  if (profile.role !== 'ADMIN') {
    throw new Error('Solo el Administrador tiene autorización para modificar los datos globales de la empresa.')
  }

  const adminClient = createAdminClient()

  // Buscar si ya existe un registro
  const { data: existing } = await adminClient
    .from('company_settings')
    .select('id_company')
    .limit(1)
    .maybeSingle()

  const payload = {
    ...data,
    updated_at: new Date().toISOString(),
  }

  let result: CompanySettings

  if (existing?.id_company) {
    const { data: updated, error } = await adminClient
      .from('company_settings')
      .update(payload)
      .eq('id_company', existing.id_company)
      .select()
      .single()

    if (error) throw new Error('Error al actualizar datos de la empresa: ' + error.message)
    result = updated as CompanySettings
  } else {
    const { data: inserted, error } = await adminClient
      .from('company_settings')
      .insert([payload])
      .select()
      .single()

    if (error) throw new Error('Error al registrar datos de la empresa: ' + error.message)
    result = inserted as CompanySettings
  }

  revalidatePath('/configuracion/empresa')
  return result
}

/**
 * Obtiene las impresoras de recibos por sucursal.
 * - ADMIN: puede consultar las de cualquier sucursal.
 * - MANAGER: solo consulta las de su sucursal asignada.
 */
export async function getBranchPrintersAction(requestedStoreId?: string): Promise<{
  printers: BranchPrinter[]
  stores: Store[]
  currentStoreId: string | null
  userRole: UserRole
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autorizado.')

  const profile = await getAuthenticatedProfile(supabase, user)
  if (profile.role !== 'ADMIN' && profile.role !== 'MANAGER') {
    throw new Error('No tienes permisos para configurar impresoras.')
  }

  const adminClient = createAdminClient()

  // 1. Obtener sucursales activas
  let storesQuery = adminClient.from('stores').select('*').eq('status', 'A').order('description')
  if (profile.role === 'MANAGER' && profile.id_store) {
    storesQuery = storesQuery.eq('id_store', profile.id_store)
  }

  const { data: storesData } = await storesQuery
  const stores = (storesData || []) as Store[]

  // 2. Determinar tienda activa
  let targetStoreId: string | null = null
  if (profile.role === 'MANAGER') {
    targetStoreId = profile.id_store || (stores[0]?.id_store ?? null)
  } else {
    targetStoreId = requestedStoreId || (stores[0]?.id_store ?? null)
  }

  // 3. Obtener impresoras activas
  let printers: BranchPrinter[] = []
  if (targetStoreId) {
    const { data: printersData, error } = await adminClient
      .from('branch_printers')
      .select('*')
      .eq('id_store', targetStoreId)
      .eq('status', 'A')
      .order('is_default', { ascending: false })
      .order('name', { ascending: true })

    if (!error && printersData) {
      printers = printersData as BranchPrinter[]
    }
  }

  return {
    printers,
    stores,
    currentStoreId: targetStoreId,
    userRole: profile.role,
  }
}

/**
 * Guarda o actualiza una impresora de recibos.
 * Valida que el MANAGER solo guarde para su sucursal.
 */
export async function saveBranchPrinterAction(
  printerData: Partial<BranchPrinter>
): Promise<BranchPrinter> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autorizado.')

  const profile = await getAuthenticatedProfile(supabase, user)
  if (profile.role !== 'ADMIN' && profile.role !== 'MANAGER') {
    throw new Error('No tienes permisos para modificar impresoras.')
  }

  if (profile.role === 'MANAGER') {
    if (profile.id_store && printerData.id_store !== profile.id_store) {
      throw new Error('Los gerentes solo pueden configurar impresoras de su propia sucursal.')
    }
    printerData.id_store = profile.id_store || printerData.id_store
  }

  if (!printerData.id_store) {
    throw new Error('Debes asociar la impresora a una sucursal válida.')
  }
  if (!printerData.name?.trim()) {
    throw new Error('El nombre de la impresora es obligatorio.')
  }

  const adminClient = createAdminClient()

  // Si se marca como predeterminada, desmarcar las demás de esta sucursal
  if (printerData.is_default) {
    await adminClient
      .from('branch_printers')
      .update({ is_default: false })
      .eq('id_store', printerData.id_store)
  }

  const payload = {
    ...printerData,
    status: 'A',
    updated_at: new Date().toISOString(),
  }

  let result: BranchPrinter

  if (printerData.id_printer) {
    const { data, error } = await adminClient
      .from('branch_printers')
      .update(payload)
      .eq('id_printer', printerData.id_printer)
      .select()
      .single()

    if (error) throw new Error('Error al actualizar impresora: ' + error.message)
    result = data as BranchPrinter
  } else {
    const { data, error } = await adminClient
      .from('branch_printers')
      .insert([payload])
      .select()
      .single()

    if (error) throw new Error('Error al registrar impresora: ' + error.message)
    result = data as BranchPrinter
  }

  revalidatePath('/configuracion/impresoras')
  return result
}

/**
 * Eliminación lógica de una impresora (status = 'I').
 */
export async function deleteBranchPrinterAction(id_printer: string): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autorizado.')

  const profile = await getAuthenticatedProfile(supabase, user)
  if (profile.role !== 'ADMIN' && profile.role !== 'MANAGER') {
    throw new Error('No tienes permisos.')
  }

  const adminClient = createAdminClient()

  // Si es MANAGER, verificar que la impresora pertenezca a su tienda
  if (profile.role === 'MANAGER' && profile.id_store) {
    const { data: existing } = await adminClient
      .from('branch_printers')
      .select('id_store')
      .eq('id_printer', id_printer)
      .single()

    if (existing && existing.id_store !== profile.id_store) {
      throw new Error('No tienes permiso para eliminar impresoras de otra sucursal.')
    }
  }

  const { error } = await adminClient
    .from('branch_printers')
    .update({ status: 'I', updated_at: new Date().toISOString() })
    .eq('id_printer', id_printer)

  if (error) throw new Error('Error al eliminar impresora: ' + error.message)

  revalidatePath('/configuracion/impresoras')
  return true
}

// ══════════════════════════════════════════════════════════════════
// ── CONFIGURACIONES DE ETIQUETAS DE CÓDIGOS DE BARRAS POR SUCURSAL ─
// ══════════════════════════════════════════════════════════════════

/**
 * Obtiene todas las configuraciones de etiquetas activas de una sucursal.
 */
export async function getBranchLabelConfigsAction(id_store: string): Promise<BranchLabelConfig[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autorizado.')

  const adminClient = createAdminClient()
  const { data, error } = await adminClient
    .from('branch_label_configs')
    .select('*')
    .eq('id_store', id_store)
    .eq('status', 'A')
    .order('is_default', { ascending: false })
    .order('name', { ascending: true })

  if (error) {
    console.warn(
      '[LabelConfigs] No se pudieron obtener configuraciones. Si es la primera vez, asegúrate de ejecutar la migración 014_branch_label_configs.sql en Supabase SQL Editor. Detalle:',
      error.message || error.code || JSON.stringify(error)
    )
    return []
  }

  return (data || []) as BranchLabelConfig[]
}

/**
 * Crea o actualiza una configuración de etiquetas por sucursal.
 */
export async function saveBranchLabelConfigAction(
  configData: Partial<BranchLabelConfig> & { id_store: string; name: string }
): Promise<BranchLabelConfig> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autorizado.')

  const profile = await getAuthenticatedProfile(supabase, user)
  if (profile.role !== 'ADMIN' && profile.role !== 'MANAGER') {
    throw new Error('No tienes permisos suficientes.')
  }

  const adminClient = createAdminClient()

  // Si se marca como predeterminada, desmarcar las demás de la sucursal
  if (configData.is_default) {
    await adminClient
      .from('branch_label_configs')
      .update({ is_default: false })
      .eq('id_store', configData.id_store)
  }

  const payload = {
    id_store: configData.id_store,
    name: configData.name.trim(),
    printer_brand: configData.printer_brand || 'Zebra',
    printer_model: configData.printer_model || null,
    unit: configData.unit || 'cm',
    label_width: Number(configData.label_width) || 5.0,
    label_height: Number(configData.label_height) || 2.5,
    labels_per_row: Number(configData.labels_per_row) || 1,
    gap_x: Number(configData.gap_x) || 0.0,
    gap_y: Number(configData.gap_y) || 0.3,
    margin_top: Number(configData.margin_top) || 0.0,
    margin_left: Number(configData.margin_left) || 0.0,
    page_width: configData.page_width ? Number(configData.page_width) : null,
    page_height: configData.page_height ? Number(configData.page_height) : null,
    include_item_name: configData.include_item_name ?? true,
    include_price: configData.include_price ?? true,
    price_to_print: configData.price_to_print || 'price1',
    include_code: configData.include_code ?? true,
    include_barcode: configData.include_barcode ?? true,
    include_store_name: configData.include_store_name ?? false,
    barcode_type: configData.barcode_type || 'CODE128',
    is_default: Boolean(configData.is_default),
    status: 'A',
    updated_at: new Date().toISOString(),
  }

  let result: BranchLabelConfig

  if (configData.id_config) {
    const { data, error } = await adminClient
      .from('branch_label_configs')
      .update(payload)
      .eq('id_config', configData.id_config)
      .select()
      .single()

    if (error) throw new Error('Error al actualizar configuración de etiquetas: ' + error.message)
    result = data as BranchLabelConfig
  } else {
    const { data, error } = await adminClient
      .from('branch_label_configs')
      .insert([payload])
      .select()
      .single()

    if (error) throw new Error('Error al guardar configuración de etiquetas: ' + error.message)
    result = data as BranchLabelConfig
  }

  revalidatePath('/configuracion/etiquetas')
  return result
}

/**
 * Eliminación lógica de una configuración de etiquetas (status = 'I').
 */
export async function deleteBranchLabelConfigAction(id_config: string): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autorizado.')

  const profile = await getAuthenticatedProfile(supabase, user)
  if (profile.role !== 'ADMIN' && profile.role !== 'MANAGER') {
    throw new Error('No tienes permisos.')
  }

  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('branch_label_configs')
    .update({ status: 'I', updated_at: new Date().toISOString() })
    .eq('id_config', id_config)

  if (error) throw new Error('Error al eliminar configuración: ' + error.message)

  revalidatePath('/configuracion/etiquetas')
  return true
}

/**
 * Establece una configuración como la predeterminada de su sucursal.
 */
export async function setDefaultBranchLabelConfigAction(
  id_config: string,
  id_store: string
): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autorizado.')

  const adminClient = createAdminClient()

  // Desmarcar todas
  await adminClient
    .from('branch_label_configs')
    .update({ is_default: false })
    .eq('id_store', id_store)

  // Marcar la seleccionada
  const { error } = await adminClient
    .from('branch_label_configs')
    .update({ is_default: true, updated_at: new Date().toISOString() })
    .eq('id_config', id_config)

  if (error) throw new Error('Error al fijar predeterminada: ' + error.message)

  revalidatePath('/configuracion/etiquetas')
  return true
}

/**
 * Obtiene configuraciones de etiquetas, sucursales disponibles y contexto para la página /configuracion/etiquetas.
 */
export async function getBranchLabelConfigsFullAction(requestedStoreId?: string): Promise<{
  configs: BranchLabelConfig[]
  stores: Store[]
  currentStoreId: string | null
  userRole: UserRole
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autorizado.')

  const profile = await getAuthenticatedProfile(supabase, user)
  if (profile.role !== 'ADMIN' && profile.role !== 'MANAGER') {
    throw new Error('No tienes permisos suficientes.')
  }

  const adminClient = createAdminClient()

  // 1. Obtener sucursales activas
  let storesQuery = adminClient.from('stores').select('*').eq('status', 'A').order('description')
  if (profile.role === 'MANAGER' && profile.id_store) {
    storesQuery = storesQuery.eq('id_store', profile.id_store)
  }

  const { data: storesData } = await storesQuery
  const stores = (storesData || []) as Store[]

  // 2. Determinar tienda activa
  let targetStoreId: string | null = null
  if (profile.role === 'MANAGER') {
    targetStoreId = profile.id_store || (stores[0]?.id_store ?? null)
  } else {
    targetStoreId = requestedStoreId || (stores[0]?.id_store ?? null)
  }

  // 3. Obtener configuraciones de etiquetas de la sucursal
  let configs: BranchLabelConfig[] = []
  if (targetStoreId) {
    configs = await getBranchLabelConfigsAction(targetStoreId)
  }

  return {
    configs,
    stores,
    currentStoreId: targetStoreId,
    userRole: profile.role,
  }
}


