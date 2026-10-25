import type { Metadata } from 'next'
import { ConsultaInventarioClient } from './consulta-client'

export const metadata: Metadata = {
  title: 'Consulta de Inventario Físico',
  description: 'Comparativa de existencias previas, conteo físico y diferencias por sucursal',
}

export default function ConsultaInventarioPage() {
  return <ConsultaInventarioClient />
}
