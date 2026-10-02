import type { Metadata } from 'next'
import { UbicacionesClient } from './ubicaciones-client'

export const metadata: Metadata = {
  title: 'Ubicaciones',
  description: 'Gestión de ubicaciones físicas por sucursal',
}

export default function UbicacionesPage() {
  return <UbicacionesClient />
}
