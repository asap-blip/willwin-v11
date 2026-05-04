// src/types/booking.ts
//
// Wire types matching the n8n webhook contracts.
// Source of truth: webhook-{1..4}-*.json + Client Flow Audit.

export type Language = 'fr' | 'en';

export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';

// ─── Reference data ─────────────────────────────────────────────────

export interface Service {
  id: string;
  name: string;
  name_en?: string | null;
  price: number;
  duration_minutes: number;
  is_active: boolean;
}

export interface TeamMember {
  id: string;
  name: string;
  color?: string | null;
  is_active: boolean;
}

export interface BusinessHours {
  day_of_week: number; // 0 = Sun, 6 = Sat
  is_open: boolean;
  open_time: string | null;  // "09:00"
  close_time: string | null; // "18:00"
}

export interface TechAvailability {
  team_member_id: string;
  day_of_week: number;
}

// ─── Webhook 1: Init ────────────────────────────────────────────────

export interface BookingInitResponse {
  services: Service[];
  team_members: TeamMember[];
  business_hours: BusinessHours[];
  tech_availability: TechAvailability[];
}

// ─── Webhook 2: Availability ────────────────────────────────────────

export interface BookingAvailabilityRequest {
  date: string;                     // "YYYY-MM-DD"
  team_member_id: string | null;    // null = no preference
  service_id: string;
  duration_minutes: number;
}

export interface BookingAvailabilityResponse {
  is_open: boolean;
  open_time: string | null;
  close_time: string | null;
  tech_works_today: boolean;
  available_slots: string[];        // ["09:00", "09:30", ...]
}

// ─── Webhook 3: Create ──────────────────────────────────────────────

export interface BookingCreateRequest {
  service_id: string;
  team_member_id: string | null;    // null = no preference
  date: string;                     // "YYYY-MM-DD"
  time: string;                     // "HH:mm"
  duration_minutes: number;
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
  note: string | null;
  language: Language;
}

export interface BookingCreateResponse {
  booking_id: string;
  status: BookingStatus;
  resolved_tech_id: string;
}

// ─── Webhook 4: Get ─────────────────────────────────────────────────

export interface BookingGetRequest {
  id: string;
}

export interface BookingGetResponse {
  booking_id: string;
  first_name: string;
  last_name: string;
  service_name: string;
  tech_name: string;
  date: string;  // "YYYY-MM-DD"
  time: string;  // "HH:mm"
}

// ─── Error envelope (n8n returns this on validation failures) ───────

export interface WebhookError {
  __error: string;
  message?: string;
}

export function isWebhookError(x: unknown): x is WebhookError {
  return typeof x === 'object' && x !== null && '__error' in x;
}