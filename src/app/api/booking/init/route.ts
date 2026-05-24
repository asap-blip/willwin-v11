import { NextResponse } from 'next/server'
import { bookingInitServer } from '@/lib/booking-init-server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST() {
  return handle()
}

export async function GET() {
  return handle()
}

async function handle() {
  try {
    const data = await bookingInitServer()
    return NextResponse.json(data)
  } catch (err) {
    console.error('[api/booking/init] failed', err)
    return NextResponse.json(
      { __error: 'init_failed', message: (err as Error).message },
      { status: 500 },
    )
  }
}
