export type ActivityCategory =
  | 'sight'
  | 'food'
  | 'transit'
  | 'stay'
  | 'other';

export interface Activity {
  id: string;
  title: string;
  place: string;
  time: string;
  category: ActivityCategory;
  notes: string;
}

export interface TripDay {
  date: string;
  activities: Activity[];
}

export interface Trip {
  id: string;
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  cover: CoverTone;
  notes: string;
  days: TripDay[];
  createdAt: string;
  updatedAt: string;
  /** Present when this trip is shared with companions. */
  shareCode?: string;
  shared?: boolean;
  revision?: number;
}

export type CoverTone = 'coast' | 'forest' | 'city' | 'sunset';

export const CATEGORY_LABELS: Record<ActivityCategory, string> = {
  sight: '景點',
  food: '美食',
  transit: '交通',
  stay: '住宿',
  other: '其他',
};

export const COVER_LABELS: Record<CoverTone, string> = {
  coast: '海岸',
  forest: '山林',
  city: '城市',
  sunset: '暮色',
};
