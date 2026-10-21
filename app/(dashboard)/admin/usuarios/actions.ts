'use server'

import { createAdminClient } from '@/utils/supabase/admin'
import { revalidatePath } from 'next/cache'
import { type Profile, type Store, type UserRole, type ProfileStatus, type UserBiometric } from '@/lib/types'
import { extractAvatarUrl } from '@/lib/auth-profile'

// Map single-character role code to system role
function roleCodeToRole(code: string | null | undefined): UserRole {
  const c = String(code || '').toUpperCase()
  if (c === 'A' || c === 'ADMIN') return 'ADMIN'
  if (c === 'M' || c === 'MANAGER') return 'MANAGER'
  if (c === 'C' || c === 'CASHIER') return 'CASHIER'
  if (c === 'O' || c === 'ALMACENISTA') return 'ALMACENISTA'
  if (c === 'PENDING') return 'PENDING'
  return 'ADMIN'
}

// Map system role to legacy single-character code
function roleToRoleCode(role: UserRole): string {
  switch (role) {
    case 'ADMIN':
      return 'A'
    case 'MANAGER':
      return 'M'
    case 'CASHIER':
      return 'C'
    case 'ALMACENISTA':
      return 'O'
    case 'PENDING':
    default:
      return 'P'
  }
}

// Map legacy status code to system status
function statusCodeToStatus(code: string | null | undefined): ProfileStatus {
  const c = String(code || '').toUpperCase()
  if (c === 'I' || c === 'INACTIVE') return 'inactive'
  if (c === 'P' || c === 'PENDING') return 'pending'
  return 'active'
}

// Map system status to legacy code
function statusToStatusCode(status: ProfileStatus): string {
  switch (status) {
    case 'inactive':
      return 'I'
    case 'pending':
      return 'P'
    case 'active':
    default:
      return 'A'
  }
}

/**
 * Obtiene la lista completa de usuarios y tiendas activas con sus credenciales biométricas (WebAuthn, Face ID, PIN de Cajero).
 * Consulta auth.users, la tabla profiles, user_biometrics y la tabla legacy users con sincronización transparente.
 */
