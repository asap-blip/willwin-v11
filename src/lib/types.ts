export interface TeamMember {
  id: string
  name: string
  color: string
  avatar_url: string | null
  is_active: boolean
}

export interface Service {
  id: string
  name: string
  duration_minutes: number
  price: number
  is_active: boolean
}

export interface Customer {
  id: string
  first_name: string
  last_name: string
  phone: string | null
  email: string | null
  notes: string | null
  alert: string | null
  birthday: string | null
  referred_by: string | null
  preferred_tech_id: string | null
}

export interface Booking {
  id: string
  customer_id: string
  start_at: string // TEXT — always sliced as string
  status: string
  notes: string | null
}

export interface AppointmentSegment {
  id: string
  booking_id: string
  team_member_id: string
  service_id: string
  duration_minutes: number
}

export interface BookingDetail {
  booking_id: string
  segment_id: string
  customer_id: string
  customer_first_name: string
  customer_last_name: string
  customer_phone: string | null
  customer_alert: string | null
  customer_notes: string | null
  team_member_id: string
  service_id: string
  service_name: string
  service_price: number
  duration_minutes: number
  start_at: string
  status: string
  notes: string | null
}

export interface CalendarBooking {
  id: string
  start_at: string
  status: string
  notes: string | null
  customer_first_name: string
  customer_last_name: string
  service_name: string
  service_price: number
  team_member_id: string
  team_member_color: string
  duration_minutes: number
}
