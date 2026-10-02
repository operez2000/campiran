import type { Metadata } from 'next'
import { FisicoClient } from './fisico-client'

export const metadata: Metadata = {
  title: 'Captura de Inventario Físico',
  description: 'Conteo físico de mercancía en tiempo real con escáner',
}

export default function InventarioFisicoPage() {
  return <FisicoClient />
}
