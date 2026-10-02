'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { GlassCard } from '@/components/glass-card'
import { GlassButton } from '@/components/glass-button'
import { Home, ArrowLeft } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-dvh flex items-center justify-center p-4 relative overflow-hidden bg-background">
      <div className="dashboard-bg" />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md relative z-10"
      >
        <GlassCard padding="lg" className="text-center space-y-5">
          <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto text-2xl font-black">
            404
          </div>

          <div className="space-y-1.5">
            <h1 className="text-xl font-bold text-foreground">Página no encontrada</h1>
            <p className="text-xs text-muted-foreground leading-relaxed">
              La ruta o módulo que intentas consultar no existe o ha sido movida dentro del sistema.
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <GlassButton
              variant="ghost"
              onClick={() => window.history.back()}
              className="w-full sm:w-auto"
            >
              <ArrowLeft size={16} className="mr-1.5" />
              Regresar
            </GlassButton>
            <Link href="/" className="w-full sm:w-auto">
              <GlassButton variant="primary" className="w-full">
                <Home size={16} className="mr-1.5" />
                Ir al Inicio
              </GlassButton>
            </Link>
          </div>
        </GlassCard>
      </motion.div>
    </div>
  )
}
