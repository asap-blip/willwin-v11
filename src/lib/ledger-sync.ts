// T04.5 — Customer ledger sync to Google Sheets
//
// Server-only. Uses `googleapis`, which depends on Node.js APIs and will
// fail to bundle for the browser. Import this from API routes / server
// components only. Client components must POST to /api/ledger/sync-customer
// (see src/lib/ledger-sync-client.ts).

import { google } from 'googleapis'

export interface LedgerCustomer {
  id: string
  first_name: string
  last_name: string
  phone: string
  email?: string | null
  language?: string | null
  loyalty_tier?: string | null
  loyalty_points?: number | null
}

const SHEET_NAME = 'Sheet1'

const HEADER_ROW = [
  'customer_id',
  'first_name',
  'last_name',
  'phone',
  'email',
  'language',
  'loyalty_tier',
  'loyalty_points',
  'synced_at',
]

// Build a YYYY-MM-DD HH:MM timestamp using the same convention as the rest
// of the system. Server-side timestamp only — never used for display.
function nowStamp(): string {
  return new Date().toISOString().slice(0, 16).replace('T', ' ')
}

function buildAuth() {
  // The private key is stored with literal `\n` chars in Vercel — must be
  // converted back to real newlines or the JWT signer fails silently.
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (!privateKey || !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) {
    throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY')
  }
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: privateKey,
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

function rowFor(customer: LedgerCustomer): (string | number)[] {
  return [
    customer.id,
    customer.first_name ?? '',
    customer.last_name ?? '',
    customer.phone ?? '',
    customer.email ?? '',
    customer.language ?? '',
    customer.loyalty_tier ?? '',
    customer.loyalty_points ?? 0,
    nowStamp(),
  ]
}

/**
 * Fire-and-forget upsert of a customer to the ledger Sheet.
 *
 * - Reads column A to find an existing row by customer_id
 * - Found → updates that row in place with the latest values
 * - Not found → appends a new row at the bottom
 * - Writes the header row first if the sheet is empty
 *
 * Never throws — all errors are caught and console.error'd so the
 * caller (typically a UI flow) cannot fail because of this sync.
 */
export async function syncCustomerToLedger(customer: LedgerCustomer): Promise<void> {
  try {
    const sheetId = process.env.GOOGLE_SHEET_ID
    if (!sheetId) throw new Error('Missing GOOGLE_SHEET_ID')

    const auth = buildAuth()
    const sheets = google.sheets({ version: 'v4', auth })

    // 1. Read column A (all rows) to find the existing row index
    const colA = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${SHEET_NAME}!A:A`,
    })
    const rows = colA.data.values ?? []

    // 2. If sheet is empty, write the header row first
    if (rows.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `${SHEET_NAME}!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [HEADER_ROW] },
      })
    }

    // 3. Find an existing row index (1-based; row 1 is the header)
    //    The colA result is the source of truth — recompute after a possible
    //    header insert above so the index math stays consistent.
    let foundRowIndex = -1
    for (let i = 1; i < rows.length; i++) {
      if (rows[i]?.[0] === customer.id) {
        foundRowIndex = i + 1 // convert 0-based array idx to 1-based sheet row
        break
      }
    }

    const values = [rowFor(customer)]

    if (foundRowIndex > 0) {
      // 4a. Update in place
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `${SHEET_NAME}!A${foundRowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values },
      })
    } else {
      // 4b. Append a new row at the bottom
      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: `${SHEET_NAME}!A:I`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values },
      })
    }
  } catch (err) {
    console.error('[ledger-sync] sync failed', err)
  }
}
