# Willwin v11

Booking + admin SPA for a Montréal nail salon. Next.js 16 app, Supabase
for storage, n8n for the public booking webhooks, Vercel for hosting.

- `/book` — public client booking flow (3 steps + details), EN/FR.
- `/login` — single shared `ADMIN_PASSWORD`, sets a cookie.
- `/` — admin calendar.
- `/clients`, `/clients/[id]` — customer directory + profiles.
- `/settings` — services, team, hours.
- `/reports` — revenue & analytics.

## Stack

| Layer        | Tech                              |
| ------------ | --------------------------------- |
| App          | Next.js 16 (App Router, Turbopack) |
| UI           | Tailwind 4, shadcn-ui              |
| DB           | Supabase (Postgres + RLS)         |
| Public flow  | n8n webhooks (see `n8n/README.md`) |
| Hosting      | Vercel                             |
| Optional     | Google Sheets ledger sync         |

Timezone for all human-facing times is **America/Toronto / Montréal**.
The schema stores `start_at` as TEXT (`"YYYY-MM-DD HH:mm:ss"`) and the
app never calls `new Date()` on it — see [`AGENTS.md`](./AGENTS.md) and
[`CLAUDE.md`](./CLAUDE.md) for the rules.

## Quickstart (local)

```bash
git clone https://github.com/asap-blip/willwin-v11.git
cd willwin-v11
npm install
cp .env.example .env.local   # then edit the values
npm run dev
```

Open <http://localhost:3000>. You will be redirected to `/login` —
enter the password from `.env.local`.

The public booking flow lives at <http://localhost:3000/book> and does
not require a login.

## First-launch checklist

1. **Supabase**
   - Create a new project at <https://supabase.com/dashboard>.
   - In SQL editor, run [`sql/000_initial_schema.sql`](./sql/000_initial_schema.sql).
   - Run [`sql/001_rls_policies.sql`](./sql/001_rls_policies.sql).
   - (Optional) Add seed data with `npx tsx src/lib/seed.ts` — needs
     env vars set.
   - Copy the Project URL and `anon` key into Vercel as
     `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

2. **n8n**
   - Spin up an n8n instance (self-hosted or cloud).
   - Import the four workflows from [`n8n/`](./n8n/) (Workflows →
     Import from File: `init.json`, `availability.json`, `create.json`,
     `get.json`).
   - Open each one, attach your Supabase credential (service role key
     — not anon), wire the placeholder Code nodes to real Supabase
     queries following the rules in [`n8n/README.md`](./n8n/README.md),
     and activate.
   - Set `NEXT_PUBLIC_N8N_BASE_URL` in Vercel to the base URL of the
     n8n instance (no trailing slash).

3. **Vercel**
   - Import the GitHub repo.
   - Set the env vars listed below. All four are required for build to
     succeed.
   - The build command is `next build` (no override needed) and the
     project is already configured in [`vercel.json`](./vercel.json).
   - Deploy.

## Environment variables

See [`.env.example`](./.env.example) for the full list.

| Variable                          | Required | Used by                          |
| --------------------------------- | -------- | -------------------------------- |
| `ADMIN_PASSWORD`                  | yes      | `/api/auth/login`                |
| `NEXT_PUBLIC_SUPABASE_URL`        | yes      | admin SPA Supabase client        |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`   | yes      | admin SPA Supabase client        |
| `NEXT_PUBLIC_N8N_BASE_URL`        | yes      | `/book` and `/book/confirmation` |
| `NEXT_PUBLIC_SITE_URL`            | no       | logout redirect target           |
| `GOOGLE_SHEET_ID`                 | no       | ledger sync                      |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL`    | no       | ledger sync                      |
| `GOOGLE_PRIVATE_KEY`              | no       | ledger sync                      |

Without `NEXT_PUBLIC_N8N_BASE_URL` set, the `/book` page renders the
"Service temporarily unavailable" screen instead of crashing.

## Booking status lifecycle

`PENDING → CONFIRMED → ARRIVED`. `CANCELLED` is terminal and frees the
slot. `VISIT_SPEND` loyalty events fire only when status moves to
`ARRIVED`. `PENDING` is the default on create. See `CLAUDE.md`.

## Database layout

The complete schema is in [`sql/000_initial_schema.sql`](./sql/000_initial_schema.sql).
Highlights:

- `customers`, `team_members`, `services` — reference data.
- `bookings` — one row per appointment; `start_at` is TEXT.
- `appointment_segments` — one row per (booking × tech × service).
- `business_hours`, `tech_availability` — slot generation inputs.
- `loyalty_events` — append-only ledger; aggregates live on `customers`.
- `tenant_features` — single-row feature flags.
- `admin_login_log` — append-only audit trail.

## Scripts

| Command          | What it does                            |
| ---------------- | --------------------------------------- |
| `npm run dev`    | Next.js dev server                      |
| `npm run build`  | Production build                        |
| `npm start`      | Serve the production build              |
| `npm run lint`   | ESLint                                  |

## Repo layout

```
src/
  app/                  # Next.js app router pages
    api/auth/           # login / logout
    book/               # public booking flow
    clients/, settings/, reports/  # admin pages
  components/           # React components
  lib/                  # Supabase client, n8n client, helpers
  types/booking.ts      # wire types for the n8n webhooks
sql/
  000_initial_schema.sql
  001_rls_policies.sql
  add_booking_id_to_loyalty_events.sql  # follow-up patch
n8n/
  README.md             # webhook contracts
  {init,availability,create,get}.json   # importable starter workflows
```
