import type { Trip } from '../types';

export function activityCost(cost: number | undefined): number {
  return typeof cost === 'number' && Number.isFinite(cost) && cost > 0 ? cost : 0;
}

export function dayBudget(trip: Trip, dayIndex: number): number {
  const day = trip.days[dayIndex];
  if (!day) return 0;
  return day.activities.reduce((sum, a) => sum + activityCost(a.cost), 0);
}

export function tripBudget(trip: Trip): number {
  return trip.days.reduce((sum, day) => sum + day.activities.reduce((s, a) => s + activityCost(a.cost), 0), 0);
}

export function formatMoney(amount: number, currency = 'TWD'): string {
  try {
    return new Intl.NumberFormat('zh-TW', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount)}`;
  }
}
