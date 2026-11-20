'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { createClient } from '@/utils/supabase/client'
import { type CompanySettings } from '@/lib/types'

interface CompanyContextValue {
  logoUrl: string | null
  tradeName: string
  cardCommissionPct: number
  setLogoUrl: (url: string | null) => void
  setTradeName: (name: string) => void
  setCardCommissionPct: (pct: number) => void
}

const CompanyContext = createContext<CompanyContextValue | null>(null)

export function CompanyProvider({
  children,
  initialLogoUrl = null,
  initialTradeName = 'Campiran',
  initialCardCommissionPct = 4,
}: {
  children: ReactNode
  initialLogoUrl?: string | null
  initialTradeName?: string
  initialCardCommissionPct?: number
}) {
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl)
  const [tradeName, setTradeName] = useState<string>(initialTradeName)
  const [cardCommissionPct, setCardCommissionPct] = useState<number>(initialCardCommissionPct)
  const supabase = createClient()

  // Fetch on mount and subscribe to Realtime
  useEffect(() => {
    supabase
      .from('company_settings')
      .select('logo_url, trade_name, card_commission_pct')
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          if (data.logo_url !== undefined) setLogoUrl(data.logo_url)
          if (data.trade_name) setTradeName(data.trade_name)
          if (data.card_commission_pct !== null && data.card_commission_pct !== undefined) {
            setCardCommissionPct(Number(data.card_commission_pct))
          }
        }
      })

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
            if (updated.card_commission_pct !== undefined && updated.card_commission_pct !== null) {
              setCardCommissionPct(Number(updated.card_commission_pct))
            }
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase])

  return (
    <CompanyContext.Provider
      value={{
        logoUrl,
        tradeName,
        cardCommissionPct,
        setLogoUrl,
        setTradeName,
        setCardCommissionPct,
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
      cardCommissionPct: 4,
      setLogoUrl: () => {},
      setTradeName: () => {},
      setCardCommissionPct: () => {},
    }
  }
  return ctx
}
