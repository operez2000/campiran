'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { GlassButton } from '@/components/glass-button'
import { GlassCard } from '@/components/glass-card'
import { signInWithEmail } from '../actions'
import { createClient } from '@/utils/supabase/client'
import { Mail, Lock, AlertCircle, RefreshCw } from 'lucide-react'
import { Suspense } from 'react'
import { toast } from 'sonner'

function LoginForm() {
  const params = useSearchParams()
  const error = params.get('error')
  const [googleLoading, setGoogleLoading] = useState(false)
  const supabase = createClient()

  const handleGoogleLogin = async () => {
    try {
      setGoogleLoading(true)
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: { access_type: 'offline', prompt: 'select_account' },
        },
      })
      if (error) {
        toast.error('Error al iniciar sesión con Google: ' + error.message)
        setGoogleLoading(false)
      }
    } catch {
      toast.error('No se pudo conectar con el servicio de autenticación')
      setGoogleLoading(false)
    }
  }

  return (
    <motion.div
      className="w-full max-w-sm"
      initial={{ opacity: 0, y: 32 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
    >
      <GlassCard padding="lg" hover={false} className="dark">
        {/* Logo + Title */}
        <div className="text-center mb-8">
          <motion.div
            className="w-16 h-16 mx-auto mb-4 rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-2xl shadow-emerald-500/30"
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
          >
            <span className="text-white text-2xl font-bold">C</span>
          </motion.div>
          <h1 className="text-2xl font-bold text-white mb-1">Campiran</h1>
          <p className="text-sm text-white/50">POS + Inventario</p>
        </div>

        {/* Error banner */}
        {error && (
          <motion.div
            className="flex items-center gap-2.5 p-3 mb-5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <AlertCircle size={16} className="flex-shrink-0" />
            <span>
              {error === 'auth_callback_failed'
                ? 'Error al verificar la sesión con Google. Intente nuevamente.'
                : decodeURIComponent(error)}
            </span>
          </motion.div>
        )}

        {/* Sign in form */}
        <form action={signInWithEmail} className="flex flex-col gap-4">
          <div className="glass-input flex items-center">
            <Mail size={16} className="ml-3 mr-2 text-white/40 flex-shrink-0" />
            <input
              id="login-email"
              name="email"
              type="email"
              placeholder="correo@empresa.com"
              required
              autoComplete="email"
              className="flex-1 bg-transparent py-3 pr-3 text-sm text-white placeholder:text-white/30 outline-none"
            />
          </div>

          <div className="glass-input flex items-center">
            <Lock size={16} className="ml-3 mr-2 text-white/40 flex-shrink-0" />
            <input
              id="login-password"
              name="password"
              type="password"
              placeholder="Contraseña"
              required
              autoComplete="current-password"
              className="flex-1 bg-transparent py-3 pr-3 text-sm text-white placeholder:text-white/30 outline-none"
            />
          </div>

          <div className="flex justify-end">
            <Link
              href="/forgot-password"
              className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              ¿Olvidaste tu contraseña?
            </Link>
          </div>

          <GlassButton
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
          >
            Iniciar sesión
          </GlassButton>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 border-t border-white/10" />
          <span className="text-xs text-white/30">o continuar con</span>
          <div className="flex-1 border-t border-white/10" />
        </div>

        {/* Google OAuth Button */}
        <GlassButton
          type="button"
          variant="ghost"
          size="md"
          onClick={handleGoogleLogin}
          disabled={googleLoading}
          className="w-full border border-white/10 text-white/80 hover:text-white hover:border-white/20 flex items-center justify-center gap-2"
          icon={
            googleLoading ? (
              <RefreshCw size={16} className="animate-spin text-emerald-400" />
            ) : (
              <svg viewBox="0 0 24 24" width="18" height="18">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            )
          }
        >
          {googleLoading ? 'Conectando con Google...' : 'Continuar con Google'}
        </GlassButton>

        {/* Sign up link */}
        <p className="text-center text-sm text-white/40 mt-6">
          ¿No tienes cuenta?{' '}
          <Link href="/signup" className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors">
            Regístrate
          </Link>
        </p>
      </GlassCard>
    </motion.div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
