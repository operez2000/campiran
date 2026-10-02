import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardLayout } from '@/components/layouts/dashboard-layout'
import { getAuthenticatedProfile } from '@/lib/auth-profile'

export default async function DashboardRootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const profile = await getAuthenticatedProfile(supabase, user)

  if (profile.status === 'inactive' || profile.role === 'PENDING') {
    redirect('/pending')
  }

  return (
    <DashboardLayout profile={profile}>
      {children}
    </DashboardLayout>
  )
}
