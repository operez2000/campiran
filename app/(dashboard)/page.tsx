import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { getAuthenticatedProfile } from '@/lib/auth-profile'

const ROLE_DASHBOARD: Record<string, string> = {
  ADMIN:       '/reportes',
  MANAGER:     '/reportes',
  CASHIER:     '/pos',
  ALMACENISTA: '/inventario',
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await getAuthenticatedProfile(supabase, user)
  const destination = ROLE_DASHBOARD[profile.role] ?? '/pos'
  redirect(destination)
}
