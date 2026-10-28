'use client'

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { RefreshCw, Sparkles } from 'lucide-react'

export function PwaUpdater() {
  const refreshingRef = useRef(false)
  const waitingWorkerRef = useRef<ServiceWorker | null>(null)
  const toastIdRef = useRef<string | number | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return
    }

    // Recargar cuando el nuevo Service Worker toma el control
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshingRef.current) return
      refreshingRef.current = true
      window.location.reload()
    })

    const promptUserToUpdate = (worker: ServiceWorker) => {
      waitingWorkerRef.current = worker

      if (toastIdRef.current) {
        toast.dismiss(toastIdRef.current)
      }

      toastIdRef.current = toast(
        <div className="flex flex-col gap-1 w-full">
          <div className="flex items-center gap-2 font-semibold text-emerald-400">
            <Sparkles className="w-4 h-4" />
            <span>Nueva versión disponible</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Se ha detectado una actualización con mejoras para Campiran.
          </p>
        </div>,
        {
          duration: Infinity,
          action: {
            label: 'Actualizar ahora',
            onClick: () => {
              if (waitingWorkerRef.current) {
                waitingWorkerRef.current.postMessage({ type: 'SKIP_WAITING' })
              }
            },
          },
          cancel: {
            label: 'Más tarde',
            onClick: () => {
              toast.dismiss(toastIdRef.current ?? undefined)
            },
          },
        }
      )
    }

    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('[PWA] Service Worker registrado con alcance:', registration.scope)

        // Si ya hay un worker esperando
        if (registration.waiting) {
          promptUserToUpdate(registration.waiting)
        }

        // Detectar si se encuentra una actualización
        registration.addEventListener('updatefound', () => {
          const installingWorker = registration.installing
          if (!installingWorker) return

          installingWorker.addEventListener('statechange', () => {
            if (
              installingWorker.state === 'installed' &&
              navigator.serviceWorker.controller
            ) {
              // Nueva versión instalada y lista
              promptUserToUpdate(installingWorker)
            }
          })
        })

        // Comprobación periódica cada 30 minutos
        const intervalId = setInterval(() => {
          registration.update().catch((err) => {
            console.warn('[PWA] Error en verificación periódica:', err)
          })
        }, 30 * 60 * 1000)

        // Comprobación al volver a la pestaña/aplicación
        const handleVisibilityChange = () => {
          if (document.visibilityState === 'visible') {
            registration.update().catch((err) => {
              console.warn('[PWA] Error en verificación por visibilidad:', err)
            })
          }
        }
        document.addEventListener('visibilitychange', handleVisibilityChange)

        return () => {
          clearInterval(intervalId)
          document.removeEventListener('visibilitychange', handleVisibilityChange)
        }
      })
      .catch((err) => {
        console.error('[PWA] Error al registrar Service Worker:', err)
      })
  }, [])

  return null
}
