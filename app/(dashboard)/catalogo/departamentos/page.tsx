import type { Metadata } from 'next'
import { SimpleCatalogCrud } from '@/components/catalogo/simple-catalog-crud'
import { Building2 } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Departamentos',
  description: 'Gestión de departamentos',
}

export default function DepartamentosPage() {
  return (
    <SimpleCatalogCrud
      title="Departamentos"
      subtitle="Catálogo de departamentos para segmentación de inventario"
      tableName="departments"
      idColumn="id_department"
      icon={<Building2 className="text-emerald-500" size={28} />}
    />
  )
}
