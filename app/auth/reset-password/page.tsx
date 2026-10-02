'use client'

import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { GlassCard } from '@/components/glass-card'
import { GlassButton } from '@/components/glass-button'
import { resetPassword } from '@/app/(auth)/actions'
import { Lock, AlertCircle } from 'lucide-react'
import { Suspense } from 'react'

function ResetPasswordForm() {
  const params = useSearchParams()
  const error = params.get('error')

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-zinc-950">
      <motion.div
        className="w-full max-w-sm"
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <GlassCard padding="lg" hover={false} className="dark">
          <div className="text-center mb-7">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-xl shadow-emerald-500/25">
              <span className="text-white text-xl font-bold">C</span>
            </div>
            <h1 className="text-xl font-bold text-white mb-1">Nueva contraseña</h1>
            <p className="text-sm text-white/40">
              Ingresa tu nueva contraseña para actualizar tu acceso
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2.5 p-3 mb-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              <AlertCircle size={15} className="flex-shrink-0" />
              {decodeURIComponent(error)}
            </div>
          )}

          <form action={resetPassword} className="flex flex-col gap-3.5">
            <div className="glass-input flex items-center">
              <Lock size={15} className="ml-3 mr-2 text-white/40 flex-shrink-0" />
              <input
                id="reset-password"
                name="password"
                type="password"
                placeholder="Nueva contraseña (mínimo 6 caracteres)"
                required
                minLength={6}
                autoComplete="new-password"
                className="flex-1 bg-transparent py-3 pr-3 text-sm text-white placeholder:text-white/30 outline-none"
              />
            </div>

            <GlassButton
              type="submit"
              variant="primary"
              size="lg"
              className="w-full mt-2"
            >
              Guardar nueva contraseña
            </GlassButton>

            <div className="text-center mt-3">
              <Link
                href="/login"
                className="text-xs text-white/50 hover:text-white transition-colors"
              >
                Volver a iniciar sesión
              </Link>
            </div>
          </form>
        </GlassCard>
      </motion.div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  )
}
