'use client'

import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { GlassCard } from '@/components/glass-card'
import { GlassButton } from '@/components/glass-button'
import { signUpWithEmail } from '../actions'
import { Mail, Lock, User, AlertCircle, CheckCircle } from 'lucide-react'
import { Suspense } from 'react'

function SignupForm() {
  const params = useSearchParams()
  const error = params.get('error')

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
          <h1 className="text-xl font-bold text-white mb-1">Crear cuenta</h1>
          <p className="text-sm text-white/40">Tu cuenta será revisada antes de activarse</p>
        </div>

        {error && (
          <div className="flex items-center gap-2.5 p-3 mb-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            <AlertCircle size={15} className="flex-shrink-0" />
            {decodeURIComponent(error)}
          </div>
        )}

        <form action={signUpWithEmail} className="flex flex-col gap-3.5">
          <div className="glass-input flex items-center">
            <User size={15} className="ml-3 mr-2 text-white/40 flex-shrink-0" />
            <input
              id="signup-name"
              name="full_name"
              type="text"
              placeholder="Nombre completo"
              required
              className="flex-1 bg-transparent py-3 pr-3 text-sm text-white placeholder:text-white/30 outline-none"
            />
          </div>
          <div className="glass-input flex items-center">
            <Mail size={15} className="ml-3 mr-2 text-white/40 flex-shrink-0" />
            <input
              id="signup-email"
              name="email"
              type="email"
              placeholder="correo@empresa.com"
              required
              autoComplete="email"
              className="flex-1 bg-transparent py-3 pr-3 text-sm text-white placeholder:text-white/30 outline-none"
            />
          </div>
          <div className="glass-input flex items-center">
            <Lock size={15} className="ml-3 mr-2 text-white/40 flex-shrink-0" />
            <input
              id="signup-password"
              name="password"
              type="password"
              placeholder="Mínimo 8 caracteres"
              required
              minLength={8}
              className="flex-1 bg-transparent py-3 pr-3 text-sm text-white placeholder:text-white/30 outline-none"
            />
          </div>

          <GlassButton type="submit" variant="primary" size="lg" className="w-full mt-1">
            Crear cuenta
          </GlassButton>
        </form>

        <p className="text-center text-sm text-white/40 mt-5">
          ¿Ya tienes cuenta?{' '}
          <Link href="/login" className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors">
            Iniciar sesión
          </Link>
        </p>
      </GlassCard>
    </motion.div>
  )
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  )
}
