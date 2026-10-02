'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { type Store } from '@/lib/types'

interface StoreContextValue {
  currentStore: Store | null
  setStore: (store: Store) => void
  clearStore: () => void
  storeId: string | null
}

const STORAGE_KEY = 'campiran_current_store'

const StoreContext = createContext<StoreContextValue | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [currentStore, setCurrentStore] = useState<Store | null>(null)

  // Hydrate from sessionStorage on mount
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY)
      if (saved) {
        setCurrentStore(JSON.parse(saved) as Store)
      }
    } catch {
      // ignore parse errors
    }
  }, [])

  function setStore(store: Store) {
    setCurrentStore(store)
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store))
    } catch {
      // ignore storage errors
    }
  }

  function clearStore() {
    setCurrentStore(null)
    try {
      sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
  }

  return (
    <StoreContext.Provider
      value={{
        currentStore,
        setStore,
        clearStore,
        storeId: currentStore?.id_store ?? null,
      }}
    >
      {children}
    </StoreContext.Provider>
  )
}

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore debe usarse dentro de <StoreProvider>')
  return ctx
}
