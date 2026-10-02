import type { Metadata } from 'next'
import { TiendasClient } from './tiendas-client'

export const metadata: Metadata = {
  title: 'Administración de Sucursales',
  description: 'Gestión y configuración de sucursales de la empresa',
}

export default function TiendasPage() {
  return <TiendasClient />
}
