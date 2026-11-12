import type { Trip } from '../types';
import { normalizeShareCode } from './shareCode';

export type SharedTripResponse = {
  shareCode: string;
  revision: number;
  trip: Trip;
  updatedAt: string;
};

function apiBase(): string {
  if (typeof window === 'undefined') return '';
  const stored = window.localStorage.getItem('manlu.apiBase')?.trim() ?? '';
  return stored.replace(/\/$/, '');
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const base = apiBase();
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `請求失敗（${res.status}）`);
  }
  return data;
}

export async function publishSharedTrip(trip: Trip): Promise<SharedTripResponse> {
  return request<SharedTripResponse>('/api/shared-trips', {
    method: 'POST',
    body: JSON.stringify({ trip }),
  });
}

export async function fetchSharedTrip(shareCode: string): Promise<SharedTripResponse> {
  const code = normalizeShareCode(shareCode);
  return request<SharedTripResponse>(`/api/shared-trips/${encodeURIComponent(code)}`);
}

export async function pushSharedTrip(
  shareCode: string,
  trip: Trip,
  revision: number,
): Promise<SharedTripResponse> {
  const code = normalizeShareCode(shareCode);
  return request<SharedTripResponse>(`/api/shared-trips/${encodeURIComponent(code)}`, {
    method: 'PUT',
    body: JSON.stringify({ trip, revision }),
  });
}

export function getStoredApiBase(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem('manlu.apiBase')?.trim() ?? '';
}

export function setStoredApiBase(url: string): void {
  const cleaned = url.trim().replace(/\/$/, '');
  if (!cleaned) {
    window.localStorage.removeItem('manlu.apiBase');
    return;
  }
  window.localStorage.setItem('manlu.apiBase', cleaned);
}
