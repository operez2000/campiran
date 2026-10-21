import type { Metadata } from 'next'
import { getBranchPrintersAction, getCompanySettingsAction } from '../actions'
import { ImpresorasClient } from './impresoras-client'

export const metadata: Metadata = {
  title: 'Impresoras de Recibos (QZ Tray) — Configuración',
  description: 'Gestión y configuración de impresoras térmicas por sucursal con soporte IP y Bluetooth',
}

export default async function ConfiguracionImpresorasPage() {
  const [printersData, companyData] = await Promise.all([
    getBranchPrintersAction(),
    getCompanySettingsAction(),
  ])

  return (
    <ImpresorasClient
      initialPrinters={printersData.printers}
      initialStores={printersData.stores}
      initialStoreId={printersData.currentStoreId}
      userRole={printersData.userRole}
      company={companyData.company}
    />
  )
}