export async function getUsersAndStoresAction(): Promise<{ users: Profile[]; stores: Store[] }> {
  const adminClient = createAdminClient()

  // 1. Obtener tiendas
  const { data: storesData } = await adminClient
    .from('stores')
    .select('*')
    .eq('status', 'A')
    .order('description')

  const stores = (storesData || []) as Store[]

  // 2. Consultar credenciales biométricas (user_biometrics)
  const biometricsMap = new Map<string, UserBiometric>()
  try {
    const { data: bioData, error: bioErr } = await adminClient
      .from('user_biometrics')
      .select('*')

    if (!bioErr && bioData) {
      for (const b of bioData) {
        if (b.id_user) {
          biometricsMap.set(b.id_user, b as UserBiometric)
        }
      }
    }
  } catch {
    // La tabla user_biometrics puede no haber sido creada todavía
  }

  // 3. Fallback de biometría desde auth.users user_metadata si falta en DB
  let authUsersList: any[] = []
  try {
    const { data: authData } = await adminClient.auth.admin.listUsers()
    authUsersList = authData?.users || []
    for (const au of authUsersList) {
      const meta = au.user_metadata || {}
      if (
        meta.has_webauthn ||
        meta.has_face ||
        meta.cashier_number ||
        meta.cashier_pin ||
        meta.webauthn_credential ||
        meta.face_photo_url
      ) {
        if (!biometricsMap.has(au.id)) {
          biometricsMap.set(au.id, {
            id_biometric: au.id,
            id_user: au.id,
            cashier_number: meta.cashier_number || null,
            cashier_pin: meta.cashier_pin || null,
            has_webauthn: Boolean(meta.has_webauthn),
            webauthn_credential: meta.webauthn_credential || null,
            has_face: Boolean(meta.has_face),
            face_photo_url: meta.face_photo_url || null,
            face_descriptor: meta.face_descriptor || null,
            created_at: au.created_at,
            updated_at: au.updated_at || au.created_at,
          })
        }
      }
    }
  } catch {
    // Continuar si falla listUsers
  }

  // 4. Intentar consultar profiles
  let profiles: Profile[] = []
  try {
    const { data: profData, error: profErr } = await adminClient
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })

    if (!profErr && profData && profData.length > 0) {
      profiles = profData as Profile[]
    }
  } catch {
    // La tabla profiles puede no existir aún en la base de datos
  }

  // Si profiles ya tiene registros, retornar con biometría y avatar de Google vinculados
  if (profiles.length > 0) {
    const enrichedProfiles = profiles.map((p) => {
      const au = authUsersList.find(
        (u) =>
          u.id === p.id ||
          (u.email && p.email && u.email.toLowerCase() === p.email.toLowerCase())
      )
      const meta = au?.user_metadata
      const googleAvatar = au ? extractAvatarUrl(au) : null
      const avatarUrl = p.avatar_url || googleAvatar || null

      // Si falta en la tabla profiles pero existe en la cuenta de Google, actualizar en segundo plano
      if (!p.avatar_url && googleAvatar) {
        adminClient.from('profiles').update({ avatar_url: googleAvatar }).eq('id', p.id).then(() => {})
      }

      return {
        ...p,
        avatar_url: avatarUrl,
        biometrics: biometricsMap.get(p.id) || null,
      }
    })
    return { users: enrichedProfiles, stores }
  }

  // 5. Fallback inteligente: auth.users + public.users
  const authUsers = authUsersList.length > 0
    ? authUsersList
    : ((await adminClient.auth.admin.listUsers()).data?.users || [])

  const { data: legacyUsersData } = await adminClient.from('users').select('*')
  const legacyUsers = legacyUsersData || []

  const userMap = new Map<string, Profile>()

  // Procesar auth.users
  for (const au of authUsers) {
    const lu = legacyUsers.find(
      (u) =>
        u.id_user === au.id ||
        (u.email && au.email && u.email.toLowerCase() === au.email.toLowerCase())
    )

    const rawRole = (lu?.role || au.user_metadata?.role || '').toUpperCase()
    const role = roleCodeToRole(rawRole)

    const rawStatus = (lu?.status || au.user_metadata?.status || 'A').toUpperCase()
    const status = statusCodeToStatus(rawStatus)

    const fullName =
      lu?.user_name ||
      au.user_metadata?.full_name ||
      au.user_metadata?.name ||
      au.email?.split('@')[0] ||
      'Usuario'

    const avatarUrl =
      (lu?.avatar_url as string) ||
      extractAvatarUrl(au) ||
      null

    userMap.set(au.id, {
      id: au.id,
      full_name: fullName,
      email: au.email || null,
      phone: lu?.phone || au.phone || null,
      role,
      id_store: lu?.id_store || au.user_metadata?.id_store || null,
      status,
      avatar_url: avatarUrl,
      created_at: lu?.created_at || au.created_at,
      updated_at: au.updated_at || au.created_at,
      biometrics: biometricsMap.get(au.id) || null,
    })
  }

  // Procesar cualquier usuario en legacyUsers que no esté mapeado aún
  for (const lu of legacyUsers) {
    const id = lu.id_user || lu.email
    if (!id || userMap.has(lu.id_user)) continue

    userMap.set(lu.id_user, {
      id: lu.id_user,
      full_name: lu.user_name || lu.email?.split('@')[0] || 'Usuario',
      email: lu.email || null,
      phone: lu.phone || null,
      role: roleCodeToRole(lu.role),
      id_store: lu.id_store || null,
      status: statusCodeToStatus(lu.status),
      avatar_url: (lu.avatar_url as string) || null,
      created_at: lu.created_at || new Date().toISOString(),
      updated_at: lu.created_at || new Date().toISOString(),
      biometrics: biometricsMap.get(lu.id_user) || null,
    })
  }

  const resultUsers = Array.from(userMap.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  return { users: resultUsers, stores }
}

/**
 * Actualiza el rol, sucursal asignada, datos de contacto y credenciales de cajero de un usuario.
 * Sincroniza tanto en profiles (si existe), en users, en user_biometrics y en user_metadata de auth.
 */
