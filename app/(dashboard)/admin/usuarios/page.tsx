import type { Metadata } from 'next'
import { UsuariosClient } from './usuarios-client'
import { getUsersAndStoresAction } from './actions'

export const metadata: Metadata = {
  title: 'Usuarios y Permisos',
  description: 'Administración de usuarios, roles del sistema y asignación de sucursales',
}

export default async function UsuariosPage() {
  const initialData = await getUsersAndStoresAction()
  return <UsuariosClient initialUsers={initialData.users} initialStores={initialData.stores} />
}

