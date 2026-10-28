'use client'

import { useState } from 'react'
import { useStore } from '@/components/providers/store-provider'
import { GlassButton } from '@/components/glass-button'
import { InventarioTabs } from '@/components/inventario/inventario-tabs'
import { KardexView } from '@/components/inventario/kardex-view'
import { AjusteInventarioModal } from '@/components/inventario/ajuste-modal'
import { type Item } from '@/lib/types'
import { BookOpen, Wrench } from 'lucide-react'

export function KardexClient() {
  const { currentStore } = useStore()

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [ajusteModalOpen, setAjusteModalOpen] = useState(false)
  const [preselectedItem, setPreselectedItem] = useState<Item | null>(null)
  const [preselectedLocationId, setPreselectedLocationId] = useState<string | null>(null)

  const handleOpenAdjustment = (item?: Item | null, locId?: string | null) => {
    setPreselectedItem(item ?? null)
    setPreselectedLocationId(locId ?? null)
    setAjusteModalOpen(true)
  }

  return (
    <div className="min-h-full sm:h-full flex-1 flex flex-col min-h-0 gap-2.5 sm:gap-3 pb-8 sm:pb-0">
      <div className="dashboard-bg" />

      {/* Header & Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shrink-0">
        <div>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-foreground flex items-center gap-2 leading-tight">
            <BookOpen className="text-emerald-500" size={20} />
            Kardex de Inventario
          </h1>
          <p className="text-xs text-muted-foreground line-clamp-1">
            Trazabilidad histórica de existencias, entradas, salidas, ajustes y valuación para{' '}
            <span className="font-semibold text-emerald-500">
              {currentStore?.description ?? 'sucursal activa'}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <GlassButton
            type="button"
            variant="primary"
            size="sm"
            onClick={() => handleOpenAdjustment(null, null)}
            icon={<Wrench size={15} />}
          >
            Nuevo Ajuste
          </GlassButton>
          <InventarioTabs />
        </div>
      </div>

      {/* Main Kardex View */}
      <KardexView
        selectedItemId={selectedItemId}
        onSelectItemId={setSelectedItemId}
        onOpenAdjustment={handleOpenAdjustment}
      />

      {/* Adjustment Modal */}
      <AjusteInventarioModal
        open={ajusteModalOpen}
        onClose={() => setAjusteModalOpen(false)}
        preselectedItem={preselectedItem}
        preselectedLocationId={preselectedLocationId}
      />
    </div>
  )
}
