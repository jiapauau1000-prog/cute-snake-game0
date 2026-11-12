import type { Trip } from '../types';
import { SAMPLE_TRIPS } from './sample';

const STORAGE_KEY = 'manlu.trips.v1';

export function loadTrips(): Trip[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(SAMPLE_TRIPS));
      return structuredClone(SAMPLE_TRIPS);
    }
    const parsed = JSON.parse(raw) as Trip[];
    if (!Array.isArray(parsed)) return structuredClone(SAMPLE_TRIPS);
    return parsed;
  } catch {
    return structuredClone(SAMPLE_TRIPS);
  }
}

export function saveTrips(trips: Trip[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trips));
}

export function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}
