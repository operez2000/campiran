import type { Metadata } from 'next'
import { SimpleCatalogCrud } from '@/components/catalogo/simple-catalog-crud'
import { Layers } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Categorías',
  description: 'Clasificación de artículos por categoría',
}

export default function CategoriasPage() {
  return (
    <SimpleCatalogCrud
      title="Categorías"
      subtitle="Clasificación general de artículos y familias de producto"
      tableName="categories"
      idColumn="id_category"
      icon={<Layers className="text-emerald-500" size={28} />}
    />
  )
}
