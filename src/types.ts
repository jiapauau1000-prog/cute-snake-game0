export type ActivityCategory =
  | 'sight'
  | 'food'
  | 'transit'
  | 'stay'
  | 'other';

export type MemberRole = 'planner' | 'booking' | 'transport' | 'food' | 'other';

export interface Activity {
  id: string;
  title: string;
  place: string;
  time: string;
  category: ActivityCategory;
  notes: string;
  /** https URL or compressed data:image JPEG */
  imageUrl?: string;
  /** Expense amount in trip currency */
  cost?: number;
}

export interface TripDay {
  date: string;
  activities: Activity[];
}

export interface PackingItem {
  id: string;
  label: string;
  done: boolean;
}

export interface PinnedPlace {
  id: string;
  name: string;
  note: string;
}

export interface TripMember {
  id: string;
  name: string;
  role: MemberRole;
}

export interface TripComment {
  id: string;
  author: string;
  text: string;
  createdAt: string;
}

export interface Trip {
  id: string;
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  cover: CoverTone;
  notes: string;
  /** Optional trip cover photo (https or data URL). */
  coverImage?: string;
  currency?: string;
  packing?: PackingItem[];
  pins?: PinnedPlace[];
  members?: TripMember[];
  comments?: TripComment[];
  days: TripDay[];
  createdAt: string;
  updatedAt: string;
  /** Present when this trip is shared with companions. */
  shareCode?: string;
  /** Write credential for shared trip updates; kept on device, not embedded in shared payload. */
  editToken?: string;
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

export const ROLE_LABELS: Record<MemberRole, string> = {
  planner: '行程規劃',
  booking: '訂房訂票',
  transport: '交通',
  food: '美食預約',
  other: '其他',
};

export type TripPanel = 'plan' | 'budget' | 'packing' | 'pins' | 'team';
