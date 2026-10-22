import type { Metadata } from 'next'
import { createClient } from '@/utils/supabase/server'
import { getAuthenticatedProfile } from '@/lib/auth-profile'
import { TraspasosClient } from './traspasos-client'

export const metadata: Metadata = {
  title: 'Traspasos entre Sucursales | Campiran',
  description: 'Envío, tránsito y recepción de mercancía entre sucursales en tiempo real',
}

export default async function TraspasosPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const profile = user ? await getAuthenticatedProfile(supabase, user) : null

  return <TraspasosClient currentProfile={profile} />
}
