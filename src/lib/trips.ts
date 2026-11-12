import { eachDayOfInterval, format, parseISO } from 'date-fns';
import type { Activity, CoverTone, Trip, TripDay } from '../types';
import { uid } from './storage';

export function buildDays(startDate: string, endDate: string, existing: TripDay[] = []): TripDay[] {
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return [];
  }

  const byDate = new Map(existing.map((d) => [d.date, d.activities]));
  return eachDayOfInterval({ start, end }).map((day) => {
    const date = format(day, 'yyyy-MM-dd');
    return {
      date,
      activities: byDate.get(date) ?? [],
    };
  });
}

export function createTrip(input: {
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  cover: CoverTone;
  notes: string;
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
    days: buildDays(input.startDate, input.endDate),
    createdAt: now,
    updatedAt: now,
  };
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
