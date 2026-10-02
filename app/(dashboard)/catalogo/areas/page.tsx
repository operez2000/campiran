import type { Metadata } from 'next'
import { SimpleCatalogCrud } from '@/components/catalogo/simple-catalog-crud'
import { Building2 } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Áreas',
  description: 'Gestión de áreas organizacionales',
}

export default function AreasPage() {
  return (
    <SimpleCatalogCrud
      title="Áreas"
      subtitle="Catálogo de áreas operativas y organizacionales"
      tableName="areas"
      idColumn="id_area"
      icon={<Building2 className="text-emerald-500" size={28} />}
    />
  )
}
