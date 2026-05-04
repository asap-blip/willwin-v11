// src/lib/willwin-api.ts
//
// Thin typed fetch wrappers around the n8n webhooks.
// Base URL comes from NEXT_PUBLIC_N8N_BASE_URL.
// Every function throws on network failure or { __error } responses.

import type {
  BookingInitResponse,
  BookingAvailabilityRequest,
  BookingAvailabilityResponse,
  BookingCreateRequest,
  BookingCreateResponse,
  BookingGetRequest,
  BookingGetResponse,
} from '@/types/booking';
import { isWebhookError } from '@/types/booking';

const BASE_URL = process.env.NEXT_PUBLIC_N8N_BASE_URL;

if (!BASE_URL) {
  // Fail loud at module load — better than silent NaN URLs in production
  throw new Error('NEXT_PUBLIC_N8N_BASE_URL is not set');
}

export class WillwinApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'WillwinApiError';
  }
}

async function postWebhook<TReq, TRes>(
  path: string,
  body: TReq,
): Promise<TRes> {
  const url = `${BASE_URL}/webhook/${path}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
  } catch (err) {
    throw new WillwinApiError(
      `Network error calling ${path}`,
      'network_error',
    );
  }

  if (!res.ok) {
    throw new WillwinApiError(
      `Webhook ${path} returned ${res.status}`,
      'http_error',
      res.status,
    );
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new WillwinApiError(
      `Webhook ${path} returned invalid JSON`,
      'parse_error',
    );
  }

  // n8n wraps single-item responses in an array sometimes.
  // Unwrap defensively.
  const payload = Array.isArray(data) ? data[0] : data;

  if (isWebhookError(payload)) {
    throw new WillwinApiError(
      payload.message || `Webhook ${path} failed: ${payload.__error}`,
      payload.__error,
    );
  }

  return payload as TRes;
}

// ─── Public API ─────────────────────────────────────────────────────

export function bookingInit(): Promise<BookingInitResponse> {
  return postWebhook<Record<string, never>, BookingInitResponse>(
    'willwin/booking/init',
    {},
  );
}

export function bookingAvailability(
  req: BookingAvailabilityRequest,
): Promise<BookingAvailabilityResponse> {
  return postWebhook<BookingAvailabilityRequest, BookingAvailabilityResponse>(
    'willwin/booking/availability',
    req,
  );
}

export function bookingCreate(
  req: BookingCreateRequest,
): Promise<BookingCreateResponse> {
  return postWebhook<BookingCreateRequest, BookingCreateResponse>(
    'willwin/booking/create',
    req,
  );
}

export function bookingGet(
  req: BookingGetRequest,
): Promise<BookingGetResponse> {
  return postWebhook<BookingGetRequest, BookingGetResponse>(
    'willwin/booking/get',
    req,
  );
}