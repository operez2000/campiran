'use client'

import { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Header } from './header'
import { SidebarNav } from './sidebar'
import { type Profile } from '@/lib/types'
import { X, PanelLeftClose } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DashboardLayoutProps {
  profile: Profile
  children: React.ReactNode
}

export function DashboardLayout({ profile, children }: DashboardLayoutProps) {
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
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/25">
                <span className="text-white font-bold">C</span>
              </div>
              <div>
                <p className="font-bold text-[var(--foreground)] leading-none">Campiran</p>
                <p className="text-xs text-[var(--muted)] mt-0.5">POS + Inventario</p>
              </div>
            </div>
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

          {/* Footer */}
          <div className="p-4 border-t border-[var(--border)]">
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
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                    <span className="text-white font-bold">C</span>
                  </div>
                  <p className="font-bold text-[var(--foreground)]">Campiran</p>
                </div>
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
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ── Main Content ─────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header
          profile={profile}
          onMenuClick={() => setMobileOpen(true)}
          onToggleDesktop={toggleDesktop}
          isDesktopOpen={desktopOpen}
        />

        <main className="flex-1 overflow-y-auto scroll-modern relative p-4 sm:p-6 lg:p-8">
          <div className="dashboard-bg" />
          <div className="max-w-[1600px] mx-auto w-full pb-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
