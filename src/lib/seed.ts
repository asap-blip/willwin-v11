import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Get today's date as YYYY-MM-DD string
const now = new Date()
const yyyy = now.getFullYear()
const mm = String(now.getMonth() + 1).padStart(2, '0')
const dd = String(now.getDate()).padStart(2, '0')
const today = `${yyyy}-${mm}-${dd}`

async function seed() {
  console.log('Seeding database...')

  // Clean existing data (order matters for FK constraints)
  await supabase.from('appointment_segments').delete().neq('id', '')
  await supabase.from('bookings').delete().neq('id', '')
  await supabase.from('customers').delete().neq('id', '')
  await supabase.from('services').delete().neq('id', '')
  await supabase.from('team_members').delete().neq('id', '')

  // Team members
  const { data: teamMembers, error: tmError } = await supabase
    .from('team_members')
    .insert([
      { name: 'Marie', color: '#8B5CF6', avatar_url: null, is_active: true },
      { name: 'Sophie', color: '#EC4899', avatar_url: null, is_active: true },
      { name: 'Camille', color: '#F59E0B', avatar_url: null, is_active: true },
    ])
    .select()

  if (tmError) { console.error('team_members error:', tmError); return }
  console.log('Inserted team members:', teamMembers!.length)

  // Services
  const { data: services, error: svcError } = await supabase
    .from('services')
    .insert([
      { name: 'Classic Manicure', duration_minutes: 30, price: 35, is_active: true },
      { name: 'Gel Full Set', duration_minutes: 60, price: 65, is_active: true },
      { name: 'Pedicure Deluxe', duration_minutes: 90, price: 85, is_active: true },
    ])
    .select()

  if (svcError) { console.error('services error:', svcError); return }
  console.log('Inserted services:', services!.length)

  // Customers — alert column must exist in Supabase (TEXT, nullable)
  const { data: customers, error: custError } = await supabase
    .from('customers')
    .insert([
      { first_name: 'Isabelle', last_name: 'Tremblay', phone: '514-555-0101', email: 'isabelle@example.com', notes: 'Prefers gel over acrylic', alert: 'Allergic to acetone-based removers' },
      { first_name: 'Nathalie', last_name: 'Gagnon', phone: '514-555-0202', email: 'nathalie@example.com', notes: null, alert: null },
    ])
    .select()

  if (custError) { console.error('customers error:', custError); return }
  console.log('Inserted customers:', customers!.length)

  const [marie, sophie, camille] = teamMembers!
  const [manicure, gelSet, pedicure] = services!
  const [isabelle, nathalie] = customers!

  // Bookings — 4 spread across today
  const { data: bookings, error: bkError } = await supabase
    .from('bookings')
    .insert([
      { customer_id: isabelle.id, start_at: `${today}T09:30:00`, status: 'CONFIRMED', notes: null },
      { customer_id: nathalie.id, start_at: `${today}T10:00:00`, status: 'ARRIVED', notes: 'Prefers neutral colors' },
      { customer_id: isabelle.id, start_at: `${today}T13:00:00`, status: 'CONFIRMED', notes: null },
      { customer_id: nathalie.id, start_at: `${today}T14:30:00`, status: 'LATE', notes: 'Running 10 min late' },
    ])
    .select()

  if (bkError) { console.error('bookings error:', bkError); return }
  console.log('Inserted bookings:', bookings!.length)

  const [bk1, bk2, bk3, bk4] = bookings!

  // Appointment segments
  const { error: segError } = await supabase
    .from('appointment_segments')
    .insert([
      { booking_id: bk1.id, team_member_id: marie.id, service_id: manicure.id, duration_minutes: 30 },
      { booking_id: bk2.id, team_member_id: sophie.id, service_id: gelSet.id, duration_minutes: 60 },
      { booking_id: bk3.id, team_member_id: camille.id, service_id: pedicure.id, duration_minutes: 90 },
      { booking_id: bk4.id, team_member_id: marie.id, service_id: gelSet.id, duration_minutes: 60 },
    ])

  if (segError) { console.error('appointment_segments error:', segError); return }
  console.log('Inserted appointment segments: 4')

  console.log('Seed complete!')
}

seed()
