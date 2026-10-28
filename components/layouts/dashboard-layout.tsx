'use client'

import { useState, useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Header } from './header'
import { SidebarNav } from './sidebar'
import { type Profile } from '@/lib/types'
import { X, PanelLeftClose } from 'lucide-react'
import { cn } from '@/lib/utils'

import Link from 'next/link'
import { UserAvatar } from '@/components/user-avatar'
import { getRoleLabel } from '@/lib/utils'
import { StoreGeoGuard } from '@/components/providers/store-geo-guard'
import { CompanyProvider, useCompany } from '@/components/providers/company-provider'
import { FloatingScrollIndicator } from '@/components/floating-scroll-indicator'

interface DashboardLayoutProps {
  profile: Profile
  initialLogoUrl?: string | null
  initialTradeName?: string
  children: React.ReactNode
}

export function DashboardLayout({
  profile,
  initialLogoUrl = null,
  initialTradeName = 'Campiran',
  children,
}: DashboardLayoutProps) {
  return (
    <CompanyProvider initialLogoUrl={initialLogoUrl} initialTradeName={initialTradeName}>
      <DashboardLayoutContent profile={profile}>
        {children}
      </DashboardLayoutContent>
    </CompanyProvider>
  )
}

function DashboardLayoutContent({
  profile,
  children,
}: {
  profile: Profile
  children: React.ReactNode
}) {
  const mainRef = useRef<HTMLElement>(null)
  const { logoUrl, tradeName } = useCompany()
  const [logoError, setLogoError] = useState(false)

  useEffect(() => {
    setLogoError(false)
  }, [logoUrl])
  const [mobileOpen, setMobileOpen] = useState(false)
  const [desktopOpen, setDesktopOpen] = useState(true)

  // Load initial desktop open preference from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('campiran_sidebar_open')
      if (saved !== null) {
        const val = JSON.parse(saved)
        if (typeof val === 'boolean') {
          queueMicrotask(() => setDesktopOpen(val))
        }
      }
    } catch {
      // ignore
    }
  }, [])

  const toggleDesktop = () => {
    setDesktopOpen((prev) => {
      const next = !prev
      try {
        localStorage.setItem('campiran_sidebar_open', JSON.stringify(next))
      } catch {
        // ignore
      }
      return next
    })
  }

  // Keyboard shortcut: Cmd+B / Ctrl+B to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        toggleDesktop()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* ── Desktop Sidebar ──────────────────────────────── */}
      <aside
        className={cn(
          'hidden lg:flex flex-col sidebar-glass flex-shrink-0 transition-all duration-300 ease-in-out relative z-20 overflow-hidden',
          desktopOpen ? 'w-64 opacity-100' : 'w-0 opacity-0 !border-r-0 pointer-events-none'
        )}
      >
        <div className="w-64 flex flex-col h-full flex-shrink-0">
          {/* Logo area with collapse button */}
          <div className="h-16 flex items-center justify-between px-5 border-b border-[var(--border)]">
            <Link
              href="/pos"
              className="flex items-center gap-3 min-w-0 hover:opacity-90 transition-opacity"
            >
              {logoUrl && !logoError ? (
                <div className="w-9 h-9 rounded-2xl overflow-hidden bg-white/10 dark:bg-white/5 border border-white/10 flex items-center justify-center shadow-md shadow-emerald-500/10 flex-shrink-0 p-1">
                  <img
                    src={logoUrl}
                    alt={tradeName || 'Logo'}
                    className="w-full h-full object-contain"
                    onError={() => setLogoError(true)}
                  />
                </div>
              ) : (
                <div className="w-9 h-9 rounded-2xl overflow-hidden bg-white/10 dark:bg-white/5 border border-white/10 flex items-center justify-center shadow-md flex-shrink-0 p-1">
                  <img
                    src="/logo.png"
                    alt="Campiran"
                    className="w-full h-full object-contain"
                  />
                </div>
              )}
              <div className="min-w-0">
                <p className="font-bold text-[var(--foreground)] leading-none truncate">
                  {tradeName || 'Campiran'}
                </p>
                <p className="text-xs text-[var(--muted)] mt-0.5 truncate">POS + Inventario</p>
              </div>
            </Link>
            <button
              onClick={toggleDesktop}
              className="p-1.5 rounded-xl btn-ghost text-muted-foreground hover:text-foreground transition-colors"
              title="Ocultar menú lateral (⌘B)"
              aria-label="Ocultar menú lateral"
            >
              <PanelLeftClose size={18} />
            </button>
          </div>

          {/* Navigation */}
          <div className="flex-1 overflow-y-auto scroll-modern">
            <SidebarNav role={profile.role} />
          </div>

          {/* User profile preview */}
          <div className="p-2.5 mx-3 mb-2 rounded-2xl glass border border-white/5 flex items-center gap-2.5">
            <UserAvatar
              src={profile.avatar_url}
              name={profile.full_name || profile.email}
              size="sm"
            />
            <div className="flex-1 min-w-0 text-left">
              <p className="text-xs font-semibold text-foreground truncate">
                {profile.full_name || 'Usuario'}
              </p>
              <p className="text-[10px] text-muted-foreground truncate">
                {getRoleLabel(profile.role)}
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="p-3 border-t border-[var(--border)]">
            <p className="text-xs text-[var(--muted)] text-center">
              v0.1.0 · Campiran © 2026
            </p>
          </div>
        </div>
      </aside>

      {/* ── Mobile Sidebar Overlay ───────────────────────── */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              className="fixed left-0 top-0 bottom-0 z-50 w-72 sidebar-glass flex flex-col lg:hidden"
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            >
              <div className="h-16 flex items-center justify-between px-5 border-b border-[var(--border)]">
                <Link
                  href="/pos"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-3 min-w-0 hover:opacity-90 transition-opacity"
                >
                  {logoUrl && !logoError ? (
                    <div className="w-9 h-9 rounded-2xl overflow-hidden bg-white/10 dark:bg-white/5 border border-white/10 flex items-center justify-center shadow-md flex-shrink-0 p-1">
                      <img
                        src={logoUrl}
                        alt={tradeName || 'Logo'}
                        className="w-full h-full object-contain"
                        onError={() => setLogoError(true)}
                      />
                    </div>
                  ) : (
                    <div className="w-9 h-9 rounded-2xl overflow-hidden bg-white/10 dark:bg-white/5 border border-white/10 flex items-center justify-center shadow-md flex-shrink-0 p-1">
                      <img
                        src="/logo.png"
                        alt="Campiran"
                        className="w-full h-full object-contain"
                      />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-bold text-[var(--foreground)] leading-none truncate">
                      {tradeName || 'Campiran'}
                    </p>
                    <p className="text-xs text-[var(--muted)] mt-0.5 truncate">POS + Inventario</p>
                  </div>
                </Link>
                <button
                  onClick={() => setMobileOpen(false)}
                  className="p-2 rounded-xl btn-ghost"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto scroll-modern">
                <SidebarNav role={profile.role} onNavigate={() => setMobileOpen(false)} />
              </div>

              {/* User profile preview */}
              <div className="p-2.5 mx-3 mb-2 rounded-2xl glass border border-white/5 flex items-center gap-2.5">
                <UserAvatar
                  src={profile.avatar_url}
                  name={profile.full_name || profile.email}
                  size="sm"
                />
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-xs font-semibold text-foreground truncate">
                    {profile.full_name || 'Usuario'}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {getRoleLabel(profile.role)}
                  </p>
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ── Main Content ─────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <StoreGeoGuard profile={profile} />
        <Header
          profile={profile}
          onMenuClick={() => setMobileOpen(true)}
          onToggleDesktop={toggleDesktop}
          isDesktopOpen={desktopOpen}
        />

        <main
          ref={mainRef}
          className="flex-1 overflow-y-auto scroll-modern relative p-3 sm:p-4 lg:p-5 flex flex-col min-h-0"
        >
          <div className="dashboard-bg" />
          <div className="max-w-[1600px] mx-auto w-full flex-1 flex flex-col min-h-0">
            {children}
          </div>
          <FloatingScrollIndicator targetRef={mainRef} />
        </main>
      </div>
    </div>
  )
}
