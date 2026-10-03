'use server'

import { createAdminClient } from '@/utils/supabase/admin'
import { revalidatePath } from 'next/cache'
import { type Profile, type Store, type UserRole, type ProfileStatus } from '@/lib/types'

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
 * Obtiene la lista completa de usuarios y tiendas activas.
 * Consulta auth.users, la tabla profiles y la tabla legacy users con sincronización transparente.
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

  // 2. Intentar consultar profiles
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

  // Si profiles ya tiene registros, retornarlos
  if (profiles.length > 0) {
    return { users: profiles, stores }
  }

  // 3. Fallback inteligente: auth.users + public.users
  const { data: authData } = await adminClient.auth.admin.listUsers()
  const authUsers = authData?.users || []

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
      au.user_metadata?.avatar_url ||
      au.user_metadata?.picture ||
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
      avatar_url: null,
      created_at: lu.created_at || new Date().toISOString(),
      updated_at: lu.created_at || new Date().toISOString(),
    })
  }

  const resultUsers = Array.from(userMap.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  return { users: resultUsers, stores }
}

/**
 * Actualiza el rol, sucursal asignada y estado de un usuario.
 * Sincroniza tanto en profiles (si existe), en users y en user_metadata de auth.
 */
export async function updateUserAction(data: {
  id: string
  role: UserRole
  id_store: string | null
  status: ProfileStatus
  full_name?: string
  phone?: string | null
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

  // 3. Sincronizar metadata en auth.users
  try {
    await adminClient.auth.admin.updateUserById(data.id, {
      user_metadata: {
        role: data.role,
        id_store: storeId,
        status: data.status,
        ...(data.full_name ? { full_name: data.full_name } : {}),
      },
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
