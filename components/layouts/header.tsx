'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/utils/supabase/client'
import { useStore } from '@/components/providers/store-provider'
import { cn, getInitials, getRoleLabel } from '@/lib/utils'
import { type Profile, type Store } from '@/lib/types'
import { toast } from 'sonner'
import {
  Moon, Sun, Menu, ChevronDown, LogOut, User,
  Store as StoreIcon, Check,
} from 'lucide-react'

interface HeaderProps {
  profile: Profile
  onMenuClick: () => void
}

export function Header({ profile, onMenuClick }: HeaderProps) {
  const router = useRouter()
  const supabase = createClient()
  const { currentStore, setStore, storeId } = useStore()
  const [dark, setDark] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [storeMenuOpen, setStoreMenuOpen] = useState(false)
  const [stores, setStores] = useState<Store[]>([])

  // Dark mode
  useEffect(() => {
    const saved = localStorage.getItem('campiran_theme')
    const isDark = saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)
    setDark(isDark)
    document.documentElement.classList.toggle('dark', isDark)
  }, [])

  function toggleDark() {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('campiran_theme', next ? 'dark' : 'light')
  }

  // Load stores for ADMIN and auto-select default if none selected
  useEffect(() => {
    if (profile.role !== 'ADMIN') return
    supabase
      .from('stores')
      .select('*')
      .eq('status', 'A')
      .order('description')
      .then(({ data }) => {
        if (data && data.length > 0) {
          setStores(data as Store[])
          if (!currentStore) {
            setStore(data[0] as Store)
          }
        }
      })
  }, [profile.role, supabase, currentStore, setStore])

  // For non-admin roles: set store from profile or fallback to first store
  useEffect(() => {
    if (profile.role === 'ADMIN' || currentStore) return

    if (profile.id_store) {
      supabase
        .from('stores')
        .select('*')
        .eq('id_store', profile.id_store)
        .single()
        .then(({ data }) => { if (data) setStore(data as Store) })
    } else {
      supabase
        .from('stores')
        .select('*')
        .eq('status', 'A')
        .order('description')
        .limit(1)
        .then(({ data }) => { if (data && data[0]) setStore(data[0] as Store) })
    }
  }, [profile, currentStore, supabase, setStore])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  function handleSelectStore(store: Store) {
    setStore(store)
    setStoreMenuOpen(false)
    toast.success(`Sucursal cambiada a: ${store.description}`)
  }

  return (
    <header className="h-16 flex items-center px-4 gap-3 glass border-b border-[var(--border)] sticky top-0 z-30">
      {/* Mobile menu button */}
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2 rounded-xl btn-ghost"
        aria-label="Abrir menú"
      >
        <Menu size={20} />
      </button>

      {/* Logo (Visible ONLY on mobile, desktop sidebar already displays it) */}
      <div className="lg:hidden flex items-center gap-2.5 mr-2">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
          <span className="text-white font-bold text-sm">C</span>
        </div>
        <span className="font-bold text-base text-[var(--foreground)]">
          Campiran
        </span>
      </div>

      {/* Store selector (ADMIN only) */}
      {profile.role === 'ADMIN' && (
        <div className="relative">
          <button
            onClick={() => setStoreMenuOpen((p) => !p)}
            className={cn(
              'flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl text-sm font-medium',
              'glass transition-all hover:border-emerald-500/40 hover:bg-emerald-500/5',
              !storeId ? 'text-amber-500 border-amber-500/40' : 'text-foreground'
            )}
          >
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <StoreIcon size={15} className="text-emerald-500" />
            <span className="max-w-[180px] truncate font-medium">
              {currentStore?.description ?? 'Seleccionar sucursal'}
            </span>
            <ChevronDown size={14} className={cn('text-muted-foreground transition-transform duration-200', storeMenuOpen && 'rotate-180')} />
          </button>

          <AnimatePresence>
            {storeMenuOpen && (
              <motion.div
                className="absolute top-full left-0 mt-2 w-60 glass-card p-1.5 z-50 shadow-2xl"
                initial={{ opacity: 0, y: -8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.97 }}
                transition={{ duration: 0.15 }}
              >
                <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Sucursales disponibles
                </div>
                {stores.map((store) => (
                  <button
                    key={store.id_store}
                    onClick={() => handleSelectStore(store)}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all',
                      'sidebar-nav-item',
                      storeId === store.id_store && 'active font-semibold text-emerald-400'
                    )}
                  >
                    <StoreIcon size={14} className={storeId === store.id_store ? 'text-emerald-400' : 'text-muted-foreground'} />
                    <span className="flex-1 text-left truncate">{store.description}</span>
                    {storeId === store.id_store && <Check size={14} className="text-emerald-400" />}
                  </button>
                ))}
                {stores.length === 0 && (
                  <p className="text-xs text-[var(--muted)] px-3 py-2">No hay tiendas activas</p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Non-admin: show current store name */}
      {profile.role !== 'ADMIN' && currentStore && (
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl glass text-sm">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <StoreIcon size={14} className="text-emerald-500" />
          <span className="font-medium text-foreground">{currentStore.description}</span>
        </div>
      )}

      <div className="ml-auto flex items-center gap-2">
        {/* Dark mode toggle */}
        <button
          onClick={toggleDark}
          className="p-2 rounded-xl btn-ghost"
          aria-label="Cambiar tema"
        >
          {dark ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => setUserMenuOpen((p) => !p)}
            className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-xl btn-ghost"
          >
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400 to-indigo-500 flex items-center justify-center text-white text-xs font-semibold">
              {getInitials(profile.full_name)}
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-sm font-medium text-[var(--foreground)] leading-none">
                {profile.full_name ?? 'Usuario'}
              </p>
              <p className="text-xs text-[var(--muted)] leading-none mt-0.5">
                {getRoleLabel(profile.role)}
              </p>
            </div>
            <ChevronDown size={14} className={cn('text-[var(--muted)] transition-transform', userMenuOpen && 'rotate-180')} />
          </button>

          <AnimatePresence>
            {userMenuOpen && (
              <motion.div
                className="absolute right-0 top-full mt-2 w-52 glass-card p-1 z-50"
                initial={{ opacity: 0, y: -8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.97 }}
                transition={{ duration: 0.15 }}
              >
                <button className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm sidebar-nav-item">
                  <User size={15} />
                  Mi perfil
                </button>
                <div className="my-1 border-t border-[var(--border)]" />
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-red-500 hover:bg-red-500/10 transition-colors"
                >
                  <LogOut size={15} />
                  Cerrar sesión
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  )
}
