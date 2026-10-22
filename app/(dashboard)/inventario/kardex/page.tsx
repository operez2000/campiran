import type { Metadata } from 'next'
import { KardexClient } from './kardex-client'

export const metadata: Metadata = {
  title: 'Kardex de Inventario',
  description: 'Kardex histórico, saldos por movimiento y valuación de inventario en tiempo real',
}

export default function KardexInventarioPage() {
  return <KardexClient />
}
