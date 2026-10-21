import type { Metadata } from 'next'
import { getBranchLabelConfigsFullAction, getCompanySettingsAction } from '../actions'
import { EtiquetasClient } from './etiquetas-client'

export const metadata: Metadata = {
  title: 'Etiquetas de Códigos de Barras — Configuración',
  description: 'Gestión y configuración de plantillas e impresoras de etiquetas de códigos de barras por sucursal',
}

export default async function ConfiguracionEtiquetasPage() {
  const [labelData, companyData] = await Promise.all([
    getBranchLabelConfigsFullAction(),
    getCompanySettingsAction(),
  ])

  return (
    <EtiquetasClient
      initialConfigs={labelData.configs}
      initialStores={labelData.stores}
      initialStoreId={labelData.currentStoreId}
      userRole={labelData.userRole}
      company={companyData.company}
    />
  )
}
