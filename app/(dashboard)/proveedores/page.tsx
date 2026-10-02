import type { Metadata } from 'next'
import { ProveedoresClient } from './proveedores-client'

export const metadata: Metadata = {
  title: 'Proveedores',
  description: 'Directorio de proveedores y condiciones de crédito comercial',
}

export default function ProveedoresPage() {
  return <ProveedoresClient />
}
