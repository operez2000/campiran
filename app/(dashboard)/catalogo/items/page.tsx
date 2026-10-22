import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { getAuthenticatedProfile } from '@/lib/auth-profile'
import { ItemsClient } from './items-client'

export const metadata: Metadata = {
  title: 'Artículos & Catálogo',
  description: 'Gestión de productos, servicios, precios y códigos SAT',
}

export default async function ItemsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const profile = await getAuthenticatedProfile(supabase, user)

  return <ItemsClient currentProfile={profile} />
}

