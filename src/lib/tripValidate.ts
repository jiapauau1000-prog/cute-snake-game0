import type {
  Activity,
  PackingItem,
  PinnedPlace,
  Trip,
  TripComment,
  TripDay,
  TripMember,
} from '../types';

const MAX_JSON_BYTES = 400_000;
const MAX_ACTIVITIES_PER_DAY = 40;
const MAX_DAYS = 60;
const MAX_IMAGE_CHARS = 120_000;
const MAX_LIST = 80;

/** Shared cloud trips only allow remote https images, not huge data URLs. */
export function assertSharedTripImages(trip: {
  coverImage?: string;
  days: Array<{ activities: Array<{ imageUrl?: string }> }>;
}): string | null {
  if (hasEmbeddedDataImages(trip)) {
    return '共享行程請改用 https 圖片網址，勿上傳大型內嵌圖片';
  }
  return null;
}

export function hasEmbeddedDataImages(trip: {
  coverImage?: string;
  days: Array<{ activities: Array<{ imageUrl?: string }> }>;
}): boolean {
  if (trip.coverImage?.startsWith('data:')) return true;
  return trip.days.some((day) => day.activities.some((a) => a.imageUrl?.startsWith('data:')));
}

/** Drop local album embeds so cloud sync can proceed; keep https images. */
export function stripEmbeddedDataImages<T extends {
  coverImage?: string;
  days: Array<{ activities: Array<{ imageUrl?: string }> }>;
}>(trip: T): T {
  return {
    ...trip,
    coverImage: trip.coverImage?.startsWith('data:') ? undefined : trip.coverImage,
    days: trip.days.map((day) => ({
      ...day,
      activities: day.activities.map((activity) => ({
        ...activity,
        imageUrl: activity.imageUrl?.startsWith('data:') ? undefined : activity.imageUrl,
      })),
    })),
  };
}

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
  if (a.cost !== undefined && (typeof a.cost !== 'number' || !Number.isFinite(a.cost) || a.cost < 0 || a.cost > 1_000_000_000)) {
    return false;
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

function isPacking(value: unknown): value is PackingItem {
  if (!value || typeof value !== 'object') return false;
  const p = value as PackingItem;
  return typeof p.id === 'string' && typeof p.label === 'string' && typeof p.done === 'boolean';
}

function isPin(value: unknown): value is PinnedPlace {
  if (!value || typeof value !== 'object') return false;
  const p = value as PinnedPlace;
  return typeof p.id === 'string' && typeof p.name === 'string' && typeof p.note === 'string';
}

function isMember(value: unknown): value is TripMember {
  if (!value || typeof value !== 'object') return false;
  const m = value as TripMember;
  return typeof m.id === 'string' && typeof m.name === 'string' && typeof m.role === 'string';
}

function isComment(value: unknown): value is TripComment {
  if (!value || typeof value !== 'object') return false;
  const c = value as TripComment;
  return (
    typeof c.id === 'string' &&
    typeof c.author === 'string' &&
    typeof c.text === 'string' &&
    typeof c.createdAt === 'string' &&
    c.text.length <= 1000
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
  if (trip.currency !== undefined) {
    if (typeof trip.currency !== 'string' || !/^[A-Z]{3}$/.test(trip.currency)) return false;
  }
  if (trip.budgetCap !== undefined) {
    if (
      typeof trip.budgetCap !== 'number' ||
      !Number.isFinite(trip.budgetCap) ||
      trip.budgetCap < 0 ||
      trip.budgetCap > 1_000_000_000
    ) {
      return false;
    }
  }
  if (trip.packing && (!Array.isArray(trip.packing) || trip.packing.length > MAX_LIST || !trip.packing.every(isPacking))) {
    return false;
  }
  if (trip.pins && (!Array.isArray(trip.pins) || trip.pins.length > MAX_LIST || !trip.pins.every(isPin))) {
    return false;
  }
  if (trip.members && (!Array.isArray(trip.members) || trip.members.length > MAX_LIST || !trip.members.every(isMember))) {
    return false;
  }
  if (
    trip.comments &&
    (!Array.isArray(trip.comments) || trip.comments.length > MAX_LIST || !trip.comments.every(isComment))
  ) {
    return false;
  }
  return true;
}

export function assertTripPayloadSize(trip: Trip): string | null {
  const size = new TextEncoder().encode(JSON.stringify(trip)).length;
  if (size > MAX_JSON_BYTES) return '旅程資料過大（圖片太多或太大），請縮小後再試';
  return null;
}
