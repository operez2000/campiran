'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/utils/supabase/client'
import { GlassCard } from '@/components/glass-card'
import { GlassButton } from '@/components/glass-button'
import { GlassInput } from '@/components/glass-input'
import { StatusBadge } from '@/components/status-badge'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { ConfiguracionTabs } from '@/components/configuracion/configuracion-tabs'
import { TableActionMenu, TableColumnHeader, TablePagination } from '@/components/tables'
import { LabelPreview } from '@/components/labels/label-preview'
import {
  getBranchLabelConfigsAction,
  saveBranchLabelConfigAction,
  deleteBranchLabelConfigAction,
  setDefaultBranchLabelConfigAction,
} from '../actions'
import {
  type BranchLabelConfig,
  type Store,
  type UserRole,
  type CompanySettings,
  type LabelUnit,
  type BarcodeType,
  type LabelPriceOption,
} from '@/lib/types'
import { PRINTER_PRESETS, inToCm, cmToIn } from '@/lib/label-presets'
import { toast } from 'sonner'
import {
  Tag, Plus, Search, CheckCircle2, Trash2, Edit3, Store as StoreIcon,
  HelpCircle, RefreshCw, Check, Star, Sliders, Layers, Eye, Printer
} from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'

interface EtiquetasClientProps {
  initialConfigs: BranchLabelConfig[]
  initialStores: Store[]
  initialStoreId: string | null
  userRole: UserRole
  company: CompanySettings
}

