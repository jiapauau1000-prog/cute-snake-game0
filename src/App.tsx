'use client';

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
import {
  fetchSharedTrip,
  getStoredApiBase,
  publishSharedTrip,
  pushSharedTrip,
  setStoredApiBase,
} from './lib/shareApi';

type Modal =
  | { type: 'trip'; trip?: Trip }
  | { type: 'activity'; dayIndex: number; activity?: Activity }
  | { type: 'join' }
  | { type: 'share'; trip: Trip }
  | { type: 'settings' }
  | null;

export default function App() {
  const [trips, setTrips] = useState<Trip[]>(() => loadTrips());
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [dayIndex, setDayIndex] = useState(0);
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [syncLabel, setSyncLabel] = useState<string | null>(null);
  const baselineRef = useRef<Trip[] | null>(trips);
  const skipPersistRef = useRef(false);
  const skipCloudPushRef = useRef(false);
  const tripsRef = useRef(trips);

  const activeTrip = trips.find((t) => t.id === activeTripId) ?? null;
  tripsRef.current = trips;

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
    if (JSON.stringify(merged) !== JSON.stringify(trips)) {
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

  // Push shared trip changes to companions (debounced).
  useEffect(() => {
    if (skipCloudPushRef.current) {
      skipCloudPushRef.current = false;
      return;
    }
    const shared = trips.filter((t) => t.shared && t.shareCode);
    if (shared.length === 0) return;

    const timer = window.setTimeout(() => {
      void (async () => {
        for (const trip of shared) {
          if (!trip.shareCode) continue;
          try {
            const result = await pushSharedTrip(trip.shareCode, trip, trip.revision ?? 1);
            skipCloudPushRef.current = true;
            setTrips((prev) =>
              prev.map((item) => (item.id === trip.id ? { ...result.trip } : item)),
            );
            setSyncLabel('已同步給同伴');
          } catch (error) {
            setSyncLabel(error instanceof Error ? error.message : '同步失敗');
          }
        }
      })();
    }, 800);

    return () => window.clearTimeout(timer);
  }, [trips]);

  // Poll shared active trip so companion edits appear.
  useEffect(() => {
    if (!activeTrip?.shared || !activeTrip.shareCode) {
      setSyncLabel(null);
      return;
    }

    let cancelled = false;
    const pull = async () => {
      try {
        const remote = await fetchSharedTrip(activeTrip.shareCode!);
        if (cancelled) return;
        const local = tripsRef.current.find((t) => t.id === activeTrip.id);
        if (!local) return;
        if ((remote.revision ?? 0) <= (local.revision ?? 0)) return;
        if (remote.trip.updatedAt <= local.updatedAt && remote.revision <= (local.revision ?? 0)) {
          return;
        }
        skipCloudPushRef.current = true;
        setTrips((prev) => prev.map((item) => (item.id === local.id ? remote.trip : item)));
        setSyncLabel('已套用同伴的更新');
      } catch {
        // Keep quiet while offline; share still available locally.
      }
    };

    void pull();
    const timer = window.setInterval(() => void pull(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeTrip?.id, activeTrip?.shareCode, activeTrip?.shared]);

  useEffect(() => {
    if (!syncLabel) return;
    const timer = window.setTimeout(() => setSyncLabel(null), 2000);
    return () => window.clearTimeout(timer);
  }, [syncLabel]);

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

  async function shareTrip(trip: Trip) {
    try {
      const result = await publishSharedTrip(trip);
      upsertTrip(result.trip);
      setModal({ type: 'share', trip: result.trip });
      showToast('已建立分享碼');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '分享失敗');
    }
  }

  async function joinTrip(shareCode: string) {
    const result = await fetchSharedTrip(shareCode);
    upsertTrip(result.trip);
    setActiveTripId(result.trip.id);
    setDayIndex(0);
    setModal(null);
    showToast('已加入同伴旅程');
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
          <span className="brand-tag">和同伴一起把日子排成風景</span>
        </div>
        <div className="topbar-actions">
          <button type="button" className="ghost-btn" onClick={() => setModal({ type: 'join' })}>
            加入同伴
          </button>
          <button type="button" className="ghost-btn" onClick={() => setModal({ type: 'settings' })}>
            設定
          </button>
          <button type="button" className="primary-btn" onClick={() => setModal({ type: 'trip' })}>
            新增旅程
          </button>
        </div>
      </header>

      {!activeTrip ? (
        <HomeView
          trips={trips}
          onOpen={openTrip}
          onCreate={() => setModal({ type: 'trip' })}
          onJoin={() => setModal({ type: 'join' })}
        />
      ) : (
        <TripView
          trip={activeTrip}
          dayIndex={dayIndex}
          syncLabel={syncLabel}
          onDayChange={setDayIndex}
          onBack={() => setActiveTripId(null)}
          onEditTrip={() => setModal({ type: 'trip', trip: activeTrip })}
          onShareTrip={() => {
            if (activeTrip.shareCode) {
              setModal({ type: 'share', trip: activeTrip });
              return;
            }
            void shareTrip(activeTrip);
          }}
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

      {modal?.type === 'join' && (
        <JoinModal
          onClose={() => setModal(null)}
          onJoin={async (code) => {
            try {
              await joinTrip(code);
            } catch (error) {
              throw error;
            }
          }}
        />
      )}

      {modal?.type === 'share' && (
        <ShareModal trip={modal.trip} onClose={() => setModal(null)} />
      )}

      {modal?.type === 'settings' && (
        <SettingsModal
          onClose={() => setModal(null)}
          onSaved={() => showToast('設定已儲存')}
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
  onJoin,
}: {
  trips: Trip[];
  onOpen: (id: string) => void;
  onCreate: () => void;
  onJoin: () => void;
}) {
  return (
    <>
      <section className="hero" aria-label="漫旅首頁">
        <div className="hero-media" aria-hidden="true" />
        <div className="hero-content">
          <p className="hero-brand">漫旅</p>
          <h1 className="hero-line">把日子排成風景</h1>
          <p className="hero-support">
            依日期規劃每日景點與美食，也能用分享碼和旅遊同伴一起即時改行程。
          </p>
          <div className="hero-actions">
            <button type="button" className="primary-btn" onClick={onCreate}>
              開始規劃
            </button>
            <button type="button" className="ghost-btn" onClick={onJoin}>
              加入同伴旅程
            </button>
          </div>
        </div>
      </section>

      <div className="section-head">
        <div>
          <h2>我的旅程</h2>
          <p>本機會保存；共享旅程會同步給持有分享碼的同伴。</p>
        </div>
      </div>

      {trips.length === 0 ? (
        <div className="empty-state">
          <p>還沒有旅程。建立一趟，或輸入同伴的分享碼加入。</p>
          <div className="hero-actions" style={{ justifyContent: 'center', marginTop: '1rem' }}>
            <button type="button" className="primary-btn" onClick={onCreate}>
              新增旅程
            </button>
            <button type="button" className="ghost-btn" onClick={onJoin}>
              加入同伴
            </button>
          </div>
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
                  {trip.shareCode && <span>共享 {trip.shareCode}</span>}
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
  syncLabel,
  onDayChange,
  onBack,
  onEditTrip,
  onShareTrip,
  onDeleteTrip,
  onAddActivity,
  onEditActivity,
  onRemoveActivity,
}: {
  trip: Trip;
  dayIndex: number;
  syncLabel: string | null;
  onDayChange: (index: number) => void;
  onBack: () => void;
  onEditTrip: () => void;
  onShareTrip: () => void;
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
            {trip.shareCode && (
              <span className="cover-chip" style={{ marginLeft: '0.4rem' }}>
                共享碼 {trip.shareCode}
              </span>
            )}
            <h1 className="trip-title">{trip.title}</h1>
            <p className="trip-sub">
              {trip.destination} ・ {formatDateRange(trip.startDate, trip.endDate)}
            </p>
            {trip.notes && (
              <p className="trip-sub" style={{ marginTop: '0.55rem' }}>
                {trip.notes}
              </p>
            )}
            {syncLabel && <p className="sync-label">{syncLabel}</p>}
          </div>
          <div className="trip-actions">
            <button type="button" className="ghost-btn" onClick={onBack}>
              返回列表
            </button>
            <button type="button" className="primary-btn" onClick={onShareTrip}>
              {trip.shareCode ? '分享碼' : '分享給同伴'}
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
          <p>
            {day?.activities.length
              ? `共 ${day.activities.length} 個活動`
              : '這天還沒有安排，來加第一個吧。'}
          </p>
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
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="編輯"
                  onClick={() => onEditActivity(activity)}
                >
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
              <input
                id="trip-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="form-row">
              <label htmlFor="trip-end">結束日期</label>
              <input
                id="trip-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
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

function JoinModal({
  onClose,
  onJoin,
}: {
  onClose: () => void;
  onJoin: (code: string) => Promise<void>;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) {
      setError('請輸入分享碼');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onJoin(code);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加入失敗');
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h3>加入同伴旅程</h3>
        <form className="form-grid" onSubmit={(e) => void submit(e)}>
          <div className="form-row">
            <label htmlFor="join-code">分享碼</label>
            <input
              id="join-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="例如：AB12CD34"
              autoFocus
            />
          </div>
          <p className="form-hint">向同伴索取 6 碼分享碼後即可一起編輯同一份行程。</p>
          {error && <p style={{ color: 'var(--danger)', margin: 0 }}>{error}</p>}
          <div className="modal-actions">
            <button type="button" className="ghost-btn" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="primary-btn" disabled={busy}>
              {busy ? '加入中…' : '加入'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ShareModal({ trip, onClose }: { trip: Trip; onClose: () => void }) {
  const code = trip.shareCode ?? '';

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // ignore
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h3>分享給旅遊同伴</h3>
        <p className="form-hint">把分享碼傳給同伴，對方點「加入同伴」輸入後就能一起改行程。</p>
        <div className="share-code-box">{code}</div>
        <div className="modal-actions">
          <button type="button" className="ghost-btn" onClick={onClose}>
            關閉
          </button>
          <button type="button" className="primary-btn" onClick={() => void copy()}>
            複製分享碼
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingsModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [apiBase, setApiBase] = useState(() => getStoredApiBase());

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setStoredApiBase(apiBase);
    onSaved();
    onClose();
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h3>共同編輯設定</h3>
        <form className="form-grid" onSubmit={submit}>
          <div className="form-row">
            <label htmlFor="api-base">同步伺服器網址（選填）</label>
            <input
              id="api-base"
              value={apiBase}
              onChange={(e) => setApiBase(e.target.value)}
              placeholder="網頁版通常留空；APK 可填發布後的網址"
            />
          </div>
          <p className="form-hint">
            網頁版會自動使用目前網站。手機 APK 若要和同伴雲端同步，請填入已發布的漫旅網址。
          </p>
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
