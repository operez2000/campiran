import type { Metadata } from 'next'
import { ItemsClient } from './items-client'

export const metadata: Metadata = {
  title: 'Artículos & Catálogo',
  description: 'Gestión de productos, servicios, precios y códigos SAT',
}

export default function ItemsPage() {
  return <ItemsClient />
}
