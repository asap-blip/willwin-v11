# n8n workflows

The public `/book` flow in the Next.js app calls four n8n webhooks. The
admin app talks directly to Supabase, so the only n8n surface for the
public is what's documented here.

Set `NEXT_PUBLIC_N8N_BASE_URL` to your n8n instance (e.g.
`https://n8n.yourdomain.com`) without trailing slash. The app appends
`/webhook/<path>` automatically.

In n8n itself, **use the Supabase service role key**, not the anon key.
The RLS policies in `sql/001_rls_policies.sql` are written on the
assumption that mutating traffic from n8n bypasses RLS.

## Wire contracts

The TypeScript request/response shapes live in
[`src/types/booking.ts`](../src/types/booking.ts). Match those exactly —
the client throws `WillwinApiError` on any envelope it cannot parse.

### 1. `willwin/booking/init` — POST

Returns reference data needed to render the booking flow.

**Request:** `{}`

**Response:**

```json
{
  "services": [{
    "id": "uuid",
    "name": "Classic Manicure",
    "name_en": "Classic Manicure",
    "price": 35,
    "duration_minutes": 30,
    "is_active": true
  }],
  "team_members": [{
    "id": "uuid",
    "name": "Marie",
    "color": "#8B5CF6",
    "is_active": true
  }],
  "business_hours": [{
    "day_of_week": 2,
    "is_open": true,
    "open_time": "09:00",
    "close_time": "20:00"
  }],
  "tech_availability": [{
    "team_member_id": "uuid",
    "day_of_week": 2
  }]
}
```

Filter `services` and `team_members` to `is_active = true`.

### 2. `willwin/booking/availability` — POST

Returns the open `HH:mm` slots for a given date / tech / service. n8n is
authoritative for slot generation, conflict detection, and business
hours math.

**Request:**

```json
{
  "date": "2026-06-12",
  "team_member_id": "uuid-or-null",
  "service_id": "uuid",
  "duration_minutes": 60
}
```

**Response:**

```json
{
  "is_open": true,
  "open_time": "09:00",
  "close_time": "20:00",
  "tech_works_today": true,
  "available_slots": ["09:00", "09:30", "..."]
}
```

Slot generation rules:

- Read `business_hours` for `day_of_week = getDayOfWeek(date)`. If
  `is_open = false`, return `is_open: false` with `available_slots: []`.
- A slot is valid when `slot_start + duration_minutes <= close_time`.
- Slot stride is 30 minutes.
- For a specific tech: only return slots when no existing
  appointment_segments for that tech overlap.
- For `team_member_id = null` ("no preference"): return slots where at
  least one active tech who works that day is free.
- Exclude bookings with `status = 'CANCELLED'`.

### 3. `willwin/booking/create` — POST

Creates customer (if new) + booking + segment in a single transaction.

**Request:**

```json
{
  "service_id": "uuid",
  "team_member_id": "uuid-or-null",
  "date": "2026-06-12",
  "time": "10:30",
  "duration_minutes": 60,
  "first_name": "Marie",
  "last_name": "Tremblay",
  "phone": "514-555-0101",
  "email": null,
  "note": null,
  "language": "en"
}
```

**Response:**

```json
{
  "booking_id": "uuid",
  "status": "PENDING",
  "resolved_tech_id": "uuid"
}
```

Steps:

1. Find-or-create customer by `(phone)`. Use `language` if creating.
2. If `team_member_id` is null, pick a tech who is available at that
   time. Return `{ "__error": "no_tech_available" }` if none.
3. Re-check conflict for `(team_member, date, time, duration)`. Return
   `{ "__error": "slot_taken" }` on conflict.
4. Insert into `bookings` with `status = 'PENDING'`, `source = 'client'`,
   `start_at = "YYYY-MM-DD HH:mm:00"` (space separator, see CLAUDE.md).
5. Insert into `appointment_segments`.
6. Optional: send SMS confirmation request to the customer.

### 4. `willwin/booking/get` — POST

Used by the confirmation page. Returns the public-safe view of one
booking.

**Request:** `{ "id": "uuid" }`

**Response:**

```json
{
  "booking_id": "uuid",
  "first_name": "Marie",
  "service_name": "Classic Manicure",
  "tech_name": "Marie",
  "date": "2026-06-12",
  "time": "10:30"
}
```

Slice `start_at` to extract `date` and `time` — do not call `new Date()`.

## Error envelope

Any webhook can return `{ "__error": "<code>", "message"?: "<text>" }`
with HTTP 200. The client maps known codes:

| Code              | UI message                                |
| ----------------- | ----------------------------------------- |
| no_tech_available | "No tech available at this time."         |
| (any other code)  | "Something went wrong. Please try again." |

Non-200 responses bubble up as generic HTTP errors.

## Importable templates

The four files in this directory are starter workflows you can import
into n8n via **Workflows → Import from File**. Each one is wired with
the right webhook path, response node, and a Supabase node placeholder.
You will need to:

1. Open each workflow and reconnect the Supabase credential.
2. Replace the placeholder query with the real SQL or table operations.
3. Activate the workflow.

See the per-file comments in `init.json`, `availability.json`,
`create.json`, `get.json`.

## Optional reminder / no-show workflows

These are not called by the app — they run on schedule. Sketches:

- **24h reminder**: cron `0 9 * * *`, query
  `bookings where start_at::date = current_date + 1 and status = 'CONFIRMED'`,
  send SMS, log a `loyalty_event` row of type `REMINDER_SENT` if desired.
- **No-show sweep**: cron every 10 min, find bookings whose
  `start_at + duration` is in the past and `status in ('PENDING','CONFIRMED')`,
  set `status = 'NO SHOW'`. The app's loyalty hook penalises automatically
  on the next admin status edit; if you want it instant, also insert a
  `NO_SHOW_PENALTY` loyalty_events row from n8n.
- **Cancellation / staff alert**: trigger on a Supabase webhook for
  `bookings` updates where `new.status = 'CANCELLED'`, send Slack /
  SMS / email to the affected tech.
