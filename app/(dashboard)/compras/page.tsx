import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { getAuthenticatedProfile } from '@/lib/auth-profile'
import { ComprasClient } from './compras-client'

export const metadata: Metadata = {
  title: 'Compras y Abastecimiento | Campiran',
  description:
    'Registro de compras a proveedores, recepción de mercancía en tiempo real, afectación a existencias, Kardex y cuentas por pagar',
}

export default async function ComprasPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const profile = await getAuthenticatedProfile(supabase, user)

  if (profile.role !== 'ADMIN' && profile.role !== 'MANAGER') {
    redirect(profile.role === 'ALMACENISTA' ? '/inventario' : '/pos')
  }

  return <ComprasClient currentProfile={profile} />
}
