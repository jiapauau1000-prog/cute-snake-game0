import { useEffect, useRef, useState } from 'react';
import type { Activity, CoverTone, Trip } from './types';
import { CATEGORY_LABELS, COVER_LABELS } from './types';
import {
  STORAGE_KEY,
  loadTrips,
  readStoredTrips,
  reconcileTrips,
  saveTrips,
  uid,
} from './lib/storage';
import {
  createTrip,
  formatDateRange,
  formatDayHeading,
  orphanedActivityCount,
  sortActivities,
  tripActivityCount,
  tripDayCount,
  updateTripDates,
} from './lib/trips';

type Modal =
  | { type: 'trip'; trip?: Trip }
  | { type: 'activity'; dayIndex: number; activity?: Activity }
  | null;

export default function App() {
  const [trips, setTrips] = useState<Trip[]>(() => loadTrips());
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [dayIndex, setDayIndex] = useState(0);
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState<string | null>(null);
  const baselineRef = useRef<Trip[] | null>(trips);
  const skipPersistRef = useRef(false);

  const activeTrip = trips.find((t) => t.id === activeTripId) ?? null;

  useEffect(() => {
    if (skipPersistRef.current) {
      skipPersistRef.current = false;
      return;
    }

    const remote = readStoredTrips() ?? [];
    const merged = reconcileTrips(trips, remote, baselineRef.current);
    const result = saveTrips(merged);
    if (!result.ok) {
      setToast('無法儲存：瀏覽器儲存空間不足或已停用');
      return;
    }
    baselineRef.current = merged;
    if (merged !== trips && JSON.stringify(merged) !== JSON.stringify(trips)) {
      skipPersistRef.current = true;
      setTrips(merged);
    }
  }, [trips]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      const remote = readStoredTrips();
      if (!remote) return;
      skipPersistRef.current = true;
      baselineRef.current = remote;
      setTrips(remote);
      setToast('已同步其他分頁的變更');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!activeTrip) return;
    if (dayIndex >= activeTrip.days.length) setDayIndex(0);
  }, [activeTrip, dayIndex]);

  function showToast(message: string) {
    setToast(message);
  }

  function upsertTrip(next: Trip) {
    setTrips((prev) => {
      const exists = prev.some((t) => t.id === next.id);
      if (exists) return prev.map((t) => (t.id === next.id ? next : t));
      return [next, ...prev];
    });
  }

  function deleteTrip(id: string) {
    setTrips((prev) => prev.filter((t) => t.id !== id));
    if (activeTripId === id) setActiveTripId(null);
    showToast('已刪除旅程');
  }

  function openTrip(id: string) {
    setActiveTripId(id);
    setDayIndex(0);
  }

  function saveActivity(dayIdx: number, activity: Activity, editingId?: string) {
    if (!activeTrip) return;
    const days = activeTrip.days.map((day, index) => {
      if (index !== dayIdx) return day;
      const activities = editingId
        ? day.activities.map((a) => (a.id === editingId ? activity : a))
        : [...day.activities, activity];
      return { ...day, activities: sortActivities(activities) };
    });
    upsertTrip({ ...activeTrip, days, updatedAt: new Date().toISOString() });
    showToast(editingId ? '已更新行程' : '已加入行程');
  }

  function removeActivity(dayIdx: number, activityId: string) {
    if (!activeTrip) return;
    const days = activeTrip.days.map((day, index) => {
      if (index !== dayIdx) return day;
      return { ...day, activities: day.activities.filter((a) => a.id !== activityId) };
    });
    upsertTrip({ ...activeTrip, days, updatedAt: new Date().toISOString() });
    showToast('已移除活動');
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <button
            type="button"
            className="brand-mark"
            style={{ background: 'none', border: 0, padding: 0 }}
            onClick={() => setActiveTripId(null)}
          >
            漫旅
          </button>
          <span className="brand-tag">規劃下一趟說走就走的日子</span>
        </div>
        <button type="button" className="primary-btn" onClick={() => setModal({ type: 'trip' })}>
          新增旅程
        </button>
      </header>

      {!activeTrip ? (
        <HomeView
          trips={trips}
          onOpen={openTrip}
          onCreate={() => setModal({ type: 'trip' })}
        />
      ) : (
        <TripView
          trip={activeTrip}
          dayIndex={dayIndex}
          onDayChange={setDayIndex}
          onBack={() => setActiveTripId(null)}
          onEditTrip={() => setModal({ type: 'trip', trip: activeTrip })}
          onDeleteTrip={() => {
            if (window.confirm(`確定刪除「${activeTrip.title}」？`)) deleteTrip(activeTrip.id);
          }}
          onAddActivity={() => setModal({ type: 'activity', dayIndex })}
          onEditActivity={(activity) => setModal({ type: 'activity', dayIndex, activity })}
          onRemoveActivity={(activityId) => removeActivity(dayIndex, activityId)}
        />
      )}

      {modal?.type === 'trip' && (
        <TripModal
          trip={modal.trip}
          onClose={() => setModal(null)}
          onSave={(values) => {
            if (modal.trip) {
              const lost = orphanedActivityCount(
                modal.trip.days,
                values.startDate,
                values.endDate,
              );
              if (
                lost > 0 &&
                !window.confirm(
                  `縮短日期後，將有 ${lost} 個活動超出新行程範圍並被移除。確定繼續？`,
                )
              ) {
                return;
              }
              const updated = updateTripDates(
                {
                  ...modal.trip,
                  title: values.title.trim(),
                  destination: values.destination.trim(),
                  cover: values.cover,
                  notes: values.notes.trim(),
                  updatedAt: new Date().toISOString(),
                },
                values.startDate,
                values.endDate,
              );
              upsertTrip(updated);
              showToast('旅程已更新');
            } else {
              const trip = createTrip(values);
              upsertTrip(trip);
              setActiveTripId(trip.id);
              setDayIndex(0);
              showToast('旅程已建立');
            }
            setModal(null);
          }}
        />
      )}

      {modal?.type === 'activity' && activeTrip && (
        <ActivityModal
          activity={modal.activity}
          onClose={() => setModal(null)}
          onSave={(values) => {
            const next: Activity = {
              id: modal.activity?.id ?? uid('act'),
              ...values,
            };
            saveActivity(modal.dayIndex, next, modal.activity?.id);
            setModal(null);
          }}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function HomeView({
  trips,
  onOpen,
  onCreate,
}: {
  trips: Trip[];
  onOpen: (id: string) => void;
  onCreate: () => void;
}) {
  return (
    <>
      <section className="hero" aria-label="漫旅首頁">
        <div className="hero-media" aria-hidden="true" />
        <div className="hero-content">
          <p className="hero-brand">漫旅</p>
          <h1 className="hero-line">把日子排成風景</h1>
          <p className="hero-support">依日期規劃每日景點、美食與交通，讓下一趟旅程清楚可走。</p>
          <div className="hero-actions">
            <button type="button" className="primary-btn" onClick={onCreate}>
              開始規劃
            </button>
            {trips[0] && (
              <button type="button" className="ghost-btn" onClick={() => onOpen(trips[0].id)}>
                查看範例行程
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="section-head">
        <div>
          <h2>我的旅程</h2>
          <p>資料保存在此裝置，重新整理也不會遺失。</p>
        </div>
      </div>

      {trips.length === 0 ? (
        <div className="empty-state">
          <p>還沒有旅程。點「新增旅程」開始第一趟規劃。</p>
          <button type="button" className="primary-btn" onClick={onCreate} style={{ marginTop: '1rem' }}>
            新增旅程
          </button>
        </div>
      ) : (
        <div className="trip-grid">
          {trips.map((trip) => (
            <button key={trip.id} type="button" className="trip-tile" onClick={() => onOpen(trip.id)}>
              <div className={`trip-tile-bg ${trip.cover}`} />
              <div className="trip-tile-body">
                <h3>{trip.title}</h3>
                <p className="meta">
                  {trip.destination} ・ {formatDateRange(trip.startDate, trip.endDate)}
                </p>
                <div className="stats">
                  <span>{tripDayCount(trip)} 天</span>
                  <span>{tripActivityCount(trip)} 個活動</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function TripView({
  trip,
  dayIndex,
  onDayChange,
  onBack,
  onEditTrip,
  onDeleteTrip,
  onAddActivity,
  onEditActivity,
  onRemoveActivity,
}: {
  trip: Trip;
  dayIndex: number;
  onDayChange: (index: number) => void;
  onBack: () => void;
  onEditTrip: () => void;
  onDeleteTrip: () => void;
  onAddActivity: () => void;
  onEditActivity: (activity: Activity) => void;
  onRemoveActivity: (id: string) => void;
}) {
  const day = trip.days[dayIndex];

  return (
    <section className="panel">
      <div className="trip-header">
        <div className="trip-header-top">
          <div>
            <span className="cover-chip">{COVER_LABELS[trip.cover]}氛圍</span>
            <h1 className="trip-title">{trip.title}</h1>
            <p className="trip-sub">
              {trip.destination} ・ {formatDateRange(trip.startDate, trip.endDate)}
            </p>
            {trip.notes && <p className="trip-sub" style={{ marginTop: '0.55rem' }}>{trip.notes}</p>}
          </div>
          <div className="trip-actions">
            <button type="button" className="ghost-btn" onClick={onBack}>
              返回列表
            </button>
            <button type="button" className="ghost-btn" onClick={onEditTrip}>
              編輯旅程
            </button>
            <button type="button" className="danger-btn" onClick={onDeleteTrip}>
              刪除
            </button>
          </div>
        </div>
      </div>

      <div className="day-tabs" role="tablist" aria-label="每日行程">
        {trip.days.map((d, index) => (
          <button
            key={d.date}
            type="button"
            role="tab"
            aria-selected={index === dayIndex}
            className={`day-tab${index === dayIndex ? ' active' : ''}`}
            onClick={() => onDayChange(index)}
          >
            Day {index + 1}
          </button>
        ))}
      </div>

      <div className="section-head" style={{ marginTop: '0.25rem' }}>
        <div>
          <h2>{day ? formatDayHeading(day.date, dayIndex) : '行程'}</h2>
          <p>{day?.activities.length ? `共 ${day.activities.length} 個活動` : '這天還沒有安排，來加第一個吧。'}</p>
        </div>
        <button type="button" className="primary-btn" onClick={onAddActivity}>
          加入活動
        </button>
      </div>

      {!day || day.activities.length === 0 ? (
        <div className="empty-state">尚無活動。可加入景點、餐廳、交通或住宿。</div>
      ) : (
        <div className="timeline">
          {day.activities.map((activity) => (
            <article key={activity.id} className="activity">
              <div className="activity-time">{activity.time || '--:--'}</div>
              <div>
                <h4>{activity.title}</h4>
                {activity.place && <p className="place">{activity.place}</p>}
                <span className="category">{CATEGORY_LABELS[activity.category]}</span>
                {activity.notes && <p className="notes">{activity.notes}</p>}
              </div>
              <div className="activity-actions">
                <button type="button" className="icon-btn" aria-label="編輯" onClick={() => onEditActivity(activity)}>
                  ✎
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="刪除"
                  onClick={() => onRemoveActivity(activity.id)}
                >
                  ⌫
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function TripModal({
  trip,
  onClose,
  onSave,
}: {
  trip?: Trip;
  onClose: () => void;
  onSave: (values: {
    title: string;
    destination: string;
    startDate: string;
    endDate: string;
    cover: CoverTone;
    notes: string;
  }) => void;
}) {
  const [title, setTitle] = useState(trip?.title ?? '');
  const [destination, setDestination] = useState(trip?.destination ?? '');
  const [startDate, setStartDate] = useState(trip?.startDate ?? '');
  const [endDate, setEndDate] = useState(trip?.endDate ?? '');
  const [cover, setCover] = useState<CoverTone>(trip?.cover ?? 'coast');
  const [notes, setNotes] = useState(trip?.notes ?? '');
  const [error, setError] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !destination.trim() || !startDate || !endDate) {
      setError('請填寫標題、目的地與日期');
      return;
    }
    if (endDate < startDate) {
      setError('結束日期不可早於開始日期');
      return;
    }
    onSave({ title, destination, startDate, endDate, cover, notes });
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="trip-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="trip-modal-title">{trip ? '編輯旅程' : '新增旅程'}</h3>
        <form className="form-grid" onSubmit={submit}>
          <div className="form-row">
            <label htmlFor="trip-title">旅程名稱</label>
            <input
              id="trip-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：沖繩潛水五日"
              autoFocus
            />
          </div>
          <div className="form-row">
            <label htmlFor="trip-destination">目的地</label>
            <input
              id="trip-destination"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="城市或國家"
            />
          </div>
          <div className="form-row two">
            <div className="form-row">
              <label htmlFor="trip-start">開始日期</label>
              <input id="trip-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="form-row">
              <label htmlFor="trip-end">結束日期</label>
              <input id="trip-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <label>封面氛圍</label>
            <div className="cover-options">
              {(Object.keys(COVER_LABELS) as CoverTone[]).map((tone) => (
                <button
                  key={tone}
                  type="button"
                  className={`cover-option ${tone}${cover === tone ? ' selected' : ''}`}
                  onClick={() => setCover(tone)}
                >
                  {COVER_LABELS[tone]}
                </button>
              ))}
            </div>
          </div>
          <div className="form-row">
            <label htmlFor="trip-notes">備註</label>
            <textarea
              id="trip-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="行李、節奏、同行人…"
            />
          </div>
          {error && <p style={{ color: 'var(--danger)', margin: 0 }}>{error}</p>}
          <div className="modal-actions">
            <button type="button" className="ghost-btn" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="primary-btn">
              儲存
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ActivityModal({
  activity,
  onClose,
  onSave,
}: {
  activity?: Activity;
  onClose: () => void;
  onSave: (values: Omit<Activity, 'id'>) => void;
}) {
  const [title, setTitle] = useState(activity?.title ?? '');
  const [place, setPlace] = useState(activity?.place ?? '');
  const [time, setTime] = useState(activity?.time ?? '10:00');
  const [category, setCategory] = useState(activity?.category ?? 'sight');
  const [notes, setNotes] = useState(activity?.notes ?? '');
  const [error, setError] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('請填寫活動名稱');
      return;
    }
    onSave({
      title: title.trim(),
      place: place.trim(),
      time,
      category,
      notes: notes.trim(),
    });
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="activity-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="activity-modal-title">{activity ? '編輯活動' : '加入活動'}</h3>
        <form className="form-grid" onSubmit={submit}>
          <div className="form-row">
            <label htmlFor="act-title">活動名稱</label>
            <input
              id="act-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：拜訪美術館"
              autoFocus
            />
          </div>
          <div className="form-row two">
            <div className="form-row">
              <label htmlFor="act-time">時間</label>
              <input id="act-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <div className="form-row">
              <label htmlFor="act-category">類型</label>
              <select
                id="act-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as Activity['category'])}
              >
                {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-row">
            <label htmlFor="act-place">地點</label>
            <input
              id="act-place"
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              placeholder="店名、車站或景點"
            />
          </div>
          <div className="form-row">
            <label htmlFor="act-notes">備註</label>
            <textarea
              id="act-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="預約、門票、交通提示…"
            />
          </div>
          {error && <p style={{ color: 'var(--danger)', margin: 0 }}>{error}</p>}
          <div className="modal-actions">
            <button type="button" className="ghost-btn" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="primary-btn">
              儲存
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
