import type { Metadata } from 'next'
import { getCompanySettingsAction } from '../actions'
import { EmpresaClient } from './empresa-client'

export const metadata: Metadata = {
  title: 'Datos de la Empresa — Configuración',
  description: 'Configuración fiscal, general y logo global de la empresa',
}

export default async function ConfiguracionEmpresaPage() {
  const initialData = await getCompanySettingsAction()

  return (
    <EmpresaClient
      initialCompany={initialData.company}
      userRole={initialData.userRole}
    />
  )
}
