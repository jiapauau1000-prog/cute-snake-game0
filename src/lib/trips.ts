import { eachDayOfInterval, format, parseISO } from 'date-fns';
import type { Activity, CoverTone, Trip, TripDay } from '../types';
import { uid } from './storage';

/**
 * Rebuild day slots for a date range.
 * Activities are remapped by day index so rescheduling (e.g. Apr 10–12 → Apr 17–19)
 * keeps the itinerary instead of wiping it when dates no longer match.
 */
export function buildDays(startDate: string, endDate: string, existing: TripDay[] = []): TripDay[] {
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return [];
  }

  return eachDayOfInterval({ start, end }).map((day, index) => {
    const date = format(day, 'yyyy-MM-dd');
    return {
      date,
      activities: structuredClone(existing[index]?.activities ?? []),
    };
  });
}

/** Activities that would fall off the end when shrinking the trip length. */
export function orphanedActivityCount(existing: TripDay[], startDate: string, endDate: string): number {
  const nextLength = buildDays(startDate, endDate).length;
  if (nextLength === 0) {
    return existing.reduce((sum, day) => sum + day.activities.length, 0);
  }
  return existing.slice(nextLength).reduce((sum, day) => sum + day.activities.length, 0);
}

export function createTrip(input: {
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  cover: CoverTone;
  notes: string;
  currency?: string;
  coverImage?: string;
  budgetCap?: number;
}): Trip {
  const now = new Date().toISOString();
  return {
    id: uid('trip'),
    title: input.title.trim(),
    destination: input.destination.trim(),
    startDate: input.startDate,
    endDate: input.endDate,
    cover: input.cover,
    notes: input.notes.trim(),
    currency: (input.currency || 'TWD').trim().toUpperCase() || 'TWD',
    coverImage: input.coverImage || undefined,
    budgetCap:
      typeof input.budgetCap === 'number' && Number.isFinite(input.budgetCap) && input.budgetCap > 0
        ? input.budgetCap
        : undefined,
    packing: [
      { id: uid('pack'), label: '護照／身分證件', done: false },
      { id: uid('pack'), label: '充電器與行動電源', done: false },
      { id: uid('pack'), label: '常用藥品', done: false },
    ],
    pins: [],
    members: [],
    comments: [],
    days: buildDays(input.startDate, input.endDate),
    createdAt: now,
    updatedAt: now,
  };
}

export function duplicateTrip(trip: Trip): Trip {
  const now = new Date().toISOString();
  const idMap = new Map<string, string>();
  const mapId = (oldId: string, prefix: string) => {
    const next = uid(prefix);
    idMap.set(oldId, next);
    return next;
  };

  return {
    ...structuredClone(trip),
    id: uid('trip'),
    title: `${trip.title.trim()}（副本）`,
    shareCode: undefined,
    editToken: undefined,
    shared: false,
    revision: undefined,
    packing: (trip.packing || []).map((item) => ({
      ...item,
      id: mapId(item.id, 'pack'),
      done: false,
    })),
    pins: (trip.pins || []).map((item) => ({ ...item, id: mapId(item.id, 'pin') })),
    members: (trip.members || []).map((item) => ({ ...item, id: mapId(item.id, 'member') })),
    comments: [],
    days: trip.days.map((day) => ({
      ...day,
      activities: day.activities.map((activity) => ({
        ...activity,
        id: mapId(activity.id, 'act'),
      })),
    })),
    createdAt: now,
    updatedAt: now,
  };
}

export function daysUntilTrip(startDate: string): number | null {
  const start = parseISO(startDate);
  if (Number.isNaN(start.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  start.setHours(0, 0, 0, 0);
  return Math.round((start.getTime() - today.getTime()) / 86_400_000);
}

export function updateTripDates(trip: Trip, startDate: string, endDate: string): Trip {
  return {
    ...trip,
    startDate,
    endDate,
    days: buildDays(startDate, endDate, trip.days),
    updatedAt: new Date().toISOString(),
  };
}

export function sortActivities(activities: Activity[]): Activity[] {
  return [...activities].sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
}

export function tripDayCount(trip: Trip): number {
  return trip.days.length;
}

export function tripActivityCount(trip: Trip): number {
  return trip.days.reduce((sum, day) => sum + day.activities.length, 0);
}

export function formatDateRange(startDate: string, endDate: string): string {
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '';
  const startLabel = format(start, 'M月d日');
  const endLabel = format(end, 'M月d日');
  if (startDate === endDate) return startLabel;
  return `${startLabel} – ${endLabel}`;
}

export function formatDayHeading(date: string, index: number): string {
  const d = parseISO(date);
  const weekday = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
  return `第 ${index + 1} 天・${format(d, 'M月d日')}（${weekday}）`;
}
