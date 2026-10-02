'use client'

import { useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { type Profile } from '@/lib/types'

const PUBLIC_PATHS = ['/login', '/signup', '/forgot-password', '/auth', '/pending']

/**
 * Global guard that checks user status.
 * If the user's status is explicitly set to 'inactive', they are redirected to /pending.
 */
export function UserStatusGuard() {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const currentUserIdRef = useRef<string | null>(null)

  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  )

  // 1. Check status whenever the pathname changes without rebuilding realtime channels
  useEffect(() => {
    if (isPublic) return

    async function checkCurrentRouteStatus() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Check profiles
      const { data: profile } = await supabase
        .from('profiles')
        .select('status, role')
        .eq('id', user.id)
        .maybeSingle()

      if (profile) {
        if (profile.status === 'inactive') {
          await supabase.auth.signOut()
          window.location.replace('/pending')
          return
        }
        if (profile.role === 'PENDING' || profile.status === 'pending') {
          if (!window.location.pathname.startsWith('/pending')) {
            window.location.replace('/pending')
          }
        }
        return
      }

      // Check legacy users
      const { data: legacyUser } = await supabase
        .from('users')
        .select('status, role')
        .or(`id_user.eq.${user.id},email.eq.${user.email}`)
        .maybeSingle()

      if (legacyUser && legacyUser.status === 'I') {
        await supabase.auth.signOut()
        window.location.replace('/pending')
      }
    }

    checkCurrentRouteStatus()
  }, [pathname, isPublic, supabase])

  // 2. Realtime channel subscription: managed independently per user session
  useEffect(() => {
    let isCancelled = false
    let activeChannel: ReturnType<typeof supabase.channel> | null = null

    async function setupRealtime() {
      const { data: { user } } = await supabase.auth.getUser()
      if (isCancelled || !user) return

      currentUserIdRef.current = user.id
      const userId = user.id

      // Use unique channel topic to guarantee no collision with previous subscriptions
      const channelId = `user-status-guard-${userId}-${Date.now()}`
      const channel = supabase.channel(channelId)

      channel
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'profiles',
            filter: `id=eq.${userId}`,
          },
          async (payload) => {
            const updated = payload.new as Profile
            if (updated.status === 'inactive') {
              await supabase.auth.signOut()
              window.location.replace('/pending')
            } else if (updated.role === 'PENDING' || updated.status === 'pending') {
              if (!window.location.pathname.startsWith('/pending')) {
                window.location.replace('/pending')
              }
            } else if (updated.status === 'active' && window.location.pathname.startsWith('/pending')) {
              router.replace('/')
            }
          }
        )
        .subscribe((status, err) => {
          if (err) {
            console.warn('[UserStatusGuard] Realtime notice:', err.message)
          }
        })

      if (isCancelled) {
        supabase.removeChannel(channel)
      } else {
        activeChannel = channel
      }
    }

    setupRealtime()

    // Heartbeat check every 60s
    heartbeatRef.current = setInterval(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase
        .from('profiles')
        .select('status')
        .eq('id', user.id)
        .maybeSingle()
      if (profile?.status === 'inactive') {
        await supabase.auth.signOut()
        window.location.replace('/pending')
      }
    }, 60_000)

    function onVisible() {
      if (!document.hidden && !isPublic) {
        supabase.auth.getUser().then(({ data: { user } }) => {
          if (!user) return
          supabase
            .from('profiles')
            .select('status')
            .eq('id', user.id)
            .maybeSingle()
            .then(({ data: profile }) => {
              if (profile?.status === 'inactive') {
                supabase.auth.signOut().then(() => window.location.replace('/pending'))
              }
            })
        })
      }
    }

    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)

    return () => {
      isCancelled = true
      if (activeChannel) {
        supabase.removeChannel(activeChannel)
      }
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [supabase, router, isPublic])

  return null
}