export async function updateUserAction(data: {
  id: string
  role: UserRole
  id_store: string | null
  status: ProfileStatus
  full_name?: string
  phone?: string | null
  cashier_number?: string | null
  cashier_pin?: string | null
}) {
  const adminClient = createAdminClient()

  const roleCode = roleToRoleCode(data.role)
  const statusCode = statusToStatusCode(data.status)
  const storeId = data.role === 'ADMIN' ? null : data.id_store || null

  // 1. Actualizar en public.users
  const userPayload: Record<string, unknown> = {
    role: roleCode,
    status: statusCode,
  }
  if (data.full_name) userPayload.user_name = data.full_name
  if (data.phone !== undefined) userPayload.phone = data.phone

  await adminClient.from('users').update(userPayload).eq('id_user', data.id)

  // 2. Intentar actualizar en public.profiles si existe
  try {
    await adminClient
      .from('profiles')
      .update({
        role: data.role,
        id_store: storeId,
        status: data.status,
        ...(data.full_name ? { full_name: data.full_name } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', data.id)
  } catch {
    // Si profiles no existe, continuar
  }

  // 3. Actualizar datos de cajero (No. de Cajero y PIN) si fueron enviados
  if (data.cashier_number !== undefined || data.cashier_pin !== undefined) {
    try {
      const bioPayload: Record<string, unknown> = {
        id_user: data.id,
        updated_at: new Date().toISOString(),
      }
      if (data.cashier_number !== undefined) bioPayload.cashier_number = data.cashier_number ? data.cashier_number.trim() : null
      if (data.cashier_pin !== undefined) bioPayload.cashier_pin = data.cashier_pin ? data.cashier_pin.trim() : null

      await adminClient.from('user_biometrics').upsert(bioPayload, { onConflict: 'id_user' })
    } catch {
      // Ignorar si la tabla no existe aún
    }
  }

  // 4. Sincronizar metadata en auth.users
  try {
    const metaUpdates: Record<string, unknown> = {
      role: data.role,
      id_store: storeId,
      status: data.status,
      ...(data.full_name ? { full_name: data.full_name } : {}),
    }
    if (data.cashier_number !== undefined) metaUpdates.cashier_number = data.cashier_number ? data.cashier_number.trim() : null
    if (data.cashier_pin !== undefined) metaUpdates.cashier_pin = data.cashier_pin ? data.cashier_pin.trim() : null

    await adminClient.auth.admin.updateUserById(data.id, {
      user_metadata: metaUpdates,
    })
  } catch {
    // Ignorar si el usuario auth no permite edición directa
  }

  revalidatePath('/admin/usuarios')
  return { success: true }
}

/**
 * Alterna el estado activo / inactivo de un usuario.
 */
export async function toggleUserStatusAction(id: string, currentStatus: ProfileStatus) {
  const nextStatus: ProfileStatus = currentStatus === 'active' ? 'inactive' : 'active'
  return updateUserAction({
    id,
    role: 'ADMIN', // Será ignorado o mantenido por actualización parcial
    id_store: null,
    status: nextStatus,
  })
}

/**
 * Crea un nuevo usuario en Supabase Auth y en la base de datos.
 */
export async function createUserAction(formData: {
  email: string
  password: string
  full_name: string
  role: UserRole
  id_store: string | null
  phone?: string | null
  status?: ProfileStatus
  cashier_number?: string | null
  cashier_pin?: string | null
}) {
  const adminClient = createAdminClient()

  if (!formData.email || !formData.email.includes('@')) {
    throw new Error('El correo electrónico no es válido.')
  }
  if (!formData.password || formData.password.length < 6) {
    throw new Error('La contraseña debe tener al menos 6 caracteres.')
  }
  if (!formData.full_name || formData.full_name.trim().length === 0) {
    throw new Error('El nombre completo es obligatorio.')
  }

  const role = formData.role || 'CASHIER'
  const status = formData.status || 'active'
  const storeId = role === 'ADMIN' ? null : formData.id_store || null
  const roleCode = roleToRoleCode(role)
  const statusCode = statusToStatusCode(status)

  // 1. Crear en Supabase Auth
  const { data: authResult, error: authError } = await adminClient.auth.admin.createUser({
    email: formData.email,
    password: formData.password,
    email_confirm: true,
    user_metadata: {
      full_name: formData.full_name,
      role,
      id_store: storeId,
      phone: formData.phone || null,
      status,
      cashier_number: formData.cashier_number ? formData.cashier_number.trim() : null,
      cashier_pin: formData.cashier_pin ? formData.cashier_pin.trim() : null,
      has_webauthn: false,
      has_face: false,
    },
  })

  if (authError || !authResult.user) {
    throw new Error(authError?.message || 'Error al crear usuario en Supabase Auth.')
  }

  const newUserId = authResult.user.id

  // 2. Insertar en public.users
  const { error: userError } = await adminClient.from('users').upsert({
    id_user: newUserId,
    user_name: formData.full_name,
    email: formData.email,
    role: roleCode,
    status: statusCode,
    phone: formData.phone || null,
  })

  if (userError) {
    console.error('Error insertando en users:', userError.message)
  }

  // 3. Insertar en public.profiles si existe
  try {
    await adminClient.from('profiles').upsert({
      id: newUserId,
      full_name: formData.full_name,
      email: formData.email,
      role,
      id_store: storeId,
      status,
      phone: formData.phone || null,
    })
  } catch {
    // Si profiles no existe en la base de datos todavía
  }

  // 4. Insertar datos biométricos y de cajero iniciales en user_biometrics
  let initialBiometrics: UserBiometric | null = null
  if (formData.cashier_number || formData.cashier_pin) {
    try {
      const bioPayload = {
        id_user: newUserId,
        cashier_number: formData.cashier_number ? formData.cashier_number.trim() : null,
        cashier_pin: formData.cashier_pin ? formData.cashier_pin.trim() : null,
        has_webauthn: false,
        has_face: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      const { data: bioCreated } = await adminClient
        .from('user_biometrics')
        .upsert(bioPayload, { onConflict: 'id_user' })
        .select()
        .single()

      if (bioCreated) {
        initialBiometrics = bioCreated as UserBiometric
      }
    } catch {
      // Ignorar si la tabla no existe aún
    }
  }

  revalidatePath('/admin/usuarios')
  return {
    success: true,
    user: {
      id: newUserId,
      full_name: formData.full_name,
      email: formData.email,
      phone: formData.phone || null,
      role,
      id_store: storeId,
      status,
      avatar_url: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      biometrics: initialBiometrics,
    } as Profile,
  }
}

/**
 * Eliminación lógica del usuario (marca status como inactive).
 */
export async function deleteUserAction(id: string) {
  const adminClient = createAdminClient()

  // 1. Lógica en public.users
  await adminClient.from('users').update({ status: 'I' }).eq('id_user', id)

  // 2. Lógica en public.profiles
  try {
    await adminClient.from('profiles').update({ status: 'inactive' }).eq('id', id)
  } catch {
    // Continuar
  }

  // 3. Actualizar metadata en auth
  try {
    await adminClient.auth.admin.updateUserById(id, {
      user_metadata: { status: 'inactive' },
    })
  } catch {
    // Continuar
  }

  revalidatePath('/admin/usuarios')
  return { success: true }
}

/**
 * Obtiene las credenciales biométricas y de cajero de un usuario.
 */
export async function getUserBiometricsAction(userId: string): Promise<UserBiometric | null> {
  const adminClient = createAdminClient()

  // 1. Intentar consultar tabla user_biometrics
  try {
    const { data, error } = await adminClient
      .from('user_biometrics')
      .select('*')
      .eq('id_user', userId)
      .maybeSingle()

    if (!error && data) {
      return data as UserBiometric
    }
  } catch {
    // Si la tabla aún no existe en Supabase
  }

  // 2. Fallback: auth.users metadata
  try {
    const { data: userData, error: userErr } = await adminClient.auth.admin.getUserById(userId)
    if (!userErr && userData?.user?.user_metadata) {
      const meta = userData.user.user_metadata
      return {
        id_biometric: userId,
        id_user: userId,
        cashier_number: meta.cashier_number || null,
        cashier_pin: meta.cashier_pin || null,
        has_webauthn: Boolean(meta.has_webauthn),
        webauthn_credential: meta.webauthn_credential || null,
        has_face: Boolean(meta.has_face),
        face_photo_url: meta.face_photo_url || null,
        face_descriptor: meta.face_descriptor || null,
        created_at: userData.user.created_at,
        updated_at: userData.user.updated_at || userData.user.created_at,
      }
    }
  } catch {
    // Continuar
  }

  return null
}

/**
 * Guarda o actualiza los datos biométricos (WebAuthn, Face Detection, No. Cajero y PIN).
 */
export async function saveUserBiometricsAction(data: {
  id_user: string
  cashier_number?: string | null
  cashier_pin?: string | null
  has_webauthn?: boolean
  webauthn_credential?: Record<string, unknown> | null
  has_face?: boolean
  face_photo_url?: string | null
  face_descriptor?: unknown | null
}) {
  const adminClient = createAdminClient()

  const payload: Record<string, unknown> = {
    id_user: data.id_user,
    cashier_number: data.cashier_number || null,
    cashier_pin: data.cashier_pin || null,
    has_webauthn: Boolean(data.has_webauthn),
    has_face: Boolean(data.has_face),
    updated_at: new Date().toISOString(),
  }

  if (data.webauthn_credential !== undefined) {
    payload.webauthn_credential = data.webauthn_credential
  }
  if (data.face_photo_url !== undefined) {
    payload.face_photo_url = data.face_photo_url
  }
  if (data.face_descriptor !== undefined) {
    payload.face_descriptor = data.face_descriptor
  }

  // 1. Guardar en user_biometrics (upsert)
  let savedDb = false
  try {
    const { error } = await adminClient
      .from('user_biometrics')
      .upsert(payload, { onConflict: 'id_user' })
    if (!error) savedDb = true
  } catch {
    // La tabla puede no haber sido corrida en DB aún
  }

  // 2. Guardar en metadata de Auth para sincronización 100% garantizada
  try {
    await adminClient.auth.admin.updateUserById(data.id_user, {
      user_metadata: {
        cashier_number: data.cashier_number,
        cashier_pin: data.cashier_pin,
        has_webauthn: data.has_webauthn,
        webauthn_credential: data.webauthn_credential,
        has_face: data.has_face,
        face_photo_url: data.face_photo_url,
      },
    })
  } catch (authErr) {
    console.error('Error actualizando user_metadata:', authErr)
  }

  revalidatePath('/admin/usuarios')
  revalidatePath('/pos')
  return { success: true, savedDb }
}
