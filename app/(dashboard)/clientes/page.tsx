import type { Metadata } from 'next'
import { getClients } from './actions'
import { ClientesClient } from './clientes-client'

export const metadata: Metadata = {
  title: 'Clientes',
  description: 'Gestión de clientes y asignación de listas de precios',
}

export default async function ClientesPage() {
  const initialClients = await getClients()
  return <ClientesClient initialData={initialClients} />
}

