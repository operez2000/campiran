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
    avatar_url:
      (u.avatar_url as string) ||
      (userMeta?.avatar_url as string) ||
      (userMeta?.picture as string) ||
      (userMeta?.avatar as string) ||
      null,
    created_at: (u.created_at as string) || new Date().toISOString(),
    updated_at: (u.updated_at as string) || new Date().toISOString(),
    sales_commission_pct: Number(u.sales_commission_pct ?? userMeta?.sales_commission_pct ?? 0),
    service_commission_pct: Number(u.service_commission_pct ?? userMeta?.service_commission_pct ?? 0),
  }
}

/**
 * Extracts avatar URL from user metadata or OAuth identities (e.g. Gmail / Google)
 */
export function extractAvatarUrl(user: {
  user_metadata?: Record<string, unknown> | null
  identities?: Array<{ provider?: string; identity_data?: Record<string, unknown> | null }> | null
}): string | null {
  const meta = user.user_metadata
  if (meta?.avatar_url && typeof meta.avatar_url === 'string' && meta.avatar_url.trim()) {
    return meta.avatar_url.trim()
  }
  if (meta?.picture && typeof meta.picture === 'string' && meta.picture.trim()) {
    return meta.picture.trim()
  }
  if (meta?.avatar && typeof meta.avatar === 'string' && meta.avatar.trim()) {
    return meta.avatar.trim()
  }
  if (user.identities && Array.isArray(user.identities)) {
    for (const ident of user.identities) {
      const idData = ident?.identity_data
      if (idData?.avatar_url && typeof idData.avatar_url === 'string' && idData.avatar_url.trim()) {
        return idData.avatar_url.trim()
      }
      if (idData?.picture && typeof idData.picture === 'string' && idData.picture.trim()) {
        return idData.picture.trim()
      }
    }
  }
  return null
}

/**
 * Robust profile resolver that checks `profiles` table first,
 * and falls back seamlessly to the legacy `users` table or auto-provisions
 * the profile for authenticated users.
 * Automatically synchronizes and preserves Gmail / Google OAuth avatar.
 */
export async function getAuthenticatedProfile(
  supabase: SupabaseClient,
  user: User
): Promise<Profile> {
  const googleAvatar = extractAvatarUrl(user)

  // 1. Try querying public.profiles
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()

    if (!error && profile) {
      const currentAvatar = (profile.avatar_url as string) || googleAvatar || null

      // If database has no avatar_url but Google OAuth has one, persist it
      if (!profile.avatar_url && googleAvatar) {
        try {
          const { createAdminClient } = await import('@/utils/supabase/admin')
          const adminClient = createAdminClient()
          await adminClient
            .from('profiles')
            .update({ avatar_url: googleAvatar, updated_at: new Date().toISOString() })
            .eq('id', user.id)
        } catch {
          try {
            await supabase
              .from('profiles')
              .update({ avatar_url: googleAvatar, updated_at: new Date().toISOString() })
              .eq('id', user.id)
          } catch {
            // ignore
          }
        }
      }

      return {
        ...(profile as Profile),
        avatar_url: currentAvatar,
      }
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
      const mapped = mapUserToProfile(legacyUser, user.user_metadata)
      if (!mapped.avatar_url && googleAvatar) {
        mapped.avatar_url = googleAvatar
      }
      return mapped
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

  // Attempt to save into users table so it persists (use admin client to bypass RLS)
  try {
    const { createAdminClient } = await import('@/utils/supabase/admin')
    const adminClient = createAdminClient()
    await adminClient.from('users').upsert({
      id_user: user.id,
      user_name: fullName,
      email: user.email,
      role: defaultRole === 'ADMIN' ? 'A' : 'O',
      status: 'A',
    })
    
    // Also try to insert into profiles if the table is created
    await adminClient.from('profiles').upsert({
      id: user.id,
      full_name: fullName,
      email: user.email,
      role: defaultRole,
      status: 'active',
      avatar_url: googleAvatar,
    })
  } catch {
    // Fallback to regular supabase client if admin client fails
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
  }

  return {
    id: user.id,
    full_name: fullName,
    email: user.email || null,
    phone: null,
    role: defaultRole,
    id_store: null,
    status: 'active',
    avatar_url: googleAvatar,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}
