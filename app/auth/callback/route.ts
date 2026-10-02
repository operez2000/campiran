import { createClient } from '@/utils/supabase/server'
import { getAuthenticatedProfile } from '@/lib/auth-profile'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  // Resolve origin robustly (handles reverse proxy and custom host/port)
  const forwardedHost = request.headers.get('x-forwarded-host')
  const host = forwardedHost || request.headers.get('host') || 'localhost:3000'
  const protocol = request.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https')
  const origin = `${protocol}://${host}`

  if (code) {
    const supabase = await createClient()
    const { data: { session }, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && session?.user) {
      // Ensure profile is resolved and ready
      await getAuthenticatedProfile(supabase, session.user)
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // If code exchange failed
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
