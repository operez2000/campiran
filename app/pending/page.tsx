'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { createClient } from '@/utils/supabase/client'
import { type Profile } from '@/lib/types'
import { Clock } from 'lucide-react'

export default function PendingPage() {
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    let isCancelled = false
    let activeChannel: ReturnType<typeof supabase.channel> | null = null

    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (isCancelled) return
      if (!user) { router.replace('/login'); return }
      const userId = user.id

      // Check if already activated in profiles
      const { data: profile } = await supabase
        .from('profiles')
        .select('status, role')
        .eq('id', userId)
        .maybeSingle()

      if (isCancelled) return

      if (profile?.status === 'active' && profile.role !== 'PENDING') {
        router.replace('/')
        return
      }

      // Check fallback legacy users
      const { data: legacyUser } = await supabase
        .from('users')
        .select('status, role')
        .or(`id_user.eq.${userId},email.eq.${user.email}`)
        .maybeSingle()

      if (isCancelled) return

      if (legacyUser && legacyUser.status === 'A') {
        router.replace('/')
        return
      }

      // Unique channel topic to guarantee fresh subscription without collisions
      const channelId = `pending-user-${userId}-${Date.now()}`
      const channel = supabase.channel(channelId)

      channel
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
          (payload) => {
            const updated = payload.new as Profile
            if (updated.status === 'active' && updated.role !== 'PENDING') {
              router.replace('/')
            }
          }
        )
        .subscribe((status, err) => {
          if (err) {
            console.warn('[PendingPage] Realtime notice:', err.message)
          }
        })

      if (isCancelled) {
        supabase.removeChannel(channel)
      } else {
        activeChannel = channel
      }
    }

    init()
    return () => {
      isCancelled = true
      if (activeChannel) {
        supabase.removeChannel(activeChannel)
      }
    }
  }, [router, supabase])

  return (
    <div className="min-h-dvh flex items-center justify-center p-6 relative overflow-hidden">
      <div
        className="fixed inset-0 -z-10"
        style={{
          background: `
            radial-gradient(ellipse 100% 80% at 30% -20%, oklch(0.45 0.18 160 / 0.25) 0%, transparent 55%),
            radial-gradient(ellipse 80% 60% at 75% 120%, oklch(0.40 0.22 264 / 0.20) 0%, transparent 55%),
            oklch(0.08 0.012 264)
          `,
        }}
      />

      <motion.div
        className="w-full max-w-md text-center"
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <div className="glass-card p-10 dark">
          {/* Animated clock icon */}
          <motion.div
            className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center"
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
          >
            <Clock size={36} className="text-amber-400" />
          </motion.div>

          <h1 className="text-2xl font-bold text-white mb-3">
            Cuenta en revisión
          </h1>
          <p className="text-white/50 text-sm leading-relaxed mb-8">
            Tu cuenta está siendo revisada por un administrador.
            Recibirás acceso automáticamente una vez que te asignen un rol.
            Esta página se actualizará en tiempo real.
          </p>

          {/* Realtime indicator */}
          <div className="flex items-center justify-center gap-2 text-xs text-emerald-400">
            <motion.div
              className="w-2 h-2 rounded-full bg-emerald-400"
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
            />
            Escuchando cambios en tiempo real...
          </div>
        </div>
      </motion.div>
    </div>
  )
}
