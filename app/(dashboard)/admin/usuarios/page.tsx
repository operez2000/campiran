import type { Metadata } from 'next'
import { UsuariosClient } from './usuarios-client'

export const metadata: Metadata = {
  title: 'Usuarios y Permisos',
  description: 'Administración de usuarios, roles del sistema y asignación de sucursales',
}

export default function UsuariosPage() {
  return <UsuariosClient />
}
