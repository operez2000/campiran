'use client'

import { useState, useEffect, useCallback, type RefObject } from 'react'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronUp } from 'lucide-react'

interface FloatingScrollIndicatorProps {
  /**
   * Ref opcional del elemento con scroll (ej. el contenedor <main>).
   * Si no se provee, escucha el scroll de window / documentElement.
   */
  targetRef?: RefObject<HTMLElement | null>
  /**
   * Texto personalizado cuando hay más contenido abajo. Default: "Más contenido"
   */
  moreContentLabel?: string
  /**
   * Texto personalizado cuando se llega al final. Default: "Volver arriba"
   */
  scrollToTopLabel?: string
  /**
   * Margen inferior en píxeles o clases adicionales
   */
  className?: string
}

export function FloatingScrollIndicator({
  targetRef,
  moreContentLabel = 'Más contenido',
  scrollToTopLabel = 'Volver arriba',
  className = '',
}: FloatingScrollIndicatorProps) {
  const pathname = usePathname()
  const [hasOverflow, setHasOverflow] = useState(false)
  const [isAtBottom, setIsAtBottom] = useState(false)
  const [isScrolledDown, setIsScrolledDown] = useState(false)

  const checkScrollState = useCallback(() => {
    const el = targetRef?.current
    if (el) {
      const scrollHeight = el.scrollHeight
      const clientHeight = el.clientHeight
      const scrollTop = el.scrollTop

      // Margen de tolerancia de 35px
      const overflow = scrollHeight > clientHeight + 35
      const atBottom = overflow && scrollTop + clientHeight >= scrollHeight - 40
      const scrolled = scrollTop > 50

      setHasOverflow(overflow)
      setIsAtBottom(atBottom)
      setIsScrolledDown(scrolled)
    } else if (typeof window !== 'undefined') {
      const doc = document.documentElement
      const scrollHeight = doc.scrollHeight
      const clientHeight = window.innerHeight
      const scrollTop = window.scrollY || doc.scrollTop

      const overflow = scrollHeight > clientHeight + 35
      const atBottom = overflow && scrollTop + clientHeight >= scrollHeight - 40
      const scrolled = scrollTop > 50

      setHasOverflow(overflow)
      setIsAtBottom(atBottom)
      setIsScrolledDown(scrolled)
    }
  }, [targetRef])

  // Escuchar scroll y cambios de tamaño
  useEffect(() => {
    checkScrollState()

    const el = targetRef?.current
    if (el) {
      el.addEventListener('scroll', checkScrollState, { passive: true })

      // ResizeObserver para cambios en el contenedor o su contenido dinámico
      const resizeObserver = new ResizeObserver(() => {
        checkScrollState()
      })
      resizeObserver.observe(el)
      if (el.firstElementChild) {
        resizeObserver.observe(el.firstElementChild)
      }

      // MutationObserver para capturar cambios en el DOM (búsquedas, filtros, tabs)
      const mutationObserver = new MutationObserver(() => {
        checkScrollState()
      })
      mutationObserver.observe(el, { childList: true, subtree: true })

      return () => {
        el.removeEventListener('scroll', checkScrollState)
        resizeObserver.disconnect()
        mutationObserver.disconnect()
      }
    } else {
      window.addEventListener('scroll', checkScrollState, { passive: true })
      window.addEventListener('resize', checkScrollState, { passive: true })
      return () => {
        window.removeEventListener('scroll', checkScrollState)
        window.removeEventListener('resize', checkScrollState)
      }
    }
  }, [targetRef, checkScrollState])

  // Re-verificar cuando cambia la ruta
  useEffect(() => {
    const timer = setTimeout(checkScrollState, 200)
    return () => clearTimeout(timer)
  }, [pathname, checkScrollState])

  const handleClick = () => {
    const el = targetRef?.current
    if (el) {
      if (isAtBottom) {
        el.scrollTo({ top: 0, behavior: 'smooth' })
      } else {
        const scrollAmount = Math.min(el.clientHeight * 0.75, 500)
        el.scrollBy({ top: scrollAmount, behavior: 'smooth' })
      }
    } else if (typeof window !== 'undefined') {
      if (isAtBottom) {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      } else {
        const scrollAmount = Math.min(window.innerHeight * 0.75, 500)
        window.scrollBy({ top: scrollAmount, behavior: 'smooth' })
      }
    }
  }

  // Si no hay desbordamiento vertical, no mostramos nada
  if (!hasOverflow) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.95 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className={`fixed bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-40 pointer-events-auto select-none ${className}`}
      >
        <button
          type="button"
          onClick={handleClick}
          title={isAtBottom ? 'Ir al inicio de la página' : 'Desplazarse hacia abajo para ver más contenido'}
          aria-label={isAtBottom ? 'Subir al inicio' : 'Ver más contenido abajo'}
          className="group relative flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-emerald-500/40 bg-zinc-950/85 dark:bg-zinc-900/90 text-foreground backdrop-blur-xl shadow-xl shadow-black/30 hover:border-emerald-400 hover:shadow-emerald-500/20 active:scale-95 transition-all text-xs font-semibold cursor-pointer"
        >
          {/* Indicador pulsante */}
          {!isAtBottom ? (
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
          ) : (
            <span className="w-2 h-2 rounded-full bg-muted-foreground/60 shrink-0" />
          )}

          {/* Etiqueta */}
          <span className="text-[11px] sm:text-xs font-medium text-foreground group-hover:text-emerald-400 transition-colors">
            {isAtBottom ? scrollToTopLabel : moreContentLabel}
          </span>

          {/* Ícono dinámico */}
          {isAtBottom ? (
            <ChevronUp size={14} className="text-emerald-400 group-hover:-translate-y-0.5 transition-transform" />
          ) : (
            <ChevronDown size={14} className="text-emerald-400 animate-bounce group-hover:translate-y-0.5 transition-transform" />
          )}
        </button>
      </motion.div>
    </AnimatePresence>
  )
}
