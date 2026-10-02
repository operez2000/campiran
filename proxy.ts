import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getAuthenticatedProfile } from '@/lib/auth-profile'

// Route prefixes each role is allowed to access
const ROLE_ALLOWED_PREFIXES: Record<string, string[]> = {
  ADMIN: ['/pos', '/inventario', '/catalogo', '/clientes', '/proveedores', '/reportes', '/admin'],
  MANAGER: ['/pos', '/inventario', '/catalogo', '/clientes', '/proveedores', '/reportes'],
  CASHIER: ['/pos', '/clientes'],
  ALMACENISTA: ['/inventario', '/catalogo'],
  PENDING: ['/pending'],
}

// Role → default dashboard redirect
const ROLE_DASHBOARD: Record<string, string> = {
  ADMIN: '/reportes',
  MANAGER: '/reportes',
  CASHIER: '/pos',
  ALMACENISTA: '/inventario',
  PENDING: '/pending',
}

const PUBLIC_PATHS = [
  '/login',
  '/signup',
  '/forgot-password',
  '/auth',
  '/pending',
]

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 1. Skip API routes and static assets
  if (pathname.startsWith('/api/')) return NextResponse.next()

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session
  const { data: { user } } = await supabase.auth.getUser()

  // 2. Public paths — allow without session
  if (isPublicPath(pathname)) {
    // If already authenticated, redirect to role dashboard
    if (user && pathname !== '/pending' && !pathname.startsWith('/auth')) {
      return NextResponse.redirect(new URL('/', request.url))
    }
    return response
  }

  // 3. No session → redirect to login
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // 4. Resolve authenticated profile
  const profile = await getAuthenticatedProfile(supabase, user)

  // 5. Inactive user → pending
  if (profile.status === 'inactive') {
    return NextResponse.redirect(new URL('/pending', request.url))
  }

  const role = profile.role || 'PENDING'

  // 6. No role assigned → pending
  if (role === 'PENDING' || profile.status === 'pending') {
    if (pathname !== '/pending') {
      return NextResponse.redirect(new URL('/pending', request.url))
    }
    return response
  }

  // 7. Root path → redirect to role dashboard
  if (pathname === '/') {
    return NextResponse.redirect(new URL(ROLE_DASHBOARD[role] ?? '/pos', request.url))
  }

  // 8. Check route permission
  const allowedPrefixes = ROLE_ALLOWED_PREFIXES[role] ?? []
  const hasAccess = allowedPrefixes.some((prefix) =>
    pathname === prefix || pathname.startsWith(prefix + '/')
  )

  if (!hasAccess) {
    return NextResponse.redirect(new URL(ROLE_DASHBOARD[role] ?? '/pos', request.url))
  }

  // 9. Allow access
  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
