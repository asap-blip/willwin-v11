// T04.5 — Client-side wrapper for the ledger sync API.
//
// The actual google-sheets work happens in src/lib/ledger-sync.ts (Node only,
// imported by the API route). Client components must NEVER import that file
// directly — googleapis won't bundle for the browser. Use this helper
// instead. It is intentionally fire-and-forget: the returned promise resolves
// once the queue request is acked, but you should call it without awaiting:
//
//   syncCustomerToLedger(customerData).catch(console.error)

export interface LedgerCustomerInput {
  id: string
  first_name: string
  last_name: string
  phone: string
  email?: string | null
  language?: string | null
  loyalty_tier?: string | null
  loyalty_points?: number | null
}

export async function syncCustomerToLedger(customer: LedgerCustomerInput): Promise<void> {
  await fetch('/api/ledger/sync-customer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(customer),
  })
}
