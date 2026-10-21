'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/utils/supabase/client'
import { useStore } from '@/components/providers/store-provider'
import { getDeviceCoordinates, findNearbyStore, formatDistance, type StoreDistanceMatch } from '@/lib/geolocation'
import { GlassButton } from '@/components/glass-button'
import { type Profile, type Store } from '@/lib/types'
import { toast } from 'sonner'
import { MapPin, Navigation, ArrowRight, Check, X, ShieldAlert, Store as StoreIcon } from 'lucide-react'

interface StoreGeoGuardProps {
  profile: Profile
}

const IGNORED_GEO_STORE_KEY = 'campiran_ignored_geo_store'
const CHECK_INTERVAL_MS = 60 * 1000 // 60 segundos mínimo entre chequeos automáticos

export function StoreGeoGuard({ profile }: StoreGeoGuardProps) {
  const supabase = createClient()
  const { currentStore, setStore } = useStore()

  const [detectedMatch, setDetectedMatch] = useState<StoreDistanceMatch | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [updatePermanent, setUpdatePermanent] = useState(false)
  const [updating, setUpdating] = useState(false)

  const lastCheckTimeRef = useRef<number>(0)
  const isCheckingRef = useRef<boolean>(false)

  // Chequeo de ubicación y comparación con sucursales
  const checkLocation = useCallback(async (forced = false) => {
    const now = Date.now()
    if (!forced && now - lastCheckTimeRef.current < CHECK_INTERVAL_MS) {
      return
    }
    if (isCheckingRef.current) return
    isCheckingRef.current = true
    lastCheckTimeRef.current = now

    try {
      // 1. Obtener coordenadas actuales del dispositivo
      const coords = await getDeviceCoordinates({ timeoutMs: 7000, enableHighAccuracy: true })

      // 2. Obtener sucursales activas desde la base de datos
      const { data: storesData, error } = await supabase
        .from('stores')
        .select('*')
        .eq('status', 'A')

      if (error || !storesData || storesData.length === 0) {
        isCheckingRef.current = false
        return
      }

      const stores = storesData as Store[]
      const match = findNearbyStore(coords, stores)

      if (!match || !match.isInsideGeofence) {
        // Fuera del radio de cualquier sucursal registrada
        isCheckingRef.current = false
        return
      }

      // Si coincide con la sucursal ya activa, no hacer nada
      if (currentStore && match.store.id_store === currentStore.id_store) {
        isCheckingRef.current = false
        return
      }

      // Si el usuario ya rechazó esta sucursal en esta sesión
      const ignoredId = sessionStorage.getItem(IGNORED_GEO_STORE_KEY)
      if (ignoredId === match.store.id_store) {
        isCheckingRef.current = false
        return
      }

      // Detectada una sucursal distinta a la activa
      setDetectedMatch(match)
      setModalOpen(true)
    } catch {
      // Si el usuario deniega GPS o no hay señal, omitir silenciosamente sin interrumpir
    } finally {
      isCheckingRef.current = false
    }
  }, [supabase, currentStore])

  // Chequeo inicial tras montar
  useEffect(() => {
    const timer = setTimeout(() => {
      checkLocation(true)
    }, 1500)
    return () => clearTimeout(timer)
  }, [checkLocation])

  // Chequeo al volver a la pestaña (visibilitychange y focus)
  useEffect(() => {
    function handleVisibilityOrFocus() {
      if (document.visibilityState === 'visible') {
        checkLocation()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityOrFocus)
    window.addEventListener('focus', handleVisibilityOrFocus)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus)
      window.removeEventListener('focus', handleVisibilityOrFocus)
    }
  }, [checkLocation])

  // Seguimiento periódico en segundo plano
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        checkLocation()
      }
    }, CHECK_INTERVAL_MS * 2)

    return () => clearInterval(interval)
  }, [checkLocation])

  // Confirmar cambio a la sucursal detectada
  const handleAcceptSwitch = async () => {
    if (!detectedMatch) return
    setUpdating(true)

    const targetStore = detectedMatch.store
    setStore(targetStore)

    // Si marcó actualizar permanentemente su perfil
    if (updatePermanent && profile.id) {
      try {
        const { error } = await supabase
          .from('profiles')
          .update({
            id_store: targetStore.id_store,
            updated_at: new Date().toISOString(),
          })
          .eq('id', profile.id)

        if (error) {
          toast.error('Sucursal cambiada en sesión, pero no se pudo actualizar tu perfil: ' + error.message)
        } else {
          toast.success(`Sucursal asignada permanentemente a: ${targetStore.description}`)
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error desconocido'
        toast.error('Error al actualizar perfil: ' + msg)
      }
    } else {
      toast.success(`Sucursal activa cambiada a: ${targetStore.description}`)
    }

    setUpdating(false)
    setModalOpen(false)
  }

  // Descartar y mantener la sucursal actual para esta sesión
  const handleDismiss = () => {
    if (detectedMatch) {
      sessionStorage.setItem(IGNORED_GEO_STORE_KEY, detectedMatch.store.id_store)
    }
    setModalOpen(false)
  }

  if (!modalOpen || !detectedMatch) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="glass-card border border-emerald-500/30 max-w-md w-full p-6 shadow-2xl relative overflow-hidden space-y-5"
        >
          {/* Luz ambiental decorativa */}
          <div className="absolute -top-16 -right-16 w-36 h-36 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none" />

          {/* Encabezado */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/30 flex-shrink-0 animate-pulse">
                <Navigation size={22} className="text-white" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  GPS en tiempo real
                </span>
                <h3 className="text-base font-bold text-foreground mt-0.5">
                  Cambio de Sucursal Detectado
                </h3>
              </div>
            </div>

            <button
              onClick={handleDismiss}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
              title="Cerrar"
            >
              <X size={18} />
            </button>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            Detectamos mediante geolocalización que te encuentras físicamente en otra sucursal. ¿Deseas cambiar tu sucursal activa para evitar registrar movimientos en la tienda equivocada?
          </p>

          {/* Comparación de Sucursales */}
          <div className="space-y-2.5">
            {/* Sucursal Detectada */}
            <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                  <MapPin size={13} />
                  Sucursal Detectada
                </span>
                <span className="text-[11px] font-mono text-emerald-300 font-semibold">
                  A {formatDistance(detectedMatch.distanceMeters)} de ti
                </span>
              </div>
              <p className="text-sm font-bold text-foreground">
                {detectedMatch.store.description}
              </p>
              {detectedMatch.store.location && (
                <p className="text-xs text-muted-foreground">
                  {detectedMatch.store.location}
                </p>
              )}
            </div>

            {/* Sucursal Actual */}
            <div className="p-3 rounded-xl bg-white/[0.02] border border-border/40 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-muted-foreground">
                <StoreIcon size={14} />
                <span>Sucursal activa actual:</span>
              </div>
              <span className="font-semibold text-foreground">
                {currentStore?.description || 'Ninguna'}
              </span>
            </div>
          </div>

          {/* Opción para actualizar permanentemente en profiles */}
          {profile.role !== 'ADMIN' && (
            <label className="flex items-start gap-2.5 p-2 rounded-xl hover:bg-white/[0.02] cursor-pointer transition-colors select-none">
              <input
                type="checkbox"
                checked={updatePermanent}
                onChange={(e) => setUpdatePermanent(e.target.checked)}
                className="mt-0.5 rounded border-border text-emerald-500 focus:ring-emerald-500/30 cursor-pointer"
              />
              <span className="text-xs text-muted-foreground">
                Asignar también como mi <strong className="text-foreground">sucursal principal permanente</strong> en mi perfil
              </span>
            </label>
          )}

          {/* Botones de acción */}
          <div className="flex items-center justify-end gap-2.5 pt-1">
            <GlassButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              disabled={updating}
            >
              Mantener actual
            </GlassButton>
            <GlassButton
              type="button"
              variant="primary"
              size="sm"
              onClick={handleAcceptSwitch}
              disabled={updating}
              className="shadow-lg shadow-emerald-500/20"
            >
              <Check size={14} className="mr-1.5" />
              {updating ? 'Cambiando...' : `Cambiar a ${detectedMatch.store.description}`}
            </GlassButton>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
