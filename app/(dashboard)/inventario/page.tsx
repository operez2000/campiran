import type { Metadata } from 'next'
import { StockClient } from './stock-client'

export const metadata: Metadata = {
  title: 'Inventario & Stock',
  description: 'Gestión y control de existencias en tiempo real',
}

export default function InventarioPage() {
  return <StockClient />
}
