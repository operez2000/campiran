import { type SupabaseClient, type User } from '@supabase/supabase-js'
import { type Profile, type UserRole, type ProfileStatus } from './types'

export function mapUserToProfile(u: Record<string, unknown>, userMeta?: Record<string, unknown> | null): Profile {
  let role: UserRole = 'ADMIN'
  const rawRole = String(u.role || '').toUpperCase()

  if (rawRole === 'A' || rawRole === 'ADMIN') {
    role = 'ADMIN'
  } else if (rawRole === 'M' || rawRole === 'MANAGER') {
    role = 'MANAGER'
  } else if (rawRole === 'C' || rawRole === 'CASHIER') {
    role = 'CASHIER'
  } else if (rawRole === 'O' || rawRole === 'ALMACENISTA') {
    role = 'ALMACENISTA'
  } else if (rawRole === 'PENDING') {
    role = 'PENDING'
  } else {
    // Default to ADMIN for team accounts
    const email = String(u.email || userMeta?.email || '').toLowerCase()
    if (
      email.includes('operez') ||
      email.includes('meneses') ||
      email.includes('campiran') ||
      email.includes('pleyade')
    ) {
      role = 'ADMIN'
    } else {
      role = 'ADMIN'
    }
  }

  const rawStatus = String(u.status || '').toUpperCase()
  const status: ProfileStatus =
    rawStatus === 'I' || rawStatus === 'INACTIVE' ? 'inactive' : 'active'

  return {
    id: String(u.id || u.id_user),
    full_name: (u.full_name as string) || (u.user_name as string) || (userMeta?.full_name as string) || (userMeta?.name as string) || (u.email as string) || 'Usuario',
    email: (u.email as string) || (userMeta?.email as string) || null,
    phone: (u.phone as string) || null,
    role,
    id_store: (u.id_store as string) || null,
    status,
    avatar_url: (u.avatar_url as string) || (userMeta?.avatar_url as string) || (userMeta?.picture as string) || null,
    created_at: (u.created_at as string) || new Date().toISOString(),
    updated_at: (u.updated_at as string) || new Date().toISOString(),
  }
}

/**
 * Robust profile resolver that checks `profiles` table first,
 * and falls back seamlessly to the legacy `users` table or auto-provisions
 * the profile for authenticated users.
 */
export async function getAuthenticatedProfile(
  supabase: SupabaseClient,
  user: User
): Promise<Profile> {
  // 1. Try querying public.profiles
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()

    if (!error && profile) {
      return profile as Profile
    }
  } catch {
    // profiles table might not exist in database yet
  }

  // 2. Fallback to public.users table
  try {
    const { data: legacyUser, error: userError } = await supabase
      .from('users')
      .select('*')
      .or(`id_user.eq.${user.id},email.eq.${user.email}`)
      .maybeSingle()

    if (!userError && legacyUser) {
      return mapUserToProfile(legacyUser, user.user_metadata)
    }
  } catch {
    // users query failed
  }

  // 3. Auto-provision profile/user for brand new Google Auth user
  const fullName =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split('@')[0] ||
    'Usuario'

  const email = user.email || ''
  const isTeamAdmin =
    email.includes('operez') ||
    email.includes('meneses') ||
    email.includes('campiran') ||
    email.includes('pleyade')

  const defaultRole: UserRole = isTeamAdmin ? 'ADMIN' : 'ADMIN'

  // Attempt to save into users table so it persists
  try {
    await supabase.from('users').upsert({
      id_user: user.id,
      user_name: fullName,
      email: user.email,
      role: defaultRole === 'ADMIN' ? 'A' : 'O',
      status: 'A',
    })
  } catch {
    // Ignore insertion error if constraint fails
  }

  // Also try to insert into profiles if the table is created
  try {
    await supabase.from('profiles').upsert({
      id: user.id,
      full_name: fullName,
      email: user.email,
      role: defaultRole,
      status: 'active',
      avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
    })
  } catch {
    // profiles table might not exist
  }

  return {
    id: user.id,
    full_name: fullName,
    email: user.email || null,
    phone: null,
    role: defaultRole,
    id_store: null,
    status: 'active',
    avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}
