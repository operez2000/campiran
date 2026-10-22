import type { Metadata } from 'next'
import { AjustesClient } from './ajustes-client'

export const metadata: Metadata = {
  title: 'Ajustes de Inventario & Kardex',
  description: 'Gestión de ajustes de existencias, mermas, sobrantes y Kardex de inventario en tiempo real',
}

export default function AjustesInventarioPage() {
  return <AjustesClient />
}
