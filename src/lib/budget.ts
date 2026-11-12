import type { ActivityCategory, Trip } from '../types';
import { CATEGORY_LABELS } from '../types';

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

export function budgetRemaining(trip: Trip): number | null {
  if (typeof trip.budgetCap !== 'number' || !Number.isFinite(trip.budgetCap) || trip.budgetCap <= 0) {
    return null;
  }
  return trip.budgetCap - tripBudget(trip);
}

export function categoryBudget(trip: Trip): Array<{ category: ActivityCategory; label: string; amount: number }> {
  const totals = new Map<ActivityCategory, number>();
  for (const day of trip.days) {
    for (const activity of day.activities) {
      const amount = activityCost(activity.cost);
      if (amount <= 0) continue;
      totals.set(activity.category, (totals.get(activity.category) ?? 0) + amount);
    }
  }
  return (Object.keys(CATEGORY_LABELS) as ActivityCategory[])
    .map((category) => ({
      category,
      label: CATEGORY_LABELS[category],
      amount: totals.get(category) ?? 0,
    }))
    .filter((row) => row.amount > 0);
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
