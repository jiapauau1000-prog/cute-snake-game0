'use client';

import { useEffect, useState } from 'react';
import type {
  MemberRole,
  PackingItem,
  PinnedPlace,
  Trip,
  TripComment,
  TripMember,
  TripPanel,
} from '../types';
import { ROLE_LABELS } from '../types';
import { dayBudget, formatMoney, tripBudget } from '../lib/budget';
import { downloadIcs, printTrip } from '../lib/exportTrip';
import { mapsNavigateUrl, mapsSearchUrl } from '../lib/maps';
import { uid } from '../lib/storage';
import { formatDayHeading } from '../lib/trips';

type WeatherDay = {
  date: string;
  label: string;
  high: number;
  low: number;
  rainChance: number;
};

type WeatherPayload = {
  place: string;
  source: string;
  days: WeatherDay[];
  note?: string;
};

export function TripExtras({
  trip,
  dayIndex,
  panel,
  onPanelChange,
  onPatch,
}: {
  trip: Trip;
  dayIndex: number;
  panel: TripPanel;
  onPanelChange: (panel: TripPanel) => void;
  onPatch: (patch: Partial<Trip>) => void;
}) {
  const currency = trip.currency || 'TWD';
  const packing = trip.packing || [];
  const pins = trip.pins || [];
  const members = trip.members || [];
  const comments = trip.comments || [];

  return (
    <div className="extras">
      <WeatherStrip trip={trip} />

      <div className="export-bar">
        <button type="button" className="ghost-btn" onClick={() => printTrip(trip)}>
          匯出／列印 PDF
        </button>
        <button type="button" className="ghost-btn" onClick={() => downloadIcs(trip)}>
          匯出到日曆
        </button>
      </div>

      <div className="panel-tabs" role="tablist" aria-label="旅程工具">
        {(
          [
            ['plan', '行程'],
            ['budget', '預算'],
            ['packing', '行李'],
            ['pins', '地點'],
            ['team', '同伴'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            className={`day-tab${panel === id ? ' active' : ''}`}
            aria-selected={panel === id}
            onClick={() => onPanelChange(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {panel === 'budget' && (
        <BudgetPanel trip={trip} dayIndex={dayIndex} currency={currency} />
      )}
      {panel === 'packing' && (
        <PackingPanel
          packing={packing}
          onChange={(next) => onPatch({ packing: next })}
        />
      )}
      {panel === 'pins' && (
        <PinsPanel pins={pins} onChange={(next) => onPatch({ pins: next })} />
      )}
      {panel === 'team' && (
        <TeamPanel
          members={members}
          comments={comments}
          onMembers={(next) => onPatch({ members: next })}
          onComments={(next) => onPatch({ comments: next })}
        />
      )}
    </div>
  );
}

function WeatherStrip({ trip }: { trip: Trip }) {
  const [data, setData] = useState<WeatherPayload | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch(
          `/api/weather?destination=${encodeURIComponent(trip.destination)}&start=${trip.startDate}&end=${trip.endDate}`,
        );
        const json = (await res.json()) as WeatherPayload & { error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error || '無法取得天氣');
          return;
        }
        setData(json);
      } catch {
        if (!cancelled) setError('天氣服務連線失敗');
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [trip.destination, trip.startDate, trip.endDate]);

  return (
    <div className="weather-strip">
      <div className="section-head" style={{ marginBottom: '0.55rem' }}>
        <div>
          <h2>天氣提醒</h2>
          <p>{data?.place || trip.destination}{data?.source === 'sample' ? '（示意資料）' : ''}</p>
        </div>
      </div>
      {error && <p className="form-hint">{error}</p>}
      <div className="weather-grid">
        {(data?.days || []).slice(0, 7).map((day) => (
          <div key={day.date} className="weather-card">
            <strong>{day.date.slice(5)}</strong>
            <span>{day.label}</span>
            <span>
              {day.low}–{day.high}°C
            </span>
            <span>降雨 {day.rainChance}%</span>
          </div>
        ))}
        {!data?.days?.length && !error && <p className="form-hint">載入天氣中…</p>}
      </div>
    </div>
  );
}

function BudgetPanel({
  trip,
  dayIndex,
  currency,
}: {
  trip: Trip;
  dayIndex: number;
  currency: string;
}) {
  return (
    <div className="extra-card">
      <h3>預算總覽</h3>
      <p className="form-hint">在活動裡填金額後，這裡會自動加總。</p>
      <div className="budget-stats">
        <div>
          <span>整趟合計</span>
          <strong>{formatMoney(tripBudget(trip), currency)}</strong>
        </div>
        <div>
          <span>今日小計</span>
          <strong>{formatMoney(dayBudget(trip, dayIndex), currency)}</strong>
        </div>
      </div>
      <ul className="budget-list">
        {trip.days.map((day, index) => (
          <li key={day.date}>
            <span>{formatDayHeading(day.date, index)}</span>
            <strong>{formatMoney(dayBudget(trip, index), currency)}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PackingPanel({
  packing,
  onChange,
}: {
  packing: PackingItem[];
  onChange: (items: PackingItem[]) => void;
}) {
  const [label, setLabel] = useState('');

  return (
    <div className="extra-card">
      <h3>行李清單</h3>
      <div className="inline-form">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="例如：雨衣、轉換插頭"
        />
        <button
          type="button"
          className="primary-btn"
          onClick={() => {
            if (!label.trim()) return;
            onChange([...packing, { id: uid('pack'), label: label.trim(), done: false }]);
            setLabel('');
          }}
        >
          加入
        </button>
      </div>
      <ul className="check-list">
        {packing.map((item) => (
          <li key={item.id}>
            <label>
              <input
                type="checkbox"
                checked={item.done}
                onChange={(e) =>
                  onChange(
                    packing.map((p) => (p.id === item.id ? { ...p, done: e.target.checked } : p)),
                  )
                }
              />
              <span className={item.done ? 'done' : ''}>{item.label}</span>
            </label>
            <button
              type="button"
              className="icon-btn"
              aria-label="刪除行李項目"
              onClick={() => onChange(packing.filter((p) => p.id !== item.id))}
            >
              ⌫
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PinsPanel({
  pins,
  onChange,
}: {
  pins: PinnedPlace[];
  onChange: (items: PinnedPlace[]) => void;
}) {
  const [name, setName] = useState('');
  const [note, setNote] = useState('');

  return (
    <div className="extra-card">
      <h3>地點收藏</h3>
      <p className="form-hint">把想去的店與景點釘起來，之後可一鍵導航。</p>
      <div className="inline-form">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="地點名稱" />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="備註（選填）" />
        <button
          type="button"
          className="primary-btn"
          onClick={() => {
            if (!name.trim()) return;
            onChange([...pins, { id: uid('pin'), name: name.trim(), note: note.trim() }]);
            setName('');
            setNote('');
          }}
        >
          收藏
        </button>
      </div>
      <div className="pin-list">
        {pins.map((pin) => (
          <article key={pin.id} className="pin-card">
            <div>
              <strong>{pin.name}</strong>
              {pin.note && <p className="form-hint">{pin.note}</p>}
              <div className="activity-tools">
                <a href={mapsNavigateUrl(pin.name)} target="_blank" rel="noopener noreferrer">
                  導航
                </a>
                <a href={mapsSearchUrl(pin.name)} target="_blank" rel="noopener noreferrer">
                  地圖
                </a>
              </div>
            </div>
            <button
              type="button"
              className="icon-btn"
              aria-label="移除收藏"
              onClick={() => onChange(pins.filter((p) => p.id !== pin.id))}
            >
              ⌫
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}

function TeamPanel({
  members,
  comments,
  onMembers,
  onComments,
}: {
  members: TripMember[];
  comments: TripComment[];
  onMembers: (items: TripMember[]) => void;
  onComments: (items: TripComment[]) => void;
}) {
  const [name, setName] = useState('');
  const [role, setRole] = useState<MemberRole>('planner');
  const [author, setAuthor] = useState('');
  const [text, setText] = useState('');

  return (
    <div className="extra-card">
      <h3>同伴分工</h3>
      <div className="inline-form">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="同伴暱稱" />
        <select value={role} onChange={(e) => setRole(e.target.value as MemberRole)}>
          {(Object.keys(ROLE_LABELS) as MemberRole[]).map((key) => (
            <option key={key} value={key}>
              {ROLE_LABELS[key]}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="primary-btn"
          onClick={() => {
            if (!name.trim()) return;
            onMembers([...members, { id: uid('mem'), name: name.trim(), role }]);
            setName('');
          }}
        >
          加入同伴
        </button>
      </div>
      <ul className="check-list">
        {members.map((m) => (
          <li key={m.id}>
            <span>
              {m.name} · {ROLE_LABELS[m.role]}
            </span>
            <button
              type="button"
              className="icon-btn"
              aria-label="移除同伴"
              onClick={() => onMembers(members.filter((x) => x.id !== m.id))}
            >
              ⌫
            </button>
          </li>
        ))}
      </ul>

      <h3 style={{ marginTop: '1.2rem' }}>留言討論</h3>
      <div className="inline-form">
        <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="你的名字" />
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="留言給同伴…" />
        <button
          type="button"
          className="primary-btn"
          onClick={() => {
            if (!author.trim() || !text.trim()) return;
            onComments([
              {
                id: uid('cmt'),
                author: author.trim(),
                text: text.trim(),
                createdAt: new Date().toISOString(),
              },
              ...comments,
            ]);
            setText('');
          }}
        >
          送出
        </button>
      </div>
      <ul className="comment-list">
        {comments.map((c) => (
          <li key={c.id}>
            <strong>{c.author}</strong>
            <span>{new Date(c.createdAt).toLocaleString('zh-TW')}</span>
            <p>{c.text}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
