'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/utils/supabase/client'
import { GlassCard } from '@/components/glass-card'
import { GlassButton } from '@/components/glass-button'
import { GlassInput } from '@/components/glass-input'
import { StatusBadge } from '@/components/status-badge'
import { type Store } from '@/lib/types'
import { toast } from 'sonner'
import {
  Store as StoreIcon, Search, Plus, Edit3, Trash2, RotateCcw,
  X, Check, MapPin, RefreshCw, Crosshair, ExternalLink, Compass, Radio
} from 'lucide-react'
import { TableActionMenu, TableColumnHeader, TablePagination } from '@/components/tables'
import { getDeviceCoordinates, formatDistance, parseCoordinatesOrUrl } from '@/lib/geolocation'
import { searchAddressOrCoordinates, type GeocodingResult } from './actions'
import { cn } from '@/lib/utils'

export function TiendasClient() {
  const supabase = createClient()

  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'A' | 'I' | 'ALL'>('A')

  // Modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editingStore, setEditingStore] = useState<Store | null>(null)
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [geofenceRadius, setGeofenceRadius] = useState('150')
  const [capturingGps, setCapturingGps] = useState(false)
  const [geoSearchQuery, setGeoSearchQuery] = useState('')
  const [geoSearching, setGeoSearching] = useState(false)
  const [geoResults, setGeoResults] = useState<GeocodingResult[]>([])
  const [showGeoResults, setShowGeoResults] = useState(false)
  const [saving, setSaving] = useState(false)

  // Delete Confirm
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [storeToDelete, setStoreToDelete] = useState<Store | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchStores = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('stores')
      .select('*')
      .order('description')

    if (error) {
      toast.error('Error al cargar sucursales: ' + error.message)
    } else if (data) {
      setStores(data as Store[])
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchStores()
  }, [fetchStores])

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('stores-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stores' }, () => {
        fetchStores()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, fetchStores])

  const filteredStores = useMemo(() => {
    return stores.filter((s) => {
      if (statusFilter !== 'ALL' && s.status !== statusFilter) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        const desc = s.description?.toLowerCase() ?? ''
        const loc = s.location?.toLowerCase() ?? ''
        if (!desc.includes(q) && !loc.includes(q)) return false
      }
      return true
    })
  }, [stores, statusFilter, search])

  // Sorting state
  const [sortKey, setSortKey] = useState<string>('description')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDirection('asc')
    }
  }

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  useEffect(() => {
    setCurrentPage(1)
  }, [search, statusFilter])

  const sortedStores = useMemo(() => {
    const list = [...filteredStores]
    if (!sortKey) return list

    return list.sort((a, b) => {
      let aVal = ''
      let bVal = ''

      switch (sortKey) {
        case 'description':
          aVal = (a.description || '').toLowerCase()
          bVal = (b.description || '').toLowerCase()
          break
        case 'location':
          aVal = (a.location || '').toLowerCase()
          bVal = (b.location || '').toLowerCase()
          break
        case 'geofence':
          aVal = a.latitude != null ? '1' : '0'
          bVal = b.latitude != null ? '1' : '0'
          break
        case 'status':
          aVal = a.status || ''
          bVal = b.status || ''
          break
        default:
          return 0
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
  }, [filteredStores, sortKey, sortDirection])

  const totalPages = Math.ceil(sortedStores.length / pageSize) || 1
  const paginatedStores = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedStores.slice(start, start + pageSize)
  }, [sortedStores, currentPage, pageSize])

  const handleOpenCreate = () => {
    setEditingStore(null)
    setDescription('')
    setLocation('')
    setLatitude('')
    setLongitude('')
    setGeofenceRadius('150')
    setGeoSearchQuery('')
    setGeoResults([])
    setShowGeoResults(false)
    setModalOpen(true)
  }

  const handleOpenEdit = (store: Store) => {
    setEditingStore(store)
    setDescription(store.description || '')
    setLocation(store.location || '')
    setLatitude(store.latitude != null ? String(store.latitude) : '')
    setLongitude(store.longitude != null ? String(store.longitude) : '')
    setGeofenceRadius(store.geofence_radius != null ? String(store.geofence_radius) : '150')
    setGeoSearchQuery('')
    setGeoResults([])
    setShowGeoResults(false)
    setModalOpen(true)
  }

  const handleCaptureGps = async () => {
    setCapturingGps(true)
    try {
      const coords = await getDeviceCoordinates({ timeoutMs: 10000, enableHighAccuracy: true })
      setLatitude(coords.latitude.toFixed(7))
      setLongitude(coords.longitude.toFixed(7))
      toast.success(
        `Coordenadas capturadas con precisión de ±${Math.round(coords.accuracy || 0)}m`
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudo obtener la ubicación GPS'
      toast.error(msg)
    } finally {
      setCapturingGps(false)
    }
  }

  const handleGeoSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!geoSearchQuery.trim()) {
      toast.error('Ingresa una dirección o enlace de Google Maps para buscar')
      return
    }

    // 1. Detección instantánea si el usuario pegó coordenadas o enlace estándar
    const instant = parseCoordinatesOrUrl(geoSearchQuery)
    if (instant) {
      setLatitude(instant.latitude.toFixed(7))
      setLongitude(instant.longitude.toFixed(7))
      toast.success('¡Coordenadas extraídas exitosamente!')
      setGeoResults([])
      setShowGeoResults(false)
      return
    }

    // 2. Consulta al servidor (resuelve enlaces cortos goo.gl o busca direcciones con OpenStreetMap)
    setGeoSearching(true)
    setShowGeoResults(true)
    try {
      const res = await searchAddressOrCoordinates(geoSearchQuery)
      if (res.success && res.results && res.results.length > 0) {
        if (res.results.length === 1 && res.results[0].source !== 'search') {
          const item = res.results[0]
          setLatitude(item.latitude.toFixed(7))
          setLongitude(item.longitude.toFixed(7))
          toast.success(item.displayName)
          setGeoResults([])
          setShowGeoResults(false)
        } else {
          setGeoResults(res.results)
        }
      } else {
        toast.error(res.error || 'No se encontraron resultados')
        setGeoResults([])
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al buscar ubicación'
      toast.error(msg)
    } finally {
      setGeoSearching(false)
    }
  }

  const handleSelectGeoResult = (result: GeocodingResult) => {
    setLatitude(result.latitude.toFixed(7))
    setLongitude(result.longitude.toFixed(7))
    if (!location.trim()) {
      setLocation(result.displayName)
    }
    toast.success('Coordenadas asignadas a la sucursal')
    setGeoResults([])
    setShowGeoResults(false)
    setGeoSearchQuery('')
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!description.trim()) {
      toast.error('El nombre de la sucursal es obligatorio')
      return
    }

    const latTrim = latitude.trim()
    const lngTrim = longitude.trim()

    let parsedLat: number | null = null
    let parsedLng: number | null = null

    if (latTrim || lngTrim) {
      if (!latTrim || !lngTrim) {
        toast.error('Debes proporcionar tanto la latitud como la longitud')
        return
      }
      parsedLat = parseFloat(latTrim)
      parsedLng = parseFloat(lngTrim)

      if (isNaN(parsedLat) || parsedLat < -90 || parsedLat > 90) {
        toast.error('La latitud debe ser un número válido entre -90 y 90')
        return
      }
      if (isNaN(parsedLng) || parsedLng < -180 || parsedLng > 180) {
        toast.error('La longitud debe ser un número válido entre -180 y 180')
        return
      }
    }

    const parsedRadius = geofenceRadius.trim() ? parseInt(geofenceRadius, 10) : 150
    if (isNaN(parsedRadius) || parsedRadius < 10) {
      toast.error('El radio de geocerca debe ser al menos de 10 metros')
      return
    }

    setSaving(true)
    const payload = {
      description: description.trim(),
      location: location.trim() || null,
      latitude: parsedLat,
      longitude: parsedLng,
      geofence_radius: parsedRadius,
    }

    if (editingStore) {
      const { error } = await supabase
        .from('stores')
        .update(payload)
        .eq('id_store', editingStore.id_store)

      setSaving(false)
      if (error) {
        toast.error('Error al actualizar sucursal: ' + error.message)
      } else {
        toast.success('Sucursal actualizada exitosamente')
        setModalOpen(false)
        fetchStores()
      }
    } else {
      const { error } = await supabase
        .from('stores')
        .insert([{ ...payload, status: 'A' }])

      setSaving(false)
      if (error) {
        toast.error('Error al crear sucursal: ' + error.message)
      } else {
        toast.success('Sucursal creada exitosamente')
        setModalOpen(false)
        fetchStores()
      }
    }
  }

  const handleConfirmDelete = async () => {
    if (!storeToDelete) return
    setDeleting(true)

    const nextStatus = storeToDelete.status === 'A' ? 'I' : 'A'
    const { error } = await supabase
      .from('stores')
      .update({ status: nextStatus })
      .eq('id_store', storeToDelete.id_store)

    setDeleting(false)
    setDeleteConfirmOpen(false)

    if (error) {
      toast.error('Error al cambiar estado')
    } else {
      toast.success(nextStatus === 'I' ? 'Sucursal desactivada' : 'Sucursal reactivada')
      fetchStores()
    }
  }

  return (
    <div className="min-h-full sm:h-full flex-1 flex flex-col min-h-0 gap-2.5 sm:gap-3 pb-8 sm:pb-0">
      <div className="dashboard-bg" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shrink-0">
        <div>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-foreground flex items-center gap-2 leading-tight">
            <StoreIcon className="text-emerald-500" size={20} />
            Administración de Sucursales
          </h1>
          <p className="text-xs text-muted-foreground line-clamp-1">
            Gestión de tiendas y puntos de venta de la empresa
          </p>
        </div>
        <GlassButton variant="primary" size="sm" onClick={handleOpenCreate} className="self-start sm:self-auto shadow-md shadow-emerald-500/20 text-xs h-8 sm:h-9">
          <Plus size={15} className="mr-1" />
          Nueva Sucursal
        </GlassButton>
      </div>

      {/* Filters Bar */}
      <GlassCard padding="none" className="p-2 shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
          <div className="flex-1 max-w-md">
            <GlassInput
              placeholder="Buscar sucursal por nombre o dirección..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              icon={<Search size={15} />}
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 p-0.5 rounded-xl glass border border-border/40">
              <button
                onClick={() => setStatusFilter('A')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  statusFilter === 'A'
                    ? 'bg-emerald-500 text-white shadow-sm font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Activas
              </button>
              <button
                onClick={() => setStatusFilter('I')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  statusFilter === 'I'
                    ? 'bg-emerald-500 text-white shadow-sm font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Inactivas
              </button>
              <button
                onClick={() => setStatusFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  statusFilter === 'ALL'
                    ? 'bg-emerald-500 text-white shadow-sm font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Todas
              </button>
            </div>

            <GlassButton
              variant="ghost"
              size="sm"
              onClick={fetchStores}
              disabled={loading}
              title="Recargar"
              className="h-8 px-2.5"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin text-emerald-400' : ''} />
            </GlassButton>
          </div>
        </div>
      </GlassCard>

      {/* Stores Table */}
      <GlassCard padding="none" className="overflow-hidden shadow-xl flex-1 min-h-[460px] sm:min-h-0 flex flex-col">
        <div className="overflow-x-auto overflow-y-auto flex-1 min-h-[360px] sm:min-h-0 scroll-modern">
          <table className="w-full text-left text-sm border-separate border-spacing-0 min-w-[750px] sm:min-w-full">
            <thead className="sticky top-0 z-20">
              <tr className="glass-table-header border-b border-border/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="w-20 px-4 py-3.5 text-center sticky top-0 z-20 bg-white dark:bg-card">
                  Acciones
                </th>
                <TableColumnHeader
                  title="Sucursal"
                  sortKey="description"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                />
                <TableColumnHeader
                  title="Dirección / Ubicación"
                  sortKey="location"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                />
                <TableColumnHeader
                  title="Geocerca / GPS"
                  sortKey="geofence"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                />
                <TableColumnHeader
                  title="Estado"
                  sortKey="status"
                  currentSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  align="center"
                />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                    Cargando sucursales...
                  </td>
                </tr>
              ) : paginatedStores.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                    <p className="text-base font-medium">No se encontraron sucursales</p>
                  </td>
                </tr>
              ) : (
                paginatedStores.map((store) => (
                  <tr key={store.id_store} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="w-20 px-4 py-3.5 text-center">
                      <TableActionMenu
                        items={[
                          {
                            label: 'Editar Sucursal',
                            icon: <Edit3 size={15} />,
                            onClick: () => handleOpenEdit(store),
                            variant: 'primary',
                          },
                          {
                            label: store.status === 'A' ? 'Desactivar Sucursal' : 'Reactivar Sucursal',
                            icon: store.status === 'A' ? <Trash2 size={15} /> : <RotateCcw size={15} />,
                            onClick: () => {
                              setStoreToDelete(store)
                              setDeleteConfirmOpen(true)
                            },
                            variant: store.status === 'A' ? 'danger' : 'primary',
                            separatorBefore: true,
                          },
                        ]}
                      />
                    </td>

                    <td className="px-4 py-3.5">
                      <span className="font-semibold text-foreground group-hover:text-emerald-400 transition-colors">
                        {store.description}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <MapPin size={13} className="text-muted-foreground/60" />
                        {store.location || 'Sin dirección registrada'}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 text-xs">
                      {store.latitude != null && store.longitude != null ? (
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono text-[11px]">
                            <Compass size={12} className="text-emerald-400" />
                            {Number(store.latitude).toFixed(4)}, {Number(store.longitude).toFixed(4)}
                            <span className="text-muted-foreground/80 font-sans ml-0.5">
                              (±{store.geofence_radius || 150}m)
                            </span>
                          </span>
                          <a
                            href={`https://www.google.com/maps?q=${store.latitude},${store.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 rounded-lg text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                            title="Ver ubicación en Google Maps"
                          >
                            <ExternalLink size={13} />
                          </a>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground/60 italic text-[11px]">
                          <Radio size={12} />
                          Sin geolocalización
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3.5 text-center">
                      <StatusBadge status={store.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={sortedStores.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          realtimeLabel="Sincronización multi-tienda activa"
        />
      </GlassCard>

      {/* Modal: Create / Edit Store */}
      <AnimatePresence>
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="glass-card max-w-lg w-full flex flex-col max-h-[92dvh] sm:max-h-[90vh] overflow-hidden rounded-2xl sm:rounded-3xl shadow-2xl"
            >
              {/* Header Fijo */}
              <div className="flex items-center justify-between border-b border-border/40 px-4 py-3 sm:px-6 sm:py-4 bg-card/95 dark:bg-card/90 backdrop-blur-xl shrink-0 z-10">
                <h3 className="text-sm sm:text-base font-bold text-foreground truncate pr-2">
                  {editingStore ? 'Editar Sucursal' : 'Nueva Sucursal'}
                </h3>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors shrink-0"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Cuerpo desplazable */}
              <div className="flex-1 min-h-0 overflow-y-auto scroll-modern p-4 sm:p-6">
                <form id="store-form" onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    Nombre / Descripción *
                  </label>
                  <GlassInput
                    placeholder="Ej. Sucursal Centro, Matriz, etc."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    required
                    autoFocus
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    Dirección / Ubicación
                  </label>
                  <GlassInput
                    placeholder="Calle, número, colonia, ciudad"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                  />
                </div>

                {/* Panel de Geolocalización y Geocerca */}
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-border/50 space-y-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                        <Compass size={16} />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-foreground">Geolocalización & Detección</h4>
                        <p className="text-[11px] text-muted-foreground">Ubica la sucursal por dirección, enlace de Maps o GPS</p>
                      </div>
                    </div>

                    <GlassButton
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={handleCaptureGps}
                      disabled={capturingGps}
                      className="text-xs h-7 px-2.5 flex-shrink-0"
                      title="Captura la ubicación del dispositivo si estás físicamente en la sucursal"
                    >
                      <Crosshair size={13} className={cn('mr-1.5 text-emerald-400', capturingGps && 'animate-spin')} />
                      {capturingGps ? 'Capturando...' : 'Mi GPS actual'}
                    </GlassButton>
                  </div>

                  {/* Buscador inteligente: Dirección o enlace de Google Maps */}
                  <div className="space-y-1.5 relative">
                    <label className="text-[11px] font-semibold text-muted-foreground block">
                      Buscar por dirección o pegar enlace de Google Maps
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <GlassInput
                          placeholder="Ej. Av. Reforma 222, CDMX o pega enlace de Maps"
                          value={geoSearchQuery}
                          onChange={(e) => {
                            setGeoSearchQuery(e.target.value)
                            // Si pega coordenadas o enlace, procesar al vuelo
                            const direct = parseCoordinatesOrUrl(e.target.value)
                            if (direct) {
                              setLatitude(direct.latitude.toFixed(7))
                              setLongitude(direct.longitude.toFixed(7))
                              toast.success('¡Coordenadas extraídas exitosamente!')
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              handleGeoSearch()
                            }
                          }}
                          className="text-xs pr-7"
                        />
                        {geoSearchQuery && (
                          <button
                            type="button"
                            onClick={() => {
                              setGeoSearchQuery('')
                              setGeoResults([])
                              setShowGeoResults(false)
                            }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>
                      <GlassButton
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={() => handleGeoSearch()}
                        disabled={geoSearching || !geoSearchQuery.trim()}
                        className="text-xs h-9 px-3 flex-shrink-0"
                      >
                        <Search size={13} className={cn('mr-1', geoSearching && 'animate-spin')} />
                        {geoSearching ? 'Buscando...' : 'Buscar'}
                      </GlassButton>
                    </div>

                    {/* Menú de resultados de búsqueda */}
                    {showGeoResults && geoResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1.5 z-30 p-1.5 glass-card shadow-2xl max-h-48 overflow-y-auto scroll-modern border border-emerald-500/30">
                        <div className="flex items-center justify-between px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/30 mb-1">
                          <span>Resultados encontrados ({geoResults.length})</span>
                          <button
                            type="button"
                            onClick={() => setShowGeoResults(false)}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            Cerrar
                          </button>
                        </div>
                        {geoResults.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => handleSelectGeoResult(item)}
                            className="w-full text-left p-2 rounded-xl text-xs hover:bg-emerald-500/10 hover:text-emerald-400 transition-colors flex items-start gap-2 group"
                          >
                            <MapPin size={13} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="line-clamp-2 text-foreground group-hover:text-emerald-400 leading-snug">
                                {item.displayName}
                              </p>
                              <span className="text-[10px] font-mono text-muted-foreground">
                                {item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Coordenadas numéricas y radio */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                        Latitud GPS
                      </label>
                      <GlassInput
                        placeholder="Ej. 19.4326077"
                        value={latitude}
                        onChange={(e) => setLatitude(e.target.value)}
                        className="text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                        Longitud GPS
                      </label>
                      <GlassInput
                        placeholder="Ej. -99.1332080"
                        value={longitude}
                        onChange={(e) => setLongitude(e.target.value)}
                        className="text-xs font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex items-end justify-between gap-3 pt-0.5">
                    <div className="flex-1">
                      <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                        Radio de Geocerca (metros)
                      </label>
                      <GlassInput
                        type="number"
                        min="10"
                        max="5000"
                        step="10"
                        placeholder="150"
                        value={geofenceRadius}
                        onChange={(e) => setGeofenceRadius(e.target.value)}
                        className="text-xs font-mono"
                      />
                    </div>

                    {latitude && longitude && !isNaN(parseFloat(latitude)) && !isNaN(parseFloat(longitude)) && (
                      <div className="pb-0.5">
                        <a
                          href={`https://www.google.com/maps?q=${latitude},${longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 transition-colors"
                        >
                          <ExternalLink size={13} />
                          Abrir Google Maps
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Vista Previa de Mapa Embebido */}
                  {latitude && longitude && !isNaN(parseFloat(latitude)) && !isNaN(parseFloat(longitude)) && (
                    <div className="pt-1 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span className="font-semibold flex items-center gap-1.5">
                          <MapPin size={12} className="text-emerald-400" />
                          Vista previa de la sucursal
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          Radio activo: ±{geofenceRadius || 150}m
                        </span>
                      </div>
                      <div className="relative w-full h-36 rounded-2xl overflow-hidden border border-border/50 bg-black/20">
                        <iframe
                          title="Vista de mapa de la sucursal"
                          className="w-full h-full border-0 pointer-events-auto"
                          src={`https://www.openstreetmap.org/export/embed.html?bbox=${Number(longitude) - 0.005}%2C${Number(latitude) - 0.003}%2C${Number(longitude) + 0.005}%2C${Number(latitude) + 0.003}&layer=mapnik&marker=${latitude}%2C${longitude}`}
                          loading="lazy"
                        />
                      </div>
                    </div>
                  )}

                  <p className="text-[10px] text-muted-foreground/80 leading-relaxed">
                    Cuando un usuario abra la app a menos de este radio, el sistema le ofrecerá cambiar su sesión a esta sucursal automáticamente.
                  </p>
                </div>

                </form>
              </div>

              {/* Footer Fijo */}
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3 border-t border-border/40 p-3 sm:p-4 bg-card/95 dark:bg-card/90 backdrop-blur-xl shrink-0 z-10">
                <GlassButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setModalOpen(false)}
                  className="w-full sm:w-auto"
                >
                  Cancelar
                </GlassButton>
                <GlassButton
                  type="submit"
                  form="store-form"
                  variant="primary"
                  size="sm"
                  disabled={saving}
                  className="w-full sm:w-auto"
                >
                  <Check size={14} className="mr-1" />
                  {saving ? 'Guardando...' : editingStore ? 'Actualizar' : 'Guardar'}
                </GlassButton>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: Delete Confirm */}
      <AnimatePresence>
        {deleteConfirmOpen && storeToDelete && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="glass-card max-w-md w-full flex flex-col max-h-[92dvh] sm:max-h-[90vh] overflow-hidden rounded-2xl sm:rounded-3xl shadow-2xl"
            >
              {/* Header Fijo */}
              <div className="flex items-center justify-between border-b border-border/40 px-4 py-3 sm:px-6 sm:py-4 bg-card/95 dark:bg-card/90 backdrop-blur-xl shrink-0 z-10">
                <h3 className="text-sm sm:text-base font-bold text-foreground truncate pr-2">
                  {storeToDelete.status === 'A' ? '¿Desactivar Sucursal?' : '¿Reactivar Sucursal?'}
                </h3>
                <button
                  type="button"
                  onClick={() => setDeleteConfirmOpen(false)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors shrink-0"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Cuerpo */}
              <div className="flex-1 min-h-0 overflow-y-auto scroll-modern p-4 sm:p-6">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {storeToDelete.status === 'A'
                    ? `La sucursal "${storeToDelete.description}" se marcará como inactiva.`
                    : `La sucursal "${storeToDelete.description}" volverá a estar disponible.`}
                </p>
              </div>

              {/* Footer Fijo */}
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3 border-t border-border/40 p-3 sm:p-4 bg-card/95 dark:bg-card/90 backdrop-blur-xl shrink-0 z-10">
                <GlassButton
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeleteConfirmOpen(false)}
                  className="w-full sm:w-auto"
                >
                  Cancelar
                </GlassButton>
                <GlassButton
                  variant={storeToDelete.status === 'A' ? 'danger' : 'primary'}
                  size="sm"
                  onClick={handleConfirmDelete}
                  disabled={deleting}
                  className="w-full sm:w-auto"
                >
                  {deleting ? 'Procesando...' : storeToDelete.status === 'A' ? 'Desactivar' : 'Reactivar'}
                </GlassButton>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
