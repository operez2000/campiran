import type { Metadata } from 'next'
import { ReportesClient } from './reportes-client'

export const metadata: Metadata = {
  title: 'Reportes & Rendimiento',
  description: 'Métricas financieras, ventas, márgenes y exportación analítica',
}

export default function ReportesPage() {
  return <ReportesClient />
}
