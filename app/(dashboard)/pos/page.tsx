import type { Metadata } from 'next'
import { PosClient } from './pos-client'

export const metadata: Metadata = {
  title: 'Punto de Venta',
  description: 'Sistema de cobro, ventas rápidas y emisión de tickets',
}

export default function PosPage() {
  return <PosClient />
}
