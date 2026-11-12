import type { Trip } from '../types';
import { SAMPLE_TRIPS } from './sample';

export const STORAGE_KEY = 'manlu.trips.v1';

export type SaveResult = { ok: true } | { ok: false; reason: string };

export function loadTrips(): Trip[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seeded = structuredClone(SAMPLE_TRIPS);
      const saved = saveTrips(seeded);
      return saved.ok ? seeded : structuredClone(SAMPLE_TRIPS);
    }
    const parsed = JSON.parse(raw) as Trip[];
    if (!Array.isArray(parsed)) return structuredClone(SAMPLE_TRIPS);
    return parsed;
  } catch {
    return structuredClone(SAMPLE_TRIPS);
  }
}

export function readStoredTrips(): Trip[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Trip[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveTrips(trips: Trip[]): SaveResult {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trips));
    return { ok: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'storage_unavailable';
    return { ok: false, reason };
  }
}

/**
 * Merge local edits with another tab's storage using lastWritten as the baseline
 * so remote deletions are not resurrected and remote creations are kept.
 */
export function reconcileTrips(local: Trip[], remote: Trip[], baseline: Trip[] | null): Trip[] {
  const localMap = new Map(local.map((t) => [t.id, t]));
  const remoteMap = new Map(remote.map((t) => [t.id, t]));
  const baselineIds = new Set((baseline ?? []).map((t) => t.id));
  const ids = new Set([...localMap.keys(), ...remoteMap.keys()]);
  const merged: Trip[] = [];

  for (const id of ids) {
    const localTrip = localMap.get(id);
    const remoteTrip = remoteMap.get(id);
    const wasInBaseline = baselineIds.has(id);

    if (localTrip && remoteTrip) {
      merged.push(localTrip.updatedAt >= remoteTrip.updatedAt ? localTrip : remoteTrip);
      continue;
    }

    if (localTrip && !remoteTrip) {
      // Created here, or deleted in another tab.
      if (!wasInBaseline || baseline === null) merged.push(localTrip);
      continue;
    }

    if (!localTrip && remoteTrip) {
      // Created in another tab, or we deleted it locally.
      if (!wasInBaseline) merged.push(remoteTrip);
    }
  }

  const order = new Map<string, number>();
  local.forEach((t, i) => order.set(t.id, i));
  remote.forEach((t, i) => {
    if (!order.has(t.id)) order.set(t.id, local.length + i);
  });

  return merged.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

export function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}