export function EtiquetasClient({
  initialConfigs,
  initialStores,
  initialStoreId,
  userRole,
  company,
}: EtiquetasClientProps) {
  const supabase = createClient()
  const isAdmin = userRole === 'ADMIN'

  // Tiendas
  const [stores] = useState<Store[]>(initialStores)
  const [selectedStoreId, setSelectedStoreId] = useState<string>(
    initialStoreId || (initialStores[0]?.id_store ?? '')
  )

  // Lista de configuraciones
  const [configs, setConfigs] = useState<BranchLabelConfig[]>(initialConfigs)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')

  // Modal Crear / Editar
  const [modalOpen, setModalOpen] = useState(false)
  const [editingConfig, setEditingConfig] = useState<BranchLabelConfig | null>(null)
  const [saving, setSaving] = useState(false)

  // Campos de formulario
  const [formName, setFormName] = useState('')
  const [formBrand, setFormBrand] = useState('Zebra')
  const [formModel, setFormModel] = useState('ZD220 / ZD420 / ZD421 (4 pulgadas)')
  const [formSelectedPresetId, setFormSelectedPresetId] = useState<string>('zebra-50x25-2col')
  const [isCustomMode, setIsCustomMode] = useState(false)

  // Dimensiones
  const [formUnit, setFormUnit] = useState<LabelUnit>('cm')
  const [formWidth, setFormWidth] = useState<number>(5.0)
  const [formHeight, setFormHeight] = useState<number>(2.5)
  const [formLabelsPerRow, setFormLabelsPerRow] = useState<number>(1)
  const [formGapX, setFormGapX] = useState<number>(0.0)
  const [formGapY, setFormGapY] = useState<number>(0.3)

  // Opciones de contenido
  const [formIncludeItemName, setFormIncludeItemName] = useState(true)
  const [formIncludePrice, setFormIncludePrice] = useState(true)
  const [formPriceToPrint, setFormPriceToPrint] = useState<LabelPriceOption>('price1')
  const [formIncludeCode, setFormIncludeCode] = useState(true)
  const [formIncludeBarcode, setFormIncludeBarcode] = useState(true)
  const [formIncludeStoreName, setFormIncludeStoreName] = useState(false)
  const [formBarcodeType, setFormBarcodeType] = useState<BarcodeType>('CODE128')
  const [formIsDefault, setFormIsDefault] = useState(false)

  // Delete Confirm
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [configToDelete, setConfigToDelete] = useState<BranchLabelConfig | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Sorting
  const [sortKey, setSortKey] = useState<string>('name')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)

  // Cargar configuraciones de la sucursal seleccionada
  const fetchConfigs = useCallback(async () => {
    if (!selectedStoreId) return
    setLoading(true)
    try {
      const data = await getBranchLabelConfigsAction(selectedStoreId)
      setConfigs(data || [])
    } catch {
      // Manejo silencioso: la pantalla muestra el empty state con botón para crear plantilla
    } finally {
      setLoading(false)
    }
  }, [selectedStoreId])

  useEffect(() => {
    // Si cambia de sucursal, refrescar
    if (selectedStoreId && selectedStoreId !== initialStoreId) {
      fetchConfigs()
    }
  }, [selectedStoreId, initialStoreId, fetchConfigs])

  // Realtime subscription
  useEffect(() => {
    if (!selectedStoreId) return

    const channel = supabase
      .channel(`label-configs-${selectedStoreId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'branch_label_configs',
          filter: `id_store=eq.${selectedStoreId}`,
        },
        () => {
          fetchConfigs()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [selectedStoreId, supabase, fetchConfigs])

  // Obtener modelos disponibles para la marca seleccionada
  const availableModels = useMemo(() => {
    const brandData = PRINTER_PRESETS.find((p) => p.brand === formBrand)
    return brandData ? brandData.models : []
  }, [formBrand])

  // Obtener tamaños disponibles para el modelo seleccionado
  const availablePresets = useMemo(() => {
    const modelData = availableModels.find((m) => m.model === formModel)
    return modelData ? modelData.labelSizes : []
  }, [availableModels, formModel])

  // Aplicar un preset predefinido
  const applyPreset = useCallback((presetId: string) => {
    setFormSelectedPresetId(presetId)
    if (presetId === 'custom') {
      setIsCustomMode(true)
      return
    }

    const preset = availablePresets.find((p) => p.id === presetId)
    if (preset) {
      setIsCustomMode(false)
      setFormUnit(preset.unit)
      setFormWidth(preset.label_width)
      setFormHeight(preset.label_height)
      setFormLabelsPerRow(preset.labels_per_row)
      setFormGapX(preset.gap_x)
      setFormGapY(preset.gap_y)
      if (!editingConfig && !formName) {
        setFormName(preset.name)
      }
    }
  }, [availablePresets, editingConfig, formName])

  // Abrir modal de creación
  const openCreateModal = () => {
    setEditingConfig(null)
    setFormName('Etiqueta Estándar')
    setFormBrand('Zebra')
    const zebraModels = PRINTER_PRESETS.find((p) => p.brand === 'Zebra')?.models || []
    const firstModel = zebraModels[0]?.model || ''
    setFormModel(firstModel)
    const firstPreset = zebraModels[0]?.labelSizes[0]

    if (firstPreset) {
      setFormSelectedPresetId(firstPreset.id)
      setIsCustomMode(false)
      setFormUnit(firstPreset.unit)
      setFormWidth(firstPreset.label_width)
      setFormHeight(firstPreset.label_height)
      setFormLabelsPerRow(firstPreset.labels_per_row)
      setFormGapX(firstPreset.gap_x)
      setFormGapY(firstPreset.gap_y)
      setFormName(firstPreset.name)
    } else {
      setIsCustomMode(true)
      setFormUnit('cm')
      setFormWidth(5.0)
      setFormHeight(2.5)
      setFormLabelsPerRow(1)
      setFormGapX(0)
      setFormGapY(0.3)
    }

    setFormIncludeItemName(true)
    setFormIncludePrice(true)
    setFormPriceToPrint('price1')
    setFormIncludeCode(true)
    setFormIncludeBarcode(true)
    setFormIncludeStoreName(false)
    setFormBarcodeType('CODE128')
    setFormIsDefault(configs.length === 0)
    setModalOpen(true)
  }

  // Abrir modal de edición
  const openEditModal = (cfg: BranchLabelConfig) => {
    setEditingConfig(cfg)
    setFormName(cfg.name)
    setFormBrand(cfg.printer_brand || 'Personalizada')
    setFormModel(cfg.printer_model || '')
    setIsCustomMode(cfg.printer_brand === 'Personalizada' || !cfg.printer_model)
    setFormSelectedPresetId('custom')

    setFormUnit(cfg.unit)
    setFormWidth(cfg.label_width)
    setFormHeight(cfg.label_height)
    setFormLabelsPerRow(cfg.labels_per_row)
    setFormGapX(cfg.gap_x)
    setFormGapY(cfg.gap_y)

    setFormIncludeItemName(cfg.include_item_name)
    setFormIncludePrice(cfg.include_price)
    setFormPriceToPrint(cfg.price_to_print)
    setFormIncludeCode(cfg.include_code)
    setFormIncludeBarcode(cfg.include_barcode)
    setFormIncludeStoreName(cfg.include_store_name)
    setFormBarcodeType(cfg.barcode_type)
    setFormIsDefault(cfg.is_default)
    setModalOpen(true)
  }

  // Guardar configuración
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formName.trim()) {
      toast.error('El nombre de la plantilla es obligatorio.')
      return
    }
    if (formWidth <= 0 || formHeight <= 0) {
      toast.error('Las dimensiones de la etiqueta deben ser mayores a 0.')
      return
    }

    setSaving(true)
    try {
      await saveBranchLabelConfigAction({
        id_config: editingConfig?.id_config,
        id_store: selectedStoreId,
        name: formName.trim(),
        printer_brand: isCustomMode ? 'Personalizada' : formBrand,
        printer_model: isCustomMode ? null : formModel,
        unit: formUnit,
        label_width: Number(formWidth),
        label_height: Number(formHeight),
        labels_per_row: Number(formLabelsPerRow) || 1,
        gap_x: Number(formGapX) || 0.0,
        gap_y: Number(formGapY) || 0.0,
        include_item_name: formIncludeItemName,
        include_price: formIncludePrice,
        price_to_print: formPriceToPrint,
        include_code: formIncludeCode,
        include_barcode: formIncludeBarcode,
        include_store_name: formIncludeStoreName,
        barcode_type: formBarcodeType,
        is_default: formIsDefault,
      })

      toast.success(
        editingConfig
          ? 'Configuración de etiqueta actualizada'
          : 'Nueva configuración de etiqueta creada'
      )
      setModalOpen(false)
      fetchConfigs()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  // Eliminar configuración
  const handleDelete = async () => {
    if (!configToDelete) return
    setDeleting(true)
    try {
      await deleteBranchLabelConfigAction(configToDelete.id_config)
      toast.success('Configuración eliminada exitosamente')
      setDeleteDialogOpen(false)
      setConfigToDelete(null)
      fetchConfigs()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(msg)
    } finally {
      setDeleting(false)
    }
  }

  // Establecer como predeterminada
  const handleSetDefault = async (cfg: BranchLabelConfig) => {
    try {
      await setDefaultBranchLabelConfigAction(cfg.id_config, selectedStoreId)
      toast.success(`"${cfg.name}" es ahora la plantilla predeterminada`)
      fetchConfigs()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(msg)
    }
  }

  // Filtrado y ordenamiento de la tabla
  const filteredConfigs = useMemo(() => {
    const q = search.toLowerCase().trim()
    return configs.filter((c) => {
      if (!q) return true
      return (
        c.name.toLowerCase().includes(q) ||
        c.printer_brand.toLowerCase().includes(q) ||
        (c.printer_model && c.printer_model.toLowerCase().includes(q))
      )
    })
  }, [configs, search])

  const sortedConfigs = useMemo(() => {
    return [...filteredConfigs].sort((a, b) => {
      let aVal: unknown = a[sortKey as keyof BranchLabelConfig]
      let bVal: unknown = b[sortKey as keyof BranchLabelConfig]

      if (sortKey === 'dimensions') {
        aVal = a.label_width * a.label_height
        bVal = b.label_width * b.label_height
      }

      if (typeof aVal === 'string') {
        return sortDirection === 'asc'
          ? (aVal as string).localeCompare((bVal as string) || '')
          : ((bVal as string) || '').localeCompare(aVal as string)
      }
      if (typeof aVal === 'number') {
        return sortDirection === 'asc'
          ? (aVal as number) - ((bVal as number) || 0)
          : ((bVal as number) || 0) - (aVal as number)
      }
      return 0
    })
  }, [filteredConfigs, sortKey, sortDirection])

  const paginatedConfigs = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedConfigs.slice(start, start + pageSize)
  }, [sortedConfigs, currentPage, pageSize])

  const totalPages = Math.ceil(sortedConfigs.length / pageSize) || 1

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDirection('asc')
    }
  }

  // Objeto de configuración actual para la vista previa del modal
  const livePreviewConfig = useMemo<Partial<BranchLabelConfig>>(() => {
    return {
      unit: formUnit,
      label_width: Number(formWidth) || 5,
      label_height: Number(formHeight) || 2.5,
      labels_per_row: Number(formLabelsPerRow) || 1,
      gap_x: Number(formGapX) || 0,
      gap_y: Number(formGapY) || 0.3,
      include_item_name: formIncludeItemName,
      include_price: formIncludePrice,
      include_code: formIncludeCode,
      include_barcode: formIncludeBarcode,
      include_store_name: formIncludeStoreName,
    }
  }, [
    formUnit, formWidth, formHeight, formLabelsPerRow, formGapX, formGapY,
    formIncludeItemName, formIncludePrice, formIncludeCode, formIncludeBarcode, formIncludeStoreName,
  ])

  return (
    <div className="space-y-6 pb-12">
      <div className="dashboard-bg" />

      {/* Header y Pestañas de Configuración */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
            <Tag className="w-6 h-6 text-emerald-500" />
            Configuración del Sistema
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Administra las dimensiones y formatos de etiquetas de códigos de barras para tus impresoras térmicas
          </p>
        </div>
      </div>

      <ConfiguracionTabs />

      {/* Barra de Filtros y Selector de Sucursal */}
      <GlassCard className="p-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Selector de Sucursal (Solo ADMIN puede cambiar; MANAGER fijo) */}
            <div className="flex items-center gap-2">
              <StoreIcon className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-semibold text-muted-foreground">Sucursal:</span>
              {isAdmin ? (
                <select
                  value={selectedStoreId}
                  onChange={(e) => {
                    setSelectedStoreId(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="bg-black/20 border border-white/10 rounded-xl px-3 py-1.5 text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                >
                  {stores.map((s) => (
                    <option key={s.id_store} value={s.id_store} className="bg-neutral-900 text-white">
                      {s.description}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-xs font-bold text-foreground bg-white/5 px-2.5 py-1 rounded-lg border border-white/10">
                  {stores.find((s) => s.id_store === selectedStoreId)?.description || 'Sucursal Asignada'}
                </span>
              )}
            </div>

            <span className="text-muted-foreground/30 hidden sm:inline">|</span>

            {/* Buscador */}
            <div className="relative min-w-[220px] sm:min-w-[280px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar plantilla o marca..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setCurrentPage(1)
                }}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-black/20 border border-white/10 rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              />
            </div>
          </div>

          {/* Botones de Acción */}
          <div className="flex items-center gap-2">
            <GlassButton
              variant="ghost"
              size="sm"
              onClick={fetchConfigs}
              disabled={loading}
              className="text-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </GlassButton>

            <GlassButton
              variant="primary"
              size="sm"
              onClick={openCreateModal}
              className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20"
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Nueva Plantilla
            </GlassButton>
          </div>
        </div>
      </GlassCard>

      {/* Tabla de Configuraciones de Etiquetas */}
      <GlassCard className="p-0 overflow-hidden">
        <div className="scrollable-table scroll-modern">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="glass-table-header border-b border-white/10">
                <TableColumnHeader
                  title="Plantilla / Nombre"
                  sortKey="name"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                />
                <TableColumnHeader
                  title="Marca y Modelo"
                  sortKey="printer_brand"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                />
                <TableColumnHeader
                  title="Dimensiones"
                  sortKey="dimensions"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                />
                <th className="p-3 text-muted-foreground font-semibold">Columnas / Gaps</th>
                <th className="p-3 text-muted-foreground font-semibold">Campos Visibles</th>
                <th className="p-3 text-muted-foreground font-semibold text-center">Estado</th>
                <th className="p-3 text-muted-foreground font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading && configs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-500" />
                    Cargando configuraciones de etiquetas...
                  </td>
                </tr>
              ) : paginatedConfigs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    <Tag className="w-8 h-8 mx-auto mb-2 opacity-40 text-emerald-400" />
                    No se encontraron plantillas de etiquetas para esta sucursal.
                    <div className="mt-3">
                      <GlassButton variant="primary" size="sm" onClick={openCreateModal}>
                        <Plus className="w-3.5 h-3.5 mr-1.5" />
                        Crear primera plantilla
                      </GlassButton>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedConfigs.map((cfg) => (
                  <tr
                    key={cfg.id_config}
                    className="hover:bg-white/[0.03] transition-colors group"
                  >
                    {/* Nombre y default badge */}
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-foreground text-sm">{cfg.name}</span>
                        {cfg.is_default && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30 dark:border-amber-500/40">
                            <Star className="w-3 h-3 fill-amber-500 text-amber-500 dark:fill-amber-400 dark:text-amber-400" />
                            Predeterminada
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Marca y Modelo */}
                    <td className="p-3 text-muted-foreground">
                      <div className="flex flex-col">
                        <span className="font-semibold text-foreground">{cfg.printer_brand}</span>
                        <span className="text-[11px] opacity-75">{cfg.printer_model || 'Personalizado'}</span>
                      </div>
                    </td>

                    {/* Dimensiones */}
                    <td className="p-3">
                      <span className="font-mono font-bold text-foreground bg-muted/60 dark:bg-white/5 px-2 py-1 rounded-md border border-border/60 dark:border-white/10">
                        {cfg.label_width} x {cfg.label_height} {cfg.unit}
                      </span>
                    </td>

                    {/* Columnas y Gaps */}
                    <td className="p-3 text-muted-foreground">
                      <div className="flex flex-col text-[11px]">
                        <span>
                          <strong className="text-foreground">{cfg.labels_per_row}</strong> {cfg.labels_per_row === 1 ? 'etiqueta / renglón' : 'etiquetas / renglón'}
                        </span>
                        {cfg.labels_per_row > 1 && (
                          <span className="opacity-75">Sep. col: {cfg.gap_x} {cfg.unit}</span>
                        )}
                        <span className="opacity-75">Sep. renglón: {cfg.gap_y} {cfg.unit}</span>
                      </div>
                    </td>

                    {/* Campos Visibles */}
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {cfg.include_barcode && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/15 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-400 border border-emerald-500/30 dark:border-emerald-500/20 font-semibold">
                            CB (Barras)
                          </span>
                        )}
                        {cfg.include_price && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] bg-indigo-500/15 dark:bg-indigo-500/10 text-indigo-800 dark:text-indigo-400 border border-indigo-500/30 dark:border-indigo-500/20 font-semibold">
                            Precio ({cfg.price_to_print})
                          </span>
                        )}
                        {cfg.include_item_name && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] bg-muted/60 dark:bg-white/5 text-foreground/80 dark:text-muted-foreground border border-border/60 dark:border-white/10 font-medium">
                            Descripción
                          </span>
                        )}
                        {cfg.include_code && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] bg-muted/60 dark:bg-white/5 text-foreground/80 dark:text-muted-foreground border border-border/60 dark:border-white/10 font-medium">
                            Código
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Estado */}
                    <td className="p-3 text-center">
                      <StatusBadge status={cfg.status === 'A' ? 'active' : 'inactive'} />
                    </td>

                    {/* Acciones */}
                    <td className="p-3 text-right">
                      <TableActionMenu
                        align="end"
                        items={[
                          {
                            label: 'Editar plantilla',
                            icon: <Edit3 className="w-3.5 h-3.5" />,
                            onClick: () => openEditModal(cfg),
                          },
                          ...(!cfg.is_default
                            ? [
                                {
                                  label: 'Hacer predeterminada',
                                  icon: <Star className="w-3.5 h-3.5 text-amber-400" />,
                                  onClick: () => handleSetDefault(cfg),
                                },
                              ]
                            : []),
                          {
                            label: 'Eliminar plantilla',
                            icon: <Trash2 className="w-3.5 h-3.5" />,
                            variant: 'danger',
                            separatorBefore: true,
                            onClick: () => {
                              setConfigToDelete(cfg)
                              setDeleteDialogOpen(true)
                            },
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {sortedConfigs.length > 0 && (
          <div className="p-3 border-t border-white/10">
            <TablePagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={sortedConfigs.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={(sz) => {
                setPageSize(sz)
                setCurrentPage(1)
              }}
            />
          </div>
        )}
      </GlassCard>

      {/* Modal Crear / Editar Plantilla de Etiquetas */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="glass border-white/20 rounded-3xl max-w-4xl p-6 max-h-[90vh] overflow-y-auto scroll-modern">
          <DialogHeader className="mb-4 pr-8">
            <DialogTitle className="text-xl font-black text-foreground flex items-center gap-2">
              <Tag className="w-5 h-5 text-emerald-400" />
              {editingConfig ? 'Editar Plantilla de Etiqueta' : 'Nueva Plantilla de Etiqueta'}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Define las dimensiones de acuerdo a tu impresora térmica o ingresa las medidas manualmente.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Columna Izquierda: Formulario de Parámetros (7 cols) */}
              <div className="lg:col-span-7 space-y-4">
                {/* Nombre de la Plantilla */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    Nombre Identificador de la Plantilla *
                  </label>
                  <GlassInput
                    placeholder="Ej. Zebra 2x1 anaquel, Brother DK-1201..."
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    required
                  />
                </div>

                {/* Selección Inteligente por Marca y Modelo */}
                <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <Printer className="w-3.5 h-3.5 text-emerald-400" />
                      Detección por Marca y Modelo de Impresora
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsCustomMode(!isCustomMode)}
                      className="text-[11px] text-emerald-700 dark:text-emerald-400 hover:underline font-bold"
                    >
                      {isCustomMode ? 'Usar presets de marca' : 'Configuración manual'}
                    </button>
                  </div>

                  {!isCustomMode ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Marca */}
                      <div>
                        <label className="text-[11px] text-muted-foreground block mb-1">Marca</label>
                        <select
                          value={formBrand}
                          onChange={(e) => {
                            const newBrand = e.target.value
                            setFormBrand(newBrand)
                            const brandObj = PRINTER_PRESETS.find((p) => p.brand === newBrand)
                            const firstMod = brandObj?.models[0]?.model || ''
                            setFormModel(firstMod)
                            const firstPres = brandObj?.models[0]?.labelSizes[0]
                            if (firstPres) {
                              applyPreset(firstPres.id)
                            }
                          }}
                          className="w-full bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs font-semibold text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 shadow-sm"
                        >
                          {PRINTER_PRESETS.map((p) => (
                            <option key={p.brand} value={p.brand} className="bg-white text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100">
                              {p.brand}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Modelo */}
                      <div>
                        <label className="text-[11px] text-muted-foreground block mb-1">Modelo</label>
                        <select
                          value={formModel}
                          onChange={(e) => {
                            const newModel = e.target.value
                            setFormModel(newModel)
                            const modelObj = availableModels.find((m) => m.model === newModel)
                            const firstPres = modelObj?.labelSizes[0]
                            if (firstPres) {
                              applyPreset(firstPres.id)
                            }
                          }}
                          className="w-full bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs font-semibold text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 shadow-sm"
                        >
                          {availableModels.map((m) => (
                            <option key={m.model} value={m.model} className="bg-white text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100">
                              {m.model}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Tamaños Predefinidos */}
                      <div className="sm:col-span-2">
                        <label className="text-[11px] font-semibold text-foreground block mb-1">
                          Tamaño de Etiqueta Estándar de este Modelo
                        </label>
                        <select
                          value={formSelectedPresetId}
                          onChange={(e) => applyPreset(e.target.value)}
                          className="w-full bg-white dark:bg-neutral-900 border-2 border-emerald-600/50 dark:border-emerald-500/50 rounded-xl px-3 py-2 text-xs font-bold text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                        >
                          {availablePresets.map((ps) => (
                            <option key={ps.id} value={ps.id} className="bg-white text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100 font-semibold">
                              {ps.name} ({ps.label_width} x {ps.label_height} {ps.unit} — {ps.labels_per_row} col)
                            </option>
                          ))}
                          <option value="custom" className="bg-white text-amber-900 dark:bg-neutral-900 dark:text-amber-300 font-bold">
                            ⚙️ Personalizado (Ingresar medidas manualmente)
                          </option>
                        </select>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3.5 rounded-2xl bg-amber-100 text-amber-950 border-2 border-amber-400 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-700/80 text-xs font-semibold leading-relaxed shadow-sm">
                      <span className="font-bold underline mr-1">Modo manual activado:</span>
                      Puedes especificar cualquier combinación de dimensiones a continuación.
                    </div>
                  )}
                </div>

                {/* Dimensiones y Unidad (Manual o Editable) */}
                <div className="p-3 rounded-2xl bg-muted/30 dark:bg-white/[0.04] border border-border/60 dark:border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      Dimensiones Físicas de la Etiqueta
                    </span>

                    {/* Selector de Unidad: cm o in */}
                    <div className="flex items-center gap-1 bg-muted/60 dark:bg-black/30 p-1 rounded-xl border border-border/60 dark:border-white/10">
                      <button
                        type="button"
                        onClick={() => {
                          if (formUnit !== 'cm') {
                            setFormUnit('cm')
                            setFormWidth(inToCm(formWidth))
                            setFormHeight(inToCm(formHeight))
                            setFormGapX(inToCm(formGapX))
                            setFormGapY(inToCm(formGapY))
                          }
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                          formUnit === 'cm'
                            ? 'bg-emerald-600 text-white shadow-md'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        Centímetros (cm)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (formUnit !== 'in') {
                            setFormUnit('in')
                            setFormWidth(cmToIn(formWidth))
                            setFormHeight(cmToIn(formHeight))
                            setFormGapX(cmToIn(formGapX))
                            setFormGapY(cmToIn(formGapY))
                          }
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                          formUnit === 'in'
                            ? 'bg-emerald-600 text-white shadow-md'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        Pulgadas (in)
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {/* Ancho */}
                    <div>
                      <label className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
                        Ancho ({formUnit}) *
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0.1"
                        value={formWidth}
                        onChange={(e) => setFormWidth(parseFloat(e.target.value) || 0)}
                        className="w-full bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs font-bold text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                        required
                      />
                    </div>

                    {/* Alto */}
                    <div>
                      <label className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
                        Alto ({formUnit}) *
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0.1"
                        value={formHeight}
                        onChange={(e) => setFormHeight(parseFloat(e.target.value) || 0)}
                        className="w-full bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs font-bold text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                        required
                      />
                    </div>

                    {/* Etiquetas por renglón */}
                    <div>
                      <label className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
                        Etiquetas / Renglón *
                      </label>
                      <input
                        type="number"
                        step="1"
                        min="1"
                        max="10"
                        value={formLabelsPerRow}
                        onChange={(e) => setFormLabelsPerRow(parseInt(e.target.value, 10) || 1)}
                        className="w-full bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs font-bold text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                        required
                      />
                    </div>

                    {/* Espacio entre columnas */}
                    <div>
                      <label className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
                        Espacio entre Columnas ({formUnit})
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        disabled={formLabelsPerRow <= 1}
                        value={formGapX}
                        onChange={(e) => setFormGapX(parseFloat(e.target.value) || 0)}
                        className="w-full bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs font-medium text-neutral-900 dark:text-neutral-100 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                      />
                    </div>

                    {/* Espacio entre renglones */}
                    <div>
                      <label className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
                        Espacio entre Renglones ({formUnit})
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={formGapY}
                        onChange={(e) => setFormGapY(parseFloat(e.target.value) || 0)}
                        className="w-full bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs font-medium text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Contenido de la Etiqueta */}
                <div className="p-3 rounded-2xl bg-muted/30 dark:bg-white/[0.04] border border-border/60 dark:border-white/10 space-y-2.5">
                  <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                    Elementos a Imprimir en la Etiqueta
                  </span>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <label className="flex items-center gap-2 cursor-pointer p-1.5 rounded-lg hover:bg-muted/60 dark:hover:bg-white/5">
                      <input
                        type="checkbox"
                        checked={formIncludeBarcode}
                        onChange={(e) => setFormIncludeBarcode(e.target.checked)}
                        className="rounded border-border/70 text-emerald-600 focus:ring-emerald-500/50"
                      />
                      <span className="font-medium text-foreground">Código de Barras</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer p-1.5 rounded-lg hover:bg-muted/60 dark:hover:bg-white/5">
                      <input
                        type="checkbox"
                        checked={formIncludeItemName}
                        onChange={(e) => setFormIncludeItemName(e.target.checked)}
                        className="rounded border-border/70 text-emerald-600 focus:ring-emerald-500/50"
                      />
                      <span className="font-medium text-foreground">Nombre del Producto</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer p-1.5 rounded-lg hover:bg-muted/60 dark:hover:bg-white/5">
                      <input
                        type="checkbox"
                        checked={formIncludePrice}
                        onChange={(e) => setFormIncludePrice(e.target.checked)}
                        className="rounded border-border/70 text-emerald-600 focus:ring-emerald-500/50"
                      />
                      <span className="font-medium text-foreground">Precio de Venta</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer p-1.5 rounded-lg hover:bg-muted/60 dark:hover:bg-white/5">
                      <input
                        type="checkbox"
                        checked={formIncludeCode}
                        onChange={(e) => setFormIncludeCode(e.target.checked)}
                        className="rounded border-border/70 text-emerald-600 focus:ring-emerald-500/50"
                      />
                      <span className="font-medium text-foreground">Código Interno</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer p-1.5 rounded-lg hover:bg-muted/60 dark:hover:bg-white/5 col-span-2">
                      <input
                        type="checkbox"
                        checked={formIncludeStoreName}
                        onChange={(e) => setFormIncludeStoreName(e.target.checked)}
                        className="rounded border-border/70 text-emerald-600 focus:ring-emerald-500/50"
                      />
                      <span className="font-medium text-foreground">Nombre Comercial de la Empresa ({company.trade_name || 'Campiran'})</span>
                    </label>
                  </div>

                  {/* Selector de Precio si está activo */}
                  {formIncludePrice && (
                    <div className="pt-2 border-t border-border/60 dark:border-white/10 flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground font-semibold">
                        Lista de Precio a imprimir:
                      </span>
                      <select
                        value={formPriceToPrint}
                        onChange={(e) => setFormPriceToPrint(e.target.value as LabelPriceOption)}
                        className="bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-lg px-2.5 py-1 text-xs text-neutral-900 dark:text-neutral-100 font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500 shadow-sm"
                      >
                        <option value="price1" className="bg-white text-neutral-900 dark:bg-neutral-900 dark:text-white">Precio 1 (General)</option>
                        <option value="price2" className="bg-white text-neutral-900 dark:bg-neutral-900 dark:text-white">Precio 2 (Mayoreo)</option>
                        <option value="price3" className="bg-white text-neutral-900 dark:bg-neutral-900 dark:text-white">Precio 3 (Especial)</option>
                      </select>
                    </div>
                  )}

                  {/* Predeterminada */}
                  <div className="pt-2 border-t border-border/60 dark:border-white/10">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formIsDefault}
                        onChange={(e) => setFormIsDefault(e.target.checked)}
                        className="rounded border-border/70 text-emerald-600 focus:ring-emerald-500/50"
                      />
                      <span className="text-xs font-bold text-foreground">
                        Usar como plantilla predeterminada de esta sucursal
                      </span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Columna Derecha: Vista Previa en Vivo (5 cols) */}
              <div className="lg:col-span-5 flex flex-col items-center justify-center p-4 rounded-3xl bg-card dark:bg-black/40 border border-border/60 dark:border-white/10 shadow-sm">
                <div className="w-full flex items-center justify-between mb-3 text-xs">
                  <span className="font-bold text-foreground flex items-center gap-1.5">
                    <Eye className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    Vista Previa en Tiempo Real
                  </span>
                  <span className="text-[11px] font-mono text-muted-foreground font-semibold">
                    {formWidth} x {formHeight} {formUnit} ({formLabelsPerRow} col)
                  </span>
                </div>

                <div className="w-full flex flex-col items-center justify-center p-6 bg-muted/50 dark:bg-neutral-950/80 rounded-2xl border border-border/50 dark:border-white/5 overflow-auto max-h-[360px]">
                  {/* Grid de simulación de columnas por renglón */}
                  <div
                    className="flex flex-wrap items-center justify-center gap-3"
                    style={{
                      columnGap: `${Math.max(4, formGapX * 15)}px`,
                      rowGap: `${Math.max(4, formGapY * 15)}px`,
                    }}
                  >
                    {Array.from({ length: Math.min(formLabelsPerRow, 3) }).map((_, idx) => (
                      <LabelPreview
                        key={idx}
                        config={livePreviewConfig}
                        companyName={company.trade_name || 'Campiran'}
                        sampleItem={{
                          description: 'MANZANA GALA NACIONAL 1KG',
                          code: 'MANZ-01',
                          barcode: '750100012345',
                          price: 49.90,
                        }}
                        scale={0.9}
                      />
                    ))}
                  </div>

                  {formLabelsPerRow > 3 && (
                    <p className="text-[10px] text-muted-foreground mt-3 italic text-center">
                      (Mostrando 3 de {formLabelsPerRow} columnas en esta simulación)
                    </p>
                  )}
                </div>

                <p className="text-[10px] text-muted-foreground mt-3 text-center leading-relaxed">
                  Esta simulación refleja las proporciones físicas exactas con las que el navegador mandará a imprimir a tu impresora térmica.
                </p>
              </div>
            </div>

            {/* Botones Guardar / Cancelar */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
              <GlassButton
                type="button"
                variant="ghost"
                onClick={() => setModalOpen(false)}
                disabled={saving}
              >
                Cancelar
              </GlassButton>
              <GlassButton
                type="submit"
                variant="primary"
                disabled={saving}
                className="bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20"
              >
                {saving ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    {editingConfig ? 'Actualizar Plantilla' : 'Guardar Plantilla'}
                  </>
                )}
              </GlassButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirmar Eliminación */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="¿Eliminar plantilla de etiquetas?"
        description={`¿Estás seguro de que deseas eliminar la plantilla "${configToDelete?.name}"? Esta acción no se puede deshacer.`}
        confirmLabel={deleting ? 'Eliminando...' : 'Eliminar'}
        cancelLabel="Cancelar"
        loading={deleting}
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}
