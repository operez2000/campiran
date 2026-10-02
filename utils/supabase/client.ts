import { createBrowserClient } from '@supabase/ssr'

// Shims for crypto in non-secure contexts (LAN/HTTP dev)
if (typeof window !== 'undefined') {
  if (!window.crypto) {
    // @ts-expect-error shim
    window.crypto = {}
  }
  if (!window.crypto.randomUUID) {
    window.crypto.randomUUID = () => {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        const v = c === 'x' ? r : (r & 0x3) | 0x8
        return v.toString(16)
      }) as `${string}-${string}-${string}-${string}-${string}`
    }
  }
}

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
