'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'

export function SplashScreen() {
  const [show, setShow] = useState(true)

  useEffect(() => {
    // Verificar si ya se mostró en esta sesión de navegación
    const alreadyShown = sessionStorage.getItem('campiran_splash_shown')
    if (alreadyShown) {
      setShow(false)
      return
    }

    // Mostrar el splash screen brevemente al abrir la PWA / app
    const timer = setTimeout(() => {
      setShow(false)
      sessionStorage.setItem('campiran_splash_shown', '1')
    }, 1100)

    return () => clearTimeout(timer)
  }, [])

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="campiran-splash"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.03 }}
          transition={{ duration: 0.45, ease: 'easeInOut' }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#09090b] text-white select-none pointer-events-auto"
        >
          {/* Fondo con resplandores sutiles */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[380px] h-[380px] bg-emerald-500/15 rounded-full blur-[120px]" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[240px] h-[240px] bg-teal-500/20 rounded-full blur-[80px]" />
          </div>

          <div className="relative z-10 flex flex-col items-center">
            {/* Logo oficial */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="relative w-28 h-28 mb-5 drop-shadow-[0_12px_24px_rgba(16,185,129,0.35)]"
            >
              <Image
                src="/logo.png"
                alt="Campiran Logo"
                fill
                priority
                sizes="112px"
                className="object-contain"
              />
            </motion.div>

            {/* Nombre y subtítulo */}
            <motion.div
              initial={{ y: 15, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.15, duration: 0.5 }}
              className="text-center"
            >
              <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-white/95 to-white/70 bg-clip-text text-transparent">
                Campiran
              </h1>
              <p className="text-xs uppercase tracking-widest text-emerald-400/80 font-medium mt-1">
                POS & Inventario
              </p>
            </motion.div>

            {/* Barra de progreso de carga */}
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 140 }}
              transition={{ delay: 0.25, duration: 0.7, ease: 'easeInOut' }}
              className="h-1 bg-white/10 rounded-full overflow-hidden mt-8 relative"
            >
              <motion.div
                initial={{ x: '-100%' }}
                animate={{ x: '100%' }}
                transition={{
                  repeat: Infinity,
                  duration: 1,
                  ease: 'easeInOut',
                }}
                className="w-full h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full shadow-[0_0_12px_rgba(16,185,129,0.8)]"
              />
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
