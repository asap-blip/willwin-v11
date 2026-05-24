import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow login page and auth API routes through
  if (pathname === '/login' || pathname.startsWith('/api/auth/')) {
    return NextResponse.next()
  }

  // T13 — public client booking flow. /book and /book/* are intentionally
  // unauthenticated so customers can book from a phone without an account.
  if (pathname === '/book' || pathname.startsWith('/book/')) {
    return NextResponse.next()
  }

  // Public booking API endpoints called by the booking flow (both from the
  // server-side RSC fetch and the browser client). Must be reachable without
  // an admin session, otherwise the RSC fetch receives the /login HTML and
  // surfaces as "invalid JSON".
  if (pathname.startsWith('/api/booking/')) {
    return NextResponse.next()
  }

  // Check for session cookie
  const session = request.cookies.get('willwin_session')

  if (session?.value !== 'authenticated') {
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    // Match all routes except static files and Next.js internals
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
