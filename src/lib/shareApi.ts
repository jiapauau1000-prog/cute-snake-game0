import type { Trip } from '../types';
import { normalizeShareCode } from './shareCode';

export type SharedTripResponse = {
  shareCode: string;
  editToken?: string;
  revision: number;
  trip: Trip;
  updatedAt: string;
};

const ALLOWED_API_HOST_SUFFIXES = ['.apps.grok.bot', '.cursor.app', '.cursor.com'];

export function isAllowedApiBase(url: string): boolean {
  const cleaned = url.trim();
  if (!cleaned) return true;
  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol !== 'https:') return false;
    if (parsed.username || parsed.password) return false;
    const host = parsed.hostname.toLowerCase();
    return ALLOWED_API_HOST_SUFFIXES.some(
      (suffix) => host === suffix.slice(1) || host.endsWith(suffix),
    );
  } catch {
    return false;
  }
}

function apiBase(): string {
  if (typeof window === 'undefined') return '';
  const stored = window.localStorage.getItem('manlu.apiBase')?.trim() ?? '';
  if (!stored) return '';
  if (!isAllowedApiBase(stored)) {
    window.localStorage.removeItem('manlu.apiBase');
    return '';
  }
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

export async function fetchSharedTrip(
  shareCode: string,
  options?: { join?: boolean },
): Promise<SharedTripResponse> {
  const code = normalizeShareCode(shareCode);
  const join = options?.join ? '?join=1' : '';
  return request<SharedTripResponse>(`/api/shared-trips/${encodeURIComponent(code)}${join}`);
}

export async function pushSharedTrip(
  shareCode: string,
  trip: Trip,
  revision: number,
  editToken?: string,
): Promise<SharedTripResponse> {
  const code = normalizeShareCode(shareCode);
  const headers: Record<string, string> = {};
  if (editToken) headers['x-manlu-edit-token'] = editToken;
  return request<SharedTripResponse>(`/api/shared-trips/${encodeURIComponent(code)}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      trip,
      revision,
      ...(editToken ? { editToken } : {}),
    }),
  });
}

export async function deleteSharedTrip(shareCode: string, editToken: string): Promise<void> {
  const code = normalizeShareCode(shareCode);
  await request<{ ok: true }>(`/api/shared-trips/${encodeURIComponent(code)}`, {
    method: 'DELETE',
    headers: {
      'x-manlu-edit-token': editToken,
    },
    body: JSON.stringify({ editToken }),
  });
}

export async function rotateSharedTrip(
  shareCode: string,
  editToken: string,
): Promise<SharedTripResponse> {
  const code = normalizeShareCode(shareCode);
  return request<SharedTripResponse>(`/api/shared-trips/${encodeURIComponent(code)}/rotate`, {
    method: 'POST',
    headers: {
      'x-manlu-edit-token': editToken,
    },
    body: JSON.stringify({ editToken }),
  });
}

export function getStoredApiBase(): string {
  if (typeof window === 'undefined') return '';
  const stored = window.localStorage.getItem('manlu.apiBase')?.trim() ?? '';
  if (stored && !isAllowedApiBase(stored)) {
    window.localStorage.removeItem('manlu.apiBase');
    return '';
  }
  return stored;
}

export function setStoredApiBase(url: string): void {
  const cleaned = url.trim().replace(/\/$/, '');
  if (!cleaned) {
    window.localStorage.removeItem('manlu.apiBase');
    return;
  }
  if (!isAllowedApiBase(cleaned)) {
    throw new Error('同步網址僅允許 https 的 Cursor Apps 網域');
  }
  window.localStorage.setItem('manlu.apiBase', cleaned);
}
