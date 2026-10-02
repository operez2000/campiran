import type { Metadata } from 'next'
import { MovimientosClient } from './movimientos-client'

export const metadata: Metadata = {
  title: 'Movimientos de Inventario',
  description: 'Historial de transacciones, entradas y salidas de almacén',
}

export default function MovimientosPage() {
  return <MovimientosClient />
}
