import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET() {
  const cookieStore = await cookies()
  cookieStore.delete('willwin_session')
  return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'))
}

export async function POST() {
  const cookieStore = await cookies()
  cookieStore.delete('willwin_session')
  return NextResponse.json({ success: true })
}
