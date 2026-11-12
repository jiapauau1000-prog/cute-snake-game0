import type { Activity, Trip, TripDay } from '../types';

const MAX_JSON_BYTES = 1_200_000;
const MAX_ACTIVITIES_PER_DAY = 40;
const MAX_DAYS = 60;
const MAX_IMAGE_CHARS = 400_000;

function isActivity(value: unknown): value is Activity {
  if (!value || typeof value !== 'object') return false;
  const a = value as Activity;
  if (
    typeof a.id !== 'string' ||
    typeof a.title !== 'string' ||
    typeof a.place !== 'string' ||
    typeof a.time !== 'string' ||
    typeof a.category !== 'string' ||
    typeof a.notes !== 'string'
  ) {
    return false;
  }
  if (a.imageUrl !== undefined) {
    if (typeof a.imageUrl !== 'string' || a.imageUrl.length > MAX_IMAGE_CHARS) return false;
    if (!(a.imageUrl.startsWith('data:image/') || /^https:\/\//i.test(a.imageUrl))) return false;
  }
  return true;
}

function isDay(value: unknown): value is TripDay {
  if (!value || typeof value !== 'object') return false;
  const d = value as TripDay;
  return (
    typeof d.date === 'string' &&
    Array.isArray(d.activities) &&
    d.activities.length <= MAX_ACTIVITIES_PER_DAY &&
    d.activities.every(isActivity)
  );
}

export function isValidTrip(value: unknown): value is Trip {
  if (!value || typeof value !== 'object') return false;
  const trip = value as Trip;
  if (
    typeof trip.id !== 'string' ||
    typeof trip.title !== 'string' ||
    typeof trip.destination !== 'string' ||
    typeof trip.startDate !== 'string' ||
    typeof trip.endDate !== 'string' ||
    !Array.isArray(trip.days) ||
    trip.days.length > MAX_DAYS ||
    !trip.days.every(isDay)
  ) {
    return false;
  }
  if (trip.coverImage !== undefined) {
    if (typeof trip.coverImage !== 'string' || trip.coverImage.length > MAX_IMAGE_CHARS) return false;
    if (!(trip.coverImage.startsWith('data:image/') || /^https:\/\//i.test(trip.coverImage))) {
      return false;
    }
  }
  return true;
}

export function assertTripPayloadSize(trip: Trip): string | null {
  const size = new TextEncoder().encode(JSON.stringify(trip)).length;
  if (size > MAX_JSON_BYTES) return '旅程資料過大（圖片太多或太大），請縮小後再試';
  return null;
}
