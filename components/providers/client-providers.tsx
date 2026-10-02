'use client'

import { StoreProvider } from '@/components/providers/store-provider'
import { UserStatusGuard } from '@/components/providers/user-status-guard'
import { Toaster } from 'sonner'
import { type ReactNode } from 'react'

export function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <StoreProvider>
      <UserStatusGuard />
      {children}
      <Toaster
        richColors
        position="top-right"
        toastOptions={{
          style: {
            background: 'var(--card)',
            border: '1px solid var(--border)',
            backdropFilter: 'blur(20px)',
          },
        }}
      />
    </StoreProvider>
  )
}
