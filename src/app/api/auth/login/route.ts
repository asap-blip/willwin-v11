import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(request: Request) {
  const body = await request.json()
  const { password } = body as { password: string }

  if (password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const cookieStore = await cookies()
  cookieStore.set({
    name: 'willwin_session',
    value: 'authenticated',
    httpOnly: true,
    path: '/',
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  })

  // T16 — fire-and-forget audit log of successful logins. Wrong-password
  // attempts above return early and never reach this point.
  //
  // logged_in_at is TEXT in 'YYYY-MM-DD HH:MM'. This is the ONE place
  // in the codebase where new Date() is acceptable: a server-side
  // timestamp captured at the moment of login, never used for display
  // or start_at construction.
  try {
    const xff = request.headers.get('x-forwarded-for') ?? ''
    // x-forwarded-for can be a comma-separated chain — first entry is the client
    const ipFromHeader = xff.split(',')[0]?.trim() || ''
    const ip = ipFromHeader || 'unknown'
    const userAgent = request.headers.get('user-agent') ?? 'unknown'
    const loggedInAt = new Date().toISOString().slice(0, 16).replace('T', ' ')

    // Intentionally NOT awaited — login response must not block on this.
    // Errors are caught + logged so they cannot break the login flow.
    void supabase
      .from('admin_login_log')
      .insert({
        logged_in_at: loggedInAt,
        ip_address: ip,
        user_agent: userAgent,
      })
      .then(({ error }) => {
        if (error) console.error('[admin_login_log] insert failed', error)
      })
  } catch (err) {
    console.error('[admin_login_log] threw before insert', err)
  }

  return NextResponse.json({ success: true })
}
