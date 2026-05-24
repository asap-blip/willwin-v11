// src/lib/willwin-api.ts
//
// Typed fetch wrappers for the four booking operations.
//
// Default backend is the local Next.js route handlers under /api/booking/*.
// When NEXT_PUBLIC_N8N_BASE_URL is set the n8n webhooks are tried first; if
// they return empty/placeholder data or fail, we fall back to the local API.
// This way a Vercel deploy works out of the box even before n8n is wired up.

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

const N8N_BASE_URL =
  typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_N8N_BASE_URL : undefined;

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

async function postJson<TReq, TRes>(url: string, body: TReq): Promise<TRes> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    throw new WillwinApiError(`Network error calling ${url}`, 'network_error');
  }

  if (!res.ok) {
    throw new WillwinApiError(
      `${url} returned ${res.status}`,
      'http_error',
      res.status,
    );
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new WillwinApiError(`${url} returned invalid JSON`, 'parse_error');
  }

  // n8n wraps single-item responses in an array sometimes.
  const payload = Array.isArray(data) ? data[0] : data;

  if (isWebhookError(payload)) {
    throw new WillwinApiError(
      payload.message || `Webhook failed: ${payload.__error}`,
      payload.__error,
    );
  }

  return payload as TRes;
}

// Heuristic: an init payload that lacks any services is treated as the n8n
// starter-workflow placeholder, and we fall back to the local API.
function isPlaceholderInit(r: BookingInitResponse | null | undefined): boolean {
  if (!r) return true;
  return !Array.isArray(r.services) || r.services.length === 0;
}

// Origin used for local API calls. On the server (RSC / route handlers) we
// need an absolute URL; in the browser a relative path is fine.
function localUrl(path: string): string {
  if (typeof window !== 'undefined') return path;
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VERCEL_URL ||
    'http://localhost:3000';
  const normalized = base.startsWith('http') ? base : `https://${base}`;
  return `${normalized}${path}`;
}

async function withN8nFallback<T>(
  n8nPath: string,
  localPath: string,
  body: unknown,
  isPlaceholder: (r: T) => boolean = () => false,
): Promise<T> {
  if (N8N_BASE_URL) {
    try {
      const result = await postJson<unknown, T>(
        `${N8N_BASE_URL}/webhook/${n8nPath}`,
        body,
      );
      if (!isPlaceholder(result)) return result;
      console.warn(`[willwin-api] n8n ${n8nPath} returned placeholder/empty, falling back`);
    } catch (err) {
      console.warn(`[willwin-api] n8n ${n8nPath} failed, falling back:`, err);
    }
  }
  return postJson<unknown, T>(localUrl(localPath), body);
}

// ─── Public API ─────────────────────────────────────────────────────

export function bookingInit(): Promise<BookingInitResponse> {
  return withN8nFallback<BookingInitResponse>(
    'willwin/booking/init',
    '/api/booking/init',
    {},
    isPlaceholderInit,
  );
}

export function bookingAvailability(
  req: BookingAvailabilityRequest,
): Promise<BookingAvailabilityResponse> {
  return withN8nFallback<BookingAvailabilityResponse>(
    'willwin/booking/availability',
    '/api/booking/availability',
    req,
  );
}

export function bookingCreate(
  req: BookingCreateRequest,
): Promise<BookingCreateResponse> {
  return withN8nFallback<BookingCreateResponse>(
    'willwin/booking/create',
    '/api/booking/create',
    req,
  );
}

export function bookingGet(
  req: BookingGetRequest,
): Promise<BookingGetResponse> {
  return withN8nFallback<BookingGetResponse>(
    'willwin/booking/get',
    '/api/booking/get',
    req,
  );
}
