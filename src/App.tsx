'use client';

import { useEffect, useRef, useState } from 'react';
import type { Activity, CoverTone, Trip, TripPanel } from './types';
import { CATEGORY_LABELS, COVER_LABELS } from './types';
import { TripExtras } from './components/TripExtras';
import { formatMoney } from './lib/budget';
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
  ShareApiError,
  deleteSharedTrip,
  fetchSharedTrip,
  getStoredApiBase,
  isAllowedApiBase,
  publishSharedTrip,
  pushSharedTrip,
  rotateSharedTrip,
  setStoredApiBase,
} from './lib/shareApi';
import {
  hasEmbeddedDataImages,
  stripEmbeddedDataImages,
} from './lib/tripValidate';
import { compressImageFile, isSafeImageSrc } from './lib/images';
import { mapsEmbedUrl, mapsNavigateUrl, mapsSearchUrl } from './lib/maps';

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
  const [panel, setPanel] = useState<TripPanel>('plan');
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [syncLabel, setSyncLabel] = useState<string | null>(null);
  const [syncSticky, setSyncSticky] = useState(false);
  const baselineRef = useRef<Trip[] | null>(trips);
  const skipPersistRef = useRef(false);
  const skipCloudPushRef = useRef(false);
  const tripsRef = useRef(trips);
  const lastPushedAtRef = useRef<Record<string, string>>({});
  const pushingRef = useRef(false);

  const activeTrip = trips.find((t) => t.id === activeTripId) ?? null;
  tripsRef.current = trips;
  const seededPushRef = useRef(false);
  if (!seededPushRef.current) {
    seededPushRef.current = true;
    for (const trip of trips) {
      if (trip.shared && trip.shareCode) {
        lastPushedAtRef.current[trip.id] = trip.updatedAt;
      }
    }
  }

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

  // Push only dirty shared trips (debounced).
  useEffect(() => {
    if (skipCloudPushRef.current) {
      skipCloudPushRef.current = false;
      return;
    }
    const shared = trips.filter((t) => t.shared && t.shareCode);
    const dirty = shared.filter(
      (t) => lastPushedAtRef.current[t.id] !== t.updatedAt,
    );
    if (dirty.length === 0) return;

    const timer = window.setTimeout(() => {
      if (pushingRef.current) return;
      pushingRef.current = true;
      void (async () => {
        try {
          for (const trip of dirty) {
            if (!trip.shareCode) continue;
            const latest = tripsRef.current.find((t) => t.id === trip.id) ?? trip;
            if (lastPushedAtRef.current[latest.id] === latest.updatedAt) continue;
            try {
              setSyncSticky(false);
              setSyncLabel('同步中…');
              const stripped = hasEmbeddedDataImages(latest);
              const payload = stripped ? stripEmbeddedDataImages(latest) : latest;
              const result = await pushSharedTrip(
                latest.shareCode!,
                payload,
                latest.revision ?? 1,
                latest.editToken,
              );
              // Ignore stale responses if local moved ahead while awaiting.
              const still = tripsRef.current.find((t) => t.id === latest.id);
              if (still && still.updatedAt !== latest.updatedAt) {
                continue;
              }
              const merged: Trip = {
                ...result.trip,
                editToken: latest.editToken || result.editToken,
                // Keep local album embeds; cloud payload may have stripped them.
                coverImage: latest.coverImage,
                days: latest.days,
                revision: result.revision,
                updatedAt: result.trip.updatedAt,
              };
              skipCloudPushRef.current = true;
              lastPushedAtRef.current[latest.id] = merged.updatedAt;
              setTrips((prev) =>
                prev.map((item) => (item.id === latest.id ? merged : item)),
              );
              setSyncSticky(false);
              setSyncLabel(
                stripped ? '已同步（內嵌圖片僅保存在本機）' : '已同步給同伴',
              );
            } catch (error) {
              if (error instanceof ShareApiError && error.status === 409) {
                try {
                  const remote = await fetchSharedTrip(latest.shareCode!);
                  skipCloudPushRef.current = true;
                  lastPushedAtRef.current[latest.id] = remote.trip.updatedAt;
                  setTrips((prev) =>
                    prev.map((item) =>
                      item.id === latest.id
                        ? { ...remote.trip, editToken: latest.editToken }
                        : item,
                    ),
                  );
                  setSyncSticky(true);
                  setSyncLabel('有衝突，已載入最新版本，請再編輯一次');
                } catch {
                  setSyncSticky(true);
                  setSyncLabel(error.message);
                }
              } else {
                setSyncSticky(true);
                setSyncLabel(error instanceof Error ? error.message : '同步失敗');
              }
            }
          }
        } finally {
          pushingRef.current = false;
        }
      })();
    }, 800);

    return () => window.clearTimeout(timer);
  }, [trips]);

  // Poll shared active trip so companion edits appear.
  useEffect(() => {
    if (!activeTrip?.shared || !activeTrip.shareCode) {
      if (!syncSticky) setSyncLabel(null);
      return;
    }

    let cancelled = false;
    const pull = async () => {
      if (pushingRef.current) return;
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
        lastPushedAtRef.current[local.id] = remote.trip.updatedAt;
        setTrips((prev) =>
          prev.map((item) =>
            item.id === local.id
              ? { ...remote.trip, editToken: local.editToken }
              : item,
          ),
        );
        setSyncSticky(false);
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
  }, [activeTrip?.id, activeTrip?.shareCode, activeTrip?.shared, syncSticky]);

  useEffect(() => {
    if (!syncLabel || syncSticky) return;
    const timer = window.setTimeout(() => setSyncLabel(null), 2800);
    return () => window.clearTimeout(timer);
  }, [syncLabel, syncSticky]);

  useEffect(() => {
    if (!modal) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setModal(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal]);

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

  async function deleteTrip(id: string) {
    const target = tripsRef.current.find((t) => t.id === id);
    if (
      target?.shared &&
      target.shareCode &&
      target.editToken &&
      window.confirm('同時從雲端停止共享此旅程？')
    ) {
      try {
        await deleteSharedTrip(target.shareCode, target.editToken);
      } catch (error) {
        showToast(error instanceof Error ? error.message : '雲端刪除失敗，本地仍會移除');
      }
    }
    setTrips((prev) => prev.filter((t) => t.id !== id));
    if (activeTripId === id) setActiveTripId(null);
    showToast('已刪除旅程');
  }

  function openTrip(id: string) {
    setActiveTripId(id);
    setDayIndex(0);
    setPanel('plan');
  }

  function patchActiveTrip(patch: Partial<Trip>) {
    if (!activeTrip) return;
    upsertTrip({
      ...activeTrip,
      ...patch,
      updatedAt: new Date().toISOString(),
    });
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
      const stripped = hasEmbeddedDataImages(trip);
      if (
        stripped &&
        !window.confirm(
          '相簿內嵌圖片無法上傳到雲端共享，將改以本機保留、雲端不含這些圖片。繼續分享？',
        )
      ) {
        return;
      }
      const payload = stripped ? stripEmbeddedDataImages(trip) : trip;
      const result = await publishSharedTrip(payload);
      const localKeep: Trip = {
        ...result.trip,
        coverImage: trip.coverImage,
        days: trip.days,
      };
      lastPushedAtRef.current[localKeep.id] = localKeep.updatedAt;
      upsertTrip(localKeep);
      setModal({ type: 'share', trip: localKeep });
      showToast(stripped ? '已建立分享碼（圖片留在本機）' : '已建立分享碼');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '分享失敗');
    }
  }

  async function joinTrip(shareCode: string) {
    const result = await fetchSharedTrip(shareCode, { join: true });
    // Join never receives the owner edit token — companions can sync edits
    // via the share code, but cannot delete or rotate the cloud share.
    const { editToken: _ignored, ...safeTrip } = result.trip;
    upsertTrip(safeTrip);
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
          panel={panel}
          syncLabel={syncLabel}
          onDayChange={setDayIndex}
          onPanelChange={setPanel}
          onPatchTrip={patchActiveTrip}
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
            if (window.confirm(`確定刪除「${activeTrip.title}」？`)) {
              void deleteTrip(activeTrip.id);
            }
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
        <ShareModal
          trip={modal.trip}
          onClose={() => setModal(null)}
          onRotated={(next) => {
            upsertTrip(next);
            setModal({ type: 'share', trip: next });
            showToast('已輪替分享碼與編輯權杖');
          }}
          onUnshared={(tripId) => {
            const local = tripsRef.current.find((t) => t.id === tripId);
            if (local) {
              upsertTrip({
                ...local,
                shared: false,
                shareCode: undefined,
                editToken: undefined,
                updatedAt: new Date().toISOString(),
              });
            }
            setModal(null);
            showToast('已停止雲端共享');
          }}
        />
      )}

      {modal?.type === 'settings' && (
        <SettingsModal
          onClose={() => setModal(null)}
          onSaved={() => showToast('設定已儲存')}
        />
      )}

      {toast && (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
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
  panel,
  syncLabel,
  onDayChange,
  onPanelChange,
  onPatchTrip,
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
  panel: TripPanel;
  syncLabel: string | null;
  onDayChange: (index: number) => void;
  onPanelChange: (panel: TripPanel) => void;
  onPatchTrip: (patch: Partial<Trip>) => void;
  onBack: () => void;
  onEditTrip: () => void;
  onShareTrip: () => void;
  onDeleteTrip: () => void;
  onAddActivity: () => void;
  onEditActivity: (activity: Activity) => void;
  onRemoveActivity: (id: string) => void;
}) {
  const day = trip.days[dayIndex];
  const currency = trip.currency || 'TWD';

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
            {isSafeImageSrc(trip.coverImage) && (
              <img className="activity-photo" src={trip.coverImage} alt={trip.title} />
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
            {syncLabel && (
              <p className="sync-label" role="status" aria-live="polite">
                {syncLabel}
              </p>
            )}
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

      <TripExtras
        trip={trip}
        dayIndex={dayIndex}
        panel={panel}
        onPanelChange={onPanelChange}
        onPatch={onPatchTrip}
      />

      {panel === 'plan' && (
        <>
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
                    {typeof activity.cost === 'number' && activity.cost > 0 && (
                      <span className="category" style={{ marginLeft: '0.35rem' }}>
                        {formatMoney(activity.cost, currency)}
                      </span>
                    )}
                    {activity.notes && <p className="notes">{activity.notes}</p>}
                    {isSafeImageSrc(activity.imageUrl) && (
                      <img className="activity-photo" src={activity.imageUrl} alt={activity.title} />
                    )}
                    {activity.place && (
                      <>
                        <div className="activity-tools">
                          <a
                            href={mapsNavigateUrl(activity.place)}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            導航前往
                          </a>
                          <a
                            href={mapsSearchUrl(activity.place)}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            在地圖查看
                          </a>
                          <button
                            type="button"
                            onClick={() => {
                              const existing = trip.pins || [];
                              if (
                                existing.some(
                                  (pin) =>
                                    pin.name.trim().toLowerCase() ===
                                    activity.place.trim().toLowerCase(),
                                )
                              ) {
                                return;
                              }
                              onPatchTrip({
                                pins: [
                                  ...existing,
                                  {
                                    id: uid('pin'),
                                    name: activity.place,
                                    note: activity.title,
                                  },
                                ],
                              });
                            }}
                          >
                            收藏地點
                          </button>
                        </div>
                        <iframe
                          className="activity-map"
                          title={`${activity.title} 地圖`}
                          loading="lazy"
                          referrerPolicy="no-referrer-when-downgrade"
                          src={mapsEmbedUrl(activity.place)}
                        />
                      </>
                    )}
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
        </>
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
  const [imageUrl, setImageUrl] = useState(activity?.imageUrl ?? '');
  const [cost, setCost] = useState(activity?.cost?.toString() ?? '');
  const [error, setError] = useState('');
  const [busyImage, setBusyImage] = useState(false);

  async function onPickImage(file: File | null) {
    if (!file) return;
    setBusyImage(true);
    setError('');
    try {
      const dataUrl = await compressImageFile(file);
      setImageUrl(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : '圖片處理失敗');
    } finally {
      setBusyImage(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('請填寫活動名稱');
      return;
    }
    if (imageUrl && !isSafeImageSrc(imageUrl)) {
      setError('圖片網址需為 https 或已上傳的圖片');
      return;
    }
    const parsedCost = cost.trim() === '' ? undefined : Number(cost);
    if (parsedCost !== undefined && (!Number.isFinite(parsedCost) || parsedCost < 0)) {
      setError('金額需為 0 以上的數字');
      return;
    }
    onSave({
      title: title.trim(),
      place: place.trim(),
      time,
      category,
      notes: notes.trim(),
      imageUrl: imageUrl.trim() || undefined,
      cost: parsedCost,
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
            <label htmlFor="act-place">地點（可開啟地圖導航）</label>
            <input
              id="act-place"
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              placeholder="店名、車站或景點"
            />
          </div>
          <div className="form-row">
            <label htmlFor="act-cost">花費金額（選填）</label>
            <input
              id="act-cost"
              type="number"
              min="0"
              step="1"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="例如：350"
            />
          </div>
          <div className="form-row">
            <label>活動圖片</label>
            <label className="file-btn">
              {busyImage ? '壓縮中…' : '從相簿上傳'}
              <input
                type="file"
                accept="image/*"
                disabled={busyImage}
                onChange={(e) => void onPickImage(e.target.files?.[0] ?? null)}
              />
            </label>
            <input
              value={imageUrl.startsWith('data:') ? '' : imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="或貼上 https 圖片網址"
              style={{ marginTop: '0.5rem' }}
            />
            {isSafeImageSrc(imageUrl) && (
              <img className="image-preview" src={imageUrl} alt="預覽" />
            )}
            {imageUrl && (
              <button type="button" className="ghost-btn" onClick={() => setImageUrl('')}>
                移除圖片
              </button>
            )}
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
            <button type="submit" className="primary-btn" disabled={busyImage}>
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
              placeholder="貼上同伴分享的長碼"
              autoFocus
            />
          </div>
          <p className="form-hint">向同伴索取分享碼（較長的一組）後即可一起編輯同一份行程。</p>
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

function ShareModal({
  trip,
  onClose,
  onRotated,
  onUnshared,
}: {
  trip: Trip;
  onClose: () => void;
  onRotated: (trip: Trip) => void;
  onUnshared: (tripId: string) => void;
}) {
  const code = trip.shareCode ?? '';
  const [busy, setBusy] = useState<'rotate' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError('無法複製，請手動選取分享碼');
    }
  }

  async function rotate() {
    if (!trip.shareCode || !trip.editToken) {
      setError('此裝置沒有編輯權杖，無法輪替');
      return;
    }
    if (!window.confirm('輪替後舊分享碼會失效，同伴需重新輸入新碼。確定？')) return;
    setBusy('rotate');
    setError(null);
    try {
      const result = await rotateSharedTrip(trip.shareCode, trip.editToken);
      onRotated({
        ...result.trip,
        editToken: result.editToken || result.trip.editToken,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '輪替失敗');
    } finally {
      setBusy(null);
    }
  }

  async function stopShare() {
    if (!trip.shareCode || !trip.editToken) {
      setError('此裝置沒有編輯權杖，無法停止共享');
      return;
    }
    if (!window.confirm('確定從雲端刪除此共享旅程？本地行程仍會保留。')) return;
    setBusy('delete');
    setError(null);
    try {
      await deleteSharedTrip(trip.shareCode, trip.editToken);
      onUnshared(trip.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : '刪除失敗');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h3>分享給旅遊同伴</h3>
        <p className="form-hint">把分享碼傳給同伴，對方點「加入同伴」後就能一起改行程與同步。</p>
        <div className="share-code-box">{code}</div>
        {trip.editToken ? (
          <p className="form-hint">
            此裝置是建立者：可輪替分享碼或停止雲端共享。請勿把建立者權杖傳給他人。
          </p>
        ) : (
          <p className="form-hint">同伴可同步改行程；輪替與停止共享僅建立者可操作。</p>
        )}
        {error && <p style={{ color: 'var(--danger)', margin: 0 }}>{error}</p>}
        <div className="modal-actions">
          <button type="button" className="ghost-btn" onClick={onClose} disabled={busy !== null}>
            關閉
          </button>
          <button
            type="button"
            className="ghost-btn"
            onClick={() => void rotate()}
            disabled={busy !== null || !trip.editToken}
          >
            {busy === 'rotate' ? '輪替中…' : '輪替分享碼'}
          </button>
          <button
            type="button"
            className="danger-btn"
            onClick={() => void stopShare()}
            disabled={busy !== null || !trip.editToken}
          >
            {busy === 'delete' ? '刪除中…' : '停止共享'}
          </button>
          <button type="button" className="primary-btn" onClick={() => void copy()} disabled={!code}>
            {copied ? '已複製' : '複製分享碼'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingsModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [apiBase, setApiBase] = useState(() => getStoredApiBase());
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = apiBase.trim();
    if (cleaned && !isAllowedApiBase(cleaned)) {
      setError('僅允許 https 的 Cursor Apps 網域（例如 *.apps.grok.bot）');
      return;
    }
    try {
      setStoredApiBase(cleaned);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存失敗');
    }
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
              onChange={(e) => {
                setApiBase(e.target.value);
                setError(null);
              }}
              placeholder="網頁版通常留空；APK 可填發布後的網址"
            />
          </div>
          <p className="form-hint">
            網頁版會自動使用目前網站。手機 APK 若要和同伴雲端同步，請填入已發布的漫旅網址（僅
            https Cursor Apps 網域）。
          </p>
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
