import type { Metadata } from 'next'
import { createClient } from '@/utils/supabase/server'
import { getAuthenticatedProfile } from '@/lib/auth-profile'
import { ReportesClient } from './reportes-client'

export const metadata: Metadata = {
  title: 'Reportes & Rendimiento',
  description: 'Métricas financieras, ventas, márgenes y asistencia de empleados',
}

export default async function ReportesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const profile = user ? await getAuthenticatedProfile(supabase, user) : null

  return <ReportesClient currentProfile={profile} />
}
