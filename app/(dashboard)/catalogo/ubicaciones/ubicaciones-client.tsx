'use client'

import { useStore } from '@/components/providers/store-provider'
import { SimpleCatalogCrud } from '@/components/catalogo/simple-catalog-crud'
import { MapPin } from 'lucide-react'

export function UbicacionesClient() {
  const { currentStore, storeId } = useStore()

  return (
    <SimpleCatalogCrud
      title="Ubicaciones de Almacén"
      subtitle={`Pasillos, estantes y zonas físicas en ${currentStore?.description ?? 'sucursal activa'}`}
      tableName="locations"
      idColumn="id_location"
      icon={<MapPin className="text-emerald-500" size={28} />}
      storeIdFilter={storeId}
    />
  )
}
