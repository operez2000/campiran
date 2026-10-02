'use client'

import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { GlassCard } from '@/components/glass-card'
import { GlassButton } from '@/components/glass-button'
import { forgotPassword } from '../actions'
import { Mail, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react'
import { Suspense } from 'react'

function ForgotPasswordForm() {
  const params = useSearchParams()
  const error = params.get('error')
  const success = params.get('success')

  return (
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
          <h1 className="text-xl font-bold text-white mb-1">Recuperar contraseña</h1>
          <p className="text-sm text-white/40">
            Ingresa tu correo para recibir las instrucciones de restablecimiento
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-2.5 p-3 mb-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            <AlertCircle size={15} className="flex-shrink-0" />
            {decodeURIComponent(error)}
          </div>
        )}

        {success ? (
          <div className="flex flex-col items-center gap-3 p-4 mb-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm text-center">
            <CheckCircle size={32} className="text-emerald-400" />
            <p className="font-medium">Correo de recuperación enviado</p>
            <p className="text-xs text-white/60">
              Revisa tu bandeja de entrada o spam para restablecer tu contraseña.
            </p>
            <Link
              href="/login"
              className="mt-3 text-xs text-emerald-400 hover:text-emerald-300 font-medium inline-flex items-center gap-1.5 transition-colors"
            >
              <ArrowLeft size={14} /> Volver a iniciar sesión
            </Link>
          </div>
        ) : (
          <form action={forgotPassword} className="flex flex-col gap-3.5">
            <div className="glass-input flex items-center">
              <Mail size={15} className="ml-3 mr-2 text-white/40 flex-shrink-0" />
              <input
                id="forgot-email"
                name="email"
                type="email"
                placeholder="correo@empresa.com"
                required
                autoComplete="email"
                className="flex-1 bg-transparent py-3 pr-3 text-sm text-white placeholder:text-white/30 outline-none"
              />
            </div>

            <GlassButton
              type="submit"
              variant="primary"
              size="lg"
              className="w-full mt-2"
            >
              Enviar enlace de recuperación
            </GlassButton>

            <div className="text-center mt-3">
              <Link
                href="/login"
                className="text-xs text-white/50 hover:text-white transition-colors inline-flex items-center gap-1.5"
              >
                <ArrowLeft size={13} /> Volver a iniciar sesión
              </Link>
            </div>
          </form>
        )}
      </GlassCard>
    </motion.div>
  )
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ForgotPasswordForm />
    </Suspense>
  )
}
