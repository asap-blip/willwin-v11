import { NextResponse } from 'next/server'
import { syncCustomerToLedger, type LedgerCustomer } from '@/lib/ledger-sync'

// T04.5 — fire-and-forget ledger sync endpoint. The client posts the
// customer payload here and we run the actual google-sheets upsert in the
// background. The endpoint always returns 200 immediately so the client
// fetch can be discarded with .catch(console.error).

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<LedgerCustomer>
    if (!body || typeof body.id !== 'string' || !body.id) {
      return NextResponse.json({ error: 'missing customer id' }, { status: 400 })
    }
    // Kick off the sync but don't await — we want this endpoint to return
    // fast so the calling UI never blocks on a slow Sheets API call.
    void syncCustomerToLedger({
      id: body.id,
      first_name: body.first_name ?? '',
      last_name: body.last_name ?? '',
      phone: body.phone ?? '',
      email: body.email ?? null,
      language: body.language ?? null,
      loyalty_tier: body.loyalty_tier ?? null,
      loyalty_points: body.loyalty_points ?? null,
    }).catch((err) => console.error('[ledger-sync route] background failure', err))

    return NextResponse.json({ queued: true })
  } catch (err) {
    console.error('[ledger-sync route] threw', err)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
