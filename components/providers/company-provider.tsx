'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { createClient } from '@/utils/supabase/client'
import { type CompanySettings } from '@/lib/types'

interface CompanyContextValue {
  logoUrl: string | null
  tradeName: string
  setLogoUrl: (url: string | null) => void
  setTradeName: (name: string) => void
}

const CompanyContext = createContext<CompanyContextValue | null>(null)

export function CompanyProvider({
  children,
  initialLogoUrl = null,
  initialTradeName = 'Campiran',
}: {
  children: ReactNode
  initialLogoUrl?: string | null
  initialTradeName?: string
}) {
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl)
  const [tradeName, setTradeName] = useState<string>(initialTradeName)
  const supabase = createClient()

  // Fetch on mount if initial is missing, and subscribe to Realtime
  useEffect(() => {
    if (!initialLogoUrl) {
      supabase
        .from('company_settings')
        .select('logo_url, trade_name')
        .limit(1)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            if (data.logo_url !== undefined) setLogoUrl(data.logo_url)
            if (data.trade_name) setTradeName(data.trade_name)
          }
        })
    }

    const channel = supabase
      .channel('company-settings-global-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'company_settings' },
        (payload) => {
          if (payload.new) {
            const updated = payload.new as Partial<CompanySettings>
            if (updated.logo_url !== undefined) {
              setLogoUrl(updated.logo_url ?? null)
            }
            if (updated.trade_name !== undefined && updated.trade_name) {
              setTradeName(updated.trade_name)
            }
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, initialLogoUrl])

  return (
    <CompanyContext.Provider
      value={{
        logoUrl,
        tradeName,
        setLogoUrl,
        setTradeName,
      }}
    >
      {children}
    </CompanyContext.Provider>
  )
}

export function useCompany(): CompanyContextValue {
  const ctx = useContext(CompanyContext)
  if (!ctx) {
    return {
      logoUrl: null,
      tradeName: 'Campiran',
      setLogoUrl: () => {},
      setTradeName: () => {},
    }
  }
  return ctx
}
